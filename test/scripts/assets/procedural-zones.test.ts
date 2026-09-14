/**
 * The placeholder art of plan M2-11 (`scripts/assets/procedural/brine.mjs`, `dune.mjs`, the zone
 * tilesets of `terrain.mjs` and the shape helpers of `common.mjs`): every zone B and C sprite drawn
 * in its documented order, size and frame count, with hit flashes on everything that can be hit;
 * the brine sea painted only in the ramp zone B's palette cycle names; seamless bands; mirrored
 * jaws and legs; the three tilesets sharing every tile's shape in their own colours.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createImage, getPixel, type Image } from '../../../scripts/assets/image.mjs';
import * as brine from '../../../scripts/assets/procedural/brine.mjs';
import { color, drawLine, fillEllipse } from '../../../scripts/assets/procedural/common.mjs';
import * as dune from '../../../scripts/assets/procedural/dune.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

/**
 * A sprite of a generator's output by name.
 *
 * @param sprites - The output.
 * @param name - Sprite name.
 * @returns The sprite.
 */
function byName(sprites: readonly SpriteDef[], name: string): SpriteDef {
  const sprite = sprites.find((s) => s.name === name);
  if (sprite === undefined) throw new Error(`no ${name}`);
  return sprite;
}

/**
 * The `#rrggbb` colours of an image's opaque pixels.
 *
 * @param image - The image.
 * @returns The set of colours.
 */
function opaqueColours(image: Image): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = getPixel(image, x, y);
      if (a === 255) out.add('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));
    }
  }
  return out;
}

/**
 * Whether an image is the vertical mirror of another.
 *
 * @param a - One image.
 * @param b - The other.
 * @returns `true` when row `y` of `a` is row `h − 1 − y` of `b`.
 */
function mirroredVertically(a: Image, b: Image): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (getPixel(a, x, y).join() !== getPixel(b, x, a.height - 1 - y).join()) return false;
    }
  }
  return true;
}

describe('scripts/assets/procedural/common — shape helpers (M2-11)', () => {
  it('fillEllipse paints only the pixels inside the ellipse, handing out their offsets', () => {
    const image = createImage(9, 5);
    const seen: number[] = [];
    fillEllipse(image, 4, 2, 4, 2, (u, v, e) => {
      seen.push(e);
      expect(Math.abs(u)).toBeLessThanOrEqual(1);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      return color('#ffffff');
    });
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    expect(getPixel(image, 4, 2)[3]).toBe(255);
    expect(getPixel(image, 0, 0)[3]).toBe(0); // a corner lies outside
    // `null` leaves a pixel alone; shapes overhanging the image are clipped.
    const other = createImage(4, 4);
    fillEllipse(other, 0, 0, 6, 6, () => null);
    expect(Array.from(other.data).every((v) => v === 0)).toBe(true);
  });

  it('drawLine sets both end points, and a wider line more pixels', () => {
    const thin = createImage(10, 10);
    drawLine(thin, 1, 1, 8, 6, color('#ff0000'));
    expect(getPixel(thin, 1, 1)[0]).toBe(255);
    expect(getPixel(thin, 8, 6)[0]).toBe(255);
    const wide = createImage(10, 10);
    drawLine(wide, 1, 1, 8, 6, color('#ff0000'), 3);
    const count = (image: Image): number =>
      Array.from({ length: 100 }, (_v, i) => getPixel(image, i % 10, Math.floor(i / 10))[3]).filter(
        (a) => a > 0,
      ).length;
    expect(count(wide)).toBeGreaterThan(count(thin));
  });
});

describe('scripts/assets/procedural/brine (M2-11)', () => {
  const sprites = brine.generate();

  it('draws the zone B sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...brine.BRINE_SPRITES]);
    for (const sprite of sprites) {
      const decoration = sprite.name.startsWith('bg/') || sprite.name === 'bosses/maw-fin';
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:brine');
    }
    expect(byName(sprites, 'enemies/froth').frames).toHaveLength(2);
    expect(byName(sprites, 'enemies/froth-bead').frames[0].width).toBe(8);
    expect(byName(sprites, 'bosses/maw-hull').frames[0].width).toBe(64);
    expect(
      mirroredVertically(
        byName(sprites, 'bosses/maw-jaw-top').frames[0],
        byName(sprites, 'bosses/maw-jaw-bottom').frames[0],
      ),
    ).toBe(true);
  });

  it('paints the brine sea only in the four ramp colours zone B cycles (and its bubble rings)', () => {
    const sea = byName(sprites, 'bg/brine-sea');
    expect(sea.anchor).toEqual([0, 0]);
    const image = sea.frames[0];
    expect([image.width, image.height]).toEqual([brine.BRINE_SEA_W, brine.BRINE_SEA_H]);
    const colours = opaqueColours(image);
    for (const tone of brine.BRINE_RAMP) expect(colours.has(tone), tone).toBe(true);
    expect([...colours].filter((c) => !brine.BRINE_RAMP.includes(c))).toEqual(['#8ad0d8']);
    // Every pixel opaque (a band the layer's cycle can repaint), the same ramp as the stage's.
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    const stage = JSON.parse(
      readFileSync(new URL('../../../content/stages/zone-b.stage.json', import.meta.url), 'utf8'),
    ) as { cycles: { colors: string[] }[] };
    expect(stage.cycles[0].colors).toEqual([...brine.BRINE_RAMP]);
  });

  it('draws a translucent nebula band that repeats along x', () => {
    const image = byName(sprites, 'bg/brine-nebula').frames[0];
    expect([image.width, image.height]).toEqual([brine.NEBULA_TILE_W, brine.NEBULA_TILE_H]);
    let translucent = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] > 0 && image.data[i] < 255) translucent++;
    }
    expect(translucent).toBeGreaterThan(500);
    // The first and last columns join (the cloud density wraps round the tile width).
    let step = 0;
    for (let y = 0; y < image.height; y++) {
      step += Math.abs(getPixel(image, 0, y)[3] - getPixel(image, image.width - 1, y)[3]);
    }
    expect(step / image.height).toBeLessThan(24);
  });

  it('is deterministic', () => {
    const again = brine.generate();
    expect(again.map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});

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

describe('scripts/assets/procedural/terrain — the zone tilesets (M2-11)', () => {
  const sets = terrain.generate();

  it('draws terrain-a and the zone sets (M2-11, M2-12) with the same tiles in their own colours', () => {
    expect(sets.map((s) => s.name)).toEqual(Object.keys(terrain.TERRAIN_PALETTES));
    expect(sets.map((s) => s.name)).toEqual([
      'tiles/terrain-a',
      'tiles/terrain-reef',
      'tiles/terrain-dune',
      'tiles/terrain-magma',
      'tiles/terrain-ridge',
    ]);
    const [a, ...zones] = sets;
    for (const set of zones) {
      expect(set.frames).toHaveLength(a.frames.length);
      expect(set.animations).toEqual(a.animations);
      set.frames.forEach((frame, i) => {
        // The same shape (alpha) in every frame; the rock tiles recoloured.
        const alpha = (image: Image): string =>
          Array.from(image.data)
            .filter((_v, k) => k % 4 === 3)
            .join();
        expect(alpha(frame), `${set.name}#${String(i)}`).toBe(alpha(a.frames[i]));
      });
      const floor = terrain.TERRAIN_TILES.indexOf('floor');
      const palette = terrain.TERRAIN_PALETTES[set.name];
      expect(opaqueColours(set.frames[floor]).has(palette.surface)).toBe(true);
      expect(opaqueColours(set.frames[floor]).has('#8ad0a8')).toBe(false);
    }
    // Zone A's rock keeps its colours.
    expect(opaqueColours(a.frames[terrain.TERRAIN_TILES.indexOf('floor')]).has('#8ad0a8')).toBe(
      true,
    );
  });
});
