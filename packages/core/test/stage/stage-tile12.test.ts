/**
 * A stage at tile size 12 (plan_resolution.md R1-04: "a test stage at tile size 12 … loads … and
 * collides correctly"). The fixture is the shipped `terrain-a` tileset with every mask moved to
 * 12 px by `scripts/assets/procedural/terrain.mjs` `resampleMask` — the step R1-03's rescale tool
 * takes — and a stage of 12-px tiles over it, built in this test only (nothing in `content/`):
 * the heightfield finds a tile for every cell it shapes, `createStageTerrain` hands the World a
 * 12-px map, the queries match the expanded tiles pixel for pixel, the ship's terrain box dies on
 * the 12-px floor where the floor is, moving blocks come in whole 12-px tiles, and the run is
 * deterministic.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resampleMask } from '../../../../scripts/assets/procedural/terrain.mjs';
import { TerrainAnchor, TerrainType, findFloor, terrainAt } from '../../src/collision/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, resolveGameConfig } from '../../src/config/index.js';
import {
  MAX_TILE_SIZE,
  loadContent,
  type ContentDb,
  type StageTerrain,
  type TilesetSpec,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { stageMapWidth } from '../../src/stage/index.js';
import { v1rel } from '../helpers/v1-port.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/** The fixture's tile edge. */
const SIZE = MAX_TILE_SIZE;

/** Rows of the fixture map: enough 12-px rows to cover today's playfield. */
const ROWS = Math.ceil(PLAYFIELD_H / SIZE);

/** Stage length of the fixture. */
const LENGTH = 3000;

/**
 * Reads a shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The parsed JSON.
 */
function shipped(path: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
}

/**
 * `terrain-a` at 12 px: the shipped tiles with their masks resampled from the tileset's own
 * `tileSize` (8 until R2-02 ports the content, whatever `TILE_SIZE` says; then 12, a copy).
 */
function tileset12(): Record<string, unknown> {
  const data = shipped('tilesets/terrain-a.tileset.json') as {
    tileSize: number;
    tiles: { mask: number[] }[];
  } & Record<string, unknown>;
  return {
    ...data,
    tileSize: SIZE,
    tiles: data.tiles.map((tile) => ({
      ...tile,
      mask: resampleMask(tile.mask, data.tileSize, SIZE),
    })),
  };
}

/**
 * Content with the KESTREL, the 12-px tileset and a 12-px stage.
 *
 * @param generator - The heightfield segment's profiles.
 * @param events - Extra events before the `end`.
 * @returns The DB (asserted issue-free).
 */
function db12(
  generator: Record<string, unknown> = { floor: { base: 48, amp: 0, period: 64, seed: 1 } },
  events: unknown[] = [],
): ContentDb {
  const { db, issues } = loadContent([
    { path: 'player/kestrel.player.json', data: shipped('player/kestrel.player.json') },
    { path: 'tilesets/terrain-a.tileset.json', data: tileset12() },
    {
      path: 'stages/t12.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 't12',
        name: 'T12',
        music: { stage: 'Stage', boss: 'Boss' },
        length: LENGTH,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: {
          tileSize: SIZE,
          tileset: 'terrain-a',
          rowsTall: ROWS,
          generator: {
            type: 'heightfield',
            segments: [{ from: 0, to: LENGTH + PLAYFIELD_W, ...generator }],
          },
        },
        events: [...events, { x: LENGTH, type: 'end' }],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
}

/** A rolling floor and ceiling: slopes of every kind. */
const HILLS = {
  floor: { base: 60, amp: 40, period: 360, seed: 11 },
  ceiling: { base: 30, amp: 24, period: 260, seed: 12 },
};

/**
 * A world on the fixture stage.
 *
 * @param db - Content.
 * @param seed - Config seed.
 * @returns The world.
 */
function world(db: ContentDb, seed = 1): World {
  return createWorld(resolveGameConfig({ seed, stage: 't12' }), db);
}

/**
 * The terrain type of a world pixel, read straight from the expanded tiles and the tileset's
 * masks (independent of `core/collision`).
 *
 * @param terrain - The stage's expanded terrain.
 * @param tileset - Its tileset.
 * @param x - World column.
 * @param y - World row.
 * @returns A `TerrainType` code.
 */
function pixel(terrain: StageTerrain, tileset: TilesetSpec, x: number, y: number): number {
  const col = Math.floor(x / SIZE);
  const row = Math.floor(y / SIZE);
  if (col < 0 || row < 0 || col >= terrain.cols || row >= terrain.rows) return TerrainType.Empty;
  const id = terrain.tiles[row * terrain.cols + col];
  if (id === 0) return TerrainType.Empty;
  const { type, anchor, mask } = tileset.tables;
  const h = mask[id * SIZE + (x - col * SIZE)];
  const ly = y - row * SIZE;
  const solid = anchor[id] === TerrainAnchor.Ceiling ? ly < h : ly >= SIZE - h;
  return solid ? type[id] : TerrainType.Empty;
}

describe('core/stage: a stage of 12-px tiles (R1-04)', () => {
  it('loads and expands; the heightfield finds a resampled tile for every cell', () => {
    const db = db12(HILLS);
    const stage = db.stages[0];
    const terrain = stage.terrain;
    expect(terrain).not.toBeNull();
    if (terrain === null) return;
    expect([terrain.tileSize, terrain.rows]).toEqual([SIZE, ROWS]);
    expect(terrain.cols).toBe(stageMapWidth(LENGTH, SIZE));
    const tables = db.tilesets[0].tables;
    const used = new Set(terrain.tiles);
    for (const name of ['floor', 'ceiling', 'slope-up', 'slope-down-low', 'ceil-slope-up-high']) {
      expect(used.has(tables.byName.get(name) ?? -1), name).toBe(true);
    }
  });

  it('gives the World a 12-px map the queries read pixel-exactly', () => {
    const db = db12(HILLS);
    const w = world(db);
    const map = w.terrain;
    const terrain = db.stages[0].terrain;
    expect(map?.tileSize).toBe(SIZE);
    if (map === null || terrain === null) return;
    expect(w.view.terrain?.tileSize).toBe(SIZE);
    const tileset = db.tilesets[0];
    for (let x = 0; x < 2 * PLAYFIELD_W; x += 3) {
      let surface = Number.NaN;
      for (let y = 0; y < ROWS * SIZE; y++) {
        const want = pixel(terrain, tileset, x, y);
        expect(terrainAt(map, x, y), `${x},${y}`).toBe(want);
        // The floor below the cave's middle: the first rock under the ceiling's lowest reach.
        if (y >= PLAYFIELD_H / 2 && surface !== surface && want !== TerrainType.Empty) surface = y;
      }
      expect(surface, `a floor under column ${x}`).not.toBeNaN();
      expect(findFloor(map, x, PLAYFIELD_H / 2, PLAYFIELD_H), String(x)).toBe(surface);
    }
  });

  it('kills the ship on the 12-px floor, where the floor is', () => {
    const w = world(db12());
    const input = createInputSnapshot();
    const ship = w.players[0];
    const top = ROWS * SIZE - 48; // the flat floor's surface
    let tick = 0;
    for (; tick < 600 && ship.hits === 0; tick++) {
      commitPlayerInput(input.players[0], Action.Down);
      stepWorld(w, input);
    }
    expect(ship.hits).toBe(1);
    expect(ship.hitCause).toBe(PlayerHitCause.Terrain);
    // The KESTREL's terrain box (half height 3) touched the surface on its last step down. A
    // faster step (the ported world) snaps the box right onto the surface, so the bottom edge
    // reaches `top` exactly rather than strictly past it.
    expect(ship.y + 3).toBeGreaterThanOrEqual(top);
    expect(ship.y + 3).toBeLessThan(top + v1rel(8));
  });

  it('runs deterministically', () => {
    const db = db12(HILLS);
    const a = world(db, 4);
    const b = world(db, 4);
    a.debugFlags.godMode = true;
    b.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const masks = [Action.Down, Action.Up | Action.Right, 0, Action.Left];
    for (let i = 0; i < 2000; i++) {
      commitPlayerInput(input.players[0], masks[(i >> 5) % masks.length]);
      stepWorld(a, input);
      stepWorld(b, input);
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.camera.x).toBe(2000);
  });

  it('takes moving blocks in whole 12-px tiles', () => {
    const block = { x: 10, type: 'block', y: 24, w: 2 * SIZE, h: 3 * SIZE, vx: -1 };
    const db = db12(undefined, [block]);
    const event = db.stages[0].events[0] as unknown as { tileId: number; w: number };
    expect(event.w).toBe(2 * SIZE);
    expect(event.tileId).toBe(db.tilesets[0].tables.byName.get('solid'));
  });
});
