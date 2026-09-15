/**
 * Bending laser drawing (plan M2-02), headless over the test atlas: one preallocated, never-rotated
 * segment sprite per ring node of every slot, placed on the body's nodes (anchor-adjusted,
 * camera-relative, whole pixels), tail first so the head draws on top; inactive / hidden slots and
 * shrinking bodies hide their sprites; validation; allocation-free syncs.
 */
import {
  PLAYFIELD_Y,
  SpriteFlag,
  createStageCamera,
  type BendingLaserView,
  type StageCamera,
} from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createBendingLaserBinding } from '../../src/layers/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** Sprite names: 0 = ships/a (16×9 frames, anchor 8,4). */
const NAMES = ['ships/a', 'bg/tile'];

/**
 * A camera at a position.
 *
 * @param x - World x.
 * @param y - World y.
 * @returns The camera.
 */
function cameraAt(x: number, y: number): StageCamera {
  const camera = createStageCamera();
  camera.x = x;
  camera.y = y;
  return camera;
}

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** A writable bending laser view. */
type View = BendingLaserView & {
  active: Uint8Array;
  filled: Int32Array;
  head: Int32Array;
  width: Float64Array;
  spriteId: Uint16Array;
  flags: Uint8Array;
  x: Float64Array;
  y: Float64Array;
};

/**
 * A view of `capacity` slots of `nodes` nodes.
 *
 * @param capacity - Slots.
 * @param nodes - Nodes per slot (a power of two).
 * @returns The view.
 */
function view(capacity: number, nodes: number): View {
  return {
    capacity,
    nodes,
    active: new Uint8Array(capacity),
    filled: new Int32Array(capacity),
    head: new Int32Array(capacity),
    width: new Float64Array(capacity),
    spriteId: new Uint16Array(capacity),
    flags: new Uint8Array(capacity),
    x: new Float64Array(capacity * nodes),
    y: new Float64Array(capacity * nodes),
  };
}

describe('render-pixi/layers bending laser binding', () => {
  it('draws the newest `filled` nodes of each active slot, tail first, the head on top', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const binding = createBendingLaserBinding({ atlas: a, tables, capacity: 2, nodes: 4 });
    expect(binding.container.children).toHaveLength(8);
    const v = view(2, 4);
    v.active[1] = 1;
    v.filled[1] = 3;
    v.head[1] = 0; // nodes 0 (head), 3, 2 (tail) — the ring wrapped
    for (let k = 0; k < 4; k++) {
      v.x[4 + k] = 100 + k * 10;
      v.y[4 + k] = 50 + k;
    }
    binding.sync(v, cameraAt(20.4, 0));
    const sprites = binding.container.children as Sprite[];
    const base = tables.base[0];
    const shown = sprites.slice(4, 8).map((s) => [s.visible, s.x, s.y]);
    // ax = 8, ay = 4: x = round(x − 20.4) − 8, y = round(y) + PLAYFIELD_Y − 4.
    expect(shown).toEqual([
      [true, 120 - 20 - 8, 52 + PLAYFIELD_Y - 4], // node 2 (tail)
      [true, 130 - 20 - 8, 53 + PLAYFIELD_Y - 4], // node 3
      [true, 100 - 20 - 8, 50 + PLAYFIELD_Y - 4], // node 0 (head, drawn last)
      [false, 0, 0],
    ]);
    expect(sprites[4].texture).toBe(a.textures[base]);
    expect(sprites.slice(0, 4).every((s) => !s.visible)).toBe(true);
    expect(binding.visibleCount).toBe(3);
  });

  it('hides a shrinking body’s extra sprites, hidden and inactive slots, and clamps to its nodes', () => {
    const a = atlas();
    const binding = createBendingLaserBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 1,
      nodes: 4,
    });
    const v = view(1, 4);
    v.active[0] = 1;
    v.filled[0] = 9; // more than the ring: clamped
    binding.sync(v, cameraAt(0, 0));
    const sprites = binding.container.children as Sprite[];
    expect(sprites.filter((s) => s.visible)).toHaveLength(4);
    v.filled[0] = 2;
    binding.sync(v, cameraAt(0, 0));
    expect(sprites.map((s) => s.visible)).toEqual([true, true, false, false]);
    v.flags[0] = SpriteFlag.Hidden;
    binding.sync(v, cameraAt(0, 0));
    expect(sprites.some((s) => s.visible)).toBe(false);
    v.flags[0] = 0;
    v.active[0] = 0;
    binding.sync(v, cameraAt(0, 0));
    expect(binding.visibleCount).toBe(0);
    binding.destroy();
    expect(binding.container.destroyed).toBe(true);
  });

  it('rejects bad capacities and node counts', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    expect(() => createBendingLaserBinding({ atlas: a, tables, capacity: 0, nodes: 4 })).toThrow(
      RangeError,
    );
    expect(() => createBendingLaserBinding({ atlas: a, tables, capacity: 1, nodes: 1.5 })).toThrow(
      RangeError,
    );
  });

  it('syncs a moving body without allocating', () => {
    const a = atlas();
    const binding = createBendingLaserBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 8,
      nodes: 64,
    });
    const v = view(8, 64);
    for (let s = 0; s < 8; s++) {
      v.active[s] = 1;
      v.filled[s] = 40;
    }
    const camera = cameraAt(0.5, 0);
    const bytes = measureHeapGrowth(
      (i) => {
        for (let s = 0; s < 8; s++) {
          v.head[s] = (v.head[s] + 1) & 63;
          v.x[s * 64 + v.head[s]] = 100 + (i % 200) * 0.7;
          v.y[s * 64 + v.head[s]] = 20 + s * 20 + (i % 13) * 0.3;
          v.filled[s] = 20 + ((i + s) % 40);
        }
        camera.x = (i % 50) * 0.5;
        binding.sync(v, camera);
      },
      5000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
