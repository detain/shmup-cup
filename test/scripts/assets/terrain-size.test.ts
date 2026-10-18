/**
 * `scripts/assets/procedural/terrain.mjs` at any tile size (plan_resolution.md R1-04): the atlas
 * size stays `@shmup/core` `TILE_SIZE` and its 8-px frames stay byte-identical (a pinned hash);
 * {@link renderTerrainTiles} draws the same tiles at 12 px, every slope a {@link lineMask}
 * between half-tile heights; {@link resampleMask} moves every shipped mask from 8 to 12 so that
 * it equals the opaque pixels of the 12-px frame (the contract R1-03's rescale tool relies on),
 * moves straight edges exactly both ways and anything else nearest-neighbour; bad sizes and masks
 * throw. Since R2-01 it also pins the interim art stage's {@link INTERIM_ART_SCALE} to core's
 * `ART_SCALE` (the pipeline's own copy, flipped with core's), and asks that the generator's tilesets
 * are `native` (never upscaled: drawn at their tile size) and draw at whatever tile size the
 * pipeline asks for.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_SCALE, TILE_SIZE as CORE_TILE_SIZE } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { INTERIM_ART_SCALE } from '../../../scripts/assets/interim.mjs';
import {
  TERRAIN_PALETTES,
  TERRAIN_TILES,
  TILE_SIZE,
  generate,
  lineMask,
  lineMaskEnds,
  renderTerrainTiles,
  resampleMask,
} from '../../../scripts/assets/procedural/terrain.mjs';

/** The shipped tilesets folder. */
const TILESETS = fileURLToPath(new URL('../../../content/tilesets', import.meta.url));

/** A shipped tileset file (the fields this test reads). */
interface TilesetJson {
  readonly sprite: string;
  readonly tileSize: number;
  readonly tiles: readonly {
    readonly name: string;
    readonly type: string;
    readonly frame: number;
    readonly anchor: 'floor' | 'ceiling';
    readonly mask: readonly number[];
  }[];
}

/** Every shipped tileset (the format example included), by file name. */
const SHIPPED: readonly [string, TilesetJson][] = readdirSync(TILESETS)
  .filter((name) => name.endsWith('.tileset.json'))
  .sort()
  .map((name) => [name, JSON.parse(readFileSync(join(TILESETS, name), 'utf8')) as TilesetJson]);

/** Every palette's sprite name. */
const NAMES = Object.keys(TERRAIN_PALETTES);

/**
 * Whether a pixel of an image is opaque.
 *
 * @param image - The image.
 * @param x - Column.
 * @param y - Row.
 * @returns `true` for alpha > 0.
 */
const opaque = (image: Image, x: number, y: number): boolean => getPixel(image, x, y)[3] > 0;

/**
 * The column heights of a tile frame's opaque pixels, measured from its anchor edge (asserting
 * every column is one solid run touching that edge).
 *
 * @param image - The tile frame.
 * @param anchor - The edge the heights grow from.
 * @returns One height per column.
 */
function opaqueHeights(image: Image, anchor: 'floor' | 'ceiling'): number[] {
  const size = image.width;
  const heights: number[] = [];
  for (let x = 0; x < size; x++) {
    let h = 0;
    while (h < size && opaque(image, x, anchor === 'floor' ? size - 1 - h : h)) h++;
    for (let k = h; k < size; k++) {
      expect(opaque(image, x, anchor === 'floor' ? size - 1 - k : k), `column ${x} row ${k}`).toBe(
        false,
      );
    }
    heights.push(h);
  }
  return heights;
}

describe('scripts/assets/procedural/terrain — the atlas size (R1-04)', () => {
  it('draws the atlas at the tile size core builds with', () => {
    expect(TILE_SIZE).toBe(CORE_TILE_SIZE);
    for (const set of generate()) {
      for (const frame of set.frames) {
        expect([frame.width, frame.height]).toEqual([TILE_SIZE, TILE_SIZE]);
      }
    }
  });

  it('builds the atlas at the art scale core lays the UI out for (R2-01)', () => {
    // The pipeline's own copy of core's ART_SCALE (1 until the flip, 3/2 after); they flip together.
    expect(INTERIM_ART_SCALE).toBe(ART_SCALE);
  });

  it('marks its tilesets native and draws them at the tile size it is asked for (R2-01)', () => {
    for (const size of [8, 12]) {
      const sets = generate({ tileSize: size });
      expect(sets.map((set) => set.name)).toEqual(NAMES);
      for (const set of sets) {
        expect(set.native, set.name).toBe(true);
        const frames = renderTerrainTiles(size, set.name);
        set.frames.forEach((frame, i) =>
          expect(imagesEqual(frame, frames[i]), set.name).toBe(true),
        );
      }
    }
    for (const set of generate()) expect(set.native, set.name).toBe(true);
    expect(() => generate({ tileSize: 9 })).toThrow(RangeError);
  });

  it('keeps the 8-px frames byte-identical to the pre-R1-04 generator', () => {
    const hash = createHash('sha256');
    for (const name of NAMES)
      for (const frame of renderTerrainTiles(8, name)) hash.update(frame.data);
    expect(hash.digest('hex')).toBe(
      '9a71cb55aa9082d12be021c6755d36ea4fc2f3ed235bf069d8512f892de8ec9c',
    );
  });

  it('gives generate() the frames renderTerrainTiles draws at TILE_SIZE', () => {
    const sets = generate();
    expect(sets.map((set) => set.name)).toEqual(NAMES);
    for (const set of sets) {
      const frames = renderTerrainTiles(TILE_SIZE, set.name);
      expect(set.frames).toHaveLength(TERRAIN_TILES.length);
      set.frames.forEach((frame, i) => expect(imagesEqual(frame, frames[i]), set.name).toBe(true));
    }
  });
});

describe('scripts/assets/procedural/terrain — 12-px tiles (R1-04)', () => {
  it('draws every tile 12 × 12, in TERRAIN_TILES order', () => {
    for (const name of NAMES) {
      const frames = renderTerrainTiles(12, name);
      expect(frames).toHaveLength(TERRAIN_TILES.length);
      for (const frame of frames) expect([frame.width, frame.height]).toEqual([12, 12]);
    }
  });

  it('scales the slopes with the tile: 45° = 1 … 12, 22.5° = half-pixel steps', () => {
    const frames = renderTerrainTiles(12, 'tiles/terrain-a');
    const heights = (tile: (typeof TERRAIN_TILES)[number], anchor: 'floor' | 'ceiling') =>
      opaqueHeights(frames[TERRAIN_TILES.indexOf(tile)], anchor);
    expect(heights('slope-up', 'floor')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(heights('slope-up-low', 'floor')).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
    expect(heights('slope-up-high', 'floor')).toEqual([6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    expect(heights('slope-down', 'floor')).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(heights('ceil-slope-down-low', 'ceiling')).toEqual([6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0]);
    for (const tile of ['solid', 'floor', 'wall-left', 'wall-right', 'brick', 'cube'] as const) {
      expect(heights(tile, 'floor'), tile).toEqual(new Array<number>(12).fill(12));
    }
  });

  it('moves the rims, the brick courses and the crystal core with the size', () => {
    const palette = TERRAIN_PALETTES['tiles/terrain-a'];
    const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    const frames = renderTerrainTiles(12, 'tiles/terrain-a');
    const at = (tile: (typeof TERRAIN_TILES)[number], x: number, y: number) =>
      getPixel(frames[TERRAIN_TILES.indexOf(tile)], x, y).slice(0, 3);
    // A floor's top row is the rim, the row under it the subsurface; solid rock has no rim.
    expect(at('floor', 5, 0)).toEqual(rgb(palette.surface));
    expect(at('floor', 5, 1)).toEqual(rgb(palette.subsurface));
    expect(at('ceiling', 5, 11)).toEqual(rgb(palette.surface));
    expect(palette.rock.map(rgb)).toContainEqual(at('solid', 5, 0));
    // The brick's mortar rows sit at the middle and the bottom; the crystal's core in the middle.
    const mortar = at('brick', 0, 5);
    expect(at('brick', 7, 11)).toEqual(mortar);
    expect(at('brick', 2, 2)).not.toEqual(mortar);
    expect(at('cube', 5, 5)).toEqual(at('cube', 6, 6));
    expect(at('cube', 5, 5)).toEqual(at('cube', 11, 11)); // core = dark edge colour
    expect(at('cube', 3, 3)).not.toEqual(at('cube', 5, 5));
  });

  it('draws masks equal to every shipped mask resampled from 8 to 12 px', () => {
    let checked = 0;
    for (const [file, tileset] of SHIPPED) {
      expect(tileset.tileSize, file).toBe(8);
      const frames = renderTerrainTiles(12, tileset.sprite);
      for (const tile of tileset.tiles) {
        if (tile.type === 'empty') continue; // decoration: its frame need not match a mask
        expect(opaqueHeights(frames[tile.frame], tile.anchor), `${file} ${tile.name}`).toEqual(
          resampleMask(tile.mask, 8, 12),
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(9 * TERRAIN_TILES.length);
  });

  it('rejects odd, tiny or fractional sizes and unknown palettes', () => {
    for (const size of [9, 2, 0, -8, 7.5, Number.NaN]) {
      expect(() => renderTerrainTiles(size, 'tiles/terrain-a'), String(size)).toThrow(RangeError);
    }
    expect(() => renderTerrainTiles(12, 'tiles/nope')).toThrow(/no terrain palette/);
    expect(() => renderTerrainTiles(12, 'toString')).toThrow(RangeError);
  });
});

describe('scripts/assets/procedural/terrain — masks', () => {
  it('draws straight edges like core’s heightfield generator', () => {
    expect(lineMask(0, 8, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(lineMask(0, 4, 8)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(lineMask(8, 4, 8)).toEqual([8, 7, 7, 6, 6, 5, 5, 4]);
    expect(lineMask(6, 12, 12)).toEqual([6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    expect(lineMask(12, 0, 12)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(lineMask(3, 3, 12)).toEqual(new Array<number>(12).fill(3));
  });

  it('finds the half-tile ends of every straight edge, and none for other shapes', () => {
    for (const size of [8, 12]) {
      const ends = [0, size / 2, size];
      for (const h0 of ends) {
        for (const h1 of ends) expect(lineMaskEnds(lineMask(h0, h1, size), size)).toEqual([h0, h1]);
      }
    }
    expect(lineMaskEnds([8, 0, 8, 0, 8, 0, 8, 0], 8)).toBeNull();
    expect(lineMaskEnds(lineMask(2, 6, 8), 8)).toBeNull(); // ends off the half-tile grid
    expect(lineMaskEnds([1, 2, 3], 8)).toBeNull();
    expect(lineMaskEnds(lineMask(0, 9, 9), 9)).toBeNull();
  });

  it('resamples straight edges exactly, both ways', () => {
    for (const [from, to] of [
      [8, 12],
      [12, 8],
      [8, 16],
    ]) {
      const ends = [0, from / 2, from];
      for (const h0 of ends) {
        for (const h1 of ends) {
          expect(resampleMask(lineMask(h0, h1, from), from, to)).toEqual(
            lineMask((h0 * to) / from, (h1 * to) / from, to),
          );
        }
      }
    }
    for (const [, tileset] of SHIPPED) {
      for (const tile of tileset.tiles) {
        expect(resampleMask(resampleMask(tile.mask, 8, 12), 12, 8), tile.name).toEqual(tile.mask);
      }
    }
  });

  it('resamples any other mask nearest-neighbour, heights rounded', () => {
    expect(resampleMask([8, 0, 8, 0, 8, 0, 8, 0], 8, 12)).toEqual([
      12, 12, 0, 12, 12, 0, 12, 12, 0, 12, 12, 0,
    ]);
    expect(resampleMask([1, 0, 0, 0, 0, 0, 0, 0], 8, 12)).toEqual([
      2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    // An odd target size has no whole half-tile height: the straight edge is resampled too.
    expect(resampleMask([1, 2, 3, 4, 5, 6, 7, 8], 8, 9)).toEqual([1, 1, 2, 3, 5, 6, 7, 8, 9]);
  });

  it('returns a fresh copy at the same size', () => {
    const line = [0, 1, 1, 2, 2, 3, 3, 4];
    const other = [3, 0, 8, 1, 0, 0, 2, 5];
    for (const mask of [line, other]) {
      const same = resampleMask(mask, 8, 8);
      expect(same).toEqual(mask);
      expect(same).not.toBe(mask);
    }
  });

  it('rejects bad sizes and masks', () => {
    const mask = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(() => resampleMask(mask, 8, 0)).toThrow(RangeError);
    expect(() => resampleMask(mask, 8, 7.5)).toThrow(RangeError);
    expect(() => resampleMask(mask, 0, 12)).toThrow(RangeError);
    expect(() => resampleMask(mask, 12, 8)).toThrow(/12/);
    expect(() => resampleMask([...mask.slice(1), 9], 8, 12)).toThrow(/9/);
    expect(() => resampleMask([...mask.slice(1), -1], 8, 12)).toThrow(RangeError);
    expect(() => resampleMask([...mask.slice(1), 2.5], 8, 12)).toThrow(RangeError);
  });
});
