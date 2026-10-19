/**
 * The TV render bench end to end, headless (plan R0-02): the counted gate `pnpm bench` reads every
 * scenario through (`test/bench/render-harness/gates.ts` `tvBenchViolations`), the wiring of the
 * browser half to it, and the results pipeline — records built the way the bench builds them, sent
 * as `render-bench` payloads through `@shmup/shell`'s wire format to the input probe's real log
 * server, stored, and turned by `results/analyze-bench.mjs` into the tables relative to the
 * session's own 384×216 rows.
 *
 * Since plan R1-05 (B4) a run ends with the **decode scenario**, after the matrix's last scenario;
 * the decode record rides in a payload's optional `decode` field through the same log server to the
 * analyzer's decode table, its synthetic pages are drawn the same on every machine, and `pnpm bench`
 * opens it headlessly too.
 *
 * The matrix is the resolution sweep (the owner's R0-03 follow-up): 25 frame sizes × 6 variants
 * plus 22 knob rows, 172 scenarios — with R0-02's 18 ids (384×216, 640×360, 960×540) unchanged.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
  measureDecode,
  type DecodeHost,
} from '../../apps/tizen/src/bench/decode.js';
import { decodeArtImage } from '../../apps/tizen/scripts/bench-decode.mjs';
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
  tvBenchViolations,
} from '../bench/render-harness/gates.js';
import { createLogServer } from '../../tools/input-probe/server/log-server.mjs';
import {
  analyzeBenchSession,
  readBenchSession,
} from '../../tools/input-probe/results/analyze-bench.mjs';

/**
 * A decode record built the way the bench builds it: {@link measureDecode} over the bench's four
 * pages against a host whose clock advances by fixed steps (fetch 20 ms, decode 300 ms, upload
 * 100 ms CPU + 30 ms on `finish()`, bitmap 280 + 25 ms).
 *
 * @returns The record.
 */
async function decodeRecord(): Promise<DecodeBenchRecord> {
  let clock = 0;
  let gpu = 0;
  const host: DecodeHost = {
    now: () => clock,
    fetch: (url) => {
      clock += 20;
      const bytes = new Uint8Array(1000);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      bytes[25] = url.includes('png8') || url.includes('zone') ? 3 : 6;
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
  const pages = [
    ['rgba-2048', 2048, 2048],
    ['png8-2048', 2048, 2048],
    ['common', 1024, 512],
    ['zone-a', 256, 128],
  ] as const;
  return measureDecode(
    host,
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
      ? nextPowerOfTwo(size.width) * nextPowerOfTwo(size.height) * 4
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
  it('sweeps 25 frame sizes, 150 plain rows then 22 knob rows', () => {
    expect(BENCH_SIZES).toHaveLength(25);
    expect(BENCH_SIZES.filter((size) => size.art === 'scaled')).toHaveLength(11);
    expect(BENCH_SIZES.filter((size) => size.art === 'native')).toHaveLength(14);
    expect(BENCH_DENSITIES).toEqual([1, 1.33, 1.5, 2, 2.25, 2.4, 2.5, 2.67]);
    expect(BENCH_SCENARIOS).toHaveLength(172);
    expect(BENCH_SCENARIOS.filter((s) => s.knob === null)).toHaveLength(
      BENCH_SIZES.length * BENCH_VARIANTS.length,
    );
    expect(BENCH_SCENARIOS.filter((s) => s.knob !== null)).toHaveLength(22);
    expect(BENCH_KNOBS.map((knob) => knob.id)).toEqual([
      'fit',
      'stretch',
      'interp',
      'out720',
      'out540',
    ]);
    // Plain rows first, sizes outer: the 384×216 baseline is the first resolution measured.
    expect(BENCH_SCENARIOS[0].id).toBe('384x216-busy');
    expect(BENCH_SCENARIOS[149].id).toBe('1920x1080n-worst');
    expect(BENCH_SCENARIOS[150].id).toBe('800x600-busy-fit');
    expect(BENCH_SCENARIOS[171].id).toBe('640x360-worst-out540');
    BENCH_SCENARIOS.forEach((s, i) => {
      expect(s.index).toBe(i);
      expect(s.id).toBe(`${s.size.id}-${s.row}`);
    });
    expect(new Set(BENCH_SCENARIOS.map((s) => s.id)).size).toBe(172);
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
  });
});

describe('render bench: the decode scenario follows the matrix (R1-05 B4)', () => {
  it('appends one page load to the run, after the matrix’s last scenario', () => {
    expect([DECODE_SCENARIO_ID, DECODE_SCENARIO_INDEX, BENCH_RUN_LENGTH]).toEqual([
      'decode',
      172,
      173,
    ]);
  });

  it('draws its synthetic pages the same on every machine (integer maths only)', () => {
    const sha = (mode: 'rgba' | 'png8'): string =>
      createHash('sha256').update(decodeArtImage(mode, 256).data).digest('hex');
    expect(sha('rgba')).toBe('14871fc4e03574a43b1c403b95bc269b4c3078c9b5854b8d6da18495d2e27f92');
    expect(sha('png8')).toBe('fe309d05c530d3f4be9e5b8528123702d518f997bb0a33afae6c7db5fb74c19a');
  });

  it('builds a record of every page with each stage as [min, p50, p95, max]', async () => {
    const record = await decodeRecord();
    expect(record).toMatchObject({ scenario: 'decode', index: 172, repetitions: 4, error: null });
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

  it('opens the decode scenario too and checks its four pages (R1-05 B4)', () => {
    expect(perf).toContain("runTvScenario(tvUrl, DECODE_SCENARIO_ID, '&reps=2')");
    expect(perf).toContain('DECODE_PAGE_IDS');
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
    expect(report).toContain('172 of 172 scenario(s) measured, run complete');
    // 640x360 busy: synced p95 4.5 × 1.5 over the baseline's 4 → 1.50×; two-tick 3 % vs 2 % → +1.0.
    expect(report).toContain('| busy | 1 | 3.00 / 4.50 | 4.50 / 6.00 | 1.50× | 3.0 | +1.0 |');
    expect(report).toContain('## Plan §13 at 640×360');
    // A session from before the decode scenario has no decode table.
    expect(readBenchSession(file).decode).toBeNull();
    expect(report).not.toContain('## Decode and upload');
  });

  it('carries the decode record in the run’s last payload, through to the analyzer (R1-05 B4)', async () => {
    const decode = await decodeRecord();
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
      '| rgba-2048 | 2048×2048 | rgba | 1 | 20.00 / 20.00 | 300.00 / 300.00 | 100.00 / 100.00 |' +
        ' 130.00 / 130.00 | 450.00 / 450.00 | 450.00 | 280.00 / 280.00 | 130.00 / 130.00 |',
    );
    // 450 + 2 × 450 cold; 130 + 2 × 130 as uploads only.
    expect(report).toContain('**1350 ms**, within R3-04’s 2000 ms');
    expect(report).toContain('**390 ms**, within R3-04’s 2000 ms');
  });
});
