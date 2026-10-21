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
});
