/**
 * Edge cases of the terrain and parallax bindings (plan M1-07), headless over the test atlas:
 *
 * - the terrain ring after a long random camera walk (steps both ways, sub-pixel moves, vertical
 *   pans, jumps) always shows exactly what a freshly built binding shows at the same camera, and
 *   every map cell in view sits in its ring slot with the right texture and position;
 * - how many cells a sync re-textures when crossing two columns at once, one column backwards,
 *   a column and a row together; custom width / height / offsetY options; destroy;
 * - the parallax bands always cover the whole playfield width for any offset and spacing, honour
 *   the width / offsetY options, re-resolve their sprite id on every sync, and syncs with a
 *   moving vertical pan allocate nothing.
 */
import { LayerId, PLAYFIELD_Y, type ParallaxView, type TerrainView } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createParallaxBinding, createTerrainBinding } from '../../src/layers/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** Sprite names: 0 = ships/a (the "tileset", 3 frames), 1 = bg/tile. */
const NAMES = ['ships/a', 'bg/tile'];

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * A pseudo-random terrain view (deterministic LCG): ids 0 … 4, id 4 undrawn.
 *
 * @param cols - Width in tiles.
 * @param rows - Height in tiles.
 * @param seed - Seed.
 * @returns The view.
 */
function randomView(cols: number, rows: number, seed: number): TerrainView {
  let s = seed >>> 0;
  const tiles = new Uint8Array(cols * rows);
  for (let i = 0; i < tiles.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    tiles[i] = (s >>> 16) % 5;
  }
  return {
    tileSize: 8,
    cols,
    rows,
    tiles,
    tilesetSpriteId: 0,
    tileFrame: new Int16Array([-1, 0, 1, 2, -1]),
  };
}

/** What one grid sprite shows (position and texture only matter while it is visible). */
function state(sprite: Sprite): string {
  return sprite.visible ? `${String(sprite.x)},${String(sprite.y)}:${sprite.texture.uid}` : '-';
}

describe('render-pixi/layers terrain binding edge — the ring', () => {
  it('matches a fresh binding and places every visible map cell after a random walk', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = randomView(300, 40, 7);
    const walker = createTerrainBinding({ atlas: a, tables, view });
    // The reference: synced from far away before every comparison, so every slot is refreshed
    // (what a freshly built binding shows — building 1,274 sprites per step would be slow).
    const fresh = createTerrainBinding({ atlas: a, tables, view });
    const far = { x: 0, y: 0 };
    const camera = { x: 0, y: 0 };
    let s = 99;
    /** @returns A pseudo-random number in [0, 1). */
    const rnd = (): number => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s / 4294967296;
    };
    for (let step = 0; step < 200; step++) {
      const r = rnd();
      if (r < 0.05) {
        camera.x = Math.floor(rnd() * 2200) - 50; // a jump (checkpoint restart), maybe off-map
      } else if (r < 0.5) {
        camera.x += (rnd() - 0.3) * 20; // mostly forward, sometimes back
      } else {
        camera.x += rnd() * 3;
        camera.y = Math.max(0, Math.min(120, camera.y + (rnd() - 0.5) * 12)); // a pan
      }
      walker.sync(view, camera);
      far.x = camera.x + 100_000;
      far.y = camera.y;
      fresh.sync(view, far);
      fresh.sync(view, camera);
      expect(fresh.updatedCells).toBe(fresh.columns * fresh.rows);
      const label = `step ${String(step)} camera ${String(camera.x)},${String(camera.y)}`;
      expect(walker.container.x, label).toBe(fresh.container.x);
      expect(walker.container.y, label).toBe(fresh.container.y);
      const got = (walker.container.children as Sprite[]).map(state);
      const want = (fresh.container.children as Sprite[]).map(state);
      expect(got, label).toEqual(want);
      // Every map cell inside the view sits in its slot (collected, one assertion per step).
      const wrong: string[] = [];
      const c0 = Math.floor(camera.x / 8);
      const c1 = Math.floor((camera.x + 383) / 8);
      const r0 = Math.floor(camera.y / 8);
      const r1 = Math.min(view.rows - 1, Math.floor((camera.y + 199) / 8));
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const sprite = walker.container.children[
            (((row % walker.rows) + walker.rows) % walker.rows) * walker.columns +
              (((col % walker.columns) + walker.columns) % walker.columns)
          ] as Sprite;
          const id = col < 0 || col >= view.cols ? 0 : view.tiles[row * view.cols + col];
          const frame = view.tileFrame[id];
          const ok =
            frame >= 0
              ? sprite.visible &&
                sprite.texture === a.textures[tables.base[0] + frame] &&
                sprite.x === col * 8 - 8 && // the frame's anchor is (8, 4)
                sprite.y === row * 8 - 4
              : !sprite.visible;
          if (!ok) wrong.push(`${String(col)},${String(row)}`);
        }
      }
      expect(wrong, label).toEqual([]);
    }
  });

  it('re-textures 2 columns when crossing two at once, 1 backwards, a column + a row together', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = randomView(200, 40, 3);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    const { columns, rows } = binding;
    expect([columns, rows]).toEqual([49, 26]);
    binding.sync(view, { x: 80, y: 16 });
    binding.sync(view, { x: 96, y: 16 }); // two columns
    expect(binding.updatedCells).toBe(2 * rows);
    binding.sync(view, { x: 95.5, y: 16 }); // one back
    expect(binding.updatedCells).toBe(rows);
    binding.sync(view, { x: 96, y: 24 }); // one column right and one row down
    expect(binding.updatedCells).toBe(rows + columns - 1);
    binding.sync(view, { x: 96, y: 24 });
    expect(binding.updatedCells).toBe(0);
    binding.sync(view, { x: 96 + 49 * 8, y: 24 }); // a whole ring width: everything
    expect(binding.updatedCells).toBe(columns * rows);
  });

  it('sizes the grid from the width / height options and offsets it by offsetY', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = randomView(100, 40, 1);
    const small = createTerrainBinding({
      atlas: a,
      tables,
      view,
      width: 100,
      height: 30,
      offsetY: 3,
    });
    expect([small.columns, small.rows]).toEqual([14, 5]);
    expect(small.container.children).toHaveLength(14 * 5);
    small.sync(view, { x: 10.4, y: 2.6 });
    expect([small.container.x, small.container.y]).toEqual([-10, 3 - 3]);
    const oneRow = createTerrainBinding({ atlas: a, tables, view: randomView(10, 1, 2) });
    expect(oneRow.rows).toBe(1);
  });

  it('destroys its sprites and container', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const binding = createTerrainBinding({ atlas: a, tables, view: randomView(60, 25, 5) });
    const sprite = binding.container.children[0];
    binding.destroy();
    expect(binding.container.destroyed).toBe(true);
    expect(sprite.destroyed).toBe(true);
  });

  it('still reports a sync that allocates one small object per frame (the probe works)', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = randomView(2000, 30, 13);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    const kept: unknown[] = new Array<unknown>(1);
    const bytes = measureHeapGrowth(
      (tick) => {
        const camera = { x: (tick * 1.75) % 15000, y: 0 }; // a fresh object per frame
        binding.sync(view, camera);
        kept[0] = camera;
      },
      10_000,
      2000,
    ).bytes;
    expect(bytes).toBeGreaterThan(10_000 * 16);
  });

  it('syncs a diagonal scroll (column and row crossings) without allocating', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = randomView(2000, 60, 11);
    const binding = createTerrainBinding({ atlas: a, tables, view });
    const camera = { x: 0, y: 0 };
    const bytes = measureHeapGrowth(
      (tick) => {
        camera.x = (tick * 1.75) % 15000;
        camera.y = (tick * 0.35) % 250;
        binding.sync(view, camera);
      },
      10_000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(256 * 1024);
  });
});

describe('render-pixi/layers parallax binding edge', () => {
  /**
   * A parallax view.
   *
   * @param spacings - Spacing per band.
   * @returns The view (writable arrays).
   */
  function bands(
    spacings: number[],
  ): ParallaxView & { offsetX: Float64Array; y: Float64Array; spriteId: Uint16Array } {
    return {
      count: spacings.length,
      layer: new Uint8Array(spacings.map((_, i) => (i % 2 === 0 ? LayerId.BgFar : LayerId.BgMid))),
      spriteId: new Uint16Array(spacings.map(() => 1)),
      offsetX: new Float64Array(spacings.length),
      y: new Float64Array(spacings.length),
      spacing: new Uint16Array(spacings),
    };
  }

  it('covers the whole playfield width for every offset and spacing', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const spacings = [8, 13, 64, 100, 128, 383, 384, 1024];
    const view = bands(spacings);
    const binding = createParallaxBinding({ atlas: a, tables, view });
    for (let b = 0; b < spacings.length; b++) {
      expect(binding.containers[b].children).toHaveLength(Math.ceil(384 / spacings[b]) + 1);
    }
    for (let k = 0; k <= 64; k++) {
      for (let b = 0; b < spacings.length; b++) view.offsetX[b] = ((spacings[b] - 1e-9) * k) / 64;
      binding.sync(view);
      for (let b = 0; b < spacings.length; b++) {
        const container = binding.containers[b];
        const xs = (container.children as Sprite[]).map((sprite) => container.x + sprite.x);
        expect(Math.min(...xs), `band ${String(b)} k ${String(k)}`).toBeLessThanOrEqual(0);
        expect(
          Math.max(...xs) + spacings[b],
          `band ${String(b)} k ${String(k)}`,
        ).toBeGreaterThanOrEqual(384);
        expect(container.x === Math.round(-view.offsetX[b])).toBe(true); // (±0 alike)
      }
    }
  });

  it('honours the width and offsetY options and rounds negative band rows', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = bands([16, 16]);
    const binding = createParallaxBinding({ atlas: a, tables, view, width: 40, offsetY: 5 });
    expect(binding.containers.map((c) => c.children.length)).toEqual([4, 4]);
    view.y[0] = -12.6;
    view.y[1] = 3.5;
    binding.sync(view);
    expect(binding.containers.map((c) => c.y)).toEqual([5 - 13, 5 + 4]);
    const defaults = createParallaxBinding({ atlas: a, tables, view: bands([128]) });
    defaults.sync(bands([128]));
    expect(defaults.containers[0].y).toBe(PLAYFIELD_Y);
  });

  it('re-resolves each band sprite id on every sync', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = bands([16]);
    const binding = createParallaxBinding({ atlas: a, tables, view });
    binding.sync(view);
    const first = binding.containers[0].children[0] as Sprite;
    expect(first.texture).toBe(a.textures[tables.base[1]]);
    view.spriteId[0] = 0;
    binding.sync(view);
    expect(first.texture).toBe(a.textures[tables.base[0]]);
  });

  it('creates nothing for an empty view and destroys its containers', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const empty = createParallaxBinding({ atlas: a, tables, view: bands([]) });
    expect([empty.containers.length, empty.layers.length]).toEqual([0, 0]);
    empty.sync(bands([]));
    const binding = createParallaxBinding({ atlas: a, tables, view: bands([32, 64]) });
    binding.destroy();
    expect(binding.containers.every((c) => c.destroyed)).toBe(true);
  });

  it('syncs a scrolling and panning band set without allocating', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const view = bands([128, 128, 64, 64]);
    const binding = createParallaxBinding({ atlas: a, tables, view });
    const bytes = measureHeapGrowth(
      (tick) => {
        for (let b = 0; b < 4; b++) {
          view.offsetX[b] = (tick * (0.25 + b * 0.25)) % view.spacing[b];
          view.y[b] = ((tick * 0.1) % 40) - 20;
        }
        binding.sync(view);
      },
      10_000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(256 * 1024);
  });
});
