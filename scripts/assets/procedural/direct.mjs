/**
 * Placeholder art of the Direct mode (plan M2-05, `shmup_feat.md` §6B / §7B / §9), drawn as
 * geometry:
 *
 * - `shots/direct-missile` (12×6, 2 frames, centred): the MANTA's weak missile (frame 0) and the
 *   stronger, wider one (frame 1) — an orange body with a white-hot tip.
 * - `shots/disc` (20×20, 4 frames, centred): the energy discs, radius 3.5 → 9.5 (the small disc
 *   of levels 3–5, then ever bigger discs), a white core in a gold ring.
 * - `shots/beam` (26×8, 4 frames, centred): the Laser family's bolts — a thin blue laser (frame
 *   0), a wider blue one (1), a longer yellow one (2) and the round-ended, piercing yellow laser
 *   (3).
 * - `shots/wave` (16×34, 4 frames, centred): the piercing crescent waves opening forward, half
 *   height 7 → 16.
 * - `shots/sub-bomb` (6×6, 1 frame): the sub-weapon's green bomb.
 * - `shots/sub-laser` (9×9) and `shots/sub-laser-wide` (11×11), 8 frames each: a short diagonal
 *   laser bolt pointing in the 8 directions (frame k = k × 45° clockwise from right — the engine
 *   picks the heading's octant, so nothing is rotated at run time).
 * - `shots/sub-disc` (12×12, 2 frames): the sub-weapon's piercing discs (radius 3.5, 5.5).
 *
 * (R4-P.P1 split the six colour items into `direct-items.mjs` and `shields/arm` into `arm.mjs`.)
 *
 * Only exactly rounded maths (square roots, `+ − × ÷`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * Fills a rounded rectangle (a capsule shape) centred in the image.
 *
 * @param {Image} image - Target.
 * @param {number} w - Shape width.
 * @param {number} h - Shape height.
 * @param {import('../image.mjs').Rgba} rgba - Colour.
 */
function fillPill(image, w, h, rgba) {
  const cx = image.width / 2;
  const cy = image.height / 2;
  const r = h / 2;
  const half = w / 2 - r;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      const qx = Math.max(Math.abs(px) - half, 0);
      if (qx * qx + py * py <= r * r) setPixel(image, x, y, rgba);
    }
  }
}

/**
 * Draws a missile frame: a pill body, a hot tip at its front.
 *
 * @param {boolean} wide - The stronger, wider missile.
 * @returns {Image} 12×6 frame.
 */
function missileFrame(wide) {
  const image = createImage(12, 6);
  fillPill(image, wide ? 11 : 9, wide ? 5 : 3, color('#e06018'));
  fillPill(image, wide ? 7 : 5, wide ? 3 : 1, color('#ffb050'));
  setPixel(image, wide ? 10 : 9, 2, color('#ffffff'));
  setPixel(image, wide ? 10 : 9, 3, color('#ffffff'));
  return image;
}

/**
 * Draws a disc: a white core, a gold ring, a darker rim.
 *
 * @param {number} size - Image side.
 * @param {number} r - Radius.
 * @param {string} ring - Ring colour.
 * @param {string} rim - Rim colour.
 * @returns {Image} The frame.
 */
function discFrame(size, r, ring, rim) {
  const image = createImage(size, size);
  const c = size / 2;
  const core = color('#ffffff');
  const ringColor = color(ring);
  const rimColor = color(rim);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      setPixel(image, x, y, d < r * 0.45 ? core : d < r - 1 ? ringColor : rimColor);
    }
  }
  return image;
}

/** The Laser family's bolts: width, height, core and edge colours, round ends. */
const BEAMS = [
  { w: 16, h: 3, core: '#e0f0ff', edge: '#3878ff' },
  { w: 16, h: 5, core: '#e0f0ff', edge: '#3878ff' },
  { w: 24, h: 4, core: '#fff8d0', edge: '#f8c030' },
  { w: 24, h: 6, core: '#ffffff', edge: '#f8a020' },
];

/**
 * Draws one bolt of the Laser family (a pill with a bright core).
 *
 * @param {number} index - Frame index (see {@link BEAMS}).
 * @returns {Image} 26×8 frame.
 */
function beamFrame(index) {
  const spec = BEAMS[index];
  const image = createImage(26, 8);
  fillPill(image, spec.w, spec.h, color(spec.edge));
  fillPill(image, spec.w - 2, Math.max(1, spec.h - 2), color(spec.core));
  return image;
}

/**
 * Draws one crescent wave opening forward: the pixels inside a circle but outside the same circle
 * shifted back by the crescent's thickness.
 *
 * @param {number} b - Half height.
 * @returns {Image} 16×34 frame.
 */
function waveFrame(b) {
  const w = 16;
  const h = 34;
  const image = createImage(w, h);
  const cy = h / 2;
  const r = b + 0.5;
  const outerX = w / 2 - r * 0.35;
  const innerX = outerX - 3 - b / 8;
  const white = color('#ffffff');
  const cyan = color('#68e0ff');
  const deep = color('#2878d8');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const py = y + 0.5 - cy;
      const ox = x + 0.5 - outerX;
      const ix = x + 0.5 - innerX;
      const outer = ox * ox + py * py;
      if (outer > r * r || ix * ix + py * py <= r * r || ox < -1) continue;
      const edge = Math.sqrt(outer);
      setPixel(image, x, y, edge > r - 1 ? deep : edge > r - 2.5 ? cyan : white);
    }
  }
  return image;
}

/** Unit steps of the 8 directions, frame k = k × 45° clockwise from right (y down). */
const STEPS_8 = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/**
 * Draws a short laser bolt pointing in one of the 8 directions.
 *
 * @param {number} size - Image side (odd sizes centre exactly).
 * @param {number} k - Direction index 0…7.
 * @param {boolean} wide - A thicker bolt (the piercing one).
 * @returns {Image} The frame.
 */
function subLaserFrame(size, k, wide) {
  const image = createImage(size, size);
  const c = Math.floor(size / 2);
  const [sx, sy] = STEPS_8[k];
  const core = color('#f0fff0');
  const glow = color(wide ? '#40e060' : '#78f078');
  const reach = Math.floor(size / 2) - 1;
  for (let t = -reach; t <= reach; t++) {
    const x = c + sx * t;
    const y = c + sy * t;
    if (wide) {
      // A thicker bolt: the neighbours across the line glow too.
      setPixel(image, x + sy, y - sx, glow);
      setPixel(image, x - sy, y + sx, glow);
    }
    setPixel(image, x, y, t === reach || t === reach - 1 ? core : glow);
  }
  return image;
}

/**
 * Generates the Direct-mode shots.
 *
 * @returns {SpriteDef[]} The eight shot sprites (see the module docs; the items and the Arm
 *   moved to `direct-items.mjs` and `arm.mjs` in R4-P.P1).
 */
export function generate() {
  const directions = [0, 1, 2, 3, 4, 5, 6, 7];
  return [
    makeSprite('shots/direct-missile', [missileFrame(false), missileFrame(true)], 'direct'),
    makeSprite(
      'shots/disc',
      [3.5, 5.5, 7.5, 9.5].map((r) => discFrame(20, r, '#ffd840', '#e07018')),
      'direct',
    ),
    makeSprite('shots/beam', [0, 1, 2, 3].map(beamFrame), 'direct'),
    makeSprite('shots/wave', [7, 10, 13, 16].map(waveFrame), 'direct'),
    makeSprite('shots/sub-bomb', [discFrame(6, 2.9, '#40d050', '#185a20')], 'direct'),
    makeSprite(
      'shots/sub-laser',
      directions.map((k) => subLaserFrame(9, k, false)),
      'direct',
    ),
    makeSprite(
      'shots/sub-laser-wide',
      directions.map((k) => subLaserFrame(11, k, true)),
      'direct',
    ),
    makeSprite(
      'shots/sub-disc',
      [3.5, 5.5].map((r) => discFrame(12, r, '#78f078', '#208838')),
      'direct',
    ),
  ];
}
