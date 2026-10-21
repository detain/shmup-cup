/**
 * The black-hole bomb's vortex sprite (plan M3-02), split out of `particles.mjs` by plan
 * R4-P.P1 so every R4 subtask owns one generator:
 *
 * - `fx/black-hole` (32×32, 4 frames) — three of the vortex swirling, then the lightning
 *   discharge (`core/blackhole` `BLACK_HOLE_SPRITE`). The v2 path (plan R4-01.A8, art bible
 *   v2 §5.5) draws it native at 48×48 with 8 frames — the swirl over frames 0 … 6 (one
 *   seventh of a turn per frame, the wind laid out at the v1 shape ÷ 1.5 so the spiral is the
 *   same spiral) and the discharge on 7 — with a binary alpha (the v1 translucent disc is
 *   opaque dark violet at v2, §3.6) and the black core grown to 10 px radius, the reach the
 *   wave-7 report R2-04.P4 recommended (the swallow core is 15 px).
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
 * A pixel's angle around the centre as a **pseudo-angle** in turns, `[0, 1)` — the "diamond
 * angle": monotone in the real angle and built from `+ - * /` alone, so it is exact on every
 * engine (the generators may not call `Math.sin` / `Math.cos` / `Math.atan2`).
 *
 * @param {number} dx - Offset from the centre along x.
 * @param {number} dy - Offset along y.
 * @returns {number} The pseudo-angle, 0 at +x and growing clockwise on screen.
 */
function pseudoAngle(dx, dy) {
  const sum = Math.abs(dx) + Math.abs(dy);
  if (sum === 0) return 0;
  const p = dx / sum;
  return (dy < 0 ? 3 + p : 1 - p) / 4;
}

/**
 * The black-hole bomb's vortex (plan M3-02, `core/blackhole` `BLACK_HOLE_SPRITE`): a 32×32 disc
 * with a black core and a three-armed spiral of violet and blue that winds inwards and turns a
 * third of a turn per frame, plus a fourth frame in which the spiral has collapsed into the white
 * lightning of the discharge. Built from the {@link pseudoAngle} and `Math.sqrt` only, so the
 * frames are byte-identical everywhere.
 *
 * @returns {SpriteDef} `fx/black-hole`.
 */
function blackHole() {
  const size = 32;
  const centre = (size - 1) / 2;
  const core = color('#080410');
  const disc = color('#1c0f30c8');
  const arms = [color('#b060f0'), color('#6040d0'), color('#3060b0')];
  const rim = color('#d8b0ff');
  const bolt = color('#ffffff');
  const halo = color('#c0e0ff');
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const image = createImage(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - centre;
        const dy = y - centre;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 15.5) continue;
        // The hole itself: a dark disc under everything, black at the centre.
        setPixel(image, x, y, d < 4.5 ? core : disc);
        if (d < 4.5) continue;
        const turn = pseudoAngle(dx, dy);
        if (f === 3) {
          // The discharge: three radial bolts and a bright halo.
          const spoke = 3 * turn - Math.floor(3 * turn);
          if (spoke < 0.06 || spoke > 0.94) setPixel(image, x, y, bolt);
          else if (d > 13) setPixel(image, x, y, halo);
          else if (spoke < 0.16 || spoke > 0.84) setPixel(image, x, y, rim);
          continue;
        }
        // The spiral: three arms winding inwards, a third of a turn on per frame.
        const wind = 3 * turn - d * 0.06 + f / 3;
        const arm = wind - Math.floor(wind);
        if (arm > 0.38) continue;
        const tint = d > 12 ? arms[2] : d > 8 ? arms[1] : arms[0];
        setPixel(image, x, y, d > 14.5 ? rim : tint);
      }
    }
    frames.push(image);
  }
  return makeSprite('fx/black-hole', frames, 'blackhole', {
    animations: { swirl: [0, 1, 2], burst: [3] },
  });
}

/**
 * The v2 vortex (plan R4-01.A8, art bible v2 §5.5): the same black core, three-armed spiral
 * and lightning discharge drawn native at 48×48, over eight frames — the swirl on 0 … 6, a
 * seventh of a turn per frame, and the discharge on 7. Every pixel is fully opaque or fully
 * transparent (§3.6's binary alpha: the translucent v1 disc is opaque dark violet here), the
 * wind is the v1 shape with its per-pixel rate divided by 1.5 (0.06 → 0.04, so the spiral
 * keeps its v1 sweep at the bigger radius), and the black core is the 10 px radius R2-04.P4
 * recommended so the 15 px swallow core has a visual host. Built from {@link pseudoAngle} and
 * `Math.sqrt` only, so the frames are byte-identical everywhere.
 *
 * @returns {SpriteDef} `fx/black-hole`, native, 8 frames.
 */
function blackHoleV2() {
  const size = 48;
  const centre = (size - 1) / 2;
  const swirlFrames = 7;
  const core = color('#080410');
  const disc = color('#1c0f30');
  const arms = [color('#b060f0'), color('#6040d0'), color('#3060b0')];
  const rim = color('#d8b0ff');
  const bolt = color('#ffffff');
  const halo = color('#c0e0ff');
  const frames = [];
  for (let f = 0; f < swirlFrames + 1; f++) {
    const image = createImage(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - centre;
        const dy = y - centre;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 23.25) continue;
        // The hole itself: a dark disc under everything, black at the centre.
        setPixel(image, x, y, d < 10 ? core : disc);
        if (d < 10) continue;
        const turn = pseudoAngle(dx, dy);
        if (f === swirlFrames) {
          // The discharge: three radial bolts and a bright halo.
          const spoke = 3 * turn - Math.floor(3 * turn);
          if (spoke < 0.06 || spoke > 0.94) setPixel(image, x, y, bolt);
          else if (d > 19.5) setPixel(image, x, y, halo);
          else if (spoke < 0.16 || spoke > 0.84) setPixel(image, x, y, rim);
          continue;
        }
        // The spiral: three arms winding inwards, a seventh of a turn on per frame.
        const wind = 3 * turn - d * 0.04 + f / swirlFrames;
        const arm = wind - Math.floor(wind);
        if (arm > 0.38) continue;
        const tint = d > 18 ? arms[2] : d > 13 ? arms[1] : arms[0];
        setPixel(image, x, y, d > 21.75 ? rim : tint);
      }
    }
    frames.push(image);
  }
  return makeSprite('fx/black-hole', frames, 'blackhole', {
    native: true,
    animations: { swirl: [0, 1, 2, 3, 4, 5, 6], burst: [7] },
  });
}

/**
 * Generates the black-hole vortex sprite.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale to
 *   draw at (default 1): any other scale draws the bible's native v2 vortex (R4-01.A8).
 * @returns {SpriteDef[]} `fx/black-hole`.
 */
export function generate(options = {}) {
  return [(options.artScale ?? 1) !== 1 ? blackHoleV2() : blackHole()];
}
