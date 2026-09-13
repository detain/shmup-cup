/**
 * Edge cases of the M2-07 terrain additions in `core/collision`:
 *
 * - {@link DestructibleTerrain}: a broken (regrowing) cell takes no hits, a damaged regenerating
 *   tile that breaks reuses its entry, a hit restarts the heal timer, healing ignores keep-out
 *   rectangles while regrowth waits for them (inclusive edges), a one-hit break with a full table
 *   never grows back, a zero-capacity table, infinite / negative amounts, `lastTile` / `lastCell`
 *   untouched by a miss, the change ring wrapping, entries shrinking only past trailing free ones,
 *   several cells growing back on one tick, `restore` keeping the change count and forgetting the
 *   keep-out-blocked regrowth, placing hazard / decorative tiles, `damageAt` of broken cells, and a
 *   cell under a moving block;
 * - {@link TerrainBlocks}: overlapping blocks (the highest type wins), a freed slot inside the
 *   scanned range, the nearest of several floors / ceilings, tile surfaces nearer than a block,
 *   a hazard tile beating a solid block, an `Empty` block that is never a floor, a negative search
 *   distance.
 */
import { describe, expect, it } from 'vitest';
import {
  DestructibleTerrain,
  MAX_TERRAIN_KEEP_OUT,
  TERRAIN_CHANGE_LOG,
  TerrainAnchor,
  TerrainBlocks,
  TerrainHit,
  TerrainType,
  findCeiling,
  findFloor,
  terrainAt,
  terrainRectHit,
  type TerrainMap,
} from '../../src/collision/index.js';

/**
 * Tile ids of the test tileset: 1 rock, 2 brick (hp 3), 3 tissue (hp 2, regen 10), 4 deco, 5
 * spikes (a hazard, hp 1), 6 moss (hp 3, regen 10).
 */
const ROCK = 1;
const BRICK = 2;
const TISSUE = 3;
const DECO = 4;
const SPIKES = 5;
const MOSS = 6;

/** Hit points and regeneration by tile id. */
const HP = Uint8Array.from([0, 0, 3, 2, 0, 1, 3]);
const REGEN = Uint16Array.from([0, 0, 0, 10, 0, 0, 10]);

/**
 * A map of 8-px tiles (every tile a full block).
 *
 * @param rows - One string per row (`.` empty, `r` rock, `b` brick, `t` tissue, `d` deco, `s`
 *   spikes, `m` moss).
 * @param blocks - Moving block slots, or `null`.
 * @returns The map.
 */
function makeMap(rows: string[], blocks: TerrainBlocks | null = null): TerrainMap {
  const cols = rows[0].length;
  const tiles = new Uint8Array(cols * rows.length);
  const ids: Record<string, number> = {
    '.': 0,
    r: ROCK,
    b: BRICK,
    t: TISSUE,
    d: DECO,
    s: SPIKES,
    m: MOSS,
  };
  rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++) tiles[r * cols + c] = ids[row[c]];
  });
  const size = 8;
  const mask = new Uint8Array(7 * size);
  for (let id = 1; id < 7; id++) mask.fill(size, id * size, id * size + size);
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
      TerrainType.Hazard,
      TerrainType.Solid,
    ]),
    tileAnchor: new Uint8Array(7).fill(TerrainAnchor.Floor),
    tileMask: mask,
    blocks,
  };
}

/**
 * A destructible terrain over {@link makeMap}.
 *
 * @param rows - The map rows.
 * @param capacity - Tracked cells.
 * @param blocks - Moving block slots, or `null`.
 * @returns The terrain (its map's tiles start as the pristine copy).
 */
function destructible(
  rows: string[],
  capacity?: number,
  blocks: TerrainBlocks | null = null,
): DestructibleTerrain {
  const map = makeMap(rows, blocks);
  return new DestructibleTerrain(map, map.tiles.slice(), HP, REGEN, capacity);
}

/**
 * The pixel at the middle of a cell.
 *
 * @param col - Tile column.
 * @param row - Tile row.
 * @returns `[x, y]`.
 */
function mid(col: number, row: number): [number, number] {
  return [col * 8 + 4, row * 8 + 4];
}

describe('core/collision DestructibleTerrain — damage edges', () => {
  it('takes no hit on a broken, regrowing cell (it is empty) and keeps its regrowth', () => {
    const d = destructible(['.t....', '......']);
    expect(d.hit(...mid(1, 0), 2)).toBe(TerrainHit.Destroyed);
    expect(d.entries).toBe(1);
    expect(d.hit(...mid(1, 0), 5)).toBe(TerrainHit.None);
    expect(d.damageAt(1, 0)).toBe(0); // a regrowing cell has no damage
    for (let t = 0; t < 10; t++) d.update();
    expect(d.map.tiles[1]).toBe(TISSUE);
  });

  it('reuses the entry of a damaged regenerating tile when it breaks', () => {
    const d = destructible(['t.....', '......']);
    expect(d.hit(...mid(0, 0), 1)).toBe(TerrainHit.Damaged);
    expect(d.entries).toBe(1);
    expect(d.entryState[0]).toBe(1); // damaged
    expect(d.hit(...mid(0, 0), 1)).toBe(TerrainHit.Destroyed);
    expect(d.entries).toBe(1);
    expect([d.entryState[0], d.entryDamage[0], d.entryTimer[0]]).toEqual([2, 0, 10]); // regrowing
  });

  it('restarts the heal timer with every hit', () => {
    const d = destructible(['mm....', '......']);
    expect(d.hit(...mid(0, 0), 1)).toBe(TerrainHit.Damaged);
    for (let t = 0; t < 7; t++) d.update();
    expect(d.damageAt(0, 0)).toBe(1);
    expect(d.hit(...mid(0, 0), 1)).toBe(TerrainHit.Damaged); // 10 ticks again from here
    expect(d.entryTimer[0]).toBe(10);
    // A hit on another cell leaves this cell's timer alone.
    d.hit(...mid(1, 0), 1);
    for (let t = 0; t < 9; t++) d.update();
    expect([d.damageAt(0, 0), d.damageAt(1, 0)]).toEqual([2, 1]);
    d.update();
    expect([d.damageAt(0, 0), d.damageAt(1, 0)]).toEqual([0, 0]);
    expect(d.entries).toBe(0);
    // Healed: it takes its full hp again.
    expect(d.hit(...mid(0, 0), 2)).toBe(TerrainHit.Damaged);
    expect(d.hit(...mid(0, 0), 1)).toBe(TerrainHit.Destroyed);
  });

  it('heals a damaged tile even under a keep-out rectangle (only regrowth waits)', () => {
    const d = destructible(['t.....', '......']);
    d.hit(...mid(0, 0), 1);
    for (let t = 0; t < 10; t++) {
      d.clearKeepOut();
      d.addKeepOut(0, 0, 7, 7);
      d.update();
    }
    expect(d.damageAt(0, 0)).toBe(0);
    expect(d.map.tiles[0]).toBe(TISSUE);
  });

  it('waits for keep-out rectangles touching the cell on any inclusive edge', () => {
    // Tissue cell (2, 1): pixels 16…23 × 8…15.
    const edges: [number, number, number, number][] = [
      [10, 10, 16, 12], // right edge on its first column
      [23, 10, 30, 12], // left edge on its last column
      [18, 0, 20, 8], // bottom edge on its first row
      [18, 15, 20, 30], // top edge on its last row
    ];
    for (const rect of edges) {
      const d = destructible(['......', '..t...']);
      d.hit(...mid(2, 1), 2);
      for (let t = 0; t < 15; t++) {
        d.clearKeepOut();
        d.addKeepOut(...rect);
        d.update();
      }
      expect(d.map.tiles[8], String(rect)).toBe(0);
      d.clearKeepOut();
      expect(d.update()).toBe(1);
      expect(d.map.tiles[8]).toBe(TISSUE);
    }
    // One pixel off each side: no wait.
    const clear: [number, number, number, number][] = [
      [10, 10, 15, 12],
      [24, 10, 30, 12],
      [18, 0, 20, 7],
      [18, 16, 20, 30],
    ];
    for (const rect of clear) {
      const d = destructible(['......', '..t...']);
      d.hit(...mid(2, 1), 2);
      let grown = 0;
      for (let t = 0; t < 10; t++) {
        d.clearKeepOut();
        d.addKeepOut(...rect);
        grown += d.update();
      }
      expect(grown, String(rect)).toBe(1);
    }
  });

  it('checks every keep-out rectangle, and forgets them on clearKeepOut', () => {
    const d = destructible(['......', '..t...']);
    d.hit(...mid(2, 1), 2);
    for (let t = 0; t < 12; t++) {
      d.clearKeepOut();
      for (let k = 0; k < MAX_TERRAIN_KEEP_OUT - 1; k++) d.addKeepOut(100, 100, 101, 101);
      d.addKeepOut(16, 8, 16, 8); // the last one, a single pixel of the cell
      expect(d.keepOutCount).toBe(MAX_TERRAIN_KEEP_OUT);
      d.update();
    }
    expect(d.map.tiles[8]).toBe(0);
    d.clearKeepOut();
    expect(d.keepOutCount).toBe(0);
    d.update();
    expect(d.map.tiles[8]).toBe(TISSUE);
  });

  it('never regrows a regenerating tile broken at once while the table is full', () => {
    const d = destructible(['bt....', '......'], 1);
    expect(d.hit(...mid(0, 0), 1)).toBe(TerrainHit.Damaged); // takes the only entry
    expect(d.hit(...mid(1, 0), 2)).toBe(TerrainHit.Destroyed); // no entry for its regrowth
    expect(d.lastTile).toBe(TISSUE);
    for (let t = 0; t < 100; t++) d.update();
    expect(d.map.tiles[1]).toBe(0);
    expect(d.entries).toBe(1);
  });

  it('works with a zero-capacity table: only one-hit breaks happen', () => {
    const d = destructible(['bb....', '......'], 0);
    expect(d.hit(...mid(0, 0), 1)).toBe(TerrainHit.None);
    expect(d.damageAt(0, 0)).toBe(0);
    expect(d.hit(...mid(1, 0), 3)).toBe(TerrainHit.Destroyed);
    expect(d.map.tiles[1]).toBe(0);
    expect(d.entries).toBe(0);
    expect(d.update()).toBe(0);
  });

  it('breaks at once on an infinite amount and ignores negative ones', () => {
    const d = destructible(['bb....', '......']);
    expect(d.hit(...mid(0, 0), -3)).toBe(TerrainHit.None);
    expect(d.hit(...mid(0, 0), Number.NEGATIVE_INFINITY)).toBe(TerrainHit.None);
    expect(d.hit(...mid(0, 0), Number.POSITIVE_INFINITY)).toBe(TerrainHit.Destroyed);
    expect(d.hit(Number.NaN, 4, 1)).toBe(TerrainHit.None);
    expect(d.hit(4, Number.NaN, 1)).toBe(TerrainHit.None);
    expect(d.hit(4, 16, 1)).toBe(TerrainHit.None); // below the map (row 2 of 2)
  });

  it('keeps lastTile / lastCell from the last hit that did something', () => {
    const d = destructible(['b.t...', '......']);
    d.hit(...mid(0, 0), 1);
    expect([d.lastTile, d.lastCell]).toEqual([BRICK, 0]);
    d.hit(...mid(1, 0), 1); // empty
    d.hit(...mid(0, 1), 1); // empty
    expect([d.lastTile, d.lastCell]).toEqual([BRICK, 0]);
    d.hit(...mid(2, 0), 1);
    expect([d.lastTile, d.lastCell]).toEqual([TISSUE, 2]);
  });

  it('hits the cell of the pixel whatever its fraction (callers pass whole pixels)', () => {
    const d = destructible(['.b....', '......']);
    expect(d.hit(8, 0, 1)).toBe(TerrainHit.Damaged); // first pixel of cell (1, 0)
    expect(d.hit(15.99, 7.99, 1)).toBe(TerrainHit.Damaged); // last one
    expect(d.hit(16, 0, 1)).toBe(TerrainHit.None); // the next cell (empty)
    expect(d.damageAt(1, 0)).toBe(2);
  });

  it('wraps the change ring after TERRAIN_CHANGE_LOG changes', () => {
    const cols = TERRAIN_CHANGE_LOG + 8;
    const d = destructible(['b'.repeat(cols), '.'.repeat(cols)]);
    for (let c = 0; c < cols; c++) expect(d.hit(...mid(c, 0), 3)).toBe(TerrainHit.Destroyed);
    expect(d.count).toBe(cols);
    // The oldest entries were overwritten by the newest.
    for (let k = cols - TERRAIN_CHANGE_LOG; k < cols; k++) {
      expect(d.cells[k % TERRAIN_CHANGE_LOG]).toBe(k);
    }
    expect(d.destroyed).toBe(cols);
  });

  it('shrinks the scanned entries only past trailing free ones', () => {
    const d = destructible(['bbb...', '......']);
    for (let c = 0; c < 3; c++) d.hit(...mid(c, 0), 1);
    expect(d.entries).toBe(3);
    d.hit(...mid(1, 0), 2); // the middle one breaks: its entry frees, the range stays
    expect(d.entries).toBe(3);
    expect(d.damageAt(0, 0)).toBe(1);
    expect(d.damageAt(2, 0)).toBe(1);
    d.hit(...mid(2, 0), 2); // the last one: the range shrinks past both free entries
    expect(d.entries).toBe(1);
    // A new cell takes the lowest free entry.
    const e = destructible(['bbbb..', '......']);
    for (let c = 0; c < 3; c++) e.hit(...mid(c, 0), 1);
    e.hit(...mid(0, 0), 2);
    e.hit(...mid(3, 0), 1);
    expect(e.entryCell[0]).toBe(3);
    expect(e.entries).toBe(3);
  });

  it('grows several cells back on one tick and logs each', () => {
    const d = destructible(['tttt..', '......']);
    for (let c = 0; c < 4; c++) d.hit(...mid(c, 0), 2);
    expect(d.count).toBe(4);
    for (let t = 0; t < 9; t++) expect(d.update()).toBe(0);
    expect(d.update()).toBe(4);
    expect(d.count).toBe(8);
    expect(Array.from(d.map.tiles.subarray(0, 4))).toEqual([TISSUE, TISSUE, TISSUE, TISSUE]);
    expect(d.entries).toBe(0);
  });
});

describe('core/collision DestructibleTerrain — placing and restoring edges', () => {
  it('places any tile id of the tileset, hazards and decorations included', () => {
    const d = destructible(['......', '......']);
    expect(d.place(0, 0, SPIKES)).toBe(true);
    expect(d.place(1, 0, DECO)).toBe(true);
    expect(terrainAt(d.map, 4, 4)).toBe(TerrainType.Hazard);
    expect(terrainAt(d.map, 12, 4)).toBe(TerrainType.Empty);
    // A decorative tile occupies its cell: nothing else can be placed there.
    expect(d.place(1, 0, ROCK)).toBe(false);
    // A placed breakable tile breaks like a stage one.
    expect(d.place(2, 0, BRICK)).toBe(true);
    expect(d.hit(...mid(2, 0), 3)).toBe(TerrainHit.Destroyed);
    expect(d.count).toBe(4);
  });

  it('refuses NaN cells and fractional or NaN tile ids', () => {
    const d = destructible(['......', '......']);
    expect(d.place(Number.NaN, 0, ROCK)).toBe(false);
    expect(d.place(0, Number.NaN, ROCK)).toBe(false);
    expect(d.place(0, 2, ROCK)).toBe(false); // below the map
    expect(d.place(0, 0, Number.NaN)).toBe(false);
    expect(d.place(0, 0, -1)).toBe(false);
    expect(d.count).toBe(0);
  });

  it('keeps the change count across a restore (the reset tells the renderer)', () => {
    const d = destructible(['bt....', '......']);
    d.hit(...mid(0, 0), 3);
    d.hit(...mid(1, 0), 2);
    d.place(3, 1, ROCK);
    expect(d.count).toBe(3);
    d.restore();
    expect([d.count, d.resets]).toEqual([3, 1]);
    d.restore();
    expect(d.resets).toBe(2);
    // The regrowth was forgotten: the tissue is back from the restore, nothing grows or logs.
    for (let t = 0; t < 20; t++) expect(d.update()).toBe(0);
    expect(d.count).toBe(3);
  });

  it('restores from the pristine copy only (content that never changes)', () => {
    const map = makeMap(['bb....', '......']);
    const pristine = map.tiles.slice();
    const frozen = pristine.slice();
    const d = new DestructibleTerrain(map, pristine, HP, REGEN);
    d.hit(...mid(0, 0), 3);
    d.place(5, 1, ROCK);
    expect(pristine).toEqual(frozen);
    d.restore();
    expect(map.tiles).toEqual(frozen);
    expect(map.tiles).not.toBe(pristine);
  });

  it('reports damage 0 for broken, never-hit and out-of-map cells', () => {
    const d = destructible(['bb....', '......']);
    d.hit(...mid(0, 0), 3);
    expect(d.damageAt(0, 0)).toBe(0);
    expect(d.damageAt(1, 0)).toBe(0);
    expect(d.damageAt(-1, 0)).toBe(0);
    expect(d.damageAt(0, 9)).toBe(0);
  });

  it('never breaks a moving block, even over a destructible cell', () => {
    const blocks = new TerrainBlocks(2);
    const d = destructible(['......', '......'], undefined, blocks);
    blocks.set(0, 0, 0, 15, 7, TerrainType.Solid);
    expect(terrainAt(d.map, 4, 4)).toBe(TerrainType.Solid);
    expect(d.hit(4, 4, 99)).toBe(TerrainHit.None);
    expect(blocks.live[0]).toBe(1);
    expect(d.count).toBe(0);
  });

  it('is not destructible with a tileset whose only hp is on tile 0 (the empty cell)', () => {
    const map = makeMap(['bb....', '......']);
    const d = new DestructibleTerrain(map, map.tiles.slice(), Uint8Array.from([5, 0, 0]), REGEN);
    expect(d.any).toBe(false);
    expect(d.hit(...mid(0, 0), 9)).toBe(TerrainHit.None);
    // Placing still works (the cube rush needs no hp).
    expect(d.place(3, 0, ROCK)).toBe(true);
  });
});

describe('core/collision TerrainBlocks — edges', () => {
  it('answers the highest type of overlapping blocks', () => {
    const blocks = new TerrainBlocks(4);
    blocks.set(0, 0, 0, 20, 20, TerrainType.Solid);
    blocks.set(1, 10, 10, 30, 30, TerrainType.Hazard);
    expect(blocks.typeAt(5, 5)).toBe(TerrainType.Solid);
    expect(blocks.typeAt(15, 15)).toBe(TerrainType.Hazard);
    expect(blocks.typeAt(25, 25)).toBe(TerrainType.Hazard);
    expect(blocks.typeAt(31, 31)).toBe(TerrainType.Empty);
    expect(blocks.rectType(0, 0, 9, 9)).toBe(TerrainType.Solid);
    expect(blocks.rectType(0, 0, 10, 10)).toBe(TerrainType.Hazard);
    expect(blocks.rectType(40, 40, 50, 50)).toBe(TerrainType.Empty);
  });

  it('skips a freed slot inside the scanned range, and reuses it', () => {
    const blocks = new TerrainBlocks(4);
    blocks.set(0, 0, 0, 7, 7, TerrainType.Solid);
    blocks.set(1, 20, 0, 27, 7, TerrainType.Solid);
    blocks.remove(0);
    expect(blocks.count).toBe(2);
    expect(blocks.typeAt(3, 3)).toBe(TerrainType.Empty);
    expect(blocks.typeAt(23, 3)).toBe(TerrainType.Solid);
    expect(blocks.floorIn(3, 0, 10)).toBeNaN();
    expect(blocks.ceilingIn(3, 7, 0)).toBeNaN();
    blocks.set(0, 40, 0, 47, 7, TerrainType.Hazard); // moved while free
    expect(blocks.typeAt(43, 3)).toBe(TerrainType.Hazard);
    expect(blocks.typeAt(3, 3)).toBe(TerrainType.Empty);
    expect(blocks.count).toBe(2);
  });

  it('finds the nearest of several block floors and ceilings', () => {
    const blocks = new TerrainBlocks(4);
    blocks.set(0, 0, 50, 15, 57, TerrainType.Solid);
    blocks.set(1, 0, 30, 15, 33, TerrainType.Solid);
    blocks.set(2, 0, 70, 15, 71, TerrainType.Solid);
    expect(blocks.floorIn(5, 0, 100)).toBe(30);
    expect(blocks.floorIn(5, 34, 100)).toBe(50);
    expect(blocks.floorIn(5, 34, 49)).toBeNaN();
    expect(blocks.ceilingIn(5, 100, 0)).toBe(71);
    expect(blocks.ceilingIn(5, 69, 0)).toBe(57);
    expect(blocks.ceilingIn(5, 69, 58)).toBeNaN();
    expect(blocks.floorIn(16, 0, 100)).toBeNaN(); // beside them
    // An Empty-typed block is no surface.
    blocks.set(3, 0, 10, 15, 12, TerrainType.Empty);
    expect(blocks.floorIn(5, 0, 100)).toBe(30);
    expect(blocks.ceilingIn(5, 20, 0)).toBeNaN();
  });

  it('lets a nearer tile surface win over a block, both ways', () => {
    const blocks = new TerrainBlocks(2);
    // Floor tiles at row 3 (y 24), ceiling tiles at row 0 (y 0…7).
    const map = makeMap(['rrrrrr', '......', '......', 'rrrrrr'], blocks);
    blocks.set(0, 0, 28, 47, 29, TerrainType.Solid); // below the floor tiles' top (24)
    expect(findFloor(map, 20, 9, 40)).toBe(24);
    blocks.set(0, 0, 2, 47, 3, TerrainType.Solid); // inside the ceiling tiles (surface 8)
    expect(findCeiling(map, 20, 20, 40)).toBe(8);
    // A negative distance finds nothing, blocks or not.
    expect(findFloor(map, 20, 9, -1)).toBeNaN();
    expect(findCeiling(map, 20, 20, -1)).toBeNaN();
    expect(findFloor(map, 20, 9, Number.NaN)).toBeNaN();
  });

  it('finds a block floor or ceiling outside the map columns', () => {
    const blocks = new TerrainBlocks(2);
    const map = makeMap(['......', '......'], blocks);
    blocks.set(0, 100, 20, 131, 27, TerrainType.Solid);
    expect(findFloor(map, 110, 0, 40)).toBe(20);
    expect(findCeiling(map, 110, 40, 40)).toBe(28);
    expect(findFloor(map, 110, 0, 10)).toBeNaN();
  });

  it('lets a hazard tile beat a solid block, and a hazard block beat a solid tile', () => {
    const blocks = new TerrainBlocks(2);
    const map = makeMap(['s.r...', '......'], blocks);
    blocks.set(0, 0, 0, 23, 7, TerrainType.Solid);
    expect(terrainAt(map, 4, 4)).toBe(TerrainType.Hazard);
    expect(terrainRectHit(map, 0, 0, 23, 7)).toBe(TerrainType.Hazard);
    expect(terrainAt(map, 12, 4)).toBe(TerrainType.Solid); // the block over an empty cell
    blocks.set(1, 16, 0, 23, 7, TerrainType.Hazard);
    expect(terrainAt(map, 20, 4)).toBe(TerrainType.Hazard);
    expect(terrainRectHit(map, 16, 0, 16, 0)).toBe(TerrainType.Hazard);
    // Inverted bounds miss the blocks (and the tiles).
    expect(terrainRectHit(map, 20, 4, 10, 4)).toBe(TerrainType.Empty);
  });
});
