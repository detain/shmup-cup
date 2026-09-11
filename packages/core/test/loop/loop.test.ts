import { describe, expect, it } from 'vitest';
import { createFixedStepLoop } from '../../src/loop/index.js';

/** Creates a 60 Hz loop that counts ticks. */
function makeLoop(maxTicksPerFrame = 4) {
  const counter = { ticks: 0 };
  const loop = createFixedStepLoop({
    tickRate: 60,
    maxTicksPerFrame,
    onTick: () => {
      counter.ticks++;
    },
  });
  return { loop, counter };
}

describe('core/loop createFixedStepLoop', () => {
  it('runs no tick on the first frame (it only records the timestamp)', () => {
    const { loop, counter } = makeLoop();
    expect(loop.advance(1000)).toBe(0);
    expect(counter.ticks).toBe(0);
  });

  it('runs exactly one tick per jittery 60 Hz frame (delta snapping)', () => {
    const { loop, counter } = makeLoop();
    let t = 5000;
    loop.advance(t);
    const deltas = [16.4, 16.9, 16.6, 16.8, 16.5, 16.7, 16.6, 16.9, 16.4, 16.7];
    for (const d of deltas) {
      t += d;
      expect(loop.advance(t)).toBe(1);
    }
    expect(counter.ticks).toBe(deltas.length);
    expect(loop.totalTicks).toBe(deltas.length);
  });

  it('accumulates on a 120 Hz display (one tick every other frame)', () => {
    const { loop } = makeLoop();
    let t = 0;
    loop.advance(t);
    const perFrame: number[] = [];
    for (let i = 0; i < 8; i++) {
      t += 1000 / 120;
      perFrame.push(loop.advance(t));
    }
    expect(perFrame.reduce((a, b) => a + b, 0)).toBe(4);
    expect(loop.alpha).toBeGreaterThanOrEqual(0);
    expect(loop.alpha).toBeLessThan(1);
  });

  it('caps ticks per frame and drops the excess (no spiral of death)', () => {
    const { loop, counter } = makeLoop(3);
    loop.advance(0);
    expect(loop.advance(1000)).toBe(3);
    expect(counter.ticks).toBe(3);
    expect(loop.alpha).toBeLessThan(1);
  });

  it('reset() forgets elapsed time', () => {
    const { loop } = makeLoop();
    loop.advance(0);
    loop.reset();
    expect(loop.advance(10_000)).toBe(0);
    expect(loop.advance(10_000 + 1000 / 60)).toBe(1);
  });

  it('rejects invalid options', () => {
    expect(() =>
      createFixedStepLoop({ tickRate: 0, maxTicksPerFrame: 1, onTick: () => {} }),
    ).toThrow(RangeError);
    expect(() =>
      createFixedStepLoop({ tickRate: 60, maxTicksPerFrame: 0, onTick: () => {} }),
    ).toThrow(RangeError);
  });
});
