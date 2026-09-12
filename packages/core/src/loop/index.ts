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
 * "authentic slowdown" tick skipping (shmup_feat.md §3 [P2]). The debug tools' frame advance and
 * slow motion (shmup_feat.md §24, M1-19) live in `Game.frame` (`core/game`), which resets this
 * loop when they switch and feeds it a slowed clock.
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
 * @remarks
 * The first `advance()` call (and the first after `reset()`) only records the
 * timestamp and runs no tick. Non-positive deltas (clock went backwards, duplicate
 * timestamp) run nothing. `maxTicksPerFrame` is floored. `advance()`, `alpha` and `reset()`
 * never allocate: the fractional last timestamp and accumulator live in a `Float64Array`
 * rather than in closure variables, which V8 would re-box on every assignment (M1-06).
 *
 * @param options - Tick rate, per-frame cap and tick callback.
 * @returns The loop; call `advance(now)` from the host's frame callback.
 * @throws RangeError when `tickRate` is not > 0 or `maxTicksPerFrame` is < 1.
 *
 * @example
 * ```ts
 * const loop = createFixedStepLoop({ tickRate: 60, maxTicksPerFrame: 4, onTick: step });
 * const frame = (now: number): void => {
 *   loop.advance(now); // 0..4 calls to step()
 *   render(loop.alpha); // interpolate by the leftover fraction
 *   requestAnimationFrame(frame);
 * };
 * requestAnimationFrame(frame);
 * ```
 */
export function createFixedStepLoop(options: FixedStepLoopOptions): FixedStepLoop {
  if (!(options.tickRate > 0)) throw new RangeError('tickRate must be > 0');
  if (!(options.maxTicksPerFrame >= 1)) throw new RangeError('maxTicksPerFrame must be >= 1');

  const stepMs = 1000 / options.tickRate;
  const maxTicks = Math.floor(options.maxTicksPerFrame);
  const tolerance = options.snapToleranceMs ?? DEFAULT_SNAP_TOLERANCE_MS;
  const onTick = options.onTick;

  let started = false;
  let totalTicks = 0;
  // The fractional times live in a typed array, not in closure variables: a closure variable
  // holding a non-integer number is a heap-allocated box, re-created on every assignment — two
  // allocations per frame on a real rAF clock. Typed-array slots are stored in place.
  const time = new Float64Array(2);
  const LAST = 0;
  const ACCUMULATOR = 1;

  return {
    stepMs,
    get alpha() {
      return time[ACCUMULATOR] / stepMs;
    },
    get totalTicks() {
      return totalTicks;
    },
    advance(nowMs: number): number {
      if (!started) {
        started = true;
        time[LAST] = nowMs;
        return 0;
      }
      let delta = nowMs - time[LAST];
      time[LAST] = nowMs;
      if (delta <= 0) return 0;

      // Delta snapping: a frame that is "about" k steps long counts as exactly k steps.
      const steps = Math.round(delta / stepMs);
      if (steps >= 1 && Math.abs(delta - steps * stepMs) <= tolerance) {
        delta = steps * stepMs;
      }

      time[ACCUMULATOR] += delta;
      let ran = 0;
      while (time[ACCUMULATOR] + EPSILON_MS >= stepMs && ran < maxTicks) {
        onTick();
        time[ACCUMULATOR] -= stepMs;
        ran++;
      }
      if (time[ACCUMULATOR] < 0) time[ACCUMULATOR] = 0;
      // Spiral-of-death guard: drop time we could not simulate this frame.
      if (time[ACCUMULATOR] + EPSILON_MS >= stepMs) time[ACCUMULATOR] %= stepMs;
      totalTicks += ran;
      return ran;
    },
    reset(): void {
      started = false;
      time[ACCUMULATOR] = 0;
    },
  };
}
