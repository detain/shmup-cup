/**
 * Entry point of the TV render bench (plan R0-02): `bench/index.html` loads this, and the bench
 * builds (`vite.bench.config.ts` of `apps/tizen` and `apps/webos`) bundle it into the bench
 * widget's one classic `app.js`. The game's entry (`../main.ts`) never imports the bench, and only
 * this file reads the bench build's virtual module, so the rest of the module is testable in Node.
 *
 * @module
 */
import bench from 'virtual:shmup-render-bench';
import { startRenderBench } from './run.js';

startRenderBench({
  win: window,
  canvas: document.getElementById('game') as HTMLCanvasElement,
  reportUrl: __SHMUP_REPORT_URL__,
  buildId: __SHMUP_BUILD__,
  assets: bench,
});
