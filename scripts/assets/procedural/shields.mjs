/**
 * The meter-mode Force Field `shields/force-field` (30×24): an elliptical barrier around
 * the ship in four **wear states** — frame 0 fresh (cyan, solid) … frame 3 about to
 * fail (purple, full of holes). Named animations `fresh`, `worn`, `damaged`, `critical`
 * map each state to its frame.
 *
 * The shield pod `shields/pod` (8×8, plan M2-04): one blocker of the front Shield, the Free
 * Shield and the Rotate Shield — a faceted orange-gold gem in the same four wear states (it
 * dims to red and loses facets as it wears).
 *
 * Reduce's shimmer `shields/reduce` (20×14, plan M2-04): a thin dotted green ring hugging the
 * shrunken ship; frame 0 at full strength (dense), frame 1 one hit down (sparse).
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

/** Per pod wear state: body colour, rim colour, fraction of body pixels missing. */
const POD_STATES = [
  { body: '#ffc040', rim: '#fff0b0', holes: 0 },
  { body: '#f89830', rim: '#ffd080', holes: 0.1 },
  { body: '#e86020', rim: '#f8a060', holes: 0.25 },
  { body: '#c02818', rim: '#e86040', holes: 0.4 },
];

/**
 * Draws the shield pod's wear frames: an 8×8 diamond-ish gem (|dx| + |dy| ≤ 4.5 from the
 * centre), a bright rim, a dark core line, seeded holes as it wears.
 *
 * @returns {import('../image.mjs').Image[]} Four frames.
 */
function podFrames() {
  const size = 8;
  const c = (size - 1) / 2;
  const seed = seedOf('shields/pod');
  const dark = color('#402008');
  return POD_STATES.map((state, s) => {
    const image = createImage(size, size);
    const body = color(state.body);
    const rim = color(state.rim);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.abs(x - c) + Math.abs(y - c);
        if (d > 4.5) continue;
        if (d > 3.5) {
          setPixel(image, x, y, rim);
          continue;
        }
        if (hash2(x, y, seed + s) / 4294967296 < state.holes) continue;
        setPixel(image, x, y, Math.abs(y - c) < 0.6 ? dark : body);
      }
    }
    return image;
  });
}

/**
 * Draws Reduce's shimmer: a dotted elliptical ring, every second (frame 0) or fourth (frame 1)
 * ring pixel lit.
 *
 * @returns {import('../image.mjs').Image[]} Two frames.
 */
function reduceFrames() {
  const w = 20;
  const h = 14;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const a = w / 2 - 0.5;
  const b = h / 2 - 0.5;
  const green = color('#70ff90');
  const pale = withAlpha(color('#c0ffd0'), 160);
  return [2, 4].map((every) => {
    const image = createImage(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x - cx) / a;
        const v = (y - cy) / b;
        const e = Math.sqrt(u * u + v * v);
        if (e > 1 || e < 0.8) continue;
        if ((x + y) % every !== 0) continue;
        setPixel(image, x, y, e > 0.9 ? green : pale);
      }
    }
    return image;
  });
}

/**
 * Generates the shield sprites.
 *
 * @returns {SpriteDef[]} `shields/force-field`, `shields/pod` and `shields/reduce`.
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
    makeSprite('shields/pod', podFrames(), 'shields', {
      animations: { fresh: [0], worn: [1], damaged: [2], critical: [3] },
    }),
    makeSprite('shields/reduce', reduceFrames(), 'shields', {
      animations: { full: [0], worn: [1] },
    }),
  ];
}
