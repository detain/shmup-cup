/**
 * # boot — composition root of the LG webOS TV app
 *
 * **Responsibility.** Creates the TV-specific adapters — remote-first input
 * (`keyDevice: 'remote'`), Web Audio and the webOS {@link createWebosPlatform | platform adapter}
 * (Back = 461, lifecycle, exit) — and hands them with the inlined content and atlas to the shared
 * boot sequence of `@shmup/shell` (`bootShell`: loading bar, content validation and boot error
 * screen, atlas pages from relative file URLs, renderer, game, event dispatch and the rAF frame
 * loop). The game runs with `remoteMode: true` and forced autofire; audio needs no gesture on TV,
 * so it is unlocked immediately.
 *
 * **Input profiles** (decisions D13/D14). The `input-profiles` content is parsed into a registry
 * during boot; the remote uses `webos-remote-safe`
 * (`@shmup/input-web` `DEFAULT_WEBOS_PROFILE_ID`, `content/input/webos.input-profiles.json`) until
 * the shell has read the save and applies the saved choice, and gamepads use `gamepad-standard`.
 * webOS registers no keys, so — unlike Tizen — switching a profile only swaps the bindings.
 *
 * **Back key** (shmup_feat.md §17/§23, shmup_tech.md §3.3). Once the game runs, Back (**461**) is
 * an ordinary remote key (`Action.Back` in menus, `Action.Pause` in the game — the input profile)
 * and the scene stack decides: game → pause, pause → resume, menus → back, **title → exit
 * confirmation → `platform.exit()` after YES**. A Back watcher is installed before boot and
 * removed once the shell runs, so Back still leaves the loading screen and the boot error screen.
 *
 * **Hardware status.** Every line here is verified against fakes only — **no agent has run this
 * on a webOS device**, and none can (plan M3-03: no LG hardware, no LG developer account). Plan
 * §8.7 lists what the owner has to check on a real set before this build is shipped anywhere.
 *
 * **Implements.** shmup_tech.md §3.3 (LG webOS adapter); shmup_feat.md §23 (platform layer), §3
 * (fixed step, pause on hidden), §4 (remote-first).
 *
 * **Public API.** {@link bootWebosApp}, {@link WebosApp}, {@link WebosAppResources},
 * {@link webosDebugTools}, {@link DEBUG_REMOTE_KEYS}.
 *
 * @module
 */
import { createWebAudio, type WebAudio } from '@shmup/audio-web';
import { defineModule, type ContentFile, type Game, type Platform } from '@shmup/core';
import {
  DEFAULT_GAMEPAD_PROFILE_ID,
  DEFAULT_WEBOS_PROFILE_ID,
  INPUT_PROFILES_KIND,
  KEY_PROFILE_DEVICES,
  chooseInputProfile,
  createInputProfileRegistry,
  createWebInput,
  customizeInputProfile,
  inputProfileChoices,
  selectableKeyProfiles,
  type GamepadLike,
  type InputCustomization,
  type InputProfile,
  type InputProfileRegistry,
  type WebInput,
} from '@shmup/input-web';
import type { PixiRenderer } from '@shmup/render-pixi';
import {
  bootShell,
  debugToolsFactory,
  defaultStageId,
  sceneFromSearch,
  type DebugToolsFactory,
  type Shell,
  type ShellAssets,
} from '@shmup/shell';
import {
  createWebosPlatform,
  getWebosApi,
  watchBackKey,
  type StorageLike,
  type WebosApi,
} from '../platform/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'boot',
  status: 'implemented',
  specRefs: ['shmup_tech.md §3.3', 'shmup_feat.md §23', 'shmup_feat.md §4'],
});

/** What the app boots with: the inlined virtual modules and the dev tools (see `main.ts`). */
export interface WebosAppResources {
  /** `virtual:shmup-content`. */
  readonly contentFiles: readonly ContentFile[];
  /** `virtual:shmup-assets`. */
  readonly assets: ShellAssets;
  /**
   * The debug tools (plan M1-19): `main.ts` passes {@link webosDebugTools}`(…)` in dev / test
   * builds (`__SHMUP_DEV__`) and `null` in a release build.
   */
  readonly debugTools?: DebugToolsFactory | null;
  /** The build id the game's replays record (M3-01 — `main.ts` passes `__SHMUP_BUILD__`). */
  readonly buildId?: string;
}

/**
 * The number keys the TV debug tools use once unlocked (1–8 work like F1–F8). webOS delivers
 * them without registration, so this list only documents which keys the overlay answers.
 */
export const DEBUG_REMOTE_KEYS: readonly string[] = Object.freeze([
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
]);

/**
 * The TV's debug tools (dev / test builds): the shell's tools behind the remote sequence Pause,
 * Ch+, Ch+, Ch+, exactly as on Tizen.
 *
 * @remarks
 * There is no `device-info` equivalent here: `webOS.deviceInfo` is asynchronous and model-specific
 * and no agent can verify what it returns, so the overlay's device line stays empty on webOS
 * rather than printing something unverified.
 *
 * @param buildId - The build id (`__SHMUP_BUILD__`).
 * @param reportUrl - Base URL of the render-telemetry log server (M3-02f); `''` (the default)
 *   leaves the guided capture off.
 * @returns The factory for {@link WebosAppResources.debugTools}.
 *
 * @example
 * ```ts
 * debugTools: __SHMUP_DEV__ ? webosDebugTools(__SHMUP_BUILD__, __SHMUP_REPORT_URL__) : null
 * ```
 */
export function webosDebugTools(buildId: string, reportUrl = ''): DebugToolsFactory {
  return debugToolsFactory({ unlock: 'sequence', buildId, reportUrl });
}

/** Handles to the running webOS app. */
export interface WebosApp {
  /** The running game session (`remoteMode: true`, `autofire: true`). */
  readonly game: Game;
  /** The webOS platform adapter. */
  readonly platform: Platform;
  /** The Pixi renderer (WebGL1 preferred). */
  readonly renderer: PixiRenderer;
  /** The Web Audio back-end (unlocked at boot — no gesture needed on TV). */
  readonly audio: WebAudio;
  /** Remote / keyboard + gamepad input adapter (`keyDevice: 'remote'`). */
  readonly input: WebInput;
  /** The input profiles from `content/input/` (the active ones: `input.keyProfile`, …). */
  readonly profiles: InputProfileRegistry;
  /** The shared shell (atlas, event dispatcher, scene). */
  readonly shell: Shell;
  /** Stops the loop and releases resources. */
  stop(): void;
}

/**
 * Returns `window.localStorage`, or `null` when access throws.
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

/**
 * Exits through the webOS API directly (used by Back before the platform exists, i.e. on the boot
 * error screen).
 *
 * @param webos - The webOS API, or `null` outside a TV.
 * @param win - The window (its `close()` is the fallback).
 * @returns An exit function, or `null` when the app cannot exit.
 */
function apiExit(webos: WebosApi | null, win: Window): (() => void) | null {
  const back = webos?.platformBack;
  if (back !== undefined) {
    return () => {
      back();
    };
  }
  return typeof win.close === 'function'
    ? () => {
        win.close();
      }
    : null;
}

/**
 * The input profiles in use and the player's settings for them (M2-16): applies a profile
 * customised (`customizeInputProfile` — the rebinding, SOCD, debounce) and keeps the profile as
 * written for the rebind screen.
 */
class ProfileState {
  /** The player's settings (the save's `options.input`). */
  settings: InputCustomization = { socd: null, releaseDebounce: null, bindings: {} };
  /** The remote profile in use, as written in the content. */
  keys: InputProfile | null = null;
  /** The gamepad profile in use, as written in the content. */
  pads: InputProfile | null = null;

  /**
   * Creates the state.
   *
   * @param input - The input adapter.
   */
  constructor(private readonly input: WebInput) {}

  /**
   * Applies a profile (remote or gamepad) with the player's settings.
   *
   * @param profile - The profile as written.
   */
  apply(profile: InputProfile): void {
    if (profile.device === 'gamepad') this.pads = profile;
    else this.keys = profile;
    this.input.setProfile(customizeInputProfile(profile, this.settings));
  }

  /**
   * Replaces the player's settings and re-applies both profiles.
   *
   * @param settings - The new settings.
   */
  customize(settings: InputCustomization): void {
    this.settings = settings;
    if (this.keys !== null) this.apply(this.keys);
    if (this.pads !== null) this.apply(this.pads);
  }

  /** The profiles in use, as written (the remote's, then the gamepad's). */
  get rebindable(): InputProfile[] {
    const list: InputProfile[] = [];
    if (this.keys !== null) list.push(this.keys);
    if (this.pads !== null) list.push(this.pads);
    return list;
  }
}

/**
 * Applies the first matching remote profile and the gamepad profile to the input adapter.
 *
 * @param state - The profiles in use (applies with the player's settings).
 * @param profiles - The parsed profiles.
 * @param candidates - Remote / keyboard profile ids in priority order.
 * @returns The key profile applied, or `null` when none matched (built-in bindings stay).
 */
function applyProfiles(
  state: ProfileState,
  profiles: readonly InputProfile[],
  candidates: ReadonlyArray<string | null>,
): InputProfile | null {
  const keys = chooseInputProfile(profiles, candidates, KEY_PROFILE_DEVICES);
  if (keys !== null) state.apply(keys);
  const pads = chooseInputProfile(profiles, [DEFAULT_GAMEPAD_PROFILE_ID], ['gamepad']);
  if (pads !== null) state.apply(pads);
  return keys;
}

/**
 * Boots the game on a webOS TV (or in a desktop browser for development).
 *
 * @remarks
 * Installs the Back watcher first (Back leaves the loading and boot error screens; it is removed
 * once the shell runs and the scene flow owns Back), creates input and audio, then runs
 * `bootShell`, which validates the content (the input profiles into this app's registry), creates
 * the renderer, this app's platform (with `webos-remote-safe` applied) and the game, and unlocks
 * audio immediately.
 *
 * @param canvas - Full-screen canvas.
 * @param resources - The inlined content files and atlas (`virtual:shmup-*` modules).
 * @param win - The window.
 * @returns A promise of the running app.
 * @throws Rejects with the shell's `ShellBootError` when content is invalid, the atlas cannot
 *   load or WebGL is unavailable (Back then still leaves the error screen).
 *
 * @example
 * ```ts
 * import contentFiles from 'virtual:shmup-content';
 * import assets from 'virtual:shmup-assets';
 *
 * bootWebosApp(canvas, { contentFiles, assets }).catch((error: unknown) => {
 *   console.error('Shmup Cup failed to start', error); // webOS Web Inspector
 * });
 * ```
 */
export async function bootWebosApp(
  canvas: HTMLCanvasElement,
  resources: WebosAppResources,
  win: Window = window,
): Promise<WebosApp> {
  const webos = getWebosApi(win);
  // Until the game runs, the loading / boot error screen is the root screen: Back leaves the app.
  const stopBack = watchBackKey(win, () => {
    const exit = apiExit(webos, win);
    if (exit !== null) exit();
  });

  const nav = win.navigator;
  const hasGamepadApi = typeof nav.getGamepads === 'function';
  const input = createWebInput({
    keyTarget: win,
    keyDevice: 'remote',
    getGamepads: hasGamepadApi ? (): ArrayLike<GamepadLike | null> => nav.getGamepads() : undefined,
  });
  const audio = createWebAudio();
  const profiles = createInputProfileRegistry();
  const state = new ProfileState(input);
  const scene = sceneFromSearch(searchOf(win));
  const shell = await bootShell({
    canvas,
    win,
    contentFiles: resources.contentFiles,
    assets: resources.assets,
    input,
    audio,
    contentOwners: { [INPUT_PROFILES_KIND]: profiles.load },
    platform: (renderer) => {
      applyProfiles(state, profiles.profiles, [DEFAULT_WEBOS_PROFILE_ID]);
      return createWebosPlatform({
        webos,
        input,
        audio,
        storage: safeLocalStorage(win),
        visibility: win.document,
        focus: win,
        close:
          typeof win.close === 'function'
            ? () => {
                win.close();
              }
            : null,
        displaySize: () => ({ width: win.innerWidth, height: win.innerHeight }),
        gamepad: hasGamepadApi,
        webgl2: renderer.webGLVersion === 2,
      });
    },
    // START plays zone A (plan M1-18); the TV has no `?stage=` / `?skip=` dev parameters.
    gameConfig: {
      remoteMode: true,
      autofire: true,
      stage: scene === 'game' ? defaultStageId(resources.contentFiles) : null,
    },
    scene,
    audioUnlock: 'immediate',
    // WebGL1 is the shipped default on every TV target (decision: the oldest webOS engines are
    // older than Tizen 5.5's Chromium 69, so WebGL2 cannot be assumed).
    preferWebGLVersion: 1,
    debugTools: resources.debugTools ?? null,
    buildId: resources.buildId ?? 'dev',
    /**
     * The Options screen's CONTROLS: the remote profiles whose menus the remote can drive;
     * `apply` switches the key profile (webOS registers no keys, so there is nothing else to do).
     */
    inputProfiles: {
      choices: () =>
        inputProfileChoices(profiles.profiles, 'keyCode', DEFAULT_WEBOS_PROFILE_ID, null, 'webos'),
      active: () => input.keyProfile?.id ?? null,
      apply: (id) => {
        // Only a profile the remote can drive the menus with (never lock the player out).
        const offered = selectableKeyProfiles(profiles.profiles, 'keyCode', 'webos');
        const chosen = chooseInputProfile(offered, [id], KEY_PROFILE_DEVICES);
        if (chosen === null || chosen === state.keys) return;
        state.apply(chosen);
      },
      // The player's rebinding, SOCD and debounce (M2-16), on the remote and gamepad profiles.
      customize: (settings) => state.customize(settings),
      rebindable: () => state.rebindable,
    },
  });
  stopBack();

  return {
    game: shell.game,
    platform: shell.platform,
    renderer: shell.renderer,
    audio,
    input,
    profiles,
    shell,
    stop() {
      shell.stop();
    },
  };
}
