/**
 * The ingest report's measurements (art bible §8 step 13): colour count, the luma floor,
 * median and 95th percentile of backdrop layers against the lighting budget (§4.1), near
 * misses against the reserved palette-cycle ramps (§4.4) and the mixel warning (§3.1).
 *
 * Luma is Rec. 709 on 0–255; the median and percentile are nearest-rank over the opaque
 * pixels of every frame.
 *
 * @module
 */
import { chebyshev, hexOf, lumaOf, packRgb } from './image.mjs';
import { RESERVED_MIN_DISTANCE } from './quantise.mjs';

/** @typedef {import('./image.mjs').Image} Image */

/**
 * The playfield value budget per backdrop layer (bible §4.1). `null` = not budgeted.
 *
 * @type {Readonly<Record<string, { floor: number, median: number, p95: number } | null>>}
 */
export const LIGHTING_BUDGET = Object.freeze({
  far: Object.freeze({ floor: 16, median: 64, p95: 140 }),
  'mid-far': Object.freeze({ floor: 16, median: 80, p95: 160 }),
  mid: Object.freeze({ floor: 16, median: 80, p95: 160 }),
  near: null,
  foreground: null,
});

/** Light sources may be brighter, but at most this share of a layer above luma 200. */
export const BRIGHT_SHARE_LIMIT = 0.05;

/**
 * Distinct opaque colours over some frames.
 *
 * @param {readonly Image[]} images - Frames.
 * @returns {number} The count (alpha ignored).
 */
export function colourCount(images) {
  const seen = new Set();
  for (const image of images) {
    const d = image.data;
    for (let p = 0; p < d.length; p += 4)
      if (d[p + 3] !== 0) seen.add(packRgb(d[p], d[p + 1], d[p + 2]));
  }
  return seen.size;
}

/**
 * Luma statistics of the opaque pixels.
 *
 * @param {readonly Image[]} images - Frames.
 * @returns {{ pixels: number, floor: number, median: number, p95: number, brightShare: number }}
 *   Rounded floor / median / p95 lumas and the share above luma 200 (zeros when empty).
 */
export function lumaStats(images) {
  /** @type {number[]} */
  const lumas = [];
  for (const image of images) {
    const d = image.data;
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] !== 0) lumas.push(lumaOf(packRgb(d[p], d[p + 1], d[p + 2])));
    }
  }
  if (lumas.length === 0) return { pixels: 0, floor: 0, median: 0, p95: 0, brightShare: 0 };
  lumas.sort((a, b) => a - b);
  /**
   * Nearest-rank percentile.
   *
   * @param {number} q - 0 … 1.
   * @returns {number} The luma at that rank.
   */
  const rank = (q) => lumas[Math.max(0, Math.ceil(q * lumas.length) - 1)];
  let bright = 0;
  for (const l of lumas) if (l > 200) bright++;
  return {
    pixels: lumas.length,
    floor: Math.round(lumas[0] * 10) / 10,
    median: Math.round(rank(0.5) * 10) / 10,
    p95: Math.round(rank(0.95) * 10) / 10,
    brightShare: Math.round((bright / lumas.length) * 1000) / 1000,
  };
}

/**
 * Warnings of a backdrop layer against the lighting budget.
 *
 * @param {ReturnType<typeof lumaStats>} stats - From {@link lumaStats}.
 * @param {string} layer - `far`, `mid-far`, `mid`, `near` or `foreground`.
 * @returns {string[]} One line per broken limit (empty when within budget or unbudgeted).
 */
export function lightingWarnings(stats, layer) {
  const budget = LIGHTING_BUDGET[layer];
  if (budget === null || budget === undefined || stats.pixels === 0) return [];
  /** @type {string[]} */
  const out = [];
  if (stats.floor < budget.floor) {
    out.push(
      `${layer} layer: darkest luma ${stats.floor} is below the floor ${budget.floor} (bible §4.1: lift the darks)`,
    );
  }
  if (stats.median > budget.median) {
    out.push(
      `${layer} layer: median luma ${stats.median} is over the budget ${budget.median} (bible §4.1: playfield grade)`,
    );
  }
  if (stats.p95 > budget.p95) {
    out.push(
      `${layer} layer: 95th-percentile luma ${stats.p95} is over the budget ${budget.p95} (bible §4.1: tone the highlights down)`,
    );
  }
  if (stats.brightShare > BRIGHT_SHARE_LIMIT) {
    out.push(
      `${layer} layer: ${Math.round(stats.brightShare * 1000) / 10} % of the pixels are above luma 200 ` +
        `(at most ${BRIGHT_SHARE_LIMIT * 100} % — light sources only)`,
    );
  }
  return out;
}

/**
 * Pixels that come near a reserved ramp colour without being an allowed one exactly.
 *
 * @param {readonly Image[]} images - Frames.
 * @param {readonly number[]} reserved - Reserved ramp colours.
 * @param {ReadonlySet<number>} allowed - Ramp colours this art may use exactly.
 * @returns {{ pixels: number, colours: string[] }} The count and the offending colours.
 */
export function nearMisses(images, reserved, allowed) {
  let pixels = 0;
  /** @type {Set<number>} */
  const colours = new Set();
  /** @type {Map<number, boolean>} */
  const memo = new Map();
  for (const image of images) {
    const d = image.data;
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] === 0) continue;
      const c = packRgb(d[p], d[p + 1], d[p + 2]);
      let bad = memo.get(c);
      if (bad === undefined) {
        bad = !allowed.has(c) && reserved.some((r) => chebyshev(c, r) < RESERVED_MIN_DISTANCE);
        memo.set(c, bad);
      }
      if (bad) {
        pixels++;
        colours.add(c);
      }
    }
  }
  return { pixels, colours: [...colours].sort((a, b) => a - b).map(hexOf) };
}

/**
 * Lengths of the runs of identical opaque pixels along the rows (or columns) of a frame.
 *
 * @param {Image} image - A frame.
 * @param {boolean} vertical - Columns instead of rows.
 * @returns {number[]} Run lengths.
 */
function runs(image, vertical) {
  const { width: w, height: h, data: d } = image;
  /** @type {number[]} */
  const out = [];
  const outer = vertical ? w : h;
  const inner = vertical ? h : w;
  for (let o = 0; o < outer; o++) {
    let run = 0;
    let prev = -1;
    for (let k = 0; k <= inner; k++) {
      let v = -1;
      if (k < inner) {
        const p = (vertical ? k * w + o : o * w + k) * 4;
        v = d[p + 3] === 0 ? -1 : (d[p] << 16) | (d[p + 1] << 8) | d[p + 2];
      }
      if (v === prev && v !== -1) run++;
      else {
        if (prev !== -1) out.push(run);
        run = 1;
        prev = v;
      }
    }
  }
  return out;
}

/**
 * Whether the frames look like a ×2 upscale ("mixels", bible §3.1): every run of equal
 * pixels, along rows and along columns, has an even length.
 *
 * @param {readonly Image[]} images - Frames.
 * @returns {boolean} `true` when there are at least 8 runs each way and all are even.
 */
export function looksUpscaled(images) {
  let rows = 0;
  let cols = 0;
  for (const image of images) {
    for (const length of runs(image, false)) {
      if (length % 2 !== 0) return false;
      rows++;
    }
    for (const length of runs(image, true)) {
      if (length % 2 !== 0) return false;
      cols++;
    }
  }
  return rows >= 8 && cols >= 8;
}
