/**
 * `core/rng` — sfc32 known-answer vectors, stream independence, range bounds and the
 * zero-allocation state accessors (shmup_plan.md M1-01).
 */
import { describe, expect, it } from 'vitest';
import { RNG_STATE_WORDS, createRng, createRngStreams, moduleInfo } from '../../src/rng/index.js';

/**
 * An independent sfc32 + splitmix32 implementation, written straight from the published
 * algorithms, used to prove `createRng` is the real thing rather than a look-alike.
 *
 * @param seed - 32-bit seed.
 * @returns A function producing the same sequence `createRng(seed).nextU32()` does.
 */
function referenceSfc32(seed: number): () => number {
  /**
   * splitmix32 finaliser.
   *
   * @param x - Any 32-bit value.
   * @returns A mixed unsigned 32-bit value.
   */
  const mix = (x: number): number => {
    let t = (x ^ (x >>> 16)) >>> 0;
    t = Math.imul(t, 0x21f0aaad);
    t = (t ^ (t >>> 15)) >>> 0;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
  let s = seed | 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    s = (s + 0x9e3779b9) | 0;
    words.push(mix(s));
  }
  let [a, b, c, d] = words as [number, number, number, number];
  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i += 1) next();
  return next;
}

describe('core/rng', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('rng');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });

  it('matches a committed known-answer vector for seed 0x5eedc0de', () => {
    const rng = createRng(0x5eedc0de);
    const drawn: number[] = [];
    for (let i = 0; i < 8; i += 1) drawn.push(rng.nextU32());
    expect(drawn).toEqual([
      2102796133, 2623118785, 3769488628, 2833892583, 4257653168, 3100002963, 2169497526,
      3551146766,
    ]);
  });

  it('reproduces an independent sfc32 implementation', () => {
    for (const seed of [0, 1, 0x5eedc0de, -7, 0xffffffff]) {
      const rng = createRng(seed);
      const reference = referenceSfc32(seed);
      for (let i = 0; i < 64; i += 1) expect(rng.nextU32()).toBe(reference());
    }
  });

  it('is reproducible: the same seed yields the same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i += 1) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('produces unsigned 32-bit integers and floats in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10000; i += 1) {
      const u = rng.nextU32();
      expect(Number.isInteger(u)).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(0xffffffff);
      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('keeps rangeInt inside its inclusive bounds and reaches both ends', () => {
    const rng = createRng(0xc0ffee);
    let min = 99;
    let max = -99;
    for (let i = 0; i < 20000; i += 1) {
      const value = rng.rangeInt(-3, 5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(5);
      if (value < min) min = value;
      if (value > max) max = value;
    }
    expect(min).toBe(-3);
    expect(max).toBe(5);
  });

  it('treats a single-value range as a constant (but still advances the stream)', () => {
    const rng = createRng(3);
    expect(rng.rangeInt(4, 4)).toBe(4);
    expect(rng.callCount).toBe(1);
  });

  it('counts every draw in callCount', () => {
    const rng = createRng(1);
    expect(rng.callCount).toBe(0);
    rng.nextU32();
    rng.nextFloat();
    rng.rangeInt(0, 9);
    expect(rng.callCount).toBe(3);
  });

  it('round-trips its state through getState/setState', () => {
    const rng = createRng(0xbeef);
    for (let i = 0; i < 10; i += 1) rng.nextU32();
    const state = rng.getState();
    const expected = [rng.nextU32(), rng.nextU32(), rng.nextU32()];
    rng.setState(state);
    expect([rng.nextU32(), rng.nextU32(), rng.nextU32()]).toEqual(expected);
  });

  it('writes the same state into a caller-owned array without allocating', () => {
    const rng = createRng(0xbeef);
    for (let i = 0; i < 5; i += 1) rng.nextU32();
    const out = new Uint32Array(RNG_STATE_WORDS);
    rng.getStateInto(out);
    expect(Array.from(out)).toEqual(rng.getState());

    const expected = [rng.nextU32(), rng.nextU32()];
    rng.setState(out);
    expect([rng.nextU32(), rng.nextU32()]).toEqual(expected);
  });

  it('rejects a destination array that is too short', () => {
    const rng = createRng(1);
    expect(() => rng.getStateInto(new Uint32Array(RNG_STATE_WORDS - 1))).toThrow(RangeError);
  });

  it('leaves callCount alone when the state is restored', () => {
    const rng = createRng(1);
    rng.nextU32();
    rng.setState(rng.getState());
    expect(rng.callCount).toBe(1);
  });

  it('gives a session two independent streams', () => {
    const streams = createRngStreams(0x5eedc0de);
    const solo = createRng(0x5eedc0de);

    // The cosmetic stream is a different sequence …
    const cosmetic: number[] = [];
    for (let i = 0; i < 16; i += 1) cosmetic.push(streams.cosmetic.nextU32());
    const gameplay: number[] = [];
    for (let i = 0; i < 16; i += 1) gameplay.push(streams.gameplay.nextU32());
    expect(cosmetic).not.toEqual(gameplay);

    // … and draining it cannot shift the gameplay sequence.
    const reference: number[] = [];
    for (let i = 0; i < 16; i += 1) reference.push(solo.nextU32());
    expect(gameplay).toEqual(reference);
  });

  it('derives different streams for different seeds', () => {
    const a = createRngStreams(1);
    const b = createRngStreams(2);
    expect(a.gameplay.nextU32()).not.toBe(b.gameplay.nextU32());
    expect(a.cosmetic.nextU32()).not.toBe(b.cosmetic.nextU32());
  });

  it('spreads floats roughly uniformly over the unit interval', () => {
    const rng = createRng(0x1234);
    const buckets = new Array<number>(10).fill(0);
    const samples = 100000;
    for (let i = 0; i < samples; i += 1) {
      buckets[Math.floor(rng.nextFloat() * 10)] += 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(samples / 10 - samples / 100);
      expect(count).toBeLessThan(samples / 10 + samples / 100);
    }
  });
});
