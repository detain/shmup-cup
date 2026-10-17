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
 * The frame constants are re-exported from `scripts/frame.mjs` (the scripts' mirror of
 * `@shmup/core`, pinned by `test/scripts/frame.test.ts`), so a spec imports everything it needs
 * from this one module. They are the **frame**: positions that come from content (an area of a
 * stage's art, a camera y, a Mode-7 horizon) are not derived from them (plan §2.6, R2-03).
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
import { CAPTURE_SCALE, FRAME_H, FRAME_W } from '../../scripts/frame.mjs';

export {
  FRAME_CX,
  FRAME_CY,
  FRAME_H,
  FRAME_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  PLAYFIELD_CY,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
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
