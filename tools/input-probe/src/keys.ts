/**
 * Key codes and key names for the Samsung Smart Remote, TV keyboards and desktop keyboards.
 *
 * Pure module: no DOM access. The Tizen `tvinputdevice` key list is passed in by the caller, so everything
 * here is unit-testable in Node.
 *
 * Responsibilities:
 * - the well-known key codes the probe logic reacts to ({@link KeyCode}, {@link ARROW_CODES},
 *   {@link MANDATORY_CODES});
 * - code → display-name mapping ({@link KeyNames}, seeded from {@link STATIC_KEY_NAMES});
 * - which keys to register with `tizen.tvinputdevice` ({@link selectKeysToRegister});
 * - the `preventDefault()` policy ({@link shouldPreventDefault}).
 *
 * @module keys
 */

/**
 * Well-known DOM `keyCode` values used by the probe logic.
 *
 * @remarks
 * Samsung TV-specific keys (Back, Exit, media keys) use codes above 10000. Only arrows, Enter (OK) and Back
 * arrive without registration on Tizen; everything else must be registered via
 * `tizen.tvinputdevice.registerKey()` first (see `platform.ts`).
 */
export const KeyCode = {
  /** Enter on a keyboard; **OK** (centre of the D-pad) on the Samsung remote. */
  Enter: 13,
  /** Space bar (desktop keyboards). */
  Space: 32,
  /** Arrow left. */
  Left: 37,
  /** Arrow up. */
  Up: 38,
  /** Arrow right. */
  Right: 39,
  /** Arrow down. */
  Down: 40,
  /** Keyboard `R` — resets stats in a desktop browser. */
  R: 82,
  /** Samsung remote "Return" key. */
  Back: 10009,
  /** Samsung "Exit" key (never registered: it must keep leaving the app). */
  Exit: 10182,
  /** Samsung remote Play/Pause key — resets the hold/repeat/frame statistics in the probe. */
  MediaPlayPause: 10252,
} as const;

/** The four arrow key codes, in the order left, up, right, down. */
export const ARROW_CODES: readonly number[] = [KeyCode.Left, KeyCode.Up, KeyCode.Right, KeyCode.Down];

/** Key codes that arrive by default on Tizen (no registration needed): arrows, OK/Enter, Back. */
export const MANDATORY_CODES: readonly number[] = [...ARROW_CODES, KeyCode.Enter, KeyCode.Back];

/** A key as reported by `tizen.tvinputdevice.getSupportedKeys()`. */
export interface SupportedKey {
  /** Tizen key name, e.g. `"ColorF0Red"`. */
  name: string;
  /** DOM `keyCode` the key produces. */
  code: number;
}

/**
 * Static key-name table (spec: 13 OK, 37–40 arrows, 10009 Back, 10182 Exit, 10252 PlayPause, 427/428 Ch±,
 * 447–449 Vol/Mute, 403–406 colors, 412/413/415/417/19 media, 457 Info, 48–57 digits).
 *
 * @remarks
 * Names follow the Tizen `tvinputdevice` naming (`ColorF0Red`, `MediaPlayPause`, …) so that the runtime list
 * merged by {@link KeyNames.merge} mostly confirms rather than renames entries.
 */
export const STATIC_KEY_NAMES: Readonly<Record<number, string>> = buildStaticNames();

/**
 * Builds the contents of {@link STATIC_KEY_NAMES}.
 *
 * @returns a fresh code → name record including the digit keys `0`–`9` (codes 48–57).
 */
function buildStaticNames(): Record<number, string> {
  const names: Record<number, string> = {
    13: 'Enter',
    32: 'Space',
    37: 'ArrowLeft',
    38: 'ArrowUp',
    39: 'ArrowRight',
    40: 'ArrowDown',
    10009: 'Back',
    10182: 'Exit',
    10252: 'MediaPlayPause',
    427: 'ChannelUp',
    428: 'ChannelDown',
    447: 'VolumeUp',
    448: 'VolumeDown',
    449: 'VolumeMute',
    403: 'ColorF0Red',
    404: 'ColorF1Green',
    405: 'ColorF2Yellow',
    406: 'ColorF3Blue',
    412: 'MediaRewind',
    413: 'MediaStop',
    415: 'MediaPlay',
    417: 'MediaFastForward',
    19: 'MediaPause',
    457: 'Info',
  };
  for (let d = 0; d <= 9; d++) names[48 + d] = String(d);
  return names;
}

/**
 * Tells whether a key code is one of the four arrows.
 *
 * @param code - DOM `keyCode`.
 * @returns true for 37–40 (left, up, right, down).
 *
 * @example
 * ```ts
 * isArrow(KeyCode.Up); // true
 * isArrow(KeyCode.Enter); // false
 * ```
 */
export function isArrow(code: number): boolean {
  return code >= KeyCode.Left && code <= KeyCode.Down;
}

/**
 * Tells whether a key is beyond the default remote set (arrows, OK, Back) — used by the
 * "pressed an extra key" checklist item.
 *
 * @param code - DOM `keyCode`.
 * @returns true for any code not in {@link MANDATORY_CODES}.
 *
 * @example
 * ```ts
 * isExtraKey(KeyCode.MediaPlayPause); // true
 * isExtraKey(KeyCode.Back); // false
 * ```
 */
export function isExtraKey(code: number): boolean {
  return MANDATORY_CODES.indexOf(code) < 0;
}

/**
 * Maps key codes to human-readable names: static table, overridden by the names Tizen reports at
 * runtime, and finally the DOM `event.key` of the first event seen for an unknown code.
 *
 * @example
 * ```ts
 * const names = new KeyNames();
 * names.merge([{ name: 'ChannelUp', code: 427 }]); // from tizen.tvinputdevice.getSupportedKeys()
 * names.name(39);           // "ArrowRight"
 * names.name(81, 'q');      // "Q" (learned from event.key and remembered)
 * names.name(81);           // "Q"
 * names.name(12345);        // "#12345"
 * ```
 */
export class KeyNames {
  /** Current code → name table (mutated by {@link KeyNames.merge} and by learning from `event.key`). */
  private readonly names = new Map<number, string>();

  /** Creates a name table pre-filled with {@link STATIC_KEY_NAMES}. */
  constructor() {
    for (const k of Object.keys(STATIC_KEY_NAMES)) {
      const code = Number(k);
      this.names.set(code, STATIC_KEY_NAMES[code] as string);
    }
  }

  /**
   * Merges the runtime `getSupportedKeys()` list; Tizen names win over static ones.
   *
   * @param keys - keys reported by `tizen.tvinputdevice.getSupportedKeys()`. Entries without a numeric
   *   `code` or with an empty `name` are ignored.
   */
  merge(keys: readonly SupportedKey[]): void {
    for (const k of keys) {
      if (typeof k.code === 'number' && typeof k.name === 'string' && k.name.length > 0) {
        this.names.set(k.code, k.name);
      }
    }
  }

  /**
   * Returns the display name for a key code.
   *
   * @param code - DOM `keyCode`.
   * @param domKey - optional DOM `event.key`, used (and remembered) when the code is unknown. Single
   *   characters are upper-cased; `""` and `"Unidentified"` are ignored.
   * @returns the known name, the learned `event.key` label, or `#<code>` as a last resort.
   */
  name(code: number, domKey?: string): string {
    const known = this.names.get(code);
    if (known !== undefined) return known;
    if (domKey !== undefined && domKey !== '' && domKey !== 'Unidentified') {
      const label = domKey.length === 1 ? domKey.toUpperCase() : domKey;
      this.names.set(code, label);
      return label;
    }
    return '#' + code;
  }
}

/**
 * Picks the keys to register with `tvinputdevice.registerKey()`: everything supported except `Exit`
 * (which must keep closing the app). Duplicates are removed; order is preserved.
 *
 * @param supported - the `getSupportedKeys()` list.
 * @returns key names to register, in input order.
 *
 * @remarks
 * Registering `VolumeUp` / `VolumeDown` / `VolumeMute` takes volume control away from the TV while the app
 * runs — intentional for the probe (we want to know whether they can be captured), not for the game.
 *
 * @example
 * ```ts
 * selectKeysToRegister([
 *   { name: 'ChannelUp', code: 427 },
 *   { name: 'Exit', code: 10182 },
 *   { name: 'ChannelUp', code: 427 },
 * ]); // ["ChannelUp"]
 * ```
 */
export function selectKeysToRegister(supported: readonly SupportedKey[]): string[] {
  const out: string[] = [];
  for (const k of supported) {
    if (k.name === 'Exit' || k.code === KeyCode.Exit) continue;
    if (out.indexOf(k.name) < 0) out.push(k.name);
  }
  return out;
}

/** Result of registering one key with `tvinputdevice.registerKey()`. */
export interface RegisterResult {
  /** Tizen key name that was registered. */
  name: string;
  /** Key code from the supported-keys list, or null if the name was not found there. */
  code: number | null;
  /** Whether `registerKey()` returned without throwing. */
  ok: boolean;
  /** Error name/message when registration failed. */
  error: string | null;
}

/** Modifier state of a keyboard event. */
export interface KeyModifiers {
  /** `event.ctrlKey`. */
  ctrl: boolean;
  /** `event.metaKey` (Cmd on macOS, Windows key elsewhere). */
  meta: boolean;
  /** `event.altKey`. */
  alt: boolean;
}

/**
 * Decides whether a keydown/keyup should have its default action prevented.
 *
 * - Browser/dev shortcuts are never blocked: anything with Ctrl/Meta/Alt held, and F1–F12.
 * - On Tizen (`tizenPresent`), every other key is blocked.
 * - In a desktop browser only arrows, Enter, Back and Space are blocked (to stop page scrolling).
 *
 * @param code - DOM `keyCode`.
 * @param mods - modifier keys held during the event.
 * @param tizenPresent - whether the `tizen` global exists (running on a TV).
 * @returns true when the handler should call `event.preventDefault()`.
 *
 * @example
 * ```ts
 * shouldPreventDefault(KeyCode.Down, { ctrl: false, meta: false, alt: false }, false); // true
 * shouldPreventDefault(123, { ctrl: false, meta: false, alt: false }, true);           // false (F12)
 * shouldPreventDefault(82, { ctrl: true, meta: false, alt: false }, true);             // false (Ctrl+R)
 * ```
 */
export function shouldPreventDefault(code: number, mods: KeyModifiers, tizenPresent: boolean): boolean {
  if (mods.ctrl || mods.meta || mods.alt) return false;
  if (code >= 112 && code <= 123) return false; // F1..F12
  if (tizenPresent) return true;
  return isArrow(code) || code === KeyCode.Enter || code === KeyCode.Back || code === KeyCode.Space;
}
