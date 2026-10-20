/**
 * The last pixel stages (art bible §3.4, §8 steps 10–11): the outline pass, the frame
 * strip and the hand-edit layer merge.
 *
 * - **Outline:** the outermost ring of opaque pixels — an opaque pixel with a transparent
 *   4-neighbour — takes the outline colour. It is inside the frame, so the frame size, the
 *   anchor and the hitbox never move. With `edges: 'closed'` (terrain tiles) the frame's
 *   own edge does not count as open space: only edges facing transparency inside the tile
 *   are outlined.
 * - **Strip:** frames side by side in one row, frame `i` at `x = i · width` — the layout the
 *   Aseprite-format sidecar describes.
 * - **Hand-edit layer** (`<name>.edit.png`, the strip's size): applied last, so re-ingesting
 *   never loses hand work. Transparent edit pixels change nothing; opaque ones paint their
 *   colour; the recipe's erase colour (default `#ff00ff`) makes the pixel transparent.
 *   Half-transparent edit pixels are ignored and counted (a soft brush by mistake).
 * - **Tile collision** (decision W5-11): `clipToMasks` forces a tile strip's alpha to the
 *   tileset's designed column masks, `masksFromArt` counts each column's opaque run from its
 *   anchor edge to derive one — a column that is not one run there cannot be a tileset mask,
 *   and the heightfield places slope and surface tiles by anchor + mask.
 *
 * @module
 */
import { createImage, hexOf, packRgb } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */

/**
 * Outlines one frame in place.
 *
 * @param {Image} frame - The frame (binary alpha).
 * @param {number} colour - Outline `0xRRGGBB`.
 * @param {'open' | 'closed'} edges - Whether the frame's edge counts as transparency.
 * @returns {number} Pixels recoloured.
 */
export function outlineFrame(frame, colour, edges) {
  const { width: w, height: h, data: d } = frame;
  const open = edges === 'open';
  /**
   * Whether the pixel at (x, y) is transparent, by the edge rule.
   *
   * @param {number} x - Column.
   * @param {number} y - Row.
   * @returns {boolean} `true` for open space.
   */
  const clear = (x, y) =>
    x < 0 || y < 0 || x >= w || y >= h ? open : d[(y * w + x) * 4 + 3] === 0;
  /** @type {number[]} */
  const ring = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] === 0) continue;
      if (clear(x - 1, y) || clear(x + 1, y) || clear(x, y - 1) || clear(x, y + 1))
        ring.push(y * w + x);
    }
  }
  for (const i of ring) {
    d[i * 4] = (colour >> 16) & 255;
    d[i * 4 + 1] = (colour >> 8) & 255;
    d[i * 4 + 2] = colour & 255;
  }
  return ring.length;
}

/**
 * Lays frames out side by side in one row.
 *
 * @param {readonly Image[]} frames - Same-size frames (at least one).
 * @returns {Image} The strip.
 */
export function stripOf(frames) {
  const w = frames[0].width;
  const h = frames[0].height;
  const strip = createImage(w * frames.length, h);
  frames.forEach((frame, f) => {
    for (let y = 0; y < h; y++) {
      strip.data.set(
        frame.data.subarray(y * w * 4, (y + 1) * w * 4),
        (y * strip.width + f * w) * 4,
      );
    }
  });
  return strip;
}

/**
 * Applies a hand-edit layer to the strip in place.
 *
 * @param {Image} strip - The ingested strip.
 * @param {Image} edit - The artist's layer, the strip's size.
 * @param {number} erase - The colour that erases (`0xRRGGBB`).
 * @returns {{ painted: number, erased: number, partial: number }} Pixels changed by paint,
 *   pixels erased, and half-transparent edit pixels ignored.
 * @throws {RangeError} When the layer's size differs from the strip's.
 */
export function mergeEdit(strip, edit, erase) {
  if (edit.width !== strip.width || edit.height !== strip.height) {
    throw new RangeError(
      `the edit layer is ${edit.width}×${edit.height}, the ingested strip ${strip.width}×${strip.height} ` +
        `— paint over a copy of the output PNG (erase colour ${hexOf(erase)})`,
    );
  }
  const s = strip.data;
  const e = edit.data;
  let painted = 0;
  let erased = 0;
  let partial = 0;
  for (let p = 0; p < e.length; p += 4) {
    const a = e[p + 3];
    if (a === 0) continue;
    if (a < 255) {
      partial++;
      continue;
    }
    const c = packRgb(e[p], e[p + 1], e[p + 2]);
    if (c === erase) {
      if (s[p + 3] !== 0) erased++;
      s[p] = 0;
      s[p + 1] = 0;
      s[p + 2] = 0;
      s[p + 3] = 0;
      continue;
    }
    if (s[p] !== e[p] || s[p + 1] !== e[p + 1] || s[p + 2] !== e[p + 2] || s[p + 3] !== 255)
      painted++;
    s[p] = e[p];
    s[p + 1] = e[p + 1];
    s[p + 2] = e[p + 2];
    s[p + 3] = 255;
  }
  return { painted, erased, partial };
}

/**
 * The collision mask of one tileset frame, as the pipeline matched it from the tileset.
 *
 * @typedef {object} TileMask
 * @property {number} frame - The strip frame it belongs to.
 * @property {'floor' | 'ceiling'} anchor - The edge the heights grow from.
 * @property {readonly number[]} mask - Column heights, one per frame column (`0 …` frame height).
 */

/**
 * Whether the pixel of a strip column at a given row is opaque.
 *
 * @param {Image} strip - The finished strip.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @returns {boolean} `true` when any alpha is there.
 */
function opaquePixel(strip, x, y) {
  return strip.data[(y * strip.width + x) * 4 + 3] !== 0;
}

/**
 * Clips the finished tile strip to the designed collision masks (decision W5-11, mode
 * `clip-to-mask`): column `c` keeps the `mask[c]` opaque pixels of its run at the anchor edge
 * — the region the tileset treats as solid — and every other pixel becomes transparent. The
 * drawn art therefore never sticks out of the collision the heightfield placed the tile by.
 * It only ever removes pixels; art missing inside the mask stays missing (a tile cannot be
 * given pixels the model never drew — check those with `test/integration/terrain-checks.ts`).
 *
 * @param {Image} strip - The finished strip (frames laid out by {@link stripOf}).
 * @param {number} frameWidth - One frame's width.
 * @param {readonly TileMask[]} clips - One entry per frame to clip.
 * @returns {number} Pixels made transparent.
 */
export function clipToMasks(strip, frameWidth, clips) {
  const h = strip.height;
  let cleared = 0;
  for (const clip of clips) {
    const x0 = clip.frame * frameWidth;
    for (let c = 0; c < frameWidth; c++) {
      const x = x0 + c;
      const kept = Math.min(clip.mask[c] ?? 0, h);
      for (let y = 0; y < h; y++) {
        const solid = clip.anchor === 'floor' ? y >= h - kept : y < kept;
        if (solid) continue;
        const p = (y * strip.width + x) * 4 + 3;
        if (strip.data[p] !== 0) {
          strip.data[p] = 0;
          cleared++;
        }
      }
    }
  }
  return cleared;
}

/**
 * Derives collision masks from the finished tile art (decision W5-11, mode `mask-from-art`):
 * each column's height is the run of opaque pixels counted from its anchor edge. A column
 * whose opaque pixels are not exactly that run — floating art above a gap, for instance —
 * cannot be a tileset mask at all, and is reported so the recipe fails: the heightfield
 * places slope and surface tiles by anchor + mask, and anything it cannot express it will
 * miss.
 *
 * @param {Image} strip - The finished strip (frames laid out by {@link stripOf}).
 * @param {number} frameWidth - One frame's width.
 * @param {readonly { frame: number, anchor: 'floor' | 'ceiling' }[]} frames - Frames to measure.
 * @returns {{
 *   masks: { frame: number, anchor: 'floor' | 'ceiling', mask: number[] }[],
 *   broken: { frame: number, column: number }[]
 * }} The derived masks (in `frames` order) and every column that broke the one-run rule.
 */
export function masksFromArt(strip, frameWidth, frames) {
  const h = strip.height;
  /** @type {{ frame: number, anchor: 'floor' | 'ceiling', mask: number[] }[]} */
  const masks = [];
  /** @type {{ frame: number, column: number }[]} */
  const broken = [];
  for (const spec of frames) {
    const x0 = spec.frame * frameWidth;
    /** @type {number[]} */
    const mask = [];
    for (let c = 0; c < frameWidth; c++) {
      const x = x0 + c;
      let run = 0;
      while (run < h && opaquePixel(strip, x, spec.anchor === 'floor' ? h - 1 - run : run)) run++;
      mask.push(run);
      // Above (floor) or below (ceiling) the run, no pixel may be opaque: that art is not
      // expressible as a column height.
      let floating = false;
      if (spec.anchor === 'floor') {
        for (let y = 0; y < h - run && !floating; y++) floating = opaquePixel(strip, x, y);
      } else {
        for (let y = run; y < h && !floating; y++) floating = opaquePixel(strip, x, y);
      }
      if (floating) broken.push({ frame: spec.frame, column: c });
    }
    masks.push({ frame: spec.frame, anchor: spec.anchor, mask });
  }
  return { masks, broken };
}
