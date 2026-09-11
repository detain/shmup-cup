/**
 * # frame-loop — `requestAnimationFrame` driver
 *
 * **Responsibility.** Calls `onFrame(now)` once per display refresh with the rAF
 * timestamp. The core's fixed-step loop turns those timestamps into simulation ticks,
 * so this module stays trivial: no timing logic, no allocation per frame.
 *
 * **Implements.** shmup_feat.md §3 (rAF-driven, one sim tick per rAF on 60 Hz).
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
  specRefs: ['shmup_feat.md §3'],
});

/** The two rAF functions (a `Window` satisfies this; tests pass fakes). */
export interface FrameScheduler {
  requestAnimationFrame(callback: (now: number) => void): number;
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
