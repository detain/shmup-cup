/**
 * `scripts/bench-atlas.mjs` (plan R0-02): the TV render bench's density atlases — the real atlas's
 * art upscaled ×s with nearest-neighbour into the bench's own output, never into the game's atlas:
 * the scaling of pixels, extrusion, anchors and font metrics on a tiny fixture, the page model
 * (1, 1, 2 pages for today's art) and density 1 kept byte for byte.
 *
 * Since R1-05 the game's atlas is split into zone pages; the bench is built from the **ungrouped
 * re-pack** of the same art (`benchSourceAtlas`, one page — the game's atlas before the split), so
 * its page counts and R0-02's runs stay comparable. Since R2-01 that art is the v1 art at scale 1
 * (decision W4-6) whatever the game ships, so the comparison is with `buildAtlas({ artScale: 1 })`.
 * Checked here: the source holds every frame of the v1 game atlas with the same pixels, in one
 * page.
 */
import { describe, expect, it } from 'vitest';
import {
  BENCH_ATLAS_DIR,
  BENCH_DENSITIES,
  BENCH_MODULE_ID,
  benchPageCount,
  benchPageFile,
  benchSourceAtlas,
  buildBenchAtlases,
  densityLabel,
  readFxFiles,
  scaleAtlas,
  scaledSize,
  shmupRenderBench,
} from '../../scripts/bench-atlas.mjs';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { decodePng } from '../../../../scripts/assets/png.mjs';
import { shippedAtlas } from '../bench/shipped-atlas.js';

/** The bench's source atlas (the shipped art, ungrouped), built in memory. */
const shipped = shippedAtlas();
const shippedManifest = shipped.manifest;
const shippedPng = shipped.pngs[0];

/**
 * A 4×2 page: frame `a` is the 2×2 left half (red, green / blue, white), frame `b` the 2×2 right
 * half (all yellow, half transparent).
 *
 * @returns The page image.
 */
function fixturePage(): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(4 * 2 * 4);
  const put = (x: number, y: number, rgba: number[]): void => {
    data.set(rgba, (y * 4 + x) * 4);
  };
  put(0, 0, [255, 0, 0, 255]);
  put(1, 0, [0, 255, 0, 255]);
  put(0, 1, [0, 0, 255, 255]);
  put(1, 1, [255, 255, 255, 255]);
  for (const [x, y] of [
    [2, 0],
    [3, 0],
    [2, 1],
    [3, 1],
  ]) {
    put(x, y, [255, 255, 0, 128]);
  }
  return { width: 4, height: 2, data };
}

/** The fixture's manifest. */
const FIXTURE = {
  formatVersion: 1,
  pages: [{ file: 'main.png', w: 4, h: 2 }],
  frames: {
    'a#0': { p: 0, x: 0, y: 0, w: 2, h: 2, ax: 1, ay: 1 },
    'b#0': { p: 0, x: 2, y: 0, w: 2, h: 2, ax: 0, ay: 1 },
  },
  sprites: { a: { frames: ['a#0'], flash: null }, b: { frames: ['b#0'], flash: null } },
  animations: {},
  fonts: {
    pixel: {
      sprite: 'font/pixel',
      lineHeight: 10,
      cellWidth: 6,
      cellHeight: 8,
      glyphs: { '65': { frame: 'a#0', advance: 6 } },
    },
  },
};

/**
 * One pixel of an image.
 *
 * @param image - The image.
 * @param x - Column.
 * @param y - Row.
 * @returns RGBA.
 */
function pixel(image: { width: number; data: Uint8Array }, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  return Array.from(image.data.slice(at, at + 4));
}

describe('bench-atlas names and sizes', () => {
  it('scales lengths to whole pixels, never below one', () => {
    // The matrix's list exactly (`src/bench/matrix.ts` — pinned against it in bench.test.ts).
    expect(BENCH_DENSITIES).toEqual([1, 1.33, 1.5, 2, 2.25, 2.4, 2.5, 2.67]);
    expect([
      scaledSize(8, 1.5),
      scaledSize(8, 2.25),
      scaledSize(6, 2.25),
      scaledSize(0, 2),
    ]).toEqual([12, 18, 14, 1]);
    expect(densityLabel(2.25)).toBe('x2.25');
    expect(benchPageFile(1.5, 0)).toBe('bench-x1.5-0.png');
    expect(BENCH_ATLAS_DIR).toBe('assets/atlas');
    expect(BENCH_MODULE_ID).toBe('virtual:shmup-render-bench');
  });

  it('models a ×s atlas as the real pages ×s² over 2048² pages: one up to ×2, then two', () => {
    expect(BENCH_DENSITIES.map((s) => benchPageCount(shippedManifest, s))).toEqual([
      1, 1, 1, 1, 2, 2, 2, 2,
    ]);
    expect(benchPageCount(FIXTURE, 1)).toBe(1);
    expect(benchPageCount({ pages: [{ w: 2048, h: 2048 }] } as never, 1)).toBe(1);
    expect(benchPageCount({ pages: [{ w: 2048, h: 2048 }] } as never, 1.01)).toBe(2);
  });
});

describe('bench-atlas scaleAtlas', () => {
  it('scales every frame nearest-neighbour, with its edge pixels extruded', () => {
    const { manifest, pages } = scaleAtlas(FIXTURE, [fixturePage()], 1.5);
    expect(pages).toHaveLength(1);
    const a = manifest.frames['a#0'];
    expect([a.w, a.h, a.ax, a.ay]).toEqual([3, 3, 2, 2]);
    const page = pages[0];
    // 2 → 3 pixels: source columns 0, 0, 1 and rows 0, 0, 1.
    expect(pixel(page, a.x, a.y)).toEqual([255, 0, 0, 255]);
    expect(pixel(page, a.x + 1, a.y)).toEqual([255, 0, 0, 255]);
    expect(pixel(page, a.x + 2, a.y)).toEqual([0, 255, 0, 255]);
    expect(pixel(page, a.x + 2, a.y + 2)).toEqual([255, 255, 255, 255]);
    expect(pixel(page, a.x, a.y + 2)).toEqual([0, 0, 255, 255]);
    // The 1-px extrusion repeats the edges (the pipeline's own rule).
    expect(pixel(page, a.x - 1, a.y - 1)).toEqual([255, 0, 0, 255]);
    expect(pixel(page, a.x + 3, a.y + 3)).toEqual([255, 255, 255, 255]);
    const b = manifest.frames['b#0'];
    expect(pixel(page, b.x + 1, b.y + 1)).toEqual([255, 255, 0, 128]);
    expect([b.ax, b.ay]).toEqual([0, 2]);
  });

  it('scales the bitmap font’s metrics with its glyphs and keeps sprites and animations', () => {
    const { manifest } = scaleAtlas(FIXTURE, [fixturePage()], 2.25);
    expect(manifest.fonts.pixel).toEqual({
      sprite: 'font/pixel',
      lineHeight: 23,
      cellWidth: 14,
      cellHeight: 18,
      glyphs: { '65': { frame: 'a#0', advance: 14 } },
    });
    expect(manifest.sprites).toBe(FIXTURE.sprites);
    expect(Object.keys(manifest.frames)).toEqual(['a#0', 'b#0']);
    expect(manifest.pages[0].file).toBe('bench-x2.25-0.png');
  });

  it('rejects a density that is not a positive number', () => {
    expect(() => scaleAtlas(FIXTURE, [fixturePage()], 0)).toThrow(RangeError);
    expect(() => scaleAtlas(FIXTURE, [fixturePage()], Number.NaN)).toThrow(RangeError);
  });
});

describe('bench-atlas on the shipped atlas', () => {
  const atlases = buildBenchAtlases(shippedManifest, shipped.pngs);

  it('builds one atlas per density with one or two power-of-two pages of at most 2048²', () => {
    expect(atlases.map((atlas) => atlas.density)).toEqual([1, 1.33, 1.5, 2, 2.25, 2.4, 2.5, 2.67]);
    expect(
      atlases.map((atlas) => atlas.manifest.pages.map((page) => `${page.w}x${page.h}`)),
    ).toEqual([
      ['1024x1024'],
      // The ×1.33 page re-packed back to 2048×1024 (owner 2026-10-26, w15-C LAND): the w15-WB
      // option silhouettes had tipped it to 512×2048 (add6f1fa, w15-FIX-BENCH) and the w15-C
      // item frames (+34 ungrouped frames: the flavored pills' 4-frame cycle and the crates'
      // 6-stage shimmer) moved the re-pack's row layout back to the wide page. Area-neutral —
      // still 1,048,576 px — and every other density page stands. Re-pinned to the measured
      // build, not raised (the same shared-kit gate R5-10.T3 wrote).
      ['2048x1024'],
      ['2048x1024'],
      ['2048x2048'],
      ['2048x1024', '2048x1024'],
      ['2048x1024', '2048x1024'],
      ['2048x1024', '2048x1024'],
      ['2048x1024', '2048x1024'],
    ]);
    for (const atlas of atlases) {
      expect(atlas.pageUrls).toEqual(
        atlas.manifest.pages.map((page) => `assets/atlas/${page.file}`),
      );
      expect(atlas.png).toHaveLength(atlas.manifest.pages.length);
      atlas.manifest.pages.forEach((page, index) => {
        expect(page.w).toBeLessThanOrEqual(2048);
        expect(page.h).toBeLessThanOrEqual(2048);
        expect(page.w & (page.w - 1)).toBe(0);
        expect(page.h & (page.h - 1)).toBe(0);
        const decoded = decodePng(atlas.png[index]);
        expect([decoded.width, decoded.height]).toEqual([page.w, page.h]);
      });
    }
  });

  it('keeps density 1 as the ungrouped one-page atlas, byte for byte', () => {
    expect(Buffer.compare(atlases[0].png[0], shippedPng)).toBe(0);
    expect(atlases[0].manifest.frames).toEqual(shippedManifest.frames);
    expect(atlases[0].manifest.pages[0].file).toBe('bench-x1-0.png');
  });

  it('scales every frame of the shipped atlas, and splits ×2.25 … ×2.67 over both pages', () => {
    const names = Object.keys(shippedManifest.frames);
    for (const atlas of atlases.slice(1)) {
      expect(Object.keys(atlas.manifest.frames)).toEqual(names);
      for (const name of names) {
        const source = shippedManifest.frames[name];
        const frame = atlas.manifest.frames[name];
        expect([frame.w, frame.h]).toEqual([
          scaledSize(source.w, atlas.density),
          scaledSize(source.h, atlas.density),
        ]);
        const page = atlas.manifest.pages[frame.p];
        expect(frame.x + frame.w).toBeLessThanOrEqual(page.w);
        expect(frame.y + frame.h).toBeLessThanOrEqual(page.h);
      }
    }
    for (const atlas of atlases.filter((candidate) => candidate.density > 2)) {
      const pagesUsed = new Set(Object.values(atlas.manifest.frames).map((frame) => frame.p));
      expect([...pagesUsed].sort(), `x${atlas.density}`).toEqual([0, 1]);
    }
  });
});

describe('bench-atlas source: the ungrouped re-pack of the zone-split game atlas (R1-05)', () => {
  // The v1 art (R2-01, W4-6): the bench keeps it at either frame, so compare with it.
  const game = buildAtlas({ artScale: 1 });

  it('is one page while the game ships common + zone pages', () => {
    expect(shippedManifest.pages).toHaveLength(1);
    expect(shipped.pngs).toHaveLength(1);
    expect(game.manifest.pages.length).toBeGreaterThan(1);
    expect(game.manifest.pages[0].group).toBe('common');
  });

  it('holds every frame of the game atlas, pixel for pixel, with the same sizes and anchors', () => {
    const page = decodePng(shippedPng);
    const gamePages = game.pages.map((p) => p.image);
    expect(Object.keys(shippedManifest.frames).sort()).toEqual(
      Object.keys(game.manifest.frames).sort(),
    );
    for (const [name, f] of Object.entries(game.manifest.frames)) {
      const b = shippedManifest.frames[name];
      expect([b.w, b.h, b.ax, b.ay], name).toEqual([f.w, f.h, f.ax, f.ay]);
      const source = gamePages[f.p];
      for (let y = 0; y < f.h; y++) {
        const at = ((f.y + y) * source.width + f.x) * 4;
        const bt = ((b.y + y) * page.width + b.x) * 4;
        const row = Buffer.from(source.data.subarray(at, at + f.w * 4));
        expect(row.equals(Buffer.from(page.data.subarray(bt, bt + f.w * 4))), name).toBe(true);
      }
    }
    expect(shippedManifest.sprites).toEqual(game.manifest.sprites);
    expect(shippedManifest.fonts).toEqual(game.manifest.fonts);
  });

  it('is built fresh by benchSourceAtlas() with the same bytes', () => {
    const again = benchSourceAtlas();
    expect(Buffer.compare(again.pngs[0], shippedPng)).toBe(0);
  });
});

describe('bench-atlas plugin and particle presets', () => {
  it('reads the shipped particle presets, examples left out', () => {
    const files = readFxFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file.path).toMatch(/^fx\/[a-z0-9-]+\.fx\.json$/);
      expect(file.path).not.toContain('example');
      expect((file.data as { kind?: string }).kind).toBe('fx');
    }
  });

  it('serves the virtual module with every density and the presets', () => {
    const plugin = shmupRenderBench() as unknown as {
      name: string;
      resolveId: (id: string) => string | null;
      load: (id: string) => string | null;
    };
    expect(plugin.name).toBe('shmup:render-bench');
    const resolved = plugin.resolveId(BENCH_MODULE_ID);
    expect(resolved).toBe('\0' + BENCH_MODULE_ID);
    expect(plugin.resolveId('virtual:shmup-assets')).toBeNull();
    expect(plugin.load('other')).toBeNull();
    const source = plugin.load(resolved as string) as string;
    expect(source).toContain('export const atlases = [');
    expect(source).toContain('export const fx = [');
    expect(source).toContain(
      '"pageUrls":["assets/atlas/bench-x2.25-0.png","assets/atlas/bench-x2.25-1.png"]',
    );
    // The decode scenario's pages (plan R1-05 B4; stand-in pages since R3-04.M4a), in the order it
    // measures them, and the manifest of the run's last page load.
    expect(source).toContain('export const decode = [{"id":"standin-zone-a",');
    expect(source).toContain('"url":"assets/atlas/decode-zone-a.png"');
    expect(source).toContain('export const standin = {"manifest":{"formatVersion":2,');
    expect(source).toContain('"pageUrls":["assets/atlas/decode-standin-zone-a.png"]');
    // The decode scenario's video clips (plan v20x HARBENCH S8): the four shipped names, the codec
    // frame, URLs under the video dir the `shmupVideos` plugin emits into.
    expect(source).toContain(
      '{"id":"attract-ambient","what":"Attract loop ambient clip","width":640,"height":360,' +
        '"url":"assets/video/attract-ambient.mp4"}',
    );
    expect(source).toContain('{"id":"ark-sailing"');
    expect(source).toContain(
      'export default { atlases, fx, decode, standin, standinSvg, videos, svgProbes };',
    );
  }, 60_000);

  it('ships no SVG rows in the PNG arm (plan R-SVG WO-2: the PNG matrix stays byte-pure)', () => {
    const plugin = shmupRenderBench() as unknown as {
      resolveId: (id: string) => string | null;
      load: (id: string) => string | null;
    };
    const source = plugin.load(plugin.resolveId(BENCH_MODULE_ID) as string) as string;
    // The arm's stand-in load has no atlas to draw and its probe rows no files to name…
    expect(source).toContain('export const standinSvg = null;');
    expect(source).toContain('export const svgProbes = [];');
    // …and the `decode` list is exactly the three stand-in/PNG pages it measured before the arm:
    // no `.svg` file, and the E3 ids appear nowhere in a PNG build's module.
    expect(source).not.toContain('.svg');
    expect(source).not.toContain('svg-x1-e3');
    expect(source).not.toContain('svg-standin-e3');
    const decode = JSON.parse(source.slice(decodeStart(source), decodeEnd(source))) as Array<{
      id: string;
    }>;
    expect(decode.map((page) => page.id)).toEqual(['standin-zone-a', 'common', 'zone-a']);
  }, 60_000);

  it('adds the five E3 rows and the stand-in E3 atlas when armed (plan R-SVG WO-2)', () => {
    const plugin = shmupRenderBench({ svgEnc: 'e3' }) as unknown as {
      resolveId: (id: string) => string | null;
      load: (id: string) => string | null;
    };
    const source = plugin.load(plugin.resolveId(BENCH_MODULE_ID) as string) as string;
    const decode = JSON.parse(source.slice(decodeStart(source), decodeEnd(source))) as Array<{
      id: string;
      url: string;
      what: string;
      width: number;
    }>;
    // The three file rows ride the PNG pages' own list, in §C.5's order: the ×1 page (parse-bound),
    // the ×2.67 page (the wire case) and the stand-in page (worst element count).
    expect(decode.map((page) => page.id)).toEqual([
      'standin-zone-a',
      'common',
      'zone-a',
      'svg-x1-e3',
      'svg-x2.67-e3',
      'svg-standin-e3',
    ]);
    expect(decode[3].url).toBe('assets/atlas/bench-x1-0.svg');
    expect(decode[4].url).toBe('assets/atlas/bench-x2.67-1.svg');
    expect(decode[5].url).toBe('assets/atlas/decode-standin-zone-a.svg');
    // Each row's `what` names the file and its element census, so a table line says what was paid.
    expect(decode[3].what).toMatch(/^E3 of the x1 density page .*bench-x1-0\.svg: \d+ paths/);
    // The two probe rows name the same ×1 page (the most colours, the most representative parse).
    const probes = JSON.parse(source.slice(probeStart(source), probeEnd(source))) as Array<{
      id: string;
      probe: string;
      url: string;
      width: number;
      what: string;
    }>;
    expect(probes.map((row) => row.id)).toEqual(['svg-bitmap-reject', 'svg-teximage-from-img']);
    expect(probes.map((row) => row.probe)).toEqual(['bitmap-reject', 'url-upload']);
    expect(probes[0].url).toBe('assets/atlas/bench-x1-0.svg');
    expect(probes[0].width).toBe(1024);
    // And the arm's stand-in load: the same manifest, its pages flipped to the E3 files.
    expect(source).toContain('"pageUrls":["assets/atlas/decode-standin-zone-a.svg"]');
    expect(source).toContain('export const standinSvg = {"manifest":{"formatVersion":2,');
  }, 120_000);
});

/**
 * Where the module text's `decode` array begins and ends (its JSON is one line).
 *
 * @param source - The virtual module's text.
 * @returns The offsets of the array's brackets, `start` inclusive, `end` one past it.
 */
function decodeStart(source: string): number {
  return source.indexOf('export const decode = ') + 'export const decode = '.length;
}

/**
 * @param source - The virtual module's text.
 * @returns One past the `decode` array's closing bracket.
 */
function decodeEnd(source: string): number {
  return source.indexOf('];\nexport const standin ', decodeStart(source)) + 1;
}

/**
 * @param source - The virtual module's text.
 * @returns The start of the `svgProbes` array's JSON.
 */
function probeStart(source: string): number {
  return source.indexOf('export const svgProbes = ') + 'export const svgProbes = '.length;
}

/**
 * @param source - The virtual module's text.
 * @returns One past the `svgProbes` array's closing bracket.
 */
function probeEnd(source: string): number {
  const start = probeStart(source);
  return source.indexOf('];', start) + 1;
}
