/**
 * # main/main — Electron main-process entry (ESM)
 *
 * **Responsibility.** Minimal desktop shell: registers the privileged `app://` scheme,
 * serves the bundled web build (`dist/renderer/`, copied from apps/web/dist at build
 * time) through it, opens one game window with a sandboxed preload, and handles the
 * quit request from the renderer. `SHMUP_DEV_URL` (e.g. `http://localhost:5173` while
 * `pnpm dev` runs) loads the Vite dev server instead for HMR.
 *
 * Environment: `SHMUP_DEV_URL`, `SHMUP_RENDERER_DIR` (override the web build location),
 * `SHMUP_FULLSCREEN=1`.
 *
 * **Implements.** shmup_feat.md §23 Electron-specific ([P1] fullscreen window; file saves
 * and Steamworks are placeholders in `saves.ts` / `steam.ts`), shmup_tech.md §4.8.
 *
 * CI only type-checks and compiles this file (no Electron binary download).
 *
 * @module
 */
import { app, BrowserWindow, ipcMain, net, protocol } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { APP_ENTRY_URL, APP_SCHEME, resolveAppFile } from './app-protocol.js';
import { createWindowOptions } from './window-options.js';

/** Directory of the compiled main script (`dist/main/`). */
const here = dirname(fileURLToPath(import.meta.url));
/** Web build served over `app://game/` (`dist/renderer/` unless `SHMUP_RENDERER_DIR` is set). */
const rendererDir = process.env.SHMUP_RENDERER_DIR ?? join(here, '..', 'renderer');
/** Vite dev-server URL; when set it replaces the bundled renderer (HMR during development). */
const devUrl = process.env.SHMUP_DEV_URL;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/**
 * Creates the game window and loads the renderer.
 *
 * @remarks
 * The window is created hidden and shown on `ready-to-show` (no white flash). It loads
 * `SHMUP_DEV_URL` when set, otherwise `app://game/index.html`. A load failure is not
 * handled yet (the promise is deliberately ignored).
 */
function createGameWindow(): void {
  const gameWindow = new BrowserWindow(
    createWindowOptions({
      preloadPath: join(here, '..', 'preload', 'preload.cjs'),
      fullscreen: process.env.SHMUP_FULLSCREEN === '1',
    }),
  );
  gameWindow.once('ready-to-show', () => {
    gameWindow.show();
  });
  void gameWindow.loadURL(devUrl ?? APP_ENTRY_URL);
}

void app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveAppFile(rendererDir, request.url);
    if (file === null) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  ipcMain.on(IPC_CHANNELS.quit, () => {
    app.quit();
  });

  createGameWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createGameWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
