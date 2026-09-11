/**
 * # platform — the Samsung Tizen TV `Platform` adapter
 *
 * **Responsibility.** Implements the core's `Platform` on Tizen 5.5+ TVs / Smart
 * Monitors:
 * - **Key registration** — `tizen.tvinputdevice.registerKeyBatch()` for the extra remote
 *   keys we use (Play/Pause, Ch+/−, colour keys). Arrows, OK (13) and Back (10009) arrive
 *   without registration. Never registers `Exit` (long-press Back) or volume keys.
 * - **Back (10009)** — {@link watchBackKey} reports presses to the host; the scene stack
 *   decides (pause in game, back in menus, exit confirmation on the title — shmup_feat.md
 *   §23). The key → `Action.Back` mapping itself lives in `@shmup/input-web`.
 * - **Lifecycle** — `visibilitychange` (Home / multitasking): hidden → suspend
 *   (game frozen, audio suspended), visible → resume. JS is frozen while hidden, so the
 *   core never trusts the wall clock across a resume.
 * - **Exit** — `tizen.application.getCurrentApplication().exit()`.
 * - Storage via `localStorage` (Tizen deletes it on uninstall — store requirement).
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
  specRefs: ['shmup_tech.md §2.3', 'shmup_tech.md §2.5', 'shmup_tech.md §3.2', 'shmup_feat.md §23'],
});

/** Key code of the remote's Back / Return key. */
export const TIZEN_BACK_KEY_CODE = 10009;

/**
 * Remote keys registered at startup (names from `tvinputdevice.getSupportedKeys()`).
 * Deliberately excludes `Exit` and the volume keys (system keys).
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
  readonly tvinputdevice?: {
    registerKey(keyName: string): void;
    registerKeyBatch?(
      keyNames: string[],
      onSuccess?: () => void,
      onError?: (error: unknown) => void,
    ): void;
  };
  readonly application?: {
    getCurrentApplication(): { exit(): void };
  };
}

/**
 * Reads `window.tizen` (absent in desktop browsers).
 *
 * @param win - The window.
 * @returns The Tizen API or `null`.
 */
export function getTizenApi(win: Window): TizenApi | null {
  const api = (win as Window & { tizen?: TizenApi }).tizen;
  return api ?? null;
}

/**
 * Registers the extra remote keys so their key events reach the app.
 * Uses `registerKeyBatch` when available, else one `registerKey` per key; a key the
 * device does not support is skipped instead of aborting startup.
 *
 * `registerKeyBatch` reports an unsupported key (`InvalidValuesError`) through its
 * *asynchronous* error callback rather than by throwing, so that callback also falls
 * back to registering the keys one by one — otherwise a single key missing on a model
 * (e.g. colour keys on a Smart Monitor remote) would leave every other key unregistered.
 *
 * @param tizen - The Tizen API.
 * @param keys - Key names to register.
 * @returns Names that were registered (best effort for the batch call).
 */
export function registerRemoteKeys(tizen: TizenApi, keys: readonly string[]): string[] {
  const input = tizen.tvinputdevice;
  if (input === undefined) return [];
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
 * @param target - Event target (normally `window`).
 * @param onBack - Handler.
 * @returns A function that removes the listener.
 */
export function watchBackKey(target: EventTarget, onBack: () => void): () => void {
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

/** The parts of the Web Storage API used here. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Wraps `localStorage` as async storage; errors degrade to memory.
 *
 * @param storage - `window.localStorage` or `null`.
 * @returns Platform storage.
 */
function createTvStorage(storage: StorageLike | null): PlatformStorage {
  const fallback = createMemoryStorage();
  const prefix = 'shmup-cup:';
  let backend = storage;
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

/** A document-like visibility source. */
export interface VisibilitySource {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Lifecycle from `visibilitychange` (Tizen multitasking: Home, source switch, …).
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
  readonly input: PlatformInput;
  readonly audio: PlatformAudio;
  readonly storage: StorageLike | null;
  readonly visibility: VisibilitySource;
  readonly displaySize: () => { readonly width: number; readonly height: number };
  readonly gamepad: boolean;
  readonly webgl2: boolean;
}

/**
 * Creates the Tizen platform and registers the extra remote keys.
 *
 * @param options - Tizen API and browser services.
 * @returns The `Platform` for `createGame`.
 */
export function createTizenPlatform(options: TizenPlatformOptions): Platform {
  const tizen = options.tizen;
  if (tizen !== null) registerRemoteKeys(tizen, REMOTE_KEYS_TO_REGISTER);
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
