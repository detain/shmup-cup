/**
 * Allocation guard of the debug panel's frame-pacing line (plan M3-02b; own file — the guards are
 * sensitive to what other suites leave behind, docs/dev/conventions.md): the panel is rebuilt every
 * frame with the ticks-per-frame counters and a live rAF-delta histogram, so
 * {@link buildRafHistogram}'s eight bars and the four `TPF` numbers must cost nothing.
 *
 * The histogram's bars are drawn with a translucent alpha and a height scaled to the busiest
 * bucket — both fractional-looking values that a lower V8 tier would box if they ever left the
 * integer domain. The counters really move every frame here (as they do on the TV), so a bar's
 * height, colour and the numbers beside it are new on every call.
 */
import { createDebugCounters, createDebugFlags } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  RAF_BUCKETS,
  buildDebugPanel,
  buildRafHistogram,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  rafDeltaBucket,
} from '../../src/debug/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** The M7's measured rAF deltas, cycled so every bucket is hit (finding 8). */
const DELTAS = [16.7, 16.6, 12.1, 21.3, 16.5, 30.2, 33.4, 14.0, 18.5, 24.9, 11.5, 40.0];

/**
 * Measures one fresh panel rebuilt per frame, with the pacing counters moving like on the TV.
 *
 * @param warmUp - Unmeasured frames first.
 * @param rounds - Measured windows of 2,000 frames (the steadiest counts).
 * @returns Bytes allocated by 2,000 frames.
 */
function measurePanel(warmUp: number, rounds: number): number {
  const panel = createDebugPanelLists('a1b2c3d');
  const stats = createDebugOverlayStats();
  const counters = createDebugCounters();
  const flags = createDebugFlags();
  const graph = createFrameGraph();
  return measureHeapGrowth(
    (i) => {
      const delta = DELTAS[i % DELTAS.length];
      stats.rafHistogram[rafDeltaBucket(delta)]++;
      stats.tickFrames[i % 4]++;
      stats.vsyncLock = (i & 32) === 0;
      stats.fps = 60 - (i & 3);
      graph.push(delta);
      buildDebugPanel(panel, stats, counters, flags, graph);
    },
    2000,
    warmUp,
    rounds,
  ).bytes;
}

describe('render-pixi/debug frame-pacing allocation', () => {
  it('rebuilds the pacing line every frame without allocating', () => {
    measurePanel(500, 1); // a throwaway panel first (see the module docs)
    expect(measurePanel(4000, 3)).toBeLessThan(64 * 1024);
  }, 60_000);

  it('draws the histogram alone without allocating', () => {
    const list = createDebugPanelLists('x').pacing;
    const buckets = new Int32Array(RAF_BUCKETS);
    const warm = (n: number, rounds: number): number =>
      measureHeapGrowth(
        (i) => {
          buckets[i % RAF_BUCKETS]++;
          buildRafHistogram(list, buckets, 40, 90);
        },
        20_000,
        n,
        rounds,
      ).bytes;
    warm(20_000, 1);
    expect(warm(40_000, 3)).toBeLessThan(32 * 1024);
  }, 60_000);
});
