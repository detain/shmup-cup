/**
 * The terrain binding and a view's change log (plan M2-07 — destructible tiles, cube-rush tiles):
 * changed cells in view are re-textured on the next sync without a scroll, cells out of view are
 * left for when they scroll in, a gap longer than the ring or a reset (the checkpoint rollback)
 * redraws the grid, and following the log never allocates.
 */
import { TERRAIN_CHANGE_LOG, type TerrainChanges, type TerrainView } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createTerrainBinding } from '../../src/layers/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { measureAllocation, pageImages, testManifest } from '../helpers.js';

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

/**
 * A 200 × 25 map of tile 1 on row 24 with a change log.
 *
 * @returns The view (writable tiles) and its log.
 */
function view(): { view: TerrainView & { tiles: Uint8Array }; log: Log } {
  const cols = 200;
  const rows = 25;
  const tiles = new Uint8Array(cols * rows);
  tiles.fill(1, 24 * cols);
  const log: Log = { count: 0, resets: 0, cells: new Int32Array(TERRAIN_CHANGE_LOG) };
  return {
    view: {
      tileSize: 8,
      cols,
      rows,
      tiles,
      tilesetSpriteId: 0,
      tileFrame: new Int16Array([-1, 0, 1, 2]),
      changes: log,
    },
    log,
  };
}

/**
 * Records a changed cell in a log.
 *
 * @param log - The log.
 * @param cell - Cell index.
 */
function change(log: Log, cell: number): void {
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

describe('render-pixi/layers terrain binding — the change log (M2-07)', () => {
  it('re-textures the changed cells in view on the next sync, without scrolling', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const { view: v, log } = view();
    const binding = createTerrainBinding({ atlas: a, tables, view: v });
    const camera = { x: 0, y: 0 };
    binding.sync(v, camera);
    expect(slot(binding, 10, 24).visible).toBe(true);
    // A tile breaks and another is placed.
    v.tiles[24 * 200 + 10] = 0;
    change(log, 24 * 200 + 10);
    v.tiles[12 * 200 + 20] = 3;
    change(log, 12 * 200 + 20);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(2);
    expect(slot(binding, 10, 24).visible).toBe(false);
    expect(slot(binding, 20, 12).visible).toBe(true);
    expect(slot(binding, 20, 12).texture).toBe(a.textures[tables.base[0] + 2]);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(0);
  });

  it('leaves out-of-view changes to the scroll, and redraws everything after a reset or a long gap', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const { view: v, log } = view();
    const binding = createTerrainBinding({ atlas: a, tables, view: v });
    const camera = { x: 0, y: 0 };
    binding.sync(v, camera);
    v.tiles[24 * 200 + 150] = 0; // far right: not in a slot yet
    change(log, 24 * 200 + 150);
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(0);
    camera.x = 150 * 8 - 200;
    binding.sync(v, camera);
    expect(slot(binding, 150, 24).visible).toBe(false);
    // The rollback: every slot re-read.
    v.tiles[24 * 200 + 150] = 1;
    log.resets++;
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(binding.columns * binding.rows);
    expect(slot(binding, 150, 24).visible).toBe(true);
    // More changes than the ring holds since the last sync: the whole grid again.
    for (let k = 0; k < TERRAIN_CHANGE_LOG + 1; k++) change(log, 24 * 200 + 130 + (k % 20));
    binding.sync(v, camera);
    expect(binding.updatedCells).toBe(binding.columns * binding.rows);
  });

  it('follows the log without allocating', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const { view: v, log } = view();
    const binding = createTerrainBinding({ atlas: a, tables, view: v });
    const camera = { x: 0, y: 0 };
    const bytes = measureAllocation((tick) => {
      const cell = 24 * 200 + (tick % 48);
      v.tiles[cell] = v.tiles[cell] === 0 ? 1 : 0;
      change(log, cell);
      binding.sync(v, camera);
    }, 10_000);
    expect(bytes).toBeLessThan(256 * 1024);
  });
});
