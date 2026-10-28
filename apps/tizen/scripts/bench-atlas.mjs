/**
 * The TV render bench's **density atlases** and the Vite plugin that ships them (plan R0-02).
 *
 * The bench (`apps/tizen/src/bench`) draws a synthetic scene at 384×216, 640×360 and 960×540 with
 * a density factor `s` = 1, 1.5 and 2.25 — sprites, tiles and font ×s — so the larger frames cost
 * what a denser scene would, not just a bigger empty target. Its art is **the real atlas's v1
 * art**, packed **without groups** ({@link benchSourceAtlas}:
 * `buildAtlas({ ungrouped: true, artScale: 1 })` of the asset pipeline — every sprite on one
 * page), upscaled ×s with nearest-neighbour **at bench-build time, into the bench's own output**
 * (`dist-bench/assets/atlas/bench-x<s>-<page>.png`). Nothing is ever added to the game's atlas: a
 * new sprite there would shift every sprite id, and with them every golden replay.
 *
 * - **Why the v1 art, for good (R2-01, decision W4-6).** From R2-01 the game's atlas is the
 *   interim ×1.5 upscale of the v1 sources (later the art bible's v2 art); the bench's densities
 *   are relative to the v1 art (s = 1.5 *is* the ×1.5 art), so it keeps building from the v1
 *   sources at scale 1 — the 1 / 1 / 2 page model and R0-02 / R0-03's runs stay comparable.
 *   That holds while no real-art PNG override, `native` source or v2 font ships: those enter the
 *   scale-1 build at their v2 size, so R3 must decide whether `artScale: 1` builds skip overrides
 *   and native sources (and R4-03 how the v2 font opts out of the art scale).
 *
 * - **Why ungrouped (R1-05).** The game's atlas is split into a `common` page and one small page
 *   per zone since R1-05, so the zone residency can unload other zones' art. The bench keeps
 *   modelling the art as one atlas: its scene draws every kind of sprite at once, its page model
 *   below reads the pages' area, and R0-02's runs and R0-03's must stay comparable. The ungrouped
 *   build is the game's one-page atlas of before R1-05, byte for byte.
 * - **s = 1** is that one-page atlas, page and manifest byte for byte (only the page file is
 *   renamed).
 * - **s > 1**: every frame is scaled to `round(w·s) × round(h·s)` (at least 1 px; anchors and the
 *   bitmap font's metrics scaled the same way), then re-packed with the pipeline's own packer
 *   (`scripts/assets/packer.mjs` — power-of-two pages ≤ 2048², the same 1-px extrusion and padding)
 *   so texture bytes and binds are those a real ×s atlas would have.
 * - **Page count.** The plan models a ×s atlas as *the real page* scaled ×s: today's 1024² page at
 *   ×2.25 is 2304², which does not fit one 2048² page — so {@link benchPageCount} is
 *   `ceil(s² · Σ page area / 2048²)`: 1, 1 and **2**. Today's frames alone would still fit one page
 *   at ×2.25 (they fill under half of their 1024² page), but v2's denser art will not (plan
 *   §2.4), and the second page is what makes the bench measure two-texture batches. The frames are
 *   split between the pages in their order on the source page (by page, row, column), into groups
 *   of equal scaled area, and each group is packed on its own.
 *
 * The plugin, {@link shmupRenderBench}, also inlines the shipped particle presets
 * (`content/fx/*.fx.json`, examples excluded) so the bench needs no game content at all, and emits
 * the `decode` scenario's pages (`./bench-decode.mjs` — plan R1-05 B4, the page model replaced by
 * plan R3-04.M4a: the stand-in zone A's own page(s) and the shipped `common` and zone A pages, as
 * `decode-<id>.png` next to the density pages) with the manifest of the run's last page load, the
 * `standin-zone` one, which draws a v2 frame from those stand-in pages; it exposes all four through
 * the virtual module {@link BENCH_MODULE_ID}. The **SVG arm** (`{ svgEnc: 'e3' }`) ships the density
 * pages as E3 instead of PNG and *besides* them the same stand-in pages as E3, the `decode`
 * scenario's five E3 rows and the manifest of the run's last load drawn from E3
 * (`standin-zone-svg`) — a PNG build ships none of it, so its module text, its rows and its ledger
 * are exactly what they were before the arm ({@link benchSvgDecodeRows}, {@link benchSvgProbeRows}).
 *
 * The pages are encoded like the game's atlas pages: lossless PNG-8 where a page has at most 256
 * colours, else RGBA (`encodePng(…, { indexed: 'auto' })`, decision W3-3 — today's art has more,
 * so every bench page is RGBA).
 *
 * **Public API.** {@link BENCH_DENSITIES}, {@link BENCH_MODULE_ID}, {@link BENCH_ATLAS_DIR},
 * {@link densityLabel}, {@link benchPageFile}, {@link scaledSize}, {@link benchPageCount},
 * {@link benchSourceAtlas}, {@link scaleAtlas}, {@link buildBenchAtlases}, {@link readFxFiles},
 * {@link BENCH_SVG_DECODE_ROWS}, {@link BENCH_SVG_STANDIN_ROW}, {@link BENCH_SVG_PROBE_ROWS},
 * {@link benchSvgDecodeRows}, {@link benchSvgProbeRows}, {@link shmupRenderBench}.
 *
 * @module
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage } from '../../../scripts/assets/image.mjs';
import { MAX_PAGE_SIZE, packRects } from '../../../scripts/assets/packer.mjs';
import { decodePng, encodePng } from '../../../scripts/assets/png.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { buildDecodeStandin } from './bench-decode.mjs';
import {
  BENCH_SVG_ENCODING,
  SVG_MIME_TYPE,
  buildBenchSvgPages,
  emitSvgPages,
  parseBenchSvgEncoding,
} from './bench-svg.mjs';
import { FRAME_H, FRAME_W } from '../../../scripts/frame.mjs';

/**
 * The density factors the bench's frame sizes use, ascending: 1 (the 384×216 baseline and every
 * `native` row), then the `scaled` rows' `height / 240` — 1.33 (480×320), 1.5 (640×360), 2
 * (the 480-row frames), 2.25 (960×540), 2.4 (1024×576), 2.5 (the 600-row frames) and 2.67
 * (960×640). Must equal `src/bench/matrix.ts` `BENCH_DENSITIES` (pinned by
 * `test/bench/bench.test.ts`); the resolutions past 2.67 have no scaled row, since their modelled
 * atlas would need more than two 2048² pages (see the matrix's module docs).
 */
export const BENCH_DENSITIES = Object.freeze([1, 1.33, 1.5, 2, 2.25, 2.4, 2.5, 2.67]);

/** The virtual module the bench imports its atlases and particle presets from. */
export const BENCH_MODULE_ID = 'virtual:shmup-render-bench';

/** Rollup's convention for a virtual module's resolved id. */
const RESOLVED_BENCH_MODULE_ID = '\0' + BENCH_MODULE_ID;

/** Where the bench's atlas pages are emitted (the Tizen bundle check looks for pages there). */
export const BENCH_ATLAS_DIR = 'assets/atlas';

/**
 * Where the built bench serves the clips (the shell's `VIDEO_URL_DIR`, mirrored for a Node
 * script).
 */
export const BENCH_VIDEO_DIR = 'assets/video';

/**
 * The clips the bench build ships for the decode scenario's video rows (plan v20x HARBENCH S8):
 * each `id` is the encode kit's file name (`assets/video/<id>.mp4`), every clip encoded at the
 * codec frame ({@link FRAME_W}×{@link FRAME_H}). `vite.bench.config.ts` extends its `shmupVideos`
 * only-list from this table, so the virtual module and the shipped files cannot drift apart.
 */
export const BENCH_VIDEO_CLIPS = Object.freeze([
  Object.freeze({ id: 'attract-ambient', what: 'Attract loop ambient clip' }),
  Object.freeze({ id: 'warn-zone-a', what: 'Zone A warning clip' }),
  Object.freeze({ id: 'title-sting', what: 'Title sting clip' }),
  Object.freeze({ id: 'ark-sailing', what: 'Zone I ark sailing clip' }),
]);

/**
 * The density pages the **SVG arm** measures in the `decode` scenario beside the PNG ones (plan
 * R-SVG WO-2, the §C.5 sizing of `r-svg-inv-report.md`): the E3 of that density page, fetched,
 * decoded and uploaded exactly like a PNG decode page (the `avc1` video rows' mechanism — own id,
 * own encoding tag, the frozen page columns). Absent from a PNG build, whose dist holds no SVG to
 * measure. `page` counts down to the density's last page when it packs fewer than it names.
 */
export const BENCH_SVG_DECODE_ROWS = Object.freeze([
  Object.freeze({
    id: 'svg-x1-e3',
    density: 1,
    page: 0,
    what: 'E3 of the x1 density page (most colours, partial alpha — the arm is parse-bound here)',
  }),
  Object.freeze({
    id: 'svg-x2.67-e3',
    density: 2.67,
    page: 1,
    what: 'E3 of the x2.67 density page (most pixels, fewest colours — the case E3 wins on the wire)',
  }),
]);

/**
 * The stand-in page the SVG arm emits as E3 beside its PNG, measured as the decode row of the same
 * id: PNG-8 interim art, the largest element count in the build — E3 at its worst (its cost is the
 * point of the row, not an accident to hide).
 */
export const BENCH_SVG_STANDIN_ROW = Object.freeze({
  id: 'svg-standin-e3',
  what: 'E3 of the stand-in zone A page (PNG-8 interim art, largest element count — worst case)',
});

/**
 * The SVG arm's probe rows: the two measurements the four decode stages cannot express, because
 * each is about a consumption route an SVG page has or has not got. `probe` picks the route in
 * `src/bench/decode.ts` `measureSvgDecode`; both reference the ×1 density page's E3 file.
 */
export const BENCH_SVG_PROBE_ROWS = Object.freeze([
  Object.freeze({
    id: 'svg-bitmap-reject',
    probe: 'bitmap-reject',
    what: 'createImageBitmap of the x1 E3 page — the expected rejection, no SVG bitmapping on the TV engine',
  }),
  Object.freeze({
    id: 'svg-teximage-from-img',
    probe: 'url-upload',
    what: 'the x1 E3 page decoded from its URL (the atlas loader route, no fetched bytes) then uploaded',
  }),
]);

/** Edge-extrusion border around each frame (the pipeline's `ATLAS_EXTRUDE`). */
const EXTRUDE = 1;

/** Transparent pixels between cells (the pipeline's `ATLAS_PADDING`). */
const PADDING = 1;

/** The repo's `content/fx/` directory. */
const FX_DIR = fileURLToPath(new URL('../../../content/fx/', import.meta.url));

/**
 * @typedef {import('../../../scripts/assets/image.mjs').Image} Image
 */

/**
 * The atlas manifest (`scripts/assets/manifest.mjs`).
 *
 * @typedef {object} BenchManifest
 * @property {number} formatVersion - Format version.
 * @property {{ file: string, w: number, h: number, group?: string }[]} pages - Pages.
 * @property {Record<string, BenchFrame>} frames - Frames by name.
 * @property {Record<string, unknown>} sprites - Sprites by name (unchanged by scaling).
 * @property {Record<string, unknown>} animations - Animations (unchanged).
 * @property {Record<string, BenchFont>} fonts - Bitmap fonts.
 */

/**
 * Where one frame sits in an atlas.
 *
 * @typedef {{ p: number, x: number, y: number, w: number, h: number, ax: number, ay: number }}
 *   BenchFrame
 */

/**
 * A bitmap font's metrics and glyphs.
 *
 * @typedef {object} BenchFont
 * @property {string} sprite - The glyph sprite.
 * @property {number} lineHeight - Line spacing.
 * @property {number} cellWidth - Glyph cell width.
 * @property {number} cellHeight - Glyph cell height.
 * @property {Record<string, { frame: string, advance: number }>} glyphs - Glyphs by code point.
 */

/**
 * One density's atlas, as the virtual module carries it.
 *
 * @typedef {object} BenchAtlas
 * @property {number} density - The factor `s`.
 * @property {string} label - {@link densityLabel}.
 * @property {BenchManifest} manifest - The scaled manifest (page files renamed).
 * @property {string[]} pageUrls - Page URLs relative to the page (`assets/atlas/…`).
 * @property {Buffer[]} png - The page files.
 */

/**
 * A density's short label.
 *
 * @param {number} density - The factor.
 * @returns {string} `x1`, `x1.5`, `x2.25`.
 */
export function densityLabel(density) {
  return `x${density}`;
}

/**
 * The file name of one of a density's pages.
 *
 * @param {number} density - The factor.
 * @param {number} index - Page index.
 * @returns {string} e.g. `bench-x2.25-1.png`.
 */
export function benchPageFile(density, index) {
  return `bench-${densityLabel(density)}-${index}.png`;
}

/**
 * A length scaled by a density, rounded to whole pixels.
 *
 * @param {number} px - The length at density 1.
 * @param {number} density - The factor.
 * @returns {number} `max(1, round(px · density))`.
 */
export function scaledSize(px, density) {
  return Math.max(1, Math.round(px * density));
}

/**
 * The atlas the bench scales: the v1 art packed without groups — every sprite on one page, the
 * game's atlas of before R1-05 byte for byte (see the module docs), at art scale 1 whatever the
 * game's frame (R2-01, W4-6: the bench's densities are relative to the v1 art). Built in memory by
 * the asset pipeline (`buildAtlas({ ungrouped: true, artScale: 1 })`, ~0.6 s), so it never reads
 * `assets/generated/` (git-ignored; CI's test job never runs `pnpm assets`).
 *
 * @returns {{ manifest: BenchManifest, pngs: Buffer[] }} The manifest and every page's PNG bytes,
 *   in page order.
 * @throws {Error} When an asset source is invalid (the pipeline's `AssetSourceError`).
 *
 * @example
 * const { manifest, pngs } = benchSourceAtlas(); // manifest.pages → [{ file: 'main.png', … }]
 */
export function benchSourceAtlas() {
  const { manifest, pages } = buildAtlas({ ungrouped: true, artScale: 1 });
  return {
    manifest: /** @type {BenchManifest} */ (/** @type {unknown} */ (manifest)),
    pngs: pages.map((page) => page.png),
  };
}

/**
 * How many pages a density's atlas gets: the real pages' area ×s² over one `maxSize²` page,
 * rounded up (see the module docs).
 *
 * @param {BenchManifest} manifest - The bench's source manifest ({@link benchSourceAtlas}).
 * @param {number} density - The factor.
 * @param {number} [maxSize] - Largest page edge (default 2048).
 * @returns {number} At least 1.
 *
 * @example
 * benchPageCount(manifest, 2.25); // → 2 for today's one 1024² page
 */
export function benchPageCount(manifest, density, maxSize = MAX_PAGE_SIZE) {
  let area = 0;
  for (const page of manifest.pages) area += page.w * page.h;
  return Math.max(1, Math.ceil((area * density * density) / (maxSize * maxSize) - 1e-9));
}

/**
 * Copies a frame of a source page onto a target page, scaled nearest-neighbour to `w × h`, with its
 * edge pixels repeated into the extrusion border.
 *
 * @param {Image} target - The target page.
 * @param {Image} source - The source page.
 * @param {{ x: number, y: number, w: number, h: number }} frame - The frame on the source page.
 * @param {number} x - Left column of the scaled frame on the target page.
 * @param {number} y - Top row of the scaled frame on the target page.
 * @param {number} w - Scaled width.
 * @param {number} h - Scaled height.
 * @param {number} extrude - Border width.
 */
function placeScaled(target, source, frame, x, y, w, h, extrude) {
  const src = source.data;
  const dst = target.data;
  for (let dy = -extrude; dy < h + extrude; dy++) {
    const ty = y + dy;
    if (ty < 0 || ty >= target.height) continue;
    const cy = dy < 0 ? 0 : dy >= h ? h - 1 : dy;
    const sy = frame.y + Math.floor((cy * frame.h) / h);
    for (let dx = -extrude; dx < w + extrude; dx++) {
      const tx = x + dx;
      if (tx < 0 || tx >= target.width) continue;
      const cx = dx < 0 ? 0 : dx >= w ? w - 1 : dx;
      const sx = frame.x + Math.floor((cx * frame.w) / w);
      const from = (sy * source.width + sx) * 4;
      const to = (ty * target.width + tx) * 4;
      dst[to] = src[from];
      dst[to + 1] = src[from + 1];
      dst[to + 2] = src[from + 2];
      dst[to + 3] = src[from + 3];
    }
  }
}

/**
 * Scales an atlas by a density (see the module docs).
 *
 * @param {BenchManifest} manifest - The shipped manifest.
 * @param {Image[]} pages - Its decoded pages.
 * @param {number} density - The factor (> 0).
 * @param {{ maxSize?: number }} [options] - Largest page edge (default 2048).
 * @returns {{ manifest: BenchManifest, pages: Image[] }} The scaled manifest (page files named by
 *   {@link benchPageFile}) and its pages.
 * @throws {RangeError} When the density is not a positive number, or a scaled frame does not fit a
 *   page.
 *
 * @example
 * const { manifest, pages } = scaleAtlas(shipped, [decodePng(png)], 1.5);
 */
export function scaleAtlas(manifest, pages, density, options = {}) {
  if (!(density > 0) || !Number.isFinite(density)) {
    throw new RangeError(`density must be a positive number, got ${density}`);
  }
  const maxSize = options.maxSize ?? MAX_PAGE_SIZE;
  const names = Object.keys(manifest.frames).sort((a, b) => {
    const fa = manifest.frames[a];
    const fb = manifest.frames[b];
    return fa.p - fb.p || fa.y - fb.y || fa.x - fb.x || (a < b ? -1 : a > b ? 1 : 0);
  });
  const items = names.map((name) => {
    const frame = manifest.frames[name];
    return { name, w: scaledSize(frame.w, density), h: scaledSize(frame.h, density) };
  });
  // Split the frames, in source order, into groups of equal scaled area — one per modelled page.
  const groups = benchPageCount(manifest, density, maxSize);
  let total = 0;
  for (const item of items) total += item.w * item.h;
  /** @type {(typeof items)[]} */
  const grouped = [];
  for (let g = 0; g < groups; g++) grouped.push([]);
  let running = 0;
  for (const item of items) {
    const g = Math.min(groups - 1, Math.floor((running * groups) / total));
    grouped[g].push(item);
    running += item.w * item.h;
  }
  /** @type {BenchManifest['pages']} */
  const outPages = [];
  /** @type {Image[]} */
  const images = [];
  /** @type {BenchManifest['frames']} */
  const frames = {};
  for (const group of grouped) {
    if (group.length === 0) continue;
    const packing = packRects(group, { maxSize, padding: PADDING, extrude: EXTRUDE });
    const base = outPages.length;
    for (const page of packing.pages) {
      outPages.push({ file: benchPageFile(density, outPages.length), w: page.w, h: page.h });
      images.push(createImage(page.w, page.h));
    }
    for (const placed of packing.placements) {
      const source = manifest.frames[placed.name];
      placeScaled(
        images[base + placed.p],
        pages[source.p],
        source,
        placed.x,
        placed.y,
        placed.w,
        placed.h,
        EXTRUDE,
      );
      frames[placed.name] = {
        p: base + placed.p,
        x: placed.x,
        y: placed.y,
        w: placed.w,
        h: placed.h,
        ax: Math.round(source.ax * density),
        ay: Math.round(source.ay * density),
      };
    }
  }
  // Frames in the manifest's own key order, so the scaled manifest diffs line for line.
  /** @type {BenchManifest['frames']} */
  const ordered = {};
  for (const name of Object.keys(manifest.frames)) ordered[name] = frames[name];
  /** @type {BenchManifest['fonts']} */
  const fonts = {};
  for (const name of Object.keys(manifest.fonts)) {
    const font = manifest.fonts[name];
    /** @type {BenchManifest['fonts'][string]['glyphs']} */
    const glyphs = {};
    for (const code of Object.keys(font.glyphs)) {
      const glyph = font.glyphs[code];
      glyphs[code] = { frame: glyph.frame, advance: scaledSize(glyph.advance, density) };
    }
    fonts[name] = {
      sprite: font.sprite,
      lineHeight: scaledSize(font.lineHeight, density),
      cellWidth: scaledSize(font.cellWidth, density),
      cellHeight: scaledSize(font.cellHeight, density),
      glyphs,
    };
  }
  return {
    manifest: {
      formatVersion: manifest.formatVersion,
      pages: outPages,
      frames: ordered,
      sprites: manifest.sprites,
      animations: manifest.animations,
      fonts,
    },
    pages: images,
  };
}

/**
 * Builds every density's atlas from the bench's source atlas.
 *
 * @param {BenchManifest} manifest - The source manifest ({@link benchSourceAtlas}).
 * @param {Buffer[]} pngs - Its page files, in manifest order.
 * @param {readonly number[]} [densities] - The factors (default {@link BENCH_DENSITIES}).
 * @returns {BenchAtlas[]} One atlas per density; density 1 keeps the source page bytes.
 *
 * @example
 * const { manifest, pngs } = benchSourceAtlas();
 * buildBenchAtlases(manifest, pngs).map((a) => a.manifest.pages.length); // → [1, 1, 2]
 */
export function buildBenchAtlases(manifest, pngs, densities = BENCH_DENSITIES) {
  /** @type {Image[] | null} */
  let decoded = null;
  return densities.map((density) => {
    if (density === 1) {
      const pages = manifest.pages.map((page, index) => ({
        ...page,
        file: benchPageFile(1, index),
      }));
      return {
        density,
        label: densityLabel(density),
        manifest: { ...manifest, pages },
        pageUrls: pages.map((page) => `${BENCH_ATLAS_DIR}/${page.file}`),
        png: pngs.slice(),
      };
    }
    decoded ??= pngs.map((bytes) => decodePng(bytes));
    const scaled = scaleAtlas(manifest, decoded, density);
    return {
      density,
      label: densityLabel(density),
      manifest: scaled.manifest,
      pageUrls: scaled.manifest.pages.map((page) => `${BENCH_ATLAS_DIR}/${page.file}`),
      png: scaled.pages.map((image) => encodePng(image, { indexed: 'auto' })),
    };
  });
}

/**
 * The shipped particle-preset files (`content/fx/*.fx.json`, `example.*` excluded), as the
 * particle loader takes them.
 *
 * @param {string} [dir] - The fx content directory (default the repo's `content/fx/`).
 * @returns {{ path: string, data: unknown }[]} The files, sorted by path.
 */
export function readFxFiles(dir = FX_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.fx.json') && !name.startsWith('example.'))
    .sort()
    .map((name) => ({
      path: `fx/${name}`,
      data: JSON.parse(readFileSync(join(dir, name), 'utf8')),
    }));
}

/**
 * A `decode` scenario row for one E3 page (plan R-SVG WO-2) — the shape the virtual module's
 * `decode` array holds, so the row is measured by the same four stages as a PNG page.
 *
 * @param {string} id - The row id (`svg-x1-e3`, …).
 * @param {string} what - The table label.
 * @param {import('./bench-svg.mjs').BenchSvgPage} page - The emitted page.
 * @returns {{ id: string, what: string, width: number, height: number, url: string }} The row.
 */
function svgDecodeRow(id, what, page) {
  return {
    id,
    what: `${what} (${page.file}: ${page.paths} paths / ${page.rects} rects)`,
    width: page.width,
    height: page.height,
    url: `${BENCH_ATLAS_DIR}/${page.file}`,
  };
}

/**
 * The E3 pages the `decode` scenario measures in an armed build (the rows of
 * {@link BENCH_SVG_DECODE_ROWS}, then the stand-in page's).
 *
 * @param {Map<string, import('./bench-svg.mjs').BenchSvgPage> | null} densityPages - The density
 *   pages' E3 by PNG name, or `null` in the PNG arm.
 * @param {Map<string, import('./bench-svg.mjs').BenchSvgPage> | null} standinPages - The stand-in
 *   pages' E3 by PNG name in manifest order, or `null` in the PNG arm.
 * @param {readonly BenchAtlas[]} atlases - The built atlases (which page of a density is asked for).
 * @returns {{ id: string, what: string, width: number, height: number, url: string }[]} The rows —
 *   `[]` in the PNG arm, where there is no SVG in the bundle to measure.
 * @throws {Error} When a row names a density the build has no atlas for, or a page with no E3 behind
 *   it — a build whose tables have drifted apart fails instead of shipping a short row list.
 */
export function benchSvgDecodeRows(densityPages, standinPages, atlases) {
  if (densityPages === null || standinPages === null) return [];
  /** @type {{ id: string, what: string, width: number, height: number, url: string }[]} */
  const rows = [];
  for (const row of BENCH_SVG_DECODE_ROWS) {
    const atlas = atlases.find((built) => built.density === row.density);
    if (atlas === undefined) {
      throw new Error(`bench build: the ${row.id} row names density ${row.density}, not built`);
    }
    const index = Math.min(row.page, atlas.manifest.pages.length - 1);
    const page = densityPages.get(atlas.manifest.pages[index].file);
    if (page === undefined) {
      throw new Error(`bench build: no E3 page behind the ${row.id} row's atlas page ${index}`);
    }
    rows.push(svgDecodeRow(row.id, row.what, page));
  }
  const standin = standinPages.values().next().value;
  if (standin === undefined) {
    throw new Error('bench build: the SVG arm has no stand-in page to measure');
  }
  rows.push(svgDecodeRow(BENCH_SVG_STANDIN_ROW.id, BENCH_SVG_STANDIN_ROW.what, standin));
  return rows;
}

/**
 * The E3 rows the `decode` scenario measures through {@link benchSvgProbeRows}'s own routes (plan
 * R-SVG WO-2 §C.5): both name the ×1 density page's E3 file, which is the page with the most
 * colours and so the most representative parse.
 *
 * @param {Map<string, import('./bench-svg.mjs').BenchSvgPage> | null} densityPages - The density
 *   pages' E3 by PNG name, or `null` in the PNG arm.
 * @returns {{ id: string, probe: string, what: string, width: number, height: number, url: string }[]}
 *   The probe specs — `[]` in the PNG arm.
 * @throws {Error} When the build has no ×1 page (a bench build always has one).
 */
export function benchSvgProbeRows(densityPages) {
  if (densityPages === null) return [];
  const page = densityPages.get(benchPageFile(1, 0));
  if (page === undefined) {
    throw new Error('bench build: the SVG arm has no x1 page for its probe rows');
  }
  return BENCH_SVG_PROBE_ROWS.map((row) => ({
    id: row.id,
    probe: row.probe,
    what: `${row.what} (${page.file})`,
    width: page.width,
    height: page.height,
    url: `${BENCH_ATLAS_DIR}/${page.file}`,
  }));
}

/**
 * Vite plugin of the bench builds (`vite.bench.config.ts` of `apps/tizen` and `apps/webos`):
 * builds the density atlases from {@link benchSourceAtlas} (the shipped art, ungrouped, built in
 * memory once per Vite run), emits their pages into
 * {@link BENCH_ATLAS_DIR} together with the decode pages (`./bench-decode.mjs`
 * `buildDecodeStandin`, plan R1-05 B4 — page model per plan R3-04.M4a), serves them from memory on
 * the dev server, and provides {@link BENCH_MODULE_ID}: `export const atlases = [{ density, label,
 * manifest, pageUrls }, …]; export const fx = [{ path, data }, …]; export const decode = [{ id,
 * what, width, height, url }, …]; export const standin = { manifest, pageUrls }; export const
 * videos = [{ id, what, width, height, url }, …];` — `standin` is
 * the manifest of the run's last page load, the `standin-zone` one; the `videos` entries name the
 * clips {@link BENCH_VIDEO_CLIPS} ships through the `shmupVideos` plugin (plan v20x HARBENCH S8),
 * whose URLs the decode scenario measures on the video surface.
 *
 * @remarks
 * The manifests are inlined (decision D25 — a widget runs from `file://`, no `fetch()`); the pages
 * are loaded with `new Image()` like the game's. Only the scenario's own density is loaded on a
 * page, so a scenario's texture bytes are its own.
 *
 * @param {{ svgEnc?: string }} [options] - `svgEnc` flips the density pages to the **E3 SVG
 *   encoding** (`'e3'`; `''`/`'off'`/`'png'` is the default PNG arm, any other value throws). The
 *   arm renames every density page `bench-x<s>-<i>.svg` in the inlined manifests and emits the SVG
 *   text in its place — the PNG density pages are then *not* in the bundle, and the `decode` and
 *   `standin` pages stay PNG (they measure the PNG/OGG decoders, not an encoding of the atlas).
 *   See `./bench-svg.mjs` for the emitter and its pixel-exactness proof.
 * @returns {import('vite').Plugin} The plugin.
 */
export function shmupRenderBench(options = {}) {
  const svgEnc = parseBenchSvgEncoding(options.svgEnc ?? '');
  /** @type {BenchAtlas[] | null} */
  let atlases = null;
  /** @type {{ pages: import('./bench-decode.mjs').DecodePage[], manifest: object } | null} */
  let decodeBuild = null;
  /** @type {'build' | 'serve'} */
  let command = 'build';

  /**
   * Builds the atlases once per Vite run.
   *
   * @returns {BenchAtlas[]} The atlases.
   */
  const ensure = () => {
    if (atlases !== null) return atlases;
    const source = benchSourceAtlas();
    atlases = buildBenchAtlases(source.manifest, source.pngs);
    return atlases;
  };

  /**
   * The decode scenario's pages and the `standin-zone` load's manifest once per Vite run.
   *
   * @returns {{ pages: import('./bench-decode.mjs').DecodePage[], manifest: object }} The pages and
   *   the stand-in manifest.
   */
  const ensureDecode = () => {
    decodeBuild ??= buildDecodeStandin();
    return decodeBuild;
  };

  /** @type {Map<string, import('./bench-svg.mjs').BenchSvgPage> | null} */
  let svgByName = null;

  /**
   * The E3 page of each density page's PNG bytes, keyed by the PNG file name (null in the PNG arm).
   *
   * @returns {Map<string, import('./bench-svg.mjs').BenchSvgPage> | null} The pages by PNG name.
   */
  const svgPages = () => {
    if (svgEnc !== BENCH_SVG_ENCODING) return null;
    if (svgByName === null) {
      svgByName = new Map();
      for (const page of buildBenchSvgPages(ensure())) svgByName.set(page.pngFile, page);
    }
    return svgByName;
  };

  /** @type {Map<string, import('./bench-svg.mjs').BenchSvgPage> | null} */
  let svgStandinByName = null;

  /**
   * The E3 of the stand-in load's own pages (the pages {@link ensureDecode} ships as PNG in **both**
   * arms), keyed by the PNG file name — `null` in the PNG arm. The arm draws the run's last page
   * load from these (`standin-zone-svg`) and measures the first as a decode row (`svg-standin-e3`);
   * the PNG files stay shipped either way, so the `decode` scenario's PNG rows never move.
   *
   * @returns {Map<string, import('./bench-svg.mjs').BenchSvgPage> | null} The pages by PNG name.
   * @throws {Error} When a stand-in manifest page has no shipped PNG behind it — a build whose page
   *   files and manifest have drifted apart.
   */
  const svgStandinPages = () => {
    if (svgEnc !== BENCH_SVG_ENCODING) return null;
    if (svgStandinByName === null) {
      const build = ensureDecode();
      /** @type {Map<string, Buffer>} */
      const pngByFile = new Map();
      for (const page of build.pages) pngByFile.set(page.file, page.png);
      const items = build.manifest.pages.map((/** @type {{ file: string }} */ page) => {
        const png = pngByFile.get(page.file);
        if (png === undefined) {
          throw new Error(
            `bench build: the stand-in page ${page.file} has no shipped PNG to convert`,
          );
        }
        return { file: page.file, png };
      });
      svgStandinByName = new Map();
      for (const page of emitSvgPages(items)) svgStandinByName.set(page.pngFile, page);
    }
    return svgStandinByName;
  };

  /**
   * The arm's stand-in atlas: the same manifest and page count as {@link ensureDecode}'s, with every
   * page file renamed to its E3 sibling (`null` in the PNG arm, where the run has no SVG load).
   *
   * @returns {{ manifest: object, pageUrls: string[] } | null} The stand-in SVG atlas.
   */
  const standinSvgAtlas = () => {
    const standin = svgStandinPages();
    if (standin === null) return null;
    const build = ensureDecode();
    const files = build.manifest.pages.map((page) => standin.get(page.file).file);
    return {
      manifest: {
        ...build.manifest,
        pages: build.manifest.pages.map((page, index) => ({ ...page, file: files[index] })),
      },
      pageUrls: files.map((file) => `${BENCH_ATLAS_DIR}/${file}`),
    };
  };

  /**
   * The page the widget fetches and the bundle emits: the PNG page in the default arm, the E3 SVG
   * text of the same pixels when armed (the bytes argument is then only read in the PNG arm).
   *
   * @param {string} pngFile - The page's PNG file name.
   * @param {Buffer} pngBytes - The page's PNG bytes.
   * @returns {{ file: string, source: Buffer, mime: string }} Name, bytes and content type.
   */
  const pageOf = (pngFile, pngBytes) => {
    const svg = svgPages()?.get(pngFile);
    if (svg === undefined) return { file: pngFile, source: pngBytes, mime: 'image/png' };
    return { file: svg.file, source: svg.svg, mime: SVG_MIME_TYPE };
  };

  return {
    name: 'shmup:render-bench',
    configResolved(config) {
      command = config.command;
    },
    buildStart() {
      const built = ensure();
      if (command !== 'build') return;
      for (const atlas of built) {
        atlas.manifest.pages.forEach((page, index) => {
          const out = pageOf(page.file, atlas.png[index]);
          this.emitFile({
            type: 'asset',
            fileName: `${BENCH_ATLAS_DIR}/${out.file}`,
            source: out.source,
          });
        });
      }
      for (const page of ensureDecode().pages) {
        this.emitFile({
          type: 'asset',
          fileName: `${BENCH_ATLAS_DIR}/${page.file}`,
          source: page.png,
        });
      }
      // The arm's stand-in E3 pages, beside their PNGs (the PNG arm ships none).
      const standinSvg = svgStandinPages();
      if (standinSvg !== null) {
        for (const page of standinSvg.values()) {
          this.emitFile({
            type: 'asset',
            fileName: `${BENCH_ATLAS_DIR}/${page.file}`,
            source: page.svg,
          });
        }
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '').split('?')[0];
        const prefix = `/${BENCH_ATLAS_DIR}/`;
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        const file = url.slice(prefix.length);
        for (const atlas of ensure()) {
          const pages = atlas.manifest.pages.map((page, index) =>
            pageOf(page.file, atlas.png[index]),
          );
          const served = pages.find((page) => page.file === file);
          if (served !== undefined) {
            response.setHeader('Content-Type', served.mime);
            response.end(served.source);
            return;
          }
        }
        const decodePage = ensureDecode().pages.find((page) => page.file === file);
        if (decodePage !== undefined) {
          response.setHeader('Content-Type', 'image/png');
          response.end(decodePage.png);
          return;
        }
        const svgStandin = [...(svgStandinPages()?.values() ?? [])].find(
          (page) => page.file === file,
        );
        if (svgStandin !== undefined) {
          response.setHeader('Content-Type', SVG_MIME_TYPE);
          response.end(svgStandin.svg);
          return;
        }
        next();
      });
    },
    resolveId(id) {
      return id === BENCH_MODULE_ID ? RESOLVED_BENCH_MODULE_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_BENCH_MODULE_ID) return null;
      const list = ensure().map((atlas) => {
        const files = atlas.manifest.pages.map(
          (page, index) => pageOf(page.file, atlas.png[index]).file,
        );
        return {
          density: atlas.density,
          label: atlas.label,
          manifest: {
            ...atlas.manifest,
            pages: atlas.manifest.pages.map((page, index) => ({ ...page, file: files[index] })),
          },
          pageUrls: files.map((file) => `${BENCH_ATLAS_DIR}/${file}`),
        };
      });
      const build = ensureDecode();
      const decode = build.pages.map((page) => ({
        id: page.id,
        what: page.what,
        width: page.width,
        height: page.height,
        url: `${BENCH_ATLAS_DIR}/${page.file}`,
      }));
      const standin = {
        manifest: build.manifest,
        pageUrls: build.manifest.pages.map((page) => `${BENCH_ATLAS_DIR}/${page.file}`),
      };
      const videos = BENCH_VIDEO_CLIPS.map((clip) => ({
        id: clip.id,
        what: clip.what,
        width: FRAME_W,
        height: FRAME_H,
        url: `${BENCH_VIDEO_DIR}/${clip.id}.mp4`,
      }));
      // The SVG arm's beside-rows (plan R-SVG WO-2): the E3 files the `decode` scenario measures in
      // addition to its PNG pages, the two probe rows, and the manifest of the `standin-zone-svg`
      // load. A PNG build ships none of them — its `decode` array and every other row stay exactly
      // as they were, which is what keeps its ledger and the analyzer's PNG pools honest.
      const svgPagesByName = svgPages();
      const svgDecode = benchSvgDecodeRows(svgPagesByName, svgStandinPages(), ensure());
      const svgProbes = benchSvgProbeRows(svgPagesByName);
      return (
        `export const atlases = ${JSON.stringify(list)};\n` +
        `export const fx = ${JSON.stringify(readFxFiles())};\n` +
        `export const decode = ${JSON.stringify(decode.concat(svgDecode))};\n` +
        `export const standin = ${JSON.stringify(standin)};\n` +
        `export const standinSvg = ${JSON.stringify(standinSvgAtlas() ?? null)};\n` +
        `export const videos = ${JSON.stringify(videos)};\n` +
        `export const svgProbes = ${JSON.stringify(svgProbes)};\n` +
        'export default { atlases, fx, decode, standin, standinSvg, videos, svgProbes };\n'
      );
    },
  };
}
