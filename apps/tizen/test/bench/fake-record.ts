/**
 * Fake TV render-bench records for the bench's tests (plan R0-02; the decode record — R1-05 B4;
 * the stand-in record — R3-04.M4a; the rewind record — R2 TL-3).
 *
 * @module
 */
import type { DecodeBenchPage, DecodeBenchRecord, RenderBenchRecord } from '@shmup/shell';
import {
  BENCH_SCENARIOS,
  BENCH_V2_SIZE,
  DECODE_SCENARIO_INDEX,
  REWIND_SCENARIO_ID,
  REWIND_SCENARIO_INDEX,
  REWIND_STAGE,
  STANDIN_SCENARIO_ID,
  STANDIN_SCENARIO_INDEX,
  type RewindBenchRecord,
} from '../../src/bench/index.js';

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
    // A knob row's record names its row (`busy-stretch`), as `run.ts` writes it.
    variant: scenario.row,
    crt: scenario.variant.crt,
    filter: scenario.variant.filter,
    mode7: scenario.variant.mode7,
    ...over,
  });
}

/**
 * A complete fake decode record (plan R1-05 B4; the page ids of plan R3-04.M4a): the pages of the
 * bench build — the stand-in zone A's page, then the shipped `common` and `zone-a` pages — every
 * stage measured.
 *
 * @param over - What differs.
 * @returns The record.
 */
export function fakeDecode(over: Partial<DecodeBenchRecord> = {}): DecodeBenchRecord {
  /**
   * One page's figures, scaled by a cost factor.
   *
   * @param id - Page id.
   * @param width - Pixels.
   * @param height - Pixels.
   * @param encoding - `rgba` / `png8`.
   * @param bytes - File bytes.
   * @param k - Cost factor.
   * @returns The page.
   */
  const page = (
    id: string,
    width: number,
    height: number,
    encoding: string,
    bytes: number,
    k: number,
  ): DecodeBenchPage => ({
    id,
    what: `${id} page`,
    width,
    height,
    encoding,
    bytes,
    textureBytes: width * height * 4,
    repetitions: 8,
    fetchMs: [10 * k, 12 * k, 15 * k, 16 * k],
    decodeMs: [200 * k, 210 * k, 250 * k, 260 * k],
    uploadMs: [40 * k, 45 * k, 60 * k, 61 * k],
    uploadSyncedMs: [50 * k, 55 * k, 70 * k, 72 * k],
    totalMs: [260 * k, 277 * k, 335 * k, 348 * k],
    firstTotalMs: 348 * k,
    bitmapMs: [180 * k, 190 * k, 230 * k, 231 * k],
    bitmapUploadMs: [10 * k, 11 * k, 14 * k, 15 * k],
    error: null,
  });
  return {
    scenario: 'decode',
    index: DECODE_SCENARIO_INDEX,
    webGLVersion: 1,
    repetitions: 8,
    imageDecode: true,
    imageBitmap: true,
    pages: [
      page('standin-zone-a', 2048, 1024, 'png8', 541_135, 2),
      page('common', 1024, 512, 'rgba', 79_640, 0.125),
      page('zone-a', 256, 128, 'png8', 2_534, 0.01),
    ],
    error: null,
    endedAt: 1_700_000_100_000,
    ...over,
  };
}

/**
 * The fake record of the run's stand-in page load (plan R3-04.M4a): one 640×360 frame drawn from
 * the stand-in pages, measured like a render scenario.
 *
 * @param over - What differs.
 * @returns The record.
 */
export function fakeStandinRecord(over: Partial<RenderBenchRecord> = {}): RenderBenchRecord {
  return fakeRecord({
    scenario: STANDIN_SCENARIO_ID,
    index: STANDIN_SCENARIO_INDEX,
    size: '640x360',
    width: 640,
    height: 360,
    density: BENCH_V2_SIZE.density,
    variant: STANDIN_SCENARIO_ID,
    frames: 1,
    syncedFrames: 1,
    twoTickShare: 0,
    drawCalls: 96,
    rebuilds: 1,
    renderTargetBytes: 640 * 360 * 4,
    frameTargetBytes: 640 * 360 * 4,
    textureBytes: 2048 * 1024 * 4,
    atlasPages: 1,
    load: { bullets: 0, points: 0, enemies: 20, particles: 0, tiles: 110 },
    ...over,
  });
}

/**
 * The fake record of the run's rewind page (plan R2 TL-3): the resume's rebuild-loop numbers,
 * stored for the results table and never POSTed.
 *
 * @param over - What differs.
 * @returns The record.
 */
export function fakeRewind(over: Partial<RewindBenchRecord> = {}): RewindBenchRecord {
  return {
    scenario: REWIND_SCENARIO_ID,
    index: REWIND_SCENARIO_INDEX,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_006_000,
    buildId: 'rb-x',
    ticks: 6_000,
    stepsPerSecond: 9_000,
    worldBuildMs: 2.5,
    hashMs: 0.3,
    hashChecks: 10,
    estCapTicks: 3_000,
    stage: REWIND_STAGE,
    error: null,
    ...over,
  };
}
