/**
 * The TV render bench's per-frame **sampler** and its summaries (plan R0-02 — part of the `bench`
 * module, see `./index.ts`).
 *
 * The frame path writes numbers into preallocated typed arrays only ({@link BenchSampler}); the
 * distributions are folded once, after the scenario, by {@link summarizeSeries} — the telemetry's
 * nearest-rank rule `floor(q · (n − 1) + 0.5)`, so the bench's p95 is the same statistic as the
 * render profile's (`packages/shell/src/telemetry`) and the analyzers'.
 *
 * @module
 */
import { RAF_BUCKETS, rafDeltaBucket } from '@shmup/render-pixi';

/** Frames one series stores (20 s at 120 Hz with room to spare); later frames are dropped. */
export const BENCH_MAX_FRAMES = 4096;

/** Ticks-per-frame buckets: 0, 1, 2, 3-or-more. */
export const BENCH_TICK_BUCKETS = 4;

/** Decimals a millisecond figure is rounded to. */
const MS_DIGITS = 3;

/**
 * Rounds to a number of decimals.
 *
 * @param value - The value.
 * @param digits - Decimals.
 * @returns The rounded value (0 for a non-finite one, never `-0`).
 */
export function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  let factor = 1;
  for (let i = 0; i < digits; i++) factor *= 10;
  const out = Math.round(value * factor) / factor;
  return out === 0 ? 0 : out;
}

/**
 * `[min, p50, p95, max]` of the first `count` values (rounded to 3 decimals).
 *
 * @param values - The series.
 * @param count - How many are valid.
 * @returns The four figures; `[0, 0, 0, 0]` for an empty series.
 *
 * @example
 * ```ts
 * summarizeSeries(Float64Array.of(3, 1, 2), 3); // → [1, 2, 3, 3]
 * ```
 */
export function summarizeSeries(values: Float64Array, count: number): number[] {
  const n = count < values.length ? count : values.length;
  if (n <= 0) return [0, 0, 0, 0];
  const sorted = values.slice(0, n).sort();
  /**
   * The value at a quantile.
   *
   * @param q - 0 … 1.
   * @returns The value.
   */
  const at = (q: number): number => sorted[Math.min(n - 1, Math.floor(q * (n - 1) + 0.5))];
  return [
    roundTo(sorted[0], MS_DIGITS),
    roundTo(at(0.5), MS_DIGITS),
    roundTo(at(0.95), MS_DIGITS),
    roundTo(sorted[n - 1], MS_DIGITS),
  ];
}

/** One series of per-frame values in a preallocated array. */
export class BenchSeries {
  /** The values (only `[0, count)` are valid). */
  readonly values: Float64Array;
  /** Values stored. */
  count = 0;

  /**
   * A series.
   *
   * @param capacity - Most values it stores (default {@link BENCH_MAX_FRAMES}).
   */
  constructor(capacity = BENCH_MAX_FRAMES) {
    this.values = new Float64Array(capacity);
  }

  /**
   * Stores one value (dropped when the series is full). Never allocates.
   *
   * @param value - The value.
   */
  push(value: number): void {
    if (this.count < this.values.length) this.values[this.count++] = value;
  }

  /**
   * The series' distribution.
   *
   * @returns `[min, p50, p95, max]`.
   */
  summary(): number[] {
    return summarizeSeries(this.values, this.count);
  }
}

/**
 * Everything a scenario samples per frame: the free-running render times, rAF deltas, ticks per
 * frame and rAF buckets, and the synced pass's render times.
 *
 * @example
 * ```ts
 * const sampler = new BenchSampler();
 * sampler.free(1.2, 16.7, 1);   // a free-running frame
 * sampler.synced(4.5);          // a gl.finish()-synced frame
 * sampler.twoTickShare();       // → 0
 * ```
 */
export class BenchSampler {
  /** Render CPU ms of the free-running frames. */
  readonly render = new BenchSeries();
  /** Render + `gl.finish()` ms of the synced frames. */
  readonly sync = new BenchSeries();
  /** rAF deltas of the free-running frames. */
  readonly frame = new BenchSeries();
  /** Free-running frames per rAF-delta bucket (`RAF_BUCKET_EDGES_MS`). */
  readonly raf = new Int32Array(RAF_BUCKETS);
  /** Free-running frames that ran 0 / 1 / 2 / 3-or-more ticks. */
  readonly ticks = new Int32Array(BENCH_TICK_BUCKETS);

  /**
   * Records one free-running frame. Never allocates.
   *
   * @param renderMs - Its render time.
   * @param deltaMs - Its rAF delta (≤ 0 = none yet: not counted in the frame series or buckets).
   * @param ticks - Fixed ticks it ran.
   */
  free(renderMs: number, deltaMs: number, ticks: number): void {
    this.render.push(renderMs);
    if (deltaMs > 0) {
      this.frame.push(deltaMs);
      this.raf[rafDeltaBucket(deltaMs)]++;
    }
    this.ticks[ticks < 0 ? 0 : ticks > 3 ? 3 : ticks]++;
  }

  /**
   * Records one synced frame. Never allocates.
   *
   * @param syncedMs - Its render + `gl.finish()` time.
   */
  synced(syncedMs: number): void {
    this.sync.push(syncedMs);
  }

  /** Free-running frames recorded. */
  get frames(): number {
    return this.render.count;
  }

  /**
   * Share of the free-running frames that ran two ticks or more.
   *
   * @returns 0 … 1 (0 with no frames).
   */
  twoTickShare(): number {
    let total = 0;
    for (let i = 0; i < this.ticks.length; i++) total += this.ticks[i];
    return total === 0 ? 0 : roundTo((this.ticks[2] + this.ticks[3]) / total, 4);
  }
}
