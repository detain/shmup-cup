/**
 * Small particles: `fx/spark` (5×5, 3 shrinking frames — hit sparks and the "clink" on
 * armour), `fx/debris` (6×6, 4 frames of one tumbling chunk, each a 90° turn of the
 * previous), `fx/sparkle` (5×5, 4 frames — the twinkle of a cancelled enemy bullet, pale gold
 * so it never reads as a bullet) and `fx/ring` (9×9, 4 frames — a thin cyan ring that grows and
 * fades, the pickup flash). The last two arrived with plan M1-14's particle presets.
 *
 * @module
 */
import { createImage, getPixel, setPixel } from '../image.mjs';
import { createAssetRng } from '../rng.mjs';
import { color, makeSprite, seedOf } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * Rotates a square image 90° clockwise.
 *
 * @param {Image} image - Square source.
 * @returns {Image} The rotated copy.
 */
function rotate90(image) {
  const n = image.width;
  const out = createImage(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) setPixel(out, n - 1 - y, x, getPixel(image, x, y));
  }
  return out;
}

/**
 * The spark: a plus-shaped star whose arms shrink.
 *
 * @returns {SpriteDef} `fx/spark`.
 */
function spark() {
  const white = color('#ffffff');
  const yellow = color('#fff080');
  const orange = color('#f8a030');
  const frames = [2, 1, 0].map((arm) => {
    const image = createImage(5, 5);
    for (let d = 1; d <= arm; d++) {
      const tint = d === arm ? orange : yellow;
      setPixel(image, 2 - d, 2, tint);
      setPixel(image, 2 + d, 2, tint);
      setPixel(image, 2, 2 - d, tint);
      setPixel(image, 2, 2 + d, tint);
    }
    setPixel(image, 2, 2, arm === 0 ? orange : white);
    return image;
  });
  return makeSprite('fx/spark', frames, 'particles', { animations: { fade: [0, 1, 2] } });
}

/**
 * The debris chunk: a random blob grown from the centre, shaded top-left light.
 *
 * @returns {SpriteDef} `fx/debris`.
 */
function debris() {
  const rng = createAssetRng(seedOf('fx/debris'));
  const light = color('#b8a898');
  const mid = color('#7a6a60');
  const dark = color('#3a3040');
  const size = 6;
  /** @type {boolean[]} */
  const solid = new Array(size * size).fill(false);
  let x = 2;
  let y = 2;
  for (let step = 0; step < 18; step++) {
    solid[y * size + x] = true;
    x = Math.min(4, Math.max(1, x + rng.rangeInt(-1, 1)));
    y = Math.min(4, Math.max(1, y + rng.rangeInt(-1, 1)));
  }
  const base = createImage(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      if (!solid[py * size + px]) continue;
      const up = py > 0 && solid[(py - 1) * size + px];
      const left = px > 0 && solid[py * size + px - 1];
      setPixel(base, px, py, !up || !left ? light : rng.chance(0.3) ? dark : mid);
    }
  }
  const frames = [base];
  for (let i = 1; i < 4; i++) frames.push(rotate90(frames[i - 1]));
  return makeSprite('fx/debris', frames, 'particles', { animations: { tumble: [0, 1, 2, 3] } });
}

/**
 * The sparkle: a diamond twinkle — a plus that turns into an ×, then a dot, pale gold to white.
 * Drawn from fixed pixel lists (no randomness), so the cancel sparkle is the same everywhere.
 *
 * @returns {SpriteDef} `fx/sparkle`.
 */
function sparkle() {
  const white = color('#ffffff');
  const gold = color('#fff0a0');
  const dim = color('#d8b860');
  /** @type {[number, number, import('../image.mjs').Rgba][][]} */
  const shapes = [
    [
      [2, 2, white],
      [2, 0, gold],
      [2, 1, gold],
      [2, 3, gold],
      [2, 4, gold],
      [0, 2, gold],
      [1, 2, gold],
      [3, 2, gold],
      [4, 2, gold],
    ],
    [
      [2, 2, white],
      [1, 1, gold],
      [3, 1, gold],
      [1, 3, gold],
      [3, 3, gold],
      [0, 0, dim],
      [4, 0, dim],
      [0, 4, dim],
      [4, 4, dim],
    ],
    [
      [2, 2, white],
      [2, 1, dim],
      [2, 3, dim],
      [1, 2, dim],
      [3, 2, dim],
    ],
    [[2, 2, gold]],
  ];
  const frames = shapes.map((pixels) => {
    const image = createImage(5, 5);
    for (const [x, y, rgba] of pixels) setPixel(image, x, y, rgba);
    return image;
  });
  return makeSprite('fx/sparkle', frames, 'particles', { animations: { twinkle: [0, 1, 2, 3] } });
}

/**
 * The pickup ring: a one-pixel ring of radius 1, 2, 3 and 4 (distance test with
 * `Math.sqrt` only), bright cyan fading to a dim blue.
 *
 * @returns {SpriteDef} `fx/ring`.
 */
function ring() {
  const tints = [color('#ffffff'), color('#a0f0ff'), color('#50c8f0'), color('#3080c0')];
  const radii = [1, 2, 3, 4];
  const frames = radii.map((radius, index) => {
    const image = createImage(9, 9);
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const distance = Math.sqrt((x - 4) * (x - 4) + (y - 4) * (y - 4));
        if (Math.abs(distance - radius) < 0.5) setPixel(image, x, y, tints[index]);
      }
    }
    return image;
  });
  return makeSprite('fx/ring', frames, 'particles', { animations: { grow: [0, 1, 2, 3] } });
}

/**
 * Generates the particle sprites.
 *
 * @returns {SpriteDef[]} Spark, debris, sparkle and ring.
 */
export function generate() {
  return [spark(), debris(), sparkle(), ring()];
}
