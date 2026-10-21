/**
 * Explosions (small / medium / large): expanding fireballs that cool from white through
 * yellow and orange to red, then break up into dark smoke. Larger than the enemies they
 * replace (`shmup_feat.md` §18); orange/red so they never read as enemy bullets
 * (pink/red/purple with a dark rim) or items (gold).
 *
 * Sprites: `fx/explosion-small` (16×16, 6 frames), `fx/explosion-medium` (32×32,
 * 7 frames), `fx/explosion-large` (48×48, 8 frames); animation `burst` plays every frame.
 *
 * **The v2 path (R4-04.D1).** Called with an `artScale` other than 1, {@link generate} draws
 * the art bible v2 §5.8's sequence **native** (RR-1: a generator branch, never a rescaled v1
 * map): the three sizes at `⌈1.5·⌉` of their v1 sides — 24², 48² and 72² — with 12, 14 and 16
 * frames, every frame `native: true`. Frame 0 carries the bible's white star flash (§2.2's
 * sequence in text, drawn here as an eight-ray cross over the first fireball); the burn then
 * grows and cools on the same hot → cold ramp, the extra frames spreading it over R2-04.P2's
 * lifetimes (1.5–2 ticks a frame). At scale 1 the module draws the v1 sprites above, byte for
 * byte — the scale-1 digest pin proves it.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { scaleLength } from '../interim.mjs';
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

/** The three sizes at art scale 1 (v1): name, frame side, frame count. */
const SIZES = /** @type {const} */ ([
  ['fx/explosion-small', 16, 6],
  ['fx/explosion-medium', 32, 7],
  ['fx/explosion-large', 48, 8],
]);

/**
 * The v2 frame counts, index-aligned with {@link SIZES} (art bible v2 §5.8): small 12,
 * medium 14 (of 12–14), large 16 (of 14–16) — the top of each range, so the biggest blast
 * burns the smoothest. The sides come from `⌈1.5·⌉` of the v1 sides (`scaleLength`).
 *
 * @type {readonly number[]}
 */
const V2_COUNTS = [12, 14, 16];

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
 * Stamps the v2 white star flash (art bible v2 §2.2's first stage, §5.8, R4-04.D1) onto the
 * first frame, in place: a two-pixel-wide cross whose arms stop three pixels from the frame
 * edge, short diagonal rays inside it, all in the ramp's white. The geometry runs on the
 * doubled distance from the frame centre (even sizes centre between pixels), exact whole maths.
 *
 * @param {import('../image.mjs').Image} image - The first fireball frame (modified in place).
 * @returns {void}
 */
function stampFlash(image) {
  const size = image.width;
  const c2 = size - 1; // the centre, doubled
  const arm = 2 * (Math.floor(size / 2) - 3); // doubled reach of the cross arms
  const diag = 2 * Math.floor(size / 6) + 1; // doubled reach of the diagonal rays
  for (let y = 0; y < size; y++) {
    const dy = Math.abs(2 * y - c2);
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(2 * x - c2);
      if ((dx <= 1 && dy <= arm) || (dy <= 1 && dx <= arm) || (dx === dy && dx <= diag)) {
        setPixel(image, x, y, RAMP[0]);
      }
    }
  }
}

/**
 * Generates the explosion sprites.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale to draw
 *   at (default 1). Any scale other than 1 takes the v2 path: the three sizes native at
 *   `⌈artScale·⌉` of their v1 sides with 12 / 14 / 16 frames and the frame-0 star flash
 *   (art bible v2 §5.8); scale 1 draws the v1 sprites, byte for byte.
 * @returns {SpriteDef[]} Small, medium and large explosions.
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  const v2 = artScale !== 1;
  return SIZES.map(([name, side, count], i) => {
    const size = v2 ? scaleLength(side, artScale) : side;
    const frames = v2 ? V2_COUNTS[i] : count;
    const rng = createAssetRng(seedOf(name));
    const drawn = [];
    for (let f = 0; f < frames; f++) drawn.push(drawFrame(size, f, frames, rng));
    if (v2) stampFlash(drawn[0]);
    return makeSprite(name, drawn, 'explosions', {
      animations: { burst: drawn.map((_, k) => k) },
      native: v2,
    });
  });
}
