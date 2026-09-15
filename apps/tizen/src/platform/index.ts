/**
 * # platform — the Samsung Tizen TV `Platform` adapter
 *
 * **Responsibility.** Implements the core's `Platform` on Tizen 5.5+ TVs / Smart
 * Monitors:
 * - **Key registration** — `tizen.tvinputdevice.registerKeyBatch()` for the extra remote
 *   keys the active input profile lists in `register` (decision D13; `tizen-remote-safe`
 *   registers Play/Pause and Ch±), or {@link REMOTE_KEYS_TO_REGISTER} when no profile is
 *   known. Arrows, OK (13) and Back (10009) arrive without registration. Never registers
 *   `Exit` (long-press Back) or volume keys — {@link registerRemoteKeys} drops them.
 * - **Back (10009)** — {@link watchBackKey} reports presses to the host; the scene stack
 *   decides (pause in game, back in menus, exit confirmation on the title — shmup_feat.md
 *   §23). The key → `Action.Back` mapping itself lives in `@shmup/input-web`.
 * - **Lifecycle** — `visibilitychange` (Home / multitasking): hidden → suspend
 *   (game frozen, audio suspended), visible → resume. JS is frozen while hidden, so the
 *   core never trusts the wall clock across a resume.
 * - **Exit** — `tizen.application.getCurrentApplication().exit()`.
 * - Storage via `localStorage` with quota checks (the shell's `createWebStorage`, M2-17; Tizen
 *   deletes it on uninstall — store requirement).
 *
 * Works in a desktop browser too (no `window.tizen`): registration is skipped and
 * `exit` is `null`, so `pnpm --filter @shmup/tizen dev` runs anywhere.
 *
 * **Implements.** shmup_tech.md §2.3 (remote keys, registerKeyBatch), §2.5 (lifecycle,
 * exit), §3.2 (Platform); shmup_feat.md §23 Tizen-specific requirements.
 *
 * **Public API.** {@link createTizenPlatform}, {@link registerRemoteKeys},
 * {@link watchBackKey}, {@link getTizenApi}, {@link TizenApi}, {@link REMOTE_KEYS_TO_REGISTER},
 * {@link TIZEN_BACK_KEY_CODE}.
 *
 * @module
 */
import { SYSTEM_REMOTE_KEYS } from '@shmup/input-web';
import { createWebStorage, type WebStorageLike } from '@shmup/shell';
import {
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
  specRefs: ['shmup_tech.md §2.3', 'shmup_tech.md §2.5', 'shmup_tech.md §3.2', 'shmup_feat.md §23'],
});

/** Key code of the remote's Back / Return key. */
export const TIZEN_BACK_KEY_CODE = 10009;

/**
 * Remote keys registered at startup when no input profile provides a `register` list (names
 * from `tvinputdevice.getSupportedKeys()`). Deliberately excludes `Exit` and the volume keys
 * (system keys).
 */
export const REMOTE_KEYS_TO_REGISTER: readonly string[] = Object.freeze([
  'MediaPlayPause',
  'ChannelUp',
  'ChannelDown',
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
]);

/** The subset of the Tizen Web Device API used by the app. */
export interface TizenApi {
  /** `tizen.tvinputdevice` — remote key registration (needs the `tv.inputdevice` privilege). */
  readonly tvinputdevice?: {
    /**
     * Registers one key so its events reach the app.
     *
     * @param keyName - Key name from `getSupportedKeys()`, e.g. `'MediaPlayPause'`.
     * @throws WebAPIException `InvalidValuesError` when the device does not support it.
     */
    registerKey(keyName: string): void;
    /**
     * Registers several keys in one call (Tizen 4.0+).
     *
     * @param keyNames - Key names to register.
     * @param onSuccess - Called when every key was registered.
     * @param onError - Called asynchronously when a key is unsupported (the batch may be
     *   partially applied).
     */
    registerKeyBatch?(
      keyNames: string[],
      onSuccess?: () => void,
      onError?: (error: unknown) => void,
    ): void;
  };
  /** `tizen.application` — app control (used for exit). */
  readonly application?: {
    /**
     * Gets the running application.
     *
     * @returns An object whose `exit()` closes the app and returns to the TV UI.
     */
    getCurrentApplication(): {
      /** Terminates the app. */
      exit(): void;
    };
  };
}

/**
 * Reads `window.tizen` (absent in desktop browsers).
 *
 * @param win - The window.
 * @returns The Tizen API, or `null` outside a Tizen web app.
 *
 * @example
 * ```ts
 * const tizen = getTizenApi(window);
 * if (tizen !== null) registerRemoteKeys(tizen, REMOTE_KEYS_TO_REGISTER);
 * ```
 */
export function getTizenApi(win: Window): TizenApi | null {
  const api = (win as Window & { tizen?: TizenApi }).tizen;
  return api ?? null;
}

/**
 * Registers the extra remote keys so their key events reach the app.
 * Uses `registerKeyBatch` when available, else one `registerKey` per key; a key the
 * device does not support is skipped instead of aborting startup. System keys (`Exit`,
 * `VolumeUp`, `VolumeDown`, `VolumeMute` — input-web's `SYSTEM_REMOTE_KEYS`) are never
 * registered, whatever the list says; an empty list registers nothing.
 *
 * `registerKeyBatch` reports an unsupported key (`InvalidValuesError`) through its
 * *asynchronous* error callback rather than by throwing, so that callback also falls
 * back to registering the keys one by one — otherwise a single key missing on a model
 * (e.g. colour keys on a Smart Monitor remote) would leave every other key unregistered.
 *
 * @param tizen - The Tizen API.
 * @param requested - Key names to register.
 * @returns Names that were registered (best effort for the batch call).
 */
export function registerRemoteKeys(tizen: TizenApi, requested: readonly string[]): string[] {
  const input = tizen.tvinputdevice;
  if (input === undefined) return [];
  const keys = requested.filter((key) => SYSTEM_REMOTE_KEYS.indexOf(key) < 0);
  if (keys.length === 0) return [];
  if (typeof input.registerKeyBatch === 'function') {
    try {
      input.registerKeyBatch(
        keys.slice(),
        () => {},
        () => {
          registerEachKey(input, keys);
        },
      );
      return keys.slice();
    } catch (_error) {
      // Fall through: register individually so one unsupported key does not block the rest.
    }
  }
  return registerEachKey(input, keys);
}

/**
 * Registers keys one `registerKey` call at a time, skipping keys the device rejects.
 *
 * @param input - `tizen.tvinputdevice`.
 * @param keys - Key names to register.
 * @returns Names that were registered.
 */
function registerEachKey(
  input: NonNullable<TizenApi['tvinputdevice']>,
  keys: readonly string[],
): string[] {
  const registered: string[] = [];
  for (const key of keys) {
    try {
      input.registerKey(key);
      registered.push(key);
    } catch (_error) {
      // Unsupported on this model — skip.
    }
  }
  return registered;
}

/**
 * Calls `onBack` for every (non-repeat) Back key press and stops the browser default.
 *
 * @remarks
 * Matches on `keyCode === 10009` only (the remote's Back has no useful `code`).
 * Auto-repeat keydowns are `preventDefault()`-ed but do not call `onBack`.
 *
 * @param target - Event target (normally `window`).
 * @param onBack - Handler.
 * @returns A function that removes the listener.
 *
 * @example
 * ```ts
 * const stop = watchBackKey(window, () => sceneStack.back());
 * // on teardown:
 * stop();
 * ```
 */
export function watchBackKey(target: EventTarget, onBack: () => void): () => void {
  /**
   * Filters keydowns down to Back presses.
   *
   * @param event - Any keydown on `target`.
   */
  const listener = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (key.keyCode !== TIZEN_BACK_KEY_CODE) return;
    key.preventDefault();
    if (!key.repeat) onBack();
  };
  target.addEventListener('keydown', listener);
  return () => {
    target.removeEventListener('keydown', listener);
  };
}

/** The parts of the Web Storage API used here (the shell's `WebStorageLike`). */
export type StorageLike = WebStorageLike;

/**
 * Wraps `localStorage` as async storage (keys prefixed `shmup-cup:`) with the shell's quota
 * checks (M2-17 — `createWebStorage`): a full storage keeps that one value in memory for the
 * session, any other storage error switches to memory for the rest of it. Issues are logged
 * (visible in the remote Web Inspector).
 *
 * @remarks
 * Tizen deletes an app's `localStorage` on uninstall (a store requirement), so no
 * extra cleanup is needed.
 *
 * @param storage - `window.localStorage` or `null`.
 * @returns Platform storage (with `usage()` — the debug tools' save API reads it).
 */
function createTvStorage(storage: StorageLike | null): PlatformStorage {
  return createWebStorage(storage, {
    onIssue: (issue) => {
      console.warn(
        `Shmup Cup: "${issue.key}" was not stored (${issue.kind}, ${issue.bytes} bytes)`,
      );
    },
  });
}

/** A document-like visibility source. */
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
 * Lifecycle from `visibilitychange` (Tizen multitasking: Home, source switch, …).
 *
 * @remarks
 * `'hidden'` fires the suspend callbacks, any other state the resume callbacks, in
 * registration order. JS is frozen while the app is hidden, so resume handlers must
 * not assume any time passed "normally".
 *
 * @param source - Normally `document`.
 * @returns Suspend/resume registration.
 */
function createTvLifecycle(source: VisibilitySource): PlatformLifecycle {
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

/** Options for {@link createTizenPlatform}. */
export interface TizenPlatformOptions {
  /** `window.tizen`, or `null` in a desktop browser. */
  readonly tizen: TizenApi | null;
  /** Input adapter (`createWebInput` with `keyDevice: 'remote'`). */
  readonly input: PlatformInput;
  /** Audio unlock hook (the `WebAudio` instance). */
  readonly audio: PlatformAudio;
  /** `window.localStorage`, or `null` for memory only. */
  readonly storage: StorageLike | null;
  /** Visibility source (`document`). */
  readonly visibility: VisibilitySource;
  /**
   * Reads the current display size (1920×1080 CSS px on the M7 monitors).
   *
   * @returns Width and height in CSS pixels.
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
   * Remote keys to register — the active input profile's `register` list. Defaults to
   * {@link REMOTE_KEYS_TO_REGISTER} (no profile known).
   */
  readonly registerKeys?: readonly string[];
}

/**
 * Creates the Tizen platform and registers the extra remote keys (`options.registerKeys`, else
 * {@link REMOTE_KEYS_TO_REGISTER}).
 *
 * @remarks
 * `id` is `'tizen'` and `caps.remoteOnly` is `true` even in a desktop browser (the
 * build is meant for the TV). `exit` is `null` when `tizen.application` is missing.
 *
 * @param options - Tizen API and browser services.
 * @returns The `Platform` for `createGame`.
 *
 * @example
 * ```ts
 * const platform = createTizenPlatform({
 *   tizen: getTizenApi(window),
 *   input, audio,
 *   storage: window.localStorage,
 *   visibility: document,
 *   displaySize: () => ({ width: innerWidth, height: innerHeight }),
 *   gamepad: typeof navigator.getGamepads === 'function',
 *   webgl2: renderer.webGLVersion === 2,
 * });
 * ```
 */
export function createTizenPlatform(options: TizenPlatformOptions): Platform {
  const tizen = options.tizen;
  if (tizen !== null) registerRemoteKeys(tizen, options.registerKeys ?? REMOTE_KEYS_TO_REGISTER);
  const application = tizen?.application;
  const displaySize = options.displaySize;
  return {
    id: 'tizen',
    input: options.input,
    storage: createTvStorage(options.storage),
    audio: options.audio,
    lifecycle: createTvLifecycle(options.visibility),
    exit:
      application === undefined
        ? null
        : () => {
            application.getCurrentApplication().exit();
          },
    display: {
      get cssWidth() {
        return displaySize().width;
      },
      get cssHeight() {
        return displaySize().height;
      },
    },
    caps: { gamepad: options.gamepad, remoteOnly: true, webgl2: options.webgl2 },
  };
}
