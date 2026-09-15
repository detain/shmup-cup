/**
 * # main/saves — file-based persistence for the desktop build
 *
 * **Responsibility.** Backs the core's async `Platform.storage` with files in the user-data folder
 * (`app.getPath('userData')/saves/`, M2-17), reached by the renderer through the preload's bridge
 * (`shmup:storage-get` / `shmup:storage-set`, `main/ipc-handlers.ts`):
 *
 * - **One JSON file per key** — `<key>.json` (the save `save.v1.json`, the corrupt-save copy
 *   `save.corrupt.json`, the window settings `window.json`); keys are checked
 *   (`shared/ipc` `isStorageKey`) so a key is always one plain file name.
 * - **Atomic write + backup.** A write goes to `<key>.json.tmp` and is flushed to disk (`fsync`),
 *   the current `<key>.json` is copied to `<key>.json.bak`, then the temporary file is renamed over
 *   `<key>.json` — so the file is always either the old or the new text, never half-written, and
 *   the previous text survives as the backup. Writes to one key are serialised.
 * - **Recovery on read.** A missing file falls back to its backup; a file that is not valid JSON
 *   (a disk error, a hand edit) falls back to a backup that is — else its text is returned as it is
 *   and the core's defensive save parser decides (it keeps a corrupt save as `save.corrupt`).
 * - **Quota.** One value may take at most `STORAGE_VALUE_MAX_BYTES` (1 MiB) and the folder — every
 *   key's file and backup — at most {@link FILE_STORE_QUOTA_BYTES} (8 MiB) after the write; a write
 *   that does not fit is refused with a {@link StorageQuotaError} (the renderer's save store then
 *   counts it as not written and tries again at its next flush). A full save (32 hi-score tables)
 *   is about 26 KB.
 *
 * The file system arrives through {@link FileStoreFs} (default: `node:fs/promises`), so tests run
 * against a temporary folder or a failing fake. Later: Steam Cloud sync of the same files.
 *
 * **Implements.**
 * - shmup_feat.md §21 Saves — storage abstraction (filesystem on Electron), never lose a save
 * - shmup_feat.md §23 Electron-specific — file saves
 *
 * **Public API.** {@link createFileStore}, {@link FileStore}, {@link FileStoreOptions},
 * {@link FileStoreFs}, {@link FileStoreUsage}, {@link storageFileName}, {@link StorageQuotaError},
 * {@link StorageKeyError}, {@link SAVES_DIRECTORY}, {@link FILE_STORE_QUOTA_BYTES},
 * {@link BACKUP_SUFFIX}, {@link TEMP_SUFFIX}, {@link nodeFileStoreFs}.
 *
 * @module
 */
import { copyFile, mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { STORAGE_VALUE_MAX_BYTES, isStorageKey } from '../shared/ipc.js';

/** Folder under the user-data folder that holds the saves. */
export const SAVES_DIRECTORY = 'saves';

/** Most bytes the saves folder may hold after a write (every file and backup): 8 MiB. */
export const FILE_STORE_QUOTA_BYTES = 8 * 1024 * 1024;

/** Suffix of a key's backup (the text before its last write). */
export const BACKUP_SUFFIX = '.bak';

/** Suffix of a key's temporary file during a write. */
export const TEMP_SUFFIX = '.tmp';

/** A write was refused: the value or the folder would exceed its quota. */
export class StorageQuotaError extends Error {
  /**
   * Creates the error.
   *
   * @param key - The key.
   * @param bytes - The bytes the folder (or the value) would take.
   * @param limit - The limit it exceeds.
   */
  constructor(
    readonly key: string,
    readonly bytes: number,
    readonly limit: number,
  ) {
    super(`storage quota: "${key}" needs ${bytes} bytes, over the ${limit}-byte limit`);
    this.name = 'StorageQuotaError';
  }
}

/** A key (or value) the store does not accept. */
export class StorageKeyError extends Error {
  /**
   * Creates the error.
   *
   * @param message - What is wrong.
   */
  constructor(message: string) {
    super(message);
    this.name = 'StorageKeyError';
  }
}

/** The file-system operations the store uses (tests may fake them). */
export interface FileStoreFs {
  /**
   * Reads a whole file as UTF-8.
   *
   * @param path - The file.
   * @returns Resolves with the text; rejects (`ENOENT`) when it does not exist.
   */
  readFile(path: string): Promise<string>;
  /**
   * Writes a whole file as UTF-8 and flushes it to disk (`fsync`).
   *
   * @param path - The file.
   * @param data - The text.
   * @returns Resolves once the data is on disk.
   */
  writeFileSynced(path: string, data: string): Promise<void>;
  /**
   * Renames a file, replacing the target (atomic on one volume).
   *
   * @param from - The source.
   * @param to - The target.
   * @returns Resolves when done.
   */
  rename(from: string, to: string): Promise<void>;
  /**
   * Copies a file, replacing the target.
   *
   * @param from - The source.
   * @param to - The target.
   * @returns Resolves when done.
   */
  copyFile(from: string, to: string): Promise<void>;
  /**
   * Creates a folder and its parents.
   *
   * @param path - The folder.
   * @returns Resolves when it exists.
   */
  mkdir(path: string): Promise<void>;
  /**
   * Lists a folder.
   *
   * @param path - The folder.
   * @returns Resolves with the entry names; rejects when the folder does not exist.
   */
  readdir(path: string): Promise<string[]>;
  /**
   * A file's size.
   *
   * @param path - The file.
   * @returns Resolves with the size in bytes; rejects when it does not exist.
   */
  size(path: string): Promise<number>;
  /**
   * Deletes a file.
   *
   * @param path - The file.
   * @returns Resolves when done; rejects when it does not exist.
   */
  unlink(path: string): Promise<void>;
}

/** The real file system (`node:fs/promises`). */
export const nodeFileStoreFs: FileStoreFs = Object.freeze({
  readFile: (path: string) => readFile(path, 'utf8'),
  writeFileSynced: async (path: string, data: string) => {
    const handle = await open(path, 'w');
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  rename: (from: string, to: string) => rename(from, to),
  copyFile: (from: string, to: string) => copyFile(from, to),
  mkdir: async (path: string) => {
    await mkdir(path, { recursive: true });
  },
  readdir: (path: string) => readdir(path),
  size: async (path: string) => (await stat(path)).size,
  unlink: (path: string) => unlink(path),
});

/** Options of {@link createFileStore}. */
export interface FileStoreOptions {
  /** The folder's quota (default {@link FILE_STORE_QUOTA_BYTES}). */
  readonly quotaBytes?: number;
  /** The largest value (default `STORAGE_VALUE_MAX_BYTES`). */
  readonly valueMaxBytes?: number;
  /** The file system (default {@link nodeFileStoreFs}). */
  readonly fs?: FileStoreFs;
}

/** What the saves folder holds. */
export interface FileStoreUsage {
  /** Bytes of every key's file and backup. */
  readonly bytes: number;
  /** Keys with a file. */
  readonly keys: number;
  /** The quota. */
  readonly quotaBytes: number;
}

/** File-backed key/value store used by the IPC handlers. */
export interface FileStore {
  /** The folder holding the files. */
  readonly directory: string;
  /**
   * Reads one key's file (its backup when the file is missing or not valid JSON and the backup
   * is).
   *
   * @param key - Storage key.
   * @returns Resolves with the file contents, or `null` when neither the file nor a backup exists.
   * @throws {StorageKeyError} Rejects for an invalid key.
   */
  get(key: string): Promise<string | null>;
  /**
   * Writes one key's file atomically (temp file + fsync + rename), keeping the previous text as
   * the backup.
   *
   * @param key - Storage key.
   * @param value - Contents to write.
   * @returns Resolves once the file is on disk.
   * @throws {StorageKeyError} Rejects for an invalid key or a value that is not a string.
   * @throws {StorageQuotaError} Rejects when the value or the folder would exceed its quota.
   */
  set(key: string, value: string): Promise<void>;
  /**
   * Measures the folder.
   *
   * @returns Resolves with the usage (zero before the first write).
   */
  usage(): Promise<FileStoreUsage>;
}

/**
 * The file name of a key.
 *
 * @param key - Storage key.
 * @returns `<key>.json`.
 * @throws {StorageKeyError} For a key `isStorageKey` refuses.
 *
 * @example
 * ```ts
 * storageFileName('save.v1'); // → 'save.v1.json'
 * ```
 */
export function storageFileName(key: string): string {
  if (!isStorageKey(key)) throw new StorageKeyError(`invalid storage key ${JSON.stringify(key)}`);
  return `${key}.json`;
}

/**
 * Whether a text parses as JSON.
 *
 * @param text - The text.
 * @returns `true` when it does.
 */
function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Creates the file store over a folder (created on the first write).
 *
 * @param directory - Absolute folder, normally `join(app.getPath('userData'), SAVES_DIRECTORY)`.
 * @param options - Quotas and the file system.
 * @returns The store.
 *
 * @example
 * ```ts
 * const store = createFileStore(join(app.getPath('userData'), SAVES_DIRECTORY));
 * await store.set('save.v1', text); // saves/save.v1.json (+ .bak of the previous text)
 * await store.get('save.v1');        // → text
 * ```
 */
export function createFileStore(directory: string, options: FileStoreOptions = {}): FileStore {
  const fs = options.fs ?? nodeFileStoreFs;
  const quotaBytes = options.quotaBytes ?? FILE_STORE_QUOTA_BYTES;
  const valueMaxBytes = options.valueMaxBytes ?? STORAGE_VALUE_MAX_BYTES;
  /** The last operation queued per key (writes and reads of a key run in order). */
  const queues = new Map<string, Promise<unknown>>();

  /**
   * Runs an operation after the key's previous one.
   *
   * @param key - The key.
   * @param operation - The operation.
   * @returns Its result.
   */
  const queue = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    queues.set(key, settled);
    void settled.then(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });
    return next;
  };

  /**
   * Reads a file, or `null` when it cannot be read.
   *
   * @param path - The file.
   * @returns The text or `null`.
   */
  const readOptional = async (path: string): Promise<string | null> => {
    try {
      return await fs.readFile(path);
    } catch (_error) {
      return null;
    }
  };

  /**
   * Bytes of every key file and backup in the folder, except the given key's.
   *
   * @param except - The file name to leave out (with its backup).
   * @returns The bytes, and the size of the excluded key's current file.
   */
  const measure = async (
    except: string | null,
  ): Promise<{ others: number; current: number; keys: number }> => {
    let names: string[];
    try {
      names = await fs.readdir(directory);
    } catch (_error) {
      return { others: 0, current: 0, keys: 0 };
    }
    let others = 0;
    let current = 0;
    let keys = 0;
    for (const name of names) {
      const main = name.endsWith('.json');
      if (!main && !name.endsWith(`.json${BACKUP_SUFFIX}`)) continue;
      let size: number;
      try {
        size = await fs.size(join(directory, name));
      } catch (_error) {
        continue;
      }
      if (main) keys++;
      if (except !== null && name === except) current = size;
      else if (except === null || name !== except + BACKUP_SUFFIX) others += size;
    }
    return { others, current, keys };
  };

  return {
    directory,
    get(key) {
      let file: string;
      try {
        file = join(directory, storageFileName(key));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      return queue(key, async () => {
        const text = await readOptional(file);
        if (text !== null && isJson(text)) return text;
        const backup = await readOptional(file + BACKUP_SUFFIX);
        if (backup !== null && (text === null || isJson(backup))) return backup;
        return text;
      });
    },
    set(key, value) {
      let name: string;
      try {
        name = storageFileName(key);
        if (typeof value !== 'string')
          throw new StorageKeyError('a storage value must be a string');
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      const bytes = Buffer.byteLength(value, 'utf8');
      if (bytes > valueMaxBytes) {
        return Promise.reject(new StorageQuotaError(key, bytes, valueMaxBytes));
      }
      const file = join(directory, name);
      const temp = file + TEMP_SUFFIX;
      return queue(key, async () => {
        const { others, current } = await measure(name);
        // After the write: the other keys, this value, and the current text as the backup.
        const after = others + bytes + current;
        if (after > quotaBytes) throw new StorageQuotaError(key, after, quotaBytes);
        await fs.mkdir(directory);
        try {
          await fs.writeFileSynced(temp, value);
          if (current > 0 || (await readOptional(file)) !== null) {
            await fs.copyFile(file, file + BACKUP_SUFFIX);
          }
          await fs.rename(temp, file);
        } catch (error) {
          await fs.unlink(temp).catch(() => undefined);
          throw error;
        }
      });
    },
    async usage() {
      const { others, keys } = await measure(null);
      return { bytes: others, keys, quotaBytes };
    },
  };
}
