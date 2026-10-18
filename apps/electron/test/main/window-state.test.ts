/**
 * The desktop window's remembered settings and shortcuts (plan M2-17, `main/window-state.ts`):
 * defensive parsing, integer scales of the game's frame that fit the screen, positions kept only
 * on a screen, and the F11 / Alt+Enter / Ctrl+= / Ctrl+- / Ctrl+0 shortcuts. Since R2-01 the file
 * is version 2 and a version-1 file's scale is converted (decision W4-10); the scale fits are
 * written in frames, so the file passes at 384×216 and 640×360, each frame's pins in its own block.
 */
import { FRAME_H, FRAME_W } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW_SCALE,
  DEFAULT_WINDOW_STATE,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  MAX_WINDOW_SCALE,
  V1_WINDOW_FRAME_WIDTH,
  WINDOW_STATE_VERSION,
  fitWindowScale,
  isOnScreen,
  parseWindowState,
  serializeWindowState,
  windowContentSize,
  windowShortcut,
  type ShortcutInput,
  type WindowState,
} from '../../src/main/window-state.js';

/** The mirrored frame width, widened to `number` so either frame compiles. */
const frameWidth: number = FRAME_WIDTH;

/** At the v1 frame (384×216, before R2-01's flip). */
const AT_V1_FRAME = frameWidth === V1_WINDOW_FRAME_WIDTH;

/** At the v2 frame (640×360, after the flip). */
const AT_640 = frameWidth === 640;

const key = (key: string, extra: Partial<ShortcutInput> = {}): ShortcutInput => ({
  type: 'keyDown',
  key,
  alt: false,
  control: false,
  meta: false,
  ...extra,
});

describe('electron/main/window-state', () => {
  it('starts windowed at the default scale (×3 = 1152×648 at 384×216), centred', () => {
    expect(DEFAULT_WINDOW_STATE).toEqual({
      version: 2,
      fullscreen: false,
      scale: DEFAULT_WINDOW_SCALE,
      x: null,
      y: null,
    });
    expect(windowContentSize(DEFAULT_WINDOW_SCALE)).toEqual({
      width: FRAME_W * DEFAULT_WINDOW_SCALE,
      height: FRAME_H * DEFAULT_WINDOW_SCALE,
    });
    // The main process's mirror of core's frame (`window-frame.test.ts` pins it in detail).
    expect([FRAME_WIDTH, FRAME_HEIGHT]).toEqual([FRAME_W, FRAME_H]);
  });

  it('round-trips the settings through their stored text', () => {
    const state: WindowState = {
      version: WINDOW_STATE_VERSION,
      fullscreen: true,
      scale: 5,
      x: -1200,
      y: 40,
    };
    expect(parseWindowState(serializeWindowState(state))).toEqual(state);
    expect(JSON.parse(serializeWindowState(state))).toMatchObject({ version: 2 });
    for (let scale = 1; scale <= MAX_WINDOW_SCALE; scale++) {
      const stored = serializeWindowState({ ...state, scale });
      expect(parseWindowState(stored).scale, stored).toBe(scale);
    }
  });

  it('parses defensively: defaults for missing, corrupt or out-of-range fields', () => {
    expect(parseWindowState(null)).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('{oops')).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('[1,2]')).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('"x"')).toBe(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('{"scale":0}').scale).toBe(DEFAULT_WINDOW_SCALE);
    expect(parseWindowState(`{"scale":${MAX_WINDOW_SCALE + 1}}`).scale).toBe(DEFAULT_WINDOW_SCALE);
    expect(parseWindowState('{"scale":2.5}').scale).toBe(DEFAULT_WINDOW_SCALE);
    expect(parseWindowState('{"fullscreen":"yes"}').fullscreen).toBe(false);
    // A position needs both whole coordinates.
    expect(parseWindowState('{"x":10}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"x":10,"y":1.5}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"x":10,"y":1e9}')).toMatchObject({ x: null, y: null });
    expect(parseWindowState('{"x":10,"y":20}')).toMatchObject({ x: 10, y: 20 });
  });

  it('lowers a scale that does not fit the work area, never below ×1', () => {
    // A work area of exactly ×k fits ×k; a row or a column less fits ×(k − 1).
    for (let k = 2; k <= MAX_WINDOW_SCALE; k++) {
      const { width, height } = windowContentSize(k);
      expect(fitWindowScale(MAX_WINDOW_SCALE, { width, height }), `×${k}`).toBe(k);
      expect(fitWindowScale(k, { width, height: height - 1 }), `×${k}`).toBe(k - 1);
      expect(fitWindowScale(k, { width: width - 1, height }), `×${k}`).toBe(k - 1);
    }
    expect(fitWindowScale(5, { width: FRAME_WIDTH * 2 + 40, height: FRAME_HEIGHT * 2 + 30 })).toBe(
      2,
    );
    expect(fitWindowScale(3, { width: 300, height: 200 })).toBe(1);
    expect(fitWindowScale(0, { width: 1920, height: 1080 })).toBe(1);
    expect(fitWindowScale(99, { width: 99999, height: 99999 })).toBe(MAX_WINDOW_SCALE);
  });

  it.runIf(AT_V1_FRAME)('fits the v1 frame (384×216) as M2-17 did', () => {
    expect(fitWindowScale(3, { width: 1920, height: 1040 })).toBe(3);
    expect(fitWindowScale(6, { width: 1920, height: 1040 })).toBe(4);
    expect(fitWindowScale(10, { width: 3840, height: 2100 })).toBe(9);
    expect(fitWindowScale(5, { width: 800, height: 600 })).toBe(2);
  });

  it.runIf(AT_640)('fits the 640×360 frame (R2-01)', () => {
    expect(fitWindowScale(3, { width: 1920, height: 1080 })).toBe(3);
    expect(fitWindowScale(3, { width: 1920, height: 1040 })).toBe(2);
    expect(fitWindowScale(6, { width: 3840, height: 2100 })).toBe(5);
    expect(fitWindowScale(5, { width: 800, height: 600 })).toBe(1);
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

describe('electron/main/window-state — window.json version 1 → 2 (R2-01, W4-10)', () => {
  /**
   * The scale a version-1 file of a scale is read as.
   *
   * @param scale - The stored version-1 scale.
   * @returns The parsed scale.
   */
  const fromV1 = (scale: number): number =>
    parseWindowState(`{"version":1,"fullscreen":false,"scale":${scale},"x":null,"y":null}`).scale;

  it('saved v1 scales against the 384-px frame and writes version 2 now', () => {
    expect(V1_WINDOW_FRAME_WIDTH).toBe(384);
    expect(WINDOW_STATE_VERSION).toBe(2);
    expect(serializeWindowState(DEFAULT_WINDOW_STATE)).toContain('"version":2');
  });

  it('keeps a v1 window’s size as nearly as a whole scale allows: max(1, round(s × 384 / W))', () => {
    for (let scale = 1; scale <= 10; scale++) {
      const expected = Math.max(1, Math.round((scale * V1_WINDOW_FRAME_WIDTH) / FRAME_WIDTH));
      expect(fromV1(scale), `×${scale}`).toBe(expected);
      expect(fromV1(scale)).toBeLessThanOrEqual(MAX_WINDOW_SCALE);
      // The width moves by at most half a frame (more only where ×1 is the floor).
      const width = windowContentSize(fromV1(scale)).width;
      if (expected > 1) {
        expect(Math.abs(width - scale * V1_WINDOW_FRAME_WIDTH)).toBeLessThanOrEqual(
          FRAME_WIDTH / 2,
        );
      }
    }
  });

  it('keeps fullscreen and the position, and the result is a version-2 state', () => {
    const parsed = parseWindowState('{"version":1,"fullscreen":true,"scale":3,"x":-40,"y":25}');
    expect(parsed).toEqual({ version: 2, fullscreen: true, scale: fromV1(3), x: -40, y: 25 });
    expect(parseWindowState(serializeWindowState(parsed))).toEqual(parsed);
  });

  it('gives the default scale for an invalid v1 scale', () => {
    for (const bad of ['0', '11', '2.5', '-3', '"3"', 'null']) {
      expect(parseWindowState(`{"version":1,"scale":${bad}}`).scale, bad).toBe(
        DEFAULT_WINDOW_SCALE,
      );
    }
    expect(parseWindowState('{"version":1}').scale).toBe(DEFAULT_WINDOW_SCALE);
  });

  it('reads a version-2 file as it is', () => {
    for (let scale = 1; scale <= MAX_WINDOW_SCALE; scale++) {
      expect(parseWindowState(`{"version":2,"scale":${scale}}`).scale).toBe(scale);
    }
  });

  it.runIf(AT_V1_FRAME)('changes no v1 scale at the v1 frame', () => {
    for (let scale = 1; scale <= 10; scale++) expect(fromV1(scale)).toBe(scale);
  });

  it.runIf(AT_640)('converts ×3 → ×2, ×5 → ×3, ×10 → ×6 and ×1 → ×1 at 640×360', () => {
    expect(fromV1(3)).toBe(2); // 1152 → 1280 px
    expect(windowContentSize(fromV1(3))).toEqual({ width: 1280, height: 720 });
    expect(fromV1(5)).toBe(3); // 1920 px either way
    expect(windowContentSize(fromV1(5))).toEqual({ width: 1920, height: 1080 });
    expect(fromV1(10)).toBe(6); // 4K either way
    expect(fromV1(1)).toBe(1);
    expect([2, 4, 6, 7, 8, 9].map(fromV1)).toEqual([1, 2, 4, 4, 5, 5]);
  });
});
