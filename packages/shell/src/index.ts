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
 * Pause, Ch+, Ch+, Ch+, the overlay, `window.__shmupDebug`). Since M2-16 it applies the save's
 * input settings through the app ({@link ShellInputProfiles}'s `customize`) and gives the scene
 * flow the rebind screen's host side ({@link createShellControls} — key names, the adapter's
 * capture, rebinding with conflict detection, reset). Since M2-17 it also holds the hosts' one
 * `localStorage` adapter with quota checks ({@link createWebStorage}), the debug save export /
 * import ({@link exportSaveText}, {@link importSaveText}) and the TV memory budget — the estimator
 * ({@link estimateStageMemory}) and the atlas-page residency between zones
 * ({@link createAtlasResidency}). Since M2-18 dev / test builds of the web app can run the
 * cross-engine determinism check instead of the game ({@link installDeterminismCheck} — golden
 * replays played in the page's own engine). The apps stay thin adapters (input, audio, platform,
 * Back key).
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
  webGLVersionFromSearch,
  type BootTiming,
  type Shell,
  type ShellAssets,
  type ShellInput,
  type ShellInputProfiles,
  type ShellOptions,
  type ShellScene,
} from './boot/index.js';
export {
  createShellControls,
  type ShellCaptureInput,
  type ShellControlsOptions,
  type ShellRebindProfiles,
} from './controls/index.js';
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
  applyDisplayOptions,
  connectFxEvents,
  connectOptionEvents,
  connectRumbleEvents,
  connectSoundTest,
  connectStagePreparation,
  createEventDispatcher,
  type DisplayTarget,
  type EventDispatcher,
  type FxTargets,
  type SimEventHandler,
  type SoundTestTarget,
  type StagePreparationTarget,
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
export {
  INTERPOLATION_MIN_HZ,
  VSYNC_LOCK_MIN_HZ,
  VSYNC_LOCK_MAX_HZ,
  REFRESH_SAMPLES,
  createRefreshMonitor,
  startFrameLoop,
  type FrameLoop,
  type FrameScheduler,
  type RefreshMonitor,
} from './frame-loop/index.js';
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
  type DebugSaveApi,
  type DebugToolsOptions,
  type ShmupDebugApi,
} from './debug/index.js';
export {
  DISPOSABLE_STORAGE_KEYS,
  STORAGE_PREFIX,
  STORAGE_QUOTA_BYTES,
  STORAGE_VALUE_MAX_BYTES,
  createWebStorage,
  exportSaveText,
  importSaveText,
  isQuotaExceededError,
  storageBytes,
  type QuotaStorage,
  type SaveImportResult,
  type StorageIssue,
  type StorageIssueKind,
  type StorageUsage,
  type WebStorageLike,
  type WebStorageOptions,
} from './storage/index.js';
export {
  DETERMINISM_GLOBAL,
  DETERMINISM_READY_ATTRIBUTE,
  createDeterminismCheck,
  installDeterminismCheck,
  type DeterminismCheck,
  type DeterminismRun,
  type DeterminismWindowLike,
} from './determinism/index.js';
export {
  AUDIO_BUDGET_BYTES,
  FILE_TRACK_FALLBACK_SECONDS,
  FILTER_TARGETS,
  HEAP_BASELINE_BYTES,
  MEMORY_BUDGET_BYTES,
  MIB,
  TEXTURE_BUDGET_BYTES,
  atlasPageNeeds,
  connectAtlasResidency,
  createAtlasResidency,
  estimateMemory,
  estimateStageMemory,
  pageBytes,
  potBytes,
  sfxBankBytes,
  songFrameBound,
  stageMusicTracks,
  stagePages,
  stageSpriteSets,
  trackBytes,
  type AtlasPageLike,
  type AtlasPageNeeds,
  type AtlasResidency,
  type MemoryEstimate,
  type MemoryInputs,
  type StageMemoryInputs,
  type StageSpriteSets,
} from './memory/index.js';
