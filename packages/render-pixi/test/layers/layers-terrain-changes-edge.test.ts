/**
 * Edge cases of the terrain binding following a view's change log (plan M2-07), beyond
 * `layers-terrain-changes.test.ts`: a gap of exactly the ring's length re-textures only the logged
 * cells, a cell logged twice is re-read twice, a changed cell that shares a slot with the cell in
 * view (same column modulo the slot ring, or a row off screen) leaves that slot alone, a log that
 * already had entries when the binding was created, a reset together with new changes, and a view
 * without a log (the pre-M2-07 contract).
 */
import { TERRAIN_CHANGE_LOG, type TerrainChanges, type TerrainView } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createTerrainBinding } from '../../src/layers/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** Sprite names: 0 = ships/a (the "tileset", 3 frames). */
const NAMES = ['ships/a', 'bg/tile', 'ghost'];

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** A writable change log. */
interface Log extends TerrainChanges {
  count: number;
  resets: number;
  readonly cells: Int32Array;
}

/** Map width in tiles. */
const COLS = 200;

/**
 * A 200 × 40 map (taller than the view) of tile 1 on row 24 with a change log.
 *
 * @param withLog - Give the view a change log.
 * @returns The view (writable tiles) and its log.
 */
function view(withLog = true): { view: TerrainView & { tiles: Uint8Array }; log: Log } {
  const rows = 40;
  const tiles = new Uint8Array(COLS * rows);
  tiles.fill(1, 24 * COLS, 25 * COLS);
  const log: Log = { count: 0, resets: 0, cells: new Int32Array(TERRAIN_CHANGE_LOG) };
  return {
    view: {
      tileSize: 8,
      cols: COLS,
      rows,
      tiles,
      tilesetSpriteId: 0,
      tileFrame: new Int16Array([-1, 0, 1, 2]),
      changes: withLog ? log : null,
    },
    log,
  };
}

/**
 * Changes a cell and logs it.
 *
 * @param v - The view.
 * @param log - The log.
 * @param col - Column.
 * @param row - Row.
 * @param tile - New tile.
 */
function change(v: { tiles: Uint8Array }, log: Log, col: number, row: number, tile: number): void {
  const cell = row * COLS + col;
  v.tiles[cell] = tile;
  log.cells[log.count % log.cells.length] = cell;
  log.count++;
}

/**
 * The sprite a binding shows for map cell `(col, row)`.
 *
 * @param binding - The binding.
 * @param col - Map column.
 * @param row - Map row.
 * @returns The slot's sprite.
 */
function slot(binding: ReturnType<typeof createTerrainBinding>, col: number, row: number): Sprite {
  return binding.container.children[
    (row % binding.rows) * binding.columns + (col % binding.columns)
  ] as Sprite;
}

/**
 * A binding over a fresh view, synced once at camera (0, 0).
 *
 * @param withLog - Give the view a change log.
 * @returns The binding, view, log, camera and atlas.
 */
function setup(withLog = true) {
  const a = atlas();
  const tables = createSpriteTables(a, NAMES);
  const { view: v, log } = view(withLog);
  const binding = createTerrainBinding({ atlas: a, tables, view: v });
  const camera = { x: 0, y: 0 };
  binding.sync(v, camera);
  return { a, tables, v, log, binding, camera };
}

describe('render-pixi/layers terrain binding — change log edges (M2-07)', () => {
  it('re-textures only the logged cells after a gap of exactly the ring length', () => {
    const { v, log, binding, camera } = setup();
    for (let k = 0; k < TERRAIN_CHANGE_LOG; k++) change(v, log, k % 32, 24, 0);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(TERRAIN_CHANGE_LOG);
    expect(binding.updatedCells).toBeLessThan(binding.columns * binding.rows);
    for (let c = 0; c < 32; c++) expect(slot(binding, c, 24).visible).toBe(false);
    expect(slot(binding, 40, 24).visible).toBe(true);
  });

  it('re-reads a cell logged twice twice, and shows its final tile', () => {
    const { a, tables, v, log, binding, camera } = setup();
    change(v, log, 5, 24, 0);
    change(v, log, 5, 24, 2);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(2);
    expect(slot(binding, 5, 24).visible).toBe(true);
    expect(slot(binding, 5, 24).texture).toBe(a.textures[tables.base[0] + 1]);
  });

  it('leaves a slot alone when the changed cell is not the one it shows', () => {
    const { v, log, binding, camera } = setup();
    const aliasCol = 5 + binding.columns; // same slot column, out of view
    change(v, log, aliasCol, 24, 0);
    const aliasRow = 2 + binding.rows; // the slot row of row 2, below the view (map rows: 40)
    expect(aliasRow).toBeLessThan(40);
    change(v, log, 7, aliasRow, 2);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(0);
    expect(slot(binding, 5, 24).visible).toBe(true);
    expect(slot(binding, 7, 2).visible).toBe(false); // row 2 is empty
    // Scrolling onto the aliased column reads the new state.
    camera.x = aliasCol * 8 - 100;
    binding.sync(v, camera);
    expect(slot(binding, aliasCol, 24).visible).toBe(false);
  });

  it('starts from the counts of a log that already had entries', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const { view: v, log } = view();
    change(v, log, 3, 24, 0);
    log.resets = 2;
    const binding = createTerrainBinding({ atlas: a, tables, view: v });
    const camera = { x: 0, y: 0 };
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(binding.columns * binding.rows); // the first draw
    expect(slot(binding, 3, 24).visible).toBe(false);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(0); // nothing new
    change(v, log, 4, 24, 0);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(1);
  });

  it('redraws the grid once for a reset with new changes in the same frame', () => {
    const { v, log, binding, camera } = setup();
    change(v, log, 8, 24, 0);
    log.resets++;
    change(v, log, 9, 24, 0);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(binding.columns * binding.rows);
    expect([slot(binding, 8, 24).visible, slot(binding, 9, 24).visible]).toEqual([false, false]);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(0);
  });

  it('draws a view without a log from the scroll alone', () => {
    const { v, binding, camera } = setup(false);
    v.tiles[24 * COLS + 6] = 0;
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(0);
    expect(slot(binding, 6, 24).visible).toBe(true); // not re-read until it scrolls in again
  });
});
