/**
 * The art of the pseudo-3D **high-speed dimension** stage and the P2 bosses of plan M3-02
 * (placeholder art, decision D24):
 *
 * - `bg/dimension-floor` ({@link DIMENSION_TILE}×{@link DIMENSION_TILE}, one frame, anchor
 *   top-left): the tile the Mode-7 floor repeats — a neon grid of one lit cell on a dark violet
 *   field, with a brighter node where the lines cross. It is sampled by the Mode-7 shader with
 *   `fract`, so it has to wrap seamlessly on both axes: the lines sit on the tile's first row and
 *   column only.
 * - `bg/dimension-sky` (128×48, anchor top-left): the stage's far band — a dark violet gradient
 *   with a lit horizon line, so the Mode-7 floor meets something at the top.
 * - `enemies/dim-pylon` (16×40, 2 frames): the wall segments of the dimension's corridor, a lit
 *   pillar that pulses.
 * - `bosses/bloom-maw` (28×28, 2 frames, `whenOpen`): the suction boss's mouth, shut and gaping.
 * - `bosses/talon-claw` (18×14, 2 frames): the grabber's claw, open and closed.
 * - `bosses/strider-leg` (10×26, 2 frames): the invincible walker's leg, planted and mid-stride.
 *
 * Every sprite has a hit-flash sibling except the two backgrounds. Geometry uses only
 * `+ - * /` and `Math.sqrt` (the generators may not call `Math.sin` / `Math.cos`), so the pixels
 * are identical on every engine.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite, mix, withAlpha } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Edge of the `bg/dimension-floor` tile in pixels (one cell of the grid). */
export const DIMENSION_TILE = 32;

/** Width of the `bg/dimension-sky` band (its parallax `spacing`). */
export const DIMENSION_SKY_W = 128;

/** Height of the `bg/dimension-sky` band. */
export const DIMENSION_SKY_H = 48;

/**
 * The Mode-7 floor tile: a dark field with a lit line down its first column and along its first
 * row, and a brighter node where they meet.
 *
 * @returns {SpriteDef} `bg/dimension-floor`.
 */
function floorTile() {
  const n = DIMENSION_TILE;
  const image = createImage(n, n);
  const field = color('#180d30');
  const deep = color('#0d0720');
  const line = color('#6a3cd0');
  const node = color('#c89cff');
  for (let y = 0; y < n; y++) {
    // A gentle gradient across the cell, so neighbouring cells still read as separate.
    const tone = mix(field, deep, y / (n - 1));
    for (let x = 0; x < n; x++) setPixel(image, x, y, tone);
  }
  for (let i = 0; i < n; i++) {
    setPixel(image, i, 0, line);
    setPixel(image, 0, i, line);
  }
  setPixel(image, 0, 0, node);
  setPixel(image, 1, 0, node);
  setPixel(image, 0, 1, node);
  return makeSprite('bg/dimension-floor', [image], 'dimension', { anchor: [0, 0] });
}

/**
 * The dimension's far band: a violet gradient under a lit horizon line.
 *
 * @returns {SpriteDef} `bg/dimension-sky`.
 */
function skyBand() {
  const w = DIMENSION_SKY_W;
  const h = DIMENSION_SKY_H;
  const image = createImage(w, h);
  const top = color('#1b0d38');
  const bottom = color('#3a1a6e');
  const horizon = color('#a06cff');
  for (let y = 0; y < h; y++) {
    const tone = mix(top, bottom, y / (h - 1));
    for (let x = 0; x < w; x++) setPixel(image, x, y, tone);
  }
  for (let x = 0; x < w; x++) {
    setPixel(image, x, h - 1, horizon);
    setPixel(image, x, h - 2, withAlpha(horizon, 120));
  }
  return makeSprite('bg/dimension-sky', [image], 'dimension', { anchor: [0, 0] });
}

/**
 * The corridor pylon: a tall lit pillar with a core band that brightens on the second frame.
 *
 * @returns {SpriteDef} `enemies/dim-pylon`.
 */
function pylon() {
  const w = 16;
  const h = 40;
  const shell = color('#3c2a70');
  const edge = color('#7a5ad0');
  const dim = color('#8c5ce0');
  const lit = color('#e0c0ff');
  const frames = [dim, lit].map((core) => {
    const image = createImage(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 2; x < w - 2; x++) {
        setPixel(image, x, y, x === 2 || x === w - 3 ? edge : shell);
      }
    }
    for (let y = 4; y < h - 4; y += 6) {
      for (let x = 5; x < w - 5; x++) setPixel(image, x, y, core);
    }
    return image;
  });
  return makeSprite('enemies/dim-pylon', frames, 'dimension', {
    hitFlash: true,
    animations: { pulse: [0, 1] },
  });
}

/**
 * The suction boss's maw: a ring of petals round a dark throat, shut on frame 0 and gaping on
 * frame 1 (the `whenOpen` core sits behind it).
 *
 * @returns {SpriteDef} `bosses/bloom-maw`.
 */
function bloomMaw() {
  const n = 28;
  const centre = (n - 1) / 2;
  const petal = color('#4a7a3a');
  const rim = color('#8cd06a');
  const throat = color('#2a1030');
  const glow = color('#d0ff9a');
  const frames = [6, 11].map((gape) => {
    const image = createImage(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x - centre;
        const dy = y - centre;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 13.5) continue;
        if (d < gape) {
          setPixel(image, x, y, d < gape - 2 ? throat : glow);
          continue;
        }
        setPixel(image, x, y, d > 12 ? rim : petal);
      }
    }
    return image;
  });
  return makeSprite('bosses/bloom-maw', frames, 'dimension', { hitFlash: true });
}

/**
 * The grabber's claw: two hooked jaws, apart on frame 0 and closed on frame 1.
 *
 * @returns {SpriteDef} `bosses/talon-claw`.
 */
function talonClaw() {
  const w = 18;
  const h = 14;
  const iron = color('#6a6a7a');
  const edge = color('#b0b0c8');
  const hot = color('#ff8c50');
  const frames = [4, 1].map((gap) => {
    const image = createImage(w, h);
    const mid = (h - 1) / 2;
    for (let x = 0; x < w; x++) {
      // The jaws taper towards the tip and meet at the gap.
      const reach = Math.round((gap * (w - 1 - x)) / (w - 1)) + 1;
      for (let d = reach; d <= reach + 2; d++) {
        const top = Math.round(mid - d);
        const bottom = Math.round(mid + d);
        if (top >= 0) setPixel(image, x, top, d === reach ? edge : iron);
        if (bottom < h) setPixel(image, x, bottom, d === reach ? edge : iron);
      }
    }
    for (let x = w - 4; x < w; x++) setPixel(image, x, Math.round(mid), hot);
    return image;
  });
  return makeSprite('bosses/talon-claw', frames, 'dimension', { hitFlash: true });
}

/**
 * The walker's leg: a segmented armour strut, planted on frame 0 and lifted on frame 1.
 *
 * @returns {SpriteDef} `bosses/strider-leg`.
 */
function striderLeg() {
  const w = 10;
  const h = 26;
  const iron = color('#4a4a58');
  const edge = color('#8a8aa0');
  const joint = color('#d05a3a');
  const frames = [0, 3].map((lift) => {
    const image = createImage(w, h);
    for (let y = 0; y < h - lift; y++) {
      for (let x = 2; x < w - 2; x++) {
        setPixel(image, x, y + lift, x === 2 || x === w - 3 ? edge : iron);
      }
    }
    for (let y = 6 + lift; y < h; y += 8) {
      for (let x = 1; x < w - 1; x++) setPixel(image, x, y, joint);
    }
    return image;
  });
  return makeSprite('bosses/strider-leg', frames, 'dimension', {
    hitFlash: true,
    animations: { stride: [0, 1] },
  });
}

/**
 * Generates the dimension stage's art and the M3-02 boss parts.
 *
 * @returns {SpriteDef[]} The floor tile, the sky band, the pylon and the three boss parts.
 */
export function generate() {
  return [floorTile(), skyBand(), pylon(), bloomMaw(), talonClaw(), striderLeg()];
}
