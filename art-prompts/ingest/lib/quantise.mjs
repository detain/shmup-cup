/**
 * Colour reduction (art bible §4.3, §4.4, §3.7, §8 step 9): an adaptive palette by median
 * cut or the recipe's own palette, the reserved palette-cycle ramps kept clear, and the
 * mapping of every pixel to its nearest palette colour — with an ordered (Bayer) dither
 * where the bible allows one, never error diffusion.
 *
 * Every step is deterministic: histograms are sorted by colour, ties are broken by a fixed
 * order, and only integer or exactly-rounded arithmetic decides a result.
 *
 * @module
 */
import { chebyshev, dist2, hexOf, packRgb } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */

/** The palette-cycle shader matches within 1.5/255; everything else stays ≥ this far. */
export const RESERVED_MIN_DISTANCE = 3;

/** Bayer threshold matrices by size (values 0 … n² − 1, row-major). */
const BAYER = Object.freeze({
  2: [0, 2, 3, 1],
  4: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
});

/**
 * The opaque colours of some images and how often each occurs, sorted by colour.
 *
 * @param {readonly Image[]} images - Frames.
 * @returns {[number, number][]} `[0xRRGGBB, count]` pairs, ascending by colour.
 */
export function histogram(images) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (const image of images) {
    const d = image.data;
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] === 0) continue;
      const c = packRgb(d[p], d[p + 1], d[p + 2]);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * The count-weighted mean of a box, rounded per channel.
 *
 * @param {readonly [number, number][]} box - Colour / count pairs.
 * @returns {number} `0xRRGGBB`.
 */
function boxMean(box) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [c, k] of box) {
    r += ((c >> 16) & 255) * k;
    g += ((c >> 8) & 255) * k;
    b += (c & 255) * k;
    n += k;
  }
  return packRgb(Math.round(r / n), Math.round(g / n), Math.round(b / n));
}

/**
 * A box's total squared error against its mean (the split priority).
 *
 * @param {readonly [number, number][]} box - Colour / count pairs.
 * @returns {number} `Σ count · dist²(colour, mean)`.
 */
function boxError(box) {
  const mean = boxMean(box);
  let e = 0;
  for (const [c, k] of box) e += k * dist2(c, mean);
  return e;
}

/**
 * Median-cut palette of at most `max` colours. When the image has no more distinct colours
 * than that, they are the palette, exactly.
 *
 * @remarks
 * The box with the largest squared error is split (ties: the earlier box), along its
 * widest channel (ties: green, red, blue), at the count-weighted median. Each box's colour
 * is its rounded weighted mean; equal means collapse into one entry.
 *
 * @param {readonly [number, number][]} entries - From {@link histogram}.
 * @param {number} max - Palette size limit (≥ 1).
 * @returns {number[]} The palette, ascending by colour.
 */
export function medianCut(entries, max) {
  if (entries.length <= max) return entries.map(([c]) => c);
  /** @type {[number, number][][]} */
  const boxes = [entries.slice()];
  /** @type {number[]} */
  const errors = [boxError(boxes[0])];
  while (boxes.length < max) {
    let pick = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      if (pick < 0 || errors[i] > errors[pick]) pick = i;
    }
    if (pick < 0 || errors[pick] === 0) break;
    const box = boxes[pick];
    const lo = [255, 255, 255];
    const hi = [0, 0, 0];
    for (const [c] of box) {
      const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], ch[k]);
        hi[k] = Math.max(hi[k], ch[k]);
      }
    }
    // Widest channel; ties prefer green, then red, then blue (the eye's order).
    let axis = 1;
    for (const k of [0, 2]) if (hi[k] - lo[k] > hi[axis] - lo[axis]) axis = k;
    const shift = 16 - axis * 8;
    const sorted = box
      .slice()
      .sort((a, b) => ((a[0] >> shift) & 255) - ((b[0] >> shift) & 255) || a[0] - b[0]);
    let total = 0;
    for (const [, k] of sorted) total += k;
    let cut = 1;
    let run = 0;
    for (let i = 0; i < sorted.length; i++) {
      run += sorted[i][1];
      if (run * 2 >= total) {
        cut = i + 1;
        break;
      }
    }
    cut = Math.min(Math.max(cut, 1), sorted.length - 1);
    const a = sorted.slice(0, cut);
    const b = sorted.slice(cut);
    boxes.splice(pick, 1, a, b);
    errors.splice(pick, 1, boxError(a), boxError(b));
  }
  return [...new Set(boxes.map(boxMean))].sort((x, y) => x - y);
}

/** Larger than any squared RGB distance (3 · 255² = 195,075): "no second colour". */
const FAR = 3 * 255 * 255 + 1;

/**
 * The subset of a fixed palette (a named or explicit one — a zone's 48–64 colours) that
 * serves some art best within a colour cap (bible §4.3: ingest quantises to the cap).
 *
 * @remarks
 * Backward elimination: every pixel starts mapped to its nearest palette colour; then, one at
 * a time, the colour whose removal raises the total squared RGB error of that mapping least
 * is dropped (its pixels fall to their second-nearest colour), until `max` colours remain —
 * and colours no pixel needs are dropped even below the cap, so art with fewer colours keeps
 * fewer. The `forced` colours (the cycle ramps, kept exact; an outline) are never dropped and
 * count towards `max`. Ties drop the higher colour value. Only integer arithmetic decides (the
 * sums stay far below 2⁵³), so the result is the same on every machine; at least one colour
 * always remains.
 *
 * @param {readonly [number, number][]} entries - From {@link histogram}.
 * @param {readonly number[]} candidates - The fixed palette.
 * @param {readonly number[]} forced - Colours always kept; they count towards `max`.
 * @param {number} max - The cap.
 * @returns {number[]} The kept colours (forced ones included), ascending.
 */
export function reducePalette(entries, candidates, forced, max) {
  const forcedSet = new Set(forced);
  const cols = [...new Set([...candidates, ...forced])].sort((a, b) => a - b);
  const m = cols.length;
  const keep = cols.map((c) => forcedSet.has(c));
  const alive = cols.map(() => true);
  const n = entries.length;
  const r = new Int32Array(n);
  const g = new Int32Array(n);
  const b = new Int32Array(n);
  const k = new Float64Array(n);
  const n1 = new Int32Array(n);
  const n2 = new Int32Array(n);
  const d1 = new Float64Array(n);
  const d2 = new Float64Array(n);
  /**
   * Finds an entry's nearest and second-nearest live colours (ties: the lower colour).
   *
   * @param {number} h - Entry index.
   */
  const nearest = (h) => {
    let i1 = -1;
    let i2 = -1;
    let e1 = FAR;
    let e2 = FAR;
    for (let j = 0; j < m; j++) {
      if (!alive[j]) continue;
      const c = cols[j];
      const dr = r[h] - ((c >> 16) & 255);
      const dg = g[h] - ((c >> 8) & 255);
      const db = b[h] - (c & 255);
      const d = dr * dr + dg * dg + db * db;
      if (d < e1) {
        i2 = i1;
        e2 = e1;
        i1 = j;
        e1 = d;
      } else if (d < e2) {
        i2 = j;
        e2 = d;
      }
    }
    n1[h] = i1;
    n2[h] = i2;
    d1[h] = e1;
    d2[h] = e2;
  };
  for (let h = 0; h < n; h++) {
    const c = entries[h][0];
    r[h] = (c >> 16) & 255;
    g[h] = (c >> 8) & 255;
    b[h] = c & 255;
    k[h] = entries[h][1];
    nearest(h);
  }
  const cost = new Float64Array(m);
  let live = m;
  while (live > 1) {
    cost.fill(0);
    for (let h = 0; h < n; h++) cost[n1[h]] += k[h] * (d2[h] - d1[h]);
    let pick = -1;
    for (let j = 0; j < m; j++) {
      if (!alive[j] || keep[j]) continue;
      if (pick < 0 || cost[j] <= cost[pick]) pick = j; // ties: the higher colour goes
    }
    if (pick < 0 || (live <= max && cost[pick] > 0)) break;
    alive[pick] = false;
    live--;
    for (let h = 0; h < n; h++) if (n1[h] === pick || n2[h] === pick) nearest(h);
  }
  return cols.filter((_, j) => alive[j]);
}

/** Offsets tried when a colour must move away from a reserved one, nearest first. */
const PUSH_OFFSETS = (() => {
  /** @type {[number, number, number][]} */
  const out = [];
  for (let r = -6; r <= 6; r++)
    for (let g = -6; g <= 6; g++) for (let b = -6; b <= 6; b++) out.push([r, g, b]);
  out.sort(
    (p, q) =>
      p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - (q[0] * q[0] + q[1] * q[1] + q[2] * q[2]) ||
      p[0] - q[0] ||
      p[1] - q[1] ||
      p[2] - q[2],
  );
  return out;
})();

/**
 * The nearest colour at least {@link RESERVED_MIN_DISTANCE} (Chebyshev) from every reserved
 * colour; the colour itself when it already is.
 *
 * @param {number} colour - `0xRRGGBB`.
 * @param {readonly number[]} reserved - Colours to keep clear of.
 * @returns {number | null} The pushed colour, or `null` when no offset within ±6 works.
 */
export function pushClear(colour, reserved) {
  const clear = (/** @type {number} */ c) =>
    reserved.every((r) => chebyshev(c, r) >= RESERVED_MIN_DISTANCE);
  if (clear(colour)) return colour;
  const r = (colour >> 16) & 255;
  const g = (colour >> 8) & 255;
  const b = colour & 255;
  for (const [dr, dg, db] of PUSH_OFFSETS) {
    const nr = r + dr;
    const ng = g + dg;
    const nb = b + db;
    if (nr < 0 || ng < 0 || nb < 0 || nr > 255 || ng > 255 || nb > 255) continue;
    const c = packRgb(nr, ng, nb);
    if (clear(c)) return c;
  }
  return null;
}

/**
 * Moves every palette colour that is not an allowed ramp colour out of the reserved
 * ramps' reach (bible §4.4).
 *
 * @param {readonly number[]} palette - Palette colours.
 * @param {readonly number[]} reserved - Every reserved ramp colour (project-wide plus the
 *   recipe's own cycles).
 * @param {ReadonlySet<number>} allowed - Ramp colours this art may use exactly.
 * @returns {{ palette: number[], moves: string[] }} The cleared palette (deduplicated,
 *   ascending) and one note per moved or unmovable colour.
 */
export function clearReserved(palette, reserved, allowed) {
  /** @type {string[]} */
  const moves = [];
  /** @type {number[]} */
  const out = [];
  for (const c of palette) {
    if (allowed.has(c)) {
      out.push(c);
      continue;
    }
    const pushed = pushClear(c, reserved);
    if (pushed === null) {
      moves.push(
        `${hexOf(c)} is within ${RESERVED_MIN_DISTANCE}/255 of a reserved ramp colour and could not be moved`,
      );
      out.push(c);
    } else {
      if (pushed !== c) {
        const near = reserved.find((r) => chebyshev(c, r) < RESERVED_MIN_DISTANCE) ?? c;
        moves.push(`${hexOf(c)} → ${hexOf(pushed)} (too close to reserved ${hexOf(near)})`);
      }
      out.push(pushed);
    }
  }
  return { palette: [...new Set(out)].sort((a, b) => a - b), moves };
}

/**
 * Index of the nearest palette colour (squared RGB distance; ties: the lower index).
 *
 * @param {number} r - Red (may be outside 0–255 before clamping by the caller).
 * @param {number} g - Green.
 * @param {number} b - Blue.
 * @param {readonly number[]} palette - Colours.
 * @returns {number} The index.
 */
function nearestIndex(r, g, b, palette) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    const dr = r - ((c >> 16) & 255);
    const dg = g - ((c >> 8) & 255);
    const db = b - (c & 255);
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Maps every visible pixel of an image to its nearest palette colour, in place; alpha is
 * kept.
 *
 * @param {Image} image - A frame.
 * @param {readonly number[]} palette - At least one colour.
 * @param {{ size: 0 | 2 | 4, strength: number }} dither - Ordered dither (`size` 0 = off);
 *   the threshold offset `(m + ½) / n² − ½` times `strength` is added to every channel,
 *   with `m` from the Bayer matrix at the pixel's frame position.
 */
export function mapToPalette(image, palette, dither) {
  const d = image.data;
  const w = image.width;
  /** @type {Map<number, number>} */
  const cache = new Map();
  const matrix = dither.size === 0 ? null : BAYER[dither.size];
  const cells = dither.size * dither.size;
  for (let p = 0, i = 0; p < d.length; p += 4, i++) {
    if (d[p + 3] === 0) continue;
    let index;
    if (matrix === null) {
      const c = packRgb(d[p], d[p + 1], d[p + 2]);
      index = cache.get(c);
      if (index === undefined) {
        index = nearestIndex(d[p], d[p + 1], d[p + 2], palette);
        cache.set(c, index);
      }
    } else {
      const x = i % w;
      const y = (i - x) / w;
      const m = matrix[(y % dither.size) * dither.size + (x % dither.size)];
      const offset = ((m + 0.5) / cells - 0.5) * dither.strength;
      index = nearestIndex(d[p] + offset, d[p + 1] + offset, d[p + 2] + offset, palette);
    }
    const c = palette[index];
    d[p] = (c >> 16) & 255;
    d[p + 1] = (c >> 8) & 255;
    d[p + 2] = c & 255;
  }
}
