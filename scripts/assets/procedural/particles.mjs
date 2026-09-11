/**
 * Small particles: `fx/spark` (5×5, 3 shrinking frames — hit sparks and the "clink" on
 * armour) and `fx/debris` (6×6, 4 frames of one tumbling chunk, each a 90° turn of the
 * previous).
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
 * Generates the particle sprites.
 *
 * @returns {SpriteDef[]} Spark and debris.
 */
export function generate() {
  return [spark(), debris()];
}
