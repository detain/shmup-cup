/**
 * Utility frames for the renderer:
 *
 * - `ui/pixel` — one opaque white pixel; the UI/HUD draw rectangles by scaling and
 *   tinting it, so rects batch with sprites on the same atlas page.
 * - `ui/missing` — 8×8 magenta/black checker the renderer shows for a sprite name that
 *   is not in the atlas (impossible to overlook, never a crash).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * Generates the utility sprites.
 *
 * @returns {SpriteDef[]} `ui/pixel` (anchor `[0, 0]`) and `ui/missing` (centred).
 */
export function generate() {
  const pixel = createImage(1, 1);
  setPixel(pixel, 0, 0, color('#ffffff'));
  const missing = createImage(8, 8);
  const magenta = color('#ff00ff');
  const black = color('#000000');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      setPixel(missing, x, y, ((x >> 1) + (y >> 1)) % 2 === 0 ? magenta : black);
    }
  }
  return [
    makeSprite('ui/pixel', [pixel], 'ui', { anchor: [0, 0] }),
    makeSprite('ui/missing', [missing], 'ui'),
  ];
}
