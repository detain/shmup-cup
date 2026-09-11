/**
 * # frame-loop — `requestAnimationFrame` driver (TV)
 *
 * **Responsibility.** Calls `onFrame(now)` once per display refresh. On the 60 Hz M7
 * monitors this yields exactly one simulation tick per frame (the core's fixed-step loop
 * snaps rAF jitter). No timing logic, no per-frame allocation.
 *
 * **Implements.** shmup_feat.md §3, shmup_tech.md §2.7 (60 Hz fixed, one tick per rAF).
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
  requestAnimationFrame(callback: (now: number) => void): number;
  cancelAnimationFrame(handle: number): void;
}

/** A running frame loop. */
export interface FrameLoop {
  /** Stops the loop. */
  stop(): void;
}

/**
 * Starts calling `onFrame` every animation frame.
 *
 * @param scheduler - Normally `window`.
 * @param onFrame - Receives the rAF timestamp in ms.
 * @returns A handle to stop the loop.
 */
export function startFrameLoop(
  scheduler: FrameScheduler,
  onFrame: (now: number) => void,
): FrameLoop {
  let handle = 0;
  let running = true;
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
