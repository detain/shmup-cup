/**
 * Utility frames for the renderer and the title screen:
 *
 * - `ui/pixel` — one opaque white pixel; the UI/HUD draw rectangles by scaling and
 *   tinting it, so rects batch with sprites on the same atlas page.
 * - `ui/missing` — 8×8 magenta/black checker the renderer shows for a sprite name that
 *   is not in the atlas (impossible to overlook, never a crash).
 * - `ui/logo` — the title logo "SHMUP CUP" (plan M1-16): original 5×7 block letters drawn
 *   ×3, a warm vertical gradient (yellow → orange → red), a dark outline and a drop shadow;
 *   anchored at its centre.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite, mix } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** The logo's text. */
export const LOGO_TEXT = 'SHMUP CUP';

/** Pixels per letter pixel. */
export const LOGO_SCALE = 3;

/** Original 5×7 block letters for the logo (only the letters it needs). */
const LETTERS = /** @type {Record<string, string[]>} */ ({
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
});

/** Letter width in letter pixels. */
const LETTER_W = 5;

/** Letter height in letter pixels. */
const LETTER_H = 7;

/** Gap between letters, in letter pixels (a space is one letter wide). */
const GAP = 1;

/** Margin around the letters for the outline (1 px) and the shadow (2 px). */
const PAD = 3;

/**
 * Renders the logo.
 *
 * @returns {Image} The logo frame.
 * @throws {Error} When the text has a character without a letter (a bug in {@link LOGO_TEXT}).
 */
function logo() {
  const s = LOGO_SCALE;
  const cells = LOGO_TEXT.length * (LETTER_W + GAP) - GAP;
  const textW = cells * s;
  const textH = LETTER_H * s;
  const w = textW + 2 * PAD;
  const h = textH + 2 * PAD;
  // 1. The letter mask (unscaled cells → scaled pixels).
  const mask = new Uint8Array(w * h);
  let pen = 0;
  for (const ch of LOGO_TEXT) {
    if (ch !== ' ') {
      const rows = LETTERS[ch];
      if (rows === undefined) throw new Error(`no logo letter for "${ch}"`);
      for (let cy = 0; cy < LETTER_H; cy++) {
        for (let cx = 0; cx < LETTER_W; cx++) {
          if (rows[cy].charAt(cx) !== '#') continue;
          for (let py = 0; py < s; py++) {
            for (let px = 0; px < s; px++) {
              mask[(PAD + cy * s + py) * w + PAD + (pen + cx) * s + px] = 1;
            }
          }
        }
      }
    }
    pen += LETTER_W + GAP;
  }
  const image = createImage(w, h);
  const shadow = color('#0a0f26');
  const outline = color('#1b2a4a');
  const top = color('#f8f070');
  const middle = color('#f8a030');
  const bottom = color('#e04828');
  const highlight = color('#fffff0');
  const at = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  // 2. Drop shadow (2 px down-right), 3. outline (8-neighbourhood), 4. the gradient letters.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x - 2, y - 2)) setPixel(image, x, y, shadow);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1 && !near; dx++) near = at(x + dx, y + dy);
      }
      if (near) setPixel(image, x, y, outline);
    }
  }
  for (let y = 0; y < h; y++) {
    const t = (y - PAD) / (textH - 1);
    const fill = t < 0.5 ? mix(top, middle, t * 2) : mix(middle, bottom, (t - 0.5) * 2);
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      // A one-pixel highlight on each letter pixel's top row reads as a bevel.
      const lit = (y - PAD) % s === 0 && !at(x, y - 1);
      setPixel(image, x, y, lit ? highlight : fill);
    }
  }
  return image;
}

/**
 * Generates the utility sprites.
 *
 * @returns {SpriteDef[]} `ui/pixel` (anchor `[0, 0]`), `ui/missing` (centred) and `ui/logo`
 *   (centred).
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
  const title = logo();
  return [
    makeSprite('ui/pixel', [pixel], 'ui', { anchor: [0, 0] }),
    makeSprite('ui/missing', [missing], 'ui'),
    makeSprite('ui/logo', [title], 'ui', {
      anchor: [Math.floor(title.width / 2), Math.floor(title.height / 2)],
    }),
  ];
}
