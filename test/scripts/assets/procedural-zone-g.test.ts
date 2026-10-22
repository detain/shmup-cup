/**
 * The zone G placeholder art of plan M2-13 (`scripts/assets/procedural/prism.mjs`, split out of
 * `procedural-zones-fg.test.ts` by R5-P.P5c): every zone G sprite drawn in its documented order,
 * size and frame count, with hit flashes on everything that can be hit (not on the monarch's
 * housing — decoration); the crystal facets painted only in the ramp zone G's palette cycle names,
 * repeating across and down; the spire band repeating along x; animated frames that differ; every
 * hurtbox of the roster inside the sprite drawn for it. Zone F's art and the pair's shared tileset
 * check are in `procedural-zone-f.test.ts`.
 *
 * Since R5-07.S2 the file also holds the zone-G v2 stand-ins of design §14 (the mirror of
 * `procedural-zone-d.test.ts`'s block): the eleven new names at their design sizes, all `native`
 * and absent at art scale 1 (RR-1a), the `tiles/terrain-prism-v2` grid carrying `terrain-prism`'s
 * twenty tiles verbatim before the four §10 additions, the §9 bands seamless at the half-frame
 * period — and, on the zone-B brine route, **every** new lit colour (the chimney EXEMPT pattern is
 * not needed here) at Chebyshev distance ≥ 3 from every reserved palette-cycle ramp.
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_W, PLAYFIELD_H, TILE_SIZE, WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as prism from '../../../scripts/assets/procedural/prism.mjs';
import {
  renderTerrainTiles,
  TERRAIN_TILES,
  TILE_SIZE as TERRAIN_TILE_SIZE,
} from '../../../scripts/assets/procedural/terrain.mjs';
import {
  bytes,
  byName,
  content,
  framesDiffer,
  hurtboxesInside,
  opaqueColours,
  seam,
  wraps,
} from './procedural-zone-helpers.js';

interface CycleEntry {
  layer: string;
  colors: string[];
}
interface StageFile {
  cycles?: CycleEntry[];
}

/** The shipped art scale (3/2 — the value the pipeline builds at after R2-01's flip). */
const ART_SCALE = WORLD_SCALE;

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

/** The first opaque row of a column, or the image height when the column is empty. */
function topOf(image: Image, x: number): number {
  for (let y = 0; y < image.height; y++) if (getPixel(image, x, y)[3] > 0) return y;
  return image.height;
}

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
    expect(stage.cycles[0].colors).toEqual([...prism.PRISM_RAMP_V2]);
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

describe('scripts/assets/procedural/prism — R5-07.S2 v2 stand-ins (zone-g.md §14)', () => {
  const sprites = prism.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
  const v2 = sprites.slice(prism.PRISM_SPRITES.length);

  it('keeps the v1 set of the scale-1 path and adds the §14 list only above it', () => {
    expect(prism.generate().map((s) => s.name)).toEqual([...prism.PRISM_SPRITES]);
    expect(prism.generate({ artScale: 1 }).map((s) => s.name)).toEqual([...prism.PRISM_SPRITES]);
    expect(v2.map((s) => s.name)).toEqual([...prism.PRISM_V2_SPRITES]);
    for (const sprite of v2) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:prism');
    }
    expect(prism.PRISM_V2_TILE_NAMES.slice(0, 20)).toEqual([...TERRAIN_TILES]);
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/prism-shard': [3, 15, 15],
      'enemies/prism-glint': [4, 18, 14],
      'bosses/facet-crown': [2, 30, 15],
      'bosses/facet-plating': [1, 24, 36],
      'bosses/facet-emitter': [4, 15, 15],
      'bosses/facet-wing': [1, 33, 21],
      'bg/prism-deep': [1, prism.BAND_TILE_W, prism.DEEP_H],
      'bg/prism-ridge': [1, prism.BAND_TILE_W, prism.RIDGE_H],
      'bg/prism-veil': [2, prism.BAND_TILE_W, prism.VEIL_H],
      'fx/glow-prism-vent': [2, 36, 24],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the monarch's new parts under the bible §5.7 height cap, like zone D's prow
    for (const name of ['bosses/facet-plating', 'bosses/facet-wing']) {
      expect(byName(sprites, name).frames[0].height, name).toBeLessThanOrEqual(
        Math.round(0.6 * PLAYFIELD_H),
      );
    }
    const tiles = byName(sprites, 'tiles/terrain-prism-v2');
    expect(tiles.frames).toHaveLength(prism.PRISM_V2_TILE_NAMES.length);
    expect(tiles.frames).toHaveLength(24); // design §14's count, met exactly
    for (const frame of tiles.frames) {
      expect([frame.width, frame.height]).toEqual([TILE_SIZE, TILE_SIZE]);
    }
  });

  it('marks the §14 flash column hittable, the bands, the glow and the tiles not', () => {
    const hittable = new Set([
      'enemies/prism-shard',
      'enemies/prism-glint',
      'bosses/facet-crown',
      'bosses/facet-plating',
      'bosses/facet-emitter',
      'bosses/facet-wing',
    ]);
    for (const sprite of v2) {
      expect(sprite.hitFlash, sprite.name).toBe(hittable.has(sprite.name));
    }
    expect(byName(sprites, 'enemies/prism-shard').animations).toEqual({ spin: [0, 1, 2] });
    expect(byName(sprites, 'enemies/prism-glint').animations).toEqual({ pulse: [0, 1, 2, 3] });
    expect(byName(sprites, 'bosses/facet-crown').animations).toEqual({ gleam: [0, 1] });
    expect(byName(sprites, 'bosses/facet-emitter').animations).toEqual({ charge: [0, 1, 2, 3] });
    expect(byName(sprites, 'bg/prism-veil').animations).toEqual({ drift: [0, 1] });
    expect(byName(sprites, 'fx/glow-prism-vent').animations).toEqual({ pulse: [0, 1] });
    framesDiffer(v2);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(prism.BAND_TILE_W * 2).toBe(FRAME_W);
  });

  it('draws the depth fully opaque and the ridge, veil and glow keyed, seamless, binary', () => {
    const deep = byName(sprites, 'bg/prism-deep').frames[0];
    for (let i = 3; i < deep.data.length; i += 4) expect(deep.data[i]).toBe(255);
    const ridge = byName(sprites, 'bg/prism-ridge').frames[0];
    for (let x = 0; x < ridge.width; x++) {
      const t = topOf(ridge, x);
      expect(t, `column ${x}`).toBeLessThan(ridge.height); // every column reaches the floor
      expect(t).toBeGreaterThanOrEqual(4); // key room over every spire
      let float = false;
      for (let y = ridge.height - 1; y >= 0; y--) {
        const a = getPixel(ridge, x, y)[3];
        expect(a === 0 || a === 255, `ridge ${x},${y} alpha`).toBe(true);
        expect(a > 0 && float, `column ${x} floats`).toBe(false); // solid up from the base
        if (a === 0) float = true;
      }
      expect(ridge.height - t).toBeGreaterThanOrEqual(60); // the ridge mass itself
      expect(
        Math.abs(t - topOf(ridge, (x + 1) % ridge.width)),
        `spire step ${x}`,
      ).toBeLessThanOrEqual(3);
    }
    for (let x = 0; x < ridge.width; x++) {
      expect(getPixel(ridge, x, ridge.height - 1)[3], `base ${x}`).toBe(255);
    }
    expect(seam(ridge)).toBeLessThan(24);
    for (const frame of byName(sprites, 'bg/prism-veil').frames) {
      let opaque = 0;
      for (let i = 3; i < frame.data.length; i += 4) {
        expect(frame.data[i] === 0 || frame.data[i] === 255, `pixel ${i}`).toBe(true);
        if (frame.data[i] === 255) opaque++;
      }
      expect(opaque).toBeGreaterThan(8);
      // the §9 veil law: sparse enough to never hide a bullet lane
      expect(opaque).toBeLessThan((frame.width * frame.height) / 12);
      expect(seam(frame)).toBeLessThan(24);
    }
    const glow = byName(sprites, 'fx/glow-prism-vent').frames[0];
    expect(byName(sprites, 'fx/glow-prism-vent').anchor).toEqual([18, 12]);
    for (let i = 3; i < glow.data.length; i += 4) {
      expect([0, 110, 204, 255], `glow alpha ${glow.data[i]}`).toContain(glow.data[i]);
    }
  });

  it('carries terrain-prism’s twenty tiles verbatim before the four §10 variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-prism-v2');
    expect(tiles.anchor).toEqual([0, 0]);
    const base = renderTerrainTiles(TERRAIN_TILE_SIZE, 'tiles/terrain-prism');
    for (let i = 0; i < base.length; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), prism.PRISM_V2_TILE_NAMES[i]).toBe(true);
    }
    expect(Object.keys(tiles.animations)).toEqual([...prism.PRISM_V2_TILE_NAMES]);
    // the three colliding variants are fully opaque (all-12 masks, W5-11), the decor keys
    for (const name of ['crystal', 'crystal-hot', 'shard-floor'] as const) {
      const frame = tiles.frames[prism.PRISM_V2_TILE_NAMES.indexOf(name)];
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          expect(getPixel(frame, x, y)[3], `${name} ${x},${y}`).toBe(255);
        }
      }
    }
    const decor = tiles.frames[prism.PRISM_V2_TILE_NAMES.indexOf('facet-glow')];
    let opaque = 0;
    for (let i = 3; i < decor.data.length; i += 4) {
      expect(decor.data[i] === 0 || decor.data[i] === 255, `facet-glow ${i}`).toBe(true);
      if (decor.data[i] === 255) opaque++;
    }
    expect(opaque).toBeGreaterThan(8);
    expect(opaque).toBeLessThan(decor.width * decor.height - 8);
    // crystal-hot is the crystal scoured, not a foreign tile: most of its pixels are the base's
    const crystal = tiles.frames[prism.PRISM_V2_TILE_NAMES.indexOf('crystal')];
    const hot = tiles.frames[prism.PRISM_V2_TILE_NAMES.indexOf('crystal-hot')];
    let same = 0;
    for (let y = 0; y < crystal.height; y++) {
      for (let x = 0; x < crystal.width; x++) {
        const a = getPixel(crystal, x, y);
        const b = getPixel(hot, x, y);
        if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]) same++;
      }
    }
    expect(same).toBeGreaterThan((crystal.width * crystal.height) / 2);
  });

  it('keeps every v2 lit colour at distance ≥ 3 from the reserved ramps', () => {
    // the brine route: no EXEMPT row and no own-ramp skip — the §9 "paint exactly" line belongs
    // to the R5-D6 real art; the stand-ins keep the 3/255 margin (design §14's last paragraph)
    expect(ramps.size).toBeGreaterThanOrEqual(40);
    for (const sprite of v2) {
      for (const frame of sprite.frames) {
        const seen = new Set<string>();
        for (const rgb of litColours(frame)) {
          const key = rgb.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          for (const [hex, ramp] of ramps) {
            expect(chebyshev(rgb, ramp), `${sprite.name} #${key} vs ${hex}`).toBeGreaterThanOrEqual(
              3,
            );
          }
        }
      }
    }
  });

  it('runs byte-identical twice', () => {
    const again = prism.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
