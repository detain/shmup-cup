/**
 * The frame and font metrics a test can mock `core/config` with (plan_resolution.md R2-01): the v1
 * frame (384×216, 8-px bars and tiles, the 6×8 font with its 10-px line, `ART_SCALE` 1) and R2-01's
 * post-flip one (640×360, 12-px bars and tiles, the interim 9×12 font with its 15-px line,
 * `ART_SCALE` 3/2), and the mocked module itself — every frame and font constant and what derives
 * from them, plus `DEFAULT_GAME_CONFIG`'s internal size. A file mocks the frame with
 * `vi.mock('../../src/config/index.js', …)`, or loads modules under both frames with
 * `vi.resetModules()` and `vi.doMock` (`scenes/scenes-scroll-frames.test.ts`). This module imports
 * nothing at run time, so a mock factory can import it.
 */
import type * as ConfigModule from '../../src/config/index.js';

/** One frame's metrics. */
export interface FrameMetrics {
  /** `FRAME_W`. */
  readonly frameW: number;
  /** `FRAME_H`. */
  readonly frameH: number;
  /** `HUD_BAR_HEIGHT`. */
  readonly bar: number;
  /** `TILE_SIZE`. */
  readonly tile: number;
  /** `GLYPH_W`. */
  readonly glyphW: number;
  /** `GLYPH_H`. */
  readonly glyphH: number;
  /** `LINE_H`. */
  readonly lineH: number;
  /** `ART_SCALE`. */
  readonly artScale: number;
}

/** The v1 frame: 384×216, 8-px bars and tiles, the 6×8 font (line 10), `ART_SCALE` 1. */
export const V1_METRICS: FrameMetrics = Object.freeze({
  frameW: 384,
  frameH: 216,
  bar: 8,
  tile: 8,
  glyphW: 6,
  glyphH: 8,
  lineH: 10,
  artScale: 1,
});

/** R2-01's post-flip frame: 640×360, 12-px bars and tiles, the 9×12 font (line 15), 3/2. */
export const POST_FLIP_METRICS: FrameMetrics = Object.freeze({
  frameW: 640,
  frameH: 360,
  bar: 12,
  tile: 12,
  glyphW: 9,
  glyphH: 12,
  lineH: 15,
  artScale: 3 / 2,
});

/**
 * `core/config` at a frame's metrics: the real module with every frame and font constant replaced.
 *
 * @param real - The real module (a mock factory's `importOriginal()`).
 * @param m - The metrics.
 * @returns The mocked module.
 */
export function mockedConfig(real: typeof ConfigModule, m: FrameMetrics): typeof ConfigModule {
  return {
    ...real,
    FRAME_W: m.frameW,
    FRAME_H: m.frameH,
    FRAME_CX: m.frameW / 2,
    FRAME_CY: m.frameH / 2,
    HUD_BAR_HEIGHT: m.bar,
    PLAYFIELD_Y: m.bar,
    PLAYFIELD_W: m.frameW,
    PLAYFIELD_H: m.frameH - 2 * m.bar,
    PLAYFIELD_CY: (m.frameH - 2 * m.bar) / 2,
    HUD_BOTTOM_Y: m.frameH - m.bar,
    TILE_SIZE: m.tile,
    GLYPH_W: m.glyphW,
    GLYPH_H: m.glyphH,
    LINE_H: m.lineH,
    ART_SCALE: m.artScale,
    DEFAULT_GAME_CONFIG: Object.freeze({
      ...real.DEFAULT_GAME_CONFIG,
      internalWidth: m.frameW,
      internalHeight: m.frameH,
    }),
  } as typeof ConfigModule;
}
