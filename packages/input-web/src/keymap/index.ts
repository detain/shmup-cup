/**
 * # keymap — default key → action bindings (keyboard + Samsung TV remote)
 *
 * **Responsibility.** Default bindings from `KeyboardEvent.code` (layout independent)
 * and, as a fallback, legacy `KeyboardEvent.keyCode` values — Tizen remote keys such as
 * Back (10009) or Play/Pause (10252) arrive with an empty or unknown `code`, so they are
 * matched by key code. Resolution tries `code` first, then `keyCode`, so one physical key
 * never counts twice.
 *
 * Remote-first defaults (shmup_feat.md §4): arrows move, OK (13) = Confirm + PowerUp
 * (menus / meter equip), Back (10009) = Back, Play/Pause (10252) = Pause, Ch+/Ch−
 * (427/428) = Special / Speed candidates. Autofire is forced by the core in remote mode,
 * so no fire key is needed on the remote.
 *
 * **Implements.** shmup_feat.md §4 (actions, remote key table, keyboard via `e.code`),
 * shmup_tech.md §2.3 (remote key codes).
 *
 * **Public API.** {@link DEFAULT_CODE_BINDINGS}, {@link DEFAULT_KEYCODE_BINDINGS},
 * {@link TIZEN_KEY_CODES}, {@link KeyBindings}, {@link resolveKeyActions}.
 *
 * @module
 */
import { Action, defineModule, type ActionMask } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'keymap',
  status: 'implemented',
  specRefs: ['shmup_feat.md §4', 'shmup_tech.md §2.3'],
});

/** Samsung TV remote key codes (shmup_tech.md §2.3; verify with tools/input-probe). */
export const TIZEN_KEY_CODES = Object.freeze({
  Enter: 13,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Back: 10009,
  MediaPlayPause: 10252,
  ChannelUp: 427,
  ChannelDown: 428,
  ColorF0Red: 403,
  ColorF1Green: 404,
  ColorF2Yellow: 405,
  ColorF3Blue: 406,
});

/** A binding table: `code` string → actions, and `keyCode` number → actions. */
export interface KeyBindings {
  readonly byCode: Readonly<Record<string, ActionMask>>;
  readonly byKeyCode: Readonly<Record<number, ActionMask>>;
}

/** Default keyboard bindings by `KeyboardEvent.code`. */
export const DEFAULT_CODE_BINDINGS: Readonly<Record<string, ActionMask>> = Object.freeze({
  ArrowUp: Action.Up,
  ArrowDown: Action.Down,
  ArrowLeft: Action.Left,
  ArrowRight: Action.Right,
  KeyW: Action.Up,
  KeyS: Action.Down,
  KeyA: Action.Left,
  KeyD: Action.Right,
  KeyZ: Action.Shot | Action.Confirm,
  Space: Action.Shot | Action.Confirm,
  KeyX: Action.Sub | Action.Back,
  KeyC: Action.PowerUp,
  KeyV: Action.Special,
  ShiftLeft: Action.Speed,
  Enter: Action.Confirm | Action.PowerUp,
  NumpadEnter: Action.Confirm | Action.PowerUp,
  Escape: Action.Back | Action.Pause,
  Backspace: Action.Back,
  KeyP: Action.Pause,
});

/** Fallback bindings by legacy `keyCode` (TV remote keys). */
export const DEFAULT_KEYCODE_BINDINGS: Readonly<Record<number, ActionMask>> = Object.freeze({
  [TIZEN_KEY_CODES.ArrowUp]: Action.Up,
  [TIZEN_KEY_CODES.ArrowDown]: Action.Down,
  [TIZEN_KEY_CODES.ArrowLeft]: Action.Left,
  [TIZEN_KEY_CODES.ArrowRight]: Action.Right,
  [TIZEN_KEY_CODES.Enter]: Action.Confirm | Action.PowerUp,
  [TIZEN_KEY_CODES.Back]: Action.Back,
  [TIZEN_KEY_CODES.MediaPlayPause]: Action.Pause,
  [TIZEN_KEY_CODES.ChannelUp]: Action.Special,
  [TIZEN_KEY_CODES.ChannelDown]: Action.Speed,
});

/** The default binding table. */
export const DEFAULT_KEY_BINDINGS: KeyBindings = Object.freeze({
  byCode: DEFAULT_CODE_BINDINGS,
  byKeyCode: DEFAULT_KEYCODE_BINDINGS,
});

/**
 * Resolves a key event to actions: `code` first, `keyCode` as fallback.
 *
 * @param code - `KeyboardEvent.code` (may be empty on TV remotes).
 * @param keyCode - `KeyboardEvent.keyCode`.
 * @param bindings - Binding table.
 * @returns The action mask, 0 when the key is unbound.
 */
export function resolveKeyActions(
  code: string,
  keyCode: number,
  bindings: KeyBindings,
): ActionMask {
  if (code !== '') {
    const byCode = bindings.byCode[code];
    if (byCode !== undefined) return byCode;
  }
  return bindings.byKeyCode[keyCode] ?? 0;
}
