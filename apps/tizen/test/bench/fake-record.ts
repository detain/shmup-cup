/**
 * Fake TV render-bench records for the bench's tests (plan R0-02).
 *
 * @module
 */
import type { RenderBenchRecord } from '@shmup/shell';
import { BENCH_SCENARIOS } from '../../src/bench/index.js';

/**
 * A complete fake record.
 *
 * @param over - What differs from the neutral 384×216 busy record.
 * @returns The record.
 */
export function fakeRecord(over: Partial<RenderBenchRecord> = {}): RenderBenchRecord {
  return {
    scenario: '384x216-busy',
    index: 0,
    size: '384x216',
    width: 384,
    height: 216,
    density: 1,
    variant: 'busy',
    crt: 'off',
    filter: false,
    mode7: false,
    webGLVersion: 1,
    displayWidth: 1920,
    displayHeight: 1080,
    scale: 5,
    phaseMs: [10_000, 14_000, 6_000],
    frames: 840,
    syncedFrames: 360,
    renderMs: [1, 2, 2.5, 6],
    syncedMs: [2, 3.25, 4, 9],
    frameMs: [12, 16.7, 30, 40],
    raf: [0, 0, 90, 5, 0, 3, 1, 1],
    tickFrames: [0, 99, 1, 0],
    twoTickShare: 0.01,
    drawCalls: 12,
    rebuilds: 1,
    renderTargetBytes: 0,
    frameTargetBytes: 384 * 216 * 4,
    textureBytes: 1024 * 1024 * 4,
    atlasPages: 1,
    heapMeasured: true,
    heapStartBytes: 1_000_000,
    heapEndBytes: 1_012_345,
    heapDeltaBytes: 12_345,
    load: { bullets: 512, points: 512, enemies: 64, particles: 500, tiles: 400 },
    endedAt: 1_700_000_000_000,
    ...over,
  };
}

/**
 * A complete fake record of one scenario of the matrix.
 *
 * @param index - Scenario index.
 * @param over - What else differs.
 * @returns The record.
 */
export function recordFor(index: number, over: Partial<RenderBenchRecord> = {}): RenderBenchRecord {
  const scenario = BENCH_SCENARIOS[index];
  return fakeRecord({
    scenario: scenario.id,
    index,
    size: scenario.size.id,
    width: scenario.size.width,
    height: scenario.size.height,
    density: scenario.size.density,
    variant: scenario.variant.id,
    crt: scenario.variant.crt,
    filter: scenario.variant.filter,
    mode7: scenario.variant.mode7,
    ...over,
  });
}
