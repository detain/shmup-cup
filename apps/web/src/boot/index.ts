/**
 * # boot — composition root of the browser app
 *
 * **Responsibility.** Wires the packages together for the browser: input
 * (`@shmup/input-web`), audio (`@shmup/audio-web`), renderer (`@shmup/render-pixi`),
 * the web {@link createWebPlatform | platform adapter} and the core game, then drives
 * everything from `requestAnimationFrame`: `game.frame(now)` runs the due fixed ticks,
 * `renderer.render(game.renderFrame())` draws. Until real scenes exist the renderer
 * shows the calibration test pattern with a tick-driven marker.
 *
 * Audio is unlocked on the first key or pointer gesture (autoplay policy — gamepad
 * buttons do not count as a user activation in browsers); the tab being hidden
 * suspends the game, clears held input and suspends audio.
 *
 * **Implements.** shmup_feat.md §23 (web dev target), §3 (rAF-driven fixed step,
 * pause on visibility change, integer scaling), §19 (resume audio on first input).
 *
 * **Public API.** {@link bootWebApp}, {@link WebApp}.
 *
 * @module
 */
import { createWebAudio, type WebAudio } from '@shmup/audio-web';
import { createGame, defineModule, type Game } from '@shmup/core';
import { createWebInput, type GamepadLike, type WebInput } from '@shmup/input-web';
import { createPixiRenderer, type PixiRenderer } from '@shmup/render-pixi';
import { startFrameLoop } from '../frame-loop/index.js';
import { createWebPlatform, type StorageLike } from '../platform/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'boot',
  status: 'partial',
  specRefs: ['shmup_feat.md §23', 'shmup_feat.md §3', 'shmup_feat.md §19'],
});

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
 * Boots the game into a canvas.
 *
 * @remarks
 * Order: input → audio (no context yet) → renderer (async WebGL init) → platform →
 * game → lifecycle hooks → gesture/resize listeners → frame loop. Everything created
 * here is released by {@link WebApp.stop}.
 *
 * @param canvas - Target canvas (fills the window).
 * @param win - The browser window (injectable for tests).
 * @returns A promise of the running app.
 * @throws Rejects when the renderer cannot be created (no WebGL).
 *
 * @example
 * ```ts
 * const app = await bootWebApp(document.getElementById('game') as HTMLCanvasElement);
 * // in the devtools console: app.game.state.tick
 * app.stop();
 * ```
 */
export async function bootWebApp(canvas: HTMLCanvasElement, win: Window = window): Promise<WebApp> {
  const nav = win.navigator;
  const hasGamepadApi = typeof nav.getGamepads === 'function';
  const input = createWebInput({
    keyTarget: win,
    keyDevice: 'keyboard',
    getGamepads: hasGamepadApi ? (): ArrayLike<GamepadLike | null> => nav.getGamepads() : undefined,
  });
  const audio = createWebAudio();
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: win.innerWidth,
    displayHeight: win.innerHeight,
  });
  const platform = createWebPlatform({
    input,
    audio,
    storage: safeLocalStorage(win),
    visibility: win.document,
    displaySize: () => ({ width: win.innerWidth, height: win.innerHeight }),
    gamepad: hasGamepadApi,
    webgl2: renderer.webGLVersion === 2,
  });
  const game = createGame(platform, { remoteMode: false });

  platform.lifecycle.onSuspend(() => {
    input.clear();
    void audio.suspend();
  });
  platform.lifecycle.onResume(() => {
    void audio.resume();
  });

  /** One-shot gesture handler that unlocks audio (autoplay policy). */
  const unlockAudio = (): void => {
    void platform.audio.unlock();
  };
  const gestureOptions: AddEventListenerOptions = { once: true, capture: true };
  win.addEventListener('keydown', unlockAudio, gestureOptions);
  win.addEventListener('pointerdown', unlockAudio, gestureOptions);

  /** Keeps the canvas and the integer viewport in sync with the window size. */
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
    renderer,
    audio,
    input,
    stop() {
      loop.stop();
      win.removeEventListener('resize', onResize);
      win.removeEventListener('keydown', unlockAudio, gestureOptions);
      win.removeEventListener('pointerdown', unlockAudio, gestureOptions);
      input.destroy();
      renderer.destroy();
      void audio.destroy();
    },
  };
}
