/**
 * Allocation guard of the debug overlay (plan M1-19, own file — the guard is sensitive to what
 * other suites leave behind): a frame with the panel, the frame graph, the grid and 200 bullet
 * outlines scrolling through the view (so outlines come and go and numbers change) allocates
 * nothing — every list draws in one colour, so no quad is ever re-tinted.
 *
 * The guard measures a **second** overlay, after a throwaway one has run a few thousand frames, so
 * the shared code has tiered up before the measured windows. It used to fail now and then (352
 * bytes per frame, mostly when other test processes ran in parallel): the quad pool assigned every
 * quad's `alpha / 255` each frame, and the 22 translucent quads here (the panel backdrop, the
 * graph guides, the grid lines) each boxed that fractional number whenever V8 had not inlined
 * Pixi's `alpha` setter. The pool now writes an alpha only when it changes.
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
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/**
 * Measures one fresh overlay (on a test atlas, over a World with 200 bullets, every switch on): the
 * host's stats, the frame graph, the counters, a scrolling camera and `update` per frame.
 *
 * @param warmUp - Unmeasured frames first.
 * @param rounds - Measured windows of 2,000 frames (the steadiest counts).
 * @returns Estimated bytes allocated by 2,000 frames.
 */
function measureOverlay(warmUp: number, rounds: number): number {
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
  const bytes = measureHeapGrowth(
    (i) => {
      overlay.stats.fps = 60 - (i & 3);
      overlay.stats.tickMs = (i & 7) * 0.13;
      overlay.graph.push(16 + (i & 1));
      counters.rngCalls = i;
      w.camera.x = 1000 + (i & 63);
      overlay.update(w, flags, counters);
    },
    2000,
    warmUp,
    rounds,
  ).bytes;
  // Not destroyed: destroying Pixi objects mid-file changes their shapes (what the throwaway run
  // is there to settle).
  return bytes;
}

describe('render-pixi/debug overlay allocation', () => {
  it('updates every frame without allocating', () => {
    measureOverlay(500, 1); // the throwaway overlay (see the module docs)
    expect(measureOverlay(2000, 3)).toBeLessThan(96 * 1024);
  }, 60_000);
});
