/**
 * R2 (v20x-TL TL-1): the run checkpoint flushed by the live scene flow, headless. A campaign
 * session on the tiny `t-s` stage (two checkpoints, an `end` at x 200) over a memory storage:
 * the World's birth writes the record, a passed checkpoint rewrites it with the new position and
 * the live tail, a suspend flushes the current tick, and the title (a quit from the pause menu)
 * clears the key. The record must read back through the store's own classifier, with the config,
 * the run map and the carry in place.
 */
import { describe, expect, it } from 'vitest';
import type { ContentDb } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import {
  RUN_CHECKPOINT_STORAGE_KEY,
  RunCheckpointStore,
  classifyCheckpointText,
  type RunCheckpointRecord,
} from '../../src/replay/checkpoint.js';
import { createSaveStore, type SaveStore } from '../../src/save/index.js';
import { PauseItem, type SceneFlow } from '../../src/scenes/index.js';
import { campaignContent as content } from '../helpers/campaign.js';

/** A headless campaign session with the checkpoint store wired (the shell's boot pattern). */
class Session {
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly save: SaveStore = createSaveStore(null);
  readonly checkpoint: RunCheckpointStore;

  /**
   * Starts a game on the campaign's start zone with the store over the platform's storage.
   *
   * @param db - The content.
   */
  constructor(db: ContentDb = content()) {
    this.checkpoint = new RunCheckpointStore(this.platform.storage, 'test');
    this.game = createGame(this.platform, { seed: 11, stage: 't-s' }, db, {
      scenes: 'game',
      save: this.save,
      checkpoint: this.checkpoint,
      buildId: 'test',
    });
    this.flow = this.game.scenes as SceneFlow;
    this.game.debug.godMode = true;
  }

  /**
   * Runs ticks with a held mask.
   *
   * @param held - Actions held.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.events.drain(() => undefined);
    }
  }

  /**
   * One press (a tick down, a tick up).
   *
   * @param action - The action.
   */
  press(action: ActionMask): void {
    this.hold(action);
    this.hold(0);
  }

  /**
   * The stored checkpoint text (the memory storage settles in microtasks).
   *
   * @returns The text (`null`/`''`: nothing written).
   */
  async text(): Promise<string | null> {
    // The store chains its writes; drain enough microtasks for the chain to settle.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    return this.platform.storage.get(RUN_CHECKPOINT_STORAGE_KEY);
  }

  /**
   * The live record, classified.
   *
   * @returns The record (throws when the key is not a valid record).
   */
  async record(): Promise<RunCheckpointRecord> {
    const { verdict, record } = classifyCheckpointText(await this.text(), 'test');
    expect(verdict).toBe('ok');
    if (record === null) throw new Error('unreachable');
    return record;
  }
}

describe('run checkpoint flushes (R2 TL-1)', () => {
  it('writes the record at the World birth, with the tail anchored on tick 0', async () => {
    const s = new Session();
    s.hold(0, 2);
    const record = await s.record();
    // The birth write lands at tick 0; the x-0 checkpoint passes on the World's first step.
    expect([0, 1]).toContain(record.savedTick);
    expect([-1, 0]).toContain(record.checkpointPassed);
    expect(record.pendingStart).toBe(false);
    expect(record.buildId).toBe('test');
    expect(record.config.seed).toBe(11);
    expect(record.run.stage).toBe('t-s');
    expect(record.run.campaignId).toBe('test');
    expect(record.run.mode).toBe('normal');
    expect(record.tail).not.toBeNull();
    if (record.tail === null) throw new Error('unreachable');
    // The tail replays the World from its birth: zero checkpoint jump, live inputs, hashes.
    expect(record.tail.replay.header.checkpoint).toBe(-1);
    expect(record.tail.replay.ticks).toBe(record.savedTick);
  });

  it('rewrites at each passed checkpoint with the new position', async () => {
    const s = new Session();
    // The stage scrolls 2 px/tick; checkpoint 1 sits at x 100 (passed a little after tick 50).
    s.hold(0, 90);
    const record = await s.record();
    expect(record.checkpointPassed).toBe(1);
    // The write froze at the pass edge, not at read time.
    expect(record.savedTick).toBeLessThan(s.flow.world.tick);
    expect(record.savedTick).toBeGreaterThan(40);
    if (record.tail === null) throw new Error('unreachable');
    expect(record.tail.replay.ticks).toBe(record.savedTick);
    // The passed-checkpoint index the live World holds equals the record's.
    const world = s.flow.world;
    if (world.stage === null) throw new Error('unreachable');
    expect(world.stage.checkpoint).toBe(1);
  });

  it('flushes the frozen tick on a suspend (the TV kill path)', async () => {
    const s = new Session();
    s.hold(0, 30);
    const before = await s.record();
    s.hold(Action.Shot, 25);
    const frozen = s.flow.world.tick;
    s.platform.suspend();
    const record = await s.record();
    expect(record.savedTick).toBe(frozen);
    expect(record.savedTick).toBeGreaterThan(before.savedTick);
    // A resume pauses the game (the standing rule); the record survives both.
    s.platform.resume();
    expect((await s.record()).savedTick).toBe(record.savedTick);
  });

  it('clears the key when the run ends back at the title', async () => {
    const s = new Session();
    s.hold(0, 40);
    expect(s.flow.checkpointAvailable).toBe(true);
    // Pause → QUIT → YES: the title (the flow's own run-end path, scenes-flow's pattern).
    s.press(Action.Pause);
    s.hold(0, 2);
    expect(s.flow.stack.top?.id).toBe('pause');
    s.press(Action.Up); // RESUME → QUIT (the menu wraps)
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Quit);
    s.press(Action.Confirm);
    expect(s.flow.stack.top?.id).toBe('confirm');
    s.press(Action.Left); // YES
    s.press(Action.Confirm);
    expect(s.flow.stack.top?.id).toBe('title');
    expect(await s.text()).toBe('');
    expect(s.flow.checkpointAvailable).toBe(false);
  });

  it('writes nothing without a store', async () => {
    const platform = createHeadlessPlatform();
    const save = createSaveStore(null);
    const game = createGame(platform, { seed: 11, stage: 't-s' }, content(), {
      scenes: 'game',
      save,
    });
    game.debug.godMode = true;
    for (let t = 0; t < 30; t++) {
      commitPlayerInput(platform.snapshot.players[0], 0);
      game.step();
      game.events.drain(() => undefined);
    }
    await expect(platform.storage.get(RUN_CHECKPOINT_STORAGE_KEY)).resolves.toSatisfy(
      (t: string | null) => t === null || t === '',
    );
    expect((game.scenes as SceneFlow).checkpointAvailable).toBe(false);
  });
});

/**
 * Second boot (R2 — TL-2): the shell's own order over the SAME storage the first boot wrote —
 * load the store, then create the game, which starts on the title. The platform stands in for
 * the killed-and-restarted app (the kill is a suspend; storage persists).
 *
 * @param platform - The first boot's platform (its storage holds the record).
 * @param db - The content (default: the same campaign).
 * @returns The game, its flow and the loaded store.
 */
async function resume(
  platform: HeadlessPlatform,
  db: ContentDb = content(),
): Promise<{ game: Game; flow: SceneFlow; store: RunCheckpointStore }> {
  const store = new RunCheckpointStore(platform.storage, 'test');
  await store.load();
  const game = createGame(platform, { seed: 11, stage: 't-s' }, db, {
    scenes: 'title',
    save: createSaveStore(null),
    checkpoint: store,
    buildId: 'test',
  });
  return { game, flow: game.scenes as SceneFlow, store };
}

/**
 * One step of the second boot's game.
 *
 * @param game - The game.
 * @param platform - Its platform.
 * @param held - The held mask.
 */
function step2(game: Game, platform: HeadlessPlatform, held: ActionMask): void {
  commitPlayerInput(platform.snapshot.players[0], held);
  game.step();
  game.events.drain(() => undefined);
}

/**
 * One press of the second boot's game (a tick down, a tick up).
 *
 * @param game - The game.
 * @param platform - Its platform.
 * @param action - The action.
 */
function press2(game: Game, platform: HeadlessPlatform, action: ActionMask): void {
  step2(game, platform, action);
  step2(game, platform, 0);
}

/**
 * Reads the checkpoint key after letting the store's write chain settle.
 *
 * @param platform - The boot's platform.
 * @returns The stored text (`''`: cleared).
 */
async function readStorage(platform: HeadlessPlatform): Promise<string | null> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  return platform.storage.get(RUN_CHECKPOINT_STORAGE_KEY);
}

describe('title CONTINUE? and the checkpoint resume (R2 TL-2)', () => {
  it('offers the row for a carried record and starts the checkpoint game with the continue rule', async () => {
    const s1 = new Session();
    s1.hold(0, 90); // past checkpoint 1
    s1.platform.suspend(); // the TV kill
    const record = await s1.record();
    expect(record.checkpointPassed).toBe(1);

    const { game, flow } = await resume(s1.platform);
    expect(flow.checkpointAvailable).toBe(true);
    press2(game, s1.platform, Action.Confirm); // PRESS OK → menu
    expect(flow.title.menu.items.map((i) => i.label)[0]).toBe('CONTINUE?');
    expect(flow.title.menu.focus).toBe(0);
    press2(game, s1.platform, Action.Confirm); // the row
    expect(flow.stack.top?.id).toBe('game');
    const run = flow.run;
    expect([run.checkpoint, run.zone, run.stage, run.practice]).toEqual([1, 0, 't-s', false]);
    expect(run.campaign?.id).toBe('test');
    const world = flow.world;
    expect(world.stage?.checkpoint).toBe(1);
    // The game's own continue rule was spent (TL-2 semantics): one continue, lives from the config.
    expect(world.continuesUsed).toBe(1);
    expect(world.players[0].lives).toBe(world.config.startingLives);
    // The record is consumed by the resume itself — and the resumed run immediately writes its
    // own fresh one at the World's birth (kill again right now, resume at this new edge).
    expect(flow.checkpointAvailable).toBe(true);
    const fresh = classifyCheckpointText(await readStorage(s1.platform), 'test').record;
    expect(fresh).not.toBeNull();
    expect(fresh?.savedTick).toBeLessThanOrEqual(1); // this boot's tick count, not s1's 90
    expect(fresh?.checkpointPassed).toBe(1); // the fresh World was born at checkpoint 1
  });

  it('keeps every mode row working while the row is in (shifted focus dispatch)', async () => {
    const s1 = new Session();
    s1.hold(0, 30);
    s1.platform.suspend();
    await s1.record();
    const { game, flow } = await resume(s1.platform);
    press2(game, s1.platform, Action.Confirm); // menu open
    press2(game, s1.platform, Action.Down); // off CONTINUE? onto 1 PLAYER
    expect(flow.title.menu.focus).toBe(1);
    press2(game, s1.platform, Action.Confirm);
    expect(flow.stack.top?.id).toBe('difficulty');
  });

  it('hides the row for a foreign build id and clears that key at load', async () => {
    const s1 = new Session();
    s1.hold(0, 40);
    s1.platform.suspend();
    const text = await s1.text();
    const parsed = JSON.parse(text as string) as Record<string, unknown>;
    parsed.buildId = 'some-other-build';
    await s1.platform.storage.set(RUN_CHECKPOINT_STORAGE_KEY, JSON.stringify(parsed));
    const { game, flow, store } = await resume(s1.platform);
    expect(store.available).toBe(false);
    expect(flow.checkpointAvailable).toBe(false);
    press2(game, s1.platform, Action.Confirm);
    expect(flow.title.menu.items.map((i) => i.label)[0]).toBe('1 PLAYER');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(await s1.platform.storage.get(RUN_CHECKPOINT_STORAGE_KEY)).toBe('');
  });

  it('a between-Worlds record starts the armed zone fresh', async () => {
    const s1 = new Session();
    s1.hold(0, 40);
    s1.platform.suspend();
    const text = await s1.text();
    const parsed = JSON.parse(text as string) as Record<string, unknown>;
    // The map-open shape: next zone armed, no live World to anchor on.
    parsed.pendingStart = true;
    parsed.savedTick = -1;
    parsed.checkpointPassed = -1;
    parsed.tail = null;
    await s1.platform.storage.set(RUN_CHECKPOINT_STORAGE_KEY, JSON.stringify(parsed));
    const { game, flow } = await resume(s1.platform);
    expect(flow.checkpointAvailable).toBe(true);
    press2(game, s1.platform, Action.Confirm);
    press2(game, s1.platform, Action.Confirm);
    expect(flow.stack.top?.id).toBe('game');
    expect(flow.run.checkpoint).toBe(-1);
    const world = flow.world;
    expect(world.tick).toBeLessThan(3); // a fresh World flies in
    expect(world.continuesUsed).toBe(1); // and it still spends the continue rule
  });
});
