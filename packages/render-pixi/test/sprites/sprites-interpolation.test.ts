/**
 * Render interpolation of sprite bindings and parallax bands (plan M2-08, decision D32): between
 * the previous and the current tick by `alpha`, only for slots that kept their sprite and moved
 * little, history shifted per tick and reset on jumps — and no allocation per frame.
 */
import {
  LayerId,
  PLAYFIELD_Y,
  createSpriteBatch,
  pushSprite,
  type ParallaxView,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createParallaxBinding } from '../../src/layers/index.js';
import {
  INTERPOLATION_MAX_STEP,
  createSpriteLayerBinding,
  createSpriteTables,
} from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** Sprite names: 0 = ships/a (anchor 8, 4), 1 = bg/tile (anchor 0, 0). */
const NAMES = ['ships/a', 'bg/tile'];

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

describe('render-pixi/sprites syncInterpolated', () => {
  it('draws between the previous and the current tick by alpha', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 4,
      layer: LayerId.AirEnemies,
    });
    const batch = createSpriteBatch(LayerId.AirEnemies, 4);
    const sprite = binding.container.children[0];
    pushSprite(batch, 100, 50, 1, 0);
    // First call: history reset, drawn where it is.
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0.5, advance: -1 });
    expect([sprite.x, sprite.y]).toEqual([100, 50 + PLAYFIELD_Y]);
    // One tick later it moved 8 px right: alpha 0 → previous, 0.5 → half-way, 1 → current.
    batch.x[0] = 108;
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0, advance: 1 });
    expect(sprite.x).toBe(100);
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0.5, advance: 0 });
    expect(sprite.x).toBe(104);
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 1, advance: 0 });
    expect(sprite.x).toBe(108);
    // The camera given is used as is (the renderer passes the interpolated one).
    binding.syncInterpolated(batch, { x: 2.5, y: 1 }, { alpha: 0.5, advance: 0 });
    expect([sprite.x, sprite.y]).toEqual([Math.round(104 - 2.5), 49 + PLAYFIELD_Y]);
  });

  it('draws a slot where it is when its sprite changed or it jumped', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 4,
      layer: LayerId.AirEnemies,
    });
    const batch = createSpriteBatch(LayerId.AirEnemies, 4);
    pushSprite(batch, 100, 50, 1, 0);
    pushSprite(batch, 200, 50, 1, 0);
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0, advance: -1 });
    // Slot 0 now holds another sprite (a pool reused it); slot 1 teleported.
    batch.spriteId[0] = 0;
    batch.x[0] = 104;
    batch.x[1] = 200 + INTERPOLATION_MAX_STEP + 1;
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0.5, advance: 1 });
    const [first, second] = binding.container.children;
    expect(first.x).toBe(104 - a.anchorX[a.spriteBase('ships/a')]);
    expect(second.x).toBe(200 + INTERPOLATION_MAX_STEP + 1);
    // A new slot (none a tick ago) is drawn where it is too.
    pushSprite(batch, 300, 60, 1, 0);
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0.5, advance: 1 });
    expect(binding.container.children[2].x).toBe(300);
    expect(binding.visibleCount).toBe(3);
  });

  it('resets its history on a jump of several ticks and hides slots past the count', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 4,
      layer: LayerId.AirEnemies,
    });
    const batch = createSpriteBatch(LayerId.AirEnemies, 4);
    pushSprite(batch, 100, 50, 1, 0);
    pushSprite(batch, 120, 50, 1, 0);
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0, advance: -1 });
    batch.x[0] = 110;
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0, advance: 3 });
    expect(binding.container.children[0].x).toBe(110);
    batch.count = 1;
    binding.syncInterpolated(batch, { x: 0, y: 0 }, { alpha: 0, advance: 1 });
    expect(binding.container.children[1].visible).toBe(false);
  });

  it('interpolates a moving batch without allocating', () => {
    const a = atlas();
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 64,
      layer: LayerId.EnemyBullets,
    });
    const batch = createSpriteBatch(LayerId.EnemyBullets, 64);
    for (let i = 0; i < 64; i++) pushSprite(batch, i * 5, 40, 1, 0);
    const camera = { x: 0, y: 0 };
    const blend = { alpha: 0, advance: -1 };
    binding.syncInterpolated(batch, camera, blend);
    const bytes = measureHeapGrowth(
      (frame) => {
        const tick = frame >> 1;
        if ((frame & 1) === 0) for (let i = 0; i < 64; i++) batch.x[i] = (i * 5 + tick * 1.5) % 400;
        camera.x = tick * 0.75;
        camera.y = 0.25;
        blend.alpha = (frame & 1) * 0.5;
        blend.advance = (frame & 1) === 0 ? 1 : 0;
        binding.syncInterpolated(batch, camera, blend);
      },
      5000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(64 * 1024);
  });
});

describe('render-pixi/layers parallax syncInterpolated', () => {
  /**
   * A one-band view.
   *
   * @returns The view (writable arrays).
   */
  function band(): ParallaxView & { offsetX: Float64Array; y: Float64Array } {
    return {
      count: 1,
      layer: new Uint8Array([LayerId.BgFar]),
      spriteId: new Uint16Array([1]),
      offsetX: new Float64Array(1),
      y: new Float64Array(1),
      spacing: new Uint16Array([16]),
    };
  }

  it('blends the offset the short way round the repeat seam and the row', () => {
    const a = atlas();
    const view = band();
    const binding = createParallaxBinding({ atlas: a, tables: createSpriteTables(a, NAMES), view });
    const container = binding.containers[0];
    view.offsetX[0] = 14;
    view.y[0] = 10;
    binding.syncInterpolated(view, { alpha: 0.5, advance: -1 });
    expect([container.x, container.y]).toEqual([-14, 10 + PLAYFIELD_Y]);
    // Next tick the band wrapped from 14 to 2 (moved +4 across the seam) and panned down 2 px.
    view.offsetX[0] = 2;
    view.y[0] = 12;
    binding.syncInterpolated(view, { alpha: 0.5, advance: 1 });
    // Half-way: offset 16, i.e. 0 again (wrapped into the repeat).
    expect([container.x + 0, container.y]).toEqual([0, 11 + PLAYFIELD_Y]);
    binding.syncInterpolated(view, { alpha: 1, advance: 0 });
    expect(container.x).toBe(-2);
    // A jump resets: drawn at the current offset whatever alpha says.
    view.offsetX[0] = 8;
    binding.syncInterpolated(view, { alpha: 0.25, advance: 5 });
    expect(container.x).toBe(-8);
    // The plain sync still draws the current offset.
    binding.sync(view);
    expect(container.x).toBe(-8);
  });

  it('interpolates without allocating', () => {
    const a = atlas();
    const view = band();
    const binding = createParallaxBinding({ atlas: a, tables: createSpriteTables(a, NAMES), view });
    const blend = { alpha: 0, advance: -1 };
    // A long warm-up (20,000 frames): after the file's other tests, the probe's default 2,000 left
    // V8 still tiering up during the measured windows — 47–71 KB, one run in ten over the budget
    // even alone on an idle machine — where the settled code measures a steady ~40 KB.
    const bytes = measureHeapGrowth(
      (frame) => {
        const tick = frame >> 1;
        view.offsetX[0] = (tick * 0.3) % 16;
        view.y[0] = (tick * 0.1) % 5;
        blend.alpha = (frame & 1) * 0.5;
        blend.advance = (frame & 1) === 0 ? 1 : 0;
        binding.syncInterpolated(view, blend);
      },
      5000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
