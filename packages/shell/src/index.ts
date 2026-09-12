/**
 * `@shmup/shell` — the shared browser host of `apps/web` and `apps/tizen` (decision D34).
 *
 * One boot path for the browser and the TV: {@link bootShell} validates the inlined content,
 * loads the atlas pages with `new Image()` (no `fetch` on `file://` — D25) behind a progress
 * bar, shows the boot error screen when anything is wrong, creates the renderer, platform and
 * game — running the core's scene flow (title, game, pause …) drawn through `scene-view` — and
 * runs the rAF frame loop that ticks the game, drains its events to registered handlers and
 * renders. It also reads the save before the title (volumes, input profile, hi-scores — M1-17).
 * Dev / test builds add the debug tools (M1-19, {@link debugToolsFactory}: F1–F8 or the TV's
 * Pause, Ch+, Ch+, Ch+, the overlay, `window.__shmupDebug`). The apps stay thin adapters (input,
 * audio, platform, Back key).
 *
 * Dependency direction: `apps/* → @shmup/shell → {render-pixi, audio-web, input-web} → core`.
 *
 * @packageDocumentation
 */
export {
  BOOT_STATE_ATTRIBUTE,
  SCENE_ATTRIBUTE,
  BOOT_MS_ATTRIBUTE,
  DEFAULT_STAGE_ID,
  SHELL_SCENES,
  ShellBootError,
  bootShell,
  defaultStageId,
  sceneFromSearch,
  type BootTiming,
  type Shell,
  type ShellAssets,
  type ShellInput,
  type ShellInputProfiles,
  type ShellOptions,
  type ShellScene,
} from './boot/index.js';
export {
  AssetLoadError,
  DEFAULT_CONTENT_OWNERS,
  loadGameContent,
  loadImages,
  type ContentOwner,
  type ContentOwners,
  type ImageFactory,
  type LoadGameContentOptions,
  type LoadableImage,
} from './loader/index.js';
export {
  applyAudioOptions,
  connectFxEvents,
  connectOptionEvents,
  createEventDispatcher,
  type EventDispatcher,
  type FxTargets,
  type SimEventHandler,
  type VolumeTarget,
} from './dispatch/index.js';
export {
  BOOT_SCREEN_COLORS,
  createBootOverlay,
  drawErrorScreen,
  drawProgress,
  formatIssues,
  type BootOverlay,
  type Canvas2DLike,
} from './error-screen/index.js';
export { startFrameLoop, type FrameLoop, type FrameScheduler } from './frame-loop/index.js';
export {
  FLIGHT_SPRITES,
  createFlightScene,
  type FlightScene,
  type FlightSceneOptions,
} from './flight/index.js';
export {
  FX_GALLERY_EXTRAS,
  FX_GALLERY_SPRITES,
  FX_GALLERY_STATION_TICKS,
  createFxGallery,
  type FxGallery,
  type FxGalleryOptions,
} from './fx-gallery/index.js';
export { SCENE_VIEW_SPRITES, createSceneView, type SceneView } from './scene-view/index.js';
export {
  SHOWCASE_SPRITES,
  createShowcase,
  type Showcase,
  type ShowcaseOptions,
} from './showcase/index.js';
export {
  DEBUG_GLOBAL,
  DEBUG_KEYS,
  DEBUG_UNLOCK_SEQUENCE,
  DEBUG_UNLOCK_WINDOW_MS,
  createDebugTools,
  debugToolsFactory,
  type DebugKey,
  type DebugTools,
  type DebugToolsFactory,
  type DebugToolsHost,
  type DebugToolsOptions,
  type ShmupDebugApi,
} from './debug/index.js';
