/**
 * Allocation guard of the debug overlay (plan M1-19, own file — the guard is sensitive to what
 * other suites leave behind): a frame with the panel, the frame graph, the grid and 200 bullet
 * outlines scrolling through the view (so outlines come and go and numbers change) allocates
 * nothing — every list draws in one colour, so no quad is ever re-tinted.
 */
import {
  EMPTY_CONTENT_DB,
  createDebugCounters,
  createDebugFlags,
  createWorld,
  resolveGameConfig,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAtlas } from '../../src/atlas/index.js';
import { createDebugOverlay } from '../../src/debug/index.js';
import { createLayerStack } from '../../src/layers/index.js';
import { measureAllocation, pageImages, testManifest } from '../helpers.js';

describe('render-pixi/debug overlay allocation', () => {
  it('updates every frame without allocating', () => {
    const manifest = testManifest();
    const overlay = createDebugOverlay({
      atlas: createAtlas(manifest, pageImages(manifest), { onWarning: () => {} }),
      layers: createLayerStack(),
    });
    const w = createWorld(resolveGameConfig({ seed: 1 }), EMPTY_CONTENT_DB);
    for (let i = 0; i < 200; i++) w.bullets.spawn(1000 + i * 1.7, 30 + (i % 150), 0, 0, 0);
    const flags = createDebugFlags();
    flags.overlay = true;
    flags.showHitboxes = true;
    flags.showGrid = true;
    const counters = createDebugCounters();
    const bytes = measureAllocation((i) => {
      overlay.stats.fps = 60 - (i & 3);
      overlay.stats.tickMs = (i & 7) * 0.13;
      overlay.graph.push(16 + (i & 1));
      counters.rngCalls = i;
      w.camera.x = 1000 + (i & 63);
      overlay.update(w, flags, counters);
    }, 2000);
    expect(bytes).toBeLessThan(96 * 1024);
  }, 60_000);
});
