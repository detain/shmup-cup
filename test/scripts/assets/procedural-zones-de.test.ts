/**
 * The placeholder art of plan M2-12 (`scripts/assets/procedural/magma.mjs`, `tempest.mjs` and the
 * zone tilesets `tiles/terrain-magma` / `tiles/terrain-ridge` of `terrain.mjs`): every zone D and E
 * sprite drawn in its documented order, size and frame count, with hit flashes on everything that
 * can be hit; the lava lake and the storm clouds painted only in the ramps zone D's and zone E's
 * palette cycles name; bands that repeat along x; mirrored chest lids; every hurtbox of the rosters
 * inside the sprite drawn for it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, type Image } from '../../../scripts/assets/image.mjs';
import * as magma from '../../../scripts/assets/procedural/magma.mjs';
import * as tempest from '../../../scripts/assets/procedural/tempest.mjs';
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
 * A shipped JSON file below `content/`.
 *
 * @param path - Its path.
 * @returns The parsed data.
 */
function content<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL('../../../content/' + path, import.meta.url), 'utf8'),
  ) as T;
}

/**
 * How much the first and last columns of a band differ (mean alpha step per row).
 *
 * @param image - The band.
 * @returns Mean absolute alpha difference.
 */
function seam(image: Image): number {
  let step = 0;
  for (let y = 0; y < image.height; y++) {
    step += Math.abs(getPixel(image, 0, y)[3] - getPixel(image, image.width - 1, y)[3]);
  }
  return step / image.height;
}

/** An enemy entry's hurtbox, as the rosters write it. */
interface RosterEnemy {
  /** Enemy id. */
  readonly id: string;
  /** Sprite (regular enemies). */
  readonly sprite?: string;
  /** Box hurtbox. */
  readonly hurtbox?: { readonly hw: number; readonly hh: number };
  /** Boss section. */
  readonly boss?: {
    readonly parts: readonly {
      readonly name: string;
      readonly sprite?: string;
      readonly hurtbox?: { readonly hw: number; readonly hh: number };
      readonly radius?: number;
    }[];
  };
}

/**
 * Checks that every hurtbox of a roster lies inside the frames of the sprite drawn for it.
 *
 * @param roster - Path of the roster below `content/`.
 * @param sprites - The generator's output.
 */
function hurtboxesInside(roster: string, sprites: readonly SpriteDef[]): void {
  const { enemies } = content<{ enemies: RosterEnemy[] }>(roster);
  const boxes: [string, string, number, number][] = [];
  for (const enemy of enemies) {
    if (enemy.sprite !== undefined && enemy.hurtbox !== undefined) {
      boxes.push([enemy.id, enemy.sprite, enemy.hurtbox.hw, enemy.hurtbox.hh]);
    }
    for (const part of enemy.boss?.parts ?? []) {
      if (part.sprite === undefined) continue;
      if (part.hurtbox !== undefined)
        boxes.push([part.name, part.sprite, part.hurtbox.hw, part.hurtbox.hh]);
      if (part.radius !== undefined) boxes.push([part.name, part.sprite, part.radius, part.radius]);
    }
  }
  expect(boxes.length).toBeGreaterThan(8);
  for (const [who, sprite, hw, hh] of boxes) {
    const frame = byName(sprites, sprite).frames[0];
    expect(2 * hw, who).toBeLessThanOrEqual(frame.width);
    expect(2 * hh, who).toBeLessThanOrEqual(frame.height);
  }
}

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
    hurtboxesInside('enemies/zone-d.enemies.json', sprites);
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
    expect(stage.cycles[0].colors).toEqual([...magma.MAGMA_RAMP]);
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
    hurtboxesInside('enemies/zone-e.enemies.json', sprites);
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
