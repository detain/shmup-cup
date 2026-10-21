/**
 * R3-06.L3 allocation guards: the per-frame paths a decor world touches — a three-band parallax
 * sync and sync-interpolated sync (the fore band carries a cycling `frameIndex` so the frame
 * resolve runs every call, and the band `y` moves as core's `yFactor` painting moves it) and a
 * decor sprite-layer binding whose slots are rewritten each tick — must stay allocation-free per
 * the guard rules (docs/dev/conventions.md § Performance). The work is the bindings' own syncs;
 * the fixture arrays are built once outside the measured loop.
 */
import {
  LayerId,
  PLAYFIELD_W,
  createSpriteBatch,
  pushSprite,
  type ParallaxView,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createParallaxBinding } from '../../src/layers/index.js';
import {
  createSpriteLayerBinding,
  createSpriteTables,
  type RenderBlend,
} from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** The frame blend the interpolated syncs see (one object, reused — the renderer's own shape). */
const BLEND: RenderBlend = { alpha: 0.5, advance: 1 };

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

describe('render-pixi/layers decor syncs allocate nothing', () => {
  it('a three-band parallax sync with cycling frames and moving rows', () => {
    const a = atlas();
    const tables = createSpriteTables(a, ['ships/a', 'bg/tile', 'ghost']);
    const view: ParallaxView & { offsetX: Float64Array; y: Float64Array } = {
      count: 3,
      layer: new Uint8Array([LayerId.BgFar, LayerId.BgMid, LayerId.Foreground]),
      spriteId: new Uint16Array([1, 1, 0]),
      offsetX: new Float64Array([0, 0, 0]),
      y: new Float64Array([0, 12, 4]),
      spacing: new Uint16Array([16, 128, 32]),
      frameIndex: new Uint8Array([0, 0, 0]),
    };
    const binding = createParallaxBinding({ atlas: a, tables, view });
    const bytes = measureHeapGrowth(
      (tick) => {
        view.offsetX[0] = (tick * 0.25) % 16;
        view.offsetX[1] = (tick * 0.5) % 128;
        view.offsetX[2] = (tick * 1.5) % 32;
        view.y[1] = 12 - ((tick * 0.0625) % 64);
        view.y[2] = 4 - ((tick * 0.375) % 96);
        (view.frameIndex as Uint8Array)[2] = tick % 4;
        binding.sync(view);
        binding.syncInterpolated(view, BLEND);
      },
      10_000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(256 * 1024);
  });

  it('a decor sprite-layer binding sync and interpolated sync over rewritten slots', () => {
    const a = atlas();
    const tables = createSpriteTables(a, ['ships/a', 'bg/tile', 'ghost']);
    const batch = createSpriteBatch(LayerId.DecorFront, 16);
    const binding = createSpriteLayerBinding({
      atlas: a,
      tables,
      capacity: batch.capacity,
      layer: LayerId.DecorFront,
    });
    const camera: { x: number; y: number } = { x: 0, y: 0 };
    const bytes = measureHeapGrowth(
      (tick) => {
        // The cull rewrites the live slots every tick: count cycles 2…7 (bounded work per
        // frame), positions sweep the view under a camera that grows with the index.
        batch.count = 0;
        const n = 2 + (tick % 6);
        for (let k = 0; k < n; k++) {
          pushSprite(batch, (tick + k * 64) % PLAYFIELD_W, 24 + (((tick / 4) | 0) % 96), 1, 0);
        }
        camera.x = tick * 0.5;
        camera.y = 0;
        binding.sync(batch, camera.x, camera.y);
        binding.syncInterpolated(batch, camera, BLEND);
      },
      10_000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(256 * 1024);
  });
});
