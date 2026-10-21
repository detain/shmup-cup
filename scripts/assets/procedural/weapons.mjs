/**
 * Player weapon art of the meter arsenal's Types B–D (plan M2-03, `shmup_feat.md` §7A) that is
 * easier to draw as geometry than as pixel rows:
 *
 * - `shots/blast` (32×32, 4 frames, centred): the Spread Bomb's blast — a hot disc that opens
 *   into a ring and cools from white-yellow to red as it burns (the engine picks the frame from
 *   the blast's age). From R4-01.A7 the v2 path draws the art bible §5's **48×48** blast native
 *   (radii ×1.5); at art scale 1 the v1 disc above, byte for byte.
 * - `shots/ripple` (24×44, 6 frames, centred): the Ripple's ring, an upright ellipse whose half
 *   height grows 4 → 20 px over the frames with half the width (the engine picks the frame from
 *   the ring's current size, core `weapons` `laser.ripple`). From R4-01.A7 the v2 path draws the
 *   bible's **36×66** ring native, half heights 6 → 30 in the same frame order core's size pick
 *   indexes; at scale 1 the v1 ring, byte for byte.
 * - `shots/cyclone` (8×9, 4 frames, anchor at the left end of the middle row): one segment of the
 *   Cyclone Laser — two strands twisting around a bright core; it tiles horizontally like
 *   `shots/laser` (one wave period per segment), and the engine steps the frames along the beam
 *   and over time so the strands swirl. From R4-01.A7 the v2 path draws the bible's **12×14**
 *   segment native (one 12-px period = `LASER_SEGMENT_LENGTH` after R2-02, the strands' reach
 *   ±3, the core rows 6–7, anchor [0, 6]); at scale 1 the v1 segment, byte for byte.
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

/** Side of a v2 blast frame (the art bible §5's 48×48, native). */
export const BLAST_SIZE_V2 = 48;

/** Outer radius of the v2 blast per frame (the v1 radii ×1.5). */
const BLAST_OUTER_V2 = [12, 16.5, 21, 23.25];

/** Inner (hollow) radius of the v2 blast per frame (the v1 radii ×1.5). */
const BLAST_INNER_V2 = [0, 4.5, 12, 18];

/** The blast's colours, hottest first. */
const BLAST_COLORS = ['#fff8d0', '#f8d040', '#f07818', '#c02810', '#701408'];

/**
 * Draws one blast frame: a disc (frame 0) opening into a ring, coloured from its inner edge
 * outwards and cooler in later frames.
 *
 * @param {number} frame - Frame index 0…3.
 * @param {boolean} v2 - Draw the art bible's native 48×48 blast (radii ×1.5, same colours).
 * @returns {Image} The 32×32 (or 48×48) frame.
 */
function blastFrame(frame, v2) {
  const size = v2 ? BLAST_SIZE_V2 : BLAST_SIZE;
  const image = createImage(size, size);
  const c = (size - 1) / 2;
  const outer = (v2 ? BLAST_OUTER_V2 : BLAST_OUTER)[frame];
  const inner = (v2 ? BLAST_INNER_V2 : BLAST_INNER)[frame];
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

/** Ripple v2 frame width (the bible §5's 36×66, native — the v1 sizes ×1.5). */
export const RIPPLE_W_V2 = 36;

/** Ripple v2 frame height. */
export const RIPPLE_H_V2 = 66;

/**
 * Draws one ripple ring: pixels whose normalised ellipse distance is within a hair of the ring
 * (measured along the height), white on the inside edge, cyan outside. The v2 ring is the v1 one
 * exactly ×1.5 (half heights 6 … 30 in the same frame order — core's size pick indexes the
 * frames by ring size, so the order is what the engine reads).
 *
 * @param {number} frame - Frame index 0 … {@link RIPPLE_FRAMES} − 1.
 * @param {boolean} v2 - Draw the bible's native 36×66 ring.
 * @returns {Image} The 24×44 (or 36×66) frame.
 */
function rippleFrame(frame, v2) {
  const w = v2 ? RIPPLE_W_V2 : RIPPLE_W;
  const h = v2 ? RIPPLE_H_V2 : RIPPLE_H;
  const image = createImage(w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const b = (4 + (frame * (20 - 4)) / (RIPPLE_FRAMES - 1)) * (v2 ? 1.5 : 1);
  const a = b / 2;
  const band = v2 ? 1.8 : 1.2;
  const split = v2 ? 0.6 : 0.4;
  const white = color('#ffffff');
  const cyan = color('#58d8f8');
  const deep = color('#2080c0');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / a;
      const ny = (y - cy) / b;
      const e = Math.sqrt(nx * nx + ny * ny);
      const off = (e - 1) * b;
      if (off < -band || off > band) continue;
      setPixel(image, x, y, off < -split ? white : off < split ? cyan : deep);
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
 * The v2 triangle wave: −3 … 3 with one period across the 12-px segment
 * (`LASER_SEGMENT_LENGTH` after R2-02).
 *
 * @param {number} p - Phase (integer).
 * @returns {number} The offset.
 */
function triangle12(p) {
  const m = ((p % 12) + 12) % 12;
  return Math.abs(m - 6) - 3;
}

/**
 * Draws one cyclone segment: a bright core row, two strands a quarter period apart swinging
 * around it (shifted two columns per frame) and a faint glow. The v2 segment is the bible's
 * native 12×14: period 12 (one full wave per segment), the strands reach ±3 and swing three
 * columns per frame around the two-row core (rows 6–7, the anchor row), with the quarter-period
 * offset the v1 segment had.
 *
 * @param {number} frame - Frame index 0…3.
 * @param {boolean} v2 - Draw the bible's native 12×14 segment.
 * @returns {Image} The 8×9 (or 12×14) frame.
 */
function cycloneFrame(frame, v2) {
  if (!v2) {
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
  const image = createImage(12, 14);
  const core = color('#ffffff');
  const strand = color('#c890ff');
  const glow = color('#6040c0');
  for (let x = 0; x < 12; x++) {
    // Strand A swings around the core's top row, strand B around its bottom one, a quarter
    // period (3 columns) apart — each hidden behind the core where it crosses it.
    const a = triangle12(x + frame * 3);
    const b = triangle12(x + frame * 3 + 3);
    for (let y = 0; y < 14; y++) {
      const d = y - 6.5;
      if (y === 6 || y === 7) setPixel(image, x, y, core);
      else if (y - 6 === a || y - 7 === b) setPixel(image, x, y, strand);
      else if (d >= -4.5 && d <= 4.5) setPixel(image, x, y, glow);
    }
  }
  return image;
}

/**
 * Generates the weapon sprites.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale the
 *   three shots are drawn at (default 1).
 * @returns {SpriteDef[]} `shots/blast`, `shots/ripple`, `shots/cyclone`.
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const v2 = (options.artScale ?? 1) !== 1;
  return [
    makeSprite(
      'shots/blast',
      [0, 1, 2, 3].map((f) => blastFrame(f, v2)),
      'weapons',
      {
        animations: { burst: [0, 1, 2, 3] },
        native: v2,
      },
    ),
    makeSprite(
      'shots/ripple',
      Array.from({ length: RIPPLE_FRAMES }, (_, i) => rippleFrame(i, v2)),
      'weapons',
      { animations: { grow: [0, 1, 2, 3, 4, 5] }, native: v2 },
    ),
    makeSprite(
      'shots/cyclone',
      [0, 1, 2, 3].map((f) => cycloneFrame(f, v2)),
      'weapons',
      {
        anchor: v2 ? [0, 6] : [0, 4],
        animations: { swirl: [0, 1, 2, 3] },
        native: v2,
      },
    ),
  ];
}
