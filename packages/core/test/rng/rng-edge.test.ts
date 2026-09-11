/**
 * `core/rng` edge cases: seed normalisation, degenerate and wide `rangeInt` bounds,
 * state snapshots across the whole 32-bit range, and the statistical properties a
 * replay-grade generator has to keep (shmup_plan.md M1-01, shmup_feat.md §22).
 */
import { describe, expect, it } from 'vitest';
import { RNG_STATE_WORDS, createRng, createRngStreams } from '../../src/rng/index.js';

/**
 * The first `n` draws of a fresh stream.
 *
 * @param seed - Seed handed to {@link createRng}.
 * @param n - How many `nextU32` draws to take.
 * @returns The drawn words.
 */
function draws(seed: number, n: number): number[] {
  const rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(rng.nextU32());
  return out;
}

describe('core/rng — seed handling', () => {
  it('uses only the low 32 bits of the seed', () => {
    expect(draws(1, 4)).toEqual(draws(1 + 4294967296, 4));
    expect(draws(-1, 4)).toEqual(draws(4294967295, 4));
    expect(draws(0, 4)).toEqual(draws(4294967296, 4));
  });

  it('truncates a fractional seed towards zero', () => {
    expect(draws(7.9, 4)).toEqual(draws(7, 4));
    expect(draws(-7.9, 4)).toEqual(draws(-7, 4));
  });

  it('treats the extreme seeds as ordinary ones', () => {
    for (const seed of [0, 1, -1, 0x7fffffff, -0x80000000, 0xffffffff]) {
      const sequence = draws(seed, 8);
      expect(new Set(sequence).size, String(seed)).toBe(8);
      const outOfRange = sequence.filter(
        (value) => !Number.isInteger(value) || value < 0 || value > 0xffffffff,
      );
      expect(outOfRange, String(seed)).toEqual([]);
    }
  });

  it('never collapses neighbouring seeds onto the same stream', () => {
    const firsts = new Set<number>();
    for (let seed = 0; seed < 512; seed += 1) firsts.add(createRng(seed).nextU32());
    // splitmix32 seeding plus the 12-step warm-up must keep sequential seeds apart.
    expect(firsts.size).toBe(512);
  });

  it('produces a long non-repeating run from the degenerate seed 0', () => {
    const rng = createRng(0);
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i += 1) seen.add(rng.nextU32());
    // A few birthday collisions in 20k draws from 2^32 values are expected; a stuck
    // or short-cycling generator would collide far more.
    expect(seen.size).toBeGreaterThan(19990);
  });
});

describe('core/rng — rangeInt bounds', () => {
  it('advances the stream exactly once whatever the bounds are', () => {
    const rng = createRng(11);
    rng.rangeInt(0, 10);
    rng.rangeInt(4, 4);
    rng.rangeInt(-5, -5);
    rng.rangeInt(0, 0xffffffff);
    expect(rng.callCount).toBe(4);
  });

  it('keeps a degenerate range constant and in sync with an equivalent draw', () => {
    const a = createRng(23);
    const b = createRng(23);
    for (let i = 0; i < 100; i += 1) {
      expect(a.rangeInt(9, 9)).toBe(9);
      b.nextFloat();
    }
    expect(a.getState()).toEqual(b.getState());
  });

  it('stays inside wide and negative ranges', () => {
    const rng = createRng(0xfeed);
    let escapes = 0;
    const seenBinary = new Set<number>();
    for (let i = 0; i < 20000; i += 1) {
      const wide = rng.rangeInt(-1000000, 1000000);
      if (!Number.isInteger(wide) || wide < -1000000 || wide > 1000000) escapes += 1;
      const negative = rng.rangeInt(-9, -1);
      if (!Number.isInteger(negative) || negative < -9 || negative > -1) escapes += 1;
      seenBinary.add(rng.rangeInt(0, 1));
    }
    expect(escapes).toBe(0);
    expect(Array.from(seenBinary).sort()).toEqual([0, 1]);
  });

  it('covers the full unsigned 32-bit range without ever leaving it', () => {
    const rng = createRng(0xabcdef);
    let low = 0xffffffff;
    let high = 0;
    let escapes = 0;
    for (let i = 0; i < 50000; i += 1) {
      const value = rng.rangeInt(0, 0xffffffff);
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) escapes += 1;
      if (value < low) low = value;
      if (value > high) high = value;
    }
    expect(escapes).toBe(0);
    expect(low).toBeLessThan(0x00200000);
    expect(high).toBeGreaterThan(0xffe00000);
  });

  it('spreads a small range evenly enough for spawn lanes', () => {
    const rng = createRng(0x1010);
    const counts = [0, 0, 0, 0];
    const samples = 80000;
    for (let i = 0; i < samples; i += 1) counts[rng.rangeInt(0, 3)] += 1;
    for (const count of counts) {
      expect(count).toBeGreaterThan(samples / 4 - samples / 100);
      expect(count).toBeLessThan(samples / 4 + samples / 100);
    }
  });
});

describe('core/rng — state snapshots', () => {
  it('round-trips states whose words have the high bit set', () => {
    const rng = createRng(0xdeadbeef);
    let badWords = 0;
    let mismatches = 0;
    let highBitSeen = 0;
    for (let i = 0; i < 1000; i += 1) {
      rng.nextU32();
      const state = rng.getState();
      for (const word of state) {
        if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) badWords += 1;
        if (word > 0x7fffffff) highBitSeen += 1;
      }
      const expected = rng.nextU32();
      rng.setState(state);
      if (rng.nextU32() !== expected) mismatches += 1;
    }
    expect(badWords).toBe(0);
    expect(mismatches).toBe(0);
    expect(highBitSeen).toBeGreaterThan(0);
  });

  it('restores a snapshot into a different generator (replay checkpoints)', () => {
    const source = createRng(99);
    for (let i = 0; i < 37; i += 1) source.nextU32();
    const snapshot = new Uint32Array(RNG_STATE_WORDS);
    source.getStateInto(snapshot);

    const restored = createRng(12345);
    restored.setState(snapshot);
    let mismatches = 0;
    for (let i = 0; i < 100; i += 1) {
      if (restored.nextU32() !== source.nextU32()) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  });

  it('accepts a destination longer than the state and leaves the tail alone', () => {
    const rng = createRng(5);
    const out = new Uint32Array(RNG_STATE_WORDS + 2).fill(0xcafe);
    rng.getStateInto(out);
    expect(Array.from(out.subarray(0, RNG_STATE_WORDS))).toEqual(rng.getState());
    expect(out[RNG_STATE_WORDS]).toBe(0xcafe);
    expect(out[RNG_STATE_WORDS + 1]).toBe(0xcafe);
  });

  it('rejects every destination shorter than the state', () => {
    const rng = createRng(5);
    for (let length = 0; length < RNG_STATE_WORDS; length += 1) {
      expect(() => rng.getStateInto(new Uint32Array(length)), String(length)).toThrow(RangeError);
    }
    expect(() => rng.getStateInto(new Uint32Array(RNG_STATE_WORDS))).not.toThrow();
  });

  it('does not alias the array a snapshot was taken into', () => {
    const rng = createRng(5);
    const out = new Uint32Array(RNG_STATE_WORDS);
    rng.getStateInto(out);
    const before = Array.from(out);
    for (let i = 0; i < 10; i += 1) rng.nextU32();
    expect(Array.from(out)).toEqual(before);
  });

  it('returns a fresh array from getState every time', () => {
    const rng = createRng(5);
    const first = rng.getState();
    const second = rng.getState();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('keeps counting draws across a setState (callCount is diagnostic only)', () => {
    const rng = createRng(5);
    const state = rng.getState();
    for (let i = 0; i < 10; i += 1) rng.nextFloat();
    rng.setState(state);
    expect(rng.callCount).toBe(10);
    rng.nextU32();
    expect(rng.callCount).toBe(11);
  });

  it('counts rangeInt, nextFloat and nextU32 alike, and only those', () => {
    const rng = createRng(5);
    rng.getState();
    rng.getStateInto(new Uint32Array(RNG_STATE_WORDS));
    rng.setState(rng.getState());
    expect(rng.callCount).toBe(0);
    rng.nextU32();
    rng.nextFloat();
    rng.rangeInt(1, 2);
    expect(rng.callCount).toBe(3);
  });
});

describe('core/rng — stream independence', () => {
  it('never gives a session two identical streams', () => {
    let identical = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const { gameplay, cosmetic } = createRngStreams(seed);
      if (gameplay.nextU32() === cosmetic.nextU32()) identical += 1;
    }
    expect(identical).toBe(0);
  });

  it('keeps the gameplay stream identical to a solo generator of the same seed', () => {
    const seed = 0x7fffffff;
    const streams = createRngStreams(seed);
    const solo = createRng(seed);
    // Interleave heavy cosmetic use — it must not shift the gameplay sequence at all.
    let mismatches = 0;
    for (let i = 0; i < 500; i += 1) {
      for (let j = 0; j < 3; j += 1) streams.cosmetic.nextFloat();
      if (streams.gameplay.nextU32() !== solo.nextU32()) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  });

  it('reproduces both streams exactly from the seed alone', () => {
    const first = createRngStreams(0x13572468);
    const second = createRngStreams(0x13572468);
    let mismatches = 0;
    for (let i = 0; i < 200; i += 1) {
      if (second.gameplay.nextU32() !== first.gameplay.nextU32()) mismatches += 1;
      if (second.cosmetic.nextU32() !== first.cosmetic.nextU32()) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  });

  it('does not let the cosmetic stream of one seed match the gameplay stream of another', () => {
    const cosmeticFirsts = new Map<number, number>();
    for (let seed = 0; seed < 256; seed += 1) {
      cosmeticFirsts.set(createRngStreams(seed).cosmetic.nextU32(), seed);
    }
    let collisions = 0;
    for (let seed = 0; seed < 256; seed += 1) {
      if (cosmeticFirsts.has(createRng(seed).nextU32())) collisions += 1;
    }
    expect(collisions).toBe(0);
  });

  it('keeps its own callCount per stream', () => {
    const { gameplay, cosmetic } = createRngStreams(3);
    for (let i = 0; i < 5; i += 1) cosmetic.nextU32();
    gameplay.nextU32();
    expect(gameplay.callCount).toBe(1);
    expect(cosmetic.callCount).toBe(5);
  });
});

describe('core/rng — output quality', () => {
  it('keeps every output bit roughly balanced', () => {
    const rng = createRng(0x600d5eed);
    const ones = new Array<number>(32).fill(0);
    const samples = 20000;
    for (let i = 0; i < samples; i += 1) {
      const value = rng.nextU32();
      for (let bit = 0; bit < 32; bit += 1) {
        if (((value >>> bit) & 1) === 1) ones[bit] += 1;
      }
    }
    for (let bit = 0; bit < 32; bit += 1) {
      expect(ones[bit], `bit ${String(bit)}`).toBeGreaterThan(samples * 0.47);
      expect(ones[bit], `bit ${String(bit)}`).toBeLessThan(samples * 0.53);
    }
  });

  it('never returns a float of exactly 1 and can reach very small values', () => {
    const rng = createRng(0x0f0f0f0f);
    let smallest = 1;
    let escapes = 0;
    for (let i = 0; i < 200000; i += 1) {
      const value = rng.nextFloat();
      if (!(value >= 0 && value < 1)) escapes += 1;
      if (value < smallest) smallest = value;
    }
    expect(escapes).toBe(0);
    expect(smallest).toBeLessThan(0.001);
  });

  it('is a multiple of 2^-32 on every float draw', () => {
    const rng = createRng(17);
    let nonGrid = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (!Number.isInteger(rng.nextFloat() * 4294967296)) nonGrid += 1;
    }
    expect(nonGrid).toBe(0);
  });
});
