/**
 * The terrain tileset frames (`scripts/assets/procedural/terrain.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, type Image } from '../../../scripts/assets/image.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { opaque, key, eachOpaque, opaqueCount, columnHeights } from './procedural-helpers.js';

describe('scripts/assets/procedural/terrain', () => {
  // The 8-px tiles, whatever the atlas's tile size (R2-01 flipped it to 12; `terrain-size.test.ts`
  // checks the 12-px drawing and that generate() follows TILE_SIZE).
  const [tileset] = terrain.generate({ tileSize: 8 });
  const tile = (name: (typeof terrain.TERRAIN_TILES)[number]): Image =>
    tileset.frames[terrain.TERRAIN_TILES.indexOf(name)];

  it('draws 20 top-left-anchored 8×8 tiles, each also a one-frame animation by name', () => {
    expect(tileset.name).toBe('tiles/terrain-a');
    expect(tileset.anchor).toEqual([0, 0]);
    // The 17 rock tiles, then the destructible brick, cube and tissue (M2-07).
    expect(tileset.frames).toHaveLength(20);
    expect(terrain.TERRAIN_TILES.slice(17)).toEqual(['brick', 'cube', 'tissue']);
    // The destructible blocks are full (every pixel opaque) and look unlike rock and each other.
    const pixels = (name: (typeof terrain.TERRAIN_TILES)[number]): string =>
      Array.from(tile(name).data).join(',');
    for (const name of ['brick', 'cube', 'tissue'] as const) {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) expect(opaque(tile(name), x, y)).toBe(true);
      expect(pixels(name)).not.toBe(pixels('solid'));
    }
    expect(new Set([pixels('brick'), pixels('cube'), pixels('tissue')]).size).toBe(3);
    for (const frame of tileset.frames) expect([frame.width, frame.height]).toEqual([8, 8]);
    expect(terrain.generate()[0].frames[0].width).toBe(terrain.TILE_SIZE);
    expect(Object.keys(tileset.animations)).toEqual([...terrain.TERRAIN_TILES]);
    terrain.TERRAIN_TILES.forEach((name, i) => expect(tileset.animations[name]).toEqual([i]));
  });

  it.each([
    ['solid', [8, 8, 8, 8, 8, 8, 8, 8]],
    ['floor', [8, 8, 8, 8, 8, 8, 8, 8]],
    ['slope-up', [1, 2, 3, 4, 5, 6, 7, 8]],
    ['slope-down', [8, 7, 6, 5, 4, 3, 2, 1]],
    ['slope-up-low', [0, 1, 1, 2, 2, 3, 3, 4]],
    ['slope-up-high', [4, 5, 5, 6, 6, 7, 7, 8]],
    ['slope-down-high', [8, 7, 7, 6, 6, 5, 5, 4]],
    ['slope-down-low', [4, 3, 3, 2, 2, 1, 1, 0]],
  ] as const)('gives %s the column heights %j (solid from the bottom)', (name, heights) => {
    const frame = tile(name);
    expect(columnHeights(frame)).toEqual(heights);
    // Solid pixels are contiguous from the tile bottom (floor tiles).
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) expect(opaque(frame, x, y)).toBe(8 - y <= heights[x]);
    }
  });

  it('chains slopes into a staircase without gaps (steps of at most 1 px)', () => {
    /**
     * Asserts a height profile only ever rises, by 0 or 1 px per column.
     *
     * @param heights - Absolute column heights.
     */
    const expectStaircase = (heights: number[]): void => {
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i] - heights[i - 1], `column ${i}`).toBeGreaterThanOrEqual(0);
        expect(heights[i] - heights[i - 1], `column ${i}`).toBeLessThanOrEqual(1);
      }
    };
    const low = columnHeights(tile('slope-up-low'));
    const high = columnHeights(tile('slope-up-high'));
    const up = columnHeights(tile('slope-up'));
    const raise = (heights: number[]): number[] => heights.map((h) => h + 8);
    // Two 22.5° slopes in a row (the second one tile row higher), then 45° tile after tile.
    expectStaircase([...low, ...high, ...raise(low), ...raise(high)]);
    expectStaircase([...up, ...raise(up)]);
    expectStaircase([8, ...raise(low)]); // a flat floor running into a 22.5° slope
  });

  it('builds ceilings, walls and "down" variants by exact flips and a transpose', () => {
    const flipH = (image: Image): string[] =>
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_x, x) => key(getPixel(image, 7 - x, y))).join('|'),
      );
    const flipV = (image: Image): string[] =>
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_x, x) => key(getPixel(image, x, 7 - y))).join('|'),
      );
    const transpose = (image: Image): string[] =>
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_x, x) => key(getPixel(image, y, x))).join('|'),
      );
    const rows = (image: Image): string[] =>
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_x, x) => key(getPixel(image, x, y))).join('|'),
      );
    expect(rows(tile('ceiling'))).toEqual(flipV(tile('floor')));
    expect(rows(tile('wall-left'))).toEqual(transpose(tile('floor')));
    expect(rows(tile('wall-right'))).toEqual(flipH(tile('wall-left')));
    expect(rows(tile('slope-down'))).toEqual(flipH(tile('slope-up')));
    expect(rows(tile('slope-down-low'))).toEqual(flipH(tile('slope-up-low')));
    expect(rows(tile('slope-down-high'))).toEqual(flipH(tile('slope-up-high')));
    for (const name of [
      'slope-up',
      'slope-down',
      'slope-up-low',
      'slope-up-high',
      'slope-down-high',
      'slope-down-low',
    ] as const) {
      expect(rows(tile(`ceil-${name}`)), name).toEqual(flipV(tile(name)));
    }
  });

  it('rims every open-facing surface and joins rock seamlessly with the solid tile', () => {
    const surface = color('#8ad0a8');
    for (const name of [
      'floor',
      'slope-up',
      'slope-up-low',
      'slope-up-high',
      'slope-down',
    ] as const) {
      const frame = tile(name);
      for (let x = 0; x < 8; x++) {
        const top = [...Array(8).keys()].find((y) => opaque(frame, x, y));
        if (top !== undefined)
          expect(getPixel(frame, x, top), `${name} column ${x}`).toEqual(surface);
      }
    }
    // The solid tile has no rim at all; below the two surface rows every floor-type tile
    // uses the same position-based rock texture, so tiles join without seams.
    const solid = tile('solid');
    eachOpaque(solid, (_x, _y, rgba) => expect(rgba).not.toEqual(surface));
    for (let y = 2; y < 8; y++) {
      for (let x = 0; x < 8; x++)
        expect(getPixel(tile('floor'), x, y)).toEqual(getPixel(solid, x, y));
    }
    expect(opaqueCount(solid)).toBe(64);
  });
});
