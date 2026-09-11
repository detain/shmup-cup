/**
 * Edge cases of the terrain queries (plan M1-07): every query checked against an independent
 * pixel-by-pixel reference on random maps built from random tiles (solid, hazard and decorative
 * types, floor and ceiling anchors, arbitrary column heights with holes) — `terrainAt`,
 * `terrainSolidAt`, `terrainRectHit`, `boxHitsTerrain` (half-open boxes, zero sizes, fractional
 * edges, boxes sticking out of the map) and the `findFloor` / `findCeiling` scans (every start
 * row, fractional starts and distances, `maxDist` 0, outside the map) — plus NaN / infinite
 * inputs, the map's last pixel row and column, and a 1×1 map.
 */
import { describe, expect, it } from 'vitest';
import {
  TerrainAnchor,
  TerrainType,
  boxHitsTerrain,
  findCeiling,
  findFloor,
  terrainAt,
  terrainRectHit,
  terrainSolidAt,
  type TerrainMap,
} from '../../src/collision/index.js';
import { buildTilesetTables, type TileTableInput } from '../../src/data/tilemap.js';
import { createRng, type Rng } from '../../src/rng/index.js';

const T = 8;

/**
 * Random tiles: a full block, 45° slopes of both anchors, then random masks of every type.
 *
 * @param rng - Random source.
 * @returns 24 tiles.
 */
function randomTiles(rng: Rng): TileTableInput[] {
  const tiles: TileTableInput[] = [
    { name: 'block', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    { name: 'up', type: 'solid', frame: 1, anchor: 'floor', mask: [1, 2, 3, 4, 5, 6, 7, 8] },
    { name: 'cup', type: 'solid', frame: 2, anchor: 'ceiling', mask: [1, 2, 3, 4, 5, 6, 7, 8] },
    { name: 'spike', type: 'hazard', frame: 3, anchor: 'floor', mask: [0, 2, 4, 2, 0, 2, 4, 2] },
    { name: 'vine', type: 'empty', frame: 4, anchor: 'ceiling', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
  ];
  const types = ['solid', 'solid', 'hazard', 'empty'] as const;
  while (tiles.length < 24) {
    tiles.push({
      name: 't' + String(tiles.length),
      type: types[rng.rangeInt(0, 3)],
      frame: tiles.length,
      anchor: rng.nextFloat() < 0.5 ? 'floor' : 'ceiling',
      mask: Array.from({ length: T }, () => (rng.nextFloat() < 0.2 ? 0 : rng.rangeInt(0, T))),
    });
  }
  return tiles;
}

/**
 * A random map over random tiles (about a third of the cells empty).
 *
 * @param rng - Random source.
 * @param cols - Width in tiles.
 * @param rows - Height in tiles.
 * @returns The map.
 */
function randomMap(rng: Rng, cols: number, rows: number): TerrainMap {
  const tables = buildTilesetTables(randomTiles(rng), T);
  const tiles = new Uint8Array(cols * rows);
  for (let i = 0; i < tiles.length; i++) {
    tiles[i] = rng.nextFloat() < 0.35 ? 0 : rng.rangeInt(1, tables.count - 1);
  }
  return {
    tileSize: T,
    cols,
    rows,
    tiles,
    tileType: tables.type,
    tileAnchor: tables.anchor,
    tileMask: tables.mask,
  };
}

/**
 * Reference: the type of one whole world pixel, straight from the definition.
 *
 * @param map - The map.
 * @param px - Pixel column.
 * @param py - Pixel row.
 * @returns The `TerrainType`.
 */
function refAt(map: TerrainMap, px: number, py: number): number {
  if (px < 0 || py < 0 || px >= map.cols * T || py >= map.rows * T) return TerrainType.Empty;
  const col = Math.floor(px / T);
  const row = Math.floor(py / T);
  const tile = map.tiles[row * map.cols + col];
  if (tile === 0) return TerrainType.Empty;
  const h = map.tileMask[tile * T + (px % T)];
  const ly = py % T;
  const inside = map.tileAnchor[tile] === TerrainAnchor.Ceiling ? ly < h : ly >= T - h;
  return inside ? map.tileType[tile] : TerrainType.Empty;
}

/**
 * Reference: the highest type in an inclusive pixel rectangle.
 *
 * @param map - The map.
 * @param x0 - First column.
 * @param y0 - First row.
 * @param x1 - Last column.
 * @param y1 - Last row.
 * @returns The `TerrainType`.
 */
function refRect(map: TerrainMap, x0: number, y0: number, x1: number, y1: number): number {
  let best = 0;
  for (let y = Math.max(y0, -1); y <= Math.min(y1, map.rows * T); y++) {
    for (let x = Math.max(x0, -1); x <= Math.min(x1, map.cols * T); x++) {
      best = Math.max(best, refAt(map, x, y));
    }
  }
  return best;
}

/**
 * Reference `findFloor`: a linear scan down the pixel column.
 *
 * @param map - The map.
 * @param x - World x.
 * @param y - Start y.
 * @param maxDist - Pixels to search.
 * @returns The surface y or NaN.
 */
function refFloor(map: TerrainMap, x: number, y: number, maxDist: number): number {
  const px = Math.floor(x);
  if (!(px >= 0 && px < map.cols * T && maxDist >= 0)) return NaN;
  const start = Math.floor(y);
  for (let py = start; py <= start + Math.floor(maxDist); py++) {
    if (refAt(map, px, py) !== TerrainType.Empty) return py;
  }
  return NaN;
}

/**
 * Reference `findCeiling`: a linear scan up the pixel column.
 *
 * @param map - The map.
 * @param x - World x.
 * @param y - Start y.
 * @param maxDist - Pixels to search.
 * @returns The surface y (bottom edge of the colliding pixel) or NaN.
 */
function refCeiling(map: TerrainMap, x: number, y: number, maxDist: number): number {
  const px = Math.floor(x);
  if (!(px >= 0 && px < map.cols * T && maxDist >= 0)) return NaN;
  const start = Math.floor(y);
  for (let py = start; py >= start - Math.floor(maxDist) - 1; py--) {
    if (refAt(map, px, py) !== TerrainType.Empty) return py + 1;
  }
  return NaN;
}

/** Distances the scans are probed with. */
const DISTANCES = [0, 0.5, 1, 3, 7, 7.9, 8, 9, 13, 16.5, 40, 1000];

describe('core/collision terrain edge — against a pixel reference', () => {
  it('terrainAt / terrainSolidAt match the definition on every pixel of 20 random maps', () => {
    const rng = createRng(101);
    for (let trial = 0; trial < 20; trial++) {
      const map = randomMap(rng, 6, 5);
      for (let py = -3; py < map.rows * T + 3; py++) {
        for (let px = -3; px < map.cols * T + 3; px++) {
          const expected = refAt(map, px, py);
          const fx = px + rng.nextFloat() * 0.999;
          const fy = py + rng.nextFloat() * 0.999;
          expect(terrainAt(map, fx, fy), `${String(trial)}: ${String(px)},${String(py)}`).toBe(
            expected,
          );
          expect(terrainSolidAt(map, px, py)).toBe(expected !== TerrainType.Empty);
        }
      }
    }
  });

  it('terrainRectHit and boxHitsTerrain match the reference on 6,000 random rectangles', () => {
    const rng = createRng(202);
    for (let trial = 0; trial < 30; trial++) {
      const map = randomMap(rng, 7, 4);
      for (let q = 0; q < 200; q++) {
        const x0 = rng.rangeInt(-12, map.cols * T + 4);
        const y0 = rng.rangeInt(-12, map.rows * T + 4);
        const x1 = x0 + rng.rangeInt(0, 20);
        const y1 = y0 + rng.rangeInt(0, 20);
        const label = `${String(trial)}: [${String(x0)},${String(y0)}]-[${String(x1)},${String(y1)}]`;
        expect(terrainRectHit(map, x0, y0, x1, y1), label).toBe(refRect(map, x0, y0, x1, y1));
        const cx = x0 + rng.nextFloat() * 20;
        const cy = y0 + rng.nextFloat() * 20;
        const hw = rng.nextFloat() < 0.15 ? 0 : rng.nextFloat() * 9;
        const hh = rng.nextFloat() < 0.15 ? 0 : rng.nextFloat() * 9;
        const bx0 = Math.floor(cx - hw);
        const by0 = Math.floor(cy - hh);
        const bx1 = Math.max(bx0, Math.ceil(cx + hw) - 1);
        const by1 = Math.max(by0, Math.ceil(cy + hh) - 1);
        expect(boxHitsTerrain(map, cx, cy, hw, hh), `box ${label}`).toBe(
          refRect(map, bx0, by0, bx1, by1),
        );
      }
    }
  });

  it('findFloor / findCeiling match a linear scan from every start row and distance', () => {
    const rng = createRng(303);
    for (let trial = 0; trial < 12; trial++) {
      const map = randomMap(rng, 4, 6);
      for (let px = -2; px < map.cols * T + 2; px += 1) {
        const x = px + rng.nextFloat() * 0.99;
        for (let py = -12; py < map.rows * T + 12; py++) {
          const y = py + (rng.nextFloat() < 0.5 ? 0 : rng.nextFloat() * 0.99);
          const d = DISTANCES[rng.rangeInt(0, DISTANCES.length - 1)];
          const label = `${String(trial)}: x ${String(x)} y ${String(y)} d ${String(d)}`;
          expect(findFloor(map, x, y, d), `floor ${label}`).toBe(refFloor(map, x, y, d));
          expect(findCeiling(map, x, y, d), `ceiling ${label}`).toBe(refCeiling(map, x, y, d));
        }
      }
    }
  });
});

describe('core/collision terrain edge — odd inputs and borders', () => {
  const rng = createRng(404);
  const map = randomMap(rng, 3, 3);
  const block: TerrainMap = {
    ...map,
    cols: 1,
    rows: 1,
    tiles: new Uint8Array([1]), // the full block
  };

  it('misses for NaN and infinite coordinates', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(terrainAt(block, bad, 4)).toBe(TerrainType.Empty);
      expect(terrainAt(block, 4, bad)).toBe(TerrainType.Empty);
      expect(boxHitsTerrain(block, bad, 4, 2, 2)).toBe(TerrainType.Empty);
      expect(boxHitsTerrain(block, 4, bad, 2, 2)).toBe(TerrainType.Empty);
      expect(terrainRectHit(block, 0, 0, 7, bad)).toBe(
        bad === Number.POSITIVE_INFINITY ? TerrainType.Solid : TerrainType.Empty,
      );
      expect(findFloor(block, bad, 0, 10)).toBeNaN();
      expect(findCeiling(block, bad, 7, 10)).toBeNaN();
      expect(findFloor(block, 4, 0, Number.NaN)).toBeNaN();
      expect(findCeiling(block, 4, 7, Number.NaN)).toBeNaN();
    }
    // NaN bounds miss; infinite bounds are clipped to the map like any other.
    expect(terrainRectHit(block, Number.NaN, 0, 7, 7)).toBe(TerrainType.Empty);
    expect(terrainRectHit(block, Number.NEGATIVE_INFINITY, 0, 7, 7)).toBe(TerrainType.Solid);
    expect(terrainRectHit(block, Number.POSITIVE_INFINITY, 0, 7, 7)).toBe(TerrainType.Empty);
    expect(findFloor(block, 4, 0, Number.POSITIVE_INFINITY)).toBe(0);
    expect(findCeiling(block, 4, 7, Number.POSITIVE_INFINITY)).toBe(8);
    expect(findFloor(block, 4, Number.NaN, 10)).toBeNaN();
    expect(findCeiling(block, 4, Number.NaN, 10)).toBeNaN();
  });

  it('covers a 1×1 map pixel-exactly, with its last row and column', () => {
    expect(terrainAt(block, 7.99, 7.99)).toBe(TerrainType.Solid);
    expect(terrainAt(block, 8, 7)).toBe(TerrainType.Empty);
    expect(terrainAt(block, 7, 8)).toBe(TerrainType.Empty);
    expect(terrainAt(block, -0.01, 0)).toBe(TerrainType.Empty);
    expect(boxHitsTerrain(block, 12, 4, 4, 1)).toBe(TerrainType.Empty); // starts at x 8
    expect(boxHitsTerrain(block, 11.99, 4, 4, 1)).toBe(TerrainType.Solid); // reaches x 7
    expect(boxHitsTerrain(block, -4, 4, 4, 1)).toBe(TerrainType.Empty); // ends at x 0
    expect(boxHitsTerrain(block, -3.99, 4, 4, 1)).toBe(TerrainType.Solid);
    expect(boxHitsTerrain(block, 100, 100, 1000, 1000)).toBe(TerrainType.Solid);
    // A zero-size box tests the one pixel it sits in.
    expect(boxHitsTerrain(block, 7.5, 7.5, 0, 0)).toBe(TerrainType.Solid);
    expect(boxHitsTerrain(block, 8, 8, 0, 0)).toBe(TerrainType.Empty);
    expect(findFloor(block, 3, -100, 100)).toBe(0);
    expect(findFloor(block, 3, -100, 99)).toBeNaN();
    expect(findFloor(block, 3, 7.5, 0)).toBe(7); // the start pixel collides
    expect(findFloor(block, 3, 8, 1000)).toBeNaN(); // below the map
    expect(findCeiling(block, 3, 100, 92)).toBe(8);
    expect(findCeiling(block, 3, 100, 91)).toBeNaN();
    expect(findCeiling(block, 3, 0, 0)).toBe(1);
    expect(findCeiling(block, 3, -1, 1000)).toBeNaN(); // above the map
    expect(findFloor(block, 8, 0, 10)).toBeNaN(); // right of the map
  });

  it('reports the hazard even when solid rock comes first in the scan order', () => {
    const tiles = buildTilesetTables(
      [
        { name: 'rock', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
        { name: 'lava', type: 'hazard', frame: 1, anchor: 'floor', mask: [0, 0, 0, 0, 0, 0, 0, 1] },
      ],
      T,
    );
    const mixed: TerrainMap = {
      tileSize: T,
      cols: 3,
      rows: 2,
      tiles: new Uint8Array([1, 1, 1, 1, 1, 2]),
      tileType: tiles.type,
      tileAnchor: tiles.anchor,
      tileMask: tiles.mask,
    };
    expect(terrainRectHit(mixed, 0, 0, 23, 15)).toBe(TerrainType.Hazard);
    expect(terrainRectHit(mixed, 0, 0, 23, 14)).toBe(TerrainType.Solid); // lava is row 15 only
    expect(terrainRectHit(mixed, 16, 15, 22, 15)).toBe(TerrainType.Empty); // lava is column 23
    expect(findFloor(mixed, 23, 8, 20)).toBe(15);
  });
});
