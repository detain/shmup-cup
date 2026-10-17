/**
 * The terrain queries are tile-size generic (plan_resolution.md R1-04): one world geometry — a
 * floor of flat, 45° and 22.5° stretches, a strip of hazard spikes, a ceiling that deepens at
 * 22.5° — is cut into an 8-px and a 12-px {@link TerrainMap} (tiles and masks derived per size),
 * and `terrainAt`, `terrainSolidAt`, `findFloor`, `findCeiling`, `boxHitsTerrain` and
 * `terrainRectHit` answer the same for every pixel, box and scan of both — and match the geometry
 * itself. Nothing in the queries knows `TILE_SIZE`; `TerrainMap.tileSize` is all they read.
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
import { MAX_TILE_SIZE, MIN_TILE_SIZE } from '../../src/data/index.js';

/** Width and height of the test world in pixels (a whole number of 8- and of 12-px tiles). */
const WORLD = 72;

/** First world column of the hazard strip (a tile edge at both sizes). */
const HAZARD_X = 48;

/** Cell rows whose top lies above this row hold the ceiling; the others the floor. */
const SPLIT_Y = 36;

/**
 * Floor height at a world column, measured up from the world's bottom edge.
 *
 * @param x - World column (0 … WORLD − 1).
 * @returns Solid pixels at the bottom of the column.
 */
function floorHeight(x: number): number {
  if (x < 12) return 6; // flat
  if (x < 30) return x - 6; // 45° up to 24
  if (x < HAZARD_X) return 24 - Math.floor((x - 30) / 2); // 22.5° down to 16
  return 3; // flat spikes
}

/**
 * Ceiling depth at a world column, measured down from the world's top edge.
 *
 * @param x - World column.
 * @returns Solid pixels at the top of the column.
 */
function ceilingDepth(x: number): number {
  return x < 24 ? 10 : 10 + Math.floor((x - 24) / 2); // flat, then 22.5° down to 33
}

/**
 * The geometry itself: the terrain type of one world pixel.
 *
 * @param x - World column.
 * @param y - World row.
 * @returns A {@link TerrainType} code.
 */
function reference(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return TerrainType.Empty;
  if (y < ceilingDepth(x)) return TerrainType.Solid;
  if (y >= WORLD - floorHeight(x)) return x >= HAZARD_X ? TerrainType.Hazard : TerrainType.Solid;
  return TerrainType.Empty;
}

/**
 * Cuts the geometry into tiles of one size: every distinct (type, anchor, mask) becomes a tile id.
 *
 * @param size - Tile edge in pixels.
 * @returns The map (ids in first-use order; 0 = an empty cell).
 */
function cut(size: number): TerrainMap {
  const cols = WORLD / size;
  const rows = WORLD / size;
  const tiles = new Uint8Array(cols * rows);
  const ids = new Map<string, number>();
  const types: number[] = [TerrainType.Empty];
  const anchors: number[] = [TerrainAnchor.Floor];
  const masks: number[] = new Array<number>(size).fill(0);
  for (let row = 0; row < rows; row++) {
    const top = row * size;
    const ceiling = top < SPLIT_Y;
    for (let col = 0; col < cols; col++) {
      const mask: number[] = [];
      for (let lx = 0; lx < size; lx++) {
        const x = col * size + lx;
        const h = ceiling ? ceilingDepth(x) - top : floorHeight(x) - (WORLD - top - size);
        mask.push(h < 0 ? 0 : h > size ? size : h);
      }
      if (mask.every((h) => h === 0)) continue;
      const type =
        !ceiling && col * size >= HAZARD_X ? TerrainType.Hazard : (TerrainType.Solid as number);
      const anchor = ceiling ? TerrainAnchor.Ceiling : TerrainAnchor.Floor;
      const key = `${type}:${anchor}:${mask.join(',')}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = types.length;
        ids.set(key, id);
        types.push(type);
        anchors.push(anchor);
        masks.push(...mask);
      }
      tiles[row * cols + col] = id;
    }
  }
  return {
    tileSize: size,
    cols,
    rows,
    tiles,
    tileType: new Uint8Array(types),
    tileAnchor: new Uint8Array(anchors),
    tileMask: new Uint8Array(masks),
  };
}

const SMALL = cut(MIN_TILE_SIZE);
const LARGE = cut(MAX_TILE_SIZE);

/** Every pixel coordinate tested: the world plus a 3-px border of open space. */
const COORDS = Array.from({ length: WORLD + 6 }, (_, i) => i - 3);

describe('core/collision terrain at 8 and 12 px (R1-04)', () => {
  it('cuts the same geometry into 8-px and 12-px maps', () => {
    expect([SMALL.tileSize, SMALL.cols, SMALL.rows]).toEqual([8, 9, 9]);
    expect([LARGE.tileSize, LARGE.cols, LARGE.rows]).toEqual([12, 6, 6]);
    // Both sizes need slope tiles (masks that are neither full nor flat).
    for (const map of [SMALL, LARGE]) {
      const size = map.tileSize;
      let slopes = 0;
      for (let id = 1; id < map.tileType.length; id++) {
        const mask = map.tileMask.subarray(id * size, id * size + size);
        if (mask.some((h) => h !== mask[0])) slopes++;
      }
      expect(slopes, String(size)).toBeGreaterThan(3);
    }
  });

  it('answers terrainAt / terrainSolidAt like the geometry, pixel for pixel', () => {
    for (const x of COORDS) {
      for (const y of COORDS) {
        const want = reference(x, y);
        expect(terrainAt(SMALL, x, y), `8 px at ${x},${y}`).toBe(want);
        expect(terrainAt(LARGE, x, y), `12 px at ${x},${y}`).toBe(want);
        expect(terrainSolidAt(LARGE, x + 0.75, y + 0.25)).toBe(want !== TerrainType.Empty);
      }
    }
  });

  it('finds the same floors and ceilings at both sizes', () => {
    for (const x of COORDS) {
      for (const y of COORDS) {
        for (const dist of [0, 5, 30, 100]) {
          const floor = findFloor(SMALL, x, y, dist);
          expect(findFloor(LARGE, x, y, dist), `floor ${x},${y} +${dist}`).toBe(floor);
          const ceiling = findCeiling(SMALL, x, y, dist);
          expect(findCeiling(LARGE, x, y, dist), `ceiling ${x},${y} -${dist}`).toBe(ceiling);
        }
      }
    }
    // Spot values from the geometry: the flat floor at 72 − 6, the 45° ramp, the ceiling's edge.
    expect(findFloor(LARGE, 5, SPLIT_Y, 100)).toBe(66);
    expect(findFloor(LARGE, 20, SPLIT_Y, 100)).toBe(WORLD - 14);
    expect(findCeiling(LARGE, 5, SPLIT_Y, 100)).toBe(10);
    expect(findCeiling(LARGE, 71, SPLIT_Y, 100)).toBe(33);
    expect(findFloor(LARGE, 50, SPLIT_Y, 100)).toBe(WORLD - 3);
    expect(findFloor(LARGE, WORLD, 0, 100)).toBeNaN();
  });

  it('hits the same boxes and rectangles at both sizes, hazards first', () => {
    const halves: readonly (readonly [number, number])[] = [
      [0, 0],
      [2.5, 1.5],
      [6, 4],
      [13, 9],
    ];
    for (const x of COORDS) {
      for (const y of COORDS) {
        for (const [hw, hh] of halves) {
          const cx = x + 0.25;
          const cy = y + 0.5;
          const small = boxHitsTerrain(SMALL, cx, cy, hw, hh);
          expect(boxHitsTerrain(LARGE, cx, cy, hw, hh), `box ${cx},${cy} ${hw}×${hh}`).toBe(small);
          const x1 = x + 2 * Math.ceil(hw);
          const y1 = y + 2 * Math.ceil(hh);
          expect(terrainRectHit(LARGE, x, y, x1, y1)).toBe(terrainRectHit(SMALL, x, y, x1, y1));
        }
      }
    }
    // A box over both rock and spikes reports the hazard.
    expect(boxHitsTerrain(LARGE, HAZARD_X, WORLD - 2, 3, 1)).toBe(TerrainType.Hazard);
    expect(terrainRectHit(LARGE, Number.NaN, 0, 1, 1)).toBe(TerrainType.Empty);
  });
});
