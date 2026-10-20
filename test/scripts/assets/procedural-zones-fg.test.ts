/**
 * The placeholder art of plan M2-13 (`scripts/assets/procedural/vault.mjs`, `prism.mjs` and the
 * zone tilesets `tiles/terrain-vault` / `tiles/terrain-prism` of `terrain.mjs`): every zone F and G
 * sprite drawn in its documented order, size and frame count, with hit flashes on everything that
 * can be hit (not on the regent's tail fin nor the monarch's housing — decoration); the cell wall
 * and the crystal facets painted only in the ramps zone F's and zone G's palette cycles name,
 * repeating across and down; the fold and spire bands repeating along x; animated frames that
 * differ; every hurtbox of the rosters inside the sprite drawn for it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, type Image } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as prism from '../../../scripts/assets/procedural/prism.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import * as vault from '../../../scripts/assets/procedural/vault.mjs';
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
 * The zone F boxes W5-3 allows 1 px outside their art: entries whose half-extent is odd, so the
 * port's ×1.5 lands on a `.5` that the rescale tool rounds up (owner decision O4) — a radius of
 * 5 becomes 8, a 16×16 box against the interim segment's 15×15 frame. Exactly the entries
 * `docs/v2-run/helpers/w5pre/hurtbox.mjs` counts for zone F (six). A box not named here must sit
 * inside the frame at both scales; a named box may exceed it by at most the one rounded pixel.
 */
const ZONE_F_ROUNDED_BOXES: ReadonlySet<string> = new Set([
  'seg-top-1',
  'seg-top-2',
  'seg-top-3',
  'seg-bottom-1',
  'seg-bottom-2',
  'seg-bottom-3',
]);

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

/**
 * Checks that every hurtbox of a roster lies inside the frame of the sprite drawn for it — the
 * **atlas** frame (R2-02.T4c): the interim art is ×1.5 (R2-01) and the two-scale kit ports the
 * roster's boxes ×1.5 too (with O4's rounding), so only the packed sizes compare fairly. A sprite
 * missing from the manifest measures 0×0 and fails the box loudly.
 *
 * @param roster - Path of the roster below `content/`.
 * @param rounded - The box labels W5-3 allows the one rounded pixel (checked to be all seen).
 */
function hurtboxesInside(roster: string, rounded: ReadonlySet<string>): void {
  const { enemies } = content<{ enemies: RosterEnemy[] }>(roster);
  const { manifest } = buildAtlas();
  const size = (sprite: string): [number, number] => {
    const frame = manifest.frames[manifest.sprites[sprite]?.frames[0] ?? ''];
    return frame === undefined ? [0, 0] : [frame.w, frame.h];
  };
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
  const seen = new Set<string>();
  for (const [who, sprite, hw, hh] of boxes) {
    const [w, h] = size(sprite);
    const allowance = rounded.has(who) ? 1 : 0;
    if (allowance === 1) seen.add(who);
    expect(2 * hw, who).toBeLessThanOrEqual(w + allowance);
    expect(2 * hh, who).toBeLessThanOrEqual(h + allowance);
  }
  // The allowance list must not rot: every named box has to be a box of this roster.
  expect([...seen].sort()).toEqual([...rounded].sort());
}

/**
 * Whether the pixels of a tile's first and last rows (and columns) match — a band that repeats
 * across and down without a seam.
 *
 * @param image - The tile.
 * @returns The share of edge pixels whose opposite edge pixel has the same colour (0 … 1).
 */
function wraps(image: Image): number {
  let same = 0;
  let all = 0;
  const near = (a: readonly number[], b: readonly number[]): boolean =>
    a.every((v, k) => Math.abs(v - b[k]) <= 48);
  for (let y = 0; y < image.height; y++) {
    all++;
    if (near(getPixel(image, 0, y), getPixel(image, image.width - 1, y))) same++;
  }
  for (let x = 0; x < image.width; x++) {
    all++;
    if (near(getPixel(image, x, 0), getPixel(image, x, image.height - 1))) same++;
  }
  return same / all;
}

/**
 * Checks that every animated sprite's frames really differ.
 *
 * @param sprites - A generator's output.
 */
function framesDiffer(sprites: readonly SpriteDef[]): void {
  for (const sprite of sprites) {
    const frames = sprite.frames.map((f) => Array.from(f.data).join());
    if (frames.length > 1) expect(new Set(frames).size, sprite.name).toBe(frames.length);
  }
}

describe('scripts/assets/procedural/vault (M2-13)', () => {
  const sprites = vault.generate();

  it('draws the zone F sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...vault.VAULT_SPRITES]);
    for (const sprite of sprites) {
      const decoration = sprite.name.startsWith('bg/') || sprite.name === 'bosses/regent-fin';
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:vault');
      const [first, ...rest] = sprite.frames;
      for (const frame of rest)
        expect([frame.width, frame.height]).toEqual([first.width, first.height]);
    }
    expect(byName(sprites, 'enemies/chaser-cell').animations).toEqual({ wobble: [0, 1] });
    expect(byName(sprites, 'bosses/regent-eye').animations).toEqual({ dilate: [0, 1] });
    expect(byName(sprites, 'bosses/regent-mantle').frames[0].width).toBe(60);
    framesDiffer(sprites);
    hurtboxesInside('enemies/zone-f.enemies.json', ZONE_F_ROUNDED_BOXES);
  });

  it('paints the cell wall only in the four ramp colours zone F cycles, repeating both ways', () => {
    const wall = byName(sprites, 'bg/vault-membrane');
    expect(wall.anchor).toEqual([0, 0]);
    const image = wall.frames[0];
    expect([image.width, image.height]).toEqual([vault.MEMBRANE_TILE_W, vault.MEMBRANE_TILE_H]);
    expect([...opaqueColours(image)].sort()).toEqual([...vault.VAULT_RAMP].sort());
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    expect(wraps(image)).toBeGreaterThan(0.9);
    const stage = content<{ cycles: { colors: string[] }[] }>('stages/zone-f.stage.json');
    expect(stage.cycles[0].colors).toEqual([...vault.VAULT_RAMP]);
  });

  it('draws fleshy folds with a rim, opaque at the bottom and repeating along x', () => {
    const image = byName(sprites, 'bg/vault-folds').frames[0];
    expect([image.width, image.height]).toEqual([vault.FOLDS_TILE_W, vault.FOLDS_TILE_H]);
    expect(seam(image)).toBeLessThan(24);
    for (let x = 0; x < image.width; x++) expect(getPixel(image, x, image.height - 1)[3]).toBe(255);
    expect(getPixel(image, 0, 0)[3]).toBe(0); // open above the folds
    expect(opaqueColours(image).has('#6a8a70')).toBe(true); // the rim
  });

  it('is deterministic', () => {
    expect(vault.generate().map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});

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
    expect(stage.cycles[0].colors).toEqual([...prism.PRISM_RAMP]);
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

describe('scripts/assets/procedural/terrain — the zone F and G tilesets (M2-13)', () => {
  it('draws CELL VAULT’s flesh and PRISM LABYRINTH’s crystal rock in their own colours', () => {
    const sets = terrain.generate();
    const floor = terrain.TERRAIN_TILES.indexOf('floor');
    for (const name of ['tiles/terrain-vault', 'tiles/terrain-prism']) {
      const set = byName(sets, name);
      const palette = terrain.TERRAIN_PALETTES[name];
      expect(opaqueColours(set.frames[floor]).has(palette.surface), name).toBe(true);
      expect(set.frames).toHaveLength(byName(sets, 'tiles/terrain-a').frames.length);
    }
    for (const id of ['vault', 'prism']) {
      const tileset = content<{ id: string; sprite: string }>(
        `tilesets/terrain-${id}.tileset.json`,
      );
      expect(tileset.sprite).toBe(`tiles/terrain-${id}`);
    }
  });
});
