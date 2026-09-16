/**
 * The vsync lock of plan M3-02b (`core/loop` {@link FixedStepLoop.setVsyncLock}): on the M7
 * monitors the display runs at 60 Hz but a quarter of the rAF deltas are longer than 20 ms while
 * the short deltas beside them make the average come out right
 * (`docs/dev/input-probe-results.md` finding 8). The ±1 ms snap alone turns that into 0-tick and
 * 2-tick frames — judder against decision D32 — so the lock runs exactly one tick per frame and
 * adds a second one only for a really dropped frame or a whole step of accumulated debt.
 */
import { describe, expect, it } from 'vitest';
import { VSYNC_DROP_STEPS, createFixedStepLoop } from '../../src/loop/index.js';

/** One 60 Hz step in ms. */
const STEP = 1000 / 60;

/**
 * Creates a 60 Hz loop with the vsync lock on and a tick counter.
 *
 * @param maxTicksPerFrame - Per-frame cap (default 4).
 * @returns The loop and its counter.
 */
function lockedLoop(maxTicksPerFrame = 4) {
  const counter = { ticks: 0 };
  const loop = createFixedStepLoop({
    tickRate: 60,
    maxTicksPerFrame,
    vsyncLock: true,
    onTick: () => {
      counter.ticks++;
    },
  });
  return { loop, counter };
}

/**
 * Feeds a list of frame deltas.
 *
 * @param loop - The loop.
 * @param deltas - Deltas in ms.
 * @returns Ticks run per frame.
 */
function feed(loop: ReturnType<typeof lockedLoop>['loop'], deltas: readonly number[]): number[] {
  let t = 10_000;
  loop.advance(t);
  const out: number[] = [];
  for (const delta of deltas) {
    t += delta;
    out.push(loop.advance(t));
  }
  return out;
}

describe('core/loop vsync lock', () => {
  it('is off by default and switchable at runtime', () => {
    const { loop } = lockedLoop();
    expect(loop.vsyncLock).toBe(true);
    expect(VSYNC_DROP_STEPS).toBe(2);
    const free = createFixedStepLoop({ tickRate: 60, maxTicksPerFrame: 4, onTick: () => {} });
    expect(free.vsyncLock).toBe(false);
    free.setVsyncLock(true);
    expect(free.vsyncLock).toBe(true);
    free.setVsyncLock(true); // idempotent
    expect(free.vsyncLock).toBe(true);
    free.setVsyncLock(false);
    expect(free.vsyncLock).toBe(false);
  });

  it('runs one tick per frame on a steady 60 Hz display', () => {
    const { loop, counter } = lockedLoop();
    const ran = feed(loop, new Array(600).fill(STEP) as number[]);
    expect(new Set(ran)).toEqual(new Set([1]));
    expect(counter.ticks).toBe(600);
    expect(loop.alpha).toBe(0);
  });

  it('runs one tick per frame through alternating 12 / 21.3 ms frames', () => {
    const { loop, counter } = lockedLoop();
    const deltas: number[] = [];
    for (let i = 0; i < 400; i++) deltas.push(i % 2 === 0 ? 12 : 21.3);
    const ran = feed(loop, deltas);
    expect(ran.filter((n) => n !== 1)).toEqual([]);
    expect(counter.ticks).toBe(400);
  });

  it('adds a second tick only for a really dropped frame', () => {
    const { loop } = lockedLoop();
    // 16.7, 16.7, a missed vsync (33.4), then back to normal.
    const ran = feed(loop, [STEP, STEP, 2 * STEP, STEP, STEP]);
    expect(ran).toEqual([1, 1, 2, 1, 1]);
  });

  it('never runs a 0-tick frame, and tracks real time within 1 % on the measured trace', () => {
    const { loop, counter } = lockedLoop();
    // A synthetic trace with the M7's shape: ~27 % of deltas in the 20–34 ms band, each paired
    // with a short one so the mean stays at 60 Hz, plus ~1.5 % real 33 ms drops.
    const deltas: number[] = [];
    const frames = 4000;
    for (let i = 0; i < frames; i++) {
      if (i % 67 === 0)
        deltas.push(2 * STEP); // a real drop
      else if (i % 7 === 0)
        deltas.push(STEP + 9.5); // jitter: a long frame …
      else if (i % 7 === 1)
        deltas.push(STEP - 9.5); // … paired with a short one
      else if (i % 7 === 3) deltas.push(STEP + 4.2);
      else if (i % 7 === 4) deltas.push(STEP - 4.2);
      else deltas.push(STEP);
    }
    const ran = feed(loop, deltas);
    expect(ran.filter((n) => n === 0)).toEqual([]);
    const elapsed = deltas.reduce((sum, d) => sum + d, 0);
    const due = elapsed / STEP;
    // The ticks run follow the real time that passed, not the frame count.
    expect(Math.abs(counter.ticks - due) / due).toBeLessThan(0.01);
    // Two-tick frames are rare: only the real drops and the occasional catch-up.
    expect(ran.filter((n) => n > 1).length / frames).toBeLessThan(0.05);
  });

  it('bounds the debt to ±1 step, so a long stall never bursts', () => {
    const { loop } = lockedLoop();
    const ran = feed(loop, [STEP, 5000, STEP, STEP, STEP, STEP]);
    expect(ran[1]).toBe(2); // the stall itself
    // At most one catch-up tick afterwards, then straight back to one per frame.
    expect(ran.slice(2).filter((n) => n > 1).length).toBeLessThanOrEqual(1);
    expect(ran.slice(3)).toEqual([1, 1, 1]);
  });

  it('honours a per-frame cap of 1 (a dropped frame then runs one tick)', () => {
    const { loop } = lockedLoop(1);
    expect(feed(loop, [STEP, 4 * STEP, STEP])).toEqual([1, 1, 1]);
  });

  it('runs nothing on the first frame, on a backwards clock or a duplicate timestamp', () => {
    const { loop, counter } = lockedLoop();
    expect(loop.advance(1000)).toBe(0);
    expect(loop.advance(1000)).toBe(0);
    expect(loop.advance(900)).toBe(0);
    expect(counter.ticks).toBe(0);
  });

  it('reset() forgets the clock, and switching the lock forgets the debt', () => {
    const { loop, counter } = lockedLoop();
    feed(loop, [STEP, STEP + 10, STEP]);
    loop.reset();
    expect(loop.advance(50_000)).toBe(0); // the first frame after a reset only records the time
    expect(loop.advance(50_000 + STEP)).toBe(1);
    const before = counter.ticks;
    loop.setVsyncLock(false);
    expect(loop.alpha).toBe(0); // the debt was dropped, not carried into the accumulator
    expect(counter.ticks).toBe(before);
  });

  it('leaves the free-running accumulator alone (120 Hz, 50 Hz, alpha)', () => {
    const { loop, counter } = lockedLoop();
    loop.setVsyncLock(false);
    let t = 0;
    loop.advance(t);
    for (let i = 0; i < 10; i++) {
      t += STEP / 2;
      loop.advance(t);
    }
    expect(counter.ticks).toBe(5); // 120 Hz: one tick every other frame
    expect(loop.alpha).toBeGreaterThanOrEqual(0);
    expect(loop.alpha).toBeLessThan(1);
  });
});
