/**
 * Browser entry point: boots the game into `#game` and keeps HMR clean by stopping
 * the previous instance when this module is replaced.
 *
 * Throws at load time when `index.html` has no `<canvas id="game">`; a failed boot
 * (e.g. no WebGL) is logged to the console as "Shmup Cup failed to start".
 *
 * @module
 */
import { bootWebApp, type WebApp } from './boot/index.js';

/** The full-window canvas declared in `index.html`. */
const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Shmup Cup: <canvas id="game"> not found');
}

/** The booting app; kept so the HMR dispose hook can stop it. */
const started: Promise<WebApp> = bootWebApp(canvas);
started.catch((error: unknown) => {
  console.error('Shmup Cup failed to start', error);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void started.then((app) => {
      app.stop();
    });
  });
}
