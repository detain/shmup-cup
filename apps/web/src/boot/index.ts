/**
 * # boot — composition root of the browser app
 *
 * **Responsibility.** Creates the browser-specific adapters — keyboard + gamepad input
 * (`@shmup/input-web`), Web Audio (`@shmup/audio-web`) and the web
 * {@link createWebPlatform | platform adapter} (localStorage, page visibility) — and hands them
 * with the inlined content and atlas to the shared boot sequence of `@shmup/shell`
 * (`bootShell`: loading bar, content validation and boot error screen, atlas, renderer, game,
 * event dispatch and the rAF frame loop). Keyboard-first (`remoteMode: false`); audio is
 * unlocked by the first key or pointer gesture (autoplay policy — gamepad buttons do not count
 * as a user activation); the tab being hidden suspends the game, clears held input and
 * suspends audio. `?scene=calibration` shows the test pattern instead of the sprite showcase.
 *
 * **Input profiles** (decisions D13–D15). The `input-profiles` content is parsed into a
 * registry during boot. Keys use `?profile=<id>` when given (dev override — e.g.
 * `keyboard-remote-emulation` to feel the remote's limits on a desktop, or a `tizen-remote-*`
 * profile), else the saved choice (`Platform.storage`, applied once read), else
 * `keyboard-default`; gamepads use `gamepad-standard`. `?debounce=<ticks>` overrides the key
 * profile's release debounce ({@link inputOverridesFromSearch}).
 *
 * **Implements.** shmup_feat.md §23 (web dev target), §3 (rAF-driven fixed step, pause on
 * visibility change, integer scaling), §19 (resume audio on first input), §4 (input profiles).
 *
 * **Public API.** {@link bootWebApp}, {@link WebApp}, {@link WebAppResources},
 * {@link inputOverridesFromSearch}, {@link InputOverrides}.
 *
 * @module
 */
import { createWebAudio, type WebAudio } from '@shmup/audio-web';
import { defineModule, type ContentFile, type Game } from '@shmup/core';
import {
  DEFAULT_GAMEPAD_PROFILE_ID,
  DEFAULT_KEYBOARD_PROFILE_ID,
  INPUT_PROFILES_KIND,
  KEY_PROFILE_DEVICES,
  MAX_RELEASE_DEBOUNCE_TICKS,
  chooseInputProfile,
  createInputProfileRegistry,
  createWebInput,
  loadInputProfileChoice,
  overrideInputTuning,
  type GamepadLike,
  type InputProfile,
  type InputProfileRegistry,
  type WebInput,
} from '@shmup/input-web';
import type { PixiRenderer } from '@shmup/render-pixi';
import { bootShell, sceneFromSearch, type Shell, type ShellAssets } from '@shmup/shell';
import { createWebPlatform, type StorageLike } from '../platform/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'boot',
  status: 'implemented',
  specRefs: ['shmup_feat.md §23', 'shmup_feat.md §3', 'shmup_feat.md §19'],
});

/** What the app boots with: the inlined virtual modules (see `main.ts`). */
export interface WebAppResources {
  /** `virtual:shmup-content`. */
  readonly contentFiles: readonly ContentFile[];
  /** `virtual:shmup-assets`. */
  readonly assets: ShellAssets;
}

/** Handles to the running app (for HMR disposal and debugging in the console). */
export interface WebApp {
  /** The running game session (`remoteMode: false`). */
  readonly game: Game;
  /** The Pixi renderer drawing into the canvas. */
  readonly renderer: PixiRenderer;
  /** The Web Audio back-end (locked until the first gesture). */
  readonly audio: WebAudio;
  /** Keyboard + gamepad input adapter. */
  readonly input: WebInput;
  /** The input profiles from `content/input/` (the active ones: `input.keyProfile`, …). */
  readonly profiles: InputProfileRegistry;
  /** The shared shell (atlas, event dispatcher, scene). */
  readonly shell: Shell;
  /** Stops the frame loop and releases listeners, GPU and audio resources. */
  stop(): void;
}

/**
 * Returns `window.localStorage`, or `null` when access throws (sandboxed iframes,
 * disabled cookies).
 *
 * @param win - The window.
 * @returns The storage or `null`.
 */
function safeLocalStorage(win: Window): StorageLike | null {
  try {
    return win.localStorage;
  } catch (_error) {
    return null;
  }
}

/**
 * `location.search` of the window, or `''` when there is no location (test fakes).
 *
 * @param win - The window.
 * @returns The query string.
 */
function searchOf(win: Window): string {
  const location = (win as Partial<Window>).location;
  return location === undefined ? '' : location.search;
}

/** Input dev overrides read from the query string. */
export interface InputOverrides {
  /** `?profile=<id>`: the keyboard / remote profile to use, or `null`. */
  readonly profile: string | null;
  /** `?debounce=<ticks>`: release debounce override (`0 … 10`), or `null`. */
  readonly debounce: number | null;
}

/**
 * Reads the input dev overrides `?profile=<id>` and `?debounce=<ticks>`.
 *
 * @remarks
 * Values are percent-decoded; a pair that fails to decode is skipped. When a key repeats, the
 * last *valid* value wins (an invalid later `debounce` does not clear an earlier one). The
 * profile id is not checked here — `bootWebApp` warns about an id no key profile has.
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns The overrides; a missing or empty `profile` and a `debounce` that is not an integer
 *   in `0 … MAX_RELEASE_DEBOUNCE_TICKS` give `null`.
 *
 * @example
 * ```ts
 * inputOverridesFromSearch('?profile=keyboard-remote-emulation&debounce=2');
 * // → { profile: 'keyboard-remote-emulation', debounce: 2 }
 * ```
 */
export function inputOverridesFromSearch(search: string): InputOverrides {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  let profile: string | null = null;
  let debounce: number | null = null;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    let value = eq < 0 ? '' : pair.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch (_error) {
      continue;
    }
    if (key === 'profile' && value !== '') profile = value;
    if (key === 'debounce' && /^[0-9]+$/.test(value)) {
      const ticks = Number(value);
      if (ticks <= MAX_RELEASE_DEBOUNCE_TICKS) debounce = ticks;
    }
  }
  return { profile, debounce };
}

/**
 * Boots the game into a canvas.
 *
 * @remarks
 * Creates input and audio (no context yet), then runs `bootShell`, which validates the content
 * (the input profiles into this app's registry), creates the renderer, then this app's
 * platform (through the factory, once WebGL2 support is known — the input profiles are
 * applied there) and the game. Without a `?profile=` override the saved profile choice is
 * applied once storage has answered. An unknown `?profile=` id is reported with
 * `console.warn` and the default is used. Everything is released by {@link WebApp.stop}; on a
 * failed boot the shell has already released it and shows the boot error screen.
 *
 * @param canvas - Target canvas (fills the window).
 * @param resources - The inlined content files and atlas (`virtual:shmup-*` modules).
 * @param win - The browser window (injectable for tests).
 * @returns A promise of the running app.
 * @throws Rejects with the shell's `ShellBootError` when content is invalid, the atlas cannot
 *   load or WebGL is unavailable.
 *
 * @example
 * ```ts
 * import contentFiles from 'virtual:shmup-content';
 * import assets from 'virtual:shmup-assets';
 *
 * const app = await bootWebApp(canvas, { contentFiles, assets });
 * // in the devtools console: app.game.state.tick
 * app.stop();
 * ```
 */
export async function bootWebApp(
  canvas: HTMLCanvasElement,
  resources: WebAppResources,
  win: Window = window,
): Promise<WebApp> {
  const nav = win.navigator;
  const hasGamepadApi = typeof nav.getGamepads === 'function';
  const input = createWebInput({
    keyTarget: win,
    keyDevice: 'keyboard',
    getGamepads: hasGamepadApi ? (): ArrayLike<GamepadLike | null> => nav.getGamepads() : undefined,
  });
  const audio = createWebAudio();
  const profiles = createInputProfileRegistry();
  const search = searchOf(win);
  const overrides = inputOverridesFromSearch(search);
  /**
   * Applies a keyboard / remote profile with the `?debounce=` override.
   *
   * @param profile - The profile.
   */
  const applyKeyProfile = (profile: InputProfile): void => {
    input.setProfile(
      overrides.debounce === null
        ? profile
        : overrideInputTuning(profile, { releaseDebounceTicks: overrides.debounce }),
    );
  };
  const shell = await bootShell({
    canvas,
    win,
    contentFiles: resources.contentFiles,
    assets: resources.assets,
    input,
    audio,
    contentOwners: { [INPUT_PROFILES_KIND]: profiles.load },
    platform: (renderer) => {
      const keys = chooseInputProfile(
        profiles.profiles,
        [overrides.profile, DEFAULT_KEYBOARD_PROFILE_ID],
        KEY_PROFILE_DEVICES,
      );
      if (overrides.profile !== null && keys?.id !== overrides.profile) {
        console.warn(
          `Shmup Cup: no keyboard or remote input profile "${overrides.profile}"; ` +
            `using ${keys?.id ?? 'the built-in bindings'}`,
        );
      }
      if (keys !== null) applyKeyProfile(keys);
      const pads = chooseInputProfile(profiles.profiles, [DEFAULT_GAMEPAD_PROFILE_ID], ['gamepad']);
      if (pads !== null) input.setProfile(pads);
      return createWebPlatform({
        input,
        audio,
        storage: safeLocalStorage(win),
        visibility: win.document,
        displaySize: () => ({ width: win.innerWidth, height: win.innerHeight }),
        gamepad: hasGamepadApi,
        webgl2: renderer.webGLVersion === 2,
      });
    },
    gameConfig: { remoteMode: false },
    scene: sceneFromSearch(search),
    audioUnlock: 'gesture',
  });

  // The saved choice (Options screen, M2-16) replaces the default once storage answers; a
  // `?profile=` override wins over it.
  let stopped = false;
  if (overrides.profile === null) {
    void loadInputProfileChoice(shell.platform.storage).then((saved) => {
      const chosen = chooseInputProfile(profiles.profiles, [saved], KEY_PROFILE_DEVICES);
      if (!stopped && chosen !== null && chosen.id !== input.keyProfile?.id) {
        applyKeyProfile(chosen);
      }
    });
  }

  return {
    game: shell.game,
    renderer: shell.renderer,
    audio,
    input,
    profiles,
    shell,
    stop() {
      stopped = true;
      shell.stop();
    },
  };
}
