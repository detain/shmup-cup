/**
 * The zone C placeholder art of plan M2-11 (`scripts/assets/procedural/dune.mjs`, split out of
 * `procedural-zones.test.ts` by R5-P.P5c): every zone C sprite drawn in its documented order,
 * size and frame count, with hit flashes on everything that can be hit; the ridge band opaque
 * below its profile and joining at the tile edge; the twin suns' translucent glow with the red
 * kept for the widow alone.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as dune from '../../../scripts/assets/procedural/dune.mjs';
import { byName, mirroredVertically, opaqueColours } from './procedural-zone-helpers.js';

describe('scripts/assets/procedural/dune (M2-11)', () => {
  const sprites = dune.generate();

  it('draws the zone C sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...dune.DUNE_SPRITES]);
    for (const sprite of sprites) {
      const decoration = sprite.name.startsWith('bg/') || sprite.name.includes('widow-leg');
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:dune');
    }
    expect(byName(sprites, 'enemies/dust-devil').frames).toHaveLength(3);
    expect(byName(sprites, 'enemies/dust-devil').animations).toEqual({ spin: [0, 1, 2] });
    expect(
      mirroredVertically(
        byName(sprites, 'bosses/widow-leg-top').frames[0],
        byName(sprites, 'bosses/widow-leg-bottom').frames[0],
      ),
    ).toBe(true);
  });

  it('draws a ridge band opaque below its profile, joining at the tile edge', () => {
    const image = byName(sprites, 'bg/dune-ridge').frames[0];
    expect([image.width, image.height]).toEqual([dune.RIDGE_TILE_W, dune.RIDGE_TILE_H]);
    const top = (x: number): number => {
      for (let y = 0; y < image.height; y++) if (getPixel(image, x, y)[3] > 0) return y;
      return image.height;
    };
    for (let x = 0; x < image.width; x++) {
      for (let y = top(x); y < image.height; y++) expect(getPixel(image, x, y)[3]).toBe(255);
      expect(image.height - top(x)).toBeGreaterThan(8);
    }
    expect(Math.abs(top(0) - top(image.width - 1))).toBeLessThanOrEqual(2);
  });

  it('draws the twin suns in a translucent glow and keeps the red for the widow alone', () => {
    const suns = byName(sprites, 'bg/dune-suns').frames[0];
    expect([suns.width, suns.height]).toEqual([dune.SUNS_TILE_W, dune.SUNS_TILE_H]);
    let glow = 0;
    for (let i = 3; i < suns.data.length; i += 4)
      if (suns.data[i] > 0 && suns.data[i] < 255) glow++;
    expect(glow).toBeGreaterThan(100);
    expect(opaqueColours(byName(sprites, 'bosses/widow-body').frames[0]).has('#c83020')).toBe(true);
  });
});
