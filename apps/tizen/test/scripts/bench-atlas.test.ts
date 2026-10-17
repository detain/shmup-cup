/**
 * `scripts/bench-atlas.mjs` (plan R0-02): the TV render bench's density atlases — the real atlas
 * upscaled ×s with nearest-neighbour into the bench's own output, never into the game's atlas: the
 * scaling of pixels, extrusion, anchors and font metrics on a tiny fixture, the page model
 * (1, 1, 2 pages for today's atlas) and the shipped density 1 kept byte for byte.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BENCH_ATLAS_DIR,
  BENCH_DENSITIES,
  BENCH_MODULE_ID,
  benchPageCount,
  benchPageFile,
  buildBenchAtlases,
  densityLabel,
  readFxFiles,
  scaleAtlas,
  scaledSize,
  shmupRenderBench,
} from '../../scripts/bench-atlas.mjs';
import { decodePng } from '../../../../scripts/assets/png.mjs';

/** The shipped atlas (`pnpm assets`). */
const ATLAS_DIR = new URL('../../../../assets/generated/atlas/', import.meta.url);
const shippedManifest = JSON.parse(
  readFileSync(new URL('main.json', ATLAS_DIR), 'utf8'),
) as Parameters<typeof scaleAtlas>[0];
const shippedPng = readFileSync(new URL('main.png', ATLAS_DIR));

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
    expect(BENCH_DENSITIES).toEqual([1, 1.5, 2.25]);
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

  it('models a ×s atlas as the real pages ×s² over 2048² pages: 1, 1 and 2 today', () => {
    expect(BENCH_DENSITIES.map((s) => benchPageCount(shippedManifest, s))).toEqual([1, 1, 2]);
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
  const atlases = buildBenchAtlases(shippedManifest, [shippedPng]);

  it('builds one atlas per density with 1, 1 and 2 power-of-two pages of at most 2048²', () => {
    expect(atlases.map((atlas) => atlas.density)).toEqual([1, 1.5, 2.25]);
    expect(atlases.map((atlas) => atlas.manifest.pages.length)).toEqual([1, 1, 2]);
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

  it('keeps density 1 as the shipped page, byte for byte', () => {
    expect(Buffer.compare(atlases[0].png[0], shippedPng)).toBe(0);
    expect(atlases[0].manifest.frames).toEqual(shippedManifest.frames);
    expect(atlases[0].manifest.pages[0].file).toBe('bench-x1-0.png');
  });

  it('scales every frame of the shipped atlas, and splits ×2.25 over both pages', () => {
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
    const pagesUsed = new Set(Object.values(atlases[2].manifest.frames).map((frame) => frame.p));
    expect([...pagesUsed].sort()).toEqual([0, 1]);
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
    const plugin = shmupRenderBench() as {
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
  }, 60_000);
});
