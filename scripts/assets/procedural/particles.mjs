/**
 * Small particles: `fx/spark` (5×5, 3 shrinking frames — hit sparks and the "clink" on
 * armour), `fx/debris` (6×6, 4 frames of one tumbling chunk, each a 90° turn of the
 * previous), `fx/sparkle` (5×5, 4 frames — the twinkle of a cancelled enemy bullet, pale gold
 * so it never reads as a bullet) and `fx/ring` (9×9, 4 frames — a thin cyan ring that grows and
 * fades, the pickup flash). The last two arrived with plan M1-14's particle presets.
 * (`fx/black-hole` moved to `blackhole.mjs` in R4-P.P1.)
 *
 * **The v2 path (R4-04.D2).** Called with an `artScale` other than 1, {@link generate} draws
 * the art bible v2 §5.8's sizes **native**: spark 7×7 × 4 frames (one more shrink step than
 * v1), sparkle 7×7 × 4, debris 9×9 × 4 (the same exact-90° tumble), ring 13×13 × 6 (radii
 * 1 … 6, the six steps sharing v1's four tints — no new colours). The odd sides are the
 * bible's own (point-symmetric sprites stay odd), not `⌈1.5·⌉`. Every v2 frame set keeps
 * v1's `animations` tags (`fade`, `tumble`, `twinkle`, `grow`) covering its frames. At
 * scale 1 the module draws the v1 sprites above, byte for byte.
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
 * The spark: a plus-shaped star whose arms shrink. v1: 5×5, arms 2 → 1 → 0; v2 (§5.8,
 * R4-04.D2): 7×7, arms 3 → 2 → 1 → 0, one extra step so the fade reads at the bigger size.
 *
 * @param {boolean} v2 - Draw the native v2 sprite (art scale ≠ 1).
 * @returns {SpriteDef} `fx/spark`.
 */
function spark(v2) {
  const white = color('#ffffff');
  const yellow = color('#fff080');
  const orange = color('#f8a030');
  const size = v2 ? 7 : 5;
  const c = (size - 1) / 2;
  const arms = v2 ? [3, 2, 1, 0] : [2, 1, 0];
  const frames = arms.map((arm) => {
    const image = createImage(size, size);
    for (let d = 1; d <= arm; d++) {
      const tint = d === arm ? orange : yellow;
      setPixel(image, c - d, c, tint);
      setPixel(image, c + d, c, tint);
      setPixel(image, c, c - d, tint);
      setPixel(image, c, c + d, tint);
    }
    setPixel(image, c, c, arm === 0 ? orange : white);
    return image;
  });
  return makeSprite('fx/spark', frames, 'particles', {
    animations: { fade: frames.map((_, i) => i) },
    native: v2,
  });
}

/**
 * The debris chunk: a random blob grown from the centre, shaded top-left light, in four exact
 * 90° turns. v2 (§5.8, R4-04.D2) is the same tumble native at 9×9 (the walk starts centred,
 * roams `1 … size − 2` and takes 27 steps where v1 took 18); the frame count stays 4 — a
 * pixel tumble turns by exact quarter steps, and the bible's range 4–6 holds at 4.
 *
 * @param {boolean} v2 - Draw the native v2 sprite (art scale ≠ 1).
 * @returns {SpriteDef} `fx/debris`.
 */
function debris(v2) {
  const rng = createAssetRng(seedOf('fx/debris'));
  const light = color('#b8a898');
  const mid = color('#7a6a60');
  const dark = color('#3a3040');
  const size = v2 ? 9 : 6;
  const start = v2 ? 4 : 2;
  const hi = size - 2;
  const steps = v2 ? 27 : 18;
  /** @type {boolean[]} */
  const solid = new Array(size * size).fill(false);
  let x = start;
  let y = start;
  for (let step = 0; step < steps; step++) {
    solid[y * size + x] = true;
    x = Math.min(hi, Math.max(1, x + rng.rangeInt(-1, 1)));
    y = Math.min(hi, Math.max(1, y + rng.rangeInt(-1, 1)));
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
  return makeSprite('fx/debris', frames, 'particles', {
    animations: { tumble: [0, 1, 2, 3] },
    native: v2,
  });
}

/**
 * The sparkle: a diamond twinkle — a plus that turns into an ×, then a dot, pale gold to white.
 * Drawn from fixed pixel lists (no randomness), so the cancel sparkle is the same everywhere.
 * v2 (§5.8, R4-04.D2) is the same twinkle at 7×7: the arms reach 3 where v1 reached 2 (13
 * lit pixels on the open frames against v1's 9).
 *
 * @param {boolean} v2 - Draw the native v2 sprite (art scale ≠ 1).
 * @returns {SpriteDef} `fx/sparkle`.
 */
function sparkle(v2) {
  const white = color('#ffffff');
  const gold = color('#fff0a0');
  const dim = color('#d8b860');
  const size = v2 ? 7 : 5;
  const c = (size - 1) / 2;
  const r = v2 ? 3 : 2; // the plus arms' reach; the × corners sit on it too
  /** @type {[number, number, import('../image.mjs').Rgba][][]} */
  const shapes = [];
  const plus = [[c, c, white]];
  for (let d = 1; d <= r; d++) {
    plus.push([c, c - d, gold], [c, c + d, gold], [c - d, c, gold], [c + d, c, gold]);
  }
  shapes.push(plus);
  const cross = [[c, c, white]];
  for (let d = 1; d < r; d++) {
    cross.push(
      [c - d, c - d, gold],
      [c + d, c - d, gold],
      [c - d, c + d, gold],
      [c + d, c + d, gold],
    );
  }
  cross.push([c - r, c - r, dim], [c + r, c - r, dim], [c - r, c + r, dim], [c + r, c + r, dim]);
  shapes.push(cross);
  const small = [[c, c, white]];
  for (const [x, y] of [
    [c - 1, c],
    [c + 1, c],
    [c, c - 1],
    [c, c + 1],
  ]) {
    small.push([x, y, dim]);
  }
  shapes.push(small);
  shapes.push([[c, c, gold]]);
  const frames = shapes.map((pixels) => {
    const image = createImage(size, size);
    for (const [x, y, rgba] of pixels) setPixel(image, x, y, rgba);
    return image;
  });
  return makeSprite('fx/sparkle', frames, 'particles', {
    animations: { twinkle: [0, 1, 2, 3] },
    native: v2,
  });
}

/**
 * The pickup ring: a one-pixel ring that grows and fades, bright cyan fading to a dim blue
 * (distance test with `Math.sqrt` only). v1: 9×9, radii 1 … 4. v2 (§5.8, R4-04.D2): 13×13,
 * radii 1 … 6 — the six growth steps share v1's four tints (no new colours), nearest step to
 * tint by the rounded position along the ramp.
 *
 * @param {boolean} v2 - Draw the native v2 sprite (art scale ≠ 1).
 * @returns {SpriteDef} `fx/ring`.
 */
function ring(v2) {
  const tints = [color('#ffffff'), color('#a0f0ff'), color('#50c8f0'), color('#3080c0')];
  const size = v2 ? 13 : 9;
  const c = (size - 1) / 2;
  const radii = v2 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4];
  const frames = radii.map((radius, index) => {
    const tint = tints[Math.round((index * (tints.length - 1)) / (radii.length - 1))];
    const image = createImage(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const distance = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c));
        if (Math.abs(distance - radius) < 0.5) setPixel(image, x, y, tint);
      }
    }
    return image;
  });
  return makeSprite('fx/ring', frames, 'particles', {
    animations: { grow: frames.map((_, i) => i) },
    native: v2,
  });
}

/**
 * Generates the particle sprites.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale to
 *   draw at (default 1). Any scale other than 1 takes the v2 path: the four sprites native at
 *   the art bible v2 §5.8's 7×7 / 9×9 / 13×13 with 4 / 4 / 4 / 6 frames; scale 1 draws the v1
 *   sprites, byte for byte.
 * @returns {SpriteDef[]} Spark, debris, sparkle and ring.
 */
export function generate(options = {}) {
  const v2 = (options.artScale ?? 1) !== 1;
  return [spark(v2), debris(v2), sparkle(v2), ring(v2)];
}
