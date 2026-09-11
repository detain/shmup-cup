/**
 * Edge cases of the fixed-step loop: other refresh rates, long runs without drift,
 * clock anomalies, snapping tolerance, option validation, reading `alpha` / calling `reset()`
 * from inside a tick, and zero allocation per frame (regression, found by the M1-06 tests).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAP_TOLERANCE_MS, createFixedStepLoop } from '../../src/loop/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * Creates a loop that counts ticks.
 *
 * @param options - Optional overrides.
 */
function makeLoop(options: { tickRate?: number; max?: number; snap?: number } = {}) {
  const counter = { ticks: 0 };
  const loop = createFixedStepLoop({
    tickRate: options.tickRate ?? 60,
    maxTicksPerFrame: options.max ?? 4,
    snapToleranceMs: options.snap,
    onTick: () => {
      counter.ticks++;
    },
  });
  return { loop, counter };
}

/**
 * Feeds `frames` frames of `deltaMs` each and returns the ticks run per frame.
 *
 * @param loop - Loop under test.
 * @param deltaMs - Frame duration.
 * @param frames - Frame count.
 * @param start - First timestamp.
 */
function feed(
  loop: ReturnType<typeof makeLoop>['loop'],
  deltaMs: number,
  frames: number,
  start = 0,
): number[] {
  const perFrame: number[] = [];
  loop.advance(start);
  for (let i = 1; i <= frames; i++) perFrame.push(loop.advance(start + i * deltaMs));
  return perFrame;
}

describe('core/loop edge cases', () => {
  it('exposes stepMs and a 1 ms default snap tolerance', () => {
    expect(makeLoop().loop.stepMs).toBeCloseTo(1000 / 60, 10);
    expect(makeLoop({ tickRate: 30 }).loop.stepMs).toBeCloseTo(1000 / 30, 10);
    expect(DEFAULT_SNAP_TOLERANCE_MS).toBe(1);
  });

  it('runs exactly 60 ticks per simulated second on 60 Hz for a long session (no drift)', () => {
    const { loop, counter } = makeLoop();
    const perFrame = feed(loop, 1000 / 60, 60 * 60 * 10); // ten minutes
    expect(counter.ticks).toBe(60 * 60 * 10);
    expect(perFrame.every((ticks) => ticks === 1)).toBe(true);
  });

  it('runs 60 ticks per second on a 144 Hz display', () => {
    const { loop, counter } = makeLoop();
    const perFrame = feed(loop, 1000 / 144, 144 * 5);
    expect(counter.ticks).toBeGreaterThanOrEqual(299);
    expect(counter.ticks).toBeLessThanOrEqual(300);
    expect(Math.max(...perFrame)).toBe(1);
  });

  it('runs 60 ticks per second on a 50 Hz (PAL) display, sometimes two per frame', () => {
    const { loop, counter } = makeLoop();
    const perFrame = feed(loop, 20, 50 * 4);
    expect(counter.ticks).toBeGreaterThanOrEqual(239);
    expect(counter.ticks).toBeLessThanOrEqual(240);
    expect(perFrame).toContain(2);
  });

  it('snaps a frame that is about two steps long to exactly two ticks (dropped frame)', () => {
    const { loop } = makeLoop();
    loop.advance(0);
    expect(loop.advance(33.0)).toBe(2);
    expect(loop.alpha).toBeCloseTo(0, 9);
  });

  it('snapping can be disabled with a zero tolerance', () => {
    const { loop, counter } = makeLoop({ snap: 0 });
    loop.advance(0);
    loop.advance(16.4); // shorter than one step: accumulates
    expect(counter.ticks).toBe(0);
    expect(loop.alpha).toBeGreaterThan(0.9);
    loop.advance(16.4 + 16.4);
    expect(counter.ticks).toBe(1);
  });

  it('ignores a repeated or backwards timestamp (clock hiccup) without losing time', () => {
    const { loop, counter } = makeLoop();
    loop.advance(1000);
    expect(loop.advance(1000)).toBe(0);
    expect(loop.advance(900)).toBe(0); // backwards: re-anchors at 900
    expect(loop.advance(900 + 1000 / 60)).toBe(1);
    expect(counter.ticks).toBe(1);
  });

  it('drops excess time after a long stall so the next frame is normal again', () => {
    const { loop } = makeLoop({ max: 4 });
    loop.advance(0);
    expect(loop.advance(5000)).toBe(4);
    expect(loop.alpha).toBeGreaterThanOrEqual(0);
    expect(loop.alpha).toBeLessThan(1);
    expect(loop.advance(5000 + 1000 / 60)).toBeLessThanOrEqual(2);
  });

  it('keeps alpha in [0, 1) under irregular frame times', () => {
    const { loop } = makeLoop();
    let t = 0;
    loop.advance(t);
    const deltas = [3, 7.5, 16.7, 40, 1, 0.2, 100, 16.6, 25, 8.3];
    for (let i = 0; i < 200; i++) {
      t += deltas[i % deltas.length] ?? 16;
      loop.advance(t);
      expect(loop.alpha).toBeGreaterThanOrEqual(0);
      expect(loop.alpha).toBeLessThan(1);
    }
  });

  it('totalTicks counts across reset() while the accumulator is cleared', () => {
    const { loop } = makeLoop();
    feed(loop, 1000 / 60, 10);
    loop.advance(10 * (1000 / 60) + 5); // partial step in the accumulator
    loop.reset();
    expect(loop.alpha).toBe(0);
    expect(loop.totalTicks).toBe(10);
    loop.advance(50_000);
    loop.advance(50_000 + 1000 / 60);
    expect(loop.totalTicks).toBe(11);
  });

  it('floors a fractional maxTicksPerFrame', () => {
    const { loop } = makeLoop({ max: 2.9 });
    loop.advance(0);
    expect(loop.advance(1000)).toBe(2);
  });

  it('rejects NaN / negative options with RangeError', () => {
    const onTick = (): void => {};
    expect(() =>
      createFixedStepLoop({ tickRate: Number.NaN, maxTicksPerFrame: 1, onTick }),
    ).toThrow(RangeError);
    expect(() => createFixedStepLoop({ tickRate: -60, maxTicksPerFrame: 1, onTick })).toThrow(
      /tickRate/,
    );
    expect(() =>
      createFixedStepLoop({ tickRate: 60, maxTicksPerFrame: Number.NaN, onTick }),
    ).toThrow(/maxTicksPerFrame/);
    expect(() => createFixedStepLoop({ tickRate: 60, maxTicksPerFrame: 0.5, onTick })).toThrow(
      RangeError,
    );
  });

  it('calls onTick exactly as many times as advance() reports', () => {
    const { loop, counter } = makeLoop({ max: 3 });
    let reported = 0;
    let t = 0;
    loop.advance(t);
    for (const delta of [16.6, 50, 0, 1000, 8, 8, 33.4]) {
      t += delta;
      reported += loop.advance(t);
    }
    expect(counter.ticks).toBe(reported);
    expect(loop.totalTicks).toBe(reported);
  });

  it('shows the partly consumed accumulator to a tick that reads alpha', () => {
    const seen: number[] = [];
    const loop = createFixedStepLoop({
      tickRate: 100, // 10 ms steps
      maxTicksPerFrame: 8,
      snapToleranceMs: 0,
      onTick: () => {
        seen.push(Math.round(loop.alpha * 1000) / 1000);
      },
    });
    loop.advance(0);
    loop.advance(35); // 3 ticks, 5 ms left
    expect(seen).toEqual([3.5, 2.5, 1.5]);
    expect(loop.alpha).toBeCloseTo(0.5, 12);
  });

  it('a reset() from inside a tick ends the frame with an empty accumulator', () => {
    let ticks = 0;
    const loop = createFixedStepLoop({
      tickRate: 100,
      maxTicksPerFrame: 8,
      onTick: () => {
        ticks++;
        if (ticks === 1) loop.reset();
      },
    });
    loop.advance(0);
    expect(loop.advance(50)).toBe(1); // the reset drained the accumulator
    expect(loop.alpha).toBe(0);
    expect(loop.advance(60)).toBe(0); // first call after a reset only records the time
    expect(loop.advance(70)).toBe(1);
  });

  it('allocates nothing per frame on a millisecond clock (regression)', () => {
    // Regression: the accumulator and the last timestamp were closure variables; a fractional
    // number stored in one is re-boxed on every assignment (16 B each, every frame).
    let ticks = 0;
    const loop = createFixedStepLoop({
      tickRate: 60,
      maxTicksPerFrame: 4,
      onTick: () => {
        ticks++;
      },
    });
    loop.advance(0);
    let alphaSum = 0;
    const growth = measureHeapGrowth(
      (frame) => {
        // A 1-ms-resolution rAF clock (reduced timer precision): 16/17/17 ms frames.
        loop.advance(Math.floor(((frame + 1) * 1000) / 60));
        alphaSum += loop.alpha > 0.5 ? 1 : 0;
      },
      10_000,
      20_000,
    );
    expect(ticks).toBeGreaterThan(29_000);
    expect(alphaSum).toBeGreaterThanOrEqual(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
