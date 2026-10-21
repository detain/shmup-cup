/**
 * Layout values of `core/scenes` that the scenes keep private, re-derived the way the scenes derive
 * them (plan_resolution.md R1-01, R2-01) for the scene suites: positions from the frame constants,
 * text-sized lengths from the font's metrics, art- and padding-sized lengths through `core/ui`
 * `uiPx` — so the suites' expectations hold at 384×216 with the 6×8 font and `ART_SCALE` 1 and at
 * 640×360 with the 9×12 font and `ART_SCALE` 3/2. The numbers in parentheses are the values at
 * 384×216 (v1).
 * A change of a scene's layout changes the formula here too, on purpose.
 */
import {
  ART_SCALE,
  FRAME_CX,
  FRAME_CY,
  FRAME_H,
  FRAME_W,
  GLYPH_H,
  LINE_H,
} from '../../src/config/index.js';
import { uiPx } from '../../src/ui/index.js';

/** The story's row pitch (11), as `core/scenes` `STORY_ROW_HEIGHT` derives it. */
const STORY_ROW = LINE_H + uiPx(1);

/** The story's sprite scenes' lowest row: the dawn's sea, 100 down and 24 tall (124). */
const STORY_SCENE_BOTTOM = uiPx(100) + uiPx(24);

/** The story crawl's window's height: seven rows at a time, six row pitches and a glyph (74). */
const STORY_WINDOW_H = 6 * STORY_ROW + GLYPH_H;

/**
 * The story crawl's window: its top and bottom rows (133 and 207; 216 and 330 at 640×360) and its
 * height — 4 px inside the story's panel, which is centred between the scene's lowest row and the
 * frame's bottom edge (R2-01).
 */
const STORY_WINDOW_TOP =
  ((STORY_SCENE_BOTTOM + FRAME_H - (STORY_WINDOW_H + uiPx(8))) >> 1) + uiPx(4);

/** See {@link STORY_WINDOW_TOP}. */
export const STORY_WINDOW = Object.freeze({
  top: STORY_WINDOW_TOP,
  bottom: STORY_WINDOW_TOP + STORY_WINDOW_H,
  height: STORY_WINDOW_H,
});

/**
 * The text panels' inset from the frame's sides: the ending's card and epilogue, the story's
 * panel (40).
 */
export const TEXT_PANEL_INSET = uiPx(40);

/** The story's panel width: the frame less the inset each side (304). */
export const STORY_PANEL_W = FRAME_W - 2 * TEXT_PANEL_INSET;

/**
 * A distance the sprite scenes moved, at the art's scale: `(px * ART_SCALE·2) >> 1` (the scenes'
 * `ART_HALVES` rule).
 *
 * @param px - The v1 distance.
 * @returns It at the art's scale.
 */
export function scenePx(px: number): number {
  return (px * ART_SCALE * 2) >> 1;
}

/**
 * The ending's epilogue panel (under its sprite scene): its top, first line and height — from 4 px
 * under the scene's lowest row (the horizon band, 104 down and 16 tall) to 4 px above the frame's
 * bottom edge (124, 129 and 88; 186, 194 and 168 at 640×360 — R2-01).
 */
const ENDING_TEXT_Y = uiPx(104) + uiPx(16) + uiPx(4);

/** See {@link ENDING_TEXT_Y}. */
export const ENDING_TEXT_PANEL = Object.freeze({
  y: ENDING_TEXT_Y,
  lineY: ENDING_TEXT_Y + uiPx(5),
  h: FRAME_H - uiPx(4) - ENDING_TEXT_Y,
});

/**
 * The WARNING band (R4-05.E3): its height a fifth of the frame (72 at 640×360; 48 at 384×216),
 * its top row `FRAME_CY − uiPx(8) − h/2` (132), its text row centred in the band
 * (`(h − GLYPH_H) / 2`: 30; v1's `uiPx(9)`), the hazard stripe pitch `h/4` and the field width
 * one band height.
 */
export const WARNING_BAND = Object.freeze({
  h: FRAME_H / 5,
  y: FRAME_CY - uiPx(8) - ((FRAME_H / 5) >> 1),
  textDy: (FRAME_H / 5 - GLYPH_H) >> 1,
  stripe: FRAME_H / 5 / 4,
  field: FRAME_H / 5,
});

/** The boot bar: its width (160), left edge and top (`FRAME_CY + 2`). */
export const BOOT_BAR = Object.freeze({
  w: uiPx(160),
  x: FRAME_CX - (uiPx(160) >> 1),
  y: FRAME_CY + uiPx(2),
  h: uiPx(6),
});

/**
 * The credits scroll's and the story crawl's half pixels a step, as `core/scenes`
 * `SCROLL_HALVES` derives them: the art's scale in halves (2) — `ART_SCALE` px a step.
 */
export const SCROLL_HALVES = ART_SCALE * 2;

/**
 * How far the credits or the story have scrolled after some steps (`core/scenes`' rule).
 *
 * @param steps - Whole steps (`⌊ticks / CREDITS_SCROLL_TICKS⌋` or `… / STORY_SCROLL_TICKS`).
 * @returns `(steps · SCROLL_HALVES) >> 1` pixels (`steps` at 384×216).
 */
export function scrollPx(steps: number): number {
  return (steps * SCROLL_HALVES) >> 1;
}

/**
 * The steps the credits or the story take to scroll a distance: the first whose
 * {@link scrollPx} reaches it.
 *
 * @param px - Pixels (0 or less: none).
 * @returns `⌈2·px / SCROLL_HALVES⌉` (`px` at 384×216).
 */
export function scrollSteps(px: number): number {
  return px <= 0 ? 0 : Math.ceil((2 * px) / SCROLL_HALVES);
}

/** The credits' row pitch (11) as `core/scenes` `CREDITS_ROW_HEIGHT` derives it. */
export const CREDITS_ROW = LINE_H + uiPx(1);
