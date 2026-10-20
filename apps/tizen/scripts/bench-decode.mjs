/**
 * The TV render bench's **decode pages** (plan R1-05, subtask B4 — decision W3-6; the page model
 * replaced by plan R3-04.M4a, decisions RR-8 / W5-17): the PNG files its `decode` scenario
 * fetches, decodes and uploads on the TV, so the M7 run records what a real stand-in zone page
 * costs from file to GPU — the figure plan R3-04's zone-load estimate is measured on, not scaled
 * from a synthetic page any more.
 *
 * Three page groups, built at bench-build time into the bench's own output
 * (`dist-bench/assets/atlas/decode-<id>.png`, next to the density atlases of
 * `./bench-atlas.mjs`) — never committed, never added to the game's atlas:
 *
 * - **`standin-zone-a`** (and `standin-zone-a-2` right after it when the group packs onto two
 *   pages) — the stand-in zone A's own page(s): the interim art of `scripts/assets/standin.mjs`
 *   packed through the real pipeline (`standinAtlas(['a'])`), PNG-8 pages of the byte band the v2
 *   zone pages will ship in ({@link DECODE_BYTE_BANDS}). They replace the two synthetic 2048²
 *   pages R1-05 B4 measured before the stand-in art existed.
 * - **`common`** and **`zone-a`** — the shipped atlas's `common` page and zone A's page, exactly
 *   as the asset pipeline builds them (`buildAtlas()`), for reference. They follow what the game
 *   ships: from R2-01's flip they are the interim ×1.5 pages, unlike `./bench-atlas.mjs`'s density
 *   atlases, which keep the v1 art for good — so R0-03 decode rows recorded before and after the
 *   flip are not like for like. The stand-in build's own `common` page is this same page byte for
 *   byte (the stand-in art ships only zone art), so no second copy is built.
 *
 * {@link decodeArtImage} — R1-05 B4's synthetic-page drawer — stays exported for its tests and
 * `test/integration/tv-render-bench.test.ts`'s sha pins, but the bench build ships no page drawn
 * by it. {@link buildDecodeStandin} also returns the manifest of the run's last page load
 * (`standin-zone`, plan R3-04.M4a): the stand-in build pruned to the pages shipped here, so the
 * bench can draw a real frame from what it just decoded.
 *
 * Everything here is deterministic: the pipeline builds are seeded ({@link DECODE_SEED} is the
 * kept drawer's own seed) and that drawer hashes by integer maths only (`Math.imul`, no
 * `Math.random`, no `Math.sin`), so every build writes the same bytes.
 *
 * **Public API.** {@link DECODE_PAGE_SIZE}, {@link DECODE_SEED}, {@link DECODE_PAGE_PREFIX},
 * {@link DECODE_PAGE_IDS}, {@link DECODE_BYTE_BANDS}, {@link decodePageFile},
 * {@link decodeArtImage}, {@link pngColorType}, {@link buildDecodePages},
 * {@link buildDecodeStandin}.
 *
 * @module
 */
import { createImage } from '../../../scripts/assets/image.mjs';
import { MAX_PAGE_SIZE } from '../../../scripts/assets/packer.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { standinAtlas, standinGroupName } from '../../../scripts/assets/standin.mjs';

/** Edge of the synthetic pages: the largest atlas page (2048, the packer's `MAX_PAGE_SIZE`). */
export const DECODE_PAGE_SIZE = MAX_PAGE_SIZE;

/** Seed of the synthetic pages' layout and noise. */
export const DECODE_SEED = 0x5eed2048;

/** File-name prefix of the decode pages (`decode-standin-zone-a.png`, …). */
export const DECODE_PAGE_PREFIX = 'decode-';

/** The stand-in zone the decode pages ship and the last page load draws (a zone letter). */
const STANDIN_ZONE = 'a';

/** The stand-in page ids' fixed part: `standin-zone-a`, `standin-zone-a-2`, … */
const STANDIN_GROUP_BASE = `zone-${STANDIN_ZONE}`;

/** Cache of {@link standinAtlasBuild} — the pipeline is deterministic, the build is wanted twice. */
let standinCache = null;

/**
 * The decode pages in the order the scenario measures them: the stand-in zone A's page group
 * first — `standin-zone-a`, plus `standin-zone-a-2` right after it when the group packs onto two
 * pages — then the shipped `common` and zone A pages. The stand-in group's pages are found by
 * group, not by these ids, so the list is what the `decode` scenario ships at today's stand-in
 * art; a {@link buildDecodePages} result must always hold every id.
 */
export const DECODE_PAGE_IDS = Object.freeze(['standin-zone-a', 'common', 'zone-a']);

/**
 * The byte range the stand-in zone pages must land in **per pixel** (checked by the tests over the
 * group together: Σ bytes / Σ (width × height)) — decision RR-7's 0.3–0.6 MB for a 2048×1024
 * PNG-8 page, what a page of detailed pixel art compresses to, so the decode figure is neither a
 * flat page's nor random noise's. {@link buildDecodeStandin} throws when the packed group misses
 * the band. The shipped pages are measured, never bounded.
 */
export const DECODE_BYTE_BANDS = Object.freeze({
  standin: Object.freeze([300_000 / (2048 * 1024), 600_000 / (2048 * 1024)]),
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
 * @returns {string} e.g. `decode-standin-zone-a.png`.
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
 * @typedef {object} StandinAtlasManifest
 * @property {number} formatVersion Manifest format (2).
 * @property {{ file: string, w: number, h: number, group?: string }[]} pages The stand-in group's
 *   pages, shipped under their {@link decodePageFile} names.
 * @property {Record<string, { x: number, y: number, w: number, h: number, p: number }>} frames
 *   The stand-in sprites' frames, renumbered onto those pages.
 * @property {Record<string, { frames: string[], flash?: string[] }>} sprites Sprite name to spec.
 * @property {Record<string, Record<string, number[]>>} animations Surviving sprites' animations.
 * @property {Record<string, never>} fonts Empty — the load draws no text.
 */

/**
 * @typedef {object} DecodePage
 * @property {string} id - {@link DECODE_PAGE_IDS}.
 * @property {string} file - {@link decodePageFile}.
 * @property {string} what - What it stands for (shown in the bench's tables).
 * @property {number} width - Pixels.
 * @property {number} height - Pixels.
 * @property {Buffer} png - The file's bytes.
 */

/** The id of the `n`-th (0-based) page of a stand-in zone group: `standin-zone-a`, then
 * `standin-zone-a-2`, … */
function standinPageId(n) {
  return n === 0 ? `standin-${STANDIN_GROUP_BASE}` : `standin-${STANDIN_GROUP_BASE}-${n + 1}`;
}

/**
 * The stand-in atlas build of the zone the bench decodes. Cached per process: the pipeline is
 * deterministic, and {@link buildDecodeStandin} and the bench plugin want it more than once.
 *
 * @returns {{ manifest: object, pages: { png: Buffer }[] }} The `standinAtlas(['a'])` result.
 */
function standinAtlasBuild() {
  if (standinCache === null) standinCache = standinAtlas([STANDIN_ZONE]);
  return standinCache;
}

/**
 * The manifest of the run's last page load (`standin-zone`, plan R3-04.M4a): the stand-in build
 * pruned to the group's own pages, shipped under their `decode-<id>.png` names, and to the
 * stand-in sprites on them — frames renumbered onto the kept pages, animations filtered to the
 * surviving sprites, no fonts (the load draws no text). Every sprite it names is on a page the
 * bench decoded for the `decode` scenario one page load before.
 *
 * @param {object} manifest - The stand-in build's manifest.
 * @param {number[]} groupIndices - Its `standin-zone-a` group's page indices, ascending.
 * @returns {object} The pruned manifest, same shape.
 */
function standinAtlasManifest(manifest, groupIndices) {
  /** Old page index → new one. */
  const remap = new Map();
  const pages = [];
  for (let n = 0; n < groupIndices.length; n++) {
    const index = groupIndices[n];
    remap.set(index, pages.length);
    const page = manifest.pages[index];
    pages.push({ ...page, file: decodePageFile(standinPageId(n)) });
  }
  /** Names of the frames that survived, and the sprites that use only those. */
  const frames = {};
  for (const name of Object.keys(manifest.frames)) {
    if (name.indexOf('standin/') !== 0) continue;
    const frame = manifest.frames[name];
    if (!remap.has(frame.p)) continue;
    frames[name] = { ...frame, p: remap.get(frame.p) };
  }
  const sprites = {};
  for (const name of Object.keys(manifest.sprites)) {
    if (name.indexOf('standin/') !== 0) continue;
    const sprite = manifest.sprites[name];
    if (sprite.frames.every((frame) => frame in frames)) sprites[name] = sprite;
  }
  const animations = {};
  for (const name of Object.keys(manifest.animations)) {
    if (name in sprites) animations[name] = manifest.animations[name];
  }
  return { formatVersion: manifest.formatVersion, pages, frames, sprites, animations, fonts: {} };
}

/**
 * Builds the decode pages and the last page load's manifest (see the module docs): the stand-in
 * zone A's own pages from {@link standinAtlas}, then the shipped atlas's `common` and zone A pages
 * (the asset pipeline's grouped build, in memory — it never reads `assets/generated/`).
 *
 * @returns {{ pages: DecodePage[], manifest: StandinAtlasManifest }} The pages in {@link DECODE_PAGE_IDS} order
 *   (with `standin-zone-a-2`, … right after the first when the group packs more pages) and the
 *   manifest of the `standin-zone` load.
 * @throws {Error} When an asset source is invalid, the shipped atlas has no `common` page, the
 *   stand-in build has no zone page, or the stand-in pages miss {@link DECODE_BYTE_BANDS}.
 *
 * @example
 * const { pages } = buildDecodeStandin();
 * pages.map((page) => page.id); // → ['standin-zone-a', 'common', 'zone-a']
 */
export function buildDecodeStandin() {
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

  const standin = standinAtlasBuild();
  const group = standinGroupName(STANDIN_ZONE);
  const groupIndices = [];
  for (let index = 0; index < standin.manifest.pages.length; index++) {
    if (standin.manifest.pages[index].group === group) groupIndices.push(index);
  }
  if (groupIndices.length === 0) {
    throw new Error(`bench-decode: the stand-in atlas has no "${group}" page`);
  }
  // RR-7's band is a property of the packed art: a build that misses it is a build that must not
  // ship (the tests check the same Σ bytes / Σ area figure the throw reads).
  let area = 0;
  let bytes = 0;
  for (const index of groupIndices) {
    const page = standin.manifest.pages[index];
    area += page.w * page.h;
    bytes += standin.pages[index].png.length;
  }
  const perPixel = bytes / area;
  const band = DECODE_BYTE_BANDS.standin;
  if (perPixel < band[0] || perPixel > band[1]) {
    throw new Error(
      `bench-decode: the stand-in pages are ${perPixel} bytes per pixel, outside the band [${band[0]}, ${band[1]}]`,
    );
  }
  const pages = [];
  for (let n = 0; n < groupIndices.length; n++) {
    const index = groupIndices[n];
    const page = standin.manifest.pages[index];
    const id = standinPageId(n);
    pages.push({
      id,
      file: decodePageFile(id),
      what: `stand-in zone A page ${n + 1}/${groupIndices.length} (${page.w}x${page.h} PNG-8 interim art)`,
      width: page.w,
      height: page.h,
      png: standin.pages[index].png,
    });
  }
  pages.push({
    id: 'common',
    file: decodePageFile('common'),
    what: `shipped common page (${common.file})`,
    width: common.w,
    height: common.h,
    png: common.png,
  });
  pages.push({
    id: 'zone-a',
    file: decodePageFile('zone-a'),
    what: `shipped zone-a page (${zone.file})`,
    width: zone.w,
    height: zone.h,
    png: zone.png,
  });
  return { pages, manifest: standinAtlasManifest(standin.manifest, groupIndices) };
}

/**
 * Builds the decode pages ({@link buildDecodeStandin}'s `pages` — the files the `decode` scenario
 * measures, in {@link DECODE_PAGE_IDS} order).
 *
 * @returns {DecodePage[]} The pages.
 * @throws {Error} Whatever {@link buildDecodeStandin} throws.
 *
 * @example
 * buildDecodePages().map((page) => page.file); // → ['decode-standin-zone-a.png', …]
 */
export function buildDecodePages() {
  return buildDecodeStandin().pages;
}
