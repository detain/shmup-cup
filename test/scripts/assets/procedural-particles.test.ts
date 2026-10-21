/**
 * The particle sprites (`scripts/assets/procedural/particles.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as particles from '../../../scripts/assets/procedural/particles.mjs';
import { byName, opaque, opaqueCount, rotateCw } from './procedural-helpers.js';

describe('scripts/assets/procedural/particles', () => {
  const sprites = particles.generate();

  it('draws a 5×5 spark whose plus-shaped arms shrink (9 → 5 → 1 pixels)', () => {
    const spark = byName(sprites, 'fx/spark');
    expect(spark.animations).toEqual({ fade: [0, 1, 2] });
    expect(spark.frames.map((f) => [f.width, f.height])).toEqual([
      [5, 5],
      [5, 5],
      [5, 5],
    ]);
    expect(spark.frames.map(opaqueCount)).toEqual([9, 5, 1]);
    for (const frame of spark.frames) expect(opaque(frame, 2, 2)).toBe(true);
  });

  it('draws a 5×5 pale-gold sparkle that twinkles down to one pixel (M1-14)', () => {
    const sparkle = byName(sprites, 'fx/sparkle');
    expect(sparkle.animations).toEqual({ twinkle: [0, 1, 2, 3] });
    expect(sparkle.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([5, 5]));
    expect(sparkle.frames.map(opaqueCount)).toEqual([9, 9, 5, 1]);
    for (const frame of sparkle.frames) expect(opaque(frame, 2, 2)).toBe(true);
  });

  it('draws a 9×9 one-pixel ring that grows over four frames (M1-14)', () => {
    const ring = byName(sprites, 'fx/ring');
    expect(ring.animations).toEqual({ grow: [0, 1, 2, 3] });
    expect(ring.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([9, 9]));
    const counts = ring.frames.map(opaqueCount);
    for (let k = 1; k < 4; k++) expect(counts[k]).toBeGreaterThan(counts[k - 1]);
    // Hollow: the centre pixel is never set.
    for (const frame of ring.frames) expect(opaque(frame, 4, 4)).toBe(false);
  });

  it('draws 6×6 debris that tumbles in exact 90° turns', () => {
    const debris = byName(sprites, 'fx/debris');
    expect(debris.animations).toEqual({ tumble: [0, 1, 2, 3] });
    expect(debris.frames).toHaveLength(4);
    expect(opaqueCount(debris.frames[0])).toBeGreaterThan(3);
    for (let k = 0; k < 4; k++) {
      expect(Buffer.from(debris.frames[(k + 1) % 4].data)).toEqual(
        Buffer.from(rotateCw(debris.frames[k])),
      );
    }
  });
});
