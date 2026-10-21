/**
 * The explosion frames (`scripts/assets/procedural/explosions.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as explosions from '../../../scripts/assets/procedural/explosions.mjs';
import { key, eachOpaque, opaqueCount, luma } from './procedural-helpers.js';

describe('scripts/assets/procedural/explosions', () => {
  const sprites = explosions.generate();
  const ramp = new Set<string>();

  it('draws small (16², 6 frames), medium (32², 7) and large (48², 8) with a burst animation', () => {
    expect(sprites.map((s) => [s.name, s.frames.length, s.frames[0].width])).toEqual([
      ['fx/explosion-small', 6, 16],
      ['fx/explosion-medium', 7, 32],
      ['fx/explosion-large', 8, 48],
    ]);
    for (const sprite of sprites) {
      expect(sprite.animations).toEqual({ burst: sprite.frames.map((_, i) => i) });
      for (const frame of sprite.frames) {
        expect(opaqueCount(frame), sprite.name).toBeGreaterThan(0);
        eachOpaque(frame, (_x, _y, rgba) => {
          expect(rgba[3]).toBe(255);
          ramp.add(key(rgba));
        });
      }
    }
    expect(ramp.size).toBeLessThanOrEqual(7); // one hot → cold ramp
  });

  it('starts white-hot in the centre and ends cooler than it started', () => {
    for (const sprite of sprites) {
      const first = sprite.frames[0];
      const last = sprite.frames[sprite.frames.length - 1];
      const c = Math.floor(first.width / 2);
      const centre = getPixel(first, c, c);
      expect(luma(centre), sprite.name).toBeGreaterThan(200);
      let firstLuma = 0;
      let lastLuma = 0;
      eachOpaque(first, (_x, _y, rgba) => {
        firstLuma += luma(rgba);
      });
      eachOpaque(last, (_x, _y, rgba) => {
        lastLuma += luma(rgba);
      });
      expect(lastLuma / opaqueCount(last)).toBeLessThan(firstLuma / opaqueCount(first));
    }
  });

  // R4-04.D1: the v2 path (art bible v2 §5.8) — the plain cases above call the v1 path.
  describe('v2 (artScale 1.5, R4-04.D1)', () => {
    const v2 = explosions.generate({ artScale: 1.5 });

    it('draws small (24², 12 frames), medium (48², 14) and large (72², 16), all native', () => {
      expect(
        v2.map((s) => [s.name, s.frames.length, s.frames[0].width, s.native === true]),
      ).toEqual([
        ['fx/explosion-small', 12, 24, true],
        ['fx/explosion-medium', 14, 48, true],
        ['fx/explosion-large', 16, 72, true],
      ]);
      for (const sprite of v2) {
        expect(sprite.animations).toEqual({ burst: sprite.frames.map((_, i) => i) });
        for (const frame of sprite.frames) {
          expect(frame.width).toBe(frame.height);
          expect(opaqueCount(frame), sprite.name).toBeGreaterThan(0);
          eachOpaque(frame, (_x, _y, rgba) => {
            expect(rgba[3]).toBe(255); // binary alpha (art bible v2 §3.6)
          });
        }
      }
    });

    it('opens on the white star flash: frame 0 is white on the cross, frame 1 is not', () => {
      for (const sprite of v2) {
        const first = sprite.frames[0];
        const size = first.width;
        const c = Math.floor(size / 2);
        for (const [x, y] of [
          [c, c], // the core
          [c, 4], // the vertical arm, upper end
          [c, size - 5], // the vertical arm, lower end
          [4, c], // the horizontal arm, left end
          [size - 5, c], // the horizontal arm, right end
        ]) {
          const rgba = getPixel(first, x, y);
          expect([rgba[0], rgba[1], rgba[2]], `${sprite.name} (${x},${y})`).toEqual([
            255, 255, 255,
          ]);
          expect(rgba[3], sprite.name).toBe(255);
        }
        // The later frames are the fireball: beside the arm's reach, frame 1 is transparent.
        const second = sprite.frames[1];
        expect(getPixel(second, 2, c)[3]).toBe(0);
      }
    });

    it('stays the one hot → cold ramp (no new colours — wave rule 10)', () => {
      const v1Ramp = new Set<string>();
      for (const sprite of sprites)
        for (const frame of sprite.frames)
          eachOpaque(frame, (_x, _y, rgba) => v1Ramp.add(key(rgba)));
      const v2Ramp = new Set<string>();
      for (const sprite of v2)
        for (const frame of sprite.frames)
          eachOpaque(frame, (_x, _y, rgba) => v2Ramp.add(key(rgba)));
      for (const colour of v2Ramp) expect(v1Ramp.has(colour), colour).toBe(true);
    });

    it('still cools: every v2 sprite ends darker than it started', () => {
      for (const sprite of v2) {
        const first = sprite.frames[0];
        const last = sprite.frames[sprite.frames.length - 1];
        let firstLuma = 0;
        let lastLuma = 0;
        eachOpaque(first, (_x, _y, rgba) => {
          firstLuma += luma(rgba);
        });
        eachOpaque(last, (_x, _y, rgba) => {
          lastLuma += luma(rgba);
        });
        expect(lastLuma / opaqueCount(last)).toBeLessThan(firstLuma / opaqueCount(first));
      }
    });
  });
});
