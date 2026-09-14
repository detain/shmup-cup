/**
 * Edge cases of the M2-13 placeholder art (`scripts/assets/procedural/vault.mjs`, `prism.mjs` and
 * the zone tilesets `tiles/terrain-vault` / `tiles/terrain-prism` of `terrain.mjs`), beyond
 * `procedural-zones-fg.test.ts`:
 *
 * - both generators: frozen, unique, lower-case kebab path names, the same pixels in **every**
 *   frame every run, every frame of a sprite the same size, every sprite that can be hit clearly
 *   visible in every frame (a quarter of it ≥ half opaque), animations naming existing frames,
 *   backdrops never flashing, the two ramps distinct from each other and from every other palette
 *   cycle's;
 * - the boss parts: every arm segment and tip sprite (the curling arms of `boss.squid` /
 *   `boss.facet`) round enough to be turned — square frames, so a turned segment keeps its size;
 * - the registry: `procedural/index.mjs` runs both generators (ids `vault` / `prism`) and every
 *   zone F / G sprite name is drawn exactly once across all generators;
 * - the zone tilesets: the destructible tiles (brick, cube, tissue) look exactly like zone A's (CELL
 *   VAULT's regenerating walls are zone A's tissue, PRISM LABYRINTH's stacked rush zone A's cube);
 *   the solid rock is drawn only in the set's own rock colours, opaque in every pixel; the
 *   `content/tilesets/` files name their sprite and list the tiles in zone A's order; all seven
 *   sets have distinct rims and rock.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import * as brine from '../../../scripts/assets/procedural/brine.mjs';
import * as magma from '../../../scripts/assets/procedural/magma.mjs';
import * as prism from '../../../scripts/assets/procedural/prism.mjs';
import * as rasterBands from '../../../scripts/assets/procedural/raster-bands.mjs';
import * as tempest from '../../../scripts/assets/procedural/tempest.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import * as vault from '../../../scripts/assets/procedural/vault.mjs';
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
 * Every frame of every sprite as text (base64 per frame), for byte comparisons.
 *
 * @param sprites - The sprites.
 * @returns One string per sprite.
 */
function bytes(sprites: readonly SpriteDef[]): string[] {
  return sprites.map(
    (s) => s.name + ':' + s.frames.map((f) => Buffer.from(f.data).toString('base64')).join('|'),
  );
}

describe('scripts/assets/procedural vault / prism — every sprite (M2-13)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
    ['vault', vault.VAULT_SPRITES, vault.generate],
    ['prism', prism.PRISM_SPRITES, prism.generate],
  ];

  it.each(sets)('%s: frozen, unique, kebab path names', (_id, names) => {
    expect(Object.isFrozen(names)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^(bg|enemies|bosses)\/[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(names).toHaveLength(14);
  });

  it.each(sets)(
    '%s: frames of one size, hit sprites clearly visible, animations naming real frames',
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

  it.each(sets)('%s: draws the same pixels in every frame, every run', (_id, _names, generate) => {
    expect(bytes(generate())).toEqual(bytes(generate()));
  });

  it('draws the arm segments and tips square, so a turned segment keeps its size', () => {
    for (const [sprites, names] of [
      [vault.generate(), ['bosses/regent-root', 'bosses/regent-segment', 'bosses/regent-tip']],
      [prism.generate(), ['bosses/facet-segment', 'bosses/facet-tip']],
    ] as const) {
      for (const name of names) {
        const frame = byName(sprites, name).frames[0];
        expect(frame.width, name).toBe(frame.height);
        expect(drawn(frame), name).toBe(true);
      }
    }
  });

  it('gives the two palette-cycled walls ramps of their own (no colour shared with the other cycles)', () => {
    const others = new Set([
      ...rasterBands.SEA_RAMP,
      ...brine.BRINE_RAMP,
      ...magma.MAGMA_RAMP,
      ...tempest.STORM_RAMP,
    ]);
    for (const ramp of [vault.VAULT_RAMP, prism.PRISM_RAMP]) {
      expect(Object.isFrozen(ramp)).toBe(true);
      expect(new Set(ramp).size).toBe(4);
      for (const c of ramp) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
        expect(others.has(c), c).toBe(false);
      }
    }
    expect(vault.VAULT_RAMP.filter((c) => prism.PRISM_RAMP.includes(c))).toEqual([]);
  });

  it('registers both generators, and every zone F / G sprite is drawn by exactly one of them', () => {
    const ids = PROCEDURAL_GENERATORS.map((g) => g.id);
    expect(ids).toContain('vault');
    expect(ids).toContain('prism');
    const names = PROCEDURAL_GENERATORS.flatMap((g) => g.generate().map((s) => s.name));
    for (const name of [...vault.VAULT_SPRITES, ...prism.PRISM_SPRITES]) {
      expect(
        names.filter((n) => n === name),
        name,
      ).toHaveLength(1);
    }
  });
});

describe('scripts/assets/procedural/terrain — zones F and G tilesets (M2-13)', () => {
  const sets = terrain.generate();
  const a = byName(sets, 'tiles/terrain-a');

  it.each(['tiles/terrain-vault', 'tiles/terrain-prism'])(
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
      for (let i = 3; i < solid.data.length; i += 4) expect(solid.data[i]).toBe(255);
    },
  );

  it('names each zone tileset sprite in its content file, the tiles in zone A’s order', () => {
    for (const [file, sprite] of [
      ['terrain-vault', 'tiles/terrain-vault'],
      ['terrain-prism', 'tiles/terrain-prism'],
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

  it('gives all seven sets distinct rims and rock', () => {
    const palettes = Object.values(terrain.TERRAIN_PALETTES);
    expect(palettes).toHaveLength(7);
    expect(new Set(palettes.map((p) => p.surface)).size).toBe(palettes.length);
    expect(new Set(palettes.map((p) => p.rock.join())).size).toBe(palettes.length);
  });
});
