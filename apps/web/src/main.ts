/**
 * Browser entry point: boots the game into `#game` and keeps HMR clean by stopping
 * the previous instance when this module is replaced.
 *
 * @module
 */
import { bootWebApp, type WebApp } from './boot/index.js';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Shmup Cup: <canvas id="game"> not found');
}

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
