/**
 * `@shmup/input-web` — browser input adapter for the core.
 *
 * Keyboard and Samsung TV remote key events (`code` first, legacy `keyCode` fallback
 * for remote keys like Back 10009) plus the W3C Gamepad API, merged into the core's
 * per-tick `InputSnapshot` of action bitmasks. The core never sees key codes.
 *
 * The remote mapping and its quirks are data (decisions D13–D15): input profiles from
 * `content/input/` (`rebind`) give every device separate `game` / `menu` binding tables, a
 * release debounce, a diagonal and an SOCD policy (`remote`).
 *
 * @packageDocumentation
 */
export { createWebInput, type WebInput, type WebInputOptions } from './web-input/index.js';
export {
  MAX_TRACKED_KEYS,
  createKeyboardSource,
  type KeyboardSource,
  type KeyEventLike,
} from './keyboard/index.js';
export {
  DEFAULT_GAMEPAD_BUTTONS,
  STICK_DEADZONE,
  STICK_HYSTERESIS,
  readGamepadActions,
  type GamepadLike,
  type GamepadReadState,
} from './gamepad/index.js';
export {
  DEFAULT_CODE_BINDINGS,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_KEYCODE_BINDINGS,
  TIZEN_KEY_CODES,
  findKeyActions,
  resolveKeyActions,
  type KeyBindings,
} from './keymap/index.js';
export {
  DEFAULT_INPUT_TUNING,
  DIAGONAL_POLICIES,
  DIRECTION_COUNT,
  DIRECTION_MASK,
  MAX_RELEASE_DEBOUNCE_TICKS,
  SOCD_POLICIES,
  createDirectionOrder,
  createReleaseDebouncer,
  resolveDirections,
  type DiagonalPolicy,
  type DirectionOrder,
  type InputTuning,
  type ReleaseDebouncer,
  type SocdPolicy,
} from './remote/index.js';
export {
  DEFAULT_GAMEPAD_PROFILE_ID,
  DEFAULT_KEYBOARD_PROFILE_ID,
  DEFAULT_REMOTE_PROFILE_ID,
  INPUT_PROFILES_KIND,
  INPUT_PROFILE_DEVICES,
  INPUT_PROFILE_STORAGE_KEY,
  KEY_PROFILE_DEVICES,
  REQUIRED_CONTEXT_ACTIONS,
  SYSTEM_REMOTE_KEYS,
  chooseInputProfile,
  createInputProfileRegistry,
  loadInputProfileChoice,
  loadInputProfiles,
  overrideInputTuning,
  parseInputProfiles,
  saveInputProfileChoice,
  type ContextTables,
  type InputProfile,
  type InputProfileDevice,
  type InputProfileRegistry,
  type InputProfilesResult,
  type ProfileBindings,
} from './rebind/index.js';
