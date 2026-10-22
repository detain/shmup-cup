/**
 * The zone C placeholder art of plan M2-11 (`scripts/assets/procedural/dune.mjs`, split out of
 * `procedural-zones.test.ts` by R5-P.P5c): every zone C sprite drawn in its documented order,
 * size and frame count, with hit flashes on everything that can be hit; the ridge band opaque
 * below its profile and joining at the tile edge; the twin suns' translucent glow with the red
 * kept for the widow alone.
 *
 * Since R5-03.S2 the file also holds the zone-C v2 stand-ins of design §14 (the mirror of
 * `procedural-zone-a.test.ts`'s azure block): the ten new names at their design sizes, all
 * `native` and absent at art scale 1 (RR-1a), the `tiles/terrain-dune-v2` grid carrying
 * `terrain-dune`'s twenty tiles verbatim before its sixteen §10 variants, the three bands of §9
 * seamless at the half-frame period — `bg/dune-blaze` painted in exactly the stage's frozen
 * DUNE ramp colours — and every other lit colour at Chebyshev distance ≥ 3 from every reserved
 * palette-cycle ramp.
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_W, PLAYFIELD_H, TILE_SIZE, WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as dune from '../../../scripts/assets/procedural/dune.mjs';
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
  mirroredVertically,
  opaqueColours,
  seam,
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

describe('scripts/assets/procedural/dune (M2-11)', () => {
  const sprites = dune.generate();

  it('draws the zone C sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...dune.DUNE_SPRITES]);
    for (const sprite of sprites) {
      const decoration = sprite.name.startsWith('bg/') || sprite.name.includes('widow-leg');
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:dune');
    }
    expect(byName(sprites, 'enemies/dust-devil').frames).toHaveLength(3);
    expect(byName(sprites, 'enemies/dust-devil').animations).toEqual({ spin: [0, 1, 2] });
    expect(
      mirroredVertically(
        byName(sprites, 'bosses/widow-leg-top').frames[0],
        byName(sprites, 'bosses/widow-leg-bottom').frames[0],
      ),
    ).toBe(true);
  });

  it('draws a ridge band opaque below its profile, joining at the tile edge', () => {
    const image = byName(sprites, 'bg/dune-ridge').frames[0];
    expect([image.width, image.height]).toEqual([dune.RIDGE_TILE_W, dune.RIDGE_TILE_H]);
    const top = (x: number): number => {
      for (let y = 0; y < image.height; y++) if (getPixel(image, x, y)[3] > 0) return y;
      return image.height;
    };
    for (let x = 0; x < image.width; x++) {
      for (let y = top(x); y < image.height; y++) expect(getPixel(image, x, y)[3]).toBe(255);
      expect(image.height - top(x)).toBeGreaterThan(8);
    }
    expect(Math.abs(top(0) - top(image.width - 1))).toBeLessThanOrEqual(2);
  });

  it('draws the twin suns in a translucent glow and keeps the red for the widow alone', () => {
    const suns = byName(sprites, 'bg/dune-suns').frames[0];
    expect([suns.width, suns.height]).toEqual([dune.SUNS_TILE_W, dune.SUNS_TILE_H]);
    let glow = 0;
    for (let i = 3; i < suns.data.length; i += 4)
      if (suns.data[i] > 0 && suns.data[i] < 255) glow++;
    expect(glow).toBeGreaterThan(100);
    expect(opaqueColours(byName(sprites, 'bosses/widow-body').frames[0]).has('#c83020')).toBe(true);
  });
});

describe('scripts/assets/procedural/dune — R5-03.S2 v2 stand-ins (zone-c.md §14)', () => {
  const sprites = dune.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
  const v2 = sprites.slice(dune.DUNE_SPRITES.length);

  it('keeps the v1 set byte of the scale-1 path and adds the §14 list only above it', () => {
    expect(dune.generate().map((s) => s.name)).toEqual([...dune.DUNE_SPRITES]);
    expect(dune.generate({ artScale: 1 }).map((s) => s.name)).toEqual([...dune.DUNE_SPRITES]);
    expect(v2.map((s) => s.name)).toEqual([...dune.DUNE_V2_SPRITES]);
    for (const sprite of v2) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:dune');
    }
    expect(dune.DUNE_V2_TILE_NAMES.slice(0, 20)).toEqual([...TERRAIN_TILES]);
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/spine-burrower': [4, 21, 21],
      'enemies/dune-lance': [4, 30, 15],
      'bosses/scorpion-shell': [2, 45, 36],
      'bosses/scorpion-claw': [2, 27, 18],
      'bosses/scorpion-tail': [1, 45, 21],
      'bosses/widow-egg-sac': [1, 36, 27],
      'bg/dune-sky': [1, dune.BAND_TILE_W, dune.SKY_H],
      'bg/dune-blaze': [1, dune.BAND_TILE_W, dune.BLAZE_H],
      'bg/dune-grass': [1, dune.BAND_TILE_W, dune.GRASS_H],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the scorpion's shell under the bible §5.7 height cap, like zone A's captain
    expect(byName(sprites, 'bosses/scorpion-shell').frames[0].height).toBeLessThanOrEqual(
      Math.round(0.6 * PLAYFIELD_H),
    );
    const tiles = byName(sprites, 'tiles/terrain-dune-v2');
    expect(tiles.frames).toHaveLength(dune.DUNE_V2_TILE_NAMES.length);
    expect(tiles.frames).toHaveLength(36);
    for (const frame of tiles.frames) {
      expect([frame.width, frame.height]).toEqual([TILE_SIZE, TILE_SIZE]);
    }
  });

  it('marks the two enemies and the scorpion parts hittable, the decor and bands not', () => {
    const hittable = new Set([
      'enemies/spine-burrower',
      'enemies/dune-lance',
      'bosses/scorpion-shell',
      'bosses/scorpion-claw',
    ]);
    for (const sprite of v2) {
      expect(sprite.hitFlash, sprite.name).toBe(hittable.has(sprite.name));
    }
    expect(byName(sprites, 'enemies/spine-burrower').animations).toEqual({
      idle: [0, 1],
      fire: [2, 3],
    });
    expect(byName(sprites, 'bosses/scorpion-shell').animations).toEqual({ turn: [0, 1] });
    expect(byName(sprites, 'bosses/scorpion-claw').animations).toEqual({ snap: [0, 1] });
    framesDiffer(v2);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(dune.BAND_TILE_W * 2).toBe(FRAME_W);
  });

  it('draws the sky fully opaque and the blaze flat in the frozen ramp with binary alpha', () => {
    const sky = byName(sprites, 'bg/dune-sky').frames[0];
    for (let i = 3; i < sky.data.length; i += 4) expect(sky.data[i]).toBe(255);
    const image = byName(sprites, 'bg/dune-blaze').frames[0];
    for (let x = 0; x < image.width; x++) {
      const t = topOf(image, x);
      expect(t, `column ${x}`).toBeLessThan(image.height);
      for (let y = t; y < image.height; y++) expect(getPixel(image, x, y)[3]).toBe(255);
      expect(image.height - t).toBeGreaterThanOrEqual(24);
      expect(Math.abs(t - topOf(image, (x + 1) % image.width)), `step at ${x}`).toBeLessThanOrEqual(
        3,
      );
    }
    expect(seam(image)).toBeLessThan(24);
    for (let i = 3; i < image.data.length; i += 4) {
      expect(image.data[i] === 0 || image.data[i] === 255, `pixel ${i}`).toBe(true);
    }
    const grass = byName(sprites, 'bg/dune-grass').frames[0];
    for (let x = 0; x < grass.width; x++) {
      for (let y = 0; y < 32; y++) {
        expect(getPixel(grass, x, y)[3], `key at ${x},${y}`).toBe(0);
      }
      for (let y = 84; y < grass.height; y++) {
        expect(getPixel(grass, x, y)[3], `mass at ${x},${y}`).toBe(255);
      }
    }
    for (let i = 3; i < grass.data.length; i += 4) {
      expect(grass.data[i] === 0 || grass.data[i] === 255, `pixel ${i}`).toBe(true);
    }
  });

  it('paints the blaze in exactly the stage-cycled DUNE colours', () => {
    const stage = content<StageFile>('stages/zone-c.stage.json');
    const dune0 = (stage.cycles ?? []).find((c) => c.layer === 'mid');
    expect(dune0?.colors.length).toBeGreaterThan(0);
    expect([...dune.DUNE_RAMP_V2].sort()).toEqual([...(dune0?.colors ?? [])].sort());
    const seen = opaqueColours(byName(sprites, 'bg/dune-blaze').frames[0]);
    expect([...seen].sort()).toEqual([...(dune0?.colors ?? [])].sort());
  });

  it('carries terrain-dune’s twenty tiles verbatim before the sixteen variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-dune-v2');
    expect(tiles.anchor).toEqual([0, 0]);
    const base = renderTerrainTiles(TERRAIN_TILE_SIZE, 'tiles/terrain-dune');
    for (let i = 0; i < base.length; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), dune.DUNE_V2_TILE_NAMES[i]).toBe(true);
    }
    expect(Object.keys(tiles.animations)).toEqual([...dune.DUNE_V2_TILE_NAMES]);
    // the solid classes are fully opaque, the corners are stepped binaries, the fringe is
    // contiguous from the ceiling, and the decor keys
    for (const name of [
      'solid-2',
      'solid-3',
      'floor-2',
      'floor-3',
      'brick-crack',
      'brick-crack-2',
    ] as const) {
      const frame = tiles.frames[dune.DUNE_V2_TILE_NAMES.indexOf(name)];
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          expect(getPixel(frame, x, y)[3], `${name} ${x},${y}`).toBe(255);
        }
      }
    }
    for (const name of [
      'corner-outer-left',
      'corner-outer-right',
      'corner-inner-left',
      'corner-inner-right',
      'ceil-corner-outer',
      'ceil-corner-inner',
    ] as const) {
      const frame = tiles.frames[dune.DUNE_V2_TILE_NAMES.indexOf(name)];
      const ceil = name.startsWith('ceil-');
      let open = 0;
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          const a = getPixel(frame, x, y)[3];
          expect(a === 0 || a === 255, `${name} ${x},${y} alpha`).toBe(true);
          if (a === 0) open++;
        }
      }
      expect(open, name).toBeGreaterThanOrEqual(8);
      const edgeRow = ceil ? 0 : frame.height - 1;
      for (let x = 0; x < frame.width; x++) {
        expect(getPixel(frame, x, edgeRow)[3], `${name} attach row ${x}`).toBe(255);
      }
    }
    const fringe = tiles.frames[dune.DUNE_V2_TILE_NAMES.indexOf('ceiling-2')];
    for (let x = 0; x < fringe.width; x++) {
      expect(getPixel(fringe, x, 0)[3]).toBe(255);
      let hole = false;
      for (let y = 0; y < fringe.height; y++) {
        const on = getPixel(fringe, x, y)[3] > 0;
        expect(on && hole, `ceiling-2 column ${x} floats`).toBe(false);
        if (!on) hole = true;
        expect(on ? 255 : 0, `ceiling-2 ${x},${y} alpha`).toBe(getPixel(fringe, x, y)[3]);
      }
    }
    for (const name of ['decor-tuft', 'decor-bone', 'decor-glass'] as const) {
      const frame = tiles.frames[dune.DUNE_V2_TILE_NAMES.indexOf(name)];
      let opaque = 0;
      for (let i = 3; i < frame.data.length; i += 4) {
        expect(frame.data[i] === 0 || frame.data[i] === 255, `${name} ${i}`).toBe(true);
        if (frame.data[i] === 255) opaque++;
      }
      expect(opaque, name).toBeGreaterThan(8);
      expect(opaque, name).toBeLessThan(frame.width * frame.height - 8);
    }
  });

  it('keeps every lit colour except the blaze at distance ≥ 3 from the reserved ramps', () => {
    for (const sprite of v2) {
      if (sprite.name === 'bg/dune-blaze') continue; // the flat band IS the ramp (§9, R5-P.P7)
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
    const again = dune.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
