/**
 * Entry point of the TV render bench (plan R0-02): `bench/index.html` loads this, and the bench
 * builds (`vite.bench.config.ts` of `apps/tizen` and `apps/webos`) bundle it into the bench
 * widget's one classic `app.js`. The game's entry (`../main.ts`) never imports the bench, and only
 * this file reads the bench build's virtual module, so the rest of the module is testable in Node.
 * It also reads the bench build's campaign defines (`VITE_BENCH_CAMPAIGN`, `VITE_BENCH_PAUSE_S` —
 * `./campaign.ts`); without them the bench runs as it always did.
 *
 * @module
 */
import bench from 'virtual:shmup-render-bench';
import { parseCampaignConfig } from './campaign.js';
import { startRenderBench } from './run.js';

startRenderBench({
  win: window,
  canvas: document.getElementById('game') as HTMLCanvasElement,
  reportUrl: __SHMUP_REPORT_URL__,
  buildId: __SHMUP_BUILD__,
  assets: bench,
  campaign: parseCampaignConfig(__SHMUP_BENCH_CAMPAIGN__, __SHMUP_BENCH_PAUSE_S__),
});
