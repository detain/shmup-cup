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
 * @module
 */
import {
  CancelMode,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MAX_ENEMY_BULLETS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
  type CrtFilter,
  type Game,
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
  type PixiRenderer,
} from '@shmup/render-pixi';
import assets from 'virtual:shmup-assets';
import contentFiles from 'virtual:shmup-content';

/** What one bench scenario asks for. */
export interface RenderBenchOptions {
  /** Stage id to play (`zone-a`, `raster-range` for layer effects, `dimension` for Mode-7). */
  readonly stage: string;
  /** Internal frame width (the review's §7.5 knob; 384 is the shipped resolution). */
  readonly width: number;
  /** Internal frame height (216 is the shipped resolution). */
  readonly height: number;
  /** Canvas width in CSS pixels. */
  readonly displayWidth: number;
  /** Canvas height in CSS pixels. */
  readonly displayHeight: number;
  /** CRT setting (`off` / `light` / `full`). */
  readonly crt: CrtFilter;
  /** Ticks played before the measurement (the camera has to reach the effect ranges). */
  readonly warmupTicks: number;
  /** Frames rendered without measuring (shader links, batch growth — the review's F4 / F5). */
  readonly warmupFrames: number;
  /** Frames measured. */
  readonly frames: number;
  /** Objects leaked per frame — 0 normally; the heap gate's own fixture uses a positive number. */
  readonly leakPerFrame: number;
}

/** What one bench scenario measured. */
export interface RenderBenchResult {
  /** Frames measured. */
  readonly frames: number;
  /** Median `renderer.render()` time, ms. */
  readonly renderMedianMs: number;
  /** 95th-percentile `renderer.render()` time, ms. */
  readonly renderP95Ms: number;
  /** Longest `renderer.render()`, ms. */
  readonly renderMaxMs: number;
  /** WebGL draw calls of the last frame (both passes). */
  readonly drawCalls: number;
  /** Frames on which Pixi rebuilt the scene's instruction set (the review's F1). */
  readonly structureRebuilds: number;
  /** Bytes of pooled render targets Pixi created (the review's F2 / F3). */
  readonly renderTargetBytes: number;
  /** JS heap growth over the measured frames, bytes (the gate the review's F5 needs). */
  readonly heapDeltaBytes: number;
  /** Whether the browser reported a usable heap figure at all. */
  readonly heapMeasured: boolean;
  /** WebGL version the context really is. */
  readonly webGLVersion: number;
  /** Live enemy bullets in the measured frames. */
  readonly bullets: number;
  /** Live point items. */
  readonly points: number;
  /** Live particles. */
  readonly particles: number;
  /** Whether the Mode-7 floor was drawn. */
  readonly mode7: boolean;
  /** `LayerId` bits whose layer had an effect filter attached. */
  readonly layerEffectMask: number;
  /** Camera x at the end of the run (which stage section the load was measured over). */
  readonly cameraX: number;
  /** The World's status at the end of the run (`playing` unless the stage ran out). */
  readonly worldStatus: string;
}

/** The API the bench drives from Node. */
export interface RenderBenchApi {
  /**
   * Runs one scenario: a fresh renderer and game, the scripted worst-case load, then the measured
   * frames.
   *
   * @param options - The scenario.
   * @returns What it measured.
   */
  run(options: RenderBenchOptions): Promise<RenderBenchResult>;
}

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

/** A small deterministic generator — the load must be the same on every run. */
class Lcg {
  /** The state. */
  private state = 0x2545f491;

  /**
   * The next number in [0, 1).
   *
   * @returns The number.
   */
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}

/**
 * Tops the enemy-bullet pool up to its capacity around the camera.
 *
 * @param game - The game.
 * @param random - The generator.
 */
function fillBullets(game: Game, random: Lcg): void {
  const world = game.world;
  const camera = world.camera;
  const bullets = world.bullets;
  while (bullets.pool.count < MAX_ENEMY_BULLETS) {
    if (
      bullets.spawn(
        camera.x + PLAYFIELD_W * random.next(),
        camera.y + PLAYFIELD_H * random.next(),
        Math.floor(1024 * random.next()),
        0.25 + random.next(),
        0,
      ) < 0
    ) {
      break;
    }
  }
}

/**
 * Keeps the particle pool full: bursts of every preset around the camera until no free slot is
 * left (the presets recycle the oldest particle when the pool is full, so this settles).
 *
 * @param renderer - The renderer.
 * @param game - The game.
 * @param random - The generator.
 */
function fillParticles(renderer: PixiRenderer, game: Game, random: Lcg): void {
  const particles = renderer.particles;
  if (particles === null) return;
  const presets = particles.content.presets.length;
  if (presets === 0) return;
  const camera = game.world.camera;
  for (let i = 0; i < presets * 4 && particles.liveCount < particles.capacity; i++) {
    particles.emit(
      i % presets,
      camera.x + PLAYFIELD_W * random.next(),
      camera.y + PLAYFIELD_H * random.next(),
      4,
    );
  }
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

/**
 * The value at a quantile of ascending samples.
 *
 * @param sorted - Ascending samples.
 * @param q - Quantile 0…1.
 * @returns The sample.
 */
function quantile(sorted: Float64Array, q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
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
    particleCapacity: 512,
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
    /** One simulated tick under the scripted worst-case load. */
    const tick = (): void => {
      fillBullets(game, random);
      // The bomber's screen clear (M2-02): every cancelled bullet becomes a point item, which is
      // how a real frame ever holds 512 of them.
      if (game.world.bullets.points.count < MAX_ENEMY_BULLETS / 2) {
        game.world.bullets.cancelAll(CancelMode.Points, 0);
        fillBullets(game, random);
      }
      game.step();
      game.events.drain(() => {});
      fillParticles(renderer, game, random);
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
    for (let i = 0; i < options.frames; i++) {
      tick();
      const frame = game.renderFrame();
      const start = performance.now();
      renderer.render(frame);
      samples[i] = performance.now() - start;
      for (let k = 0; k < options.leakPerFrame; k++) leaked.push({ i, k, pad: `${i}:${k}` });
      await nextFrame();
    }
    collect();
    // Retention: what is still on the heap after a collection. The gate the review's F5 needs —
    // Pixi's batch buffers and its lazy `BatchableSprite`s live past the boundary the Node
    // allocation guards can see.
    const heapAfter = heapUsed();
    const world = game.world;
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
      bullets: world.bullets.pool.count,
      points: world.bullets.points.count,
      particles: renderer.particles?.liveCount ?? 0,
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

const api: RenderBenchApi = { run };

(window as unknown as Record<string, unknown>).__shmupRenderBench = api;
document.body.setAttribute('data-shmup-render-bench', 'ready');
