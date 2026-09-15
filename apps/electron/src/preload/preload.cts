/**
 * # preload — sandboxed bridge exposed to the renderer
 *
 * **Responsibility.** Runs before the web build in the (sandboxed, context-isolated)
 * renderer and exposes the tiny `window.shmupElectron` API declared in
 * `src/shared/ipc.ts`: `platform`, `quit()` and — since M2-17 — `storage.get` / `storage.set`,
 * the save files in the user-data folder (`ipcRenderer.invoke` on the storage channels; the main
 * process validates and writes — `main/ipc-handlers.ts`, `main/saves.ts`). Sandboxed preloads
 * must be CommonJS and cannot `require` local files, hence `.cts` and the repeated channel names
 * (kept in sync by a unit test).
 *
 * **Implements.** shmup_feat.md §23 Electron-specific (quit, file saves).
 *
 * @module
 */
import electron = require('electron');

/** Must equal `IPC_CHANNELS.quit` in src/shared/ipc.ts. */
const QUIT_CHANNEL = 'shmup:quit';

/** Must equal `IPC_CHANNELS.storageGet` in src/shared/ipc.ts. */
const STORAGE_GET_CHANNEL = 'shmup:storage-get';

/** Must equal `IPC_CHANNELS.storageSet` in src/shared/ipc.ts. */
const STORAGE_SET_CHANNEL = 'shmup:storage-set';

electron.contextBridge.exposeInMainWorld('shmupElectron', {
  platform: 'electron',
  quit: (): void => {
    electron.ipcRenderer.send(QUIT_CHANNEL);
  },
  storage: {
    get: (key: string): Promise<string | null> =>
      electron.ipcRenderer.invoke(STORAGE_GET_CHANNEL, key) as Promise<string | null>,
    set: async (key: string, value: string): Promise<void> => {
      await electron.ipcRenderer.invoke(STORAGE_SET_CHANNEL, key, value);
    },
  },
});
