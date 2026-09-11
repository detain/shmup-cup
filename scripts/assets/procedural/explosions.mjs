/**
 * Explosions (small / medium / large): expanding fireballs that cool from white through
 * yellow and orange to red, then break up into dark smoke. Larger than the enemies they
 * replace (`shmup_feat.md` §18); orange/red so they never read as enemy bullets
 * (pink/red/purple with a dark rim) or items (gold).
 *
 * Sprites: `fx/explosion-small` (16×16, 6 frames), `fx/explosion-medium` (32×32,
 * 7 frames), `fx/explosion-large` (48×48, 8 frames); animation `burst` plays every frame.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { createAssetRng } from '../rng.mjs';
import { color, makeSprite, seedOf } from './common.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Hot → cold colour ramp. */
const RAMP = [
  color('#ffffff'),
  color('#fff080'),
  color('#f8b030'),
  color('#f06820'),
  color('#c83018'),
  color('#7a2418'),
  color('#4a3048'),
];

/** The three sizes: name, frame side, frame count. */
const SIZES = /** @type {const} */ ([
  ['fx/explosion-small', 16, 6],
  ['fx/explosion-medium', 32, 7],
  ['fx/explosion-large', 48, 8],
]);

/**
 * Draws one explosion frame.
 *
 * @param {number} size - Frame side in pixels.
 * @param {number} frame - Frame index.
 * @param {number} count - Frame count.
 * @param {import('../rng.mjs').AssetRng} rng - Noise source.
 * @returns {import('../image.mjs').Image} The frame.
 */
function drawFrame(size, frame, count, rng) {
  const image = createImage(size, size);
  const centre = (size - 1) / 2;
  const maxRadius = size / 2 - 0.5;
  const t = (frame + 1) / count;
  const grow = 1 - (1 - t) * (1 - t);
  const radius = maxRadius * (0.3 + 0.7 * grow);
  const jitter = Math.max(1, size / 12);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centre;
      const dy = y - centre;
      const noise = rng.nextFloat() * 2 - 1;
      const distance = Math.sqrt(dx * dx + dy * dy) + noise * jitter;
      if (distance > radius) continue;
      // Late frames dissolve: holes grow from the inside out.
      if (t > 0.55 && rng.nextFloat() < (t - 0.55) * 1.6 * (1 - distance / radius / 2)) continue;
      const q = distance / radius;
      let index = Math.floor(q * 3 + t * 4.2);
      if (index < 0) index = 0;
      if (index >= RAMP.length) index = RAMP.length - 1;
      setPixel(image, x, y, RAMP[index]);
    }
  }
  return image;
}

/**
 * Generates the explosion sprites.
 *
 * @returns {SpriteDef[]} Small, medium and large explosions.
 */
export function generate() {
  return SIZES.map(([name, size, count]) => {
    const rng = createAssetRng(seedOf(name));
    const frames = [];
    for (let f = 0; f < count; f++) frames.push(drawFrame(size, f, count, rng));
    return makeSprite(name, frames, 'explosions', {
      animations: { burst: frames.map((_, i) => i) },
    });
  });
}
