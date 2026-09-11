/**
 * # preload — sandboxed bridge exposed to the renderer
 *
 * **Responsibility.** Runs before the web build in the (sandboxed, context-isolated)
 * renderer and exposes the tiny `window.shmupElectron` API declared in
 * `src/shared/ipc.ts`. Sandboxed preloads must be CommonJS and cannot `require` local
 * files, hence `.cts` and the repeated channel name (kept in sync by a unit test).
 *
 * **Implements.** shmup_feat.md §23 Electron-specific (quit; later file saves).
 *
 * @module
 */
import electron = require('electron');

/** Must equal `IPC_CHANNELS.quit` in src/shared/ipc.ts. */
const QUIT_CHANNEL = 'shmup:quit';

electron.contextBridge.exposeInMainWorld('shmupElectron', {
  platform: 'electron',
  quit: (): void => {
    electron.ipcRenderer.send(QUIT_CHANNEL);
  },
});
