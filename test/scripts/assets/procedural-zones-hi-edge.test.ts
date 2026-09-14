/**
 * Edge cases of the M2-14 placeholder art (`scripts/assets/procedural/citadel.mjs`, `abyss.mjs`,
 * `ending.mjs` and the zone tilesets `tiles/terrain-citadel` / `tiles/terrain-abyss` of
 * `terrain.mjs`), beyond `procedural-zones-hi.test.ts`:
 *
 * - the three generators: frozen, unique, lower-case kebab path names (14 / 19 / 6), every frame
 *   of a sprite the same size, every sprite that can be hit clearly visible in every frame (a
 *   quarter of it ≥ half opaque), animations naming existing frames, the same pixels every run;
 * - the ramps of the two palette-cycled backdrops: frozen, four distinct colours each, shared with
 *   no other cycle's ramp nor with each other;
 * - the ARK turret's sixteen heading frames all different (a half turn of `DIRECTIONS_8` and its
 *   mirror), square so a turned turret keeps its size;
 * - the ending pieces: the silhouettes and the blast frames drawn, every blast frame one size, a
 *   bubble small, the surface a 64 × 8 band drawn in every column;
 * - the registry: every zone H / I / ending sprite is drawn by exactly one generator, and every
 *   sprite the zone H and I rosters, stages and tilesets name is in the built atlas;
 * - the zone tilesets: the destructible tiles exactly zone A's; the rock only in the set's own
 *   colours, opaque; the `content/tilesets/` files name their sprite and zone A's tile order.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
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
 * The number of pixels of a frame that are not fully transparent.
 *
 * @param image - The frame.
 * @returns Count.
 */
function inked(image: Image): number {
  let n = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] > 0) n++;
  return n;
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

/**
 * A JSON file under `content/`.
 *
 * @param path - Path below `content/`.
 * @returns Its data.
 */
function contentJson<T>(path: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../content/${path}`, import.meta.url), 'utf8'),
  ) as T;
}

describe('scripts/assets/procedural citadel / abyss / ending — every sprite (M2-14 tests)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[], number][] = [
    ['citadel', citadel.CITADEL_SPRITES, citadel.generate, 14],
    ['abyss', abyss.ABYSS_SPRITES, abyss.generate, 19],
    ['ending', ending.ENDING_SPRITES, ending.generate, 6],
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

  it("draws the ARK turret's sixteen headings all different, square frames", () => {
    const turret = byName(abyss.generate(), 'bosses/ark-turret');
    expect(turret.frames).toHaveLength(16);
    for (const frame of turret.frames) {
      expect(frame.width).toBe(frame.height);
      expect(drawn(frame)).toBe(true);
    }
    for (let a = 0; a < 16; a++) {
      for (let b = a + 1; b < 16; b++) {
        expect(imagesEqual(turret.frames[a], turret.frames[b]), `${String(a)} / ${String(b)}`).toBe(
          false,
        );
      }
    }
  });

  it('draws the ending pieces: silhouettes, a four-frame blast of one size, a small bubble', () => {
    const e = ending.generate();
    const citadelShape = byName(e, 'ui/ending-citadel').frames[0];
    const ark = byName(e, 'ui/ending-ark').frames[0];
    // Wide silhouettes (the citadel on the horizon, the whale-class hull).
    expect(citadelShape.width).toBeGreaterThan(40);
    expect(ark.width).toBeGreaterThan(ark.height);
    expect(inked(citadelShape)).toBeGreaterThan((citadelShape.width * citadelShape.height) / 4);
    expect(inked(ark)).toBeGreaterThan((ark.width * ark.height) / 4);
    const blast = byName(e, 'ui/ending-blast');
    expect(blast.frames).toHaveLength(4);
    for (const frame of blast.frames) expect(inked(frame)).toBeGreaterThan(0);
    const bubble = byName(e, 'ui/ending-bubble').frames[0];
    expect(bubble.width).toBeLessThanOrEqual(8);
    expect(inked(bubble)).toBeGreaterThan(0);
    // The surface seen from below: a 64×8 band of light, drawn across its whole width.
    const surface = byName(e, 'ui/ending-surface').frames[0];
    expect([surface.width, surface.height]).toEqual([64, 8]);
    for (let x = 0; x < surface.width; x++) {
      let column = 0;
      for (let y = 0; y < surface.height; y++) if (getPixel(surface, x, y)[3] > 0) column++;
      expect(column, String(x)).toBeGreaterThan(0);
    }
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
      const { enemies } = contentJson<{
        enemies: Array<{ sprite?: string; boss?: { parts: Array<{ sprite?: string }> } }>;
      }>(`enemies/${roster}.enemies.json`);
      for (const enemy of enemies) {
        if (enemy.sprite !== undefined) named.add(enemy.sprite);
        for (const part of enemy.boss?.parts ?? [])
          if (part.sprite !== undefined) named.add(part.sprite);
      }
      const stage = contentJson<{ parallax: Array<{ sprite: string }> }>(
        `stages/${roster}.stage.json`,
      );
      for (const layer of stage.parallax) named.add(layer.sprite);
    }
    for (const file of ['terrain-citadel', 'terrain-abyss']) {
      named.add(contentJson<{ sprite: string }>(`tilesets/${file}.tileset.json`).sprite);
    }
    for (const name of ending.ENDING_SPRITES) named.add(name);
    expect(named.size).toBeGreaterThan(40);
    for (const name of named) expect(manifest.sprites[name], name).toBeDefined();
  });
});

describe('scripts/assets/procedural/terrain — zones H and I tilesets (M2-14 tests)', () => {
  const sets = terrain.generate();
  const a = byName(sets, 'tiles/terrain-a');

  it.each(['tiles/terrain-citadel', 'tiles/terrain-abyss'])(
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
    for (const [file, sprite] of [
      ['terrain-citadel', 'tiles/terrain-citadel'],
      ['terrain-abyss', 'tiles/terrain-abyss'],
    ] as const) {
      const data = contentJson<{ id: string; sprite: string; tiles: { name: string }[] }>(
        `tilesets/${file}.tileset.json`,
      );
      expect(data.id).toBe(file);
      expect(data.sprite).toBe(sprite);
      expect(data.tiles.map((t) => t.name)).toEqual([...terrain.TERRAIN_TILES]);
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
