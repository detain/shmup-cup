/**
 * Common helper coverage of `scripts/assets/procedural/common.mjs` (colour maths,
 * seeds, `makeSprite`). Split out of `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { type Rgba } from '../../../scripts/assets/image.mjs';
import {
  DIRECTIONS_8,
  color,
  makeSprite,
  mix,
  seedOf,
  withAlpha,
} from '../../../scripts/assets/procedural/common.mjs';

describe('scripts/assets/procedural/common', () => {
  it('DIRECTIONS_8 are the exact 22.5° steps, clockwise from +x, as unit vectors', () => {
    DIRECTIONS_8.forEach(([c, s], k) => {
      expect(Math.abs(c * c + s * s - 1)).toBeLessThan(1e-15);
      expect(c).toBeCloseTo(Math.cos((k * Math.PI) / 8), 15);
      expect(s).toBeCloseTo(Math.sin((k * Math.PI) / 8), 15);
    });
    expect(DIRECTIONS_8).toHaveLength(8);
    expect(DIRECTIONS_8[0]).toEqual([1, 0]);
    expect(DIRECTIONS_8[4]).toEqual([0, 1]);
    // Symmetries are exact (bit-identical), not merely close.
    expect(DIRECTIONS_8[2][0]).toBe(DIRECTIONS_8[2][1]);
    expect(DIRECTIONS_8[1]).toEqual([DIRECTIONS_8[3][1], DIRECTIONS_8[3][0]]);
    expect(DIRECTIONS_8[5]).toEqual([-DIRECTIONS_8[3][0], DIRECTIONS_8[3][1]]);
    expect(DIRECTIONS_8[7]).toEqual([-DIRECTIONS_8[1][0], DIRECTIONS_8[1][1]]);
  });

  it('color() parses literals and throws a TypeError for a malformed one', () => {
    expect(color('#f80')).toEqual([255, 136, 0, 255]);
    expect(color('#11223344')).toEqual([17, 34, 51, 68]);
    expect(() => color('orange')).toThrow(TypeError);
    expect(() => color('#12')).toThrow('bad colour literal #12');
  });

  it('mix() interpolates with rounding and returns the endpoints exactly', () => {
    const a: Rgba = [0, 10, 200, 255];
    const b: Rgba = [255, 20, 100, 0];
    expect(mix(a, b, 0)).toEqual(a);
    expect(mix(a, b, 1)).toEqual(b);
    expect(mix([0, 0, 0, 0], [255, 255, 255, 255], 0.5)).toEqual([128, 128, 128, 128]);
    expect(mix(a, b, 0.25)).toEqual([64, 13, 175, 191]);
  });

  it('withAlpha() replaces only the alpha and leaves its input alone', () => {
    const rgba: Rgba = [1, 2, 3, 4];
    expect(withAlpha(rgba, 99)).toEqual([1, 2, 3, 99]);
    expect(rgba).toEqual([1, 2, 3, 4]);
  });

  it('seedOf() is 32-bit FNV-1a (standard test vectors)', () => {
    expect(seedOf('')).toBe(0x811c9dc5);
    expect(seedOf('a')).toBe(0xe40c292c);
    expect(seedOf('foobar')).toBe(0xbf9cf968);
    expect(seedOf('fx/debris')).not.toBe(seedOf('fx/debrit'));
  });

  it('makeSprite() fills the defaults and records the generator as origin', () => {
    const frame = { width: 1, height: 1, data: new Uint8Array(4) };
    expect(makeSprite('ui/x', [frame], 'ui')).toEqual({
      name: 'ui/x',
      anchor: null,
      hitFlash: false,
      frames: [frame],
      animations: {},
      origin: 'procedural:ui',
    });
    expect(
      makeSprite('ui/x', [frame], 'ui', { anchor: [1, 2], hitFlash: true, animations: { a: [0] } }),
    ).toMatchObject({ anchor: [1, 2], hitFlash: true, animations: { a: [0] } });
  });
});
