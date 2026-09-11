/**
 * # platform — the browser `Platform` adapter
 *
 * **Responsibility.** Implements the core's `Platform` for a desktop/mobile browser:
 * input from `@shmup/input-web`, `localStorage` persistence (falling back to memory in
 * private mode or when storage throws), gesture-unlocked Web Audio, page-visibility
 * lifecycle (hidden → suspend, visible → resume), live display size, and no `exit`
 * (browsers cannot quit — menus hide "Quit").
 *
 * **Implements.** shmup_tech.md §3.2 (Platform interface), shmup_feat.md §23
 * (web-specific: dev target, localStorage) and §3 (pause on `visibilitychange`).
 *
 * **Public API.** {@link createWebPlatform}, {@link createLocalStorage},
 * {@link createVisibilityLifecycle}, {@link WebPlatformOptions}, {@link StorageLike},
 * {@link VisibilitySource}.
 *
 * @module
 */
import {
  createMemoryStorage,
  defineModule,
  type Platform,
  type PlatformAudio,
  type PlatformInput,
  type PlatformLifecycle,
  type PlatformStorage,
} from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'platform',
  status: 'partial',
  specRefs: ['shmup_tech.md §3.2', 'shmup_feat.md §23', 'shmup_feat.md §3'],
});

/** The parts of the Web Storage API used here. */
export interface StorageLike {
  /**
   * Reads a value.
   *
   * @param key - Full (already prefixed) key.
   * @returns The value, or `null` when missing.
   * @throws DOMException when storage access is denied (the adapter then falls back
   *   to memory).
   */
  getItem(key: string): string | null;
  /**
   * Writes a value.
   *
   * @param key - Full (already prefixed) key.
   * @param value - Value to store.
   * @throws DOMException `QuotaExceededError` when storage is full or disabled (the
   *   adapter then falls back to memory).
   */
  setItem(key: string, value: string): void;
}

/** A document-like object that reports visibility changes. */
export interface VisibilitySource {
  /** `'visible'` or `'hidden'` (anything but `'hidden'` counts as visible). */
  readonly visibilityState: string;
  /**
   * Registers the change listener (never removed — lives as long as the app).
   *
   * @param type - Always `'visibilitychange'`.
   * @param listener - Called after `visibilityState` changed.
   */
  addEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Wraps Web Storage as async {@link PlatformStorage} with a key prefix. Any storage
 * error (quota, private mode, disabled storage) degrades to an in-memory store instead
 * of crashing the game.
 *
 * @remarks
 * The first error switches the adapter to memory *permanently* for the session;
 * values written before the switch stay in Web Storage, values written after it are
 * lost on reload. The in-memory fallback does not use the prefix.
 *
 * @param storage - `window.localStorage`, or `null` when unavailable.
 * @param prefix - Namespace for keys (default `shmup-cup:`).
 * @returns The storage adapter.
 *
 * @example
 * ```ts
 * const storage = createLocalStorage(window.localStorage);
 * await storage.set('options', '{"music":0.6}'); // stored as "shmup-cup:options"
 * ```
 */
export function createLocalStorage(
  storage: StorageLike | null,
  prefix = 'shmup-cup:',
): PlatformStorage {
  const fallback = createMemoryStorage();
  let backend: StorageLike | null = storage;
  return {
    get(key) {
      if (backend !== null) {
        try {
          return Promise.resolve(backend.getItem(prefix + key));
        } catch (_error) {
          backend = null;
        }
      }
      return fallback.get(key);
    },
    set(key, value) {
      if (backend !== null) {
        try {
          backend.setItem(prefix + key, value);
          return Promise.resolve();
        } catch (_error) {
          backend = null;
        }
      }
      return fallback.set(key, value);
    },
  };
}

/**
 * Lifecycle driven by the Page Visibility API.
 *
 * @remarks
 * Every `visibilitychange` fires one list: `'hidden'` → suspend callbacks, anything
 * else → resume callbacks, in registration order. Repeated events with the same state
 * fire the callbacks again, so they must be idempotent.
 *
 * @param source - Normally `document`.
 * @returns Suspend/resume registration.
 */
export function createVisibilityLifecycle(source: VisibilitySource): PlatformLifecycle {
  const suspend: Array<() => void> = [];
  const resume: Array<() => void> = [];
  source.addEventListener('visibilitychange', () => {
    const list = source.visibilityState === 'hidden' ? suspend : resume;
    for (const callback of list) callback();
  });
  return {
    onSuspend(callback) {
      suspend.push(callback);
    },
    onResume(callback) {
      resume.push(callback);
    },
  };
}

/** Options for {@link createWebPlatform}. */
export interface WebPlatformOptions {
  /** Browser input adapter (`createWebInput`). */
  readonly input: PlatformInput;
  /** Audio unlock hook (the `WebAudio` instance). */
  readonly audio: PlatformAudio;
  /** Storage backend (`window.localStorage`), `null` for memory only. */
  readonly storage: StorageLike | null;
  /** Visibility source (`document`). */
  readonly visibility: VisibilitySource;
  /** Returns the current display size in CSS pixels. */
  /**
   * Reads the current display size (called on every `platform.display` access, so the
   * value follows window resizes).
   *
   * @returns Width and height in CSS pixels (normally `innerWidth` / `innerHeight`).
   */
  readonly displaySize: () => {
    /** Width in CSS pixels. */
    readonly width: number;
    /** Height in CSS pixels. */
    readonly height: number;
  };
  /** Gamepad API present. */
  readonly gamepad: boolean;
  /** WebGL2 context obtained by the renderer. */
  readonly webgl2: boolean;
}

/**
 * Creates the browser platform.
 *
 * @remarks
 * `id` is `'web'`, `exit` is `null` and `caps.remoteOnly` is `false`. Electron's
 * renderer also uses this platform (it loads the same build).
 *
 * @param options - Browser services to wrap.
 * @returns The `Platform` for `createGame`.
 *
 * @example
 * ```ts
 * const platform = createWebPlatform({
 *   input, audio,
 *   storage: window.localStorage,
 *   visibility: document,
 *   displaySize: () => ({ width: innerWidth, height: innerHeight }),
 *   gamepad: true,
 *   webgl2: false,
 * });
 * const game = createGame(platform);
 * ```
 */
export function createWebPlatform(options: WebPlatformOptions): Platform {
  const displaySize = options.displaySize;
  return {
    id: 'web',
    input: options.input,
    storage: createLocalStorage(options.storage),
    audio: options.audio,
    lifecycle: createVisibilityLifecycle(options.visibility),
    exit: null,
    display: {
      get cssWidth() {
        return displaySize().width;
      },
      get cssHeight() {
        return displaySize().height;
      },
    },
    caps: { gamepad: options.gamepad, remoteOnly: false, webgl2: options.webgl2 },
  };
}
