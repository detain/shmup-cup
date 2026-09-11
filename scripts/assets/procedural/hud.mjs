/**
 * HUD pieces for the bottom bar (decision D20: 8-px bars outside the playfield):
 *
 * - `hud/meter-slot` (40×8): one power-meter slot box — frame 0 normal, 1 highlighted
 *   (the cursor), 2 disabled (maxed / unavailable).
 * - `hud/meter-labels` (36×5): the seven slot labels in a tiny 3×5 pixel script, white
 *   for tinting — `SPEED`, `MISSILE`, `DOUBLE`, `LASER`, `OPTION`, `?`, `!` (frames 0…6,
 *   the meter's slot order, `shmup_feat.md` §6A).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Labels of the seven meter slots, in slot order. */
export const METER_LABELS = /** @type {const} */ ([
  'SPEED',
  'MISSILE',
  'DOUBLE',
  'LASER',
  'OPTION',
  '?',
  '!',
]);

/** Original 3×5 micro glyphs for the letters the labels need. */
const MICRO = /** @type {Record<string, string[]>} */ ({
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
});

/** Label frame width: the longest label (`MISSILE`, 7 glyphs × 4 px − 1) fits with a margin. */
const LABEL_W = 36;

/** Label frame height: one row of 3×5 micro glyphs. */
const LABEL_H = 5;

/**
 * Renders one label, centred, 1 px between glyphs.
 *
 * @param {string} text - Upper-case label.
 * @returns {Image} 36×5 frame.
 * @throws {Error} When a character has no micro glyph (a bug in {@link METER_LABELS}).
 */
function label(text) {
  const image = createImage(LABEL_W, LABEL_H);
  const white = color('#ffffff');
  const width = text.length * 4 - 1;
  let pen = Math.floor((LABEL_W - width) / 2);
  for (const ch of text) {
    const glyph = MICRO[ch];
    if (glyph === undefined) throw new Error(`no micro glyph for "${ch}"`);
    glyph.forEach((row, y) => {
      for (let x = 0; x < 3; x++) if (row.charAt(x) === '#') setPixel(image, pen + x, y, white);
    });
    pen += 4;
  }
  return image;
}

/**
 * Renders one slot box.
 *
 * @param {string} border - Border colour.
 * @param {string} fill - Fill colour.
 * @returns {Image} 40×8 frame.
 */
function slot(border, fill) {
  const w = 40;
  const h = 8;
  const image = createImage(w, h);
  const b = color(border);
  const f = color(fill);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      if (!corner) setPixel(image, x, y, edge ? b : f);
    }
  }
  return image;
}

/**
 * Generates the HUD sprites.
 *
 * @returns {SpriteDef[]} Meter slot and meter labels (anchor top-left).
 */
export function generate() {
  return [
    makeSprite(
      'hud/meter-slot',
      [slot('#5a6a98', '#18204a'), slot('#f8d030', '#5a3c10'), slot('#3a4058', '#1c2030')],
      'hud',
      { anchor: [0, 0], animations: { normal: [0], highlighted: [1], disabled: [2] } },
    ),
    makeSprite('hud/meter-labels', METER_LABELS.map(label), 'hud', { anchor: [0, 0] }),
  ];
}
