/**
 * # boot — the shared browser boot sequence (`bootShell`)
 *
 * **Responsibility.** The one boot path of the web app and the TV app (decision D34). The
 * apps create their input / audio adapters and their `Platform`, import the inlined
 * `virtual:shmup-content` module and `virtual:shmup-assets` (where the atlas manifest is — plan
 * R1-05) and hand everything to {@link bootShell}, which:
 *
 * 1. shows a progress bar on a plain 2D overlay canvas (`error-screen`);
 * 2. validates the content — core kinds plus the owners of foreign kinds (`loader`; the input
 *    profiles by default); any issue stops the boot on the **boot error screen** listing every
 *    `path: message`;
 * 3. fetches the atlas manifest (`assets/atlas/main.json`, plan R1-05) with `XMLHttpRequest` —
 *    `fetch()` fails on `file://` (D25), XHR works there with status 0 — and checks its digest and
 *    format version (`loader` `loadAtlasManifest`; an inlined manifest — `virtual:shmup-assets-inline`
 *    — skips this), loads the atlas pages with `new Image()` from their relative URLs (decoded with
 *    `decode()` where the engine has it, each page timed — {@link Shell.atlasTiming}) and builds
 *    the atlas (`@shmup/render-pixi` `createAtlas`);
 * 4. creates the renderer (WebGL1 first) and, through the app's factory, the platform; **reads
 *    the save** (`core/save` `loadSave`, M1-17) and applies its volumes and input profile; then
 *    creates the core game with the validated content and the save;
 * 5. warms the renderer up behind the loading screen (`renderer.warmUp()`, plan M3-02d: one
 *    throwaway off-screen frame with every GL program and every pooled sprite in it, so nothing
 *    links or grows a batch buffer mid-gameplay), wires the lifecycle (suspend clears held input
 *    and suspends audio; so does the window losing
 *    focus — `blur` clears held input), the audio unlock (first gesture on the web, immediately on
 *    TV) and window resizes, and
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
 * jingles), behind the progress bar; nothing is rendered or decoded during play. Since M2-10 the
 * scene flow's `PrepareStage` events (`connectStagePreparation`: the zone map's launch, the title
 * after a run through the map, a run or practice start on another stage) have the engine prepare
 * another stage's set, plus the title theme, between Worlds; since M2-15 the sound test gets the
 * music library's titles (`GameOptions.soundTest`) and its `SoundTest` events have the engine play
 * that track (`connectSoundTest`). Once the app's
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
 * M2-02 — the renderer's enemy bullet palette and — since M2-08 — its scale mode, shake, flash
 * reduction and hitbox markers live (`connectOptionEvents`); the saved display options are applied
 * before the sprite tables are resolved (`applyDisplayOptions`; explicit
 * {@link ShellOptions.effects} still win over the saved shake / flash settings).
 *
 * **Controls and rebinding (M2-16).** Right after the saved profile, the shell hands the app the
 * save's input settings ({@link ShellInputProfiles.customize}: the rebinding, SOCD and release
 * debounce), and again on every `UserOption` `InputSettings` event. When the app offers
 * {@link ShellInputProfiles.rebindable} / `customize` and the adapter the rebinding capture
 * ({@link ShellInput.capture}, `beginCapture`, `endCapture` — `WebInput`'s), the scene flow gets
 * the rebind screen's host side (`controls` — `createShellControls`: key names, capture, rebinding
 * with conflict detection, reset; every change stored in the save and applied at once).
 *
 * **Render interpolation (M2-08).** The frame loop feeds a refresh-rate probe (`frame-loop`
 * `createRefreshMonitor`, the interquartile mean of the recent rAF deltas); with
 * {@link ShellOptions.interpolation} `'auto'` (the default) the renderer interpolates while the
 * display runs faster than `INTERPOLATION_MIN_HZ` (70 — 120 / 144 Hz monitors) and draws the
 * current tick at 60 Hz. The probe restarts when the app resumes; {@link Shell.refresh} exposes it.
 *
 * **Memory (M2-17).** Once the atlas and the content are ready the shell works out which atlas
 * pages each campaign zone needs (`memory` module) and, in the scene flow, unloads from the GPU the
 * pages the next zone does not need on its `PrepareStage` event ({@link Shell.atlasResidency}).
 * Since R1-05 the atlas is split into a `common` page and one page per zone, and the residency also
 * **uploads** the needed pages there and then (`renderer.uploadTextureSource`) — at boot for the
 * boot stage, behind the loading screen before the warm-up frame, then at every `PrepareStage` and
 * whenever the scene flow shows a new World (`prepareShownWorld`: the attract demo, a replay — W3-9)
 * —, so no page uploads on its first draw mid-play. The canvas carries the resident pages
 * ({@link ATLAS_PAGES_ATTRIBUTE}), the last atlas load time ({@link ATLAS_LOAD_MS_ATTRIBUTE}: the
 * boot's manifest + pages + upload, then each stage change's unload + upload) and the same load
 * per page ({@link ATLAS_PAGE_MS_ATTRIBUTE}: fetch / decode / upload — owner decision W3-6). The
 * debug tools get the save store (the save export / import of `window.__shmupDebug.save`), the
 * residency and the atlas timing (`__shmupDebug.atlas`, with `timing` and `pageMs`).
 * Since R3-04 {@link ShellOptions.atlasPages} `'lazy'` changes where the images come from: no page
 * is fetched at boot, the residency loads the shown stage's pages on demand — fetch, decode,
 * upload, **drop the image** (`createLazyAtlasResidency`, owner decision W5-15) — and while they
 * are in flight the frame loop holds the game: the last displayed frame is redrawn, no tick runs
 * and no input is consumed, so a slow page load cannot move a replay (decision W5-16; the boot's
 * own prepare is awaited, so the first frame draws the boot stage). Since R3-04.M3d the shell
 * also listens for `webglcontextlost` / `webglcontextrestored` on the canvas: a restored context
 * lost every GPU page upload with the old one, so the boot re-fetches and re-uploads every
 * resident page on the restore event.
 *
 * **Replays and rumble (M3-01).** Right after the save the shell creates and loads the replay
 * library (`core/replay` `createReplayLibrary` over `platform.storage` — keys `replay.last`,
 * `replay.1`–`3`; an unreadable or oversize slot is empty) and hands it to the scene flow, which
 * stores every finished run there; {@link Shell.replays} lets an app import a shared replay (the
 * web app's paste). {@link ShellOptions.shareReplay} is the replay browser's SHARE (the web app's
 * clipboard; the TV passes none) and {@link ShellOptions.buildId} the build id the replays record.
 * When the input adapter can rumble ({@link ShellInput.rumble}) the core's `Rumble` events reach it
 * through `connectRumbleEvents` while the save's RUMBLE option (`options.play.rumble`) is on.
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
 *   applied live; the saved replays loaded before the title (M3-01)
 * - shmup_feat.md §4 — rumble via `vibrationActuator` (M3-01)
 *
 * **Public API.** {@link bootShell}, {@link Shell}, {@link ShellOptions}, {@link ShellAssets},
 * {@link ShellInput}, {@link ShellInputProfiles}, {@link ShellScene}, {@link SHELL_SCENES},
 * {@link sceneFromSearch}, {@link ShellBootError}, {@link BootTiming}, {@link AtlasTiming},
 * {@link AtlasPageTiming}, {@link ShellInlineAssets}, {@link ShellManifestAssets},
 * {@link BOOT_STATE_ATTRIBUTE}, {@link SCENE_ATTRIBUTE}, {@link BOOT_MS_ATTRIBUTE},
 * {@link ATLAS_PAGES_ATTRIBUTE}, {@link ATLAS_LOAD_MS_ATTRIBUTE}, {@link ATLAS_PAGE_MS_ATTRIBUTE},
 * {@link atlasTimingText}, {@link DEFAULT_STAGE_ID}, {@link defaultStageId}; M3-02c:
 * {@link webGLVersionFromSearch} (the `?gl=` dev switch). Debug tools: the `debug` module.
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
  type XhrLike,
} from '@shmup/audio-web';
import {
  DEFAULT_GAME_CONFIG,
  FRAME_H,
  FRAME_W,
  MUSIC_CUES,
  createGame,
  createReplayLibrary,
  createSaveStore,
  defineModule,
  loadSave,
  type ContentFile,
  type Game,
  type GameConfig,
  type IAudio,
  type InputContext,
  type ReplayLibrary,
  type InputOptions,
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
  applyDisplayOptions,
  connectAudioEvents,
  connectSoundTest,
  connectStagePreparation,
  connectFxEvents,
  connectOptionEvents,
  connectRumbleEvents,
  createEventDispatcher,
  type EventDispatcher,
} from '../dispatch/index.js';
import type { CaptureKind, InputProfile } from '@shmup/input-web';
import { createShellControls, type ShellCaptureInput } from '../controls/index.js';
import type { DebugTools, DebugToolsFactory } from '../debug/index.js';
import { createBootOverlay, formatIssues, type BootOverlay } from '../error-screen/index.js';
import {
  INTERPOLATION_MIN_HZ,
  VSYNC_LOCK_MAX_HZ,
  VSYNC_LOCK_MIN_HZ,
  createRefreshMonitor,
  startFrameLoop,
  type RefreshMonitor,
} from '../frame-loop/index.js';
import {
  AssetLoadError,
  AtlasManifestError,
  atlasPageUrls,
  loadAtlasManifest,
  loadGameContent,
  loadImageTimed,
  loadImagesTimed,
  type ContentOwners,
  type ImageTiming,
  type LoadableImage,
} from '../loader/index.js';
import { createFlightScene, type FlightScene } from '../flight/index.js';
import { createFxGallery, type FxGallery } from '../fx-gallery/index.js';
import { createSceneView, type SceneView } from '../scene-view/index.js';
import { createShowcase, type Showcase } from '../showcase/index.js';
import {
  atlasPageNeeds,
  connectAtlasResidency,
  createAtlasResidency,
  createLazyAtlasResidency,
  prepareShownWorld,
  stageIndexOfWorld,
  stageSpriteSets,
  type AtlasResidency,
  type AtlasResidencyOptions,
  type LazyAtlasResidency,
} from '../memory/index.js';

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

/**
 * Attribute on the game canvas listing the atlas pages resident on the GPU, as ascending page
 * indices joined by commas (`"0,2"`) — plan R1-05, for the browser tests and the TV's remote
 * inspector. Written at boot and after every stage change that unloaded or uploaded a page.
 */
export const ATLAS_PAGES_ATTRIBUTE = 'data-shmup-atlas-pages';

/**
 * Attribute on the game canvas holding the last atlas load time in whole milliseconds (plan R1-05,
 * owner decision W3-6 — the M7's zone-load figure): after boot, the manifest's fetch plus the pages'
 * load and decode plus the boot stage's uploads ({@link AtlasTiming.totalMs}); after a stage change
 * that unloaded or uploaded a page, that change's time. Measured with `performance.now()`.
 */
export const ATLAS_LOAD_MS_ATTRIBUTE = 'data-shmup-atlas-load-ms';

/**
 * Attribute on the game canvas with the last atlas load **per page** (plan R1-05, owner decision
 * W3-6 — the M7's fetch / decode / upload figures for R3-04), written at the same moments as
 * {@link ATLAS_LOAD_MS_ATTRIBUTE}, in ms to 0.1 ({@link atlasTimingText}):
 *
 * - after boot: `manifest:<ms>;<file>:<load>/<decode>/<upload>;…` — the manifest's fetch, then
 *   every page in page order: its load (the request to `onload`), its `decode()` and its boot
 *   upload (0 for a page the boot stage does not need);
 * - after a stage change that unloaded or uploaded a page: `<file>:0.0/0.0/<upload>;…` for each
 *   page that change uploaded — load and decode are 0, since the policy "all" (W3-2) fetches and
 *   decodes every page at boot, so a stage change only uploads (any re-decode the engine does is
 *   inside the upload) —, empty when the change only unloaded.
 *
 * Built on those transitions only, never per frame.
 */
export const ATLAS_PAGE_MS_ATTRIBUTE = 'data-shmup-atlas-page-ms';

/** How long boot took (see {@link Shell.bootTiming}). All values in milliseconds of `now()`. */
export interface BootTiming {
  /** Clock reading when `bootShell` was called (with `performance.now()`: ms since page start). */
  readonly startMs: number;
  /** Clock reading when the game was ready to run (≈ the launch time on the TV). */
  readonly readyMs: number;
  /** `readyMs − startMs`: the time spent in `bootShell` (content, atlas, renderer, save, audio). */
  readonly bootMs: number;
}

/** One atlas page's load at boot (see {@link AtlasTiming}). */
export interface AtlasPageTiming {
  /** The page's file (`main.png`, …). */
  readonly file: string;
  /** From the request to `onload`, in ms (the fetch, and any decoding before it). */
  readonly loadMs: number;
  /** `HTMLImageElement.decode()` after `onload`, in ms (0 where the engine has none). */
  readonly decodeMs: number;
  /**
   * The GPU upload at boot (`renderer.uploadTextureSource`), in ms — 0 for a page the boot stage
   * does not need (it uploads at the stage change that needs it).
   */
  readonly uploadMs: number;
}

/**
 * How long the atlas took to load at boot (plan R1-05, owner decision W3-6: the M7's decode
 * figures for R3-04's zone-load budget). Measured with the window's high-resolution clock
 * (`performance.now()` — never {@link ShellOptions.now}, so a boot-clock fake stays exact); all
 * zero where the window has none.
 */
export interface AtlasTiming {
  /** Where the manifest came from: `fetched` (`assets/atlas/main.json`) or `inline`. */
  readonly manifest: 'fetched' | 'inline';
  /** The manifest's request, digest check and parse, in ms (0 when inlined). */
  readonly manifestMs: number;
  /** Bytes of the fetched manifest (0 when inlined). */
  readonly manifestBytes: number;
  /** From the first page request until the last page was decoded, in ms (they load in parallel). */
  readonly pagesMs: number;
  /** Every page, in page order. */
  readonly pages: readonly AtlasPageTiming[];
  /**
   * `manifestMs + pagesMs +` every boot upload: the atlas's share of the boot, in ms (the canvas's
   * {@link ATLAS_LOAD_MS_ATTRIBUTE} after boot).
   */
  readonly totalMs: number;
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
  /**
   * Applies the player's input settings (M2-16 — the save's `options.input`: the rebinding, SOCD,
   * the release debounce) to the key and gamepad profiles — `@shmup/input-web`
   * `customizeInputProfile` of the profiles as written; later profile switches keep them. The shell
   * calls it at boot (after the saved profile) and whenever the Options screen changes them.
   * Optional: without it the settings are stored but not applied (and the rebind rows are off).
   *
   * @param settings - The save's `options.input`.
   */
  customize?(settings: InputOptions): void;
  /**
   * The profiles the rebind screen may rebind now, as the content wrote them (M2-16): the key
   * profile in use, then the gamepad profile. Optional: without it (or without
   * {@link ShellInputProfiles.customize} or the adapter's capture) REBIND KEYS / PAD are disabled.
   *
   * @returns The profiles.
   */
  rebindable?(): readonly InputProfile[];
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
 * Reads the `gl` query parameter — the dev switch that A/Bs the WebGL version on device
 * (plan M3-02c, the render review's **F8**).
 *
 * @remarks
 * **WebGL1 stays the shipped default.** The M7 probe found WebGL 1 *and* 2 available on Tizen 5.5 /
 * Chromium 69 with `MAX_TEXTURE_SIZE` 8192 (`docs/dev/input-probe-results.md` §9), so the old
 * "WebGL2 is unverified" reason is gone — but nothing yet says 2 is *faster*, and the project also
 * targets older sets. This switch exists so the owner can measure the difference (review §4, M5)
 * rather than guess it; `PixiRenderer.webGLVersion` (the overlay's WEBGL figure) reports what was
 * actually obtained, which may be 2 even when 1 was asked for.
 *
 * @param search - `location.search` (with or without the leading `?`).
 * @returns `1` or `2` when the parameter names one, else `null` (use the default).
 *
 * @example
 * ```ts
 * webGLVersionFromSearch('?gl=2'); // → 2
 * webGLVersionFromSearch('?scene=flight'); // → null
 * ```
 */
export function webGLVersionFromSearch(search: string): 1 | 2 | null {
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if ((eq < 0 ? pair : pair.slice(0, eq)) !== 'gl') continue;
    const value = eq < 0 ? '' : pair.slice(eq + 1);
    if (value === '1') return 1;
    if (value === '2') return 2;
  }
  return null;
}

/**
 * The stage a game plays when the host names none: zone A, AZURE VERGE (plan M1-18). Since M2-10
 * it is also what makes a game a campaign run: it is the start zone's stage of
 * `content/campaign/main.campaign.json`, so the scene flow plays the zone map from it (a
 * `?stage=` dev stage keeps the single-stage flow).
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

/**
 * An inlined atlas manifest with its relative page URLs: `virtual:shmup-assets-inline` (what
 * `virtual:shmup-assets` was until plan R1-05 — the TV fallback, W3-7) or a test's own.
 */
export interface ShellInlineAssets {
  /** The atlas manifest. */
  readonly manifest: AtlasManifest;
  /** Relative URL of each atlas page, same order as `manifest.pages`. */
  readonly pageUrls: readonly string[];
}

/**
 * Where to fetch the atlas manifest (plan R1-05): `virtual:shmup-assets`, what the apps pass.
 */
export interface ShellManifestAssets {
  /** The manifest's URL, relative to the page (`assets/atlas/main.json`). */
  readonly manifestUrl: string;
  /** The folder of the pages, relative to the page (`assets/atlas`). */
  readonly atlasDir: string;
  /**
   * The digest the build recorded (`vite.shared.ts` `manifestDigest`); a fetched manifest with
   * another digest fails the boot. Omitted: not checked.
   */
  readonly manifestDigest?: string;
}

/**
 * The atlas the shell boots with: where to fetch its manifest (`virtual:shmup-assets` — the apps,
 * since plan R1-05) or the manifest itself, inlined (`virtual:shmup-assets-inline`).
 */
export type ShellAssets = ShellInlineAssets | ShellManifestAssets;

/**
 * Whether the assets carry their manifest inline.
 *
 * @param assets - The assets.
 * @returns `true` for {@link ShellInlineAssets}.
 */
function isInlineAssets(assets: ShellAssets): assets is ShellInlineAssets {
  return (assets as Partial<ShellInlineAssets>).manifest !== undefined;
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
  /**
   * The rebinding capture's state (M2-16 — `WebInput.capture`). Optional: without it (and
   * {@link ShellInput.beginCapture} / {@link ShellInput.endCapture}) the rebind rows are off.
   */
  readonly capture?: ShellCaptureInput['capture'];
  /**
   * Starts a rebinding capture (M2-16 — `WebInput.beginCapture`).
   *
   * @param kind - `'keys'` or `'buttons'`.
   */
  beginCapture?(kind: CaptureKind): void;
  /** Ends a rebinding capture (M2-16 — `WebInput.endCapture`). */
  endCapture?(): void;
  /**
   * Rumbles a player's gamepads (M3-01 — `WebInput.rumble`; the shell calls it for the core's
   * `SimEventKind.Rumble` events while the save's RUMBLE option is on). Optional: an adapter without
   * it never rumbles.
   *
   * @param player - The player slot.
   * @param strength - 1 (a death) or 2 (a boss blast).
   * @returns How many pads rumbled.
   */
  rumble?(player: number, strength: number): number;
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
  /**
   * The atlas: where to fetch its manifest (`virtual:shmup-assets`, plan R1-05) or the manifest
   * and page URLs inlined (`virtual:shmup-assets-inline`).
   */
  readonly assets: ShellAssets;
  /**
   * Request factory for the atlas manifest (default `() => new XMLHttpRequest()` — XHR, since
   * `fetch()` fails on `file://`, D25). Tests pass fakes.
   *
   * @returns A fresh request.
   */
  readonly createRequest?: () => XhrLike;
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
   * plan M1-14). The save's display options are applied at boot (M2-08); `screenShake` /
   * `reduceFlashing` given here win over them (a host override), until the Options screen changes
   * them.
   */
  readonly effects?: Partial<EffectSettings>;
  /**
   * Render interpolation (M2-08): `'auto'` (default) — on while the refresh probe reads more than
   * `INTERPOLATION_MIN_HZ` (a display faster than the 60 Hz tick), off otherwise; `'on'` /
   * `'off'` — always / never (the probe still runs; {@link Shell.refresh}).
   */
  readonly interpolation?: 'auto' | 'on' | 'off';
  /**
   * Frame pacing (M3-02b — `core/loop`'s vsync lock): `'auto'` (default) — the lock is on while
   * the refresh probe reads a fixed ~60 Hz display ({@link VSYNC_LOCK_MIN_HZ} …
   * {@link VSYNC_LOCK_MAX_HZ}), so the M7's rAF jitter stops turning into 0- and 2-tick frames;
   * `'lock'` / `'free'` — always / never (the probe still runs). Presentation only: the simulation
   * is untouched, so replays and goldens do not change.
   */
  readonly framePacing?: 'auto' | 'lock' | 'free';
  /**
   * Atlas page loading (plan R3-04): `'eager'` (the default until M3e) — every page is fetched,
   * decoded and attached at boot ({@link loadImagesTimed}) and the residency only moves GPU
   * copies; `'lazy'` — no page loads at boot: the residency fetches, decodes, attaches and
   * uploads each page when the shown stage needs it and **drops the decoded image** after its
   * upload (`createLazyAtlasResidency`, owner decision W5-15; the memory estimate follows with
   * the `resident` image policy), and the frame loop redraws the last frame while the shown
   * World's pages are in flight — no tick, no input consumed (decision W5-16).
   */
  readonly atlasPages?: 'eager' | 'lazy';
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
  /**
   * The build id the game's replays record (M3-01 — the apps pass `__SHMUP_BUILD__`; default
   * `'dev'`).
   */
  readonly buildId?: string;
  /**
   * Hands a replay's text to the player (M3-01 — the replay browser's SHARE: the web app copies it
   * to the clipboard). Omitted or `null`: no SHARE (the TV).
   *
   * @param text - The replay's text.
   * @returns Whether it was handed over.
   */
  readonly shareReplay?: ((text: string) => boolean) | null;
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
  /** How long the atlas manifest and pages took at boot (plan R1-05 — {@link AtlasTiming}). */
  readonly atlasTiming: AtlasTiming;
  /** The refresh-rate probe the frame loop feeds (M2-08: it switches render interpolation). */
  readonly refresh: RefreshMonitor;
  /**
   * The atlas pages' GPU residency (M2-17 — `memory` module): in the scene flow, pages the next
   * zone does not need are unloaded on its `PrepareStage` event. With `atlasPages: 'lazy'`
   * (plan R3-04.M3c) this is the eager-shaped view of the lazy residency: its `prepare` starts
   * the page load in the background and returns 0, the counters forward live (the frame loop
   * holds the game while the load is in flight).
   */
  readonly atlasResidency: AtlasResidency;
  /** The debug tools (dev / test builds — {@link ShellOptions.debugTools}), else `null`. */
  readonly debug: DebugTools | null;
  /**
   * The saved replays (M3-01 — `core/replay` `ReplayLibrary` over `platform.storage`, loaded before
   * the title): the game stores every finished run as the last game; a host imports a shared one
   * with {@link ReplayLibrary.importText} (the web app's paste).
   */
  readonly replays: ReplayLibrary;
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
 * The window's high-resolution clock, the one the atlas timings use ({@link AtlasTiming}).
 *
 * @param win - The window.
 * @returns `performance.now` of the window, or `undefined` when it has none (test fakes).
 */
function windowClock(win: Window): (() => number) | undefined {
  const perf = (win as Partial<Window>).performance;
  if (perf !== undefined && typeof perf.now === 'function') return () => perf.now();
  return undefined;
}

/**
 * A time for {@link ATLAS_PAGE_MS_ATTRIBUTE}: ms to 0.1.
 *
 * @param ms - Milliseconds.
 * @returns The text (`"12.3"`).
 */
function msText(ms: number): string {
  return ms.toFixed(1);
}

/**
 * One page's entry of {@link ATLAS_PAGE_MS_ATTRIBUTE}: `<file>:<load>/<decode>/<upload>`.
 *
 * @param file - The page's file.
 * @param loadMs - Its load.
 * @param decodeMs - Its decode.
 * @param uploadMs - Its upload.
 * @returns The entry.
 */
function pageMsEntry(file: string, loadMs: number, decodeMs: number, uploadMs: number): string {
  return `${file}:${msText(loadMs)}/${msText(decodeMs)}/${msText(uploadMs)}`;
}

/**
 * The boot's per-page atlas timing as {@link ATLAS_PAGE_MS_ATTRIBUTE} writes it after boot:
 * `manifest:<ms>;<file>:<load>/<decode>/<upload>;…` (ms to 0.1, pages in page order).
 *
 * @remarks
 * Cold: called once, at boot.
 *
 * @param timing - The boot's atlas timing ({@link Shell.atlasTiming}).
 * @returns The text.
 *
 * @example
 * ```ts
 * atlasTimingText(shell.atlasTiming); // → 'manifest:3.1;main.png:41.0/12.5/6.2;main-1.png:…'
 * ```
 */
export function atlasTimingText(timing: AtlasTiming): string {
  let text = `manifest:${msText(timing.manifestMs)}`;
  for (const page of timing.pages) {
    text += `;${pageMsEntry(page.file, page.loadMs, page.decodeMs, page.uploadMs)}`;
  }
  return text;
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
 * The {@link AtlasResidency}-shaped view of a lazy residency (plan R3-04.M3c). The debug tools
 * and the event wiring (`connectAtlasResidency`, `prepareShownWorld`) keep the eager contract: a
 * synchronous `prepare` whose return counts the pages it believed resident that left the GPU. The
 * lazy `prepare` detaches synchronously, loads its pages in the background and reports the whole
 * movement through the same `onChange`, so firing it and counting 0 describes the residency
 * truthfully for the overlay — the counters and {@link AtlasResidency.resident} forward live.
 * `bootShell` builds one per boot, in lazy mode only; the frame loop reads the real residency.
 *
 * @param residency - The lazy residency (plan R3-04.M3b).
 * @returns The eager-shaped view of it.
 */
function asAtlasResidency(residency: LazyAtlasResidency): AtlasResidency {
  return {
    get resident() {
      return residency.resident;
    },
    get unloads() {
      return residency.unloads;
    },
    get uploads() {
      return residency.uploads;
    },
    get lastPrepareMs() {
      return residency.lastPrepareMs;
    },
    imagePolicy: residency.imagePolicy,
    prepare(stageIndex: number): number {
      // A failed load leaves the pages it did fetch attached; the next prepare (the next stage
      // change or new World) retries what is still missing — prepares are idempotent.
      residency.prepare(stageIndex).catch(() => {});
      return 0;
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
 * @throws Rejects with {@link ShellBootError} when content is invalid, the atlas manifest cannot
 *   be fetched or read (`ATLAS MANIFEST FAILED TO LOAD`) or belongs to another build or format
 *   (`ATLAS DOES NOT MATCH ITS MANIFEST`), an atlas page cannot be loaded or does not match the
 *   manifest, WebGL is unavailable, creating the platform
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
  /** Atlas pages load on demand and release their images (plan R3-04; M3e flips the default). */
  const lazyPages = (options.atlasPages ?? 'eager') === 'lazy';
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

  // 3. The atlas: its manifest — fetched with XHR since R1-05 (`virtual:shmup-assets`), or
  // inlined —, then its pages. Timed with the window's clock (W3-6: the M7's decode figures).
  const atlasClock = windowClock(win);
  const assets = options.assets;
  let manifest: AtlasManifest;
  let pageUrls: readonly string[];
  let manifestMs = 0;
  let manifestBytes = 0;
  if (isInlineAssets(assets)) {
    manifest = assets.manifest;
    pageUrls = assets.pageUrls;
  } else {
    const fetchStart = atlasClock === undefined ? 0 : atlasClock();
    try {
      const loaded = await loadAtlasManifest(
        assets.manifestUrl,
        assets.manifestDigest,
        options.createRequest,
      );
      manifest = loaded.manifest;
      manifestBytes = loaded.bytes;
    } catch (error) {
      // Another build's manifest, or a format this shell cannot read, does not match the atlas.
      const mismatch =
        error instanceof AtlasManifestError &&
        (error.failure === 'digest' || error.failure === 'version');
      const title = mismatch
        ? 'ATLAS DOES NOT MATCH ITS MANIFEST'
        : 'ATLAS MANIFEST FAILED TO LOAD';
      throw fail(title, [describe(error)], [], error);
    }
    manifestMs = (atlasClock === undefined ? 0 : atlasClock()) - fetchStart;
    pageUrls = atlasPageUrls(assets.atlasDir, manifest);
  }
  let images: Array<(LoadableImage & AtlasPageImage) | null>;
  let pageTimings: readonly ImageTiming[];
  let pagesMs: number;
  if (lazyPages) {
    // R3-04.M3c: nothing is fetched here — every page starts detached and the lazy residency
    // loads the shown stage's on demand. The boot's `atlasTiming` page rows carry uploads only
    // (fetch / decode of a lazily loaded page show up in the canvas's per-page marks instead).
    images = manifest.pages.map(() => null);
    pageTimings = [];
    pagesMs = 0;
  } else {
    const pagesStart = atlasClock === undefined ? 0 : atlasClock();
    try {
      const loaded = await loadImagesTimed(
        pageUrls,
        createImage,
        (count, total) => {
          overlay?.showProgress(total === 0 ? 1 : count / total, 'LOADING');
        },
        atlasClock,
      );
      images = loaded.images;
      pageTimings = loaded.timings;
    } catch (error) {
      const url = error instanceof AssetLoadError ? error.url : '?';
      throw fail('ATLAS PAGE FAILED TO LOAD', [`${url}: ${describe(error)}`], [], error);
    }
    pagesMs = (atlasClock === undefined ? 0 : atlasClock()) - pagesStart;
  }
  try {
    atlas = createAtlas(manifest, images);
  } catch (error) {
    throw fail('ATLAS DOES NOT MATCH ITS MANIFEST', [describe(error)], [], error);
  }

  // 4. Renderer, platform, game.
  try {
    renderer = await createPixiRenderer({
      canvas,
      displayWidth: win.innerWidth,
      displayHeight: win.innerHeight,
      // The internal frame, passed explicitly from core's constants (R1-02).
      width: FRAME_W,
      height: FRAME_H,
      preferWebGLVersion: options.preferWebGLVersion ?? 1,
      atlas,
      testPattern: scene === 'calibration',
      effects: options.effects,
      // The particles' own RNG, seeded per session from the game's seed (never the sim's streams).
      fxSeed: ((options.gameConfig?.seed ?? DEFAULT_GAME_CONFIG.seed) ^ FX_SEED_SALT) >>> 0,
      // The debug overlay's draw-call and structure-rebuild figures (dev / test builds only).
      countDrawCalls: options.debugTools !== undefined && options.debugTools !== null,
      countStructureRebuilds: options.debugTools !== undefined && options.debugTools !== null,
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
  // The saved replays (M3-01): read before the title too (an unreadable slot is empty).
  const replays = createReplayLibrary(platform.storage);
  await replays.load();
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
      // The player's rebinding, SOCD and debounce (M2-16).
      profiles.customize?.(save.options.input);
      activeProfile = profiles.active();
    }
    // The rebind screen's host side (M2-16), when the app and the adapter support it.
    const capture = input.capture;
    const controls =
      profiles !== null &&
      profiles.customize !== undefined &&
      profiles.rebindable !== undefined &&
      capture !== undefined &&
      input.beginCapture !== undefined &&
      input.endCapture !== undefined
        ? createShellControls({
            save,
            input: {
              capture,
              beginCapture: (kind) => input.beginCapture?.(kind),
              endCapture: () => input.endCapture?.(),
            },
            profiles: {
              rebindable: () => profiles.rebindable?.() ?? [],
              customize: (settings) => profiles.customize?.(settings),
            },
          })
        : null;
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
            // The sound test's MUSIC row (M2-15): the library's titles, in library order.
            soundTest: { music: musicContent.tracks.map((track) => track.title) },
            controls,
            // M3-01: the replays, sharing and the build the replays record.
            replays,
            shareReplay: options.shareReplay ?? null,
            buildId: options.buildId ?? 'dev',
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
  // The saved display options (the bullet palette of M2-02 — before the sprite tables are
  // resolved —, the scale mode, shake, flashing and hitbox markers of M2-08); the host's explicit
  // effect settings win.
  applyDisplayOptions(readyRenderer, save.options.display);
  if (options.effects?.screenShake !== undefined) {
    readyRenderer.effects.settings.screenShake = options.effects.screenShake;
  }
  if (options.effects?.reduceFlashing !== undefined) {
    readyRenderer.effects.settings.reduceFlashing = options.effects.reduceFlashing;
  }
  const interpolationMode = options.interpolation ?? 'auto';
  readyRenderer.setInterpolation(interpolationMode === 'on');
  const pacingMode = options.framePacing ?? 'auto';
  game.setVsyncLock(pacingMode === 'lock');
  const refresh = createRefreshMonitor();
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
  // Atlas-page residency (M2-17): which pages each campaign zone needs (load time). Since R1-05 it
  // uploads the needed pages eagerly (timed per page) and marks the canvas with what is resident
  // and how long the change took, in all and per page (W3-6).
  /** Per page: ms its upload took in the prepare under way (-1: that prepare did not upload it). */
  const prepareUploadMs: number[] = manifest.pages.map(() => -1);
  /** Per page: ms its upload took in the last prepare that moved a page (the boot's, at boot). */
  const lastUploadMs: number[] = manifest.pages.map(() => 0);
  /** The last stage change's per-page text ({@link ATLAS_PAGE_MS_ATTRIBUTE}). */
  let lastPageMs = '';
  const residencyPageNeeds = atlasPageNeeds(
    manifest,
    content.db.sprites.names,
    stageSpriteSets(content.db),
  );
  const residencyOptions: AtlasResidencyOptions = {
    upload: (p) => {
      const uploadStart = atlasClock === undefined ? 0 : atlasClock();
      readyRenderer.uploadTextureSource(readyAtlas.pages[p]);
      prepareUploadMs[p] = (atlasClock === undefined ? 0 : atlasClock()) - uploadStart;
    },
    // Cold: once per prepare that moved a page (every upload is reported by its own prepare).
    onChange: (resident, _unloads, ms) => {
      let pageMs = '';
      for (let p = 0; p < prepareUploadMs.length; p++) {
        const upload = prepareUploadMs[p];
        lastUploadMs[p] = upload < 0 ? 0 : upload;
        if (upload >= 0) {
          const entry = pageMsEntry(manifest.pages[p].file, 0, 0, upload);
          pageMs = pageMs === '' ? entry : `${pageMs};${entry}`;
        }
        prepareUploadMs[p] = -1;
      }
      lastPageMs = pageMs;
      markCanvas(canvas, ATLAS_PAGES_ATTRIBUTE, resident.join(','));
      markCanvas(canvas, ATLAS_LOAD_MS_ATTRIBUTE, String(Math.round(ms)));
      markCanvas(canvas, ATLAS_PAGE_MS_ATTRIBUTE, pageMs);
    },
    now: atlasClock,
  };
  // The residency the frame loop and the boot drive (plan R3-04.M3c): lazy pages load on demand
  // and release their decoded images (`createLazyAtlasResidency`, W5-15); with the eager default
  // nothing changes. `atlasResidency` is what the debug tools and the event wiring see — the
  // eager contract, via {@link asAtlasResidency} in lazy mode; the frame loop's hold reads the
  // lazy residency's `loading` directly.
  const lazyResidency: LazyAtlasResidency | null = lazyPages
    ? createLazyAtlasResidency(readyAtlas.pages, residencyPageNeeds, {
        ...residencyOptions,
        lazy: {
          atlas: readyAtlas,
          loadImage: (page) =>
            loadImageTimed(pageUrls[page], createImage, atlasClock).then((loaded) => loaded.image),
        },
      })
    : null;
  const atlasResidency: AtlasResidency =
    lazyResidency === null
      ? createAtlasResidency(readyAtlas.pages, residencyPageNeeds, residencyOptions)
      : asAtlasResidency(lazyResidency);
  // The boot stage's pages go up now, behind the loading screen and before the warm-up frame draws
  // them (the scene flow and free flight play `game.world`'s stage; the other dev scenes draw from
  // any page, so they keep every page). The lazy boot **awaits** the load — fetch, decode, attach,
  // upload — so the first displayed frame draws the boot stage (decision W5-16); the boot's own
  // page failure then errors like the eager boot's page load does.
  const bootStage = flowMode || flight !== null ? stageIndexOfWorld(content.db, game.world) : -1;
  if (lazyResidency !== null) {
    try {
      await lazyResidency.prepare(bootStage);
    } catch (error) {
      throw fail('ATLAS PAGE FAILED TO LOAD', [describe(error)], [], error);
    }
  } else {
    atlasResidency.prepare(bootStage);
  }
  // WebGL context loss (plan R3-04.M3d). Pixi cancels the loss, rebuilds its GL objects on the
  // restored context, and re-creates a texture lazily on the frame that first binds it — but the
  // residency's resident pages were uploaded through THIS boot's eager `uploadTextureSource`, and
  // a page that no sprite draws for a while would keep a dead GPU copy that long. So on the
  // restore event the shell re-fetches and re-uploads every resident page: a fresh image (the
  // driver reset can outlive the browser's hold on the decoded data), the page's GPU copy dropped
  // (`unload`, which is also how the residency itself retires a page) and uploaded again in the
  // same step. A cold path — a loss is rare, the loop runs the whole way, one page at a time;
  // anything it cannot fetch or upload back-stops to Pixi's own lazy re-creation on the page's
  // next drawn frame. The restore listener is added after the renderer's own, so Pixi has already
  // cleared its texture bookkeeping when this runs.
  const recoverAtlasPages = async (): Promise<void> => {
    for (let p = 0; p < readyAtlas.pages.length; p++) {
      if (!atlasResidency.resident[p]) continue;
      const source = readyAtlas.pages[p];
      try {
        const loaded = await loadImageTimed(pageUrls[p], createImage, atlasClock);
        readyAtlas.loadPage(p, loaded.image);
      } catch (_error) {
        // The old image stands in: it still decodes from its bytes, and the next prepare of a
        // stage needing this page fetches it again anyway.
      }
      source.unload();
      try {
        readyRenderer.uploadTextureSource(source);
      } catch (_error) {
        // Pixi re-creates the texture on the page's next drawn frame (its own self-heal).
      }
    }
  };
  const onContextLost = (event: Event): void => {
    // Cancel the loss so the browser restores the context at all — Pixi's own listener does the
    // same; the two calls are one intention.
    event.preventDefault();
  };
  const onContextRestored = (): void => {
    void recoverAtlasPages();
  };
  const canvasEvents = canvas as Partial<HTMLCanvasElement>;
  const canvasHasEvents = typeof canvasEvents.addEventListener === 'function';
  if (canvasHasEvents) {
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
  }
  // The first prepare always reports, so `lastUploadMs` holds the boot's uploads now.
  let bootUploadMs = 0;
  for (let p = 0; p < lastUploadMs.length; p++) bootUploadMs += lastUploadMs[p];
  const atlasTiming: AtlasTiming = Object.freeze({
    manifest: isInlineAssets(assets) ? 'inline' : 'fetched',
    manifestMs,
    manifestBytes,
    pagesMs,
    pages: Object.freeze(
      manifest.pages.map((page, p) =>
        Object.freeze({
          file: page.file,
          loadMs: pageTimings[p]?.loadMs ?? 0,
          decodeMs: pageTimings[p]?.decodeMs ?? 0,
          uploadMs: lastUploadMs[p],
        }),
      ),
    ),
    totalMs: manifestMs + pagesMs + bootUploadMs,
  });
  markCanvas(canvas, ATLAS_LOAD_MS_ATTRIBUTE, String(Math.round(atlasTiming.totalMs)));
  lastPageMs = atlasTimingText(atlasTiming);
  markCanvas(canvas, ATLAS_PAGE_MS_ATTRIBUTE, lastPageMs);
  // The boot warm-up frame (plan M3-02d, the render review's F4 / F5): with the world bound and
  // the loading screen still up, the renderer draws one throwaway frame off-screen with every GL
  // program and every pooled sprite in it, so no shader links and no batch buffer grows once the
  // game is running. Never presented; the effect state and the tick are untouched.
  readyRenderer.warmUp();
  const calibration = createCalibrationFrame(game.renderFrame());
  const events = createEventDispatcher();
  // The game's events feed the particles, shake, flash, dim and popups (plan M1-14) and the
  // audio engine (M1-15) — in the scene flow and free flight: the other scenes do not show the
  // World.
  if (flowView !== null) {
    connectFxEvents(events, readyRenderer);
    connectAudioEvents(events, engine, flowView.camera);
    // `PrepareStage` (M2-10): the music set follows the stage about to play — the zone map's
    // launch, the title's return to the start stage, a run or practice start on another stage.
    connectStagePreparation(events, engine, game.content.stages, stageMusicCues);
    // Between zones (M2-17): the atlas pages the next stage does not need leave the GPU.
    connectAtlasResidency(events, atlasResidency);
    // The sound test's tracks (M2-15): loaded on demand, played from their start.
    connectSoundTest(events, engine);
    // Gamepad rumble (M3-01): the core's Rumble events while the save's RUMBLE option is on.
    if (input.rumble !== undefined) {
      connectRumbleEvents(
        events,
        (player, strength) => {
          input.rumble?.(player, strength);
        },
        () => save.options.play.rumble,
      );
    }
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
      readyRenderer,
      // SOCD, the release debounce or a rebinding (M2-16): the save holds them already.
      profiles === null || profiles.customize === undefined
        ? null
        : () => profiles.customize?.(save.options.input),
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
    // The rAF clock paused with the page: measure the refresh rate afresh.
    refresh.reset();
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
   * The last frame handed to the renderer; the residency hold redraws it while the lazy pages
   * load (plan R3-04.M3c). Seeded with the calibration frame — a held frame before the first
   * displayed one cannot happen (the boot awaits its prepare), but the loop must never draw `null`.
   */
  let shownFrame: RenderFrame = calibration.update(game.renderFrame());
  /**
   * One displayed frame: input context, fixed ticks, event dispatch, render (with the debug
   * tools' timing and overlay in dev / test builds).
   *
   * @param now - rAF timestamp.
   */
  const onFrame = (now: number): void => {
    const tools = debug;
    if (tools !== null) tools.beginFrame(now);
    // Render interpolation follows the display's refresh rate (M2-08).
    refresh.sample(now);
    if (interpolationMode === 'auto' && refresh.ready) {
      const fast = refresh.hz > INTERPOLATION_MIN_HZ;
      if (fast !== readyRenderer.interpolation) readyRenderer.setInterpolation(fast);
    }
    // Vsync lock (M3-02b): one tick per frame on a fixed ~60 Hz display.
    if (pacingMode === 'auto' && refresh.ready) {
      const fixed = refresh.hz >= VSYNC_LOCK_MIN_HZ && refresh.hz <= VSYNC_LOCK_MAX_HZ;
      if (fixed !== game.vsyncLock) game.setVsyncLock(fixed);
    }
    // The residency hold (plan R3-04.M3c, decision W5-16): while the lazy atlas pages the shown
    // World needs are in flight, redraw the last displayed frame — no tick runs, no input is
    // consumed and no event drains, so a slow page load cannot move a replay by one tick (a held
    // frame that ticks would change every hash after it). `game.frame` is not called at all, so a
    // debug frame-advance asked for during the hold waits in its queue and runs exactly once on
    // the first released frame (the e2e `stepTo` helper of `test/e2e/frame-advance.ts`).
    if (lazyResidency !== null && lazyResidency.loading) {
      if (tools !== null) tools.endTicks(0);
      engine.endFrame();
      if (tools !== null) tools.beforeRender();
      readyRenderer.render(shownFrame);
      if (tools !== null) tools.afterRender();
      return;
    }
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
    const ticks = game.frame(now);
    if (tools !== null) tools.endTicks(ticks);
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
        // Its stage's atlas pages, uploaded before its first frame (R1-05, W3-9 — the attract demo
        // never emits PrepareStage). Cold: once per World; a stage already prepared is a no-op.
        // With the lazy policy (R3-04.M3c) this fires the load and the hold above redraws the
        // last frame until the pages are in.
        prepareShownWorld(atlasResidency, content.db, game, frame.world);
      }
      markScene();
      worldShown = frame.world !== null;
    } else {
      shown = sceneView !== null ? sceneView.update(frame) : calibration.update(frame);
      worldShown = flight !== null;
    }
    shownFrame = shown;
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
      save,
      sceneId: () => (flow === null ? scene : (flow.stack.top?.id ?? '')),
      visibleWorld: () => (worldShown ? game.world : null),
      atlas: atlasResidency,
      atlasTiming,
      atlasPageMs: () => lastPageMs,
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
    atlasTiming,
    refresh,
    atlasResidency,
    replays,
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
      if (canvasHasEvents) {
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
      }
      input.destroy();
      readyRenderer.destroy();
      readyAtlas.destroy();
      engine.destroy();
      void audio.destroy();
    },
  };
}
