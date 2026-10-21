/**
 * The zone G placeholder art of plan M2-13 (`scripts/assets/procedural/prism.mjs`, split out of
 * `procedural-zones-fg.test.ts` by R5-P.P5c): every zone G sprite drawn in its documented order,
 * size and frame count, with hit flashes on everything that can be hit (not on the monarch's
 * housing — decoration); the crystal facets painted only in the ramp zone G's palette cycle names,
 * repeating across and down; the spire band repeating along x; animated frames that differ; every
 * hurtbox of the roster inside the sprite drawn for it. Zone F's art and the pair's shared tileset
 * check are in `procedural-zone-f.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as prism from '../../../scripts/assets/procedural/prism.mjs';
import {
  byName,
  content,
  framesDiffer,
  hurtboxesInside,
  opaqueColours,
  seam,
  wraps,
} from './procedural-zone-helpers.js';

/**
 * The zone G boxes with the same 1 px rounding allowance (seven, per `w5pre/hurtbox.mjs`): the
 * shard's hurtbox and the monarch's six arm segments.
 */
const ZONE_G_ROUNDED_BOXES: ReadonlySet<string> = new Set([
  'geode-shard',
  'arm-top-1',
  'arm-top-2',
  'arm-top-3',
  'arm-bottom-1',
  'arm-bottom-2',
  'arm-bottom-3',
]);

describe('scripts/assets/procedural/prism (M2-13)', () => {
  const sprites = prism.generate();

  it('draws the zone G sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...prism.PRISM_SPRITES]);
    for (const sprite of sprites) {
      const decoration = sprite.name.startsWith('bg/') || sprite.name === 'bosses/facet-body';
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:prism');
    }
    expect(byName(sprites, 'enemies/prism-cube').frames[0].width).toBe(8);
    expect(byName(sprites, 'bosses/facet-core').animations).toEqual({ glow: [0, 1] });
    expect(byName(sprites, 'bosses/facet-body').frames[0].height).toBe(56);
    framesDiffer(sprites);
    hurtboxesInside('enemies/zone-g.enemies.json', ZONE_G_ROUNDED_BOXES);
  });

  it('paints the crystal facets only in the four ramp colours zone G cycles, repeating both ways', () => {
    const facets = byName(sprites, 'bg/prism-facets');
    expect(facets.anchor).toEqual([0, 0]);
    const image = facets.frames[0];
    expect([image.width, image.height]).toEqual([prism.FACETS_TILE_W, prism.FACETS_TILE_H]);
    expect([...opaqueColours(image)].sort()).toEqual([...prism.PRISM_RAMP].sort());
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    expect(wraps(image)).toBeGreaterThan(0.9);
    const stage = content<{ cycles: { colors: string[] }[] }>('stages/zone-g.stage.json');
    expect(stage.cycles[0].colors).toEqual([...prism.PRISM_RAMP_V2]);
  });

  it('draws sharp crystal spires with lit edges, opaque at the bottom and repeating along x', () => {
    const image = byName(sprites, 'bg/prism-spires').frames[0];
    expect([image.width, image.height]).toEqual([prism.SPIRES_TILE_W, prism.SPIRES_TILE_H]);
    expect(seam(image)).toBeLessThan(24);
    for (let x = 0; x < image.width; x++) expect(getPixel(image, x, image.height - 1)[3]).toBe(255);
    expect(opaqueColours(image).has('#8ab4d8')).toBe(true); // a lit edge
  });

  it('is deterministic', () => {
    expect(prism.generate().map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});
