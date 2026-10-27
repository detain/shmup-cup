/**
 * `pnpm bench` — the **rewind-speed proxy** of the R2 TV-resume (lane v20x-TL, TL-3): the exact-tick
 * resume (TL-4) rebuilds a World from a checkpoint's tail snapshot and steps it to the death tick
 * while {@link playGolden}'s own loop compares `hashWorld` every 600 ticks — the same loop, on the
 * same shipped recordings, is what this file times. It prints the machine's steps per second, the
 * World build's cost and the hash-check cost per recording, and the derived
 * {@link REWIND_PATIENCE_TICKS} estimate for the honest wall-clock budget — every number labelled
 * **ESTIMATE** because the machine that matters is the owner's M7: the TV render bench's
 * `?scenario=rewind` row (the same loop compiled into the bench widget) waits for that run, and
 * `MAX_REWIND_TICKS` in `core/replay` is only pinned by the report once a row exists. Not part of
 * `pnpm test` (timing needs a quiet machine).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createHeadlessPlatform,
  createPlayback,
  createReplayGame,
  decodeReplay,
  hashWorld,
  type Replay,
} from '@shmup/core';
import { GOLDEN_BUILD_ID, goldenPath } from '../golden/golden.js';
import { shippedContent } from '../playtest/harness.js';

/** The recordings timed: the first zone's boss (mid density), the heaviest raid and the final zone. */
const RECORDINGS = ['zone-a-boss', 'raid-range-escape', 'zone-i-god'];

/** Ticks rewound per second this Node machine must at least show for the run to count as timed. */
const MIN_STEPS_PER_SECOND = 800;

/** The wall-clock budget one resume may cost the player, seconds (owner patience, ESTIMATE). */
export const REWIND_PATIENCE_S = 4;

/**
 * How much slower the M7's Chromium 69 sim is assumed against this Node machine (the R0-02 render
 * bench's TV figures run 10–25× the headless browser's at the same scene; 12 is the middle — an
 * ESTIMATE until the owner's `?scenario=rewind` row replaces it).
 */
export const M7_SLOWDOWN_ESTIMATE = 12;

/**
 * The ticks one resume may rewind on the M7 inside {@link REWIND_PATIENCE_S} at this machine's
 * measured rate over the assumed slowdown, floored to the printed value.
 */
export function estimateRewindCap(stepsPerSecond: number): number {
  return Math.floor((stepsPerSecond * REWIND_PATIENCE_S) / M7_SLOWDOWN_ESTIMATE);
}

describe('bench: the rewind loop of the R2 resume (shipped goldens, this machine)', () => {
  it.each(RECORDINGS)(
    `%s: plays its recording and reports steps/s (ESTIMATE for the M7 cap)`,
    (name) => {
      const document = JSON.parse(readFileSync(goldenPath(name), 'utf8')) as Parameters<
        typeof decodeReplay
      >[0];
      const replay: Replay = decodeReplay(document);
      const buildStart = performance.now();
      const playback = createPlayback(replay, { buildId: GOLDEN_BUILD_ID });
      const game = createReplayGame(
        { ...createHeadlessPlatform(), input: playback },
        replay.header,
        shippedContent(),
      );
      const buildMs = performance.now() - buildStart;
      const ticks = replay.ticks;
      const start = performance.now();
      while (!playback.done) {
        game.step();
        game.events.clear();
        playback.check(game.world);
      }
      const ms = performance.now() - start;
      const report = playback.report;
      const stepsPerSecond = (ticks / ms) * 1000;
      // The hash check's own cost, measured on the finished World (600-tick interval like the
      // playback's): how much of a rewind the verification itself is.
      const hashStart = performance.now();
      const hashEvery = replay.hashInterval;
      let hashChecks = 0;
      for (let t = hashEvery; t <= ticks; t += hashEvery) {
        hashWorld(game.world);
        hashChecks++;
      }
      const hashMs = performance.now() - hashStart;
      console.info(
        `[bench] rewind ${name} [ESTIMATE]: ${String(ticks)} ticks in ${ms.toFixed(0)} ms = ` +
          `${stepsPerSecond.toFixed(0)} steps/s; World build ${buildMs.toFixed(1)} ms; ` +
          `${String(hashChecks)} hashWorld checks ${hashMs.toFixed(1)} ms ` +
          `(${((hashMs / Math.max(1, hashChecks)) * 1000).toFixed(0)} µs each); ` +
          `cap at ${REWIND_PATIENCE_S} s / ÷${M7_SLOWDOWN_ESTIMATE} = ` +
          `${String(estimateRewindCap(stepsPerSecond))} ticks (M7 row pending)`,
      );
      expect(report.ok, `${name} replays clean under the timing loop`).toBe(true);
      expect(report.finished).toBe(true);
      expect(stepsPerSecond).toBeGreaterThan(MIN_STEPS_PER_SECOND);
    },
  );
});
