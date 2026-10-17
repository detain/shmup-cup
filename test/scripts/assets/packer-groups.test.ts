/**
 * `scripts/assets/packer.mjs` — atlas groups (R1-05).
 *
 * Acceptance: each group packs onto its own pages (no page mixes two groups), pages come
 * group by group — ungrouped first, then `groupOrder`, then the rest by name — a group
 * with no items makes no page, the layout does not depend on the input order, and with
 * no groups (or one group) the layout is exactly the ungrouped one: one group only adds
 * the `group` field.
 */
import { describe, expect, it } from 'vitest';
import { packRects, type PackItem } from '../../../scripts/assets/packer.mjs';
import { createAssetRng } from '../../../scripts/assets/rng.mjs';

/**
 * Random items of assorted sizes, spread over the given groups by a seeded RNG.
 *
 * @param count - How many.
 * @param seed - RNG seed.
 * @param groups - Groups to draw from (`undefined` entries leave an item ungrouped).
 * @param max - Largest side.
 * @returns The items.
 */
function groupedItems(
  count: number,
  seed: number,
  groups: readonly (string | undefined)[],
  max = 40,
): PackItem[] {
  const rng = createAssetRng(seed);
  return Array.from({ length: count }, (_, i) => {
    const group = groups[rng.rangeInt(0, groups.length - 1)];
    const item: PackItem = { name: `item-${i}`, w: rng.rangeInt(1, max), h: rng.rangeInt(1, max) };
    if (group !== undefined) item.group = group;
    return item;
  });
}

/**
 * Drops the `group` fields of a packing, so it compares with an ungrouped one.
 *
 * @param result - A packing.
 * @returns Pages and placements without `group`.
 */
function withoutGroups(result: ReturnType<typeof packRects>): ReturnType<typeof packRects> {
  return {
    pages: result.pages.map(({ w, h }) => ({ w, h })),
    placements: result.placements.map(({ name, p, x, y, w, h }) => ({ name, p, x, y, w, h })),
  };
}

/**
 * Asserts that cells never overlap on a page (frame + 1-px border + 1-px padding) and that
 * each placement lies on a page of its own group.
 *
 * @param items - The input.
 * @param result - The packing.
 */
function expectGroupedValid(
  items: readonly PackItem[],
  result: ReturnType<typeof packRects>,
): void {
  expect(result.placements).toHaveLength(items.length);
  result.placements.forEach((p, i) => {
    expect(p.name).toBe(items[i].name);
    expect(p.group, p.name).toBe(items[i].group);
    expect(result.pages[p.p].group, p.name).toBe(items[i].group);
    expect(p.x - 1).toBeGreaterThanOrEqual(0);
    expect(p.y - 1).toBeGreaterThanOrEqual(0);
    expect(p.x + p.w + 1).toBeLessThanOrEqual(result.pages[p.p].w);
    expect(p.y + p.h + 1).toBeLessThanOrEqual(result.pages[p.p].h);
  });
  const cells = result.placements.map((p) => ({
    p: p.p,
    x0: p.x - 1,
    y0: p.y - 1,
    x1: p.x + p.w + 2,
    y1: p.y + p.h + 2,
  }));
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      const A = cells[a];
      const B = cells[b];
      if (A.p !== B.p) continue;
      expect(A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1).toBe(false);
    }
  }
  // Every page holds at least one item.
  expect(new Set(result.placements.map((p) => p.p)).size).toBe(result.pages.length);
}

describe('scripts/assets/packer — groups', () => {
  it('packs each group onto its own pages, ordered by groupOrder then by name', () => {
    const items = groupedItems(120, 7, ['common', 'zone-b', 'zone-a', 'zone-c']);
    const result = packRects(items, { groupOrder: ['common'] });
    expectGroupedValid(items, result);
    const order = result.pages.map((page) => page.group);
    // Consecutive runs, in the documented order.
    const runs = order.filter((g, i) => i === 0 || g !== order[i - 1]);
    expect(runs).toEqual(['common', 'zone-a', 'zone-b', 'zone-c']);
  });

  it('packs a group exactly as it would be packed alone (same pages, same positions)', () => {
    const items = groupedItems(90, 11, ['common', 'zone-a']);
    const result = packRects(items, { groupOrder: ['common'] });
    for (const group of ['common', 'zone-a']) {
      const own = items.filter((item) => item.group === group);
      const alone = packRects(own.map(({ name, w, h }) => ({ name, w, h })));
      const pages = result.pages.filter((page) => page.group === group);
      expect(pages.map(({ w, h }) => ({ w, h }))).toEqual(alone.pages);
      const first = result.pages.indexOf(pages[0]);
      const placed = result.placements.filter((p) => p.group === group);
      expect(placed.map(({ name, x, y, w, h, p }) => ({ name, x, y, w, h, p: p - first }))).toEqual(
        alone.placements,
      );
    }
  });

  it('keeps the ungrouped layout when every item is in one group (only `group` is added)', () => {
    const plain = groupedItems(150, 3, [undefined]);
    const one = plain.map((item) => ({ ...item, group: 'common' }));
    const ungrouped = packRects(plain);
    const grouped = packRects(one, { groupOrder: ['common'] });
    expect(withoutGroups(grouped)).toEqual(ungrouped);
    for (const page of grouped.pages) expect(page.group).toBe('common');
    for (const p of grouped.placements) expect(p.group).toBe('common');
  });

  it('adds no `group` field at all without groups (byte-identical to before R1-05)', () => {
    const plain = groupedItems(60, 5, [undefined]);
    const result = packRects(plain, { groupOrder: ['common', 'zone-a'] });
    expect(result).toEqual(packRects(plain));
    for (const page of result.pages) expect(Object.keys(page)).toEqual(['w', 'h']);
    for (const p of result.placements)
      expect(Object.keys(p)).toEqual(['name', 'p', 'x', 'y', 'w', 'h']);
  });

  it('puts ungrouped items first, then groupOrder in its order, then the rest by name', () => {
    const items: PackItem[] = [
      { name: 'z', w: 4, h: 4, group: 'zeta' },
      { name: 'a', w: 4, h: 4, group: 'alpha' },
      { name: 'c', w: 4, h: 4, group: 'common' },
      { name: 'u', w: 4, h: 4 },
      { name: 'm', w: 4, h: 4, group: 'mid' },
    ];
    const result = packRects(items, { groupOrder: ['mid', 'common', 'absent'] });
    expect(result.pages.map((page) => page.group)).toEqual([
      undefined,
      'mid',
      'common',
      'alpha',
      'zeta',
    ]);
    expect(result.placements.map((p) => p.p)).toEqual([4, 3, 2, 0, 1]);
    expect('group' in result.placements[3]).toBe(false);
    expect('group' in result.pages[0]).toBe(false);
  });

  it('makes no page for a group without items (groupOrder names are only an order)', () => {
    const items: PackItem[] = [{ name: 'a', w: 8, h: 8, group: 'zone-a' }];
    const result = packRects(items, { groupOrder: ['common', 'zone-z'] });
    expect(result.pages).toEqual([{ w: 64, h: 64, group: 'zone-a' }]);
    expect(packRects([], { groupOrder: ['common'] })).toEqual({ pages: [], placements: [] });
  });

  it('spills a full group onto more pages of that group only', () => {
    const items: PackItem[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ name: `big-${i}`, w: 60, h: 60, group: 'zone-a' })),
      { name: 'small', w: 4, h: 4, group: 'common' },
    ];
    const result = packRects(items, { maxSize: 64, groupOrder: ['common'] });
    expect(result.pages.map((page) => page.group)).toEqual([
      'common',
      'zone-a',
      'zone-a',
      'zone-a',
      'zone-a',
      'zone-a',
    ]);
    expectGroupedValid(items, result);
  });

  it('is deterministic and independent of the input order', () => {
    const items = groupedItems(100, 21, ['common', 'zone-d', 'zone-h', undefined]);
    const first = packRects(items, { groupOrder: ['common'] });
    expect(packRects(items, { groupOrder: ['common'] })).toEqual(first);
    const reversed = packRects(items.slice().reverse(), { groupOrder: ['common'] });
    expect(reversed.pages).toEqual(first.pages);
    const byName = new Map(reversed.placements.map((p) => [p.name, p]));
    for (const p of first.placements) expect(byName.get(p.name)).toEqual(p);
  });

  it('rejects an empty or non-string group and a repeated or empty groupOrder name', () => {
    expect(() => packRects([{ name: 'a', w: 1, h: 1, group: '' }])).toThrow(RangeError);
    expect(() => packRects([{ name: 'a', w: 1, h: 1, group: 3 as unknown as string }])).toThrow(
      /invalid group/,
    );
    expect(() => packRects([], { groupOrder: ['common', 'common'] })).toThrow(RangeError);
    expect(() => packRects([], { groupOrder: [''] })).toThrow(RangeError);
  });

  it('still rejects a duplicate name across two groups', () => {
    expect(() =>
      packRects([
        { name: 'a', w: 1, h: 1, group: 'common' },
        { name: 'a', w: 1, h: 1, group: 'zone-a' },
      ]),
    ).toThrow(/duplicate item "a"/);
  });
});
