/**
 * Terrain queries (plan M1-07) against the shipped `terrain-a` tileset: every tile shape tested
 * alone in a map — `terrainAt` / `terrainSolidAt` pixel by pixel against its column-height mask,
 * `findFloor` from above and `findCeiling` from below every column — plus `boxHitsTerrain`
 * (pixel-exact edges, hazard priority, decoration, out-of-map and NaN input), scan distances and
 * the allocation guard.
 */
import { readFileSync } from 'node:fs';
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
import { loadContent, type TilesetSpec } from '../../src/data/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/** The shipped tileset, loaded through the content loader. */
function shippedTileset(): TilesetSpec {
  const data = JSON.parse(
    readFileSync(
      new URL('../../../../content/tilesets/terrain-a.tileset.json', import.meta.url),
      'utf8',
    ),
  ) as unknown;
  const { db, issues } = loadContent([{ path: 'tilesets/terrain-a.tileset.json', data }]);
  expect(issues).toEqual([]);
  return db.tilesets[0];
}

const TILESET = shippedTileset();
const T = TILESET.tileSize;

/**
 * A `cols × rows` map over a tileset's tables.
 *
 * @param cols - Width in tiles.
 * @param rows - Height in tiles.
 * @param cells - `[col, row, tileId]` entries.
 * @param tables - Tileset tables (default: the shipped one).
 * @returns The map.
 */
function mapOf(
  cols: number,
  rows: number,
  cells: readonly (readonly [number, number, number])[],
  tables = TILESET.tables,
): TerrainMap {
  const tiles = new Uint8Array(cols * rows);
  for (const [c, r, id] of cells) tiles[r * cols + c] = id;
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

/** Whether tile-local pixel (lx, ly) is solid according to a mask + anchor. */
function maskSolid(mask: readonly number[], anchor: string, lx: number, ly: number): boolean {
  const h = mask[lx];
  return anchor === 'ceiling' ? ly < h : ly >= T - h;
}

describe('core/collision terrain — every tile shape of terrain-a', () => {
  it('has the documented 45° and 22.5° slope masks', () => {
    const mask = (name: string): readonly number[] =>
      TILESET.tiles.find((tile) => tile.name === name)?.mask ?? [];
    expect(mask('slope-up')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(mask('slope-up-low')).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(mask('slope-up-high')).toEqual([4, 5, 5, 6, 6, 7, 7, 8]);
    expect(mask('slope-down-low')).toEqual([4, 3, 3, 2, 2, 1, 1, 0]);
    expect(TILESET.tables.anchor[TILESET.tables.byName.get('ceil-slope-up') ?? 0]).toBe(
      TerrainAnchor.Ceiling,
    );
  });

  for (let index = 0; index < TILESET.tiles.length; index++) {
    const tile = TILESET.tiles[index];
    const id = index + 1;
    const map = mapOf(5, 5, [[2, 2, id]]);
    const left = 2 * T;
    const top = 2 * T;

    it(`${tile.name}: terrainAt follows the mask pixel by pixel`, () => {
      for (let ly = -1; ly <= T; ly++) {
        for (let lx = -1; lx <= T; lx++) {
          const inside = lx >= 0 && lx < T && ly >= 0 && ly < T;
          const expected = inside && maskSolid(tile.mask, tile.anchor, lx, ly);
          // Sub-pixel positions floor to the same pixel.
          expect(terrainAt(map, left + lx + 0.75, top + ly + 0.25), `${lx},${ly}`).toBe(
            expected ? TerrainType.Solid : TerrainType.Empty,
          );
          expect(terrainSolidAt(map, left + lx, top + ly)).toBe(expected);
        }
      }
    });

    it(`${tile.name}: findFloor from above and findCeiling from below every column`, () => {
      for (let lx = 0; lx < T; lx++) {
        const h = tile.mask[lx];
        const x = left + lx + 0.5;
        const floor = h === 0 ? Number.NaN : tile.anchor === 'ceiling' ? top : top + T - h;
        const ceiling = h === 0 ? Number.NaN : tile.anchor === 'ceiling' ? top + h : top + T;
        expect(findFloor(map, x, top - 5, 40), `floor col ${lx}`).toBe(floor);
        expect(findCeiling(map, x, top + T + 5, 40), `ceiling col ${lx}`).toBe(ceiling);
      }
    });
  }
});

describe('core/collision terrain — boxHitsTerrain', () => {
  const floorId = TILESET.tables.byName.get('floor') ?? 0;
  // A floor row at map row 3 (world y 24 … 31), columns 0 … 9.
  const cells: [number, number, number][] = [];
  for (let c = 0; c < 10; c++) cells.push([c, 3, floorId]);
  const map = mapOf(10, 5, cells);

  it('is pixel-exact: resting on the surface misses, one pixel of overlap hits', () => {
    expect(boxHitsTerrain(map, 20, 21, 5, 3)).toBe(TerrainType.Empty); // bottom edge at y 24
    expect(boxHitsTerrain(map, 20, 21.01, 5, 3)).toBe(TerrainType.Solid);
    expect(boxHitsTerrain(map, 20, 22, 5, 3)).toBe(TerrainType.Solid);
    expect(boxHitsTerrain(map, 20, 40, 5, 3)).toBe(TerrainType.Empty); // below the floor row
    expect(boxHitsTerrain(map, 20, 35, 5, 3)).toBe(TerrainType.Empty); // top edge exactly at 32
    expect(boxHitsTerrain(map, 20, 34.9, 5, 3)).toBe(TerrainType.Solid); // reaches row 31
  });

  it('misses outside the map and for NaN input, clips boxes overlapping the border', () => {
    expect(boxHitsTerrain(map, -100, 28, 5, 3)).toBe(TerrainType.Empty);
    expect(boxHitsTerrain(map, 20, -50, 5, 3)).toBe(TerrainType.Empty);
    expect(boxHitsTerrain(map, 1000, 28, 5, 3)).toBe(TerrainType.Empty);
    expect(boxHitsTerrain(map, Number.NaN, 28, 5, 3)).toBe(TerrainType.Empty);
    expect(boxHitsTerrain(map, -3, 28, 5, 3)).toBe(TerrainType.Solid);
    expect(boxHitsTerrain(map, 82, 28, 5, 3)).toBe(TerrainType.Solid);
  });

  it('reports hazards over solid rock and ignores decorative tiles', () => {
    const { db, issues } = loadContent([
      {
        path: 'tilesets/mixed.tileset.json',
        data: {
          formatVersion: 1,
          kind: 'tileset',
          id: 'mixed',
          sprite: 'tiles/terrain-a',
          tileSize: 8,
          tiles: [
            {
              name: 'rock',
              type: 'solid',
              frame: 0,
              anchor: 'floor',
              mask: [8, 8, 8, 8, 8, 8, 8, 8],
            },
            {
              name: 'spikes',
              type: 'hazard',
              frame: 7,
              anchor: 'floor',
              mask: [0, 1, 1, 2, 2, 3, 3, 4],
            },
            {
              name: 'vine',
              type: 'empty',
              frame: 1,
              anchor: 'floor',
              mask: [8, 8, 8, 8, 8, 8, 8, 8],
            },
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    const tables = db.tilesets[0].tables;
    const mixed = mapOf(
      4,
      2,
      [
        [0, 1, 1],
        [1, 1, 2],
        [2, 1, 3],
      ],
      tables,
    );
    expect(boxHitsTerrain(mixed, 8, 12, 6, 3)).toBe(TerrainType.Hazard); // rock + spikes
    expect(boxHitsTerrain(mixed, 4, 12, 3, 3)).toBe(TerrainType.Solid);
    expect(boxHitsTerrain(mixed, 20, 12, 3, 3)).toBe(TerrainType.Empty); // the vine only
    expect(terrainAt(mixed, 15, 15)).toBe(TerrainType.Hazard);
    expect(terrainAt(mixed, 8, 15)).toBe(TerrainType.Empty); // spike column 0 has height 0
    expect(findFloor(mixed, 20, 0, 50)).toBeNaN(); // decoration is not a floor
  });
});

describe('core/collision terrain — scans', () => {
  const solidId = TILESET.tables.byName.get('solid') ?? 0;
  const map = mapOf(2, 10, [
    [0, 8, solidId],
    [0, 1, solidId],
  ]);

  it('limits findFloor / findCeiling to maxDist and returns the start pixel inside rock', () => {
    expect(findFloor(map, 3, 40, 24)).toBe(64);
    expect(findFloor(map, 3, 40, 23)).toBeNaN();
    expect(findFloor(map, 3, 66.5, 10)).toBe(66);
    expect(findCeiling(map, 3, 40, 24)).toBe(16);
    expect(findCeiling(map, 3, 40, 23)).toBeNaN();
    expect(findCeiling(map, 3, 12.5, 10)).toBe(13);
    expect(findFloor(map, 3, 40, -1)).toBeNaN();
  });

  it('treats the space above and below the map as open and outside columns as nothing', () => {
    expect(findFloor(map, 3, -30, 50)).toBe(8); // starts at row 0, finds row 1
    expect(findFloor(map, 3, 100, 50)).toBeNaN();
    expect(findCeiling(map, 3, 200, 200)).toBe(72);
    expect(findCeiling(map, 3, -5, 50)).toBeNaN();
    expect(findFloor(map, 12, 0, 100)).toBeNaN(); // column 1 is empty
    expect(findFloor(map, -1, 0, 100)).toBeNaN();
    expect(findFloor(map, 16, 0, 100)).toBeNaN(); // right of the map
  });

  it('never allocates on whole-pixel arguments', () => {
    const growth = measureHeapGrowth(
      (i) => {
        const x = i % 16;
        terrainRectHit(map, x - 5, (i % 80) - 3, x + 4, (i % 80) + 2);
        findFloor(map, x, 20, 60);
        findCeiling(map, x, 60, 60);
        terrainAt(map, x, i % 80);
      },
      20_000,
      // A long warm-up: after the default 1000 calls the measured window still paid for V8's
      // tier-up (~47 KB of a 64 KB budget, over it now and then under full-suite load).
      20_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
