/**
 * Edge cases of the refresh-rate probe (plan M2-08, `createRefreshMonitor`), next to
 * `frame-loop-refresh.test.ts`: a NaN or a backwards timestamp costs one delta and nothing else,
 * the 250 ms hitch limit is inclusive, the estimate is only recomputed every 15 deltas once ready,
 * alternating long / short frames of a 60 Hz display read as 60 Hz (the interquartile mean — a
 * median picked one extreme), window sizes are floored (regression: a NaN size built a monitor
 * that never became ready), a reset before the first sample, and the probe's view of 75 / 90 Hz.
 */
import { describe, expect, it } from 'vitest';
import {
  INTERPOLATION_MIN_HZ,
  REFRESH_SAMPLES,
  createRefreshMonitor,
  type RefreshMonitor,
} from '../../src/frame-loop/index.js';

/**
 * Feeds a monitor `count` frames `deltaMs` apart.
 *
 * @param monitor - The monitor.
 * @param start - The last timestamp fed.
 * @param count - Frames.
 * @param deltaMs - Frame length.
 * @returns The last timestamp.
 */
function feed(monitor: RefreshMonitor, start: number, count: number, deltaMs: number): number {
  let now = start;
  for (let i = 0; i < count; i++) {
    now += deltaMs;
    monitor.sample(now);
  }
  return now;
}

describe('shell/frame-loop refresh monitor (edges)', () => {
  it('loses only one delta to a NaN or a backwards timestamp', () => {
    const monitor = createRefreshMonitor(4);
    monitor.sample(0);
    let now = feed(monitor, 0, 2, 10);
    monitor.sample(Number.NaN); // no delta; the clock restarts from NaN …
    now += 10;
    monitor.sample(now); // … so this delta (NaN) is dropped too
    expect(monitor.ready).toBe(false);
    feed(monitor, now, 2, 10);
    expect(monitor.ready).toBe(true);
    expect(monitor.hz).toBeCloseTo(100, 9);
    // The clock jumps back 5 s (a new time origin): one delta dropped, then it counts again.
    const again = createRefreshMonitor(3);
    again.sample(10_000);
    again.sample(5000);
    feed(again, 5000, 2, 8);
    expect(again.ready).toBe(false);
    feed(again, 5016, 1, 8);
    expect(again.hz).toBeCloseTo(125, 9);
  });

  it('counts a 250 ms delta and drops a longer one', () => {
    const counted = createRefreshMonitor(1);
    counted.sample(0);
    counted.sample(250);
    expect([counted.ready, counted.hz]).toEqual([true, 4]);
    const dropped = createRefreshMonitor(1);
    dropped.sample(0);
    dropped.sample(250.5);
    expect(dropped.ready).toBe(false);
    // A delta of 0 (two callbacks with one timestamp) is dropped too.
    dropped.sample(250.5);
    expect(dropped.ready).toBe(false);
  });

  it('recomputes the estimate every 15 deltas once ready', () => {
    const monitor = createRefreshMonitor();
    monitor.sample(0);
    let now = feed(monitor, 0, REFRESH_SAMPLES, 1000 / 60);
    expect(monitor.hz).toBeCloseTo(60, 9);
    // 14 deltas of a 144 Hz display: the estimate waits.
    now = feed(monitor, now, 14, 1000 / 144);
    expect(monitor.hz).toBeCloseTo(60, 9);
    // The 15th: recomputed over the window (15 fast deltas of 31, the middle half mixed).
    now = feed(monitor, now, 1, 1000 / 144);
    expect(monitor.hz).toBeGreaterThan(60.5);
    // Another 15: the window is all fast deltas but one — the middle half is all fast.
    feed(monitor, now, 15, 1000 / 144);
    expect(monitor.hz).toBeCloseTo(144, 6);
  });

  it('reads alternating long and short frames of a 60 Hz display as 60 Hz', () => {
    const monitor = createRefreshMonitor();
    monitor.sample(0);
    let now = 0;
    for (let i = 0; i < 90; i++) {
      now += i % 2 === 0 ? 12 : 1000 / 30 - 12;
      monitor.sample(now);
    }
    expect(monitor.hz).toBeGreaterThan(57);
    expect(monitor.hz).toBeLessThan(63);
    expect(monitor.hz > INTERPOLATION_MIN_HZ).toBe(false);
  });

  it('reads 75 and 90 Hz displays as faster than the interpolation threshold, 65 Hz not', () => {
    for (const [hz, fast] of [
      [65, false],
      [75, true],
      [90, true],
    ] as const) {
      const monitor = createRefreshMonitor();
      monitor.sample(0);
      feed(monitor, 0, 60, 1000 / hz);
      expect(monitor.hz).toBeCloseTo(hz, 6);
      expect(monitor.hz > INTERPOLATION_MIN_HZ).toBe(fast);
    }
  });

  it('floors the window size, at least one sample — also for NaN', () => {
    for (const [samples, size] of [
      [2.7, 2],
      [-5, 1],
      [0.5, 1],
      [Number.NaN, 1],
    ] as const) {
      const monitor = createRefreshMonitor(samples);
      monitor.sample(0);
      feed(monitor, 0, size - 1, 10);
      expect(monitor.ready, `size ${String(samples)}`).toBe(false);
      feed(monitor, 10 * (size - 1), 1, 10);
      expect(monitor.ready, `size ${String(samples)}`).toBe(true);
      expect(monitor.hz).toBeCloseTo(100, 9);
    }
  });

  it('can be reset before its first sample and after a partial window', () => {
    const monitor = createRefreshMonitor(3);
    monitor.reset();
    expect([monitor.ready, monitor.hz]).toEqual([false, 0]);
    monitor.sample(0);
    feed(monitor, 0, 2, 5);
    monitor.reset();
    // The first timestamp after a reset only starts the clock: 3 more deltas are needed.
    monitor.sample(1000);
    feed(monitor, 1000, 2, 20);
    expect(monitor.ready).toBe(false);
    feed(monitor, 1040, 1, 20);
    expect(monitor.hz).toBeCloseTo(50, 9);
  });
});
