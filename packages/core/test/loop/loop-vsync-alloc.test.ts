/**
 * Allocation guard of the vsync-locked frame path (plan M3-02b, docs/dev/conventions.md): one
 * `advance()` per frame with a fractional rAF timestamp must allocate nothing — the debt lives in
 * the loop's `Float64Array` and `advance` stays small enough for V8 to inline, so its fractional
 * argument is never boxed (M1-06).
 */
import { describe, expect, it } from 'vitest';
import { createFixedStepLoop } from '../../src/loop/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/loop vsync lock: allocation', () => {
  it('advance() allocates nothing on the locked path', () => {
    let ticks = 0;
    const loop = createFixedStepLoop({
      tickRate: 60,
      maxTicksPerFrame: 4,
      vsyncLock: true,
      onTick: () => {
        ticks++;
      },
    });
    // The clock lives in a typed array: a fractional number in a closure variable would itself
    // allocate on every frame (the test's own cost, not the loop's).
    const clock = new Float64Array(1);
    clock[0] = 10_000;
    loop.advance(clock[0]);
    const growth = measureHeapGrowth(
      (i) => {
        // The M7's jitter: a long frame paired with a short one, a real drop now and then.
        clock[0] += i % 97 === 0 ? 33.4 : i % 3 === 0 ? 21.3 : i % 3 === 1 ? 12.1 : 16.7;
        loop.advance(clock[0]);
      },
      20_000,
      40_000,
    );
    expect(ticks).toBeGreaterThan(40_000);
    expect(growth.bytes).toBeLessThan(32 * 1024);
  });
});
