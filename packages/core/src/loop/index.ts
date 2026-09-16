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
 * - **Vsync lock** ({@link FixedStepLoop.setVsyncLock}, M3-02b): the Samsung M7 monitors deliver
 *   ~59 fps with heavy jitter — a quarter of the rAF deltas are longer than 20 ms while the
 *   short ones make up for it (`docs/dev/input-probe-results.md` finding 8) — which the ±1 ms
 *   snap alone turns into 0-tick and 2-tick frames (judder), against decision D32. While the lock
 *   is on the loop runs **exactly one tick per frame** and only a really dropped frame (a delta of
 *   at least {@link VSYNC_DROP_STEPS} steps, or a whole step of accumulated debt) adds a second
 *   one, so the simulation still follows real time. It is presentation only: the same input
 *   produces the same ticks, so replays and goldens do not change.
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
 * {@link FixedStepLoopOptions}, {@link DEFAULT_SNAP_TOLERANCE_MS}, {@link VSYNC_DROP_STEPS}.
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
  status: 'implemented',
  specRefs: ['shmup_feat.md §3', 'shmup_feat.md §22'],
});

/** Frame deltas this close (ms) to a whole number of steps are snapped to it. */
export const DEFAULT_SNAP_TOLERANCE_MS = 1;

/**
 * Whole steps of real time a frame must cover — its delta plus the debt carried from the frames
 * before it — before the vsync lock runs a **second** tick (2 steps ≈ 33.3 ms at 60 Hz: a really
 * missed vsync, or a step of debt that a slightly-off-60 Hz display has piled up).
 *
 * @remarks
 * The threshold counts covered time, not the raw delta, because the M7's rAF jitter reaches a p95
 * of ~30 ms (1.8 steps) while the short deltas beside it make the average come out at 60 Hz: a
 * raw-delta rule would double-tick on 5 % of perfectly ordinary frames.
 */
export const VSYNC_DROP_STEPS = 2;

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
  /** Start with the vsync lock on ({@link FixedStepLoop.setVsyncLock}; default `false`). */
  readonly vsyncLock?: boolean;
}

/** A fixed-timestep accumulator driven by frame timestamps. */
export interface FixedStepLoop {
  /** Duration of one tick in ms. */
  readonly stepMs: number;
  /** Fraction (0 ≤ alpha < 1) of a tick left in the accumulator — render interpolation factor. */
  readonly alpha: number;
  /** Total ticks run since creation. */
  readonly totalTicks: number;
  /** Whether the vsync lock is on (see {@link FixedStepLoop.setVsyncLock}). */
  readonly vsyncLock: boolean;
  /**
   * Turns the vsync lock on or off (M3-02b).
   *
   * @remarks
   * On: every {@link FixedStepLoop.advance} with a positive delta runs **one** tick, plus a second
   * one when the frame was really dropped (at least {@link VSYNC_DROP_STEPS} steps) or a whole
   * step of debt has piled up; the debt — real time minus simulated time — is bounded to ±1 step,
   * so a display that runs slightly off 60 Hz never builds a catch-up burst. Off (the default):
   * the free-running accumulator with delta snapping, which every other refresh rate, slow motion,
   * frame advance and the game-speed assist need. Switching resets the debt, not the tick count.
   *
   * @param on - Whether to lock the tick rate to the frame rate.
   */
  setVsyncLock(on: boolean): void;
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
  let locked = options.vsyncLock === true;
  const dropMs = VSYNC_DROP_STEPS * stepMs;
  // The fractional times live in a typed array, not in closure variables: a closure variable
  // holding a non-integer number is a heap-allocated box, re-created on every assignment — two
  // allocations per frame on a real rAF clock. Typed-array slots are stored in place.
  const time = new Float64Array(2);
  const LAST = 0;
  const ACCUMULATOR = 1;

  /**
   * The vsync lock's tick count for one frame, and the debt it leaves behind.
   *
   * @remarks
   * One tick per frame, plus a second one when the frame's delta and the debt carried from the
   * frames before it cover {@link VSYNC_DROP_STEPS} whole steps — a really dropped frame, or a
   * step of debt a slightly-off-60 Hz display has piled up. The debt is bounded to ±1 step, so no
   * catch-up burst can build up. Kept out of `advance` so that stays small enough for V8 to inline
   * (an `advance` call it does not inline boxes its fractional argument — M1-06).
   *
   * @param delta - The frame's delta in ms (already snapped, always > 0).
   * @returns 1 or 2.
   */
  const lockedTicks = (delta: number): number => {
    const covered = time[ACCUMULATOR] + delta;
    const ran = covered + EPSILON_MS >= dropMs && maxTicks > 1 ? 2 : 1;
    let debt = covered - ran * stepMs;
    if (debt > stepMs) debt = stepMs;
    else if (debt < -stepMs) debt = -stepMs;
    time[ACCUMULATOR] = debt;
    return ran;
  };

  return {
    stepMs,
    get alpha() {
      // Under the lock the accumulator holds a signed debt, not a leftover fraction, and every
      // frame shows exactly one fresh tick: there is nothing to interpolate towards.
      return locked ? 0 : time[ACCUMULATOR] / stepMs;
    },
    get totalTicks() {
      return totalTicks;
    },
    get vsyncLock() {
      return locked;
    },
    setVsyncLock(on: boolean): void {
      if (on === locked) return;
      locked = on;
      time[ACCUMULATOR] = 0;
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

      if (locked) {
        const ran = lockedTicks(delta);
        for (let i = 0; i < ran; i++) onTick();
        totalTicks += ran;
        return ran;
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
