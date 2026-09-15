/**
 * The desktop window's remembered settings and shortcuts (plan M2-17, `main/window-state.ts`):
 * defensive parsing, integer scales of the 384×216 frame that fit the screen, positions kept only
 * on a screen, and the F11 / Alt+Enter / Ctrl+= / Ctrl+- / Ctrl+0 shortcuts.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW_SCALE,
  DEFAULT_WINDOW_STATE,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  MAX_WINDOW_SCALE,
  fitWindowScale,
  isOnScreen,
  parseWindowState,
  serializeWindowState,
  windowContentSize,
  windowShortcut,
  type ShortcutInput,
} from '../../src/main/window-state.js';

const key = (key: string, extra: Partial<ShortcutInput> = {}): ShortcutInput => ({
  type: 'keyDown',
  key,
  alt: false,
  control: false,
  meta: false,
  ...extra,
});

describe('electron/main/window-state', () => {
  it('starts windowed at ×3 (1152×648), centred', () => {
    expect(DEFAULT_WINDOW_STATE).toEqual({
      version: 1,
      fullscreen: false,
      scale: 3,
      x: null,
      y: null,
    });
    expect(windowContentSize(DEFAULT_WINDOW_SCALE)).toEqual({ width: 1152, height: 648 });
    expect([FRAME_WIDTH, FRAME_HEIGHT]).toEqual([384, 216]);
  });

  it('round-trips the settings through their stored text', () => {
    const state = { version: 1 as const, fullscreen: true, scale: 5, x: -1200, y: 40 };
    expect(parseWindowState(serializeWindowState(state))).toEqual(state);
  });

  it('parses defensively: defaults for missing, corrupt or out-of-range fields', () => {
    expect(parseWindowState(null)).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('{oops')).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('[1,2]')).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('"x"')).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('{"scale":0}').scale).toBe(3);
    expect(parseWindowState(`{"scale":${MAX_WINDOW_SCALE + 1}}`).scale).toBe(3);
    expect(parseWindowState('{"scale":2.5}').scale).toBe(3);
    expect(parseWindowState('{"fullscreen":"yes"}').fullscreen).toBe(false);
    // A position needs both whole coordinates.
    expect(parseWindowState('{"x":10}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"x":10,"y":1.5}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"x":10,"y":1e9}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"x":10,"y":20}')).toMatchObject({ x: 10, y: 20 });
  });

  it('lowers a scale that does not fit the work area, never below ×1', () => {
    expect(fitWindowScale(3, { width: 1920, height: 1040 })).toBe(3);
    expect(fitWindowScale(6, { width: 1920, height: 1040 })).toBe(4);
    expect(fitWindowScale(10, { width: 3840, height: 2100 })).toBe(9);
    expect(fitWindowScale(5, { width: 800, height: 600 })).toBe(2);
    expect(fitWindowScale(3, { width: 300, height: 200 })).toBe(1);
    expect(fitWindowScale(0, { width: 1920, height: 1080 })).toBe(1);
    expect(fitWindowScale(99, { width: 99999, height: 99999 })).toBe(MAX_WINDOW_SCALE);
  });

  it('keeps a position only while the title bar lies on a screen', () => {
    const screens = [
      { x: 0, y: 0, width: 1920, height: 1040 },
      { x: 1920, y: 0, width: 1280, height: 1024 },
    ];
    expect(isOnScreen(100, 100, 1152, screens)).toBe(true);
    expect(isOnScreen(2000, 50, 1152, screens)).toBe(true);
    // The second monitor was unplugged: a window left there is off-screen (centred instead) …
    expect(isOnScreen(2000, 50, 1152, screens.slice(0, 1))).toBe(false);
    // … while one straddling the edge keeps enough of its title bar on the first.
    expect(isOnScreen(1800, 50, 1152, screens.slice(0, 1))).toBe(true);
    expect(isOnScreen(-2000, 50, 1152, screens)).toBe(false);
    expect(isOnScreen(100, 1030, 1152, screens.slice(0, 1))).toBe(false);
    expect(isOnScreen(-1100, 0, 1152, screens)).toBe(false);
  });

  it('maps F11 and Alt+Enter to fullscreen and Ctrl+= / Ctrl+- / Ctrl+0 to the scale', () => {
    expect(windowShortcut(key('F11'))).toBe('fullscreen');
    expect(windowShortcut(key('Enter', { alt: true }))).toBe('fullscreen');
    expect(windowShortcut(key('=', { control: true }))).toBe('scale-up');
    expect(windowShortcut(key('+', { control: true }))).toBe('scale-up');
    expect(windowShortcut(key('-', { control: true }))).toBe('scale-down');
    expect(windowShortcut(key('0', { control: true }))).toBe('scale-reset');
    // macOS uses Cmd.
    expect(windowShortcut(key('=', { meta: true }), true)).toBe('scale-up');
    expect(windowShortcut(key('=', { control: true }), true)).toBeNull();
  });

  it('leaves every other key to the game (and ignores key-ups and auto-repeats)', () => {
    for (const plain of ['Enter', '=', '-', '0', 'z', 'x', 'ArrowUp', 'Escape', 'F1', 'F12']) {
      expect(windowShortcut(key(plain)), plain).toBeNull();
    }
    expect(windowShortcut(key('z', { control: true }))).toBeNull();
    expect(windowShortcut(key('=', { control: true, alt: true }))).toBeNull();
    expect(windowShortcut(key('F11', { control: true }))).toBeNull();
    expect(windowShortcut(key('Enter', { alt: true, control: true }))).toBeNull();
    expect(windowShortcut({ ...key('F11'), type: 'keyUp' })).toBeNull();
    expect(windowShortcut({ ...key('F11'), isAutoRepeat: true })).toBeNull();
  });
});
