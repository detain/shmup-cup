/**
 * # main/main — Electron main-process entry (ESM)
 *
 * **Responsibility.** The desktop shell: registers the privileged `app://` scheme, serves the
 * bundled web build (`dist/renderer/`, copied from apps/web/dist at build time) through it, opens
 * one game window with a sandboxed preload, and answers the renderer's IPC (M2-17 —
 * `main/ipc-handlers.ts`): quit, and the **file saves** in `<userData>/saves/` (`main/saves.ts`:
 * JSON files, atomic write + backup, quota). `SHMUP_DEV_URL` (e.g. `http://localhost:5173` while
 * `pnpm dev` runs) loads the Vite dev server instead for HMR.
 *
 * **Window (M2-17).** The window remembers its settings in the same folder (`window.json`,
 * `main/window-state.ts`): fullscreen, the scale of the 384×216 frame (×1 … ×10, lowered to fit
 * the screen) and its position. **F11** / **Alt+Enter** toggle fullscreen, **Ctrl+=** / **Ctrl+-**
 * step the scale, **Ctrl+0** resets it to ×3 (Cmd on macOS). The window never navigates away from
 * the game and opens no other windows. Gamepads, render interpolation on 120 / 144 Hz monitors
 * and the 60 Hz fixed step with its accumulator all come from the web build itself (the shell's
 * frame loop, M2-08); `backgroundThrottling: false` keeps the loop steady.
 *
 * Environment: `SHMUP_DEV_URL`, `SHMUP_RENDERER_DIR` (override the web build location),
 * `SHMUP_FULLSCREEN=1` (fullscreen for this launch).
 *
 * **Implements.** shmup_feat.md §23 Electron-specific ([P1] fullscreen window, file-based saves,
 * gamepad, window / scale settings; Steamworks is the `steam.ts` placeholder), shmup_tech.md §4.8
 * (`backgroundThrottling: false`, fixed 60 Hz step with an accumulator for 120 / 144 Hz).
 *
 * CI only type-checks and compiles this file (no Electron binary download).
 *
 * @module
 */
import { app, BrowserWindow, ipcMain, net, protocol, screen } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ENTRY_URL, APP_SCHEME, resolveAppFile } from './app-protocol.js';
import { isTrustedRendererUrl, registerIpcHandlers } from './ipc-handlers.js';
import { SAVES_DIRECTORY, createFileStore, type FileStore } from './saves.js';
import { createWindowOptions } from './window-options.js';
import {
  DEFAULT_WINDOW_SCALE,
  DEFAULT_WINDOW_STATE,
  WINDOW_STATE_KEY,
  fitWindowScale,
  isOnScreen,
  parseWindowState,
  serializeWindowState,
  windowContentSize,
  windowShortcut,
  type WindowState,
} from './window-state.js';

/** Directory of the compiled main script (`dist/main/`). */
const here = dirname(fileURLToPath(import.meta.url));
/** Web build served over `app://game/` (`dist/renderer/` unless `SHMUP_RENDERER_DIR` is set). */
const rendererDir = process.env.SHMUP_RENDERER_DIR ?? join(here, '..', 'renderer');
/** Vite dev-server URL; when set it replaces the bundled renderer (HMR during development). */
const devUrl = process.env.SHMUP_DEV_URL ?? null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/**
 * Reads the remembered window settings (defaults when missing, corrupt or unreadable).
 *
 * @param store - The save files.
 * @returns Resolves with the settings.
 */
async function loadWindowState(store: FileStore): Promise<WindowState> {
  try {
    return parseWindowState(await store.get(WINDOW_STATE_KEY));
  } catch (_error) {
    return DEFAULT_WINDOW_STATE;
  }
}

/**
 * Creates the game window with the remembered settings and loads the renderer.
 *
 * @remarks
 * The window is created hidden and shown on `ready-to-show` (no white flash). It loads
 * `SHMUP_DEV_URL` when set, otherwise `app://game/index.html`. A load failure is not
 * handled yet (the promise is deliberately ignored). Fullscreen, scale and position changes are
 * written to `window.json` as they happen (best effort).
 *
 * @param store - The save files (the window settings are stored there too).
 * @param state - The remembered settings.
 */
function createGameWindow(store: FileStore, state: WindowState): void {
  const areas = screen.getAllDisplays().map((display) => display.workArea);
  const scale = fitWindowScale(state.scale, screen.getPrimaryDisplay().workArea);
  const size = windowContentSize(scale);
  const placed =
    state.x !== null && state.y !== null && isOnScreen(state.x, state.y, size.width, areas);
  const gameWindow = new BrowserWindow(
    createWindowOptions({
      preloadPath: join(here, '..', 'preload', 'preload.cjs'),
      fullscreen: process.env.SHMUP_FULLSCREEN === '1' || state.fullscreen,
      scale,
      x: placed ? state.x : null,
      y: placed ? state.y : null,
    }),
  );
  let current: WindowState = { ...state, scale };
  /**
   * Remembers a change of the settings.
   *
   * @param next - The new settings.
   */
  const remember = (next: WindowState): void => {
    current = next;
    store.set(WINDOW_STATE_KEY, serializeWindowState(next)).catch(() => undefined);
  };
  const contents = gameWindow.webContents;
  contents.on('before-input-event', (event, input) => {
    const shortcut = windowShortcut(input, process.platform === 'darwin');
    if (shortcut === null) return;
    event.preventDefault();
    if (shortcut === 'fullscreen') {
      gameWindow.setFullScreen(!gameWindow.isFullScreen());
      return;
    }
    if (gameWindow.isFullScreen()) return;
    const wanted =
      shortcut === 'scale-reset'
        ? DEFAULT_WINDOW_SCALE
        : current.scale + (shortcut === 'scale-up' ? 1 : -1);
    const area = screen.getDisplayMatching(gameWindow.getBounds()).workArea;
    const next = fitWindowScale(wanted, area);
    if (next === current.scale) return;
    const content = windowContentSize(next);
    gameWindow.setContentSize(content.width, content.height);
    remember({ ...current, scale: next });
  });
  gameWindow.on('enter-full-screen', () => remember({ ...current, fullscreen: true }));
  gameWindow.on('leave-full-screen', () => remember({ ...current, fullscreen: false }));
  gameWindow.on('moved', () => {
    if (gameWindow.isFullScreen()) return;
    const [x, y] = gameWindow.getPosition();
    remember({ ...current, x, y });
  });
  // The window only ever shows the game: no navigation away, no pop-up windows.
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, devUrl)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  gameWindow.once('ready-to-show', () => {
    gameWindow.show();
  });
  void gameWindow.loadURL(devUrl ?? APP_ENTRY_URL);
}

void app.whenReady().then(async () => {
  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveAppFile(rendererDir, request.url);
    if (file === null) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const store = createFileStore(join(app.getPath('userData'), SAVES_DIRECTORY));
  registerIpcHandlers(ipcMain, {
    store,
    quit: () => {
      app.quit();
    },
    devUrl,
  });

  const state = await loadWindowState(store);
  createGameWindow(store, state);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createGameWindow(store, DEFAULT_WINDOW_STATE);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
