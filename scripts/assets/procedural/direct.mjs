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
 * From R4-01.A7 every shot has a native v2 path at the art bible §5's sizes (the v1 geometry
 * ×1.5, v1's frame counts and colours); at art scale 1 each draws the v1 sprite, byte for byte.
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
 * @param {boolean} v2 - Draw the bible's native 18×9 missile (the v1 pill 14×5 / 17×8 with its
 *   8×2 / 11×5 core, the white tip two columns by three rows at the front).
 * @returns {Image} 12×6 (or 18×9) frame.
 */
function missileFrame(wide, v2) {
  if (!v2) {
    const image = createImage(12, 6);
    fillPill(image, wide ? 11 : 9, wide ? 5 : 3, color('#e06018'));
    fillPill(image, wide ? 7 : 5, wide ? 3 : 1, color('#ffb050'));
    setPixel(image, wide ? 10 : 9, 2, color('#ffffff'));
    setPixel(image, wide ? 10 : 9, 3, color('#ffffff'));
    return image;
  }
  const image = createImage(18, 9);
  fillPill(image, wide ? 17 : 14, wide ? 8 : 5, color('#e06018'));
  fillPill(image, wide ? 11 : 8, wide ? 5 : 2, color('#ffb050'));
  const tip = color('#ffffff');
  const tipX = wide ? 15 : 13;
  for (let y = 3; y <= 5; y++) {
    setPixel(image, tipX, y, tip);
    setPixel(image, tipX + 1, y, tip);
  }
  return image;
}

/**
 * Draws a disc: a white core, a ring, a darker rim.
 *
 * @param {number} size - Image side.
 * @param {number} r - Radius.
 * @param {string} ring - Ring colour.
 * @param {string} rim - Rim colour.
 * @param {number} inset - How deep inside the edge the rim band starts (1 v1, ×1.5 the v2 disc).
 * @returns {Image} The frame.
 */
function discFrame(size, r, ring, rim, inset) {
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
      setPixel(image, x, y, d < r * 0.45 ? core : d < r - inset ? ringColor : rimColor);
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
 * @param {boolean} v2 - Draw the bible's native 39×12 bolt (the v1 pill ×1.5 in a 39×12 field,
 *   the core inset 1.5 a side — 3 px off the pill's width, at least 2 px tall).
 * @returns {Image} 26×8 (or 39×12) frame.
 */
function beamFrame(index, v2) {
  const spec = BEAMS[index];
  if (!v2) {
    const image = createImage(26, 8);
    fillPill(image, spec.w, spec.h, color(spec.edge));
    fillPill(image, spec.w - 2, Math.max(1, spec.h - 2), color(spec.core));
    return image;
  }
  const image = createImage(39, 12);
  const w = spec.w * 1.5;
  const h = spec.h * 1.5;
  fillPill(image, w, h, color(spec.edge));
  fillPill(image, w - 3, Math.max(2, h - 3), color(spec.core));
  return image;
}

/**
 * Draws one crescent wave opening forward: the pixels inside a circle but outside the same circle
 * shifted back by the crescent's thickness.
 *
 * @param {number} b - Half height.
 * @param {boolean} v2 - Draw the bible's native 24×51 crescent (the v1 geometry ×1.5).
 * @returns {Image} 16×34 (or 24×51) frame.
 */
function waveFrame(b, v2) {
  const w = v2 ? 24 : 16;
  const h = v2 ? 51 : 34;
  const image = createImage(w, h);
  const cy = h / 2;
  const r = b + (v2 ? 0.75 : 0.5);
  const outerX = w / 2 - r * 0.35;
  const innerX = outerX - (v2 ? 4.5 : 3) - b / 8;
  const white = color('#ffffff');
  const cyan = color('#68e0ff');
  const deep = color('#2878d8');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const py = y + 0.5 - cy;
      const ox = x + 0.5 - outerX;
      const ix = x + 0.5 - innerX;
      const outer = ox * ox + py * py;
      if (outer > r * r || ix * ix + py * py <= r * r || ox < -(v2 ? 1.5 : 1)) continue;
      const edge = Math.sqrt(outer);
      setPixel(
        image,
        x,
        y,
        edge > r - (v2 ? 1.5 : 1) ? deep : edge > r - (v2 ? 3.75 : 2.5) ? cyan : white,
      );
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
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale the
 *   eight shots are drawn at (default 1).
 * @returns {SpriteDef[]} The eight shot sprites (see the module docs; the items and the Arm
 *   moved to `direct-items.mjs` and `arm.mjs` in R4-P.P1).
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const v2 = (options.artScale ?? 1) !== 1;
  const k = v2 ? 1.5 : 1;
  const directions = [0, 1, 2, 3, 4, 5, 6, 7];
  return [
    makeSprite(
      'shots/direct-missile',
      [missileFrame(false, v2), missileFrame(true, v2)],
      'direct',
      { native: v2 },
    ),
    makeSprite(
      'shots/disc',
      [3.5, 5.5, 7.5, 9.5].map((r) => discFrame(v2 ? 30 : 20, r * k, '#ffd840', '#e07018', k)),
      'direct',
      { native: v2 },
    ),
    makeSprite(
      'shots/beam',
      [0, 1, 2, 3].map((i) => beamFrame(i, v2)),
      'direct',
      {
        native: v2,
      },
    ),
    makeSprite(
      'shots/wave',
      [7, 10, 13, 16].map((b) => waveFrame(b * k, v2)),
      'direct',
      {
        native: v2,
      },
    ),
    makeSprite(
      'shots/sub-bomb',
      [discFrame(v2 ? 9 : 6, 2.9 * k, '#40d050', '#185a20', k)],
      'direct',
      {
        native: v2,
      },
    ),
    makeSprite(
      'shots/sub-laser',
      directions.map((d) => subLaserFrame(v2 ? 13 : 9, d, false)),
      'direct',
      { native: v2 },
    ),
    makeSprite(
      'shots/sub-laser-wide',
      directions.map((d) => subLaserFrame(v2 ? 17 : 11, d, true)),
      'direct',
      { native: v2 },
    ),
    makeSprite(
      'shots/sub-disc',
      [3.5, 5.5].map((r) => discFrame(v2 ? 18 : 12, r * k, '#78f078', '#208838', k)),
      'direct',
      { native: v2 },
    ),
  ];
}
