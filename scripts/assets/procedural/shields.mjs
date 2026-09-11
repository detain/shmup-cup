/**
 * The meter-mode Force Field `shields/force-field` (30×24): an elliptical barrier around
 * the ship in four **wear states** — frame 0 fresh (cyan, solid) … frame 3 about to
 * fail (purple, full of holes). Named animations `fresh`, `worn`, `damaged`, `critical`
 * map each state to its frame.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, makeSprite, seedOf, withAlpha } from './common.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Per wear state: ring colour, inner-glow alpha, fraction of ring pixels missing. */
const STATES = [
  { ring: '#70e8ff', glow: 110, holes: 0 },
  { ring: '#58b0ff', glow: 80, holes: 0.12 },
  { ring: '#7a70ff', glow: 50, holes: 0.28 },
  { ring: '#b050e0', glow: 0, holes: 0.45 },
];

/**
 * Generates the force-field sprite.
 *
 * @returns {SpriteDef[]} `shields/force-field`.
 */
export function generate() {
  const w = 30;
  const h = 24;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const a = w / 2 - 0.5;
  const b = h / 2 - 0.5;
  const seed = seedOf('shields/force-field');
  const white = color('#ffffff');
  const frames = STATES.map((state, s) => {
    const image = createImage(w, h);
    const ring = color(state.ring);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x - cx) / a;
        const v = (y - cy) / b;
        const e = Math.sqrt(u * u + v * v);
        if (e > 1) continue;
        if (e > 0.84) {
          if (hash2(x, y, seed + s) / 4294967296 < state.holes) continue;
          setPixel(image, x, y, e > 0.93 && s === 0 ? white : ring);
        } else if (e > 0.72 && state.glow > 0) {
          setPixel(image, x, y, withAlpha(ring, state.glow));
        }
      }
    }
    return image;
  });
  return [
    makeSprite('shields/force-field', frames, 'shields', {
      animations: { fresh: [0], worn: [1], damaged: [2], critical: [3] },
    }),
  ];
}
