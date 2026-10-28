#!/usr/bin/env node
/**
 * The TV render bench's **E3 SVG atlas pages** — the `VITE_BENCH_SVG=e3` arm of the density
 * atlases (plan v20x R-SVG, work order WO-1 of `r-svg-inv-report.md`).
 *
 * **Responsibility.** Turn the bench's baked density atlas pages into SVG files that raster to
 * **exactly the same pixels**, so the widget can fetch and upload an SVG page where it used to
 * fetch and upload a PNG page — same frames, same geometry, same 190-row matrix — and the A/B
 * measures only the fetch → decode → upload cost of the encoding. The emitter is the research
 * lane's **E3** encoding: one compound `<path>` per distinct colour, whose `d` is the colour's
 * horizontal runs vertically merged into rectangles, drawn with `shape-rendering="crispEdges"`.
 * Of the three encodings the inventory tried (per-pixel rects, per-run paths, per-colour compound
 * paths) E3 is the only survivor: 1,573 paths and 46,197 rects for the ×1 page, and it gzip's to
 * **0.85×** the ×2.67 PNG's size where the other two reach 20×.
 *
 * **Why the pixels are the source, not the sprite maps.** The page is the one canonical raster of
 * every art source (pixel maps, seeded generators, PNG overrides, the bitmap font) *including* the
 * nearest-×s resample only the bench build performs, so emitting from the decoded page is both the
 * thin route and the digest-exact one. Input: the same in-memory pages `buildBenchAtlases` hands
 * the build (never a folder — `dist-bench/` is git-ignored and a CI test job never builds it).
 *
 * **SVG 1.1 core only** — `viewBox`, `width`, `height`, `shape-rendering`, `<path d>`,
 * `fill="#rrggbb"`, `fill-opacity`. No filters, masks, gradients, CSS, 8-digit hex or
 * `<image>`: every attribute predates Chromium 69 by years (the research lane's subset-safety
 * table), so the arm's open question is the M7's software-raster *speed*, not support. It is
 * also why the pages are static: an SVG in an image-resource context is in **static image mode**
 * (the SVG Integration spec) — SMIL and CSS animation never advance its raster — so nothing here
 * animates, and `createImageBitmap` of an SVG blob is rejected by Chromium (whatwg/html #923), so
 * a page must travel as an `HTMLImageElement` into `texImage2D` (the bench's own loader path).
 *
 * **Determinism.** The byte stream depends on the pixels and nothing else: colour keys ascending,
 * rects by (x, then width, then y), whole-number path coordinates, `fill-opacity` printed by
 * `Number#toString` — so a re-run is byte-identical like every other generator, and the pages are
 * reproducible from a tree alone (`node apps/tizen/scripts/bench-svg.mjs --check`).
 *
 * **The proof lives here, not in a browser.** {@link rasterE3} re-reads an emitted file as pixels
 * (the rectangles its `d` names, painted source-over) and {@link digestPixels} hashes the canvas
 * rule form of an image (a pixel with alpha 0 carries no colour, so it reads `#00000000` — the
 * form `getImageData` returns, and the reason a raw file digest would lie for a PNG-8 page, whose
 * transparent index still names a palette colour). {@link proveSvgPages} runs both over the three
 * pages the research lane measured on desktop and reports the digest pair per page: equal digests
 * is the in-repo pixel-exactness proof, re-derived from the shipped pipeline every time.
 *
 * **What the arm does NOT touch**: the decode scenario's pages (`bench-decode.mjs` — the PNG-8
 * stand-in page is E3's *worst* case, 4.6× the PNG gzipped and 14× slower to decode on noisy pixel
 * art, so it stays PNG), the game's atlas, and any committed byte the PNG arm writes. The density
 * page files are replaced by `.svg` siblings of the same name and size; the manifest's geometry
 * stays, only its page file names follow the extension.
 *
 * **Public API.** {@link BENCH_SVG_ENCODING}, {@link BENCH_SVG_ENCODINGS}, {@link SVG_PAGE_EXTENSION},
 * {@link SVG_MIME_TYPE}, {@link parseBenchSvgEncoding}, {@link benchSvgPageFile},
 * {@link benchSvgPageFile}, {@link emitE3}, {@link emitE3Page}, {@link parseE3}, {@link rasterE3},
 * {@link canvasPixels}, {@link digestPixels}, {@link buildBenchSvgPages}, {@link PROOF_PAGES},
 * {@link proveSvgPages}.
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createImage } from '../../../scripts/assets/image.mjs';
import { decodePng } from '../../../scripts/assets/png.mjs';
import { benchSourceAtlas, buildBenchAtlases } from './bench-atlas.mjs';
import { buildDecodeStandin } from './bench-decode.mjs';

/**
 * @typedef {import('../../../scripts/assets/image.mjs').Image} Image
 */

/**
 * @typedef {import('./bench-atlas.mjs').BenchAtlas} BenchAtlas
 */

/** The encoding the arm ships — the value `VITE_BENCH_SVG` takes and the payload's `svgEnc`. */
export const BENCH_SVG_ENCODING = 'e3';

/**
 * Every `VITE_BENCH_SVG` value: `''`/`'off'`/`'png'` build the PNG pages as always, `e3` builds the
 * SVG arm. The id doubles as the payload's `svgEnc` and the analyzer's pool suffix.
 *
 * @type {ReadonlySet<string>}
 */
export const BENCH_SVG_ENCODINGS = new Set(['png', BENCH_SVG_ENCODING]);

/** The extension of an emitted SVG page file (`bench-x1-0.svg`). */
export const SVG_PAGE_EXTENSION = '.svg';

/** The MIME type an SVG page is a blob of (the PNG pages' `image/png` sibling). */
export const SVG_MIME_TYPE = 'image/svg+xml';

/**
 * Parses the `VITE_BENCH_SVG` value of a bench build.
 *
 * @param {string} text - `''`, `'off'`, `'png'` (the PNG pages — the default every build used
 *   before the arm) or `'e3'` (this file's encoding). Case- and blank-insensitive.
 * @returns {'png' | 'e3'} The encoding the build arms with.
 * @throws {Error} For anything else — a bench config calls this at build time, so a typo fails the
 *   build rather than silently shipping a PNG bundle under an SVG build id.
 *
 * @example
 * ```js
 * parseBenchSvgEncoding('');    // → 'png'
 * parseBenchSvgEncoding('e3');  // → 'e3'
 * ```
 */
export function parseBenchSvgEncoding(text) {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'off' || trimmed === 'png') return 'png';
  if (trimmed === BENCH_SVG_ENCODING) return BENCH_SVG_ENCODING;
  throw new Error(
    `render bench: VITE_BENCH_SVG must be e3, png, off or empty, not "${text}" — ` +
      `the arm's encodings are ${[...BENCH_SVG_ENCODINGS].join(', ')}`,
  );
}

/**
 * The SVG file name of a density page (`bench-x2.67-1.png` → `bench-x2.67-1.svg`).
 *
 * @param {string} file - The page's file name as {@link benchPageFile} names it.
 * @returns {string} The same name with {@link SVG_PAGE_EXTENSION}.
 * @throws {RangeError} When the name is not a `.png` file.
 */
export function benchSvgPageFile(file) {
  if (!file.endsWith('.png')) {
    throw new RangeError(`svg page: expected a .png atlas page, got "${file}"`);
  }
  return `${file.slice(0, -'.png'.length)}${SVG_PAGE_EXTENSION}`;
}

/**
 * A colour key: `rgba` bytes of one pixel packed big-endian into an unsigned 32-bit number.
 *
 * @param {Uint8Array} data - The page's pixels.
 * @param {number} offset - The pixel's byte offset.
 * @returns {number} the key.
 */
function colorKey(data, offset) {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

/**
 * The `#rrggbb` and alpha of a colour key.
 *
 * @param {number} key - The key from {@link colorKey}.
 * @returns {{ rgb: string, alpha: number }} The hex colour and its 0–255 alpha.
 */
function colorOf(key) {
  const hex = (/** @type {number} */ v) => v.toString(16).padStart(2, '0');
  return {
    rgb: `#${hex((key >>> 24) & 255)}${hex((key >>> 16) & 255)}${hex((key >>> 8) & 255)}`,
    alpha: key & 255,
  };
}

/**
 * A merged rectangle of one colour: `[x, y, width, key, height]` in page coordinates.
 *
 * @typedef {number[]} E3Rect
 */

/**
 * The page's colour regions: every horizontal run of equal RGBA, then the runs that sit in the same
 * columns of adjacent rows merged into one rectangle (E3's whole economy — on the ×2.67 page 114,556
 * runs merge to 31,046 rectangles, which is what makes its gzip beat the PNG's).
 *
 * @param {Image} image - The page's pixels.
 * @param {number} x0 - Left column of the region to scan.
 * @param {number} y0 - Top row of the region to scan.
 * @param {number} width - Region width in pixels.
 * @param {number} height - Region height in pixels.
 * @returns {E3Rect[]} The rectangles, grouped by colour key ascending and inside a colour ordered
 *   by x, then width, then y (the deterministic emission order).
 */
function regionRects(image, x0, y0, width, height) {
  const data = image.data;
  const stride = image.width;
  /** @type {E3Rect[]} */
  const rects = [];
  for (let row = 0; row < height; row++) {
    let x = 0;
    while (x < width) {
      const start = ((y0 + row) * stride + x0 + x) * 4;
      if (data[start + 3] === 0) {
        x++;
        continue;
      }
      const key = colorKey(data, start);
      let end = x + 1;
      while (end < width && colorKey(data, ((y0 + row) * stride + x0 + end) * 4) === key) end++;
      rects.push([x0 + x, y0 + row, end - x, key, 1]);
      x = end;
    }
  }
  // Sort so a colour's equal-extent runs of adjacent rows meet; then merge down. V8's sort is
  // stable and the comparator is total (two runs of one colour in one row differ in x or width).
  rects.sort((a, b) => a[3] - b[3] || a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  /** @type {E3Rect[]} */
  const merged = [];
  for (const rect of rects) {
    const last = merged.length > 0 ? merged[merged.length - 1] : null;
    if (
      last !== null &&
      last[0] === rect[0] &&
      last[2] === rect[2] &&
      last[3] === rect[3] &&
      last[1] + last[4] === rect[1]
    ) {
      last[4]++;
    } else {
      merged.push(rect);
    }
  }
  return merged;
}

/**
 * The E3 SVG of a region of a page (see the module docs): `<svg>` header at the region's size and
 * offset, then one compound `<path>` per colour.
 *
 * @param {Image} image - The page's pixels.
 * @param {number} [x0] - Left column (default 0).
 * @param {number} [y0] - Top row (default 0).
 * @param {number} [width] - Region width (default to the page edge).
 * @param {number} [height] - Region height (default to the page edge).
 * @returns {string} The SVG document text.
 * @throws {RangeError} When the region leaves the page.
 *
 * @example
 * ```js
 * const svg = emitE3(decodePng(readFileSync(page))); // one <path> per colour, crispEdges
 * ```
 */
export function emitE3(
  image,
  x0 = 0,
  y0 = 0,
  width = image.width - x0,
  height = image.height - y0,
) {
  return emitE3Doc(image, x0, y0, width, height).text;
}

/**
 * The E3 document of a region **with its census** — the emitter's real work, which {@link emitE3}
 * prints as text and {@link buildBenchSvgPages} counts without parsing the text back.
 *
 * @param {Image} image - The page's pixels.
 * @param {number} [x0] - Left column (default 0).
 * @param {number} [y0] - Top row (default 0).
 * @param {number} [width] - Region width (default to the page edge).
 * @param {number} [height] - Region height (default to the page edge).
 * @returns {{ text: string, paths: number, rects: number }} The document and its element counts.
 * @throws {RangeError} When the region leaves the page.
 */
function emitE3Doc(image, x0 = 0, y0 = 0, width = image.width - x0, height = image.height - y0) {
  if (
    x0 < 0 ||
    y0 < 0 ||
    width < 0 ||
    height < 0 ||
    x0 + width > image.width ||
    y0 + height > image.height
  ) {
    throw new RangeError(
      `svg page: region ${x0},${y0} ${width}x${height} leaves the ${image.width}x${image.height} page`,
    );
  }
  const rects = regionRects(image, x0, y0, width, height);
  /** @type {Map<number, E3Rect[]>} */
  const byColor = new Map();
  for (const rect of rects) {
    const group = byColor.get(rect[3]);
    if (group === undefined) byColor.set(rect[3], [rect]);
    else group.push(rect);
  }
  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${x0} ${y0} ${width} ${height}" shape-rendering="crispEdges">`;
  const keys = [...byColor.keys()].sort((a, b) => a - b);
  for (const key of keys) {
    const color = colorOf(key);
    let d = '';
    for (const rect of byColor.get(key) ?? []) {
      d += `M${rect[0]} ${rect[1]}h${rect[2]}v${rect[4]}h-${rect[2]}z`;
    }
    out +=
      `<path fill="${color.rgb}"` +
      (color.alpha < 255 ? ` fill-opacity="${color.alpha / 255}"` : '') +
      ` d="${d}"/>`;
  }
  return { text: `${out}</svg>`, paths: keys.length, rects: rects.length };
}

/**
 * The E3 page file's bytes (a whole page, UTF-8).
 *
 * @param {Image} image - The page's pixels.
 * @returns {Buffer} The SVG file.
 */
export function emitE3Page(image) {
  return Buffer.from(emitE3(image), 'utf8');
}

/**
 * One parsed `<path>` of an emitted file: its colour and its rectangles.
 *
 * @typedef {{ rgb: string, opacity: number, rects: E3Rect[] }} E3Path
 */

/**
 * Reads back an E3 SVG as paths — independent of the emitter's run and merge logic: the `d`
 * grammar (`M x y h w v h h -w z`) is matched as text. Used by {@link rasterE3} and by the
 * emitter's own tests; anything else's SVG is refused, so the proof cannot silently pass over a
 * document this file did not write.
 *
 * @param {string} svg - The document text.
 * @returns {{ width: number, height: number, viewBox: number[], paths: E3Path[] }} The page size,
 *   its `viewBox` numbers and its paths.
 * @throws {RangeError} When the header is missing or malformed, a path is outside the grammar, or
 *   the file carries an element this emitter never writes.
 */
export function parseE3(svg) {
  if (!svg.startsWith('<svg ')) throw new RangeError('svg page: not an E3 page (no <svg header)');
  if (!svg.endsWith('</svg>')) throw new RangeError('svg page: the document is truncated');
  const header = svg.slice(0, svg.indexOf('>') + 1);
  // The header is matched whole: an E3 page carries exactly these five attributes in this order, so
  // a foreign attribute (`style`, a `class`, an event handler), a missing `shape-rendering`, a
  // different namespace or a reordered root is not a page this module wrote.
  const root = new RegExp(
    '^<svg xmlns="http://www\\.w3\\.org/2000/svg" width="(\\d+)" height="(\\d+)" ' +
      'viewBox="(\\d+) (\\d+) (\\d+) (\\d+)" shape-rendering="crispEdges">$',
  ).exec(header);
  if (root === null)
    throw new RangeError(`svg page: the header is not the one the emitter writes: "${header}"`);
  const width = Number(root[1]);
  const height = Number(root[2]);
  if (width !== Number(root[5]) || height !== Number(root[6])) {
    throw new RangeError(
      `svg page: the root is ${width}×${height} but its viewBox is ${root[5]}×${root[6]}`,
    );
  }
  const viewBox = [Number(root[3]), Number(root[4]), Number(root[5]), Number(root[6])];
  const body = svg.slice(svg.indexOf('>') + 1, svg.length - '</svg>'.length);
  /** @type {E3Path[]} */
  const paths = [];
  let rest = body;
  while (rest !== '') {
    const match =
      /^<path fill="(#[0-9a-f]{6})"(?: fill-opacity="([\d.e+-]+)")? d="([^"]*)"\/>$/.exec(
        rest.slice(0, rest.indexOf('/>') + 2),
      );
    if (match === null)
      throw new RangeError(`svg page: unexpected element or attribute at "${rest.slice(0, 40)}…"`);
    /** @type {E3Rect[]} */
    const rects = [];
    let d = match[3];
    if (d !== '') {
      const each = d.split('z');
      for (const step of each) {
        if (step === '') continue;
        const rect = /^M(\d+) (\d+)h(\d+)v(\d+)h-(\d+)$/.exec(step);
        if (rect === null || Number(rect[3]) !== Number(rect[5])) {
          throw new RangeError(`svg page: "${step.slice(0, 40)}" is not an E3 rectangle`);
        }
        rects.push([Number(rect[1]), Number(rect[2]), Number(rect[3]), 0, Number(rect[4])]);
      }
    }
    paths.push({ rgb: match[1], opacity: match[2] === undefined ? 1 : Number(match[2]), rects });
    rest = rest.slice(match[0].length);
  }
  return { width, height, viewBox, paths };
}

/**
 * Rasters an emitted E3 document back to pixels (the check's own rasterizer — see the module
 * docs): every path's rectangles painted source-over a transparent canvas, in document order.
 *
 * @param {string} svg - The document text from {@link emitE3}.
 * @returns {Image} The page's pixels (straight alpha, like {@link decodePng}).
 * @throws {RangeError} For anything {@link parseE3} refuses, or a page of a non-whole size.
 */
export function rasterE3(svg) {
  const doc = parseE3(svg);
  const image = createImage(doc.width, doc.height);
  const data = image.data;
  for (const path of doc.paths) {
    const src = [
      Number.parseInt(path.rgb.slice(1, 3), 16),
      Number.parseInt(path.rgb.slice(3, 5), 16),
      Number.parseInt(path.rgb.slice(5, 7), 16),
    ];
    const sa = path.opacity;
    for (const [x, y, width, , height] of path.rects) {
      if (x < 0 || y < 0 || x + width > doc.width || y + height > doc.height) {
        throw new RangeError(`svg page: a rect at ${x},${y} ${width}x${height} leaves the page`);
      }
      for (let row = y; row < y + height; row++) {
        for (let column = x; column < x + width; column++) {
          const offset = (row * doc.width + column) * 4;
          const da = data[offset + 3] / 255;
          const oa = sa + da * (1 - sa);
          if (oa === 0) continue;
          for (let channel = 0; channel < 3; channel++) {
            const value = (src[channel] * sa + data[offset + channel] * da * (1 - sa)) / oa;
            data[offset + channel] = Math.round(value);
          }
          data[offset + 3] = Math.round(oa * 255);
        }
      }
    }
  }
  return image;
}

/**
 * The canvas rule form of a page's pixels: a pixel with alpha 0 is `#00000000`, because a fully
 * transparent pixel carries no colour — what `getImageData` of a raster returns for both a PNG page
 * and an SVG one, whatever the file stored under its alpha.
 *
 * @param {Image} image - The pixels.
 * @returns {Uint8Array} A new buffer in the canvas rule form.
 */
export function canvasPixels(image) {
  const out = new Uint8Array(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] === 0) continue;
    out[i] = image.data[i];
    out[i + 1] = image.data[i + 1];
    out[i + 2] = image.data[i + 2];
    out[i + 3] = image.data[i + 3];
  }
  return out;
}

/**
 * The pixel digest of a page: SHA-256 over its {@link canvasPixels} bytes — the number two pages of
 * the same pixels share, however their files differ.
 *
 * @param {Image} image - The pixels.
 * @returns {string} 64 lowercase hex chars.
 */
export function digestPixels(image) {
  return createHash('sha256').update(canvasPixels(image)).digest('hex');
}

/**
 * One density page as the arm ships it.
 *
 * @typedef {{ pngFile: string, file: string, width: number, height: number, svg: Buffer, pngBytes: number, rects: number, paths: number }} BenchSvgPage
 */

/**
 * The E3 of page bytes this build already has: every item's PNG decoded in memory and written as
 * one E3 document. {@link buildBenchSvgPages} is its atlas-shaped caller; the arm's stand-in pages
 * (which the build ships as PNG in both arms and additionally as SVG when armed) go through it
 * directly.
 *
 * @param {readonly { file: string, png: Buffer }[]} items - Each page's PNG file name and bytes.
 * @returns {BenchSvgPage[]} One entry per item, in the given order.
 * @throws {Error} Whatever the PNG decoder throws for bytes it is not a PNG of.
 */
export function emitSvgPages(items) {
  /** @type {BenchSvgPage[]} */
  const pages = [];
  for (const item of items) {
    const image = decodePng(item.png);
    const doc = emitE3Doc(image);
    pages.push({
      pngFile: item.file,
      file: benchSvgPageFile(item.file),
      width: image.width,
      height: image.height,
      svg: Buffer.from(doc.text, 'utf8'),
      pngBytes: item.png.length,
      rects: doc.rects,
      paths: doc.paths,
    });
  }
  return pages;
}

/**
 * The arm's page files: every density page of the built atlases emitted as E3 (the PNG pages the
 * build no longer ships stay as the input, decoded in memory).
 *
 * @param {readonly BenchAtlas[]} atlases - The atlases from {@link buildBenchAtlases}.
 * @returns {BenchSvgPage[]} One entry per page, in density and page order.
 */
export function buildBenchSvgPages(atlases) {
  /** @type {{ file: string, png: Buffer }[]} */
  const items = [];
  for (const atlas of atlases) {
    atlas.png.forEach((/** @type {Buffer} */ png, /** @type {number} */ index) => {
      items.push({ file: atlas.manifest.pages[index].file, png });
    });
  }
  return emitSvgPages(items);
}

/**
 * The three pages of the research lane's correctness table (§B.3 of `r-svg-inv-report.md`): the ×1
 * page (partial alpha, the most colours), the ×2.67 page's second half (the density case E3 wins on
 * the wire) and the stand-in zone A page (PNG-8, noisy pixel art — E3's worst content, kept as a
 * proof of the emitter, not shipped as a page).
 *
 * @type {ReadonlyArray<{ name: string, density: number | null, page: number, sandboxPngDigest: string }>}
 */
export const PROOF_PAGES = Object.freeze([
  {
    name: 'bench-x1-0',
    density: 1,
    page: 0,
    sandboxPngDigest: '72b21560a95a321efce27f2fed8fb56d79a665a9515bf567814b60afc84b7c66',
  },
  {
    name: 'bench-x2.67-1',
    density: 2.67,
    page: 1,
    sandboxPngDigest: 'd708b0712c7f1950db2cd98694876db47549e60cbf07aa26f14e14f221d6c0eb',
  },
  {
    name: 'decode-standin-zone-a',
    density: null,
    page: 0,
    sandboxPngDigest: '78b1cae89c3009c711a029a7c30ff802dca371496db0851d61bc7d6c17fb6dd0',
  },
]);

/**
 * One proof row.
 *
 * @typedef {{ name: string, width: number, height: number, colors: number, rects: number,
 *   pngBytes: number, svgBytes: number, pngDigest: string, svgDigest: string, exact: boolean,
 *   sandboxDigestMatch: boolean }} SvgProof
 */

/**
 * Proves the emitter pixel-exact on the proof pages, re-derived from the shipped pipeline: decode the
 * page the build bakes, emit its E3 file, raster the file back, and compare the two digests
 * ({@link digestPixels}).
 *
 * @param {{ atlases?: readonly BenchAtlas[], standinPages?: { file: string, png: Buffer }[] }} [given]
 *   The pages to prove (default: build them — {@link benchSourceAtlas} and
 *   {@link buildDecodeStandin}, ~2 s and ~10 s of packing).
 * @returns {SvgProof[]} One row per {@link PROOF_PAGES} entry, in that order.
 * @throws {Error} When a proof page is not in the built pages (the atlas or the stand-in model moved).
 */
export function proveSvgPages(given = {}) {
  const source = given.atlases === undefined ? benchSourceAtlas() : null;
  const atlases = given.atlases ?? buildBenchAtlases(source.manifest, source.pngs);
  const standinPages = given.standinPages ?? buildDecodeStandin().pages;
  /** @type {Map<string, Buffer>} */
  const pngs = new Map();
  for (const atlas of atlases) {
    atlas.manifest.pages.forEach((page, index) => pngs.set(page.file, atlas.png[index]));
  }
  for (const page of standinPages) pngs.set(page.file, page.png);
  return PROOF_PAGES.map((/** @type {(typeof PROOF_PAGES)[number]} */ entry) => {
    const file = `${entry.name}.png`;
    const png = pngs.get(file);
    if (png === undefined) throw new Error(`svg proof: no baked page ${file} to prove against`);
    const image = decodePng(png);
    const doc = emitE3Doc(image);
    const fromPng = digestPixels(image);
    const fromSvg = digestPixels(rasterE3(doc.text));
    return {
      name: entry.name,
      width: image.width,
      height: image.height,
      colors: doc.paths,
      rects: doc.rects,
      pngBytes: png.length,
      svgBytes: Buffer.byteLength(doc.text, 'utf8'),
      pngDigest: fromPng,
      svgDigest: fromSvg,
      exact: fromPng === fromSvg,
      sandboxDigestMatch: fromPng === entry.sandboxPngDigest,
    };
  });
}

/**
 * Command line: `node apps/tizen/scripts/bench-svg.mjs [--json]` prints the proof table of
 * {@link proveSvgPages} (one line per page: digests, bytes, rects, paths) and exits non-zero when a
 * page is not pixel-exact — the runbook check of the arm, reproducible from a tree alone.
 */
function main() {
  const json = process.argv.indexOf('--json') >= 0;
  const rows = proveSvgPages();
  const bad = rows.filter((row) => !row.exact);
  if (json) {
    console.log(JSON.stringify(rows, null, 1));
  } else {
    for (const row of rows) {
      console.log(
        `${row.exact ? 'OK  ' : 'FAIL'} ${row.name} ${row.width}x${row.height} ` +
          `${row.colors} paths / ${row.rects} rects  png ${row.pngBytes} B  svg ${row.svgBytes} B  ` +
          `png ${row.pngDigest.slice(0, 12)}  svg ${row.svgDigest.slice(0, 12)}` +
          `  ${row.sandboxDigestMatch ? '(matches the desktop raster)' : '(the desktop raster saw different bytes: its getImageData rounds partial alpha)'}`,
      );
    }
  }
  if (bad.length > 0) {
    console.error(
      `svg arm: ${bad.length} page(s) are not pixel-exact (${bad.map((r) => r.name).join(', ')})`,
    );
    process.exit(1);
  }
}

/**
 * Whether this file is the script Node was started with, as opposed to imported by a build or a test.
 *
 * @returns {boolean} true when run from the command line.
 */
function isCommandLineEntry() {
  const entry = process.argv[1];
  if (entry === undefined || !existsSync(entry)) return false;
  return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

if (isCommandLineEntry()) main();
