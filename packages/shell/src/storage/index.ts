/**
 * # storage — Web Storage persistence with quota checks, and the debug save export / import
 *
 * **Responsibility.** The one `localStorage` adapter of the browser and TV hosts (M2-17 — it used
 * to live, twice, in `apps/web` and `apps/tizen`): {@link createWebStorage} wraps Web Storage as
 * the core's async `PlatformStorage` under a key prefix, with **quota checks**:
 *
 * - **Budget.** Every write is measured the way browsers count Web Storage — two bytes per UTF-16
 *   code unit of key and value ({@link storageBytes}) — against a per-value limit
 *   ({@link STORAGE_VALUE_MAX_BYTES}) and a budget for all of the app's keys together
 *   ({@link STORAGE_QUOTA_BYTES}, far below the ~5 MB an origin gets, so a growing save is noticed
 *   long before the browser refuses it). A write over budget is not stored persistently: it is kept
 *   in memory for the session and reported ({@link StorageIssue} `'over-budget'`).
 * - **Quota errors.** When the browser still refuses a write (`QuotaExceededError` — another app
 *   of the origin filled it, or a TV with little flash), the adapter drops the disposable keys
 *   ({@link DISPOSABLE_STORAGE_KEYS}: the corrupt-save copy) and tries once more; a write that
 *   still fails is kept in memory for the session and reported (`'quota-exceeded'`), and the
 *   backend stays in use for the next writes (the save is small; the next one may fit).
 * - **Unavailable storage.** Any other error (private mode, disabled storage, a sandboxed frame)
 *   switches the adapter to memory for the rest of the session (`'unavailable'`), as before.
 *
 * Writes are best-effort — the adapter never rejects (the `PlatformStorage` contract); the issues
 * go to {@link WebStorageOptions.onIssue} and {@link QuotaStorage.issues}, and
 * {@link QuotaStorage.usage} reports what the app's keys take (the debug tools show it).
 *
 * **Debug save export / import.** {@link exportSaveText} turns the save the game plays with into
 * readable JSON (a tester copies it out of the TV's remote inspector for a bug report);
 * {@link importSaveText} parses such a text (`core/save` `parseSave`: migrations and sanitising),
 * replaces the store's document and writes it — the debug tools publish both on
 * `window.__shmupDebug.save` (dev / test builds).
 *
 * **Implements.**
 * - shmup_feat.md §21 Saves — storage abstraction, versioned JSON, never crash on bad data
 * - shmup_feat.md §23 — storage on web / Tizen (`localStorage`, deleted with the app on
 *   uninstall); shmup_tech.md §2.5 (memory and storage on the TV)
 * - shmup_feat.md §24 — debug tooling (save export / import for bug reports)
 *
 * **Public API.** {@link createWebStorage}, {@link QuotaStorage}, {@link WebStorageLike},
 * {@link WebStorageOptions}, {@link StorageIssue}, {@link StorageIssueKind}, {@link StorageUsage},
 * {@link storageBytes}, {@link isQuotaExceededError}, {@link STORAGE_PREFIX},
 * {@link STORAGE_QUOTA_BYTES}, {@link STORAGE_VALUE_MAX_BYTES}, {@link DISPOSABLE_STORAGE_KEYS},
 * {@link exportSaveText}, {@link importSaveText}, {@link SaveImportResult}.
 *
 * @module
 */
import {
  SAVE_CORRUPT_KEY,
  createMemoryStorage,
  defineModule,
  parseSave,
  serializeSave,
  type PlatformStorage,
  type SaveStatus,
  type SaveStore,
} from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'storage',
  status: 'implemented',
  specRefs: ['shmup_feat.md §21', 'shmup_feat.md §23', 'shmup_tech.md §2.5', 'shmup_feat.md §24'],
});

/** Prefix of every key the app stores (`shmup-cup:save.v1`). */
export const STORAGE_PREFIX = 'shmup-cup:';

/**
 * The app's own budget for all of its Web Storage keys together, in bytes (UTF-16: two bytes a
 * character) — 1 MiB, a fifth of the ~5 MB an origin gets; a full save (32 hi-score tables of
 * 10 rows) is about 26,000 characters. The replay library (M3-01, `core/replay`
 * `MAX_REPLAY_TEXT` / `MAX_KEPT_REPLAY_TEXT`) takes at most 500,150 bytes of it, so the save and
 * its corrupt copy still fit beside it even at {@link STORAGE_VALUE_MAX_BYTES} each.
 */
export const STORAGE_QUOTA_BYTES = 1024 * 1024;

/** Largest single value (key included) the adapter stores persistently, in bytes (256 KiB). */
export const STORAGE_VALUE_MAX_BYTES = 256 * 1024;

/**
 * Keys the adapter may delete to make room when the browser refuses a write: the copy of a
 * corrupt save kept for inspection (`core/save` `SAVE_CORRUPT_KEY`) — never the save itself.
 */
export const DISPOSABLE_STORAGE_KEYS: readonly string[] = Object.freeze([SAVE_CORRUPT_KEY]);

/** The parts of the Web Storage API the adapter uses (`window.localStorage` satisfies it). */
export interface WebStorageLike {
  /**
   * Reads a value.
   *
   * @param key - Full (already prefixed) key.
   * @returns The value, or `null` when missing.
   * @throws DOMException when storage access is denied (the adapter then uses memory).
   */
  getItem(key: string): string | null;
  /**
   * Writes a value.
   *
   * @param key - Full (already prefixed) key.
   * @param value - Value to store.
   * @throws DOMException `QuotaExceededError` when storage is full; another error when it is
   *   disabled.
   */
  setItem(key: string, value: string): void;
  /**
   * Deletes a value (optional — without it the adapter cannot make room on a quota error).
   *
   * @param key - Full (already prefixed) key.
   */
  removeItem?(key: string): void;
  /**
   * The key at an index (optional — with {@link WebStorageLike.length} it lets
   * {@link QuotaStorage.usage} count keys written by earlier sessions).
   *
   * @param index - 0 … `length − 1`.
   * @returns The key, or `null` past the end.
   */
  key?(index: number): string | null;
  /** Number of keys (optional, see {@link WebStorageLike.key}). */
  readonly length?: number;
}

/**
 * What went wrong with a write: `'over-budget'` — the value (or the app's keys with it) exceeds
 * the app's own budget; `'quota-exceeded'` — the browser refused it even after the disposable keys
 * were dropped; `'unavailable'` — storage threw another error and the session now runs from
 * memory.
 */
export type StorageIssueKind = 'over-budget' | 'quota-exceeded' | 'unavailable';

/** One write that could not be stored persistently. */
export interface StorageIssue {
  /** What went wrong. */
  readonly kind: StorageIssueKind;
  /** The key (without the prefix). */
  readonly key: string;
  /** Bytes the write needed ({@link storageBytes} of the prefixed key and the value). */
  readonly bytes: number;
}

/** What the app's keys take. */
export interface StorageUsage {
  /** Bytes of every app key (prefixed key + value, two bytes a character). */
  readonly bytes: number;
  /** Number of app keys. */
  readonly keys: number;
  /** The budget ({@link WebStorageOptions.quotaBytes}). */
  readonly quotaBytes: number;
  /** `false` once storage was unavailable (everything lives in memory then). */
  readonly persistent: boolean;
}

/** Options of {@link createWebStorage}. */
export interface WebStorageOptions {
  /** Key namespace (default {@link STORAGE_PREFIX}). */
  readonly prefix?: string;
  /** Budget of all app keys, in bytes (default {@link STORAGE_QUOTA_BYTES}). */
  readonly quotaBytes?: number;
  /** Largest single write, in bytes (default {@link STORAGE_VALUE_MAX_BYTES}). */
  readonly valueMaxBytes?: number;
  /**
   * Called for every write that could not be stored persistently (the hosts log it).
   *
   * @param issue - What went wrong.
   */
  readonly onIssue?: (issue: StorageIssue) => void;
}

/** Web Storage as async platform storage, with its quota bookkeeping. */
export interface QuotaStorage extends PlatformStorage {
  /**
   * Measures the app's keys (cold — scans the storage; the debug tools call it on demand).
   *
   * @returns The usage.
   */
  usage(): StorageUsage;
  /** Every write that could not be stored persistently this session, oldest first. */
  readonly issues: readonly StorageIssue[];
}

/**
 * Bytes a Web Storage entry takes as browsers count it: two per UTF-16 code unit of the key and
 * the value.
 *
 * @param key - The full (prefixed) key.
 * @param value - The value.
 * @returns The size in bytes.
 *
 * @example
 * ```ts
 * storageBytes('shmup-cup:save.v1', '{}'); // → 38
 * ```
 */
export function storageBytes(key: string, value: string): number {
  return (key.length + value.length) * 2;
}

/**
 * Whether a thrown value is the browser refusing a write for lack of space
 * (`QuotaExceededError`, Firefox's `NS_ERROR_DOM_QUOTA_REACHED`, or the legacy codes 22 / 1014).
 *
 * @param error - Anything `setItem` threw.
 * @returns `true` for a quota error.
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/**
 * Wraps Web Storage as async platform storage with quota checks (see the module docs).
 *
 * @remarks
 * Reads prefer a value this session had to keep in memory (a write that did not fit), so the
 * game always reads back what it wrote. A value that later fits is written to the backend again
 * and leaves memory. The in-memory fallback does not use the prefix. Never rejects.
 *
 * @param backend - `window.localStorage`, or `null` when unavailable (memory only).
 * @param options - Prefix, budgets and the issue callback.
 * @returns The storage.
 *
 * @example
 * ```ts
 * const storage = createWebStorage(window.localStorage, {
 *   onIssue: (issue) => console.warn(`save not stored (${issue.kind})`),
 * });
 * await storage.set('save.v1', text); // stored as "shmup-cup:save.v1"
 * storage.usage().bytes;
 * ```
 */
export function createWebStorage(
  backend: WebStorageLike | null,
  options: WebStorageOptions = {},
): QuotaStorage {
  const prefix = options.prefix ?? STORAGE_PREFIX;
  const quotaBytes = options.quotaBytes ?? STORAGE_QUOTA_BYTES;
  const valueMaxBytes = options.valueMaxBytes ?? STORAGE_VALUE_MAX_BYTES;
  const memory = createMemoryStorage();
  /** Keys whose current value lives in memory (it did not fit, or storage is unavailable). */
  const inMemory = new Set<string>();
  /** Sizes of the app keys this session read or wrote (the usage without `key()` / `length`). */
  const sizes = new Map<string, number>();
  const issues: StorageIssue[] = [];
  const state = { backend };

  /**
   * Records and reports an issue.
   *
   * @param kind - What went wrong.
   * @param key - The key (unprefixed).
   * @param bytes - The write's size.
   */
  const report = (kind: StorageIssueKind, key: string, bytes: number): void => {
    const issue: StorageIssue = Object.freeze({ kind, key, bytes });
    issues.push(issue);
    options.onIssue?.(issue);
  };

  /**
   * The app's keys and their sizes: a scan of the backend when it can enumerate, else what this
   * session saw.
   *
   * @returns Prefixed key → bytes.
   */
  const scan = (): Map<string, number> => {
    const store = state.backend;
    if (store === null || typeof store.key !== 'function' || typeof store.length !== 'number') {
      return new Map(sizes);
    }
    const found = new Map<string, number>();
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key === null || key.indexOf(prefix) !== 0) continue;
        found.set(key, storageBytes(key, store.getItem(key) ?? ''));
      }
    } catch (_error) {
      return new Map(sizes);
    }
    return found;
  };

  /**
   * Stores a value in memory for the session.
   *
   * @param key - Unprefixed key.
   * @param value - The value.
   * @returns Resolves once stored.
   */
  const keepInMemory = (key: string, value: string): Promise<void> => {
    inMemory.add(key);
    return memory.set(key, value);
  };

  /**
   * Deletes the disposable keys (except the one being written) to make room.
   *
   * @param store - The backend.
   * @param except - The unprefixed key being written.
   * @returns Whether anything was deleted.
   */
  const dropDisposable = (store: WebStorageLike, except: string): boolean => {
    if (typeof store.removeItem !== 'function') return false;
    let dropped = false;
    for (const key of DISPOSABLE_STORAGE_KEYS) {
      if (key === except) continue;
      try {
        if (store.getItem(prefix + key) === null) continue;
        store.removeItem(prefix + key);
        sizes.delete(prefix + key);
        dropped = true;
      } catch (_error) {
        // Nothing to gain; the retry reports the write.
      }
    }
    return dropped;
  };

  return {
    get issues() {
      return issues;
    },
    get(key) {
      if (inMemory.has(key)) return memory.get(key);
      const store = state.backend;
      if (store !== null) {
        try {
          const value = store.getItem(prefix + key);
          if (value !== null) sizes.set(prefix + key, storageBytes(prefix + key, value));
          return Promise.resolve(value);
        } catch (_error) {
          state.backend = null;
        }
      }
      return memory.get(key);
    },
    set(key, value) {
      const full = prefix + key;
      const bytes = storageBytes(full, value);
      const store = state.backend;
      if (store === null) return memory.set(key, value);
      let others = 0;
      for (const [other, size] of scan()) if (other !== full) others += size;
      if (bytes > valueMaxBytes || others + bytes > quotaBytes) {
        report('over-budget', key, bytes);
        return keepInMemory(key, value);
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          store.setItem(full, value);
          sizes.set(full, bytes);
          inMemory.delete(key);
          return Promise.resolve();
        } catch (error) {
          if (!isQuotaExceededError(error)) {
            state.backend = null;
            report('unavailable', key, bytes);
            return memory.set(key, value);
          }
          if (attempt === 0 && dropDisposable(store, key)) continue;
          break;
        }
      }
      report('quota-exceeded', key, bytes);
      return keepInMemory(key, value);
    },
    usage() {
      const found = scan();
      let total = 0;
      for (const size of found.values()) total += size;
      return Object.freeze({
        bytes: total,
        keys: found.size,
        quotaBytes,
        persistent: state.backend !== null,
      });
    },
  };
}

/**
 * The save the game plays with, as readable JSON (two-space indentation) — the debug tools'
 * export (a bug report's attachment).
 *
 * @param store - The save store.
 * @returns The document's canonical JSON, pretty-printed.
 *
 * @example
 * ```ts
 * copy(__shmupDebug.save.export()); // Chrome DevTools: to the clipboard
 * ```
 */
export function exportSaveText(store: SaveStore): string {
  return JSON.stringify(JSON.parse(serializeSave(store.data)) as unknown, null, 2);
}

/** What {@link importSaveText} did. */
export interface SaveImportResult {
  /** Whether the document was replaced (and written — see {@link SaveImportResult.written}). */
  readonly ok: boolean;
  /** How the text was read (`'ok'` / `'migrated'` are imported; the others are refused). */
  readonly status: SaveStatus;
  /** Why the text was refused (`''` when imported). */
  readonly reason: string;
  /** Whether the storage accepted the write. */
  readonly written: boolean;
}

/**
 * Imports a save text (the debug tools' import): parses it like a stored save (migrations and
 * sanitising — `core/save` `parseSave`), replaces the store's document and writes it.
 *
 * @remarks
 * Empty, corrupt and unreadable texts are refused and change nothing. The running session keeps
 * the options it already applied (volumes, input profile): reload the page to apply the imported
 * ones. The hi-score tables and statistics are used at once.
 *
 * @param store - The save store.
 * @param text - A save document (e.g. one {@link exportSaveText} produced).
 * @returns Resolves with what happened (never rejects).
 *
 * @example
 * ```ts
 * await __shmupDebug.save.import(textFromABugReport); // → { ok: true, status: 'ok', … }
 * location.reload();
 * ```
 */
export async function importSaveText(store: SaveStore, text: string): Promise<SaveImportResult> {
  const trimmed = text.trim();
  const parsed = parseSave(trimmed === '' ? null : trimmed);
  if (parsed.status !== 'ok' && parsed.status !== 'migrated') {
    return Object.freeze({
      ok: false,
      status: parsed.status,
      reason: parsed.status === 'empty' ? 'the text is empty' : parsed.reason,
      written: false,
    });
  }
  store.replace(parsed.data);
  const written = await store.flush();
  return Object.freeze({ ok: true, status: parsed.status, reason: '', written });
}
