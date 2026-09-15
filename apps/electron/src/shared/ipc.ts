/**
 * # shared/ipc — IPC contract between the Electron main process and the preload
 *
 * **Responsibility.** Names the IPC channels, declares the API the preload exposes to the renderer
 * as `window.shmupElectron`, and the limits both sides agree on. The renderer (apps/web code) only
 * sees this narrow API — no Node, no `ipcRenderer` (context isolation + sandbox).
 *
 * - `shmup:quit` (send, renderer → main): quit the app (the title's EXIT after YES).
 * - `shmup:storage-get` (invoke `key` → `string | null`) and `shmup:storage-set` (invoke `key`,
 *   `value` → `void`) — M2-17: the save's file storage (`main/saves.ts` `FileStore`: JSON files in
 *   the user-data folder, atomic write + backup, quota). The main process validates every argument
 *   ({@link isStorageKey}, {@link STORAGE_VALUE_MAX_BYTES}) and the sender's page, and rejects the
 *   invoke otherwise; the renderer's storage adapter treats a rejection as a failed write.
 *
 * The sandboxed preload cannot `require` local files, so `preload.cts` repeats the channel
 * strings; `test/preload/preload.test.ts` keeps both in sync, and the IPC contract test wires the
 * compiled preload to the real handlers (`main/ipc-handlers.ts`). The web app declares the same API
 * (`apps/web/src/platform` `ElectronBridge`); a test keeps those in step too.
 *
 * **Implements.** shmup_feat.md §23 Electron-specific (quit, file saves; later Steam), §21 Saves.
 *
 * @module
 */

/** IPC channel names. */
export const IPC_CHANNELS = Object.freeze({
  /** Renderer → main: quit the app (menu "Quit"). */
  quit: 'shmup:quit',
  /** Renderer → main (invoke): read a storage key (M2-17). */
  storageGet: 'shmup:storage-get',
  /** Renderer → main (invoke): write a storage key (M2-17). */
  storageSet: 'shmup:storage-set',
});

/** Longest storage key the main process accepts (characters). */
export const STORAGE_KEY_MAX_LENGTH = 64;

/** Largest value the main process stores for one key, in UTF-8 bytes (1 MiB). */
export const STORAGE_VALUE_MAX_BYTES = 1024 * 1024;

/** A storage key: letters, digits, `.`, `_`, `-`, starting with a letter or digit. */
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Whether a value is a storage key the main process accepts (`save.v1`, `save.corrupt`,
 * `window`): a string of at most {@link STORAGE_KEY_MAX_LENGTH} letters, digits, `.`, `_` and
 * `-`, starting with a letter or digit, and not ending with `.` (so it maps to one plain file
 * name).
 *
 * @param key - Anything the renderer sent.
 * @returns `true` for an acceptable key.
 */
export function isStorageKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length <= STORAGE_KEY_MAX_LENGTH &&
    STORAGE_KEY.test(key) &&
    !key.endsWith('.')
  );
}

/** The file-backed storage the preload exposes (M2-17). */
export interface ShmupElectronStorage {
  /**
   * Reads a key.
   *
   * @param key - Storage key ({@link isStorageKey}).
   * @returns Resolves with the stored text, or `null` when nothing is stored; rejects for an
   *   invalid key.
   */
  get(key: string): Promise<string | null>;
  /**
   * Writes a key (atomically, keeping the previous file as a backup).
   *
   * @param key - Storage key.
   * @param value - Text to store (≤ {@link STORAGE_VALUE_MAX_BYTES} bytes).
   * @returns Resolves once the file is on disk; rejects for an invalid key or value, over the
   *   quota, or on a disk error.
   */
  set(key: string, value: string): Promise<void>;
}

/** API exposed on `window.shmupElectron` by the preload script. */
export interface ShmupElectronApi {
  /** Always `'electron'`; the web build detects the desktop host by it (M2-17). */
  readonly platform: 'electron';
  /** Asks the main process to quit. */
  quit(): void;
  /** File saves in the user-data folder (M2-17). */
  readonly storage: ShmupElectronStorage;
}
