/**
 * The hitbox markers of the "show hitbox" option (plan M2-08): a white core the size of the hurt
 * circle inside a 1-px rim, centred on the ship on screen; unused slots hidden; no allocation.
 */
import { PLAYFIELD_Y, createHitboxBatch } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { HITBOX_CORE_TINT, HITBOX_RIM_TINT, createHitboxBinding } from '../../src/layers/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

describe('render-pixi/layers hitbox markers', () => {
  it('draws a rimmed core per live hurtbox at the camera-converted centre', () => {
    const binding = createHitboxBinding({ atlas: atlas(), capacity: 2 });
    const view = createHitboxBatch(2);
    view.x[0] = 100.4;
    view.y[0] = 50;
    view.radius[0] = 1.5;
    view.x[1] = 200;
    view.y[1] = 60;
    view.radius[1] = 0.75;
    view.count = 2;
    binding.sync(view, { x: 10, y: 0 });
    const [rim0, core0, rim1, core1] = binding.container.children as Sprite[];
    expect([rim0.tint, core0.tint]).toEqual([HITBOX_RIM_TINT, HITBOX_CORE_TINT]);
    // Radius 1.5 → a 3-px core at (90 − 1, 50 + 8 − 1), a 5-px rim around it.
    expect([core0.x, core0.y, core0.scale.x, core0.scale.y]).toEqual([
      89,
      57 + PLAYFIELD_Y - 8,
      3,
      3,
    ]);
    expect([rim0.x, rim0.y, rim0.scale.x]).toEqual([88, 56 + PLAYFIELD_Y - 8, 5]);
    // Below 1 px: a 1-px core.
    expect([core1.x, core1.scale.x, rim1.scale.x]).toEqual([190, 1, 3]);
    expect(binding.visibleCount).toBe(2);
    view.count = 1;
    binding.sync(view, { x: 10, y: 0 });
    expect([rim1.visible, core1.visible, core0.visible]).toEqual([false, false, true]);
    expect(binding.visibleCount).toBe(1);
  });

  it('refuses a bad capacity and syncs without allocating', () => {
    const a = atlas();
    expect(() => createHitboxBinding({ atlas: a, capacity: 0 })).toThrow(RangeError);
    const binding = createHitboxBinding({ atlas: a, capacity: 2 });
    const view = createHitboxBatch(2);
    view.count = 2;
    const camera = { x: 0, y: 0 };
    const bytes = measureHeapGrowth(
      (tick) => {
        view.x[0] = 50 + (tick % 100) * 0.7;
        view.y[0] = 80;
        view.radius[0] = 1.5;
        view.x[1] = 150;
        view.y[1] = 90 + (tick % 7) * 0.3;
        view.radius[1] = 0.75;
        camera.x = tick * 0.25;
        binding.sync(view, camera);
      },
      5000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
