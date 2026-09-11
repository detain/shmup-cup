/**
 * # boot — the shared browser boot sequence (`bootShell`)
 *
 * **Responsibility.** The one boot path of the web app and the TV app (decision D34). The
 * apps create their input / audio adapters and their `Platform`, import the inlined
 * `virtual:shmup-content` and `virtual:shmup-assets` modules and hand everything to
 * {@link bootShell}, which:
 *
 * 1. shows a progress bar on a plain 2D overlay canvas (`error-screen`);
 * 2. validates the content — core kinds plus the owners of foreign kinds (`loader`; the input
 *    profiles by default); any issue stops the boot on the **boot error screen** listing every
 *    `path: message`;
 * 3. loads the atlas pages with `new Image()` from their relative URLs (no `fetch` — D25) and
 *    builds the atlas (`@shmup/render-pixi` `createAtlas`);
 * 4. creates the renderer (WebGL1 first) and, through the app's factory, the platform, then
 *    the core game with the validated content;
 * 5. wires the lifecycle (suspend clears held input and suspends audio), the audio unlock
 *    (first gesture on the web, immediately on TV), window resizes, and
 * 6. runs the rAF frame loop: `game.frame(now)` → `game.events.drain(dispatch)` →
 *    `renderer.render(frame)` (plan §3.3), with the sprite showcase (default) or the
 *    calibration pattern (`?scene=calibration`) as the scene until the World arrives (M1-06).
 *    Before the ticks of each frame it forwards a change of `game.inputContext` to the input
 *    adapter (`input.setContext` — the `game` / `menu` binding tables of decision D15).
 *
 * The canvas carries `data-shmup-state="loading" | "running" | "error"` so tests and the TV's
 * remote inspector can tell where boot stands.
 *
 * **Implements.**
 * - shmup_feat.md §23 — one platform layer for web, Tizen and Electron hosts
 * - shmup_feat.md §22 — rendering pipeline, event dispatch, content validated at load
 * - shmup_feat.md §3 — rAF-driven fixed step, pause on visibility change, integer scaling
 * - shmup_feat.md §19 — audio unlocked by the first user gesture on the web
 *
 * **Public API.** {@link bootShell}, {@link Shell}, {@link ShellOptions}, {@link ShellAssets},
 * {@link ShellInput}, {@link ShellScene}, {@link SHELL_SCENES}, {@link sceneFromSearch},
 * {@link ShellBootError}, {@link BOOT_STATE_ATTRIBUTE}.
 *
 * @module
 */
import {
  createGame,
  defineModule,
  type ContentFile,
  type Game,
  type GameConfig,
  type IAudio,
  type InputContext,
  type LoadContentResult,
  type Platform,
  type PlatformInput,
  type ValidationIssue,
} from '@shmup/core';
import {
  createAtlas,
  createPixiRenderer,
  type Atlas,
  type AtlasManifest,
  type AtlasPageImage,
  type PixiRenderer,
} from '@shmup/render-pixi';
import { createEventDispatcher, type EventDispatcher } from '../dispatch/index.js';
import { createBootOverlay, formatIssues, type BootOverlay } from '../error-screen/index.js';
import { startFrameLoop } from '../frame-loop/index.js';
import {
  AssetLoadError,
  loadGameContent,
  loadImages,
  type ContentOwners,
  type LoadableImage,
} from '../loader/index.js';
import { createShowcase, type Showcase } from '../showcase/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'boot',
  status: 'implemented',
  specRefs: ['shmup_feat.md §23', 'shmup_feat.md §22', 'shmup_feat.md §3', 'shmup_feat.md §19'],
});

/** Attribute on the game canvas that reports the boot state. */
export const BOOT_STATE_ATTRIBUTE = 'data-shmup-state';

/** Dev scenes the shell can show until real scenes exist. */
export type ShellScene = 'showcase' | 'calibration';

/** Every {@link ShellScene}, default first. */
export const SHELL_SCENES: readonly ShellScene[] = Object.freeze(['showcase', 'calibration']);

/**
 * Reads the `scene` query parameter (`?scene=calibration`).
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns The scene; unknown or missing values give `'showcase'`.
 *
 * @example
 * ```ts
 * sceneFromSearch('?scene=calibration'); // → 'calibration'
 * sceneFromSearch(''); // → 'showcase'
 * ```
 */
export function sceneFromSearch(search: string): ShellScene {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== 'scene') continue;
    const value = eq < 0 ? '' : pair.slice(eq + 1);
    for (const scene of SHELL_SCENES) if (scene === value) return scene;
  }
  return 'showcase';
}

/** The inlined `virtual:shmup-assets` module (manifest + relative page URLs). */
export interface ShellAssets {
  /** The atlas manifest. */
  readonly manifest: AtlasManifest;
  /** Relative URL of each atlas page, same order as `manifest.pages`. */
  readonly pageUrls: readonly string[];
}

/** The input adapter the shell drives (`@shmup/input-web`'s `WebInput` satisfies it). */
export interface ShellInput extends PlatformInput {
  /** Clears all held input (the app was hidden — its key-ups will never arrive). */
  clear(): void;
  /**
   * Switches the binding tables to the context the top scene wants (decision D15). The shell
   * calls it once at boot and whenever `game.inputContext` changes.
   *
   * @param context - `'game'` or `'menu'`.
   */
  setContext(context: InputContext): void;
  /** Removes the adapter's event listeners. */
  destroy(): void;
}

/** Options of {@link bootShell}. */
export interface ShellOptions {
  /** The full-window game canvas (WebGL). */
  readonly canvas: HTMLCanvasElement;
  /** The window: size, resize / gesture listeners and `requestAnimationFrame`. */
  readonly win: Window;
  /** Content files (`virtual:shmup-content`). */
  readonly contentFiles: readonly ContentFile[];
  /** Atlas manifest and page URLs (`virtual:shmup-assets`). */
  readonly assets: ShellAssets;
  /** Input adapter (also the platform's input). The shell destroys it on `stop()`. */
  readonly input: ShellInput;
  /** Audio back-end (also behind the platform's audio). The shell destroys it on `stop()`. */
  readonly audio: IAudio;
  /**
   * Creates the host platform once the renderer exists (capabilities such as WebGL2 are
   * only known then).
   *
   * @param renderer - The ready renderer.
   * @returns The platform the game runs on.
   */
  readonly platform: (renderer: PixiRenderer) => Platform;
  /** Game config overrides (`remoteMode`, `autofire`, …). */
  readonly gameConfig?: Partial<GameConfig>;
  /** Scene to show (default `'showcase'`). */
  readonly scene?: ShellScene;
  /**
   * When to unlock audio: `'gesture'` (default — first key or pointer press, the browser
   * autoplay policy) or `'immediate'` (TV: no gesture needed).
   */
  readonly audioUnlock?: 'gesture' | 'immediate';
  /** WebGL version to try first (default 1). */
  readonly preferWebGLVersion?: 1 | 2;
  /**
   * Validators for foreign content kinds (plan §3.5), merged over the shell's
   * `DEFAULT_CONTENT_OWNERS` — e.g. an input-profile registry's `load`, so the app keeps the
   * parsed profiles (M1-05).
   */
  readonly contentOwners?: ContentOwners;
  /**
   * Image factory for the atlas pages (default `() => new Image()`).
   *
   * @returns A fresh, unloaded image.
   */
  readonly createImage?: () => LoadableImage & AtlasPageImage;
  /**
   * Boot overlay for the progress bar and error screen. Defaults to a 2D canvas inserted
   * after the game canvas; `null` disables it.
   */
  readonly overlay?: BootOverlay | null;
}

/** A running shell. */
export interface Shell {
  /** The game session. */
  readonly game: Game;
  /** The platform the game runs on. */
  readonly platform: Platform;
  /** The renderer. */
  readonly renderer: PixiRenderer;
  /** The sprite atlas. */
  readonly atlas: Atlas;
  /** Event dispatcher — register presentation handlers with `events.on(kind, handler)`. */
  readonly events: EventDispatcher;
  /** Validated content (the database, no issues, and the foreign files). */
  readonly content: LoadContentResult;
  /** The scene being shown. */
  readonly scene: ShellScene;
  /** The showcase scene when `scene === 'showcase'`, else `null`. */
  readonly showcase: Showcase | null;
  /** Stops the frame loop and releases listeners, input, renderer, atlas and audio. */
  stop(): void;
}

/** Boot failed; the boot error screen shows {@link ShellBootError.lines}. */
export class ShellBootError extends Error {
  /** Lines shown under the title on the error screen. */
  readonly lines: readonly string[];
  /** Content issues (empty when something else failed). */
  readonly issues: readonly ValidationIssue[];
  /** The underlying error, when there is one. */
  readonly reason: unknown;

  /**
   * @param title - Error screen title (also the message).
   * @param lines - Detail lines.
   * @param issues - Content issues, if any.
   * @param reason - Underlying error.
   */
  constructor(
    title: string,
    lines: readonly string[],
    issues: readonly ValidationIssue[] = [],
    reason?: unknown,
  ) {
    super(lines.length > 0 ? `${title}\n${lines.join('\n')}` : title);
    this.name = 'ShellBootError';
    this.lines = lines;
    this.issues = issues;
    this.reason = reason;
  }
}

/**
 * Writes the boot state onto the canvas (skipped for canvases without `setAttribute`, e.g.
 * test fakes).
 *
 * @param canvas - The game canvas.
 * @param state - `loading`, `running` or `error`.
 */
function markState(canvas: HTMLCanvasElement, state: 'loading' | 'running' | 'error'): void {
  if (typeof (canvas as Partial<HTMLCanvasElement>).setAttribute === 'function') {
    canvas.setAttribute(BOOT_STATE_ATTRIBUTE, state);
  }
}

/**
 * Message of an unknown thrown value.
 *
 * @param error - Anything thrown.
 * @returns A one-line description.
 */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Boots the game into a canvas (see the module docs for the sequence).
 *
 * @remarks
 * On failure the boot error screen stays up, the canvas is marked `error`, everything created
 * so far (input and audio included) is released, and the promise rejects with a
 * {@link ShellBootError}. Nothing is created per frame: the frame loop forwards a changed
 * `game.inputContext` to `input.setContext`, calls `game.frame`, drains the event queue through
 * the dispatcher's bound visitor and renders the reused frame.
 *
 * The renderer's sprite name table depends on the scene: the showcase hands over its own
 * `SHOWCASE_SPRITES` table (`showcase` module) and pre-binds its world (so the first frame creates no Pixi
 * objects); the calibration scene uses `content.db.sprites.names`. Audio unlock listeners
 * are registered in the capture phase and removed after the first gesture; `stop()` is
 * idempotent.
 *
 * @param options - Canvas, window, content, assets, adapters and the platform factory.
 * @returns A promise of the running {@link Shell}.
 * @throws Rejects with {@link ShellBootError} when content is invalid, an atlas page cannot
 *   be loaded or does not match the manifest, WebGL is unavailable, or creating the platform
 *   or game fails.
 *
 * @example
 * ```ts
 * import contentFiles from 'virtual:shmup-content';
 * import assets from 'virtual:shmup-assets';
 *
 * const input = createWebInput({ keyTarget: window });
 * const audio = createWebAudio();
 * const shell = await bootShell({
 *   canvas, win: window, contentFiles, assets, input, audio,
 *   platform: (renderer) => createWebPlatform({ input, audio, webgl2: renderer.webGLVersion === 2, ... }),
 *   scene: sceneFromSearch(location.search),
 * });
 * ```
 */
export async function bootShell(options: ShellOptions): Promise<Shell> {
  const { canvas, win, input, audio } = options;
  const scene = options.scene ?? 'showcase';
  const overlay = options.overlay !== undefined ? options.overlay : createBootOverlay(canvas);
  const createImage = options.createImage ?? ((): HTMLImageElement => new Image());
  markState(canvas, 'loading');
  overlay?.showProgress(0, 'LOADING');

  let atlas: Atlas | null = null;
  let renderer: PixiRenderer | null = null;

  /**
   * Shows the error screen, releases what boot created and builds the rejection.
   *
   * @param title - Error screen title.
   * @param lines - Detail lines.
   * @param issues - Content issues.
   * @param reason - Underlying error.
   * @returns The error to throw.
   */
  const fail = (
    title: string,
    lines: readonly string[],
    issues: readonly ValidationIssue[] = [],
    reason?: unknown,
  ): ShellBootError => {
    overlay?.showError(title, lines);
    markState(canvas, 'error');
    input.destroy();
    renderer?.destroy();
    atlas?.destroy();
    void audio.destroy();
    return new ShellBootError(title, lines, issues, reason);
  };

  // 1–2. Content.
  let content: LoadContentResult;
  try {
    content = loadGameContent(options.contentFiles, { owners: options.contentOwners });
  } catch (error) {
    throw fail('CONTENT COULD NOT BE READ', [describe(error)], [], error);
  }
  if (content.issues.length > 0) {
    const count = content.issues.length;
    throw fail(
      `CONTENT ERRORS: ${count} PROBLEM${count === 1 ? '' : 'S'}`,
      formatIssues(content.issues),
      content.issues,
    );
  }

  // 3. Atlas pages.
  let images: Array<LoadableImage & AtlasPageImage>;
  try {
    images = await loadImages(options.assets.pageUrls, createImage, (loaded, total) => {
      overlay?.showProgress(total === 0 ? 1 : loaded / total, 'LOADING');
    });
  } catch (error) {
    const url = error instanceof AssetLoadError ? error.url : '?';
    throw fail('ATLAS PAGE FAILED TO LOAD', [`${url}: ${describe(error)}`], [], error);
  }
  try {
    atlas = createAtlas(options.assets.manifest, images);
  } catch (error) {
    throw fail('ATLAS DOES NOT MATCH ITS MANIFEST', [describe(error)], [], error);
  }

  // 4. Renderer, platform, game.
  try {
    renderer = await createPixiRenderer({
      canvas,
      displayWidth: win.innerWidth,
      displayHeight: win.innerHeight,
      preferWebGLVersion: options.preferWebGLVersion ?? 1,
      atlas,
      testPattern: scene === 'calibration',
    });
  } catch (error) {
    throw fail('WEBGL IS NOT AVAILABLE', [describe(error)], [], error);
  }
  let platform: Platform;
  let game: Game;
  try {
    platform = options.platform(renderer);
    game = createGame(platform, options.gameConfig ?? {}, content.db);
  } catch (error) {
    throw fail('SHMUP CUP FAILED TO START', [describe(error)], [], error);
  }
  const readyAtlas = atlas;
  const readyRenderer = renderer;

  const showcase = scene === 'showcase' ? createShowcase() : null;
  if (showcase !== null) {
    readyRenderer.setSpriteNames(showcase.spriteNames);
    readyRenderer.bindWorld(showcase.world);
  } else {
    readyRenderer.setSpriteNames(content.db.sprites.names);
  }
  const events = createEventDispatcher();

  // 5. Lifecycle, audio unlock, resize.
  platform.lifecycle.onSuspend(() => {
    input.clear();
    void audio.suspend();
  });
  platform.lifecycle.onResume(() => {
    void audio.resume();
  });

  const gestureOptions: AddEventListenerOptions = { capture: true };
  const unlockOnGesture = (options.audioUnlock ?? 'gesture') === 'gesture';
  /** Removes both gesture listeners (the first gesture of either kind is enough). */
  const removeGestureListeners = (): void => {
    win.removeEventListener('keydown', unlockAudio, gestureOptions);
    win.removeEventListener('pointerdown', unlockAudio, gestureOptions);
  };
  /** Gesture handler that unlocks audio once (autoplay policy). */
  const unlockAudio = (): void => {
    if (unlockOnGesture) removeGestureListeners();
    void platform.audio.unlock();
  };
  if (unlockOnGesture) {
    win.addEventListener('keydown', unlockAudio, gestureOptions);
    win.addEventListener('pointerdown', unlockAudio, gestureOptions);
  } else {
    unlockAudio();
  }

  /** Keeps the canvas and the integer viewport in sync with the window size. */
  const onResize = (): void => {
    readyRenderer.resize(win.innerWidth, win.innerHeight);
  };
  win.addEventListener('resize', onResize);

  // 6. Frame loop (plan §3.3) — allocation-free.
  const visit = events.visit;
  let inputContext: InputContext = game.inputContext;
  input.setContext(inputContext);
  /**
   * One displayed frame: input context, fixed ticks, event dispatch, render.
   *
   * @param now - rAF timestamp.
   */
  const onFrame = (now: number): void => {
    const context = game.inputContext;
    if (context !== inputContext) {
      inputContext = context;
      input.setContext(context);
    }
    game.frame(now);
    game.events.drain(visit);
    const frame = game.renderFrame();
    readyRenderer.render(showcase === null ? frame : showcase.update(frame));
  };
  const loop = startFrameLoop(win, onFrame);

  overlay?.remove();
  markState(canvas, 'running');

  let stopped = false;
  return {
    game,
    platform,
    renderer: readyRenderer,
    atlas: readyAtlas,
    events,
    content,
    scene,
    showcase,
    stop() {
      if (stopped) return;
      stopped = true;
      loop.stop();
      win.removeEventListener('resize', onResize);
      if (unlockOnGesture) removeGestureListeners();
      input.destroy();
      readyRenderer.destroy();
      readyAtlas.destroy();
      void audio.destroy();
    },
  };
}
