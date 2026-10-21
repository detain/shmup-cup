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
 * **The v2 path (R4-05.E4).** Called with an `artScale` other than 1, {@link generate} draws the
 * art bible v2 §5.11's ending pieces **native** (RR-1: a generator branch, never a rescaled v1
 * map): the same six names at `⌈1.5·⌉` of their v1 sizes — the citadel 192×108, the ARK 168×54,
 * the blast 36² over its 4 frames, the bubble 9², the sun 96×48 and the surface 96×12 — every one
 * `native: true`. The v2 art repeats the v1 designs' read (the stepped fortress with its amber
 * windows, the whale-bodied flagship, the flash-to-smoke blast, the half-disc dawn sun, the tiling
 * surface light) with the detail the larger cells carry: deeper merlons, a spur tower and a
 * footwall, a dorsal spine on the hull, rays reaching further from the sun. At scale 1 the module
 * draws the v1 sprites above, byte for byte — the scale-1 digest pin proves it.
 *
 * **Public API.** {@link generate}, {@link ENDING_SPRITES}.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { scaleLength } from '../interim.mjs';
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
 * @param {{ artScale?: number }} [options] - The build's art scale; anything other than 1 draws
 *   {@link ENDING_SPRITES}’ v2 native path (the module docblock), 1 (the default) the v1 art.
 * @returns {SpriteDef[]} The sprites of {@link ENDING_SPRITES}, in that order.
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  if (artScale === 1) {
    return [
      makeSprite('ui/ending-citadel', [citadel()], 'ending'),
      makeSprite('ui/ending-ark', [ark()], 'ending'),
      makeSprite(
        'ui/ending-blast',
        [0, 1, 2, 3].map((f) => blastFrame(f)),
        'ending',
        {
          animations: { burst: [0, 1, 2, 3] },
        },
      ),
      makeSprite('ui/ending-bubble', [bubble()], 'ending'),
      makeSprite('ui/ending-sun', [sun()], 'ending'),
      makeSprite('ui/ending-surface', [surface()], 'ending'),
    ];
  }
  return [
    makeSprite(
      'ui/ending-citadel',
      [citadelV2(scaleLength(128, artScale), scaleLength(72, artScale))],
      'ending',
      { native: true },
    ),
    makeSprite(
      'ui/ending-ark',
      [arkV2(scaleLength(112, artScale), scaleLength(36, artScale))],
      'ending',
      { native: true },
    ),
    makeSprite(
      'ui/ending-blast',
      [0, 1, 2, 3].map((f) => blastFrame(f, scaleLength(24, artScale))),
      'ending',
      { animations: { burst: [0, 1, 2, 3] }, native: true },
    ),
    makeSprite('ui/ending-bubble', [bubbleV2(scaleLength(6, artScale))], 'ending', {
      native: true,
    }),
    makeSprite(
      'ui/ending-sun',
      [sunV2(scaleLength(64, artScale), scaleLength(32, artScale))],
      'ending',
      { native: true },
    ),
    makeSprite(
      'ui/ending-surface',
      [surfaceV2(scaleLength(64, artScale), scaleLength(8, artScale))],
      'ending',
      { native: true },
    ),
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
 * @param {number} [size] - Frame side in pixels (24 at the v1 scale, 36 on the v2 path).
 * @returns {Image} The frame.
 */
function blastFrame(frame, size = 24) {
  const c = (size - 1) / 2;
  const white = color('#ffffff');
  const yellow = color('#ffe070');
  const orange = color('#f07028');
  const smoke = color('#707480');
  const image = createImage(size, size);
  const radius = [4, 7.5, 10, 11.5][frame] * (size / 24);
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

// --------------------------------------------------------------------------- v2 path (R4-05.E4)

/**
 * The v2 citadel (192×108): the same five stepped blocks and spire on a wider, taller base wall,
 * deeper merlons (a 9-px pitch), two extra turrets on the flanks, a wider window grid and a dark
 * foundation course along the foot.
 *
 * @param {number} w - Frame width in pixels (`⌈1.5·128⌉`).
 * @param {number} h - Frame height in pixels (`⌈1.5·72⌉`).
 * @returns {Image} The frame.
 */
function citadelV2(w, h) {
  const seed = seedOf('ui/ending-citadel');
  const steel = color('#20242c');
  const lit = color('#383e4a');
  const deep = color('#141820');
  const window = color('#e0a040');
  const dim = color('#6a4a20');
  const image = createImage(w, h);
  const k = w / 128;
  // Blocks: left, right, top — the base wall, the three towers of v1 and the spire over the
  // middle one, plus the two flank turrets the wider foot of the v2 art shows.
  const blocks = [
    [0, w, h - 36],
    [Math.round(18 * k), Math.round(60 * k), 39],
    [Math.round(72 * k), Math.round(120 * k), 15],
    [Math.round(87 * k), Math.round(105 * k), 0],
    [Math.round(132 * k), Math.round(174 * k), 33],
    [Math.round(72 * k), Math.round(86 * k), 54],
    [Math.round(114 * k), Math.round(124 * k), 60],
  ];
  for (const [x0, x1, top] of blocks) {
    for (let x = x0; x < x1; x++) {
      // Deeper merlons on the v2 scale; the spire (block 4) and turrets stay flat-topped.
      const merlon = x1 - x0 > 18 && (x - x0) % 9 < 5 ? 0 : 3;
      for (let y = top + merlon; y < h; y++) setPixel(image, x, y, x === x0 ? lit : steel);
    }
  }
  // The foundation course: two darker rows at the foot of the wall.
  for (let x = 0; x < w; x++) {
    setPixel(image, x, h - 2, deep);
    setPixel(image, x, h - 1, deep);
  }
  for (let y = 6; y < h - 4; y += 8) {
    for (let x = 3; x < w - 3; x += 7) {
      const inside = blocks.some(([x0, x1, top]) => x > x0 + 2 && x < x1 - 3 && y > top + 6);
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
 * The v2 ARK (168×54): the whale-bodied hull grown to the taller cell — a rounder bow, a small
 * dorsal spine before the middle, the fluke struck with a 3-px line and the porthole row held to
 * a 12-px pitch.
 *
 * @param {number} w - Frame width in pixels (`⌈1.5·112⌉`).
 * @param {number} h - Frame height in pixels (`⌈1.5·36⌉`).
 * @returns {Image} The frame.
 */
function arkV2(w, h) {
  const hull = color('#3a382e');
  const lit = color('#5a5648');
  const port = color('#2a6a74');
  const image = createImage(w, h);
  const mid = 27;
  const bodyEnd = Math.round(96 * (w / 112));
  for (let x = 0; x < bodyEnd; x++) {
    const t = x / (bodyEnd - 1);
    const half = 4.5 + 16.5 * Math.sqrt(Math.max(0, 1 - (2 * t - 0.8) * (2 * t - 0.8)));
    for (let y = Math.round(mid - half); y <= Math.round(mid + half * 0.8); y++) {
      setPixel(image, x, y, y < 24 ? lit : hull);
    }
  }
  const spine = Math.round(72 * (w / 112));
  for (let x = spine - 24; x <= spine + 24; x++) {
    const fin = Math.floor((24 - Math.abs(x - spine)) / 6);
    if (fin <= 0) continue;
    const t = x / (bodyEnd - 1);
    const half = 4.5 + 16.5 * Math.sqrt(Math.max(0, 1 - (2 * t - 0.8) * (2 * t - 0.8)));
    const top = Math.round(mid - half);
    for (let y = top - fin; y < top; y++) setPixel(image, x, y, hull);
  }
  drawLine(image, 141, 27, w - 2, 9, hull, 3);
  drawLine(image, 141, 28, w - 2, 46, hull, 3);
  for (let x = 24; x < 126; x += 12) setPixel(image, x, 22, port);
  return image;
}

/**
 * The v2 bubble (9×9): the same thin pale-cyan ring at the art's native size, a two-pixel white
 * glint on its upper left.
 *
 * @param {number} size - Frame side in pixels (`⌈1.5·6⌉`).
 * @returns {Image} The frame.
 */
function bubbleV2(size) {
  const ring = color('#8ad8e0');
  const glint = color('#ffffff');
  const image = createImage(size, size);
  const c = (size - 1) / 2;
  fillEllipse(image, c, c, 3.9, 3.9, (_u, _v, e) => (e > 0.6 ? ring : null));
  setPixel(image, 2, 2, glint);
  setPixel(image, 3, 2, glint);
  return image;
}

/**
 * The v2 sun (96×48): the upper half of the pale-gold disc at its native radius, the five short
 * rays reaching further above it, all on a transparent ground.
 *
 * @param {number} w - Frame width in pixels (`⌈1.5·64⌉`).
 * @param {number} h - Frame height in pixels (`⌈1.5·32⌉`).
 * @returns {Image} The frame.
 */
function sunV2(w, h) {
  const edge = color('#f0b050');
  const heart = color('#fff0c0');
  const ray = color('#f8d080');
  const image = createImage(w, h);
  const cx = (w - 1) / 2;
  const cy = h - 0.5;
  fillEllipse(image, cx, cy, 30, 30, (_u, v, e) => (v > 0 ? null : mix(heart, edge, e)));
  const r2 = Math.sqrt(2) / 2;
  for (const [dx, dy] of [
    [-1, 0],
    [-r2, -r2],
    [0, -1],
    [r2, -r2],
    [1, 0],
  ]) {
    drawLine(image, cx + dx * 34, h - 1 + dy * 34, cx + dx * 42, h - 1 + dy * 42, ray);
  }
  return image;
}

/**
 * The v2 surface (96×12): the same wavering light, its periods grown to 24 and 48 px — they
 * divide the width, so it still tiles — and the dimmer glint row set further under the line.
 *
 * @param {number} w - Frame width in pixels (`⌈1.5·64⌉`).
 * @param {number} h - Frame height in pixels (`⌈1.5·8⌉`).
 * @returns {Image} The frame.
 */
function surfaceV2(w, h) {
  const bright = color('#a0f0f0');
  const glint = color('#3a8a98');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const t = (x % 24) / 24;
    const wave = Math.round(2.25 + 2.25 * (1 - (2 * t - 1) * (2 * t - 1)));
    setPixel(image, x, wave, bright);
    if (x % 48 < 18) setPixel(image, x, wave + 5, glint);
  }
  return image;
}
