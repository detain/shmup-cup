/**
 * Terrain and parallax drawing (plan M1-07), headless over the test atlas: the terrain grid's
 * size (49 × 26 for 8-px tiles, capped at the map's rows), tile textures and positions, the
 * ring update (nothing re-textured inside one tile, one column / row when the camera crosses a
 * tile edge, everything after a jump or new sprite tables), hidden empty / undrawn / off-map
 * cells, pixel agreement with the sprite bindings at half-pixel camera positions, the parallax
 * band sprites and offsets, validation, and allocation-free syncs.
 */
import {
  LayerId,
  PLAYFIELD_Y,
  createSpriteBatch,
  pushSprite,
  type ParallaxView,
  type TerrainView,
} from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createParallaxBinding, createTerrainBinding } from '../../src/layers/index.js';
import { createSpriteLayerBinding, createSpriteTables } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** Sprite names: 0 = ships/a (the "tileset", 3 frames), 1 = bg/tile, 2 = unknown. */
const NAMES = ['ships/a', 'bg/tile', 'ghost'];

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * A terrain view: `cols × rows` 8-px tiles, tile `id` at `(c, r)` for every listed cell; tile
 * ids 1…3 draw frames 0…2, id 4 is undrawn (-1).
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
): TerrainView & { tiles: Uint8Array } {
  const tiles = new Uint8Array(cols * rows);
  for (const [c, r, id] of cells) tiles[r * cols + c] = id;
  return {
    tileSize: 8,
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
  const sc = col % binding.columns;
  const sr = row % binding.rows;
  return binding.container.children[sr * binding.columns + sc] as Sprite;
}

describe('render-pixi/layers terrain binding', () => {
  it('preallocates one tile more than the playfield in each direction, capped at the map', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const big = createTerrainBinding({ atlas: a, tables, view: terrainView(500, 25, []) });
    expect([big.columns, big.rows, big.container.children.length]).toEqual([49, 25, 49 * 25]);
    const tall = createTerrainBinding({ atlas: a, tables, view: terrainView(500, 40, []) });
    expect([tall.columns, tall.rows]).toEqual([49, 26]);
    const short = createTerrainBinding({ atlas: a, tables, view: terrainView(10, 3, []) });
    expect(short.rows).toBe(3);
  });

  it('textures the visible cells from the tileset and hides empty / undrawn cells', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = terrainView(200, 25, [
      [0, 24, 1],
      [3, 24, 3],
      [5, 20, 4],
    ]);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    binding.sync(view, { x: 0, y: 0 });
    expect([binding.container.x, binding.container.y]).toEqual([0, PLAYFIELD_Y]);
    const first = slotSprite(binding, 0, 24);
    expect(first.visible).toBe(true);
    expect(first.texture).toBe(a.textures[tables.base[0]]);
    expect(slotSprite(binding, 3, 24).texture).toBe(a.textures[tables.base[0] + 2]);
    // Anchors of ships/a are (8, 4): the frame's top-left lands on the cell's corner.
    expect([slotSprite(binding, 3, 24).x, slotSprite(binding, 3, 24).y]).toEqual([
      3 * 8 - 8,
      24 * 8 - 4,
    ]);
    expect(slotSprite(binding, 1, 24).visible).toBe(false); // empty
    expect(slotSprite(binding, 5, 20).visible).toBe(false); // undrawn (frame -1)
    expect(binding.updatedCells).toBe(49 * 25);
  });

  it('re-textures nothing inside a tile and one column / row when crossing a tile edge', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = terrainView(400, 40, [[49, 3, 2]]);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    binding.sync(view, { x: 0, y: 0 });
    binding.sync(view, { x: 7.5, y: 0 });
    expect(binding.updatedCells).toBe(0);
    binding.sync(view, { x: 8, y: 0 }); // column 49 scrolls in, into the slot column 0 left
    expect(binding.updatedCells).toBe(26);
    expect(slotSprite(binding, 49, 3).visible).toBe(true);
    expect(slotSprite(binding, 49, 3).x).toBe(49 * 8 - 8);
    expect(binding.container.x).toBe(-8);
    binding.sync(view, { x: 8, y: 9 }); // one row scrolls in at the bottom
    expect(binding.updatedCells).toBe(49);
    expect(binding.container.y).toBe(PLAYFIELD_Y - 9);
    binding.sync(view, { x: 1000, y: 0 }); // a jump: everything
    expect(binding.updatedCells).toBe(49 * 26);
  });

  it('refreshes every cell when the sprite tables are replaced', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = terrainView(100, 25, [[2, 2, 1]]);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    binding.sync(view, { x: 0, y: 0 });
    const swapped = createSpriteTables(a, ['bg/tile']);
    tables.base = swapped.base;
    binding.sync(view, { x: 0, y: 0 });
    expect(binding.updatedCells).toBe(49 * 25);
    expect(slotSprite(binding, 2, 2).texture).toBe(a.textures[swapped.base[0]]);
  });

  it('hides cells left or right of the map', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = terrainView(4, 25, [
      [0, 0, 1],
      [3, 0, 1],
    ]);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    binding.sync(view, { x: -16, y: 0 });
    expect(slotSprite(binding, 0, 0).visible).toBe(true);
    const offMap = binding.container.children.filter((s) => s.visible);
    expect(offMap).toHaveLength(2);
  });

  it('puts integer world positions on the same pixels as the sprite bindings', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = terrainView(200, 25, [[10, 5, 1]]);
    const terrain = createTerrainBinding({ atlas: a, tables, view });
    const batch = createSpriteBatch(LayerId.Player, 1);
    pushSprite(batch, 80, 40, 0, 0, 0); // anchored at the tile's corner, like the tile frame
    const sprites = createSpriteLayerBinding({ atlas: a, tables, capacity: 1, layer: batch.layer });
    for (const cam of [0.5, 1.5, 2.49, 12.5, -0.5]) {
      terrain.sync(view, { x: cam, y: cam });
      sprites.sync(batch, cam, cam);
      const tile = slotSprite(terrain, 10, 5);
      const ship = sprites.container.children[0] as Sprite;
      expect(terrain.container.x + tile.x, `x at ${cam}`).toBe(ship.x);
      expect(terrain.container.y + tile.y, `y at ${cam}`).toBe(ship.y);
    }
  });

  it('syncs without allocating', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const cells: [number, number, number][] = [];
    for (let c = 0; c < 2000; c++) cells.push([c, 24 - (c % 5), 1 + (c % 3)]);
    const view = terrainView(2000, 25, cells);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    const camera = { x: 0, y: 0.5 };
    const bytes = measureHeapGrowth(
      (tick) => {
        camera.x = (tick * 1.25) % 15000;
        binding.sync(view, camera);
      },
      10_000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(256 * 1024);
  });
});

describe('render-pixi/layers parallax binding', () => {
  /**
   * A two-band parallax view.
   *
   * @returns The view (writable arrays).
   */
  function parallaxView(): ParallaxView & { offsetX: Float64Array; y: Float64Array } {
    return {
      count: 2,
      layer: new Uint8Array([LayerId.BgFar, LayerId.BgMid]),
      spriteId: new Uint16Array([1, 2]),
      offsetX: new Float64Array([0, 0]),
      y: new Float64Array([0, 12]),
      spacing: new Uint16Array([16, 128]),
    };
  }

  it('creates enough sprites per band to cover the playfield plus one repeat', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const binding = createParallaxBinding({ atlas: a, tables, view: parallaxView() });
    expect(binding.layers).toEqual([LayerId.BgFar, LayerId.BgMid]);
    expect(binding.containers.map((c) => c.children.length)).toEqual([25, 4]);
  });

  it('places the band sprites `spacing` apart and scrolls the band container', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = parallaxView();
    const binding = createParallaxBinding({ atlas: a, tables, view });
    view.offsetX[0] = 5.5;
    view.y[1] = 20.4;
    binding.sync(view);
    const [far, mid] = binding.containers;
    expect([far.x, far.y]).toEqual([-5, PLAYFIELD_Y]);
    expect([mid.x, mid.y]).toEqual([0, PLAYFIELD_Y + 20]);
    const sprites = far.children as Sprite[];
    expect(sprites.map((s) => s.x).slice(0, 3)).toEqual([0, 16, 32]);
    expect(sprites.every((s) => s.visible && s.texture === a.textures[tables.base[1]])).toBe(true);
    // An unknown sprite id draws the missing frame instead of nothing.
    expect((mid.children[0] as Sprite).texture).toBe(a.textures[a.missingFrame]);
  });

  it('rejects bands off the background layers or with a bad spacing', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const onTerrain = {
      ...parallaxView(),
      layer: new Uint8Array([LayerId.Terrain, LayerId.BgMid]),
    };
    expect(() => createParallaxBinding({ atlas: a, tables, view: onTerrain })).toThrow(RangeError);
    const zero = { ...parallaxView(), spacing: new Uint16Array([0, 16]) };
    expect(() => createParallaxBinding({ atlas: a, tables, view: zero })).toThrow(RangeError);
  });

  it('syncs without allocating', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = parallaxView();
    const binding = createParallaxBinding({ atlas: a, tables, view });
    const bytes = measureHeapGrowth(
      (tick) => {
        view.offsetX[0] = (tick * 0.25) % 16;
        view.offsetX[1] = (tick * 0.5) % 128;
        binding.sync(view);
      },
      10_000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(256 * 1024);
  });
});
