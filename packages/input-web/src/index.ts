/**
 * `@shmup/input-web` — browser input adapter for the core.
 *
 * Keyboard and Samsung TV remote key events (`code` first, legacy `keyCode` fallback
 * for remote keys like Back 10009) plus the W3C Gamepad API, merged into the core's
 * per-tick `InputSnapshot` of action bitmasks. The core never sees key codes.
 *
 * @packageDocumentation
 */
export { createWebInput, type WebInput, type WebInputOptions } from './web-input/index.js';
export { createKeyboardSource, type KeyboardSource, type KeyEventLike } from './keyboard/index.js';
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
  resolveKeyActions,
  type KeyBindings,
} from './keymap/index.js';
