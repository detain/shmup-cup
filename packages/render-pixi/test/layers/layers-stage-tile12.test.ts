/**
 * The terrain binding at tile size 12 (plan_resolution.md R1-04): everything it sizes and places
 * comes from `TerrainView.tileSize`, so a 12-px map gets a grid one tile larger than the playfield
 * each way (and v2's 640 × 336 playfield its 55 × 29), cells at multiples of 12, one column or row
 * re-textured per 12-px tile edge crossed, and the same pixels as the sprite bindings. The 12-px
 * tileset sprite is a fixture of this test's manifest only.
 */
import {
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  createSpriteBatch,
  pushSprite,
  type TerrainView,
} from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas, type AtlasFrameInfo } from '../../src/atlas/index.js';
import { createTerrainBinding } from '../../src/layers/index.js';
import { createSpriteLayerBinding, createSpriteTables } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** The fixture's tile edge. */
const SIZE = 12;

/** Sprite names: 0 = the 12-px tileset (3 frames), 1 = a probe sprite anchored at its corner. */
const NAMES = ['tiles/t12', 'bg/tile'];

/**
 * The test atlas plus a third page holding a 12-px tileset sprite (three frames, anchor 0, 0).
 *
 * @returns The atlas (warnings silenced).
 */
function atlas(): Atlas {
  const base = testManifest();
  const page = base.pages.length;
  const names: string[] = [];
  const frames: Record<string, AtlasFrameInfo> = { ...base.frames };
  for (let i = 0; i < 3; i++) {
    const name = `tiles/t12#${i}`;
    names.push(name);
    frames[name] = { p: page, x: i * SIZE, y: 0, w: SIZE, h: SIZE, ax: 0, ay: 0 };
  }
  const manifest = {
    ...base,
    pages: [...base.pages, { file: `main-${page}.png`, w: 3 * SIZE, h: SIZE }],
    frames,
    sprites: { ...base.sprites, 'tiles/t12': { frames: names, flash: null } },
  };
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * A 12-px terrain view: tile `id` at `(c, r)` for every listed cell; ids 1…3 draw frames 0…2,
 * id 4 is undrawn (-1).
 *
 * @param cols - Width in tiles.
 * @param rows - Height in tiles.
 * @param cells - `[col, row, id]`.
 * @returns The view.
 */
function terrainView(
  cols: number,
  rows: number,
  cells: readonly (readonly [number, number, number])[],
): TerrainView {
  const tiles = new Uint8Array(cols * rows);
  for (const [c, r, id] of cells) tiles[r * cols + c] = id;
  return {
    tileSize: SIZE,
    cols,
    rows,
    tiles,
    tilesetSpriteId: 0,
    tileFrame: new Int16Array([-1, 0, 1, 2, -1]),
  };
}

/** The sprite a terrain binding shows in its slot for map cell `(col, row)`. */
function slotSprite(
  binding: ReturnType<typeof createTerrainBinding>,
  col: number,
  row: number,
): Sprite {
  return binding.container.children[
    (row % binding.rows) * binding.columns + (col % binding.columns)
  ] as Sprite;
}

describe('render-pixi/layers terrain binding at 12-px tiles (R1-04)', () => {
  it('sizes the grid from the tile size: one tile more than the playfield each way', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const columns = Math.ceil(PLAYFIELD_W / SIZE) + 1;
    const rows = Math.ceil(PLAYFIELD_H / SIZE) + 1;
    const big = createTerrainBinding({ atlas: a, tables, view: terrainView(500, 40, []) });
    expect([big.columns, big.rows, big.container.children.length]).toEqual([
      columns,
      rows,
      columns * rows,
    ]);
    expect((big.columns - 1) * SIZE).toBeGreaterThanOrEqual(PLAYFIELD_W);
    expect((big.rows - 1) * SIZE).toBeGreaterThanOrEqual(PLAYFIELD_H);
    const short = createTerrainBinding({ atlas: a, tables, view: terrainView(10, 3, []) });
    expect(short.rows).toBe(3);
    // v2's playfield (plan_resolution.md §2.7): 640 × 336 in 12-px tiles.
    const v2 = createTerrainBinding({
      atlas: a,
      tables,
      view: terrainView(500, 40, []),
      width: 640,
      height: 336,
    });
    expect([v2.columns, v2.rows]).toEqual([55, 29]);
  });

  it('places cells at multiples of 12 and hides empty / undrawn ones', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = terrainView(200, 17, [
      [0, 16, 1],
      [3, 16, 3],
      [5, 10, 4],
    ]);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    binding.sync(view, { x: 0, y: 0 });
    expect([binding.container.x, binding.container.y]).toEqual([0, PLAYFIELD_Y]);
    const cell = slotSprite(binding, 3, 16);
    expect(cell.visible).toBe(true);
    expect(cell.texture).toBe(a.textures[tables.base[0] + 2]);
    expect([cell.x, cell.y]).toEqual([3 * SIZE, 16 * SIZE]);
    expect([cell.texture.width, cell.texture.height]).toEqual([SIZE, SIZE]);
    expect(slotSprite(binding, 0, 16).visible).toBe(true);
    expect(slotSprite(binding, 1, 16).visible).toBe(false); // empty
    expect(slotSprite(binding, 5, 10).visible).toBe(false); // undrawn (frame -1)
    expect(binding.updatedCells).toBe(binding.columns * binding.rows);
  });

  it('re-textures nothing inside a tile and one column / row per 12-px edge crossed', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = terrainView(400, 40, [[40, 3, 2]]);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    binding.sync(view, { x: 0, y: 0 });
    binding.sync(view, { x: 11.5, y: 0 });
    expect(binding.updatedCells).toBe(0);
    binding.sync(view, { x: SIZE, y: 0 });
    expect(binding.updatedCells).toBe(binding.rows);
    binding.sync(view, { x: 8 * SIZE, y: 0 }); // column 40 is in view now
    expect(slotSprite(binding, 40, 3).visible).toBe(true);
    expect(slotSprite(binding, 40, 3).x).toBe(40 * SIZE);
    expect(binding.container.x).toBe(-8 * SIZE);
    binding.sync(view, { x: 8 * SIZE, y: SIZE + 1 });
    expect(binding.updatedCells).toBe(binding.columns);
    expect(binding.container.y).toBe(PLAYFIELD_Y - SIZE - 1);
  });

  it('puts integer world positions on the same pixels as the sprite bindings', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = terrainView(200, 17, [[10, 5, 1]]);
    const terrain = createTerrainBinding({ atlas: a, tables, view });
    const batch = createSpriteBatch(LayerId.Player, 1);
    // bg/tile is anchored at its corner, like the tile frames: put it on cell (10, 5)'s corner.
    pushSprite(batch, 10 * SIZE, 5 * SIZE, 1, 0, 0);
    const sprites = createSpriteLayerBinding({ atlas: a, tables, capacity: 1, layer: batch.layer });
    for (const cam of [0.5, 1.5, 2.49, 12.5, -0.5, 30.5]) {
      terrain.sync(view, { x: cam, y: cam });
      sprites.sync(batch, cam, cam);
      const tile = slotSprite(terrain, 10, 5);
      const probe = sprites.container.children[0] as Sprite;
      expect(terrain.container.x + tile.x, `x at ${cam}`).toBe(probe.x);
      expect(terrain.container.y + tile.y, `y at ${cam}`).toBe(probe.y);
    }
  });
});
