/**
 * `@shmup/shell` — the shared browser host of `apps/web` and `apps/tizen` (decision D34).
 *
 * One boot path for the browser and the TV: {@link bootShell} validates the inlined content,
 * loads the atlas pages with `new Image()` (no `fetch` on `file://` — D25) behind a progress
 * bar, shows the boot error screen when anything is wrong, creates the renderer, platform and
 * game, and runs the rAF frame loop that ticks the game, drains its events to registered
 * handlers and renders. The apps stay thin adapters (input, audio, platform, Back key).
 *
 * Dependency direction: `apps/* → @shmup/shell → {render-pixi, audio-web, input-web} → core`.
 *
 * @packageDocumentation
 */
export {
  BOOT_STATE_ATTRIBUTE,
  SHELL_SCENES,
  ShellBootError,
  bootShell,
  sceneFromSearch,
  type Shell,
  type ShellAssets,
  type ShellInput,
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
  createEventDispatcher,
  type EventDispatcher,
  type SimEventHandler,
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
  SHOWCASE_SPRITES,
  createShowcase,
  type Showcase,
  type ShowcaseOptions,
} from './showcase/index.js';
