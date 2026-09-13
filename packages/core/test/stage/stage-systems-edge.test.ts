/**
 * Unit tests of the World-side stage gimmicks (plan M2-07, `core/stage` `./systems.ts`) against a
 * hand-built host — no World: {@link MovingBlockSystem} (compiling only valid `block` events, the
 * default / custom `screenX`, drift, table-sine swing and phase, the despawn margin, the lowest
 * free slot, a full table, the draw batch and its cap, the restart rescan with branches and the
 * reach margin) and {@link StageGimmicks} (pull fields — capacity, replacing, clamps, the pull
 * never overshooting, the view clamp, ships it ignores, timed fields, owners that die or whose
 * slot is reused —, chains — link clamps, capacity, even spacing, dead owners, no sprite —,
 * `placeTile` / `tileId` without terrain, `hitTerrain` events and points, `updateStage`'s probes
 * and keep-out rectangles by ship state, `clear` with and without a runner) and
 * {@link createStageGimmicks} for open space, a map without blocks and a missing chain sprite.
 */
import { describe, expect, it } from 'vitest';
import {
  DestructibleTerrain,
  TerrainBlocks,
  TerrainHit,
  TerrainType,
  type TerrainMap,
} from '../../src/collision/index.js';
import { PLAYFIELD_H, PLAYFIELD_W } from '../../src/config/index.js';
import { loadContent, type ContentDb, type StageSpec } from '../../src/data/index.js';
import { buildTilesetTables, type TilesetTables } from '../../src/data/tilemap.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import {
  FX_CUES,
  SFX_CUES,
  SimEventKind,
  createEventQueue,
  type EventQueue,
} from '../../src/events/index.js';
import { LayerId } from '../../src/presentation/index.js';
import { createScoreBoard, type ScoreBoard } from '../../src/scoring/index.js';
import {
  BLOCK_BATCH_CAPACITY,
  BLOCK_DESPAWN_MARGIN,
  MAX_CHAINS,
  MAX_CHAIN_LINKS,
  MAX_PULL_FIELDS,
  MovingBlockSystem,
  StageGimmicks,
  createStageGimmicks,
  createStageTerrain,
  type StageGimmicksHost,
} from '../../src/stage/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';

/** Tileset of the unit tests: 1 rock (frame 3), 2 brick (hp 2, 10 points), 3 lava (hazard). */
const TABLES: TilesetTables = buildTilesetTables(
  [
    { name: 'rock', type: 'solid', frame: 3, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    {
      name: 'brick',
      type: 'solid',
      frame: 4,
      anchor: 'floor',
      mask: [8, 8, 8, 8, 8, 8, 8, 8],
      hp: 2,
      score: 10,
    },
    { name: 'lava', type: 'hazard', frame: 5, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
  ],
  8,
);

/** A player ship as the gimmicks see it. */
interface FakeShip {
  active: boolean;
  state: string;
  x: number;
  y: number;
}

/** The fake World. */
interface FakeHost {
  tick: number;
  camera: { x: number; y: number; dx: number; dy: number; vx: number; vy: number };
  players: FakeShip[];
  ship: {
    margins: { left: number; right: number; top: number; bottom: number };
    terrainBox: { hw: number; hh: number };
  };
  events: EventQueue;
  scoring: { board: ScoreBoard };
}

/**
 * A fake World with two ships (player 2 inactive) and a camera at (0, 0).
 *
 * @returns The host.
 */
function host(): FakeHost {
  return {
    tick: 0,
    camera: { x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0 },
    players: [
      { active: true, state: 'alive', x: 100, y: 100 },
      { active: false, state: 'dead', x: 0, y: 0 },
    ],
    ship: {
      margins: { left: 8, right: 16, top: 12, bottom: 12 },
      terrainBox: { hw: 5, hh: 3 },
    },
    events: createEventQueue(),
    scoring: { board: createScoreBoard(2) },
  };
}

/**
 * A live enemy as the gimmicks see it.
 *
 * @param slot - Its slot.
 * @param x - World x.
 * @param y - World y.
 * @param spawnTick - Its spawn tick.
 * @returns The enemy.
 */
function enemy(slot: number, x: number, y: number, spawnTick = 0): Enemy {
  return { slot, x, y, spawnTick, state: EnemyState.Live } as unknown as Enemy;
}

/**
 * A 12 × 6 map over {@link TABLES}.
 *
 * @param rows - Rows (`.` empty, `r` rock, `b` brick).
 * @returns The map (with block slots).
 */
function makeMap(rows: string[]): TerrainMap {
  const cols = rows[0].length;
  const tiles = new Uint8Array(cols * rows.length);
  const ids: Record<string, number> = { '.': 0, r: 1, b: 2, l: 3 };
  rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++) tiles[r * cols + c] = ids[row[c]];
  });
  return {
    tileSize: 8,
    cols,
    rows: rows.length,
    tiles,
    tileType: TABLES.type,
    tileAnchor: TABLES.anchor,
    tileMask: TABLES.mask,
    blocks: new TerrainBlocks(4),
  };
}

/**
 * Gimmicks over a fake host.
 *
 * @param h - The host.
 * @param enemies - Enemy slots.
 * @param options - Terrain rows (destructible terrain) and moving blocks.
 * @returns The gimmicks.
 */
function gimmicks(
  h: FakeHost,
  enemies: Enemy[],
  options: { rows?: string[]; blocks?: MovingBlockSystem; chainSprite?: number } = {},
): StageGimmicks {
  const map = options.rows === undefined ? null : makeMap(options.rows);
  const d =
    map === null ? null : new DestructibleTerrain(map, map.tiles.slice(), TABLES.hp, TABLES.regen);
  return new StageGimmicks(
    h as unknown as StageGimmicksHost,
    enemies,
    d,
    options.blocks ?? null,
    map === null ? null : TABLES,
    options.chainSprite ?? 7,
  );
}

/**
 * A stage holding only the given events (what the block system reads).
 *
 * @param events - Events (block events need `tileId`).
 * @returns The stage.
 */
function blockStage(events: Record<string, unknown>[]): StageSpec {
  return { events } as unknown as StageSpec;
}

/**
 * Drains a host's events as `[kind, id, x, y]`.
 *
 * @param h - The host.
 * @returns The events.
 */
function drain(h: FakeHost): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  h.events.drain((e) => out.push([e.kind, e.id, e.x, e.y]));
  return out;
}

describe('core/stage MovingBlockSystem — unit', () => {
  it('compiles only block events with a valid tile, and spawns into the lowest free slot', () => {
    const blocks = new TerrainBlocks(2);
    const system = new MovingBlockSystem(
      blockStage([
        { x: 10, type: 'music' },
        { x: 20, type: 'block', y: 40, w: 16, h: 8, tileId: 1 },
        { x: 30, type: 'block', y: 40, w: 16, h: 8, tileId: 0 },
        { x: 40, type: 'block', y: 40, w: 16, h: 8, tileId: 99 },
        { x: 50, type: 'block', y: 40, w: 8, h: 8, tileId: 3, screenX: 16 },
        { x: 60, type: 'block', y: 40, w: 8, h: 8, tileId: 2 },
      ]),
      blocks,
      TABLES,
      9,
      8,
    );
    for (const index of [-1, 0, 2, 3, 6, Number.NaN])
      expect(system.spawn(index), String(index)).toBe(-1);
    expect(system.spawn(1)).toBe(0);
    // Default screenX 400: the left edge is world x 20 + 400.
    expect([blocks.x0[0], blocks.y0[0], blocks.x1[0], blocks.y1[0]]).toEqual([420, 40, 435, 47]);
    expect(blocks.type[0]).toBe(TerrainType.Solid);
    expect(system.spawn(4)).toBe(1);
    expect([blocks.x0[1], blocks.type[1]]).toEqual([66, TerrainType.Hazard]); // 50 + 16, lava
    expect(system.spawn(5)).toBe(-1); // full
    system.clear();
    expect([blocks.count, system.batch.count]).toEqual([0, 0]);
    expect(Array.from(system.slotEvent)).toEqual([-1, -1]);
    expect(system.spawn(5)).toBe(0);
  });

  it('drifts and swings on the sine table by age and phase', () => {
    const blocks = new TerrainBlocks(4);
    const system = new MovingBlockSystem(
      blockStage([
        { x: 0, type: 'block', screenX: 100, y: 50, w: 8, h: 8, tileId: 1, vx: -0.25, vy: 0.5 },
        { x: 0, type: 'block', screenX: 100, y: 50, w: 8, h: 8, tileId: 1, dy: 20, period: 4 },
        {
          x: 0,
          type: 'block',
          screenX: 100,
          y: 50,
          w: 8,
          h: 8,
          tileId: 1,
          dx: 10,
          period: 8,
          phase: 256,
        },
      ]),
      blocks,
      TABLES,
      9,
      8,
    );
    const camera = { x: 0, y: 0 } as never;
    system.spawn(0);
    system.spawn(1);
    system.spawn(2);
    // Age 0: the phase-256 block starts a quarter turn in (sin = 1).
    expect([blocks.x0[0], blocks.y0[0]]).toEqual([100, 50]);
    expect([blocks.x0[1], blocks.y0[1]]).toEqual([100, 50]);
    expect([blocks.x0[2], blocks.y0[2]]).toEqual([110, 50]);
    const seen: number[][] = [];
    for (let age = 1; age <= 4; age++) {
      system.update(camera);
      expect(system.slotAge[0]).toBe(age);
      seen.push([blocks.x0[0], blocks.y0[0], blocks.y0[1], blocks.x0[2]]);
    }
    // Drift floors to whole pixels (99.75 → 99, 50.5 → 50); period 4: 50 + 20·sin(k/4 turn).
    expect(seen).toEqual([
      [99, 50, 70, 107],
      [99, 51, 50, 100],
      [99, 51, 30, 92],
      [99, 52, 50, 90],
    ]);
  });

  it('removes a block once its right edge is more than the margin behind the view', () => {
    const blocks = new TerrainBlocks(2);
    const system = new MovingBlockSystem(
      blockStage([{ x: 0, type: 'block', screenX: 0, y: 0, w: 16, h: 8, tileId: 1 }]),
      blocks,
      TABLES,
      9,
      8,
    );
    system.spawn(0); // x 0 … 15
    const camera = { x: 15 + BLOCK_DESPAWN_MARGIN + 0.9, y: 0 };
    system.update(camera as never); // floor(camera.x) − margin = 15: not behind yet
    expect(system.slotEvent[0]).toBe(0);
    camera.x = 16 + BLOCK_DESPAWN_MARGIN;
    system.update(camera as never);
    expect(system.slotEvent[0]).toBe(-1);
    expect(blocks.count).toBe(0);
  });

  it('draws every tile of every block, without a frame or sprite nothing, capped at the batch', () => {
    const blocks = new TerrainBlocks(8);
    const events = [
      { x: 0, type: 'block', screenX: 0, y: 8, w: 24, h: 16, tileId: 1 },
      { x: 0, type: 'block', screenX: 100, y: 0, w: 8, h: 8, tileId: 2 },
    ];
    const system = new MovingBlockSystem(blockStage(events), blocks, TABLES, 9, 8);
    expect(system.batch.layer).toBe(LayerId.Terrain);
    system.spawn(0);
    system.spawn(1);
    system.sync();
    expect(system.batch.count).toBe(7);
    const at = (i: number) => [
      system.batch.x[i],
      system.batch.y[i],
      system.batch.spriteId[i],
      system.batch.frame[i],
    ];
    expect([at(0), at(2), at(3), at(5), at(6)]).toEqual([
      [0, 8, 9, 3],
      [16, 8, 9, 3],
      [0, 16, 9, 3],
      [16, 16, 9, 3],
      [100, 0, 9, 4],
    ]);
    // A tile without a frame is not drawn; neither is anything without a tileset sprite.
    const noFrame = { ...TABLES, frame: Int16Array.from([-1, -1, 4, 5]) };
    const hidden = new MovingBlockSystem(blockStage(events), new TerrainBlocks(8), noFrame, 9, 8);
    hidden.spawn(0);
    hidden.spawn(1);
    hidden.sync();
    expect(hidden.batch.count).toBe(1);
    const unsprited = new MovingBlockSystem(
      blockStage(events),
      new TerrainBlocks(8),
      TABLES,
      -1,
      8,
    );
    unsprited.spawn(0);
    unsprited.sync();
    expect(unsprited.batch.count).toBe(0);
    // Five 8 × 8-tile blocks: 320 tiles, the batch holds 256.
    const big = Array.from({ length: 5 }, () => ({
      x: 0,
      type: 'block',
      screenX: 0,
      y: 0,
      w: 64,
      h: 64,
      tileId: 1,
    }));
    const capped = new MovingBlockSystem(blockStage(big), new TerrainBlocks(8), TABLES, 9, 8);
    for (let i = 0; i < 5; i++) capped.spawn(i);
    capped.sync();
    expect(capped.batch.count).toBe(BLOCK_BATCH_CAPACITY);
  });

  it('respawns, after a restart, the blocks before the camera that are active and in reach', () => {
    const blocks = new TerrainBlocks(8);
    const system = new MovingBlockSystem(
      blockStage([
        { x: 100, type: 'block', screenX: 0, y: 0, w: 16, h: 8, tileId: 1 }, // right edge 115
        { x: 300, type: 'block', y: 0, w: 8, h: 8, tileId: 1 },
        { x: 400, type: 'block', y: 0, w: 8, h: 8, tileId: 1 }, // inactive
        { x: 500, type: 'block', y: 0, w: 8, h: 8, tileId: 1 }, // at the camera: its event re-fires
      ]),
      blocks,
      TABLES,
      9,
      8,
    );
    const seen: number[] = [];
    system.respawnBefore(115 + BLOCK_DESPAWN_MARGIN, (i) => {
      seen.push(i);
      return i !== 2;
    });
    // At camera 243 the first block's right edge (115) is exactly the margin behind: kept.
    expect(Array.from(system.slotEvent).filter((e) => e >= 0)).toEqual([0]);
    system.clear();
    system.respawnBefore(500, (i) => i !== 2);
    expect(Array.from(system.slotEvent).filter((e) => e >= 0)).toEqual([1]);
    system.clear();
    system.respawnBefore(116 + BLOCK_DESPAWN_MARGIN, () => true);
    expect(Array.from(system.slotEvent).filter((e) => e >= 0)).toEqual([]);
    expect(seen).toEqual([0]);
    expect(system.slotAge.every((a) => a === 0)).toBe(true);
  });
});

describe('core/stage StageGimmicks — pull fields', () => {
  it(`holds at most ${MAX_PULL_FIELDS} fields; a second pull of an owner replaces its field`, () => {
    const h = host();
    const owners = Array.from({ length: MAX_PULL_FIELDS + 1 }, (_, i) => enemy(i, 0, 0));
    const g = gimmicks(h, owners);
    for (let i = 0; i < MAX_PULL_FIELDS; i++) expect(g.pull(owners[i], 10, 1, 0)).toBe(true);
    expect(g.pull(owners[MAX_PULL_FIELDS], 10, 1, 0)).toBe(false);
    expect(g.pull(owners[3], 50, 2, 30)).toBe(true);
    expect([g.fieldRadius[3], g.fieldStrength[3], g.fieldTicks[3]]).toEqual([50, 2, 30]);
    g.release(owners[3]);
    expect(g.fieldOwner[3]).toBe(-1);
    expect(g.pull(owners[MAX_PULL_FIELDS], 10, 1, 0)).toBe(true);
    expect(g.fieldOwner[3]).toBe(MAX_PULL_FIELDS);
    g.release(enemy(99, 0, 0)); // no field: nothing
    expect(Array.from(g.fieldOwner).every((o) => o >= 0)).toBe(true);
  });

  it('clamps radius and strength to ≥ 0 and floors the ticks (≤ 0 = while the owner lives)', () => {
    const g = gimmicks(host(), [enemy(0, 0, 0)]);
    g.pull(enemy(0, 0, 0), -5, -1, 2.9);
    expect([g.fieldRadius[0], g.fieldStrength[0], g.fieldTicks[0]]).toEqual([0, 0, 2]);
    g.pull(enemy(0, 0, 0), 5, 1, -3);
    expect(g.fieldTicks[0]).toBe(-1);
  });

  it('pulls living ships in reach by the strength, never past the owner, then clamps to the view', () => {
    const h = host();
    const owner = enemy(0, 130, 100);
    const g = gimmicks(h, [owner]);
    g.pull(owner, 40, 4, 0);
    const ship = h.players[0];
    g.applyFields();
    expect([ship.x, ship.y]).toEqual([104, 100]);
    ship.x = 128.5; // 1.5 px away: it lands on the owner, no further
    g.applyFields();
    expect(ship.x).toBe(130);
    g.applyFields(); // on the owner: untouched (no direction)
    expect([ship.x, ship.y]).toEqual([130, 100]);
    // Exactly at the radius: pulled; beyond it: not.
    ship.x = 90;
    g.applyFields();
    expect(ship.x).toBe(94);
    ship.x = 89.9;
    g.applyFields();
    expect(ship.x).toBe(89.9);
    // A diagonal pull moves along the line to the owner.
    ship.x = 130 - 24;
    ship.y = 100 - 32; // 40 px away at 3:4
    g.applyFields();
    expect(ship.x).toBeCloseTo(106 + 2.4, 9);
    expect(ship.y).toBeCloseTo(68 + 3.2, 9);
    // The view clamp: an owner outside the view pulls the ship only up to the margin.
    const edge = enemy(0, -30, 100);
    const g2 = gimmicks(h, [edge]);
    g2.pull(edge, 100, 20, 0);
    ship.x = 10;
    ship.y = 100;
    g2.applyFields();
    expect(ship.x).toBe(h.ship.margins.left);
    const low = enemy(0, 100, PLAYFIELD_H + 40);
    const g3 = gimmicks(h, [low]);
    g3.pull(low, 100, 50, 0);
    ship.x = 100;
    ship.y = PLAYFIELD_H - 20;
    g3.applyFields();
    expect(ship.y).toBe(PLAYFIELD_H - h.ship.margins.bottom);
    expect(PLAYFIELD_W).toBeGreaterThan(0);
  });

  it('leaves inactive, entering, dying and dead ships alone', () => {
    const h = host();
    const owner = enemy(0, 120, 100);
    const g = gimmicks(h, [owner]);
    g.pull(owner, 100, 5, 0);
    const ship = h.players[0];
    for (const state of ['entering', 'dying', 'dead', 'respawning']) {
      ship.state = state;
      g.applyFields();
      expect(ship.x, state).toBe(100);
    }
    ship.state = 'alive';
    ship.active = false;
    g.applyFields();
    expect(ship.x).toBe(100);
    // Player 2 once it plays.
    const p2 = h.players[1];
    Object.assign(p2, { active: true, state: 'alive', x: 140, y: 100 });
    g.applyFields();
    expect(p2.x).toBe(135);
  });

  it('ends a timed field after its ticks, and a field whose owner is gone or replaced', () => {
    const h = host();
    const owners = [enemy(0, 120, 100), enemy(1, 120, 100)];
    const g = gimmicks(h, owners);
    g.pull(owners[0], 100, 1, 2);
    const ship = h.players[0];
    g.applyFields();
    g.applyFields();
    expect(g.fieldOwner[0]).toBe(-1);
    g.applyFields();
    expect(ship.x).toBe(102);
    g.pull(owners[0], 100, 1, 0);
    g.pull(owners[1], 100, 1, 0);
    (owners[0] as { state: number }).state = EnemyState.Removed;
    (owners[1] as { spawnTick: number }).spawnTick = 50; // the slot now holds another enemy
    g.applyFields();
    expect([g.fieldOwner[0], g.fieldOwner[1]]).toEqual([-1, -1]);
    expect(ship.x).toBe(102);
  });
});

describe('core/stage StageGimmicks — chains', () => {
  it(`clamps links to 1 … ${MAX_CHAIN_LINKS}, holds ${MAX_CHAINS} chains, replaces an owner's`, () => {
    const owners = Array.from({ length: MAX_CHAINS + 1 }, (_, i) => enemy(i, 0, 0));
    const g = gimmicks(host(), owners);
    expect(g.chain(owners[0], 0, 0, 0)).toBe(true);
    expect(g.chainLinks[0]).toBe(1);
    expect(g.chain(owners[0], 5, 6, 99)).toBe(true); // replaces
    expect([g.chainLinks[0], g.chainX[0], g.chainY[0]]).toEqual([MAX_CHAIN_LINKS, 5, 6]);
    expect(g.chain(owners[0], 0, 0, 3.7)).toBe(true);
    expect(g.chainLinks[0]).toBe(3);
    for (let i = 1; i < MAX_CHAINS; i++) expect(g.chain(owners[i], 0, 0, 2)).toBe(true);
    expect(g.chain(owners[MAX_CHAINS], 0, 0, 2)).toBe(false);
  });

  it('draws the links evenly from the anchor towards the owner, and drops a dead owner', () => {
    const h = host();
    const owner = enemy(0, 40, 80);
    const g = gimmicks(h, [owner], { chainSprite: 7 });
    expect(g.chainBatch.layer).toBe(LayerId.GroundEnemies);
    g.chain(owner, 0, 0, 4);
    g.sync();
    const b = g.chainBatch;
    expect(b.count).toBe(4);
    expect(Array.from(b.x.subarray(0, 4))).toEqual([0, 10, 20, 30]);
    expect(Array.from(b.y.subarray(0, 4))).toEqual([0, 20, 40, 60]);
    expect(b.spriteId[0]).toBe(7);
    (owner as { state: number }).state = EnemyState.Removed;
    g.sync();
    expect([b.count, g.chainOwner[0]]).toEqual([0, -1]);
  });

  it('keeps a chain without a sprite (nothing drawn) until its owner is gone', () => {
    const owner = enemy(0, 40, 80);
    const g = gimmicks(host(), [owner], { chainSprite: -1 });
    g.chain(owner, 0, 0, 4);
    g.sync();
    expect([g.chainBatch.count, g.chainOwner[0]]).toEqual([0, 0]);
  });
});

describe('core/stage StageGimmicks — terrain services', () => {
  it('does nothing to terrain in open space', () => {
    const g = gimmicks(host(), []);
    expect(g.destructible).toBeNull();
    expect(g.placeTile(10, 10, 1)).toBe(false);
    expect(g.tileId('rock')).toBe(-1);
    expect(g.hitTerrain(10, 10, 5, 0)).toBe(TerrainHit.None);
    g.updateStage(null);
    g.clear(null, 0);
    g.sync();
  });

  it('places tiles by world point and looks tile ids up by name', () => {
    const g = gimmicks(host(), [], { rows: ['.'.repeat(12), '.'.repeat(12)] });
    expect([g.tileId('rock'), g.tileId('brick'), g.tileId('lava'), g.tileId('nope')]).toEqual([
      1, 2, 3, -1,
    ]);
    expect(g.placeTile(-0.5, 3, 1)).toBe(false);
    expect(g.placeTile(3, Number.NaN, 1)).toBe(false);
    expect(g.placeTile(17.9, 9, 2)).toBe(true); // cell (2, 1)
    expect(g.destructible?.map.tiles[12 + 2]).toBe(2);
    expect(g.placeTile(96, 0, 1)).toBe(false); // column 12 of 12
  });

  it('reports a damaging hit with one hit sound at the cell centre', () => {
    const h = host();
    const g = gimmicks(h, [], { rows: ['....b.......', '............'] });
    expect(g.hitTerrain(33, 1, 1, 0)).toBe(TerrainHit.Damaged);
    expect(drain(h)).toEqual([[SimEventKind.Sfx, SFX_CUES.EnemyHit, 36, 4]]);
    expect(h.scoring.board.scores[0].score).toBe(0);
  });

  it('reports a break with its explosion and gives the tile points to the shooter only', () => {
    for (const [by, expected] of [
      [0, [10, 0]],
      [1, [0, 10]],
      [-1, [0, 0]],
    ] as const) {
      const h = host();
      const g = gimmicks(h, [], { rows: ['....b.......', '............'] });
      expect(g.hitTerrain(39, 7, 5, by)).toBe(TerrainHit.Destroyed);
      expect(drain(h)).toEqual([
        [SimEventKind.Sfx, SFX_CUES.EnemyExplodeSmall, 36, 4],
        [SimEventKind.Particles, FX_CUES.ExplosionSmall, 36, 4],
      ]);
      expect(
        h.scoring.board.scores.map((s) => s.score),
        String(by),
      ).toEqual(expected);
    }
    // Rock (no hp) and empty cells: nothing at all.
    const h = host();
    const g = gimmicks(h, [], { rows: ['r...........', '............'] });
    expect(g.hitTerrain(1, 1, 9, 0)).toBe(TerrainHit.None);
    expect(g.hitTerrain(20, 1, 9, 0)).toBe(TerrainHit.None);
    expect(drain(h)).toEqual([]);
  });

  it('gives no points for a destructible tile without a score', () => {
    const h = host();
    const map = makeMap(['b...........', '............']);
    const d = new DestructibleTerrain(map, map.tiles.slice(), TABLES.hp, TABLES.regen);
    const tables = { ...TABLES, score: new Uint16Array(4) };
    const g = new StageGimmicks(h as unknown as StageGimmicksHost, [], d, null, tables, -1);
    expect(g.hitTerrain(1, 1, 5, 0)).toBe(TerrainHit.Destroyed);
    expect(h.scoring.board.scores[0].score).toBe(0);
  });
});

describe('core/stage StageGimmicks — updateStage and clear', () => {
  /** A runner stand-in that records its probes. */
  const runner = (armed: number) => {
    const probes: { x: number; y: number }[] = [];
    return {
      probes,
      triggersArmed: armed,
      probe(point: { readonly x: number; readonly y: number }): number {
        probes.push({ x: point.x, y: point.y });
        return 0;
      },
      eventActive: () => true,
    };
  };

  it('probes armed triggers with the active living ships only', () => {
    const h = host();
    Object.assign(h.players[1], { active: true, state: 'entering', x: 50, y: 60 });
    const g = gimmicks(h, []);
    const idle = runner(0);
    g.updateStage(idle);
    expect(idle.probes).toEqual([]);
    const armed = runner(1);
    g.updateStage(armed);
    expect(armed.probes).toEqual([{ x: 100, y: 100 }]);
    h.players[1].state = 'alive';
    h.players[0].active = false;
    g.updateStage(armed);
    expect(armed.probes.slice(1)).toEqual([{ x: 50, y: 60 }]);
  });

  it('sets a keep-out box per active ship that is not dying or dead', () => {
    const h = host();
    const g = gimmicks(h, [], { rows: ['.'.repeat(12), '.'.repeat(12)] });
    const d = g.destructible;
    if (d === null) throw new Error('no terrain');
    h.players[0].x = 20.5;
    h.players[0].y = 10.25;
    g.updateStage(null);
    // terrainBox 5 × 3 half sizes: x 15.5 … 25.5 → 15 … 25, y 7.25 … 13.25 → 7 … 13.
    expect(d.keepOutCount).toBe(1);
    expect(Array.from(d.keepOut.subarray(0, 4))).toEqual([15, 7, 25, 13]);
    for (const [state, count] of [
      ['entering', 1],
      ['respawning', 1],
      ['dying', 0],
      ['dead', 0],
    ] as const) {
      h.players[0].state = state;
      g.updateStage(null);
      expect(d.keepOutCount, state).toBe(count);
    }
    h.players[0].state = 'alive';
    Object.assign(h.players[1], { active: true, state: 'alive', x: 60, y: 60 });
    g.updateStage(null);
    expect(d.keepOutCount).toBe(2);
  });

  it('moves the blocks every tick, with or without a runner', () => {
    const h = host();
    const blocks = new MovingBlockSystem(
      blockStage([{ x: 0, type: 'block', screenX: 50, y: 0, w: 8, h: 8, tileId: 1, vx: 1 }]),
      new TerrainBlocks(2),
      TABLES,
      9,
      8,
    );
    const g = gimmicks(h, [], { blocks });
    blocks.spawn(0);
    g.updateStage(null);
    g.updateStage(runner(0));
    expect([blocks.slotAge[0], blocks.blocks.x0[0]]).toEqual([2, 52]);
  });

  it('ends fields and chains, restores the tiles and respawns blocks only with a runner', () => {
    const h = host();
    const owner = enemy(0, 120, 100);
    const blocks = new MovingBlockSystem(
      blockStage([{ x: 0, type: 'block', screenX: 50, y: 0, w: 8, h: 8, tileId: 1 }]),
      new TerrainBlocks(2),
      TABLES,
      9,
      8,
    );
    const g = gimmicks(h, [owner], { rows: ['b'.repeat(12), '.'.repeat(12)], blocks });
    g.pull(owner, 50, 1, 0);
    g.chain(owner, 0, 0, 3);
    g.sync();
    blocks.spawn(0);
    g.hitTerrain(1, 1, 9, 0);
    expect(g.destructible?.map.tiles[0]).toBe(0);
    g.clear(null, 100);
    expect([g.fieldOwner[0], g.chainOwner[0], g.chainBatch.count]).toEqual([-1, -1, 0]);
    expect(g.destructible?.map.tiles[0]).toBe(2);
    expect(g.destructible?.resets).toBe(1);
    expect(blocks.slotEvent[0]).toBe(-1);
    g.clear(runner(0), 100);
    expect(blocks.slotEvent[0]).toBe(0);
  });
});

describe('core/stage createStageGimmicks', () => {
  /**
   * Content with a still stage (optionally with a tilemap and a block event).
   *
   * @param tilemap - Give the stage a tilemap.
   * @param block - Add a block event.
   * @param engine - Register the engine sprites (the chain link).
   * @returns The DB.
   */
  const content = (tilemap: boolean, block: boolean, engine = true): ContentDb => {
    const { db, issues } = loadContent(
      [
        {
          path: 'tilesets/rock.tileset.json',
          data: {
            formatVersion: 1,
            kind: 'tileset',
            id: 'rock',
            sprite: 'tiles/terrain-a',
            tileSize: 8,
            tiles: [
              {
                name: 'solid',
                type: 'solid',
                frame: 0,
                anchor: 'floor',
                mask: [8, 8, 8, 8, 8, 8, 8, 8],
              },
            ],
          },
        },
        {
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
            tilemap: tilemap
              ? { tileSize: 8, tileset: 'rock', rowsTall: 25, rle: new Array<string>(25).fill('') }
              : null,
            events: block ? [{ x: 10, type: 'block', y: 96, w: 8, h: 8 }] : [],
          },
        },
      ],
      engine ? { extraSprites: ENGINE_SPRITES } : {},
    );
    expect(issues).toEqual([]);
    return db;
  };

  it('builds nothing but empty tables in open space and free flight', () => {
    const db = content(false, false);
    const stage = db.stages[0];
    const h = host() as unknown as StageGimmicksHost;
    const open = createStageGimmicks(h, [], stage, createStageTerrain(stage, db), db);
    expect([open.destructible, open.blocks]).toEqual([null, null]);
    const free = createStageGimmicks(h, [], null, null, db);
    expect([free.destructible, free.blocks]).toEqual([null, null]);
    expect(free.tileId('solid')).toBe(-1);
  });

  it('gives a stage with a tilemap destructible terrain, and blocks only with block events', () => {
    const plain = content(true, false);
    const map = createStageTerrain(plain.stages[0], plain);
    expect(map?.blocks).toBeNull();
    const h = host() as unknown as StageGimmicksHost;
    const g = createStageGimmicks(h, [], plain.stages[0], map, plain);
    expect(g.destructible?.any).toBe(false);
    expect(g.destructible?.pristine).toBe(plain.stages[0].terrain?.tiles);
    expect(g.blocks).toBeNull();
    expect(g.tileId('solid')).toBe(1);
    const withBlocks = content(true, true);
    const blockMap = createStageTerrain(withBlocks.stages[0], withBlocks);
    const b = createStageGimmicks(h, [], withBlocks.stages[0], blockMap, withBlocks);
    expect(b.blocks?.blocks).toBe(blockMap?.blocks);
    expect(b.blocks?.spawn(0)).toBe(0);
  });

  it('draws no chain when the content lacks the chain sprite', () => {
    const db = content(false, false, false);
    const owner = enemy(0, 40, 40);
    const g = createStageGimmicks(host() as unknown as StageGimmicksHost, [owner], null, null, db);
    expect(g.chain(owner, 0, 0, 4)).toBe(true);
    g.sync();
    expect(g.chainBatch.count).toBe(0);
  });
});
