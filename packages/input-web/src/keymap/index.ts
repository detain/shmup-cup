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
 * These built-in tables are the fallback used before an input profile is applied; the shipped
 * bindings — with separate `game` and `menu` tables (decision D15) — are data in
 * `content/input/` (see `rebind`).
 *
 * **Public API.** {@link DEFAULT_CODE_BINDINGS}, {@link DEFAULT_KEYCODE_BINDINGS},
 * {@link DEFAULT_KEY_BINDINGS}, {@link TIZEN_KEY_CODES}, {@link KeyBindings},
 * {@link resolveKeyActions}, {@link findKeyActions}.
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

/**
 * Samsung TV remote key codes (shmup_tech.md §2.3; verify with tools/input-probe).
 *
 * @remarks
 * Only arrows, Enter (OK) and Back are delivered to a Tizen web app by default; the
 * media, channel and colour keys must be registered first with
 * `tizen.tvinputdevice.registerKey()` (the Tizen platform adapter does this).
 */
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
  /** `KeyboardEvent.code` (e.g. `'KeyZ'`, `'ArrowUp'`) → actions. Checked first. */
  readonly byCode: Readonly<Record<string, ActionMask>>;
  /** Legacy `KeyboardEvent.keyCode` (e.g. `10009` Back) → actions. Fallback only. */
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
 * Looks a key up in a binding table: `code` first, `keyCode` as fallback.
 *
 * @remarks
 * Unlike {@link resolveKeyActions} this tells an *unbound* key (`-1`) from a key that is
 * bound to no action in this table (`0`). Profile tables use `0` entries for keys that only
 * act in the other binding context, so such a key is still tracked and `preventDefault()`-ed
 * in every context (see `rebind`).
 *
 * @param code - `KeyboardEvent.code` (may be empty on TV remotes).
 * @param keyCode - `KeyboardEvent.keyCode`.
 * @param bindings - Binding table.
 * @returns The action mask (possibly 0), or `-1` when the table does not know the key.
 *
 * @example
 * ```ts
 * findKeyActions('', 10009, DEFAULT_KEY_BINDINGS); // → Action.Back
 * findKeyActions('KeyQ', 81, DEFAULT_KEY_BINDINGS); // → -1 (unbound)
 * ```
 */
export function findKeyActions(code: string, keyCode: number, bindings: KeyBindings): number {
  if (code !== '') {
    const byCode = bindings.byCode[code];
    if (byCode !== undefined) return byCode;
  }
  const byKeyCode = bindings.byKeyCode[keyCode];
  return byKeyCode === undefined ? -1 : byKeyCode;
}

/**
 * Resolves a key event to actions: `code` first, `keyCode` as fallback.
 *
 * @remarks
 * The `keyCode` table is consulted only when `code` is empty or not bound, so a
 * keyboard arrow (bound by `code`) is never counted a second time via its key code.
 *
 * @param code - `KeyboardEvent.code` (may be empty on TV remotes).
 * @param keyCode - `KeyboardEvent.keyCode`.
 * @param bindings - Binding table.
 * @returns The action mask, 0 when the key is unbound.
 *
 * @example
 * ```ts
 * resolveKeyActions('KeyZ', 90, DEFAULT_KEY_BINDINGS); // → Action.Shot | Action.Confirm
 * resolveKeyActions('', 10009, DEFAULT_KEY_BINDINGS);  // → Action.Back (remote Back)
 * resolveKeyActions('KeyQ', 81, DEFAULT_KEY_BINDINGS); // → 0 (unbound)
 * ```
 */
export function resolveKeyActions(
  code: string,
  keyCode: number,
  bindings: KeyBindings,
): ActionMask {
  const mask = findKeyActions(code, keyCode, bindings);
  return mask < 0 ? 0 : mask;
}
