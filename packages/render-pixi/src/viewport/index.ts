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
 * modes integer / fit / stretch; the classic 4:3 mode with pillarbox side art — M3-02),
 * shmup_feat.md §18 (the ultra-wide desktop mode — M3-02), shmup_feat.md §21 (the display
 * option), shmup_tech.md §2.2 (1080p/720p web resolutions → 384×216 ×5 / ×3).
 *
 * Since M3-02 the **aspect modes** of `core/config` `ASPECT_MODES` sit on top
 * ({@link computeAspectViewport}): `normal` (the whole display), `wide` (a 21:9 window for
 * ultra-wide desktops) and `classic` (a 4:3 window — the console look on a widescreen TV). The
 * frame is never cropped; the mode only limits the **window** it is centred in, and the leftover
 * width is reported as side panels the renderer fills with the stage's dimmed backdrop.
 *
 * **Public API.** {@link computeViewport}, {@link computeIntegerViewport}, {@link Viewport};
 * M3-02 {@link computeAspectViewport}, {@link AspectViewport}, {@link ASPECT_RATIOS}.
 *
 * @module
 */
import { defineModule, type ScaleMode } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'viewport',
  status: 'implemented',
  specRefs: ['shmup_feat.md §3', 'shmup_feat.md §18', 'shmup_feat.md §21', 'shmup_tech.md §2.2'],
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

/**
 * Aspect ratio of the window the frame is placed in, per `core/config` `ASPECT_MODES` (plan
 * M3-02): `normal` uses the whole display (0 = no limit), `wide` the ultra-wide 64:27 (21:9) of a
 * Darius-style cabinet, `classic` the 4:3 of a console on a widescreen TV.
 */
export const ASPECT_RATIOS: readonly number[] = Object.freeze([0, 64 / 27, 4 / 3]);

/** Where the frame and its side panels go on the display ({@link computeAspectViewport}). */
export interface AspectViewport {
  /** The frame's placement inside the window. */
  readonly viewport: Viewport;
  /** Left edge of the window on the display. */
  readonly windowX: number;
  /** Top edge of the window. */
  readonly windowY: number;
  /** Window width in pixels. */
  readonly windowWidth: number;
  /** Window height in pixels. */
  readonly windowHeight: number;
  /** Width of the side panel left of the window (0 = none). */
  readonly panelLeft: number;
  /** Width of the side panel right of the window. */
  readonly panelRight: number;
}

/**
 * Places the frame on the display in an **aspect mode** (plan M3-02, shmup_feat.md §18 "[P2]
 * widescreen Darius-style ultra-wide mode for desktop" and §3 "classic 4:3 mode with pillarbox side
 * art").
 *
 * @remarks
 * The frame is never cropped and never distorted beyond what the scale mode already does: the
 * aspect mode only decides the **window** it is placed in. `normal` is the whole display (the
 * leftover is plain letterbox, as before). `wide` and `classic` limit the window to the largest
 * rectangle of {@link ASPECT_RATIOS} that fits, centred, and report the leftover width as **side
 * panels** — the renderer fills them with the stage's dimmed backdrop instead of black, which is
 * what makes an ultra-wide monitor look like a wide cabinet and a 16:9 TV look like a 4:3 console.
 * A window narrower than the display leaves panels; one as wide as the display leaves none.
 *
 * @param aspect - Index into {@link ASPECT_RATIOS} (`ASPECT_MODES` order).
 * @param mode - The scale mode inside the window.
 * @param displayWidth - Available width in pixels.
 * @param displayHeight - Available height in pixels.
 * @param baseWidth - Internal frame width.
 * @param baseHeight - Internal frame height.
 * @returns The frame's placement (display coordinates) and the side panels.
 *
 * @example
 * ```ts
 * computeAspectViewport(2, 'integer', 1920, 1080, 384, 216).panelLeft; // → 240 (4:3 on 16:9)
 * computeAspectViewport(0, 'integer', 1920, 1080, 384, 216).panelLeft; // → 0
 * ```
 */
export function computeAspectViewport(
  aspect: number,
  mode: ScaleMode,
  displayWidth: number,
  displayHeight: number,
  baseWidth: number,
  baseHeight: number,
): AspectViewport {
  const dw = displayWidth > 0 ? displayWidth : 1;
  const dh = displayHeight > 0 ? displayHeight : 1;
  const ratio = ASPECT_RATIOS[aspect] ?? 0;
  let windowWidth = dw;
  let windowHeight = dh;
  if (ratio > 0) {
    const byHeight = Math.floor(dh * ratio);
    if (byHeight <= dw) windowWidth = Math.max(1, byHeight);
    else windowHeight = Math.max(1, Math.floor(dw / ratio));
  }
  const windowX = Math.floor((dw - windowWidth) / 2);
  const windowY = Math.floor((dh - windowHeight) / 2);
  const inner = computeViewport(mode, windowWidth, windowHeight, baseWidth, baseHeight);
  const viewport: Viewport = {
    mode: inner.mode,
    scale: inner.scale,
    scaleX: inner.scaleX,
    scaleY: inner.scaleY,
    x: inner.x + windowX,
    y: inner.y + windowY,
    width: inner.width,
    height: inner.height,
  };
  return {
    viewport,
    windowX,
    windowY,
    windowWidth,
    windowHeight,
    panelLeft: windowX,
    panelRight: dw - windowX - windowWidth,
  };
}
