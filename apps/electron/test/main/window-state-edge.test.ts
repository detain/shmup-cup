/**
 * Edge cases of the desktop window's settings (plan M2-17, `main/window-state.ts`): the parser's
 * limits and types, frozen results, the scale fit for odd inputs (fractions, a non-number — never
 * below ×1), the on-screen test's exact thresholds, and the shortcut keys' modifier combinations.
 */
import { describe, expect, it } from 'vitest';
import { isStorageKey } from '../../src/shared/ipc.js';
import {
  DEFAULT_WINDOW_STATE,
  MAX_WINDOW_SCALE,
  WINDOW_MOVE_SAVE_MS,
  WINDOW_STATE_KEY,
  fitWindowScale,
  isOnScreen,
  parseWindowState,
  serializeWindowState,
  windowContentSize,
  windowShortcut,
  type ShortcutInput,
} from '../../src/main/window-state.js';

const key = (name: string, extra: Partial<ShortcutInput> = {}): ShortcutInput => ({
  type: 'keyDown',
  key: name,
  alt: false,
  control: false,
  meta: false,
  ...extra,
});

describe('electron/main/window-state edges', () => {
  it('stores the settings under a valid storage key and saves a move 400 ms after it settles', () => {
    expect(WINDOW_STATE_KEY).toBe('window');
    expect(isStorageKey(WINDOW_STATE_KEY)).toBe(true);
    expect(WINDOW_MOVE_SAVE_MS).toBe(400);
    expect(Object.isFrozen(DEFAULT_WINDOW_STATE)).toBe(true);
  });

  it('parses into a frozen object and serialises the default as centred', () => {
    const parsed = parseWindowState('{"version":1,"scale":2}');
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(serializeWindowState(DEFAULT_WINDOW_STATE)).toBe(
      '{"version":1,"fullscreen":false,"scale":3,"x":null,"y":null}',
    );
    expect(parseWindowState(serializeWindowState(DEFAULT_WINDOW_STATE))).toEqual(
      DEFAULT_WINDOW_STATE,
    );
  });

  it('accepts coordinates up to ±100,000 and scales 1 … 10, and nothing of another type', () => {
    expect(parseWindowState('{"x":-100000,"y":100000}')).toMatchObject({ x: -100000, y: 100000 });
    expect(parseWindowState('{"x":-100001,"y":0}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"x":0,"y":0}')).toMatchObject({ x: 0, y: 0 });
    expect(parseWindowState('{"scale":1}').scale).toBe(1);
    expect(parseWindowState(`{"scale":${MAX_WINDOW_SCALE}}`).scale).toBe(MAX_WINDOW_SCALE);
    expect(parseWindowState('{"scale":-3}').scale).toBe(3);
    expect(parseWindowState('{"scale":"4"}').scale).toBe(3);
    expect(parseWindowState('{"scale":null}').scale).toBe(3);
    expect(parseWindowState('{"x":"10","y":"20"}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"x":null,"y":20}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"fullscreen":1}').fullscreen).toBe(false);
    expect(parseWindowState('{"fullscreen":true}').fullscreen).toBe(true);
    // A foreign version is read field by field like any other document.
    expect(parseWindowState('{"version":7,"scale":5}')).toMatchObject({ version: 1, scale: 5 });
    expect(parseWindowState('')).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('null')).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('42')).toBe(DEFAULT_WINDOW_STATE);
  });

  it('sizes the content from the scale up to 4K', () => {
    expect(windowContentSize(1)).toEqual({ width: 384, height: 216 });
    expect(windowContentSize(MAX_WINDOW_SCALE)).toEqual({ width: 3840, height: 2160 });
  });

  it('fits odd scales: fractions round down, a non-number gives ×1, never below ×1', () => {
    const big = { width: 99999, height: 99999 };
    expect(fitWindowScale(5.9, big)).toBe(5);
    expect(fitWindowScale(-4, big)).toBe(1);
    expect(fitWindowScale(Number.POSITIVE_INFINITY, big)).toBe(MAX_WINDOW_SCALE);
    expect(fitWindowScale(Number.NEGATIVE_INFINITY, big)).toBe(1);
    expect(fitWindowScale(Number.NaN, big)).toBe(1);
    // The exact size fits; one pixel less in either direction does not.
    expect(fitWindowScale(4, { width: 1536, height: 864 })).toBe(4);
    expect(fitWindowScale(4, { width: 1535, height: 864 })).toBe(3);
    expect(fitWindowScale(4, { width: 1536, height: 863 })).toBe(3);
    // A tiny work area still gets ×1 (the window may be bigger than the screen).
    expect(fitWindowScale(3, { width: 0, height: 0 })).toBe(1);
  });

  it('needs 64 × 32 pixels of the title bar on one screen', () => {
    const screen = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    expect(isOnScreen(0, 0, 1152, [])).toBe(false);
    // Hanging off the left edge: 64 px left on screen is enough, 63 is not.
    expect(isOnScreen(-1088, 0, 1152, screen)).toBe(true);
    expect(isOnScreen(-1089, 0, 1152, screen)).toBe(false);
    // Hanging off the right edge.
    expect(isOnScreen(1856, 0, 1152, screen)).toBe(true);
    expect(isOnScreen(1857, 0, 1152, screen)).toBe(false);
    // The title bar's 32 rows must be on the screen.
    expect(isOnScreen(100, 1048, 1152, screen)).toBe(true);
    expect(isOnScreen(100, 1049, 1152, screen)).toBe(false);
    expect(isOnScreen(100, -1, 1152, screen)).toBe(false);
    // A monitor left of and above the primary one (negative coordinates).
    const left = [...screen, { x: -1280, y: -200, width: 1280, height: 1024 }];
    expect(isOnScreen(-1200, -150, 1152, left)).toBe(true);
    // A window spanning two monitors with less than 64 px on each is not reachable.
    const pair = [
      { x: 0, y: 0, width: 100, height: 1080 },
      { x: 100, y: 0, width: 100, height: 1080 },
    ];
    expect(isOnScreen(50, 0, 100, pair)).toBe(false);
    expect(isOnScreen(36, 0, 100, pair)).toBe(true);
  });

  it('reads the scale keys with either spelling, and only with the one command modifier', () => {
    expect(windowShortcut(key('_', { control: true }))).toBe('scale-down');
    expect(windowShortcut(key('+', { meta: true }), true)).toBe('scale-up');
    expect(windowShortcut(key('-', { meta: true }), true)).toBe('scale-down');
    expect(windowShortcut(key('0', { meta: true }), true)).toBe('scale-reset');
    // Ctrl and Cmd together, Cmd on Windows / Linux, Ctrl on macOS: none.
    expect(windowShortcut(key('=', { control: true, meta: true }))).toBeNull();
    expect(windowShortcut(key('=', { control: true, meta: true }), true)).toBeNull();
    expect(windowShortcut(key('=', { meta: true }))).toBeNull();
    expect(windowShortcut(key('0', { control: true }), true)).toBeNull();
    // Fullscreen: F11 alone or Alt+Enter alone, on every platform.
    expect(windowShortcut(key('F11'), true)).toBe('fullscreen');
    expect(windowShortcut(key('Enter', { alt: true }), true)).toBe('fullscreen');
    expect(windowShortcut(key('F11', { alt: true }))).toBeNull();
    expect(windowShortcut(key('F11', { meta: true }))).toBeNull();
    expect(windowShortcut(key('Enter', { alt: true, meta: true }))).toBeNull();
    // An auto-repeated scale key does not run away through the scales.
    expect(windowShortcut(key('=', { control: true, isAutoRepeat: true }))).toBeNull();
    expect(windowShortcut(key('=', { control: true, isAutoRepeat: false }))).toBe('scale-up');
    expect(windowShortcut({ ...key('=', { control: true }), type: 'char' })).toBeNull();
  });
});
