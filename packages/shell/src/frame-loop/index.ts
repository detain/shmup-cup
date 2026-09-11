/**
 * # frame-loop — `requestAnimationFrame` driver
 *
 * **Responsibility.** Calls `onFrame(now)` once per display refresh with the rAF timestamp.
 * The core's fixed-step loop turns those timestamps into simulation ticks (on the 60 Hz M7
 * monitors exactly one tick per frame — the loop snaps rAF jitter), so this module stays
 * trivial: no timing logic, no allocation per frame. Shared by the web and TV hosts (it
 * used to live, twice, in `apps/web` and `apps/tizen`).
 *
 * **Implements.** shmup_feat.md §3 (rAF-driven fixed step), shmup_tech.md §2.7 (60 Hz
 * fixed, one tick per rAF).
 *
 * **Public API.** {@link startFrameLoop}, {@link FrameLoop}, {@link FrameScheduler}.
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
