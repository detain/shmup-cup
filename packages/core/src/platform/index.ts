/**
 * # platform — the contract between the core and each host platform
 *
 * **Responsibility.** Declares the {@link Platform} interface the core consumes.
 * Each app (`apps/web`, `apps/tizen`, `apps/electron`, later webOS / Android TV)
 * implements it with a thin adapter; the core never touches `window`, `tizen.*`,
 * `webapis.*`, `electron` or key codes directly. Also provides a headless
 * implementation used by tests, benchmarks and replay verification.
 *
 * **Implements.**
 * - shmup_tech.md §3.2 "The `Platform` interface the core consumes"
 * - shmup_feat.md §23 Platform layer (input/storage/audio/lifecycle/exit/display/caps)
 *
 * **Rules for core code** (shmup_tech.md §3.2): never read key codes (only actions),
 * pause the simulation on `onSuspend`, never call platform globals.
 *
 * **Public API.** {@link Platform} and its parts, {@link createMemoryStorage},
 * {@link createHeadlessPlatform}.
 *
 * @module
 */
import { defineModule } from '../module-info.js';
import { createInputSnapshot, type InputSnapshot } from '../input/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'platform',
  status: 'implemented',
  specRefs: ['shmup_tech.md §3.2', 'shmup_feat.md §23'],
});

/** Host platform identifiers. */
export type PlatformId = 'web' | 'tizen' | 'electron' | 'webos' | 'android' | 'headless';

/** Input source: adapters merge keys / remote / gamepads into actions. */
export interface PlatformInput {
  /**
   * Returns the input for the upcoming simulation tick. Called exactly once per tick.
   * Implementations reuse one snapshot object (no per-tick allocation).
   */
  poll(): InputSnapshot;
}

/** Async key/value persistence (localStorage, IndexedDB, files on Electron). */
export interface PlatformStorage {
  /** Reads a value; resolves `null` when missing. */
  get(key: string): Promise<string | null>;
  /** Writes a value. */
  set(key: string, value: string): Promise<void>;
}

/** Audio policy hooks the core needs (the mixer itself lives in the presentation layer). */
export interface PlatformAudio {
  /** Gesture-unlock on the web; resolves immediately on TV / Electron. */
  unlock(): Promise<void>;
}

/** App lifecycle notifications (Tizen multitasking, browser tab visibility, …). */
export interface PlatformLifecycle {
  /** Registers a callback for when the app is hidden / backgrounded. */
  onSuspend(callback: () => void): void;
  /** Registers a callback for when the app becomes visible again. */
  onResume(callback: () => void): void;
}

/** Display facts (CSS pixels), used to pick the integer scale factor. */
export interface PlatformDisplay {
  readonly cssWidth: number;
  readonly cssHeight: number;
}

/** Capability flags that change UI or defaults. */
export interface PlatformCaps {
  /** Gamepad API available. */
  readonly gamepad: boolean;
  /** Only a TV remote is expected (remote-first defaults, forced autofire). */
  readonly remoteOnly: boolean;
  /** WebGL2 context available (WebGL1 is always assumed). */
  readonly webgl2: boolean;
}

/**
 * Everything the core needs from the host. Implemented once per platform.
 *
 * @see shmup_tech.md §3.2
 */
export interface Platform {
  readonly id: PlatformId;
  readonly input: PlatformInput;
  readonly storage: PlatformStorage;
  readonly audio: PlatformAudio;
  readonly lifecycle: PlatformLifecycle;
  /** Quits the app; `null` means the platform cannot quit (hide "Quit" in menus). */
  readonly exit: (() => void) | null;
  readonly display: PlatformDisplay;
  readonly caps: PlatformCaps;
}

/**
 * Creates an in-memory {@link PlatformStorage} (tests, headless runs, fallback when
 * `localStorage` is unavailable).
 *
 * @param initial - Optional initial key/value pairs.
 * @returns A storage backed by a `Map`.
 */
export function createMemoryStorage(initial?: Readonly<Record<string, string>>): PlatformStorage {
  const data = new Map<string, string>();
  if (initial !== undefined) {
    for (const key of Object.keys(initial)) {
      const value = initial[key];
      if (value !== undefined) data.set(key, value);
    }
  }
  return {
    get(key) {
      const value = data.get(key);
      return Promise.resolve(value === undefined ? null : value);
    },
    set(key, value) {
      data.set(key, value);
      return Promise.resolve();
    },
  };
}

/** A headless platform plus handles to drive it from tests. */
export interface HeadlessPlatform extends Platform {
  /** The snapshot returned by `input.poll()`; tests mutate it directly. */
  readonly snapshot: InputSnapshot;
  /** Fires every registered suspend callback. */
  suspend(): void;
  /** Fires every registered resume callback. */
  resume(): void;
}

/**
 * Creates a platform with no devices, in-memory storage and manually triggered
 * lifecycle events — for Vitest, benchmarks and replay verification in Node.
 *
 * @param display - Optional display size (defaults to 1920×1080, the Tizen UHD web size).
 * @returns A {@link HeadlessPlatform}.
 */
export function createHeadlessPlatform(
  display: PlatformDisplay = { cssWidth: 1920, cssHeight: 1080 },
): HeadlessPlatform {
  const snapshot = createInputSnapshot();
  const suspendCallbacks: Array<() => void> = [];
  const resumeCallbacks: Array<() => void> = [];
  return {
    id: 'headless',
    snapshot,
    input: { poll: () => snapshot },
    storage: createMemoryStorage(),
    audio: { unlock: () => Promise.resolve() },
    lifecycle: {
      onSuspend: (callback) => {
        suspendCallbacks.push(callback);
      },
      onResume: (callback) => {
        resumeCallbacks.push(callback);
      },
    },
    exit: null,
    display,
    caps: { gamepad: false, remoteOnly: false, webgl2: false },
    suspend() {
      for (const callback of suspendCallbacks) callback();
    },
    resume() {
      for (const callback of resumeCallbacks) callback();
    },
  };
}
