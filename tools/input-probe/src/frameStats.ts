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
 */
export class FrameStats {
  /** Ring capacity (number of deltas kept). */
  readonly capacity: number;
  private readonly ring: Float64Array;
  private readonly scratch: Float64Array;
  private head = 0;
  private count = 0;
  private hitches = 0;
  private worst = 0;
  private pauses = 0;
  private frames = 0;

  /** @param capacity - deltas kept for the stats window and graph (default 600 = 10 s at 60 Hz). */
  constructor(capacity = 600) {
    this.capacity = capacity;
    this.ring = new Float64Array(capacity);
    this.scratch = new Float64Array(capacity);
  }

  /** Records one frame delta in ms. Deltas above {@link PAUSE_MS} only increment the pause counter. */
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
   * Returns the i-th most recent delta (0 = newest), or NaN if not available. Allocation-free; used by
   * the frame-time graph.
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

  /** Computes median / p95 / max over the stored window. */
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
 * @param sorted - ascending values (non-empty).
 * @param p - percentile in [0, 1].
 */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const rank = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sorted[rank] as number;
}

/** Summary of a {@link RunningStats}. */
export interface RunningSummary {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

/** Count / sum / min / max accumulator (e.g. event dispatch delay). */
export class RunningStats {
  private n = 0;
  private sum = 0;
  private lo = Infinity;
  private hi = -Infinity;

  /** Adds a sample; non-finite values are ignored. */
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

  /** Current summary (nulls when empty). */
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
 */
export function chooseEventTime(eventTimeStamp: number, now: number): { t: number; delay: number } {
  if (Number.isFinite(eventTimeStamp) && eventTimeStamp > 0 && eventTimeStamp <= now + 5 && now - eventTimeStamp < 5000) {
    return { t: eventTimeStamp, delay: now - eventTimeStamp };
  }
  return { t: now, delay: NaN };
}
