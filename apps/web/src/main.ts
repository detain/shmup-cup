/**
 * Browser entry point: boots the game into `#game` with the inlined content and atlas
 * (`virtual:shmup-content`, `virtual:shmup-assets`) — plus the debug tools in dev / test builds
 * (`__SHMUP_DEV__`, plan M1-19) — and keeps HMR clean by stopping the previous instance when this
 * module is replaced. In dev / test builds `?determinism` (plan M2-18) installs the cross-engine
 * determinism check (`window.__shmupDeterminism`) instead of booting the game; a release build
 * folds that branch away.
 *
 * Throws at load time when `index.html` has no `<canvas id="game">`; a failed boot shows the
 * boot error screen and is logged to the console as "Shmup Cup failed to start".
 *
 * @module
 */
import { debugToolsFactory, installDeterminismCheck } from '@shmup/shell';
import assets from 'virtual:shmup-assets';
import contentFiles from 'virtual:shmup-content';
import { bootWebApp, determinismFromSearch, type WebApp } from './boot/index.js';

/** The full-window canvas declared in `index.html`. */
const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Shmup Cup: <canvas id="game"> not found');
}

/** Dev / test builds opened with `?determinism`: the determinism check instead of the game. */
const determinism = __SHMUP_DEV__ && determinismFromSearch(window.location.search);

/** The booting app (none in the determinism check); kept so the HMR dispose hook can stop it. */
const started: Promise<WebApp> | null = determinism
  ? null
  : bootWebApp(canvas, {
      contentFiles,
      assets,
      // Dev / test builds only (F1–F8, the overlay); a release build folds this to `null`.
      debugTools: __SHMUP_DEV__ ? debugToolsFactory({ buildId: __SHMUP_BUILD__ }) : null,
    });
// Tested on the constant itself, so a release build drops the check with the branch.
if (determinism) installDeterminismCheck(window, contentFiles, () => performance.now());
if (started !== null) {
  started.catch((error: unknown) => {
    console.error('Shmup Cup failed to start', error);
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void started?.then((app) => {
      app.stop();
    });
  });
}
