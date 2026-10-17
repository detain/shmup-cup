/**
 * The downscale (art bible §8, steps 7–8): an exact **area (box) filter** straight from the
 * keyed region to the target frame size — fractional factors included, never up — then a
 * **pixel snap** and the alpha rule.
 *
 * - Every target pixel covers a box of `fx × fy` source pixels (the factors); each source
 *   pixel counts with the area it shares with that box. Outside the region counts as empty,
 *   so a `contain` fit leaves transparent margins.
 * - **Binary alpha:** a pixel is opaque when at least `coverage` (default ½) of its box is
 *   subject. Its colour is the subject average, then **snapped** to the subject source
 *   colour nearest that average — a real colour of the art, never a blend of an outline and
 *   a highlight (the "mud" an average makes).
 * - **Translucent:** alpha is the box's average alpha; the colour is the alpha-weighted
 *   average (no snap).
 * - **Additive:** the box's premultiplied average light (black adds nothing); opaque when
 *   its brightest channel reaches the key threshold.
 *
 * Arithmetic is plain IEEE-754 `+ - * /` in a fixed order, so results are identical on
 * every machine.
 *
 * @module
 */
import { createImage, dist2, packRgb } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */

/**
 * Scale settings, as the recipe normalises them.
 *
 * @typedef {object} ScaleSettings
 * @property {'stretch' | 'contain'} fit - `stretch` maps the region onto the frame exactly;
 *   `contain` scales uniformly so the region fits, centred (or aligned).
 * @property {'center' | 'bottom' | 'top'} align - Vertical placement for `contain`
 *   (horizontally it is always centred).
 * @property {'binary' | 'translucent' | 'additive'} alpha - The alpha recipe (bible §3.6).
 * @property {number} coverage - Binary alpha: the subject share of a box that makes it opaque.
 * @property {boolean} snap - Binary alpha: snap to the nearest real source colour.
 * @property {number} threshold - Additive: brightness below this is transparent.
 */

/**
 * One axis of the box filter: for every target column (or row), the source columns it
 * overlaps and the overlap lengths.
 *
 * @param {number} target - Target length.
 * @param {number} source - Source length.
 * @param {number} factor - Source pixels per target pixel.
 * @param {number} offset - Target position of the source's first pixel.
 * @returns {{ index: number[], weight: number[] }[]} Per target pixel.
 */
function axisWeights(target, source, factor, offset) {
  /** @type {{ index: number[], weight: number[] }[]} */
  const out = [];
  for (let t = 0; t < target; t++) {
    const from = (t - offset) * factor;
    const to = (t + 1 - offset) * factor;
    /** @type {number[]} */
    const index = [];
    /** @type {number[]} */
    const weight = [];
    const first = Math.max(0, Math.floor(from));
    const last = Math.min(source - 1, Math.ceil(to) - 1);
    for (let s = first; s <= last; s++) {
      const w = Math.min(to, s + 1) - Math.max(from, s);
      if (w > 0) {
        index.push(s);
        weight.push(w);
      }
    }
    out.push({ index, weight });
  }
  return out;
}

/**
 * Downscales a keyed region into one frame.
 *
 * @param {Image} region - Straight-alpha RGBA (from `keyRegion`).
 * @param {number} width - Target frame width.
 * @param {number} height - Target frame height.
 * @param {ScaleSettings} settings - Fit and alpha rules.
 * @returns {{ image: Image, factorX: number, factorY: number }} The frame and the factors
 *   (source px per frame px).
 * @throws {RangeError} When the region is smaller than the frame (ingest never scales up).
 */
export function downscale(region, width, height, settings) {
  const sw = region.width;
  const sh = region.height;
  let fx = sw / width;
  let fy = sh / height;
  let ox = 0;
  let oy = 0;
  if (settings.fit === 'contain') {
    const f = Math.max(fx, fy);
    fx = f;
    fy = f;
    const cw = sw / f;
    const ch = sh / f;
    ox = (width - cw) / 2;
    oy =
      settings.align === 'bottom' ? height - ch : settings.align === 'top' ? 0 : (height - ch) / 2;
  }
  if (fx < 1 || fy < 1) {
    throw new RangeError(
      `the ${sw}×${sh} region is smaller than the ${width}×${height} frame — ingest never ` +
        'scales up (art bible §3.1); crop a larger region or draw it by hand',
    );
  }
  const cols = axisWeights(width, sw, fx, ox);
  const rows = axisWeights(height, sh, fy, oy);
  const boxArea = fx * fy;
  const src = region.data;
  const out = createImage(width, height);
  const d = out.data;
  for (let ty = 0; ty < height; ty++) {
    const row = rows[ty];
    for (let tx = 0; tx < width; tx++) {
      const col = cols[tx];
      let sumA = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let j = 0; j < row.index.length; j++) {
        const sy = row.index[j];
        const wy = row.weight[j];
        for (let i = 0; i < col.index.length; i++) {
          const p = (sy * sw + col.index[i]) * 4;
          const a = src[p + 3];
          if (a === 0) continue;
          const w = (wy * col.weight[i] * a) / 255;
          sumA += w;
          sumR += w * src[p];
          sumG += w * src[p + 1];
          sumB += w * src[p + 2];
        }
      }
      const o = (ty * width + tx) * 4;
      if (settings.alpha === 'additive') {
        const r = sumR / boxArea;
        const g = sumG / boxArea;
        const b = sumB / boxArea;
        if (Math.max(r, g, b) < settings.threshold) continue;
        d[o] = Math.min(255, Math.round(r));
        d[o + 1] = Math.min(255, Math.round(g));
        d[o + 2] = Math.min(255, Math.round(b));
        d[o + 3] = 255;
        continue;
      }
      if (sumA <= 0) continue;
      const mr = sumR / sumA;
      const mg = sumG / sumA;
      const mb = sumB / sumA;
      if (settings.alpha === 'translucent') {
        const alpha = Math.round((sumA / boxArea) * 255);
        if (alpha === 0) continue;
        d[o] = Math.min(255, Math.round(mr));
        d[o + 1] = Math.min(255, Math.round(mg));
        d[o + 2] = Math.min(255, Math.round(mb));
        d[o + 3] = Math.min(255, alpha);
        continue;
      }
      if (sumA / boxArea < settings.coverage) continue;
      let colour = packRgb(
        Math.min(255, Math.round(mr)),
        Math.min(255, Math.round(mg)),
        Math.min(255, Math.round(mb)),
      );
      if (settings.snap) {
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < row.index.length; j++) {
          for (let i = 0; i < col.index.length; i++) {
            const p = (row.index[j] * sw + col.index[i]) * 4;
            if (src[p + 3] < 128) continue;
            const c = packRgb(src[p], src[p + 1], src[p + 2]);
            const dd = dist2(c, colour);
            if (dd < bestD) {
              bestD = dd;
              best = c;
            }
          }
        }
        if (best >= 0) colour = best;
      }
      d[o] = (colour >> 16) & 255;
      d[o + 1] = (colour >> 8) & 255;
      d[o + 2] = colour & 255;
      d[o + 3] = 255;
    }
  }
  return { image: out, factorX: fx, factorY: fy };
}
