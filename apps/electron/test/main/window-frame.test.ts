/**
 * The Electron main process's **frame mirror** (plan_resolution.md R1-02, owner decision O8).
 *
 * The main process is compiled and packaged without the workspace packages, so it cannot import
 * `@shmup/core`: `main/window-state.ts` keeps its own `FRAME_WIDTH` / `FRAME_HEIGHT`. This file
 * pins them to core's `FRAME_W` / `FRAME_H` (the tests can import core), so R2-01's flip to
 * 640×360 fails here until the mirror moves with it, and checks that the window scales derive
 * from the frame as plan §2.7 asks: the default scale is the largest whose window is at most
 * 1280 px wide (×3 = 1152×648 now, ×2 = 1280×720 at 640×360), the largest scale the one that
 * reaches 4K (×10 now, ×6 at 640×360).
 */
import { FRAME_H, FRAME_W } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createWindowOptions } from '../../src/main/window-options.js';
import {
  DEFAULT_WINDOW_SCALE,
  DEFAULT_WINDOW_STATE,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  MAX_WINDOW_SCALE,
  windowContentSize,
} from '../../src/main/window-state.js';

describe("electron/main the window's frame mirror (R1-02)", () => {
  it("equals core's frame constants", () => {
    expect(FRAME_WIDTH).toBe(FRAME_W);
    expect(FRAME_HEIGHT).toBe(FRAME_H);
  });

  it('derives the default and largest window scales from the frame width', () => {
    expect(DEFAULT_WINDOW_SCALE).toBe(Math.floor(1280 / FRAME_W));
    expect(MAX_WINDOW_SCALE).toBe(Math.floor(3840 / FRAME_W));
    // The 4K window is the frame at the largest scale, both ways (both frames are 16:9).
    expect(windowContentSize(MAX_WINDOW_SCALE)).toEqual({ width: 3840, height: 2160 });
    expect(DEFAULT_WINDOW_STATE.scale).toBe(DEFAULT_WINDOW_SCALE);
  });

  it('is ×2 / ×6 for the 640×360 frame (plan §2.7; v1: ×3 / ×10 at 384×216)', () => {
    if ((FRAME_W as number) === 384) {
      expect([DEFAULT_WINDOW_SCALE, MAX_WINDOW_SCALE]).toEqual([3, 10]);
      expect(windowContentSize(DEFAULT_WINDOW_SCALE)).toEqual({ width: 1152, height: 648 });
    } else {
      expect(FRAME_W).toBe(640);
      expect([DEFAULT_WINDOW_SCALE, MAX_WINDOW_SCALE]).toEqual([2, 6]);
      expect(windowContentSize(DEFAULT_WINDOW_SCALE)).toEqual({ width: 1280, height: 720 });
    }
  });

  it('opens the window at the default scale of the mirrored frame, at least one frame large', () => {
    const options = createWindowOptions({ preloadPath: 'p', fullscreen: false });
    expect([options.width, options.height]).toEqual([
      FRAME_W * DEFAULT_WINDOW_SCALE,
      FRAME_H * DEFAULT_WINDOW_SCALE,
    ]);
    expect([options.minWidth, options.minHeight]).toEqual([FRAME_W, FRAME_H]);
  });
});
