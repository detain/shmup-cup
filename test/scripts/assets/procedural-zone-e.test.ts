/**
 * The zone E placeholder art of plan M2-12 (`scripts/assets/procedural/tempest.mjs`, split out of
 * `procedural-zones-de.test.ts` by R5-P.P5c): every zone E sprite drawn in its documented order,
 * size and frame count, with hit flashes on everything that can be hit; the storm clouds painted
 * only in the ramp zone E's palette cycle names, open sky between; the ridge and rain bands
 * repeating along x; mirrored chest lids; every hurtbox of the roster inside the sprite drawn for
 * it. Zone D's art is in `procedural-zone-d.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as tempest from '../../../scripts/assets/procedural/tempest.mjs';
import {
  byName,
  content,
  hurtboxesInside,
  opaqueColours,
  seam,
} from './procedural-zone-helpers.js';

describe('scripts/assets/procedural/tempest (M2-12)', () => {
  const sprites = tempest.generate();

  it('draws the zone E sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...tempest.TEMPEST_SPRITES]);
    for (const sprite of sprites) {
      const decoration =
        sprite.name.startsWith('bg/') ||
        sprite.name === 'bosses/steed-tail' ||
        sprite.name === 'bosses/steed-fin';
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:tempest');
    }
    expect(byName(sprites, 'enemies/thunderhead').animations).toEqual({ flicker: [0, 1, 2] });
    const top = byName(sprites, 'bosses/steed-lid-top').frames[0];
    const bottom = byName(sprites, 'bosses/steed-lid-bottom').frames[0];
    for (let y = 0; y < top.height; y++) {
      for (let x = 0; x < top.width; x++) {
        expect(getPixel(top, x, y).join()).toBe(getPixel(bottom, x, top.height - 1 - y).join());
      }
    }
    hurtboxesInside('enemies/zone-e.enemies.json');
  });

  it('paints the storm clouds only in the four ramp colours zone E cycles, open sky between', () => {
    const image = byName(sprites, 'bg/storm-clouds').frames[0];
    expect([image.width, image.height]).toEqual([tempest.CLOUDS_TILE_W, tempest.CLOUDS_TILE_H]);
    const colours = opaqueColours(image);
    expect([...colours].sort()).toEqual([...tempest.STORM_RAMP].sort());
    let open = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      expect([0, 255]).toContain(image.data[i]);
      if (image.data[i] === 0) open++;
    }
    expect(open).toBeGreaterThan(200);
    expect(seam(image)).toBeLessThan(24);
    const stage = content<{ cycles: { colors: string[] }[] }>('stages/zone-e.stage.json');
    expect(stage.cycles[0].colors).toEqual([...tempest.STORM_RAMP]);
  });

  it('draws a jagged ridge band and a translucent rain band, both repeating along x', () => {
    const ridge = byName(sprites, 'bg/storm-ridge').frames[0];
    expect([ridge.width, ridge.height]).toEqual([tempest.RIDGE_TILE_W, tempest.RIDGE_TILE_H]);
    expect(seam(ridge)).toBeLessThan(24);
    for (let x = 0; x < ridge.width; x++) expect(getPixel(ridge, x, ridge.height - 1)[3]).toBe(255);
    const rain = byName(sprites, 'bg/storm-rain').frames[0];
    expect([rain.width, rain.height]).toEqual([tempest.RAIN_TILE_W, tempest.RAIN_TILE_H]);
    let drops = 0;
    for (let i = 3; i < rain.data.length; i += 4) {
      expect(rain.data[i]).toBeLessThan(255); // never opaque: the sky shows through
      if (rain.data[i] > 0) drops++;
    }
    expect(drops).toBeGreaterThan(100);
  });

  it('is deterministic', () => {
    expect(tempest.generate().map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});
