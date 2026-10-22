/**
 * The zone F placeholder art of plan M2-13 (`scripts/assets/procedural/vault.mjs` and the zone
 * tilesets of `terrain.mjs`, split out of `procedural-zones-fg.test.ts` by R5-P.P5c; the pair's
 * shared tileset check stayed with the earlier zone): every zone F sprite drawn in its documented
 * order, size and frame count, with hit flashes on everything that can be hit (not on the regent's
 * tail fin — decoration); the cell wall painted only in the ramp zone F's palette cycle names,
 * repeating across and down; the fold band repeating along x; animated frames that differ; every
 * hurtbox of the roster inside the sprite drawn for it. Zone G's art is in
 * `procedural-zone-g.test.ts`.
 *
 * Since R5-06.S2 the file also holds the zone-F v2 stand-ins of design §14 (the mirror of
 * `procedural-zone-b.test.ts`'s brine block): the nine new names at their design sizes, all
 * `native` and absent at art scale 1 (RR-1a), `bg/vault-substrate`, `bg/vault-ribcage` and
 * `bg/vault-haze` seamless at the half-frame period with the substrate carrying **no** ramp
 * colour (design §14), `tiles/terrain-vault-v2` carrying `terrain-vault`'s twenty tiles verbatim
 * before its three §10 variants, and every lit colour of every new sprite at Chebyshev distance
 * ≥ 3 from every reserved palette-cycle ramp (no exemption — no new band rides a cycle).
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_W, WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import * as vault from '../../../scripts/assets/procedural/vault.mjs';
import {
  byName,
  bytes,
  content,
  framesDiffer,
  hurtboxesInside,
  opaqueColours,
  seam,
  wraps,
} from './procedural-zone-helpers.js';

/** The shipped art scale (3/2 — the value the pipeline builds at after R2-01's flip). */
const ART_SCALE = WORLD_SCALE;

/** The shipped tile side at that scale. */
const TERRAIN_TILE_SIZE = terrain.TILE_SIZE;

interface CycleEntry {
  layer: string;
  colors: string[];
}
interface StageFile {
  cycles?: CycleEntry[];
}

/** All `[r, g, b]` of a frame's pixels that carry any alpha. */
function litColours(image: Image): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const p = getPixel(image, x, y);
      if (p[3] > 0) out.push([p[0], p[1], p[2]]);
    }
  }
  return out;
}

/** The distinct ramp colours of the shipped stages (bible §4.4). */
const ramps = (() => {
  const dir = new URL('../../../content/stages/', import.meta.url);
  const set = new Map<string, number[]>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.stage.json')) continue;
    const stage = content<StageFile>('stages/' + file);
    for (const cycle of stage.cycles ?? []) {
      for (const hex of cycle.colors) {
        set.set(
          hex,
          [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
        );
      }
    }
  }
  return set;
})();

/** Chebyshev distance of two colours (the metric the cycle shader compares). */
const chebyshev = (a: number[], b: number[]): number =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

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
    expect(stage.cycles[0].colors).toEqual([...vault.VAULT_RAMP_V2]);
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
      // The tileset's sprite field follows the §10 flip — the v2 grid carries the
      // base tiles verbatim plus the §10 variants appended. Both sheets are flipped
      // now: terrain-vault-v2 by R5-06.S5a, terrain-prism-v2 by R5-07.S5a.
      expect(tileset.sprite).toBe(`tiles/terrain-${id}-v2`);
    }
  });
});

describe('scripts/assets/procedural/vault — R5-06.S2 v2 stand-ins (zone-f.md §14)', () => {
  const sprites = vault.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
  const v2 = sprites.slice(vault.VAULT_SPRITES.length);

  it('keeps the v1 name list and adds the §14 list only above it', () => {
    expect(vault.generate().map((s) => s.name)).toEqual([...vault.VAULT_SPRITES]);
    expect(vault.generate({ artScale: 1 }).map((s) => s.name)).toEqual([...vault.VAULT_SPRITES]);
    expect(v2.map((s) => s.name)).toEqual([...vault.VAULT_V2_SPRITES]);
    for (const sprite of v2) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:vault');
    }
    expect(vault.VAULT_V2_TILE_NAMES.slice(0, 20)).toEqual([...terrain.TERRAIN_TILES]);
    // the membrane keeps its P7 v2 branch: the v1 wall scaled, its ramp swapped for the frozen six
    const membrane = byName(sprites, 'bg/vault-membrane');
    expect([membrane.frames[0].width, membrane.frames[0].height]).toEqual([
      vault.MEMBRANE_TILE_W * ART_SCALE,
      vault.MEMBRANE_TILE_H * ART_SCALE,
    ]);
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/tissue-cyst': [4, 24, 18],
      'enemies/viral-dart': [4, 18, 12],
      'bosses/regent-plate': [1, 30, 24],
      'bosses/regent-blister': [4, 15, 12],
      'bg/vault-substrate': [1, vault.BAND_TILE_W, vault.SUBSTRATE_H],
      'bg/vault-ribcage': [1, vault.BAND_TILE_W, vault.RIBCAGE_H],
      'bg/vault-haze': [2, vault.BAND_TILE_W, vault.HAZE_H],
      'fx/glow-vault-node': [2, 24, 16],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the §14 band heights are whole tile rows (432 = 36, 168 = 14, 48 = 4)
    expect(vault.SUBSTRATE_H).toBe(36 * TERRAIN_TILE_SIZE);
    expect(vault.RIBCAGE_H).toBe(14 * TERRAIN_TILE_SIZE);
    expect(vault.HAZE_H).toBe(4 * TERRAIN_TILE_SIZE);
    const tiles = byName(sprites, 'tiles/terrain-vault-v2');
    expect(tiles.frames).toHaveLength(vault.VAULT_V2_TILE_NAMES.length);
    expect(tiles.frames).toHaveLength(23);
    for (const frame of tiles.frames) {
      expect([frame.width, frame.height]).toEqual([TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE]);
    }
  });

  it('marks the two enemies and the two boss parts hittable, the bands and decor not', () => {
    const hittable = new Set([
      'enemies/tissue-cyst',
      'enemies/viral-dart',
      'bosses/regent-plate',
      'bosses/regent-blister',
    ]);
    for (const sprite of v2) {
      expect(sprite.hitFlash, sprite.name).toBe(hittable.has(sprite.name));
    }
    expect(byName(sprites, 'enemies/tissue-cyst').animations).toEqual({
      idle: [0, 1],
      hatch: [2, 3],
    });
    expect(byName(sprites, 'enemies/viral-dart').animations).toEqual({ flap: [0, 1, 2, 3] });
    expect(byName(sprites, 'bosses/regent-blister').animations).toEqual({ pulse: [0, 1, 2, 3] });
    expect(byName(sprites, 'bg/vault-haze').animations).toEqual({ drift: [0, 1] });
    expect(byName(sprites, 'fx/glow-vault-node').animations).toEqual({ pulse: [0, 1] });
    framesDiffer(v2);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(vault.BAND_TILE_W * 2).toBe(FRAME_W);
  });

  it('draws the substrate opaque and ramp-free, the ribcage and haze keyed and seamless', () => {
    const sub = byName(sprites, 'bg/vault-substrate').frames[0];
    for (let i = 3; i < sub.data.length; i += 4) expect(sub.data[i]).toBe(255);
    expect(seam(sub)).toBe(0);
    // across the wrap seam the pixels stay continuous (the strata wobble on dividing periods)
    for (let y = 0; y < sub.height; y++) {
      const a = getPixel(sub, 0, y);
      const b = getPixel(sub, sub.width - 1, y);
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
      expect(d, `row ${String(y)}`).toBeLessThanOrEqual(40);
    }
    // design §14: the far layer carries NO ramp colour
    const rampSet = new Set<string>(vault.VAULT_RAMP_V2);
    for (const colour of opaqueColours(sub)) expect(rampSet.has(colour), colour).toBe(false);
    const rib = byName(sprites, 'bg/vault-ribcage').frames[0];
    for (let i = 3; i < rib.data.length; i += 4) {
      expect(rib.data[i] === 0 || rib.data[i] === 255, `pixel ${String(i)}`).toBe(true);
    }
    expect(seam(rib)).toBe(0);
    let painted = 0;
    for (let x = 0; x < rib.width; x++) if (getPixel(rib, x, 0)[3] === 255) painted++;
    expect(painted).toBeGreaterThan(rib.width / 2); // the ceiling membrane spans the band
    const haze = byName(sprites, 'bg/vault-haze').frames[0];
    let opaque = 0;
    for (let i = 3; i < haze.data.length; i += 4) {
      expect(haze.data[i] === 0 || haze.data[i] === 255, `pixel ${String(i)}`).toBe(true);
      if (haze.data[i] === 255) opaque++;
    }
    expect(opaque).toBeGreaterThan(100);
    expect(opaque * 12).toBeLessThan(haze.width * haze.height); // never hides a bullet lane
    expect(seam(haze)).toBe(0);
    expect(imagesEqual(haze, byName(sprites, 'bg/vault-haze').frames[1])).toBe(false);
    const glow = byName(sprites, 'fx/glow-vault-node');
    for (const frame of glow.frames) {
      for (let i = 3; i < frame.data.length; i += 4) {
        expect([0, 110, 204, 255]).toContain(frame.data[i]);
      }
    }
    expect(getPixel(glow.frames[0], 12, 8)[3]).toBe(255); // the core is lit
  });

  it('carries terrain-vault’s twenty tiles verbatim before the three variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-vault-v2');
    expect(tiles.anchor).toEqual([0, 0]);
    const base = terrain.renderTerrainTiles(TERRAIN_TILE_SIZE, 'tiles/terrain-vault');
    expect(base).toHaveLength(20);
    for (let i = 0; i < base.length; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), vault.VAULT_V2_TILE_NAMES[i]).toBe(true);
    }
    expect(Object.keys(tiles.animations)).toEqual([...vault.VAULT_V2_TILE_NAMES]);
    // the two solid variants are fully opaque …
    for (const name of ['tissue-live', 'calcified'] as const) {
      const frame = tiles.frames[vault.VAULT_V2_TILE_NAMES.indexOf(name)];
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          expect(getPixel(frame, x, y)[3], `${name} ${String(x)},${String(y)}`).toBe(255);
        }
      }
    }
    // … and the empty decor tile is a binary stud
    const nodule = tiles.frames[vault.VAULT_V2_TILE_NAMES.indexOf('nodule')];
    let on = 0;
    for (let y = 0; y < nodule.height; y++) {
      for (let x = 0; x < nodule.width; x++) {
        const a = getPixel(nodule, x, y)[3];
        expect(a === 0 || a === 255, `nodule ${String(x)},${String(y)}`).toBe(true);
        if (a === 255) on++;
      }
    }
    expect(on).toBeGreaterThan(8);
    expect(on).toBeLessThan(nodule.width * nodule.height - 8);
  });

  it('keeps every lit colour at distance ≥ 3 from the reserved ramps', () => {
    for (const sprite of v2) {
      for (const frame of sprite.frames) {
        const seen = new Set<string>();
        for (const rgb of litColours(frame)) {
          const key = rgb.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          for (const [hex, ramp] of ramps) {
            expect(
              chebyshev(rgb, ramp),
              `${sprite.name} rgb(${key}) vs ${hex}`,
            ).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it('runs byte-identical twice', () => {
    const again = vault.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
