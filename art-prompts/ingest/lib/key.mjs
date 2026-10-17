/**
 * Background removal at source resolution (art bible §8, steps 2–6): the key colour
 * sampled from the region's own border, a flood fill from the border through key pixels,
 * enclosed holes, morphological cleanup, island removal and edge despill — or a black key
 * whose brightness becomes alpha for translucent and additive FX.
 *
 * Everything works on one **region** (a crop box or a sheet cell) and returns a
 * straight-alpha RGBA image of the same size. Binary keys (`green`, `none`, `alpha` with
 * binary art) give alpha 0 or 255; the black key gives alpha = brightness.
 *
 * Connectivity: the flood fill and the hole search are **4-connected**, so a background
 * never leaks through a diagonal step of a 1-px outline; subject islands are
 * **8-connected** (a diagonal touch keeps a part attached).
 *
 * @module
 */
import { createImage, dist2, packRgb } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */

/**
 * Key settings, as {@link import('./recipe.mjs').parseRecipe} normalises them.
 *
 * @typedef {object} KeySettings
 * @property {'green' | 'black' | 'none' | 'alpha'} mode - How the background is found.
 * @property {number | null} color - Explicit key `0xRRGGBB`; `null` = sample the border.
 * @property {number} tolerance - Largest RGB distance from the key a key pixel may have.
 * @property {{ minG: number, minGR: number, minGB: number } | null} test - The absolute
 *   green test (`G ≥ minG`, `G − R ≥ minGR`, `G − B ≥ minGB`) a key pixel must also pass;
 *   `null` = distance only.
 * @property {number} threshold - Black key: brightness below this is fully transparent.
 * @property {{ auto: boolean, minArea: number, seeds: [number, number][] }} holes - Enclosed
 *   background: `auto` keys every enclosed key region of at least `minArea` source px;
 *   `seeds` key the region around each listed point (region coordinates).
 * @property {number} despill - Radius in source px of the edge despill (0 = off).
 * @property {number} open - Radius of the morphological opening of the subject (0 = off).
 * @property {number} minIsland - Subject islands smaller than this many px are removed.
 */

/**
 * What keying one region found.
 *
 * @typedef {object} KeyResult
 * @property {Image} image - Straight-alpha RGBA of the region.
 * @property {number | null} key - The key colour used (`null` for `black` / `none` / `alpha`).
 * @property {number} background - Pixels keyed from the border.
 * @property {number} holes - Pixels keyed as enclosed holes.
 * @property {number} removed - Subject pixels removed by the opening and island cleanup.
 * @property {number} despilled - Pixels whose green cast was clamped.
 * @property {string[]} warnings - Things the recipe author should look at.
 */

/** The absolute green-key test that held on every keyed round-1 winner (bible §8). */
export const DEFAULT_GREEN_TEST = Object.freeze({ minG: 150, minGR: 70, minGB: 120 });

/**
 * Whether an RGB triple passes the absolute green test.
 *
 * @param {number} r - Red.
 * @param {number} g - Green.
 * @param {number} b - Blue.
 * @param {{ minG: number, minGR: number, minGB: number }} test - Thresholds.
 * @returns {boolean} `true` when it looks like key green.
 */
export const passesGreenTest = (r, g, b, test) =>
  g >= test.minG && g - r >= test.minGR && g - b >= test.minGB;

/**
 * Indices of a `w × h` region's border pixels, each once, clockwise from the top-left.
 *
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @returns {number[]} Pixel indices.
 */
export function borderIndices(w, h) {
  /** @type {number[]} */
  const out = [];
  for (let x = 0; x < w; x++) out.push(x);
  for (let y = 1; y < h; y++) out.push(y * w + w - 1);
  if (h > 1) for (let x = w - 2; x >= 0; x--) out.push((h - 1) * w + x);
  if (w > 1) for (let y = h - 2; y >= 1; y--) out.push(y * w);
  return out;
}

/**
 * The lower median of a list of numbers.
 *
 * @param {number[]} values - At least one value.
 * @returns {number} The median.
 */
const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
};

/**
 * Samples the key colour from a region's border: the per-channel median of the border
 * pixels that pass the green test (and are not already transparent).
 *
 * @param {Image} image - The region.
 * @param {{ minG: number, minGR: number, minGB: number } | null} test - Green test; `null`
 *   samples every opaque border pixel.
 * @returns {{ key: number, samples: number, border: number } | null} The key and how many
 *   of the border's pixels voted, or `null` when none passed.
 */
export function sampleBorderKey(image, test) {
  const d = image.data;
  /** @type {number[]} */
  const rs = [];
  /** @type {number[]} */
  const gs = [];
  /** @type {number[]} */
  const bs = [];
  const border = borderIndices(image.width, image.height);
  for (const i of border) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    if (d[i * 4 + 3] < 128) continue;
    if (test !== null && !passesGreenTest(r, g, b, test)) continue;
    rs.push(r);
    gs.push(g);
    bs.push(b);
  }
  if (rs.length === 0) return null;
  return {
    key: packRgb(median(rs), median(gs), median(bs)),
    samples: rs.length,
    border: border.length,
  };
}

/**
 * Flood-fills (4-connected) from the seeds through `passable` pixels into `mark`.
 *
 * @param {Uint8Array} passable - 1 = may be filled.
 * @param {Uint8Array} mark - 1 = already filled; written in place.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {number[]} seeds - Start indices (ignored when not passable or already marked).
 * @returns {number} Pixels newly marked.
 */
export function floodFill(passable, mark, w, h, seeds) {
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  let count = 0;
  for (const s of seeds) {
    if (passable[s] === 1 && mark[s] === 0) {
      mark[s] = 1;
      queue[tail++] = s;
      count++;
    }
  }
  /**
   * Marks and queues one neighbour when it may be filled.
   *
   * @param {number} j - Neighbour index.
   */
  const visit = (j) => {
    if (passable[j] === 1 && mark[j] === 0) {
      mark[j] = 1;
      queue[tail++] = j;
      count++;
    }
  };
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < w * (h - 1)) visit(i + w);
  }
  return count;
}

/**
 * Connected components of the set pixels of a mask, in scan order of their first pixel.
 *
 * @param {Uint8Array} mask - 1 = member.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {boolean} diagonal - 8-connected when `true`, else 4-connected.
 * @returns {number[][]} Each component's pixel indices.
 */
export function components(mask, w, h, diagonal) {
  const seen = new Uint8Array(w * h);
  /** @type {number[][]} */
  const out = [];
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    /** @type {number[]} */
    const members = [start];
    seen[start] = 1;
    for (let k = 0; k < members.length; k++) {
      const i = members[k];
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (!diagonal && dx !== 0 && dy !== 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (mask[n] === 1 && seen[n] === 0) {
            seen[n] = 1;
            members.push(n);
          }
        }
      }
    }
    out.push(members);
  }
  return out;
}

/**
 * Grows a mask by a Chebyshev radius (a `(2r+1)²` square), separably.
 *
 * @param {Uint8Array} mask - 1 = set.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {number} r - Radius (0 = copy).
 * @returns {Uint8Array} The grown mask.
 */
export function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && v === 0; k++)
        v = mask[y * w + k];
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && v === 0; k++)
        v = tmp[k * w + x];
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * Shrinks a mask by a Chebyshev radius; pixels outside the region count as unset.
 *
 * @param {Uint8Array} mask - 1 = set.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {number} r - Radius (0 = copy).
 * @returns {Uint8Array} The shrunk mask.
 */
export function erode(mask, w, h, r) {
  const inverse = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inverse[i] = mask[i] === 1 ? 0 : 1;
  // Outside the region is unset: an erosion also eats r px in from the region's edge.
  const grown = dilate(inverse, w, h, r);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const edge = x < r || y < r || x >= w - r || y >= h - r;
      out[i] = grown[i] === 0 && !edge ? 1 : 0;
    }
  }
  return out;
}

/**
 * Keys one region.
 *
 * @param {Image} region - Source pixels of one frame.
 * @param {KeySettings} key - How to key it.
 * @returns {KeyResult} The keyed region and what was done.
 * @throws {Error} When a green key finds no key colour on the border.
 */
export function keyRegion(region, key) {
  const { width: w, height: h } = region;
  const n = w * h;
  const src = region.data;
  const out = createImage(w, h);
  const d = out.data;
  /** @type {string[]} */
  const warnings = [];
  const result = {
    image: out,
    key: /** @type {number | null} */ (null),
    background: 0,
    holes: 0,
    removed: 0,
    despilled: 0,
    warnings,
  };

  if (key.mode === 'none') {
    for (let i = 0; i < n; i++) {
      d[i * 4] = src[i * 4];
      d[i * 4 + 1] = src[i * 4 + 1];
      d[i * 4 + 2] = src[i * 4 + 2];
      d[i * 4 + 3] = 255;
    }
    return result;
  }

  if (key.mode === 'black') {
    for (let i = 0; i < n; i++) {
      const r = src[i * 4];
      const g = src[i * 4 + 1];
      const b = src[i * 4 + 2];
      const a = Math.max(r, g, b);
      if (a < key.threshold || src[i * 4 + 3] < 128) {
        result.background++;
        continue;
      }
      // The source is light on black, i.e. premultiplied: straight colour = c · 255 / a.
      d[i * 4] = Math.round((r * 255) / a);
      d[i * 4 + 1] = Math.round((g * 255) / a);
      d[i * 4 + 2] = Math.round((b * 255) / a);
      d[i * 4 + 3] = a;
    }
    return result;
  }

  /** 1 = subject. */
  const subject = new Uint8Array(n);
  /** 1 = keyed background (border fill, holes, seeds). */
  const bg = new Uint8Array(n);

  if (key.mode === 'alpha') {
    for (let i = 0; i < n; i++) subject[i] = src[i * 4 + 3] > 0 ? 1 : 0;
  } else {
    let colour = key.color;
    if (colour === null) {
      const sampled = sampleBorderKey(region, key.test);
      if (sampled === null) {
        throw new Error(
          'no key colour on the region border: no border pixel passes the green test ' +
            '(crop closer to the background, set key.color, or relax key.test)',
        );
      }
      colour = sampled.key;
      if (sampled.samples * 2 < sampled.border) {
        warnings.push(
          `only ${sampled.samples} of ${sampled.border} border pixels look like key — ` +
            'the subject may touch the border (crop first, bible §8 step 1)',
        );
      }
    }
    result.key = colour;
    const tol2 = key.tolerance * key.tolerance;
    const passable = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = src[i * 4];
      const g = src[i * 4 + 1];
      const b = src[i * 4 + 2];
      if (src[i * 4 + 3] < 128) passable[i] = 1;
      else if (
        (key.test === null || passesGreenTest(r, g, b, key.test)) &&
        dist2(packRgb(r, g, b), colour) <= tol2
      ) {
        passable[i] = 1;
      }
    }
    result.background = floodFill(passable, bg, w, h, borderIndices(w, h));
    for (const [sx, sy] of key.holes.seeds) {
      const s = sy * w + sx;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
        warnings.push(`hole seed [${sx}, ${sy}] is outside the ${w}×${h} region`);
      } else if (passable[s] !== 1) {
        warnings.push(`hole seed [${sx}, ${sy}] is not a key pixel — nothing keyed there`);
      } else {
        result.holes += floodFill(passable, bg, w, h, [s]);
      }
    }
    if (key.holes.auto) {
      const enclosed = new Uint8Array(n);
      for (let i = 0; i < n; i++) enclosed[i] = passable[i] === 1 && bg[i] === 0 ? 1 : 0;
      for (const part of components(enclosed, w, h, false)) {
        if (part.length < key.holes.minArea) continue;
        for (const i of part) bg[i] = 1;
        result.holes += part.length;
      }
    }
    for (let i = 0; i < n; i++) subject[i] = bg[i] === 1 ? 0 : 1;
  }

  // Cleanup: an opening (erode then dilate, never growing past the original), then islands.
  let cleaned = subject.slice();
  if (key.open > 0) {
    const opened = dilate(erode(subject, w, h, key.open), w, h, key.open);
    cleaned = new Uint8Array(n);
    for (let i = 0; i < n; i++) cleaned[i] = subject[i] === 1 && opened[i] === 1 ? 1 : 0;
  }
  if (key.minIsland > 1) {
    for (const part of components(cleaned, w, h, true)) {
      if (part.length >= key.minIsland) continue;
      for (const i of part) cleaned[i] = 0;
    }
  }
  for (let i = 0; i < n; i++) if (subject[i] === 1 && cleaned[i] === 0) result.removed++;

  // Despill: subject pixels within `despill` px of anything removed lose their green cast.
  let near = null;
  if (key.mode === 'green' && key.despill > 0) {
    const outside = new Uint8Array(n);
    for (let i = 0; i < n; i++) outside[i] = cleaned[i] === 1 ? 0 : 1;
    near = dilate(outside, w, h, key.despill);
  }
  for (let i = 0; i < n; i++) {
    if (cleaned[i] !== 1) continue;
    const r = src[i * 4];
    let g = src[i * 4 + 1];
    const b = src[i * 4 + 2];
    if (near !== null && near[i] === 1) {
      const limit = Math.max(r, b);
      if (g > limit) {
        g = limit;
        result.despilled++;
      }
    }
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = key.mode === 'alpha' ? src[i * 4 + 3] : 255;
  }
  return result;
}
