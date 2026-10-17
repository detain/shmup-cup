/**
 * The TV render bench's **density atlases** and the Vite plugin that ships them (plan R0-02).
 *
 * The bench (`apps/tizen/src/bench`) draws a synthetic scene at 384×216, 640×360 and 960×540 with
 * a density factor `s` = 1, 1.5 and 2.25 — sprites, tiles and font ×s — so the larger frames cost
 * what a denser scene would, not just a bigger empty target. Its art is **the real atlas's art**,
 * packed **without groups** ({@link benchSourceAtlas}: `buildAtlas({ ungrouped: true })` of the
 * asset pipeline — every sprite on one page), upscaled ×s with nearest-neighbour **at bench-build
 * time, into the bench's own output** (`dist-bench/assets/atlas/bench-x<s>-<page>.png`). Nothing is
 * ever added to the game's atlas: a new sprite there would shift every sprite id, and with them
 * every golden replay.
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
 * the `decode` scenario's pages (`./bench-decode.mjs` — plan R1-05 B4: two synthetic 2048² pages,
 * RGBA and PNG-8, and the shipped `common` and zone A pages, as `decode-<id>.png` next to the
 * density pages); it exposes all three through the virtual module {@link BENCH_MODULE_ID}.
 *
 * The pages are encoded like the game's atlas pages: lossless PNG-8 where a page has at most 256
 * colours, else RGBA (`encodePng(…, { indexed: 'auto' })`, decision W3-3 — today's art has more,
 * so every bench page is RGBA).
 *
 * **Public API.** {@link BENCH_DENSITIES}, {@link BENCH_MODULE_ID}, {@link BENCH_ATLAS_DIR},
 * {@link densityLabel}, {@link benchPageFile}, {@link scaledSize}, {@link benchPageCount},
 * {@link benchSourceAtlas}, {@link scaleAtlas}, {@link buildBenchAtlases}, {@link readFxFiles},
 * {@link shmupRenderBench}.
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
import { buildDecodePages } from './bench-decode.mjs';

/** The density factors of the bench's three frame sizes (384×216, 640×360, 960×540). */
export const BENCH_DENSITIES = Object.freeze([1, 1.5, 2.25]);

/** The virtual module the bench imports its atlases and particle presets from. */
export const BENCH_MODULE_ID = 'virtual:shmup-render-bench';

/** Rollup's convention for a virtual module's resolved id. */
const RESOLVED_BENCH_MODULE_ID = '\0' + BENCH_MODULE_ID;

/** Where the bench's atlas pages are emitted (the Tizen bundle check looks for pages there). */
export const BENCH_ATLAS_DIR = 'assets/atlas';

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
 * The atlas the bench scales: the shipped art packed without groups — every sprite on one page,
 * the game's atlas of before R1-05 byte for byte (see the module docs). Built in memory by the
 * asset pipeline (`buildAtlas({ ungrouped: true })`, ~0.6 s), so it never reads
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
  const { manifest, pages } = buildAtlas({ ungrouped: true });
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
 * Vite plugin of the bench builds (`vite.bench.config.ts` of `apps/tizen` and `apps/webos`):
 * builds the density atlases from {@link benchSourceAtlas} (the shipped art, ungrouped, built in
 * memory once per Vite run), emits their pages into
 * {@link BENCH_ATLAS_DIR} together with the decode pages (`./bench-decode.mjs`
 * `buildDecodePages`, plan R1-05 B4), serves them from memory on the dev server, and provides
 * {@link BENCH_MODULE_ID}: `export const atlases = [{ density, label, manifest, pageUrls }, …];
 * export const fx = [{ path, data }, …]; export const decode = [{ id, what, width, height, url },
 * …];`.
 *
 * @remarks
 * The manifests are inlined (decision D25 — a widget runs from `file://`, no `fetch()`); the pages
 * are loaded with `new Image()` like the game's. Only the scenario's own density is loaded on a
 * page, so a scenario's texture bytes are its own.
 *
 * @returns {import('vite').Plugin} The plugin.
 */
export function shmupRenderBench() {
  /** @type {BenchAtlas[] | null} */
  let atlases = null;
  /** @type {import('./bench-decode.mjs').DecodePage[] | null} */
  let decodePages = null;
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
   * Builds the decode scenario's pages once per Vite run.
   *
   * @returns {import('./bench-decode.mjs').DecodePage[]} The pages.
   */
  const ensureDecode = () => {
    decodePages ??= buildDecodePages();
    return decodePages;
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
          this.emitFile({
            type: 'asset',
            fileName: `${BENCH_ATLAS_DIR}/${page.file}`,
            source: atlas.png[index],
          });
        });
      }
      for (const page of ensureDecode()) {
        this.emitFile({
          type: 'asset',
          fileName: `${BENCH_ATLAS_DIR}/${page.file}`,
          source: page.png,
        });
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
          const index = atlas.manifest.pages.findIndex((page) => page.file === file);
          if (index >= 0) {
            response.setHeader('Content-Type', 'image/png');
            response.end(atlas.png[index]);
            return;
          }
        }
        const decodePage = ensureDecode().find((page) => page.file === file);
        if (decodePage !== undefined) {
          response.setHeader('Content-Type', 'image/png');
          response.end(decodePage.png);
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
      const list = ensure().map((atlas) => ({
        density: atlas.density,
        label: atlas.label,
        manifest: atlas.manifest,
        pageUrls: atlas.pageUrls,
      }));
      const decode = ensureDecode().map((page) => ({
        id: page.id,
        what: page.what,
        width: page.width,
        height: page.height,
        url: `${BENCH_ATLAS_DIR}/${page.file}`,
      }));
      return (
        `export const atlases = ${JSON.stringify(list)};\n` +
        `export const fx = ${JSON.stringify(readFxFiles())};\n` +
        `export const decode = ${JSON.stringify(decode)};\n` +
        'export default { atlases, fx, decode };\n'
      );
    },
  };
}
