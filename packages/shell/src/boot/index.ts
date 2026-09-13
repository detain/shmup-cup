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
 * 4. creates the renderer (WebGL1 first) and, through the app's factory, the platform; **reads
 *    the save** (`core/save` `loadSave`, M1-17) and applies its volumes and input profile; then
 *    creates the core game with the validated content and the save;
 * 5. wires the lifecycle (suspend clears held input and suspends audio; so does the window losing
 *    focus — `blur` clears held input), the audio unlock (first gesture on the web, immediately on
 *    TV), window resizes, and
 * 6. runs the rAF frame loop: `game.frame(now)` → `game.events.drain(dispatch)` →
 *    `renderer.render(frame)` (plan §3.3). Before the ticks of each frame it forwards a change of
 *    `game.inputContext` to the input adapter (`input.setContext` — the `game` / `menu` binding
 *    tables of decision D15) and of `game.inputSeats` (`input.setSeats` — player 2's seat during
 *    a co-op game, M2-06).
 *
 * **Scenes.** By default the game runs the core's **scene flow** (M1-16, `?scene=game`): boot →
 * title → game ⇄ pause → stage clear / game over, the HUD and the canvas menus, drawn through the
 * `scene-view` module (a starfield behind the title and in open space). The shell finishes the
 * boot scene once loading is done, and marks the canvas with the top scene's id
 * (`data-shmup-scene`). Dev scenes run bare gameplay instead: **free flight** (`?scene=flight` —
 * the World from the first frame, `flight` module), the sprite **showcase** (`?scene=showcase`),
 * the **calibration** pattern (`?scene=calibration`, the World is not drawn) or the **fx gallery**
 * (`?scene=fx-gallery`, M1-14).
 *
 * **Audio (M1-15).** The shell owns the `sfx` and `music` content kinds too: it validates
 * `content/audio/` with `@shmup/audio-web`'s loaders and creates the game's audio engine
 * (`createAudioEngine`). During boot — the loading phase — the engine renders the SFX bank and
 * prepares the running stage's music set (`stageMusicCues`: the theme and boss cues the stage
 * names, the cue of each of its `music` events, stage clear and game over; nothing in open
 * space; the scene flow adds the title theme, and in open space the stage-clear and game-over
 * jingles), behind the progress bar; nothing is rendered or decoded later. Once the app's
 * `audio.unlock()` has created the context (first gesture on the web, at boot on TV) the engine
 * attaches to the web-audio buses; in the scene flow and free flight the `Sfx`, `Music` and
 * `MusicDuck` events (the World's, and in the flow the menus' sounds and the scenes' music) play
 * through it (`connectAudioEvents`, sounds panned from their x relative to the camera on screen),
 * and the frame loop closes the per-tick SFX dedupe window after each drain.
 *
 * **Game feel (M1-14).** The shell owns the `fx` content kind: it validates `content/fx/` with
 * `@shmup/render-pixi`'s `loadFxContent`, hands the presets to the renderer
 * (`renderer.setFxContent`) and, in free flight, connects the World's `Particles`, `Sfx`,
 * `Shake`, `Flash`, `Dim` and score events to the renderer's particles, screen effects and score
 * popups (`connectFxEvents`) — in the scene flow and free flight. The particles' presentation RNG
 * is seeded from the game's seed.
 *
 * **Saves and options (M1-17).** After the platform exists the shell reads the save from
 * `platform.storage` (a corrupt one falls back to defaults — never a boot error), sets the bus
 * volumes from its audio options (`applyAudioOptions`) and, when it names an input profile, asks
 * the app to apply it (`ShellOptions.inputProfiles`). The scene flow gets the save store (the
 * title's HI, the Options screen, hi-score tables — the flow writes it on changes) and the profile
 * choices; the Options screen's `UserOption` events set bus volumes, switch profiles and — since
 * M2-02 — the renderer's enemy bullet palette live (`connectOptionEvents`); the saved palette is
 * applied before the sprite tables are resolved (`renderer.setBulletPalette`).
 *
 * **Boot time.** The shell measures its boot (`ShellOptions.now`, default `performance.now()` —
 * whose origin is the page's start, i.e. the app launch on the TV) and exposes it as
 * {@link Shell.bootTiming} for the debug overlay (M1-19) and on the canvas
 * (`data-shmup-boot-ms`, the launch-to-ready time in whole ms).
 *
 * The canvas carries `data-shmup-state="loading" | "running" | "error"` so tests and the TV's
 * remote inspector can tell where boot stands.
 *
 * **Debug tools (M1-19).** In dev / test builds the apps pass a {@link ShellOptions.debugTools}
 * factory (`debug` module): the renderer then counts its draw calls, and once boot is done the
 * tools bind their keys (F1–F8 on the web, the Pause, Ch+, Ch+, Ch+ sequence first on the TV),
 * publish `window.__shmupDebug` and hook into the frame loop — timing the frame, its ticks and the
 * render, and rebuilding the debug overlay (panel, frame graph, hitbox / grid outlines) before each
 * render. Release builds pass `null`, so none of it is in their bundle.
 *
 * **Implements.**
 * - shmup_feat.md §23 — one platform layer for web, Tizen and Electron hosts
 * - shmup_feat.md §22 — rendering pipeline, event dispatch, content validated at load
 * - shmup_feat.md §3 — rAF-driven fixed step, pause on visibility change, integer scaling
 * - shmup_feat.md §19 — audio unlocked by the first user gesture on the web; SFX and music fed by
 *   sim events, prepared during loading
 * - shmup_feat.md §21 — saved options and hi-scores loaded before the title; the Options screen
 *   applied live
 *
 * **Public API.** {@link bootShell}, {@link Shell}, {@link ShellOptions}, {@link ShellAssets},
 * {@link ShellInput}, {@link ShellInputProfiles}, {@link ShellScene}, {@link SHELL_SCENES},
 * {@link sceneFromSearch}, {@link ShellBootError}, {@link BootTiming},
 * {@link BOOT_STATE_ATTRIBUTE}, {@link SCENE_ATTRIBUTE}, {@link BOOT_MS_ATTRIBUTE},
 * {@link DEFAULT_STAGE_ID}, {@link defaultStageId}. Debug tools: the `debug` module.
 *
 * @module
 */
import {
  MUSIC_CONTENT_KIND,
  SFX_CONTENT_KIND,
  EMPTY_MUSIC_CONTENT,
  EMPTY_SFX_CONTENT,
  createAudioEngine,
  loadMusicContent,
  loadSfxContent,
  stageMusicCues,
  type AudioEngine,
  type AudioGraphLike,
  type AudioLoader,
  type MusicContent,
  type SfxContent,
} from '@shmup/audio-web';
import {
  DEFAULT_GAME_CONFIG,
  MUSIC_CUES,
  createGame,
  createSaveStore,
  defineModule,
  loadSave,
  type ContentFile,
  type Game,
  type GameConfig,
  type IAudio,
  type InputContext,
  type InputProfileChoice,
  type LoadedSave,
  type SaveStore,
  type LoadContentResult,
  type DrawList,
  type Platform,
  type PlatformInput,
  type RenderFrame,
  type ScreenView,
  type ValidationIssue,
} from '@shmup/core';
import {
  EMPTY_FX_CONTENT,
  FX_CONTENT_KIND,
  createAtlas,
  createPixiRenderer,
  loadFxContent,
  type Atlas,
  type AtlasManifest,
  type AtlasPageImage,
  type EffectSettings,
  type FxContent,
  type PixiRenderer,
} from '@shmup/render-pixi';
import {
  applyAudioOptions,
  connectAudioEvents,
  connectFxEvents,
  connectOptionEvents,
  createEventDispatcher,
  type EventDispatcher,
} from '../dispatch/index.js';
import type { DebugTools, DebugToolsFactory } from '../debug/index.js';
import { createBootOverlay, formatIssues, type BootOverlay } from '../error-screen/index.js';
import { startFrameLoop } from '../frame-loop/index.js';
import {
  AssetLoadError,
  loadGameContent,
  loadImages,
  type ContentOwners,
  type LoadableImage,
} from '../loader/index.js';
import { createFlightScene, type FlightScene } from '../flight/index.js';
import { createFxGallery, type FxGallery } from '../fx-gallery/index.js';
import { createSceneView, type SceneView } from '../scene-view/index.js';
import { createShowcase, type Showcase } from '../showcase/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'boot',
  status: 'implemented',
  specRefs: [
    'shmup_feat.md §23',
    'shmup_feat.md §22',
    'shmup_feat.md §3',
    'shmup_feat.md §19',
    'shmup_feat.md §21',
  ],
});

/** Mixed into the game's seed for the particles' presentation RNG (a stream of its own). */
const FX_SEED_SALT = 0x2545f491;

/** Attribute on the game canvas that reports the boot state. */
export const BOOT_STATE_ATTRIBUTE = 'data-shmup-state';

/**
 * Attribute on the game canvas naming what is shown: the scene flow's top scene id (`boot`,
 * `title`, `game`, `pause`, …) or the dev scene (`flight`, `showcase`, …). For tests and the TV's
 * remote inspector.
 */
export const SCENE_ATTRIBUTE = 'data-shmup-scene';

/**
 * Attribute on the game canvas holding the launch-to-ready time in whole milliseconds
 * ({@link BootTiming.readyMs}) once the game runs — for tests and the TV's remote inspector
 * (shmup_feat.md §23: launch ≤ 10 s).
 */
export const BOOT_MS_ATTRIBUTE = 'data-shmup-boot-ms';

/** How long boot took (see {@link Shell.bootTiming}). All values in milliseconds of `now()`. */
export interface BootTiming {
  /** Clock reading when `bootShell` was called (with `performance.now()`: ms since page start). */
  readonly startMs: number;
  /** Clock reading when the game was ready to run (≈ the launch time on the TV). */
  readonly readyMs: number;
  /** `readyMs − startMs`: the time spent in `bootShell` (content, atlas, renderer, save, audio). */
  readonly bootMs: number;
}

/**
 * The keyboard / remote input profiles an app lets the player choose in the Options screen
 * (plan M1-17). The app owns the profiles (its `input-profiles` registry) and the input adapter;
 * the shell only asks.
 */
export interface ShellInputProfiles {
  /**
   * The profiles the Options screen's CONTROLS offers, in order. Called once, after the content
   * was validated (the registry is filled then).
   *
   * @returns The choices (empty: CONTROLS is disabled).
   */
  choices(): readonly InputProfileChoice[];
  /**
   * The id of the key profile in use now.
   *
   * @returns The id, or `null` for the adapter's built-in bindings.
   */
  active(): string | null;
  /**
   * Switches the key profile (and whatever goes with it — the TV registers the profile's keys).
   *
   * @remarks
   * Called with `'save'` at most once during boot, before the game exists (a throw there fails the
   * boot like any other start error), then with `'options'` from the frame loop's event drain each
   * time CONTROLS changes. An app should ignore an id it does not offer, so a hand-edited save
   * cannot select a profile that cannot drive the menus.
   *
   * @param id - A profile id (unknown ids are ignored by the app).
   * @param source - `'save'`: the saved choice, applied at boot (an app may keep a dev override
   *   instead); `'options'`: the player picked it in the Options screen.
   */
  apply(id: string, source: 'save' | 'options'): void;
}

/**
 * What the shell shows: `game` — the real game, the core's scene flow (title, game, pause …,
 * M1-16) — or a dev scene running bare gameplay: `flight` (the game's World from the first frame —
 * free flight), `showcase` (the M1-04 sprite showcase), `calibration` (the test pattern) and
 * `fx-gallery` (every particle preset, shake, flash, the dim and the score popups in turn —
 * M1-14).
 */
export type ShellScene = 'game' | 'flight' | 'showcase' | 'calibration' | 'fx-gallery';

/** Every {@link ShellScene}, default first. */
export const SHELL_SCENES: readonly ShellScene[] = Object.freeze([
  'game',
  'flight',
  'showcase',
  'calibration',
  'fx-gallery',
]);

/**
 * Reads the `scene` query parameter (`?scene=calibration`).
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns The scene; unknown or missing values give `'game'` (the scene flow).
 *
 * @example
 * ```ts
 * sceneFromSearch('?scene=calibration'); // → 'calibration'
 * sceneFromSearch(''); // → 'game'
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
  return 'game';
}

/**
 * The stage a game plays when the host names none: zone A, AZURE VERGE (plan M1-18 — the M1
 * vertical slice is one zone; the zone map of M2-10 picks stages later).
 */
export const DEFAULT_STAGE_ID = 'zone-a';

/**
 * The stage an app's game should play by default: {@link DEFAULT_STAGE_ID} when the content has a
 * stage file with that id (before validation — the shell validates the content itself).
 *
 * @param files - The content files (`virtual:shmup-content`).
 * @returns `'zone-a'`, or `null` (open space) when the content has no such stage.
 *
 * @example
 * ```ts
 * bootShell({ …, gameConfig: { stage: defaultStageId(contentFiles) } });
 * ```
 */
export function defaultStageId(files: readonly ContentFile[]): string | null {
  for (const file of files) {
    const data = file.data as { kind?: unknown; id?: unknown } | null;
    if (data !== null && typeof data === 'object' && data.kind === 'stage') {
      if (data.id === DEFAULT_STAGE_ID) return DEFAULT_STAGE_ID;
    }
  }
  return null;
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
  /**
   * Sets how many player seats the adapter routes (M2-06, two-player co-op — `WebInput.setSeats`):
   * the shell calls it once at boot and whenever `game.inputSeats` changes. Optional: an adapter
   * without it routes every device to player 1.
   *
   * @param count - 2 during a co-op game, else 1.
   */
  setSeats?(count: number): void;
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
  /**
   * Audio back-end (also behind the platform's audio). The shell destroys it on `stop()`. When
   * it also exposes the Web Audio graph (`context` and `bus()` — `@shmup/audio-web`'s `WebAudio`
   * does), the shell's audio engine plays the game's SFX and music through it; a plain `IAudio`
   * leaves the game silent.
   */
  readonly audio: IAudio & Partial<AudioGraphLike>;
  /**
   * Renders / decodes the audio content (default: `@shmup/audio-web`'s `createAudioLoader()` —
   * 22,050 Hz synth, XHR + 32 kHz decode for files). Tests inject a fake.
   */
  readonly audioLoader?: AudioLoader;
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
  /**
   * The input profiles the Options screen offers, and how to apply one (the saved choice at boot,
   * the player's pick later). Omitted: CONTROLS is disabled and a saved profile is not applied.
   */
  readonly inputProfiles?: ShellInputProfiles;
  /**
   * The clock boot is timed with (default `win.performance.now()`, else `Date.now()`).
   *
   * @returns Milliseconds.
   */
  readonly now?: () => number;
  /** Scene to show (default `'game'` — the scene flow). */
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
   * parsed profiles (M1-05). The shell owns `fx` itself (it keeps the particle presets for the
   * renderer); an `fx` owner given here replaces it, and the particles then have no presets.
   */
  readonly contentOwners?: ContentOwners;
  /**
   * Effect settings to change from the renderer's defaults (screen shake on, normal flashing —
   * plan M1-14; the Options screen sets them later).
   */
  readonly effects?: Partial<EffectSettings>;
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
  /**
   * The debug tools (plan M1-19) — dev / test builds only: the apps pass
   * `debugToolsFactory(…)` when `__SHMUP_DEV__` is true and `null` otherwise, so a release bundle
   * leaves the tools out. With a factory the renderer counts its draw calls and the tools are
   * created once boot is done (see the `debug` module). Default `null`.
   */
  readonly debugTools?: DebugToolsFactory | null;
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
  /**
   * The scene flow's view when `scene === 'game'` (backdrop, open-space starfield, followed
   * camera — `scene-view` module), else `null`. The flow itself is `game.scenes`.
   */
  readonly sceneView: SceneView | null;
  /** The free-flight scene when `scene === 'flight'`, else `null`. */
  readonly flight: FlightScene | null;
  /** The showcase scene when `scene === 'showcase'`, else `null`. */
  readonly showcase: Showcase | null;
  /** The fx gallery when `scene === 'fx-gallery'`, else `null`. */
  readonly fxGallery: FxGallery | null;
  /** The particle presets and triggers of `content/fx/` handed to the renderer. */
  readonly fx: FxContent;
  /**
   * The game's audio engine: SFX bank and the running stage's music set, attached to the audio
   * back-end once it is unlocked (M1-15).
   */
  readonly audioEngine: AudioEngine;
  /**
   * The save as it was read at boot (document, status — `'empty'`, `'ok'`, `'migrated'`,
   * `'corrupt'`, `'unreadable'` — and the stored text).
   */
  readonly loadedSave: LoadedSave;
  /** The save the game plays with (the scene flow's `game.scenes.save` in the default scene). */
  readonly save: SaveStore;
  /** How long boot took (for the debug overlay, M1-19). */
  readonly bootTiming: BootTiming;
  /** The debug tools (dev / test builds — {@link ShellOptions.debugTools}), else `null`. */
  readonly debug: DebugTools | null;
  /**
   * Stops the frame loop and releases listeners, input, renderer, atlas, the audio engine and the
   * audio back-end (idempotent).
   */
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
   * Creates the error; its message is the title followed by the detail lines.
   *
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
 * Writes an attribute onto the canvas (skipped for canvases without `setAttribute`, e.g. test
 * fakes).
 *
 * @param canvas - The game canvas.
 * @param name - Attribute name.
 * @param value - Its value.
 */
function markCanvas(canvas: HTMLCanvasElement, name: string, value: string): void {
  if (typeof (canvas as Partial<HTMLCanvasElement>).setAttribute === 'function') {
    canvas.setAttribute(name, value);
  }
}

/**
 * Writes the boot state onto the canvas.
 *
 * @param canvas - The game canvas.
 * @param state - `loading`, `running` or `error`.
 */
function markState(canvas: HTMLCanvasElement, state: 'loading' | 'running' | 'error'): void {
  markCanvas(canvas, BOOT_STATE_ATTRIBUTE, state);
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
 * The default boot clock: `performance.now()` of the window (ms since the page started), else
 * `Date.now()` (test fakes without `performance`).
 *
 * @param win - The window.
 * @returns The clock.
 */
function defaultClock(win: Window): () => number {
  const perf = (win as Partial<Window>).performance;
  if (perf !== undefined && typeof perf.now === 'function') return () => perf.now();
  return () => Date.now();
}

/** The calibration scene's frame: the game frame without its world (test pattern only). */
interface CalibrationFrame {
  /**
   * Copies the game frame's tick, alpha and draw lists into the reused calibration frame.
   *
   * @param source - The game's frame.
   * @returns The calibration frame (`world` always `null`; reused).
   */
  update(source: RenderFrame): RenderFrame;
}

/**
 * Creates the calibration scene's frame wrapper. Never allocates per frame.
 *
 * @param first - The game's frame (`game.renderFrame()`, the same object every frame).
 * @returns The wrapper.
 */
function createCalibrationFrame(first: RenderFrame): CalibrationFrame {
  const frame: {
    tick: number;
    alpha: number;
    readonly world: null;
    hud: DrawList;
    ui: DrawList;
    screen: ScreenView;
  } = { tick: 0, alpha: 0, world: null, hud: first.hud, ui: first.ui, screen: first.screen };
  return {
    update(source) {
      frame.tick = source.tick;
      frame.alpha = source.alpha;
      frame.hud = source.hud;
      frame.ui = source.ui;
      frame.screen = source.screen;
      return frame;
    },
  };
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
 * The renderer's sprite name table depends on the scene: the scene flow (`game`, the default)
 * hands over the content's names plus the starfield's (`scene-view` module) and pre-binds the
 * title's backdrop — a game start's World is bound on its first frame, and the particles and
 * popups are cleared then; free flight hands over the content's names plus its own starfield /
 * HUD sprites (`flight` module), the showcase its own `SHOWCASE_SPRITES` table (`showcase`
 * module); both pre-bind their world view (so the first frame creates no Pixi objects). In the
 * scene flow the frame loop also copies the camera on screen into the view after the ticks
 * (`sceneView.follow()`, before the drain, so sounds pan against it) and writes the top scene's
 * id into the canvas's `data-shmup-scene` when it changes (dev scenes write their name once).
 * The calibration scene uses `content.db.sprites.names` and a
 * frame without a world (only the test pattern, HUD and UI lists); the fx gallery its own
 * starfield table (`FX_GALLERY_SPRITES`) and pre-bound view. Audio unlock listeners are
 * registered in the capture phase and removed after the first gesture; `stop()` is idempotent.
 *
 * Game feel (M1-14): the `fx` files are validated by the shell's own owner (unless
 * `contentOwners` replaces it — the particles then get no presets) and handed to the renderer
 * with `setFxContent` before the scene is created; the renderer's particles are seeded with the
 * game's seed xor a fixed salt; only the scene flow and free flight connect the game's events to
 * the renderer (`connectFxEvents`) — the showcase, calibration and gallery scenes do not draw the
 * World.
 *
 * Audio (M1-15): the `sfx` / `music` files are validated by the shell's own owners (an app owner
 * of the same kind replaces one and leaves the engine without that content); after the game is
 * created, the engine renders the SFX bank (`LOADING SOUND`) and prepares the booted stage's music
 * set (`LOADING MUSIC`; open space prepares none; the scene flow adds the title theme, and the
 * stage-clear and game-over jingles in open space) — then the scene flow leaves its boot scene
 * (`game.scenes.finishBoot()`). Only an `audio` that also exposes `context` and `bus()` is
 * attached — right after `platform.audio.unlock()` returns and again when it resolves; a plain
 * `IAudio` (or a context without buffer playback) leaves the game silent. Only the scene flow and
 * free flight connect the game's events to the engine (`connectAudioEvents`, panned against the
 * camera on screen); every scene's frame loop calls `engine.endFrame()` after the drain, and
 * `stop()` destroys the engine before the audio back-end.
 *
 * Saves (M1-17): once the platform exists, `loadSave(platform.storage)` runs (it never rejects);
 * the audio options set the bus volumes, a saved input profile is handed to
 * `options.inputProfiles.apply(id, 'save')`, and the game gets the save store and the profile
 * choices (the scene flow only). In the scene flow the `UserOption` events go to
 * `connectOptionEvents`. A `blur` listener clears held input; `stop()` removes it. Boot is timed
 * with `options.now` ({@link Shell.bootTiming}, the canvas's `data-shmup-boot-ms`).
 *
 * @param options - Canvas, window, content, assets, adapters and the platform factory.
 * @returns A promise of the running {@link Shell}.
 * @throws Rejects with {@link ShellBootError} when content is invalid, an atlas page cannot
 *   be loaded or does not match the manifest, WebGL is unavailable, creating the platform
 *   or game fails (including an `options.inputProfiles` callback throwing at boot — `SHMUP CUP
 *   FAILED TO START`), or a recorded sound or track cannot be loaded (`AUDIO FAILED TO LOAD`). A
 *   corrupt, unreadable or unreachable save never rejects: the game starts with the defaults.
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
 *   platform: (renderer) =>
 *     createWebPlatform({ input, audio, webgl2: renderer.webGLVersion === 2, ... }),
 *   scene: sceneFromSearch(location.search), // 'game' (the scene flow) unless ?scene= says so
 * });
 * ```
 */
export async function bootShell(options: ShellOptions): Promise<Shell> {
  const { canvas, win, input, audio } = options;
  const now = options.now ?? defaultClock(win);
  const startMs = now();
  const scene = options.scene ?? 'game';
  const flowMode = scene === 'game';
  const overlay = options.overlay !== undefined ? options.overlay : createBootOverlay(canvas);
  const createImage = options.createImage ?? ((): HTMLImageElement => new Image());
  markState(canvas, 'loading');
  overlay?.showProgress(0, 'LOADING');

  let atlas: Atlas | null = null;
  let renderer: PixiRenderer | null = null;
  let audioEngine: AudioEngine | null = null;

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
    audioEngine?.destroy();
    void audio.destroy();
    return new ShellBootError(title, lines, issues, reason);
  };

  // 1–2. Content. The shell keeps the particle presets (`fx`) and the audio content (`sfx`,
  // `music`) it validates.
  let fx: FxContent = EMPTY_FX_CONTENT;
  let sfxContent: SfxContent = EMPTY_SFX_CONTENT;
  let musicContent: MusicContent = EMPTY_MUSIC_CONTENT;
  const owners: ContentOwners = {
    [FX_CONTENT_KIND]: (files) => {
      const result = loadFxContent(files);
      fx = result.content;
      return result.issues;
    },
    [SFX_CONTENT_KIND]: (files) => {
      const result = loadSfxContent(files);
      sfxContent = result.content;
      return result.issues;
    },
    [MUSIC_CONTENT_KIND]: (files) => {
      const result = loadMusicContent(files);
      musicContent = result.content;
      return result.issues;
    },
    ...options.contentOwners,
  };
  let content: LoadContentResult;
  try {
    content = loadGameContent(options.contentFiles, { owners });
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
      effects: options.effects,
      // The particles' own RNG, seeded per session from the game's seed (never the sim's streams).
      fxSeed: ((options.gameConfig?.seed ?? DEFAULT_GAME_CONFIG.seed) ^ FX_SEED_SALT) >>> 0,
      // The debug overlay's draw-call figure (dev / test builds only).
      countDrawCalls: options.debugTools !== undefined && options.debugTools !== null,
    });
  } catch (error) {
    throw fail('WEBGL IS NOT AVAILABLE', [describe(error)], [], error);
  }
  let platform: Platform;
  try {
    platform = options.platform(renderer);
  } catch (error) {
    throw fail('SHMUP CUP FAILED TO START', [describe(error)], [], error);
  }
  // The save (plan M1-17): read before the title; a bad one falls back to defaults (never fails).
  const loadedSave = await loadSave(platform.storage);
  const save = createSaveStore(platform.storage, loadedSave);
  applyAudioOptions(audio, save.options.audio);
  const profiles = options.inputProfiles ?? null;
  let profileChoices: readonly InputProfileChoice[] = [];
  let game: Game;
  try {
    let activeProfile: string | null = null;
    if (profiles !== null) {
      profileChoices = profiles.choices();
      const savedProfile = save.options.input.profileId;
      if (savedProfile !== null) profiles.apply(savedProfile, 'save');
      activeProfile = profiles.active();
    }
    game = createGame(
      platform,
      options.gameConfig ?? {},
      content.db,
      // The real game runs the scene flow from its boot scene; dev scenes run bare gameplay.
      flowMode
        ? {
            scenes: 'boot',
            save,
            inputProfiles: { choices: profileChoices, active: activeProfile },
          }
        : {},
    );
  } catch (error) {
    throw fail('SHMUP CUP FAILED TO START', [describe(error)], [], error);
  }
  const readyAtlas = atlas;
  const readyRenderer = renderer;

  // Audio (plan M1-15): the loading phase renders the SFX bank and the stage's music set.
  const engine = createAudioEngine({
    sfx: sfxContent,
    music: musicContent,
    loader: options.audioLoader,
  });
  audioEngine = engine;
  // Every cue the stage's own data can make the sim ask for (its theme, boss and `music`
  // events), since a cue whose track is not prepared now stays silent.
  const stage = game.world.stage === null ? null : game.world.stage.stage;
  const musicCues: number[] = stage === null ? [] : stageMusicCues(stage);
  if (flowMode) {
    // The title theme, and the jingles the flow plays after a game in open space.
    musicCues.unshift(MUSIC_CUES.Title);
    if (stage === null) musicCues.push(MUSIC_CUES.StageClear, MUSIC_CUES.GameOver);
  }
  try {
    await engine.loadSfx((fraction) => overlay?.showProgress(fraction, 'LOADING SOUND'));
    await engine.prepareMusic(stage === null ? null : stage.id, musicCues, (fraction) =>
      overlay?.showProgress(fraction, 'LOADING MUSIC'),
    );
  } catch (error) {
    throw fail('AUDIO FAILED TO LOAD', [describe(error)], [], error);
  }
  // Loading is over: the scene flow shows its title on the first tick.
  game.scenes?.finishBoot();

  readyRenderer.setFxContent(fx);
  // The saved enemy bullet palette (plan M2-02), before the sprite tables are resolved.
  readyRenderer.setBulletPalette(save.options.display.bulletPalette);
  const flowView = flowMode ? createSceneView(game) : null;
  const flight = scene === 'flight' ? createFlightScene(game) : null;
  const showcase = scene === 'showcase' ? createShowcase() : null;
  const fxGallery = scene === 'fx-gallery' ? createFxGallery(readyRenderer) : null;
  const sceneView = flight ?? showcase ?? fxGallery;
  if (flowView !== null) {
    readyRenderer.setSpriteNames(flowView.spriteNames);
    readyRenderer.bindWorld(flowView.backdrop);
  } else if (sceneView !== null) {
    readyRenderer.setSpriteNames(sceneView.spriteNames);
    readyRenderer.bindWorld(sceneView.world);
  } else {
    readyRenderer.setSpriteNames(content.db.sprites.names);
  }
  const calibration = createCalibrationFrame(game.renderFrame());
  const events = createEventDispatcher();
  // The game's events feed the particles, shake, flash, dim and popups (plan M1-14) and the
  // audio engine (M1-15) — in the scene flow and free flight: the other scenes do not show the
  // World.
  if (flowView !== null) {
    connectFxEvents(events, readyRenderer);
    connectAudioEvents(events, engine, flowView.camera);
    // The Options screen's changes, live (plan M1-17). The profile event carries an index into
    // the same `profileChoices` the flow was given; out-of-range indices are ignored.
    connectOptionEvents(
      events,
      audio,
      profiles === null
        ? null
        : (index) => {
            const choice = index >= 0 ? profileChoices[index] : undefined;
            if (choice !== undefined) profiles.apply(choice.id, 'options');
          },
      (palette) => readyRenderer.setBulletPalette(palette),
    );
  } else if (flight !== null) {
    connectFxEvents(events, readyRenderer);
    connectAudioEvents(events, engine, game.world.view.camera);
  }

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
  const graph: AudioGraphLike | null =
    typeof audio.bus === 'function' && audio.context !== undefined
      ? (audio as IAudio & AudioGraphLike)
      : null;
  /** Attaches the audio engine to the Web Audio graph once the context exists (idempotent). */
  const attachAudio = (): void => {
    if (graph !== null) engine.attach(graph);
  };
  /** Gesture handler that unlocks audio once (autoplay policy). */
  const unlockAudio = (): void => {
    if (unlockOnGesture) removeGestureListeners();
    const unlocked = platform.audio.unlock();
    // `unlock()` creates the context synchronously; attach now and again once it runs.
    attachAudio();
    void unlocked.then(attachAudio, attachAudio);
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
  /** The window lost focus: its key-ups will never arrive, so nothing stays held. */
  const onBlur = (): void => {
    input.clear();
  };
  win.addEventListener('blur', onBlur);

  // 6. Frame loop (plan §3.3) — allocation-free.
  const visit = events.visit;
  let inputContext: InputContext = game.inputContext;
  input.setContext(inputContext);
  // Player seats (M2-06): 2 while a co-op game is on top.
  let inputSeats = game.inputSeats;
  input.setSeats?.(inputSeats);
  const flow = game.scenes;
  let shownScene = '';
  let shownWorlds = 0;
  /** Marks the canvas with what is shown (the scene flow's top scene or the dev scene). */
  const markScene = (): void => {
    const top = flow === null ? scene : (flow.stack.top?.id ?? '');
    if (top !== shownScene) {
      shownScene = top;
      markCanvas(canvas, SCENE_ATTRIBUTE, top);
    }
  };
  /** The debug tools (dev / test builds), created once boot is done. */
  let debug: DebugTools | null = null;
  /** Whether the last frame showed the World (the scene flow's game, free flight). */
  let worldShown = false;
  /**
   * One displayed frame: input context, fixed ticks, event dispatch, render (with the debug
   * tools' timing and overlay in dev / test builds).
   *
   * @param now - rAF timestamp.
   */
  const onFrame = (now: number): void => {
    const tools = debug;
    if (tools !== null) tools.beginFrame(now);
    const context = game.inputContext;
    if (context !== inputContext) {
      inputContext = context;
      input.setContext(context);
    }
    const seats = game.inputSeats;
    if (seats !== inputSeats) {
      inputSeats = seats;
      input.setSeats?.(seats);
    }
    game.frame(now);
    if (tools !== null) tools.endTicks();
    if (flowView !== null) flowView.follow();
    game.events.drain(visit);
    engine.endFrame();
    const frame = game.renderFrame();
    let shown: RenderFrame;
    if (flowView !== null) {
      shown = flowView.update(frame);
      if (flowView.worldChanges !== shownWorlds) {
        // A new game: the last one's explosions and popups do not belong to it.
        shownWorlds = flowView.worldChanges;
        readyRenderer.particles?.clear();
        readyRenderer.popups?.clear();
      }
      markScene();
      worldShown = frame.world !== null;
    } else {
      shown = sceneView !== null ? sceneView.update(frame) : calibration.update(frame);
      worldShown = flight !== null;
    }
    if (tools !== null) tools.beforeRender();
    readyRenderer.render(shown);
    if (tools !== null) tools.afterRender();
  };
  const loop = startFrameLoop(win, onFrame);

  overlay?.remove();
  const readyMs = now();
  const bootTiming: BootTiming = Object.freeze({ startMs, readyMs, bootMs: readyMs - startMs });
  markCanvas(canvas, BOOT_MS_ATTRIBUTE, String(Math.round(readyMs)));
  markState(canvas, 'running');
  markScene();
  // Dev / test builds: the debug tools (the first frame runs after this — rAF is asynchronous).
  if (options.debugTools !== undefined && options.debugTools !== null) {
    debug = options.debugTools({
      game,
      renderer: readyRenderer,
      win,
      now,
      bootMs: readyMs,
      sceneId: () => (flow === null ? scene : (flow.stack.top?.id ?? '')),
      visibleWorld: () => (worldShown ? game.world : null),
    });
  }

  let stopped = false;
  return {
    game,
    platform,
    renderer: readyRenderer,
    atlas: readyAtlas,
    events,
    content,
    scene,
    sceneView: flowView,
    flight,
    showcase,
    fxGallery,
    fx,
    audioEngine: engine,
    loadedSave,
    save,
    bootTiming,
    get debug() {
      return debug;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      loop.stop();
      debug?.destroy();
      win.removeEventListener('resize', onResize);
      win.removeEventListener('blur', onBlur);
      if (unlockOnGesture) removeGestureListeners();
      input.destroy();
      readyRenderer.destroy();
      readyAtlas.destroy();
      engine.destroy();
      void audio.destroy();
    },
  };
}
