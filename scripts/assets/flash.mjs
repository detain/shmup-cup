/**
 * Hit-flash silhouettes (decision D30): for every sprite with `hitFlash: true` the
 * pipeline adds a sibling sprite `<name>@flash` whose frame `i` is frame `i` turned
 * white — every pixel keeps its alpha, its colour becomes `#ffffff`.
 *
 * The renderer shows a hit by swapping the sprite id for the flash sprite's id (same
 * frame index, same anchor), which keeps every sprite on one atlas page and one batch —
 * Pixi's tint is multiply-only, so tinting cannot turn a sprite white.
 *
 * **Public API.** {@link makeFlashSprite}, {@link whiteSilhouette}, {@link FLASH_SUFFIX}.
 *
 * @module
 */
import { createImage } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./sprite-source.mjs').SpriteDef} SpriteDef */

/** Suffix of the generated silhouette sprite's name. */
export const FLASH_SUFFIX = '@flash';

/**
 * Turns a frame into its white silhouette.
 *
 * @param {Image} frame - Source pixels.
 * @returns {Image} Same size; RGB = 255 wherever alpha > 0, alpha unchanged; fully
 *   transparent pixels stay `0,0,0,0`.
 */
export function whiteSilhouette(frame) {
  const out = createImage(frame.width, frame.height);
  for (let i = 0; i < frame.data.length; i += 4) {
    const alpha = frame.data[i + 3];
    if (alpha === 0) continue;
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = alpha;
  }
  return out;
}

/**
 * Builds the `<name>@flash` sprite for a hit-flash sprite.
 *
 * @param {SpriteDef} sprite - A sprite with `hitFlash: true`.
 * @returns {SpriteDef} The silhouette sprite: same anchor, same frame count and sizes,
 *   same animations, `hitFlash: false`.
 *
 * @example
 * makeFlashSprite(drifter).name; // → 'enemies/drifter@flash'
 */
export function makeFlashSprite(sprite) {
  return {
    name: sprite.name + FLASH_SUFFIX,
    anchor: sprite.anchor,
    hitFlash: false,
    frames: sprite.frames.map(whiteSilhouette),
    animations: { ...sprite.animations },
    origin: `flash:${sprite.name}`,
  };
}
