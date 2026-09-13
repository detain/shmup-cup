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
 * - `items/direct-red`, `-green`, `-blue`, `-orange`, `-yellow` (10×10, 2 frames): the colour
 *   items, glossy orbs with a highlight (frame 1 the bright half of the blink);
 *   `items/direct-octagon` (10×10, 2 frames): the red octagon that switches the main-shot family.
 * - `shields/arm` (26×18, 9 frames): the Arm — an elliptical barrier per tier (frames 0–2 the
 *   green Arm, 3–5 the silver Super Arm, 6–8 the gold Hyper Arm), each fresh, worn and critical
 *   (the ring shrinks and thins as it wears).
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

/** Arm tiers: ring colour and inner glow colour (green, silver, gold). */
const ARM_TIERS = [
  { ring: '#58f070', glow: '#1c6a30' },
  { ring: '#e8f0ff', glow: '#5a6a88' },
  { ring: '#ffd840', glow: '#7a5a10' },
];

/**
 * Draws one Arm frame: an elliptical ring (thinner and smaller as it wears) round a faint glow.
 *
 * @param {number} tier - 0 green, 1 silver, 2 gold.
 * @param {number} wear - 0 fresh, 1 worn, 2 critical.
 * @returns {Image} 26×18 frame.
 */
function armFrame(tier, wear) {
  const w = 26;
  const h = 18;
  const image = createImage(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const a = w / 2 - 0.5 - wear;
  const b = h / 2 - 0.5 - wear * 0.75;
  const thickness = (3 - wear) * 0.9;
  const ring = color(ARM_TIERS[tier].ring);
  const glow = color(ARM_TIERS[tier].glow);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - cx) / a;
      const ny = (y + 0.5 - cy) / b;
      const e = Math.sqrt(nx * nx + ny * ny);
      if (e > 1) continue;
      const off = (1 - e) * b;
      if (off < thickness) setPixel(image, x, y, ring);
      else if (wear === 0 && off < thickness + 1.5) setPixel(image, x, y, glow);
    }
  }
  return image;
}

/**
 * Generates the Direct-mode sprites.
 *
 * @returns {SpriteDef[]} The shots, the colour items and the Arm (see the module docs).
 */
export function generate() {
  const directions = [0, 1, 2, 3, 4, 5, 6, 7];
  const items = ['red', 'green', 'blue', 'orange', 'yellow', 'octagon'].map((name) =>
    makeSprite(
      `items/direct-${name}`,
      [
        itemFrame(/** @type {keyof typeof ITEM_COLORS} */ (name), false),
        itemFrame(/** @type {keyof typeof ITEM_COLORS} */ (name), true),
      ],
      'direct',
      { animations: { blink: [0, 1] } },
    ),
  );
  const armFrames = [];
  for (let tier = 0; tier < 3; tier++) {
    for (let wear = 0; wear < 3; wear++) armFrames.push(armFrame(tier, wear));
  }
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
    ...items,
    makeSprite('shields/arm', armFrames, 'direct', {
      animations: { arm: [0, 1, 2], superArm: [3, 4, 5], hyperArm: [6, 7, 8] },
    }),
  ];
}
