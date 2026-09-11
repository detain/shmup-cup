/**
 * Tizen entry point. Bundled into the single classic IIFE `app.js` — so no
 * `import.meta`, no top-level `await`, nothing newer than Chrome 69 at runtime.
 *
 * @module
 */
import { bootTizenApp } from './boot/index.js';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Shmup Cup: <canvas id="game"> not found');
}

bootTizenApp(canvas).catch((error: unknown) => {
  // Visible in the Chrome DevTools remote inspector (sdb / Tizen extension).
  console.error('Shmup Cup failed to start', error);
});
