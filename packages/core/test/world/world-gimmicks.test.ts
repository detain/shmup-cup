/**
 * The World running the advanced stage systems of plan M2-07: player shots break destructible
 * tiles (hit SFX, the break's explosion and points, the renderer's change log) and a checkpoint
 * restart rolls the terrain back; regenerating tiles grow back; moving blocks are terrain for
 * the ship, the shots and the view (drawn tile by tile) and come back after a restart; region
 * triggers fire from the ship and select the branch that follows; and the shipped
 * `gimmick-range` stage stays deterministic, restarts included.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { TerrainType, terrainAt } from '../../src/collision/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { FX_CUES, SFX_CUES, SimEventKind } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { LayerId } from '../../src/presentation/index.js';
import { KNOWN_SCRIPT_IDS } from '../../src/behaviors/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/** Tile ids of `terrain-a` (M2-07 appended brick 18, cube 19, tissue 20). */
const BRICK = 18;
const TISSUE = 20;

/**
 * The KESTREL, Type A, `terrain-a` and a still test stage with a floor (and optional RLE rows).
 *
 * @param stage - Stage fields over the defaults.
 * @returns The DB.
 */
function db(stage: Record<string, unknown> = {}): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 2000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 2384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [],
          ...stage,
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * RLE rows (25) with a column of one tile at a tile column over some rows.
 *
 * @param col - Tile column.
 * @param rows - Rows `[first, last]`.
 * @param tile - Tile id.
 * @returns The rows.
 */
function column(col: number, rows: [number, number], tile: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < 25; r++) out.push(r >= rows[0] && r <= rows[1] ? `${col}*0, ${tile}` : '');
  return out;
}

/**
 * A world on the test stage, flown in.
 *
 * @param content - Content.
 * @param seed - Seed.
 * @returns The world.
 */
function world(content: ContentDb, seed = 1): World {
  const w = createWorld(resolveGameConfig({ seed, stage: 't' }), content);
  run(w, createInputSnapshot(), 0, 45);
  return w;
}

/**
 * Steps a world with one held mask for player 1.
 *
 * @param w - The world.
 * @param input - Snapshot to reuse.
 * @param held - Held actions.
 * @param n - Ticks.
 */
function run(w: World, input: InputSnapshot, held: number, n: number): void {
  for (let i = 0; i < n; i++) {
    commitPlayerInput(input.players[0], held);
    stepWorld(w, input);
  }
}

/**
 * Drains the events into `[kind, id]` pairs.
 *
 * @param w - The world.
 * @returns The pairs.
 */
function drain(w: World): [number, number][] {
  const out: [number, number][] = [];
  w.events.drain((e) => out.push([e.kind, e.id]));
  return out;
}

describe('core/world — destructible terrain', () => {
  // A brick wall at x 160…167 (col 20), rows 10…14 (y 80…119): in front of the ship's row.
  const BRICKS = db({
    tilemap: { tileSize: 8, tileset: 'terrain-a', rowsTall: 25, rle: column(20, [10, 14], BRICK) },
  });

  it('lets the shots break the bricks: hit SFX, explosions, points, logged changes', () => {
    const w = world(BRICKS);
    const map = w.terrain;
    if (map === null) throw new Error('no terrain');
    const d = w.gimmicks.destructible;
    expect(d?.any).toBe(true);
    expect(w.view.terrain?.changes).toBe(d);
    expect(map.tiles[12 * map.cols + 20]).toBe(BRICK);
    w.players[0].y = 100;
    drain(w);
    const input = createInputSnapshot();
    run(w, input, Action.Shot, 300);
    // The ship's row (y ≈ 100 → row 12) is shot open; the score counts 10 per brick.
    expect(map.tiles[12 * map.cols + 20]).toBe(0);
    expect(terrainAt(map, 163, 100)).toBe(TerrainType.Empty);
    const broken = d?.destroyed ?? 0;
    expect(broken).toBeGreaterThanOrEqual(1);
    expect(w.scoring.board.scores[0].score).toBeGreaterThanOrEqual(10 * broken);
    const events = drain(w);
    expect(events).toContainEqual([SimEventKind.Sfx, SFX_CUES.EnemyHit]);
    expect(events).toContainEqual([SimEventKind.Particles, FX_CUES.ExplosionSmall]);
    expect(d?.count).toBeGreaterThanOrEqual(broken);
  });

  it('rolls the terrain back on a checkpoint restart', () => {
    const w = world(BRICKS);
    const map = w.terrain;
    const stage = w.stage;
    if (map === null || stage === null) throw new Error('no stage');
    const pristine = map.tiles.slice();
    w.players[0].y = 100;
    run(w, createInputSnapshot(), Action.Shot, 300);
    expect(map.tiles).not.toEqual(pristine);
    const resets = w.gimmicks.destructible?.resets ?? 0;
    stage.restartAt(0);
    expect(map.tiles).toEqual(pristine);
    expect(w.gimmicks.destructible?.resets).toBe(resets + 1);
    expect(w.gimmicks.destructible?.destroyed).toBe(0);
  });

  it('grows regenerating tissue back after its regen ticks', () => {
    const w = world(
      db({
        tilemap: {
          tileSize: 8,
          tileset: 'terrain-a',
          rowsTall: 25,
          rle: column(20, [10, 14], TISSUE),
        },
      }),
    );
    const map = w.terrain;
    if (map === null) throw new Error('no terrain');
    w.players[0].y = 100;
    const input = createInputSnapshot();
    let broken = -1;
    for (let t = 0; t < 300 && broken < 0; t++) {
      run(w, input, Action.Shot, 1);
      if (map.tiles[12 * map.cols + 20] === 0) broken = w.tick;
    }
    expect(broken).toBeGreaterThan(0);
    // Stop shooting: 240 ticks later the cell is tissue again.
    run(w, input, 0, 238);
    expect(map.tiles[12 * map.cols + 20]).toBe(0);
    run(w, input, 0, 4);
    expect(map.tiles[12 * map.cols + 20]).toBe(TISSUE);
  });

  it('keeps placed tiles off the ships even when no tile of the tileset has hp', () => {
    // `terrain-a` without any `hp`: a cube rush whose `cube` tile is plain solid terrain.
    const tileset = shipped('tilesets/terrain-a.tileset.json');
    const data = tileset.data as { id: string; tiles: Record<string, unknown>[] };
    const hard = {
      ...data,
      id: 'terrain-hard',
      tiles: data.tiles.map(({ hp: _hp, regen: _regen, score: _score, ...tile }) => tile),
    };
    const { db: content, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('weapons/type-a.weapons.json'),
        { path: 'tilesets/terrain-hard.tileset.json', data: hard },
        {
          path: 'stages/t.stage.json',
          data: {
            formatVersion: 1,
            kind: 'stage',
            id: 't',
            name: 'T',
            music: { stage: 'Stage', boss: 'Boss' },
            length: 2000,
            camera: [{ x: 0, speed: 0 }],
            checkpoints: [{ x: 0 }],
            parallax: [],
            tilemap: {
              tileSize: 8,
              tileset: 'terrain-hard',
              rowsTall: 25,
              rle: Array.from({ length: 25 }, () => ''),
            },
            events: [],
          },
        },
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    const w = world(content);
    const d = w.gimmicks.destructible;
    if (d === null) throw new Error('no destructible terrain');
    expect(d.any).toBe(false);
    expect(d.keepOutCount).toBe(1);
    const ship = w.players[0];
    const col = Math.floor(ship.x / 8);
    const row = Math.floor(ship.y / 8);
    const cube = w.gimmicks.tileId('cube');
    expect(cube).toBeGreaterThan(0);
    // Under the ship: refused (it would be buried); a few cells ahead: placed.
    expect(d.place(col, row, cube)).toBe(false);
    expect(w.terrain?.tiles[row * (w.terrain?.cols ?? 0) + col]).toBe(0);
    expect(d.place(col + 8, row, cube)).toBe(true);
  });
});

describe('core/world — moving blocks', () => {
  const BLOCKS = db({
    camera: [{ x: 0, speed: 0.5 }],
    checkpoints: [{ x: 0 }, { x: 100 }],
    events: [{ x: 50, type: 'block', screenX: 150, y: 90, w: 16, h: 8, dy: 20, period: 60 }],
  });

  it('are terrain wherever they swing, drawn tile by tile over the terrain grid', () => {
    const w = world(BLOCKS);
    const blocks = w.gimmicks.blocks;
    if (blocks === null || w.terrain === null) throw new Error('no blocks');
    expect(w.view.batches[w.view.batches.length - 1]).toBe(blocks.batch);
    expect(blocks.batch.layer).toBe(LayerId.Terrain);
    const input = createInputSnapshot();
    run(w, input, 0, 60); // camera x 52.5: the event at 50 fired
    expect(blocks.slotEvent[0]).toBe(0);
    const geometry = blocks.blocks;
    const ys = new Set<number>();
    for (let t = 0; t < 60; t++) {
      run(w, input, 0, 1);
      ys.add(geometry.y0[0]);
      expect(geometry.x0[0]).toBe(200); // world x 50 + 150
      expect(terrainAt(w.terrain, 205, geometry.y0[0] + 2)).toBe(TerrainType.Solid);
      expect(blocks.batch.count).toBe(2);
    }
    expect(Math.min(...ys)).toBe(70);
    expect(Math.max(...ys)).toBe(110);
  });

  it('kill the ship that touches them, as terrain', () => {
    const w = world(BLOCKS);
    const input = createInputSnapshot();
    run(w, input, 0, 60);
    const geometry = w.gimmicks.blocks?.blocks;
    if (geometry === undefined) throw new Error('no blocks');
    const ship = w.players[0];
    ship.x = 208;
    ship.y = geometry.y0[0] + 4;
    run(w, input, 0, 1);
    expect(ship.hitCause).toBe(PlayerHitCause.Terrain);
    expect(ship.state).toBe('dying');
  });

  it('come back at their start after a restart past their event (once)', () => {
    const w = world(BLOCKS);
    const stage = w.stage;
    const blocks = w.gimmicks.blocks;
    if (stage === null || blocks === null) throw new Error('no stage');
    run(w, createInputSnapshot(), 0, 300); // camera x ≈ 150
    stage.restartAt(1); // x 100: the block's event (50) lies before it
    expect(Array.from(blocks.slotEvent).filter((e) => e >= 0)).toEqual([0]);
    expect(blocks.slotAge[0]).toBe(0);
    stage.restartAt(0); // x 0: the event fires again on its own
    expect(blocks.blocks.count).toBe(0);
    run(w, createInputSnapshot(), 0, 120);
    expect(Array.from(blocks.slotEvent).filter((e) => e >= 0)).toEqual([0]);
  });
});

describe('core/world — region triggers and branches', () => {
  it('fires a trigger when the ship enters its region, and the branch it chose follows', () => {
    const content = db({
      camera: [{ x: 0, speed: 1 }],
      branches: [
        { id: 'high', flag: 'went-high' },
        { id: 'low', flag: 'went-high', value: false },
      ],
      events: [
        { x: 0, type: 'trigger', flag: 'went-high', region: { x: 0, y: 0, w: 2000, h: 60 } },
        { x: 400, type: 'music', cue: 'Boss', branch: 'high' },
        { x: 400, type: 'music', cue: 'Title', branch: 'low' },
      ],
    });
    const cue = (up: boolean): number[] => {
      const w = world(content);
      const input = createInputSnapshot();
      drain(w);
      run(w, input, up ? Action.Up : 0, 400);
      return drain(w)
        .filter(([kind]) => kind === SimEventKind.Music)
        .map(([, id]) => id);
    };
    const high = cue(true);
    const low = cue(false);
    expect(high).toHaveLength(1);
    expect(low).toHaveLength(1);
    expect(high[0]).not.toBe(low[0]);
  });
});

describe('core/world — the shipped gimmick-range stage', () => {
  const SHIPPED = (() => {
    const root = new URL('../../../../content/', import.meta.url);
    const files = [
      'player/kestrel.player.json',
      'weapons/type-a.weapons.json',
      'tilesets/terrain-a.tileset.json',
      'enemies/gimmick-range.enemies.json',
      'stages/gimmick-range.stage.json',
    ].map((path) => ({
      path,
      data: JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown,
    }));
    const { db: content, issues } = loadContent(files, {
      knownScripts: KNOWN_SCRIPT_IDS,
      extraSprites: ENGINE_SPRITES,
    });
    expect(issues).toEqual([]);
    return content;
  })();

  it('is deterministic with a weaving, shooting ship, a death penalty restart and a continue', () => {
    const session = (): number[] => {
      const w = createWorld(
        resolveGameConfig({ seed: 21, stage: 'gimmick-range', deathPenalty: 'arcade' }),
        SHIPPED,
      );
      const input = createInputSnapshot();
      const hashes: number[] = [];
      for (let t = 0; t < 4000; t++) {
        const phase = Math.floor(t / 90) % 4;
        const held =
          Action.Shot |
          (phase === 0 ? Action.Up : phase === 2 ? Action.Down : phase === 1 ? Action.Right : 0);
        commitPlayerInput(input.players[0], held);
        stepWorld(w, input);
        w.players[0].lives = 3;
        if (t === 2500) w.stage?.restartAt(1);
        if (t % 50 === 0) hashes.push(hashWorld(w));
      }
      return hashes;
    };
    const a = session();
    expect(session()).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(40);
  });
});
