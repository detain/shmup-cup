/**
 * Tests of the attract-mode playback (plan M2-15, `core/replay` `createDemoPlayback`): a demo
 * World built from a replay header plays the recording tick by tick with every hash checked — the
 * same states as the recorded session (god mode from `assisted`, a checkpoint start, the content's
 * difficulty table), its events in the queue it was given, the end of the recording and a desync
 * (a tampered input) ending the demo, and the errors of a header the content cannot play.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createEventQueue } from '../../src/events/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import {
  DEMO_BUILD_ID,
  DemoPlayback,
  createDemoPlayback,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  decodeReplay,
  encodeReplay,
  type Replay,
} from '../../src/replay/index.js';

/**
 * Reads a shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The parsed JSON.
 */
function shipped(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
  ) as unknown;
}

/** Content with the KESTREL and a scrolling stage with checkpoints. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent([
    { path: 'player/kestrel.player.json', data: shipped('player/kestrel.player.json') },
    { path: 'tilesets/terrain-a.tileset.json', data: shipped('tilesets/terrain-a.tileset.json') },
    {
      path: 'stages/t.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 't',
        name: 'T',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 6000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [{ x: 0 }, { x: 600 }],
        parallax: [],
        tilemap: {
          tileSize: 8,
          tileset: 'terrain-a',
          rowsTall: 25,
          generator: {
            type: 'heightfield',
            segments: [{ from: 0, to: 6384, floor: { base: 40, amp: 8, period: 64, seed: 1 } }],
          },
        },
        events: [{ x: 6000, type: 'end' }],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
})();

/**
 * Records a weaving session.
 *
 * @param config - Config overrides.
 * @param ticks - Ticks to record.
 * @param options - Checkpoint and god mode.
 * @param options.checkpoint - Start checkpoint.
 * @param options.assisted - God mode for the whole run.
 * @returns The replay and the hash of the recorded World after its last tick.
 */
function record(
  config: Partial<GameConfig>,
  ticks: number,
  options: { checkpoint?: number; assisted?: boolean } = {},
): { replay: Replay; hash: number } {
  const header = createReplayHeader(resolveGameConfig(config), {
    buildId: DEMO_BUILD_ID,
    checkpoint: options.checkpoint ?? -1,
    assisted: options.assisted ?? true,
  });
  const platform = createHeadlessPlatform();
  const recorder = createReplayRecorder(platform.input, header);
  const game = createReplayGame({ ...platform, input: recorder }, header, DB);
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(platform.snapshot.players[0], (t / 45) % 2 < 1 ? Action.Up : Action.Down);
    game.step();
    game.events.clear();
    recorder.check(game.world);
  }
  return { replay: recorder.finish(game.world), hash: hashWorld(game.world) };
}

describe('core/replay attract playback (M2-15)', () => {
  it('plays a recording to its end in sync, into the queue it was given', () => {
    const { replay, hash } = record({ seed: 11, stage: 't' }, 1300);
    const events = createEventQueue();
    const demo = createDemoPlayback(decodeReplay(encodeReplay(replay)), DB, { events });
    expect(demo).toBeInstanceOf(DemoPlayback);
    expect(demo.flags.godMode).toBe(true);
    expect(demo.world.tick).toBe(0);
    expect(demo.running).toBe(true);
    let steps = 0;
    while (demo.step()) {
      steps++;
      events.clear();
    }
    expect(steps).toBe(1299); // the last step ends it
    expect(demo.running).toBe(false);
    expect(demo.playback.report).toMatchObject({ ok: true, finished: true, checked: 3 });
    expect(hashWorld(demo.world)).toBe(hash);
    // Over: further steps do nothing.
    const tick = demo.world.tick;
    expect(demo.step()).toBe(false);
    expect(demo.world.tick).toBe(tick);
  });

  it('pushes the World`s presentation events into its own queue', () => {
    const { replay } = record({ seed: 12, stage: 't', autofire: true }, 120);
    const events = createEventQueue();
    const demo = createDemoPlayback(replay, DB, { events });
    let pushed = 0;
    for (let t = 0; t < 60; t++) {
      demo.step();
      pushed += events.length;
      events.clear();
    }
    expect(pushed).toBeGreaterThan(0);
    // Without a queue it makes its own (the caller never sees those events).
    const quiet = createDemoPlayback(replay, DB);
    for (let t = 0; t < 60; t++) quiet.step();
    expect(hashWorld(quiet.world)).toBe(hashWorld(demo.world));
  });

  it('starts at the header`s checkpoint and plays god mode off when not assisted', () => {
    const { replay, hash } = record({ seed: 13, stage: 't' }, 700, {
      checkpoint: 1,
      assisted: false,
    });
    const demo = createDemoPlayback(replay, DB);
    expect(demo.flags.godMode).toBe(false);
    expect(demo.world.camera.x).toBeGreaterThanOrEqual(600);
    while (demo.step());
    expect(demo.playback.report.ok).toBe(true);
    expect(hashWorld(demo.world)).toBe(hash);
  });

  it('ends a demo whose recording no longer matches at the first differing hash', () => {
    const { replay } = record({ seed: 14, stage: 't' }, 1300);
    const inputs = replay.inputs.map((words) => words.slice());
    for (let t = 100; t < 400; t++) inputs[0][t] = Action.Right;
    const tampered: Replay = { ...replay, inputs };
    const demo = createDemoPlayback(tampered, DB);
    let steps = 0;
    while (demo.step()) steps++;
    expect(demo.playback.report.ok).toBe(false);
    expect(demo.playback.report.desyncTick).toBe(600);
    expect(steps).toBe(599); // stopped at the first hash tick
    expect(demo.running).toBe(false);
  });

  it('refuses a header its content cannot play', () => {
    const { replay } = record({ seed: 15, stage: 't' }, 30);
    expect(() => createDemoPlayback(replay, EMPTY_CONTENT_DB)).toThrow(RangeError);
    const header = createReplayHeader(replay.header.config, { checkpoint: 9 });
    expect(() => createDemoPlayback({ ...replay, header }, DB)).toThrow(/checkpoint 9/);
  });
});
