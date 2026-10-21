/**
 * The black-hole bomb's vortex sprite (plan M3-02), split out of `particles.mjs` by plan
 * R4-P.P1 so every R4 subtask owns one generator:
 *
 * - `fx/black-hole` (32×32, 4 frames) — three of the vortex swirling, then the lightning
 *   discharge (`core/blackhole` `BLACK_HOLE_SPRITE`).
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
 * Generates the black-hole vortex sprite.
 *
 * @returns {SpriteDef[]} `fx/black-hole`.
 */
export function generate() {
  return [blackHole()];
}
