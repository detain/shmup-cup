/**
 * HUD pieces for the bottom bar (decision D20: 8-px bars outside the playfield):
 *
 * - `hud/meter-slot` (40×8 at scale 1, 60×12 native at the v2 scale): one power-meter slot box —
 *   frame 0 normal, 1 highlighted (the cursor), 2 disabled (maxed / unavailable).
 * - `hud/meter-labels` (36×5 at scale 1, 54×8 native at the v2 scale): the meter's labels in a
 *   tiny 3×5 / 4×5 pixel script, white for tinting — the seven slot labels `SPEED`, `MISSILE`,
 *   `DOUBLE`, `LASER`, `OPTION`, `?`, `!` (frames 0…6, the meter's slot order, `shmup_feat.md`
 *   §6A), then the names of the Types B–D weapons the MISSILE / DOUBLE / LASER slots may hold
 *   (frames 7…15, plan M2-03), then the Extra Edit weapons' (frames 16…22, plan M3-01), then the
 *   W15-A main weapon types' (frames 23…27) — the order of core `ui` `METER_LABEL_FRAMES`.
 *
 * At the v2 art scale (`options.artScale` ≠ 1, R4-03.C5) both sprites are the art bible §5.11's
 * native sizes — the slot box fills the 12-px bar edge to edge with the §3.4 outline and the §3.5
 * top/left-lit bevel, the labels a redrawn 4×5 script centred in the taller frame — and are
 * `native: true`, so the interim stage leaves them alone. Every v2 colour keeps the palette scan's
 * ≥ 3/255 Chebyshev margin from all eight reserved cycle ramps, so the sprite sheds its STORM
 * exemption in the same step. A call without options (or `artScale: 1`) still draws v1's pixels
 * byte for byte (the scale-1 digest pin).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * The label frames: the seven meter slots in slot order, then the Types B–D weapon names, then the
 * Extra Edit weapons' (M3-01) — the order of core `ui` `METER_LABEL_FRAMES` (a test keeps them
 * equal).
 */
export const METER_LABELS = /** @type {const} */ ([
  'SPEED',
  'MISSILE',
  'DOUBLE',
  'LASER',
  'OPTION',
  '?',
  '!',
  'SPREAD',
  '2-WAY',
  'TORPEDO',
  'TAIL',
  'VERTICAL',
  'FREE WAY',
  'RIPPLE',
  'CYCLONE',
  'TWIN',
  'CONTROL',
  'UPPER',
  'SMALL SP',
  'HAWK',
  '2-WAY BK',
  'BACK DBL',
  'SPR GUN',
  'FLAK',
  'RAIL',
  'SEEKER',
  'CHAIN',
  'BEACON',
]);

/** Original 3×5 micro glyphs for the letters the labels need. */
const MICRO = /** @type {Record<string, string[]>} */ ({
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
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
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  '-': ['...', '...', '###', '...', '...'],
  ' ': ['...', '...', '...', '...', '...'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
});

/**
 * Label frame width: the longest labels (`VERTICAL`, `FREE WAY` — 8 glyphs × 4 px − 1) fit with a
 * margin.
 */
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

/** The v2 slot's width and height (the art bible §5.11's 60×12 — it fills the 12-px bar's row). */
const V2_SLOT_W = 60;
const V2_SLOT_H = 12;

/** The v2 label frame's size (the art bible §5.11's 54×8). */
const V2_LABEL_W = 54;
const V2_LABEL_H = 8;

/**
 * The v2 slot's three states (the bible §3.4 outline, §3.5's top/left-lit bevel). Every colour
 * keeps ≥ 3/255 Chebyshev from all eight reserved ramps (the palette scan's rule — the v2 art is
 * why `hud/meter-slot` leaves its STORM exemption).
 */
const V2_SLOTS = /** @type {const} */ ([
  { border: '#5a6a98', light: '#8898c0', shade: '#323e64', fill: '#18204a' },
  { border: '#f8d030', light: '#f8e888', shade: '#b87810', fill: '#5a3c10' },
  { border: '#3a4058', light: '#4c5878', shade: '#242838', fill: '#202638' },
]);

/**
 * Original 4×5 micro glyphs for the letters the v2 labels need (one row wider than the v1 script,
 * so an eight-glyph label keeps a margin in the 54-px frame).
 */
const MICRO4 = /** @type {Record<string, string[]>} */ ({
  A: ['###.', '#..#', '####', '#..#', '#..#'],
  B: ['###.', '#..#', '##..', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '.###'],
  D: ['##..', '#..#', '#..#', '#..#', '##..'],
  E: ['####', '#...', '###.', '#...', '####'],
  F: ['####', '#...', '###.', '#...', '#...'],
  G: ['.###', '#...', '#.##', '#..#', '.##.'],
  H: ['#..#', '#..#', '####', '#..#', '#..#'],
  I: ['####', '..#.', '..#.', '..#.', '####'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  L: ['#...', '#...', '#...', '#...', '####'],
  M: ['#..#', '####', '####', '#..#', '#..#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['###.', '#..#', '###.', '#...', '#...'],
  R: ['###.', '#..#', '##..', '#.#.', '#..#'],
  S: ['.###', '#...', '###.', '...#', '###.'],
  T: ['####', '..#.', '..#.', '..#.', '..#.'],
  U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#..#', '#..#', '#..#', '#..#', '.#.#'],
  W: ['#..#', '#..#', '####', '####', '#..#'],
  Y: ['#..#', '#..#', '####', '..#.', '..#.'],
  2: ['###.', '...#', '###.', '#...', '####'],
  '-': ['....', '....', '####', '....', '....'],
  ' ': ['....', '....', '....', '....', '....'],
  '?': ['###.', '..#.', '..#.', '....', '..#.'],
  '!': ['..#.', '..#.', '..#.', '....', '..#.'],
});

/**
 * Renders one v2 slot box: border ring with transparent corners, bevel one pixel inside (light
 * top and left, shade bottom and right), the interior filled.
 *
 * @param {{ border: string, light: string, shade: string, fill: string }} state - The state's
 *   colours.
 * @returns {Image} 60×12 frame.
 */
function slotV2(state) {
  const w = V2_SLOT_W;
  const h = V2_SLOT_H;
  const image = createImage(w, h);
  const b = color(state.border);
  const l = color(state.light);
  const s = color(state.shade);
  const f = color(state.fill);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      if (corner) continue;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) setPixel(image, x, y, b);
      else if (x === 1 || y === 1) setPixel(image, x, y, l);
      else if (x === w - 2 || y === h - 2) setPixel(image, x, y, s);
      else setPixel(image, x, y, f);
    }
  }
  return image;
}

/**
 * Renders one v2 label: the 4×5 script centred in the 54×8 frame, one pixel between glyphs, the
 * ink rows 1 … 5 of the taller bar.
 *
 * @param {string} text - Upper-case label.
 * @returns {Image} 54×8 frame.
 * @throws {Error} When a character has no micro glyph (a bug in {@link METER_LABELS}).
 */
function labelV2(text) {
  const image = createImage(V2_LABEL_W, V2_LABEL_H);
  const white = color('#ffffff');
  const width = text.length * 5 - 1;
  let pen = Math.floor((V2_LABEL_W - width) / 2);
  for (const ch of text) {
    const glyph = MICRO4[ch];
    if (glyph === undefined) throw new Error(`no 4×5 micro glyph for "${ch}"`);
    glyph.forEach((row, y) => {
      for (let x = 0; x < 4; x++) if (row.charAt(x) === '#') setPixel(image, pen + x, y + 1, white);
    });
    pen += 5;
  }
  return image;
}

/**
 * Generates the HUD sprites.
 *
 * @param {{ artScale?: number }} [options] - `artScale` ≠ 1 draws the v2 native art (the art
 *   bible §5.11's sizes); without it the v1 pixels come out byte for byte.
 * @returns {SpriteDef[]} Meter slot and meter labels (anchor top-left).
 */
export function generate(options = {}) {
  if ((options.artScale ?? 1) !== 1) {
    return [
      makeSprite('hud/meter-slot', V2_SLOTS.map(slotV2), 'hud', {
        anchor: [0, 0],
        animations: { normal: [0], highlighted: [1], disabled: [2] },
        native: true,
      }),
      makeSprite('hud/meter-labels', METER_LABELS.map(labelV2), 'hud', {
        anchor: [0, 0],
        native: true,
      }),
    ];
  }
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
