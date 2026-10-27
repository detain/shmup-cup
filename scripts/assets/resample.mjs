/**
 * Deterministic resampling of the marketing stills (`pnpm store:assets`, v20x-A2): an exact
 * fractional-box **area downscale**, an aspect-preserving **contain fit** that pads the remainder
 * with one colour, and a **median-cut** quantiser to at most 256 colours so every product can be
 * written as an indexed PNG-8 (`scripts/assets/png.mjs`, `encodePng(image, { indexed: 'auto' })`).
 *
 * The store and icon surfaces are built from high-resolution generated stills, so unlike the atlas
 * (whole-pixel copies and integer scaling only) they must shrink to their sizes. Every operation
 * here is pure arithmetic with a fixed accumulation order — row-major loops, IEEE-754 `+` / `*`,
 * `Math.round` (half up) — so the same input bytes always produce the same output bytes on every
 * machine, which is what makes `store-assets.mjs --check` byte-exact through re-rendering.
 *
 * **Public API.** {@link downscaleArea}, {@link fitContain}, {@link medianCutPalette},
 * {@link quantize}.
 *
 * @module
 */
import { blit, createImage } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./image.mjs').Rgba} Rgba */

/** Most colours an indexed PNG can hold (the PNG-8 cap `png.mjs` encodes within). */
const MAX_INDEXED_COLORS = 256;

/**
 * Whether a value is a positive integer (an image dimension).
 *
 * @param {number} value - Candidate.
 * @returns {boolean} `true` when it is one.
 */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

/**
 * The RGBA channels of a packed `0xRRGGBBAA` colour.
 *
 * @param {number} key - The packed colour (unsigned 32-bit).
 * @returns {Rgba} The channels.
 */
function rgbaOf(key) {
  return [(key >>> 24) & 0xff, (key >>> 16) & 0xff, (key >>> 8) & 0xff, key & 0xff];
}

/**
 * The colour key of a pixel.
 *
 * @param {Image} image - Source image.
 * @param {number} i - The pixel's byte offset (a multiple of 4).
 * @returns {number} The packed `0xRRGGBBAA` key (unsigned 32-bit).
 */
function keyAt(image, i) {
  return (
    ((image.data[i] << 24) |
      (image.data[i + 1] << 16) |
      (image.data[i + 2] << 8) |
      image.data[i + 3]) >>>
    0
  );
}

/**
 * Every distinct colour of an image and how often it occurs.
 *
 * @param {Image} image - Source image.
 * @returns {Map<number, number>} Colour key → count (insertion order: row-major first use).
 */
function colorHistogram(image) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (let i = 0; i < image.data.length; i += 4) {
    const key = keyAt(image, i);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Area-downscales an image to a smaller (or equal) size with an exact fractional-box filter: each
 * output pixel is the box-weighted mean of the source pixels its rectangle covers.
 *
 * @param {Image} image - Source image (not modified).
 * @param {number} width - Target width (integer ≥ 1, ≤ `image.width`).
 * @param {number} height - Target height (integer ≥ 1, ≤ `image.height`).
 * @returns {Image} The downscaled copy.
 * @throws {RangeError} When a target dimension is not a positive integer, or the target is larger
 *   than the source (this module never enlarges — enlarge from the art, not from a resample).
 *
 * @remarks
 * The overlap weights and the accumulation order are fixed (row-major, exact rational overlap as
 * `min(edge, src+1) − max(edge, src)`), so the arithmetic is IEEE-754 reproducible: the same bytes
 * in, the same bytes out on every machine. Channels average straight (no alpha weighting) — these
 * are opaque marketing stills; a source's transparent pixels average in as the colour they carry.
 */
export function downscaleArea(image, width, height) {
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new RangeError(`target size must be positive integers, got ${width}×${height}`);
  }
  if (width > image.width || height > image.height) {
    throw new RangeError(
      `downscale cannot enlarge ${image.width}×${image.height} to ${width}×${height}`,
    );
  }
  const out = createImage(width, height);
  if (width === image.width && height === image.height) {
    blit(out, image, 0, 0);
    return out;
  }
  const xRatio = image.width / width;
  const yRatio = image.height / height;
  for (let oy = 0; oy < height; oy++) {
    const y0 = oy * yRatio;
    const y1 = Math.min(image.height, y0 + yRatio);
    for (let ox = 0; ox < width; ox++) {
      const x0 = ox * xRatio;
      const x1 = Math.min(image.width, x0 + xRatio);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let w = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const weight = wx * wy;
          const i = (sy * image.width + sx) * 4;
          r += image.data[i] * weight;
          g += image.data[i + 1] * weight;
          b += image.data[i + 2] * weight;
          a += image.data[i + 3] * weight;
          w += weight;
        }
      }
      const o = (oy * width + ox) * 4;
      out.data[o] = Math.round(r / w);
      out.data[o + 1] = Math.round(g / w);
      out.data[o + 2] = Math.round(b / w);
      out.data[o + 3] = Math.round(a / w);
    }
  }
  return out;
}

/**
 * Fits an image into a box, aspect preserved, and centres it on a background of the remainder
 * (pillarboxed when the box is wider, letterboxed when taller).
 *
 * @param {Image} image - Source image (not modified).
 * @param {number} width - Box width (integer ≥ 1).
 * @param {number} height - Box height (integer ≥ 1).
 * @param {Rgba} background - The pad colour (the 512 × 423 TV icon sits on the playfield navy).
 * @returns {Image} A `width × height` image.
 * @throws {RangeError} When a box dimension is not a positive integer, or the box is larger than
 *   the source on both axes (see {@link downscaleArea} — this module never enlarges).
 */
export function fitContain(image, width, height, background) {
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new RangeError(`fit box must be positive integers, got ${width}×${height}`);
  }
  if (width > image.width && height > image.height) {
    throw new RangeError(
      `fit cannot enlarge ${image.width}×${image.height} into ${width}×${height}`,
    );
  }
  const scale = Math.min(width / image.width, height / image.height);
  const fittedWidth = Math.max(1, Math.floor(image.width * scale));
  const fittedHeight = Math.max(1, Math.floor(image.height * scale));
  const fitted = downscaleArea(image, fittedWidth, fittedHeight);
  if (fittedWidth === width && fittedHeight === height) return fitted;
  const out = createImage(width, height);
  for (let i = 0; i < out.data.length; i += 4) out.data.set(background, i);
  blit(out, fitted, Math.floor((width - fittedWidth) / 2), Math.floor((height - fittedHeight) / 2));
  return out;
}

/**
 * A median-cut box: distinct colour keys sorted for its current split axis.
 *
 * @typedef {{ keys: number[], counts: Map<number, number>, axis: number, low: number,
 *   high: number, total: number }} Box
 */

/**
 * The channel range of a set of keys along one axis.
 *
 * @param {number[]} keys - The box's colour keys (sorted by this axis already).
 * @param {number} axis - Channel index (0 red … 3 alpha).
 * @returns {[number, number]} The smallest and largest channel value.
 */
function channelRange(keys, axis) {
  const shift = 24 - axis * 8;
  return [(keys[0] >>> shift) & 0xff, (keys[keys.length - 1] >>> shift) & 0xff];
}

/**
 * A box's extent (largest channel range) and its axis (smallest channel index among the largest).
 *
 * @param {number[][]} axisOrder - Keys sorted by channel 0, by 1, … (parallel to the axes).
 * @returns {{ axis: number, extent: number }} Where to split.
 */
function widestAxis(axisOrder) {
  let axis = 0;
  let extent = -1;
  for (let channel = 0; channel < 4; channel++) {
    const [low, high] = channelRange(axisOrder[channel], channel);
    if (high - low > extent) {
      extent = high - low;
      axis = channel;
    }
  }
  return { axis, extent };
}

/**
 * Builds the per-axis sort orders of a key list (channel value, then key — a total order).
 *
 * @param {number[]} keys - Distinct colour keys.
 * @returns {number[][]} One copy per channel, each sorted by that channel then the key.
 */
function axisOrders(keys) {
  /** @type {number[][]} */
  const orders = [];
  for (let channel = 0; channel < 4; channel++) {
    const shift = 24 - channel * 8;
    orders.push(
      keys.slice().sort((a, b) => ((a >>> shift) & 0xff) - ((b >>> shift) & 0xff) || a - b),
    );
  }
  return orders;
}

/**
 * A median-cut palette: at most `maxColors` colours, chosen by splitting the colour space at the
 * count median of its widest box, deterministic by construction (fixed sort orders and tie-breaks:
 * widest extent, then larger count, then the lowest key; the mean of each final box is one entry,
 * and the entries are returned sorted by packed key).
 *
 * @param {Image} image - Source image.
 * @param {number} [maxColors] - Palette cap (default 256, the indexed-PNG maximum; ≥ 1).
 * @returns {Rgba[]} The palette (at most `maxColors`, no duplicates, sorted by packed key).
 * @throws {RangeError} When the cap is not a positive integer.
 *
 * @remarks
 * An image with at most `maxColors` distinct colours gets its exact colours back — the quantiser
 * is lossless where it can be (the in-game palettes this repo already ships, the flat-navy pads).
 */
export function medianCutPalette(image, maxColors = MAX_INDEXED_COLORS) {
  if (!isPositiveInteger(maxColors)) {
    throw new RangeError(`palette cap must be a positive integer, got ${maxColors}`);
  }
  const counts = colorHistogram(image);
  let keys = [...counts.keys()].sort((a, b) => a - b);
  if (keys.length <= maxColors) return keys.map(rgbaOf);

  /** @type {Box[]} */
  const boxes = [];
  /**
   * Creates one box from a key list (its widest axis, its count total, its channel orders).
   *
   * @param {number[]} list - Distinct keys.
   * @returns {Box} The box.
   */
  const makeBox = (list) => {
    const orders = axisOrders(list);
    const { axis, extent } = widestAxis(orders);
    let total = 0;
    for (const key of list) total += counts.get(key) ?? 0;
    const [low, high] = channelRange(orders[axis], axis);
    return { keys: list, counts, axis: extent > 0 ? axis : -1, low, high, total };
  };
  boxes.push(makeBox(keys));

  while (boxes.length < maxColors) {
    let best = -1;
    let bestWidth = -1;
    let bestTotal = -1;
    for (let k = 0; k < boxes.length; k++) {
      const box = boxes[k];
      if (box.axis < 0 || box.keys.length < 2) continue;
      const width = box.high - box.low;
      if (width > bestWidth || (width === bestWidth && box.total > bestTotal)) {
        best = k;
        bestWidth = width;
        bestTotal = box.total;
      }
    }
    if (best < 0) break;
    const box = boxes[best];
    const shift = 24 - box.axis * 8;
    const sorted = box.keys
      .slice()
      .sort((a, b) => ((a >>> shift) & 0xff) - ((b >>> shift) & 0xff) || a - b);
    const half = box.total / 2;
    let seen = 0;
    let split = 0;
    for (let k = 0; k < sorted.length; k++) {
      seen += counts.get(sorted[k]) ?? 0;
      if (seen >= half) {
        split = k + 1;
        break;
      }
    }
    if (split < 1) split = 1;
    if (split > sorted.length - 1) split = sorted.length - 1;
    boxes.splice(best, 1, makeBox(sorted.slice(0, split)), makeBox(sorted.slice(split)));
  }

  const means = new Set(boxes.map(boxAverageKey(counts)));
  return [...means].sort((a, b) => a - b).map(rgbaOf);
}

/**
 * The count-weighted mean colour of a box, as a packed key.
 *
 * @param {Map<number, number>} counts - Colour key → count.
 * @returns {(box: Box) => number} The box's mean as `0xRRGGBBAA` (each channel rounded, half up).
 */
function boxAverageKey(counts) {
  return (box) => {
    let total = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (const key of box.keys) {
      const count = counts.get(key) ?? 0;
      total += count;
      r += ((key >>> 24) & 0xff) * count;
      g += ((key >>> 16) & 0xff) * count;
      b += ((key >>> 8) & 0xff) * count;
      a += (key & 0xff) * count;
    }
    return (
      ((Math.round(r / total) << 24) |
        (Math.round(g / total) << 16) |
        (Math.round(b / total) << 8) |
        Math.round(a / total)) >>>
      0
    );
  };
}

/**
 * Maps every distinct colour of an image to its nearest palette entry (squared RGB+A distance,
 * ties to the lower palette index) and rewrites the pixels.
 *
 * @param {Image} image - Source image (not modified).
 * @param {Rgba[]} palette - The colours to map onto (1…256 entries; see
 *   {@link medianCutPalette}).
 * @returns {Image} A copy whose every pixel is a palette colour.
 * @throws {RangeError} When the palette is empty or longer than the indexed-PNG cap.
 */
export function quantize(image, palette) {
  if (palette.length < 1 || palette.length > MAX_INDEXED_COLORS) {
    throw new RangeError(
      `palette must hold 1…${MAX_INDEXED_COLORS} colours, got ${palette.length}`,
    );
  }
  /** @type {Map<number, number>} colour key → nearest palette colour key */
  const nearest = new Map();
  /**
   * The palette colour nearest a key (cached per distinct colour).
   *
   * @param {number} key - The pixel's packed colour.
   * @returns {number} The palette entry's packed colour.
   */
  const lookup = (key) => {
    const cached = nearest.get(key);
    if (cached !== undefined) return cached;
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let k = 0; k < palette.length; k++) {
      const entry = palette[k];
      const dr = ((key >>> 24) & 0xff) - entry[0];
      const dg = ((key >>> 16) & 0xff) - entry[1];
      const db = ((key >>> 8) & 0xff) - entry[2];
      const da = (key & 0xff) - entry[3];
      const distance = dr * dr + dg * dg + db * db + da * da;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = k;
      }
    }
    const mapped =
      ((palette[bestIndex][0] << 24) |
        (palette[bestIndex][1] << 16) |
        (palette[bestIndex][2] << 8) |
        palette[bestIndex][3]) >>>
      0;
    nearest.set(key, mapped);
    return mapped;
  };
  const out = createImage(image.width, image.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const mapped = lookup(keyAt(image, i));
    out.data[i] = (mapped >>> 24) & 0xff;
    out.data[i + 1] = (mapped >>> 16) & 0xff;
    out.data[i + 2] = (mapped >>> 8) & 0xff;
    out.data[i + 3] = mapped & 0xff;
  }
  return out;
}
