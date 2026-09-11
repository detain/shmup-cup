/**
 * Key codes and key names for the Samsung Smart Remote, TV keyboards and desktop keyboards.
 *
 * Pure module: no DOM access. The Tizen `tvinputdevice` key list is passed in by the caller.
 *
 * @module keys
 */

/** Well-known key codes used by the probe logic. */
export const KeyCode = {
  Enter: 13,
  Space: 32,
  Left: 37,
  Up: 38,
  Right: 39,
  Down: 40,
  /** Keyboard `R` — resets stats in a desktop browser. */
  R: 82,
  /** Samsung remote "Return" key. */
  Back: 10009,
  /** Samsung "Exit" key (never registered: it must keep leaving the app). */
  Exit: 10182,
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
 */
export const STATIC_KEY_NAMES: Readonly<Record<number, string>> = buildStaticNames();

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

/** Returns true for the four arrow key codes. */
export function isArrow(code: number): boolean {
  return code >= KeyCode.Left && code <= KeyCode.Down;
}

/**
 * Returns true for keys beyond the default remote set (arrows, OK, Back) — used by the
 * "pressed an extra key" checklist item.
 */
export function isExtraKey(code: number): boolean {
  return MANDATORY_CODES.indexOf(code) < 0;
}

/**
 * Maps key codes to human-readable names: static table, overridden by the names Tizen reports at
 * runtime, and finally the DOM `event.key` of the first event seen for an unknown code.
 */
export class KeyNames {
  private readonly names = new Map<number, string>();

  /** Creates a name table pre-filled with {@link STATIC_KEY_NAMES}. */
  constructor() {
    for (const k of Object.keys(STATIC_KEY_NAMES)) {
      const code = Number(k);
      this.names.set(code, STATIC_KEY_NAMES[code] as string);
    }
  }

  /** Merges the runtime `getSupportedKeys()` list; Tizen names win over static ones. */
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
   * @param domKey - optional DOM `event.key`, used (and remembered) when the code is unknown.
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
  name: string;
  code: number | null;
  ok: boolean;
  /** Error name/message when registration failed. */
  error: string | null;
}

/** Modifier state of a keyboard event. */
export interface KeyModifiers {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
}

/**
 * Decides whether a keydown/keyup should have its default action prevented.
 *
 * - Browser/dev shortcuts are never blocked: anything with Ctrl/Meta/Alt held, and F1–F12.
 * - On Tizen (`tizenPresent`), every other key is blocked.
 * - In a desktop browser only arrows, Enter, Back and Space are blocked (to stop page scrolling).
 */
export function shouldPreventDefault(code: number, mods: KeyModifiers, tizenPresent: boolean): boolean {
  if (mods.ctrl || mods.meta || mods.alt) return false;
  if (code >= 112 && code <= 123) return false; // F1..F12
  if (tizenPresent) return true;
  return isArrow(code) || code === KeyCode.Enter || code === KeyCode.Back || code === KeyCode.Space;
}
