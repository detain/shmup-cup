/**
 * Destructible terrain and moving blocks (plan M2-07, `core/collision`): per-cell damage adding up
 * to a tile's `hp`, the broken cell emptied and logged, healing and regrowth of regenerating tiles
 * (never onto a keep-out rectangle), tiles placed at run time, the full-table rule, the checkpoint
 * rollback to the pristine tiles; and the moving blocks every terrain query sees.
 */
import { describe, expect, it } from 'vitest';
import {
  DestructibleTerrain,
  MAX_TERRAIN_BLOCKS,
  MAX_TERRAIN_KEEP_OUT,
  TERRAIN_CHANGE_LOG,
  TerrainAnchor,
  TerrainBlocks,
  TerrainHit,
  TerrainType,
  boxHitsTerrain,
  findCeiling,
  findFloor,
  terrainAt,
  terrainRectHit,
  terrainSolidAt,
  type TerrainMap,
} from '../../src/collision/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/** Tile ids of the test tileset: 1 rock, 2 brick (hp 3), 3 tissue (hp 2, regen 10), 4 deco. */
const ROCK = 1;
const BRICK = 2;
const TISSUE = 3;
const DECO = 4;

/**
 * A 6 × 4 map of 8-px tiles over a small tileset (every tile a full block).
 *
 * @param rows - Tile ids, one string per row (`.` empty, `r` rock, `b` brick, `t` tissue).
 * @param blocks - Moving block slots, or `null`.
 * @returns The map.
 */
function makeMap(rows: string[], blocks: TerrainBlocks | null = null): TerrainMap {
  const cols = rows[0].length;
  const tiles = new Uint8Array(cols * rows.length);
  const ids: Record<string, number> = { '.': 0, r: ROCK, b: BRICK, t: TISSUE, d: DECO };
  rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++) tiles[r * cols + c] = ids[row[c]];
  });
  const size = 8;
  const mask = new Uint8Array(5 * size);
  for (let id = 1; id < 5; id++) mask.fill(size, id * size, id * size + size);
  return {
    tileSize: size,
    cols,
    rows: rows.length,
    tiles,
    tileType: Uint8Array.from([
      TerrainType.Empty,
      TerrainType.Solid,
      TerrainType.Solid,
      TerrainType.Solid,
      TerrainType.Empty,
    ]),
    tileAnchor: new Uint8Array(5).fill(TerrainAnchor.Floor),
    tileMask: mask,
    blocks,
  };
}

/** Hit points and regeneration by tile id (brick 3 hp; tissue 2 hp, regrows in 10 ticks). */
const HP = Uint8Array.from([0, 0, 3, 2, 0]);
const REGEN = Uint16Array.from([0, 0, 0, 10, 0]);

/**
 * A destructible terrain over {@link makeMap}.
 *
 * @param rows - The map rows.
 * @param capacity - Tracked cells.
 * @returns The terrain (its map's tiles start as the pristine copy).
 */
function destructible(rows: string[], capacity?: number): DestructibleTerrain {
  const map = makeMap(rows);
  return new DestructibleTerrain(map, map.tiles.slice(), HP, REGEN, capacity);
}

const ROWS = ['......', '..bt..', 'rrbbrr', 'rrrrrr'];

describe('core/collision DestructibleTerrain — damage', () => {
  it('adds hits up per cell and breaks the tile at its hp, logging the change', () => {
    const d = destructible(ROWS);
    expect(d.any).toBe(true);
    // Brick at (2, 1): pixels 16…23 × 8…15.
    expect(d.hit(17, 9, 1)).toBe(TerrainHit.Damaged);
    expect(d.damageAt(2, 1)).toBe(1);
    expect(d.hit(23, 15, 1)).toBe(TerrainHit.Damaged); // another pixel of the same cell
    expect(d.damageAt(2, 1)).toBe(2);
    expect(d.count).toBe(0);
    expect(d.hit(20, 12, 1)).toBe(TerrainHit.Destroyed);
    expect(d.lastTile).toBe(BRICK);
    expect(d.lastCell).toBe(1 * 6 + 2);
    expect(d.map.tiles[1 * 6 + 2]).toBe(0);
    expect(terrainAt(d.map, 20, 12)).toBe(TerrainType.Empty);
    expect([d.count, d.cells[0], d.destroyed]).toEqual([1, 8, 1]);
    // Its entry is free again: a broken tile without regen needs none.
    expect(d.entries).toBe(0);
  });

  it('takes a big hit at once, floors amounts and ignores rock, empty cells, decorations and 0', () => {
    const d = destructible(ROWS);
    expect(d.hit(17, 17, 5)).toBe(TerrainHit.Destroyed); // brick (2, 2) in one hit
    expect(d.hit(1, 17, 99)).toBe(TerrainHit.None); // rock
    expect(d.hit(1, 1, 1)).toBe(TerrainHit.None); // empty cell
    expect(d.hit(25, 17, 0)).toBe(TerrainHit.None); // no damage
    expect(d.hit(25, 17, Number.NaN)).toBe(TerrainHit.None);
    expect(d.hit(-1, 17, 1)).toBe(TerrainHit.None); // outside the map
    expect(d.hit(9999, 17, 1)).toBe(TerrainHit.None);
    // A fractional hit counts as a whole point (at least 1).
    expect(d.hit(25, 17, 0.25)).toBe(TerrainHit.Damaged);
    expect(d.damageAt(3, 2)).toBe(1);
    expect(d.hit(25, 17, 1.9)).toBe(TerrainHit.Damaged); // floored to 1
    expect(d.damageAt(3, 2)).toBe(2);
    expect(d.hit(25, 17, 1)).toBe(TerrainHit.Destroyed);
    const deco = destructible(['d.....', '......', '......', '......']);
    expect(deco.any).toBe(true); // the tables have breakable tiles, the map just has none here
    expect(deco.hit(1, 1, 5)).toBe(TerrainHit.None);
  });

  it('never breaks anything when the tileset has no destructible tile', () => {
    const map = makeMap(ROWS);
    const d = new DestructibleTerrain(map, map.tiles.slice(), new Uint8Array(5), REGEN);
    expect(d.any).toBe(false);
    expect(d.hit(17, 9, 99)).toBe(TerrainHit.None);
    expect(map.tiles[8]).toBe(BRICK);
  });

  it('ignores a hit on a new cell when the table is full, but still breaks a tile at once', () => {
    const d = destructible(['bbbb..', '......', '......', '......'], 2);
    expect(d.hit(1, 1, 1)).toBe(TerrainHit.Damaged);
    expect(d.hit(9, 1, 1)).toBe(TerrainHit.Damaged);
    expect(d.hit(17, 1, 1)).toBe(TerrainHit.None); // no room to track cell (2, 0)
    expect(d.hit(25, 1, 3)).toBe(TerrainHit.Destroyed); // a one-hit break needs no entry
    expect(d.hit(1, 1, 2)).toBe(TerrainHit.Destroyed); // tracked cells go on
    expect(d.hit(17, 1, 1)).toBe(TerrainHit.Damaged); // room again
  });

  it('rejects pristine tiles of another size', () => {
    const map = makeMap(ROWS);
    expect(() => new DestructibleTerrain(map, new Uint8Array(3), HP, REGEN)).toThrow(RangeError);
  });
});

describe('core/collision DestructibleTerrain — regeneration', () => {
  it('heals a damaged regenerating tile after its regen ticks without a hit', () => {
    const d = destructible(ROWS);
    expect(d.hit(25, 9, 1)).toBe(TerrainHit.Damaged); // tissue (3, 1)
    for (let t = 0; t < 9; t++) d.update();
    expect(d.damageAt(3, 1)).toBe(1);
    d.update();
    expect(d.damageAt(3, 1)).toBe(0);
    expect(d.entries).toBe(0);
    // A hit restarts the timer; damage on a non-regenerating tile stays.
    d.hit(17, 9, 1);
    for (let t = 0; t < 100; t++) d.update();
    expect(d.damageAt(2, 1)).toBe(1);
  });

  it('grows a broken regenerating tile back after its regen ticks', () => {
    const d = destructible(ROWS);
    expect(d.hit(25, 9, 2)).toBe(TerrainHit.Destroyed);
    expect(d.map.tiles[9]).toBe(0);
    let grown = 0;
    for (let t = 0; t < 9; t++) grown += d.update();
    expect([grown, d.map.tiles[9]]).toEqual([0, 0]);
    expect(d.update()).toBe(1);
    expect(d.map.tiles[9]).toBe(TISSUE);
    // Broken, regrown: two changes.
    expect([d.count, d.cells[0], d.cells[1]]).toEqual([2, 9, 9]);
  });

  it('waits while a keep-out rectangle overlaps the cell, then grows on the first free tick', () => {
    const d = destructible(ROWS);
    d.hit(25, 9, 2);
    for (let t = 0; t < 12; t++) {
      d.clearKeepOut();
      d.addKeepOut(20, 10, 30, 12); // over tissue (3, 1): pixels 24…31 × 8…15
      d.update();
    }
    expect(d.map.tiles[9]).toBe(0);
    d.clearKeepOut();
    d.addKeepOut(0, 0, 23, 7); // beside it (x 23 < 24 and y 7 < 8)
    d.update();
    expect(d.map.tiles[9]).toBe(TISSUE);
    // At most MAX_TERRAIN_KEEP_OUT rectangles are kept.
    d.clearKeepOut();
    for (let k = 0; k < MAX_TERRAIN_KEEP_OUT + 2; k++) d.addKeepOut(0, 0, 1, 1);
    expect(d.keepOutCount).toBe(MAX_TERRAIN_KEEP_OUT);
  });

  it('drops a regrowth when something filled the cell meanwhile', () => {
    const d = destructible(ROWS);
    d.hit(25, 9, 2);
    expect(d.place(3, 1, ROCK)).toBe(true); // the placed tile wins
    for (let t = 0; t < 20; t++) d.update();
    expect(d.map.tiles[9]).toBe(ROCK);
    expect(d.entries).toBe(0);
  });
});

describe('core/collision DestructibleTerrain — placing and the rollback', () => {
  it('places tiles only into empty cells of the map, never under a keep-out rectangle', () => {
    const d = destructible(ROWS);
    expect(d.place(0, 0, BRICK)).toBe(true);
    expect(d.map.tiles[0]).toBe(BRICK);
    expect(d.place(0, 0, ROCK)).toBe(false); // occupied
    expect(d.place(2, 2, ROCK)).toBe(false); // occupied (brick)
    expect(d.place(-1, 0, ROCK)).toBe(false);
    expect(d.place(6, 0, ROCK)).toBe(false);
    expect(d.place(1, 0, 0)).toBe(false); // not a tile
    expect(d.place(1, 0, 9)).toBe(false); // beyond the tileset
    expect(d.place(1, 0, 1.5)).toBe(false);
    d.addKeepOut(8, 0, 15, 7);
    expect(d.place(1, 0, ROCK)).toBe(false);
    expect(d.count).toBe(1);
  });

  it('restores the pristine tiles: broken back, placed gone, no damage, one reset', () => {
    const d = destructible(ROWS);
    const pristine = d.map.tiles.slice();
    d.hit(17, 9, 3); // brick broken
    d.hit(25, 9, 1); // tissue damaged
    d.hit(17, 17, 1); // brick damaged
    d.place(0, 0, BRICK);
    expect(d.map.tiles).not.toEqual(pristine);
    d.restore();
    expect(d.map.tiles).toEqual(pristine);
    expect([d.entries, d.destroyed, d.resets, d.lastTile, d.lastCell]).toEqual([0, 0, 1, 0, -1]);
    expect(d.damageAt(2, 2)).toBe(0);
    // Everything breaks from scratch again.
    expect(d.hit(17, 17, 2)).toBe(TerrainHit.Damaged);
  });

  it('keeps a ring of the last changed cells', () => {
    const d = destructible(['bbbbbb', 'bbbbbb', 'bbbbbb', 'bbbbbb']);
    let changes = 0;
    for (let c = 0; c < 24; c++) {
      d.hit((c % 6) * 8, Math.floor(c / 6) * 8, 3);
      changes++;
    }
    expect(d.count).toBe(changes);
    expect(d.cells.length).toBe(TERRAIN_CHANGE_LOG);
    expect(d.cells[23]).toBe(23);
  });

  it('breaks, heals, regrows and places without allocating', () => {
    const d = destructible(['tttttt', 'tttttt', 'bbbbbb', 'bbbbbb']);
    let x = 0;
    const { bytes } = measureHeapGrowth(() => {
      d.hit(x % 48, 4, 1);
      d.hit((x * 7) % 48, 20, 1);
      d.update();
      if (x % 97 === 0) d.place(x % 6, 0, 1);
      x++;
    }, 20_000);
    expect(bytes).toBeLessThan(64 * 1024);
  });
});

describe('core/collision TerrainBlocks — in every terrain query', () => {
  it('is seen by terrainAt / terrainSolidAt / terrainRectHit / boxHitsTerrain, even off the map', () => {
    const blocks = new TerrainBlocks();
    expect(blocks.capacity).toBe(MAX_TERRAIN_BLOCKS);
    const map = makeMap(['......', '......', '......', 'rrrrrr'], blocks);
    expect(terrainAt(map, 20, 12)).toBe(TerrainType.Empty);
    blocks.set(0, 16, 8, 31, 15, TerrainType.Solid); // a 16 × 8 slab over cells (2…3, 1)
    expect(terrainAt(map, 20, 12)).toBe(TerrainType.Solid);
    expect(terrainAt(map, 31.9, 15.9)).toBe(TerrainType.Solid); // inclusive bounds, floored
    expect(terrainAt(map, 32, 12)).toBe(TerrainType.Empty);
    expect(terrainSolidAt(map, 16, 8)).toBe(true);
    expect(terrainRectHit(map, 0, 0, 15, 7)).toBe(TerrainType.Empty);
    expect(terrainRectHit(map, 30, 14, 40, 20)).toBe(TerrainType.Solid);
    expect(boxHitsTerrain(map, 24, 20, 2, 2)).toBe(TerrainType.Empty); // y 18…21: below it
    expect(boxHitsTerrain(map, 24, 16, 2, 2)).toBe(TerrainType.Solid);
    // A block beyond the map's edge still collides (the queries test blocks everywhere).
    blocks.set(1, 100, -20, 107, -13, TerrainType.Hazard);
    expect(terrainAt(map, 103, -15)).toBe(TerrainType.Hazard);
    expect(terrainRectHit(map, 90, -30, 110, -10)).toBe(TerrainType.Hazard);
    // Hazard beats solid; an Empty-typed block is harmless.
    blocks.set(2, 16, 8, 23, 15, TerrainType.Hazard);
    expect(terrainAt(map, 17, 9)).toBe(TerrainType.Hazard);
    blocks.set(3, 0, 0, 7, 7, TerrainType.Empty);
    expect(terrainAt(map, 3, 3)).toBe(TerrainType.Empty);
    // NaN bounds miss.
    expect(terrainRectHit(map, Number.NaN, 0, 40, 40)).toBe(TerrainType.Empty);
  });

  it('is a floor for findFloor and a ceiling for findCeiling, nearer than the tiles', () => {
    const blocks = new TerrainBlocks(4);
    const map = makeMap(['rrrrrr', '......', '......', 'rrrrrr'], blocks);
    expect(findFloor(map, 20, 9, 32)).toBe(24); // the floor tiles
    blocks.set(0, 16, 14, 31, 17, TerrainType.Solid);
    expect(findFloor(map, 20, 9, 32)).toBe(14);
    expect(findFloor(map, 20, 15, 32)).toBe(15); // starting inside it
    expect(findFloor(map, 20, 9, 3)).toBeNaN(); // out of range (rows 9…12)
    expect(findFloor(map, 40, 9, 32)).toBe(24); // not under it
    expect(findCeiling(map, 20, 22, 32)).toBe(18); // its bottom row 17 → surface 18
    expect(findCeiling(map, 20, 12, 32)).toBe(8); // above it: the ceiling tiles
    expect(findCeiling(map, 20, 16, 32)).toBe(17); // inside it
    // Removing it restores the tile answers; trailing free slots shrink the scanned range.
    blocks.set(2, 0, 0, 1, 1, TerrainType.Solid);
    blocks.remove(0);
    expect(blocks.count).toBe(3);
    blocks.remove(2);
    expect(blocks.count).toBe(0);
    expect(findFloor(map, 20, 9, 32)).toBe(24);
    blocks.set(9, 0, 0, 1, 1, TerrainType.Solid); // out of range: ignored
    blocks.remove(-1);
    expect(blocks.count).toBe(0);
    blocks.set(0, 0, 0, 1, 1, TerrainType.Solid);
    blocks.clear();
    expect(blocks.count).toBe(0);
  });

  it('answers queries without allocating', () => {
    const blocks = new TerrainBlocks();
    const map = makeMap(['rrrrrr', '......', '......', 'rrrrrr'], blocks);
    for (let i = 0; i < 8; i++) blocks.set(i, i * 4, 10, i * 4 + 7, 13, TerrainType.Solid);
    let k = 0;
    let sink = 0;
    const { bytes } = measureHeapGrowth(() => {
      const x = k % 48;
      sink += terrainAt(map, x, 12) + terrainRectHit(map, x, 8, x + 4, 16);
      sink += findFloor(map, x, 9, 20) | 0;
      sink += findCeiling(map, x, 20, 20) | 0;
      k++;
    }, 50_000);
    expect(sink).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
