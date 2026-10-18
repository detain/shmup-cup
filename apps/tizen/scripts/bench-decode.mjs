/**
 * The TV render bench's **decode pages** (plan R1-05, subtask B4 — decision W3-6): the PNG files
 * its `decode` scenario fetches, decodes and uploads on the TV, so R0-03's owner session records
 * what a 2048² atlas page costs from file to GPU on the M7 — the figure plan R3-04 estimates its
 * zone-load time from until the game measures it.
 *
 * Four pages, built at bench-build time into the bench's own output
 * (`dist-bench/assets/atlas/decode-<id>.png`, next to the density atlases of
 * `./bench-atlas.mjs`) — never committed, never added to the game's atlas:
 *
 * - **`rgba-2048`** — a 2048×2048 RGBA page ({@link decodeArtImage} in `'rgba'` mode): a packed
 *   page of synthetic "detailed" sprites — shaded blobs with outlines, brick and rock tiles,
 *   translucent glows — in 16 colour ramps of 32 levels plus soft alpha, so it has far more than
 *   256 colours and stays RGBA (colour type 6), like a `common` page of v2 art would.
 * - **`png8-2048`** — the same layout quantised to 64 colours (8 ramps × 8 levels) with 1-bit
 *   alpha, which the repo's encoder writes as lossless **PNG-8** (colour type 3, decision W3-3) —
 *   like a zone page of art quantised to a zone palette (art bible: 48–64 colours).
 * - **`common`** and **`zone-a`** — the shipped atlas's `common` page and zone A's page, exactly
 *   as the asset pipeline builds them (`buildAtlas()`), for reference. They follow what the game
 *   ships: from R2-01's flip they are the interim ×1.5 pages (`common` 1024² instead of 1024×512,
 *   `zone-a` 256² instead of 256×128), unlike `./bench-atlas.mjs`'s density atlases, which keep
 *   the v1 art for good — so R0-03 decode rows recorded before and after the flip are not like
 *   for like.
 *
 * The synthetic pages are **stand-ins with a stated size**, not art: what decides a PNG's decode
 * cost is its pixel count and its compressed bytes, so both pages are full 2048² and their bytes
 * sit in the range detailed pixel art compresses to (about 3–5 bits per pixel for RGBA, 1–2 for
 * PNG-8 — {@link DECODE_BYTE_BANDS}; the analyzer also prints ms per megapixel, so R3-04 can scale
 * the figure to the real pages' sizes). They are deterministic: integer hashing only (`Math.imul`,
 * no `Math.random`, no `Math.sin`), so every build writes the same bytes.
 *
 * **Public API.** {@link DECODE_PAGE_SIZE}, {@link DECODE_SEED}, {@link DECODE_PAGE_PREFIX},
 * {@link DECODE_PAGE_IDS}, {@link DECODE_BYTE_BANDS}, {@link decodePageFile},
 * {@link decodeArtImage}, {@link pngColorType}, {@link buildDecodePages}.
 *
 * @module
 */
import { createImage } from '../../../scripts/assets/image.mjs';
import { MAX_PAGE_SIZE } from '../../../scripts/assets/packer.mjs';
import { encodePng } from '../../../scripts/assets/png.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';

/** Edge of the synthetic pages: the largest atlas page (2048, the packer's `MAX_PAGE_SIZE`). */
export const DECODE_PAGE_SIZE = MAX_PAGE_SIZE;

/** Seed of the synthetic pages' layout and noise. */
export const DECODE_SEED = 0x5eed2048;

/** File-name prefix of the decode pages (`decode-rgba-2048.png`, …). */
export const DECODE_PAGE_PREFIX = 'decode-';

/** The decode pages in the order the scenario measures them. */
export const DECODE_PAGE_IDS = Object.freeze(['rgba-2048', 'png8-2048', 'common', 'zone-a']);

/**
 * The byte range each synthetic page must land in (checked by the tests): about 3–5 bits per pixel
 * for the RGBA page and 1–2 for the PNG-8 page — what detailed pixel art compresses to, so the
 * decode figure is neither a flat page's nor random noise's.
 */
export const DECODE_BYTE_BANDS = Object.freeze({
  'rgba-2048': Object.freeze([1_500_000, 2_800_000]),
  'png8-2048': Object.freeze([400_000, 1_050_000]),
});

/** Ramps of the RGBA page. */
const RGBA_RAMPS = 16;

/** Levels per ramp of the RGBA page. */
const RGBA_LEVELS = 32;

/** Ramps of the PNG-8 page (each RGBA ramp folds onto `ramp % 8`). */
const PNG8_RAMPS = 8;

/** Levels per ramp of the PNG-8 page (`level >> 2`). */
const PNG8_LEVELS = 8;

/**
 * Base colours of the ramps, `0xRRGGBB` (original, chosen for spread): each ramp runs from a dark
 * shade of its colour through the colour to a light tint.
 */
const RAMP_BASES = Object.freeze([
  0x3f7fd0, 0xd0603f, 0x4fae5a, 0xb48a3c, 0x8c52c8, 0x2fa8a0, 0xc84f86, 0x7a8a9c, 0x5c6fe0,
  0xe0a040, 0x6cc070, 0xa05030, 0x48b8d8, 0xd8d060, 0x9068a0, 0x607040,
]);

/** 4×4 ordered-dither thresholds (0–15), for the PNG-8 page's 1-bit alpha. */
const BAYER4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

/**
 * The file name of a decode page.
 *
 * @param {string} id - Page id ({@link DECODE_PAGE_IDS}).
 * @returns {string} e.g. `decode-rgba-2048.png`.
 */
export function decodePageFile(id) {
  return `${DECODE_PAGE_PREFIX}${id}.png`;
}

/**
 * A 32-bit integer hash of three integers (`Math.imul` only — the same on every engine).
 *
 * @param {number} x - First integer.
 * @param {number} y - Second integer.
 * @param {number} seed - Third integer.
 * @returns {number} An unsigned 32-bit value.
 */
function hash3(x, y, seed) {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Smooth value noise in 0–255: bilinear interpolation of hashed lattice values every `cell` pixels
 * (integer arithmetic only).
 *
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @param {number} cell - Lattice spacing in pixels.
 * @param {number} seed - Seed.
 * @returns {number} 0–255.
 */
function valueNoise(x, y, cell, seed) {
  const ix = Math.floor(x / cell);
  const iy = Math.floor(y / cell);
  const fx = x - ix * cell;
  const fy = y - iy * cell;
  const a = hash3(ix, iy, seed) & 255;
  const b = hash3(ix + 1, iy, seed) & 255;
  const c = hash3(ix, iy + 1, seed) & 255;
  const d = hash3(ix + 1, iy + 1, seed) & 255;
  const top = a * (cell - fx) + b * fx;
  const bottom = c * (cell - fx) + d * fx;
  return Math.floor((top * (cell - fy) + bottom * fy) / (cell * cell));
}

/**
 * Pixel grain: −1 or +1 level on about one pixel in eight, else 0 — the hand-placed noise of shaded
 * pixel art, without turning the page into random noise.
 *
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @param {number} seed - Seed.
 * @returns {number} −1, 0 or 1.
 */
function grainOf(x, y, seed) {
  const h = hash3(x, y, seed) & 15;
  return h === 0 ? -1 : h === 1 ? 1 : 0;
}

/**
 * A small sequential generator for the layout (xorshift32 on an integer state).
 *
 * @param {number} seed - Seed (non-zero).
 * @returns {(n: number) => number} Draws an integer in `[0, n)`.
 */
function layoutRandom(seed) {
  let state = seed >>> 0 || 1;
  return (n) => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state % n;
  };
}

/**
 * One RGBA ramp entry: the ramp's base colour darkened (lower levels) or tinted (upper levels).
 *
 * @param {number} ramp - Ramp index.
 * @param {number} level - Level, 0 (darkest) … `levels − 1` (lightest).
 * @param {number} levels - Levels in the ramp.
 * @returns {[number, number, number]} R, G, B.
 */
function rampColor(ramp, level, levels) {
  const base = RAMP_BASES[ramp % RAMP_BASES.length];
  const channels = [(base >> 16) & 255, (base >> 8) & 255, base & 255];
  const mid = (levels - 1) >> 1;
  return /** @type {[number, number, number]} */ (
    channels.map((value) => {
      if (level <= mid) {
        // From 18 % of the colour up to the colour.
        const dark = Math.floor((value * 18) / 100);
        return dark + Math.floor(((value - dark) * level) / mid);
      }
      // From the colour up to a light tint (82 % of the way to white).
      const light = value + Math.floor(((255 - value) * 82) / 100);
      return value + Math.floor(((light - value) * (level - mid)) / (levels - 1 - mid));
    })
  );
}

/**
 * The synthetic page's pixel classes before colour: per pixel a ramp, a level 0–31 and an alpha.
 *
 * @param {number} size - Edge in pixels.
 * @param {number} seed - Seed.
 * @returns {{ ramp: Uint8Array, level: Uint8Array, alpha: Uint8Array }} Per-pixel planes (alpha 0 =
 *   empty).
 */
function paintLayout(size, seed) {
  const n = size * size;
  const ramp = new Uint8Array(n);
  const level = new Uint8Array(n);
  const alpha = new Uint8Array(n);
  const random = layoutRandom(seed);
  const heights = [24, 32, 48, 64, 96, 128];
  const gap = 2;
  let y = 0;
  let sprite = 0;
  while (y < size) {
    const rowH = Math.min(heights[random(heights.length)], size - y);
    let x = 0;
    while (x < size) {
      const w = Math.min(16 + random(rowH * 2), size - x);
      const kind = random(20);
      const h = rowH - random(Math.max(1, rowH >> 2));
      const r = random(RGBA_RAMPS);
      const s = (seed + Math.imul(++sprite, 0x9e3779b1)) | 0;
      if (kind < 11) paintBlob(ramp, level, alpha, size, x, y, w, h, r, s);
      else if (kind < 17) paintTile(ramp, level, alpha, size, x, y, w, h, r, s);
      else paintGlow(ramp, level, alpha, size, x, y, w, h, r);
      x += w + gap;
    }
    y += rowH + gap;
  }
  return { ramp, level, alpha };
}

/**
 * A shaded blob: a noisy ellipse lit from the top left, a dark 1-px outline, pixel noise inside.
 *
 * @param {Uint8Array} ramp - Ramp plane.
 * @param {Uint8Array} level - Level plane.
 * @param {Uint8Array} alpha - Alpha plane.
 * @param {number} size - Page edge.
 * @param {number} x0 - Cell left.
 * @param {number} y0 - Cell top.
 * @param {number} w - Cell width.
 * @param {number} h - Cell height.
 * @param {number} r - Ramp.
 * @param {number} seed - Seed.
 */
function paintBlob(ramp, level, alpha, size, x0, y0, w, h, r, seed) {
  const rx = Math.max(2, w >> 1);
  const ry = Math.max(2, h >> 1);
  const cx = x0 + rx;
  const cy = y0 + ry;
  /**
   * Whether a cell pixel is inside the blob (the ellipse, its edge pushed in and out by noise).
   *
   * @param {number} px - Column.
   * @param {number} py - Row.
   * @returns {boolean} Inside.
   */
  const inside = (px, py) => {
    if (px < x0 || py < y0 || px >= x0 + w || py >= y0 + h) return false;
    const dx = px - cx;
    const dy = py - cy;
    const edge = 1024 - (valueNoise(px, py, 8, seed) >> 1);
    return Math.floor((dx * dx * 1024) / (rx * rx) + (dy * dy * 1024) / (ry * ry)) <= edge;
  };
  for (let py = y0; py < y0 + h; py++) {
    for (let px = x0; px < x0 + w; px++) {
      if (!inside(px, py)) continue;
      const i = py * size + px;
      ramp[i] = r;
      alpha[i] = 255;
      if (
        !inside(px - 1, py) ||
        !inside(px + 1, py) ||
        !inside(px, py - 1) ||
        !inside(px, py + 1)
      ) {
        level[i] = 1;
        continue;
      }
      const light = 18 - Math.floor(((px - cx) * 6) / rx) - Math.floor(((py - cy) * 6) / ry);
      const shade = (valueNoise(px, py, 12, seed + 1) - 128) >> 4;
      const grain = grainOf(px, py, seed + 2);
      level[i] = Math.max(2, Math.min(RGBA_LEVELS - 1, light + shade + grain));
    }
  }
}

/**
 * An opaque tile: rows of bricks (offset every other row) with dark mortar and textured faces.
 *
 * @param {Uint8Array} ramp - Ramp plane.
 * @param {Uint8Array} level - Level plane.
 * @param {Uint8Array} alpha - Alpha plane.
 * @param {number} size - Page edge.
 * @param {number} x0 - Cell left.
 * @param {number} y0 - Cell top.
 * @param {number} w - Cell width.
 * @param {number} h - Cell height.
 * @param {number} r - Ramp.
 * @param {number} seed - Seed.
 */
function paintTile(ramp, level, alpha, size, x0, y0, w, h, r, seed) {
  const brickH = 6 + (seed & 7);
  const brickW = brickH * 2 + ((seed >>> 3) & 7);
  for (let py = y0; py < y0 + h; py++) {
    const row = Math.floor((py - y0) / brickH);
    const offset = row & 1 ? brickW >> 1 : 0;
    for (let px = x0; px < x0 + w; px++) {
      const i = py * size + px;
      ramp[i] = r;
      alpha[i] = 255;
      const bx = (px - x0 + offset) % brickW;
      const by = (py - y0) % brickH;
      if (bx === 0 || by === 0) {
        level[i] = 3 + (hash3(px, py, seed) & 1);
        continue;
      }
      const face = 12 + (hash3(Math.floor((px - x0 + offset) / brickW), row, seed) & 7);
      const rough = (valueNoise(px, py, 8, seed + 3) - 128) >> 5;
      const edge = by === 1 ? 4 : by === brickH - 1 ? -3 : 0;
      const grain = grainOf(px, py, seed + 4);
      level[i] = Math.max(2, Math.min(RGBA_LEVELS - 1, face + rough + edge + grain));
    }
  }
}

/**
 * A soft glow: a radial alpha falloff in one ramp's light end (many alpha values — RGBA only; the
 * PNG-8 page dithers it to 1-bit alpha).
 *
 * @param {Uint8Array} ramp - Ramp plane.
 * @param {Uint8Array} level - Level plane.
 * @param {Uint8Array} alpha - Alpha plane.
 * @param {number} size - Page edge.
 * @param {number} x0 - Cell left.
 * @param {number} y0 - Cell top.
 * @param {number} w - Cell width.
 * @param {number} h - Cell height.
 * @param {number} r - Ramp.
 */
function paintGlow(ramp, level, alpha, size, x0, y0, w, h, r) {
  const rx = Math.max(2, w >> 1);
  const ry = Math.max(2, h >> 1);
  const cx = x0 + rx;
  const cy = y0 + ry;
  for (let py = y0; py < y0 + h; py++) {
    for (let px = x0; px < x0 + w; px++) {
      const dx = px - cx;
      const dy = py - cy;
      // 0 at the centre, 1024 on the ellipse.
      const d = Math.floor((dx * dx * 1024) / (rx * rx) + (dy * dy * 1024) / (ry * ry));
      if (d >= 1024) continue;
      const i = py * size + px;
      const falloff = 1024 - d;
      ramp[i] = r;
      alpha[i] = Math.max(1, Math.floor((falloff * falloff * 255) / (1024 * 1024)));
      level[i] = RGBA_LEVELS - 1 - Math.floor(d / 128);
    }
  }
}

/**
 * The synthetic decode page (see the module docs): a packed page of shaded sprites, tiles and
 * glows, in full colour (`'rgba'`: 16 ramps × 32 levels, soft alpha) or quantised (`'png8'`:
 * 8 ramps × 8 levels, 1-bit dithered alpha — at most 65 distinct RGBA values, so `encodePng(…,
 * { indexed: 'auto' })` writes it as PNG-8).
 *
 * @param {'rgba' | 'png8'} mode - Colour mode.
 * @param {number} [size] - Edge in pixels (default {@link DECODE_PAGE_SIZE}).
 * @param {number} [seed] - Seed (default {@link DECODE_SEED}).
 * @returns {import('../../../scripts/assets/image.mjs').Image} The page.
 * @throws {RangeError} When the mode is unknown.
 *
 * @example
 * const page = decodeArtImage('png8', 256); // a small one for a test
 */
export function decodeArtImage(mode, size = DECODE_PAGE_SIZE, seed = DECODE_SEED) {
  if (mode !== 'rgba' && mode !== 'png8') {
    throw new RangeError(`decode page mode must be 'rgba' or 'png8', not ${String(mode)}`);
  }
  const planes = paintLayout(size, seed);
  const image = createImage(size, size);
  const { data } = image;
  /** @type {Map<number, [number, number, number]>} */
  const colors = new Map();
  for (let i = 0; i < size * size; i++) {
    const a = planes.alpha[i];
    if (a === 0) continue;
    let r = planes.ramp[i];
    let l = planes.level[i];
    let out = a;
    let levels = RGBA_LEVELS;
    if (mode === 'png8') {
      r %= PNG8_RAMPS;
      l >>= 2;
      levels = PNG8_LEVELS;
      const x = i % size;
      const y = (i - x) / size;
      if (a < 255 && a >> 4 <= BAYER4[(y & 3) * 4 + (x & 3)]) continue;
      out = 255;
    }
    const key = r * 64 + l;
    let rgb = colors.get(key);
    if (rgb === undefined) {
      rgb = rampColor(r, l, levels);
      colors.set(key, rgb);
    }
    const o = i * 4;
    data[o] = rgb[0];
    data[o + 1] = rgb[1];
    data[o + 2] = rgb[2];
    data[o + 3] = out;
  }
  return image;
}

/**
 * A PNG file's colour type, read from its `IHDR` (6 = RGBA, 3 = indexed).
 *
 * @param {Uint8Array} bytes - The file.
 * @returns {number} The colour type, or -1 when the bytes are not a PNG with an `IHDR` first.
 */
export function pngColorType(bytes) {
  if (bytes.length < 26) return -1;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) if (bytes[i] !== signature[i]) return -1;
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return -1;
  return bytes[25];
}

/**
 * One decode page as the bench build ships it.
 *
 * @typedef {object} DecodePage
 * @property {string} id - {@link DECODE_PAGE_IDS}.
 * @property {string} file - {@link decodePageFile}.
 * @property {string} what - What it stands for (shown in the bench's tables).
 * @property {number} width - Pixels.
 * @property {number} height - Pixels.
 * @property {Buffer} png - The file's bytes.
 */

/**
 * Builds the decode pages (see the module docs): the two synthetic 2048² pages and the shipped
 * atlas's `common` and zone A pages (the asset pipeline's grouped build, in memory — it never reads
 * `assets/generated/`).
 *
 * @param {{ size?: number }} [options] - `size`: edge of the synthetic pages (default
 *   {@link DECODE_PAGE_SIZE}; the tests use a smaller one).
 * @returns {DecodePage[]} The pages in {@link DECODE_PAGE_IDS} order.
 * @throws {Error} When an asset source is invalid, or the shipped atlas has no `common` page.
 *
 * @example
 * buildDecodePages().map((page) => page.file); // → ['decode-rgba-2048.png', …]
 */
export function buildDecodePages(options = {}) {
  const size = options.size ?? DECODE_PAGE_SIZE;
  const atlas = buildAtlas();
  /**
   * The shipped page of a group.
   *
   * @param {string} group - Atlas group.
   * @returns {{ file: string, w: number, h: number, png: Buffer } | null} The page, or `null`.
   */
  const shipped = (group) => {
    // Manifest format 2: every page names its group, page 0 is `common` (R1-05).
    const index = atlas.manifest.pages.findIndex((page) => page.group === group);
    if (index < 0) return null;
    const page = atlas.manifest.pages[index];
    return { file: page.file, w: page.w, h: page.h, png: atlas.pages[index].png };
  };
  const common = shipped('common');
  if (common === null) throw new Error('bench-decode: the shipped atlas has no common page');
  // Zone A's page; an atlas without zone groups falls back to its common page.
  const zone = shipped('zone-a') ?? common;
  /**
   * A synthetic page.
   *
   * @param {'rgba' | 'png8'} mode - Colour mode.
   * @returns {Buffer} Its PNG bytes.
   */
  const synthetic = (mode) => encodePng(decodeArtImage(mode, size), { indexed: 'auto' });
  return [
    {
      id: 'rgba-2048',
      file: decodePageFile('rgba-2048'),
      what: `synthetic ${size}x${size} RGBA page (detailed art stand-in)`,
      width: size,
      height: size,
      png: synthetic('rgba'),
    },
    {
      id: 'png8-2048',
      file: decodePageFile('png8-2048'),
      what: `synthetic ${size}x${size} PNG-8 page (64-colour stand-in)`,
      width: size,
      height: size,
      png: synthetic('png8'),
    },
    {
      id: 'common',
      file: decodePageFile('common'),
      what: `shipped common page (${common.file})`,
      width: common.w,
      height: common.h,
      png: common.png,
    },
    {
      id: 'zone-a',
      file: decodePageFile('zone-a'),
      what: `shipped zone-a page (${zone.file})`,
      width: zone.w,
      height: zone.h,
      png: zone.png,
    },
  ];
}
