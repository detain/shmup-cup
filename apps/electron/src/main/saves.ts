/**
 * # main/saves — file-based persistence for the desktop build
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Backs the core's async `Platform.storage` with JSON files in
 * `app.getPath('userData')` (atomic write-then-rename, one file per key), exposed to the
 * renderer through the preload bridge. Later: Steam Cloud sync of the same files.
 *
 * **Implements.**
 * - shmup_feat.md §21 Saves — storage abstraction (filesystem on Electron)
 * - shmup_feat.md §23 Electron-specific — file saves
 *
 * @module
 */

/** File-backed key/value store used by the IPC handlers. */
export interface FileStore {
  /**
   * Reads one key's file.
   *
   * @param key - Storage key (sanitised into a file name).
   * @returns Resolves with the file contents, or `null` when the file does not exist.
   */
  get(key: string): Promise<string | null>;
  /**
   * Writes one key's file atomically (temp file + rename).
   *
   * @param key - Storage key.
   * @param value - Contents to write.
   * @returns Resolves once the file is on disk.
   */
  set(key: string, value: string): Promise<void>;
}

// Planned: createFileStore(directory: string): FileStore; IPC channels 'shmup:storage-get/set'.
