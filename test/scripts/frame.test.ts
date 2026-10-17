/**
 * `scripts/frame.mjs` (plan_resolution.md R1-02): the scripts' mirror of the frame constants
 * equals `@shmup/core`'s, export for export, so a change of the frame in core (R2-01) cannot leave
 * the tools, the e2e viewport or the docs' captures behind; the capture scale follows decision O9
 * (`floor(1280 / FRAME_W)`); and the e2e helper `test/e2e/frame-pixels.ts` maps frame pixels to
 * the centres of their screenshot blocks.
 */
import * as core from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as frame from '../../scripts/frame.mjs';
import { SCALE, VIEWPORT, pixelIndex, sx, sy } from '../e2e/frame-pixels.js';

/** Mirror export → the `@shmup/core` export it must equal. */
const MIRRORED = {
  FRAME_W: core.FRAME_W,
  FRAME_H: core.FRAME_H,
  FRAME_CX: core.FRAME_CX,
  FRAME_CY: core.FRAME_CY,
  HUD_BAR_HEIGHT: core.HUD_BAR_HEIGHT,
  PLAYFIELD_Y: core.PLAYFIELD_Y,
  PLAYFIELD_W: core.PLAYFIELD_W,
  PLAYFIELD_H: core.PLAYFIELD_H,
  PLAYFIELD_CY: core.PLAYFIELD_CY,
  HUD_BOTTOM_Y: core.HUD_BOTTOM_Y,
  TILE_SIZE: core.TILE_SIZE,
  GLYPH_W: core.GLYPH_W,
  GLYPH_H: core.GLYPH_H,
  LINE_H: core.LINE_H,
  SPAWN_LEAD: core.DEFAULT_SPAWN_SCREEN_X,
} as const;

describe('scripts/frame.mjs', () => {
  it.each(Object.entries(MIRRORED))('%s equals @shmup/core', (name, value) => {
    expect((frame as Record<string, unknown>)[name]).toBe(value);
  });

  it('exports exactly the mirrored constants and the capture scale', () => {
    expect(Object.keys(frame).sort()).toEqual([...Object.keys(MIRRORED), 'CAPTURE_SCALE'].sort());
  });

  it('derives the capture scale: the largest whole scale of the frame within 1280 columns', () => {
    expect(frame.CAPTURE_SCALE).toBe(Math.floor(1280 / core.FRAME_W));
    expect(Number.isInteger(frame.CAPTURE_SCALE)).toBe(true);
    expect(frame.CAPTURE_SCALE).toBeGreaterThanOrEqual(1);
    expect(frame.CAPTURE_SCALE * core.FRAME_W).toBeLessThanOrEqual(1280);
    expect((frame.CAPTURE_SCALE + 1) * core.FRAME_W).toBeGreaterThan(1280);
  });

  it('holds only whole numbers', () => {
    for (const [name, value] of Object.entries(frame)) {
      expect(Number.isInteger(value), name).toBe(true);
    }
  });
});

describe('test/e2e/frame-pixels.ts', () => {
  it('sizes the viewport as the frame at the capture scale', () => {
    expect(SCALE).toBe(frame.CAPTURE_SCALE);
    expect(VIEWPORT).toEqual({ width: core.FRAME_W * SCALE, height: core.FRAME_H * SCALE });
    expect(Object.isFrozen(VIEWPORT)).toBe(true);
  });

  it('maps a frame pixel to the centre of its screenshot block', () => {
    const half = Math.floor(SCALE / 2);
    for (const f of [0, 1, 7, core.FRAME_CX, core.FRAME_W - 1]) {
      expect(sx(f)).toBe(f * SCALE + half);
      expect(sx(f)).toBeGreaterThanOrEqual(f * SCALE);
      expect(sx(f)).toBeLessThan((f + 1) * SCALE);
    }
    for (const f of [0, core.PLAYFIELD_Y, core.HUD_BOTTOM_Y, core.FRAME_H - 1]) {
      expect(sy(f)).toBe(f * SCALE + half);
    }
    // The last frame pixel's sample stays inside the viewport.
    expect(sx(core.FRAME_W - 1)).toBeLessThan(VIEWPORT.width);
    expect(sy(core.FRAME_H - 1)).toBeLessThan(VIEWPORT.height);
  });

  it('gives the byte offset of that sample in an RGBA screenshot', () => {
    const width = VIEWPORT.width;
    expect(pixelIndex(width, 0, 0)).toBe((sy(0) * width + sx(0)) * 4);
    expect(pixelIndex(width, 5, core.PLAYFIELD_Y)).toBe((sy(core.PLAYFIELD_Y) * width + sx(5)) * 4);
    expect(pixelIndex(width, core.FRAME_W - 1, core.FRAME_H - 1) + 3).toBeLessThan(
      VIEWPORT.width * VIEWPORT.height * 4,
    );
  });

  // The specs' hand-written mapping before R1-02 (the 640×360 frame of R2-01 is ×2 instead).
  it.runIf(core.FRAME_W === 384)('is the specs’ old ×3 mapping at the 384×216 frame', () => {
    expect(VIEWPORT).toEqual({ width: 1152, height: 648 });
    for (const f of [0, 8, 100, 207, 383]) expect(sx(f)).toBe(3 * f + 1);
  });
});
