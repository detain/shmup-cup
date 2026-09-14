/**
 * Deterministic rectangle packer for the texture atlas (MaxRects, best-short-side-fit).
 *
 * Every frame occupies a **cell**: the frame, an `extrude`-pixel border that repeats its
 * edge pixels (so sampling at a sub-pixel offset never picks up a neighbour — matters
 * for tiles and the stretched 1×1 white pixel), plus `padding` transparent pixels to the
 * right and below. Pages are power-of-two sized, at most `maxSize²` (2048² — the TV GPU
 * limit, `shmup_feat.md` §18); the packer picks the smallest page that holds everything
 * and only spills onto further pages when one `maxSize²` page is not enough.
 *
 * Determinism: items are ordered by (longest cell side, area, height, width, name) and
 * every decision uses integer comparisons with a fixed tie-break, so the same input list
 * always yields the same layout, independent of input order.
 *
 * **Public API.** {@link packRects}, {@link MAX_PAGE_SIZE}; typedefs {@link PackItem},
 * {@link PackOptions}, {@link Placement}, {@link PackResult}.
 *
 * @module
 */

/**
 * One rectangle to place.
 *
 * @typedef {object} PackItem
 * @property {string} name - Unique id.
 * @property {number} w - Width in pixels (integer ≥ 1).
 * @property {number} h - Height in pixels (integer ≥ 1).
 */

/**
 * Packing options.
 *
 * @typedef {object} PackOptions
 * @property {number} [maxSize] - Largest page side (power of two; default 2048).
 * @property {number} [minSize] - Smallest page side tried (power of two; default 64).
 * @property {number} [padding] - Transparent pixels between cells (default 1).
 * @property {number} [extrude] - Edge-extrusion border around each frame (default 1).
 */

/**
 * Where one item landed. `x`/`y` are the frame's top-left pixel (inside the extrusion).
 *
 * @typedef {object} Placement
 * @property {string} name - The item's id.
 * @property {number} p - Page index.
 * @property {number} x - Left column of the frame on the page.
 * @property {number} y - Top row of the frame on the page.
 * @property {number} w - Frame width.
 * @property {number} h - Frame height.
 */

/**
 * The packing: page sizes and one placement per item.
 *
 * @typedef {object} PackResult
 * @property {{ w: number, h: number }[]} pages - Page sizes (powers of two ≤ maxSize).
 * @property {Placement[]} placements - One per input item, in input order.
 */

/** Default page-side limit: 2048 (TV GPU texture limit). */
export const MAX_PAGE_SIZE = 2048;

/**
 * An integer rectangle in bin coordinates (top-left `x`/`y`, size `w`×`h`).
 *
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 */

/**
 * A MaxRects bin: places cells into a `width × height` area.
 */
class MaxRectsBin {
  /**
   * Creates an empty bin: one free rectangle covering the whole area.
   *
   * @param {number} width - Bin width.
   * @param {number} height - Bin height.
   */
  constructor(width, height) {
    /** @type {Rect[]} Maximal free rectangles. */
    this.free = [{ x: 0, y: 0, w: width, h: height }];
  }

  /**
   * Places a `w × h` cell with best-short-side-fit.
   *
   * @param {number} w - Cell width.
   * @param {number} h - Cell height.
   * @returns {Rect | null} Where it went, or `null` when it does not fit.
   */
  insert(w, h) {
    let best = -1;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (let i = 0; i < this.free.length; i++) {
      const f = this.free[i];
      if (w > f.w || h > f.h) continue;
      const short = Math.min(f.w - w, f.h - h);
      const long = Math.max(f.w - w, f.h - h);
      const b = this.free[best];
      if (
        short < bestShort ||
        (short === bestShort && long < bestLong) ||
        (short === bestShort && long === bestLong && (f.y < b.y || (f.y === b.y && f.x < b.x)))
      ) {
        best = i;
        bestShort = short;
        bestLong = long;
      }
    }
    if (best < 0) return null;
    const placed = { x: this.free[best].x, y: this.free[best].y, w, h };
    this.split(placed);
    return placed;
  }

  /**
   * Removes a used rectangle from the free list (splitting every free rectangle it
   * overlaps into up to four maximal remainders), then prunes contained rectangles.
   *
   * @remarks
   * Only the new remainders need the containment test: the free list holds no rectangle
   * contained in another before the split, so an untouched rectangle `A` can neither lie
   * inside another untouched one nor inside a remainder `N` (that would put `A` inside
   * the split rectangle `N` came from). Testing just the remainders against the whole
   * list gives exactly the full pairwise prune in O(new × all) instead of O(all²), which
   * kept the atlas build fast as the sprite set grew.
   *
   * @param {Rect} used - The placed cell.
   */
  split(used) {
    /** @type {Rect[]} */
    const next = [];
    /** @type {boolean[]} Whether `next[i]` is a new remainder (not an untouched rectangle). */
    const added = [];
    /**
     * @param {Rect} r - A remainder of a split rectangle.
     */
    const add = (r) => {
      next.push(r);
      added.push(true);
    };
    for (const f of this.free) {
      if (
        used.x >= f.x + f.w ||
        used.x + used.w <= f.x ||
        used.y >= f.y + f.h ||
        used.y + used.h <= f.y
      ) {
        next.push(f);
        added.push(false);
        continue;
      }
      if (used.x > f.x) add({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
      if (used.x + used.w < f.x + f.w) {
        add({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
      }
      if (used.y > f.y) add({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
      if (used.y + used.h < f.y + f.h) {
        add({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
      }
    }
    // Prune rectangles contained in another (keep the first of two equal ones).
    this.free = next.filter((a, i) => {
      if (!added[i]) return true;
      for (let j = 0; j < next.length; j++) {
        if (i === j) continue;
        const b = next[j];
        const contained =
          a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
        if (contained && (a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y || j < i)) {
          return false;
        }
      }
      return true;
    });
  }
}

/**
 * Whether `n` is a power of two ≥ 1.
 *
 * @param {number} n - Candidate.
 * @returns {boolean} `true` for 1, 2, 4, …
 */
const isPowerOfTwo = (n) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;

/**
 * Packs rectangles into as few, as small power-of-two pages as possible.
 *
 * @param {readonly PackItem[]} items - Rectangles with unique names.
 * @param {PackOptions} [options] - Page limits, padding, extrusion.
 * @returns {PackResult} Page sizes and placements (input order).
 * @throws {RangeError} When a name repeats, a size is not a positive integer, an option is
 *   invalid, or an item cannot fit on a `maxSize²` page even alone.
 *
 * @example
 * packRects([{ name: 'a', w: 16, h: 16 }, { name: 'b', w: 8, h: 8 }]);
 * // → { pages: [{ w: 64, h: 64 }], placements: [{ name: 'a', p: 0, x: 1, y: 1, … }, …] }
 */
export function packRects(items, options = {}) {
  const maxSize = options.maxSize ?? MAX_PAGE_SIZE;
  const minSize = Math.min(options.minSize ?? 64, maxSize);
  const padding = options.padding ?? 1;
  const extrude = options.extrude ?? 1;
  if (!isPowerOfTwo(maxSize) || !isPowerOfTwo(minSize)) {
    throw new RangeError('maxSize and minSize must be powers of two');
  }
  if (!Number.isInteger(padding) || padding < 0 || !Number.isInteger(extrude) || extrude < 0) {
    throw new RangeError('padding and extrude must be integers ≥ 0');
  }
  const seen = new Set();
  const cells = items.map((item, index) => {
    if (seen.has(item.name)) throw new RangeError(`duplicate item "${item.name}"`);
    seen.add(item.name);
    if (!Number.isInteger(item.w) || !Number.isInteger(item.h) || item.w < 1 || item.h < 1) {
      throw new RangeError(`item "${item.name}" has an invalid size ${item.w}×${item.h}`);
    }
    const cw = item.w + 2 * extrude + padding;
    const ch = item.h + 2 * extrude + padding;
    if (cw - padding > maxSize || ch - padding > maxSize) {
      throw new RangeError(
        `item "${item.name}" (${item.w}×${item.h} + border) does not fit a ${maxSize}² page`,
      );
    }
    return { index, name: item.name, cw, ch };
  });
  cells.sort(
    (a, b) =>
      Math.max(b.cw, b.ch) - Math.max(a.cw, a.ch) ||
      b.cw * b.ch - a.cw * a.ch ||
      b.ch - a.ch ||
      b.cw - a.cw ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );

  /** @type {{ w: number, h: number }[]} */
  const sizes = [];
  for (let w = minSize; w <= maxSize; w *= 2) {
    for (let h = minSize; h <= maxSize; h *= 2) sizes.push({ w, h });
  }
  // Smallest area first; for equal areas prefer the squarer, then the wider page.
  sizes.sort(
    (a, b) => a.w * a.h - b.w * b.h || Math.abs(a.w - a.h) - Math.abs(b.w - b.h) || b.w - a.w,
  );

  /**
   * Packs cells into one page of the given size (padding may hang off the right and
   * bottom edges — it is transparent space, not part of any frame).
   *
   * @param {typeof cells} list - Cells in packing order.
   * @param {number} w - Page width.
   * @param {number} h - Page height.
   * @param {boolean} [trial] - Stop at the first cell that does not fit: a trial of a
   *   candidate page size only needs to know whether everything fits.
   * @returns {{ placed: Map<number, Rect>, rest: typeof cells }} Placed cells by input
   *   index, and the cells that did not fit (for a failed trial: just the first miss).
   */
  const packPage = (list, w, h, trial = false) => {
    const bin = new MaxRectsBin(w + padding, h + padding);
    /** @type {Map<number, Rect>} */
    const placed = new Map();
    /** @type {typeof cells} */
    const rest = [];
    for (const cell of list) {
      const rect = bin.insert(cell.cw, cell.ch);
      if (rect === null) {
        rest.push(cell);
        if (trial) break;
      } else placed.set(cell.index, rect);
    }
    return { placed, rest };
  };

  /** @type {{ w: number, h: number }[]} */
  const pages = [];
  /** @type {Placement[]} */
  const placements = new Array(items.length);
  let remaining = cells;
  while (remaining.length > 0) {
    let page = null;
    let area = 0;
    let widest = 0;
    let tallest = 0;
    for (const cell of remaining) {
      area += (cell.cw - padding) * (cell.ch - padding);
      widest = Math.max(widest, cell.cw - padding);
      tallest = Math.max(tallest, cell.ch - padding);
    }
    for (const size of sizes) {
      // Cheap rejections before a full packing attempt.
      if (size.w * size.h < area || size.w < widest || size.h < tallest) continue;
      const attempt = packPage(remaining, size.w, size.h, true);
      if (attempt.rest.length === 0) {
        page = { size, ...attempt };
        break;
      }
    }
    if (page === null)
      page = { size: { w: maxSize, h: maxSize }, ...packPage(remaining, maxSize, maxSize) };
    const p = pages.length;
    pages.push({ w: page.size.w, h: page.size.h });
    for (const [index, rect] of page.placed) {
      placements[index] = {
        name: items[index].name,
        p,
        x: rect.x + extrude,
        y: rect.y + extrude,
        w: items[index].w,
        h: items[index].h,
      };
    }
    remaining = page.rest;
  }
  return { pages, placements };
}
