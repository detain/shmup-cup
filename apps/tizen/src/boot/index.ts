/**
 * # boot — composition root of the Tizen TV app
 *
 * **Responsibility.** Same wiring as the browser app, tuned for the TV: remote-first
 * input (`keyDevice: 'remote'`, `remoteMode: true` in the game config), the Tizen
 * {@link createTizenPlatform | platform adapter} (key registration, lifecycle, exit), and
 * the rAF → fixed-step → render loop. Audio needs no gesture on TV, so it is unlocked
 * immediately.
 *
 * **Back key.** Until the title scene with its exit-confirmation dialog exists
 * (shmup_feat.md §17/§23), the calibration screen *is* the app's root screen, so Back
 * exits directly — the correct Tizen behaviour for a root screen. Later the scene stack
 * consumes `Action.Back` and this shortcut goes away.
 *
 * **Implements.** shmup_feat.md §23 (Tizen: Back, registerKeyBatch, visibilitychange,
 * exit), §3 (fixed step, pause on hidden), §4 (remote-first).
 *
 * **Public API.** {@link bootTizenApp}, {@link TizenApp}.
 *
 * @module
 */
import { createWebAudio, type WebAudio } from '@shmup/audio-web';
import { createGame, defineModule, type Game, type Platform } from '@shmup/core';
import { createWebInput, type GamepadLike, type WebInput } from '@shmup/input-web';
import { createPixiRenderer, type PixiRenderer } from '@shmup/render-pixi';
import { startFrameLoop } from '../frame-loop/index.js';
import {
  createTizenPlatform,
  getTizenApi,
  watchBackKey,
  type StorageLike,
} from '../platform/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'boot',
  status: 'partial',
  specRefs: ['shmup_feat.md §23', 'shmup_feat.md §3', 'shmup_feat.md §4'],
});

/** Handles to the running TV app. */
export interface TizenApp {
  readonly game: Game;
  readonly platform: Platform;
  readonly renderer: PixiRenderer;
  readonly audio: WebAudio;
  readonly input: WebInput;
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
 * Boots the game on the TV (or in a desktop browser for development).
 *
 * @param canvas - Full-screen canvas.
 * @param win - The window.
 * @returns The running app.
 */
export async function bootTizenApp(
  canvas: HTMLCanvasElement,
  win: Window = window,
): Promise<TizenApp> {
  const nav = win.navigator;
  const hasGamepadApi = typeof nav.getGamepads === 'function';
  const input = createWebInput({
    keyTarget: win,
    keyDevice: 'remote',
    getGamepads: hasGamepadApi ? (): ArrayLike<GamepadLike | null> => nav.getGamepads() : undefined,
  });
  const audio = createWebAudio();
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: win.innerWidth,
    displayHeight: win.innerHeight,
    preferWebGLVersion: 1,
  });
  const platform = createTizenPlatform({
    tizen: getTizenApi(win),
    input,
    audio,
    storage: safeLocalStorage(win),
    visibility: win.document,
    displaySize: () => ({ width: win.innerWidth, height: win.innerHeight }),
    gamepad: hasGamepadApi,
    webgl2: renderer.webGLVersion === 2,
  });
  const game = createGame(platform, { remoteMode: true, autofire: true });

  platform.lifecycle.onSuspend(() => {
    input.clear();
    void audio.suspend();
  });
  platform.lifecycle.onResume(() => {
    void audio.resume();
  });
  void platform.audio.unlock();

  const exit = platform.exit;
  const stopBack = watchBackKey(win, () => {
    if (exit !== null) exit();
  });

  const onResize = (): void => {
    renderer.resize(win.innerWidth, win.innerHeight);
  };
  win.addEventListener('resize', onResize);

  const loop = startFrameLoop(win, (now) => {
    game.frame(now);
    renderer.render(game.renderFrame());
  });

  return {
    game,
    platform,
    renderer,
    audio,
    input,
    stop() {
      loop.stop();
      stopBack();
      win.removeEventListener('resize', onResize);
      input.destroy();
      renderer.destroy();
      void audio.destroy();
    },
  };
}
