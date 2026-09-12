/**
 * Allocation guard of the replay's per-tick paths (plan M1-19, own file): recording
 * (`recorder.poll()` + `check()`) and playback (`playback.poll()` + `check()`) around a real
 * session tick write only into preallocated typed arrays — the hash every 600 ticks boxes one
 * number at most.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import {
  createPlayback,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
} from '../../src/replay/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/replay allocation', () => {
  it('records and plays back without allocating per tick', () => {
    const header = createReplayHeader(resolveGameConfig({ seed: 2 }));
    const platform = createHeadlessPlatform();
    const recorder = createReplayRecorder(platform.input, header, { capacity: 80_000 });
    const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
    const input = platform.snapshot.players[0];
    const recording = measureHeapGrowth(
      (i) => {
        commitPlayerInput(input, (i & 64) === 0 ? Action.Up : Action.Down);
        game.step();
        recorder.check(game.world);
      },
      12_000,
      20_000,
      1,
    );
    expect(recording.bytes).toBeLessThan(64 * 1024);
    const replay = recorder.finish(game.world);

    const playback = createPlayback(replay);
    const replayGame = createReplayGame(
      { ...createHeadlessPlatform(), input: playback },
      replay.header,
      EMPTY_CONTENT_DB,
    );
    const playing = measureHeapGrowth(
      () => {
        replayGame.step();
        playback.check(replayGame.world);
      },
      12_000,
      20_000,
      1,
    );
    expect(playing.bytes).toBeLessThan(64 * 1024);
    expect(playback.report.ok).toBe(true);
    expect(playback.report.checked).toBe(Math.floor(32_000 / 600) + 1); // + the final hash
    expect(playback.report.finished).toBe(true);
  }, 60_000);
});
