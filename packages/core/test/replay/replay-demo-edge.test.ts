/**
 * Edge cases of the attract-mode playback (plan M2-15, `core/replay` `createDemoPlayback`) beyond
 * `replay-demo.test.ts`: a zero-tick recording (its starting state compared at creation), a
 * recording whose final hash alone was changed (the demo plays to its end and reports the desync
 * there), two demos of one recording playing side by side with their own debug switches, a
 * free-flight demo, and the demo World's config resolved over the content's own difficulty table
 * exactly as the recorded session's was.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY_TABLE, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import {
  DEMO_BUILD_ID,
  createDemoPlayback,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  type Replay,
} from '../../src/replay/index.js';

/**
 * Reads a shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/** A long open stage. */
const STAGE: ContentFile = {
  path: 'stages/t.stage.json',
  data: {
    formatVersion: 1,
    kind: 'stage',
    id: 't',
    name: 'T',
    music: { stage: 'Stage', boss: 'Boss' },
    length: 6000,
    camera: [{ x: 0, speed: 1 }],
    checkpoints: [{ x: 0 }],
    parallax: [],
    tilemap: null,
    events: [{ x: 6000, type: 'end' }],
  },
};

/**
 * A rules file: the built-in difficulty table with HARD's lives and continues changed.
 *
 * @returns The file.
 */
function hardRules(): ContentFile {
  const table = JSON.parse(JSON.stringify(DEFAULT_DIFFICULTY_TABLE)) as Record<
    string,
    Record<string, unknown>
  >;
  table.hard.lives = 1;
  table.hard.continues = 7;
  return {
    path: 'rules/difficulty.rules.json',
    data: { formatVersion: 1, kind: 'rules', difficulty: table },
  };
}

/**
 * Loads content.
 *
 * @param files - The files.
 * @returns The DB.
 */
function load(files: ContentFile[]): ContentDb {
  const { db, issues } = loadContent(files);
  expect(issues).toEqual([]);
  return db;
}

const DB = load([shipped('player/kestrel.player.json'), STAGE]);

/**
 * Records a weaving session.
 *
 * @param db - The content.
 * @param stage - The stage (`null` = free flight).
 * @param ticks - Ticks to record.
 * @param extra - More config.
 * @returns The replay and the recorded World's final hash and config.
 */
function record(
  db: ContentDb,
  stage: string | null,
  ticks: number,
  extra: Record<string, unknown> = {},
): { replay: Replay; hash: number; config: unknown } {
  const table = db.difficulty ?? DEFAULT_DIFFICULTY_TABLE;
  const header = createReplayHeader(resolveGameConfig({ seed: 5, stage, ...extra }, table), {
    buildId: DEMO_BUILD_ID,
    assisted: true,
  });
  const platform = createHeadlessPlatform();
  const recorder = createReplayRecorder(platform.input, header);
  const game = createReplayGame({ ...platform, input: recorder }, header, db);
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(platform.snapshot.players[0], (t / 30) % 2 < 1 ? Action.Up : Action.Down);
    game.step();
    game.events.clear();
    recorder.check(game.world);
  }
  return {
    replay: recorder.finish(game.world),
    hash: hashWorld(game.world),
    config: game.world.config,
  };
}

describe('core/replay attract playback — edge cases (M2-15)', () => {
  it('a zero-tick recording is over at once, its starting state compared at creation', () => {
    const { replay, hash } = record(DB, 't', 0);
    expect(replay.ticks).toBe(0);
    const demo = createDemoPlayback(replay, DB);
    expect(demo.running).toBe(false);
    expect(demo.playback.report).toMatchObject({ ok: true, finished: true, checked: 1 });
    expect(hashWorld(demo.world)).toBe(hash);
    expect(demo.step()).toBe(false);
    expect(demo.world.tick).toBe(0);
    // A zero-tick recording of another start is a desync from the first moment.
    const other = createDemoPlayback({ ...replay, finalHash: (replay.finalHash ^ 1) >>> 0 }, DB);
    expect(other.running).toBe(false);
    expect(other.playback.report).toMatchObject({ ok: false, desyncTick: 0, finished: true });
  });

  it('plays to the end when only the final hash differs, and reports the desync there', () => {
    const { replay } = record(DB, 't', 700);
    const tampered: Replay = { ...replay, finalHash: (replay.finalHash + 1) >>> 0 };
    const demo = createDemoPlayback(tampered, DB);
    let steps = 0;
    while (demo.step()) steps++;
    expect(steps).toBe(699);
    expect(demo.world.tick).toBe(700);
    expect(demo.playback.report).toMatchObject({
      ok: false,
      finished: true,
      desyncTick: 700,
      expectedHash: tampered.finalHash,
      actualHash: replay.finalHash,
    });
    // The periodic hash at 600 still matched.
    expect(demo.playback.report.checked).toBe(2);
    // Over: stepping again changes nothing.
    expect(demo.step()).toBe(false);
    expect(demo.world.tick).toBe(700);
  });

  it('two demos of one recording play side by side, each with its own debug switches', () => {
    const { replay, hash } = record(DB, 't', 240);
    const a = createDemoPlayback(replay, DB);
    const b = createDemoPlayback(replay, DB);
    expect(a.flags).not.toBe(b.flags);
    expect(a.world).not.toBe(b.world);
    for (let t = 0; t < 120; t++) {
      a.step();
      b.step();
      expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    }
    // Changing one demo's switches leaves the other's alone.
    a.flags.godMode = false;
    expect(b.flags.godMode).toBe(true);
    while (b.step());
    expect(b.playback.report.ok).toBe(true);
    expect(hashWorld(b.world)).toBe(hash);
  });

  it('plays a free-flight recording (no stage)', () => {
    const { replay, hash } = record(DB, null, 300);
    expect(replay.header.stageId).toBeNull();
    const demo = createDemoPlayback(replay, DB);
    expect(demo.world.stage).toBeNull();
    while (demo.step());
    expect(demo.playback.report).toMatchObject({ ok: true, finished: true });
    expect(hashWorld(demo.world)).toBe(hash);
  });

  it('resolves the config over the content`s difficulty table like the recorded session', () => {
    const db = load([shipped('player/kestrel.player.json'), STAGE, hardRules()]);
    const { replay, hash, config } = record(db, 't', 300, { difficulty: 'hard' });
    const demo = createDemoPlayback(replay, db);
    expect(demo.world.config).toEqual(config);
    expect(demo.world.config).toMatchObject({ difficulty: 'hard', startingLives: 1, continues: 7 });
    // The same session createGame builds from the header.
    const game = createGame(createHeadlessPlatform(), replay.header.config, db);
    expect(demo.world.config).toEqual(game.world.config);
    while (demo.step());
    expect(demo.playback.report.ok).toBe(true);
    expect(hashWorld(demo.world)).toBe(hash);
  });
});
