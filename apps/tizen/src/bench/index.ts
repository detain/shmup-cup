/**
 * # bench — the TV render benchmark (plan R0-02, `pnpm bench:tv`)
 *
 * **Responsibility.** A self-running widget, built from this app with its own entry
 * (`bench/index.html` → `./main.ts`), its own app id (`ShmpCupBnc.RenderBench`, so it never
 * replaces the installed game) and its own output (`dist-bench/`), that measures what a frame
 * costs on the Samsung M7 under a load shaped like the v2 game — R0-02's **384×216**, **640×360**
 * and **960×540**, and since the R0-03 follow-up a sweep of fifteen internal frames up to
 * 1920×1080 in two art-density modes (`scaled` / `native`) plus three upscale knobs (`./matrix.ts`). It never runs the simulation: each scenario is a **density-scaled synthetic scene**
 * (`./scene.ts` — five parallax layers, ~35 % tile terrain, decor, 64 enemies, 512 enemy bullets,
 * 512 point items, 512 particles, the HUD bars) drawn by the real renderer from the real atlas
 * upscaled ×s at bench-build time (`scripts/bench-atlas.mjs` — eight densities from 1 to 2.67,
 * one or two atlas pages each; nothing is added to the game's atlas). Six variants per size
 * (`./matrix.ts`: busy, a filtered layer, Mode-7, CRT light, CRT full, all of them) over 25 sizes,
 * then 22 knob rows, make the 172-scenario matrix.
 *
 * **One scenario per page load** (Pixi's `TexturePool` is global and never shrinks): the cursor
 * and the results live in `localStorage` (`./state.ts`) and the page reloads between scenarios.
 * Each scenario renders 10 s of warm-up, 14 s free-running — render CPU ms, the rAF-delta
 * histogram (12/15/17/19/21/25/33 ms) and the share of frames the vsync-locked loop gave two
 * ticks — and 6 s **synced** with `gl.finish()` after every render (WebGL is asynchronous; fill cost
 * otherwise only shows as late frames), plus draw calls, pooled render-target bytes, atlas texture
 * bytes and the coarse JS heap (`./run.ts`, `./stats.ts`). Remote: **Enter** starts the matrix,
 * **Back** exits (and stops a run, so the next Enter starts a fresh session), **Red** re-runs a
 * scenario, **Left / Right** page the results (`./host.ts`).
 *
 * **Results three ways:** an on-screen table in the bitmap font after the run (`./results.ts` —
 * photographing the TV is enough), a `render-bench` payload per scenario POSTed through the shell
 * telemetry's sender (`@shmup/shell` `sendRenderBench`) to the input probe's log server, analysed
 * by `tools/input-probe/results/analyze-bench.mjs` relative to the session's own 384×216 rows, and
 * the stored state, kept until a later run overwrites it. **The results never block the plan** —
 * they set budgets (plan §13; the owner's run is R0-03).
 *
 * **Campaign mode (R0-03).** A bench built with `VITE_BENCH_CAMPAIGN=1,2,…` (`./campaign.ts`) runs
 * those passes — one WebGL version each — back to back with no key press: the results page waits
 * `VITE_BENCH_PAUSE_S` seconds (30 by default), starts the next pass, resumes a stopped one, and
 * skips a scenario that crashed or hung the TV on {@link MAX_SCENARIO_ATTEMPTS} launches; a desktop
 * orchestrator relaunches the app between passes and after a silence.
 *
 * **Build output (`VITE_BENCH_OUTPUT`).** A bench built with `VITE_BENCH_OUTPUT=1280x720` (or any
 * `<w>x<h>`, `./output.ts`) draws every scenario without its own output knob into a backbuffer of
 * that size, upscaled with `'fit'` unless its knob says otherwise, skips — without launching — the
 * scenarios whose frame is larger than their backbuffer, and reports the build id
 * `<__SHMUP_BUILD__>@<w>x<h>`, so its campaign and payloads never mix with another build's.
 *
 * The same page measures one scenario headlessly with `?scenario=<id>` — `pnpm bench`
 * (`test/bench/render.perf.ts`) gates the counted figures of every scenario that way.
 *
 * **The decode scenario (plan R1-05 B4, decision W3-6).** After the matrix a run loads the page
 * once more for `decode` (`./decode.ts`): the PNG pages the bench build ships
 * (`scripts/bench-decode.mjs` — the stand-in zone A's own PNG-8 page (or two, plan R3-04.M4a), the
 * shipped `common` and zone A pages) are fetched with XHR, decoded by an `HTMLImageElement` and
 * uploaded through the renderer's `uploadTextureSource` — and decoded by `createImageBitmap` too —
 * eight times each, every stage timed (median / p95) and every texture released between
 * repetitions: the page-decode figure plan R3-04 estimates its zone-load time from. The run's
 * last page load is `standin-zone`: one 640×360 frame drawn from the stand-in pages through the
 * real bindings, measured like a render scenario (`./scene.ts` `createStandinScene`, `./run.ts`
 * `measureStandinScenario`). R0-02's 18
 * scenarios keep their ids in the larger matrix, so R0-02's and R0-03's numbers stay comparable.
 *
 * **Implements.**
 * - shmup_feat.md §22 — the render budget (render ≤ 8 ms, draw calls) the measurements are read
 *   against
 * - shmup_feat.md §24 — dev tooling: on-device measurement
 * - shmup_tech.md §2.2 — the TV GPU: WebGL 1 / 2, 2048² atlas pages
 *
 * **Public API.** {@link startRenderBench}, {@link RenderBenchAppOptions},
 * {@link TvBenchOutcome}, {@link TvBenchEnv}, {@link TV_BENCH_MARKER}, {@link BENCH_GL_KEY},
 * {@link benchWebGLVersion}, {@link BenchAssets}, {@link BenchAtlasData}, {@link atlasFor}; the
 * matrix ({@link BENCH_RESOLUTIONS}, {@link BENCH_SIZES}, {@link BENCH_DENSITIES},
 * {@link BENCH_V2_SIZE}, {@link BENCH_MAX_ATLAS_PAGES}, {@link BENCH_VARIANTS}, {@link BENCH_KNOBS},
 * {@link BENCH_DEFAULT_SCALE_MODE}, {@link BENCH_SCENARIOS}, {@link findBenchScenario},
 * {@link findBenchSize}, {@link BenchResolution}, {@link BenchArtMode}, {@link BenchKnob},
 * {@link BenchSize}, {@link BenchVariant},
 * {@link BenchScenario}, {@link BenchTiming}, {@link TV_BENCH_TIMING},
 * {@link HEADLESS_BENCH_TIMING}, {@link timingFromSearch}, {@link searchParam}); the scene
 * ({@link BenchScene}, {@link BenchSceneOptions}, {@link BenchSceneManifest}, {@link BenchSprites},
 * {@link pickBenchSprites}, {@link createStandinScene}, {@link BENCH_LOAD}, {@link BENCH_BASE_UNIT},
 * {@link BENCH_TERRAIN_COLUMNS}, {@link BenchRandom}, {@link BenchCamera}, {@link BenchParticles},
 * {@link fillBenchParticles}, {@link BenchStandinScene}); the sampler ({@link BenchSampler}, {@link BenchSeries},
 * {@link summarizeSeries}, {@link roundTo}, {@link BENCH_MAX_FRAMES}, {@link BENCH_TICK_BUCKETS});
 * the results ({@link formatResultsTable}, {@link formatResultsHeader}, {@link formatResultRow},
 * {@link baselineOf}, {@link lateShare}, {@link benchPageLines}, {@link benchResultPages},
 * {@link drawBenchLines},
 * {@link BenchLine}, {@link BenchPageInput}, the colours, and the decode table
 * {@link formatDecodeTable}, {@link formatDecodeHeader}, {@link formatDecodeRow}); the run state
 * ({@link BenchRunState}, {@link BENCH_STATE_KEY}, {@link BENCH_STATE_VERSION},
 * {@link createRunState}, {@link isRecord}, {@link isDecodeRecord}, {@link parseRunState},
 * {@link serializeRunState}, {@link recordResult}, {@link recordDecode}, {@link markSent},
 * {@link nextSeq}, {@link unsentRecords}, {@link decodeUnsent}, {@link stopRun},
 * {@link rerunScenario}, {@link skipScenario}, {@link skipPlannedScenarios}, {@link resumeRun}); the
 * build output ({@link parseBenchOutput}, {@link benchBuildId}, {@link benchScenarioSetup},
 * {@link benchSkippedScenarios}, {@link BENCH_OUTPUT_SCALE_MODE}, {@link BENCH_MAX_OUTPUT_SIDE},
 * {@link BenchOutput}, {@link BenchScenarioSetup}, and the results page's
 * {@link formatOutputLines}); the campaign
 * ({@link BENCH_CAMPAIGN_KEY}, {@link BENCH_CAMPAIGN_VERSION}, {@link MAX_SCENARIO_ATTEMPTS},
 * {@link DEFAULT_CAMPAIGN_PAUSE_S}, {@link CAMPAIGN_RESUME_MS}, {@link parseCampaignConfig},
 * {@link createCampaign}, {@link parseCampaign}, {@link serializeCampaign}, {@link campaignFor},
 * {@link noteScenarioLaunch}, {@link campaignStep}, {@link startPass}, {@link campaignStatus},
 * {@link BenchCampaignConfig}, {@link BenchCampaignState}, {@link BenchCampaignAttempt},
 * {@link BenchCampaignStep}, {@link BenchPassGL}); the decode scenario ({@link DECODE_SCENARIO_ID},
 * {@link DECODE_SCENARIO_INDEX}, {@link STANDIN_SCENARIO_ID}, {@link STANDIN_SCENARIO_INDEX},
 * {@link BENCH_RUN_LENGTH}, {@link TV_DECODE_REPETITIONS},
 * {@link HEADLESS_DECODE_REPETITIONS}, {@link MAX_DECODE_REPETITIONS},
 * {@link DECODE_STAGE_TIMEOUT_MS}, {@link measureDecode}, {@link failedDecodeRecord},
 * {@link createDecodeHost}, {@link decodeRepetitionsFromSearch}, {@link pngEncodingOf},
 * {@link summarizeRuns}, {@link BenchDecodePage}, {@link DecodedPage}, {@link DecodeTexture},
 * {@link DecodeHost}, {@link DecodeHostOptions}, {@link DecodeMeasureOptions},
 * {@link DecodeWindow}); the host ({@link detectBenchHost}, {@link benchKeyOf},
 * {@link BENCH_KEY_CODES}, {@link BenchHost}, {@link BenchKey}).
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'bench',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §24', 'shmup_tech.md §2.2'],
});

export {
  BENCH_GL_KEY,
  TV_BENCH_MARKER,
  atlasFor,
  benchWebGLVersion,
  startRenderBench,
  type BenchAssets,
  type BenchAtlasData,
  type BenchStandinData,
  type RenderBenchAppOptions,
  type TvBenchEnv,
  type TvBenchOutcome,
} from './run.js';
export {
  BENCH_MAX_OUTPUT_SIDE,
  BENCH_OUTPUT_SCALE_MODE,
  benchBuildId,
  benchScenarioSetup,
  benchSkippedScenarios,
  parseBenchOutput,
  type BenchOutput,
  type BenchScenarioSetup,
} from './output.js';
export {
  BENCH_DEFAULT_SCALE_MODE,
  BENCH_DENSITIES,
  BENCH_KNOBS,
  BENCH_MAX_ATLAS_PAGES,
  BENCH_RESOLUTIONS,
  BENCH_SCENARIOS,
  BENCH_SIZES,
  BENCH_V2_SIZE,
  BENCH_VARIANTS,
  HEADLESS_BENCH_TIMING,
  TV_BENCH_TIMING,
  findBenchScenario,
  findBenchSize,
  searchParam,
  timingFromSearch,
  type BenchArtMode,
  type BenchKnob,
  type BenchResolution,
  type BenchScenario,
  type BenchSize,
  type BenchTiming,
  type BenchVariant,
} from './matrix.js';
export {
  BENCH_BASE_UNIT,
  BENCH_LOAD,
  BENCH_TERRAIN_COLUMNS,
  BenchCamera,
  BenchRandom,
  BenchScene,
  createStandinScene,
  fillBenchParticles,
  pickBenchSprites,
  type BenchParticles,
  type BenchSceneManifest,
  type BenchSceneOptions,
  type BenchSprites,
  type BenchStandinScene,
} from './scene.js';
export {
  BENCH_MAX_FRAMES,
  BENCH_TICK_BUCKETS,
  BenchSampler,
  BenchSeries,
  roundTo,
  summarizeSeries,
} from './stats.js';
export {
  ERROR_COLOR,
  HEADER_COLOR,
  NOTE_COLOR,
  ROW_COLOR,
  baselineOf,
  benchPageLines,
  benchResultPages,
  drawBenchLines,
  formatDecodeHeader,
  formatDecodeRow,
  formatDecodeTable,
  formatResultRow,
  formatResultsHeader,
  formatOutputLines,
  formatResultsTable,
  lateShare,
  type BenchLine,
  type BenchPageInput,
} from './results.js';
export {
  BENCH_STATE_KEY,
  BENCH_STATE_VERSION,
  createRunState,
  decodeUnsent,
  isDecodeRecord,
  markSent,
  nextSeq,
  parseRunState,
  recordDecode,
  recordResult,
  rerunScenario,
  resumeRun,
  serializeRunState,
  isRecord,
  skipPlannedScenarios,
  skipScenario,
  stopRun,
  unsentRecords,
  type BenchRunState,
} from './state.js';
export {
  BENCH_CAMPAIGN_KEY,
  BENCH_CAMPAIGN_VERSION,
  CAMPAIGN_RESUME_MS,
  DEFAULT_CAMPAIGN_PAUSE_S,
  MAX_SCENARIO_ATTEMPTS,
  campaignFor,
  campaignStatus,
  campaignStep,
  createCampaign,
  noteScenarioLaunch,
  parseCampaign,
  parseCampaignConfig,
  serializeCampaign,
  startPass,
  type BenchCampaignAttempt,
  type BenchCampaignConfig,
  type BenchCampaignState,
  type BenchCampaignStep,
  type BenchPassGL,
} from './campaign.js';
export {
  BENCH_RUN_LENGTH,
  DECODE_SCENARIO_ID,
  DECODE_SCENARIO_INDEX,
  DECODE_STAGE_TIMEOUT_MS,
  HEADLESS_DECODE_REPETITIONS,
  MAX_DECODE_REPETITIONS,
  STANDIN_SCENARIO_ID,
  STANDIN_SCENARIO_INDEX,
  TV_DECODE_REPETITIONS,
  createDecodeHost,
  decodeRepetitionsFromSearch,
  failedDecodeRecord,
  measureDecode,
  pngEncodingOf,
  summarizeRuns,
  type BenchDecodePage,
  type DecodeHost,
  type DecodeHostOptions,
  type DecodeMeasureOptions,
  type DecodeTexture,
  type DecodeWindow,
  type DecodedPage,
} from './decode.js';
export {
  BENCH_KEY_CODES,
  benchKeyOf,
  detectBenchHost,
  type BenchHost,
  type BenchKey,
} from './host.js';
