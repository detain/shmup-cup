/**
 * # frame-loop — `requestAnimationFrame` driver
 *
 * **Responsibility.** Calls `onFrame(now)` once per display refresh with the rAF timestamp.
 * The core's fixed-step loop turns those timestamps into simulation ticks (on the 60 Hz M7
 * monitors exactly one tick per frame — the loop snaps rAF jitter), so this module stays
 * trivial: no timing logic, no allocation per frame. Shared by the web and TV hosts (it
 * used to live, twice, in `apps/web` and `apps/tizen`).
 *
 * **Refresh probe (M2-08).** {@link createRefreshMonitor} estimates the display's refresh rate
 * from the recent rAF deltas — the mean of their middle half, so hitches and jitter do not sway it
 * (shmup_feat.md §3 "refresh rate probed at boot"); the
 * shell turns render interpolation on while it reads above {@link INTERPOLATION_MIN_HZ} — more than
 * one displayed frame per 60 Hz tick — and off at 60 Hz, where it would only add a tick of lag.
 *
 * **Implements.** shmup_feat.md §3 (rAF-driven fixed step; refresh rate probed from the recent
 * rAF deltas; interpolated render on 120/144 Hz displays), shmup_tech.md §2.7 (60 Hz fixed, one
 * tick per rAF).
 *
 * **Public API.** {@link startFrameLoop}, {@link FrameLoop}, {@link FrameScheduler},
 * {@link createRefreshMonitor}, {@link RefreshMonitor}, {@link REFRESH_SAMPLES},
 * {@link INTERPOLATION_MIN_HZ}.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'frame-loop',
  status: 'implemented',
  specRefs: ['shmup_feat.md §3', 'shmup_tech.md §2.7'],
});

/** The two rAF functions (a `Window` satisfies this; tests pass fakes). */
export interface FrameScheduler {
  /**
   * Schedules `callback` for the next display refresh.
   *
   * @param callback - Receives the frame timestamp in ms (`performance.now()` clock).
   * @returns A handle for {@link FrameScheduler.cancelAnimationFrame}.
   */
  requestAnimationFrame(callback: (now: number) => void): number;
  /**
   * Cancels a pending callback.
   *
   * @param handle - Value returned by {@link FrameScheduler.requestAnimationFrame}.
   */
  cancelAnimationFrame(handle: number): void;
}

/** A running frame loop. */
export interface FrameLoop {
  /** Stops the loop (no further callbacks). */
  stop(): void;
}

/**
 * Starts calling `onFrame` every animation frame.
 *
 * @remarks
 * The next frame is requested *before* `onFrame` runs, so an exception in `onFrame`
 * does not kill the loop (it is reported by the browser and the next frame still
 * comes). The first callback arrives on the next refresh, not synchronously.
 *
 * @param scheduler - Normally `window`.
 * @param onFrame - Receives the rAF timestamp in ms.
 * @returns A handle to stop the loop.
 *
 * @example
 * ```ts
 * const loop = startFrameLoop(window, (now) => {
 *   game.frame(now);
 *   renderer.render(game.renderFrame());
 * });
 * // later:
 * loop.stop();
 * ```
 */
export function startFrameLoop(
  scheduler: FrameScheduler,
  onFrame: (now: number) => void,
): FrameLoop {
  let handle = 0;
  let running = true;
  /**
   * rAF callback: re-arms itself, then forwards the timestamp.
   *
   * @param now - Frame timestamp in ms.
   */
  const tick = (now: number): void => {
    if (!running) return;
    handle = scheduler.requestAnimationFrame(tick);
    onFrame(now);
  };
  handle = scheduler.requestAnimationFrame(tick);
  return {
    stop() {
      running = false;
      scheduler.cancelAnimationFrame(handle);
    },
  };
}

/** Recent rAF deltas the refresh probe keeps. */
export const REFRESH_SAMPLES = 31;

/**
 * Refresh rate (Hz) above which the display shows more than one frame per 60 Hz tick and render
 * interpolation pays off (75 Hz monitors included; 60 Hz with jitter stays below it).
 */
export const INTERPOLATION_MIN_HZ = 70;

/** Longest rAF delta (ms) the probe counts: longer gaps are hitches or a hidden page. */
const MAX_SAMPLE_MS = 250;

/** Samples between two estimates. */
const MEDIAN_EVERY = 15;

/** An estimate of the display's refresh rate from rAF timestamps. */
export interface RefreshMonitor {
  /** Whether enough deltas were seen for {@link RefreshMonitor.hz} to mean anything. */
  readonly ready: boolean;
  /**
   * The estimated refresh rate in Hz: `1000 /` the mean of the middle half of the recent deltas
   * (0 until ready).
   */
  readonly hz: number;
  /**
   * Feeds one rAF timestamp. Never allocates.
   *
   * @remarks
   * The first timestamp (and the first after {@link RefreshMonitor.reset}) only starts the clock;
   * deltas ≤ 0 or above 250 ms are ignored. The estimate over the last {@link REFRESH_SAMPLES}
   * deltas (sorted by an insertion sort into a preallocated array; the quarter at each end
   * dropped, the rest averaged) is recomputed every 15 samples.
   *
   * @param now - The rAF timestamp in ms.
   */
  sample(now: number): void;
  /** Forgets the samples (a resume after the page was hidden). */
  reset(): void;
}

/**
 * Creates a refresh-rate probe (plan M2-08).
 *
 * @param samples - Deltas kept (default {@link REFRESH_SAMPLES}; floored, at least 1 — NaN counts
 *   as 1).
 * @returns The monitor (not ready until `samples` deltas were seen).
 *
 * @example
 * ```ts
 * const refresh = createRefreshMonitor();
 * startFrameLoop(window, (now) => {
 *   refresh.sample(now);
 *   if (refresh.ready) renderer.setInterpolation(refresh.hz > INTERPOLATION_MIN_HZ);
 * });
 * ```
 */
export function createRefreshMonitor(samples: number = REFRESH_SAMPLES): RefreshMonitor {
  // At least one sample: `Math.max(1, NaN)` would be NaN (an empty ring that is never ready).
  const whole = Math.floor(samples);
  return new RefreshMonitorImpl(whole >= 1 ? whole : 1);
}

/**
 * The {@link RefreshMonitor} behind {@link createRefreshMonitor}: a class, so `ready` and `hz` are
 * plain fields the shell reads every frame — a getter returning the fractional rate boxed it, an
 * allocation per frame (docs/dev/conventions.md: "a fractional value … read every frame is a field
 * updated when it changes, not a getter").
 */
class RefreshMonitorImpl implements RefreshMonitor {
  /** See {@link RefreshMonitor.ready}. */
  ready = false;
  /** See {@link RefreshMonitor.hz} (0 until ready). */
  hz = 0;
  /** The recent deltas (a ring). */
  private readonly ring: Float64Array;
  /** Scratch for the sorted deltas. */
  private readonly sorted: Float64Array;
  /** The last timestamp (a typed array: fractional, written every frame). */
  private readonly last = new Float64Array(1);
  /** Whether a first timestamp started the clock. */
  private started = false;
  /** Deltas in the ring (up to its size). */
  private count = 0;
  /** Next ring slot. */
  private cursor = 0;
  /** Deltas since the last estimate. */
  private sinceEstimate = 0;

  /**
   * Creates the monitor.
   *
   * @param size - Deltas kept (a positive integer).
   */
  constructor(private readonly size: number) {
    this.ring = new Float64Array(size);
    this.sorted = new Float64Array(size);
  }

  /**
   * See {@link RefreshMonitor.sample}.
   *
   * @param now - The rAF timestamp in ms.
   */
  sample(now: number): void {
    if (!this.started) {
      this.started = true;
      this.last[0] = now;
      return;
    }
    const delta = now - this.last[0];
    this.last[0] = now;
    if (!(delta > 0) || delta > MAX_SAMPLE_MS) return;
    const size = this.size;
    this.ring[this.cursor] = delta;
    this.cursor = this.cursor + 1 < size ? this.cursor + 1 : 0;
    if (this.count < size) this.count++;
    this.sinceEstimate++;
    if (
      this.count === size &&
      (this.sinceEstimate >= MEDIAN_EVERY || this.sinceEstimate === size)
    ) {
      this.sinceEstimate = 0;
      this.estimate();
      this.ready = true;
    }
  }

  /** See {@link RefreshMonitor.reset}. */
  reset(): void {
    this.started = false;
    this.count = 0;
    this.cursor = 0;
    this.sinceEstimate = 0;
    this.ready = false;
    this.hz = 0;
  }

  /** Recomputes the estimate (the interquartile mean of the ring) into {@link hz}. */
  private estimate(): void {
    const ring = this.ring;
    const sorted = this.sorted;
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const value = ring[i];
      let j = i - 1;
      while (j >= 0 && sorted[j] > value) {
        sorted[j + 1] = sorted[j];
        j--;
      }
      sorted[j + 1] = value;
    }
    // The middle half: drop the shortest and longest quarter (hitches, stray early frames).
    const from = n >> 2;
    const to = n - from;
    let sum = 0;
    for (let i = from; i < to; i++) sum += sorted[i];
    const mean = sum / (to - from);
    this.hz = mean > 0 ? 1000 / mean : 0;
  }
}
