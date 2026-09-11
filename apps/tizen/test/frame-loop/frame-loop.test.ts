import { describe, expect, it } from 'vitest';
import { moduleInfo, startFrameLoop } from '../../src/frame-loop/index.js';

describe('tizen/frame-loop startFrameLoop', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('frame-loop');
  });

  it('forwards rAF timestamps until stopped', () => {
    let pending: ((now: number) => void) | null = null;
    const scheduler = {
      requestAnimationFrame: (callback: (now: number) => void) => {
        pending = callback;
        return 1;
      },
      cancelAnimationFrame: () => {
        pending = null;
      },
    };
    const frames: number[] = [];
    const loop = startFrameLoop(scheduler, (now) => frames.push(now));
    const flush = (now: number) => {
      const callback = pending;
      pending = null;
      callback?.(now);
    };
    flush(16.7);
    flush(33.3);
    loop.stop();
    flush(50);
    expect(frames).toEqual([16.7, 33.3]);
  });
});
