/**
 * Edge cases of the zone H placeholder art and of the M2-14 generators as a whole (split out of
 * `procedural-zones-hi-edge.test.ts` by R5-P.P5c; the tests that examine more than one zone stayed
 * with the earlier zone of the pair), beyond `procedural-zone-h.test.ts`:
 *
 * - the citadel generator: frozen, unique, lower-case kebab path names (14), every frame of a
 *   sprite the same size, every sprite that can be hit clearly visible in every frame (a quarter
 *   of it ≥ half opaque), animations naming existing frames, the same pixels every run;
 * - the ramps of the two palette-cycled backdrops: frozen, four distinct colours each, shared with
 *   no other cycle's ramp nor with each other;
 * - the registry: every zone H / I / ending sprite is drawn by exactly one generator, and every
 *   sprite the zone H and I rosters, stages and tilesets name is in the built atlas;
 * - the zone tilesets: the destructible tiles exactly zone A's (H's v2 set adds its §9 gate-door
 *   on top, R5-08.S5a); the rock only in the set's own
 *   colours, opaque; the `content/tilesets/` files name their sprite and zone A's tile order
 *   (H's v2 set continues it with its four variants).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { WORLD_SCALE } from '../../../scripts/frame.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as abyss from '../../../scripts/assets/procedural/abyss.mjs';
import * as brine from '../../../scripts/assets/procedural/brine.mjs';
import * as citadel from '../../../scripts/assets/procedural/citadel.mjs';
import * as ending from '../../../scripts/assets/procedural/ending.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import * as magma from '../../../scripts/assets/procedural/magma.mjs';
import * as prism from '../../../scripts/assets/procedural/prism.mjs';
import * as rasterBands from '../../../scripts/assets/procedural/raster-bands.mjs';
import * as tempest from '../../../scripts/assets/procedural/tempest.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import * as vault from '../../../scripts/assets/procedural/vault.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { byName, bytes, content, drawn, opaqueColours } from './procedural-zone-helpers.js';

describe('scripts/assets/procedural citadel / abyss / ending — every sprite (M2-14 tests)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[], number][] = [
    ['citadel', citadel.CITADEL_SPRITES, citadel.generate, 14],
  ];

  it.each(sets)('%s: frozen, unique, kebab path names', (_id, names, _generate, count) => {
    expect(Object.isFrozen(names)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^(bg|enemies|bosses|ui)\/[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(names).toHaveLength(count);
  });

  it.each(sets)(
    '%s: frames of one size, hit sprites clearly visible, animations naming real frames',
    (_id, _names, generate) => {
      for (const sprite of generate()) {
        const [first, ...rest] = sprite.frames;
        for (const frame of rest) {
          expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
        }
        if (sprite.name.startsWith('bg/') || sprite.name.startsWith('ui/')) {
          expect(sprite.hitFlash === true, sprite.name).toBe(false);
        }
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

  it('gives the two palette-cycled backdrops ramps of their own (no colour shared with the other cycles)', () => {
    const others = new Set([
      ...rasterBands.SEA_RAMP,
      ...brine.BRINE_RAMP,
      ...magma.MAGMA_RAMP,
      ...tempest.STORM_RAMP,
      ...vault.VAULT_RAMP,
      ...prism.PRISM_RAMP,
    ]);
    for (const ramp of [citadel.CITADEL_RAMP, abyss.ABYSS_RAMP]) {
      expect(Object.isFrozen(ramp)).toBe(true);
      expect(new Set(ramp).size).toBe(4);
      for (const c of ramp) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
        expect(others.has(c), c).toBe(false);
      }
    }
    expect(citadel.CITADEL_RAMP.filter((c) => abyss.ABYSS_RAMP.includes(c))).toEqual([]);
  });

  it('registers the three generators; every zone H / I / ending sprite is drawn by exactly one', () => {
    const ids = PROCEDURAL_GENERATORS.map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(['citadel', 'abyss', 'ending']));
    expect(new Set(ids).size).toBe(ids.length);
    const names = PROCEDURAL_GENERATORS.flatMap((g) => g.generate().map((s) => s.name));
    for (const name of [
      ...citadel.CITADEL_SPRITES,
      ...abyss.ABYSS_SPRITES,
      ...ending.ENDING_SPRITES,
    ]) {
      expect(
        names.filter((n) => n === name),
        name,
      ).toHaveLength(1);
    }
  });

  it('puts every sprite the zone H and I rosters, stages and tilesets name into the atlas', () => {
    const { manifest } = buildAtlas();
    const named = new Set<string>();
    for (const roster of ['zone-h', 'zone-i']) {
      const { enemies } = content<{
        enemies: Array<{ sprite?: string; boss?: { parts: Array<{ sprite?: string }> } }>;
      }>(`enemies/${roster}.enemies.json`);
      for (const enemy of enemies) {
        if (enemy.sprite !== undefined) named.add(enemy.sprite);
        for (const part of enemy.boss?.parts ?? [])
          if (part.sprite !== undefined) named.add(part.sprite);
      }
      const stage = content<{ parallax: Array<{ sprite: string }> }>(`stages/${roster}.stage.json`);
      for (const layer of stage.parallax) named.add(layer.sprite);
    }
    for (const file of ['terrain-citadel', 'terrain-abyss']) {
      named.add(content<{ sprite: string }>(`tilesets/${file}.tileset.json`).sprite);
    }
    for (const name of ending.ENDING_SPRITES) named.add(name);
    expect(named.size).toBeGreaterThan(40);
    for (const name of named) expect(manifest.sprites[name], name).toBeDefined();
  });
});

describe('scripts/assets/procedural/terrain — zones H and I tilesets (M2-14 tests)', () => {
  const sets = terrain.generate();
  const a = byName(sets, 'tiles/terrain-a');

  it.each(['tiles/terrain-citadel'])(
    '%s: bricks, cubes and tissue exactly as in zone A; the rock in its own colours only',
    (name) => {
      const set = byName(sets, name);
      expect(set.frames).toHaveLength(terrain.TERRAIN_TILES.length);
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
    // H's set rides `tiles/terrain-citadel-v2` since R5-08.S5a: zone A's 20 tiles first, then
    // its 4 variants — the order `citadel.mjs` draws, pinned by CITADEL_V2_TILE_NAMES.
    // I's set rides `tiles/terrain-abyss-v2` since R5-09.S5a: the same 20, then its 2 §10
    // additions — the order `abyss.mjs` draws, pinned by ABYSS_V2_TILE_NAMES.
    for (const [file, sprite, tileNames] of [
      ['terrain-citadel', 'tiles/terrain-citadel-v2', citadel.CITADEL_V2_TILE_NAMES],
      ['terrain-abyss', 'tiles/terrain-abyss-v2', abyss.ABYSS_V2_TILE_NAMES],
    ] as const) {
      const data = content<{ id: string; sprite: string; tiles: { name: string }[] }>(
        `tilesets/${file}.tileset.json`,
      );
      expect(data.id).toBe(file);
      expect(data.sprite).toBe(sprite);
      expect(data.tiles.map((t) => t.name)).toEqual([...tileNames]);
    }
  });

  it('keeps the citadel and the abyss sets apart from each other and from zone A', () => {
    const h = terrain.TERRAIN_PALETTES['tiles/terrain-citadel'];
    const i = terrain.TERRAIN_PALETTES['tiles/terrain-abyss'];
    const zoneA = terrain.TERRAIN_PALETTES['tiles/terrain-a'];
    expect(h.surface).not.toBe(i.surface);
    expect(h.rock.filter((c) => i.rock.includes(c))).toEqual([]);
    expect(h.rock.join()).not.toBe(zoneA.rock.join());
    expect(i.rock.join()).not.toBe(zoneA.rock.join());
  });
});

describe('scripts/assets/procedural/citadel — R5-08.S2 v2 stand-ins, edges (zone-h.md §13)', () => {
  const built = citadel.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE });
  const v2 = built.slice(citadel.CITADEL_SPRITES.length);

  it('names the four §13 sprites frozen, unique, kebab paths including the tile strip', () => {
    expect(Object.isFrozen(citadel.CITADEL_V2_SPRITES)).toBe(true);
    expect(new Set(citadel.CITADEL_V2_SPRITES).size).toBe(4);
    for (const name of citadel.CITADEL_V2_SPRITES) {
      expect(name).toMatch(/^(bg|enemies|tiles)\/[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(v2.map((s) => s.name)).toEqual([...citadel.CITADEL_V2_SPRITES]);
    expect(new Set(citadel.CITADEL_V2_TILE_NAMES).size).toBe(24);
    // the no-echo law: the parade and the rebuilt Sovereign add no new names of their own
    for (const name of citadel.CITADEL_V2_SPRITES) {
      expect(name.startsWith('bosses/'), name).toBe(false);
      expect(name.includes('echo'), name).toBe(false);
    }
  });

  it('draws v2 frames of one size, hittable sprites clearly visible, animations in range', () => {
    for (const sprite of v2) {
      const [first, ...rest] = sprite.frames;
      for (const frame of rest) {
        expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
      }
      if (sprite.hitFlash === true) {
        for (const frame of sprite.frames) expect(drawn(frame), sprite.name).toBe(true);
      }
      for (const anim of Object.values(sprite.animations ?? {})) {
        for (const i of anim) {
          expect(Number.isInteger(i), sprite.name).toBe(true);
          expect(i, sprite.name).toBeGreaterThanOrEqual(0);
          expect(i, sprite.name).toBeLessThan(sprite.frames.length);
        }
      }
    }
    expect(byName(v2, 'bg/citadel-banner').anchor).toEqual([0, 0]);
    expect(byName(v2, 'tiles/terrain-citadel-v2').anchor).toEqual([0, 0]);
  });

  it('draws the v2 set the same pixels every run', () => {
    const again = citadel
      .generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE })
      .slice(citadel.CITADEL_SPRITES.length);
    expect(bytes(v2)).toEqual(bytes(again));
  });

  it('packs the four v2 sprites and the two flash siblings into the shipped atlas', () => {
    const { manifest } = buildAtlas();
    for (const name of citadel.CITADEL_V2_SPRITES) {
      expect(manifest.sprites[name], name).toBeDefined();
    }
    for (const name of ['enemies/gate-sentry', 'enemies/iron-banner']) {
      expect(manifest.sprites[`${name}@flash`], `${name}@flash`).toBeDefined();
    }
    const tiles = manifest.sprites['tiles/terrain-citadel-v2'];
    expect(tiles.frames).toHaveLength(24);
  });
});
