/**
 * Zone C, **DUNE EXPANSE** (plan M2-11) — placeholder art of the desert zone (decision D24):
 *
 * - `bg/dune-suns` ({@link SUNS_TILE_W}×{@link SUNS_TILE_H}, the far band): the twin suns — a big
 *   pale one and a small orange one — in a translucent glow; placed with a wide `spacing`, so they
 *   come by only now and then.
 * - `bg/dune-ridge` ({@link RIDGE_TILE_W}×{@link RIDGE_TILE_H}, a mid band): two layers of distant
 *   dune silhouettes, opaque below their ridge lines; the ridge profiles are sums of triangle waves
 *   whose periods divide the tile width, so the band repeats seamlessly.
 * - Enemies (flying ones face left; hit-flash siblings): `enemies/dune-worm` (an armoured sand-worm
 *   segment, 2 frames), `enemies/husk-crawler` (a desert beetle walking on a floor — the renderer
 *   flips it on a ceiling —, legs alternating, 2 frames), `enemies/sand-skimmer` (a low flier, wings
 *   beating, 2 frames), `enemies/dust-devil` (a spinning sand whirl, 3 frames),
 *   `enemies/sand-geyser` (a vent mound on the floor, puffing, 2 frames), `enemies/sand-clod` (the
 *   clod it throws), `enemies/widow-drone` (a spider drone, legs scuttling, 2 frames).
 * - SANDGRAVE WIDOW (SW-03), the arachnid: `bosses/widow-body` (the abdomen with its red hourglass),
 *   `bosses/widow-head` (four eyes glowing, 2 frames — the weak point), `bosses/widow-fang` (a bone
 *   fang), `bosses/widow-leg-top` / `-bottom` (jointed legs, decoration), `bosses/widow-spinneret`
 *   (a silk gland, 2 frames).
 *
 * Kept low in saturation next to the bullets and capsules (shmup_feat.md §12, §18); the only red is
 * the hourglass and the eyes. Geometry uses only `+ - * /` and `Math.sqrt`, randomness `hash2`
 * seeded from the sprite names, so the pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link DUNE_SPRITES}, {@link SUNS_TILE_W} /
 * {@link SUNS_TILE_H}, {@link RIDGE_TILE_W} / {@link RIDGE_TILE_H} (the bands' tile sizes).
 *
 * @module
 */
import { createImage, flipVertical, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf, withAlpha } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/dune-suns` tile. */
export const SUNS_TILE_W = 72;

/** Height of the `bg/dune-suns` tile. */
export const SUNS_TILE_H = 40;

/** Width of the `bg/dune-ridge` tile (its parallax `spacing`). */
export const RIDGE_TILE_W = 128;

/** Height of the `bg/dune-ridge` tile. */
export const RIDGE_TILE_H = 40;

/** The sprites this generator draws, in order. */
export const DUNE_SPRITES = Object.freeze([
  'bg/dune-suns',
  'bg/dune-ridge',
  'enemies/dune-worm',
  'enemies/husk-crawler',
  'enemies/sand-skimmer',
  'enemies/dust-devil',
  'enemies/sand-geyser',
  'enemies/sand-clod',
  'enemies/widow-drone',
  'bosses/widow-body',
  'bosses/widow-head',
  'bosses/widow-fang',
  'bosses/widow-leg-top',
  'bosses/widow-leg-bottom',
  'bosses/widow-spinneret',
]);

/**
 * Generates zone C's art.
 *
 * @returns {SpriteDef[]} The sprites of {@link DUNE_SPRITES}, in that order.
 */
export function generate() {
  const flash = { hitFlash: true };
  const leg = legFrame();
  return [
    makeSprite('bg/dune-suns', [suns()], 'dune', { anchor: [0, 0] }),
    makeSprite('bg/dune-ridge', [ridge()], 'dune', { anchor: [0, 0] }),
    makeSprite('enemies/dune-worm', [wormFrame(0), wormFrame(1)], 'dune', {
      hitFlash: true,
      animations: { writhe: [0, 1] },
    }),
    makeSprite('enemies/husk-crawler', [crawlerFrame(0), crawlerFrame(1)], 'dune', {
      hitFlash: true,
      animations: { walk: [0, 1] },
    }),
    makeSprite('enemies/sand-skimmer', [skimmerFrame(-1), skimmerFrame(1)], 'dune', {
      hitFlash: true,
      animations: { fly: [0, 1] },
    }),
    makeSprite('enemies/dust-devil', [0, 1, 2].map(devilFrame), 'dune', {
      hitFlash: true,
      animations: { spin: [0, 1, 2] },
    }),
    makeSprite('enemies/sand-geyser', [geyserFrame(false), geyserFrame(true)], 'dune', {
      hitFlash: true,
      animations: { puff: [0, 1] },
    }),
    makeSprite('enemies/sand-clod', [clodFrame()], 'dune', flash),
    makeSprite('enemies/widow-drone', [droneFrame(0), droneFrame(1)], 'dune', {
      hitFlash: true,
      animations: { scuttle: [0, 1] },
    }),
    makeSprite('bosses/widow-body', [bodyFrame()], 'dune', flash),
    makeSprite('bosses/widow-head', [headFrame('#f06030'), headFrame('#a03018')], 'dune', {
      hitFlash: true,
      animations: { glare: [0, 1] },
    }),
    makeSprite('bosses/widow-fang', [fangFrame()], 'dune', flash),
    makeSprite('bosses/widow-leg-top', [leg], 'dune'),
    makeSprite('bosses/widow-leg-bottom', [flipVertical(leg)], 'dune'),
    makeSprite('bosses/widow-spinneret', [glandFrame(0), glandFrame(1)], 'dune', {
      hitFlash: true,
      animations: { pulse: [0, 1] },
    }),
  ];
}

/**
 * The twin suns: a big pale sun and a small orange one lower right, each in a translucent glow.
 *
 * @returns {Image} The tile.
 */
function suns() {
  const image = createImage(SUNS_TILE_W, SUNS_TILE_H);
  const glow = color('#f8c880');
  const big = color('#fce8b8');
  const small = color('#f89858');
  fillEllipse(image, 24, 18, 17, 17, (_u, _v, e) =>
    e > 0.6 ? withAlpha(glow, Math.round(90 * (1 - e) * 2.5)) : big,
  );
  fillEllipse(image, 54, 28, 9, 9, (_u, _v, e) =>
    e > 0.55 ? withAlpha(small, Math.round(80 * (1 - e) * 2.2)) : small,
  );
  return image;
}

/**
 * A triangle wave of a whole-pixel period: 0 at `x` = 0, 1 at half the period.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function triangle(x, period) {
  const t = (x % period) / period;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

/**
 * The ridge band: a far ridge (dark) and a near ridge (lighter), each opaque below its profile —
 * sums of triangle waves with periods 128, 64 and 32 (they divide the tile width).
 *
 * @returns {Image} The tile.
 */
function ridge() {
  const w = RIDGE_TILE_W;
  const h = RIDGE_TILE_H;
  const far = color('#4a3024');
  const near = color('#6a4430');
  const crest = color('#8a5e3c');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const farTop = Math.round(6 + 10 * triangle(x + 20, 128) + 4 * triangle(x, 32));
    const nearTop = Math.round(18 + 8 * triangle(x + 70, 64) + 3 * triangle(x + 9, 32));
    for (let y = farTop; y < h; y++) setPixel(image, x, y, far);
    for (let y = nearTop; y < h; y++) setPixel(image, x, y, y === nearTop ? crest : near);
  }
  return image;
}

/**
 * A sand-worm segment: an armoured ring (sand chitin, a dark band round its middle, a lit top,
 * spikes on the rim); frame 1 turns the band a pixel.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function wormFrame(frame) {
  const size = 16;
  const c = (size - 1) / 2;
  const rim = color('#3a2410');
  const chitin = color('#c08a4a');
  const lit = color('#e8c080');
  const band = color('#6a4020');
  const image = createImage(size, size);
  for (let k = 0; k < 8; k += 2) {
    const [dx, dy] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][k / 2];
    drawLine(image, c + dx * 5, c + dy * 5, c + dx * 7.5, c + dy * 7.5, rim);
  }
  fillEllipse(image, c, c, 6.4, 6.4, (u, v, e) => {
    if (e > 0.82) return rim;
    if (Math.abs(u * 0.4 + v - frame * 0.15) < 0.18) return band;
    return u + v < -0.7 ? lit : chitin;
  });
  return image;
}

/**
 * The husk crawler: a dark desert beetle standing on a floor — a domed shell with a lit ridge, a
 * small head on the left, three legs a side that alternate between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function crawlerFrame(frame) {
  const w = 16;
  const h = 10;
  const leg = color('#2a1c10');
  const shell = color('#4a3624');
  const ridgeTone = color('#b08a58');
  const eye = color('#f0c040');
  const image = createImage(w, h);
  for (let k = 0; k < 3; k++) {
    const x = 4 + k * 4;
    const step = (k + frame) % 2 === 0 ? -1 : 1;
    drawLine(image, x, 6, x + step, 9, leg);
  }
  fillEllipse(image, 8.5, 6, 6.5, 5, (u, v) => {
    if (v > 0.2) return null;
    return Math.abs(u) < 0.12 || v < -0.8 ? ridgeTone : shell;
  });
  fillEllipse(image, 2, 5, 2, 1.8, () => shell);
  setPixel(image, 1, 4, eye);
  return image;
}

/**
 * The sand skimmer: a small flier facing left — a dark body, sand-coloured wings up (`wing` −1)
 * or down (+1).
 *
 * @param {number} wing - −1 or 1.
 * @returns {Image} The frame.
 */
function skimmerFrame(wing) {
  const w = 14;
  const h = 8;
  const body = color('#5a3a20');
  const wingTone = color('#d8a860');
  const eye = color('#f0d070');
  const image = createImage(w, h);
  drawLine(image, 5, 4, 10, 4 + 3 * wing, wingTone, 2);
  fillEllipse(image, 6, 4, 6, 2, () => body);
  drawLine(image, 11, 4, 13, 3, body);
  setPixel(image, 1, 3, eye);
  return image;
}

/**
 * The dust devil: a funnel of sand, wide at the top, with bright streaks that climb a row further
 * in every frame (three frames loop the spin).
 *
 * @param {number} frame - 0, 1 or 2.
 * @returns {Image} The frame.
 */
function devilFrame(frame) {
  const w = 14;
  const h = 20;
  const dust = color('#a07840');
  const streak = color('#e0c088');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    const half = 1.5 + ((h - 1 - y) * 5) / (h - 1);
    const x0 = Math.round(6.5 - half);
    const x1 = Math.round(6.5 + half);
    for (let x = x0; x <= x1; x++) {
      const bright = (y + frame + Math.floor((x - x0) / 2)) % 3 === 0;
      setPixel(image, x, y, withAlpha(bright ? streak : dust, x === x0 || x === x1 ? 150 : 230));
    }
  }
  return image;
}

/**
 * The sand geyser: a mound with a dark vent on top; frame 1 adds a puff of sand over the vent.
 *
 * @param {boolean} puff - Frame 1.
 * @returns {Image} The frame.
 */
function geyserFrame(puff) {
  const w = 20;
  const h = 10;
  const mound = color('#9a6e3a');
  const lit = color('#c8a060');
  const vent = color('#3a2210');
  const cloud = color('#e8d0a0');
  const image = createImage(w, h);
  fillEllipse(image, 9.5, 10, 9.5, 7, (u, v) => (u + v < -0.9 ? lit : mound));
  fillEllipse(image, 9.5, 4, 2.5, 1.2, () => vent);
  if (puff) fillEllipse(image, 9.5, 1.5, 3.5, 1.5, () => withAlpha(cloud, 200));
  return image;
}

/**
 * A sand clod: a small lump with a lit corner.
 *
 * @returns {Image} The frame.
 */
function clodFrame() {
  const image = createImage(6, 6);
  const clod = color('#b08040');
  const lit = color('#e0b870');
  const rim = color('#4a3018');
  fillEllipse(image, 2.5, 2.5, 2.8, 2.8, (u, v, e) => (e > 0.8 ? rim : u + v < -0.6 ? lit : clod));
  return image;
}

/**
 * The spider drone: a dark round body with two red eyes on the left and four legs a side that
 * scuttle between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function droneFrame(frame) {
  const w = 12;
  const h = 9;
  const body = color('#2a2018');
  const leg = color('#8a7050');
  const eye = color('#f04030');
  const image = createImage(w, h);
  for (let k = 0; k < 4; k++) {
    const x = 3 + k * 2;
    const reach = (k + frame) % 2 === 0 ? 1 : 0;
    drawLine(image, x, 4, x + reach, 0, leg);
    drawLine(image, x, 4, x + 1 - reach, 8, leg);
  }
  fillEllipse(image, 6, 4, 4, 3, () => body);
  setPixel(image, 2, 3, eye);
  setPixel(image, 2, 5, eye);
  return image;
}

/**
 * The widow's abdomen: a big chitin oval (dark rim, lit top, seeded speckles) with the red
 * hourglass on its back.
 *
 * @returns {Image} The frame.
 */
function bodyFrame() {
  const w = 52;
  const h = 40;
  const seed = seedOf('bosses/widow-body');
  const rim = color('#1a1008');
  const chitin = color('#4a3422');
  const lit = color('#7a5a3a');
  const speck = color('#6a4c30');
  const hourglass = color('#c83020');
  const image = createImage(w, h);
  fillEllipse(image, 25.5, 19.5, 25.5, 19.5, (u, v, e, x, y) => {
    if (e > 0.9) return rim;
    // The hourglass: two triangles meeting at the middle of the back (a bow tie).
    const au = Math.abs(u - 0.1);
    if (au < 0.32 && Math.abs(v) < au * 1.4) return hourglass;
    if (v < -0.7) return lit;
    return hash2(x, y, seed) % 9 === 0 ? speck : chitin;
  });
  return image;
}

/**
 * The widow's head: a dark round head with four eyes (`eyeTone` — lit / dim) looking left.
 *
 * @param {string} eyeTone - The eyes' colour.
 * @returns {Image} The frame.
 */
function headFrame(eyeTone) {
  const w = 18;
  const h = 16;
  const rim = color('#140c06');
  const head = color('#3a2818');
  const lit = color('#6a4a2c');
  const eye = color(eyeTone);
  const image = createImage(w, h);
  fillEllipse(image, 8.5, 7.5, 8.5, 7.5, (u, v, e) => (e > 0.86 ? rim : u + v < -0.8 ? lit : head));
  for (const [x, y] of [
    [4, 5],
    [4, 10],
    [7, 4],
    [7, 11],
  ]) {
    setPixel(image, x, y, eye);
    setPixel(image, x + 1, y, eye);
  }
  return image;
}

/**
 * A fang: a curved bone tooth pointing left from a dark root.
 *
 * @returns {Image} The frame.
 */
function fangFrame() {
  const w = 10;
  const h = 12;
  const root = color('#2a1c10');
  const bone = color('#e0d8c0');
  const shade = color('#a89c80');
  const image = createImage(w, h);
  fillEllipse(image, 7, 6, 3, 5.5, () => root);
  drawLine(image, 7, 3, 2, 6, bone, 2);
  drawLine(image, 2, 6, 1, 9, shade, 1);
  drawLine(image, 7, 8, 4, 7, shade, 1);
  return image;
}

/**
 * An upper leg: two segments from the body (bottom right) up to a knee and down-left to a claw.
 * The lower leg is its vertical mirror.
 *
 * @returns {Image} The frame.
 */
function legFrame() {
  const w = 30;
  const h = 14;
  const leg = color('#2a1c10');
  const joint = color('#7a5a3a');
  const image = createImage(w, h);
  drawLine(image, 28, 13, 16, 2, leg, 2);
  drawLine(image, 16, 2, 2, 11, leg, 2);
  setPixel(image, 16, 2, joint);
  setPixel(image, 17, 2, joint);
  setPixel(image, 1, 12, joint);
  return image;
}

/**
 * A spinneret: a pale round silk gland with a glowing tip (brighter in frame 1).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function glandFrame(frame) {
  const size = 12;
  const rim = color('#3a3020');
  const gland = color('#c8bca0');
  const lit = color('#f0e8d8');
  const tip = mix(color('#c8bca0'), color('#ffffff'), frame === 0 ? 0.4 : 1);
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.5, 5.5, (u, v, e) => {
    if (e > 0.82) return rim;
    if (u < -0.45 && Math.abs(v) < 0.3) return tip;
    return u + v < -0.6 ? lit : gland;
  });
  return image;
}
