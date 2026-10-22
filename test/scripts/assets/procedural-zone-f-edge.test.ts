/**
 * Edge cases of the zone F placeholder art (split out of `procedural-zones-fg-edge.test.ts` by
 * R5-P.P5c; the cross-zone tests stayed with the earlier zone of their pair), beyond
 * `procedural-zone-f.test.ts`:
 *
 * - the vault generator: frozen, unique, lower-case kebab path names, the same pixels in **every**
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
 *   sets have distinct rims and rock.;
 * - and, since R5-06.S2, the v2 stand-in set: frozen, unique names drawn at the shipped art
 *   scale, frames of one size, hittable sprites clearly visible, the same pixels every run.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import { WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as brine from '../../../scripts/assets/procedural/brine.mjs';
import * as magma from '../../../scripts/assets/procedural/magma.mjs';
import * as prism from '../../../scripts/assets/procedural/prism.mjs';
import * as rasterBands from '../../../scripts/assets/procedural/raster-bands.mjs';
import * as tempest from '../../../scripts/assets/procedural/tempest.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import * as vault from '../../../scripts/assets/procedural/vault.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { byName, bytes, drawn, opaqueColours } from './procedural-zone-helpers.js';

describe('scripts/assets/procedural vault / prism — every sprite (M2-13)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
    ['vault', vault.VAULT_SPRITES, vault.generate],
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

  it.each(['tiles/terrain-vault'])(
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
    for (const [file, sprite, names] of [
      ['terrain-vault', 'tiles/terrain-vault-v2', vault.VAULT_V2_TILE_NAMES],
      ['terrain-prism', 'tiles/terrain-prism', terrain.TERRAIN_TILES],
    ] as const) {
      const data = JSON.parse(
        readFileSync(
          new URL(`../../../content/tilesets/${file}.tileset.json`, import.meta.url),
          'utf8',
        ),
      ) as { id: string; sprite: string; tiles: { name: string }[] };
      expect(data.id).toBe(file);
      expect(data.sprite).toBe(sprite);
      expect(data.tiles.map((t) => t.name)).toEqual([...names]);
    }
  });

  it('gives every set distinct rims and rock (nine since M2-14)', () => {
    const palettes = Object.values(terrain.TERRAIN_PALETTES);
    expect(palettes).toHaveLength(9);
    expect(new Set(palettes.map((p) => p.surface)).size).toBe(palettes.length);
    expect(new Set(palettes.map((p) => p.rock.join())).size).toBe(palettes.length);
  });
});

describe('scripts/assets/procedural/vault — R5-06.S2 v2 stand-ins (zone-f.md §14)', () => {
  const sprites = vault.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE });
  const v2 = sprites.slice(vault.VAULT_SPRITES.length);

  it('names the §14 list frozen, unique and kebab-pathed', () => {
    expect(Object.isFrozen(vault.VAULT_V2_SPRITES)).toBe(true);
    expect(new Set(vault.VAULT_V2_SPRITES).size).toBe(vault.VAULT_V2_SPRITES.length);
    for (const name of vault.VAULT_V2_SPRITES) {
      expect(name).toMatch(/^(bg|enemies|bosses|fx|tiles)\/[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(new Set(vault.VAULT_V2_TILE_NAMES).size).toBe(vault.VAULT_V2_TILE_NAMES.length);
    expect(vault.VAULT_V2_TILE_NAMES.length).toBe(23);
  });

  it('draws v2 frames of one size, hittable sprites clearly visible, animations that animate', () => {
    for (const sprite of v2) {
      const [first, ...rest] = sprite.frames;
      for (const frame of rest) {
        expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
      }
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
  });

  it('draws the v2 set the same pixels every run', () => {
    expect(bytes(v2)).toEqual(
      bytes(vault.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE }).slice(14)),
    );
  });
});
