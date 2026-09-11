/**
 * # loop — fixed-timestep driver
 *
 * **Responsibility.** Converts wall-clock frame timestamps (supplied by the host's
 * `requestAnimationFrame`) into a whole number of fixed simulation ticks. The
 * simulation itself only ever counts ticks — it never reads a clock
 * (shmup_feat.md §22 Determinism).
 *
 * Behaviour:
 * - On a 60 Hz display with a 60 Hz tick rate this runs exactly one tick per frame
 *   (frame deltas within ±{@link DEFAULT_SNAP_TOLERANCE_MS} of a whole number of steps
 *   are snapped — "delta snapping" kills rAF jitter).
 * - 120/144 Hz or 50 Hz displays accumulate time; {@link FixedStepLoop.alpha} exposes
 *   the leftover fraction for interpolated rendering.
 * - At most `maxTicksPerFrame` ticks run per frame; excess time is dropped
 *   (anti spiral-of-death).
 * - {@link FixedStepLoop.reset} forgets accumulated time (call on resume — shmup_feat.md §3).
 *
 * **Implements.** shmup_feat.md §3 (60 Hz fixed step, accumulator, snapping, cap,
 * reset on resume), §22 Fixed tick order (the loop calls one `onTick` per step).
 *
 * **Public API.** {@link createFixedStepLoop}, {@link FixedStepLoop},
 * {@link FixedStepLoopOptions}, {@link DEFAULT_SNAP_TOLERANCE_MS}.
 *
 * **Planned API.** refresh-rate probe (median rAF delta at boot), optional deterministic
 * "authentic slowdown" tick skipping (shmup_feat.md §3 [P2]), frame-advance for the
 * debug tools (shmup_feat.md §24).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'loop',
  status: 'partial',
  specRefs: ['shmup_feat.md §3', 'shmup_feat.md §22'],
});

/** Frame deltas this close (ms) to a whole number of steps are snapped to it. */
export const DEFAULT_SNAP_TOLERANCE_MS = 1;

/** Float slack (ms) so accumulated rounding error never swallows a due tick. */
const EPSILON_MS = 1e-6;

/** Options for {@link createFixedStepLoop}. */
export interface FixedStepLoopOptions {
  /** Simulation ticks per second, e.g. 60. */
  readonly tickRate: number;
  /** Maximum ticks per {@link FixedStepLoop.advance} call. */
  readonly maxTicksPerFrame: number;
  /** Called once per simulation tick. Must not allocate. */
  readonly onTick: () => void;
  /** Snap tolerance in ms (defaults to {@link DEFAULT_SNAP_TOLERANCE_MS}). */
  readonly snapToleranceMs?: number;
}

/** A fixed-timestep accumulator driven by frame timestamps. */
export interface FixedStepLoop {
  /** Duration of one tick in ms. */
  readonly stepMs: number;
  /** Fraction (0 ≤ alpha < 1) of a tick left in the accumulator — render interpolation factor. */
  readonly alpha: number;
  /** Total ticks run since creation. */
  readonly totalTicks: number;
  /**
   * Feeds a frame timestamp and runs the due ticks.
   *
   * @param nowMs - Monotonic timestamp in ms (e.g. the rAF callback argument).
   * @returns Number of ticks run during this call.
   */
  advance(nowMs: number): number;
  /** Forgets the previous timestamp and accumulated time (use after pause/resume). */
  reset(): void;
}

/**
 * Creates a {@link FixedStepLoop}.
 *
 * @param options - Tick rate, per-frame cap and tick callback.
 * @returns The loop; call `advance(now)` from the host's frame callback.
 * @throws RangeError for a non-positive tick rate or cap.
 */
export function createFixedStepLoop(options: FixedStepLoopOptions): FixedStepLoop {
  if (!(options.tickRate > 0)) throw new RangeError('tickRate must be > 0');
  if (!(options.maxTicksPerFrame >= 1)) throw new RangeError('maxTicksPerFrame must be >= 1');

  const stepMs = 1000 / options.tickRate;
  const maxTicks = Math.floor(options.maxTicksPerFrame);
  const tolerance = options.snapToleranceMs ?? DEFAULT_SNAP_TOLERANCE_MS;
  const onTick = options.onTick;

  let started = false;
  let lastMs = 0;
  let accumulator = 0;
  let totalTicks = 0;

  return {
    stepMs,
    get alpha() {
      return accumulator / stepMs;
    },
    get totalTicks() {
      return totalTicks;
    },
    advance(nowMs: number): number {
      if (!started) {
        started = true;
        lastMs = nowMs;
        return 0;
      }
      let delta = nowMs - lastMs;
      lastMs = nowMs;
      if (delta <= 0) return 0;

      // Delta snapping: a frame that is "about" k steps long counts as exactly k steps.
      const steps = Math.round(delta / stepMs);
      if (steps >= 1 && Math.abs(delta - steps * stepMs) <= tolerance) {
        delta = steps * stepMs;
      }

      accumulator += delta;
      let ran = 0;
      while (accumulator + EPSILON_MS >= stepMs && ran < maxTicks) {
        onTick();
        accumulator -= stepMs;
        ran++;
      }
      if (accumulator < 0) accumulator = 0;
      // Spiral-of-death guard: drop time we could not simulate this frame.
      if (accumulator + EPSILON_MS >= stepMs) accumulator = accumulator % stepMs;
      totalTicks += ran;
      return ran;
    },
    reset(): void {
      started = false;
      accumulator = 0;
    },
  };
}
