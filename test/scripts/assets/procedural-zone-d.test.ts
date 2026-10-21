/**
 * The zone D placeholder art of plan M2-12 (`scripts/assets/procedural/magma.mjs`, split out of
 * `procedural-zones-de.test.ts` by R5-P.P5c): every zone D sprite drawn in its documented order,
 * size and frame count, with hit flashes on everything that can be hit; the lava lake painted only
 * in the ramp zone D's palette cycle names; volcano peaks that join at the tile edge; every
 * hurtbox of the roster inside the sprite drawn for it. Zone E's art is in
 * `procedural-zone-e.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as magma from '../../../scripts/assets/procedural/magma.mjs';
import {
  byName,
  content,
  hurtboxesInside,
  opaqueColours,
  seam,
} from './procedural-zone-helpers.js';

describe('scripts/assets/procedural/magma (M2-12)', () => {
  const sprites = magma.generate();

  it('draws the zone D sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...magma.MAGMA_SPRITES]);
    for (const sprite of sprites) {
      expect(sprite.hitFlash, sprite.name).toBe(!sprite.name.startsWith('bg/'));
      expect(sprite.origin).toBe('procedural:magma');
      const [first, ...rest] = sprite.frames;
      for (const frame of rest)
        expect([frame.width, frame.height]).toEqual([first.width, first.height]);
    }
    expect(byName(sprites, 'enemies/magma-cone').frames).toHaveLength(2);
    expect(byName(sprites, 'bosses/bastion-core').animations).toEqual({ glow: [0, 1] });
    expect(byName(sprites, 'bosses/bastion-hull').frames[0].width).toBe(56);
    hurtboxesInside('enemies/zone-d.enemies.json');
  });

  it('paints the lava lake only in the four ramp colours zone D cycles (and its crust floes)', () => {
    const lava = byName(sprites, 'bg/magma-lava');
    expect(lava.anchor).toEqual([0, 0]);
    const image = lava.frames[0];
    expect([image.width, image.height]).toEqual([magma.LAVA_TILE_W, magma.LAVA_TILE_H]);
    const colours = opaqueColours(image);
    for (const tone of magma.MAGMA_RAMP) expect(colours.has(tone), tone).toBe(true);
    expect([...colours].filter((c) => !magma.MAGMA_RAMP.includes(c))).toEqual(['#2a1a18']);
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    const stage = content<{ cycles: { colors: string[] }[] }>('stages/zone-d.stage.json');
    expect(stage.cycles[0].colors).toEqual([...magma.MAGMA_RAMP_V2]);
  });

  it('draws volcano peaks with glowing craters and smoke that join at the tile edge', () => {
    const image = byName(sprites, 'bg/magma-peaks').frames[0];
    expect([image.width, image.height]).toEqual([magma.PEAKS_TILE_W, magma.PEAKS_TILE_H]);
    expect(seam(image)).toBeLessThan(24);
    expect(opaqueColours(image).has('#f8b048')).toBe(true); // a crater
    let smoke = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] > 0 && image.data[i] < 255) smoke++;
    }
    expect(smoke).toBeGreaterThan(20);
  });

  it('is deterministic', () => {
    expect(magma.generate().map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});
