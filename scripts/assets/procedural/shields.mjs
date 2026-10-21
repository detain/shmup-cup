/**
 * The meter-mode Force Field `shields/force-field` (30×24): an elliptical barrier around
 * the ship in four **wear states** — frame 0 fresh (cyan, solid) … frame 3 about to
 * fail (purple, full of holes). Named animations `fresh`, `worn`, `damaged`, `critical`
 * map each state to its frame.
 *
 * The shield pod `shields/pod` (8×8, plan M2-04): one blocker of the front Shield, the Free
 * Shield and the Rotate Shield — a faceted orange-gold gem in the same four wear states (it
 * dims to red and loses facets as it wears). From R4-01.A5 the v2 path draws the art bible §5's
 * **12×12** pod native (radii ×1.5, the core line widened to a riveted band): four frames still,
 * the count `core/shields` indexes; at art scale 1 the v1 gem above, byte for byte.
 *
 * Reduce's shimmer `shields/reduce` (20×14, plan M2-04): a thin dotted green ring hugging the
 * shrunken ship; frame 0 at full strength (dense), frame 1 one hit down (sparse). From R4-01.A5
 * the v2 path draws the bible's **30×21** shimmer native (radii ×1.5, the dot every 3/6): still
 * two frames; at scale 1 the v1 ring, byte for byte.
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
 * Draws the shield pod's wear frames: a diamond-ish gem (|dx| + |dy| up to 4.5 from the
 * centre — 6.75 at the art bible's v2 size), a bright rim, a dark core line (a riveted band on
 * the v2 pod), seeded holes as it wears.
 *
 * @param {boolean} v2 - Draw the art bible §5's native 12×12 pod (its radii and band are the v1
 *   ones ×1.5; the dot rivets sit every third column of the band).
 * @returns {import('../image.mjs').Image[]} Four frames.
 */
function podFrames(v2) {
  const size = v2 ? 12 : 8;
  const c = (size - 1) / 2;
  const outer = v2 ? 6.75 : 4.5;
  const rimEdge = v2 ? 5.25 : 3.5;
  const band = v2 ? 0.9 : 0.6;
  const seed = seedOf('shields/pod');
  const dark = color('#402008');
  return POD_STATES.map((state, s) => {
    const image = createImage(size, size);
    const body = color(state.body);
    const rim = color(state.rim);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.abs(x - c) + Math.abs(y - c);
        if (d > outer) continue;
        if (d > rimEdge) {
          setPixel(image, x, y, rim);
          continue;
        }
        if (hash2(x, y, seed + s) / 4294967296 < state.holes) continue;
        if (Math.abs(y - c) < band) {
          // The v2 pod's band is riveted: every third column catches the rim colour.
          setPixel(image, x, y, v2 && x % 3 === 1 ? rim : dark);
        } else {
          setPixel(image, x, y, body);
        }
      }
    }
    return image;
  });
}

/**
 * Draws Reduce's shimmer: a dotted elliptical ring, some fraction of ring pixels lit (every
 * second pixel at art scale 1 — every third at the bible's v2 size).
 *
 * @param {boolean} v2 - Draw the art bible §5's native 30×21 shimmer (radii ×1.5, dots every
 *   3/6 instead of 2/4).
 * @returns {import('../image.mjs').Image[]} Two frames.
 */
function reduceFrames(v2) {
  const w = v2 ? 30 : 20;
  const h = v2 ? 21 : 14;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  // The v1 ring insets its radii by half a pixel (w/2 − 0.5); the v2 ring is the v1 radii
  // exactly ×1.5, so the inset is 0.75 — and both keep the dot bands at e ∈ (0.8, 1].
  const inset = v2 ? 0.75 : 0.5;
  const a = w / 2 - inset;
  const b = h / 2 - inset;
  const every2 = v2 ? 3 : 2;
  const every4 = v2 ? 6 : 4;
  const green = color('#70ff90');
  const pale = withAlpha(color('#c0ffd0'), 160);
  return [every2, every4].map((every) => {
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
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale the pod
 *   and the Reduce shimmer are drawn at (default 1; the Force Field is `R4-01.A4`'s and stays at
 *   its v1 geometry here).
 * @returns {SpriteDef[]} `shields/force-field`, `shields/pod` and `shields/reduce`.
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const v2 = (options.artScale ?? 1) !== 1;
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
    makeSprite('shields/pod', podFrames(v2), 'shields', {
      animations: { fresh: [0], worn: [1], damaged: [2], critical: [3] },
      native: v2,
    }),
    makeSprite('shields/reduce', reduceFrames(v2), 'shields', {
      animations: { full: [0], worn: [1] },
      native: v2,
    }),
  ];
}
