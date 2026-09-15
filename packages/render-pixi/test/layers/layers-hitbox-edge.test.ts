/**
 * Edge cases of the hitbox markers (plan M2-08), next to `layers-hitbox.test.ts`: marker sizes for
 * every radius (0, fractions, NaN, whole numbers), a count above the capacity, the y offset option,
 * a fractional capacity refused, `destroy`; and `syncInterpolated` (the fix that keeps the marker on
 * the interpolated ship): blended between the last two ticks by alpha, the history shifted per tick,
 * reset on a jump or the first call, a marker that moved more than `INTERPOLATION_MAX_STEP` or is new
 * drawn where it is, alpha clamped, and no allocation.
 */
import { PLAYFIELD_Y, createHitboxBatch } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createHitboxBinding } from '../../src/layers/index.js';
import { INTERPOLATION_MAX_STEP } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * Centre of a marker (its core's middle pixel) and its core size.
 *
 * @param children - The binding's sprites (rim, core per slot).
 * @param slot - The slot.
 * @returns `[x, y, size]`.
 */
function marker(children: Sprite[], slot: number): number[] {
  const core = children[2 * slot + 1];
  const half = (core.scale.x - 1) / 2;
  return [core.x + half, core.y + half, core.scale.x];
}

describe('render-pixi/layers hitbox markers (edges)', () => {
  it('sizes the core 2·floor(radius) + 1, and 1 px for 0, fractions below 1 and NaN', () => {
    const binding = createHitboxBinding({ atlas: atlas(), capacity: 6 });
    const view = createHitboxBatch(6);
    const radii = [0, 0.99, 1, 2.99, 3, Number.NaN];
    radii.forEach((radius, i) => {
      view.x[i] = 20 * i;
      view.y[i] = 30;
      view.radius[i] = radius;
    });
    view.count = 6;
    binding.sync(view, { x: 0, y: 0 });
    const sprites = binding.container.children as Sprite[];
    expect(radii.map((_r, i) => marker(sprites, i)[2])).toEqual([1, 1, 3, 5, 7, 1]);
    // The rim is always one pixel around the core.
    for (let i = 0; i < 6; i++) {
      const rim = sprites[2 * i];
      const core = sprites[2 * i + 1];
      expect([rim.x, rim.y, rim.scale.x, rim.scale.y]).toEqual([
        core.x - 1,
        core.y - 1,
        core.scale.x + 2,
        core.scale.y + 2,
      ]);
    }
  });

  it('draws at most its capacity, honours the y offset and destroys its sprites', () => {
    const binding = createHitboxBinding({ atlas: atlas(), capacity: 1, offsetY: 0 });
    const view = createHitboxBatch(3);
    view.x[0] = 10.6;
    view.y[0] = 20.4;
    view.radius[0] = 2;
    view.count = 3;
    binding.sync(view, { x: 0, y: 0 });
    expect(binding.visibleCount).toBe(1);
    expect(marker(binding.container.children as Sprite[], 0)).toEqual([11, 20, 5]);
    expect(() => createHitboxBinding({ atlas: atlas(), capacity: 1.5 })).toThrow(RangeError);
    expect(() => createHitboxBinding({ atlas: atlas(), capacity: -2 })).toThrow(RangeError);
    binding.destroy();
    expect(binding.container.destroyed).toBe(true);
  });
});

describe('render-pixi/layers hitbox markers syncInterpolated', () => {
  it('draws between the previous and the current tick by alpha', () => {
    const binding = createHitboxBinding({ atlas: atlas(), capacity: 2 });
    const view = createHitboxBatch(2);
    view.x[0] = 100;
    view.y[0] = 50;
    view.radius[0] = 1.5;
    view.count = 1;
    const sprites = binding.container.children as Sprite[];
    const camera = { x: 0, y: 0 };
    // First call: nothing to blend from, whatever the advance says.
    binding.syncInterpolated(view, camera, { alpha: 0.5, advance: 1 });
    expect(marker(sprites, 0)).toEqual([100, 50 + PLAYFIELD_Y, 3]);
    view.x[0] = 108;
    view.y[0] = 46;
    binding.syncInterpolated(view, camera, { alpha: 0, advance: 1 });
    expect(marker(sprites, 0).slice(0, 2)).toEqual([100, 50 + PLAYFIELD_Y]);
    binding.syncInterpolated(view, camera, { alpha: 0.5, advance: 0 });
    expect(marker(sprites, 0).slice(0, 2)).toEqual([104, 48 + PLAYFIELD_Y]);
    binding.syncInterpolated(view, camera, { alpha: 1, advance: 0 });
    expect(marker(sprites, 0).slice(0, 2)).toEqual([108, 46 + PLAYFIELD_Y]);
    // The next tick blends from 108, not from 100.
    view.x[0] = 110;
    binding.syncInterpolated(view, { x: 1, y: 0 }, { alpha: 0.5, advance: 1 });
    expect(marker(sprites, 0)[0]).toBe(109 - 1);
    // Alpha outside 0 … 1 (and NaN) is clamped.
    binding.syncInterpolated(view, camera, { alpha: 7, advance: 0 });
    expect(marker(sprites, 0)[0]).toBe(110);
    binding.syncInterpolated(view, camera, { alpha: Number.NaN, advance: 0 });
    expect(marker(sprites, 0)[0]).toBe(108);
    // The plain sync still draws the current tick.
    binding.sync(view, camera);
    expect(marker(sprites, 0)[0]).toBe(110);
  });

  it('resets on a jump of ticks and draws jumped or new markers where they are', () => {
    const binding = createHitboxBinding({ atlas: atlas(), capacity: 2 });
    const view = createHitboxBatch(2);
    view.x[0] = 100;
    view.y[0] = 50;
    view.radius[0] = 1;
    view.count = 1;
    const sprites = binding.container.children as Sprite[];
    const camera = { x: 0, y: 0 };
    binding.syncInterpolated(view, camera, { alpha: 0, advance: -1 });
    view.x[0] = 110;
    binding.syncInterpolated(view, camera, { alpha: 0, advance: 4 });
    expect(marker(sprites, 0)[0]).toBe(110);
    // A step of exactly INTERPOLATION_MAX_STEP is blended; one more pixel (on y) is not.
    view.x[0] = 110 + INTERPOLATION_MAX_STEP;
    binding.syncInterpolated(view, camera, { alpha: 0.5, advance: 1 });
    expect(marker(sprites, 0)[0]).toBe(110 + INTERPOLATION_MAX_STEP / 2);
    view.y[0] = 50 - INTERPOLATION_MAX_STEP - 1;
    binding.syncInterpolated(view, camera, { alpha: 0.5, advance: 1 });
    expect(marker(sprites, 0).slice(0, 2)).toEqual([
      110 + INTERPOLATION_MAX_STEP,
      50 - INTERPOLATION_MAX_STEP - 1 + PLAYFIELD_Y,
    ]);
    // Player 2 appears: its marker had no previous tick.
    view.x[1] = 200;
    view.y[1] = 90;
    view.radius[1] = 1;
    view.count = 2;
    binding.syncInterpolated(view, camera, { alpha: 0.5, advance: 1 });
    expect(marker(sprites, 1).slice(0, 2)).toEqual([200, 90 + PLAYFIELD_Y]);
    expect(binding.visibleCount).toBe(2);
    // And leaves again: its sprites are hidden.
    view.count = 1;
    binding.syncInterpolated(view, camera, { alpha: 0.5, advance: 1 });
    expect([sprites[2].visible, sprites[3].visible, binding.visibleCount]).toEqual([
      false,
      false,
      1,
    ]);
  });

  it('interpolates without allocating', () => {
    const binding = createHitboxBinding({ atlas: atlas(), capacity: 2 });
    const view = createHitboxBatch(2);
    view.count = 2;
    view.radius[0] = 1.5;
    view.radius[1] = 0.5;
    const camera = { x: 0, y: 0 };
    const blend = { alpha: 0, advance: -1 };
    const bytes = measureHeapGrowth(
      (frame) => {
        const tick = frame >> 1;
        if ((frame & 1) === 0) {
          view.x[0] = 50 + (tick % 100) * 0.7;
          view.y[0] = 80 + (tick % 13) * 0.3;
          view.x[1] = 150 - (tick % 50) * 0.9;
          view.y[1] = 90;
        }
        camera.x = tick * 0.75;
        blend.alpha = (frame & 1) * 0.5;
        blend.advance = (frame & 1) === 0 ? 1 : 0;
        binding.syncInterpolated(view, camera, blend);
      },
      5000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
