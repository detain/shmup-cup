/**
 * Edge cases of the zone G placeholder art (split out of `procedural-zones-fg-edge.test.ts` by
 * R5-P.P5c), beyond `procedural-zone-g.test.ts`: the prism generator — frozen, unique,
 * lower-case kebab path names, the same pixels in **every** frame every run, every frame of a
 * sprite the same size, every sprite that can be hit clearly visible in every frame (a quarter of
 * it ≥ half opaque), animations naming existing frames, backdrops never flashing — and the zone G
 * tileset: the twenty tiles carried verbatim into the -v2 strip (R5-07.S5a), bricks as zone A's,
 * the rock only in the set's own colours, opaque.
 *
 * The F/G pair's shared checks (the square arm pieces, the two ramps, the registry, the tileset
 * name files, the rims of every set) stayed with the earlier zone in
 * `procedural-zone-f-edge.test.ts`.
 *
 * Since R5-07.S2 the file also pins the zone-G v2 stand-ins: the eleven §14 names frozen, unique
 * and kebab-pathed (the wider regex, `fx` and `tiles` included), every frame of a sprite one size,
 * every hittable clearly visible, every animation naming real frames, frames unique, and the whole
 * set the same pixels every run.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as prism from '../../../scripts/assets/procedural/prism.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { byName, bytes, drawn, opaqueColours } from './procedural-zone-helpers.js';

describe('scripts/assets/procedural vault / prism — every sprite (M2-13)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
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
});

describe('scripts/assets/procedural/prism — the zone G tileset (M2-13, -v2 since R5-07.S5a)', () => {
  const sprites = prism.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE });
  const set = byName(sprites, 'tiles/terrain-prism-v2');
  const a = byName(terrain.generate(), 'tiles/terrain-a');
  const base = terrain.renderTerrainTiles(terrain.TILE_SIZE, 'tiles/terrain-prism');

  it('carries the twenty tiles verbatim, bricks as zone A’s, rock in its own colours', () => {
    expect(set.frames).toHaveLength(prism.PRISM_V2_TILE_NAMES.length);
    expect(set.anchor).toEqual([0, 0]);
    for (const frame of set.frames)
      expect(
        [frame.width, frame.height],
        prism.PRISM_V2_TILE_NAMES[set.frames.indexOf(frame)],
      ).toEqual([terrain.TILE_SIZE, terrain.TILE_SIZE]);
    expect(base).toHaveLength(20);
    for (let i = 0; i < base.length; i++) {
      expect(
        Buffer.from(set.frames[i].data).equals(Buffer.from(base[i].data)),
        prism.PRISM_V2_TILE_NAMES[i],
      ).toBe(true);
    }
    expect(prism.PRISM_V2_TILE_NAMES.slice(20)).toEqual([
      'crystal',
      'crystal-hot',
      'facet-glow',
      'shard-floor',
    ]);
    for (const tile of ['brick', 'cube', 'tissue'] as const) {
      const i = terrain.TERRAIN_TILES.indexOf(tile);
      expect(Buffer.from(set.frames[i].data).equals(Buffer.from(a.frames[i].data)), tile).toBe(
        true,
      );
    }
    const palette = terrain.TERRAIN_PALETTES['tiles/terrain-prism'];
    const solid = set.frames[terrain.TERRAIN_TILES.indexOf('solid')];
    const colours = opaqueColours(solid);
    expect(colours.size).toBeGreaterThan(0);
    for (const c of colours) expect(palette.rock, c).toContain(c);
    for (let i = 3; i < solid.data.length; i += 4) expect(solid.data[i]).toBe(255);
  });
});

describe('scripts/assets/procedural/prism — R5-07.S2 v2 stand-ins (zone-g.md §14)', () => {
  const sprites = prism.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE });
  const v2 = sprites.slice(prism.PRISM_SPRITES.length);

  it('names the §14 list frozen, unique and kebab-pathed', () => {
    expect(Object.isFrozen(prism.PRISM_V2_SPRITES)).toBe(true);
    expect(new Set(prism.PRISM_V2_SPRITES).size).toBe(prism.PRISM_V2_SPRITES.length);
    for (const name of prism.PRISM_V2_SPRITES) {
      expect(name).toMatch(/^(bg|enemies|bosses|fx|tiles)\/[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(new Set(prism.PRISM_V2_TILE_NAMES).size).toBe(prism.PRISM_V2_TILE_NAMES.length);
    expect(prism.PRISM_V2_TILE_NAMES.length).toBe(24);
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
      bytes(prism.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE }).slice(14)),
    );
  });
});
