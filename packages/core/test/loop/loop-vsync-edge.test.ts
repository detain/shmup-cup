/**
 * Edge cases of the vsync lock (plan M3-02b, `core/loop` {@link FixedStepLoop.setVsyncLock}), next
 * to `loop-vsync.test.ts`: the two-step threshold counts *covered* time (the frame's delta plus the
 * debt carried from earlier frames), the debt is clamped in both directions, delta snapping still
 * runs before the lock, `maxTicksPerFrame` caps it, switching the lock throws the debt away, and a
 * display that is not quite 60 Hz keeps the tick count on real time without ever bursting.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAP_TOLERANCE_MS,
  VSYNC_DROP_STEPS,
  createFixedStepLoop,
  type FixedStepLoop,
} from '../../src/loop/index.js';

/** One 60 Hz step in ms. */
const STEP = 1000 / 60;

/** A loop, its tick counter and a clock that keeps running between calls. */
interface Harness {
  readonly loop: FixedStepLoop;
  readonly counter: { ticks: number };
  /**
   * Feeds more deltas from where the clock stands (the harness's first frame only recorded it).
   * A property, not a method, so a test may destructure it.
   *
   * @param deltas - Deltas in ms.
   * @returns Ticks run per frame.
   */
  readonly more: (deltas: readonly number[]) => number[];
}

/**
 * A 60 Hz loop with the vsync lock on.
 *
 * @param maxTicksPerFrame - Per-frame cap (default 4).
 * @param snapToleranceMs - Snap tolerance (default the module's).
 * @returns The harness.
 */
function locked(maxTicksPerFrame = 4, snapToleranceMs?: number): Harness {
  const counter = { ticks: 0 };
  const loop = createFixedStepLoop({
    tickRate: 60,
    maxTicksPerFrame,
    vsyncLock: true,
    snapToleranceMs,
    onTick: () => {
      counter.ticks++;
    },
  });
  const clock = new Float64Array(1);
  clock[0] = 10_000;
  loop.advance(clock[0]);
  return {
    loop,
    counter,
    more: (deltas) => {
      const out: number[] = [];
      for (const delta of deltas) {
        clock[0] += delta;
        out.push(loop.advance(clock[0]));
      }
      return out;
    },
  };
}

/**
 * Feeds deltas after a first frame that only records the clock.
 *
 * @param loop - The loop.
 * @param deltas - Deltas in ms.
 * @param start - First timestamp (default 10 000).
 * @returns Ticks run per frame.
 */
function feed(loop: FixedStepLoop, deltas: readonly number[], start = 10_000): number[] {
  let t = start;
  loop.advance(t);
  const out: number[] = [];
  for (const delta of deltas) {
    t += delta;
    out.push(loop.advance(t));
  }
  return out;
}

describe('core/loop vsync lock: the two-step threshold', () => {
  it('counts covered time, not the raw delta', () => {
    // A frame of 1.8 steps is not a dropped frame on its own: the short frames beside it pay for
    // it. A raw-delta rule would have double-ticked on it (~5 % of the M7's frames).
    const { more } = locked();
    expect(more([1.8 * STEP])).toEqual([1]);
    // It left +0.8 steps of debt, so a second one really does cover two steps.
    expect(more([1.8 * STEP])).toEqual([2]);
    // …and a short frame beside it pays the debt back instead, with no second tick anywhere.
    const paired = locked();
    expect(paired.more([1.8 * STEP, 0.2 * STEP, 1.8 * STEP, 0.2 * STEP])).toEqual([1, 1, 1, 1]);
  });

  it('runs the second tick exactly at VSYNC_DROP_STEPS of covered time, not a hair earlier', () => {
    expect(VSYNC_DROP_STEPS).toBe(2);
    // Just short of two steps (and outside the snap tolerance, so it stays as fed): one tick.
    const under = locked();
    expect(feed(under.loop, [VSYNC_DROP_STEPS * STEP - 2 * DEFAULT_SNAP_TOLERANCE_MS])).toEqual([
      1,
    ]);
    // Exactly two steps: two ticks.
    const exact = locked();
    expect(feed(exact.loop, [VSYNC_DROP_STEPS * STEP])).toEqual([2]);
  });

  it('lets the debt of several slightly long frames buy one catch-up tick', () => {
    const { loop, counter } = locked();
    // 19 ms frames on a locked loop: 2.33 ms of debt each, so every ~7th frame covers two steps.
    const ran = feed(loop, new Array(70).fill(19) as number[]);
    expect(ran.filter((n) => n === 0)).toEqual([]);
    expect(ran.filter((n) => n > 2)).toEqual([]);
    const due = (70 * 19) / STEP;
    expect(Math.abs(counter.ticks - due) / due).toBeLessThan(0.02);
  });

  it('never runs a second tick when the frame cap is one', () => {
    const { loop } = locked(1);
    expect(feed(loop, [10 * STEP, STEP, STEP])).toEqual([1, 1, 1]);
  });
});

describe('core/loop vsync lock: the debt', () => {
  it('is clamped to +1 step after a stall, so nothing bursts afterwards', () => {
    const { loop } = locked();
    const ran = feed(loop, [60_000, STEP, STEP, STEP, STEP, STEP]);
    expect(ran[0]).toBe(2);
    // One step of debt is left: the next frame covers two steps and pays it off, then it is over.
    expect(ran.slice(1)).toEqual([2, 1, 1, 1, 1]);
  });

  it('is clamped to −1 step after a run of very short frames, so nothing is banked', () => {
    const { counter, more } = locked();
    // 200 frames of 1 ms: each still runs its tick, so the simulation runs far ahead of real time.
    more(new Array(200).fill(1) as number[]);
    expect(counter.ticks).toBe(200);
    const after = counter.ticks;
    // Only one step of credit survives, so the loop is back to one tick per frame at once and
    // never skips one (a 0-tick frame is exactly the judder the lock exists to remove).
    const ran = more([STEP, STEP, STEP, STEP]);
    expect(ran).toEqual([1, 1, 1, 1]);
    expect(counter.ticks - after).toBe(4);
  });

  it('is thrown away when the lock is switched, in either direction', () => {
    const { loop } = locked();
    feed(loop, [19, 19, 19]); // some debt piled up
    loop.setVsyncLock(false);
    expect(loop.alpha).toBe(0); // the accumulator was zeroed, not carried over
    loop.setVsyncLock(true);
    // A fresh debt: a 1.8-step frame right after the switch is still only one tick.
    expect(loop.advance(10_000 + 19 * 3 + 1.8 * STEP)).toBe(1);
  });

  it('is thrown away by reset(), and the next frame only records the clock', () => {
    const { loop, counter } = locked();
    feed(loop, [30, 30, 30]);
    const before = counter.ticks;
    loop.reset();
    expect(loop.advance(1_000_000)).toBe(0);
    expect(loop.advance(1_000_000 + 1.8 * STEP)).toBe(1); // no debt survived the reset
    expect(counter.ticks).toBe(before + 1);
  });
});

describe('core/loop vsync lock: interaction with the rest of the loop', () => {
  it('snaps the delta before locking, so a 16 ms frame is a whole step', () => {
    const { loop } = locked();
    // 16.0 ms is within the ±1 ms tolerance of one step: it counts as exactly 16.667 ms, so 60
    // frames of it leave no debt at all and the 61st is still one tick.
    const ran = feed(loop, new Array(60).fill(16) as number[]);
    expect(new Set(ran)).toEqual(new Set([1]));
    expect(loop.advance(10_000 + 60 * 16 + 1.9 * STEP)).toBe(1);
  });

  it('honours a custom snap tolerance', () => {
    // With snapping switched off, 16 ms frames really are short and bank credit — which the −1
    // step clamp caps, so the loop still runs one tick a frame.
    const { loop } = locked(4, 0);
    const ran = feed(loop, new Array(60).fill(16) as number[]);
    expect(new Set(ran)).toEqual(new Set([1]));
  });

  it('keeps alpha at 0 while locked and hands it back when unlocked', () => {
    const { loop } = locked();
    feed(loop, [STEP / 2, STEP / 2, STEP / 2]);
    expect(loop.alpha).toBe(0);
    loop.setVsyncLock(false);
    loop.advance(10_000 + 1.5 * STEP + STEP / 2);
    expect(loop.alpha).toBeGreaterThan(0);
    expect(loop.alpha).toBeLessThan(1);
  });

  it('returns the tick count it ran and adds it to totalTicks', () => {
    const { loop, counter } = locked();
    const ran = feed(loop, [STEP, 2 * STEP, STEP, 0, -5, STEP]);
    expect(ran.reduce((sum, n) => sum + n, 0)).toBe(loop.totalTicks);
    expect(loop.totalTicks).toBe(counter.ticks);
  });

  it('defaults to unlocked, and an explicit `vsyncLock: false` is the same', () => {
    for (const option of [undefined, false] as const) {
      const loop = createFixedStepLoop({
        tickRate: 60,
        maxTicksPerFrame: 4,
        vsyncLock: option,
        onTick: () => {},
      });
      expect(loop.vsyncLock, String(option)).toBe(false);
    }
  });

  it('catches up on a panel slower than 60 Hz, without ever running a 0-tick frame', () => {
    for (const hz of [50, 54, 56]) {
      const { counter, more } = locked();
      const frames = 600;
      const ran = more(new Array(frames).fill(1000 / hz) as number[]);
      expect(
        ran.filter((n) => n === 0),
        `${String(hz)} Hz`,
      ).toEqual([]);
      expect(
        ran.filter((n) => n > 2),
        `${String(hz)} Hz`,
      ).toEqual([]);
      const due = (frames * (1000 / hz)) / STEP;
      expect(Math.abs(counter.ticks - due) / due, `${String(hz)} Hz`).toBeLessThan(0.02);
    }
  });

  it('runs one tick per frame above 60 Hz — which is why the shell stops locking past ~65 Hz', () => {
    // The lock never runs *fewer* than one tick a frame, so a display that is really faster than
    // the tick rate makes the game run fast. `@shmup/shell`'s VSYNC_LOCK_MAX_HZ is what keeps the
    // lock off such a panel; pinned here so the trade-off stays visible.
    for (const hz of [64, 75, 120]) {
      const { counter, more } = locked();
      more(new Array(300).fill(1000 / hz) as number[]);
      expect(counter.ticks, `${String(hz)} Hz`).toBe(300);
    }
  });

  it('treats a panel inside the snap tolerance as exactly 60 Hz — one tick a frame, forever', () => {
    // 58 … 62 Hz is within ±1 ms of a 60 Hz step, so delta snapping turns every frame into one
    // whole step before the lock sees it: no debt, no catch-up tick, no drift in either direction.
    for (const hz of [58, 59, 60, 61, 62]) {
      const { counter, more } = locked();
      const ran = more(new Array(600).fill(1000 / hz) as number[]);
      expect(new Set(ran), `${String(hz)} Hz`).toEqual(new Set([1]));
      expect(counter.ticks, `${String(hz)} Hz`).toBe(600);
    }
  });

  it('runs the same ticks through a jittered 60 Hz trace as through a clean one', () => {
    // Presentation only: the lock must not change how many ticks a second of real time is worth.
    const clean = locked();
    feed(clean.loop, new Array(600).fill(STEP) as number[]);
    const jittery = locked();
    const deltas: number[] = [];
    for (let i = 0; i < 600; i++) deltas.push(i % 2 === 0 ? STEP + 6.4 : STEP - 6.4);
    feed(jittery.loop, deltas);
    expect(jittery.counter.ticks).toBe(clean.counter.ticks);
  });
});
