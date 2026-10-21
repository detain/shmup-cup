/**
 * The shield sprites (`scripts/assets/procedural/shields.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as shields from '../../../scripts/assets/procedural/shields.mjs';
import { opaque, eachOpaque, opaqueCount, hue } from './procedural-helpers.js';

describe('scripts/assets/procedural/shields', () => {
  const [field, pod, reduce] = shields.generate();

  it('draws the 8×8 shield pod in four wear states that lose pixels as they wear (M2-04)', () => {
    expect(pod.name).toBe('shields/pod');
    expect(pod.animations).toEqual({ fresh: [0], worn: [1], damaged: [2], critical: [3] });
    expect(pod.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([8, 8]));
    const counts = pod.frames.map(opaqueCount);
    for (let s = 1; s < 4; s++) expect(counts[s]).toBeLessThan(counts[s - 1]);
    // Warm (gold → red) — never a bullet colour's cool hue.
    const h = hue(getPixel(pod.frames[0], 1, 3));
    expect(h >= 0 && h < 60, `hue ${h}`).toBe(true);
  });

  it('draws Reduce as a dotted 20×14 ring, sparser one hit down (M2-04)', () => {
    expect(reduce.name).toBe('shields/reduce');
    expect(reduce.animations).toEqual({ full: [0], worn: [1] });
    expect(reduce.frames.map((f) => [f.width, f.height])).toEqual(Array(2).fill([20, 14]));
    const [full, worn] = reduce.frames.map(opaqueCount);
    expect(full).toBeGreaterThan(0);
    expect(worn).toBeLessThan(full);
    // A ring: the middle (where the ship is) stays clear.
    expect(opaque(reduce.frames[0], 10, 7)).toBe(false);
  });

  it('draws four 30×24 wear states that lose pixels as they wear', () => {
    expect(field.name).toBe('shields/force-field');
    expect(field.animations).toEqual({ fresh: [0], worn: [1], damaged: [2], critical: [3] });
    expect(field.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([30, 24]));
    const counts = field.frames.map(opaqueCount);
    for (let s = 1; s < 4; s++) expect(counts[s]).toBeLessThan(counts[s - 1]);
  });

  it('has an inner glow (translucent) except in the critical state, and a whole fresh ring', () => {
    const translucent = field.frames.map((frame) => {
      let count = 0;
      eachOpaque(frame, (_x, _y, rgba) => {
        if (rgba[3] < 255) count++;
      });
      return count;
    });
    expect(translucent.slice(0, 3).every((n) => n > 0)).toBe(true);
    expect(translucent[3]).toBe(0);
    const fresh = field.frames[0];
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 30; x++) {
        expect(getPixel(fresh, x, y)).toEqual(getPixel(fresh, 29 - x, y));
        expect(getPixel(fresh, x, y)).toEqual(getPixel(fresh, x, 23 - y));
      }
    }
  });
});
