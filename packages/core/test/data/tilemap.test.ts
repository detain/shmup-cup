/**
 * The `tileset` kind and stage tilemaps (plan M1-07): tileset validation and lookup tables, the
 * stage checks beyond the schema (sorted events / keys / checkpoints, the first key at 0, x past
 * the length, pans without a target, flags, segment ranges, unknown tileset), RLE rows (decoding,
 * overlay, every error), and the `heightfield` generator — deterministic, every cell's mask
 * matching a tileset tile, slopes of at most one tile per column with half-tile heights left by
 * half-tile steps, ramping in and out at the segment ends, floor over ceiling, missing tiles.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TerrainAnchor, TerrainType } from '../../src/collision/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, TILE_SIZE } from '../../src/config/index.js';
import {
  TILE_ANCHORS,
  TILE_TYPES,
  loadContent,
  type ContentFile,
  type LoadContentResult,
} from '../../src/data/index.js';
import { decodeRleRow } from '../../src/data/tilemap.js';

/** The shipped `terrain-a` tileset JSON. */
const TERRAIN_A = JSON.parse(
  readFileSync(
    new URL('../../../../content/tilesets/terrain-a.tileset.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>;

/** Rows of a fixture stage: one playfield of the build's `TILE_SIZE` tiles (the fly-in law). */
const ROWS = PLAYFIELD_H / TILE_SIZE;

/** Map width of a 1000-px stage (length + one playfield, in `TILE_SIZE` tiles). */
const COLS = Math.ceil((1000 + PLAYFIELD_W) / TILE_SIZE);

/**
 * A stage file.
 *
 * @param body - Fields over a minimal valid stage.
 * @returns The file.
 */
const stageFile = (body: Record<string, unknown>): ContentFile => ({
  path: 'stages/s.stage.json',
  data: {
    formatVersion: 1,
    kind: 'stage',
    id: 's',
    name: 'S',
    music: { stage: 'Stage', boss: 'Boss' },
    length: 1000,
    camera: [{ x: 0, speed: 1 }],
    checkpoints: [],
    parallax: [],
    tilemap: null,
    events: [],
    ...body,
  },
});

/**
 * A tileset file.
 *
 * @param body - Fields over the shipped `terrain-a`.
 * @returns The file.
 */
const tilesetFile = (body: Record<string, unknown> = {}): ContentFile => ({
  path: 'tilesets/terrain-a.tileset.json',
  data: { ...TERRAIN_A, ...body },
});

/**
 * Loads a stage with the given tilemap over the shipped tileset.
 *
 * @param tilemap - Tilemap fields over `{ tileSize: TILE_SIZE, tileset: 'terrain-a', rowsTall: ROWS }`.
 * @param tileset - Tileset fields.
 * @returns The load result.
 */
const withTilemap = (
  tilemap: Record<string, unknown>,
  tileset: Record<string, unknown> = {},
): LoadContentResult =>
  loadContent([
    stageFile({
      tilemap: { tileSize: TILE_SIZE, tileset: 'terrain-a', rowsTall: ROWS, ...tilemap },
    }),
    tilesetFile(tileset),
  ]);

/** The tiles of `db.stages[0]` (asserting they exist). */
function tilesOf(result: LoadContentResult): Uint8Array {
  const terrain = result.db.stages[0]?.terrain;
  expect(terrain).not.toBeNull();
  return terrain?.tiles ?? new Uint8Array(0);
}

describe('core/data tilesets', () => {
  it('loads the shipped tileset and builds per-id tables', () => {
    const { db, issues } = loadContent([tilesetFile()]);
    expect(issues).toEqual([]);
    const tileset = db.tilesets[0];
    expect(db.tilesetIndex.get('terrain-a')).toBe(0);
    expect(db.sprites.names[tileset.spriteId]).toBe('tiles/terrain-a');
    const { tables } = tileset;
    expect(tables.count).toBe(tileset.tiles.length + 1);
    expect([tables.type[0], tables.frame[0]]).toEqual([TerrainType.Empty, -1]);
    const up = tables.byName.get('slope-up') ?? 0;
    expect(Array.from(tables.mask.subarray(up * TILE_SIZE, up * TILE_SIZE + TILE_SIZE))).toEqual(
      Array.from({ length: TILE_SIZE }, (_, i) => i + 1),
    );
    expect(tables.anchor[tables.byName.get('ceiling') ?? 0]).toBe(TerrainAnchor.Ceiling);
    expect(tables.frame[up]).toBe(5);
  });

  it('keeps the type and anchor names in code order', () => {
    expect([...TILE_TYPES]).toEqual(['empty', 'solid', 'hazard']);
    expect(TILE_TYPES.indexOf('hazard')).toBe(TerrainType.Hazard);
    expect(TILE_ANCHORS.indexOf('ceiling')).toBe(TerrainAnchor.Ceiling);
  });

  it('reports duplicate names, wrong mask lengths and heights past the tile', () => {
    const tile = {
      name: 'a',
      type: 'solid',
      frame: 0,
      anchor: 'floor',
      mask: new Array<number>(TILE_SIZE).fill(TILE_SIZE),
    };
    const { db, issues } = loadContent([
      tilesetFile({
        tiles: [
          tile,
          tile,
          { ...tile, name: 'b', mask: [1, 2] },
          {
            ...tile,
            name: 'c',
            mask: Array.from({ length: TILE_SIZE }, (_, i) => (i === 0 ? TILE_SIZE + 1 : 0)),
          },
        ],
      }),
    ]);
    expect(issues).toEqual([
      { path: 'tilesets/terrain-a.tileset.json:tiles[1].name', message: 'duplicate tile name "a"' },
      {
        path: 'tilesets/terrain-a.tileset.json:tiles[2].mask',
        message: `must have tileSize (${TILE_SIZE}) entries`,
      },
      {
        path: 'tilesets/terrain-a.tileset.json:tiles[3].mask[0]',
        message: `must be <= tileSize (${TILE_SIZE})`,
      },
    ]);
    expect(db.tilesets).toEqual([]);
  });

  it('reports a duplicate tileset id and an unknown tile type', () => {
    const { issues } = loadContent([
      tilesetFile(),
      { ...tilesetFile(), path: 'tilesets/z.tileset.json' },
      {
        path: 'tilesets/bad.tileset.json',
        data: {
          ...TERRAIN_A,
          id: 'bad',
          tiles: [{ name: 'x', type: 'lava', frame: 0, anchor: 'floor', mask: [0] }],
        },
      },
    ]);
    expect(issues.map((issue) => issue.path + ' ' + issue.message)).toEqual([
      'tilesets/bad.tileset.json:tiles[0].type must be one of: empty, solid, hazard',
      'tilesets/z.tileset.json:id duplicate tileset id "terrain-a"',
    ]);
  });
});

describe('core/data stage checks beyond the schema', () => {
  it.each([
    [
      {
        events: [
          { x: 50, type: 'end' },
          { x: 10, type: 'end' },
        ],
      },
      'events[1].x',
      'must be >= events[0].x (events are sorted by x)',
    ],
    [{ events: [{ x: 1001, type: 'end' }] }, 'events[0].x', 'must be <= length'],
    [
      { camera: [{ x: 5, speed: 1 }] },
      'camera[0].x',
      'must be 0 (the camera path starts at the stage start)',
    ],
    [
      {
        camera: [
          { x: 0, speed: 1 },
          { x: 0, speed: 2 },
        ],
      },
      'camera[1].x',
      'must be greater than camera[0].x (keys are sorted by x)',
    ],
    [{ camera: [{ x: 0, speed: 1, yTicks: 30 }] }, 'camera[0].yTicks', 'needs yTo'],
    [
      { checkpoints: [{ x: 500 }, { x: 500 }] },
      'checkpoints[1].x',
      'must be greater than checkpoints[0].x (checkpoints are sorted by x)',
    ],
    [{ checkpoints: [{ x: 2000 }] }, 'checkpoints[0].x', 'must be <= length'],
    [
      {
        tilemap: {
          tileSize: TILE_SIZE,
          tileset: 'terrain-a',
          rowsTall: ROWS,
          generator: { type: 'heightfield', segments: [{ from: 100, to: 100 }] },
        },
      },
      'tilemap.generator.segments[0].to',
      'must be greater than from',
    ],
  ])('rejects %o', (body, path, message) => {
    const { db, issues } = loadContent([stageFile(body), tilesetFile()]);
    expect(issues).toEqual([{ path: 'stages/s.stage.json:' + path, message }]);
    expect(db.stages).toEqual([]);
  });

  it('allows events sharing an x and at most 32 distinct flags', () => {
    const flags = (n: number): unknown[] =>
      Array.from({ length: n }, (_, i) => ({ x: 10, type: 'flag', flag: 'f' + String(i) }));
    expect(loadContent([stageFile({ events: flags(32) })]).issues).toEqual([]);
    expect(loadContent([stageFile({ events: flags(33) })]).issues).toEqual([
      { path: 'stages/s.stage.json:events', message: 'uses 33 flags (at most 32)' },
    ]);
  });

  it('reports an unknown tileset and leaves the stage without terrain', () => {
    const { db, issues } = loadContent([
      stageFile({ tilemap: { tileSize: TILE_SIZE, tileset: 'nope', rowsTall: ROWS, rle: [] } }),
    ]);
    expect(issues).toEqual([
      { path: 'stages/s.stage.json:tilemap.tileset', message: 'unknown tileset id "nope"' },
    ]);
    expect(db.stages[0]?.terrain).toBeNull();
  });
});

describe('core/data RLE rows', () => {
  it('decodes runs and single ids, pads short rows, overlays only non-zero tiles', () => {
    const out = new Uint8Array(10).fill(9);
    const issues: { path: string; message: string }[] = [];
    expect(decodeRleRow(' 2*0, 3 ,2*4', 10, 17, out, 0, 'r', issues)).toBe(true);
    expect(Array.from(out)).toEqual([9, 9, 3, 4, 4, 9, 9, 9, 9, 9]);
    expect(decodeRleRow('', 10, 17, out, 0, 'r', issues)).toBe(true);
    expect(issues).toEqual([]);
  });

  it.each([
    ['3*', 'token 1 "3*" is not <id> or <count>*<id>'],
    ['1,,2', 'token 2 "" is not <id> or <count>*<id>'],
    ['a', 'token 1 "a" is not <id> or <count>*<id>'],
    ['0*1', 'token 1 has a zero run length'],
    ['18', 'tile id 18 does not exist (the tileset has 17)'],
    ['11*1', 'row is longer than the map (10 tiles)'],
  ])('rejects the row %j', (row, message) => {
    const out = new Uint8Array(10);
    const issues: { path: string; message: string }[] = [];
    expect(decodeRleRow(row, 10, 17, out, 0, 'r', issues)).toBe(false);
    expect(issues).toEqual([{ path: 'r', message }]);
    expect(Array.from(out)).toEqual(new Array(10).fill(0));
  });

  it('expands rows top to bottom into the stage map', () => {
    const rle = new Array(ROWS).fill('');
    rle[ROWS - 1] = '3*1';
    rle[0] = '2*0, 3';
    const tiles = tilesOf(withTilemap({ rle }));
    expect(tiles.length).toBe(COLS * ROWS);
    expect([
      tiles[2],
      tiles[(ROWS - 1) * COLS],
      tiles[(ROWS - 1) * COLS + 2],
      tiles[(ROWS - 1) * COLS + 3],
    ]).toEqual([3, 1, 1, 0]);
  });

  it('reports a wrong row count and a bad row at their paths', () => {
    expect(withTilemap({ rle: ['1'] }).issues).toEqual([
      {
        path: 'stages/s.stage.json:tilemap.rle',
        message: `must have exactly rowsTall (${ROWS}) rows`,
      },
    ]);
    const rle = new Array(ROWS).fill('');
    rle[3] = '99';
    const bad = withTilemap({ rle });
    expect(bad.issues).toEqual([
      {
        path: 'stages/s.stage.json:tilemap.rle[3]',
        message: `tile id 99 does not exist (the tileset has ${String((TERRAIN_A.tiles as unknown[]).length)})`,
      },
    ]);
    expect(bad.db.stages[0]?.terrain).toBeNull();
  });
});

describe('core/data heightfield generator', () => {
  const FROM = 40;
  const TO = 900;
  const generator = {
    type: 'heightfield',
    segments: [
      {
        from: FROM,
        to: TO,
        floor: { base: 40, amp: 30, period: 160, seed: 11 },
        ceiling: { base: 30, amp: 24, period: 96, seed: 12 },
      },
    ],
  };

  it('is deterministic and independent of file order', () => {
    const a = tilesOf(withTilemap({ generator }));
    const b = tilesOf(
      loadContent(
        [
          tilesetFile(),
          stageFile({
            tilemap: { tileSize: TILE_SIZE, tileset: 'terrain-a', rowsTall: ROWS, generator },
          }),
        ].reverse(),
      ),
    );
    expect(Array.from(b)).toEqual(Array.from(a));
    expect(a.some((t) => t !== 0)).toBe(true);
  });

  it('builds continuous terrain from matching tiles: ramps in/out, ≤ 1 tile per column', () => {
    const result = withTilemap({ generator });
    expect(result.issues).toEqual([]);
    const tiles = tilesOf(result);
    const tables = result.db.tilesets[0].tables;
    // Column heights of the floor, measured in pixels from the map bottom.
    const surface = (col: number, px: number): number => {
      for (let row = ROWS - 1; row >= 0; row--) {
        const id = tiles[row * COLS + col];
        if (id === 0 || tables.anchor[id] !== TerrainAnchor.Floor) {
          return (ROWS - 1 - row) * TILE_SIZE;
        }
        const h = tables.mask[id * TILE_SIZE + px];
        if (h < TILE_SIZE) return (ROWS - 1 - row) * TILE_SIZE + h;
      }
      return ROWS * TILE_SIZE;
    };
    const heights: number[] = [];
    for (let col = 0; col < COLS; col++)
      for (let px = 0; px < TILE_SIZE; px++) heights.push(surface(col, px));
    // Nothing before `from` (column floor(FROM / TILE_SIZE)) or after `to` (column
    // ceil(TO / TILE_SIZE)); a surface pixel never jumps by more than one pixel between
    // neighbouring columns (≤ 45°).
    const c0 = Math.floor(FROM / TILE_SIZE);
    const c1 = Math.min(COLS, Math.ceil(TO / TILE_SIZE));
    expect(heights.slice(0, c0 * TILE_SIZE).every((h) => h === 0)).toBe(true);
    expect(heights.slice(c1 * TILE_SIZE).every((h) => h === 0)).toBe(true);
    for (let i = 1; i < heights.length; i++) {
      expect(Math.abs(heights[i] - heights[i - 1]), `pixel column ${i}`).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...heights)).toBeGreaterThan(40);
  });

  it('fills buried cells with solid, flat surfaces with floor / ceiling', () => {
    const result = withTilemap({
      generator: {
        type: 'heightfield',
        segments: [
          {
            from: 0,
            to: 400,
            floor: { base: 3 * TILE_SIZE, amp: 0, period: 64, seed: 1 },
          },
        ],
      },
    });
    const tiles = tilesOf(result);
    const byName = result.db.tilesets[0].tables.byName;
    const col = 20; // well inside the flat part (3 rows)
    expect([
      tiles[(ROWS - 1) * COLS + col],
      tiles[(ROWS - 2) * COLS + col],
      tiles[(ROWS - 3) * COLS + col],
      tiles[(ROWS - 4) * COLS + col],
    ]).toEqual([byName.get('solid'), byName.get('solid'), byName.get('floor'), 0]);
    // Ramp-in at the start: a 45° slope right after `from`.
    expect(tiles[(ROWS - 1) * COLS]).toBe(byName.get('slope-up'));
  });

  it('lets a floor win over a ceiling it overlaps', () => {
    const result = withTilemap({
      rowsTall: 4,
      generator: {
        type: 'heightfield',
        segments: [
          {
            from: 0,
            to: 200,
            floor: { base: 4 * TILE_SIZE, amp: 0, period: 64, seed: 1 },
            ceiling: { base: 4 * TILE_SIZE, amp: 0, period: 64, seed: 2 },
          },
        ],
      },
    });
    const tiles = tilesOf(result);
    const floorId = result.db.tilesets[0].tables.byName.get('floor');
    expect(tiles[0 * COLS + 10]).toBe(floorId); // top row: the floor's surface, not ceiling rock
  });

  it('applies RLE rows over the generated terrain', () => {
    const rle = new Array(ROWS).fill('');
    rle[ROWS - 1] = '20*0, 3';
    const tiles = tilesOf(
      withTilemap({
        rle,
        generator: {
          type: 'heightfield',
          segments: [
            { from: 0, to: 400, floor: { base: 3 * TILE_SIZE, amp: 0, period: 64, seed: 1 } },
          ],
        },
      }),
    );
    expect(tiles[(ROWS - 1) * COLS + 20]).toBe(3);
    expect(tiles[(ROWS - 1) * COLS + 21]).toBe(1);
  });

  it('reports a tileset without the named tiles or without a needed slope mask', () => {
    const tiles = (TERRAIN_A.tiles as { name: string }[]).filter((tile) => tile.name !== 'floor');
    expect(withTilemap({ generator }, { tiles }).issues).toEqual([
      {
        path: 'stages/s.stage.json:tilemap.generator',
        message: 'tileset "terrain-a" has no solid tile named "floor"',
      },
    ]);
    const noLow = (TERRAIN_A.tiles as { name: string }[]).filter(
      (tile) => tile.name !== 'slope-up-low',
    );
    const issues = withTilemap(
      {
        generator: {
          type: 'heightfield',
          segments: [
            {
              from: 0,
              to: 400,
              floor: { base: (3 * TILE_SIZE) / 2, amp: 0, period: 64, seed: 1 },
            },
          ],
        },
      },
      { tiles: noLow },
    ).issues;
    // The missing tile is the 22.5° low slope the half-tile boundary column lays down first.
    const lowSlope = Array.from({ length: TILE_SIZE }, (_, px) => Math.floor((px + 1) / 2)).join(
      ',',
    );
    expect(issues).toEqual([
      {
        path: 'stages/s.stage.json:tilemap.generator.segments[0].floor',
        message: `the tileset has no solid floor tile with the mask [${lowSlope}]`,
      },
    ]);
  });
});
