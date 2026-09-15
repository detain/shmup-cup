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
 * as a user activation) — sound effects requested before it are dropped, and a stage's theme
 * (`?stage=`, prepared during boot, plan M1-15) starts with that gesture; the tab being hidden
 * suspends the game, clears held input and suspends audio. The default scene is the game's
 * **scene flow** (plan M1-16): the title (`PRESS OK`, then START / OPTIONS — no EXIT in a browser),
 * the game with its HUD, the pause menu (Esc / P / Backspace), stage clear and game over, all
 * drawn on the canvas and driven by the menu / game binding contexts. `?scene=flight` plays
 * **free flight** straight away instead (the KESTREL under keyboard / gamepad control from the
 * first frame, no menus — plan M1-06; the e2e tests of the gameplay steps use it). The game
 * plays **zone A** (AZURE VERGE, plan M1-18 — the shell's `DEFAULT_STAGE_ID`); `?stage=<id>`
 * makes it run another stage (`?stage=test-range` is the dev stage — plan M1-07; `?scene=flight`
 * flies in open space unless a `?stage=` names one); `?skip=boss` is the debug stage skip: every
 * game starts a little before the stage's boss (`GameConfig.stageSkip`,
 * {@link stageSkipFromSearch} — the e2e smoke reaches HALCYON BULWARK with it);
 * `?scene=showcase` shows the M1-04 sprite showcase, `?scene=calibration` the test pattern and
 * `?scene=fx-gallery` every particle preset and screen effect in turn (plan M1-14);
 * `?loadout=full` starts fully powered — speed 2, Missile, Laser, four Options (dev override,
 * plan M1-10; {@link loadoutFromSearch}).
 *
 * **Input profiles** (decisions D13–D15). The `input-profiles` content is parsed into a
 * registry during boot. Keys use `?profile=<id>` when given (dev override — e.g.
 * `keyboard-remote-emulation` to feel the remote's limits on a desktop, or a `tizen-remote-*`
 * profile), else the choice stored in the save (the shell reads it before the title and hands it
 * to this app — plan M1-17), else `keyboard-default`; gamepads use `gamepad-standard`.
 * `?debounce=<ticks>` overrides the key profile's release debounce
 * ({@link inputOverridesFromSearch}). The Options screen's CONTROLS offers the keyboard profiles
 * whose menus a desktop keyboard can drive (`KEYBOARD (DEFAULT)` = `keyboard-default`,
 * `KEYBOARD AS REMOTE` = `keyboard-remote-emulation`; plus a `?profile=` override in use) and
 * switches live. Since M2-16 the player's rebinding, SOCD policy and release debounce (the save's
 * `options.input`) are applied to the key and gamepad profiles (`customizeInputProfile`), and the
 * rebind screen rebinds the keyboard profile in use and the gamepad profile (the adapter captures
 * the keys — `WebInput.beginCapture`).
 *
 * **Saves (M1-17).** Options and hi-scores live in `localStorage` (`shmup-cup:save.v1`, with the
 * shell's quota checks since M2-17); the shell loads them before the title and applies the volumes.
 *
 * **Electron (M2-17).** The desktop app loads this build; when its preload's bridge is present
 * (`window.shmupElectron`, {@link getElectronBridge}) the platform is `'electron'`: saves are JSON
 * files in the user-data folder (written by the main process — atomic, with a backup), the title
 * offers EXIT (the app quits after YES) and audio is unlocked at boot (the window needs no
 * gesture).
 *
 * **Debug tools (M1-19).** In dev / test builds (`pnpm dev`, `build:test`) `main.ts` hands over the
 * shell's debug tools ({@link WebAppResources.debugTools}): F1 overlay, F2 god mode, F3 hitboxes /
 * grid, F4 frame advance, F5 step, F6 slow motion, F7 next checkpoint, F8 skip to the boss, and
 * `window.__shmupDebug`. A release build (`pnpm build`) has none. There `?determinism` (M2-18,
 * {@link determinismFromSearch}) opens the cross-engine determinism check instead of the game
 * (`@shmup/shell` `installDeterminismCheck`: golden replays played in the page's engine, no WebGL
 * needed — `test/e2e/determinism.spec.ts` runs it in Chromium and Firefox).
 *
 * **Replays (M3-01).** `main.ts` passes the build id the replays record
 * ({@link WebAppResources.buildId}); the replay browser's SHARE copies a replay's text to the
 * clipboard ({@link copyReplayText} — `navigator.clipboard`, a secure context), and text pasted
 * anywhere on the page that holds `"run-replay"` is imported into the first free kept slot
 * ({@link listenForPastedReplays} → `Shell.replays.importText`; removed by `WebApp.stop`). The
 * replays live in `localStorage` next to the save (`shmup-cup:replay.last`, `replay.1`–`3`).
 *
 * **Implements.** shmup_feat.md §23 (web dev target), §3 (rAF-driven fixed step, pause on
 * visibility change, integer scaling), §19 (resume audio on first input), §4 (input profiles).
 *
 * **Public API.** {@link bootWebApp}, {@link WebApp}, {@link WebAppResources},
 * {@link inputOverridesFromSearch}, {@link InputOverrides}, {@link stageFromSearch},
 * {@link contentStageIds}, {@link loadoutFromSearch}, {@link stageSkipFromSearch},
 * {@link determinismFromSearch}; M3-01: {@link copyReplayText}, {@link listenForPastedReplays}.
 *
 * @module
 */
import { createWebAudio, type WebAudio } from '@shmup/audio-web';
import {
  defineModule,
  type ContentFile,
  type Game,
  type StageSkip,
  type StartingLoadout,
} from '@shmup/core';
import {
  DEFAULT_GAMEPAD_PROFILE_ID,
  DEFAULT_KEYBOARD_PROFILE_ID,
  INPUT_PROFILES_KIND,
  KEY_PROFILE_DEVICES,
  MAX_RELEASE_DEBOUNCE_TICKS,
  chooseInputProfile,
  createInputProfileRegistry,
  createWebInput,
  customizeInputProfile,
  inputProfileChoices,
  overrideInputTuning,
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
  defaultStageId,
  sceneFromSearch,
  type DebugToolsFactory,
  type Shell,
  type ShellAssets,
} from '@shmup/shell';
import { createWebPlatform, getElectronBridge, type StorageLike } from '../platform/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'boot',
  status: 'implemented',
  specRefs: ['shmup_feat.md §23', 'shmup_feat.md §3', 'shmup_feat.md §19'],
});

/** What the app boots with: the inlined virtual modules and the dev tools (see `main.ts`). */
export interface WebAppResources {
  /** `virtual:shmup-content`. */
  readonly contentFiles: readonly ContentFile[];
  /** `virtual:shmup-assets`. */
  readonly assets: ShellAssets;
  /**
   * The debug tools (plan M1-19): `main.ts` passes `debugToolsFactory(…)` in dev / test builds
   * (`__SHMUP_DEV__`) — F1–F8, the overlay, `window.__shmupDebug` — and `null` in a release build.
   */
  readonly debugTools?: DebugToolsFactory | null;
  /** The build id the game's replays record (M3-01 — `main.ts` passes `__SHMUP_BUILD__`). */
  readonly buildId?: string;
}

/**
 * Copies a replay's text to the clipboard (M3-01 — the replay browser's SHARE on the web /
 * desktop): `navigator.clipboard.writeText` when the page has it (a secure context).
 *
 * @param win - The window.
 * @param text - The replay's text.
 * @returns Whether the copy was started (it completes asynchronously; a refusal is ignored).
 */
export function copyReplayText(win: Window, text: string): boolean {
  const clipboard = win.navigator.clipboard as Clipboard | undefined;
  if (clipboard === undefined || typeof clipboard.writeText !== 'function') return false;
  clipboard.writeText(text).catch(() => {
    // The page lost focus or the permission was refused: nothing was copied.
  });
  return true;
}

/**
 * Imports a pasted replay (M3-01 — the other half of SHARE): text pasted anywhere on the page that
 * looks like a run replay goes into the first free kept slot of the replay library.
 *
 * @param win - The window (its `paste` events).
 * @param importText - The library's `importText`.
 * @returns A function that removes the listener.
 */
export function listenForPastedReplays(
  win: Window,
  importText: (text: string) => number,
): () => void {
  /**
   * Handles one paste.
   *
   * @param event - The paste event.
   */
  const onPaste = (event: Event): void => {
    const data = (event as ClipboardEvent).clipboardData;
    const text = data === null || data === undefined ? '' : data.getData('text');
    if (text.indexOf('"run-replay"') < 0) return;
    importText(text);
    event.preventDefault();
  };
  win.addEventListener('paste', onPaste);
  return () => {
    win.removeEventListener('paste', onPaste);
  };
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
 * Reads the `?stage=<id>` dev parameter (percent-decoded; the last non-empty value wins).
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns The stage id, or `null` when absent or empty (free flight in open space).
 *
 * @example
 * ```ts
 * stageFromSearch('?stage=test-range&profile=keyboard-default'); // → 'test-range'
 * ```
 */
export function stageFromSearch(search: string): string | null {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  let stage: string | null = null;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq) !== 'stage') continue;
    try {
      const value = decodeURIComponent(pair.slice(eq + 1));
      if (value !== '') stage = value;
    } catch (_error) {
      // A malformed escape: ignore the pair.
    }
  }
  return stage;
}

/**
 * Reads the `?loadout=<preset>` dev parameter (the last valid value wins).
 *
 * @remarks
 * Name and value must match exactly — case-sensitive, not percent-decoded — so `?LOADOUT=full`,
 * `?loadout=Full` and `?loadout=full=1` are ignored, as are unknown values
 * (`?loadout=full&loadout=bogus` → `'full'`). The Tizen app has no such parameter.
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns `'full'` or `'default'` when asked for, `null` when absent, empty or unknown (the
 *   session then starts with the default loadout).
 *
 * @example
 * ```ts
 * loadoutFromSearch('?stage=test-range&loadout=full'); // → 'full'
 * ```
 */
export function loadoutFromSearch(search: string): StartingLoadout | null {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  let loadout: StartingLoadout | null = null;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq) !== 'loadout') continue;
    const value = pair.slice(eq + 1);
    if (value === 'full' || value === 'default') loadout = value;
  }
  return loadout;
}

/**
 * Reads the `?skip=boss` debug parameter (the stage skip of plan M1-18; the last valid value
 * wins; exact, case-sensitive, not percent-decoded, like `?loadout=`).
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns `'boss'` or `'none'` when asked for, `null` when absent, empty or unknown (no skip).
 *
 * @example
 * ```ts
 * stageSkipFromSearch('?skip=boss'); // → 'boss'
 * ```
 */
export function stageSkipFromSearch(search: string): StageSkip | null {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  let skip: StageSkip | null = null;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq) !== 'skip') continue;
    const value = pair.slice(eq + 1);
    if (value === 'boss' || value === 'none') skip = value;
  }
  return skip;
}

/**
 * Whether the page asks for the cross-engine determinism check instead of the game: a
 * `determinism` parameter (`?determinism`, with any value) — M2-18. `main.ts` honours it only in
 * dev / test builds (`__SHMUP_DEV__`).
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns `true` when the parameter is present.
 *
 * @example
 * ```ts
 * determinismFromSearch('?determinism'); // → true
 * determinismFromSearch('?stage=zone-a'); // → false
 * ```
 */
export function determinismFromSearch(search: string): boolean {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if ((eq < 0 ? pair : pair.slice(0, eq)) === 'determinism') return true;
  }
  return false;
}

/**
 * The ids of every `stage` file among the content files (before validation — for choosing a
 * stage; the shell validates the content itself).
 *
 * @param files - `virtual:shmup-content`.
 * @returns The ids, in file order.
 */
export function contentStageIds(files: readonly ContentFile[]): string[] {
  const ids: string[] = [];
  for (const file of files) {
    const data = file.data as { kind?: unknown; id?: unknown } | null;
    if (data !== null && typeof data === 'object' && data.kind === 'stage') {
      if (typeof data.id === 'string') ids.push(data.id);
    }
  }
  return ids;
}

/**
 * Boots the game into a canvas.
 *
 * @remarks
 * Creates input and audio (no context yet), then runs `bootShell`, which validates the content
 * (the input profiles into this app's registry), creates the renderer, then this app's
 * platform (through the factory, once WebGL2 support is known — the input profiles are
 * applied there), reads the save and the game. Without a `?profile=` override the saved profile
 * choice is applied during boot (only a profile the Options screen offers). An unknown
 * `?profile=` id is reported with
 * `console.warn` and the default is used; so is an unknown `?stage=` id (the game then flies in
 * open space). The game config sets `remoteMode: false` (keyboard / gamepad play; `autofire`
 * keeps its default, on), the stage (`?stage=`, else zone A in the scene flow — `defaultStageId`
 * of `@shmup/shell`, open space in the dev scenes), the `?skip=` stage skip
 * ({@link stageSkipFromSearch}, default `'none'`) and the `?loadout=` preset
 * ({@link loadoutFromSearch}, default `'default'`). Everything is released by
 * {@link WebApp.stop}; on a failed boot the shell has already released it and shows the boot
 * error screen.
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
  // Inside the Electron desktop app (M2-17): file saves through the preload's bridge, EXIT quits.
  const electron = getElectronBridge(win);
  const search = searchOf(win);
  const overrides = inputOverridesFromSearch(search);
  const scene = sceneFromSearch(search);
  let stage = stageFromSearch(search);
  if (stage !== null && contentStageIds(resources.contentFiles).indexOf(stage) < 0) {
    console.warn(`Shmup Cup: no stage "${stage}"; flying in open space`);
    stage = null;
  } else if (stage === null && scene === 'game') {
    // The game plays zone A unless a `?stage=` says otherwise (dev scenes keep open space).
    stage = defaultStageId(resources.contentFiles);
  }
  /** The profile a `?profile=` override selected (offered in the Options screen too), if any. */
  let overrideProfile: InputProfile | null = null;
  /** The player's rebinding, SOCD and debounce (M2-16 — the save's `options.input`). */
  let settings: InputCustomization = { socd: null, releaseDebounce: null, bindings: {} };
  /** The key profile in use, as the content wrote it (M2-16 — what the rebind screen rebinds). */
  let baseKeys: InputProfile | null = null;
  /** The gamepad profile in use, as the content wrote it. */
  let basePads: InputProfile | null = null;
  /**
   * Applies a keyboard / remote profile with the player's settings (M2-16) and the `?debounce=`
   * override.
   *
   * @param profile - The profile (as written in the content).
   */
  const applyKeyProfile = (profile: InputProfile): void => {
    baseKeys = profile;
    const custom = customizeInputProfile(profile, settings);
    input.setProfile(
      overrides.debounce === null
        ? custom
        : overrideInputTuning(custom, { releaseDebounceTicks: overrides.debounce }),
    );
  };
  /**
   * Applies the gamepad profile with the player's settings (M2-16).
   *
   * @param profile - The profile (as written in the content).
   */
  const applyPadProfile = (profile: InputProfile): void => {
    basePads = profile;
    input.setProfile(customizeInputProfile(profile, settings));
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
      if (keys !== null && keys.id === overrides.profile) overrideProfile = keys;
      const pads = chooseInputProfile(profiles.profiles, [DEFAULT_GAMEPAD_PROFILE_ID], ['gamepad']);
      if (pads !== null) applyPadProfile(pads);
      return createWebPlatform({
        input,
        audio,
        storage: safeLocalStorage(win),
        visibility: win.document,
        displaySize: () => ({ width: win.innerWidth, height: win.innerHeight }),
        gamepad: hasGamepadApi,
        webgl2: renderer.webGLVersion === 2,
        electron,
      });
    },
    gameConfig: {
      remoteMode: false,
      stage,
      stageSkip: stageSkipFromSearch(search) ?? 'none',
      loadout: loadoutFromSearch(search) ?? 'default',
    },
    scene,
    // Electron's window allows audio without a gesture (`autoplayPolicy`); browsers do not.
    audioUnlock: electron === null ? 'gesture' : 'immediate',
    debugTools: resources.debugTools ?? null,
    // M3-01: the build the replays record, SHARE through the clipboard.
    buildId: resources.buildId ?? 'dev',
    shareReplay: (text) => copyReplayText(win, text),
    /**
     * The Options screen's CONTROLS (plan M1-17): the keyboard profiles a desktop keyboard can
     * drive the menus with, plus a `?profile=` override in use; `apply` switches the key profile
     * (with the `?debounce=` override) unless it is already active — a saved choice (`'save'`)
     * never replaces a `?profile=` override, the player's pick (`'options'`) does.
     */
    inputProfiles: {
      choices: () =>
        inputProfileChoices(
          profiles.profiles,
          'code',
          DEFAULT_KEYBOARD_PROFILE_ID,
          overrideProfile,
        ),
      active: () => input.keyProfile?.id ?? null,
      apply: (id, source) => {
        // A `?profile=` override wins over the saved choice (not over the player's pick).
        if (source === 'save' && overrides.profile !== null) return;
        // Only a profile the Options screen offers: a desktop keyboard can always drive its menus.
        const offered = selectableKeyProfiles(profiles.profiles, 'code');
        if (overrideProfile !== null) offered.push(overrideProfile);
        const chosen = chooseInputProfile(offered, [id], KEY_PROFILE_DEVICES);
        if (chosen !== null && chosen.id !== input.keyProfile?.id) applyKeyProfile(chosen);
      },
      // The player's rebinding, SOCD and debounce (M2-16), on the key and gamepad profiles.
      customize: (next) => {
        settings = next;
        if (baseKeys !== null) applyKeyProfile(baseKeys);
        if (basePads !== null) applyPadProfile(basePads);
      },
      rebindable: () => {
        const list: InputProfile[] = [];
        if (baseKeys !== null) list.push(baseKeys);
        if (basePads !== null) list.push(basePads);
        return list;
      },
    },
  });

  // A shared replay pasted on the page joins the kept replays (M3-01).
  const stopPaste = listenForPastedReplays(win, (text) => shell.replays.importText(text));
  return {
    game: shell.game,
    renderer: shell.renderer,
    audio,
    input,
    profiles,
    shell,
    stop() {
      stopPaste();
      shell.stop();
    },
  };
}
