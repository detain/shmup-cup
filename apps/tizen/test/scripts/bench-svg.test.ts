/**
 * `scripts/bench-svg.mjs` (plan R-SVG WO-1): the E3 SVG encoder of the TV render bench's density
 * pages, its strict self-reader, and the **pixel-exactness proof** of the arm — every page the arm
 * ships is re-rasterised here and digested against the PNG page the pipeline bakes, so the claim
 * "the same pixels, another encoding" is re-derived in this repository rather than trusted from the
 * research lane's desktop measurements.
 *
 * The heavy block builds the bench's real atlases once (the same work the bench build spends) and
 * proves every density page plus the stand-in page's shape. The pinned digests and censuses are
 * those runs: they move only when the shipped art moves, and then together with the atlas digest
 * pin in `test/scripts/assets/interim-pipeline.test.ts` — a page whose pixels moved without a
 * reason fails here, not on the TV.
 */
import { describe, expect, it } from 'vitest';
import { createImage } from '../../../../scripts/assets/image.mjs';
import { decodePng, encodePng } from '../../../../scripts/assets/png.mjs';
import {
  BENCH_DENSITIES,
  benchSourceAtlas,
  buildBenchAtlases,
} from '../../scripts/bench-atlas.mjs';
import { buildDecodeStandin, decodePageFile } from '../../scripts/bench-decode.mjs';
import {
  BENCH_SVG_ENCODING,
  BENCH_SVG_ENCODINGS,
  PROOF_PAGES,
  SVG_MIME_TYPE,
  SVG_PAGE_EXTENSION,
  benchSvgPageFile,
  buildBenchSvgPages,
  canvasPixels,
  digestPixels,
  emitE3,
  emitE3Page,
  emitSvgPages,
  parseBenchSvgEncoding,
  parseE3,
  proveSvgPages,
  rasterE3,
} from '../../scripts/bench-svg.mjs';
import {
  SVG_DECODE_ENCODING,
  SVG_DECODE_MIME,
  isSvgBytes,
  pageEncodingOf,
} from '../../src/bench/decode.js';
import {
  benchBuildId,
  benchSvgIdSuffix,
  parseBenchOutput,
  parseBenchSvg,
} from '../../src/bench/output.js';

/** The pipeline's image, structurally (`scripts/assets/image.mjs` `createImage`). */
interface Pixels {
  width: number;
  height: number;
  data: Uint8Array;
}

/** One page's PNG bytes with its pixels decoded (the arm's input). */
interface BuiltPage {
  file: string;
  png: Buffer;
  image: Pixels;
}

/** The bench's real density pages, built once for the heavy block. */
let densityPages: BuiltPage[] = [];
/** The stand-in zone A page (E3's worst content: 2048² of noisy pixel art, PNG-8). */
let standinPage: BuiltPage | null = null;
/** The three re-derived proof rows. */
let proof: Record<string, unknown>[] = [];

/**
 * Fills an image from a row-major table of `#rrggbb[aa]` colours.
 *
 * @param cells - One entry per pixel, row by row.
 * @param width - Columns.
 * @returns The image.
 */
function imageOf(cells: string[], width: number): Pixels {
  const image = createImage(width, Math.ceil(cells.length / width));
  cells.forEach((cell, index) => {
    const hex = (v: number) => parseInt(cell.slice(v, v + 2), 16);
    const offset = index * 4;
    image.data[offset] = hex(1);
    image.data[offset + 1] = hex(3);
    image.data[offset + 2] = hex(5);
    image.data[offset + 3] = cell.length >= 9 ? hex(7) : 255;
  });
  return image;
}

/**
 * The document head of a page of the given size (every E3 file starts with it).
 *
 * @param width - Page width.
 * @param height - Page height.
 * @param x0 - ViewBox left (0 for a whole page).
 * @returns The opening tag.
 */
function head(width: number, height: number, x0 = 0): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${x0} 0 ${width} ${height}" shape-rendering="crispEdges">`
  );
}

/**
 * The alpha values present in an image.
 *
 * @param image - The pixels.
 * @returns The set of alphas.
 */
function alphasOf(image: Pixels): Set<number> {
  const out = new Set<number>();
  for (let i = 3; i < image.data.length; i += 4) out.add(image.data[i]);
  return out;
}

describe('bench-svg: the E3 encoding, hand-checked', () => {
  it('writes one compound path per colour, in ascending rgba byte order', () => {
    // Two reds on the top row, one green, one fully transparent pixel: the transparent pixel is
    // not written at all (the raster starts transparent), and the colours come out in ascending
    // byte order of their rgba key — green `#00ff00ff` before red `#ff0000ff`.
    expect(emitE3(imageOf(['#ff0000', '#ff0000', '#00ff00', '#12345600'], 2))).toBe(
      `${head(2, 2)}` +
        '<path fill="#00ff00" d="M0 1h1v1h-1z"/>' +
        '<path fill="#ff0000" d="M0 0h2v1h-2z"/>' +
        '</svg>',
    );
  });

  it('merges runs of equal colour into rectangles', () => {
    // A 4×2 block of one colour is one rectangle, not eight pixels: the whole economy of E3.
    const block = imageOf(
      Array.from({ length: 8 }, () => '#102030'),
      4,
    );
    expect(emitE3(block)).toBe(`${head(4, 2)}<path fill="#102030" d="M0 0h4v2h-4z"/></svg>`);
  });

  it('carries alpha as fill-opacity and drops a fully transparent pixel', () => {
    const svg = emitE3(imageOf(['#01020300', '#04050680', '#ffffff', '#00000001'], 2));
    expect(svg).toBe(
      `${head(2, 2)}` +
        '<path fill="#000000" fill-opacity="0.00392156862745098" d="M1 1h1v1h-1z"/>' +
        '<path fill="#040506" fill-opacity="0.5019607843137255" d="M1 0h1v1h-1z"/>' +
        '<path fill="#ffffff" d="M0 1h1v1h-1z"/>' +
        '</svg>',
    );
    // alpha 1 and alpha 128 are the exact 255ths of the stored byte, and alpha 0 has no element.
    expect(
      parseE3(svg).paths.map((path: { rgb: string; opacity: number }) => [path.rgb, path.opacity]),
    ).toEqual([
      ['#000000', 1 / 255],
      ['#040506', 128 / 255],
      ['#ffffff', 1],
    ]);
  });

  it('rasterises what it wrote, pixel for pixel', () => {
    for (const cells of [
      ['#ff0000', '#ff0000', '#00ff00', '#12345600'],
      ['#01020300', '#04050680', '#ffffff', '#00000001'],
      ['#7f7f7f7f', '#7f7f7f7f', '#7f7f7f01', '#7f7f7ffe'],
      ['#112233', '#445566', '#778899', '#aabbcc'],
    ]) {
      const image = imageOf(cells, 2);
      const back = rasterE3(emitE3(image));
      // The canvas rule is what a raster can show (an alpha-0 pixel reads black whatever the file
      // stored beneath it), so that is the comparison — as it is in the proof's digests.
      expect([...canvasPixels(back)]).toEqual([...canvasPixels(image)]);
      expect(digestPixels(back)).toBe(digestPixels(image));
    }
    // A fully opaque page round-trips down to the stored bytes, not only the canvas rule.
    const opaque = imageOf(['#112233', '#445566', '#778899', '#aabbcc'], 2);
    expect([...rasterE3(emitE3(opaque)).data]).toEqual([...opaque.data]);
  });

  it('reads the canvas rule: alpha 0 is a black transparent pixel', () => {
    const stored = imageOf(['#ff000000', '#04050680'], 2);
    // Whatever the file stores under a zero alpha, `getImageData` returns black — and so does this
    // digest recipe, which is why the proof compares what a raster can show, not what a file holds.
    expect([...canvasPixels(stored)]).toEqual([0, 0, 0, 0, 4, 5, 6, 128]);
    expect(digestPixels(stored)).toBe(digestPixels(canvasOf([0, 0, 0, 0, 4, 5, 6, 128], 2)));
  });

  it('emits a region of a page, not only a whole one', () => {
    // A frame's pixels read out of a page: the region keeps page coordinates in its viewBox and
    // writes its own size, which is what lets a sub-rect travel without repacking a page.
    const image = imageOf(['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'], 3);
    const region = emitE3(image, 1, 0, 2, 2);
    expect(region).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" viewBox="1 0 2 2" ` +
        `shape-rendering="crispEdges">` +
        '<path fill="#222222" d="M1 0h1v1h-1z"/><path fill="#333333" d="M2 0h1v1h-1z"/>' +
        '<path fill="#555555" d="M1 1h1v1h-1z"/><path fill="#666666" d="M2 1h1v1h-1z"/>' +
        '</svg>',
    );
    expect(() => emitE3(image, 2, 0, 2, 1)).toThrow(RangeError);
    expect(() => emitE3(image, 0, 0, 3, 3)).toThrow(/leaves the 3x2 page/);
  });

  it('is the same bytes whatever path through the module', () => {
    const image = imageOf(['#0a141e', '#0a141e', '#f0e0d0', '#00000000'], 2);
    const text = emitE3(image);
    expect(emitE3Page(image).toString('utf8')).toBe(text);
    const png = encodePng(image);
    // A partial atlas: the arm's page builder reads a page's file name and PNG bytes and nothing
    // else, so the fixture carries exactly those (typed through the function's own parameter).
    const atlas = {
      density: 1,
      label: 'x1',
      manifest: { pages: [{ file: 'bench-x1-0.png', w: 2, h: 2 }] },
      pageUrls: ['assets/atlas/bench-x1-0.png'],
      png: [png],
    } as unknown as Parameters<typeof buildBenchSvgPages>[0][number];
    const pages = buildBenchSvgPages([atlas]);
    expect(pages).toHaveLength(1);
    expect(pages[0].file).toBe('bench-x1-0.svg');
    expect(pages[0].pngFile).toBe('bench-x1-0.png');
    expect(pages[0].svg.toString('utf8')).toBe(text);
    expect(pages[0].pngBytes).toBe(png.length);
    expect([pages[0].width, pages[0].height]).toEqual([2, 2]);
    expect([pages[0].paths, pages[0].rects]).toEqual([2, 2]);
  });

  it('reads back only what it wrote', () => {
    const base = emitE3(imageOf(['#ff0000', '#ff0000', '#00ff00', '#12345600'], 2));
    expect(() => parseE3(base)).not.toThrow();
    for (const bad of [
      // An element the emitter never writes (a `<rect>` per pixel is the E1 encoding's shape).
      base.replace('<path', '<rect'),
      // A style attribute: CSS is not part of the arm's Chromium-69 subset.
      base.replace('<path fill', '<path style="fill:red" fill'),
      // A shorthand colour, an upper-case colour, a percentage opacity.
      base.replace('#00ff00', '#0f0'),
      base.replace('#00ff00', '#00FF00'),
      base.replace('d="M0 1', 'fill-opacity="50%" d="M0 1'),
      // A path with a sub-path that is not an axis-aligned rectangle.
      base.replace('h1v1h-1z', 'l1 1'),
      // A root that is not the emitter's: a foreign attribute, a missing `shape-rendering`, another
      // attribute order, a doctype before it, a comment after it.
      base.replace('<svg xmlns', '<svg class="x" xmlns'),
      base.replace(' shape-rendering="crispEdges"', ''),
      base.replace('width="2" height="2"', 'height="2" width="2"'),
      // A root whose size and viewBox disagree (a hand-edited page).
      base.replace('viewBox="0 0 2 2"', 'viewBox="0 0 3 2"'),
      // A document that did not start or end where the emitter puts it.
      base.replace(/^<svg/, '<!DOCTYPE svg><svg'),
      base.replace(/<\/svg>$/, '</svg><!--tail-->'),
      base.replace(' shape-rendering="crispEdges"', ''),
    ]) {
      expect(() => parseE3(bad)).toThrow(/svg page/);
    }
  });

  it('names the pages and the encoding the build and the analyzer read', () => {
    expect(BENCH_SVG_ENCODING).toBe('e3');
    expect([...BENCH_SVG_ENCODINGS]).toEqual(['png', 'e3']);
    expect(SVG_PAGE_EXTENSION).toBe('.svg');
    expect(benchSvgPageFile('bench-x2.67-1.png')).toBe('bench-x2.67-1.svg');
    expect(() => benchSvgPageFile('bench-x2.67-1.svg')).toThrow(RangeError);
    expect(SVG_MIME_TYPE).toBe(SVG_DECODE_MIME);
  });

  it('agrees with the widget’s runtime parser on every accepted value', () => {
    // The build side (`VITE_BENCH_SVG` in the bench config) and the run side (`__SHMUP_BENCH_SVG__`
    // in `main.ts`) are written apart so the bundle stays out of the hashed tree; they must never
    // disagree about what an arm is.
    for (const text of ['', '  ', 'off', 'OFF', 'png', 'PNG', 'e3', 'E3 ']) {
      expect([text, parseBenchSvgEncoding(text)]).toEqual([text, parseBenchSvg(text)]);
    }
    for (const text of ['svg', 'e2', 'E4', 'png8', 'on']) {
      expect(() => parseBenchSvgEncoding(text)).toThrow(/VITE_BENCH_SVG/);
      expect(() => parseBenchSvg(text)).toThrow(/VITE_BENCH_SVG/);
    }
  });

  it('suffixes the build id only in the arm', () => {
    expect(benchSvgIdSuffix('png')).toBe('');
    expect(benchSvgIdSuffix('e3')).toBe('+svg-e3');
    expect(benchBuildId('9e60df2+', null)).toBe('9e60df2+');
    expect(benchBuildId('9e60df2+', null, 'png')).toBe('9e60df2+');
    expect(benchBuildId('9e60df2+', null, 'e3')).toBe('9e60df2++svg-e3');
    expect(benchBuildId('9e60df2+', parseBenchOutput('1280x720'), 'e3')).toBe(
      '9e60df2+@1280x720+svg-e3',
    );
  });

  it('sniffs an SVG page’s bytes the way decode.ts reports them', () => {
    const image = imageOf(['#ff0000', '#00ff00'], 2);
    const svgBytes = new Uint8Array(Buffer.from(emitE3(image), 'utf8'));
    const pngBytes = new Uint8Array(encodePng(image));
    expect(isSvgBytes(svgBytes)).toBe(true);
    expect(isSvgBytes(pngBytes)).toBe(false);
    expect(isSvgBytes(new Uint8Array(0))).toBe(false);
    expect(pageEncodingOf(svgBytes)).toBe(SVG_DECODE_ENCODING);
    expect(pageEncodingOf(pngBytes)).toBe('rgba');
  });
});

/**
 * A pixel buffer as an image (for the canvas-rule case).
 *
 * @param data - Row-major RGBA bytes.
 * @param width - Columns.
 * @returns The image.
 */
function canvasOf(data: number[], width: number): Pixels {
  return { width, height: data.length / (width * 4), data: new Uint8Array(data) };
}

describe('bench-svg: pixel-exact on the shipped pages (re-derived in this repo)', () => {
  /**
   * Bakes the bench's real pages once: every density atlas and the stand-in zone A page.
   *
   * @returns Fills the module-level pages (bakes once; later calls read them).
   */
  function build(): void {
    if (densityPages.length > 0) return;
    const source = benchSourceAtlas();
    const atlases = buildBenchAtlases(source.manifest, source.pngs);
    densityPages = atlases.flatMap((atlas) =>
      atlas.manifest.pages.map((page, index) => ({
        file: page.file,
        png: atlas.png[index],
        image: decodePng(atlas.png[index]),
      })),
    );
    const standin = buildDecodeStandin().pages.find(
      (page: { id: string; png: Buffer }) => page.id === 'standin-zone-a',
    );
    if (standin === undefined) throw new Error('no stand-in page to prove against');
    standinPage = {
      file: decodePageFile('standin-zone-a'),
      png: standin.png,
      image: decodePng(standin.png),
    };
    proof = proveSvgPages({ atlases, standinPages: [standinPage] });
  }

  it('re-rasterises every density page to the PNG page’s own pixels', () => {
    build();
    expect(densityPages.length).toBeGreaterThan(BENCH_DENSITIES.length);
    for (const page of densityPages) {
      const back = rasterE3(emitE3(page.image));
      expect(digestPixels(back), page.file).toBe(digestPixels(page.image));
    }
  }, 600_000);

  it('re-rasterises the stand-in page (57 colours over 2048² of noisy pixel art)', () => {
    build();
    const page = standinPage;
    if (page === null) throw new Error('the shared build() filled no stand-in page');
    expect(digestPixels(rasterE3(emitE3(page.image)))).toBe(digestPixels(page.image));
  }, 600_000);

  it('emits a page from its bytes alone (the route the arm’s stand-in row takes)', () => {
    build();
    if (standinPage === null) throw new Error('the shared build() filled no stand-in page');
    const page = standinPage;
    const rows = emitSvgPages([{ file: page.file, png: page.png }]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    // The file name is the PNG page's own with the SVG extension, and the bytes are what the whole
    // atlas walk writes for that page — the extraction `bench-atlas.mjs` relies on to emit the
    // stand-in E3 beside the density E3 (plan R-SVG WO-2).
    expect(row.pngFile).toBe(page.file);
    expect(row.file).toBe(benchSvgPageFile(page.file));
    expect(row.svg.equals(emitE3Page(page.image))).toBe(true);
    expect(row.width).toBe(page.image.width);
    expect(row.height).toBe(page.image.height);
    expect(row.pngBytes).toBe(page.png.length);
    expect(row.paths).toBeGreaterThan(0);
    expect(row.rects).toBeGreaterThan(0);
    expect(
      buildBenchSvgPages([
        {
          density: 1,
          label: 'x1',
          pageUrls: [page.file],
          manifest: {
            formatVersion: 2,
            pages: [{ file: page.file, w: page.image.width, h: page.image.height }],
            frames: {},
            sprites: {},
            animations: {},
            fonts: {},
          },
          png: [page.png],
        },
      ]),
    ).toEqual([row]);
  }, 600_000);

  it('pins the three proof pages’ digests, censuses and sizes', () => {
    build();
    expect(proof.map((row) => row.name)).toEqual(PROOF_PAGES.map((row) => row.name));
    expect(proof.map((row) => row.exact)).toEqual([true, true, true]);
    expect(proof).toEqual([
      {
        name: 'bench-x1-0',
        width: 1024,
        height: 1024,
        colors: 1573,
        rects: 46197,
        pngBytes: 140589,
        svgBytes: 795275,
        pngDigest: 'b5e7d104d84d20199ab5372d4be03bdcc900793e3d94744f63543f769a83d162',
        svgDigest: 'b5e7d104d84d20199ab5372d4be03bdcc900793e3d94744f63543f769a83d162',
        exact: true,
        sandboxDigestMatch: false,
      },
      {
        name: 'bench-x2.67-1',
        width: 2048,
        height: 1024,
        colors: 914,
        rects: 31046,
        pngBytes: 176305,
        svgBytes: 552767,
        pngDigest: 'ff75af51191c6262614957ce42b86788b01802e485aac7a73b83b622e2e4710a',
        svgDigest: 'ff75af51191c6262614957ce42b86788b01802e485aac7a73b83b622e2e4710a',
        exact: true,
        sandboxDigestMatch: false,
      },
      {
        name: 'decode-standin-zone-a',
        width: 2048,
        height: 1024,
        colors: 57,
        rects: 491202,
        pngBytes: 352677,
        svgBytes: 7911332,
        pngDigest: '78b1cae89c3009c711a029a7c30ff802dca371496db0851d61bc7d6c17fb6dd0',
        svgDigest: '78b1cae89c3009c711a029a7c30ff802dca371496db0851d61bc7d6c17fb6dd0',
        exact: true,
        sandboxDigestMatch: true,
      },
    ]);
  }, 600_000);

  it('agrees with the research lane’s desktop raster where the alpha is binary', () => {
    build();
    // The stand-in page is PNG-8 over an empty background: every pixel is alpha 0 or 255, so the
    // browser's `getImageData` digest and this file's straight-alpha digest are the same number —
    // the cross-check that the two proofs measure the same pixels, not two recipes for one name.
    const standin = proof.find((row) => row.name === 'decode-standin-zone-a');
    if (standin === undefined) throw new Error('no stand-in row in the proof table');
    expect(standin.sandboxDigestMatch).toBe(true);
    expect(standin.pngDigest).toBe(PROOF_PAGES[2].sandboxPngDigest);
    // The two RGBA density pages carry partial alpha (13,779 pixels on the ×1 page), and a
    // browser's raster rounds those bytes through premultiplication. Their digests therefore do
    // differ from the desktop table's while their pixels do not — the sandbox column is evidence
    // for a human, never a pin.
    const page = densityPages.find((entry) => entry.file === 'bench-x1-0.png');
    if (page === undefined) throw new Error('no bench-x1-0.png among the baked pages');
    const alphas = [...alphasOf(page.image)];
    expect(alphas.filter((a) => a > 0 && a < 255).length).toBeGreaterThan(0);
    expect(proof[0].sandboxDigestMatch).toBe(false);
    expect(proof[0].exact).toBe(true);
  }, 600_000);

  it('writes byte-identical pages over a second, independent build', () => {
    build();
    // Re-running the pipeline from scratch (a fresh source atlas, a fresh pack) reproduces every
    // page text byte for byte — the same law the procedural generators are under.
    const source = benchSourceAtlas();
    const again = buildBenchAtlases(source.manifest, source.pngs, [1, 2.67]);
    const first = buildBenchSvgPages(again);
    expect(first.map((page: { file: string }) => page.file)).toEqual([
      'bench-x1-0.svg',
      'bench-x2.67-0.svg',
      'bench-x2.67-1.svg',
    ]);
    const baked = new Map(densityPages.map((page) => [page.file, page]));
    for (const page of first) {
      const original = baked.get(page.pngFile);
      if (original === undefined) throw new Error(`${page.pngFile} is not a baked page`);
      expect(page.svg.toString('utf8')).toBe(emitE3(original.image));
    }
  }, 600_000);
});
