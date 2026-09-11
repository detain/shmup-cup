/**
 * Edge cases of the rAF driver: stopping from inside a frame, double stop, and exactly
 * one outstanding rAF request at any time.
 */
import { describe, expect, it } from 'vitest';
import { startFrameLoop, type FrameScheduler } from '../../src/frame-loop/index.js';

/** Manual rAF that tracks outstanding requests. */
function scheduler(): FrameScheduler & {
  flush(now: number): void;
  outstanding: Set<number>;
  cancelled: number[];
} {
  const callbacks = new Map<number, (now: number) => void>();
  const outstanding = new Set<number>();
  const cancelled: number[] = [];
  let next = 1;
  return {
    outstanding,
    cancelled,
    requestAnimationFrame(callback) {
      const handle = next++;
      callbacks.set(handle, callback);
      outstanding.add(handle);
      return handle;
    },
    cancelAnimationFrame(handle) {
      cancelled.push(handle);
      callbacks.delete(handle);
      outstanding.delete(handle);
    },
    flush(now) {
      const due = [...callbacks.entries()];
      callbacks.clear();
      outstanding.clear();
      for (const [, callback] of due) callback(now);
    },
  };
}

describe('shell/frame-loop edge cases', () => {
  it('keeps exactly one rAF request outstanding while running', () => {
    const rAF = scheduler();
    startFrameLoop(rAF, () => {});
    expect(rAF.outstanding.size).toBe(1);
    rAF.flush(16);
    rAF.flush(32);
    expect(rAF.outstanding.size).toBe(1);
  });

  it('does not schedule another frame when stopped from inside onFrame', () => {
    const rAF = scheduler();
    const frames: number[] = [];
    const loop = startFrameLoop(rAF, (now) => {
      frames.push(now);
      if (now >= 32) loop.stop();
    });
    rAF.flush(16);
    rAF.flush(32);
    rAF.flush(48);
    expect(frames).toEqual([16, 32]);
    expect(rAF.outstanding.size).toBe(0);
  });

  it('stop() is idempotent', () => {
    const rAF = scheduler();
    const loop = startFrameLoop(rAF, () => {});
    loop.stop();
    loop.stop();
    rAF.flush(16);
    expect(rAF.outstanding.size).toBe(0);
  });

  it('keeps running after onFrame throws (the next frame was already requested)', () => {
    const rAF = scheduler();
    let calls = 0;
    startFrameLoop(rAF, () => {
      calls++;
      if (calls === 1) throw new Error('boom');
    });
    expect(() => {
      rAF.flush(16);
    }).toThrow('boom');
    rAF.flush(32);
    expect(calls).toBe(2);
  });
});
