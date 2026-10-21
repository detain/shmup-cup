/**
 * The particle sprites (`scripts/assets/procedural/particles.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as particles from '../../../scripts/assets/procedural/particles.mjs';
import { byName, eachOpaque, opaque, opaqueCount, rotateCw } from './procedural-helpers.js';

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

  // R4-04.D2: the v2 path (art bible v2 §5.8) — the plain cases above call the v1 path.
  describe('v2 (artScale 1.5, R4-04.D2)', () => {
    const v2 = particles.generate({ artScale: 1.5 });

    it('draws spark 7×7 × 4, sparkle 7×7 × 4, debris 9×9 × 4 and ring 13×13 × 6, all native', () => {
      expect(
        v2.map((s) => [s.name, s.frames.length, s.frames[0].width, s.native === true]),
      ).toEqual([
        ['fx/spark', 4, 7, true],
        ['fx/debris', 4, 9, true],
        ['fx/sparkle', 4, 7, true],
        ['fx/ring', 6, 13, true],
      ]);
      for (const sprite of v2) {
        for (const frame of sprite.frames) {
          expect(frame.width).toBe(frame.height);
          eachOpaque(frame, (_x, _y, rgba) => expect(rgba[3]).toBe(255)); // binary alpha
        }
      }
    });

    it('keeps the animations tags over the new frames (fade, twinkle, tumble, grow)', () => {
      expect(byName(v2, 'fx/spark').animations).toEqual({ fade: [0, 1, 2, 3] });
      expect(byName(v2, 'fx/sparkle').animations).toEqual({ twinkle: [0, 1, 2, 3] });
      expect(byName(v2, 'fx/debris').animations).toEqual({ tumble: [0, 1, 2, 3] });
      expect(byName(v2, 'fx/ring').animations).toEqual({ grow: [0, 1, 2, 3, 4, 5] });
    });

    it('shrinks the spark plus one step further (13 → 9 → 5 → 1) and twinkles the sparkle', () => {
      expect(byName(v2, 'fx/spark').frames.map(opaqueCount)).toEqual([13, 9, 5, 1]);
      expect(byName(v2, 'fx/sparkle').frames.map(opaqueCount)).toEqual([13, 13, 5, 1]);
      for (const frame of byName(v2, 'fx/spark').frames) expect(opaque(frame, 3, 3)).toBe(true);
      for (const frame of byName(v2, 'fx/sparkle').frames) expect(opaque(frame, 3, 3)).toBe(true);
    });

    it('tumbles the 9×9 debris in exact 90° turns', () => {
      const debris = byName(v2, 'fx/debris');
      expect(opaqueCount(debris.frames[0])).toBeGreaterThan(3);
      for (let k = 0; k < 4; k++) {
        expect(Buffer.from(debris.frames[(k + 1) % 4].data)).toEqual(
          Buffer.from(rotateCw(debris.frames[k])),
        );
      }
    });

    it('grows the ring over the whole 13×13 frame, hollow, and fades it to the dim blue', () => {
      const ring = byName(v2, 'fx/ring');
      // Growth is the axial reach (radius 1 … 6 — pixel counts quantise, the circle grows):
      for (let k = 0; k < 6; k++) {
        expect(opaque(ring.frames[k], 6, 6 - (k + 1)), `radius ${k + 1}`).toBe(true);
      }
      for (const frame of ring.frames) expect(opaque(frame, 6, 6)).toBe(false); // hollow centre
      expect(opaque(ring.frames[5], 0, 6)).toBe(true); // radius 6 reaches the frame edge
    });

    it('stays v1’s colour sets (no new colours — wave rule 10)', () => {
      const colours = (list: typeof sprites) => {
        const set = new Set<string>();
        for (const sprite of list) {
          for (const frame of sprite.frames) {
            eachOpaque(frame, (_x, _y, rgba) => set.add(`${rgba[0]},${rgba[1]},${rgba[2]}`));
          }
        }
        return set;
      };
      const v1 = colours(sprites);
      for (const colour of colours(v2)) expect(v1.has(colour), colour).toBe(true);
    });
  });
});
