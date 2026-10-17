/**
 * # bench — the TV render benchmark (plan R0-02, `pnpm bench:tv`)
 *
 * **Responsibility.** A self-running widget, built from this app with its own entry
 * (`bench/index.html` → `./main.ts`), its own app id (`ShmpCupBnc.RenderBench`, so it never
 * replaces the installed game) and its own output (`dist-bench/`), that measures what a frame
 * costs on the Samsung M7 at **384×216**, **640×360** and **960×540** under a load shaped like the
 * v2 game. It never runs the simulation: each scenario is a **density-scaled synthetic scene**
 * (`./scene.ts` — five parallax layers, ~35 % tile terrain, decor, 64 enemies, 512 enemy bullets,
 * 512 point items, 512 particles, the HUD bars) drawn by the real renderer from the real atlas
 * upscaled ×s at bench-build time (`scripts/bench-atlas.mjs` — s = 1 / 1.5 / 2.25, one, one and two
 * atlas pages; nothing is added to the game's atlas). Six variants per size (`./matrix.ts`: busy,
 * a filtered layer, Mode-7, CRT light, CRT full, all of them) make the 18-scenario matrix.
 *
 * **One scenario per page load** (Pixi's `TexturePool` is global and never shrinks): the cursor
 * and the results live in `localStorage` (`./state.ts`) and the page reloads between scenarios.
 * Each scenario renders 10 s of warm-up, 14 s free-running — render CPU ms, the rAF-delta
 * histogram (12/15/17/19/21/25/33 ms) and the share of frames the vsync-locked loop gave two
 * ticks — and 6 s **synced** with `gl.finish()` after every render (WebGL is asynchronous; fill cost
 * otherwise only shows as late frames), plus draw calls, pooled render-target bytes, atlas texture
 * bytes and the coarse JS heap (`./run.ts`, `./stats.ts`). Remote: **Enter** starts the matrix,
 * **Back** exits, **Red** re-runs a scenario (`./host.ts`).
 *
 * **Results three ways:** an on-screen table in the bitmap font after the run (`./results.ts` —
 * photographing the TV is enough), a `render-bench` payload per scenario POSTed through the shell
 * telemetry's sender (`@shmup/shell` `sendRenderBench`) to the input probe's log server, analysed
 * by `tools/input-probe/results/analyze-bench.mjs` relative to the session's own 384×216 rows, and
 * the stored state, kept until a later run overwrites it. **The results never block the plan** —
 * they set budgets (plan §13; the owner's run is R0-03).
 *
 * The same page measures one scenario headlessly with `?scenario=<id>` — `pnpm bench`
 * (`test/bench/render.perf.ts`) gates the counted figures of every scenario that way.
 *
 * **Implements.**
 * - shmup_feat.md §22 — the render budget (render ≤ 8 ms, draw calls) the measurements are read
 *   against
 * - shmup_feat.md §24 — dev tooling: on-device measurement
 * - shmup_tech.md §2.2 — the TV GPU: WebGL 1 / 2, 2048² atlas pages
 *
 * **Public API.** {@link startRenderBench}, {@link RenderBenchAppOptions},
 * {@link TvBenchOutcome}, {@link TV_BENCH_MARKER}, {@link BENCH_GL_KEY},
 * {@link benchWebGLVersion}, {@link BenchAssets}, {@link BenchAtlasData}, {@link atlasFor}; the
 * matrix ({@link BENCH_SIZES}, {@link BENCH_VARIANTS},
 * {@link BENCH_SCENARIOS}, {@link findBenchScenario}, {@link BenchSize}, {@link BenchVariant},
 * {@link BenchScenario}, {@link BenchTiming}, {@link TV_BENCH_TIMING},
 * {@link HEADLESS_BENCH_TIMING}, {@link timingFromSearch}, {@link searchParam}); the scene
 * ({@link BenchScene}, {@link BenchSceneOptions}, {@link BenchSceneManifest}, {@link BenchSprites},
 * {@link pickBenchSprites}, {@link BENCH_LOAD}, {@link BENCH_BASE_UNIT},
 * {@link BENCH_TERRAIN_COLUMNS}, {@link BenchRandom}, {@link BenchCamera}, {@link BenchParticles},
 * {@link fillBenchParticles}); the sampler ({@link BenchSampler}, {@link BenchSeries},
 * {@link summarizeSeries}, {@link roundTo}, {@link BENCH_MAX_FRAMES}, {@link BENCH_TICK_BUCKETS});
 * the results ({@link formatResultsTable}, {@link formatResultsHeader}, {@link formatResultRow},
 * {@link baselineOf}, {@link lateShare}, {@link benchPageLines}, {@link drawBenchLines},
 * {@link BenchLine}, {@link BenchPageInput}, the colours); the run state ({@link BenchRunState},
 * {@link BENCH_STATE_KEY}, {@link BENCH_STATE_VERSION}, {@link createRunState}, {@link isRecord},
 * {@link parseRunState}, {@link serializeRunState}, {@link recordResult}, {@link markSent},
 * {@link nextSeq}, {@link unsentRecords}, {@link stopRun}, {@link rerunScenario}); the host
 * ({@link detectBenchHost}, {@link benchKeyOf}, {@link BENCH_KEY_CODES}, {@link BenchHost},
 * {@link BenchKey}).
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
  type RenderBenchAppOptions,
  type TvBenchOutcome,
} from './run.js';
export {
  BENCH_SCENARIOS,
  BENCH_SIZES,
  BENCH_VARIANTS,
  HEADLESS_BENCH_TIMING,
  TV_BENCH_TIMING,
  findBenchScenario,
  searchParam,
  timingFromSearch,
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
  fillBenchParticles,
  pickBenchSprites,
  type BenchParticles,
  type BenchSceneManifest,
  type BenchSceneOptions,
  type BenchSprites,
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
  drawBenchLines,
  formatResultRow,
  formatResultsHeader,
  formatResultsTable,
  lateShare,
  type BenchLine,
  type BenchPageInput,
} from './results.js';
export {
  BENCH_STATE_KEY,
  BENCH_STATE_VERSION,
  createRunState,
  markSent,
  nextSeq,
  parseRunState,
  recordResult,
  rerunScenario,
  serializeRunState,
  isRecord,
  stopRun,
  unsentRecords,
  type BenchRunState,
} from './state.js';
export {
  BENCH_KEY_CODES,
  benchKeyOf,
  detectBenchHost,
  type BenchHost,
  type BenchKey,
} from './host.js';
