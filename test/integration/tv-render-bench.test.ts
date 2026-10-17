/**
 * The TV render bench end to end, headless (plan R0-02): the counted gate `pnpm bench` reads every
 * scenario through (`test/bench/render-harness/gates.ts` `tvBenchViolations`), the wiring of the
 * browser half to it, and the results pipeline — records built the way the bench builds them, sent
 * as `render-bench` payloads through `@shmup/shell`'s wire format to the input probe's real log
 * server, stored, and turned by `results/analyze-bench.mjs` into the tables relative to the
 * session's own 384×216 rows.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BENCH_SCENARIOS } from '../../apps/tizen/src/bench/matrix.js';
// Relative source imports, as `render-telemetry-pipeline.test.ts` does: the root suite does not
// depend on `@shmup/shell`.
import {
  RENDER_BENCH_KIND,
  buildRenderBenchPayload,
  makeRenderBenchSessionId,
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
    variant: variant.id,
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

describe('render bench: the headless driver gates every TV scenario', () => {
  const perf = readFileSync(
    fileURLToPath(new URL('../bench/render.perf.ts', import.meta.url)),
    'utf8',
  );

  it('opens every scenario of the matrix and gates it by counts with the pages 1, 1, 2', () => {
    expect(perf).toContain('for (const scenario of BENCH_SCENARIOS)');
    expect(perf).toContain(
      'tvBenchViolations(record, { atlasPages: TV_BENCH_PAGES[scenario.size.density] })',
    );
    expect(perf).toMatch(/1: 1,\s*1\.5: 1,\s*2\.25: 2,/);
    expect(perf).toContain("configFile: join(appDir, 'vite.bench.config.ts')");
    expect(perf).toContain("mode: 'bench'");
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
    expect(report).toContain('18 of 18 scenario(s) measured, run complete');
    // 640x360 busy: synced p95 4.5 × 1.5 over the baseline's 4 → 1.50×; two-tick 3 % vs 2 % → +1.0.
    expect(report).toContain('| busy | 1 | 3.00 / 4.50 | 4.50 / 6.00 | 1.50× | 3.0 | +1.0 |');
    expect(report).toContain('## Plan §13 at 640×360');
  });
});
