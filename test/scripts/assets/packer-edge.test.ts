/**
 * `scripts/assets/packer.mjs` edge cases: option validation, the page-size choice
 * (smallest area, then squarer, then wider), exact-fit boundaries for every
 * padding/extrusion combination, input immutability, spill behaviour, and a seeded fuzz
 * over item mixes and settings that checks the invariants the atlas relies on.
 */
import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE, packRects, type PackItem } from '../../../scripts/assets/packer.mjs';
import { createAssetRng } from '../../../scripts/assets/rng.mjs';

/**
 * Asserts the packing invariants (placements on their page with the extrusion border,
 * cells incl. padding disjoint, power-of-two pages within the limit, every page used).
 *
 * @param items - Input.
 * @param result - Packing.
 * @param options - Settings used.
 * @param options.padding - Padding.
 * @param options.extrude - Extrusion.
 * @param options.maxSize - Page limit.
 */
function expectValid(
  items: readonly PackItem[],
  result: ReturnType<typeof packRects>,
  { padding = 1, extrude = 1, maxSize = MAX_PAGE_SIZE } = {},
): void {
  expect(result.placements).toHaveLength(items.length);
  for (const page of result.pages) {
    for (const side of [page.w, page.h]) {
      expect(side & (side - 1)).toBe(0);
      expect(side).toBeLessThanOrEqual(maxSize);
    }
  }
  const used = new Set<number>();
  result.placements.forEach((p, i) => {
    expect(p).toEqual({
      name: items[i].name,
      p: p.p,
      x: p.x,
      y: p.y,
      w: items[i].w,
      h: items[i].h,
    });
    expect(Number.isInteger(p.p) && p.p >= 0 && p.p < result.pages.length).toBe(true);
    used.add(p.p);
    const page = result.pages[p.p];
    expect(p.x - extrude).toBeGreaterThanOrEqual(0);
    expect(p.y - extrude).toBeGreaterThanOrEqual(0);
    expect(p.x + p.w + extrude).toBeLessThanOrEqual(page.w);
    expect(p.y + p.h + extrude).toBeLessThanOrEqual(page.h);
  });
  expect(used.size).toBe(result.pages.length); // no empty page
  const byPage = new Map<number, { x0: number; y0: number; x1: number; y1: number }[]>();
  for (const p of result.placements) {
    const cells = byPage.get(p.p) ?? [];
    cells.push({
      x0: p.x - extrude,
      y0: p.y - extrude,
      x1: p.x + p.w + extrude + padding,
      y1: p.y + p.h + extrude + padding,
    });
    byPage.set(p.p, cells);
  }
  for (const cells of byPage.values()) {
    cells.sort((a, b) => a.x0 - b.x0);
    for (let a = 0; a < cells.length; a++) {
      for (let b = a + 1; b < cells.length && cells[b].x0 < cells[a].x1; b++) {
        const A = cells[a];
        const B = cells[b];
        expect(A.y0 < B.y1 && B.y0 < A.y1, 'cells overlap').toBe(false);
      }
    }
  }
}

describe('scripts/assets/packer — options (edge)', () => {
  it.each([
    ['maxSize 0', { maxSize: 0 }],
    ['maxSize 100', { maxSize: 100 }],
    ['maxSize 2.5', { maxSize: 2.5 }],
    ['minSize 48', { minSize: 48 }],
    ['minSize 0', { minSize: 0 }],
    ['fractional padding', { padding: 0.5 }],
    ['negative extrude', { extrude: -1 }],
    ['fractional extrude', { extrude: 1.5 }],
  ])('rejects %s', (_label, options) => {
    expect(() => packRects([{ name: 'a', w: 1, h: 1 }], options)).toThrow(RangeError);
  });

  it('clamps minSize to maxSize instead of failing', () => {
    expect(packRects([{ name: 'a', w: 2, h: 2 }], { maxSize: 32, minSize: 64 }).pages).toEqual([
      { w: 32, h: 32 },
    ]);
  });

  it('starts at minSize: the smallest page is never below it', () => {
    expect(packRects([{ name: 'a', w: 1, h: 1 }]).pages).toEqual([{ w: 64, h: 64 }]);
    expect(packRects([{ name: 'a', w: 1, h: 1 }], { minSize: 1 }).pages).toEqual([{ w: 4, h: 4 }]);
    expect(packRects([{ name: 'a', w: 1, h: 1 }], { minSize: 256 }).pages).toEqual([
      { w: 256, h: 256 },
    ]);
  });

  it.each([
    ['negative width', { name: 'a', w: -3, h: 2 }],
    ['NaN height', { name: 'a', w: 3, h: Number.NaN }],
    ['infinite width', { name: 'a', w: Number.POSITIVE_INFINITY, h: 2 }],
  ])('names the item with an invalid size (%s)', (_label, item) => {
    expect(() => packRects([item])).toThrow(`item "a" has an invalid size`);
  });

  it('names the duplicate and the item that cannot fit', () => {
    expect(() =>
      packRects([
        { name: 'x', w: 1, h: 1 },
        { name: 'x', w: 1, h: 1 },
      ]),
    ).toThrow('duplicate item "x"');
    expect(() => packRects([{ name: 'huge', w: 10, h: 63 }], { maxSize: 64 })).toThrow(
      'item "huge" (10×63 + border) does not fit a 64² page',
    );
  });
});

describe('scripts/assets/packer — page choice and exact fits (edge)', () => {
  it.each([
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [3, 2],
  ])('fits a frame of maxSize − 2·extrude exactly (padding %i, extrude %i)', (padding, extrude) => {
    const side = 64 - 2 * extrude;
    const result = packRects([{ name: 'a', w: side, h: side }], { maxSize: 64, padding, extrude });
    expect(result.pages).toEqual([{ w: 64, h: 64 }]);
    expect(result.placements[0]).toMatchObject({ x: extrude, y: extrude });
    expect(() =>
      packRects([{ name: 'a', w: side + 1, h: side }], { maxSize: 64, padding, extrude }),
    ).toThrow(RangeError);
  });

  it('grows to the smallest page area, preferring the wider page for wide content', () => {
    expect(packRects([{ name: 'a', w: 100, h: 10 }]).pages).toEqual([{ w: 128, h: 64 }]);
    expect(packRects([{ name: 'a', w: 10, h: 100 }]).pages).toEqual([{ w: 64, h: 128 }]);
    expect(packRects([{ name: 'a', w: 62, h: 62 }]).pages).toEqual([{ w: 64, h: 64 }]);
    expect(packRects([{ name: 'a', w: 63, h: 62 }]).pages).toEqual([{ w: 128, h: 64 }]);
  });

  it('breaks equal-area ties: square first, then the wider page', () => {
    // 30×30 frames take 33-px cells: 3×3 fit 128², 7×3 fit 256×128, 7×7 fit 256², 15×3 fit
    // 512×128. 20 frames → 256×128 (wider than 128×256, same area); 40 frames → 256²
    // (square), although 512×128 of the same area would hold them too.
    const tiles = (n: number): PackItem[] =>
      Array.from({ length: n }, (_, i) => ({ name: `t${i}`, w: 30, h: 30 }));
    expect(packRects(tiles(20)).pages).toEqual([{ w: 256, h: 128 }]);
    expect(packRects(tiles(40)).pages).toEqual([{ w: 256, h: 256 }]);
  });

  it('uses padding only between cells: it may hang off the right and bottom page edges', () => {
    // 29 + 30 px frames, each with a 1-px border, plus 1 px padding between: 31 + 1 + 32 = 64.
    const fits = [
      { name: 'a', w: 29, h: 62 },
      { name: 'b', w: 30, h: 62 },
    ];
    const result = packRects(fits, { maxSize: 64 });
    expect(result.pages).toEqual([{ w: 64, h: 64 }]);
    expectValid(fits, result, { maxSize: 64 });
    // One pixel more and the padding between them no longer fits: a second page.
    const tooWide = [
      { name: 'a', w: 30, h: 62 },
      { name: 'b', w: 30, h: 62 },
    ];
    expect(packRects(tooWide, { maxSize: 64 }).pages).toHaveLength(2);
    // Without padding the same two frames share the page.
    expect(packRects(tooWide, { maxSize: 64, padding: 0 }).pages).toHaveLength(1);
  });

  it('packs a single 1×1 pixel with its border (the ui/pixel case)', () => {
    const result = packRects([{ name: 'px', w: 1, h: 1 }], { minSize: 1 });
    expect(result.placements[0]).toEqual({ name: 'px', p: 0, x: 1, y: 1, w: 1, h: 1 });
    expect(result.pages[0].w).toBeGreaterThanOrEqual(3);
  });

  it('never mutates its input', () => {
    const items = [
      { name: 'b', w: 5, h: 9 },
      { name: 'a', w: 12, h: 3 },
    ];
    const copy = JSON.parse(JSON.stringify(items)) as typeof items;
    packRects(items);
    expect(items).toEqual(copy);
  });
});

describe('scripts/assets/packer — spilling (edge)', () => {
  it('fills a full page, then starts the next one; every item lands exactly once', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ name: `big-${i}`, w: 62, h: 62 }));
    const result = packRects(items, { maxSize: 64 });
    expect(result.pages).toEqual(Array(5).fill({ w: 64, h: 64 }));
    expect(result.placements.map((p) => p.p).sort()).toEqual([0, 1, 2, 3, 4]);
    expectValid(items, result, { maxSize: 64 });
  });

  it('shrinks the last page to what is left over', () => {
    const items = [
      { name: 'big', w: 126, h: 126 },
      { name: 'small', w: 4, h: 4 },
    ];
    const result = packRects(items, { maxSize: 128 });
    expect(result.pages).toEqual([
      { w: 128, h: 128 },
      { w: 64, h: 64 },
    ]);
    expect(result.placements.map((p) => p.p)).toEqual([0, 1]);
  });

  it('places items that fit into the leftovers of the first page before spilling', () => {
    const items = [
      { name: 'wide', w: 126, h: 60 },
      { name: 'tall', w: 126, h: 70 },
      { name: 'dot', w: 2, h: 2 },
    ];
    const result = packRects(items, { maxSize: 128 });
    expectValid(items, result, { maxSize: 128 });
    expect(result.pages).toHaveLength(2);
    expect(result.placements.find((p) => p.name === 'dot')?.p).toBe(0);
  });
});

describe('scripts/assets/packer — seeded fuzz', () => {
  it.each(Array.from({ length: 24 }, (_, seed) => [seed]))(
    'keeps every invariant (seed %i)',
    (seed) => {
      const rng = createAssetRng(1000 + seed);
      const padding = rng.rangeInt(0, 3);
      const extrude = rng.rangeInt(0, 2);
      const maxSize = [64, 128, 256, 512][rng.rangeInt(0, 3)];
      const limit = maxSize - 2 * extrude;
      const count = rng.rangeInt(1, 150);
      const items: PackItem[] = Array.from({ length: count }, (_, i) => {
        const shape = rng.rangeInt(0, 3);
        const long = rng.rangeInt(1, Math.min(limit, 80));
        const short = rng.rangeInt(1, 8);
        return {
          name: `n${(i * 7919) % 1000}-${i}`,
          w: shape === 0 ? long : shape === 1 ? short : rng.rangeInt(1, Math.min(limit, 40)),
          h: shape === 0 ? short : shape === 1 ? long : rng.rangeInt(1, Math.min(limit, 40)),
        };
      });
      const options = { padding, extrude, maxSize };
      const result = packRects(items, options);
      expectValid(items, result, options);
      // Same layout for a shuffled input.
      const shuffled = items.slice().sort((a, b) => (a.name < b.name ? 1 : -1));
      const again = packRects(shuffled, options);
      expect(again.pages).toEqual(result.pages);
      const byName = new Map(again.placements.map((p) => [p.name, p]));
      for (const p of result.placements) expect(byName.get(p.name)).toEqual(p);
      // Only the last page may be smaller than maxSize² (earlier pages spilled when full).
      result.pages.slice(0, -1).forEach((page) => expect(page).toEqual({ w: maxSize, h: maxSize }));
    },
  );
});
