/**
 * Allocation guard of the M2-15 front end (definition of done: zero allocations per tick and per
 * frame), in its own file: the attract loop's demo play — a long free-flight demo (no stage, so no
 * spawns: every spawn creates its coroutine, decision D29) stepped through the replay playback,
 * its events forwarded, its HUD and the frame composed every tick —, the hi-score tables paging,
 * the story crawling over its scenes, and the name entry answering Up / Down / Left / Right. The
 * screens are held in place by rewinding their clocks now and then (plain number writes), so
 * nothing moves on (a transition allocates by design: the demo's World).
 */
import { describe, expect, it } from 'vitest';
import type { ContentDb } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  DEMO_BUILD_ID,
  createReplayHeader,
  encodeReplay,
  packReplayInput,
  type Replay,
} from '../../src/replay/index.js';
import { createHiScoreEntry, createSaveStore, type SaveStore } from '../../src/save/index.js';
import { TITLE_ATTRACT_TICKS, type SceneFlow } from '../../src/scenes/index.js';
import { addScore } from '../../src/scoring/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { frontEndContent } from '../helpers/front-end.js';

/** Iterations of every window (and the warm-up). */
const ITERATIONS = 20_000;

/** Ticks of the guard's demo: the warm-up and three windows, with room to spare. */
const DEMO_TICKS = ITERATIONS * 4 + 1_000;

/**
 * A session on the title.
 *
 * @param db - The content.
 * @param save - The save.
 * @param continues - Continues of the games (0: a game over opens the game-over screen at once).
 * @returns The game, its flow and platform.
 */
function session(
  db: ContentDb,
  save: SaveStore = createSaveStore(null),
  continues = 3,
): { game: Game; flow: SceneFlow; platform: HeadlessPlatform } {
  const platform = createHeadlessPlatform();
  const game = createGame(platform, { seed: 5, stage: 't-s', continues }, db, {
    scenes: 'title',
    save,
  });
  return { game, flow: game.scenes!, platform };
}

/**
 * Runs idle ticks.
 *
 * @param game - The game.
 * @param platform - Its platform.
 * @param ticks - Ticks.
 */
function idle(game: Game, platform: HeadlessPlatform, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(platform.snapshot.players[0], 0);
    game.step();
    game.renderFrame();
    game.events.clear();
  }
}

describe('core/scenes front-end allocation (M2-15)', () => {
  it('plays a demo without allocating', () => {
    const base = frontEndContent({ demos: false }).db;
    // A synthetic weaving recording (no recording session in this worker: a replay recorder's
    // long run leaves V8 feedback behind that makes any World allocate ~12 bytes a tick — a test
    // artefact, the shipped game never records). No periodic hash: the demo stays in sync until
    // its final hash, after the windows.
    const inputs = [new Uint32Array(DEMO_TICKS), new Uint32Array(DEMO_TICKS)];
    for (let t = 0; t < DEMO_TICKS; t++) {
      const held = Math.floor(t / 37) % 2 === 0 ? Action.Up : Action.Down;
      inputs[0][t] = packReplayInput(held, t % 37 === 0 ? held : 0);
    }
    const replay: Replay = {
      header: createReplayHeader(resolveGameConfig({ seed: 33 }), {
        buildId: DEMO_BUILD_ID,
        assisted: true,
      }),
      ticks: DEMO_TICKS,
      inputs,
      hashInterval: DEMO_TICKS + 1,
      hashes: new Uint32Array(0),
      finalHash: 0,
    };
    const db: ContentDb = {
      ...base,
      demos: [
        {
          id: 'guard',
          description: '',
          stage: null,
          stageIndex: -1,
          ticks: replay.ticks,
          document: encodeReplay(replay) as unknown as Record<string, unknown>,
        },
      ],
    };
    const { game, flow, platform } = session(db);
    idle(game, platform, TITLE_ATTRACT_TICKS);
    expect(flow.stack.top?.id).toBe('demo');
    const demo = flow.demo.demo!;
    const player = platform.snapshot.players[0];
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(player, 0);
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      ITERATIONS,
      ITERATIONS,
    );
    expect(flow.stack.top?.id).toBe('demo');
    expect(demo.playback.report.ok).toBe(true);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);

  it('pages the hi-score tables and crawls the story without allocating', () => {
    const save = createSaveStore(null);
    for (let i = 0; i < 12; i++) {
      save.recordScore('meter-normal', createHiScoreEntry(1000 * (i + 1), { reached: 't-u' }));
      save.recordScore('meter-hard-2p', createHiScoreEntry(700 * (i + 1), { reached: 't-s' }));
    }
    const { game, flow, platform } = session(frontEndContent({ demos: false }).db, save);
    idle(game, platform, TITLE_ATTRACT_TICKS);
    expect(flow.stack.top?.id).toBe('hiScore');
    const tables = flow.hiScores;
    expect(tables.pages.length).toBe(2);
    const player = platform.snapshot.players[0];
    const hiScores = measureHeapGrowth(
      (i) => {
        // Hold the screen on its pages (a page turns every HI_SCORE_PAGE_TICKS).
        if (tables.page >= tables.pages.length - 1 && tables.ticks > 250 + (i % 7)) tables.page = 0;
        commitPlayerInput(player, 0);
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      ITERATIONS,
      ITERATIONS,
    );
    expect(flow.stack.top?.id).toBe('hiScore');
    expect(hiScores.bytes).toBeLessThan(32 * 1024);
    // On to the story.
    for (let t = 0; t < 400 && flow.stack.top?.id === 'hiScore'; t++) idle(game, platform, 1);
    expect(flow.stack.top?.id).toBe('story');
    const story = flow.story;
    const crawl = measureHeapGrowth(
      () => {
        if (story.ticks >= story.duration - 3) story.ticks = 0;
        commitPlayerInput(player, 0);
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      ITERATIONS,
      ITERATIONS,
    );
    expect(flow.stack.top?.id).toBe('story');
    expect(crawl.bytes).toBeLessThan(32 * 1024);
  }, 60_000);

  it('answers the name entry`s four directions without allocating', () => {
    const { game, flow, platform } = session(frontEndContent({ demos: false }).db, undefined, 0);
    const player = platform.snapshot.players[0];
    const tap = (action: number): void => {
      commitPlayerInput(player, action);
      game.step();
      commitPlayerInput(player, 0);
      game.step();
    };
    tap(Action.Confirm); // PRESS OK
    idle(game, platform, 2);
    tap(Action.Confirm); // 1 PLAYER
    idle(game, platform, 2);
    tap(Action.Confirm); // NORMAL
    idle(game, platform, 2);
    tap(Action.Confirm); // START
    idle(game, platform, 2);
    addScore(game.world, 0, 4200);
    game.world.status = 'gameOver';
    idle(game, platform, 100);
    tap(Action.Confirm);
    expect(flow.stack.top?.id).toBe('nameEntry');
    const entry = flow.nameEntry;
    const keys = [Action.Up, Action.Down, Action.Right, Action.Left, Action.Up];
    const growth = measureHeapGrowth(
      (i) => {
        if (entry.ticks > 1500) entry.ticks = 0; // never time out
        const phase = i % 25;
        commitPlayerInput(player, phase === 0 ? keys[Math.floor(i / 25) % keys.length] : 0);
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      ITERATIONS,
      ITERATIONS,
    );
    expect(flow.stack.top?.id).toBe('nameEntry');
    expect(growth.bytes).toBeLessThan(32 * 1024);
  }, 60_000);
});
