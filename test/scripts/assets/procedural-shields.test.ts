/**
 * The shield sprites (`scripts/assets/procedural/shields.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2. R4-01.A5 adds the native v2 path of the pod and the
 * Reduce shimmer (the art bible §5's 12×12 and 30×21 — the Force Field is R4-01.A4's).
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as shields from '../../../scripts/assets/procedural/shields.mjs';
import { color, withAlpha } from '../../../scripts/assets/procedural/common.mjs';
import { opaque, eachOpaque, key, opaqueCount, hue } from './procedural-helpers.js';

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

  describe('the native v2 path (R4-01.A5)', () => {
    const v2 = shields.generate({ artScale: 1.5 });
    const [, pod2, reduce2] = v2;

    it('draws the 12×12 shield pod native in four wear states (bible §5)', () => {
      expect(pod2.name).toBe('shields/pod');
      expect(pod2.native).toBe(true);
      expect(pod2.anchor).toBeNull();
      expect(pod2.animations).toEqual({ fresh: [0], worn: [1], damaged: [2], critical: [3] });
      expect(pod2.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([12, 12]));
      const counts = pod2.frames.map(opaqueCount);
      for (let s = 1; s < 4; s++) expect(counts[s]).toBeLessThan(counts[s - 1]);
      // Warm and faceted: the fresh rim row carries the state's rim hue, the band its rivets.
      const h = hue(getPixel(pod2.frames[0], 5, 0));
      expect(h >= 0 && h < 60, `hue ${h}`).toBe(true);
      const rim = key(getPixel(pod2.frames[0], 5, 0));
      const dark = key(color('#402008'));
      // The riveted band: rows 5–6, a rivet (rim ink) every third column, dark between.
      for (const x of [1, 4, 7, 10])
        expect(key(getPixel(pod2.frames[0], x, 5)), `x ${x}`).toBe(rim);
      for (const x of [2, 3, 5, 6, 8, 9])
        expect(key(getPixel(pod2.frames[0], x, 5)), `x ${x}`).toBe(dark);
      for (const x of [1, 4, 7, 10])
        expect(key(getPixel(pod2.frames[0], x, 6)), `x ${x}`).toBe(rim);
      // The v2 pod draws with the v1 palette only (the cycle-ramp scan stays honest).
      const colours = new Set<string>();
      for (const frame of pod2.frames)
        eachOpaque(frame, (_x, _y, rgba) => void colours.add(key(rgba)));
      const palette = [
        '#ffc040',
        '#fff0b0',
        '#f89830',
        '#ffd080',
        '#e86020',
        '#f8a060',
        '#c02818',
        '#e86040',
        '#402008',
      ].map((hex) => key(color(hex)));
      for (const k of colours) expect(palette, k).toContain(k);
    });

    it('draws Reduce as a dotted native 30×21 ring, sparser one hit down (bible §5)', () => {
      expect(reduce2.name).toBe('shields/reduce');
      expect(reduce2.native).toBe(true);
      expect(reduce2.anchor).toBeNull();
      expect(reduce2.animations).toEqual({ full: [0], worn: [1] });
      expect(reduce2.frames.map((f) => [f.width, f.height])).toEqual(Array(2).fill([30, 21]));
      const [full, worn] = reduce2.frames.map(opaqueCount);
      expect(full).toBeGreaterThan(0);
      expect(worn).toBeLessThan(full);
      // A ring: the middle (where the ship is) stays clear.
      expect(opaque(reduce2.frames[0], 15, 10)).toBe(false);
      // The v1 palette exactly: the bright ring and the translucent inner band, no new colour.
      const colours = new Set<string>();
      for (const frame of reduce2.frames)
        eachOpaque(frame, (_x, _y, rgba) => void colours.add(key(rgba)));
      expect([...colours].sort()).toEqual(
        [key(color('#70ff90')), key(withAlpha(color('#c0ffd0'), 160))].sort(),
      );
    });

    it('leaves the Force Field at its v1 geometry here (R4-01.A4 owns it)', () => {
      const field2 = v2[0];
      expect(field2.name).toBe('shields/force-field');
      expect(field2.native).toBeUndefined();
      expect(field2.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([30, 24]));
      expect(imagesEqual(field2.frames[0], shields.generate()[0].frames[0])).toBe(true);
    });

    it('leaves art scale 1 byte-identical to the unmarked call, native unmarked', () => {
      const one = shields.generate({ artScale: 1 });
      const v1 = shields.generate();
      expect(one.map((s) => s.name)).toEqual(v1.map((s) => s.name));
      one.forEach((sprite, k) => {
        expect(sprite.native, sprite.name).toBeUndefined();
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, v1[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });

    it('is deterministic: two v2 runs draw the same pixels', () => {
      const again = shields.generate({ artScale: 1.5 });
      again.forEach((sprite, k) => {
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, v2[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });

    it('ships the pod and reduce frame counts core reads at the default scale', () => {
      const two = buildAtlas({ artScale: 1.5 });
      expect(two.manifest.sprites['shields/pod'].frames).toHaveLength(4);
      expect(two.manifest.sprites['shields/reduce'].frames).toHaveLength(2);
      expect([
        two.manifest.frames['shields/pod#0'].w,
        two.manifest.frames['shields/pod#0'].h,
      ]).toEqual([12, 12]);
      expect([
        two.manifest.frames['shields/reduce#0'].w,
        two.manifest.frames['shields/reduce#0'].h,
      ]).toEqual([30, 21]);
    });
  });
});
