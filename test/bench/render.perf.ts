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
 * point-item pool full (512 — a bomber's screen clear turns bullets into points), the particle
 * pool full, CRT `off` / `light` / `full`, a stage with layer effects (`raster-range`) and one
 * with the Mode-7 floor (`dimension`). The **internal frame size is a parameter** (review §7.5):
 * the last scenario runs the same load at 768×432 (×2 of the shipped 384×216 — the first integer
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
 * Not part of `pnpm test`: it needs a browser and a quiet machine.
 *
 * @module
 */
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { clientConditions, shmupAssets, shmupContent } from '../../vite.shared.js';
import type { RenderBenchOptions, RenderBenchResult } from './render-harness/main.js';

/** The harness sources. */
const HARNESS_DIR = fileURLToPath(new URL('./render-harness', import.meta.url));

/** Where the built harness lands (inside `node_modules/`, so it is never committed). */
const OUT_DIR = fileURLToPath(
  new URL('../../node_modules/.cache/shmup-render-bench', import.meta.url),
);

/** Canvas size every scenario renders to, in CSS pixels. */
export const DISPLAY_WIDTH = 960;

/** See {@link DISPLAY_WIDTH}. */
export const DISPLAY_HEIGHT = 540;

/** Ticks played before a scenario measures (the camera has to reach the stages' effect ranges). */
export const WARMUP_TICKS = 260;

/**
 * Frames rendered before the measurement: every GL program the scenario uses links on its first
 * *draw* (review F4) and Pixi's batch buffer doubles up to the busiest frame (review F5), and
 * neither belongs in a steady-state percentile.
 */
export const WARMUP_FRAMES = 60;

/** Frames measured per scenario (the heap gate wants a few hundred — review F10). */
export const BENCH_FRAMES = 600;

/**
 * Most WebGL draw calls a measured frame may take. `shmup_feat.md` §22 allows 20–50; the two e2e
 * specs pin the plain frame at 12. This is the render bench's own ceiling, deliberately above the
 * e2e one because a scenario stacks the busiest frame, a filtered layer or the Mode-7 floor *and*
 * the CRT pass.
 */
export const DRAW_CALL_BUDGET = 20;

/**
 * Render-ms p95 budget under SwiftShader. Not the TV's 8 ms budget (`shmup_feat.md` §22): software
 * WebGL on a shared CI machine is one to two orders slower, and this exists to catch a *structural*
 * regression — a second full-screen pass appearing, the scene being walked twice — not to predict
 * the Mali-G51.
 */
export const RENDER_P95_BUDGET_MS = 16;

/** JS-heap growth a scenario may retain over {@link BENCH_FRAMES} frames, bytes. */
export const HEAP_BUDGET = 1024 * 1024;

/** Objects the leak fixture allocates per frame — enough to blow {@link HEAP_BUDGET} clearly. */
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
    width: 384,
    height: 216,
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
    what: 'the baseline busy frame: 512 bullets, 512 point items, the particle pool full',
    options: load(),
  },
  {
    id: 'worst-case, CRT light',
    what: 'review F2 — `light` runs the same program and the same extra pass as `full`',
    options: load({ crt: 'light' }),
  },
  {
    id: 'worst-case, CRT full',
    what: 'review F2 — the pooled render target and the second full-screen pass',
    options: load({ crt: 'full' }),
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
    what: 'review F6 — the floor renders a full-frame sprite into a pooled target',
    options: load({ stage: 'dimension' }),
    check: (result) => {
      expect(result.mode7, 'the Mode-7 floor must be drawn').toBe(true);
    },
  },
  {
    id: '768x432 internal (raster-range)',
    what: 'review §7.5 — the layer-effect scenario at ×2 of the shipped internal resolution',
    options: load({ stage: 'raster-range', width: 768, height: 432 }),
    check: (result) => {
      expect(result.layerEffectMask, 'a layer effect must be attached').toBeGreaterThan(0);
      // The knob's whole point: a filter pass is pooled at the *internal* frame size, rounded up
      // to the next power of two on each axis (review F3) — 512x256 at 384x216, 1024x512 at
      // 768x432. Four times the bytes, four times the fill.
      expect(result.renderTargetBytes).toBeGreaterThanOrEqual(1024 * 512 * 4);
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
      `${result.structureRebuilds}/${result.frames + options.warmupFrames} structure rebuilds, ` +
      `heap ${(result.heapDeltaBytes / 1024).toFixed(0)} KB over ${result.frames} frames ` +
      `[WebGL ${result.webGLVersion}; ${result.bullets} bullets, ${result.points} points, ` +
      `${result.particles} particles; camera x ${result.cameraX}, ${result.worldStatus}]`,
  );
}

describe('bench: render (worst-case frames through the real renderer, M3-02c)', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id} — ${scenario.what}`, async () => {
      const result = await runScenario(scenario.options);
      report(scenario.id, scenario.options, result);
      // The scenario really was under the load it claims.
      expect(result.bullets, 'the enemy-bullet pool must be full').toBeGreaterThan(400);
      expect(result.points, 'the point-item pool must be busy').toBeGreaterThan(200);
      expect(result.particles, 'the particle pool must be busy').toBeGreaterThan(100);
      scenario.check?.(result);
      // The gates.
      expect(result.drawCalls).toBeGreaterThan(0);
      expect(result.drawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
      expect(result.renderP95Ms).toBeLessThan(RENDER_P95_BUDGET_MS);
      if (result.heapMeasured) expect(result.heapDeltaBytes).toBeLessThan(HEAP_BUDGET);
    }, 300_000);
  }

  it('the heap gate fails on a deliberately leaky frame', async () => {
    const options = load({ frames: 200, warmupFrames: 20, leakPerFrame: LEAK_PER_FRAME });
    const result = await runScenario(options);
    report('leak fixture', options, result);
    expect(result.heapMeasured, 'the bench needs --enable-precise-memory-info').toBe(true);
    expect(result.heapDeltaBytes).toBeGreaterThan(HEAP_BUDGET);
  }, 300_000);
});
