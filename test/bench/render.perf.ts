/**
 * `pnpm bench` — the **render** benchmark of plan M3-02c (the render review's **F10**: until this
 * step nothing in the repo measured `renderer.render()` at all; `stress.perf.ts`, `zones.perf.ts`
 * and `soak.perf.ts` all drive the simulation headlessly in Node).
 *
 * It builds `render-harness/` with Vite (the repo's own `shmupContent()` / `shmupAssets()`
 * plugins, so the shipped content and the real atlas go in), serves it over a throwaway HTTP
 * server and drives it in Playwright's Chromium — a real WebGL context, the real two-pass
 * renderer, the real simulation. Each scenario gets its own page, because Pixi's `TexturePool` is
 * a global that never releases a texture: one page, one pooled-render-target total.
 *
 * **Scenarios** are the worst-case frames the review names: the enemy-bullet pool full (512), the
 * point-item pool all but full (a bomber's screen clear turns bullets into points, re-run on every
 * tick that freed a slot; the measured floor is 489 of 512, the rest reaching the score during the
 * tick), the particle pool full, CRT `off` / `light` / `full`, a stage with
 * layer effects (`raster-range`) and one with the Mode-7 floor (`dimension`). Each scenario
 * asserts the *minimum* live count over the measured frames, so the stated load is the load every
 * timed frame carried. The **internal frame size is a parameter** (review §7.5): the scenarios
 * run at the shipped frame (`FRAME_W` × `FRAME_H` from `@shmup/core` — 640×360 since R2-01,
 * 384×216 before), and the last one runs the same load at ×2 of it (1280×720 — the first integer
 * step the owner would try), so "what would a higher internal resolution cost?" is a bench run.
 *
 * **What the numbers mean.** Draw calls are hardware-independent and are the strict gate. Render
 * ms is CPU time inside `renderer.render()` on **SwiftShader** — software WebGL on whatever
 * machine runs the bench — so it is a *regression* gate, not a prediction of the M7: the
 * generous {@link RENDER_P95_BUDGET_MS} catches a path that got structurally more expensive, and
 * the on-device numbers come from the overlay (`docs/dev/rendering-and-shell.md`, "Measuring on
 * the TV"). The heap delta is the gate the review's **F5** needs: our Node allocation guards stop
 * at the `renderer.render()` boundary and cannot see Pixi's batch-buffer growth or its lazy
 * per-sprite allocation. A deliberately leaky fixture proves that gate actually fails.
 *
 * **The TV render bench's scenes (plan R0-02).** The second suite builds the bench widget exactly
 * as `pnpm bench:tv` does (`apps/tizen/vite.bench.config.ts`, mode `bench`) and opens each of its
 * 172 scenarios headlessly (`?scenario=<id>` — the resolution sweep's 25 frame sizes, from 384×216
 * to 1920×1080 in the `scaled` and `native` art modes, each busy, with a filtered layer, Mode-7,
 * CRT light / full and all at once, then the 22 knob rows) on a 1280×720 display. It gates
 * **counts only** (`tvBenchViolations`: the load, draw calls, pooled render targets, the atlas
 * pages of the density — {@link TV_BENCH_PAGES} —, the heap) — the milliseconds are for the TV
 * (R0-03). Since plan
 * R1-05 (B4) it also opens the bench's **decode scenario** (`?scenario=decode&reps=2`) and checks
 * its shape: the pages fetched, decoded and uploaded, with their sizes, encodings and bytes — since
 * plan R3-04.M4a that is the stand-in zone A page first, then the shipped `common` and `zone-a`
 * pages, every shape read off `buildDecodePages()` rather than pinned. And since plan **R3-04.M4b**
 * the run ends head-to-head with the TV run: it opens the bench's last page load, the **stand-in
 * load** (`?scenario=standin-zone`), and gates the one 640×360 frame it draws from those pages with
 * `standinBenchViolations` — counts and the ordinary budgets, never milliseconds raised; plan
 * R3-04's zone-load figure itself rides on the decode scenario's page timings (decision W5-19).
 *
 * Not part of `pnpm test`: it needs a browser and a quiet machine.
 *
 * @module
 */
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { FRAME_H, FRAME_W, TILE_SIZE } from '@shmup/core';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { clientConditions, shmupAssets, shmupContent } from '../../vite.shared.js';
import {
  BENCH_DENSITIES,
  BENCH_SCENARIOS,
  BENCH_SIZES,
  BENCH_V2_SIZE,
} from '../../apps/tizen/src/bench/matrix.js';
import {
  DECODE_SCENARIO_ID,
  STANDIN_SCENARIO_ID,
  STANDIN_SCENARIO_INDEX,
} from '../../apps/tizen/src/bench/decode.js';
import {
  DECODE_PAGE_IDS,
  buildDecodePages,
  buildDecodeStandin,
  decodePageFile,
  pngColorType,
} from '../../apps/tizen/scripts/bench-decode.mjs';
import type {
  DecodeBenchRecord,
  RenderBenchRecord,
} from '../../packages/shell/src/telemetry/index.js';
import {
  HEAP_BUDGET,
  nextPowerOfTwo,
  pooledRenderTargetBytes,
  renderBenchViolations,
  renderGroupViolations,
  tvBenchViolations,
} from './render-harness/bench-gates.js';
import { WARMUP_TICKS, standinBenchViolations, standinEnemyCopies } from './render-harness/load.js';
import type { RenderBenchOptions, RenderBenchResult } from './render-harness/protocol.js';

// Re-exported so the budgets are still readable from this file, where the docs name them.
export {
  DRAW_CALL_BUDGET,
  MIN_LIVE_LOAD,
  RENDER_P95_BUDGET_MS,
  SCENE_REBUILD_BUDGET,
} from './render-harness/bench-gates.js';
export { WARMUP_TICKS } from './render-harness/load.js';

/** The harness sources. */
const HARNESS_DIR = fileURLToPath(new URL('./render-harness', import.meta.url));

/** Where the built harness lands (inside `node_modules/`, so it is never committed). */
const OUT_DIR = fileURLToPath(
  new URL('../../node_modules/.cache/shmup-render-bench', import.meta.url),
);

/**
 * Canvas size every scenario renders to, in CSS pixels: 1280×720, a whole multiple of 640×360 (×2)
 * as well as 384×216 (×3 fits) — plan R0-02 (it was 960×540, which the v2 frame does not divide).
 */
export const DISPLAY_WIDTH = 1280;

/** See {@link DISPLAY_WIDTH}. */
export const DISPLAY_HEIGHT = 720;

/**
 * Frames rendered before the measurement: every GL program the scenario uses links on its first
 * *draw* (review F4) and Pixi's batch buffer doubles up to the busiest frame (review F5), and
 * neither belongs in a steady-state percentile.
 */
export const WARMUP_FRAMES = 60;

/** Frames measured per scenario (the heap gate wants a few hundred — review F10). */
export const BENCH_FRAMES = 600;

/** Objects the leak fixture allocates per frame — enough to blow `HEAP_BUDGET` clearly. */
const LEAK_PER_FRAME = 2000;

/** One measured configuration. */
interface Scenario {
  /** Name printed in the summary. */
  readonly id: string;
  /** What the scenario is there to measure. */
  readonly what: string;
  /** Scenario options for the harness. */
  readonly options: RenderBenchOptions;
  /**
   * Extra checks that the scenario really was under the load it claims.
   *
   * @param result - What the harness measured.
   */
  readonly check?: (result: RenderBenchResult) => void;
}

/**
 * The default worst-case load at the shipped internal resolution.
 *
 * @param overrides - What this scenario changes.
 * @returns The harness options.
 */
function load(overrides: Partial<RenderBenchOptions> = {}): RenderBenchOptions {
  return {
    stage: 'zone-a',
    width: FRAME_W,
    height: FRAME_H,
    displayWidth: DISPLAY_WIDTH,
    displayHeight: DISPLAY_HEIGHT,
    crt: 'off',
    warmupTicks: WARMUP_TICKS,
    warmupFrames: WARMUP_FRAMES,
    frames: BENCH_FRAMES,
    leakPerFrame: 0,
    ...overrides,
  };
}

/** The scenarios, in the order they are printed. */
const SCENARIOS: readonly Scenario[] = [
  {
    id: 'worst-case, CRT off',
    what: 'the baseline busy frame: 512 bullets, the point-item pool and the particle pool full',
    options: load(),
  },
  {
    id: 'worst-case, CRT light',
    what: 'review F2 — `light` runs the same program as `full`; since M3-02d, also the same pass',
    options: load({ crt: 'light' }),
    check: (result) => {
      expect(result.renderTargetBytes, 'M3-02d: the CRT pools no render target').toBe(0);
    },
  },
  {
    id: 'worst-case, CRT full',
    what: 'review F2 — M3-02d folded the CRT into the blit: no pooled target, no second pass',
    options: load({ crt: 'full' }),
    check: (result) => {
      expect(result.renderTargetBytes, 'M3-02d: the CRT pools no render target').toBe(0);
    },
  },
  {
    id: 'layer effects (raster-range)',
    what: 'a filtered layer on top of the busy frame (M2-08 raster effects)',
    options: load({ stage: 'raster-range' }),
    check: (result) => {
      expect(result.layerEffectMask, 'a layer effect must be attached').toBeGreaterThan(0);
    },
  },
  {
    id: 'Mode-7 floor (dimension)',
    what: 'review F6 — M3-02d draws the floor as a mesh, so it pools no target either',
    options: load({ stage: 'dimension' }),
    check: (result) => {
      expect(result.mode7, 'the Mode-7 floor must be drawn').toBe(true);
      expect(result.renderTargetBytes, 'M3-02d: the floor pools no render target').toBe(0);
    },
  },
  {
    id: 'worst-case, CRT off, one render group',
    what:
      'review F1 / M1 — the pre-M3-02e scene, where hiding one sprite re-walks all ~6,400 ' +
      'display objects: the same load as the baseline, measured against it in this same run',
    options: load({ renderGroups: false }),
    check: (result) => {
      // The point of the A/B: without the layer groups the scene is one group, and essentially
      // every frame rebuilds it.
      expect(result.groupRebuilds).toBe(result.structureRebuilds);
      expect(result.structureRebuilds).toBeGreaterThan(result.frames * 0.9);
    },
  },
  {
    // `768x432 internal (raster-range)` at the 384×216 frame.
    id: `${2 * FRAME_W}x${2 * FRAME_H} internal (raster-range)`,
    what: 'review §7.5 — the layer-effect scenario at ×2 of the shipped internal resolution',
    options: load({ stage: 'raster-range', width: 2 * FRAME_W, height: 2 * FRAME_H }),
    check: (result) => {
      expect(result.layerEffectMask, 'a layer effect must be attached').toBeGreaterThan(0);
      // The knob's whole point: a filter pass is pooled at the *internal* frame size (review F3).
      // Since pixi.js 8.21 each axis is the next power of two capped by the screen the page
      // registers (here the 1280×720 display), so at the v2 frame 1024×512 survives and at ×2 of
      // it the pass pools exactly 1280×720. The pure power-of-two size — what every axis pooled
      // to in 8.20 and earlier — stays the ceiling: the scenario draws one filtered layer and the
      // pass's own area is four times the shipped frame's.
      expect(result.renderTargetBytes).toBeGreaterThanOrEqual(
        pooledRenderTargetBytes(2 * FRAME_W, 2 * FRAME_H, DISPLAY_WIDTH, DISPLAY_HEIGHT),
      );
      expect(result.renderTargetBytes).toBeLessThanOrEqual(
        nextPowerOfTwo(2 * FRAME_W) * nextPowerOfTwo(2 * FRAME_H) * 4,
      );
    },
  },
];

/** MIME types the static server needs. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

/**
 * Serves the built harness on an ephemeral port (no directory traversal: every path is resolved
 * inside the output directory).
 *
 * @param root - The directory to serve.
 * @returns The server and its base URL.
 */
async function serve(root: string): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    const file = join(root, normalize(path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/` };
}

/**
 * Builds the harness bundle.
 *
 * @returns Resolves when `OUT_DIR` holds the page.
 */
async function buildHarness(): Promise<void> {
  await build({
    configFile: false,
    root: HARNESS_DIR,
    base: './',
    logLevel: 'warn',
    plugins: [shmupContent(), shmupAssets()],
    resolve: { conditions: clientConditions },
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true,
      target: 'chrome69',
      minify: false,
      sourcemap: false,
      assetsInlineLimit: 0,
    },
  });
}

let browser: Browser;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await buildHarness();
  const served = await serve(OUT_DIR);
  server = served.server;
  baseUrl = served.url;
  // The environment without DISPLAY: a stale forwarded X display makes ANGLE's SwiftShader
  // back-end hang on context creation (same reason as `test/e2e/playwright.config.ts`).
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (name !== 'DISPLAY' && value !== undefined) env[name] = value;
  }
  browser = await chromium.launch({
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      // `performance.memory` in bytes rather than 100 KB buckets, and a real `gc()`.
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
    env,
  });
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => {
    if (server === undefined) {
      resolve();
      return;
    }
    server.close(() => {
      resolve();
    });
  });
});

/**
 * Runs one scenario in its own page.
 *
 * @param options - The scenario.
 * @returns What the harness measured.
 */
async function runScenario(options: RenderBenchOptions): Promise<RenderBenchResult> {
  const page = await browser.newPage({
    viewport: { width: options.displayWidth, height: options.displayHeight },
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await page.goto(baseUrl);
    await page.waitForSelector('body[data-shmup-render-bench="ready"]', { timeout: 60_000 });
    const result = await page.evaluate(
      (scenario) =>
        (
          window as unknown as {
            __shmupRenderBench: { run(o: RenderBenchOptions): Promise<RenderBenchResult> };
          }
        ).__shmupRenderBench.run(scenario),
      options,
    );
    expect(errors, 'the page must not log errors').toEqual([]);
    return result;
  } finally {
    await page.close();
  }
}

/**
 * Prints one scenario's line of the `[bench]` summary.
 *
 * @param id - Scenario name.
 * @param options - What it asked for.
 * @param result - What it measured.
 */
function report(id: string, options: RenderBenchOptions, result: RenderBenchResult): void {
  console.info(
    `[bench] render ${id}: ${options.width}x${options.height} internal, CRT ${options.crt} — ` +
      `p95 ${result.renderP95Ms.toFixed(2)} ms (median ${result.renderMedianMs.toFixed(2)}, ` +
      `max ${result.renderMaxMs.toFixed(2)}), ${result.drawCalls} draw calls, ` +
      `${(result.renderTargetBytes / 1024).toFixed(0)} KB pooled render targets ` +
      `(+ ${((options.width * options.height * 4) / 1024).toFixed(0)} KB frame target), ` +
      `${result.structureRebuilds}/${result.frames + options.warmupFrames} scene rebuilds ` +
      `(${result.groupRebuilds} render-group rebuilds), ` +
      `heap ${(result.heapDeltaBytes / 1024).toFixed(0)} KB over ${result.frames} frames ` +
      `[WebGL ${result.webGLVersion}; per-frame minimum load ${result.bullets} bullets, ` +
      `${result.points} points, ${result.particles} particles; ` +
      `camera x ${result.cameraX}, ${result.worldStatus}]`,
  );
}

describe('bench: render (worst-case frames through the real renderer, M3-02c)', () => {
  /** Every scenario's result, by id — read by the M3-02d comparison below. */
  const results = new Map<string, RenderBenchResult>();

  for (const scenario of SCENARIOS) {
    it(`${scenario.id} — ${scenario.what}`, async () => {
      const result = await runScenario(scenario.options);
      results.set(scenario.id, result);
      report(scenario.id, scenario.options, result);
      // The load floors first, then the budgets — `renderBenchViolations` (its own module, unit
      // tested in `test/integration/render-bench.test.ts`). Each live count is the *smallest* the
      // harness saw over the measured frames, so the load holds for every frame that was timed,
      // not just the last one: a scenario that measured an empty scene fails here.
      expect(renderBenchViolations(result)).toEqual([]);
      // M3-02e: and the render groups did what this scenario's configuration says they must —
      // the shipped scene never re-walking all ~6,400 objects, the deliberate one-group arm
      // doing it on every frame.
      expect(renderGroupViolations(result, scenario.options.renderGroups !== false)).toEqual([]);
      scenario.check?.(result);
    }, 300_000);
  }

  it('CRT `full` costs what CRT `off` costs (M3-02d, review F2)', () => {
    const off = results.get('worst-case, CRT off');
    const light = results.get('worst-case, CRT light');
    const full = results.get('worst-case, CRT full');
    expect(
      [off, light, full].every((r) => r !== undefined),
      'the CRT scenarios must have run',
    ).toBe(true);
    if (off === undefined || light === undefined || full === undefined) return;
    // The hardware-independent gate: the CRT look is the blit's own shader, so it adds no draw
    // call and no pooled render target. Before M3-02d this was 5 draw calls and 2,048 KB.
    expect([light.drawCalls, full.drawCalls]).toEqual([off.drawCalls, off.drawCalls]);
    expect([light.renderTargetBytes, full.renderTargetBytes]).toEqual([0, 0]);
    expect(off.renderTargetBytes).toBe(0);
    // The milliseconds are only reported. Under SwiftShader the renderer is CPU-bound, so even
    // the pre-M3-02d filter path cost just ~12 % more p95 here while costing 2x the fill on the
    // TV — a tight time gate would be flaky without detecting anything the counts above miss.
    // A quiet run measures CRT `full` at 0.94x CRT `off` (the step's "within ~10 %").
    console.info(
      `[bench] render CRT p95 ratio: light ${(light.renderP95Ms / off.renderP95Ms).toFixed(2)}x, ` +
        `full ${(full.renderP95Ms / off.renderP95Ms).toFixed(2)}x of CRT off`,
    );
    expect(full.renderP95Ms).toBeLessThan(off.renderP95Ms * 2);
  });

  it('the layer render groups stop the whole scene being rebuilt (M3-02e, review F1)', () => {
    const grouped = results.get('worst-case, CRT off');
    const single = results.get('worst-case, CRT off, one render group');
    expect(
      [grouped, single].every((r) => r !== undefined),
      'both render-group scenarios must have run',
    ).toBe(true);
    if (grouped === undefined || single === undefined) return;
    // The hardware-independent gate, and the one the review's F1 is about: with one render group
    // essentially every frame throws the whole instruction set away; with the layer groups the
    // scene's own group is rebuilt on almost none.
    expect(single.structureRebuilds).toBeGreaterThan(single.frames * 0.9);
    expect(grouped.structureRebuilds).toBeLessThan(single.structureRebuilds / 10);
    // And the churn did not merely vanish from the counter: it moved into the layer groups, each
    // a fraction of the scene. This is the figure that keeps the one above honest.
    expect(grouped.groupRebuilds).toBeGreaterThan(0);
    // Both ran the same load through the same page, so the draw-call cost of the boundaries is
    // comparable too.
    console.info(
      `[bench] render group A/B: ${grouped.structureRebuilds} vs ${single.structureRebuilds} ` +
        `scene rebuilds, ${grouped.groupRebuilds} vs ${single.groupRebuilds} group rebuilds, ` +
        `${grouped.drawCalls} vs ${single.drawCalls} draw calls, p95 ` +
        `${(grouped.renderP95Ms / single.renderP95Ms).toFixed(2)}x of the single-group scene`,
    );
  });

  it('the heap gate fails on a deliberately leaky frame', async () => {
    const options = load({ frames: 200, warmupFrames: 20, leakPerFrame: LEAK_PER_FRAME });
    const result = await runScenario(options);
    report('leak fixture', options, result);
    expect(result.heapMeasured, 'the bench needs --enable-precise-memory-info').toBe(true);
    expect(result.heapDeltaBytes).toBeGreaterThan(HEAP_BUDGET);
  }, 300_000);
});

/** Where the TV render bench is built for the headless run (in `node_modules/`, never committed). */
const TV_BENCH_OUT_DIR = fileURLToPath(
  new URL('../../node_modules/.cache/shmup-tv-bench', import.meta.url),
);

/**
 * Atlas pages each density of the TV bench must have: the modelled ×s atlas is the 1024² source
 * page scaled ×s and re-packed into pages of at most 2048² (`apps/tizen/scripts/bench-atlas.mjs`
 * `benchPageCount`, `ceil(s² / 4)`) — one page up to ×2 (×1.5 is one 2048×1024 page, ×2 one 2048²),
 * two 2048×1024 pages from ×2.25 to ×2.67. Its keys are the matrix's `BENCH_DENSITIES`.
 */
export const TV_BENCH_PAGES: Readonly<Record<number, number>> = Object.freeze({
  1: 1,
  1.33: 1,
  1.5: 1,
  2: 1,
  2.25: 2,
  2.4: 2,
  2.5: 2,
  2.67: 2,
});

/**
 * Runs one TV-bench scenario in its own page (`?scenario=<id>` — the bench's headless mode).
 *
 * @param url - The served bench.
 * @param id - Scenario id.
 * @param extra - More query parameters, e.g. `'&reps=2'` (default none).
 * @returns What the page published.
 */
async function runTvScenario(
  url: string,
  id: string,
  extra = '',
): Promise<{ record: RenderBenchRecord | null; decode?: DecodeBenchRecord; error: string | null }> {
  const page = await browser.newPage({
    viewport: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await page.goto(`${url}?scenario=${encodeURIComponent(id)}${extra}`);
    await page.waitForSelector(
      'body[data-shmup-tv-bench="done"], body[data-shmup-tv-bench="error"]',
      { timeout: 120_000 },
    );
    const outcome = await page.evaluate(
      () =>
        (
          window as unknown as {
            __shmupTvBench: {
              record: RenderBenchRecord | null;
              decode?: DecodeBenchRecord;
              error: string | null;
            };
          }
        ).__shmupTvBench,
    );
    expect(errors, 'the page must not log errors').toEqual([]);
    return outcome;
  } finally {
    await page.close();
  }
}

describe('bench: the TV render bench scenes, headless (plan R0-02)', () => {
  let tvServer: Server | undefined;
  let tvUrl = '';
  /** Every scenario's record, by id. */
  const records = new Map<string, RenderBenchRecord>();

  beforeAll(async () => {
    // Exactly what `pnpm bench:tv` builds (the bench mode, its own config), into a cache folder.
    const appDir = fileURLToPath(new URL('../../apps/tizen/', import.meta.url));
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await build({
        root: join(appDir, 'bench'),
        configFile: join(appDir, 'vite.bench.config.ts'),
        mode: 'bench',
        logLevel: 'warn',
        build: { outDir: TV_BENCH_OUT_DIR, emptyOutDir: true },
      });
    } finally {
      process.env.NODE_ENV = previous;
    }
    const served = await serve(TV_BENCH_OUT_DIR);
    tvServer = served.server;
    tvUrl = served.url;
  }, 300_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (tvServer === undefined) {
        resolve();
        return;
      }
      tvServer.close(() => {
        resolve();
      });
    });
  });

  for (const scenario of BENCH_SCENARIOS) {
    it(`${scenario.id} — counted gates (draw calls, render targets, pages, heap)`, async () => {
      const outcome = await runTvScenario(tvUrl, scenario.id);
      expect(outcome.error).toBeNull();
      const record = outcome.record as RenderBenchRecord;
      records.set(scenario.id, record);
      console.info(
        `[bench] tv ${scenario.id}: render p95 ${record.renderMs[2].toFixed(2)} ms, synced p95 ` +
          `${record.syncedMs[2].toFixed(2)} ms (SwiftShader — not the M7), ${record.drawCalls} ` +
          `draw calls, ${(record.renderTargetBytes / 1024).toFixed(0)} KB pooled targets, ` +
          `${(record.textureBytes / 1024).toFixed(0)} KB atlas in ${record.atlasPages} page(s), ` +
          `heap ${(record.heapDeltaBytes / 1024).toFixed(0)} KB, ${record.frames}+` +
          `${record.syncedFrames} frames [WebGL ${record.webGLVersion}, ×${record.scale}]`,
      );
      expect(record.scenario).toBe(scenario.id);
      expect([record.width, record.height, record.density]).toEqual([
        scenario.size.width,
        scenario.size.height,
        scenario.size.density,
      ]);
      expect(
        tvBenchViolations(record, { atlasPages: TV_BENCH_PAGES[scenario.size.density] }),
      ).toEqual([]);
    }, 300_000);
  }

  it('decode — fetches, decodes and uploads the stand-in and shipped pages (R1-05 B4, R3-04.M4a)', async () => {
    const outcome = await runTvScenario(tvUrl, DECODE_SCENARIO_ID, '&reps=2');
    expect(outcome.error).toBeNull();
    const decode = outcome.decode as DecodeBenchRecord;
    expect(decode.pages.map((page) => page.id)).toEqual(DECODE_PAGE_IDS);
    expect(decode.repetitions).toBe(2);
    for (const page of decode.pages) {
      const bytes = statSync(join(TV_BENCH_OUT_DIR, 'assets/atlas', decodePageFile(page.id))).size;
      console.info(
        `[bench] tv decode ${page.id} ${page.width}x${page.height} ${page.encoding} ` +
          `${(page.bytes / 1024).toFixed(0)} KB: fetch ${page.fetchMs?.[1]} ms, decode ` +
          `${page.decodeMs?.[1]} ms, upload ${page.uploadSyncedMs?.[1]} ms, bitmap ` +
          `${page.bitmapMs?.[1]} / ${page.bitmapUploadMs?.[1]} ms (SwiftShader — not the M7)`,
      );
      expect(page.error, page.id).toBeNull();
      expect(page.bytes).toBe(bytes);
      expect(page.repetitions).toBe(2);
      for (const stage of [page.fetchMs, page.decodeMs, page.uploadMs, page.uploadSyncedMs]) {
        expect(stage?.every((ms) => Number.isFinite(ms) && ms >= 0)).toBe(true);
      }
      // Chromium has createImageBitmap, so the alternative path is measured too.
      expect(page.bitmapMs).not.toBeNull();
    }
    // The pages and their shapes come from the same deterministic build the bench plugin baked —
    // since R3-04.M4a the stand-in zone's own page first, then `common` and `zone-a` (no more
    // synthetic 2048² pages, and the shipped pages are PNG-8 since R1-05).
    const built = buildDecodePages();
    expect(decode.pages.map((page) => [page.id, page.width, page.height])).toEqual(
      built.map((page) => [page.id, page.width, page.height]),
    );
    expect(decode.pages.map((page) => page.encoding)).toEqual(
      built.map((page) => (pngColorType(page.png) === 3 ? 'png8' : 'rgba')),
    );
    expect(decode.imageBitmap).toBe(true);
  }, 300_000);

  it('standin-zone — draws one frame of the zone from those pages (R3-04.M4b)', async () => {
    const outcome = await runTvScenario(tvUrl, STANDIN_SCENARIO_ID);
    expect(outcome.error).toBeNull();
    const record = outcome.record as RenderBenchRecord;
    // The scene's expectation: the same pruned manifest the bench build baked into the page
    // (`apps/tizen/scripts/bench-atlas.mjs`, plan R3-04.M4a), read here in Node. The tiles are the
    // frame's tile columns twice over (a ceiling row and a floor row), as `scene.ts` places them.
    const standin = buildDecodeStandin();
    const expected = {
      scenario: STANDIN_SCENARIO_ID,
      index: STANDIN_SCENARIO_INDEX,
      width: BENCH_V2_SIZE.width,
      height: BENCH_V2_SIZE.height,
      atlasPages: standin.manifest.pages.length,
      textureBytes: standin.manifest.pages.reduce((bytes, page) => bytes + page.w * page.h * 4, 0),
      enemies: standinEnemyCopies(Object.keys(standin.manifest.sprites)),
      tiles: (Math.ceil(BENCH_V2_SIZE.width / TILE_SIZE) + 1) * 2,
    };
    console.info(
      `[bench] tv ${STANDIN_SCENARIO_ID}: render ${record.renderMs[1].toFixed(2)} ms, synced ` +
        `${record.syncedMs[1].toFixed(2)} ms (SwiftShader — not the M7), ${record.drawCalls} ` +
        `draw calls, ${(record.textureBytes / 1024).toFixed(0)} KB atlas in ${record.atlasPages} ` +
        `page(s), ${record.load.enemies} enemies + ${record.load.tiles} tiles, heap ` +
        `${(record.heapDeltaBytes / 1024).toFixed(0)} KB [WebGL ${record.webGLVersion}]`,
    );
    expect(standinBenchViolations(record, expected)).toEqual([]);
  }, 300_000);

  it('reports every size with the atlas page count of its density', () => {
    // Sorted: an object lists integer keys (1, 2) before the others.
    const densities = Object.keys(TV_BENCH_PAGES)
      .map(Number)
      .sort((a, b) => a - b);
    expect(densities).toEqual(BENCH_DENSITIES);
    const pages = BENCH_SIZES.map((size) => {
      const record = records.get(`${size.id}-busy`);
      expect(record, `${size.id}-busy must have run`).toBeDefined();
      return record?.atlasPages ?? -1;
    });
    expect(pages).toEqual(BENCH_SIZES.map((size) => TV_BENCH_PAGES[size.density]));
    // R0-02's three rows keep their pages: 1, 1, 2.
    expect(
      ['384x216', '640x360', '960x540'].map((id) => records.get(`${id}-busy`)?.atlasPages),
    ).toEqual([1, 1, 2]);
    // Each size renders its whole own frame. A `scaled` row keeps the v2 frame's field of view
    // (s = height / 240); a `native` row draws the ×1 art, so a bigger frame shows more world.
    for (const size of BENCH_SIZES) {
      expect(records.get(`${size.id}-busy`)?.frameTargetBytes).toBe(size.width * size.height * 4);
    }
  });
});
