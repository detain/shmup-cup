/**
 * Layout values of `core/scenes` that the scenes keep private, re-derived the way the scenes derive
 * them (plan_resolution.md R1-01, R2-01) for the scene suites: positions from the frame constants,
 * text-sized lengths from the font's metrics, art- and padding-sized lengths through `core/ui`
 * `uiPx` — so the suites' expectations hold at 384×216 with the 6×8 font and `ART_SCALE` 1 and at
 * 640×360 with the 9×12 font and `ART_SCALE` 3/2. The numbers in parentheses are today's values.
 * A change of a scene's layout changes the formula here too, on purpose.
 */
import { ART_SCALE, FRAME_CX, FRAME_CY, FRAME_W, LINE_H } from '../../src/config/index.js';
import { uiPx } from '../../src/ui/index.js';

/** The story crawl's window: its top (132) and bottom (206) rows, and its height (74). */
export const STORY_WINDOW = Object.freeze({
  top: uiPx(132),
  bottom: uiPx(206),
  height: uiPx(206) - uiPx(132),
});

/** The text panels' inset from the frame's sides: the ending's card and epilogue, the story's (40). */
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

/** The ending's epilogue panel (under its sprite scene): its top (124) and first line (129). */
export const ENDING_TEXT_PANEL = Object.freeze({
  y: uiPx(124),
  lineY: uiPx(124) + uiPx(5),
});

/** The WARNING band: its height (48) and top row (`FRAME_CY − 8 − 24`: 76). */
export const WARNING_BAND = Object.freeze({
  h: uiPx(48),
  y: FRAME_CY - uiPx(8) - (uiPx(48) >> 1),
  textDy: uiPx(9),
});

/** The boot bar: its width (160), left edge and top (`FRAME_CY + 2`). */
export const BOOT_BAR = Object.freeze({
  w: uiPx(160),
  x: FRAME_CX - (uiPx(160) >> 1),
  y: FRAME_CY + uiPx(2),
  h: uiPx(6),
});

/** The credits' row pitch (11) as `core/scenes` `CREDITS_ROW_HEIGHT` derives it. */
export const CREDITS_ROW = LINE_H + uiPx(1);
