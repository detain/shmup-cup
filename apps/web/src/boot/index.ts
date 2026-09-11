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
 * **Implements.** shmup_feat.md §23 (web dev target), §3 (rAF-driven fixed step, pause on
 * visibility change, integer scaling), §19 (resume audio on first input).
 *
 * **Public API.** {@link bootWebApp}, {@link WebApp}, {@link WebAppResources}.
 *
 * @module
 */
import { createWebAudio, type WebAudio } from '@shmup/audio-web';
import { defineModule, type ContentFile, type Game } from '@shmup/core';
import { createWebInput, type GamepadLike, type WebInput } from '@shmup/input-web';
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

/**
 * Boots the game into a canvas.
 *
 * @remarks
 * Creates input and audio (no context yet), then runs `bootShell`, which creates the
 * renderer, then this app's platform (through the factory, once WebGL2 support is known) and
 * the game. Everything is released by {@link WebApp.stop}; on a failed boot the shell has
 * already released it and shows the boot error screen.
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
  const shell = await bootShell({
    canvas,
    win,
    contentFiles: resources.contentFiles,
    assets: resources.assets,
    input,
    audio,
    platform: (renderer) =>
      createWebPlatform({
        input,
        audio,
        storage: safeLocalStorage(win),
        visibility: win.document,
        displaySize: () => ({ width: win.innerWidth, height: win.innerHeight }),
        gamepad: hasGamepadApi,
        webgl2: renderer.webGLVersion === 2,
      }),
    gameConfig: { remoteMode: false },
    scene: sceneFromSearch(searchOf(win)),
    audioUnlock: 'gesture',
  });

  return {
    game: shell.game,
    renderer: shell.renderer,
    audio,
    input,
    shell,
    stop() {
      shell.stop();
    },
  };
}
