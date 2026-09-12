/**
 * `scripts/assets/packer.mjs` — the deterministic MaxRects atlas packer.
 *
 * Acceptance (M1-03): frames never overlap (including their extrusion border and the
 * padding between cells), pages respect the 2048² limit (power-of-two sizes), and the
 * layout is deterministic.
 */
import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE, packRects, type PackItem } from '../../../scripts/assets/packer.mjs';
import { createAssetRng } from '../../../scripts/assets/rng.mjs';

/**
 * Random items of assorted sizes.
 *
 * @param count - How many.
 * @param seed - RNG seed.
 * @param max - Largest side.
 * @returns The items.
 */
function randomItems(count: number, seed: number, max = 48): PackItem[] {
  const rng = createAssetRng(seed);
  return Array.from({ length: count }, (_, i) => ({
    name: `item-${i}`,
    w: rng.rangeInt(1, max),
    h: rng.rangeInt(1, max),
  }));
}

/**
 * Asserts the packing invariants: every placement lies on its page with its extrusion
 * border, and no two cells (frame + border + padding) overlap.
 *
 * @param items - The input.
 * @param result - The packing.
 * @param padding - Padding used.
 * @param extrude - Extrusion used.
 */
function expectValid(
  items: readonly PackItem[],
  result: ReturnType<typeof packRects>,
  padding = 1,
  extrude = 1,
): void {
  expect(result.placements).toHaveLength(items.length);
  for (const page of result.pages) {
    for (const side of [page.w, page.h]) {
      expect(side & (side - 1), `power of two: ${side}`).toBe(0);
      expect(side).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    }
  }
  result.placements.forEach((p, i) => {
    expect(p.name).toBe(items[i].name);
    expect(p.w).toBe(items[i].w);
    expect(p.h).toBe(items[i].h);
    const page = result.pages[p.p];
    expect(p.x - extrude).toBeGreaterThanOrEqual(0);
    expect(p.y - extrude).toBeGreaterThanOrEqual(0);
    expect(p.x + p.w + extrude).toBeLessThanOrEqual(page.w);
    expect(p.y + p.h + extrude).toBeLessThanOrEqual(page.h);
  });
  // Cells grown by the border and by the padding must be disjoint.
  const cells = result.placements.map((p) => ({
    p: p.p,
    x0: p.x - extrude,
    y0: p.y - extrude,
    x1: p.x + p.w + extrude + padding,
    y1: p.y + p.h + extrude + padding,
  }));
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      const A = cells[a];
      const B = cells[b];
      if (A.p !== B.p) continue;
      const overlap = A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1;
      expect(overlap, `${items[a].name} overlaps ${items[b].name}`).toBe(false);
    }
  }
}

describe('scripts/assets/packer — packRects', () => {
  it('packs a single item into the smallest page with its border', () => {
    const result = packRects([{ name: 'a', w: 16, h: 16 }]);
    expect(result.pages).toEqual([{ w: 64, h: 64 }]);
    expect(result.placements).toEqual([{ name: 'a', p: 0, x: 1, y: 1, w: 16, h: 16 }]);
  });

  it.each([
    [50, 1],
    [300, 2],
    [600, 3],
  ])(
    'never overlaps and stays on the page (%i random items)',
    (count, seed) => {
      const items = randomItems(count, seed);
      expectValid(items, packRects(items));
    },
    60_000, // 600 items are checked pairwise: ~2 s on a CI runner, more when it is busy
  );

  it('respects other padding / extrusion settings', () => {
    const items = randomItems(120, 7, 20);
    expectValid(items, packRects(items, { padding: 3, extrude: 2 }), 3, 2);
    expectValid(items, packRects(items, { padding: 0, extrude: 0 }), 0, 0);
  });

  it('is deterministic and independent of input order', () => {
    const items = randomItems(200, 11);
    const first = packRects(items);
    expect(packRects(items)).toEqual(first);
    const reversed = packRects(items.slice().reverse());
    const byName = new Map(reversed.placements.map((p) => [p.name, p]));
    expect(reversed.pages).toEqual(first.pages);
    for (const p of first.placements) expect(byName.get(p.name)).toEqual(p);
  });

  it('spills onto more pages only when one maxSize page is full', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ name: `tile-${i}`, w: 30, h: 30 }));
    const result = packRects(items, { maxSize: 128 });
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages[0]).toEqual({ w: 128, h: 128 });
    for (const page of result.pages) {
      expect(page.w).toBeLessThanOrEqual(128);
      expect(page.h).toBeLessThanOrEqual(128);
    }
    expectValid(items, result);
    // 30×30 frames take 33×33 cells: three per row and column of a 128² page.
    const perPage = result.pages.map((_, p) => result.placements.filter((x) => x.p === p).length);
    expect(perPage[0]).toBe(9);
    expect(perPage.reduce((a, b) => a + b, 0)).toBe(40);
  });

  it('accepts an item exactly as large as the page allows', () => {
    const result = packRects([{ name: 'big', w: 2046, h: 2046 }]);
    expect(result.pages).toEqual([{ w: 2048, h: 2048 }]);
    expect(result.placements[0]).toMatchObject({ x: 1, y: 1 });
  });

  it.each([
    [
      'a duplicate name',
      [
        { name: 'a', w: 1, h: 1 },
        { name: 'a', w: 2, h: 2 },
      ],
      {},
    ],
    ['a zero size', [{ name: 'a', w: 0, h: 4 }], {}],
    ['a fractional size', [{ name: 'a', w: 1.5, h: 4 }], {}],
    ['an item larger than the page', [{ name: 'a', w: 2047, h: 10 }], {}],
    ['a non power-of-two page', [{ name: 'a', w: 1, h: 1 }], { maxSize: 1000 }],
    ['negative padding', [{ name: 'a', w: 1, h: 1 }], { padding: -1 }],
  ])('rejects %s', (_label, items, options) => {
    expect(() => packRects(items, options)).toThrow(RangeError);
  });

  it('packs an empty list into no pages', () => {
    expect(packRects([])).toEqual({ pages: [], placements: [] });
  });
});
