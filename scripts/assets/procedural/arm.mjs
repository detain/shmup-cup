/**
 * Placeholder art of the Direct-mode Arm (plan M2-05, `shmup_feat.md` §7B), split out of
 * `direct.mjs` by plan R4-P.P1 so every R4 subtask owns one generator:
 *
 * - `shields/arm` (26×18, 9 frames): the Arm — an elliptical barrier per tier (frames 0–2 the
 *   green Arm, 3–5 the silver Super Arm, 6–8 the gold Hyper Arm), each fresh, worn and critical
 *   (the ring shrinks and thins as it wears). From R4-01.A5 the v2 path draws the art bible §5's
 *   **39×27** barrier native — every radius, thickness and glow depth the v1 one ×1.5, the same
 *   nine tier × wear frames `core/shields` indexes (`(tier − 1) × 3 + wear`); at art scale 1 the
 *   v1 barrier above, byte for byte.
 *
 * Only exactly rounded maths (square roots, `+ − × ÷`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Arm tiers: ring colour and inner glow colour (green, silver, gold). */
const ARM_TIERS = [
  { ring: '#58f070', glow: '#1c6a30' },
  { ring: '#e8f0ff', glow: '#5a6a88' },
  { ring: '#ffd840', glow: '#7a5a10' },
];

/**
 * Draws one Arm frame: an elliptical ring (thinner and smaller as it wears) round a faint glow.
 * The v2 geometry is the v1 radii, thickness and glow depth exactly ×1.5 on the bible's 39×27
 * frame (`k` scales them; the odd frame keeps `w / 2` the pixel-symmetric centre).
 *
 * @param {number} tier - 0 green, 1 silver, 2 gold.
 * @param {number} wear - 0 fresh, 1 worn, 2 critical.
 * @param {number} k - 1 for the v1 26×18 barrier, 1.5 for the art bible's native v2 one.
 * @returns {Image} 26×18 (k = 1) or 39×27 (k = 1.5) frame.
 */
function armFrame(tier, wear, k) {
  const w = k === 1 ? 26 : 39;
  const h = k === 1 ? 18 : 27;
  const image = createImage(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const a = (12.5 - wear) * k;
  const b = (8.5 - wear * 0.75) * k;
  const thickness = (3 - wear) * 0.9 * k;
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
      else if (wear === 0 && off < thickness + 1.5 * k) setPixel(image, x, y, glow);
    }
  }
  return image;
}

/**
 * Generates the Arm sprite.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale the Arm
 *   is drawn at (default 1).
 * @returns {SpriteDef[]} `shields/arm` with its nine tier × wear frames.
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const k = (options.artScale ?? 1) !== 1 ? 1.5 : 1;
  const armFrames = [];
  for (let tier = 0; tier < 3; tier++) {
    for (let wear = 0; wear < 3; wear++) armFrames.push(armFrame(tier, wear, k));
  }
  return [
    makeSprite('shields/arm', armFrames, 'arm', {
      animations: { arm: [0, 1, 2], superArm: [3, 4, 5], hyperArm: [6, 7, 8] },
      native: k !== 1,
    }),
  ];
}
