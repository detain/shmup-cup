/**
 * Frame-pixel helpers for the browser tests (plan_resolution.md R1-02): the Playwright viewport is
 * the game's frame at a whole-number scale ({@link SCALE}, `scripts/frame.mjs` `CAPTURE_SCALE`),
 * with no letterbox, so a frame pixel `(fx, fy)` covers a `SCALE × SCALE` block of a canvas
 * screenshot. A spec reads that block's **centre** pixel — screenshot pixel `(sx(fx), sy(fy))` —
 * so a sampling never lands on a block edge where the upscale could blend two frame pixels.
 *
 * At 384×216 the scale is 3: the viewport is 1152×648 and frame pixel `(x, y)` is screenshot pixel
 * `(3x + 1, 3y + 1)`. After R2-01 (640×360) it is 2: 1280×720 and `(2x + 1, 2y + 1)`.
 *
 * The frame constants (with the font's cell width `GLYPH_W` and the tile edge `TILE_SIZE`) are
 * re-exported from `scripts/frame.mjs` (the scripts' mirror of `@shmup/core`, pinned by
 * `test/scripts/frame.test.ts`), so a spec imports everything it needs from this one module. They
 * are the **frame**: positions that come from content (an area of a stage's art, a camera y, a
 * Mode-7 horizon) are not derived from them (plan §2.6, R2-03). The boss HP bar's place in the top
 * HUD bar ({@link BOSS_BAR_X} and its neighbours) is derived here too, the way `core/ui` derives
 * it, because the specs cannot import `@shmup/core`; `test/scripts/frame.test.ts` pins it to
 * core's `HUD_LAYOUT`.
 *
 * @example
 * ```ts
 * import { FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_Y, pixelIndex, sx, sy } from './frame-pixels.js';
 * for (let fy = PLAYFIELD_Y; fy < HUD_BOTTOM_Y && sy(fy) < height; fy++) {
 *   for (let fx = 0; fx < FRAME_W && sx(fx) < width; fx++) {
 *     const i = pixelIndex(width, fx, fy); // data[i], data[i + 1], data[i + 2]: its RGB
 *   }
 * }
 * ```
 *
 * @module
 */
import { CAPTURE_SCALE, FRAME_CX, FRAME_H, FRAME_W, GLYPH_W } from '../../scripts/frame.mjs';

export {
  FRAME_CX,
  FRAME_CY,
  FRAME_H,
  FRAME_W,
  GLYPH_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  PLAYFIELD_CY,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  TILE_SIZE,
} from '../../scripts/frame.mjs';

/** Screenshot pixels per frame pixel on each axis (×3 at 384×216, ×2 at 640×360). */
export const SCALE: number = CAPTURE_SCALE;

/** The browser viewport of the e2e projects: the frame at {@link SCALE} (1152×648 today). */
export const VIEWPORT: Readonly<{ width: number; height: number }> = Object.freeze({
  width: FRAME_W * SCALE,
  height: FRAME_H * SCALE,
});

/**
 * The screenshot column at the centre of a frame column's block.
 *
 * @param fx - Frame column (0 … `FRAME_W − 1`).
 * @returns `fx · SCALE + ⌊SCALE / 2⌋` (`3fx + 1` today).
 */
export function sx(fx: number): number {
  return fx * SCALE + (SCALE >> 1);
}

/**
 * The screenshot row at the centre of a frame row's block.
 *
 * @param fy - Frame row (0 … `FRAME_H − 1`).
 * @returns `fy · SCALE + ⌊SCALE / 2⌋` (`3fy + 1` today).
 */
export function sy(fy: number): number {
  return fy * SCALE + (SCALE >> 1);
}

/**
 * The byte offset in a decoded RGBA screenshot of a frame pixel's centre sample.
 *
 * @param width - Width of the screenshot in pixels (normally {@link VIEWPORT}'s).
 * @param fx - Frame column.
 * @param fy - Frame row.
 * @returns `(sy(fy) · width + sx(fx)) · 4` — the red byte; green, blue and alpha follow.
 *
 * @remarks
 * Does not check bounds: a caller that may sample outside the screenshot tests `sx(fx) < width`
 * and `sy(fy) < height` first.
 */
export function pixelIndex(width: number, fx: number, fy: number): number {
  return (sy(fy) * width + sx(fx)) * 4;
}

// The boss HP bar's place in the top HUD bar (`advanced-bosses.spec.ts`), derived the way
// `core/ui` derives it (R1-01, R2-01): from the frame's centre and the font's cell, and its gaps —
// the 4-px label gap, the 2-px nudge right, the frame's 2-px drop — at the art's scale (`core/ui`
// `uiPx`), so it follows the frame, the font and the art at R2-01 / R4-03.
// `test/scripts/frame.test.ts` checks every exported value against what core's `buildHud` really
// draws for a frame with the bar up — the label's x and width, the bar frame's x and width, the
// fill's top row — against `HUD_LAYOUT`, and {@link UI_ART_SCALE} against core's `ART_SCALE`.

/** The cell width of the font file (`assets/source/fonts/pixel6x8.font.json`, the v1 font). */
const FONT_FILE_CELL_W = 6;

/**
 * The art's scale (`core/config` `ART_SCALE`: 1 until R2-01, 3/2 after), which the specs cannot
 * import: the font's cell (`GLYPH_W`, mirrored by `scripts/frame.mjs`) over the font file's — the
 * relation core pins (`GLYPH_W` = the font file's cell × `ART_SCALE`: the interim 9×12 font is the
 * 6×8 file at ×1.5). `test/scripts/frame.test.ts` pins it to `ART_SCALE`.
 */
export const UI_ART_SCALE: number = GLYPH_W / FONT_FILE_CELL_W;

/**
 * A HUD length at the art's scale, as `core/ui` `uiPx` computes it: `⌈v · UI_ART_SCALE⌉`.
 *
 * @param v - The v1 length in pixels.
 * @returns It at the art's scale.
 */
function uiPx(v: number): number {
  return Math.ceil(v * UI_ART_SCALE);
}

/** Gap between a HUD label and what follows it (`core/ui` `HUD_LABEL_GAP` — 4 today). */
const HUD_LABEL_GAP = uiPx(4);

/** The bar frame's drop below the top bar's top (`core/ui` `HUD_ROW_DY` — 2 today). */
const HUD_ROW_DY = uiPx(2);

/**
 * Width of the boss HP bar's frame (`core/ui` `BOSS_HP_BAR_WIDTH` = `HUD_HI_W`: `HI`, the gap and
 * eight digits — 64 today).
 */
export const BOSS_BAR_W: number = 2 * GLYPH_W + HUD_LABEL_GAP + 8 * GLYPH_W;

/** From the `BOSS` label to the bar's frame (`core/ui` `HUD_BOSS_BAR_DX` — 28 today). */
const BOSS_BAR_DX = 4 * GLYPH_W + HUD_LABEL_GAP;

/** Width of the `BOSS` label: four glyph cells (`core/ui` `hudBoss`). */
export const BOSS_LABEL_W: number = 4 * GLYPH_W;

/**
 * The `BOSS` label's x: the label, the gap and the bar centred 2 px right of the frame's centre
 * (`core/ui` `HUD_BOSS_X`, `HUD_LAYOUT.bossX` — 148 today).
 */
export const BOSS_LABEL_X: number = FRAME_CX - ((BOSS_BAR_DX + BOSS_BAR_W) >> 1) + uiPx(2);

/** The boss HP bar's frame x (`core/ui` `HUD_LAYOUT.bossBarX` — 176 today). */
export const BOSS_BAR_X: number = BOSS_LABEL_X + BOSS_BAR_DX;

/**
 * The bar fill's top row, counted from the frame's top edge: `buildHud` draws the fill 1 px inside
 * the bar's frame, at `HUD_LAYOUT.topY + HUD_ROW_DY + 1` (3 today).
 */
export const BOSS_FILL_Y: number = HUD_ROW_DY + 1;
