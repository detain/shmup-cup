import { describe, expect, it } from 'vitest';
import { moduleInfo, startFrameLoop, type FrameScheduler } from '../../src/frame-loop/index.js';

/** Manual rAF: `flush(now)` runs the pending callback. */
function fakeScheduler(): FrameScheduler & { flush(now: number): void; cancelled: number[] } {
  let pending: ((now: number) => void) | null = null;
  let next = 1;
  const cancelled: number[] = [];
  return {
    cancelled,
    requestAnimationFrame(callback) {
      pending = callback;
      return next++;
    },
    cancelAnimationFrame(handle) {
      cancelled.push(handle);
      pending = null;
    },
    flush(now) {
      const callback = pending;
      pending = null;
      callback?.(now);
    },
  };
}

describe('web/frame-loop startFrameLoop', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('frame-loop');
  });

  it('passes each rAF timestamp to onFrame until stopped', () => {
    const scheduler = fakeScheduler();
    const frames: number[] = [];
    const loop = startFrameLoop(scheduler, (now) => frames.push(now));
    scheduler.flush(16);
    scheduler.flush(33);
    loop.stop();
    scheduler.flush(50);
    expect(frames).toEqual([16, 33]);
    expect(scheduler.cancelled.length).toBe(1);
  });
});
