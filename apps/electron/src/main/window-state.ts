/**
 * # main/window-state — the desktop window's settings: fullscreen, scale, position
 *
 * **Responsibility.** The window settings the desktop build remembers between launches (M2-17 —
 * stored as `window.json` next to the saves, through the same `FileStore`), and the keyboard
 * shortcuts that change them:
 *
 * - **Scale.** The window's content is an exact multiple of the 384×216 frame
 *   ({@link windowContentSize}: ×1 … ×{@link MAX_WINDOW_SCALE}; default ×3 = 1152×648), so the
 *   game's integer scale mode fills it crisply. {@link fitWindowScale} lowers a saved scale that
 *   no longer fits the screen's work area.
 * - **Fullscreen.** Remembered; `SHMUP_FULLSCREEN=1` still forces it for one launch.
 * - **Position.** The window's last top-left corner, kept only while it lies on a screen
 *   ({@link isOnScreen}) — else the window is centred.
 * - **Shortcuts** ({@link windowShortcut}, read in the main process from the window's
 *   `before-input-event`): **F11** or **Alt+Enter** toggle fullscreen; **Ctrl+=** / **Ctrl++**
 *   and **Ctrl+-** step the window scale up / down, **Ctrl+0** resets it to ×3 (Cmd on macOS).
 *   None of these keys is a game or menu binding.
 *
 * {@link parseWindowState} is defensive like the save parser: a missing, corrupt or foreign file
 * gives the defaults, field by field.
 *
 * **Implements.** shmup_feat.md §23 Electron-specific — fullscreen BrowserWindow, window / scale
 * settings; shmup_feat.md §3 (integer scaling of the 384×216 frame).
 *
 * **Public API.** {@link WindowState}, {@link DEFAULT_WINDOW_STATE}, {@link parseWindowState},
 * {@link serializeWindowState}, {@link windowContentSize}, {@link fitWindowScale},
 * {@link isOnScreen}, {@link windowShortcut}, {@link WindowShortcut}, {@link ShortcutInput},
 * {@link ScreenArea}, {@link WINDOW_STATE_KEY}, {@link FRAME_WIDTH}, {@link FRAME_HEIGHT},
 * {@link DEFAULT_WINDOW_SCALE}, {@link MAX_WINDOW_SCALE}.
 *
 * @module
 */

/** Storage key of the window settings (`window.json` in the saves folder). */
export const WINDOW_STATE_KEY = 'window';

/** Width of the game's frame (decision D19). */
export const FRAME_WIDTH = 384;

/** Height of the game's frame. */
export const FRAME_HEIGHT = 216;

/** The window scale of a first launch (1152×648). */
export const DEFAULT_WINDOW_SCALE = 3;

/** The largest window scale (×10 = 3840×2160). */
export const MAX_WINDOW_SCALE = 10;

/** The remembered window settings. */
export interface WindowState {
  /** Format version (1). */
  readonly version: 1;
  /** Fullscreen at launch. */
  readonly fullscreen: boolean;
  /** Window content = frame × scale (1 … {@link MAX_WINDOW_SCALE}). */
  readonly scale: number;
  /** Last left edge, or `null` to centre. */
  readonly x: number | null;
  /** Last top edge, or `null` to centre. */
  readonly y: number | null;
}

/** The settings of a first launch: windowed, ×3, centred. */
export const DEFAULT_WINDOW_STATE: WindowState = Object.freeze({
  version: 1,
  fullscreen: false,
  scale: DEFAULT_WINDOW_SCALE,
  x: null,
  y: null,
});

/**
 * A whole number in a range, or the fallback.
 *
 * @param value - Anything.
 * @param min - Lowest value.
 * @param max - Highest value.
 * @param fallback - Used when `value` is not a whole number in range.
 * @returns The number.
 */
function wholeIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

/**
 * A screen coordinate, or `null`.
 *
 * @param value - Anything.
 * @returns A whole number within ±100,000, else `null`.
 */
function coordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 100000
    ? value
    : null;
}

/**
 * Parses the stored settings. Never throws.
 *
 * @param text - The stored text, or `null` when nothing is stored.
 * @returns The settings; anything missing or invalid takes its default (a position needs both
 *   coordinates).
 *
 * @example
 * ```ts
 * parseWindowState('{"version":1,"fullscreen":true,"scale":4}'); // → fullscreen, ×4, centred
 * parseWindowState('{oops');                                      // → DEFAULT_WINDOW_STATE
 * ```
 */
export function parseWindowState(text: string | null): WindowState {
  if (text === null) return DEFAULT_WINDOW_STATE;
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (_error) {
    return DEFAULT_WINDOW_STATE;
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return DEFAULT_WINDOW_STATE;
  const doc = json as Record<string, unknown>;
  const x = coordinate(doc.x);
  const y = coordinate(doc.y);
  const placed = x !== null && y !== null;
  return Object.freeze({
    version: 1,
    fullscreen: doc.fullscreen === true,
    scale: wholeIn(doc.scale, 1, MAX_WINDOW_SCALE, DEFAULT_WINDOW_SCALE),
    x: placed ? x : null,
    y: placed ? y : null,
  });
}

/**
 * The stored text of the settings.
 *
 * @param state - The settings.
 * @returns Compact JSON.
 */
export function serializeWindowState(state: WindowState): string {
  return JSON.stringify({
    version: 1,
    fullscreen: state.fullscreen,
    scale: state.scale,
    x: state.x,
    y: state.y,
  });
}

/**
 * The window's content size at a scale.
 *
 * @param scale - The scale.
 * @returns `384 × scale` by `216 × scale`.
 */
export function windowContentSize(scale: number): {
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
} {
  return { width: FRAME_WIDTH * scale, height: FRAME_HEIGHT * scale };
}

/** A screen area (Electron's `Display.workArea`). */
export interface ScreenArea {
  /** Left edge. */
  readonly x: number;
  /** Top edge. */
  readonly y: number;
  /** Width. */
  readonly width: number;
  /** Height. */
  readonly height: number;
}

/**
 * The largest scale up to `scale` whose window fits the work area (at least ×1).
 *
 * @param scale - The wanted scale.
 * @param area - The work area (or its size).
 * @returns The scale to use.
 *
 * @example
 * ```ts
 * fitWindowScale(6, { x: 0, y: 0, width: 1920, height: 1040 }); // → 4 (1536×864)
 * ```
 */
export function fitWindowScale(scale: number, area: Pick<ScreenArea, 'width' | 'height'>): number {
  let fit = Math.max(1, Math.min(MAX_WINDOW_SCALE, Math.floor(scale)));
  while (fit > 1 && (FRAME_WIDTH * fit > area.width || FRAME_HEIGHT * fit > area.height)) fit--;
  return fit;
}

/**
 * Whether a window placed at (`x`, `y`) with a content size keeps its title-bar corner on one of
 * the screens (at least 64×32 px of it inside a work area).
 *
 * @param x - Left edge.
 * @param y - Top edge.
 * @param width - Window width.
 * @param areas - The screens' work areas.
 * @returns `true` when it is reachable.
 */
export function isOnScreen(
  x: number,
  y: number,
  width: number,
  areas: readonly ScreenArea[],
): boolean {
  for (const area of areas) {
    const left = Math.max(x, area.x);
    const right = Math.min(x + width, area.x + area.width);
    const top = Math.max(y, area.y);
    const bottom = Math.min(y + 32, area.y + area.height);
    if (right - left >= 64 && bottom - top >= 32) return true;
  }
  return false;
}

/** A keyboard event as `before-input-event` reports it (Electron's `Input`). */
export interface ShortcutInput {
  /** `'keyDown'` or `'keyUp'`. */
  readonly type: string;
  /** `KeyboardEvent.key`. */
  readonly key: string;
  /** Alt held. */
  readonly alt: boolean;
  /** Ctrl held. */
  readonly control: boolean;
  /** Cmd (macOS) / Windows key held. */
  readonly meta: boolean;
  /** An auto-repeat. */
  readonly isAutoRepeat?: boolean;
}

/** What a shortcut does. */
export type WindowShortcut = 'fullscreen' | 'scale-up' | 'scale-down' | 'scale-reset';

/**
 * The window shortcut a key press is, if any (see the module docs).
 *
 * @param input - The key event.
 * @param mac - macOS (Cmd instead of Ctrl for the scale keys).
 * @returns The shortcut, or `null` (the key goes to the game).
 */
export function windowShortcut(input: ShortcutInput, mac = false): WindowShortcut | null {
  if (input.type !== 'keyDown' || input.isAutoRepeat === true) return null;
  if (input.key === 'F11' && !input.alt && !input.control && !input.meta) return 'fullscreen';
  if (input.key === 'Enter' && input.alt && !input.control && !input.meta) return 'fullscreen';
  const command = mac ? input.meta && !input.control : input.control && !input.meta;
  if (!command || input.alt) return null;
  if (input.key === '=' || input.key === '+') return 'scale-up';
  if (input.key === '-' || input.key === '_') return 'scale-down';
  if (input.key === '0') return 'scale-reset';
  return null;
}
