/**
 * Edge cases of the M2-12 placeholder art (`scripts/assets/procedural/magma.mjs`, `tempest.mjs`
 * and the zone tilesets `tiles/terrain-magma` / `tiles/terrain-ridge` of `terrain.mjs`), beyond
 * `procedural-zones-de.test.ts`:
 *
 * - both generators: frozen, unique, lower-case kebab path names, the same pixels every run,
 *   every frame of a sprite the same size, every sprite that can be hit clearly visible in every
 *   frame (a quarter of it ≥ half opaque), every animated sprite's frames really differ and its
 *   animations name existing frames, backdrops never flash — the fix of this test round: the
 *   squall jumper's two frames were identical (the flame that should flicker was drawn where the
 *   fuselage and the wings cover it), so its jet never flickered;
 * - the bands tile: the rain repeats seamlessly along both axes (its drops sit on a wrapped grid),
 *   the lava lake is opaque in every pixel (the cycle recolours all of it);
 * - the registry: `procedural/index.mjs` runs both generators (ids `magma` / `tempest`) and every
 *   zone D / E sprite name is drawn exactly once across all generators;
 * - the zone tilesets: the destructible tiles (brick, cube, tissue) look exactly like zone A's (a
 *   brick reads as a brick in every zone); the solid rock is drawn only in the set's own rock
 *   colours; the `content/tilesets/` files name their sprite; all five sets have distinct rims.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import * as magma from '../../../scripts/assets/procedural/magma.mjs';
import * as tempest from '../../../scripts/assets/procedural/tempest.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

/**
 * Whether a frame is clearly visible: at least a quarter of its pixels at least half opaque.
 *
 * @param image - The frame.
 * @returns `true` when enough is drawn.
 */
function drawn(image: Image): boolean {
  let solid = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] >= 128) solid++;
  return solid * 4 >= image.width * image.height;
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
 * A sprite's frames as text (base64 per frame), for byte comparisons.
 *
 * @param sprites - The sprites.
 * @returns One string per sprite.
 */
function bytes(sprites: readonly SpriteDef[]): string[] {
  return sprites.map(
    (s) => s.name + ':' + s.frames.map((f) => Buffer.from(f.data).toString('base64')).join('|'),
  );
}

describe('scripts/assets/procedural magma / tempest — every sprite (M2-12)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
    ['magma', magma.MAGMA_SPRITES, magma.generate],
    ['tempest', tempest.TEMPEST_SPRITES, tempest.generate],
  ];

  it.each(sets)('%s: frozen, unique, kebab path names', (_id, names) => {
    expect(Object.isFrozen(names)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^(bg|enemies|bosses)\/[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(sets)(
    '%s: frames of one size, hit sprites clearly visible, animations that animate',
    (_id, _names, generate) => {
      for (const sprite of generate()) {
        const [first, ...rest] = sprite.frames;
        for (const frame of rest) {
          expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
        }
        if (sprite.name.startsWith('bg/')) expect(sprite.hitFlash, sprite.name).toBe(false);
        if (sprite.hitFlash === true) {
          for (const frame of sprite.frames) expect(drawn(frame), sprite.name).toBe(true);
        }
        const text = sprite.frames.map((f) => Buffer.from(f.data).toString('base64'));
        if (sprite.frames.length > 1) {
          expect(new Set(text).size, sprite.name).toBe(sprite.frames.length);
        }
        for (const [clip, frames] of Object.entries(sprite.animations ?? {})) {
          expect(frames.length, `${sprite.name}.${clip}`).toBeGreaterThan(0);
          for (const f of frames) {
            expect(f, `${sprite.name}.${clip}`).toBeGreaterThanOrEqual(0);
            expect(f, `${sprite.name}.${clip}`).toBeLessThan(sprite.frames.length);
          }
        }
      }
    },
  );

  it.each(sets)('%s: draws the same pixels every run', (_id, _names, generate) => {
    expect(bytes(generate())).toEqual(bytes(generate()));
  });

  it('tiles the rain along both axes and paints the whole lava lake', () => {
    const rain = byName(tempest.generate(), 'bg/storm-rain').frames[0];
    // The drops sit on a wrapped grid: a streak leaving one edge comes back in at the other, so
    // the alpha along each edge matches the opposite edge's neighbourhood closely.
    let across = 0;
    for (let y = 0; y < rain.height; y++) {
      across += Math.abs(getPixel(rain, 0, y)[3] - getPixel(rain, rain.width - 1, y)[3]);
    }
    let down = 0;
    for (let x = 0; x < rain.width; x++) {
      down += Math.abs(getPixel(rain, x, 0)[3] - getPixel(rain, x, rain.height - 1)[3]);
    }
    expect(across / rain.height).toBeLessThan(40);
    expect(down / rain.width).toBeLessThan(40);
    const lava = byName(magma.generate(), 'bg/magma-lava').frames[0];
    for (let i = 3; i < lava.data.length; i += 4) expect(lava.data[i]).toBe(255);
  });

  it('registers both generators, and every zone D / E sprite is drawn by exactly one of them', () => {
    const ids = PROCEDURAL_GENERATORS.map((g) => g.id);
    expect(ids).toContain('magma');
    expect(ids).toContain('tempest');
    const names = PROCEDURAL_GENERATORS.flatMap((g) => g.generate().map((s) => s.name));
    for (const name of [...magma.MAGMA_SPRITES, ...tempest.TEMPEST_SPRITES]) {
      expect(
        names.filter((n) => n === name),
        name,
      ).toHaveLength(1);
    }
  });
});

describe('scripts/assets/procedural/terrain — zones D and E tilesets (M2-12)', () => {
  const sets = terrain.generate();
  const a = byName(sets, 'tiles/terrain-a');

  it.each(['tiles/terrain-magma', 'tiles/terrain-ridge'])(
    '%s: bricks, cubes and tissue exactly as in zone A; the rock in its own colours only',
    (name) => {
      const set = byName(sets, name);
      for (const tile of ['brick', 'cube', 'tissue'] as const) {
        const i = terrain.TERRAIN_TILES.indexOf(tile);
        expect(Buffer.from(set.frames[i].data).equals(Buffer.from(a.frames[i].data)), tile).toBe(
          true,
        );
      }
      const palette = terrain.TERRAIN_PALETTES[name];
      const solid = set.frames[terrain.TERRAIN_TILES.indexOf('solid')];
      const colours = opaqueColours(solid);
      expect(colours.size).toBeGreaterThan(0);
      for (const c of colours) expect(palette.rock, c).toContain(c);
      // Every pixel of the solid tile is rock (no hole in the ground).
      for (let i = 3; i < solid.data.length; i += 4) expect(solid.data[i]).toBe(255);
    },
  );

  it('names each zone tileset sprite in its content file, the tiles in zone A’s order', () => {
    for (const [file, sprite] of [
      ['terrain-magma', 'tiles/terrain-magma'],
      ['terrain-ridge', 'tiles/terrain-ridge'],
    ] as const) {
      const data = JSON.parse(
        readFileSync(
          new URL(`../../../content/tilesets/${file}.tileset.json`, import.meta.url),
          'utf8',
        ),
      ) as { id: string; sprite: string; tiles: { name: string }[] };
      expect(data.id).toBe(file);
      expect(data.sprite).toBe(sprite);
      expect(data.tiles.map((t) => t.name)).toEqual([...terrain.TERRAIN_TILES]);
    }
  });

  it('gives all five sets distinct rims and rock', () => {
    const palettes = Object.values(terrain.TERRAIN_PALETTES);
    expect(new Set(palettes.map((p) => p.surface)).size).toBe(palettes.length);
    expect(new Set(palettes.map((p) => p.rock.join())).size).toBe(palettes.length);
    expect(Object.isFrozen(terrain.TERRAIN_PALETTES)).toBe(true);
  });
});
