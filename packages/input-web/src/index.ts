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
 * Player seats (M2-06, two-player co-op — `web-input`): the host forwards the core's
 * `Game.inputSeats` to {@link WebInput.setSeats}. With one seat every device drives player 1; with
 * two (a co-op game) the keyboard / remote stays player 1's, and a pad's first A / START — or the
 * right half of the split keyboard profile `keyboard-split` — takes player 2's seat
 * ({@link PAD_SEAT_P2}, {@link WebInput.padSeat}).
 *
 * Rebinding (M2-16 — `rebind`, `web-input`): the player's rebound keys and buttons, SOCD policy and
 * release debounce are applied to a profile with {@link customizeInputProfile}; the Options
 * screen's rebind prompt captures the next key or button ({@link WebInput.beginCapture}) and binds
 * it with conflict detection ({@link rebindAction}, {@link resetBindings},
 * {@link bindingTokenLabel}).
 *
 * @packageDocumentation
 */
export {
  createWebInput,
  InputCaptureState,
  PAD_SEAT_NONE,
  PAD_SEAT_P2,
  type CaptureKind,
  type WebInput,
  type WebInputOptions,
} from './web-input/index.js';
export {
  KeyCapture,
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
  DEFAULT_PROFILE_SUFFIX,
  DEFAULT_REMOTE_PROFILE_ID,
  INPUT_PROFILES_KIND,
  INPUT_PROFILE_DEVICES,
  INPUT_PROFILE_STORAGE_KEY,
  KEY_PROFILE_DEVICES,
  REQUIRED_CONTEXT_ACTIONS,
  RESERVED_BINDING_TOKENS,
  SYSTEM_REMOTE_KEYS,
  actionTokens,
  applyBindingOverride,
  bindingKeysLabel,
  bindingTokenLabel,
  captureToken,
  chooseInputProfile,
  customizeInputProfile,
  findBindingConflicts,
  rebindAction,
  resetBindings,
  createInputProfileRegistry,
  inputProfileChoices,
  loadInputProfileChoice,
  loadInputProfiles,
  overrideInputTuning,
  parseInputProfiles,
  saveInputProfileChoice,
  selectableKeyProfiles,
  type BindingConflict,
  type CapturedInput,
  type ContextTables,
  type InputCustomization,
  type InputProfile,
  type InputProfileDevice,
  type InputProfileRegistry,
  type InputProfilesResult,
  type KeySpace,
  type ProfileBindings,
  type RebindResult,
} from './rebind/index.js';
