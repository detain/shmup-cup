/**
 * The Direct-mode shot sprites (`scripts/assets/procedural/direct.mjs`; the colour items
 * and the Arm moved to `direct-items.mjs` and `arm.mjs` in plan R4-P.P1). Split out of
 * `procedural.test.ts` by plan R4-P.P2. R4-01.A7 adds the native v2 paths of the eight shots
 * (the art bible §5's sizes, the v1 geometry ×1.5).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as direct from '../../../scripts/assets/procedural/direct.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { byName, key, opaque, opaqueCount } from './procedural-helpers.js';

describe('scripts/assets/procedural/direct', () => {
  const sprites = direct.generate();

  it('generates the eight Direct-mode shot sprites', () => {
    expect(sprites.map((s) => s.name)).toEqual([
      'shots/direct-missile',
      'shots/disc',
      'shots/beam',
      'shots/wave',
      'shots/sub-bomb',
      'shots/sub-laser',
      'shots/sub-laser-wide',
      'shots/sub-disc',
    ]);
  });

  it('draws the shots at their sizes and frame counts (M2-05)', () => {
    const expected: Record<string, readonly [string, number]> = {
      'shots/direct-missile': ['12×6', 2],
      'shots/disc': ['20×20', 4],
      'shots/beam': ['26×8', 4],
      'shots/wave': ['16×34', 4],
      'shots/sub-bomb': ['6×6', 1],
      'shots/sub-laser': ['9×9', 8],
      'shots/sub-laser-wide': ['11×11', 8],
      'shots/sub-disc': ['12×12', 2],
    };
    for (const [name, [size, frames]] of Object.entries(expected)) {
      const sprite = byName(sprites, name);
      const [first] = sprite.frames;
      expect(`${first.width}×${first.height}`, name).toBe(size);
      expect(sprite.frames.length, name).toBe(frames);
    }
  });

  it('tags every shot with the direct generator (R4-P.P1)', () => {
    for (const sprite of sprites) expect(sprite.origin).toBe('procedural:direct');
  });

  describe('the native v2 path (R4-01.A7)', () => {
    const spritesV2 = direct.generate({ artScale: 1.5 });

    it('draws the eight shots at the bible sizes with v1 frame counts', () => {
      const expected: Record<string, readonly [string, number]> = {
        'shots/direct-missile': ['18×9', 2],
        'shots/disc': ['30×30', 4],
        'shots/beam': ['39×12', 4],
        'shots/wave': ['24×51', 4],
        'shots/sub-bomb': ['9×9', 1],
        'shots/sub-laser': ['13×13', 8],
        'shots/sub-laser-wide': ['17×17', 8],
        'shots/sub-disc': ['18×18', 2],
      };
      expect(spritesV2.map((s) => s.name)).toEqual(Object.keys(expected));
      for (const [name, [size, frames]] of Object.entries(expected)) {
        const sprite = byName(spritesV2, name);
        expect(sprite.native, name).toBe(true);
        expect(sprite.anchor, name).toBeNull();
        expect(sprite.origin, name).toBe('procedural:direct');
        const [first] = sprite.frames;
        expect(`${first.width}×${first.height}`, name).toBe(size);
        for (const frame of sprite.frames)
          expect(`${frame.width}×${frame.height}`, name).toBe(size);
        expect(sprite.frames.length, name).toBe(frames);
      }
    });

    it('keeps the missiles an orange pill with a white-hot tip, native', () => {
      const missile = byName(spritesV2, 'shots/direct-missile');
      const tip = key(color('#ffffff'));
      const body = key(color('#e06018'));
      // The tip block sits at the front of both frames (columns 13–14 / 15–16, rows 3–5).
      expect(key(getPixel(missile.frames[0], 13, 4))).toBe(tip);
      expect(key(getPixel(missile.frames[1], 16, 4))).toBe(tip);
      expect(key(getPixel(missile.frames[0], 2, 4))).toBe(body);
      // Frame 1 is the wider missile: strictly more pixels.
      expect(opaqueCount(missile.frames[1])).toBeGreaterThan(opaqueCount(missile.frames[0]));
    });

    it('grows the discs and sub-discs in the frame order core picks by size', () => {
      for (const name of ['shots/disc', 'shots/sub-disc']) {
        const disc = byName(spritesV2, name);
        let previous = 0;
        for (const frame of disc.frames) {
          const count = opaqueCount(frame);
          expect(count, name).toBeGreaterThan(previous);
          previous = count;
          // A white core in the middle, the rim band at the edge.
          expect(key(getPixel(frame, frame.width / 2, frame.height / 2))).toBe(
            key(color('#ffffff')),
          );
        }
      }
      const disc = byName(spritesV2, 'shots/disc');
      expect(key(getPixel(disc.frames[3], 15, 1))).toBe(key(color('#e07018'))); // rim
      expect(key(getPixel(disc.frames[3], 15, 6))).toBe(key(color('#ffd840'))); // ring
    });

    it('draws the beams as wider pills with a bright core, native', () => {
      const beam = byName(spritesV2, 'shots/beam');
      // Frame 0: the thin blue bolt — edge colour above and below the core rows.
      expect(key(getPixel(beam.frames[0], 19, 5))).toBe(key(color('#e0f0ff')));
      expect(key(getPixel(beam.frames[0], 19, 4))).toBe(key(color('#3878ff')));
      let previous = 0;
      for (const frame of beam.frames) {
        const count = opaqueCount(frame);
        expect(count).toBeGreaterThan(previous);
        previous = count;
      }
    });

    it('draws the crescent waves opening forward, growing 10.5 → 24 half height', () => {
      const wave = byName(spritesV2, 'shots/wave');
      let previous = 0;
      let previousFront = 0;
      for (const frame of wave.frames) {
        const count = opaqueCount(frame);
        expect(count).toBeGreaterThan(previous);
        previous = count;
        // The mid row is never empty and its front reaches further right every frame (the
        // crescent opens forward); the back column 0 and the rim row 0 are always empty.
        let front = -1;
        for (let x = 0; x < 24; x++) if (opaque(frame, x, 25)) front = x;
        expect(front).toBeGreaterThanOrEqual(18);
        expect(front).toBeGreaterThanOrEqual(previousFront);
        previousFront = front;
        expect(opaque(frame, 0, 25)).toBe(false);
        expect(opaque(frame, 12, 0)).toBe(false);
      }
    });

    it('draws 8 heading octants of the sub-lasers, thin one pixel wide', () => {
      const thin = byName(spritesV2, 'shots/sub-laser');
      // Every octant is the same 11-pixel line (reach 5, two core pixels at its head).
      for (const frame of thin.frames) expect(opaqueCount(frame)).toBe(11);
      // Frame 2 points down: a core tip at (6, 11) and no glow beside the line.
      expect(key(getPixel(thin.frames[2], 6, 11))).toBe(key(color('#f0fff0')));
      expect(opaque(thin.frames[2], 7, 11)).toBe(false);
      const wide = byName(spritesV2, 'shots/sub-laser-wide');
      // The wide bolt glows across its line too.
      expect(opaque(wide.frames[0], 15, 8)).toBe(true);
      expect(opaque(wide.frames[0], 15, 7)).toBe(true);
    });

    it('leaves art scale 1 byte-identical to the unmarked call, native unmarked', () => {
      const plain = direct.generate();
      const one = direct.generate({ artScale: 1 });
      expect(one.map((s) => s.name)).toEqual(plain.map((s) => s.name));
      for (let i = 0; i < plain.length; i++) {
        expect(plain[i].native).toBeUndefined();
        expect(one[i].native).toBeUndefined();
        for (let f = 0; f < plain[i].frames.length; f++)
          expect(imagesEqual(one[i].frames[f], plain[i].frames[f]), `${plain[i].name}#${f}`).toBe(
            true,
          );
      }
    });

    it('is deterministic: two v2 runs draw the same pixels', () => {
      const again = direct.generate({ artScale: 1.5 });
      for (let i = 0; i < spritesV2.length; i++)
        for (let f = 0; f < spritesV2[i].frames.length; f++)
          expect(imagesEqual(spritesV2[i].frames[f], again[i].frames[f])).toBe(true);
    });

    it('ships the shot sizes core draws at the default scale, the interim path untouched', () => {
      const two = buildAtlas({ artScale: 1.5 });
      const sizes: Record<string, readonly [number, number]> = {
        'shots/direct-missile': [18, 9],
        'shots/disc': [30, 30],
        'shots/beam': [39, 12],
        'shots/wave': [24, 51],
        'shots/sub-bomb': [9, 9],
        'shots/sub-laser': [13, 13],
        'shots/sub-laser-wide': [17, 17],
        'shots/sub-disc': [18, 18],
      };
      for (const [name, [w, h]] of Object.entries(sizes)) {
        expect(two.manifest.sprites[name].frames.length, name).toBe(
          byName(spritesV2, name).frames.length,
        );
        expect(two.manifest.frames[`${name}#0`].w, name).toBe(w);
        expect(two.manifest.frames[`${name}#0`].h, name).toBe(h);
      }
      const one = buildAtlas({ artScale: 1 });
      expect(one.manifest.frames['shots/disc#0'].w).toBe(20);
      expect(one.manifest.frames['shots/wave#0'].h).toBe(34);
    });
  });
});
