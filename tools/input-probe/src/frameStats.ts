/**
 * Frame-time statistics (rAF deltas) and simple running statistics.
 *
 * Pure module: callers pass in the measured values. {@link FrameStats.push} is allocation-free so it can
 * run every frame; {@link FrameStats.summary} sorts into a preallocated scratch buffer and is meant for the
 * ~10 Hz UI refresh.
 *
 * @module frameStats
 */

/** Frame deltas above this are counted as hitches (spec question 8). */
export const HITCH_MS = 20;

/** Deltas above this are treated as pauses (tab hidden, debugger) and excluded from the stats. */
export const PAUSE_MS = 500;

/** Summary of recent frame times. */
export interface FrameSummary {
  /** Number of deltas in the stats window. */
  samples: number;
  /** Median delta (ms), or null when empty. */
  medianMs: number | null;
  /** 1000 / median. */
  medianHz: number | null;
  /** 95th-percentile delta (ms). */
  p95Ms: number | null;
  /** Largest delta in the window (ms). */
  maxMs: number | null;
  /** Hitches (> {@link HITCH_MS}) since the last reset. */
  hitches: number;
  /** Largest delta since the last reset, excluding pauses (ms). */
  worstMs: number;
  /** Deltas above {@link PAUSE_MS} since the last reset. */
  pauses: number;
  /** Total frames measured since the last reset. */
  frames: number;
}

/**
 * Ring buffer of the most recent frame deltas plus hitch counters.
 *
 * @example
 * ```ts
 * const fs = new FrameStats();
 * fs.push(16.7);
 * fs.push(16.6);
 * fs.push(33.4);   // a hitch (> 20 ms)
 * fs.push(2000);   // app was hidden: counted as a pause, not stored
 * const s = fs.summary(); // { samples: 3, medianMs: 16.7, hitches: 1, pauses: 1, ... }
 * ```
 */
export class FrameStats {
  /** Ring capacity (number of deltas kept). */
  readonly capacity: number;
  /** Stored deltas (ring buffer). */
  private readonly ring: Float64Array;
  /** Preallocated sort buffer for {@link FrameStats.summary}. */
  private readonly scratch: Float64Array;
  /** Next ring slot to write. */
  private head = 0;
  /** Deltas stored (saturates at `capacity`). */
  private count = 0;
  /** Deltas above {@link HITCH_MS} since the last counter reset. */
  private hitches = 0;
  /** Largest stored delta since the last counter reset. */
  private worst = 0;
  /** Deltas above {@link PAUSE_MS} since the last counter reset. */
  private pauses = 0;
  /** Deltas stored since the last counter reset. */
  private frames = 0;

  /** @param capacity - deltas kept for the stats window and graph (default 600 = 10 s at 60 Hz). */
  constructor(capacity = 600) {
    this.capacity = capacity;
    this.ring = new Float64Array(capacity);
    this.scratch = new Float64Array(capacity);
  }

  /**
   * Records one frame delta. Allocation-free.
   *
   * @param deltaMs - time since the previous rAF callback, in ms. Negative / NaN values are ignored; values
   *   above {@link PAUSE_MS} only increment the pause counter.
   */
  push(deltaMs: number): void {
    if (!(deltaMs >= 0)) return;
    if (deltaMs > PAUSE_MS) {
      this.pauses++;
      return;
    }
    this.ring[this.head] = deltaMs;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    this.frames++;
    if (deltaMs > HITCH_MS) this.hitches++;
    if (deltaMs > this.worst) this.worst = deltaMs;
  }

  /** Number of deltas currently stored. */
  get length(): number {
    return this.count;
  }

  /**
   * Reads the ring by age. Allocation-free; used by the frame-time graph.
   *
   * @param i - age (0 = newest delta).
   * @returns the i-th most recent delta in ms, or NaN if not available.
   */
  recent(i: number): number {
    if (i < 0 || i >= this.count) return NaN;
    let idx = this.head - 1 - i;
    if (idx < 0) idx += this.capacity;
    return this.ring[idx] as number;
  }

  /** Clears hitch / worst / pause counters (the delta window is kept). */
  resetCounters(): void {
    this.hitches = 0;
    this.worst = 0;
    this.pauses = 0;
    this.frames = 0;
  }

  /**
   * Computes median / p95 / max over the stored window.
   *
   * @returns a fresh {@link FrameSummary}; the statistics are null when nothing is stored yet.
   *
   * @remarks
   * Sorts a copy of the window into the preallocated scratch buffer (O(n log n), n ≤ capacity), so call it
   * at UI rate, not per frame. Percentiles use the nearest-rank method ({@link percentileSorted}).
   */
  summary(): FrameSummary {
    const n = this.count;
    const base = { hitches: this.hitches, worstMs: this.worst, pauses: this.pauses, frames: this.frames };
    if (n === 0) {
      return { samples: 0, medianMs: null, medianHz: null, p95Ms: null, maxMs: null, ...base };
    }
    const s = this.scratch.subarray(0, n);
    for (let i = 0; i < n; i++) s[i] = this.ring[i] as number;
    s.sort();
    const median = percentileSorted(s, 0.5);
    return {
      samples: n,
      medianMs: median,
      medianHz: median > 0 ? 1000 / median : null,
      p95Ms: percentileSorted(s, 0.95),
      maxMs: s[n - 1] as number,
      ...base,
    };
  }
}

/**
 * Nearest-rank percentile of an ascending-sorted array.
 *
 * @param sorted - ascending values.
 * @param p - percentile in [0, 1].
 * @returns the value at rank `ceil(p·n)` (1-based, clamped to the array), or NaN for an empty array.
 *
 * @example
 * ```ts
 * percentileSorted([10, 20, 30, 40], 0.5);  // 20
 * percentileSorted([10, 20, 30, 40], 0.95); // 40
 * ```
 */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const rank = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sorted[rank] as number;
}

/** Summary of a {@link RunningStats}. */
export interface RunningSummary {
  /** Number of samples. */
  count: number;
  /** Mean, or null when empty. */
  avg: number | null;
  /** Smallest sample, or null when empty. */
  min: number | null;
  /** Largest sample, or null when empty. */
  max: number | null;
}

/**
 * Count / sum / min / max accumulator (e.g. event dispatch delay). Constant memory, allocation-free `add`.
 *
 * @example
 * ```ts
 * const rs = new RunningStats();
 * rs.add(1); rs.add(3); rs.add(NaN);
 * rs.summary(); // { count: 2, avg: 2, min: 1, max: 3 }
 * ```
 */
export class RunningStats {
  /** Sample count. */
  private n = 0;
  /** Sample sum. */
  private sum = 0;
  /** Minimum so far. */
  private lo = Infinity;
  /** Maximum so far. */
  private hi = -Infinity;

  /**
   * Adds a sample.
   *
   * @param v - the value; non-finite values are ignored.
   */
  add(v: number): void {
    if (!Number.isFinite(v)) return;
    this.n++;
    this.sum += v;
    if (v < this.lo) this.lo = v;
    if (v > this.hi) this.hi = v;
  }

  /** Clears all samples. */
  reset(): void {
    this.n = 0;
    this.sum = 0;
    this.lo = Infinity;
    this.hi = -Infinity;
  }

  /**
   * Summarizes the samples.
   *
   * @returns count / avg / min / max (nulls when empty).
   */
  summary(): RunningSummary {
    if (this.n === 0) return { count: 0, avg: null, min: null, max: null };
    return { count: this.n, avg: this.sum / this.n, min: this.lo, max: this.hi };
  }
}

/**
 * Picks the timestamp to use for a DOM event: its `timeStamp` when it is a plausible high-resolution
 * value on the `performance.now()` clock, otherwise `now`.
 *
 * @param eventTimeStamp - `event.timeStamp`.
 * @param now - `performance.now()` at handler time.
 * @returns `{ t, delay }` where `delay` is `now - t` (NaN when the event timestamp was unusable).
 *
 * @remarks
 * "Plausible" = finite, positive, at most 5 ms in the future and less than 5 s in the past. Older engines
 * (and some embedded runtimes) report `event.timeStamp` as epoch milliseconds or 0; those fall back to `now`
 * and are excluded from the dispatch-delay statistics.
 *
 * @example
 * ```ts
 * chooseEventTime(1000, 1003);          // { t: 1000, delay: 3 }
 * chooseEventTime(1.7e12, 1003);        // { t: 1003, delay: NaN } (epoch timestamp)
 * ```
 */
export function chooseEventTime(eventTimeStamp: number, now: number): { t: number; delay: number } {
  if (Number.isFinite(eventTimeStamp) && eventTimeStamp > 0 && eventTimeStamp <= now + 5 && now - eventTimeStamp < 5000) {
    return { t: eventTimeStamp, delay: now - eventTimeStamp };
  }
  return { t: now, delay: NaN };
}
