/**
 * Page side of the render benchmark (plan M3-02c, the render review's **F10**): a purpose-built
 * bundle that puts the *real* renderer (`@shmup/render-pixi` `createPixiRenderer`) in front of the
 * *real* simulation (`@shmup/core` `createGame` on the shipped content) in a real WebGL context,
 * and measures `renderer.render()` frame by frame.
 *
 * It is not the game app: the bench has to choose the **internal frame size** (the review's §7.5 —
 * "does 768×432 still hold 60 fps?" should be a bench run, not a build-and-hope), the stage, the
 * CRT setting and the exact scene load, none of which the shipped shell exposes. Everything it
 * draws comes from the shipped packages and the shipped content, through the same two-pass path
 * the TV runs.
 *
 * `test/bench/render.perf.ts` builds this with Vite (the repo's own `shmupContent()` /
 * `shmupAssets()` plugins), opens the built page in Playwright's Chromium and calls
 * {@link RenderBenchApi.run} through `window.__shmupRenderBench`.
 *
 * **What is not here.** The scripted load (the tick order, the pool top-ups, the per-frame load
 * floor) lives in `load.ts`, the wire types in `protocol.ts` and the budgets in `gates.ts` — all
 * three free of the DOM and of the virtual modules, so `test/integration/render-bench.test.ts`
 * can pin them headlessly. This file is only the browser plumbing around them.
 *
 * @module
 */
import {
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
} from '@shmup/core';
import {
  FX_CONTENT_KIND,
  createAtlas,
  createPixiRenderer,
  createRenderTargetMeter,
  loadFxContent,
  type Atlas,
  type AtlasPageImage,
  type FxContent,
} from '@shmup/render-pixi';
import assets from 'virtual:shmup-assets';
import contentFiles from 'virtual:shmup-content';
import {
  BENCH_PARTICLE_CAPACITY,
  Lcg,
  benchTick,
  createLoadFloor,
  quantile,
  trackLoadFloor,
} from './load.js';
import type { RenderBenchApi, RenderBenchOptions, RenderBenchResult } from './protocol.js';

export type { RenderBenchApi, RenderBenchOptions, RenderBenchResult } from './protocol.js';

/** The canvas declared in `index.html`. */
const canvas = document.getElementById('game') as HTMLCanvasElement;

/** Cached shipped content (parsed once — every scenario reuses it). */
let db: ContentDb | null = null;

/** Cached particle presets (`content/fx/`). */
let fx: FxContent | null = null;

/** Cached atlas (one page, built from the emitted PNG). */
let atlas: Atlas | null = null;

/** Objects the leak fixture keeps alive. */
const leaked: unknown[] = [];

/**
 * Loads one atlas page.
 *
 * @param url - Page URL, relative to the page.
 * @returns The loaded image.
 */
function loadImage(url: string): Promise<AtlasPageImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = (): void => {
      resolve(image);
    };
    image.onerror = (): void => {
      reject(new Error(`render bench: atlas page ${url} failed to load`));
    };
    image.src = url;
  });
}

/**
 * Parses the shipped content and builds the atlas, once.
 *
 * @throws Error when the shipped content has issues (then the bench is measuring nothing real).
 */
async function ensureAssets(): Promise<void> {
  if (atlas !== null) return;
  const result = loadContent(contentFiles, {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  if (result.issues.length > 0) {
    throw new Error(`render bench: shipped content has issues: ${JSON.stringify(result.issues)}`);
  }
  db = result.db;
  const fxFiles = result.foreign.filter(
    (file) => (file.data as { kind?: string }).kind === FX_CONTENT_KIND,
  );
  fx = loadFxContent(fxFiles).content;
  const images = await Promise.all(assets.pageUrls.map(loadImage));
  atlas = createAtlas(assets.manifest, images, { onWarning: () => {} });
}

/**
 * Waits for the next animation frame.
 *
 * @returns Resolves on the frame.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

/** The JS heap reading Chromium offers (`--enable-precise-memory-info` makes it exact). */
interface HeapPerformance {
  readonly memory?: { readonly usedJSHeapSize: number };
}

/**
 * The used JS heap in bytes, or -1 when the browser does not report one.
 *
 * @returns The reading.
 */
function heapUsed(): number {
  const memory = (performance as unknown as HeapPerformance).memory;
  return memory === undefined ? -1 : memory.usedJSHeapSize;
}

/** Collects garbage when the page was given `--js-flags=--expose-gc`. */
function collect(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc === 'function') {
    gc();
    gc();
  }
}

/**
 * Runs one scenario.
 *
 * @param options - The scenario.
 * @returns What it measured.
 */
async function run(options: RenderBenchOptions): Promise<RenderBenchResult> {
  await ensureAssets();
  leaked.length = 0;
  canvas.width = options.displayWidth;
  canvas.height = options.displayHeight;
  canvas.style.width = `${options.displayWidth}px`;
  canvas.style.height = `${options.displayHeight}px`;
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: options.displayWidth,
    displayHeight: options.displayHeight,
    width: options.width,
    height: options.height,
    atlas,
    countDrawCalls: true,
    countStructureRebuilds: true,
    // Twice the shipped default (`PARTICLE_CAPACITY` = 256): a worst case, and a gate stricter
    // than reality — see `load.ts`.
    particleCapacity: BENCH_PARTICLE_CAPACITY,
  });
  try {
    if (fx !== null) renderer.setFxContent(fx);
    // The sprite tables the World's ids index into — without them the Mode-7 floor, the parallax
    // and every content sprite resolve to nothing (the shell does the same at boot).
    if (db !== null) renderer.setSpriteNames(db.sprites.names);
    renderer.setCrtFilter(options.crt);
    const game = createGame(
      createHeadlessPlatform({
        cssWidth: options.displayWidth,
        cssHeight: options.displayHeight,
      }),
      { seed: 1, stage: options.stage, loadout: 'full', autofire: true },
      db ?? undefined,
    );
    game.world.debugFlags.godMode = true;
    const random = new Lcg();
    // The scripted load and its order live in `load.ts` — and are pinned headlessly by
    // `test/integration/render-bench.test.ts`, because getting them wrong measures an empty
    // scene without saying so (M3-02c review round 1).
    const particlePool = renderer.particles;
    /** One simulated tick under the scripted worst-case load. */
    const tick = (): void => {
      benchTick(game, particlePool, random);
    };
    for (let i = 0; i < options.warmupTicks; i++) tick();
    for (let i = 0; i < options.warmupFrames; i++) {
      tick();
      renderer.render(game.renderFrame());
      await nextFrame();
    }
    collect();
    const heapBefore = heapUsed();
    const samples = new Float64Array(options.frames);
    const world = game.world;
    // The load is reported as the *smallest* live count any measured frame carried, so the
    // scenario's claim ("512 bullets, 512 point items, the particle pool full") is checked
    // against every frame rather than against the last one.
    const floor = createLoadFloor(particlePool?.capacity ?? 0);
    for (let i = 0; i < options.frames; i++) {
      tick();
      const frame = game.renderFrame();
      const start = performance.now();
      renderer.render(frame);
      samples[i] = performance.now() - start;
      trackLoadFloor(floor, game, particlePool);
      for (let k = 0; k < options.leakPerFrame; k++) leaked.push({ i, k, pad: `${i}:${k}` });
      await nextFrame();
    }
    collect();
    // Retention: what is still on the heap after a collection. The gate the review's F5 needs —
    // Pixi's batch buffers and its lazy `BatchableSprite`s live past the boundary the Node
    // allocation guards can see.
    const heapAfter = heapUsed();
    const sorted = samples.slice().sort();
    return {
      frames: options.frames,
      renderMedianMs: quantile(sorted, 0.5),
      renderP95Ms: quantile(sorted, 0.95),
      renderMaxMs: sorted.length === 0 ? 0 : sorted[sorted.length - 1],
      drawCalls: renderer.drawCalls,
      structureRebuilds: renderer.structureRebuilds,
      renderTargetBytes: meter.bytes,
      heapDeltaBytes: heapBefore < 0 ? 0 : heapAfter - heapBefore,
      heapMeasured: heapBefore >= 0,
      webGLVersion: renderer.webGLVersion,
      bullets: floor.bullets,
      points: floor.points,
      particles: floor.particles,
      mode7: renderer.mode7.active,
      layerEffectMask: renderer.layerEffects.attachedMask,
      cameraX: Math.round(world.camera.x),
      worldStatus: world.status,
    };
  } finally {
    renderer.destroy();
    leaked.length = 0;
  }
}

/**
 * The pooled render targets of this page. One page runs one scenario, so the total is that
 * scenario's — `TexturePool` is a Pixi-global that never gives a texture back.
 */
const meter = createRenderTargetMeter();

/** What the Node driver calls through `window.__shmupRenderBench`. */
const api: RenderBenchApi = { run };

// The driver waits for the attribute, then evaluates `__shmupRenderBench.run(scenario)` — one
// scenario per page, because Pixi's `TexturePool` is a global that never gives a texture back.
(window as unknown as Record<string, unknown>).__shmupRenderBench = api;
document.body.setAttribute('data-shmup-render-bench', 'ready');
