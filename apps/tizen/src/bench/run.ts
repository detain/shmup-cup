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
 * - **Campaign mode (`options.campaign`, a build with `VITE_BENCH_CAMPAIGN` — `./campaign.ts`):**
 *   the TV mode without a key press. A scenario page first counts its launch and skips a scenario
 *   launched more than `MAX_SCENARIO_ATTEMPTS` times in a row (it crashed or hung the TV). The
 *   results page re-sends what the log server has not acknowledged (retrying a few times), then
 *   resumes a stopped pass after 5 s (skipping a scenario that threw), starts the next pass after
 *   the build's pause with that pass's WebGL version, or says the campaign is complete — a
 *   countdown on the status line, **Enter** acts at once, **Back** still exits (the next launch
 *   carries on).
 *
 * - **Build output (`options.output`, a build with `VITE_BENCH_OUTPUT` — `./output.ts`):** every
 *   scenario without its own output knob draws into that backbuffer, `'fit'`-upscaled unless its
 *   knob sets a mode; a scenario page first moves the cursor past the scenarios whose frame is
 *   larger than their backbuffer (no launch, no record), the results page lists them, and the
 *   payloads' `env.output` names the output ({@link TvBenchEnv}).
 *
 * Either way the body carries {@link TV_BENCH_MARKER} — `running`, `done`, `error`, `scenario` or
 * `results` — which is also how the Tizen bundle check tells the bench's `app.js` from the game's.
 *
 * **The decode scenario (plan R1-05 B4).** After the render scenarios a TV run loads the page
 * once more for `decode` (`./decode.ts`): a renderer on the ×1 atlas, then the bench build's decode
 * pages fetched, decoded and uploaded {@link TV_DECODE_REPETITIONS} times each. Its record is
 * stored as the state's `decode`, POSTed in the payload's `decode` field and drawn as a second
 * table on the results page. Headless, `?scenario=decode` (`&reps=<n>`) publishes it as the
 * outcome's `decode`.
 *
 * **The stand-in load (plan R3-04.M4a).** The run's last page load is `standin-zone`: it draws one
 * 640×360 frame from the decode scenario's stand-in pages — parallax bands, tile rows, enemies and
 * the boss — warm-up, measured and synced like a render scenario, and its {@link RenderBenchRecord}
 * is stored and POSTed as one. Headless, `?scenario=standin-zone` publishes it as the outcome's
 * `record`.
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
  type PixiRenderer,
} from '@shmup/render-pixi';
import {
  buildRenderBenchPayload,
  makeRenderBenchSessionId,
  renderReportEndpoint,
  sendRenderBench,
  type DecodeBenchRecord,
  type RenderBenchEnv,
  type RenderBenchRecord,
} from '@shmup/shell';
import {
  BENCH_RUN_LENGTH,
  DECODE_SCENARIO_ID,
  DECODE_SCENARIO_INDEX,
  STANDIN_SCENARIO_ID,
  STANDIN_SCENARIO_INDEX,
  HEADLESS_DECODE_REPETITIONS,
  TV_DECODE_REPETITIONS,
  createDecodeHost,
  decodeRepetitionsFromSearch,
  failedDecodeRecord,
  measureDecode,
  type BenchDecodePage,
  type DecodeMeasureOptions,
  type DecodeWindow,
} from './decode.js';
import {
  REWIND_SCENARIO_ID,
  REWIND_SCENARIO_INDEX,
  HEADLESS_REWIND_TICKS,
  TV_REWIND_TICKS,
  measureRewindScenario,
  rewindTicksFromSearch,
  type RewindBenchRecord,
} from './rewind.js';
import {
  BENCH_CAMPAIGN_KEY,
  CAMPAIGN_RESUME_MS,
  campaignFor,
  campaignStatus,
  campaignStep,
  noteScenarioLaunch,
  parseCampaign,
  serializeCampaign,
  startPass,
  type BenchCampaignConfig,
  type BenchCampaignState,
} from './campaign.js';
import { benchKeyOf, detectBenchHost, type BenchHost } from './host.js';
import {
  BENCH_SCENARIOS,
  BENCH_V2_SIZE,
  HEADLESS_BENCH_TIMING,
  TV_BENCH_TIMING,
  findBenchScenario,
  searchParam,
  timingFromSearch,
  type BenchScenario,
  type BenchTiming,
} from './matrix.js';
import {
  NOTE_COLOR,
  benchPageLines,
  benchResultPages,
  drawBenchLines,
  type BenchLine,
  type BenchPageInput,
} from './results.js';
import {
  BENCH_LOAD,
  BenchRandom,
  BenchScene,
  createStandinScene,
  fillBenchParticles,
  pickBenchSprites,
} from './scene.js';
import { benchScenarioSetup, benchSkippedScenarios, type BenchOutput } from './output.js';
import { BenchSampler } from './stats.js';
import {
  BENCH_STATE_KEY,
  createRunState,
  decodeUnsent,
  markSent,
  nextSeq,
  parseRunState,
  recordDecode,
  recordRewind,
  recordResult,
  rerunScenario,
  resumeRun,
  serializeRunState,
  skipPlannedScenarios,
  skipScenario,
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

/** Top and left margin of the results page's text, in frame pixels. */
const RESULTS_MARGIN = 4;

/** Most lines the results page draws (its draw list's string slots). */
const RESULTS_MAX_LINES = 48;

/**
 * Glyph quads of the results page's UI layer: a full page of the table is ~35 lines of up to ~100
 * characters. The renderer's default (1024) ran out inside R0-03's 18-row table, which is why its
 * last row lost every column from `SYNC95` on (owner, 2026-10-19).
 */
const RESULTS_GLYPHS = 4096;

/** How often the campaign mode's results page re-POSTs records the log server did not acknowledge. */
const CAMPAIGN_POST_RETRIES = 3;

/** The wait between those re-POSTs, in ms. */
const CAMPAIGN_POST_RETRY_MS = 5000;

/** How often a campaign countdown redraws its status line, in ms. */
const COUNTDOWN_STEP_MS = 1000;

/** What a headless page publishes on `window.__shmupTvBench`. */
export interface TvBenchOutcome {
  /** The record, or `null` when the scenario failed (and for the decode scenario). */
  readonly record: RenderBenchRecord | null;
  /** The decode scenario's record (`?scenario=decode`, plan R1-05 B4); absent otherwise. */
  readonly decode?: DecodeBenchRecord;
  /** The rewind scenario's record (`?scenario=rewind`, plan R2 TL-3); absent otherwise. */
  readonly rewind?: RewindBenchRecord;
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
  /**
   * The campaign the build carries (`./campaign.ts` — `VITE_BENCH_CAMPAIGN`), or `null` / absent
   * for none: the TV mode then runs hands-off (see the module docs).
   */
  readonly campaign?: BenchCampaignConfig | null;
  /**
   * The build output resolution (`./output.ts` — `VITE_BENCH_OUTPUT`), or `null` / absent for the
   * window's backbuffer: every scenario without its own output then draws into it, upscaled with
   * `'fit'`, and a scenario whose frame does not fit it is skipped.
   */
  readonly output?: BenchOutput | null;
}

/**
 * The session-level facts of a TV run's payloads: the shell's {@link RenderBenchEnv} plus the
 * build output.
 */
export interface TvBenchEnv extends RenderBenchEnv {
  /** The build output resolution (`'1280x720'`), or `null` for the window's backbuffer. */
  output: string | null;
}

/** The empty screen effects of every bench frame. */
const NO_SCREEN: ScreenView = Object.freeze({ shakeX: 0, shakeY: 0, flash: 0, dim: 0 });

/** The frame handed to the renderer (a class: its tick is rewritten every frame). */
class BenchFrame implements RenderFrame {
  /** Simulated tick. */
  tick = 0;
  /**
   * Interpolation factor: 0, except on the `interp` knob's rows, which hand the renderer the
   * loop's leftover fraction every frame (on a vsync-locked 60 Hz loop that stays near 0 — the
   * knob measures what the interpolating path costs, not a visible blend).
   */
  alpha = 0;
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

/** The stand-in load's atlas as the bench build ships it (plan R3-04.M4a). */
export interface BenchStandinData {
  /** The stand-in zone's manifest, remapped onto the decode pages this build ships. */
  readonly manifest: AtlasManifest;
  /** Page URLs relative to the page (the `decode-standin-zone-a*.png` files). */
  readonly pageUrls: readonly string[];
}

/** What the bench draws with: the density atlases and the particle presets. */
export interface BenchAssets {
  /** One atlas per density. */
  readonly atlases: readonly BenchAtlasData[];
  /** The shipped particle-preset files (`content/fx/`). */
  readonly fx: readonly { readonly path: string; readonly data: unknown }[];
  /** The decode scenario's pages (plan R1-05 B4); absent from older builds and test fakes. */
  readonly decode?: readonly BenchDecodePage[];
  /** The stand-in load's atlas (plan R3-04.M4a); absent from older builds and test fakes. */
  readonly standin?: BenchStandinData | null;
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
    // The canvas's backbuffer: the window's, or the output knob's or the build's (`./output.ts` —
    // its CSS size stays the whole window, so the browser scales a smaller backbuffer up to the
    // panel).
    const setup = benchScenarioSetup(scenario, options.output ?? null);
    const displayWidth = Math.max(
      1,
      Math.floor(setup.outputWidth > 0 ? setup.outputWidth : win.innerWidth),
    );
    const displayHeight = Math.max(
      1,
      Math.floor(setup.outputHeight > 0 ? setup.outputHeight : win.innerHeight),
    );
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
      scaleMode: setup.scaleMode,
      interpolation: scenario.interpolation,
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
      const interpolate = scenario.interpolation;
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
      const counts = new Int32Array(6);
      const PHASE = 0;
      const DRAWS = 1;
      const PARTICLES = 2;
      const TILES = 3;
      // Frames still to settle before a phase records: the first frame after the forced garbage
      // collection of the headless run (a `gc()` can stall a second) starts the phase's clock.
      const SETTLE = 4;
      // Frames the current measured phase has recorded (see `BenchTiming.minFrames`).
      const RECORDED = 5;
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
            if (interpolate) frame.alpha = loop.alpha;
            const t0 = clock.now();
            parallax.sync(scene.parallax);
            terrain.sync(scene.terrain, scene.camera);
            renderer.render(frame);
            if (phase === 2 && context !== null) context.finish();
            const elapsed = clock.now() - t0;
            if (phase === 1) sampler.free(elapsed, delta, ticks);
            else if (phase === 2) sampler.synced(elapsed);
            if (phase > 0) counts[RECORDED]++;
            if (phase > 0) {
              const live = particles === null ? 0 : particles.liveCount;
              if (live < counts[PARTICLES]) counts[PARTICLES] = live;
              const tiles = scene.visibleTiles();
              if (tiles < counts[TILES]) counts[TILES] = tiles;
            }
            if (
              !settling &&
              now - times[START] >= durations[phase] &&
              (phase === 0 || counts[RECORDED] >= timing.minFrames)
            ) {
              if (phase === 1) counts[DRAWS] = renderer.drawCalls;
              const next = phase + 1;
              counts[PHASE] = next;
              counts[RECORDED] = 0;
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
                  variant: scenario.row,
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

/** The texture source type the renderer uploads (Pixi's `TextureSource`). */
type UploadSource = Parameters<PixiRenderer['uploadTextureSource']>[0];

/**
 * Runs the decode scenario on this page (plan R1-05 B4 — see `./decode.ts`): a renderer on the ×1
 * atlas at the v2 frame (640×360) on the window's display, then {@link measureDecode} over the bench
 * build's decode pages, each wrapped in a texture source by `createAtlas` exactly as the game wraps
 * an atlas page and uploaded through `uploadTextureSource`. The progress is drawn between the
 * measurements.
 *
 * @param options - The app options (window, canvas, assets).
 * @param webGLVersion - The WebGL version to ask for.
 * @param label - The progress label's prefix.
 * @param repetitions - Repetitions per page.
 * @returns Resolves with the record — never rejects: a scenario that cannot run at all (no pages,
 *   no renderer) resolves with a record that carries the error and no pages.
 */
function measureDecodeScenario(
  options: RenderBenchAppOptions,
  webGLVersion: 1 | 2,
  label: string,
  repetitions: number,
): Promise<DecodeBenchRecord> {
  const { win, canvas, assets } = options;
  const decodeWin = win as unknown as DecodeWindow;
  const facts: DecodeMeasureOptions = {
    repetitions,
    webGLVersion,
    imageDecode:
      typeof (decodeWin.Image?.prototype as Partial<HTMLImageElement> | undefined)?.decode ===
      'function',
    wallClock: () => Date.now(),
  };
  return (async (): Promise<DecodeBenchRecord> => {
    const pages = assets.decode ?? [];
    if (pages.length === 0) {
      return failedDecodeRecord('this bench build has no decode pages', facts);
    }
    const size = BENCH_V2_SIZE;
    const source = atlasFor(assets, 1);
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
      preferWebGLVersion: webGLVersion,
    });
    const context = canvas.getContext(renderer.webGLVersion === 2 ? 'webgl2' : 'webgl') as {
      finish(): void;
    } | null;
    const ui = createDrawList(4, 2);
    const frame = new BenchFrame(null, createDrawList(1, 1), ui);
    const lineHeight = source.manifest.fonts.pixel?.lineHeight ?? 10;
    /**
     * Draws the progress line (between measurements, never inside one).
     *
     * @param text - What is being measured.
     */
    const show = (text: string): void => {
      drawBenchLines(ui, [{ text: `${label} ${text}`, color: NOTE_COLOR }], 4, 4, lineHeight);
      renderer.render(frame);
    };
    show('');
    const host = createDecodeHost({
      win: decodeWin,
      createSource: (image, page) =>
        createAtlas(
          {
            formatVersion: 2,
            pages: [{ file: page.url, w: page.width, h: page.height }],
            frames: {},
            sprites: {},
            animations: {},
            fonts: {},
          },
          [image as AtlasPageImage],
          { onWarning: () => {} },
        ).pages[0],
      upload: (texture) => {
        renderer.uploadTextureSource(texture as UploadSource);
      },
      finish: () => {
        context?.finish();
      },
      progress: show,
    });
    const record = await measureDecode(host, pages, {
      ...facts,
      webGLVersion: renderer.webGLVersion,
    });
    show('done');
    return record;
  })().catch((error: unknown) => failedDecodeRecord(String(error), facts));
}

/**
 * Runs the stand-in load (plan R3-04.M4a — see `./scene.ts`): the decode scenario's stand-in pages
 * as an atlas, one 640×360 frame drawn from it (bands, tile rows, enemies, the boss), warm-up, one
 * timed render and one synced render that waits for `gl.finish()`. Its record carries the scenario
 * id {@link STANDIN_SCENARIO_ID} and is stored and POSTed like a render scenario's.
 *
 * @param options - The app options (window, canvas, assets).
 * @param webGLVersion - The WebGL version to ask for.
 * @param label - The HUD label.
 * @returns Resolves with the record; rejects when the build has no stand-in pages or the frame
 *   cannot be drawn (the TV mode stops the run, as for a render scenario).
 */
async function measureStandinScenario(
  options: RenderBenchAppOptions,
  webGLVersion: 1 | 2,
  label: string,
): Promise<RenderBenchRecord> {
  const { win, canvas, assets } = options;
  const standin = assets.standin ?? null;
  if (standin === null || standin.pageUrls.length === 0) {
    throw new Error('this bench build has no stand-in pages');
  }
  const size = BENCH_V2_SIZE;
  const images = await Promise.all(standin.pageUrls.map((url) => loadImage(win, url)));
  const atlas = createAtlas(standin.manifest, images, { onWarning: () => {} });
  const scene = createStandinScene({
    width: size.width,
    height: size.height,
    manifest: standin.manifest,
  });
  const displayWidth = Math.max(1, Math.floor(win.innerWidth));
  const displayHeight = Math.max(1, Math.floor(win.innerHeight));
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  const meter = createRenderTargetMeter();
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
  });
  try {
    renderer.setSpriteNames(scene.names);
    const tables = createSpriteTables(atlas, scene.names);
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
    renderer.bindWorld(scene.world);
    const lineHeight = standin.manifest.fonts.pixel?.lineHeight ?? 10;
    drawBenchLines(scene.ui, [{ text: `${label} DRAW`, color: NOTE_COLOR }], 4, 4, lineHeight);
    const frame = new BenchFrame(scene.world, scene.hud, scene.ui);
    parallax.sync(scene.parallax);
    renderer.warmUp();
    const context = canvas.getContext(renderer.webGLVersion === 2 ? 'webgl2' : 'webgl') as {
      finish(): void;
    } | null;
    const clock = win.performance;
    collect(win);
    const heapStart = heapUsed(win);
    const t0 = clock.now();
    renderer.render(frame);
    const renderMs = clock.now() - t0;
    const t1 = clock.now();
    if (context !== null) context.finish();
    const syncMs = clock.now() - t1;
    collect(win);
    const heapEnd = heapUsed(win);
    const measured = heapStart >= 0 && heapEnd >= 0;
    let textureBytes = 0;
    for (const page of standin.manifest.pages) textureBytes += page.w * page.h * 4;
    return {
      scenario: STANDIN_SCENARIO_ID,
      index: STANDIN_SCENARIO_INDEX,
      size: size.id,
      width: size.width,
      height: size.height,
      density: size.density,
      variant: 'standin-zone',
      crt: 'off',
      filter: false,
      mode7: false,
      webGLVersion: renderer.webGLVersion,
      displayWidth,
      displayHeight,
      scale: renderer.viewport.scale,
      phaseMs: [0, 0, 0],
      frames: 1,
      syncedFrames: 1,
      renderMs: [renderMs, renderMs, renderMs, renderMs],
      syncedMs: [syncMs, syncMs, syncMs, syncMs],
      frameMs: [renderMs + syncMs, renderMs + syncMs, renderMs + syncMs, renderMs + syncMs],
      raf: [],
      tickFrames: [],
      twoTickShare: 0,
      drawCalls: renderer.drawCalls,
      rebuilds: renderer.structureRebuilds,
      renderTargetBytes: meter.bytes,
      frameTargetBytes: size.width * size.height * 4,
      textureBytes,
      atlasPages: standin.manifest.pages.length,
      heapMeasured: measured,
      heapStartBytes: measured ? heapStart : 0,
      heapEndBytes: measured ? heapEnd : 0,
      heapDeltaBytes: measured ? heapEnd - heapStart : 0,
      load: {
        bullets: 0,
        points: 0,
        enemies: scene.liveEnemies,
        particles: 0,
        tiles: scene.visibleTiles(),
      },
      endedAt: Date.now(),
    };
  } finally {
    // Nothing else is torn down: the page is reloaded (TV) or closed (headless) after its one load.
    meter.stop();
  }
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
    mark(win, outcome.error === null ? 'done' : 'error');
  };
  mark(win, 'running');
  const gl = benchWebGLVersion(search, storageOf(win));
  if (scenarioId === DECODE_SCENARIO_ID) {
    const repetitions = decodeRepetitionsFromSearch(search, HEADLESS_DECODE_REPETITIONS);
    void measureDecodeScenario(options, gl, 'R1-05 DECODE', repetitions).then((decode) => {
      publish({ record: null, decode, error: decode.error });
    });
    return;
  }
  if (scenarioId === STANDIN_SCENARIO_ID) {
    measureStandinScenario(options, gl, 'R3-04 STAND-IN').then(
      (record) => {
        publish({ record, error: null });
      },
      (error: unknown) => {
        publish({ record: null, error: String(error) });
      },
    );
    return;
  }
  if (scenarioId === REWIND_SCENARIO_ID) {
    // The rewind scenario (R2 TL-3) needs no renderer and no GL: one synchronous sim loop.
    const ticks = rewindTicksFromSearch(search, HEADLESS_REWIND_TICKS);
    const rewind = measureRewindScenario(
      options.buildId,
      ticks,
      () => Date.now(),
      () => win.performance.now(),
    );
    publish({ record: null, rewind, error: rewind.error });
    return;
  }
  const scenario = findBenchScenario(scenarioId);
  if (scenario === null) {
    publish({ record: null, error: `unknown scenario "${scenarioId}"` });
    return;
  }
  const skip = benchScenarioSetup(scenario, options.output ?? null).skip;
  if (skip !== null) {
    publish({ record: null, error: `skipped: ${skip}` });
    return;
  }
  const timing = timingFromSearch(search, HEADLESS_BENCH_TIMING);
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
  const output = options.output ?? null;
  const stored = parseRunState(read(storage));
  // The scenarios this build skips by design (`./output.ts`) are passed over before anything is
  // launched — no record, no reload.
  let state =
    stored === null
      ? null
      : skipPlannedScenarios(
          stored,
          (index) => benchScenarioSetup(BENCH_SCENARIOS[index], output).skip !== null,
        );
  if (state !== null && state !== stored) write(storage, BENCH_STATE_KEY, serializeRunState(state));
  const mode: 'scenario' | 'results' = state !== null && state.running ? 'scenario' : 'results';

  /**
   * Stores the state.
   *
   * @param next - The new state.
   */
  const save = (next: BenchRunState): void => {
    state = next;
    // Quota or a locked storage: the run goes on, the POSTs still carry its results.
    write(storage, BENCH_STATE_KEY, serializeRunState(next));
  };
  /** Reloads the page for the next scenario (or the results page). */
  const reload = (): void => {
    win.location.reload();
  };
  const campaignConfig = options.campaign ?? null;
  /** The campaign's progress (`./campaign.ts`), `null` without a campaign build. */
  let campaign: BenchCampaignState | null =
    campaignConfig === null
      ? null
      : campaignFor(
          parseCampaign(read(storage, BENCH_CAMPAIGN_KEY)),
          campaignConfig,
          options.buildId,
        );
  /**
   * Stores the campaign.
   *
   * @param next - The new campaign state.
   */
  const saveCampaign = (next: BenchCampaignState): void => {
    campaign = next;
    try {
      storage?.setItem(BENCH_CAMPAIGN_KEY, serializeCampaign(next));
    } catch (_error) {
      // As for the run state: the campaign goes on in this page.
    }
  };
  /**
   * The session-level facts of a payload.
   *
   * @param run - The run.
   * @returns The env.
   */
  const envOf = (run: BenchRunState): TvBenchEnv => ({
    buildId: options.buildId,
    output: output === null ? null : output.id,
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
   * @param done - Whether the run is complete.
   * @param then - Runs once the server answered (or not).
   * @param decode - The decode scenario's record to carry too (plan R1-05 B4), if any.
   */
  const post = (
    records: RenderBenchRecord[],
    done: boolean,
    then: () => void,
    decode?: DecodeBenchRecord,
  ): void => {
    if (state === null || endpoint === null || (records.length === 0 && decode === undefined)) {
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
      decode,
    );
    sendRenderBench(
      endpoint,
      payload,
      () => new (win as unknown as { XMLHttpRequest: new () => XMLHttpRequest }).XMLHttpRequest(),
      (ok) => {
        if (ok && state !== null) {
          const indexes = records.map((record) => record.index);
          if (decode !== undefined) indexes.push(DECODE_SCENARIO_INDEX);
          save(markSent(state, indexes));
        }
        then();
      },
    );
  };

  /** Turns the results page (set by `showResults`; a scenario page has none). */
  let turnPage: (delta: number) => void = () => {};
  /** What **Enter** does on a campaign's results page (`null`: start a run by hand, as without). */
  let campaignEnter: (() => void) | null = null;

  win.addEventListener('keydown', (event: KeyboardEvent) => {
    const key = benchKeyOf(event.keyCode);
    if (key === null) return;
    event.preventDefault();
    if (key === 'prev' || key === 'next') {
      if (mode === 'results') turnPage(key === 'next' ? 1 : -1);
      return;
    }
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
    if (mode === 'results' && campaignEnter !== null) {
      campaignEnter();
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

  if (mode === 'scenario' && state !== null && campaign !== null) {
    // The campaign's guard: a scenario launched more than MAX_SCENARIO_ATTEMPTS times in a row
    // crashed or hung the TV every time — skip it rather than be relaunched into it forever.
    const launch = noteScenarioLaunch(campaign, state);
    saveCampaign(launch.campaign);
    if (launch.skip) {
      mark(win, 'scenario');
      save(skipScenario(state, `skipped after ${launch.campaign.attempt?.count ?? 0} launches`));
      reload();
      return;
    }
  }
  if (mode === 'scenario' && state !== null && state.cursor === DECODE_SCENARIO_INDEX) {
    const run: BenchRunState = state;
    mark(win, 'scenario');
    void measureDecodeScenario(
      options,
      run.webGLVersion === 2 ? 2 : 1,
      `R1-05 DECODE ${run.cursor + 1}/${BENCH_RUN_LENGTH} GL${run.webGLVersion}`,
      decodeRepetitionsFromSearch(search, TV_DECODE_REPETITIONS),
    ).then((record) => {
      if (state === null) return;
      const next = recordDecode(state, record);
      save(next);
      post([], next.cursor >= BENCH_RUN_LENGTH, reload, record);
    });
    return;
  }
  if (mode === 'scenario' && state !== null && state.cursor === STANDIN_SCENARIO_INDEX) {
    // The run's last page load (plan R3-04.M4a): the stand-in frame, stored and POSTed like a
    // render scenario's record — and, like one, a failure stops the run instead of recording it.
    const run: BenchRunState = state;
    mark(win, 'scenario');
    measureStandinScenario(
      options,
      run.webGLVersion === 2 ? 2 : 1,
      `R3-04 STAND-IN ${run.cursor + 1}/${BENCH_RUN_LENGTH} GL${run.webGLVersion}`,
    ).then(
      (record) => {
        if (state === null) return;
        const next = recordResult(state, record);
        save(next);
        post([record], next.cursor >= BENCH_RUN_LENGTH, reload);
      },
      (error: unknown) => {
        if (state !== null) save(stopRun(state, String(error)));
        reload();
      },
    );
    return;
  }
  if (mode === 'scenario' && state !== null && state.cursor === REWIND_SCENARIO_INDEX) {
    // The run's fourth special page (R2 TL-3): the rewind loop, stored for the results table and
    // never POSTed (the payload protocol is the render records and the decode record — rule: the
    // server's schema does not move for a scenario that is a bench-build-local number).
    mark(win, 'scenario');
    const record = measureRewindScenario(
      options.buildId,
      rewindTicksFromSearch(search, TV_REWIND_TICKS),
      () => Date.now(),
      () => win.performance.now(),
    );
    const next = recordRewind(state, record);
    save(next);
    post([], next.cursor >= BENCH_RUN_LENGTH, reload);
    return;
  }
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
        post([record], next.cursor >= BENCH_RUN_LENGTH, reload);
      },
      (error: unknown) => {
        if (state !== null) save(stopRun(state, String(error)));
        reload();
      },
    );
    return;
  }
  /**
   * The campaign mode's results page (see the module docs): sets what **Enter** does and returns
   * what runs once the unacknowledged records were re-sent — a countdown, then the next step.
   *
   * @param current - The campaign.
   * @returns The callback `showResults` calls with its status-line drawer.
   */
  function campaignResults(current: BenchCampaignState): (draw: (status: string) => void) => void {
    const step = campaignStep(current, state);
    if (step === 'complete') {
      return (draw) => {
        draw(campaignStatus(current, step, state, 0));
      };
    }
    let ready = false;
    let early = false;
    let fired = false;
    /** Takes the step: resumes the stopped pass or starts the next one, then reloads. */
    const act = (): void => {
      if (fired) return;
      fired = true;
      if (step === 'resume') {
        if (state !== null) save(resumeRun(state));
      } else {
        const now = Date.now();
        const session = makeRenderBenchSessionId(now, Math.random());
        // The run first: a power cut between the two writes repeats a pass, never skips one.
        save(
          createRunState(
            session,
            now,
            current.passes[current.next],
            timingFromSearch(search, TV_BENCH_TIMING),
          ),
        );
        saveCampaign(startPass(current, session));
      }
      reload();
    };
    campaignEnter = (): void => {
      if (ready) act();
      else early = true;
    };
    return (draw) => {
      ready = true;
      if (early) {
        act();
        return;
      }
      const deadline =
        Date.now() + (step === 'resume' ? CAMPAIGN_RESUME_MS : (campaignConfig?.pauseMs ?? 0));
      /** One countdown step: redraws the seconds left, or acts once they ran out. */
      const tick = (): void => {
        if (fired) return;
        const left = Math.ceil((deadline - Date.now()) / 1000);
        if (left <= 0) {
          act();
          return;
        }
        draw(campaignStatus(current, step, state, left));
        win.setTimeout(tick, COUNTDOWN_STEP_MS);
      };
      tick();
    };
  }
  mark(win, 'results');
  const settled = campaign === null ? undefined : campaignResults(campaign);
  showResults(
    options,
    host,
    endpoint,
    () => state,
    post,
    (turn) => {
      turnPage = turn;
    },
    settled,
  );
}

/**
 * Stores a text, ignoring a storage that refuses it (quota, a locked or missing storage).
 *
 * @param storage - The storage, or `null`.
 * @param key - The key.
 * @param text - The text.
 */
function write(storage: Storage | null, key: string, text: string): void {
  try {
    storage?.setItem(key, text);
  } catch (_error) {
    // The caller goes on without it.
  }
}

/**
 * Reads a stored state's text.
 *
 * @param storage - The storage, or `null`.
 * @param key - The key (default the run state's, {@link BENCH_STATE_KEY}).
 * @returns The text, or `null`.
 */
function read(storage: Storage | null, key: string = BENCH_STATE_KEY): string | null {
  try {
    return storage?.getItem(key) ?? null;
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
 * @param onPager - Receives the function that turns the page (the remote's Left / Right).
 * @param onSettled - The campaign mode's continuation (`runOnTv`): called with the status-line
 *   drawer once the re-POST of unacknowledged records is over — at once when there is nothing to
 *   send, else after the server answered; records still unacknowledged are re-sent up to
 *   {@link CAMPAIGN_POST_RETRIES} times {@link CAMPAIGN_POST_RETRY_MS} apart first, then it carries
 *   on anyway. Absent without a campaign (one POST, no retries — as before).
 */
function showResults(
  options: RenderBenchAppOptions,
  host: BenchHost,
  endpoint: string | null,
  getState: () => BenchRunState | null,
  post: (
    records: RenderBenchRecord[],
    done: boolean,
    then: () => void,
    decode?: DecodeBenchRecord,
  ) => void,
  onPager: (turn: (delta: number) => void) => void,
  onSettled?: (draw: (status: string) => void) => void,
): void {
  const { win, canvas } = options;
  const output = options.output ?? null;
  const skipped = benchSkippedScenarios(output);
  const size = BENCH_V2_SIZE;
  const source = atlasFor(options.assets, 1);
  const ui = createDrawList(256, RESULTS_MAX_LINES);
  const hud = createDrawList(1, 1);
  const lineHeight = source.manifest.fonts.pixel?.lineHeight ?? 10;
  // Whole lines that fit the frame below the 4-px top margin.
  const maxLines = Math.max(
    1,
    Math.min(RESULTS_MAX_LINES, Math.floor((size.height - RESULTS_MARGIN) / lineHeight)),
  );
  let page = 0;
  let lastStatus = '';
  /** The plain-text page shown when the renderer could not start (no WebGL), or `null`. */
  let fallback: HTMLPreElement | null = null;
  /** Why the renderer could not start (the plain-text page's status line). */
  let fallbackError = '';
  /**
   * What the page shows for the current state.
   *
   * @param status - The log line's status.
   * @returns The page input.
   */
  const inputOf = (status: string): BenchPageInput => ({
    state: getState(),
    output: output === null ? null : output.id,
    skipped,
    buildId: options.buildId,
    host: host.name,
    webGLVersion: benchWebGLVersion(
      (win as Partial<Window>).location?.search ?? '',
      storageOf(win),
    ),
    display: `${win.innerWidth}x${win.innerHeight}`,
    endpoint,
    status,
    scenarios: BENCH_SCENARIOS.length - skipped.length,
    timing: TV_BENCH_TIMING,
    page,
    maxLines,
  });
  /**
   * The page's lines for the current state.
   *
   * @param status - The log line's status.
   * @returns The lines.
   */
  const lines = (status: string): BenchLine[] => benchPageLines(inputOf(status));
  /** Rewrites the plain-text page (no WebGL) for the current page number. */
  const drawFallback = (): void => {
    if (fallback === null) return;
    fallback.textContent = lines(fallbackError)
      .map((line) => line.text)
      .join('\n');
  };
  /**
   * Redraws the page.
   *
   * @param status - The log line's status.
   */
  const draw = (status: string): void => {
    lastStatus = status;
    drawBenchLines(ui, lines(status), RESULTS_MARGIN, RESULTS_MARGIN, lineHeight);
    drawFallback();
  };
  onPager((delta) => {
    const pages = benchResultPages(inputOf(lastStatus));
    page = (page + delta + pages) % pages;
    draw(lastStatus);
  });
  const state = getState();
  /**
   * The results the log server has not acknowledged (the decode record counts as one).
   *
   * @param run - The state.
   * @returns How many.
   */
  const pending = (run: BenchRunState | null): number =>
    run === null ? 0 : unsentRecords(run).length + (decodeUnsent(run) ? 1 : 0);
  const unsent = pending(state);
  draw(unsent > 0 && endpoint !== null ? `sending ${unsent} result(s)...` : '');
  let retries = 0;
  /**
   * POSTs the unacknowledged records of the current state, then reports — and, in the campaign
   * mode, retries or hands over to `onSettled`.
   */
  const send = (): void => {
    const run = getState();
    if (run === null) {
      onSettled?.(draw);
      return;
    }
    post(
      unsentRecords(run),
      run.cursor >= BENCH_RUN_LENGTH,
      () => {
        const left = pending(getState());
        draw(left === 0 ? 'all results acknowledged' : `${left} result(s) not acknowledged`);
        if (onSettled === undefined) return;
        if (left === 0 || retries >= CAMPAIGN_POST_RETRIES) {
          onSettled(draw);
          return;
        }
        retries++;
        win.setTimeout(send, CAMPAIGN_POST_RETRY_MS);
      },
      decodeUnsent(run) && run.decode !== null ? run.decode : undefined,
    );
  };
  if (state !== null && unsent > 0 && endpoint !== null) send();
  else if (onSettled !== undefined) onSettled(draw);
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
      glyphCapacity: RESULTS_GLYPHS,
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
    fallback = pre;
    fallbackError = String(error);
    drawFallback();
    win.document.body.appendChild(pre);
  });
}
