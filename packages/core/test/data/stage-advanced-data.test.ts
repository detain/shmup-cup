/**
 * The M2-07 content of `core/data`: destructible tiles in tilesets (`hp`, `regen`, `score` → the
 * tileset tables), camera `hold` / `yOver` keys, stage branches and the `branch` of events,
 * `trigger` and `block` events (block tiles resolved against the tileset), the `ballistic` enemy
 * mover — and every validation issue those can raise.
 */
import { describe, expect, it } from 'vitest';
import {
  BALLISTIC_LANDS,
  MAX_BLOCK_CELLS,
  MAX_STAGE_TRIGGERS,
  STAGE_EVENT_TYPES,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';

/** A tileset with rock, a destructible brick, a regenerating tissue and a hazard. */
const TILESET = {
  formatVersion: 1,
  kind: 'tileset',
  id: 'rock',
  sprite: 'tiles/terrain-a',
  tileSize: 8,
  tiles: [
    { name: 'solid', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    {
      name: 'brick',
      type: 'solid',
      frame: 17,
      anchor: 'floor',
      mask: [8, 8, 8, 8, 8, 8, 8, 8],
      hp: 4,
      score: 10,
    },
    {
      name: 'tissue',
      type: 'solid',
      frame: 19,
      anchor: 'floor',
      mask: [8, 8, 8, 8, 8, 8, 8, 8],
      hp: 3,
      regen: 240,
    },
    { name: 'spikes', type: 'hazard', frame: 5, anchor: 'floor', mask: [2, 4, 6, 8, 8, 6, 4, 2] },
  ],
};

/**
 * A stage file over a minimal valid stage with a tilemap on the tileset above.
 *
 * @param body - Stage fields.
 * @returns The file.
 */
function stageFile(body: Record<string, unknown>): ContentFile {
  return {
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
      tilemap: { tileSize: 8, tileset: 'rock', rowsTall: 25, rle: new Array<string>(25).fill('') },
      events: [],
      ...body,
    },
  };
}

/**
 * Loads a stage body (and the tileset).
 *
 * @param body - Stage fields.
 * @param tileset - The tileset file's data.
 * @returns The load result.
 */
function load(body: Record<string, unknown>, tileset: unknown = TILESET) {
  return loadContent([stageFile(body), { path: 'tilesets/rock.tileset.json', data: tileset }]);
}

/**
 * The issues of a stage body.
 *
 * @param body - Stage fields.
 * @returns The issues.
 */
function issuesOf(body: Record<string, unknown>): readonly ValidationIssue[] {
  return load(body).issues;
}

describe('core/data — destructible tiles (M2-07)', () => {
  it('builds hp / regen / score tables by tile id', () => {
    const { db, issues } = load({});
    expect(issues).toEqual([]);
    const tables = db.tilesets[0].tables;
    expect(Array.from(tables.hp)).toEqual([0, 0, 4, 3, 0]);
    expect(Array.from(tables.regen)).toEqual([0, 0, 0, 240, 0]);
    expect(Array.from(tables.score)).toEqual([0, 0, 10, 0, 0]);
  });

  it('refuses hp on a decorative tile and regen without hp', () => {
    const tileset = {
      ...TILESET,
      tiles: [
        {
          name: 'deco',
          type: 'empty',
          frame: 0,
          anchor: 'floor',
          mask: [0, 0, 0, 0, 0, 0, 0, 0],
          hp: 2,
        },
        {
          name: 'wall',
          type: 'solid',
          frame: 0,
          anchor: 'floor',
          mask: [8, 8, 8, 8, 8, 8, 8, 8],
          regen: 9,
        },
      ],
    };
    expect(loadContent([{ path: 'tilesets/rock.tileset.json', data: tileset }]).issues).toEqual([
      {
        path: 'tilesets/rock.tileset.json:tiles[0].hp',
        message: 'an empty (decorative) tile cannot be destroyed',
      },
      {
        path: 'tilesets/rock.tileset.json:tiles[1].regen',
        message: 'needs hp (only destructible tiles regrow)',
      },
    ]);
  });

  it('checks hp, regen and score ranges', () => {
    const bad = (tile: Record<string, unknown>) =>
      loadContent([
        {
          path: 'tilesets/rock.tileset.json',
          data: {
            ...TILESET,
            tiles: [
              {
                name: 'x',
                type: 'solid',
                frame: 0,
                anchor: 'floor',
                mask: [8, 8, 8, 8, 8, 8, 8, 8],
                ...tile,
              },
            ],
          },
        },
      ]).issues.map((i) => i.path);
    expect(bad({ hp: 0 })).toEqual(['tilesets/rock.tileset.json:tiles[0].hp']);
    expect(bad({ hp: 256 })).toEqual(['tilesets/rock.tileset.json:tiles[0].hp']);
    expect(bad({ hp: 1, regen: 0 })).toEqual(['tilesets/rock.tileset.json:tiles[0].regen']);
    expect(bad({ hp: 1, score: -1 })).toEqual(['tilesets/rock.tileset.json:tiles[0].score']);
  });
});

describe('core/data — camera holds and diagonal pans (M2-07)', () => {
  it('accepts hold and yOver keys', () => {
    expect(
      issuesOf({
        camera: [
          { x: 0, speed: 1 },
          { x: 100, speed: 1, hold: 60, yTo: 40, yTicks: 30 },
          { x: 300, speed: 2, yTo: 0, yOver: 200 },
        ],
      }),
    ).toEqual([]);
  });

  it('refuses yOver without yTo or with yTicks, and a hold on a lock key', () => {
    expect(
      issuesOf({
        camera: [
          { x: 0, speed: 1 },
          { x: 100, speed: 1, yOver: 50 },
          { x: 200, speed: 1, yTo: 8, yTicks: 5, yOver: 50 },
          { x: 300, speed: 1, lock: true, hold: 5 },
          { x: 400, speed: 1, hold: 0 },
        ],
      }),
    ).toEqual([
      { path: 'stages/s.stage.json:camera[4].hold', message: 'must be an integer in 1..36000' },
    ]);
    expect(
      issuesOf({
        camera: [
          { x: 0, speed: 1 },
          { x: 100, speed: 1, yOver: 50 },
          { x: 200, speed: 1, yTo: 8, yTicks: 5, yOver: 50 },
          { x: 300, speed: 1, lock: true, hold: 5 },
        ],
      }),
    ).toEqual([
      { path: 'stages/s.stage.json:camera[1].yOver', message: 'needs yTo' },
      {
        path: 'stages/s.stage.json:camera[2].yOver',
        message: 'a pan is either yTicks or yOver, not both',
      },
      {
        path: 'stages/s.stage.json:camera[3].hold',
        message: 'a lock key cannot hold (it waits for unlock)',
      },
    ]);
  });
});

describe('core/data — branches and triggers (M2-07)', () => {
  it('numbers the flags of flag events, triggers and branches together', () => {
    const { db, issues } = load({
      branches: [{ id: 'b', flag: 'zeta' }],
      events: [
        { x: 10, type: 'flag', flag: 'mid' },
        { x: 20, type: 'trigger', flag: 'alpha', region: { x: 100, y: 0, w: 10, h: 10 } },
        { x: 30, type: 'end', branch: 'b' },
      ],
    });
    expect(issues).toEqual([]);
    const stage = db.stages[0];
    expect(stage.flagNames).toEqual(['alpha', 'mid', 'zeta']);
    expect(stage.branches).toEqual([{ id: 'b', flag: 'zeta', flagId: 2, value: true }]);
    expect(stage.events.map((e) => ('flagId' in e ? e.flagId : null))).toEqual([1, 0, null]);
    expect(stage.events.map((e) => e.branchId)).toEqual([-1, -1, 0]);
    expect(STAGE_EVENT_TYPES.slice(-2)).toEqual(['trigger', 'block']);
  });

  it('refuses duplicate branch ids, unknown branches and a trigger that disarms before it arms', () => {
    expect(
      issuesOf({
        branches: [
          { id: 'b', flag: 'f' },
          { id: 'b', flag: 'g' },
        ],
        events: [
          { x: 10, type: 'end', branch: 'nope' },
          {
            x: 500,
            type: 'trigger',
            flag: 'f',
            region: { x: 100, y: 0, w: 10, h: 10 },
          },
          {
            x: 600,
            type: 'trigger',
            flag: 'f',
            region: { x: 700, y: 0, w: 10, h: 10 },
            until: 599,
          },
        ],
      }),
    ).toEqual([
      { path: 'stages/s.stage.json:branches[1].id', message: 'duplicate branch "b"' },
      { path: 'stages/s.stage.json:events[0].branch', message: 'no branch "nope" in branches' },
      {
        path: 'stages/s.stage.json:events[1].until',
        message: 'must be >= x (the trigger disarms when the camera passes it)',
      },
      {
        path: 'stages/s.stage.json:events[2].until',
        message: 'must be >= x (the trigger disarms when the camera passes it)',
      },
    ]);
  });

  it(`allows at most ${MAX_STAGE_TRIGGERS} triggers`, () => {
    const events = [];
    for (let i = 0; i <= MAX_STAGE_TRIGGERS; i++) {
      events.push({ x: i, type: 'trigger', flag: 'f', region: { x: 400, y: 0, w: 8, h: 8 } });
    }
    expect(issuesOf({ events })).toEqual([
      { path: 'stages/s.stage.json:events', message: 'has 33 triggers (at most 32)' },
    ]);
  });
});

describe('core/data — moving blocks (M2-07)', () => {
  it('resolves the block tile (default solid) in the terrain pass', () => {
    const { db, issues } = load({
      events: [
        { x: 10, type: 'block', y: 96, w: 32, h: 8 },
        { x: 20, type: 'block', y: 96, w: 16, h: 16, tile: 'spikes', dy: 16, period: 60 },
      ],
    });
    expect(issues).toEqual([]);
    expect(db.stages[0].events.map((e) => (e.type === 'block' ? e.tileId : 0))).toEqual([1, 4]);
  });

  it('refuses blocks off the tile grid, too big, of unknown tiles or without a tilemap', () => {
    const size = Math.sqrt(MAX_BLOCK_CELLS) * 8 + 8;
    expect(
      issuesOf({
        events: [
          { x: 10, type: 'block', y: 0, w: 12, h: 8 },
          { x: 20, type: 'block', y: 0, w: size, h: size },
        ],
      }),
    ).toEqual([
      {
        path: 'stages/s.stage.json:events[0].w',
        message: 'w and h must be multiples of the tile size (8)',
      },
      { path: 'stages/s.stage.json:events[1].w', message: 'covers more than 64 tiles' },
    ]);
    // Tiles resolve in the terrain pass (a stage that passed its own checks).
    expect(
      issuesOf({ events: [{ x: 30, type: 'block', y: 0, w: 8, h: 8, tile: 'lava' }] }),
    ).toEqual([
      {
        path: 'stages/s.stage.json:events[0].tile',
        message: 'tileset "rock" has no tile named "lava"',
      },
    ]);
    expect(
      issuesOf({ tilemap: null, events: [{ x: 10, type: 'block', y: 0, w: 8, h: 8 }] }),
    ).toEqual([
      {
        path: 'stages/s.stage.json:events[0]',
        message: 'a block needs the stage to have a tilemap',
      },
    ]);
  });
});

describe('core/data — the ballistic mover (M2-07)', () => {
  it('accepts a ballistic mover with or without its optional fields', () => {
    const enemy = (id: string, mover: unknown) => ({
      id,
      hp: 1,
      score: 0,
      hurtbox: { hw: 2, hh: 2 },
      script: 'rock.fall',
      sprite: 'enemies/rock',
      drop: null,
      mover,
    });
    const { db, issues } = loadContent([
      {
        path: 'enemies/e.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('a', { type: 'ballistic', vx: -1, vy: -2 }),
            enemy('b', {
              type: 'ballistic',
              vx: 0,
              vy: 0,
              gravity: 0.2,
              maxFall: 3,
              trigger: 40,
              land: 'shatter',
            }),
          ],
        },
      },
    ]);
    expect(BALLISTIC_LANDS).toEqual(['pass', 'stop', 'shatter']);
    expect(issues).toEqual([]);
    expect(db.enemies[1].mover).toMatchObject({ type: 'ballistic', land: 'shatter', trigger: 40 });
    const bad = loadContent([
      {
        path: 'enemies/e.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [enemy('c', { type: 'ballistic', vx: 0, vy: 0, land: 'bounce' })],
        },
      },
    ]);
    expect(bad.issues).toEqual([
      {
        path: 'enemies/e.enemies.json:enemies[0].mover.land',
        message: 'must be one of: pass, stop, shatter',
      },
    ]);
  });
});
