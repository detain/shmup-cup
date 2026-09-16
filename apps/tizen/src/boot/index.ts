/**
 * # boot — composition root of the Tizen TV app
 *
 * **Responsibility.** Creates the TV-specific adapters — remote-first input
 * (`keyDevice: 'remote'`), Web Audio and the Tizen {@link createTizenPlatform | platform
 * adapter} (key registration, lifecycle, exit) — and hands them with the inlined content and
 * atlas to the shared boot sequence of `@shmup/shell` (`bootShell`: loading bar, content
 * validation and boot error screen, atlas pages from relative `file://` URLs, renderer, game,
 * event dispatch and the rAF frame loop). The game runs with `remoteMode: true` and forced
 * autofire; audio needs no gesture on TV, so it is unlocked immediately and the shell's audio
 * engine (M1-15) plays from boot. The app runs the shell's default scene, the core **scene flow**
 * (M1-16): title (with its theme), game ⇄ pause, stage clear / game over. START plays zone A,
 * AZURE VERGE with its boss HALCYON BULWARK (plan M1-18 — `@shmup/shell` `defaultStageId`); the TV
 * has no `?stage=` / `?skip=` dev parameters.
 *
 * **Input profiles** (decisions D13/D14). The `input-profiles` content is parsed into a
 * registry during boot; the remote uses `tizen-remote-safe` until the shell has read the save and
 * applies the saved choice (plan M1-17 — the choice lives in the save document), gamepads use
 * `gamepad-standard`, and the platform registers the active profile's `register` keys (falling
 * back to `REMOTE_KEYS_TO_REGISTER` when the content has no remote profile). The Options screen's
 * CONTROLS offers the profiles whose menus the remote can drive (`SAFE 4-WAY (DEFAULT)`,
 * `FAST 8-WAY`) and switches live, registering the new profile's keys. Since M2-16 the player's
 * rebinding, SOCD policy and release debounce (the save's `options.input`) are applied to the
 * remote and gamepad profiles, and the rebind screen rebinds them (the remote's Back never moves —
 * it cancels a capture).
 *
 * **Saves (M1-17).** Options and hi-scores live in `localStorage` (deleted with the app on
 * uninstall); the save is written when the Options screen closes and when a game ends, so
 * quitting with Back → YES loses nothing. Since M2-17 the storage has quota checks (the shell's
 * `createWebStorage`, through the platform adapter). Since M3-01 the replay library keeps the last
 * game and three kept replays there too (`replay.last`, `replay.1`–`3`, removed with the app like
 * the save); `main.ts` passes the build id they record ({@link TizenAppResources.buildId}). The TV
 * has no clipboard, so the replay browser offers no SHARE here.
 *
 * **Back key** (shmup_feat.md §17/§23). Once the game runs, Back is an ordinary remote key
 * (`Action.Back` in menus, `Action.Pause` in the game — the input profile) and the scene stack
 * decides: game → pause, pause → resume, menus → back, **title → exit confirmation →
 * `platform.exit()` after YES**. The app no longer exits on Back by itself — except while the game
 * is not running: a Back watcher is installed before boot and removed once the shell runs, so
 * Back still leaves the loading screen and the boot error screen (the root screen then).
 *
 * **Implements.** shmup_feat.md §23 (Tizen: Back, registerKeyBatch, visibilitychange,
 * exit), §3 (fixed step, pause on hidden), §4 (remote-first).
 *
 * **Debug tools (M1-19).** Dev / test builds (`build:dev`, `build:test`) get the shell's debug
 * tools ({@link tizenDebugTools}): the remote sequence **Pause, Ch+, Ch+, Ch+** unlocks them and
 * shows the overlay (boot ms, WebGL version, FPS and the frame graph for the on-device checks),
 * registers the number keys, and 1–8 then run the eight commands (1 overlay, 2 god mode, 3
 * hitboxes / grid, 4 frame advance, 5 step, 6 slow motion, 7 next checkpoint, 8 skip to the boss);
 * `window.__shmupDebug` is published for the remote inspector (since M2-17 with the save export /
 * import, `__shmupDebug.save`). Since M2-17 the unlock also collects the TV's facts (`device-info`:
 * model, model code and firmware from Samsung's `webapis.productinfo` — `webapis.js` is loaded only
 * then —, the display, Chrome and WebGL) for the overlay's sixth line, the **device line**, and logs
 * the snapshot as `Shmup Cup device`. The release bundle (`pnpm build`) has none of it.
 *
 * **Public API.** {@link bootTizenApp}, {@link TizenApp}, {@link TizenAppResources},
 * {@link tizenDebugTools}, {@link DEBUG_REMOTE_KEYS}.
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
  collectDeviceInfo,
  formatDeviceLine,
  loadWebapis,
  type DeviceInfo,
  type GlParameterSource,
  type WebapisLike,
} from '../device-info/index.js';
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

/** What the app boots with: the inlined virtual modules and the dev tools (see `main.ts`). */
export interface TizenAppResources {
  /** `virtual:shmup-content`. */
  readonly contentFiles: readonly ContentFile[];
  /** `virtual:shmup-assets`. */
  readonly assets: ShellAssets;
  /**
   * The debug tools (plan M1-19): `main.ts` passes {@link tizenDebugTools}`(…)` in dev / test builds
   * (`__SHMUP_DEV__` — `build:dev`, `build:test`) and `null` in a release build.
   */
  readonly debugTools?: DebugToolsFactory | null;
  /** The build id the game's replays record (M3-01 — `main.ts` passes `__SHMUP_BUILD__`). */
  readonly buildId?: string;
}

/**
 * The number keys the TV debug tools use once unlocked (1–8 work like F1–F8); registered with
 * `tvinputdevice` only then, in dev builds.
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
 * Ch+, Ch+, Ch+ — which also registers the number keys 1–8 ({@link DEBUG_REMOTE_KEYS}) so the
 * remote's number pad can run the commands, and (M2-17) collects the TV's facts (`device-info`:
 * model, firmware — Samsung's `webapis.productinfo`, loaded only then —, display, Chrome and
 * WebGL) for the overlay's device line.
 *
 * @remarks
 * The factory remembers the renderer of the host it is called with (its WebGL version). The
 * device line starts empty (no sixth panel line), is filled from the window and the renderer as
 * soon as the sequence unlocks the tools, then again with the model and firmware once
 * `loadWebapis` settles (at most `WEBAPIS_TIMEOUT_MS`); the shell reads it every frame through
 * `DebugToolsOptions.device`, which returns the same string until then (no allocation). A failure
 * while collecting leaves the line as far as it got. Outside a TV `webapis.js` is never requested
 * and the model and firmware show as `?`.
 *
 * @param win - The window (its `tizen` API registers the keys; none outside a TV).
 * @param buildId - The build id (`__SHMUP_BUILD__`).
 * @param canvas - The game canvas, for the device line's `MAX_TEXTURE_SIZE` (default `null`).
 * @returns The factory for {@link TizenAppResources.debugTools}.
 *
 * @example
 * ```ts
 * debugTools: __SHMUP_DEV__ ? tizenDebugTools(window, __SHMUP_BUILD__, canvas) : null
 * ```
 */
export function tizenDebugTools(
  win: Window,
  buildId: string,
  canvas: HTMLCanvasElement | null = null,
): DebugToolsFactory {
  /** The overlay's device line (M2-17), filled once the tools are unlocked. */
  const device = { line: '' };
  /** The renderer the tools were created on (its WebGL version). */
  let renderer: PixiRenderer | null = null;
  const factory = debugToolsFactory({
    unlock: 'sequence',
    buildId,
    onUnlock: () => {
      const tizen = getTizenApi(win);
      if (tizen !== null) registerRemoteKeys(tizen, DEBUG_REMOTE_KEYS);
      if (renderer !== null) {
        // Diagnostics only: a failure leaves the line as far as it got.
        describeDevice(win, canvas, renderer.webGLVersion, device).catch(() => undefined);
      }
    },
    device: () => device.line,
  });
  return (host) => {
    renderer = host.renderer;
    return factory(host);
  };
}

/**
 * Collects the TV's facts for the debug overlay (M2-17 — `device-info`): at once from the window
 * and the renderer, then again with the model and firmware once Samsung's `webapis.js` has loaded
 * (TV only). Logs the snapshot for the remote Web Inspector.
 *
 * @param win - The window.
 * @param canvas - The game canvas (its WebGL context gives `MAX_TEXTURE_SIZE`), or `null`.
 * @param webGLVersion - The renderer's WebGL version.
 * @param device - Receives the overlay line.
 * @returns Resolves once the product info was read (or found missing).
 */
async function describeDevice(
  win: Window,
  canvas: HTMLCanvasElement | null,
  webGLVersion: number,
  device: { line: string },
): Promise<void> {
  let gl: GlParameterSource | null = null;
  try {
    // The context the renderer created (getContext returns the existing one).
    if (canvas !== null && typeof canvas.getContext === 'function') {
      gl = webGLVersion === 2 ? canvas.getContext('webgl2') : canvas.getContext('webgl');
    }
  } catch (_error) {
    gl = null;
  }
  /**
   * Reads the snapshot.
   *
   * @param webapis - Samsung's API, or `null`.
   * @returns The snapshot.
   */
  const collect = (webapis: WebapisLike | null): DeviceInfo =>
    collectDeviceInfo({
      userAgent: (win.navigator as Navigator | undefined)?.userAgent ?? '',
      innerWidth: win.innerWidth,
      innerHeight: win.innerHeight,
      devicePixelRatio: win.devicePixelRatio,
      webglVersion: webGLVersion,
      gl,
      webapis,
    });
  device.line = formatDeviceLine(collect(null));
  const info = collect(await loadWebapis(win));
  device.line = formatDeviceLine(info);
  console.info('Shmup Cup device', info);
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
 * Boots the game on the TV (or in a desktop browser for development).
 *
 * @remarks
 * Installs the Back watcher first (Back exits while the game is not running — the loading and
 * boot error screens; it is removed once the shell runs and the scene flow owns Back), creates
 * input and audio, then runs `bootShell`, which validates the content (the
 * input profiles into this app's registry), creates the renderer, this app's platform (with the
 * `tizen-remote-safe` profile applied and its keys registered) and the game, and unlocks audio
 * immediately. The shell reads the save during boot; a saved profile choice (only one the Options
 * screen offers) is applied then and its keys registered. Suspend (Home / multitasking) clears
 * held input and suspends audio; resume
 * resumes audio and the game resets its loop accumulator.
 *
 * @param canvas - Full-screen canvas.
 * @param resources - The inlined content files and atlas (`virtual:shmup-*` modules).
 * @param win - The window.
 * @returns A promise of the running app.
 * @throws Rejects with the shell's `ShellBootError` when content is invalid, the atlas cannot
 *   load or WebGL is unavailable (Back then still exits the app from the error screen).
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
  // Until the game runs, the loading / boot error screen is the root screen: Back exits. The scene
  // flow owns Back afterwards (title → exit confirmation), so the watcher goes once boot succeeded.
  const stopBack = watchBackKey(win, () => {
    const exit = apiExit(tizen);
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
      const keyProfile = applyProfiles(state, profiles.profiles, [DEFAULT_REMOTE_PROFILE_ID]);
      return createTizenPlatform({
        tizen,
        input,
        audio,
        storage: safeLocalStorage(win),
        visibility: win.document,
        // M3-02b: Home is only an overlay on the M7 — it fires `blur`, never `visibilitychange`.
        focus: win,
        displaySize: () => ({ width: win.innerWidth, height: win.innerHeight }),
        gamepad: hasGamepadApi,
        webgl2: renderer.webGLVersion === 2,
        registerKeys: keyProfile?.register,
      });
    },
    // START plays zone A (plan M1-18; the dev scenes fly in open space); the TV has no `?stage=` /
    // `?skip=` dev parameters.
    gameConfig: {
      remoteMode: true,
      autofire: true,
      stage: scene === 'game' ? defaultStageId(resources.contentFiles) : null,
    },
    scene,
    audioUnlock: 'immediate',
    preferWebGLVersion: 1,
    debugTools: resources.debugTools ?? null,
    // The build the replays record (M3-01; the TV has no SHARE).
    buildId: resources.buildId ?? 'dev',
    /**
     * The Options screen's CONTROLS (plan M1-17): the remote profiles whose menus the remote can
     * drive (`SAFE 4-WAY (DEFAULT)`, `FAST 8-WAY`); `apply` — for the saved choice at boot and the
     * player's pick alike — switches the key profile and registers its `register` keys, ignoring
     * an id it does not offer and the profile already in use.
     */
    inputProfiles: {
      choices: () => inputProfileChoices(profiles.profiles, 'keyCode', DEFAULT_REMOTE_PROFILE_ID),
      active: () => input.keyProfile?.id ?? null,
      apply: (id) => {
        // Only a profile the remote can drive the menus with (never lock the player out).
        const offered = selectableKeyProfiles(profiles.profiles, 'keyCode');
        const chosen = chooseInputProfile(offered, [id], KEY_PROFILE_DEVICES);
        if (chosen === null || chosen === state.keys) return;
        state.apply(chosen);
        if (tizen !== null) registerRemoteKeys(tizen, chosen.register);
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
