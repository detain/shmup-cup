/**
 * `scripts/assets/rng.mjs` — the seeded generator behind the procedural placeholder art.
 *
 * Every procedural sprite is drawn from this sequence, so it is pinned with known-answer
 * vectors (a change here silently repaints explosions, debris and stars). The sfc32 step
 * is checked against `@shmup/core`'s `rng` (same step function, different seeding).
 */
import { createRng } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAssetRng, hash2 } from '../../../scripts/assets/rng.mjs';

/**
 * The asset generator's seeding, re-derived here: splitmix32 with the Murmur3 finaliser
 * constants, four words, no warm-up.
 *
 * @param seed - Seed.
 * @returns The initial sfc32 state words.
 */
function assetSeedWords(seed: number): [number, number, number, number] {
  let s = seed | 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z ^= z >>> 16;
    words.push(z >>> 0);
  }
  return words as [number, number, number, number];
}

describe('scripts/assets/rng — createAssetRng', () => {
  it.each([
    [0, [0x1ba930c0, 0x7c89126e, 0xbe5afba2, 0xe557fb13]],
    [1, [0x230b44e2, 0xdc770a3d, 0x9678a37c, 0xd2bfdfe6]],
    [0xdeadbeef, [0xda684ef5, 0x8fb1000e, 0x25b0f785, 0x9f2047bb]],
    [-1, [0x9d154fed, 0xdc935efc, 0x51974a1d, 0x7379bbc9]],
  ])('reproduces the pinned sequence for seed %i', (seed, expected) => {
    const rng = createAssetRng(seed);
    expect(Array.from({ length: 4 }, () => rng.nextU32())).toEqual(expected);
  });

  it('runs the same sfc32 step as @shmup/core once both hold the same state', () => {
    for (const seed of [0, 7, 0x12345678]) {
      const asset = createAssetRng(seed);
      const core = createRng(0);
      core.setState(assetSeedWords(seed));
      for (let i = 0; i < 1000; i++) expect(asset.nextU32()).toBe(core.nextU32());
    }
  });

  it('takes the seed modulo 2^32 (integer part only)', () => {
    const a = createAssetRng(5);
    const b = createAssetRng(5 + 4294967296);
    const c = createAssetRng(5.9);
    for (let i = 0; i < 50; i++) {
      const value = a.nextU32();
      expect(b.nextU32()).toBe(value);
      expect(c.nextU32()).toBe(value);
    }
    expect(createAssetRng(0xffffffff).nextU32()).toBe(createAssetRng(-1).nextU32());
  });

  it('keeps independent generators independent', () => {
    const a = createAssetRng(42);
    const first = Array.from({ length: 10 }, () => a.nextU32());
    const b = createAssetRng(42);
    createAssetRng(42).nextU32(); // another instance does not share state
    expect(Array.from({ length: 10 }, () => b.nextU32())).toEqual(first);
  });

  it('nextU32 is an unsigned 32-bit integer and nextFloat lies in [0, 1)', () => {
    const rng = createAssetRng(3);
    for (let i = 0; i < 5000; i++) {
      const u = rng.nextU32();
      expect(Number.isInteger(u) && u >= 0 && u <= 0xffffffff).toBe(true);
      const f = rng.nextFloat();
      expect(f >= 0 && f < 1).toBe(true);
    }
  });

  it('nextFloat is nextU32 / 2^32', () => {
    const a = createAssetRng(11);
    const b = createAssetRng(11);
    for (let i = 0; i < 100; i++) expect(a.nextFloat()).toBe(b.nextU32() / 4294967296);
  });

  it('rangeInt covers [min, max] inclusively and never leaves it', () => {
    const rng = createAssetRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const v = rng.rangeInt(-2, 3);
      expect(v >= -2 && v <= 3 && Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(rng.rangeInt(7, 7)).toBe(7);
  });

  it('chance(0) is never true, chance(1) always, chance(p) about p of the time', () => {
    const rng = createAssetRng(21);
    let hits = 0;
    for (let i = 0; i < 10000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
      if (rng.chance(0.3)) hits++;
    }
    expect(hits).toBeGreaterThan(2700);
    expect(hits).toBeLessThan(3300);
  });
});

describe('scripts/assets/rng — hash2', () => {
  it('depends only on (x, y, seed) and is an unsigned 32-bit integer', () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    for (let y = -3; y < 3; y++) {
      for (let x = -3; x < 3; x++) {
        const h = hash2(x, y, 99);
        expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
      }
    }
  });

  it('pins its values (terrain rock texture and force-field holes are drawn from it)', () => {
    expect(hash2(0, 0, 0)).toBe(0);
    expect(hash2(1, 2, 3)).toBe(0x50d89ce0);
    expect(hash2(-1, -1, 0)).toBe(0x7334d165);
  });

  it('changes with each coordinate and with the seed, and is not symmetric', () => {
    const base = hash2(10, 20, 30);
    expect(hash2(11, 20, 30)).not.toBe(base);
    expect(hash2(10, 21, 30)).not.toBe(base);
    expect(hash2(10, 20, 31)).not.toBe(base);
    expect(hash2(20, 10, 30)).not.toBe(base);
  });

  it('spreads a small grid over the range without collisions', () => {
    const values = new Set<number>();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) values.add(hash2(x, y, 7));
    expect(values.size).toBe(64 * 64);
    let high = 0;
    for (const v of values) if (v >= 0x80000000) high++;
    expect(high / values.size).toBeGreaterThan(0.45);
    expect(high / values.size).toBeLessThan(0.55);
  });
});
