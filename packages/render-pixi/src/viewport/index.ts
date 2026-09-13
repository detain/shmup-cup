/**
 * # viewport — scale modes and letterboxing math
 *
 * **Responsibility.** Computes where the low-resolution frame (384×216) goes on the
 * physical canvas for each **scale mode** (core `config` `SCALE_MODES`, plan M2-08):
 *
 * - `integer` (the default) — the largest *integer* scale that fits, centred, with a letterbox;
 *   every frame pixel is the same number of screen pixels ({@link computeIntegerViewport}).
 * - `fit` — the largest scale that fits keeping the 16:9 aspect ratio, not a whole number: the
 *   frame is still sampled nearest-neighbour, so some pixel rows / columns come out one screen
 *   pixel wider than others, but the letterbox is as thin as it can be.
 * - `stretch` — the whole display, the aspect ratio ignored (x and y scaled separately).
 *
 * Pure functions — no Pixi, no DOM — so they are unit-tested in Node.
 *
 * Examples (integer): 1920×1080 → ×5 exactly (Tizen UHD web apps); 1280×720 → ×3 = 1152×648
 * with a 64/36 px border (Tizen FHD); 3840×2160 → ×10. The same 1280×720 display in `fit` gives
 * ×3.33 = 1280×720, no border.
 *
 * **Implements.** shmup_feat.md §3 (integer upscale, nearest-neighbour, letterbox; the scale
 * modes integer / fit / stretch), shmup_feat.md §21 (the display option), shmup_tech.md §2.2
 * (1080p/720p web resolutions → 384×216 ×5 / ×3).
 *
 * **Public API.** {@link computeViewport}, {@link computeIntegerViewport}, {@link Viewport}.
 *
 * @module
 */
import { defineModule, type ScaleMode } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'viewport',
  status: 'implemented',
  specRefs: ['shmup_feat.md §3', 'shmup_feat.md §21', 'shmup_tech.md §2.2'],
});

/** Placement of the scaled frame inside the display, in CSS/canvas pixels. */
export interface Viewport {
  /** The scale mode that produced it. */
  readonly mode: ScaleMode;
  /**
   * The uniform scale: the integer factor (≥ 1) in `integer` mode, the fractional one in `fit`,
   * and the smaller of {@link Viewport.scaleX} / {@link Viewport.scaleY} in `stretch`.
   */
  readonly scale: number;
  /** Horizontal scale of the frame (`width / baseWidth`). */
  readonly scaleX: number;
  /** Vertical scale of the frame (`height / baseHeight`). */
  readonly scaleY: number;
  /** Left offset of the frame. */
  readonly x: number;
  /** Top offset of the frame. */
  readonly y: number;
  /** Scaled frame width. */
  readonly width: number;
  /** Scaled frame height. */
  readonly height: number;
}

/**
 * Largest integer scale of `baseWidth × baseHeight` that fits in the display, centred.
 * Displays smaller than the base frame get scale 1 (the frame is cropped, never blurred).
 *
 * @remarks
 * Offsets are floored, so an odd leftover puts the extra pixel on the right/bottom.
 * When the display is smaller than the frame, `x` / `y` are negative (the frame is
 * centred and cropped on both sides).
 *
 * @param displayWidth - Available width in pixels.
 * @param displayHeight - Available height in pixels.
 * @param baseWidth - Internal frame width (e.g. 384).
 * @param baseHeight - Internal frame height (e.g. 216).
 * @returns The integer viewport.
 *
 * @example
 * ```ts
 * computeIntegerViewport(1920, 1080, 384, 216);
 * // → { mode: 'integer', scale: 5, scaleX: 5, scaleY: 5, x: 0, y: 0, width: 1920, height: 1080 }
 * computeIntegerViewport(1280, 720, 384, 216);
 * // → { …, scale: 3, x: 64, y: 36, width: 1152, height: 648 }
 * ```
 */
export function computeIntegerViewport(
  displayWidth: number,
  displayHeight: number,
  baseWidth: number,
  baseHeight: number,
): Viewport {
  const fit = Math.min(displayWidth / baseWidth, displayHeight / baseHeight);
  const scale = Math.max(1, Math.floor(fit));
  const width = baseWidth * scale;
  const height = baseHeight * scale;
  return {
    mode: 'integer',
    scale,
    scaleX: scale,
    scaleY: scale,
    x: Math.floor((displayWidth - width) / 2),
    y: Math.floor((displayHeight - height) / 2),
    width,
    height,
  };
}

/**
 * Places the frame on the display in a scale mode (see the module docs).
 *
 * @remarks
 * `integer` is {@link computeIntegerViewport}. `fit` scales by `min(displayW / baseW, displayH /
 * baseH)` (below 1 on a display smaller than the frame — the frame shrinks rather than being
 * cropped), rounds the scaled size to whole pixels and centres it (offsets floored). `stretch`
 * covers the display exactly (`x = y = 0`). Sizes that are not positive numbers count as 1.
 *
 * @param mode - The scale mode.
 * @param displayWidth - Available width in pixels.
 * @param displayHeight - Available height in pixels.
 * @param baseWidth - Internal frame width.
 * @param baseHeight - Internal frame height.
 * @returns The viewport.
 *
 * @example
 * ```ts
 * computeViewport('fit', 1280, 720, 384, 216);     // → scale 3.33…, 1280×720 at (0, 0)
 * computeViewport('stretch', 1000, 1000, 384, 216); // → scaleX 2.60…, scaleY 4.62…
 * ```
 */
export function computeViewport(
  mode: ScaleMode,
  displayWidth: number,
  displayHeight: number,
  baseWidth: number,
  baseHeight: number,
): Viewport {
  const dw = displayWidth > 0 ? displayWidth : 1;
  const dh = displayHeight > 0 ? displayHeight : 1;
  if (mode === 'stretch') {
    const scaleX = dw / baseWidth;
    const scaleY = dh / baseHeight;
    return {
      mode,
      scale: Math.min(scaleX, scaleY),
      scaleX,
      scaleY,
      x: 0,
      y: 0,
      width: dw,
      height: dh,
    };
  }
  if (mode === 'fit') {
    const scale = Math.min(dw / baseWidth, dh / baseHeight);
    const width = Math.max(1, Math.round(baseWidth * scale));
    const height = Math.max(1, Math.round(baseHeight * scale));
    return {
      mode,
      scale,
      scaleX: width / baseWidth,
      scaleY: height / baseHeight,
      x: Math.floor((dw - width) / 2),
      y: Math.floor((dh - height) / 2),
      width,
      height,
    };
  }
  return computeIntegerViewport(dw, dh, baseWidth, baseHeight);
}
