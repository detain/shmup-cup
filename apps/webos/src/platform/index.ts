/**
 * # platform — the LG webOS TV `Platform` adapter
 *
 * **Responsibility.** Implements the core's `Platform` on webOS 5+ TVs:
 * - **Back (461)** — {@link watchBackKey} reports presses to the host; the scene stack decides
 *   (pause in game, back in menus, exit confirmation on the title — shmup_feat.md §23). The key →
 *   `Action.Back` mapping itself lives in `@shmup/input-web`
 *   (`content/input/webos.input-profiles.json`). webOS has **no key registration**: the Magic
 *   Remote's arrows, OK (13), Back (461) and the colour keys (403–406) all arrive without one, so
 *   there is no `tvinputdevice` equivalent here.
 * - **Lifecycle** — `visibilitychange` *and* window `blur` / `focus`, plus webOS' own
 *   `webOSRelaunch` / `webOSLocaleChange` document events are ignored on purpose: what matters is
 *   that the app is hidden or unfocused → suspend (game frozen, audio suspended), visible and
 *   focused → resume. JS may be frozen while hidden, so the core never trusts the wall clock
 *   across a resume.
 * - **Exit** — `webOS.platformBack()` when the webOS JS library is present, else `window.close()`.
 *   webOS has no "terminate me" call: `platformBack()` hands the Back gesture to the platform,
 *   which closes a foreground app at its root screen.
 * - Storage via `localStorage` with quota checks (the shell's `createWebStorage`, M2-17; webOS
 *   clears an app's web storage when the app is uninstalled).
 *
 * Works in a desktop browser too (no `window.webOS`): `exit` falls back to `window.close`, which
 * a browser may ignore — so `pnpm --filter @shmup/webos dev` runs anywhere.
 *
 * **Hardware status.** Written from LG's published web-app contract and verified only against the
 * fakes in `test/platform/`. **No agent has run this on a webOS device** — plan §8.7 lists the
 * on-device checks the owner still has to do.
 *
 * **Implements.** shmup_tech.md §3.3 (LG webOS — same model, `appinfo.json`, Back = 461), §3.2
 * (Platform); shmup_feat.md §23 (platform layer).
 *
 * **Public API.** {@link createWebosPlatform}, {@link watchBackKey}, {@link getWebosApi},
 * {@link WebosApi}, {@link WEBOS_BACK_KEY_CODE}.
 *
 * @module
 */
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
  status: 'implemented',
  specRefs: ['shmup_tech.md §3.3', 'shmup_tech.md §3.2', 'shmup_feat.md §23'],
});

/**
 * Key code of the webOS remote's Back key — **461**, not Tizen's 10009 (shmup_tech.md §3.3). The
 * key itself is bound in `content/input/webos.input-profiles.json`; this constant is only for the
 * watcher that owns Back before the game runs.
 */
export const WEBOS_BACK_KEY_CODE = 461;

/** The subset of webOS' `window.webOS` JS library the app uses. */
export interface WebosApi {
  /**
   * Hands the Back gesture to the platform. At an app's root screen webOS closes the app; this is
   * the closest thing webOS has to Tizen's `application.exit()`.
   */
  readonly platformBack?: () => void;
  /** `webOS.deviceInfo` — model and firmware, read only for diagnostics. */
  readonly deviceInfo?: (callback: (info: Record<string, unknown>) => void) => void;
}

/**
 * Reads `window.webOS` (absent in desktop browsers and in the test fakes that do not set it).
 *
 * @param win - The window.
 * @returns The webOS API, or `null` outside a webOS web app.
 *
 * @example
 * ```ts
 * const webos = getWebosApi(window);
 * if (webos !== null) webos.platformBack?.();
 * ```
 */
export function getWebosApi(win: Window): WebosApi | null {
  const api = (win as Window & { webOS?: WebosApi }).webOS;
  return api ?? null;
}

/**
 * Calls `onBack` for every (non-repeat) Back key press and stops the browser default.
 *
 * @remarks
 * Matches on `keyCode === 461` only (the webOS remote's Back has no useful `code`). Auto-repeat
 * keydowns are `preventDefault()`-ed but do not call `onBack` — the same contract as the Tizen
 * app's watcher, so both TV hosts behave identically before the game owns the key.
 *
 * @param target - Event target (normally `window`).
 * @param onBack - Handler.
 * @returns A function that removes the listener.
 *
 * @example
 * ```ts
 * const stop = watchBackKey(window, () => exit());
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
    if (key.keyCode !== WEBOS_BACK_KEY_CODE) return;
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
 * (visible in the webOS Web Inspector).
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

/** A window-like source of `blur` / `focus`. */
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
 * Lifecycle from `visibilitychange` **and** the window's focus.
 *
 * @remarks
 * The same two-reason model the Tizen adapter uses since M3-02b: webOS shows its own overlays
 * (the Home bar, the input picker, a notification toast) over a running app, and which of the two
 * events a given overlay fires is a per-model detail no agent can measure. Tracking both and
 * suspending on the edge into "away" is correct either way — a `blur` + `hidden` pair suspends
 * once, and the game resumes only when the app is visible *and* focused.
 *
 * @param source - Normally `document`.
 * @param focus - Normally `window`; `null` for visibility only.
 * @returns Suspend/resume registration.
 */
function createTvLifecycle(source: VisibilitySource, focus: FocusSource | null): PlatformLifecycle {
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

/** Options for {@link createWebosPlatform}. */
export interface WebosPlatformOptions {
  /** `window.webOS`, or `null` in a desktop browser. */
  readonly webos: WebosApi | null;
  /** Input adapter (`createWebInput` with `keyDevice: 'remote'`). */
  readonly input: PlatformInput;
  /** Audio unlock hook (the `WebAudio` instance). */
  readonly audio: PlatformAudio;
  /** `window.localStorage`, or `null` for memory only. */
  readonly storage: StorageLike | null;
  /** Visibility source (`document`). */
  readonly visibility: VisibilitySource;
  /** Focus source (`window`); omitted or `null`: visibility only. */
  readonly focus?: FocusSource | null;
  /**
   * Closes the app when the webOS API cannot (`window.close`), or `null` when nothing can.
   * A browser may ignore `close()` — the title's EXIT row is still offered, because on the TV it
   * works.
   */
  readonly close?: (() => void) | null;
  /**
   * Reads the current display size (1920×1080 CSS px on a 1080p webOS set; 3840×2160 sets report
   * 1920×1080 to web apps too).
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
}

/**
 * Creates the webOS platform.
 *
 * @remarks
 * `id` is `'webos'` and `caps.remoteOnly` is `true` even in a desktop browser (the build is meant
 * for the TV). `exit` prefers `webOS.platformBack()` and falls back to `options.close`; it is
 * `null` when neither exists, which hides the title's EXIT row.
 *
 * @param options - webOS API and browser services.
 * @returns The `Platform` for `createGame`.
 *
 * @example
 * ```ts
 * const platform = createWebosPlatform({
 *   webos: getWebosApi(window),
 *   input, audio,
 *   storage: window.localStorage,
 *   visibility: document,
 *   focus: window,
 *   close: () => window.close(),
 *   displaySize: () => ({ width: innerWidth, height: innerHeight }),
 *   gamepad: typeof navigator.getGamepads === 'function',
 *   webgl2: renderer.webGLVersion === 2,
 * });
 * ```
 */
export function createWebosPlatform(options: WebosPlatformOptions): Platform {
  const back = options.webos?.platformBack;
  const close = options.close ?? null;
  const displaySize = options.displaySize;
  const exit =
    back !== undefined
      ? () => {
          back();
        }
      : close;
  return {
    id: 'webos',
    input: options.input,
    storage: createTvStorage(options.storage),
    audio: options.audio,
    lifecycle: createTvLifecycle(options.visibility, options.focus ?? null),
    exit,
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
