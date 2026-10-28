/**
 * Entry point of the TV render bench (plan R0-02): `bench/index.html` loads this, and the bench
 * builds (`vite.bench.config.ts` of `apps/tizen` and `apps/webos`) bundle it into the bench
 * widget's one classic `app.js`. The game's entry (`../main.ts`) never imports the bench, and only
 * this file reads the bench build's virtual module, so the rest of the module is testable in Node.
 * It also reads the bench build's campaign defines (`VITE_BENCH_CAMPAIGN`, `VITE_BENCH_PAUSE_S` —
 * `./campaign.ts`), its output define (`VITE_BENCH_OUTPUT` — `./output.ts`, which also gives
 * the build id) and its atlas-encoding define (`VITE_BENCH_SVG` — the same file); without them the
 * bench runs as it always did.
 *
 * @module
 */
import bench from 'virtual:shmup-render-bench';
import { parseCampaignConfig } from './campaign.js';
import { parseBenchOutput, parseBenchSvg } from './output.js';
import { startRenderBench } from './run.js';

startRenderBench({
  win: window,
  canvas: document.getElementById('game') as HTMLCanvasElement,
  reportUrl: __SHMUP_REPORT_URL__,
  // `__SHMUP_BUILD__`, plus `@<w>x<h>` in a build with an output — composed by the bench config so
  // it is a literal in app.js, where `scripts/bench-campaign.mjs` reads it (`./output.ts`).
  buildId: __SHMUP_BENCH_BUILD_ID__,
  // The game-code hash baked in by the bench configs (plan v20x BENCSKIP): the skip ledger's
  // and the payloads' pooling identity — every change that could move a drawn pixel alters it.
  gameCodeHash: __SHMUP_GAME_CODE_HASH__,
  assets: bench,
  campaign: parseCampaignConfig(__SHMUP_BENCH_CAMPAIGN__, __SHMUP_BENCH_PAUSE_S__),
  output: parseBenchOutput(__SHMUP_BENCH_OUTPUT__),
  // The atlas-page encoding the bundle was built with (`VITE_BENCH_SVG`): the payload says which
  // arm ran, so the analyzer never pools an SVG session's rows with the PNG bench's (`./output.ts`).
  svgEnc: parseBenchSvg(__SHMUP_BENCH_SVG__),
});
