/**
 * The ending screens' sprite scenes (plan M2-14, shmup_feat.md §17 "ending(s)") — placeholder art
 * drawn by code (decision D24). The ending scene of `core/scenes` draws them into the UI list (they
 * are `core/ui` `UI_SPRITES`, anchored at their centres):
 *
 * - `ui/ending-citadel` (128×72) — the IRON CITADEL's silhouette against the sky: stepped
 *   towers and walls in dark steel, rows of amber windows; the scene sets off chained blasts over
 *   it as the ship flies away.
 * - `ui/ending-ark` (112×36) — the ABYSS ARK's silhouette, far off: a whale-bodied battleship with
 *   a tail fluke; it sinks into the deep — or, when it escaped, sails off.
 * - `ui/ending-blast` (24×24, 4 frames) — a blast growing from a white flash to an orange ring and a
 *   fading cloud of smoke.
 * - `ui/ending-bubble` (6×6) — a rising bubble (the deep's scene).
 * - `ui/ending-sun` (64×32) — the dawn of a flawless run: the upper half of a pale-gold sun with
 *   short rays.
 * - `ui/ending-surface` (64×8) — the light on the sea's surface seen from below (the deep's scene
 *   draws it across the top); its period divides its width, so it tiles.
 *
 * Geometry uses only `+ - * /` and `Math.sqrt`, randomness `hash2` (seeded from the sprite names),
 * so the pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link ENDING_SPRITES}.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** The sprites this generator draws, in order (the names `core/ui` `UI_SPRITES` lists). */
export const ENDING_SPRITES = Object.freeze([
  'ui/ending-citadel',
  'ui/ending-ark',
  'ui/ending-blast',
  'ui/ending-bubble',
  'ui/ending-sun',
  'ui/ending-surface',
]);

/**
 * Generates the ending scenes' art.
 *
 * @returns {SpriteDef[]} The sprites of {@link ENDING_SPRITES}, in that order.
 */
export function generate() {
  return [
    makeSprite('ui/ending-citadel', [citadel()], 'ending'),
    makeSprite('ui/ending-ark', [ark()], 'ending'),
    makeSprite('ui/ending-blast', [0, 1, 2, 3].map(blastFrame), 'ending', {
      animations: { burst: [0, 1, 2, 3] },
    }),
    makeSprite('ui/ending-bubble', [bubble()], 'ending'),
    makeSprite('ui/ending-sun', [sun()], 'ending'),
    makeSprite('ui/ending-surface', [surface()], 'ending'),
  ];
}

/**
 * The citadel's silhouette: a wide base wall with battlements, three stepped towers (the middle
 * one tallest, with a spire), dark steel with a lit left edge on every block and rows of amber
 * windows lit by a hash.
 *
 * @returns {Image} The frame.
 */
function citadel() {
  const w = 128;
  const h = 72;
  const seed = seedOf('ui/ending-citadel');
  const steel = color('#20242c');
  const lit = color('#383e4a');
  const window = color('#e0a040');
  const dim = color('#6a4a20');
  const image = createImage(w, h);
  // Blocks: [left, right, top] — the base wall and the towers.
  const blocks = [
    [0, 128, 48],
    [12, 40, 26],
    [48, 80, 10],
    [88, 116, 22],
    [58, 70, 0],
  ];
  for (const [x0, x1, top] of blocks) {
    for (let x = x0; x < x1; x++) {
      // Battlements along the top of every block but the spire.
      const merlon = x1 - x0 > 12 && (x - x0) % 6 < 3 ? 0 : 2;
      for (let y = top + merlon; y < h; y++) setPixel(image, x, y, x === x0 ? lit : steel);
    }
  }
  for (let y = 4; y < h - 4; y += 6) {
    for (let x = 2; x < w - 2; x += 5) {
      const inside = blocks.some(([x0, x1, top]) => x > x0 + 1 && x < x1 - 2 && y > top + 4);
      if (!inside) continue;
      const hsh = hash2(x, y, seed) % 5;
      if (hsh === 0) continue;
      const c = hsh === 1 ? dim : window;
      setPixel(image, x, y, c);
      setPixel(image, x + 1, y, c);
    }
  }
  return image;
}

/**
 * The ARK far off: a long whale-bodied hull in dark bone (a curved outline, a blunt bow on the
 * left), a tail fluke on the right and a row of faint cyan portholes.
 *
 * @returns {Image} The frame.
 */
function ark() {
  const w = 112;
  const h = 36;
  const hull = color('#3a382e');
  const lit = color('#5a5648');
  const port = color('#2a6a74');
  const image = createImage(w, h);
  for (let x = 0; x < 96; x++) {
    const t = x / 95;
    const half = 3 + 11 * Math.sqrt(Math.max(0, 1 - (2 * t - 0.8) * (2 * t - 0.8)));
    for (let y = Math.round(18 - half); y <= Math.round(18 + half * 0.8); y++) {
      setPixel(image, x, y, y < 16 ? lit : hull);
    }
  }
  drawLine(image, 94, 18, 111, 6, hull, 2);
  drawLine(image, 94, 19, 111, 31, hull, 2);
  for (let x = 16; x < 84; x += 8) setPixel(image, x, 15, port);
  return image;
}

/**
 * One frame of the blast: frame 0 a small white flash, 1 a yellow-white ball, 2 an orange ring
 * round a bright heart, 3 a thin grey ring of smoke.
 *
 * @param {number} frame - 0 … 3.
 * @returns {Image} The frame.
 */
function blastFrame(frame) {
  const size = 24;
  const c = (size - 1) / 2;
  const white = color('#ffffff');
  const yellow = color('#ffe070');
  const orange = color('#f07028');
  const smoke = color('#707480');
  const image = createImage(size, size);
  const radius = [4, 7.5, 10, 11.5][frame];
  fillEllipse(image, c, c, radius, radius, (_u, _v, e) => {
    if (frame === 0) return white;
    if (frame === 1) return e < 0.5 ? white : yellow;
    if (frame === 2) return e > 0.72 ? orange : e < 0.35 ? yellow : null;
    return e > 0.82 ? smoke : null;
  });
  return image;
}

/**
 * A bubble: a thin pale-cyan ring with a white glint on its upper left.
 *
 * @returns {Image} The frame.
 */
function bubble() {
  const size = 6;
  const ring = color('#8ad8e0');
  const glint = color('#ffffff');
  const image = createImage(size, size);
  fillEllipse(image, 2.5, 2.5, 2.6, 2.6, (_u, _v, e) => (e > 0.62 ? ring : null));
  setPixel(image, 1, 1, glint);
  return image;
}

/**
 * The dawn sun: the upper half of a pale-gold disc (brighter at the centre) with short rays every
 * 45° above it, all on a transparent ground.
 *
 * @returns {Image} The frame.
 */
function sun() {
  const w = 64;
  const h = 32;
  const edge = color('#f0b050');
  const heart = color('#fff0c0');
  const ray = color('#f8d080');
  const image = createImage(w, h);
  fillEllipse(image, 31.5, 31.5, 20, 20, (_u, v, e) => (v > 0 ? null : mix(heart, edge, e)));
  const r2 = Math.sqrt(2) / 2;
  for (const [dx, dy] of [
    [-1, 0],
    [-r2, -r2],
    [0, -1],
    [r2, -r2],
    [1, 0],
  ]) {
    drawLine(image, 31.5 + dx * 23, 31 + dy * 23, 31.5 + dx * 29, 31 + dy * 29, ray);
  }
  return image;
}

/**
 * The sea's surface from below: a bright wavering line of light with dimmer glints under it, on a
 * transparent ground; its wave periods (16 and 32 px) divide the 64-px width, so it tiles.
 *
 * @returns {Image} The frame.
 */
function surface() {
  const w = 64;
  const h = 8;
  const bright = color('#a0f0f0');
  const glint = color('#3a8a98');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const t = (x % 16) / 16;
    const wave = Math.round(1.5 + 1.5 * (1 - (2 * t - 1) * (2 * t - 1)));
    setPixel(image, x, wave, bright);
    if (x % 32 < 12) setPixel(image, x, wave + 3, glint);
  }
  return image;
}
