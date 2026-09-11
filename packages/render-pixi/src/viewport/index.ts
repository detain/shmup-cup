/**
 * # viewport — integer-scale letterboxing math
 *
 * **Responsibility.** Computes where the low-resolution frame (384×216) goes on the
 * physical canvas: the largest *integer* scale that fits, centred, with a letterbox.
 * Pure function — no Pixi, no DOM — so it is unit-tested in Node.
 *
 * Examples: 1920×1080 → ×5 exactly (Tizen UHD web apps); 1280×720 → ×3 = 1152×648
 * with a 64/36 px border (Tizen FHD); 3840×2160 → ×10.
 *
 * **Implements.** shmup_feat.md §3 (integer upscale, nearest-neighbour, letterbox),
 * shmup_tech.md §2.2 (1080p/720p web resolutions → 384×216 ×5 / ×3).
 *
 * **Public API.** {@link computeIntegerViewport}, {@link Viewport}.
 *
 * **Planned.** "fit" (non-integer, nearest) and "stretch" scale modes (shmup_feat.md §3 [P0]).
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'viewport',
  status: 'partial',
  specRefs: ['shmup_feat.md §3', 'shmup_tech.md §2.2'],
});

/** Placement of the scaled frame inside the display, in CSS/canvas pixels. */
export interface Viewport {
  /** Integer scale factor (≥ 1). */
  readonly scale: number;
  /** Left offset of the frame. */
  readonly x: number;
  /** Top offset of the frame. */
  readonly y: number;
  /** Scaled frame width (`baseWidth × scale`). */
  readonly width: number;
  /** Scaled frame height (`baseHeight × scale`). */
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
 * // → { scale: 5, x: 0, y: 0, width: 1920, height: 1080 }
 * computeIntegerViewport(1280, 720, 384, 216);
 * // → { scale: 3, x: 64, y: 36, width: 1152, height: 648 }
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
    scale,
    x: Math.floor((displayWidth - width) / 2),
    y: Math.floor((displayHeight - height) / 2),
    width,
    height,
  };
}
