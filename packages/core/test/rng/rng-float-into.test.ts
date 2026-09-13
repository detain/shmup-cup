/**
 * `Rng.nextFloatInto` (plan M2-02): the allocation-free draw the pattern interpreter's `$rand`
 * uses — the same value `nextFloat` returns, written into a `Float64Array` slot, advancing the
 * stream and its call count exactly like any other draw, so a replay stays in step whichever draw
 * a system uses.
 */
import { describe, expect, it } from 'vitest';
import { createRng, createRngStreams } from '../../src/rng/index.js';

describe('core/rng nextFloatInto (M2-02)', () => {
  it('writes exactly what nextFloat returns, draw for draw', () => {
    const a = createRng(0x5eedc0de);
    const b = createRng(0x5eedc0de);
    const out = new Float64Array(4);
    for (let k = 0; k < 1000; k++) {
      a.nextFloatInto(out, k & 3);
      const expected = b.nextFloat();
      expect(out[k & 3]).toBe(expected);
      expect(expected >= 0 && expected < 1).toBe(true);
    }
    expect(a.getState()).toEqual(b.getState());
    expect(a.callCount).toBe(b.callCount);
    expect(a.callCount).toBe(1000);
  });

  it('touches only the slot it is given', () => {
    const rng = createRng(7);
    const out = new Float64Array([9, 9, 9]);
    rng.nextFloatInto(out, 1);
    expect(out[0]).toBe(9);
    expect(out[2]).toBe(9);
    expect(out[1]).not.toBe(9);
  });

  it('interleaves with the other draws as one stream', () => {
    const mixed = createRng(99);
    const plain = createRng(99);
    const out = new Float64Array(1);
    const seen: number[] = [];
    const want: number[] = [];
    for (let k = 0; k < 50; k++) {
      if (k % 3 === 0) {
        mixed.nextFloatInto(out, 0);
        seen.push(out[0]);
      } else if (k % 3 === 1) {
        seen.push(mixed.nextU32());
      } else {
        seen.push(mixed.rangeInt(0, 9));
      }
      want.push(
        k % 3 === 0 ? plain.nextFloat() : k % 3 === 1 ? plain.nextU32() : plain.rangeInt(0, 9),
      );
    }
    expect(seen).toEqual(want);
  });

  it('advances only its own stream of a stream set', () => {
    const a = createRngStreams(5);
    const b = createRngStreams(5);
    const out = new Float64Array(1);
    a.gameplay.nextFloatInto(out, 0);
    expect(out[0]).toBe(b.gameplay.nextFloat());
    expect(a.cosmetic.getState()).toEqual(b.cosmetic.getState());
    expect(a.cosmetic.callCount).toBe(0);
  });
});
