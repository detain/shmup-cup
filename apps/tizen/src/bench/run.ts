/**
 * The TV render bench's **browser plumbing** (plan R0-02 — part of the `bench` module, see
 * `./index.ts`): one scenario per page load, the phase loop around `renderer.render()`, the
 * results page, the remote keys, `localStorage` and the log server.
 *
 * Two ways to run:
 *
 * - **On a TV (or a desktop browser):** the page reads the run state (`./state.ts`). While a run is
 *   on, it measures the scenario at the cursor, stores the record, POSTs it as a `render-bench`
 *   payload when a log server is configured, and reloads for the next one; otherwise it shows the
 *   results page (the start page of a fresh install). **Enter** starts a run, **Red** re-runs a
 *   scenario, **Back** exits.
 * - **Headless (`?scenario=<id>`):** `pnpm bench` opens one page per scenario, which measures
 *   that scenario with the short {@link HEADLESS_BENCH_TIMING} (or `?warmup=` / `?measure=` /
 *   `?sync=`) and publishes the record on `window.__shmupTvBench` — no storage, no POST, no reload.
 *
 * Either way the body carries {@link TV_BENCH_MARKER} — `running`, `done`, `error`, `scenario` or
 * `results` — which is also how the Tizen bundle check tells the bench's `app.js` from the game's.
 *
 * **The measured frame.** Per animation frame: the vsync-locked fixed-step loop (`core/loop`, as
 * the shell runs it on a 60 Hz TV) advances the scene by its ticks, the particle pool is topped up,
 * then the **timed** part — the backdrop and terrain bindings' sync and `renderer.render()` — runs,
 * followed in the synced phase by `gl.finish()`. Nothing in that path allocates (the heap delta is
 * one of the headless gates).
 *
 * @module
 */
import {
  LayerId,
  createDrawList,
  createFixedStepLoop,
  type DrawList,
  type RenderFrame,
  type ScreenView,
  type WorldView,
} from '@shmup/core';
import {
  createAtlas,
  createMode7Shader,
  createParallaxBinding,
  createPixiRenderer,
  createRenderTargetMeter,
  createSpriteTables,
  createTerrainBinding,
  loadFxContent,
  type AtlasManifest,
  type AtlasPageImage,
  type FxContent,
} from '@shmup/render-pixi';
import {
  buildRenderBenchPayload,
  makeRenderBenchSessionId,
  renderReportEndpoint,
  sendRenderBench,
  type RenderBenchEnv,
  type RenderBenchRecord,
} from '@shmup/shell';
import { benchKeyOf, detectBenchHost, type BenchHost } from './host.js';
import {
  BENCH_SCENARIOS,
  BENCH_SIZES,
  HEADLESS_BENCH_TIMING,
  TV_BENCH_TIMING,
  findBenchScenario,
  searchParam,
  timingFromSearch,
  type BenchScenario,
  type BenchTiming,
} from './matrix.js';
import { benchPageLines, drawBenchLines } from './results.js';
import {
  BENCH_LOAD,
  BenchRandom,
  BenchScene,
  fillBenchParticles,
  pickBenchSprites,
} from './scene.js';
import { BenchSampler } from './stats.js';
import {
  BENCH_STATE_KEY,
  createRunState,
  markSent,
  nextSeq,
  parseRunState,
  recordResult,
  rerunScenario,
  serializeRunState,
  stopRun,
  unsentRecords,
  type BenchRunState,
} from './state.js';

/**
 * The body attribute the bench sets (`running`, `done`, `error`, `scenario`, `results`). The Tizen
 * bundle check (`scripts/check-bundle.mjs` `TV_BENCH_MARKER`) requires it in the bench's `app.js`
 * and rejects it in the game's.
 */
export const TV_BENCH_MARKER = 'data-shmup-tv-bench';

/**
 * `localStorage` key of the WebGL override the game's dev builds read too (`'2'` = WebGL 2; see
 * `apps/tizen/src/boot` `WEBGL_VERSION_KEY`).
 */
export const BENCH_GL_KEY = 'shmup-cup:gl';

/** Opacity of the partial backdrop bands. */
const PARTIAL_ALPHA = 0.75;

/** Fixed ticks per second (the game's). */
const TICK_RATE = 60;

/** Most ticks one frame may run (the shell's cap). */
const MAX_TICKS_PER_FRAME = 4;

/** What a headless page publishes on `window.__shmupTvBench`. */
export interface TvBenchOutcome {
  /** The record, or `null` when the scenario failed. */
  readonly record: RenderBenchRecord | null;
  /** Why it failed, or `null`. */
  readonly error: string | null;
}

/** What {@link startRenderBench} needs from its host page. */
export interface RenderBenchAppOptions {
  /** The window. */
  readonly win: Window;
  /** The canvas the renderer draws into. */
  readonly canvas: HTMLCanvasElement;
  /** The log server's base URL (`__SHMUP_REPORT_URL__`), `''` for none. */
  readonly reportUrl: string;
  /** The bundle's build id (`__SHMUP_BUILD__`). */
  readonly buildId: string;
  /** The density atlases and particle presets (`virtual:shmup-render-bench`). */
  readonly assets: BenchAssets;
  /** The host (default {@link detectBenchHost}). */
  readonly host?: BenchHost;
}

/** The empty screen effects of every bench frame. */
const NO_SCREEN: ScreenView = Object.freeze({ shakeX: 0, shakeY: 0, flash: 0, dim: 0 });

/** The frame handed to the renderer (a class: its tick is rewritten every frame). */
class BenchFrame implements RenderFrame {
  /** Simulated tick. */
  tick = 0;
  /** Interpolation factor (the bench never interpolates). */
  readonly alpha = 0;
  /** Screen effects (none). */
  readonly screen = NO_SCREEN;

  /**
   * A frame.
   *
   * @param world - The world, or `null` (the results page).
   * @param hud - The HUD list.
   * @param ui - The UI list.
   */
  constructor(
    readonly world: WorldView | null,
    readonly hud: DrawList,
    readonly ui: DrawList,
  ) {}
}

/** One density's atlas as the bench build ships it (`virtual:shmup-render-bench`). */
export interface BenchAtlasData {
  /** The density factor `s`. */
  readonly density: number;
  /** The scaled manifest. */
  readonly manifest: AtlasManifest;
  /** Page URLs relative to the page. */
  readonly pageUrls: readonly string[];
}

/** What the bench draws with: the density atlases and the particle presets. */
export interface BenchAssets {
  /** One atlas per density. */
  readonly atlases: readonly BenchAtlasData[];
  /** The shipped particle-preset files (`content/fx/`). */
  readonly fx: readonly { readonly path: string; readonly data: unknown }[];
}

/**
 * The atlas of a density.
 *
 * @param assets - The bench's assets.
 * @param density - The factor.
 * @returns The atlas.
 * @throws {Error} When the bench build has none for it.
 */
export function atlasFor(assets: BenchAssets, density: number): BenchAtlasData {
  for (let i = 0; i < assets.atlases.length; i++) {
    if (assets.atlases[i].density === density) return assets.atlases[i];
  }
  throw new Error(`render bench: no atlas for density ${density}`);
}

/**
 * Loads one atlas page.
 *
 * @param win - The window.
 * @param url - Page URL, relative to the page.
 * @returns The image.
 */
function loadImage(win: Window, url: string): Promise<AtlasPageImage> {
  return new Promise((resolve, reject) => {
    const image = new (win as unknown as { Image: new () => HTMLImageElement }).Image();
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
 * The page a sprite's frame 0 sits on.
 *
 * @param manifest - The atlas manifest.
 * @param sprite - Sprite name.
 * @returns The page index (0 when unknown).
 */
function pageOf(manifest: AtlasManifest, sprite: string): number {
  const frame = manifest.sprites[sprite]?.frames[0];
  return frame === undefined ? 0 : (manifest.frames[frame]?.p ?? 0);
}

/**
 * The used JS heap, or -1 when the browser does not say.
 *
 * @param win - The window.
 * @returns Bytes.
 */
function heapUsed(win: Window): number {
  const memory = (win.performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory === undefined ? -1 : memory.usedJSHeapSize;
}

/**
 * Collects garbage when the page was started with `--js-flags=--expose-gc` (headless only — the
 * TV has no `gc()`, so its heap figures are coarse).
 *
 * @param win - The window.
 */
function collect(win: Window): void {
  const gc = (win as Window & { gc?: () => void }).gc;
  if (typeof gc === 'function') {
    gc();
    gc();
  }
}

/**
 * The page's `localStorage`, or `null` when it is unavailable.
 *
 * @param win - The window.
 * @returns The storage.
 */
function storageOf(win: Window): Storage | null {
  try {
    return win.localStorage ?? null;
  } catch (_error) {
    return null;
  }
}

/**
 * The WebGL version to ask for: `?gl=2` / `?gl=1`, else `localStorage['shmup-cup:gl']`, else 1.
 *
 * @param search - `location.search`.
 * @param storage - The storage, or `null`.
 * @returns 1 or 2.
 */
export function benchWebGLVersion(search: string, storage: Storage | null): 1 | 2 {
  const query = searchParam(search, 'gl');
  if (query === '1' || query === '2') return query === '2' ? 2 : 1;
  try {
    return storage?.getItem(BENCH_GL_KEY) === '2' ? 2 : 1;
  } catch (_error) {
    return 1;
  }
}

/** One scenario's result and whether the run was asked to stop. */
interface ScenarioRun {
  /** Resolves with the record once the synced phase is over. */
  readonly done: Promise<RenderBenchRecord>;
}

/**
 * Measures one scenario on this page (see the module docs): builds the density's atlas and scene,
 * a renderer at the scenario's internal size on the window's display, warms it up, then runs the
 * warm-up, free-running and synced phases.
 *
 * @param options - The app options (window, canvas, assets).
 * @param scenario - The scenario.
 * @param timing - Phase timing.
 * @param webGLVersion - The WebGL version to ask for.
 * @param label - The HUD label (`'<phase>'` is appended per phase).
 * @returns The run.
 */
function measureScenario(
  options: RenderBenchAppOptions,
  scenario: BenchScenario,
  timing: BenchTiming,
  webGLVersion: 1 | 2,
  label: string,
): ScenarioRun {
  const { win, canvas, assets } = options;
  const done = (async (): Promise<RenderBenchRecord> => {
    const { size, variant } = scenario;
    const source = atlasFor(assets, size.density);
    const images = await Promise.all(source.pageUrls.map((url) => loadImage(win, url)));
    const atlas = createAtlas(source.manifest, images, { onWarning: () => {} });
    const sprites = pickBenchSprites(Object.keys(source.manifest.sprites));
    const fx: FxContent = loadFxContent(assets.fx).content;
    const scene = new BenchScene({
      width: size.width,
      height: size.height,
      density: size.density,
      sprites,
      manifest: source.manifest,
      filter: variant.filter,
      mode7: variant.mode7,
    });
    const displayWidth = Math.max(1, Math.floor(win.innerWidth));
    const displayHeight = Math.max(1, Math.floor(win.innerHeight));
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    // Pixi's TexturePool is global and never shrinks: one scenario per page, so this meter's total
    // is this scenario's.
    const meter = createRenderTargetMeter();
    const floorPage = pageOf(source.manifest, sprites.names[sprites.floor]);
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth,
      displayHeight,
      width: size.width,
      height: size.height,
      atlas,
      preferWebGLVersion: webGLVersion,
      countDrawCalls: true,
      countStructureRebuilds: true,
      particleCapacity: BENCH_LOAD.particles,
      // The floor tile may sit on the second page of the ×2.25 atlas.
      createMode7Shader: (w, h) => createMode7Shader(atlas.pages[floorPage], w, h),
    });
    try {
      renderer.setSpriteNames(sprites.names);
      renderer.setFxContent(fx);
      renderer.setCrtFilter(variant.crt);
      const tables = createSpriteTables(atlas, sprites.names);
      // The backdrops and the terrain at the scenario's width (the renderer's own bindings still
      // cover the v1 frame's).
      const parallax = createParallaxBinding({
        atlas,
        tables,
        view: scene.parallax,
        width: size.width,
        offsetY: scene.hudBar,
      });
      for (let i = 0; i < parallax.containers.length; i++) {
        renderer.layers.layers[parallax.layers[i]].addChild(parallax.containers[i]);
        if (i >= scene.fullBands) parallax.containers[i].alpha = PARTIAL_ALPHA;
      }
      const terrain = createTerrainBinding({
        atlas,
        tables,
        view: scene.terrain,
        width: size.width,
        height: scene.playHeight,
        offsetY: scene.hudBar,
      });
      renderer.layers.layers[LayerId.Terrain].addChild(terrain.container);
      renderer.bindWorld(scene.world);
      scene.setLabel(`${label} WARM-UP`);
      parallax.sync(scene.parallax);
      terrain.sync(scene.terrain, scene.camera);
      renderer.warmUp();

      const frame = new BenchFrame(scene.world, scene.hud, scene.ui);
      const sampler = new BenchSampler();
      const random = new BenchRandom(7);
      const particles = renderer.particles;
      const context = canvas.getContext(renderer.webGLVersion === 2 ? 'webgl2' : 'webgl') as {
        finish(): void;
      } | null;
      const clock = win.performance;
      const loop = createFixedStepLoop({
        tickRate: TICK_RATE,
        maxTicksPerFrame: MAX_TICKS_PER_FRAME,
        onTick: () => {
          scene.tick();
        },
        vsyncLock: true,
      });
      // Phase state in typed arrays (fractional times stay unboxed): phase, phase start, last
      // rAF time, heap at the start, draw calls, fewest particles, fewest tiles.
      const times = new Float64Array(3);
      const counts = new Int32Array(5);
      const PHASE = 0;
      const DRAWS = 1;
      const PARTICLES = 2;
      const TILES = 3;
      // Frames still to settle before a phase records: the first frame after the forced garbage
      // collection of the headless run (a `gc()` can stall a second) starts the phase's clock.
      const SETTLE = 4;
      const START = 0;
      const LAST = 1;
      const HEAP = 2;
      times[START] = -1;
      times[LAST] = -1;
      counts[PARTICLES] = BENCH_LOAD.particles;
      counts[TILES] = 1 << 30;
      const durations = [timing.warmupMs, timing.measureMs, timing.syncMs];
      const phaseNames = ['WARM-UP', 'MEASURE', 'SYNCED'];
      return await new Promise<RenderBenchRecord>((resolve, reject) => {
        /**
         * One animation frame (allocation-free; see the module docs).
         *
         * @param now - The rAF timestamp.
         */
        const onFrame = (now: number): void => {
          try {
            const settling = counts[SETTLE] > 0;
            if (settling) counts[SETTLE]--;
            const phase = settling ? 0 : counts[PHASE];
            if (times[START] < 0) times[START] = now;
            const delta = times[LAST] < 0 ? 0 : now - times[LAST];
            times[LAST] = now;
            const ticks = loop.advance(now);
            fillBenchParticles(particles, scene, random);
            frame.tick = loop.totalTicks;
            const t0 = clock.now();
            parallax.sync(scene.parallax);
            terrain.sync(scene.terrain, scene.camera);
            renderer.render(frame);
            if (phase === 2 && context !== null) context.finish();
            const elapsed = clock.now() - t0;
            if (phase === 1) sampler.free(elapsed, delta, ticks);
            else if (phase === 2) sampler.synced(elapsed);
            if (phase > 0) {
              const live = particles === null ? 0 : particles.liveCount;
              if (live < counts[PARTICLES]) counts[PARTICLES] = live;
              const tiles = scene.visibleTiles();
              if (tiles < counts[TILES]) counts[TILES] = tiles;
            }
            if (!settling && now - times[START] >= durations[phase]) {
              if (phase === 1) counts[DRAWS] = renderer.drawCalls;
              const next = phase + 1;
              counts[PHASE] = next;
              times[START] = now;
              if (next === 1) {
                collect(win);
                times[HEAP] = heapUsed(win);
                // The phase's clock starts on the next frame, which is not recorded: it carries
                // the collection's stall (headless) and the loop forgets the gap.
                times[START] = -1;
                times[LAST] = -1;
                loop.reset();
                counts[SETTLE] = 1;
              }
              if (next < 3) scene.setLabel(`${label} ${phaseNames[next]}`);
              else {
                collect(win);
                const heapEnd = heapUsed(win);
                const heapStart = times[HEAP];
                const measured = heapStart >= 0 && heapEnd >= 0;
                let textureBytes = 0;
                for (const page of source.manifest.pages) textureBytes += page.w * page.h * 4;
                resolve({
                  scenario: scenario.id,
                  index: scenario.index,
                  size: size.id,
                  width: size.width,
                  height: size.height,
                  density: size.density,
                  variant: variant.id,
                  crt: variant.crt,
                  filter: variant.filter,
                  mode7: variant.mode7,
                  webGLVersion: renderer.webGLVersion,
                  displayWidth,
                  displayHeight,
                  scale: renderer.viewport.scale,
                  phaseMs: durations.slice(),
                  frames: sampler.frames,
                  syncedFrames: sampler.sync.count,
                  renderMs: sampler.render.summary(),
                  syncedMs: sampler.sync.summary(),
                  frameMs: sampler.frame.summary(),
                  raf: Array.prototype.slice.call(sampler.raf) as number[],
                  tickFrames: Array.prototype.slice.call(sampler.ticks) as number[],
                  twoTickShare: sampler.twoTickShare(),
                  drawCalls: counts[DRAWS],
                  rebuilds: renderer.structureRebuilds,
                  renderTargetBytes: meter.bytes,
                  frameTargetBytes: size.width * size.height * 4,
                  textureBytes,
                  atlasPages: source.manifest.pages.length,
                  heapMeasured: measured,
                  heapStartBytes: measured ? heapStart : 0,
                  heapEndBytes: measured ? heapEnd : 0,
                  heapDeltaBytes: measured ? heapEnd - heapStart : 0,
                  load: {
                    bullets: scene.liveBullets,
                    points: scene.livePoints,
                    enemies: scene.liveEnemies,
                    particles: counts[PARTICLES],
                    tiles: counts[TILES] === 1 << 30 ? 0 : counts[TILES],
                  },
                  endedAt: Date.now(),
                });
                return;
              }
            }
            win.requestAnimationFrame(onFrame);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };
        win.requestAnimationFrame(onFrame);
      });
    } finally {
      // Nothing else is torn down: the page is reloaded (TV) or closed (headless) after its one
      // scenario, and the last frame stays on screen meanwhile.
      meter.stop();
    }
  })();
  return { done };
}

/**
 * Starts the bench on its page (the entry point — `./main.ts`).
 *
 * @param options - The window, canvas, log server and build id.
 *
 * @example
 * ```ts
 * startRenderBench({
 *   win: window,
 *   canvas,
 *   reportUrl: __SHMUP_REPORT_URL__,
 *   buildId: __SHMUP_BUILD__,
 *   assets: bench, // virtual:shmup-render-bench
 * });
 * ```
 */
export function startRenderBench(options: RenderBenchAppOptions): void {
  const { win } = options;
  const search = (win as Partial<Window>).location?.search ?? '';
  const scenarioId = searchParam(search, 'scenario');
  if (scenarioId !== null) {
    runHeadless(options, scenarioId, search);
    return;
  }
  runOnTv(options, search);
}

/**
 * Sets the body's {@link TV_BENCH_MARKER}.
 *
 * @param win - The window.
 * @param value - The page's state.
 */
function mark(win: Window, value: string): void {
  win.document.body.setAttribute(TV_BENCH_MARKER, value);
}

/**
 * The headless mode: one scenario, published on `window.__shmupTvBench`.
 *
 * @param options - The app options.
 * @param scenarioId - The scenario to run.
 * @param search - `location.search`.
 */
function runHeadless(options: RenderBenchAppOptions, scenarioId: string, search: string): void {
  const { win } = options;
  /**
   * Publishes the outcome.
   *
   * @param outcome - Record or error.
   */
  const publish = (outcome: TvBenchOutcome): void => {
    (win as Window & { __shmupTvBench?: TvBenchOutcome }).__shmupTvBench = outcome;
    mark(win, outcome.record === null ? 'error' : 'done');
  };
  mark(win, 'running');
  const scenario = findBenchScenario(scenarioId);
  if (scenario === null) {
    publish({ record: null, error: `unknown scenario "${scenarioId}"` });
    return;
  }
  const timing = timingFromSearch(search, HEADLESS_BENCH_TIMING);
  const gl = benchWebGLVersion(search, storageOf(win));
  measureScenario(options, scenario, timing, gl, scenario.id).done.then(
    (record) => {
      publish({ record, error: null });
    },
    (error: unknown) => {
      publish({ record: null, error: String(error) });
    },
  );
}

/**
 * The TV mode (see the module docs).
 *
 * @param options - The app options.
 * @param search - `location.search` (`?gl=`, and the phase overrides for a desktop run).
 */
function runOnTv(options: RenderBenchAppOptions, search: string): void {
  const { win } = options;
  const host = options.host ?? detectBenchHost(win);
  const storage = storageOf(win);
  const endpoint = renderReportEndpoint(options.reportUrl);
  let state = parseRunState(read(storage));
  const mode: 'scenario' | 'results' = state !== null && state.running ? 'scenario' : 'results';

  /**
   * Stores the state.
   *
   * @param next - The new state.
   */
  const save = (next: BenchRunState): void => {
    state = next;
    try {
      storage?.setItem(BENCH_STATE_KEY, serializeRunState(next));
    } catch (_error) {
      // Quota or a locked storage: the run goes on, the POSTs still carry its results.
    }
  };
  /** Reloads the page for the next scenario (or the results page). */
  const reload = (): void => {
    win.location.reload();
  };
  /**
   * The session-level facts of a payload.
   *
   * @param run - The run.
   * @returns The env.
   */
  const envOf = (run: BenchRunState): RenderBenchEnv => ({
    buildId: options.buildId,
    host: host.name,
    userAgent: (win as Partial<Window>).navigator?.userAgent ?? '',
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    devicePixelRatio: win.devicePixelRatio,
    webGLVersion: run.webGLVersion,
    scenarios: BENCH_SCENARIOS.length,
    startedAt: run.startedAt,
  });
  /**
   * POSTs records and notes which were acknowledged.
   *
   * @param records - The records.
   * @param done - Whether the matrix is complete.
   * @param then - Runs once the server answered (or not).
   */
  const post = (records: RenderBenchRecord[], done: boolean, then: () => void): void => {
    if (state === null || endpoint === null || records.length === 0) {
      then();
      return;
    }
    const run = nextSeq(state);
    save(run);
    const payload = buildRenderBenchPayload(
      run.session,
      run.seq,
      Date.now(),
      envOf(run),
      records,
      done,
    );
    sendRenderBench(
      endpoint,
      payload,
      () => new (win as unknown as { XMLHttpRequest: new () => XMLHttpRequest }).XMLHttpRequest(),
      (ok) => {
        if (ok && state !== null) {
          save(
            markSent(
              state,
              records.map((record) => record.index),
            ),
          );
        }
        then();
      },
    );
  };

  win.addEventListener('keydown', (event: KeyboardEvent) => {
    const key = benchKeyOf(event.keyCode);
    if (key === null) return;
    event.preventDefault();
    if (key === 'back') {
      if (state !== null && mode === 'scenario') save(stopRun(state, null));
      host.exit();
      if (mode === 'scenario') reload();
      return;
    }
    if (key === 'red') {
      if (state === null || (mode === 'results' && state.records.length === 0)) return;
      save(rerunScenario(state));
      reload();
      return;
    }
    if (mode === 'results') {
      const now = Date.now();
      save(
        createRunState(
          makeRenderBenchSessionId(now, Math.random()),
          now,
          benchWebGLVersion(search, storage),
          timingFromSearch(search, TV_BENCH_TIMING),
        ),
      );
      reload();
    }
  });

  if (mode === 'scenario' && state !== null) {
    const run: BenchRunState = state;
    const scenario = BENCH_SCENARIOS[run.cursor];
    mark(win, 'scenario');
    const label =
      `R0-02 ${run.cursor + 1}/${BENCH_SCENARIOS.length} ${scenario.id} ` + `GL${run.webGLVersion}`;
    measureScenario(options, scenario, run.timing, run.webGLVersion === 2 ? 2 : 1, label).done.then(
      (record) => {
        if (state === null) return;
        const next = recordResult(state, record);
        save(next);
        post([record], !next.running, reload);
      },
      (error: unknown) => {
        if (state !== null) save(stopRun(state, String(error)));
        reload();
      },
    );
    return;
  }
  mark(win, 'results');
  showResults(options, host, endpoint, () => state, post);
}

/**
 * Reads the stored state's text.
 *
 * @param storage - The storage, or `null`.
 * @returns The text, or `null`.
 */
function read(storage: Storage | null): string | null {
  try {
    return storage?.getItem(BENCH_STATE_KEY) ?? null;
  } catch (_error) {
    return null;
  }
}

/**
 * The results page (also the start page): the shipped atlas at the v2 frame (640×360), the lines
 * of {@link benchPageLines} in the bitmap font, redrawn after the unacknowledged records were sent.
 *
 * @param options - The app options.
 * @param host - The host.
 * @param endpoint - The log server's POST URL, or `null`.
 * @param getState - Reads the current run state.
 * @param post - Sends records (see `runOnTv`).
 */
function showResults(
  options: RenderBenchAppOptions,
  host: BenchHost,
  endpoint: string | null,
  getState: () => BenchRunState | null,
  post: (records: RenderBenchRecord[], done: boolean, then: () => void) => void,
): void {
  const { win, canvas } = options;
  const size = BENCH_SIZES[1];
  const source = atlasFor(options.assets, 1);
  const ui = createDrawList(256, 48);
  const hud = createDrawList(1, 1);
  const lineHeight = source.manifest.fonts.pixel?.lineHeight ?? 10;
  /**
   * The page's lines for the current state.
   *
   * @param status - The log line's status.
   * @returns The lines.
   */
  const lines = (status: string): ReturnType<typeof benchPageLines> =>
    benchPageLines({
      state: getState(),
      buildId: options.buildId,
      host: host.name,
      webGLVersion: benchWebGLVersion(
        (win as Partial<Window>).location?.search ?? '',
        storageOf(win),
      ),
      display: `${win.innerWidth}x${win.innerHeight}`,
      endpoint,
      status,
      scenarios: BENCH_SCENARIOS.length,
      timing: TV_BENCH_TIMING,
    });
  /**
   * Redraws the page.
   *
   * @param status - The log line's status.
   */
  const draw = (status: string): void => {
    drawBenchLines(ui, lines(status), 4, 4, lineHeight);
  };
  const state = getState();
  const unsent = state === null ? [] : unsentRecords(state);
  draw(unsent.length > 0 && endpoint !== null ? `sending ${unsent.length} result(s)...` : '');
  if (state !== null && unsent.length > 0 && endpoint !== null) {
    post(unsent, !state.running, () => {
      const after = getState();
      const left = after === null ? 0 : unsentRecords(after).length;
      draw(left === 0 ? 'all results acknowledged' : `${left} result(s) not acknowledged`);
    });
  }
  (async (): Promise<void> => {
    const images = await Promise.all(source.pageUrls.map((url) => loadImage(win, url)));
    const atlas = createAtlas(source.manifest, images, { onWarning: () => {} });
    canvas.width = Math.max(1, Math.floor(win.innerWidth));
    canvas.height = Math.max(1, Math.floor(win.innerHeight));
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: canvas.width,
      displayHeight: canvas.height,
      width: size.width,
      height: size.height,
      atlas,
      preferWebGLVersion: 1,
    });
    const frame = new BenchFrame(null, hud, ui);
    /** Redraws every animation frame (the page is static; this keeps it on screen). */
    const onFrame = (): void => {
      renderer.render(frame);
      win.requestAnimationFrame(onFrame);
    };
    win.requestAnimationFrame(onFrame);
  })().catch((error: unknown) => {
    // No WebGL: the lines as plain text, so the page still says what happened.
    const pre = win.document.createElement('pre');
    pre.style.cssText = 'color:#cfe;background:#05070f;font:14px monospace;margin:8px;';
    pre.textContent = lines(String(error))
      .map((line) => line.text)
      .join('\n');
    win.document.body.appendChild(pre);
  });
}
