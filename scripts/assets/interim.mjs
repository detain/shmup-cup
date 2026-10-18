/**
 * The interim art stage (plan_resolution.md R2-01, decisions W4-4 / W4-5): until the art bible's
 * v2 art arrives (R3 / R4 / R5), the asset pipeline upscales every v1-scale sprite source
 * nearest-neighbour by the art scale, so the 640×360 frame draws the v1 placeholder art at its
 * new size.
 *
 * **The sampling.** Plain nearest-neighbour: an image `w × h` becomes `⌈s·w⌉ × ⌈s·h⌉`, and
 * destination pixel `d` takes source pixel `⌊d / s⌋` (for s = 3/2: `⌊2d / 3⌋`) — on every axis,
 * with every channel (alpha included) copied as is. R2-02's rescale tool rounds a stage's raster
 * `bands` to `⌈s·b⌉`, which is exactly where this sampling puts the edges of a band's art (the
 * pixel-centre rule would land the `.5` boundaries a pixel higher). Explicit anchors become
 * `⌈s·a⌉`. Every computation is whole-number arithmetic on the scale's exact fraction
 * ({@link parseArtScale}), so the output is identical on every machine.
 *
 * **What is never upscaled** (W4-5): the terrain tilesets (`terrain.mjs` draws them at the tile
 * size itself), `ui/pixel` (the renderer stretches it as one texel), real-art PNG overrides
 * (v2-native: drawn at the art bible's sizes) and every source marked `native: true` (a pixel
 * map's `"native"` key, `makeSprite`'s `native` option — what R3 / R4 redraws set). The pipeline
 * (`collectSprites`) applies the rule; this module only scales.
 *
 * **The interim font** (W4-4): the shipped `pixel6x8.font.json` stays the source; at s = 3/2 the
 * pipeline turns it into a 9 × 12 cell, a 15-px line and a 9-px advance ({@link scaleFont}).
 *
 * **Public API.** {@link INTERIM_ART_SCALE}, {@link parseArtScale}, {@link scaleLength},
 * {@link scaleImage}, {@link scaleAnchor}, {@link scaleSprite}, {@link scaleFont}; typedef
 * {@link ArtScale}.
 *
 * @module
 */
import { createImage } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./sprite-source.mjs').SpriteDef} SpriteDef */
/** @typedef {import('./font.mjs').FontMetrics} FontMetrics */

/**
 * The art scale the pipeline builds the atlas at by default: the art's pixel scale relative to the
 * v1 sprite sources — a mirror of `@shmup/core` `ART_SCALE` (1 until R2-01's flip, then 3/2),
 * pinned to it by `test/scripts/assets/terrain-size.test.ts`. A constant of its own rather than an
 * import (like `terrain.mjs`' `TILE_SIZE`): the pipeline's input hash covers `scripts/assets/**`
 * only, so a change here re-draws the atlas.
 */
export const INTERIM_ART_SCALE = 1;

/** Largest denominator {@link parseArtScale} looks for (3/2 needs 2). */
const MAX_DENOMINATOR = 64;

/**
 * An art scale as an exact fraction `num / den` (lowest terms, both whole and positive).
 *
 * @typedef {object} ArtScale
 * @property {number} num - Numerator.
 * @property {number} den - Denominator.
 */

/**
 * Reads an art scale as an exact fraction.
 *
 * @param {number} scale - The scale: a positive number that is a fraction with a denominator of
 *   at most 64 (1, 3/2, 2, 4/3 …).
 * @returns {ArtScale} Its fraction in lowest terms (`1.5` → `{ num: 3, den: 2 }`).
 * @throws {RangeError} When `scale` is not a positive finite number, or not such a fraction.
 *
 * @example
 * parseArtScale(1.5); // → { num: 3, den: 2 }
 */
export function parseArtScale(scale) {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`art scale must be a positive number, got ${String(scale)}`);
  }
  for (let den = 1; den <= MAX_DENOMINATOR; den++) {
    const num = scale * den;
    if (Number.isInteger(num) && Number.isSafeInteger(num)) return { num, den };
  }
  throw new RangeError(
    `art scale must be a fraction with a denominator of at most ${MAX_DENOMINATOR}, got ${scale}`,
  );
}

/**
 * Scales a length: `⌈s·n⌉`.
 *
 * @param {number} n - A whole number of pixels (a size, an anchor coordinate, an advance).
 * @param {number} scale - The art scale ({@link parseArtScale}).
 * @returns {number} `⌈n · scale⌉`, computed in whole numbers.
 * @throws {RangeError} When `scale` is not a valid art scale or `n` is not a whole number.
 *
 * @example
 * scaleLength(5, 1.5); // → 8
 */
export function scaleLength(n, scale) {
  if (!Number.isSafeInteger(n)) throw new RangeError(`length must be a whole number, got ${n}`);
  const { num, den } = parseArtScale(scale);
  return ceilDiv(n * num, den);
}

/**
 * `⌈a / b⌉` for whole numbers, `b > 0`.
 *
 * @param {number} a - Dividend (any whole number).
 * @param {number} b - Divisor (positive whole number).
 * @returns {number} The ceiling of the quotient.
 */
function ceilDiv(a, b) {
  return -Math.floor(-a / b);
}

/**
 * Upscales (or downscales) an image nearest-neighbour by the art scale.
 *
 * @remarks
 * Destination column `x` reads source column `⌊x · den / num⌋` (for 3/2: `⌊2x / 3⌋`), and the same
 * for rows; all four channels are copied, so alpha and colours are kept exactly. At scale 1 the
 * result equals the input (a new image all the same).
 *
 * @param {Image} image - The source (not modified).
 * @param {number} scale - The art scale ({@link parseArtScale}).
 * @returns {Image} A new `⌈s·w⌉ × ⌈s·h⌉` image.
 * @throws {RangeError} When `scale` is not a valid art scale.
 *
 * @example
 * scaleImage(image6x8, 1.5); // → a 9 × 12 image
 */
export function scaleImage(image, scale) {
  const { num, den } = parseArtScale(scale);
  const width = ceilDiv(image.width * num, den);
  const height = ceilDiv(image.height * num, den);
  const out = createImage(width, height);
  const columns = new Int32Array(width);
  for (let x = 0; x < width; x++) columns[x] = Math.floor((x * den) / num);
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y * den) / num) * image.width;
    for (let x = 0; x < width; x++) {
      const from = (row + columns[x]) * 4;
      const to = (y * width + x) * 4;
      out.data[to] = image.data[from];
      out.data[to + 1] = image.data[from + 1];
      out.data[to + 2] = image.data[from + 2];
      out.data[to + 3] = image.data[from + 3];
    }
  }
  return out;
}

/**
 * Scales an explicit anchor: `[⌈s·ax⌉, ⌈s·ay⌉]`.
 *
 * @param {[number, number] | null} anchor - Anchor in pixels from the frame's top-left, or `null`
 *   (the default centre, which the pipeline computes from the scaled frame 0 instead).
 * @param {number} scale - The art scale ({@link parseArtScale}).
 * @returns {[number, number] | null} The scaled anchor, or `null`.
 * @throws {RangeError} When `scale` is not a valid art scale.
 *
 * @example
 * scaleAnchor([8, 3], 1.5); // → [12, 5]
 */
export function scaleAnchor(anchor, scale) {
  if (anchor === null) return null;
  return [scaleLength(anchor[0], scale), scaleLength(anchor[1], scale)];
}

/**
 * Scales a sprite: every frame ({@link scaleImage}) and its explicit anchor ({@link scaleAnchor}).
 *
 * @remarks
 * Name, frame count, animations, `hitFlash`, `origin` and `group` are kept, so sprite ids and the
 * atlas groups never move. The caller decides what to scale — this function does not look at
 * `native`.
 *
 * @param {SpriteDef} sprite - The source sprite (not modified).
 * @param {number} scale - The art scale ({@link parseArtScale}).
 * @returns {SpriteDef} A new sprite.
 * @throws {RangeError} When `scale` is not a valid art scale.
 */
export function scaleSprite(sprite, scale) {
  return {
    ...sprite,
    anchor: scaleAnchor(sprite.anchor, scale),
    frames: sprite.frames.map((frame) => scaleImage(frame, scale)),
  };
}

/**
 * Scales a bitmap font built by `font.mjs` `buildFontSprite` (the interim font, W4-4): every glyph
 * frame nearest-neighbour, the cell, the line height and every advance `⌈s·n⌉` (6 × 8 / 10 / 6 →
 * 9 × 12 / 15 / 9 at 3/2).
 *
 * @param {{ sprite: SpriteDef, metrics: FontMetrics }} font - The font sprite and its metrics
 *   (not modified).
 * @param {number} scale - The art scale ({@link parseArtScale}).
 * @returns {{ sprite: SpriteDef, metrics: FontMetrics }} The scaled sprite (same name, frame
 *   names and anchor `[0, 0]`) and metrics.
 * @throws {RangeError} When `scale` is not a valid art scale.
 *
 * @example
 * scaleFont(buildFontSprite(pixel6x8), 1.5).metrics.cellWidth; // → 9
 */
export function scaleFont(font, scale) {
  /** @type {FontMetrics['glyphs']} */
  const glyphs = {};
  for (const [code, glyph] of Object.entries(font.metrics.glyphs)) {
    glyphs[code] = { frame: glyph.frame, advance: scaleLength(glyph.advance, scale) };
  }
  return {
    sprite: scaleSprite(font.sprite, scale),
    metrics: {
      sprite: font.metrics.sprite,
      lineHeight: scaleLength(font.metrics.lineHeight, scale),
      cellWidth: scaleLength(font.metrics.cellWidth, scale),
      cellHeight: scaleLength(font.metrics.cellHeight, scale),
      glyphs,
    },
  };
}
