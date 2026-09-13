/**
 * Replays of co-op games (plan M2-06, shmup_feat.md §21 "per-tick bitmask per player"): a session
 * recorded with both players' input — player 2 dropping in with START, both flying and firing on
 * the direct range — plays back with every state hash, also through the
 * JSON encoding (the header keeps `coop` and `coopExtra`), and a replay whose player 2 input is
 * dropped desyncs (the join is recorded as input, nothing else). Player 2's continues back into the
 * running game replay in the `zone-a-coop-deaths` golden replay.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import {
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  decodeReplay,
  encodeReplay,
  playReplay,
  type Replay,
} from '../../src/replay/index.js';
import { directDb } from '../helpers/direct.js';

/** The shared content (the direct range scrolls and spawns carriers). */
const DB = directDb();

/**
 * Records a co-op session on the direct range: player 1 weaves, player 2 presses START at tick 40
 * and weaves the other way.
 *
 * @returns The replay and the recorded game's final hash.
 */
function record(): { replay: Replay; hash: number } {
  const config = resolveGameConfig({
    seed: 31,
    stage: 'direct-range',
    shipId: 'kestrel',
    powerUpMode: 'meter',
    coop: true,
    coopExtra: 1,
  });
  const header = createReplayHeader(config, { buildId: 'coop-test' });
  const platform = createHeadlessPlatform();
  const recorder = createReplayRecorder(platform.input, header);
  const game = createReplayGame({ ...platform, input: recorder }, header, DB);
  const [p1, p2] = platform.snapshot.players;
  for (let t = 0; t < 1_400; t++) {
    const start = t === 40 ? Action.Pause : 0;
    commitPlayerInput(p1, (t >> 4) % 2 === 0 ? Action.Up : Action.Down);
    commitPlayerInput(p2, ((t >> 5) % 2 === 0 ? Action.Right : Action.Left) | start);
    game.step();
    recorder.check(game.world);
  }
  expect(game.world.players[1].active).toBe(true);
  return { replay: recorder.finish(game.world), hash: hashWorld(game.world) };
}

describe('core/replay co-op (M2-06)', () => {
  it('records both players and plays the co-op game back hash for hash', () => {
    const { replay, hash } = record();
    expect(replay.header.config.coop).toBe(true);
    expect(replay.inputs).toHaveLength(2);
    expect(replay.inputs[1].some((word) => word !== 0)).toBe(true);
    const run = playReplay(replay, DB);
    expect(run.report).toMatchObject({ ok: true, finished: true, desyncTick: -1 });
    expect(run.game.world.players[1].active).toBe(true); // the recorded START joined it
    expect(hashWorld(run.game.world)).toBe(hash);
  });

  it('keeps coop and coopExtra through the JSON encoding', () => {
    const { replay } = record();
    const decoded = decodeReplay(JSON.parse(JSON.stringify(encodeReplay(replay))) as unknown);
    expect(decoded.header.config.coop).toBe(true);
    expect(decoded.header.config.coopExtra).toBe(1);
    expect(Array.from(decoded.inputs[1])).toEqual(Array.from(replay.inputs[1]));
  });

  it('desyncs without player 2`s input (the join is input)', () => {
    const { replay } = record();
    const silent: Replay = {
      ...replay,
      inputs: [replay.inputs[0], new Uint32Array(replay.ticks)],
    };
    const run = playReplay(silent, DB);
    expect(run.report.ok).toBe(false);
    expect(run.game.world.players[1].active).toBe(false);
  });
});
