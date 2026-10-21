/**
 * Placeholder art of the Direct mode's colour items (plan M2-05, `shmup_feat.md` §9), split out
 * of `direct.mjs` by plan R4-P.P1 so every R4 subtask owns one generator:
 *
 * - `items/direct-red`, `-green`, `-blue`, `-orange`, `-yellow` (10×10, 2 frames): the colour
 *   items, glossy orbs with a highlight (frame 1 the bright half of the blink);
 *   `items/direct-octagon` (10×10, 2 frames): the red octagon that switches the main-shot family.
 *
 * Only exactly rounded maths (square roots, `+ − × ÷`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** The colour items: dark, body, light. */
const ITEM_COLORS = {
  red: ['#5a0c0c', '#e02828', '#ff9090'],
  green: ['#0c4014', '#28c040', '#98ff98'],
  blue: ['#0c1a5a', '#2860e8', '#90b8ff'],
  orange: ['#5a2c08', '#f08020', '#ffd090'],
  yellow: ['#5a4808', '#f0d020', '#fff8a0'],
  octagon: ['#5a0c0c', '#d82020', '#ffb0b0'],
};

/**
 * Draws one colour item frame: a glossy orb, or for the octagon an eight-sided plate with a white
 * centre mark.
 *
 * @param {keyof typeof ITEM_COLORS} name - The item.
 * @param {boolean} bright - The lit half of the blink.
 * @returns {Image} 10×10 frame.
 */
function itemFrame(name, bright) {
  const size = 10;
  const image = createImage(size, size);
  const [dark, body, light] = ITEM_COLORS[name].map((c) => color(c));
  const white = color('#ffffff');
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const inside =
        name === 'octagon'
          ? Math.abs(dx) <= 4.5 && Math.abs(dy) <= 4.5 && Math.abs(dx) + Math.abs(dy) <= 6.5
          : dx * dx + dy * dy <= 4.6 * 4.6;
      if (!inside) continue;
      const rim =
        name === 'octagon'
          ? Math.abs(dx) > 3.5 || Math.abs(dy) > 3.5 || Math.abs(dx) + Math.abs(dy) > 5.5
          : dx * dx + dy * dy > 3.6 * 3.6;
      setPixel(image, x, y, rim ? dark : bright ? light : body);
    }
  }
  if (name === 'octagon') {
    for (let i = 3; i <= 6; i++) {
      setPixel(image, i, 4, white);
      setPixel(image, i, 5, white);
    }
  } else {
    setPixel(image, 3, 3, white);
    if (bright) setPixel(image, 4, 3, white);
  }
  return image;
}

/**
 * Generates the Direct-mode colour items.
 *
 * @returns {SpriteDef[]} The six items (see the module docs).
 */
export function generate() {
  return ['red', 'green', 'blue', 'orange', 'yellow', 'octagon'].map((name) =>
    makeSprite(
      `items/direct-${name}`,
      [
        itemFrame(/** @type {keyof typeof ITEM_COLORS} */ (name), false),
        itemFrame(/** @type {keyof typeof ITEM_COLORS} */ (name), true),
      ],
      'direct-items',
      { animations: { blink: [0, 1] } },
    ),
  );
}
