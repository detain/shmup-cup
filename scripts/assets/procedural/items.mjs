/**
 * The power capsule `items/capsule` (12×8, 2 frames): an orange-red pill with a dark rim
 * and a highlight band; frame 1 is the bright half of its blink (`blink: [0, 1]`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * Distance-like test for a rounded rectangle (pill).
 *
 * @param {number} x - Pixel column.
 * @param {number} y - Pixel row.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {number} inset - Shrinks the shape by this many pixels.
 * @returns {boolean} Whether the pixel centre lies inside.
 */
function insidePill(x, y, w, h, inset) {
  const r = h / 2 - inset;
  const cx = Math.min(Math.max(x + 0.5, r + inset), w - r - inset);
  const cy = h / 2;
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Draws one capsule frame.
 *
 * @param {boolean} bright - The lit blink frame.
 * @returns {Image} 12×8 frame.
 */
function capsule(bright) {
  const w = 12;
  const h = 8;
  const rim = color('#5a1408');
  const body = color(bright ? '#ff7a30' : '#e04a18');
  const band = color(bright ? '#ffd080' : '#f89850');
  const glint = color('#ffffff');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!insidePill(x, y, w, h, 0)) continue;
      if (!insidePill(x, y, w, h, 1)) setPixel(image, x, y, rim);
      else setPixel(image, x, y, y === 2 ? band : body);
    }
  }
  if (bright) {
    setPixel(image, 3, 2, glint);
    setPixel(image, 4, 2, glint);
  }
  return image;
}

/**
 * Generates the capsule sprite.
 *
 * @returns {SpriteDef[]} `items/capsule`.
 */
export function generate() {
  return [
    makeSprite('items/capsule', [capsule(false), capsule(true)], 'items', {
      animations: { blink: [0, 1] },
    }),
  ];
}
