/**
 * # main/window-state — the desktop window's settings: fullscreen, scale, position
 *
 * **Responsibility.** The window settings the desktop build remembers between launches (M2-17 —
 * stored as `window.json` next to the saves, through the same `FileStore`), and the keyboard
 * shortcuts that change them:
 *
 * - **Scale.** The window's content is an exact multiple of the game's frame
 *   ({@link FRAME_WIDTH} × {@link FRAME_HEIGHT}; {@link windowContentSize}: ×1 …
 *   ×{@link MAX_WINDOW_SCALE}; default ×{@link DEFAULT_WINDOW_SCALE} — ×3 = 1152×648 at 384×216),
 *   so the game's integer scale mode fills it crisply. {@link fitWindowScale} lowers a saved scale
 *   that no longer fits the screen's work area.
 * - **Fullscreen.** Remembered; `SHMUP_FULLSCREEN=1` still forces it for one launch.
 * - **Position.** The window's last top-left corner, kept only while it lies on a screen
 *   ({@link isOnScreen}) — else the window is centred. `main.ts` saves it
 *   {@link WINDOW_MOVE_SAVE_MS} after the window's last `move` event and when it closes.
 * - **Shortcuts** ({@link windowShortcut}, read in the main process from the window's
 *   `before-input-event`): **F11** or **Alt+Enter** toggle fullscreen; **Ctrl+=** / **Ctrl++**
 *   and **Ctrl+-** step the window scale up / down, **Ctrl+0** resets it to the default scale (Cmd
 *   on macOS).
 *   None of these keys is a game or menu binding.
 *
 * {@link parseWindowState} is defensive like the save parser: a missing, corrupt or foreign file
 * gives the defaults, field by field.
 *
 * **Versions** ({@link WINDOW_STATE_VERSION}). Version 1 (M2-17) stored the scale of the v1 frame,
 * {@link V1_WINDOW_FRAME_WIDTH} px wide; version 2 (plan_resolution.md R2-01, decision W4-10) stores
 * the scale of {@link FRAME_WIDTH}. A version-1 file keeps its window's size as nearly as a whole
 * scale allows: `scale′ = max(1, round(scale × 384 / FRAME_WIDTH))` — at 640×360, ×3 (1152 px) → ×2
 * (1280 px), ×5 → ×3 (1920 px), ×10 → ×6 (4K); `main.ts` then fits it to the screen as for any
 * file. Fullscreen and the position are kept; the next save writes version 2.
 *
 * **Implements.** shmup_feat.md §23 Electron-specific — fullscreen BrowserWindow, window / scale
 * settings; shmup_feat.md §3 (integer scaling of the game's frame).
 *
 * **Public API.** {@link WindowState}, {@link DEFAULT_WINDOW_STATE}, {@link parseWindowState},
 * {@link serializeWindowState}, {@link windowContentSize}, {@link fitWindowScale},
 * {@link isOnScreen}, {@link windowShortcut}, {@link WindowShortcut}, {@link ShortcutInput},
 * {@link ScreenArea}, {@link WINDOW_STATE_KEY}, {@link WINDOW_STATE_VERSION}, {@link FRAME_WIDTH},
 * {@link FRAME_HEIGHT}, {@link V1_WINDOW_FRAME_WIDTH}, {@link DEFAULT_WINDOW_SCALE},
 * {@link MAX_WINDOW_SCALE}, {@link WINDOW_MOVE_SAVE_MS}.
 *
 * @module
 */

/** Storage key of the window settings (`window.json` in the saves folder). */
export const WINDOW_STATE_KEY = 'window';

/**
 * Format version of `window.json`: 2 since R2-01 (the scale counts {@link FRAME_WIDTH}-wide frames;
 * a version-1 file's scale counted {@link V1_WINDOW_FRAME_WIDTH}-wide ones and is converted).
 */
export const WINDOW_STATE_VERSION = 2;

/**
 * Width of the game's frame (decision D19): a **mirror** of `@shmup/core`'s `FRAME_W`.
 *
 * @remarks
 * The main process is compiled and packaged without the workspace packages, so it cannot import
 * core (plan R1-02, owner decision O8); `test/main/window-frame.test.ts` pins this mirror and
 * {@link FRAME_HEIGHT} to core's constants, so R2-01's flip to 640×360 fails there until both
 * are changed together. Everything else here derives from the two.
 */
export const FRAME_WIDTH = 384;

/** Height of the game's frame: a mirror of `@shmup/core`'s `FRAME_H` (see {@link FRAME_WIDTH}). */
export const FRAME_HEIGHT = 216;

/**
 * Width of the frame a version-1 `window.json` was saved against: v1's 384×216 (D19). Not a mirror
 * — it never changes; {@link parseWindowState} converts a version-1 scale with it (W4-10).
 */
export const V1_WINDOW_FRAME_WIDTH = 384;

/** The largest scale a version-1 file could store: the v1 frame at most 3840 px wide (×10). */
const V1_MAX_WINDOW_SCALE = Math.floor(3840 / V1_WINDOW_FRAME_WIDTH);

/**
 * The window scale of a first launch: the largest whose content is at most 1280 px wide — ×3 =
 * 1152×648 at 384×216, ×2 = 1280×720 at 640×360 (plan §2.7).
 */
export const DEFAULT_WINDOW_SCALE = Math.floor(1280 / FRAME_WIDTH);

/** The largest window scale: the frame at most 3840 px wide, 4K — ×10 at 384×216, ×6 at 640×360. */
export const MAX_WINDOW_SCALE = Math.floor(3840 / FRAME_WIDTH);

/**
 * How long the window must stand still after a `move` event before its position is saved (a drag
 * sends many `move` events; Linux sends no `moved`).
 */
export const WINDOW_MOVE_SAVE_MS = 400;

/** The remembered window settings. */
export interface WindowState {
  /** Format version ({@link WINDOW_STATE_VERSION}). */
  readonly version: typeof WINDOW_STATE_VERSION;
  /** Fullscreen at launch. */
  readonly fullscreen: boolean;
  /** Window content = frame × scale (1 … {@link MAX_WINDOW_SCALE}). */
  readonly scale: number;
  /** Last left edge, or `null` to centre. */
  readonly x: number | null;
  /** Last top edge, or `null` to centre. */
  readonly y: number | null;
}

/** The settings of a first launch: windowed, at {@link DEFAULT_WINDOW_SCALE}, centred. */
export const DEFAULT_WINDOW_STATE: WindowState = Object.freeze({
  version: WINDOW_STATE_VERSION,
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
 * The scale of a version-1 file in frames of today's width (W4-10): the whole scale nearest to
 * the v1 window's width, at least ×1.
 *
 * @param value - The stored version-1 scale (valid: a whole number 1 … 10).
 * @returns `max(1, round(scale × V1_WINDOW_FRAME_WIDTH / FRAME_WIDTH))` — the scale itself while
 *   the frame is still v1's — or {@link DEFAULT_WINDOW_SCALE} for an invalid value.
 */
function fromV1Scale(value: unknown): number {
  const scale = wholeIn(value, 1, V1_MAX_WINDOW_SCALE, 0);
  if (scale === 0) return DEFAULT_WINDOW_SCALE;
  const nearest = Math.round((scale * V1_WINDOW_FRAME_WIDTH) / FRAME_WIDTH);
  return Math.min(MAX_WINDOW_SCALE, Math.max(1, nearest));
}

/**
 * Parses the stored settings. Never throws.
 *
 * @remarks
 * A version-1 document's scale counts v1 frames and is converted ({@link V1_WINDOW_FRAME_WIDTH},
 * the module docs); a document of any other version — 2, a newer one or none — is read field by
 * field as it is. The result is always a version-2 state.
 *
 * @param text - The stored text, or `null` when nothing is stored.
 * @returns The settings; anything missing or invalid takes its default (a position needs both
 *   coordinates).
 *
 * @example
 * ```ts
 * parseWindowState('{"version":2,"fullscreen":true,"scale":4}'); // → fullscreen, ×4, centred
 * parseWindowState('{"version":1,"scale":3}'); // → ×2 at 640×360 (1152 → 1280 px), centred
 * parseWindowState('{oops');                   // → DEFAULT_WINDOW_STATE
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
    version: WINDOW_STATE_VERSION,
    fullscreen: doc.fullscreen === true,
    scale:
      doc.version === 1
        ? fromV1Scale(doc.scale)
        : wholeIn(doc.scale, 1, MAX_WINDOW_SCALE, DEFAULT_WINDOW_SCALE),
    x: placed ? x : null,
    y: placed ? y : null,
  });
}

/**
 * The stored text of the settings.
 *
 * @param state - The settings.
 * @returns Compact JSON, every field written (a centred window stores `null` coordinates) —
 *   {@link parseWindowState} reads it back unchanged.
 *
 * @example
 * ```ts
 * serializeWindowState(DEFAULT_WINDOW_STATE);
 * // → '{"version":2,"fullscreen":false,"scale":3,"x":null,"y":null}' (×3 at 384×216)
 * ```
 */
export function serializeWindowState(state: WindowState): string {
  return JSON.stringify({
    version: WINDOW_STATE_VERSION,
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
 * @returns `FRAME_WIDTH × scale` by `FRAME_HEIGHT × scale` (a new object).
 *
 * @example
 * ```ts
 * windowContentSize(3); // → { width: 1152, height: 648 }
 * ```
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
 * @param scale - The wanted scale (a fraction rounds down; `NaN` counts as ×1).
 * @param area - The work area (or its size).
 * @returns The scale to use.
 *
 * @example
 * ```ts
 * fitWindowScale(6, { x: 0, y: 0, width: 1920, height: 1040 }); // → 4 (1536×864)
 * ```
 */
export function fitWindowScale(scale: number, area: Pick<ScreenArea, 'width' | 'height'>): number {
  // `|| 1`: NaN would slip through Math.max / Math.min and come back as the scale.
  let fit = Math.max(1, Math.min(MAX_WINDOW_SCALE, Math.floor(scale) || 1));
  while (fit > 1 && (FRAME_WIDTH * fit > area.width || FRAME_HEIGHT * fit > area.height)) fit--;
  return fit;
}

/**
 * Whether a window placed at (`x`, `y`) with a content size keeps its title-bar corner on one of
 * the screens (at least 64×32 px of it inside a work area).
 *
 * @remarks
 * Only the window's top 32 px (its title bar) are tested, so a window whose lower part hangs
 * off the bottom of a screen still counts — the player can drag it back. A monitor that was
 * unplugged since the position was saved no longer offers its work area, and the window is
 * centred instead.
 *
 * @param x - Left edge.
 * @param y - Top edge.
 * @param width - Window width.
 * @param areas - The screens' work areas.
 * @returns `true` when it is reachable.
 *
 * @example
 * ```ts
 * const screens = [{ x: 0, y: 0, width: 1920, height: 1040 }];
 * isOnScreen(300, 200, 1152, screens);  // → true
 * isOnScreen(2500, 200, 1152, screens); // → false (the monitor on the right is gone)
 * ```
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
 * @remarks
 * Only a first key-down counts (auto-repeats and key-ups return `null`). F11 and Alt+Enter work
 * on every platform; the scale keys need Ctrl (Cmd on macOS) without Alt, so AltGr layouts do not
 * trigger them. `main.ts` prevents the default of a matched key, so the game never sees it.
 *
 * @param input - The key event.
 * @param mac - macOS (Cmd instead of Ctrl for the scale keys).
 * @returns The shortcut, or `null` (the key goes to the game).
 *
 * @example
 * ```ts
 * const key = { type: 'keyDown', alt: false, control: true, meta: false };
 * windowShortcut({ ...key, key: '=' });                 // → 'scale-up'
 * windowShortcut({ ...key, key: '0' });                 // → 'scale-reset'
 * windowShortcut({ ...key, key: 'F11', control: false }); // → 'fullscreen'
 * windowShortcut({ ...key, key: 'z' });                 // → null (a game key)
 * ```
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
