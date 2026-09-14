/**
 * Edge cases of the M2-07 content rules in `core/data`, beyond `stage-advanced-data.test.ts`:
 *
 * - tiles: `hp` / `regen` / `score` at their upper bounds, a breakable hazard tile;
 * - camera keys: a hold with a diagonal pan, `yOver` at its bounds;
 * - branches: `value` defaulting to `true`, more than {@link MAX_STAGE_BRANCHES}, an event of every
 *   type naming a branch, the flags of branches, triggers and `flag` events counted together against
 *   {@link MAX_STAGE_FLAGS};
 * - triggers: `until` exactly at the event's x (explicit and from the region), exactly
 *   {@link MAX_STAGE_TRIGGERS}, a region left of the world, region sizes below 1;
 * - blocks: exactly {@link MAX_BLOCK_CELLS} tiles, a decorative block tile, a tileset without the
 *   default `solid` tile, the numeric ranges of their motion fields;
 * - the `ballistic` mover's ranges.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_BLOCK_CELLS,
  MAX_STAGE_BRANCHES,
  MAX_STAGE_FLAGS,
  MAX_STAGE_TRIGGERS,
  STAGE_EVENT_TYPES,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';

/** A tile entry of the test tileset. */
function tile(name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    type: 'solid',
    frame: 0,
    anchor: 'floor',
    mask: [8, 8, 8, 8, 8, 8, 8, 8],
    ...over,
  };
}

/** The test tileset: solid rock, a decorative tile and a breakable hazard. */
const TILESET = {
  formatVersion: 1,
  kind: 'tileset',
  id: 'rock',
  sprite: 'tiles/terrain-a',
  tileSize: 8,
  tiles: [
    tile('solid'),
    tile('moss', { type: 'empty', mask: [0, 0, 0, 0, 0, 0, 0, 0] }),
    tile('thorns', { type: 'hazard', hp: 1, score: 5 }),
  ],
};

/**
 * A stage file over a minimal valid stage with a tilemap on the given tileset.
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
 * Loads a stage body with a tileset.
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

/**
 * The issues of a tileset holding one tile.
 *
 * @param fields - The tile's fields over a solid tile.
 * @returns The issue paths.
 */
function tileIssues(fields: Record<string, unknown>): string[] {
  return loadContent([
    { path: 'tilesets/rock.tileset.json', data: { ...TILESET, tiles: [tile('x', fields)] } },
  ]).issues.map((i) => i.path);
}

describe('core/data M2-07 edges — tiles', () => {
  it('accepts hp, regen and score at their upper bounds', () => {
    expect(tileIssues({ hp: 255, regen: 36000, score: 65535 })).toEqual([]);
    expect(tileIssues({ hp: 1, regen: 36001 })).toEqual([
      'tilesets/rock.tileset.json:tiles[0].regen',
    ]);
    expect(tileIssues({ hp: 1, score: 65536 })).toEqual([
      'tilesets/rock.tileset.json:tiles[0].score',
    ]);
    expect(tileIssues({ hp: 1.5 })).toEqual(['tilesets/rock.tileset.json:tiles[0].hp']);
  });

  it('makes a hazard breakable, a decorative tile never, and scores without hp', () => {
    const { db, issues } = load({});
    expect(issues).toEqual([]);
    const tables = db.tilesets[0].tables;
    expect(Array.from(tables.hp)).toEqual([0, 0, 0, 1]);
    expect(Array.from(tables.score)).toEqual([0, 0, 0, 5]);
    // A score alone (no hp) is allowed: the tile just never breaks.
    expect(tileIssues({ score: 7 })).toEqual([]);
  });
});

describe('core/data M2-07 edges — camera keys', () => {
  it('accepts a hold with a diagonal pan, and yOver within 1 … 1000000', () => {
    expect(
      issuesOf({
        camera: [
          { x: 0, speed: 1 },
          { x: 100, speed: 1, hold: 30, yTo: 40, yOver: 1 },
          { x: 200, speed: 1, yTo: 0, yOver: 1000000 },
        ],
      }),
    ).toEqual([]);
    expect(
      issuesOf({
        camera: [
          { x: 0, speed: 1 },
          { x: 100, speed: 1, yTo: 40, yOver: 0 },
          { x: 200, speed: 1, yTo: 40, yOver: 2.5 },
          { x: 300, speed: 1, hold: 36001 },
        ],
      }).map((i) => i.path),
    ).toEqual([
      'stages/s.stage.json:camera[1].yOver',
      'stages/s.stage.json:camera[2].yOver',
      'stages/s.stage.json:camera[3].hold',
    ]);
  });
});

describe('core/data M2-07 edges — branches and flags', () => {
  it('defaults a branch value to true and keeps an explicit false', () => {
    const { db, issues } = load({
      branches: [
        { id: 'a', flag: 'f' },
        { id: 'b', flag: 'f', value: false },
        { id: 'c', flag: 'f', value: true },
      ],
    });
    expect(issues).toEqual([]);
    expect(db.stages[0].branches.map((b) => b.value)).toEqual([true, false, true]);
    expect(db.stages[0].flagNames).toEqual(['f']);
  });

  it(`refuses more than ${MAX_STAGE_BRANCHES} branches`, () => {
    const branches = Array.from({ length: MAX_STAGE_BRANCHES + 1 }, (_, i) => ({
      id: `b${i}`,
      flag: 'f',
    }));
    expect(issuesOf({ branches }).map((i) => i.path)).toEqual(['stages/s.stage.json:branches']);
    expect(issuesOf({ branches: branches.slice(1) })).toEqual([]);
  });

  it('lets an event of every type name a branch', () => {
    const enemies: ContentFile = {
      path: 'enemies/e.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [
          {
            id: 'e',
            hp: 1,
            score: 0,
            hurtbox: { hw: 2, hh: 2 },
            script: 'x',
            sprite: 'enemies/rock',
            drop: null,
          },
        ],
      },
    };
    const branch = { branch: 'b' };
    const events = [
      { x: 1, type: 'spawn', enemy: 'e', ...branch },
      { x: 2, type: 'formation', enemy: 'e', count: 2, interval: 4, ...branch },
      { x: 3, type: 'warning', enemy: 'e', ...branch },
      { x: 4, type: 'boss', enemy: 'e', ...branch },
      { x: 5, type: 'music', cue: 'Boss', ...branch },
      { x: 6, type: 'speed', speed: 2, ...branch },
      { x: 7, type: 'flag', flag: 'g', ...branch },
      { x: 8, type: 'trigger', flag: 'g', region: { x: 0, y: 0, w: 8, h: 8 }, until: 8, ...branch },
      { x: 9, type: 'block', y: 0, w: 8, h: 8, ...branch },
      // M2-10: a hidden bonus-stage entrance.
      { x: 9, type: 'bonus', stage: 'bonus', entrance: 'digit', digit: 0, ...branch },
      { x: 10, type: 'end', ...branch },
    ];
    expect(new Set(events.map((e) => e.type))).toEqual(new Set(STAGE_EVENT_TYPES));
    const { db, issues } = loadContent([
      stageFile({ branches: [{ id: 'b', flag: 'f' }], events }),
      { path: 'tilesets/rock.tileset.json', data: TILESET },
      enemies,
    ]);
    // (The boss entry is not a boss spec; only the branch rules matter here.)
    expect(issues.filter((i) => i.path.endsWith('.branch'))).toEqual([]);
    expect(db.stages[0]?.events.every((e) => e.branchId === 0)).toBe(true);
  });

  it(`counts the flags of branches, triggers and flag events together (at most ${MAX_STAGE_FLAGS})`, () => {
    const make = (n: number) => {
      const branches = [];
      const events = [];
      for (let i = 0; i < n; i++) {
        const flag = `f${String(i).padStart(2, '0')}`;
        if (i % 3 === 0) branches.push({ id: `b${i}`, flag });
        else if (i % 3 === 1) events.push({ x: i, type: 'flag', flag });
        else events.push({ x: i, type: 'trigger', flag, region: { x: 400, y: 0, w: 8, h: 8 } });
      }
      return { branches, events };
    };
    expect(issuesOf(make(MAX_STAGE_FLAGS))).toEqual([]);
    expect(issuesOf(make(MAX_STAGE_FLAGS + 1))).toEqual([
      { path: 'stages/s.stage.json:events', message: 'uses 33 flags (at most 32)' },
    ]);
    // A flag named by several sources counts once.
    const { db } = load({
      branches: [{ id: 'b', flag: 'same' }],
      events: [
        { x: 1, type: 'flag', flag: 'same' },
        { x: 2, type: 'trigger', flag: 'same', region: { x: 400, y: 0, w: 8, h: 8 } },
      ],
    });
    expect(db.stages[0].flagNames).toEqual(['same']);
  });
});

describe('core/data M2-07 edges — triggers', () => {
  it('accepts until exactly at the event x, explicit or from the region', () => {
    expect(
      issuesOf({
        events: [
          { x: 100, type: 'trigger', flag: 'f', region: { x: 0, y: 0, w: 8, h: 8 }, until: 100 },
          { x: 108, type: 'trigger', flag: 'f', region: { x: 100, y: 0, w: 8, h: 8 } },
        ],
      }),
    ).toEqual([]);
    expect(
      issuesOf({
        events: [{ x: 109, type: 'trigger', flag: 'f', region: { x: 100, y: 0, w: 8, h: 8 } }],
      }).map((i) => i.path),
    ).toEqual(['stages/s.stage.json:events[0].until']);
  });

  it(`accepts exactly ${MAX_STAGE_TRIGGERS} triggers, regions left of the world, not empty ones`, () => {
    const events = [];
    for (let i = 0; i < MAX_STAGE_TRIGGERS; i++) {
      events.push({ x: i, type: 'trigger', flag: 'f', region: { x: 400, y: 0, w: 8, h: 8 } });
    }
    expect(issuesOf({ events })).toEqual([]);
    expect(
      issuesOf({
        events: [
          { x: 0, type: 'trigger', flag: 'f', region: { x: -4096, y: -4096, w: 5000, h: 5000 } },
        ],
      }),
    ).toEqual([]);
    expect(
      issuesOf({
        events: [
          { x: 0, type: 'trigger', flag: 'f', region: { x: 0, y: 0, w: 0, h: 8 } },
          { x: 0, type: 'trigger', flag: 'f', region: { x: 0, y: 0, w: 8, h: 0.5 } },
          { x: 0, type: 'trigger', flag: 'f', region: { x: -5000, y: 0, w: 8000, h: 8 } },
        ],
      }).map((i) => i.path),
    ).toEqual([
      'stages/s.stage.json:events[0].region.w',
      'stages/s.stage.json:events[1].region.h',
      'stages/s.stage.json:events[2].region.x',
    ]);
  });
});

describe('core/data M2-07 edges — blocks', () => {
  it(`accepts exactly ${MAX_BLOCK_CELLS} tiles and a decorative block tile`, () => {
    const { db, issues } = load({
      events: [
        { x: 10, type: 'block', y: 0, w: 64, h: 64 },
        { x: 20, type: 'block', y: 0, w: 512, h: 8 },
        { x: 30, type: 'block', y: 0, w: 8, h: 8, tile: 'moss' },
      ],
    });
    expect(issues).toEqual([]);
    expect(db.stages[0].events.map((e) => (e.type === 'block' ? e.tileId : -9))).toEqual([1, 1, 2]);
    expect(issuesOf({ events: [{ x: 10, type: 'block', y: 0, w: 520, h: 8 }] })).toEqual([
      { path: 'stages/s.stage.json:events[0].w', message: 'covers more than 64 tiles' },
    ]);
  });

  it('reports a missing default tile when the tileset has no `solid`', () => {
    const noSolid = { ...TILESET, tiles: [tile('granite')] };
    expect(load({ events: [{ x: 10, type: 'block', y: 0, w: 8, h: 8 }] }, noSolid).issues).toEqual([
      {
        path: 'stages/s.stage.json:events[0].tile',
        message: 'tileset "rock" has no tile named "solid"',
      },
    ]);
  });

  it('checks the ranges of the motion fields', () => {
    expect(
      issuesOf({
        events: [
          {
            x: 10,
            type: 'block',
            y: 0,
            w: 8,
            h: 8,
            screenX: -1024,
            vx: -16,
            vy: 16,
            dx: 1024,
            dy: -1024,
            period: 36000,
            phase: 1023,
          },
        ],
      }),
    ).toEqual([]);
    expect(
      issuesOf({
        events: [
          { x: 10, type: 'block', y: 0, w: 8, h: 8, period: 0 },
          { x: 10, type: 'block', y: 0, w: 8, h: 8, phase: 1024 },
          { x: 10, type: 'block', y: 0, w: 8, h: 8, dx: 1025 },
          { x: 10, type: 'block', y: 0, w: 8, h: 8, screenX: 4097 },
          { x: 10, type: 'block', y: 0, w: 0, h: 8 },
        ],
      }).map((i) => i.path),
    ).toEqual([
      'stages/s.stage.json:events[0].period',
      'stages/s.stage.json:events[1].phase',
      'stages/s.stage.json:events[2].dx',
      'stages/s.stage.json:events[3].screenX',
      'stages/s.stage.json:events[4].w',
    ]);
  });
});

describe('core/data M2-07 edges — the ballistic mover', () => {
  it('checks gravity, maxFall and trigger ranges', () => {
    const issues = (mover: Record<string, unknown>) =>
      loadContent([
        {
          path: 'enemies/e.enemies.json',
          data: {
            formatVersion: 1,
            kind: 'enemies',
            enemies: [
              {
                id: 'a',
                hp: 1,
                score: 0,
                hurtbox: { hw: 2, hh: 2 },
                script: 'rock.fall',
                sprite: 'enemies/rock',
                drop: null,
                mover: { type: 'ballistic', vx: 0, vy: 0, ...mover },
              },
            ],
          },
        },
      ]).issues.map((i) => i.path.replace('enemies/e.enemies.json:enemies[0].mover.', ''));
    expect(issues({ gravity: -1, maxFall: 16, trigger: 1024, land: 'pass' })).toEqual([]);
    expect(issues({ gravity: 1.01 })).toEqual(['gravity']);
    expect(issues({ maxFall: -0.5 })).toEqual(['maxFall']);
    expect(issues({ trigger: 1025 })).toEqual(['trigger']);
    expect(issues({ vx: undefined })).toEqual(['vx']);
  });
});
