/**
 * # platform — the browser `Platform` adapter
 *
 * **Responsibility.** Implements the core's `Platform` for a desktop/mobile browser:
 * input from `@shmup/input-web`, `localStorage` persistence with quota checks (the shell's
 * `createWebStorage` — falling back to memory in private mode, when storage throws or is full),
 * gesture-unlocked Web Audio, page-visibility lifecycle (hidden → suspend, visible → resume),
 * live display size, and no `exit` (browsers cannot quit — menus hide "Quit"). In the Electron
 * desktop app (M2-17 — `window.shmupElectron`) the same build gets file saves through the
 * preload's bridge and an `exit` that quits the app.
 *
 * **Implements.** shmup_tech.md §3.2 (Platform interface), shmup_feat.md §23
 * (web-specific: dev target, localStorage) and §3 (pause on `visibilitychange` — and on `blur`
 * since M3-02b).
 *
 * **Public API.** {@link createWebPlatform}, {@link createLocalStorage},
 * {@link createVisibilityLifecycle}, {@link FocusSource}, {@link WebPlatformOptions},
 * {@link StorageLike},
 * {@link VisibilitySource}; M2-17: {@link ElectronBridge}, {@link getElectronBridge},
 * {@link createBridgeStorage}.
 *
 * @module
 */
import {
  STORAGE_PREFIX,
  createWebStorage,
  type QuotaStorage,
  type WebStorageLike,
} from '@shmup/shell';
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
  specRefs: ['shmup_tech.md §3.2', 'shmup_feat.md §23', 'shmup_feat.md §3', 'shmup_feat.md §21'],
});

/** The parts of the Web Storage API used here (the shell's `WebStorageLike`). */
export type StorageLike = WebStorageLike;

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
 * Wraps Web Storage as async {@link PlatformStorage} with a key prefix and quota checks (the
 * shell's `createWebStorage`, M2-17). Storage errors (quota, private mode, disabled storage)
 * degrade to an in-memory store instead of crashing the game.
 *
 * @remarks
 * An error other than a full storage switches the adapter to memory *permanently* for the
 * session; values written before the switch stay in Web Storage, values written after it are
 * lost on reload. A full storage (`QuotaExceededError`) or a value over the app's budget keeps
 * only that value in memory (the next write tries storage again) — see `@shmup/shell`
 * `createWebStorage`. The in-memory fallback does not use the prefix. Issues are logged with
 * `console.warn`.
 *
 * @param storage - `window.localStorage`, or `null` when unavailable.
 * @param prefix - Namespace for keys (default `shmup-cup:`).
 * @returns The storage adapter (with `usage()` and `issues` — `QuotaStorage`).
 *
 * @example
 * ```ts
 * const storage = createLocalStorage(window.localStorage);
 * await storage.set('options', '{"music":0.6}'); // stored as "shmup-cup:options"
 * ```
 */
export function createLocalStorage(
  storage: StorageLike | null,
  prefix = STORAGE_PREFIX,
): QuotaStorage {
  return createWebStorage(storage, {
    prefix,
    onIssue: (issue) => {
      console.warn(
        `Shmup Cup: "${issue.key}" was not stored (${issue.kind}, ${issue.bytes} bytes)`,
      );
    },
  });
}

/**
 * The API the Electron preload exposes as `window.shmupElectron` (M2-17 — the desktop build loads
 * this web build). Mirrors `apps/electron/src/shared/ipc.ts` `ShmupElectronApi` (a test keeps the
 * two in step; the web app cannot import the desktop app).
 */
export interface ElectronBridge {
  /** Always `'electron'`. */
  readonly platform: 'electron';
  /** Asks the main process to quit. */
  quit(): void;
  /** File saves in the desktop user-data folder (JSON files, atomic write + backup). */
  readonly storage: {
    /**
     * Reads a key.
     *
     * @param key - Storage key.
     * @returns Resolves with the value or `null`; rejects when the main process refuses.
     */
    get(key: string): Promise<string | null>;
    /**
     * Writes a key.
     *
     * @param key - Storage key.
     * @param value - Value.
     * @returns Resolves once the file is on disk; rejects when the main process refuses (quota,
     *   invalid key) or the disk fails.
     */
    set(key: string, value: string): Promise<void>;
  };
}

/**
 * Reads the Electron preload's bridge (`window.shmupElectron`), checking its shape.
 *
 * @param win - The window.
 * @returns The bridge, or `null` in a browser (or when the object is not the expected API).
 *
 * @example
 * ```ts
 * const electron = getElectronBridge(window); // null in a browser
 * createWebPlatform({ …services, electron }); // id 'electron', file saves, EXIT quits
 * ```
 */
export function getElectronBridge(win: Window): ElectronBridge | null {
  const candidate = (win as Window & { shmupElectron?: unknown }).shmupElectron;
  if (candidate === null || typeof candidate !== 'object') return null;
  const api = candidate as Partial<ElectronBridge>;
  const storage = api.storage;
  if (
    api.platform !== 'electron' ||
    typeof api.quit !== 'function' ||
    storage === undefined ||
    storage === null ||
    typeof storage.get !== 'function' ||
    typeof storage.set !== 'function'
  ) {
    return null;
  }
  return candidate as ElectronBridge;
}

/**
 * Platform storage over the Electron bridge (M2-17): the desktop build's saves go to JSON files in
 * the user-data folder through the main process.
 *
 * @remarks
 * A failing read resolves from memory (the save then loads as empty — never a boot failure); a
 * failing write rejects, so the save store counts it as not written and tries again at its next
 * flush. Written values are also kept in memory, so a later failing read still returns them.
 *
 * @param bridge - `window.shmupElectron`.
 * @returns The storage — no key prefix (each key is one file in the saves folder).
 *
 * @example
 * ```ts
 * const storage = createBridgeStorage(bridge);
 * await storage.set('save.v1', text); // <userData>/saves/save.v1.json (+ .bak)
 * ```
 */
export function createBridgeStorage(bridge: ElectronBridge): PlatformStorage {
  const memory = createMemoryStorage();
  return {
    get(key) {
      return bridge.storage.get(key).then(
        (value) => value,
        () => memory.get(key),
      );
    },
    set(key, value) {
      void memory.set(key, value);
      return bridge.storage.set(key, value);
    },
  };
}

/** A window-like source of `blur` / `focus` (M3-02b: Home on the M7 fires only these). */
export interface FocusSource {
  /**
   * Registers a focus-change listener (never removed — it lives as long as the app).
   *
   * @param type - `'blur'` or `'focus'`.
   * @param listener - Called when the window loses or regains focus.
   */
  addEventListener(type: 'blur' | 'focus', listener: () => void): void;
}

/**
 * Lifecycle driven by the Page Visibility API **and** the window's focus (M3-02b).
 *
 * @remarks
 * Two reasons to be away — the page is `hidden`, or the window lost focus (a system overlay such
 * as the TV's Home bar, which fires only `blur` / `focus`: `docs/dev/input-probe-results.md`
 * finding 7). The suspend callbacks run on the **edge** into "away" and the resume callbacks on
 * the edge back, in registration order, so a `blur` + `hidden` pair suspends once and the game
 * resumes only when the page is visible *and* focused again. Repeated events with the same state
 * fire nothing.
 *
 * @param source - Normally `document`.
 * @param focus - Normally `window`; `null` for visibility only.
 * @returns Suspend/resume registration.
 */
export function createVisibilityLifecycle(
  source: VisibilitySource,
  focus: FocusSource | null,
): PlatformLifecycle {
  const suspend: Array<() => void> = [];
  const resume: Array<() => void> = [];
  // Two independent reasons to be away; the app is active only when neither holds.
  const away = { hidden: source.visibilityState === 'hidden', blurred: false };
  let suspended = away.hidden;

  /** Fires the suspend or resume callbacks when the combined state changed. */
  const settle = (): void => {
    const next = away.hidden || away.blurred;
    if (next === suspended) return;
    suspended = next;
    const list = next ? suspend : resume;
    for (const callback of list) callback();
  };
  source.addEventListener('visibilitychange', () => {
    away.hidden = source.visibilityState === 'hidden';
    settle();
  });
  if (focus !== null) {
    focus.addEventListener('blur', () => {
      away.blurred = true;
      settle();
    });
    focus.addEventListener('focus', () => {
      away.blurred = false;
      settle();
    });
  }
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
  /**
   * Focus source (`window`) — M3-02b: a system overlay (the TV's Home bar, a pad's PS button) only
   * fires `blur` / `focus`, so the game must pause on those too. Omitted or `null`: visibility
   * only.
   */
  readonly focus?: FocusSource | null;
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
  /**
   * The Electron preload's bridge when this build runs in the desktop app
   * ({@link getElectronBridge}), else `null` / absent (M2-17).
   */
  readonly electron?: ElectronBridge | null;
}

/**
 * Creates the browser platform.
 *
 * @remarks
 * `id` is `'web'`, `exit` is `null` and `caps.remoteOnly` is `false`. Electron's renderer loads
 * the same build: with {@link WebPlatformOptions.electron} (M2-17) `id` is `'electron'`, saves go
 * to files through the bridge ({@link createBridgeStorage}) and `exit` quits the app (the title
 * then offers EXIT).
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
  const electron = options.electron ?? null;
  return {
    id: electron === null ? 'web' : 'electron',
    input: options.input,
    storage:
      electron === null ? createLocalStorage(options.storage) : createBridgeStorage(electron),
    audio: options.audio,
    lifecycle: createVisibilityLifecycle(options.visibility, options.focus ?? null),
    exit:
      electron === null
        ? null
        : () => {
            electron.quit();
          },
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
