/**
 * # shared/ipc — IPC contract between the Electron main process and the preload
 *
 * **Responsibility.** Names the IPC channels and declares the API the preload exposes
 * to the renderer as `window.shmupElectron`. The renderer (apps/web code) only sees
 * this narrow API — no Node, no `ipcRenderer` (context isolation + sandbox).
 *
 * The sandboxed preload cannot `require` local files, so `preload.cts` repeats the
 * channel strings; `test/preload/preload.test.ts` keeps both in sync.
 *
 * **Implements.** shmup_feat.md §23 Electron-specific (quit, later file saves / Steam).
 *
 * @module
 */

/** IPC channel names. */
export const IPC_CHANNELS = Object.freeze({
  /** Renderer → main: quit the app (menu "Quit"). */
  quit: 'shmup:quit',
});

/** API exposed on `window.shmupElectron` by the preload script. */
export interface ShmupElectronApi {
  /** Always `'electron'`, lets the web platform adapter detect the host. */
  readonly platform: 'electron';
  /** Asks the main process to quit. */
  quit(): void;
}
