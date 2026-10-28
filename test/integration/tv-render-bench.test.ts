/**
 * The TV render bench end to end, headless (plan R0-02): the counted gate `pnpm bench` reads every
 * scenario through (`test/bench/render-harness/bench-gates.ts` `tvBenchViolations`), the wiring
 * of the browser half to it, and the results pipeline — records built the way the bench builds
 * them, sent
 * as `render-bench` payloads through `@shmup/shell`'s wire format to the input probe's real log
 * server, stored, and turned by `results/analyze-bench.mjs` into the tables relative to the
 * session's own 384×216 rows.
 *
 * Since plan R1-05 (B4) a run ends with the **decode scenario**, after the matrix's last scenario;
 * the decode record rides in a payload's optional `decode` field through the same log server to the
 * analyzer's decode table, its synthetic pages are drawn the same on every machine, and `pnpm bench`
 * opens it headlessly too. Since plan R3-04.M4a the decode pages are the real stand-in zone's page
 * and the two shipped ones, the run's last page load is the **stand-in zone drawn once**
 * (`standin-zone`, plan R3-04.M4b) — on the TV, in the owner's R0-03 campaign; since plan
 * **R5-10.T7** the headless bench no longer opens that page load, sweeping the nine real campaign
 * zones through the harness instead (`render.perf.ts`, gated by `load.ts`
 * `zoneSweepViolations`) — and the analyzer estimates the zone load from those measured pages,
 * while the synthetic-page sessions of the R0-03 campaign keep reading
 * through the old formula (both shapes are pinned here).
 *
 * The matrix is the resolution sweep (the owner's R0-03 follow-up): 25 frame sizes × 6 variants
 * plus 44 knob rows, 194 scenarios — with R0-02's 18 ids (384×216, 640×360, 960×540) unchanged.
 * Rows only ever append (plan R-SVG WO-2's cull pair takes 190…193), so the ids and indexes a
 * campaign already banked keep their meaning; the page loads shift by the count of new rows.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BENCH_DENSITIES,
  BENCH_KNOBS,
  BENCH_SCENARIOS,
  BENCH_SIZES,
  BENCH_V2_SIZE,
  BENCH_VARIANTS,
} from '../../apps/tizen/src/bench/matrix.js';
import {
  BENCH_RUN_LENGTH,
  DECODE_SCENARIO_ID,
  DECODE_SCENARIO_INDEX,
  STANDIN_SVG_SCENARIO_ID,
  STANDIN_SVG_SCENARIO_INDEX,
  STANDIN_SCENARIO_ID,
  STANDIN_SCENARIO_INDEX,
  measureDecode,
  type DecodeHost,
} from '../../apps/tizen/src/bench/decode.js';
import { REWIND_SCENARIO_ID, REWIND_SCENARIO_INDEX } from '../../apps/tizen/src/bench/rewind.js';
import { DECODE_PAGE_IDS, decodeArtImage } from '../../apps/tizen/scripts/bench-decode.mjs';
// Relative source imports, as `render-telemetry-pipeline.test.ts` does: the root suite does not
// depend on `@shmup/shell`.
import {
  RENDER_BENCH_KIND,
  buildRenderBenchPayload,
  makeRenderBenchSessionId,
  type DecodeBenchRecord,
  type RenderBenchEnv,
  type RenderBenchRecord,
} from '../../packages/shell/src/telemetry/index.js';
import {
  DRAW_CALL_BUDGET,
  HEAP_BUDGET,
  MIN_LIVE_LOAD,
  nextPowerOfTwo,
  pooledRenderTargetBytes,
  tvBenchViolations,
} from '../bench/render-harness/bench-gates.js';
import { createLogServer } from '../../tools/input-probe/server/log-server.mjs';
import {
  analyzeBenchSession,
  analyzeBenchSessions,
  decodeZoneEstimate,
  modalEnv,
  readBenchSession,
} from '../../tools/input-probe/results/analyze-bench.mjs';

/**
 * A decode host whose clock advances by fixed steps (fetch 20 ms, decode 300 ms, upload 100 ms CPU
 * + 30 ms on `finish()`, bitmap 280 + 25 ms) and whose pages come back as 1000-byte PNGs with the
 * colour type the caller picks per page.
 *
 * @param png8 - Whether the page fetched at this url is PNG-8 (colour type 3) rather than RGBA (6).
 * @returns The host.
 */
function fakeDecodeHost(png8: (url: string) => boolean): DecodeHost {
  let clock = 0;
  let gpu = 0;
  return {
    now: () => clock,
    fetch: (url) => {
      clock += 20;
      const bytes = new Uint8Array(1000);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      bytes[25] = png8(url) ? 3 : 6;
      return Promise.resolve(bytes.buffer);
    },
    decodeImage: () => {
      clock += 300;
      return Promise.resolve({ image: {}, release: () => {} });
    },
    decodeUrl: () => Promise.reject(new Error('unused')),
    decodeBitmap: () => {
      clock += 280;
      return Promise.resolve({ image: {}, release: () => {} });
    },
    createSource: () => ({ destroy: () => {} }),
    upload: () => {
      clock += 100;
      gpu += 30;
    },
    finish: () => {
      clock += gpu;
      gpu = 0;
    },
  };
}

/**
 * A decode record built the way the bench builds it: {@link measureDecode} over the **synthetic
 * pages of before R3-04.M4a** against {@link fakeDecodeHost}. Kept on purpose: it pins
 * `measureDecode`'s shape (encodings read off the fetched bytes, the `[min, p50, p95, max]` stages)
 * and the analyzer's legacy formula for a session recorded with those pages (plan R3-04.M4a let
 * `R3-04.M4b` re-own this file).
 *
 * @returns The record.
 */
async function legacyDecodeRecord(): Promise<DecodeBenchRecord> {
  const pages = [
    ['rgba-2048', 2048, 2048],
    ['png8-2048', 2048, 2048],
    ['common', 1024, 512],
    ['zone-a', 256, 128],
  ] as const;
  return measureDecode(
    fakeDecodeHost((url) => url.includes('png8') || url.includes('zone')),
    pages.map(([id, width, height]) => ({
      id,
      what: id,
      width,
      height,
      url: `assets/atlas/decode-${id}.png`,
    })),
    { repetitions: 4, webGLVersion: 1, imageDecode: true, wallClock: () => 1_760_000_700_000 },
  );
}

/**
 * The decode record of today's bench (plan R3-04.M4a): the stand-in zone A page first, then the two
 * shipped pages — all PNG-8, since the atlas is indexed since R1-05.
 *
 * @returns The record.
 */
async function standinDecodeRecord(): Promise<DecodeBenchRecord> {
  const pages: readonly [string, number, number][] = [
    ['standin-zone-a', 2048, 1024],
    ['common', 2048, 2048],
    ['zone-a', 2048, 2048],
  ];
  return measureDecode(
    fakeDecodeHost(() => true),
    pages.map(([id, width, height]) => ({
      id,
      what: id,
      width,
      height,
      url: `assets/atlas/decode-${id}.png`,
    })),
    { repetitions: 4, webGLVersion: 1, imageDecode: true, wallClock: () => 1_760_000_700_000 },
  );
}

/**
 * A healthy record for a scenario, shaped as the bench writes it.
 *
 * @param index - Scenario index in `BENCH_SCENARIOS`.
 * @param over - What differs.
 * @returns The record.
 */
function record(index: number, over: Partial<RenderBenchRecord> = {}): RenderBenchRecord {
  const scenario = BENCH_SCENARIOS[index];
  const { size, variant } = scenario;
  const cost = size.density * (variant.filter ? 1.2 : 1);
  return {
    scenario: scenario.id,
    index,
    size: size.id,
    width: size.width,
    height: size.height,
    density: size.density,
    variant: scenario.row,
    crt: variant.crt,
    filter: variant.filter,
    mode7: variant.mode7,
    webGLVersion: 1,
    displayWidth: 1920,
    displayHeight: 1080,
    scale: 1920 / size.width,
    phaseMs: [10_000, 14_000, 6_000],
    frames: 840,
    syncedFrames: 360,
    renderMs: [1, 2 * cost, 3 * cost, 8],
    syncedMs: [2, 3 * cost, 4 * cost, 12],
    frameMs: [12, 16.7, 30, 41],
    raf: [0, 10, 700, 60, 20, 30, 15, 5],
    tickFrames: [0, 820, 20, 0],
    twoTickShare: 0.02 * size.density,
    drawCalls: 12,
    rebuilds: 1,
    renderTargetBytes: variant.filter
      ? pooledRenderTargetBytes(size.width, size.height, 1920, 1080)
      : 0,
    frameTargetBytes: size.width * size.height * 4,
    textureBytes: (size.density > 2 ? 2 : 1) * 2048 * 1024 * 4,
    atlasPages: size.density > 2 ? 2 : 1,
    heapMeasured: true,
    heapStartBytes: 1_000_000,
    heapEndBytes: 1_050_000,
    heapDeltaBytes: 50_000,
    load: { bullets: 512, points: 512, enemies: 64, particles: 480, tiles: 470 },
    endedAt: 1_760_000_000_000 + index * 32_000,
    ...over,
  };
}

describe('render bench: the TV gate (tvBenchViolations, R0-02)', () => {
  it('rounds a render target up to powers of two, like Pixi’s pool', () => {
    expect([1, 216, 256, 360, 384, 540, 640, 960].map(nextPowerOfTwo)).toEqual([
      1, 256, 256, 512, 512, 1024, 1024, 1024,
    ]);
  });

  it('passes a real record of every scenario', () => {
    for (let i = 0; i < BENCH_SCENARIOS.length; i++) {
      const r = record(i);
      expect(tvBenchViolations(r, { atlasPages: r.atlasPages }), r.scenario).toEqual([]);
    }
  });

  it('refuses a record that measured nothing', () => {
    const empty = record(0, {
      frames: 0,
      syncedFrames: 0,
      drawCalls: 0,
      load: { bullets: 0, points: 0, enemies: 0, particles: 0, tiles: 0 },
    });
    const violations = tvBenchViolations(empty, { atlasPages: 1 });
    expect(violations).toHaveLength(8);
    expect(violations[0]).toContain('measured no free-running frame');
    expect(violations.join('\n')).toContain('nothing was drawn');
  });

  it('refuses a thin particle pool, too many draw calls and a heap over budget', () => {
    expect(
      tvBenchViolations(record(0, { load: { ...record(0).load, particles: MIN_LIVE_LOAD } }), {
        atlasPages: 1,
      }),
    ).toEqual([`a frame carried only ${MIN_LIVE_LOAD} particles (need > ${MIN_LIVE_LOAD})`]);
    expect(
      tvBenchViolations(record(0, { drawCalls: DRAW_CALL_BUDGET + 1 }), { atlasPages: 1 }),
    ).toEqual([`${DRAW_CALL_BUDGET + 1} draw calls, over the budget of ${DRAW_CALL_BUDGET}`]);
    expect(
      tvBenchViolations(record(0, { heapDeltaBytes: HEAP_BUDGET }), { atlasPages: 1 })[0],
    ).toContain('the heap grew');
    expect(
      tvBenchViolations(record(0, { heapMeasured: false, heapDeltaBytes: HEAP_BUDGET }), {
        atlasPages: 1,
      }),
    ).toEqual([]);
  });

  it('pins the pooled render targets: none without a filter, one frame-sized pass with one', () => {
    const busy = BENCH_SCENARIOS.findIndex((s) => s.id === '640x360-busy');
    const filter = BENCH_SCENARIOS.findIndex((s) => s.id === '640x360-filter');
    expect(
      tvBenchViolations(record(busy, { renderTargetBytes: 2048 * 2048 * 4 }), { atlasPages: 1 })[0],
    ).toContain('expected 0 (none)');
    expect(record(filter).renderTargetBytes).toBe(1024 * 512 * 4);
    expect(
      tvBenchViolations(record(filter, { renderTargetBytes: 0 }), { atlasPages: 1 })[0],
    ).toContain('one filter pass at the frame size');
  });

  it('pins the atlas pages of the density', () => {
    const hiBit = BENCH_SCENARIOS.findIndex((s) => s.id === '960x540-busy');
    expect(tvBenchViolations(record(hiBit), { atlasPages: 2 })).toEqual([]);
    expect(tvBenchViolations(record(hiBit, { atlasPages: 1 }), { atlasPages: 2 })).toEqual([
      '1 atlas pages, expected 2',
    ]);
  });
});

describe('render bench: the resolution sweep keeps R0-02’s rows (R0-03 follow-up)', () => {
  it('sweeps 25 frame sizes, 150 plain rows then 44 knob rows', () => {
    expect(BENCH_SIZES).toHaveLength(25);
    expect(BENCH_SIZES.filter((size) => size.art === 'scaled')).toHaveLength(11);
    expect(BENCH_SIZES.filter((size) => size.art === 'native')).toHaveLength(14);
    expect(BENCH_DENSITIES).toEqual([1, 1.33, 1.5, 2, 2.25, 2.4, 2.5, 2.67]);
    expect(BENCH_SCENARIOS).toHaveLength(194);
    expect(BENCH_SCENARIOS.filter((s) => s.knob === null)).toHaveLength(
      BENCH_SIZES.length * BENCH_VARIANTS.length,
    );
    expect(BENCH_SCENARIOS.filter((s) => s.knob !== null)).toHaveLength(44);
    expect(BENCH_KNOBS.map((knob) => knob.id)).toEqual([
      'fit',
      'stretch',
      'interp',
      'out720',
      'out540',
      'video',
      // The 960x540 first-class set, then the big-frame video pairs (owner 2026-10-27, appended).
      'fit',
      'stretch',
      'interp',
      'out720',
      'out540',
      'video',
      'video',
      // The owner-folded cull pair, at the tail (plan R-SVG WO-2).
      'cull',
    ]);
    // Plain rows first, sizes outer: the 384×216 baseline is the first resolution measured.
    expect(BENCH_SCENARIOS[0].id).toBe('384x216-busy');
    expect(BENCH_SCENARIOS[149].id).toBe('1920x1080n-worst');
    expect(BENCH_SCENARIOS[150].id).toBe('800x600-busy-fit');
    expect(BENCH_SCENARIOS[171].id).toBe('640x360-worst-out540');
    expect(BENCH_SCENARIOS[172].id).toBe('640x360-busy-video');
    expect(BENCH_SCENARIOS[173].id).toBe('640x360-worst-video');
    // The cull pair takes the four indexes right after the 190 the M7 banked, sizes outer.
    expect(BENCH_SCENARIOS[190].id).toBe('640x360-busy-cull');
    expect(BENCH_SCENARIOS[191].id).toBe('640x360-worst-cull');
    expect(BENCH_SCENARIOS[192].id).toBe('960x540-busy-cull');
    expect(BENCH_SCENARIOS[193].id).toBe('960x540-worst-cull');
    BENCH_SCENARIOS.forEach((s, i) => {
      expect(s.index).toBe(i);
      expect(s.id).toBe(`${s.size.id}-${s.row}`);
    });
    expect(new Set(BENCH_SCENARIOS.map((s) => s.id)).size).toBe(194);
    expect(BENCH_V2_SIZE.id).toBe('640x360');
  });

  it("keeps R0-02's 18 ids byte-identical, at the same frame and density", () => {
    const old: [string, number, number, number][] = [
      ['384x216', 384, 216, 1],
      ['640x360', 640, 360, 1.5],
      ['960x540', 960, 540, 2.25],
    ];
    for (const [id, width, height, density] of old) {
      const size = BENCH_SIZES.find((s) => s.id === id);
      expect(size, id).toMatchObject({ width, height, density, art: 'scaled' });
      const rows = BENCH_SCENARIOS.filter((s) => s.size.id === id && s.knob === null);
      expect(rows.map((s) => s.id)).toEqual(
        ['busy', 'filter', 'mode7', 'crt-light', 'crt-full', 'worst'].map((v) => `${id}-${v}`),
      );
      for (const s of rows) {
        expect([s.row, s.scaleMode, s.interpolation, s.outputWidth, s.outputHeight]).toEqual([
          s.variant.id,
          'integer',
          false,
          0,
          0,
        ]);
      }
    }
    // 384×216 has one row (its native row is its scaled row); the others gain a native row.
    expect(BENCH_SIZES.some((s) => s.id === '384x216n')).toBe(false);
    expect(BENCH_SIZES.find((s) => s.id === '640x360n')?.density).toBe(1);
    expect(BENCH_SIZES.find((s) => s.id === '960x540n')?.density).toBe(1);
  });

  it('carries each knob on its rows', () => {
    const stretch = BENCH_SCENARIOS.find((s) => s.id === '640x360-busy-stretch');
    expect(stretch).toMatchObject({
      row: 'busy-stretch',
      scaleMode: 'stretch',
      interpolation: false,
    });
    const interp = BENCH_SCENARIOS.find((s) => s.id === '1920x1080n-worst-interp');
    expect(interp).toMatchObject({ scaleMode: 'integer', interpolation: true, outputWidth: 0 });
    const out720 = BENCH_SCENARIOS.find((s) => s.id === '640x360-busy-out720');
    expect([out720?.outputWidth, out720?.outputHeight]).toEqual([1280, 720]);
    // Only the cull knob carries the walk (plan R-SVG WO-2): `run.ts` installs the pass from this
    // flag alone, so no other row can pay for it and no cull row can forget it.
    expect(BENCH_SCENARIOS.find((s) => s.id === '640x360-worst-cull')?.knob?.cull).toBe(true);
    expect(BENCH_SCENARIOS.filter((s) => s.knob?.cull === true)).toHaveLength(4);
    expect(BENCH_SCENARIOS.filter((s) => s.index < 190 && s.knob?.cull === true)).toHaveLength(0);
  });
});

describe('render bench: the decode scenario follows the matrix (R1-05 B4)', () => {
  it('appends one page load to the run; the stand-ins and rewind follow it (R3-04.M4a, R-SVG WO-2, R2 TL-3)', () => {
    expect([
      DECODE_SCENARIO_ID,
      DECODE_SCENARIO_INDEX,
      STANDIN_SCENARIO_ID,
      STANDIN_SCENARIO_INDEX,
      STANDIN_SVG_SCENARIO_ID,
      STANDIN_SVG_SCENARIO_INDEX,
      REWIND_SCENARIO_ID,
      REWIND_SCENARIO_INDEX,
      BENCH_RUN_LENGTH,
    ]).toEqual(['decode', 194, 'standin-zone', 195, 'standin-zone-svg', 196, 'rewind', 197, 198]);
    // The arm's load is a slot on BOTH arms: a PNG build reserves the index and passes it over, so
    // every index below the run length means the same row whichever bundle is installed.
    expect(BENCH_RUN_LENGTH).toBe(BENCH_SCENARIOS.length + 4);
  });

  it('draws its synthetic pages the same on every machine (integer maths only)', () => {
    const sha = (mode: 'rgba' | 'png8'): string =>
      createHash('sha256').update(decodeArtImage(mode, 256).data).digest('hex');
    expect(sha('rgba')).toBe('14871fc4e03574a43b1c403b95bc269b4c3078c9b5854b8d6da18495d2e27f92');
    expect(sha('png8')).toBe('fe309d05c530d3f4be9e5b8528123702d518f997bb0a33afae6c7db5fb74c19a');
  });

  it('builds a record of every page with each stage as [min, p50, p95, max]', async () => {
    const record = await legacyDecodeRecord();
    expect(record).toMatchObject({ scenario: 'decode', index: 194, repetitions: 4, error: null });
    expect(record.pages.map((page) => [page.id, page.encoding])).toEqual([
      ['rgba-2048', 'rgba'],
      ['png8-2048', 'png8'],
      ['common', 'rgba'],
      ['zone-a', 'png8'],
    ]);
    const [rgba] = record.pages;
    expect(rgba.fetchMs).toEqual([20, 20, 20, 20]);
    expect(rgba.decodeMs).toEqual([300, 300, 300, 300]);
    expect(rgba.uploadSyncedMs).toEqual([130, 130, 130, 130]);
    expect(rgba.totalMs).toEqual([450, 450, 450, 450]);
    expect(rgba.bitmapUploadMs).toEqual([130, 130, 130, 130]);
    expect(rgba.textureBytes).toBe(2048 * 2048 * 4);
    // The legacy estimate: `common` once plus the PNG-8 2048² page scaled to two zone pages.
    expect(decodeZoneEstimate(record)).toMatchObject({
      basis: 'synthetic',
      pages: 3,
      lazyMs: 450 + 2 * 450,
      eagerMs: 130 + 2 * 130,
    });
  });

  it('measures the stand-in page set today (R3-04.M4a) and estimates the zone from it', async () => {
    expect([...DECODE_PAGE_IDS]).toEqual(['standin-zone-a', 'common', 'zone-a']);
    const record = await standinDecodeRecord();
    expect(record.pages.map((page) => [page.id, page.encoding])).toEqual([
      ['standin-zone-a', 'png8'],
      ['common', 'png8'],
      ['zone-a', 'png8'],
    ]);
    // The measured-pages formula (decision W5-19): the zone's own pages, each at its median, no
    // multiplier — here common + stand-in + zone-a, three pages at 450 ms cold / 130 ms uploaded.
    const estimate = decodeZoneEstimate(record);
    expect(estimate).toMatchObject({
      basis: 'standin',
      pages: 3,
      lazyMs: 450 * 3,
      eagerMs: 130 * 3,
    });
    // 900 ms of PNG-8 decode over the three pages' 10.49 megapixels — the analyzer sums the
    // per-page areas before dividing, so the exact product is only compared to its rounding.
    // The `?.` keeps the `| null` return loud on failure while the program type-checks (the
    // toMatchObject above is the null guard; `undefined` would fail `toBeCloseTo`, never skip).
    expect(estimate?.perMpxMs).toBeCloseTo(900 / ((2048 * 1024 + 2 * 2048 * 2048) / 1e6), 6);
  });
});

describe('render bench: the headless driver gates every TV scenario', () => {
  const perf = readFileSync(
    fileURLToPath(new URL('../bench/render.perf.ts', import.meta.url)),
    'utf8',
  );

  it('opens every scenario and gates it by counts with the pages of its density', () => {
    expect(perf).toContain('for (const scenario of BENCH_SCENARIOS)');
    expect(perf).toContain(
      'tvBenchViolations(record, { atlasPages: TV_BENCH_PAGES[scenario.size.density] })',
    );
    expect(perf).toMatch(
      /1: 1,\s*1\.33: 1,\s*1\.5: 1,\s*2: 1,\s*2\.25: 2,\s*2\.4: 2,\s*2\.5: 2,\s*2\.67: 2,/,
    );
    expect(perf).toContain("configFile: join(appDir, 'vite.bench.config.ts')");
    expect(perf).toContain("mode: 'bench'");
  });

  it('opens the decode scenario too and checks its pages against the build (R1-05 B4, R3-04.M4a)', () => {
    expect(perf).toContain("runTvScenario(tvUrl, DECODE_SCENARIO_ID, '&reps=2')");
    expect(perf).toContain('DECODE_PAGE_IDS');
    // The page shapes come from the deterministic build, never from a pinned literal: the
    // synthetic 2048² pages are gone since R3-04.M4a.
    expect(perf).toContain('buildDecodePages()');
    expect(perf).not.toContain('rgba-2048');
  });

  it('sweeps the nine real zones headlessly instead of opening the stand-in page load (R5-10.T7)', () => {
    // The stand-in draw stays a TV-side page load for the owner's R0-03 campaign — its record
    // shape is pinned by the payload tests below, and the widget itself by `apps/tizen/test/bench`.
    // Headless, the driver must not open it any more; the real-zone sweep replaced it: the list
    // comes from the shipped campaign file and every arm passes the tested sweep gate.
    expect(perf).not.toContain('runTvScenario(tvUrl, STANDIN_SCENARIO_ID)');
    expect(perf).not.toContain('standinBenchViolations');
    expect(perf).toContain('content/campaign/main.campaign.json');
    expect(perf).toContain('zoneSweepViolations(stage, result)');
  });

  it('renders on a 1280x720 display, a whole multiple of 640x360', () => {
    expect(perf).toContain('export const DISPLAY_WIDTH = 1280;');
    expect(perf).toContain('export const DISPLAY_HEIGHT = 720;');
  });
});

describe('render bench: records → log server → analyzer (R0-02)', () => {
  let server: Server | undefined;
  let dir = '';
  let base = '';
  const session = makeRenderBenchSessionId(1_760_000_000_000, 0.25);
  const env: RenderBenchEnv = {
    buildId: 'abc1234',
    host: 'tizen',
    userAgent: 'Chrome/69',
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    webGLVersion: 1,
    scenarios: BENCH_SCENARIOS.length,
    startedAt: 1_760_000_000_000,
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shmup-tv-bench-logs-'));
    server = createLogServer({ logDir: dir, log: (): void => {} });
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/report`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => {
      if (server === undefined) done();
      else server.close(() => done());
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores one payload per scenario and the analyzer reads them back relative to 384x216', async () => {
    for (let i = 0; i < BENCH_SCENARIOS.length; i++) {
      const payload = buildRenderBenchPayload(
        session,
        i + 1,
        env.startedAt + i,
        env,
        [record(i)],
        i === BENCH_SCENARIOS.length - 1,
      );
      expect(payload.kind).toBe(RENDER_BENCH_KIND);
      const response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(200);
    }
    expect(readdirSync(dir)).toEqual([`${session}.jsonl`]);
    const file = join(dir, `${session}.jsonl`);
    const { records } = readBenchSession(file);
    expect(records.map((r: RenderBenchRecord) => r.scenario)).toEqual(
      BENCH_SCENARIOS.map((s) => s.id),
    );
    const report = analyzeBenchSession(file);
    expect(report).toContain(`# ${session} — TV render bench`);
    expect(report).toContain('194 of 194 scenario(s) measured, run complete');
    // 640x360 busy: synced p95 4.5 × 1.5 over the baseline's 4 → 1.50×; two-tick 3 % vs 2 % → +1.0.
    expect(report).toContain('| busy | 1 | 3.00 / 4.50 | 4.50 / 6.00 | 1.50× | 3.0 | +1.0 |');
    expect(report).toContain('## Plan §13 at 640×360');
    // A session from before the decode scenario has no decode table.
    expect(readBenchSession(file).decode).toBeNull();
    expect(report).not.toContain('## Decode and upload');
  });

  it('carries the decode record in the run’s last payload, through to the analyzer (R1-05 B4)', async () => {
    const decode = await standinDecodeRecord();
    const payload = buildRenderBenchPayload(
      session,
      BENCH_RUN_LENGTH,
      env.startedAt + BENCH_RUN_LENGTH,
      env,
      [],
      true,
      decode,
    );
    const response = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(200);
    const file = join(dir, `${session}.jsonl`);
    expect(readBenchSession(file).decode).toEqual(decode);
    const report = analyzeBenchSession(file);
    expect(report).toContain('## Decode and upload — file to GPU (plan R1-05 B4, for R3-04)');
    expect(report).toContain(
      '| standin-zone-a | 2048×1024 | png8 | 1 | 20.00 / 20.00 | 300.00 / 300.00 | 100.00 / 100.00 |' +
        ' 130.00 / 130.00 | 450.00 / 450.00 | 450.00 | 280.00 / 280.00 | 130.00 / 130.00 |',
    );
    // 3 × 450 ms cold, 3 × 130 ms uploaded, the stand-in pages each at its median.
    expect(report).toContain(
      'R3-04 zone-load estimate (the measured pages: `common` + the stand-in zone pages,' +
        ' 3 page(s) in all, each at its median):',
    );
    expect(report).toContain('**1350 ms**, within R3-04’s 2000 ms');
    expect(report).toContain('**390 ms**, within R3-04’s 2000 ms');
    expect(report).toContain(
      '≈ 85.8 ms per megapixel — the measured pages, not a scaled stand-in.',
    );
  });

  it('keeps the stand-in draw out of the matrix tables and prints it on its own (R3-04.M4a)', async () => {
    // The test owns its session (the M4bRV1 MAJOR fix): the matrix count was true only because the
    // block's first test had posted the 194 payloads to the shared one, so standalone this test
    // read `0 of 194`. Its own 194 matrix records ride here first, then the stand-in payload.
    const own = makeRenderBenchSessionId(1_760_000_000_000 + 60_000, 0.75);
    for (let i = 0; i < BENCH_SCENARIOS.length; i++) {
      const payload = buildRenderBenchPayload(
        own,
        i + 1,
        env.startedAt + i,
        env,
        [record(i)],
        i === BENCH_SCENARIOS.length - 1,
      );
      const response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(200);
    }
    const standin = record(0, {
      scenario: STANDIN_SCENARIO_ID,
      index: STANDIN_SCENARIO_INDEX,
      size: BENCH_V2_SIZE.id,
      width: BENCH_V2_SIZE.width,
      height: BENCH_V2_SIZE.height,
      density: BENCH_V2_SIZE.density,
      variant: 'standin-zone',
      crt: 'off',
      filter: false,
      mode7: false,
      phaseMs: [0, 0, 0],
      frames: 1,
      syncedFrames: 1,
      raf: [],
      tickFrames: [],
      twoTickShare: 0,
      renderTargetBytes: 0,
      frameTargetBytes: BENCH_V2_SIZE.width * BENCH_V2_SIZE.height * 4,
      textureBytes: 2048 * 1024 * 4,
      atlasPages: 1,
      load: { bullets: 0, points: 0, enemies: 24, particles: 0, tiles: 110 },
      endedAt: 1_760_000_000_000 + STANDIN_SCENARIO_INDEX * 32_000,
    });
    const payload = buildRenderBenchPayload(
      own,
      STANDIN_SCENARIO_INDEX + 1,
      env.startedAt + STANDIN_SCENARIO_INDEX + 1,
      env,
      [standin],
      true,
    );
    const response = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(200);
    const file = join(dir, `${own}.jsonl`);
    // The analyzer reads it as the run's last page load, never as a size row (M4a's split): the
    // matrix keeps its 194 records and the header the fake env reports for them.
    const stored = readBenchSession(file);
    expect(stored.records.map((r: RenderBenchRecord) => r.scenario)).not.toContain(
      STANDIN_SCENARIO_ID,
    );
    expect(stored.standin).toHaveLength(1);
    const report = analyzeBenchSession(file);
    expect(report).toContain(
      "## Stand-in draw (the run's last page load, plan R3-04.M4a) — 1 record(s)",
    );
    expect(report).toContain('| 1 | 2.00 / 3.00 | 3.00 / 4.00 | 12 | 1 |');
    expect(report).toContain('194 of 194 scenario(s) measured');
  });
});

describe('bench analyzer: session env by majority, campaigns partitioned by build (the 2026-10-27 law)', () => {
  /** The 2026-10-27 shape: a session's payloads carry one env, plus a resumed app's stray header. */
  type BenchEnv = RenderBenchEnv & { output?: string | null };

  /** One log-server line: the stored payload object (`receivedAt` / `from` are the server's). */
  function line(
    session: string,
    seq: number,
    env: BenchEnv,
    results: RenderBenchRecord[],
    done = false,
  ): string {
    return JSON.stringify({
      kind: RENDER_BENCH_KIND,
      session,
      seq,
      sentAt: 1_793_140_000_000 + seq,
      receivedAt: 1_793_140_000_001 + seq,
      from: '10.0.0.1',
      env,
      results,
      done,
    });
  }

  /** The old 960x540-backbuffer GL 2 build (majority env of the replayed session). */
  const envOld: BenchEnv = {
    buildId: 'old-b@960x540',
    host: 'tizen',
    userAgent: 'UA',
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    webGLVersion: 2,
    scenarios: 8,
    startedAt: 1_792_494_603_454,
    output: '960x540',
  };
  /** The new full-window build (whose header a resumed run appends under the OLD session id). */
  const envNew: BenchEnv = {
    buildId: 'new-b',
    host: 'tizen',
    userAgent: 'UA',
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    webGLVersion: 1,
    scenarios: 174,
    startedAt: 1_793_139_892_196,
    output: null,
  };

  /** The busy rows of 384x216 and 640x360 — enough for §13 and for the output blocks' tables. */
  function busyRows(webGLVersion: number): RenderBenchRecord[] {
    const i384 = BENCH_SCENARIOS.findIndex((s) => s.id === '384x216-busy');
    const i640 = BENCH_SCENARIOS.findIndex((s) => s.id === '640x360-busy');
    return [record(i384, { webGLVersion }), record(i640, { webGLVersion })];
  }

  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'shmup-bench-law-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Writes one session file and returns its path. */
  function sessionFile(name: string, lines: string[]): string {
    const file = join(dir, `${name}.jsonl`);
    writeFileSync(file, lines.join('\n') + '\n');
    return file;
  }

  it('reads a session env by majority over payloads, ties to the later (modalEnv)', () => {
    expect(modalEnv([])).toEqual({});
    // Payloads without a usable env fall into one empty bucket — a session of them reads `{}`.
    expect(modalEnv([{}, {}, {}])).toEqual({});
    const a = { buildId: 'a' };
    const b = { buildId: 'b' };
    expect(modalEnv([{ env: a }, { env: a }, { env: b }])).toEqual(a);
    // A true tie goes to the later occurrence (a run that re-wrote its env really is the newer one).
    expect(modalEnv([{ env: a }, { env: b }])).toEqual(b);
  });

  it('a resumed run stray header does not re-attribute the old session report', () => {
    // Exactly the rb-mvgl07um-qm3i shape: N old payloads, then one new-build header under the same
    // session id (the log server files by session id, so it landed in the old file).
    const old = busyRows(2);
    const file = sessionFile('rb-old', [
      line('rb-old', 1, envOld, [old[0]]),
      line('rb-old', 2, envOld, [old[1]]),
      line('rb-old', 3, envNew, []),
    ]);
    const report = analyzeBenchSession(file);
    expect(report).toContain('Build `old-b@960x540`');
    expect(report).toContain('· output 960x540');
    expect(report).toContain('2 of 8 scenario(s) measured');
    expect(report).not.toContain('of 174');
    expect(report).not.toContain('Build `new-b`');
  });

  it('a stray header does not re-attribute the campaign either (session table)', () => {
    const old = busyRows(2);
    const file = sessionFile('rb-table', [
      line('rb-table', 1, envOld, [old[0]]),
      line('rb-table', 2, envOld, [old[1]]),
      line('rb-table', 3, envNew, []),
    ]);
    const table = analyzeBenchSessions([file]);
    // The session table's row: its own build id and matrix count (not the stray header's new build).
    expect(table).toMatch(/\| rb-table \|.*\b2\/8\b.*incomplete.*\| old-b@960x540 \|/);
    expect(table).not.toMatch(/rb-table.*\| new-b \|/);
    expect(table).toContain('## Output 960x540 (backbuffer)');
    expect(table).not.toContain('[build'); // the lone build is not named in the heading (older campaigns read as before)
    expect(table).not.toContain('## Output 1920x1080');
  });

  it('a folder campaign partitions by build: old replay and new run never share a table', () => {
    const old = busyRows(2);
    const oldFile = sessionFile('rb-oldmix', [
      line('rb-oldmix', 1, envOld, [old[0]]),
      line('rb-oldmix', 2, envOld, [old[1]]),
      line('rb-oldmix', 3, envNew, []),
    ]);
    const newFile = sessionFile('rb-newmix', [
      line('rb-newmix', 1, envNew, busyRows(1)),
      line('rb-newmix', 2, envNew, [], true),
    ]);
    const report = analyzeBenchSessions([oldFile, newFile]);
    // Every output block belongs to one build and says so.
    const win = report.indexOf('## Output 1920x1080 (window) [build new-b]');
    const back = report.indexOf('## Output 960x540 (backbuffer) [build old-b@960x540]');
    expect(win).toBeGreaterThan(-1);
    expect(back).toBeGreaterThan(win);
    // The window block holds only the new session and never shows a GL 2 run (the old build's rows
    // left its aggregates entirely — before the partition they sat inside it as `WebGL 2 — 1 run(s)`).
    const windowBlock = report.slice(win, back);
    expect(windowBlock).toContain('1 session(s) (rb-newmix); runs: GL 1 × 1');
    expect(windowBlock).not.toContain('GL 2');
    // No cross-build verdict, no cross-build comparison table (only the refusal).
    expect(windowBlock).toContain('No comparison: the sessions hold WebGL 1 runs only');
    expect(report).toContain(
      'No cross-output comparison: no build contributes two output resolutions',
    );
    expect(report).not.toContain('it needs ≥ 2 runs of each WebGL version');
  });

  it('outputs of ONE build still compare (the cross-output table survives the partition)', () => {
    const env720: BenchEnv = { ...envNew, output: '1280x720' };
    const winFile = sessionFile('rb-b-win', [line('rb-b-win', 1, envNew, busyRows(1), true)]);
    const bbFile = sessionFile('rb-b-bb', [line('rb-b-bb', 1, env720, busyRows(1), true)]);
    const report = analyzeBenchSessions([winFile, bbFile]);
    expect(report).toContain('## Output 1280x720 (backbuffer)');
    expect(report).toContain('## Cross-output comparison');
    expect(report).not.toContain('No cross-output comparison:');
    expect(report).not.toContain('[build'); // single-build campaign: headings unnamed, exactly as before
    expect(report).toContain('2t % 1920x1080');
    expect(report).toContain('2t % 1280x720');
  });
});

describe('render bench analyzer: plan §13 prints its outcome rows at 960x540 as at 640x360 (the first-class frame)', () => {
  /** A GL 1 full-window session: one payload per row, the run of these tests' sessions. */
  const env: RenderBenchEnv = {
    buildId: 's13-a',
    host: 'tizen',
    userAgent: 'UA',
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    webGLVersion: 1,
    scenarios: 18,
    startedAt: 1_793_200_000_000,
  };

  const planned =
    '**planned** — proceed as planned; record the headroom as the R3-04 / R6-02 budget';
  const tvProfile =
    '**tv-profile** — proceed; R3-06 and R5 adopt the TV profile from the start (parallax capped at 4 on ' +
    'Tizen, far backdrop at half resolution, CRT off by default on TV)';

  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'shmup-bench-s13-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** The six plain (non-knob) rows of one size id, in matrix order, as the bench records them. */
  function plainRows(sizeId: string): RenderBenchRecord[] {
    return BENCH_SCENARIOS.filter((s) => s.size.id === sizeId && s.knob === null).map((s) =>
      record(s.index),
    );
  }

  /** Writes a session file from whole records (one payload each) and returns its path. */
  function writeSession(name: string, results: RenderBenchRecord[]): string {
    const lines = results.map((r, i) =>
      JSON.stringify({
        kind: RENDER_BENCH_KIND,
        session: name,
        seq: i + 1,
        sentAt: env.startedAt + i,
        receivedAt: env.startedAt + i,
        from: '10.0.0.1',
        env,
        results: [r],
        done: i === results.length - 1,
      }),
    );
    const file = join(dir, `${name}.jsonl`);
    writeFileSync(file, lines.join('\n') + '\n');
    return file;
  }

  /** A Markdown table row split into trimmed cells (padding, the session's raw pipes alike). */
  function rowCells(line: string): string[] {
    return line.replace(/^\|\s*|\s*\|$/g, '').split(/\s*\|\s*/);
  }

  /** The table below a report heading (the `… — GL 1, one run` suffixes included), as cells. */
  function tableAfter(report: string, heading: string): string[][] {
    const lines = report.split('\n');
    const start = lines.indexOf(heading);
    expect(start, heading).toBeGreaterThan(-1);
    const rows: string[][] = [];
    for (const line of lines.slice(start + 1)) {
      if (!line.startsWith('|')) {
        if (rows.length > 0) break;
        continue;
      }
      rows.push(rowCells(line));
    }
    return rows;
  }

  /** One run of the three sizes' plain rows: 384×216 cost 1×, 640×360 1.5×, 960×540 2.25× (the fake's math). */
  function bothFramesSession(name: string): string {
    return writeSession(name, ['384x216', '640x360', '960x540'].flatMap(plainRows));
  }

  it('the session (--full) report prints both frames with one table shape; the note keeps its old place', () => {
    const report = analyzeBenchSession(bothFramesSession('rb-s13-full'));
    const head = ['Variant', 'GL', 'Δ 2-tick points', 'Synced p95 ms', 'Outcome'];
    const v2 = tableAfter(report, '## Plan §13 at 640×360');
    const hi = tableAfter(report, '## Plan §13 at 960×540');
    expect(v2[0]).toEqual(head);
    expect(hi[0]).toEqual(head);
    // 640×360: +1.0 points over the 384×216 rows, synced p95 6.00 (7.20 with the filter pass) — planned.
    expect(v2.slice(2)).toEqual([
      ['busy', '1', '1.0', '6.00', planned],
      ['filter', '1', '1.0', '7.20', planned],
      ['mode7', '1', '1.0', '6.00', planned],
      ['crt-light', '1', '1.0', '6.00', planned],
      ['crt-full', '1', '1.0', '6.00', planned],
      ['worst', '1', '1.0', '7.20', planned],
    ]);
    // 960×540 under the very same thresholds: +2.5 points, synced p95 9.00 / 10.80 → tv-profile.
    expect(hi.slice(2)).toEqual([
      ['busy', '1', '2.5', '9.00', tvProfile],
      ['filter', '1', '2.5', '10.80', tvProfile],
      ['mode7', '1', '2.5', '9.00', tvProfile],
      ['crt-light', '1', '2.5', '9.00', tvProfile],
      ['crt-full', '1', '2.5', '9.00', tvProfile],
      ['worst', '1', '2.5', '10.80', tvProfile],
    ]);
    // The 960×540 busy note sits where it always sat — after the 640×360 rows — and the new table follows it,
    // so a regenerated report differs from the old one by the added rows alone.
    expect(report).toContain(
      '960×540 (busy) is **tv-profile** where 640×360 is **planned**: clearly worse — note it; nothing changes.',
    );
    expect(report.indexOf('960×540 (busy) is')).toBeLessThan(
      report.indexOf('## Plan §13 at 960×540'),
    );
  });

  it('the campaign block prints its §13 table per frame, each frame with its own heading, note line and legend', () => {
    const report = analyzeBenchSessions([bothFramesSession('rb-s13-camp')]);
    expect(report).toContain('#### Plan §13 at 640×360 — GL 1, one run');
    expect(report).toContain('#### Plan §13 at 960×540 — GL 1, one run');
    expect(report).toContain(
      'Δ 2-tick = each run’s 960×540 row against the same run’s 384×216 row (median, and the runs’ range).',
    );
    const v2 = tableAfter(report, '#### Plan §13 at 640×360 — GL 1, one run');
    const hi = tableAfter(report, '#### Plan §13 at 960×540 — GL 1, one run');
    expect(hi[0]).toEqual(v2[0]); // same columns: Variant, Runs, Δ, Synced p95 ms, Outcome
    expect(hi.map((row) => row[0])).toEqual(v2.map((row) => row[0])); // same variants, same order
    // One run: the Δ cell carries no range; with repeats the range rides beside the median (the 640 law).
    expect(hi.slice(2)).toEqual([
      ['busy', '1', '+2.5', '9.00', '**tv-profile**'],
      ['filter', '1', '+2.5', '10.80', '**tv-profile**'],
      ['mode7', '1', '+2.5', '9.00', '**tv-profile**'],
      ['crt-light', '1', '+2.5', '9.00', '**tv-profile**'],
      ['crt-full', '1', '+2.5', '9.00', '**tv-profile**'],
      ['worst', '1', '+2.5', '10.80', '**tv-profile**'],
    ]);
    // Each frame's block holds its own legend: planned for 640×360, tv-profile for 960×540, never shared.
    expect(report.split('\n').filter((l) => l.startsWith('- **planned**:'))).toHaveLength(1);
    expect(report.split('\n').filter((l) => l.startsWith('- **tv-profile**:'))).toHaveLength(1);
    expect(report.indexOf('- **planned**:')).toBeLessThan(
      report.indexOf('#### Plan §13 at 960×540'),
    );
    expect(report.indexOf('- **tv-profile**:')).toBeGreaterThan(
      report.indexOf('#### Plan §13 at 960×540'),
    );
    // The prose note still sits between the frames: after the 640 block, before the 960 table.
    expect(report.indexOf('960×540 (busy) is')).toBeGreaterThan(
      report.indexOf('#### Plan §13 at 640×360'),
    );
    expect(report.indexOf('960×540 (busy) is')).toBeLessThan(
      report.indexOf('#### Plan §13 at 960×540'),
    );
  });

  it('prints nothing at 960×540 without the frame’s plain rows (no frame, no block — knob rows never count)', () => {
    const noFrame = writeSession('rb-s13-none', ['384x216', '640x360'].flatMap(plainRows));
    expect(analyzeBenchSession(noFrame)).not.toContain('Plan §13 at 960×540');
    const campaign = analyzeBenchSessions([noFrame]);
    expect(campaign).toContain('#### Plan §13 at 640×360');
    expect(campaign).not.toContain('Plan §13 at 960×540');
    expect(campaign).not.toContain('960×540 (busy)');
    // The widget's 960×540 knob rows are matrix rows too, yet the §13 table reads plain rows only.
    const knobOnly = writeSession('rb-s13-knob', [
      ...['384x216', '640x360'].flatMap(plainRows),
      ...BENCH_SCENARIOS.filter((s) => s.size.id === '960x540' && s.knob !== null).map((s) =>
        record(s.index),
      ),
    ]);
    expect(
      BENCH_SCENARIOS.filter((s) => s.size.id === '960x540' && s.knob !== null),
    ).not.toHaveLength(0);
    expect(analyzeBenchSession(knobOnly)).not.toContain('Plan §13 at 960×540');
    expect(analyzeBenchSessions([knobOnly])).not.toContain('Plan §13 at 960×540');
  });
});

describe('bench analyzer: game-code pooling (plan v20x BENCSKIP): one code merges across builds, two codes never pool', () => {
  /**
   * The 2026-10-27 law's env type, with the fields the payload may now carry: `gameCodeHash`
   * (BENCSKIP) and `svgEnc` (R-SVG WO-1). Neither is on `RenderBenchEnv` — the shell type file is
   * hashed by the game-code digest, so an additive bench-only field travels on the app's own env
   * type (`TvBenchEnv` in `apps/tizen/src/bench/run.ts`) and the analyzer reads it from the JSON.
   */
  type BenchEnv = RenderBenchEnv & { output?: string | null; svgEnc?: string };

  /** The code a rebuilt-bench-over-same-game bundle carries. */
  const CODE = 'c0de000001';
  /** A different game code (any shipped draw input moved between the two builds). */
  const CODE2 = 'c0de000002';

  /**
   * One log-server line (the law describe's builder, mirrored for its own file).
   *
   * @param session - Session id.
   * @param seq - Payload sequence.
   * @param env - The session env.
   * @param results - The payload's records.
   * @param done - Whether the run completed.
   * @returns The JSONL line.
   */
  function line(
    session: string,
    seq: number,
    env: BenchEnv,
    results: RenderBenchRecord[],
    done = false,
  ): string {
    return JSON.stringify({
      kind: RENDER_BENCH_KIND,
      session,
      seq,
      sentAt: 1_793_300_000_000 + seq,
      receivedAt: 1_793_300_000_001 + seq,
      from: '10.0.0.1',
      env,
      results,
      done,
    });
  }

  /**
   * A full-window GL 1 env.
   *
   * @param buildId - The bundle's build id.
   * @param startedAt - When the run started (orders the sessions).
   * @param gameCodeHash - The code field, absent for a legacy session.
   * @param svgEnc - The atlas-page encoding, absent (or `png`) for every session until R-SVG.
   * @returns The env.
   */
  function envWin(
    buildId: string,
    startedAt: number,
    gameCodeHash?: string,
    svgEnc?: string,
  ): BenchEnv {
    return {
      buildId,
      ...(gameCodeHash === undefined ? {} : { gameCodeHash }),
      ...(svgEnc === undefined ? {} : { svgEnc }),
      host: 'tizen',
      userAgent: 'UA',
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      webGLVersion: 1,
      scenarios: BENCH_SCENARIOS.length,
      startedAt,
      output: null,
    };
  }

  /** The busy rows of 384×216 and 640×360 — the baseline plus one §13 frame. */
  function busyRows(): RenderBenchRecord[] {
    const i384 = BENCH_SCENARIOS.findIndex((s) => s.id === '384x216-busy');
    const i640 = BENCH_SCENARIOS.findIndex((s) => s.id === '640x360-busy');
    return [record(i384), record(i640)];
  }

  /** Only the 640×360 busy row (a skip run never re-measures the frozen baseline). */
  function row640(): RenderBenchRecord[] {
    const i640 = BENCH_SCENARIOS.findIndex((s) => s.id === '640x360-busy');
    return [record(i640)];
  }

  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'shmup-bench-code-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Writes one session file.
   *
   * @param name - File name (`.jsonl` appended).
   * @param lines - The payload lines.
   * @returns The path.
   */
  function sessionFile(name: string, lines: string[]): string {
    const file = join(dir, `${name}.jsonl`);
    writeFileSync(file, lines.join('\n') + '\n');
    return file;
  }

  it('pools two builds of one game code into one block; samples stack, they never supersede', () => {
    // The owner's exact story: the 174-era full run, a bench-only rebuild (new build id, same
    // game code), then the new-rows run whose few rows still land in the SAME tables.
    const full = sessionFile('rb-code-full', [
      line('rb-code-full', 1, envWin('b-one', 1_793_299_000_000, CODE), busyRows(), true),
    ]);
    const rest = sessionFile('rb-code-rest', [
      line('rb-code-rest', 1, envWin('b-two', 1_793_300_100_000, CODE), row640(), true),
    ]);
    const report = analyzeBenchSessions([full, rest]);
    // One block for the window output, naming both sessions — one pooled campaign of 2 runs.
    expect(report).toContain('2 session(s) (rb-code-full, rb-code-rest); runs: GL 1 × 2.');
    expect(report).toContain('## Output 1920x1080 (window) [build b-one]');
    // The 640×360 busy row sits in both sessions: the table counts BOTH runs (the second is a
    // noise sample, not a replacement — the amendment rules out newest-wins across sessions).
    expect(report).toMatch(/\|\s*busy\s*\|\s*2\s*\|/);
    // Repeats therefore exist: no “no noise floor” refusal, and the §13 pairing resolved.
    expect(report).not.toContain('No noise floor');
    expect(report).toContain('median of 2 runs');
    // The baseline from the full run and the 640×360 row from the skip run share a table:
    // §13's outcome line prints Δ points (the pairing survived the split across sessions).
    expect(report).toContain('Plan §13 at 640×360');
    expect(report).not.toContain('no 384x216 baseline in the same run');
  });

  it('refuses to pool two game codes even under one output resolution', () => {
    const one = sessionFile('rb-refuse-a', [
      line('rb-refuse-a', 1, envWin('b-one', 1_793_299_000_000, CODE), busyRows(), true),
    ]);
    const two = sessionFile('rb-refuse-b', [
      line('rb-refuse-b', 1, envWin('b-two', 1_793_300_100_000, CODE2), busyRows(), true),
    ]);
    const report = analyzeBenchSessions([one, two]);
    // Each code sits alone: no shared block, no pooled noise, exactly the old cross-build refusal.
    expect(report).toContain('1 session(s) (rb-refuse-a)');
    expect(report).toContain('1 session(s) (rb-refuse-b)');
    expect(report).not.toContain('2 session(s) (rb-refuse-a, rb-refuse-b)');
    expect(report).toContain('No noise floor: no WebGL version has 2 runs');
  });

  it('legacy sessions without the field keep today’s build-id partitioning, both ways', () => {
    // Two legacy sessions of one build: pooled, as every committed table has always shown.
    const a = sessionFile('rb-leg-a', [
      line('rb-leg-a', 1, envWin('b-one', 1_793_299_000_000), busyRows(), true),
    ]);
    const b = sessionFile('rb-leg-b', [
      line('rb-leg-b', 1, envWin('b-one', 1_793_300_100_000), busyRows(), true),
    ]);
    expect(analyzeBenchSessions([a, b])).toContain(
      '2 session(s) (rb-leg-a, rb-leg-b); runs: GL 1 × 2.',
    );
    // A hashed session of the same build id never joins the legacy block (and vice versa).
    const h = sessionFile('rb-leg-h', [
      line('rb-leg-h', 1, envWin('b-one', 1_793_300_200_000, CODE), busyRows(), true),
    ]);
    const mixed = analyzeBenchSessions([a, h]);
    expect(mixed).toContain('1 session(s) (rb-leg-a)');
    expect(mixed).toContain('1 session(s) (rb-leg-h)');
  });

  it('inside one session a Red re-run still replaces the row (per-session dedupe untouched)', () => {
    const rows = busyRows();
    const again = {
      ...rows[1],
      twoTickShare: rows[1].twoTickShare + 0.05,
      endedAt: rows[1].endedAt + 1,
    };
    const file = sessionFile('rb-redup', [
      line('rb-redup', 1, envWin('b-one', 1_793_299_000_000, CODE), [rows[0]]),
      line('rb-redup', 2, envWin('b-one', 1_793_299_000_000, CODE), [rows[1]], false),
      line('rb-redup', 3, envWin('b-one', 1_793_299_000_000, CODE), [again], true),
    ]);
    const read = readBenchSession(file);
    expect(read.records).toHaveLength(2);
    expect(read.records.find((r: RenderBenchRecord) => r.index === rows[1].index)).toEqual(again);
  });

  it('an empty gameCodeHash string reads as legacy, not as a code of its own', () => {
    const noField = sessionFile('rb-empty-f', [
      line('rb-empty-f', 1, envWin('b-one', 1_793_299_000_000), busyRows(), true),
    ]);
    const empty = sessionFile('rb-empty-e', [
      line('rb-empty-e', 1, envWin('b-one', 1_793_300_100_000, ''), busyRows(), true),
    ]);
    // Both are build-id sessions of one build → one block (the '' never opens a `code:` pool).
    expect(analyzeBenchSessions([noField, empty])).toContain(
      '2 session(s) (rb-empty-f, rb-empty-e); runs: GL 1 × 2.',
    );
  });

  it('never pools an SVG-arm session with the PNG rows of the same code (plan R-SVG WO-1)', () => {
    // The arm measures the same scenes from differently encoded pages, so its samples must never
    // average with the PNG samples — while the PNG pool's keys stay exactly as every committed
    // table wrote them (an absent `svgEnc` is the bare key, no suffix).
    const png1 = sessionFile('rb-arm-p1', [
      line('rb-arm-p1', 1, envWin('b-one', 1_793_299_000_000, CODE), busyRows(), true),
    ]);
    const png2 = sessionFile('rb-arm-p2', [
      line('rb-arm-p2', 1, envWin('b-two', 1_793_300_100_000, CODE), row640(), true),
    ]);
    const arm = sessionFile('rb-arm-svg', [
      line(
        'rb-arm-svg',
        1,
        envWin('b-svg+svg-e3', 1_793_301_100_000, CODE, 'e3'),
        busyRows(),
        true,
      ),
    ]);
    // The PNG pair still pools (the pre-arm law, byte-kept) …
    expect(analyzeBenchSessions([png1, png2])).toContain('2 session(s) (rb-arm-p1, rb-arm-p2)');
    // … and the armed session stands apart from them: three files, the 2-pool and a 1-pool.
    const mixed = analyzeBenchSessions([png1, png2, arm]);
    expect(mixed).toContain('2 session(s) (rb-arm-p1, rb-arm-p2)');
    expect(mixed).toContain('1 session(s) (rb-arm-svg)');
    // (the report's title counts all read files — the negative is on the block line.)
    expect(mixed).not.toContain('3 session(s) (rb-arm-p1');
    expect(mixed).toContain('[build b-svg+svg-e3]');
    // `png` written explicitly is the PNG arm: it pools with the bare-key sessions.
    const stated = sessionFile('rb-arm-png', [
      line('rb-arm-png', 1, envWin('b-three', 1_793_302_100_000, CODE, 'png'), row640(), true),
    ]);
    expect(analyzeBenchSessions([png1, stated])).toContain('2 session(s) (rb-arm-p1, rb-arm-png)');
  });

  it('pools two SVG-arm sessions of one code into the suffixed pool', () => {
    const a = sessionFile('rb-both-a', [
      line('rb-both-a', 1, envWin('b-one+svg-e3', 1_793_299_000_000, CODE, 'e3'), busyRows(), true),
    ]);
    const b = sessionFile('rb-both-b', [
      line('rb-both-b', 1, envWin('b-two+svg-e3', 1_793_300_100_000, CODE, 'e3'), row640(), true),
    ]);
    const report = analyzeBenchSessions([a, b]);
    expect(report).toContain('2 session(s) (rb-both-a, rb-both-b); runs: GL 1 × 2.');
    expect(report).toContain('[build b-one+svg-e3]');
    // A legacy session (no code, no encoding) never joins the arm's build-id pool either: the
    // suffixed key cannot collide with the plain build ids it would otherwise share a block with.
    const leg = sessionFile('rb-both-l', [
      line('rb-both-l', 1, envWin('b-one+svg-e3', 1_793_301_000_000), busyRows(), true),
    ]);
    const mixed = analyzeBenchSessions([a, leg]);
    expect(mixed).toContain('1 session(s) (rb-both-a)');
    expect(mixed).toContain('1 session(s) (rb-both-l)');
  });
});
