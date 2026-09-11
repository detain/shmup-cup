/**
 * Edge cases of tilesets and tilemap expansion (plan M1-07), beyond `tilemap.test.ts`:
 *
 * - the `heightfield` generator over 120 random single-segment profiles (floor or ceiling, every
 *   map height from 1 to 25 rows, segments not aligned to tiles or running past the map): no
 *   issue with the shipped `terrain-a` tileset, a continuous surface (≤ 1 px between pixel
 *   columns), nothing outside `[from, to)`, heights within the map, and floors that `findFloor`
 *   finds at exactly the generated height (data and collision agree);
 * - random multi-segment floor + ceiling maps: no issues, deterministic, seed-dependent;
 * - small hand-checked shapes: a one-row map, a half-tile target, a segment of one tile;
 * - RLE rows: whitespace, trailing commas, leading zeros, the largest id, exact-width rows, a
 *   failed row leaving the map untouched, a bad row discarding the whole terrain;
 * - `buildTilesetTables`: codes, frames, short masks, the first of duplicate names.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TerrainAnchor, TerrainType, findCeiling, findFloor } from '../../src/collision/index.js';
import { loadContent, type ContentFile, type LoadContentResult } from '../../src/data/index.js';
import { buildTilesetTables, decodeRleRow } from '../../src/data/tilemap.js';
import { createRng, type Rng } from '../../src/rng/index.js';
import { createStageTerrain } from '../../src/stage/index.js';

/** The shipped `terrain-a` tileset JSON. */
const TERRAIN_A = JSON.parse(
  readFileSync(
    new URL('../../../../content/tilesets/terrain-a.tileset.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>;

/**
 * Loads a stage with a tilemap over the shipped tileset.
 *
 * @param length - Stage length.
 * @param tilemap - Tilemap fields over `{ tileSize: 8, tileset: 'terrain-a', rowsTall: 25 }`.
 * @returns The load result.
 */
function load(length: number, tilemap: Record<string, unknown>): LoadContentResult {
  const stage: ContentFile = {
    path: 'stages/s.stage.json',
    data: {
      formatVersion: 1,
      kind: 'stage',
      id: 's',
      name: 'S',
      music: { stage: 'Stage', boss: 'Boss' },
      length,
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [],
      parallax: [],
      tilemap: { tileSize: 8, tileset: 'terrain-a', rowsTall: 25, ...tilemap },
      events: [],
    },
  };
  return loadContent([stage, { path: 'tilesets/terrain-a.tileset.json', data: TERRAIN_A }]);
}

/**
 * A random wave profile.
 *
 * @param rng - Random source.
 * @param rows - Map height in tiles.
 * @returns The profile.
 */
function profile(rng: Rng, rows: number): Record<string, number> {
  return {
    base: rng.rangeInt(0, rows * 8 + 16),
    amp: rng.nextFloat() < 0.2 ? 0 : rng.rangeInt(1, 64),
    period: rng.rangeInt(16, 700),
    seed: rng.rangeInt(0, 0x7fffffff) * 2 + rng.rangeInt(0, 1),
  };
}

/**
 * Pixel-column heights of the terrain grown from one edge (floor: from the bottom, ceiling: from
 * the top), read from the tiles' masks: full cells continue to the next row, a partial cell of
 * the edge's anchor ends the column.
 *
 * @param result - A loaded stage with terrain.
 * @param anchor - Which edge.
 * @returns Heights per pixel column.
 */
function edgeHeights(result: LoadContentResult, anchor: number): number[] {
  const terrain = result.db.stages[0].terrain;
  if (terrain === null) throw new Error('no terrain');
  const tables = result.db.tilesets[0].tables;
  const { cols, rows, tiles } = terrain;
  const heights: number[] = [];
  for (let col = 0; col < cols; col++) {
    for (let px = 0; px < 8; px++) {
      let h = 0;
      for (let k = 0; k < rows; k++) {
        const row = anchor === TerrainAnchor.Floor ? rows - 1 - k : k;
        const id = tiles[row * cols + col];
        if (id === 0) break;
        const m = tables.mask[id * 8 + px];
        if (m === 8) {
          h += 8;
          continue;
        }
        if (tables.anchor[id] === anchor) h += m;
        break;
      }
      heights.push(h);
    }
  }
  return heights;
}

describe('core/data heightfield edge — random single profiles', () => {
  it('builds continuous in-range terrain inside [from, to) for 120 random profiles', () => {
    const rng = createRng(31337);
    let wavy = 0;
    for (let trial = 0; trial < 120; trial++) {
      const rows = trial < 25 ? trial + 1 : rng.rangeInt(1, 25);
      const length = rng.rangeInt(100, 1500);
      const cols = Math.ceil((length + 384) / 8);
      const from = rng.rangeInt(0, length);
      const to = from + rng.rangeInt(1, trial % 10 === 0 ? 3000 : 800);
      const ceiling = trial % 2 === 1;
      const segment: Record<string, unknown> = { from, to };
      segment[ceiling ? 'ceiling' : 'floor'] = profile(rng, rows);
      const result = load(length, {
        rowsTall: rows,
        generator: { type: 'heightfield', segments: [segment] },
      });
      const label = `trial ${String(trial)} ${JSON.stringify(segment)} rows ${String(rows)}`;
      expect(result.issues, label).toEqual([]);
      const anchor = ceiling ? TerrainAnchor.Ceiling : TerrainAnchor.Floor;
      const heights = edgeHeights(result, anchor);
      expect(heights, label).toHaveLength(cols * 8);
      const c0 = Math.floor(from / 8);
      const c1 = Math.min(cols, Math.ceil(to / 8));
      // ~230k pixel columns in all: check each in plain code and call `expect` only on a
      // mismatch (a per-pixel `expect` + label made this test time out on a loaded CI runner).
      for (let x = 0; x < heights.length; x++) {
        const h = heights[x];
        const outside = x < c0 * 8 || x >= c1 * 8;
        const step = x > 0 ? Math.abs(h - heights[x - 1]) : 0;
        if (h <= rows * 8 && (!outside || h === 0) && step <= 1) continue;
        const at = `${label} x ${String(x)}`;
        expect(h, at).toBeLessThanOrEqual(rows * 8);
        if (outside) expect(h, at).toBe(0);
        expect(step, at).toBeLessThanOrEqual(1);
      }
      if (new Set(heights).size > 4) wavy++;
      // The collision queries see exactly that surface.
      const map = createStageTerrain(result.db.stages[0], result.db);
      if (map === null) throw new Error(label);
      for (let x = 0; x < heights.length; x += 3) {
        const h = heights[x];
        const got = ceiling
          ? findCeiling(map, x, rows * 8 - 1, rows * 8)
          : findFloor(map, x, 0, rows * 8);
        const want = h === 0 ? NaN : ceiling ? h : rows * 8 - h;
        if (!Object.is(got, want)) expect(got, `${label} x ${String(x)}`).toBe(want);
      }
    }
    expect(wavy).toBeGreaterThan(60);
  });

  it('expands 40 random multi-segment floor + ceiling maps without issues, deterministically', () => {
    const rng = createRng(777);
    for (let trial = 0; trial < 40; trial++) {
      const rows = rng.rangeInt(2, 25);
      const segments: Record<string, unknown>[] = [];
      let from = rng.rangeInt(0, 200);
      for (let i = rng.rangeInt(1, 5); i > 0; i--) {
        const to = from + rng.rangeInt(8, 600);
        const segment: Record<string, unknown> = { from, to };
        if (rng.nextFloat() < 0.8) segment.floor = profile(rng, rows);
        if (rng.nextFloat() < 0.6) segment.ceiling = profile(rng, rows);
        segments.push(segment);
        from = to - (rng.nextFloat() < 0.3 ? rng.rangeInt(0, 100) : -rng.rangeInt(0, 100));
        if (from < 0) from = 0;
      }
      const tilemap = { rowsTall: rows, generator: { type: 'heightfield', segments } };
      const a = load(2000, tilemap);
      const b = load(2000, JSON.parse(JSON.stringify(tilemap)) as Record<string, unknown>);
      expect(a.issues, `trial ${String(trial)}`).toEqual([]);
      expect(Array.from(a.db.stages[0].terrain?.tiles ?? [])).toEqual(
        Array.from(b.db.stages[0].terrain?.tiles ?? []),
      );
    }
  });

  it('changes the terrain with the seed of a wavy profile, not of a flat one', () => {
    const tiles = (seed: number, amp: number): number[] =>
      Array.from(
        load(1000, {
          generator: {
            type: 'heightfield',
            segments: [{ from: 0, to: 1000, floor: { base: 40, amp, period: 200, seed } }],
          },
        }).db.stages[0].terrain?.tiles ?? [],
      );
    expect(tiles(1, 30)).not.toEqual(tiles(2, 30));
    expect(tiles(1, 0)).toEqual(tiles(2, 0));
  });
});

describe('core/data heightfield edge — small shapes', () => {
  /**
   * The ids of one map row, as tile names.
   *
   * @param result - A load result.
   * @param row - Map row.
   * @param count - Columns.
   * @returns Names (`.` for empty).
   */
  function rowNames(result: LoadContentResult, row: number, count: number): string[] {
    const terrain = result.db.stages[0].terrain;
    const names = (result.db.tilesets[0].tiles as readonly { name: string }[]).map((t) => t.name);
    const out: string[] = [];
    for (let c = 0; c < count; c++) {
      const id = terrain?.tiles[row * terrain.cols + c] ?? 0;
      out.push(id === 0 ? '.' : names[id - 1]);
    }
    return out;
  }

  it('builds a one-row floor: slope in, flat floor, slope out', () => {
    const result = load(200, {
      rowsTall: 1,
      generator: {
        type: 'heightfield',
        segments: [{ from: 0, to: 48, floor: { base: 100, amp: 0, period: 64, seed: 0 } }],
      },
    });
    expect(result.issues).toEqual([]);
    expect(rowNames(result, 0, 7)).toEqual([
      'slope-up',
      'floor',
      'floor',
      'floor',
      'floor',
      'slope-down',
      '.',
    ]);
  });

  it('leaves a half-tile target by 22.5° steps only (a zigzag, never a flat half tile)', () => {
    const result = load(200, {
      rowsTall: 2,
      generator: {
        type: 'heightfield',
        segments: [{ from: 0, to: 64, floor: { base: 4, amp: 0, period: 64, seed: 0 } }],
      },
    });
    expect(result.issues).toEqual([]);
    const heights = edgeHeights(result, TerrainAnchor.Floor).slice(0, 72);
    // Boundary heights 0, 4, 8, 4, 0, 4, 8, 4, 0: every tile column is a 22.5° half slope.
    const boundaries = [0, 8, 16, 24, 32, 40, 48, 56, 64].map((x) =>
      x === 0 ? 0 : heights[x - 1],
    );
    expect(boundaries).toEqual([0, 4, 8, 4, 0, 4, 8, 4, 0]);
  });

  it('produces nothing for a segment of one tile, or one starting past the map', () => {
    for (const segment of [
      { from: 16, to: 24 },
      { from: 3, to: 5 },
      { from: 5000, to: 6000 },
    ]) {
      const result = load(200, {
        generator: {
          type: 'heightfield',
          segments: [{ ...segment, floor: { base: 40, amp: 10, period: 64, seed: 3 } }],
        },
      });
      expect(result.issues).toEqual([]);
      expect(result.db.stages[0].terrain?.tiles.every((t) => t === 0)).toBe(true);
    }
  });

  it('gives a tilemap without generator or rows an empty map of the right size', () => {
    const result = load(100, { rowsTall: 3 });
    expect(result.issues).toEqual([]);
    const terrain = result.db.stages[0].terrain;
    expect([terrain?.cols, terrain?.rows, terrain?.tiles.length]).toEqual([61, 3, 183]);
    expect(terrain?.tiles.every((t) => t === 0)).toBe(true);
  });

  it('keeps the generated map (and reports the issue) when the named tiles are missing', () => {
    const tiles = (TERRAIN_A.tiles as { name: string }[]).filter((t) => t.name !== 'ceiling');
    const result = loadContent([
      {
        path: 'stages/s.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 's',
          name: 'S',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 100,
          camera: [{ x: 0, speed: 1 }],
          checkpoints: [],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 2,
            rle: ['', '2*1'],
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 80, floor: { base: 8, amp: 0, period: 64, seed: 0 } }],
            },
          },
          events: [],
        },
      },
      { path: 'tilesets/terrain-a.tileset.json', data: { ...TERRAIN_A, tiles } },
    ]);
    expect(result.issues.map((i) => i.message)).toEqual([
      'tileset "terrain-a" has no solid tile named "ceiling"',
    ]);
    // The generator is skipped, the RLE rows still apply.
    const terrain = result.db.stages[0].terrain;
    expect(terrain?.tiles.slice(terrain.cols, terrain.cols + 3)).toEqual(new Uint8Array([1, 1, 0]));
  });
});

describe('core/data RLE edge', () => {
  /**
   * Decodes one row into a fresh 8-cell map.
   *
   * @param text - The row.
   * @returns `[ok, cells, messages]`.
   */
  const decode = (text: string): [boolean, number[], string[]] => {
    const out = new Uint8Array(8);
    const issues: { path: string; message: string }[] = [];
    const ok = decodeRleRow(text, 8, 17, out, 0, 'p', issues);
    return [ok, Array.from(out), issues.map((i) => i.message)];
  };

  it('ignores all whitespace, accepts leading zeros, the largest id and exact-width rows', () => {
    expect(decode(' \t1 ,\n 2 * 3 ')).toEqual([true, [1, 3, 3, 0, 0, 0, 0, 0], []]);
    expect(decode('007, 01*17')).toEqual([true, [7, 17, 0, 0, 0, 0, 0, 0], []]);
    expect(decode('8*5')).toEqual([true, [5, 5, 5, 5, 5, 5, 5, 5], []]);
    expect(decode('7*0, 2')).toEqual([true, [0, 0, 0, 0, 0, 0, 0, 2], []]);
    expect(decode('   ')).toEqual([true, [0, 0, 0, 0, 0, 0, 0, 0], []]);
  });

  it('rejects trailing / leading commas, signs, fractions and huge runs without writing', () => {
    for (const [row, message] of [
      ['1,', 'token 2 "" is not <id> or <count>*<id>'],
      [',1', 'token 1 "" is not <id> or <count>*<id>'],
      ['3*1, -1', 'token 2 "-1" is not <id> or <count>*<id>'],
      ['1.5', 'token 1 "1.5" is not <id> or <count>*<id>'],
      ['2*2*2', 'token 1 "2*2*2" is not <id> or <count>*<id>'],
      ['00*1', 'token 1 has a zero run length'],
      ['99999999999*0', 'row is longer than the map (8 tiles)'],
      ['4*1, 5*0', 'row is longer than the map (8 tiles)'],
    ] as const) {
      expect(decode(row), row).toEqual([false, [0, 0, 0, 0, 0, 0, 0, 0], [message]]);
    }
  });

  it('writes into its own row only (offset), and discards the terrain for a bad row', () => {
    const out = new Uint8Array(16);
    expect(decodeRleRow('3*2', 8, 17, out, 8, 'p', [])).toBe(true);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0]);
    const rle = new Array<string>(25).fill('');
    rle[0] = '1';
    rle[24] = 'x';
    const result = load(100, { rle });
    expect(result.issues).toEqual([
      {
        path: 'stages/s.stage.json:tilemap.rle[24]',
        message: 'token 1 "x" is not <id> or <count>*<id>',
      },
    ]);
    expect(result.db.stages[0].terrain).toBeNull();
    // The stage itself stays loadable (open space).
    expect(result.db.stages[0].id).toBe('s');
  });
});

describe('core/data tileset tables edge', () => {
  it('maps types, anchors and frames, pads short masks with 0, keeps the first duplicate name', () => {
    const tables = buildTilesetTables(
      [
        { name: 'a', type: 'hazard', frame: 9, anchor: 'ceiling', mask: [1, 2] },
        { name: 'b', type: 'empty', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
        { name: 'a', type: 'solid', frame: 3, anchor: 'floor', mask: [4, 4, 4, 4, 4, 4, 4, 4] },
      ],
      8,
    );
    expect(tables.count).toBe(4);
    expect(Array.from(tables.type)).toEqual([
      TerrainType.Empty,
      TerrainType.Hazard,
      TerrainType.Empty,
      TerrainType.Solid,
    ]);
    expect(Array.from(tables.anchor)).toEqual([0, TerrainAnchor.Ceiling, 0, 0]);
    expect(Array.from(tables.frame)).toEqual([-1, 9, 0, 3]);
    expect(Array.from(tables.mask.subarray(8, 16))).toEqual([1, 2, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(tables.mask.subarray(0, 8))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(tables.byName.get('a')).toBe(1);
    expect(tables.byName.get('b')).toBe(2);
  });
});
