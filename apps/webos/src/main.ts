/**
 * LG webOS entry point. Bundled into the single classic IIFE `app.js` — so no `import.meta`, no
 * top-level `await`, nothing newer than Chrome 69 at runtime. The content and the atlas manifest
 * are inlined into the bundle (`virtual:shmup-content`, `virtual:shmup-assets` — decision D25);
 * the atlas pages load from `assets/atlas/`. Dev / test builds (`__SHMUP_DEV__`) add the debug
 * tools behind the remote's Pause, Ch+, Ch+, Ch+ (plan M1-19).
 *
 * Throws at load time when `index.html` has no `<canvas id="game">`; a failed boot shows the boot
 * error screen and is logged as "Shmup Cup failed to start" (visible in the webOS Web Inspector).
 *
 * @module
 */
import assets from 'virtual:shmup-assets';
import contentFiles from 'virtual:shmup-content';
import { bootWebosApp, webosDebugTools } from './boot/index.js';

/** The full-screen canvas declared in `index.html`. */
const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Shmup Cup: <canvas id="game"> not found');
}

bootWebosApp(canvas, {
  contentFiles,
  assets,
  // Dev / test builds only (Pause, Ch+, Ch+, Ch+ → the overlay); the release bundle folds it away.
  debugTools: __SHMUP_DEV__ ? webosDebugTools(__SHMUP_BUILD__, __SHMUP_REPORT_URL__) : null,
  // The build the replays record (M3-01).
  buildId: __SHMUP_BUILD__,
}).catch((error: unknown) => {
  // Visible in the webOS Web Inspector (ares-inspect).
  console.error('Shmup Cup failed to start', error);
});
