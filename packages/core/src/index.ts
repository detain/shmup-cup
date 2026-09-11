/**
 * `@shmup/core` — the platform-agnostic heart of Shmup Cup.
 *
 * Pure TypeScript: no DOM, WebGL, Web Audio, Node or platform (`tizen`, `webapis`,
 * `electron`) APIs — enforced by `tsconfig.json` (ES2018 lib only) and ESLint.
 * Hosts provide a {@link Platform}; presentation packages implement
 * {@link IRenderer} / {@link IAudio}.
 *
 * This entry point exports the implemented public API. Placeholder modules under
 * `src/<module>/` (player, weapons, enemies, …) are exported here as they get
 * implemented.
 *
 * @packageDocumentation
 */

export { defineModule, type ModuleInfo, type ModuleStatus } from './module-info.js';

export {
  RNG_STATE_WORDS,
  createRng,
  createRngStreams,
  type Rng,
  type RngState,
  type RngStreams,
} from './rng/index.js';

export {
  ANGLE_MASK,
  ANGLE_QUARTER,
  ANGLE_UNITS,
  EASINGS,
  angleDelta,
  approach,
  atan2B,
  clamp,
  cosB,
  lerp,
  quantizeAngle,
  sinB,
  turnToward,
  wrapAngle,
  type BinaryAngle,
  type EasingFn,
  type EasingName,
} from './math/index.js';

export { ATAN_TABLE, ATAN_TABLE_STEPS, SIN_TABLE_Q16, TRIG_SCALE } from './math/trig-table.js';

export {
  DEFAULT_EVENT_QUEUE_CAPACITY,
  MUSIC_CUES,
  MUSIC_CUE_NAMES,
  SFX_CUES,
  SFX_CUE_NAMES,
  SIM_EVENT_KIND_NAMES,
  SimEventKind,
  createEventQueue,
  type EventQueue,
  type MusicCue,
  type SfxCue,
  type SimEvent,
} from './events/index.js';

export {
  createPool,
  createSoaPool,
  type Pool,
  type SoaArray,
  type SoaArrayFor,
  type SoaFieldType,
  type SoaFields,
  type SoaPool,
  type SoaSchema,
} from './pools/index.js';

export {
  Action,
  ACTION_NAMES,
  MAX_PLAYERS,
  commitPlayerInput,
  copyInputSnapshot,
  createInputSnapshot,
  hasAction,
  resetInputSnapshot,
  type ActionMask,
  type ActionName,
  type InputDeviceKind,
  type InputSnapshot,
  type PlayerInput,
} from './input/index.js';

export {
  createHeadlessPlatform,
  createMemoryStorage,
  type HeadlessPlatform,
  type Platform,
  type PlatformAudio,
  type PlatformCaps,
  type PlatformDisplay,
  type PlatformId,
  type PlatformInput,
  type PlatformLifecycle,
  type PlatformStorage,
} from './platform/index.js';

export {
  DEFAULT_GAME_CONFIG,
  resolveGameConfig,
  type DeathPenaltyPreset,
  type DifficultyPreset,
  type GameConfig,
  type PowerUpMode,
} from './config/index.js';

export {
  DEFAULT_SNAP_TOLERANCE_MS,
  createFixedStepLoop,
  type FixedStepLoop,
  type FixedStepLoopOptions,
} from './loop/index.js';

export type { AudioBus, AudioState, IAudio, IRenderer, RenderFrame } from './presentation/index.js';

export { createGame, type Game, type GameState } from './game/index.js';
