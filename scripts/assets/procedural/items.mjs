/**
 * The power capsule `items/capsule` (12×8, 2 frames): an orange-red pill with a dark rim
 * and a highlight band; frame 1 is the bright half of its blink (`blink: [0, 1]`).
 *
 * The blue capsule `items/capsule-blue` (12×8, 2 frames, plan M2-04): the same pill in blue
 * with a white core — the rare pickup that clears the screen's enemies.
 *
 * The point item `items/point` (5×5, 2 frames, plan M2-02): a small gold diamond with a dark
 * rim that cancelled bullets turn into; frame 1 is its twinkle (a white centre and tips).
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

/** Colours of a capsule: rim, body (dim / lit), band (dim / lit). */
const CAPSULE_COLORS = {
  red: { rim: '#5a1408', body: ['#e04a18', '#ff7a30'], band: ['#f89850', '#ffd080'] },
  blue: { rim: '#08164a', body: ['#2458d8', '#4c8cff'], band: ['#78b0ff', '#e0f0ff'] },
};

/**
 * Draws one capsule frame.
 *
 * @param {boolean} bright - The lit blink frame.
 * @param {'red' | 'blue'} [tint] - The capsule's colours (default the red power capsule).
 * @returns {Image} 12×8 frame.
 */
function capsule(bright, tint = 'red') {
  const w = 12;
  const h = 8;
  const colors = CAPSULE_COLORS[tint];
  const rim = color(colors.rim);
  const body = color(colors.body[bright ? 1 : 0]);
  const band = color(colors.band[bright ? 1 : 0]);
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
 * Draws one point item frame: a gold diamond (|dx| + |dy| ≤ 2), rim on its outline.
 *
 * @param {boolean} twinkle - The bright frame (white centre and tips).
 * @returns {Image} 5×5 frame.
 */
function point(twinkle) {
  const image = createImage(5, 5);
  const rim = color('#6a4808');
  const body = color('#ffc830');
  const white = color('#ffffff');
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const d = Math.abs(x - 2) + Math.abs(y - 2);
      if (d > 2) continue;
      const tip = d === 2 && (x === 2 || y === 2);
      setPixel(image, x, y, d === 0 ? white : d === 2 ? (twinkle && tip ? white : rim) : body);
    }
  }
  if (twinkle) setPixel(image, 2, 2, white);
  return image;
}

/**
 * Generates the item sprites.
 *
 * @returns {SpriteDef[]} `items/capsule`, `items/point` and `items/capsule-blue`.
 */
export function generate() {
  return [
    makeSprite('items/capsule', [capsule(false), capsule(true)], 'items', {
      animations: { blink: [0, 1] },
    }),
    makeSprite('items/point', [point(false), point(true)], 'items', {
      animations: { twinkle: [0, 1] },
    }),
    makeSprite('items/capsule-blue', [capsule(false, 'blue'), capsule(true, 'blue')], 'items', {
      animations: { blink: [0, 1] },
    }),
  ];
}
