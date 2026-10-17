/**
 * The tile size is data (plan_resolution.md R1-04): a tileset and a stage tilemap may declare
 * `MIN_TILE_SIZE` (8, v1) or `MAX_TILE_SIZE` (12, v2) — the schema's range rejects sizes outside
 * 8 … 12, the tileset check rejects the sizes between, a tilemap must equal its tileset's size,
 * and every mask and block check follows the declared size instead of `TILE_SIZE`.
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_W, TILE_SIZE } from '../../src/config/index.js';
import {
  MAX_TILE_SIZE,
  MIN_TILE_SIZE,
  loadContent,
  type ContentFile,
  type LoadContentResult,
} from '../../src/data/index.js';

/** Path of the fixture tileset. */
const TILESET_PATH = 'tilesets/t.tileset.json';

/** Path of the fixture stage. */
const STAGE_PATH = 'stages/s.stage.json';

/**
 * A column-height mask of one value.
 *
 * @param size - Number of columns.
 * @param height - Every column's height.
 * @returns The mask.
 */
const flat = (size: number, height: number): number[] => new Array<number>(size).fill(height);

/**
 * A 45° floor slope mask: `1 … size`.
 *
 * @param size - Number of columns.
 * @returns The mask.
 */
const ramp = (size: number): number[] => Array.from({ length: size }, (_, i) => i + 1);

/**
 * A tileset file with the four tiles a stage needs, drawn at one tile size.
 *
 * @param tileSize - Declared tile edge.
 * @param maskSize - Columns of every mask (defaults to `tileSize`).
 * @returns The file.
 */
function tilesetFile(tileSize: number, maskSize = tileSize): ContentFile {
  return {
    path: TILESET_PATH,
    data: {
      formatVersion: 1,
      kind: 'tileset',
      id: 't',
      sprite: 'tiles/terrain-a',
      tileSize,
      tiles: [
        { name: 'solid', type: 'solid', frame: 0, anchor: 'floor', mask: flat(maskSize, maskSize) },
        { name: 'floor', type: 'solid', frame: 1, anchor: 'floor', mask: flat(maskSize, maskSize) },
        {
          name: 'ceiling',
          type: 'solid',
          frame: 2,
          anchor: 'ceiling',
          mask: flat(maskSize, maskSize),
        },
        { name: 'slope-up', type: 'solid', frame: 3, anchor: 'floor', mask: ramp(maskSize) },
      ],
    },
  };
}

/**
 * A stage file with a tilemap.
 *
 * @param tilemap - The tilemap block.
 * @param events - The event timeline.
 * @returns The file.
 */
function stageFile(tilemap: Record<string, unknown>, events: unknown[] = []): ContentFile {
  return {
    path: STAGE_PATH,
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
      tilemap,
      events,
    },
  };
}

/**
 * Loads a stage of RLE rows over a tileset.
 *
 * @param stageSize - The stage's declared tile edge.
 * @param tilesetSize - The tileset's declared tile edge.
 * @param events - The stage's events.
 * @returns The load result.
 */
function load(stageSize: number, tilesetSize: number, events: unknown[] = []): LoadContentResult {
  const floor = String(Math.ceil((1000 + PLAYFIELD_W) / stageSize)) + '*1';
  return loadContent([
    stageFile({ tileSize: stageSize, tileset: 't', rowsTall: 4, rle: ['', '', '', floor] }, events),
    tilesetFile(tilesetSize),
  ]);
}

describe('core/data: the tile size is data (R1-04)', () => {
  it('admits v1 and v2 tiles; the shipped size is one of them', () => {
    expect([MIN_TILE_SIZE, MAX_TILE_SIZE]).toEqual([8, 12]);
    expect([MIN_TILE_SIZE, MAX_TILE_SIZE]).toContain(TILE_SIZE);
  });

  it.each([MIN_TILE_SIZE, MAX_TILE_SIZE])('loads a %i-px tileset and stage', (size) => {
    const { db, issues } = load(size, size);
    expect(issues).toEqual([]);
    const tileset = db.tilesets[0];
    expect(tileset.tileSize).toBe(size);
    const up = tileset.tables.byName.get('slope-up') ?? 0;
    expect(Array.from(tileset.tables.mask.subarray(up * size, up * size + size))).toEqual(
      ramp(size),
    );
    const terrain = db.stages[0].terrain;
    expect(terrain?.tileSize).toBe(size);
    expect(terrain?.cols).toBe(Math.ceil((1000 + PLAYFIELD_W) / size));
    expect(terrain?.rows).toBe(4);
    expect(terrain?.tiles[3 * (terrain.cols ?? 0)]).toBe(tileset.tables.byName.get('solid'));
  });

  it('rejects sizes outside 8 … 12 in the schema and the sizes between in the tileset check', () => {
    expect(loadContent([tilesetFile(16)]).issues).toEqual([
      { path: TILESET_PATH + ':tileSize', message: 'must be an integer in 8..12' },
    ]);
    expect(loadContent([tilesetFile(4)]).issues).toEqual([
      { path: TILESET_PATH + ':tileSize', message: 'must be an integer in 8..12' },
    ]);
    const { db, issues } = loadContent([tilesetFile(10)]);
    expect(issues).toEqual([{ path: TILESET_PATH + ':tileSize', message: 'must be 8 or 12' }]);
    expect(db.tilesets).toEqual([]);
  });

  it('checks masks against the declared size', () => {
    const { issues } = loadContent([tilesetFile(MAX_TILE_SIZE, MIN_TILE_SIZE)]);
    expect(issues).toHaveLength(4);
    expect(issues[0]).toEqual({
      path: TILESET_PATH + ':tiles[0].mask',
      message: 'must have tileSize (12) entries',
    });
    const tall = tilesetFile(MAX_TILE_SIZE);
    const tiles = (tall.data as { tiles: { mask: number[] }[] }).tiles;
    tiles[3].mask = [13, ...flat(11, 0)];
    expect(loadContent([tall]).issues).toEqual([
      { path: TILESET_PATH + ':tiles[3].mask[0]', message: 'must be <= tileSize (12)' },
    ]);
  });

  it("rejects a tilemap whose size differs from its tileset's", () => {
    const { db, issues } = load(MAX_TILE_SIZE, MIN_TILE_SIZE);
    expect(issues).toEqual([
      { path: STAGE_PATH + ':tilemap.tileSize', message: "must equal the tileset's tileSize (8)" },
    ]);
    expect(db.stages[0].terrain).toBeNull();
    expect(load(MIN_TILE_SIZE, MAX_TILE_SIZE).issues).toEqual([
      { path: STAGE_PATH + ':tilemap.tileSize', message: "must equal the tileset's tileSize (12)" },
    ]);
  });

  it('sizes moving blocks in whole tiles of the stage size', () => {
    const block = (w: number, h: number) => ({ x: 0, type: 'block', y: 24, w, h });
    expect(load(MAX_TILE_SIZE, MAX_TILE_SIZE, [block(24, 36)]).issues).toEqual([]);
    expect(load(MAX_TILE_SIZE, MAX_TILE_SIZE, [block(16, 24)]).issues).toEqual([
      {
        path: STAGE_PATH + ':events[0].w',
        message: 'w and h must be multiples of the tile size (12)',
      },
    ]);
    expect(load(MIN_TILE_SIZE, MIN_TILE_SIZE, [block(16, 24)]).issues).toEqual([]);
  });
});
