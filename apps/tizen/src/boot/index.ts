/**
 * # boot — composition root of the Tizen TV app
 *
 * **Responsibility.** Creates the TV-specific adapters — remote-first input
 * (`keyDevice: 'remote'`), Web Audio and the Tizen {@link createTizenPlatform | platform
 * adapter} (key registration, lifecycle, exit) — and hands them with the inlined content and
 * atlas to the shared boot sequence of `@shmup/shell` (`bootShell`: loading bar, content
 * validation and boot error screen, atlas pages from relative `file://` URLs, renderer, game,
 * event dispatch and the rAF frame loop). The game runs with `remoteMode: true` and forced
 * autofire; audio needs no gesture on TV, so it is unlocked immediately.
 *
 * **Input profiles** (decisions D13/D14). The `input-profiles` content is parsed into a
 * registry during boot; the remote uses the saved profile choice (`Platform.storage`, applied
 * as soon as it is read) or `tizen-remote-safe`, gamepads use `gamepad-standard`, and the
 * platform registers the active profile's `register` keys (falling back to
 * `REMOTE_KEYS_TO_REGISTER` when the content has no remote profile).
 *
 * **Back key.** Until the title scene with its exit-confirmation dialog exists
 * (shmup_feat.md §17/§23, M1-16), the free-flight scene *is* the app's root screen, so Back exits
 * directly — the correct Tizen behaviour for a root screen. The Back watcher is installed
 * before boot, so Back also leaves the boot error screen. Later the scene stack consumes
 * `Action.Back` and this shortcut goes away.
 *
 * **Implements.** shmup_feat.md §23 (Tizen: Back, registerKeyBatch, visibilitychange,
 * exit), §3 (fixed step, pause on hidden), §4 (remote-first).
 *
 * **Public API.** {@link bootTizenApp}, {@link TizenApp}, {@link TizenAppResources}.
 *
 * @module
 */
import { createWebAudio, type WebAudio } from '@shmup/audio-web';
import { defineModule, type ContentFile, type Game, type Platform } from '@shmup/core';
import {
  DEFAULT_GAMEPAD_PROFILE_ID,
  DEFAULT_REMOTE_PROFILE_ID,
  INPUT_PROFILES_KIND,
  KEY_PROFILE_DEVICES,
  chooseInputProfile,
  createInputProfileRegistry,
  createWebInput,
  loadInputProfileChoice,
  type GamepadLike,
  type InputProfile,
  type InputProfileRegistry,
  type WebInput,
} from '@shmup/input-web';
import type { PixiRenderer } from '@shmup/render-pixi';
import { bootShell, sceneFromSearch, type Shell, type ShellAssets } from '@shmup/shell';
import {
  createTizenPlatform,
  getTizenApi,
  registerRemoteKeys,
  watchBackKey,
  type StorageLike,
  type TizenApi,
} from '../platform/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'boot',
  status: 'implemented',
  specRefs: ['shmup_feat.md §23', 'shmup_feat.md §3', 'shmup_feat.md §4'],
});

/** What the app boots with: the inlined virtual modules (see `main.ts`). */
export interface TizenAppResources {
  /** `virtual:shmup-content`. */
  readonly contentFiles: readonly ContentFile[];
  /** `virtual:shmup-assets`. */
  readonly assets: ShellAssets;
}

/** Handles to the running TV app. */
export interface TizenApp {
  /** The running game session (`remoteMode: true`, `autofire: true`). */
  readonly game: Game;
  /** The Tizen platform adapter (`exit` is `null` outside a TV). */
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
 * Exits through the Tizen API directly (used by Back before the platform exists, i.e. on the
 * boot error screen).
 *
 * @param tizen - The Tizen API, or `null` outside a TV.
 * @returns An exit function, or `null` when the app cannot exit.
 */
function apiExit(tizen: TizenApi | null): (() => void) | null {
  const application = tizen?.application;
  if (application === undefined) return null;
  return () => {
    application.getCurrentApplication().exit();
  };
}

/**
 * Applies the first matching remote profile and the gamepad profile to the input adapter.
 *
 * @param input - The input adapter.
 * @param profiles - The parsed profiles.
 * @param candidates - Remote / keyboard profile ids in priority order.
 * @returns The key profile applied, or `null` when none matched (built-in bindings stay).
 */
function applyProfiles(
  input: WebInput,
  profiles: readonly InputProfile[],
  candidates: ReadonlyArray<string | null>,
): InputProfile | null {
  const keys = chooseInputProfile(profiles, candidates, KEY_PROFILE_DEVICES);
  if (keys !== null) input.setProfile(keys);
  const pads = chooseInputProfile(profiles, [DEFAULT_GAMEPAD_PROFILE_ID], ['gamepad']);
  if (pads !== null) input.setProfile(pads);
  return keys;
}

/**
 * Boots the game on the TV (or in a desktop browser for development).
 *
 * @remarks
 * Installs the Back watcher first (Back exits from the root screen — including the boot error
 * screen), creates input and audio, then runs `bootShell`, which validates the content (the
 * input profiles into this app's registry), creates the renderer, this app's platform (with the
 * `tizen-remote-safe` profile applied and its keys registered) and the game, and unlocks audio
 * immediately. A saved profile choice is applied — and its keys registered — once storage has
 * answered. Suspend (Home / multitasking) clears held input and suspends audio; resume
 * resumes audio and the game resets its loop accumulator.
 *
 * @param canvas - Full-screen canvas.
 * @param resources - The inlined content files and atlas (`virtual:shmup-*` modules).
 * @param win - The window.
 * @returns A promise of the running app.
 * @throws Rejects with the shell's `ShellBootError` when content is invalid, the atlas cannot
 *   load or WebGL is unavailable (Back still exits the app afterwards).
 *
 * @example
 * ```ts
 * import contentFiles from 'virtual:shmup-content';
 * import assets from 'virtual:shmup-assets';
 *
 * bootTizenApp(canvas, { contentFiles, assets }).catch((error: unknown) => {
 *   console.error('Shmup Cup failed to start', error); // remote Web Inspector
 * });
 * ```
 */
export async function bootTizenApp(
  canvas: HTMLCanvasElement,
  resources: TizenAppResources,
  win: Window = window,
): Promise<TizenApp> {
  const tizen = getTizenApi(win);
  let platform: Platform | null = null;
  const stopBack = watchBackKey(win, () => {
    const exit = platform !== null ? platform.exit : apiExit(tizen);
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
  const shell = await bootShell({
    canvas,
    win,
    contentFiles: resources.contentFiles,
    assets: resources.assets,
    input,
    audio,
    contentOwners: { [INPUT_PROFILES_KIND]: profiles.load },
    platform: (renderer) => {
      const keyProfile = applyProfiles(input, profiles.profiles, [DEFAULT_REMOTE_PROFILE_ID]);
      platform = createTizenPlatform({
        tizen,
        input,
        audio,
        storage: safeLocalStorage(win),
        visibility: win.document,
        displaySize: () => ({ width: win.innerWidth, height: win.innerHeight }),
        gamepad: hasGamepadApi,
        webgl2: renderer.webGLVersion === 2,
        registerKeys: keyProfile?.register,
      });
      return platform;
    },
    gameConfig: { remoteMode: true, autofire: true },
    scene: sceneFromSearch(searchOf(win)),
    audioUnlock: 'immediate',
    preferWebGLVersion: 1,
  });

  // The saved choice (Options screen, M2-16) replaces the default once storage answers.
  let stopped = false;
  void loadInputProfileChoice(shell.platform.storage).then((saved) => {
    const chosen = chooseInputProfile(profiles.profiles, [saved], KEY_PROFILE_DEVICES);
    if (stopped || chosen === null || chosen === input.keyProfile) return;
    input.setProfile(chosen);
    if (tizen !== null) registerRemoteKeys(tizen, chosen.register);
  });

  return {
    game: shell.game,
    platform: shell.platform,
    renderer: shell.renderer,
    audio,
    input,
    profiles,
    shell,
    stop() {
      stopped = true;
      shell.stop();
      stopBack();
    },
  };
}
