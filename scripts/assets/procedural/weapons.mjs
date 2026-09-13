/**
 * Player weapon art of the meter arsenal's Types B–D (plan M2-03, `shmup_feat.md` §7A) that is
 * easier to draw as geometry than as pixel rows:
 *
 * - `shots/blast` (32×32, 4 frames, centred): the Spread Bomb's blast — a hot disc that opens
 *   into a ring and cools from white-yellow to red as it burns (the engine picks the frame from
 *   the blast's age).
 * - `shots/ripple` (24×44, 6 frames, centred): the Ripple's ring, an upright ellipse whose half
 *   height grows 4 → 20 px over the frames with half the width (the engine picks the frame from
 *   the ring's current size, core `weapons` `laser.ripple`).
 * - `shots/cyclone` (8×9, 4 frames, anchor at the left end of the middle row): one segment of the
 *   Cyclone Laser — two strands twisting around a bright core; it tiles horizontally like
 *   `shots/laser` (one wave period per segment), and the engine steps the frames along the beam
 *   and over time so the strands swirl.
 *
 * Only exactly rounded maths (square roots, `+ − × ÷`); the waves are triangle waves.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Side of a blast frame. */
export const BLAST_SIZE = 32;

/** Outer radius of the blast per frame. */
const BLAST_OUTER = [8, 11, 14, 15.5];

/** Inner (hollow) radius of the blast per frame. */
const BLAST_INNER = [0, 3, 8, 12];

/** The blast's colours, hottest first. */
const BLAST_COLORS = ['#fff8d0', '#f8d040', '#f07818', '#c02810', '#701408'];

/**
 * Draws one blast frame: a disc (frame 0) opening into a ring, coloured from its inner edge
 * outwards and cooler in later frames.
 *
 * @param {number} frame - Frame index 0…3.
 * @returns {Image} The 32×32 frame.
 */
function blastFrame(frame) {
  const image = createImage(BLAST_SIZE, BLAST_SIZE);
  const c = (BLAST_SIZE - 1) / 2;
  const outer = BLAST_OUTER[frame];
  const inner = BLAST_INNER[frame];
  for (let y = 0; y < BLAST_SIZE; y++) {
    for (let x = 0; x < BLAST_SIZE; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > outer || d < inner) continue;
      const t = outer > inner ? (d - inner) / (outer - inner) : 0;
      const band = t < 0.3 ? 0 : t < 0.6 ? 1 : t < 0.85 ? 2 : 3;
      const index = Math.min(BLAST_COLORS.length - 1, band + (frame >> 1));
      setPixel(image, x, y, color(BLAST_COLORS[index]));
    }
  }
  return image;
}

/** Ripple frame width (twice the largest half width, 10 px, plus a margin). */
export const RIPPLE_W = 24;

/** Ripple frame height (twice the largest half height, 20 px, plus a margin). */
export const RIPPLE_H = 44;

/** Ripple frames (half heights 4 … 20). */
export const RIPPLE_FRAMES = 6;

/**
 * Draws one ripple ring: pixels whose normalised ellipse distance is within ±1 px of the ring
 * (measured along the height), white on the inside edge, cyan outside.
 *
 * @param {number} frame - Frame index 0 … {@link RIPPLE_FRAMES} − 1.
 * @returns {Image} The 24×44 frame.
 */
function rippleFrame(frame) {
  const image = createImage(RIPPLE_W, RIPPLE_H);
  const cx = (RIPPLE_W - 1) / 2;
  const cy = (RIPPLE_H - 1) / 2;
  const b = 4 + (frame * (20 - 4)) / (RIPPLE_FRAMES - 1);
  const a = b / 2;
  const white = color('#ffffff');
  const cyan = color('#58d8f8');
  const deep = color('#2080c0');
  for (let y = 0; y < RIPPLE_H; y++) {
    for (let x = 0; x < RIPPLE_W; x++) {
      const nx = (x - cx) / a;
      const ny = (y - cy) / b;
      const e = Math.sqrt(nx * nx + ny * ny);
      const off = (e - 1) * b;
      if (off < -1.2 || off > 1.2) continue;
      setPixel(image, x, y, off < -0.4 ? white : off < 0.4 ? cyan : deep);
    }
  }
  return image;
}

/** Cyclone segment length (= core `weapons` `LASER_SEGMENT_LENGTH`). */
export const CYCLONE_W = 8;

/** Cyclone segment height (the beam's hitbox is 8 px tall). */
export const CYCLONE_H = 9;

/**
 * A triangle wave: −2 … 2 with period 8.
 *
 * @param {number} p - Phase (integer).
 * @returns {number} The offset.
 */
function triangle(p) {
  const m = ((p % 8) + 8) % 8;
  return Math.abs(m - 4) - 2;
}

/**
 * Draws one cyclone segment: a bright core row, two strands a quarter period apart swinging
 * around it (shifted two columns per frame) and a faint glow.
 *
 * @param {number} frame - Frame index 0…3.
 * @returns {Image} The 8×9 frame.
 */
function cycloneFrame(frame) {
  const image = createImage(CYCLONE_W, CYCLONE_H);
  const mid = (CYCLONE_H - 1) / 2;
  const core = color('#ffffff');
  const strand = color('#c890ff');
  const glow = color('#6040c0');
  for (let x = 0; x < CYCLONE_W; x++) {
    // Two strands a quarter period apart: as the frames step they twist around the core.
    const a = triangle(x + frame * 2);
    const b = triangle(x + frame * 2 + 2);
    for (let y = 0; y < CYCLONE_H; y++) {
      const d = y - mid;
      if (d === 0) setPixel(image, x, y, core);
      else if (d === a || d === b) setPixel(image, x, y, strand);
      else if (Math.abs(d) <= 3) setPixel(image, x, y, glow);
    }
  }
  return image;
}

/**
 * Generates the weapon sprites.
 *
 * @returns {SpriteDef[]} `shots/blast`, `shots/ripple`, `shots/cyclone`.
 */
export function generate() {
  return [
    makeSprite('shots/blast', [0, 1, 2, 3].map(blastFrame), 'weapons', {
      animations: { burst: [0, 1, 2, 3] },
    }),
    makeSprite(
      'shots/ripple',
      Array.from({ length: RIPPLE_FRAMES }, (_, i) => rippleFrame(i)),
      'weapons',
      { animations: { grow: [0, 1, 2, 3, 4, 5] } },
    ),
    makeSprite('shots/cyclone', [0, 1, 2, 3].map(cycloneFrame), 'weapons', {
      anchor: [0, 4],
      animations: { swirl: [0, 1, 2, 3] },
    }),
  ];
}
