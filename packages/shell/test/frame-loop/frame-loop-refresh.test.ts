/**
 * The refresh-rate probe of plan M2-08 (`createRefreshMonitor`): the interquartile mean of the last
 * rAF deltas, robust against jitter, hitches and a hidden page, reset on resume — what switches
 * render interpolation on at 120 / 144 Hz and leaves it off at 60 Hz.
 */
import { describe, expect, it } from 'vitest';
import {
  INTERPOLATION_MIN_HZ,
  REFRESH_SAMPLES,
  createRefreshMonitor,
} from '../../src/frame-loop/index.js';

/**
 * Feeds a monitor `count` frames `deltaMs` apart (with an optional jitter pattern).
 *
 * @param monitor - The monitor.
 * @param start - First timestamp.
 * @param count - Frames.
 * @param deltaMs - Frame length.
 * @param jitter - Added to every other delta, taken off the next.
 * @returns The last timestamp.
 */
function feed(
  monitor: ReturnType<typeof createRefreshMonitor>,
  start: number,
  count: number,
  deltaMs: number,
  jitter = 0,
): number {
  let now = start;
  for (let i = 0; i < count; i++) {
    now += deltaMs + (i % 2 === 0 ? jitter : -jitter);
    monitor.sample(now);
  }
  return now;
}

describe('shell/frame-loop refresh monitor', () => {
  it('is not ready until it has seen a full window of deltas', () => {
    const monitor = createRefreshMonitor();
    expect(REFRESH_SAMPLES).toBe(31);
    monitor.sample(0); // only starts the clock
    const now = feed(monitor, 0, REFRESH_SAMPLES - 1, 1000 / 60);
    expect([monitor.ready, monitor.hz]).toEqual([false, 0]);
    feed(monitor, now, 1, 1000 / 60);
    expect(monitor.ready).toBe(true);
    expect(monitor.hz).toBeCloseTo(60, 6);
  });

  it('reads 60, 120 and 144 Hz through jitter, below and above the interpolation threshold', () => {
    for (const [hz, fast] of [
      [60, false],
      [75, true],
      [120, true],
      [144, true],
    ] as const) {
      const monitor = createRefreshMonitor();
      feed(monitor, 0, 100, 1000 / hz, 0.8);
      expect(monitor.hz).toBeGreaterThan(hz * 0.93);
      expect(monitor.hz).toBeLessThan(hz * 1.07);
      expect(monitor.hz > INTERPOLATION_MIN_HZ).toBe(fast);
    }
  });

  it('ignores hitches, a hidden page and clocks that do not move, and follows a new display', () => {
    const monitor = createRefreshMonitor();
    let now = feed(monitor, 0, 40, 1000 / 120);
    // A few long frames and a 5 s gap (hidden tab) do not move the median.
    now = feed(monitor, now, 3, 50);
    monitor.sample(now + 5000);
    monitor.sample(now + 5000);
    now += 5000;
    expect(monitor.hz).toBeGreaterThan(110);
    // The window moved to a 60 Hz display: after enough frames the median follows.
    feed(monitor, now, 60, 1000 / 60);
    expect(monitor.hz).toBeCloseTo(60, 3);
  });

  it('forgets everything on reset', () => {
    const monitor = createRefreshMonitor(5);
    feed(monitor, 0, 10, 1000 / 144);
    expect(monitor.ready).toBe(true);
    monitor.reset();
    expect([monitor.ready, monitor.hz]).toEqual([false, 0]);
    monitor.sample(1e6);
    feed(monitor, 1e6, 5, 10);
    expect(monitor.hz).toBeCloseTo(100, 6);
    // A window of at least one sample.
    const one = createRefreshMonitor(0);
    one.sample(0);
    one.sample(8);
    expect(one.hz).toBeCloseTo(125, 6);
  });
});
