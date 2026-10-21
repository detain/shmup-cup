/**
 * The title logo (plan M1-16), split out of `ui.mjs` by plan R4-P.P1 so every R4 subtask owns
 * one generator:
 *
 * - `ui/logo` — the title logo "SHMUP CUP": original 5×7 block letters drawn ×3, a warm vertical
 *   gradient (yellow → orange → red), a dark outline and a drop shadow; anchored at its centre.
 *   At an art scale ≠ 1 the bible § 5.11's v2 logo replaces it **native** (RR-1: a generator
 *   branch, the v1 art byte-identical): the same lettering drawn ×6 — banded lemon → orange →
 *   red in three flat rows, a 2-px navy outline and a hard 4-px offset shadow — ≈ 320 × 64 px
 *   (inside the bible's ≤ 400 × 80 cap), the red bottom band the same `#e04828` the browser
 *   specs look for. Drawn from the bible's text and the v1 logo (RR-4: no FLUX winner).
 *
 * Only exactly rounded maths (`+ − × ÷`).
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
 * Renders the logo (the v1 art).
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

/** Pixels per letter pixel on the v2 path (bible § 5.11: ≈320×64 — 53 cells × 6 + margins). */
const LOGO_SCALE_V2 = 6;

/** Outline ring width of the v2 logo (px). */
const OUTLINE_V2 = 2;

/** Hard shadow offset of the v2 logo (px down-right). */
const SHADOW_V2 = 4;

/** Margin around the v2 letters: the ring plus the shadow's reach. */
const PAD_V2 = OUTLINE_V2 + SHADOW_V2;

/**
 * Renders the v2 logo: the same lettering at ×6, the letters in three flat colour bands
 * (lemon → orange → red, the bottom band `#e04828`), a 2-px navy outline and a hard 4-px
 * offset shadow — the bible § 5.11's row, native (RR-1, R4-05.E1).
 *
 * @returns {Image} The logo frame.
 */
function logoV2() {
  const s = LOGO_SCALE_V2;
  const cells = LOGO_TEXT.length * (LETTER_W + GAP) - GAP;
  const textW = cells * s;
  const textH = LETTER_H * s;
  const w = textW + 2 * PAD_V2;
  const h = textH + 2 * PAD_V2;
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
              mask[(PAD_V2 + cy * s + py) * w + PAD_V2 + (pen + cx) * s + px] = 1;
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
  const lemon = color('#f8f070');
  const orange = color('#f8a030');
  const red = color('#e04828');
  const at = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  // 1. The hard offset shadow, 2. the 2-px ring, 3. the three flat bands (7 letter rows of 6
  // px, two rows per band's colour: lemon 0–13, orange 14–27, red 28–41).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x - SHADOW_V2, y - SHADOW_V2)) setPixel(image, x, y, shadow);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y)) continue;
      let near = false;
      for (let dy = -OUTLINE_V2; dy <= OUTLINE_V2 && !near; dy++) {
        for (let dx = -OUTLINE_V2; dx <= OUTLINE_V2 && !near; dx++) near = at(x + dx, y + dy);
      }
      if (near) setPixel(image, x, y, outline);
    }
  }
  for (let y = 0; y < h; y++) {
    const band = y - PAD_V2;
    const fill = band < textH / 3 ? lemon : band < (2 * textH) / 3 ? orange : red;
    for (let x = 0; x < w; x++) {
      if (at(x, y)) setPixel(image, x, y, fill);
    }
  }
  return image;
}

/**
 * Generates the title logo sprite.
 *
 * @param {{ artScale?: number }} [options] - The build's art scale; anything other than 1 draws
 *   the native v2 logo (the module docblock), 1 (the default) the v1 art byte for byte.
 * @returns {SpriteDef[]} `ui/logo` (centred).
 */
export function generate(options = {}) {
  if ((options.artScale ?? 1) !== 1) {
    const title = logoV2();
    return [
      makeSprite('ui/logo', [title], 'logo', {
        anchor: [Math.floor(title.width / 2), Math.floor(title.height / 2)],
        native: true,
      }),
    ];
  }
  const title = logo();
  return [
    makeSprite('ui/logo', [title], 'logo', {
      anchor: [Math.floor(title.width / 2), Math.floor(title.height / 2)],
    }),
  ];
}
