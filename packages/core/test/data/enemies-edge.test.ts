/**
 * Edge cases of the `enemies` content kind and the enemy fields of stage events (plan M1-08):
 *
 * - optional enemy fields get their defaults at load, so every spec has every field (the
 *   same keys in the same order — the enemy system compiles them per spec);
 * - `child` resolves to `childId` (an unknown child is an issue, a self-reference is allowed);
 * - every mover variant validates with its parameters, and the bounds of each are reported at
 *   the mover's path (including missing parameters and unknown fields);
 * - the code tables (`ENEMY_GROUNDS`, `ENEMY_EXPLOSIONS`, `ENEMY_DROPS`, `MOVER_TYPES`) are
 *   frozen and ordered the way the enemy system encodes them;
 * - stage `spawn` / `formation` events: `screenX` bounds (negative = behind the view), formation
 *   `drop` (`null` or `capsule`) and `bonus` bounds.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTLE_TICKS,
  ENEMY_DROPS,
  ENEMY_EXPLOSIONS,
  ENEMY_GROUNDS,
  MOVER_TYPES,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';

/**
 * A minimal enemy entry.
 *
 * @param id - Enemy id.
 * @param over - Fields to add or replace.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 1,
    score: 10,
    hurtbox: { hw: 3, hh: 3 },
    script: 'drifter.sine',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/**
 * An `enemies` file.
 *
 * @param enemies - The entries.
 * @returns The file.
 */
function enemiesFile(enemies: unknown[]): ContentFile {
  return { path: 'enemies/e.enemies.json', data: { formatVersion: 1, kind: 'enemies', enemies } };
}

/**
 * The issues of one enemy entry with a given mover.
 *
 * @param mover - The mover object.
 * @returns The issues.
 */
function moverIssues(mover: unknown): readonly ValidationIssue[] {
  return loadContent([enemiesFile([enemy('m', { mover })])]).issues;
}

describe('core/data enemies — defaults and references', () => {
  it('fills every optional field with its default', () => {
    const { db, issues } = loadContent([enemiesFile([enemy('bare')])]);
    expect(issues).toEqual([]);
    expect(db.enemies[0]).toMatchObject({
      anim: { frames: 1, ticks: 1 },
      params: {},
      mover: null,
      drop: null,
      ground: null,
      settleTicks: DEFAULT_SETTLE_TICKS,
      explosion: 'small',
      megaCrashImmune: false,
      child: null,
      childId: -1,
    });
    expect(DEFAULT_SETTLE_TICKS).toBe(30);
    expect(db.enemies[0]).not.toHaveProperty('rank');
  });

  it('gives every spec the same fields, whichever optional ones the file had', () => {
    const { db, issues } = loadContent([
      enemiesFile([
        enemy('bare'),
        enemy('full', {
          anim: { frames: 4, ticks: 3 },
          params: { speed: 2 },
          mover: { type: 'straight', vx: -1, vy: 0 },
          drop: 'capsule',
          ground: 'ceiling',
          settleTicks: 0,
          explosion: 'large',
          megaCrashImmune: true,
          child: 'bare',
        }),
      ]),
    ]);
    expect(issues).toEqual([]);
    const keys = (i: number): string[] =>
      Object.keys(db.enemies[i])
        .filter((k) => k !== 'rank')
        .sort();
    expect(keys(0)).toEqual(keys(1));
    expect(db.enemies[1]).toMatchObject({
      settleTicks: 0,
      explosion: 'large',
      ground: 'ceiling',
      megaCrashImmune: true,
      childId: 0,
    });
  });

  it('resolves `child` across files and to itself; an unknown child is an issue', () => {
    const { db, issues } = loadContent([
      enemiesFile([
        enemy('hatch', { child: 'larva' }),
        enemy('splitter', { child: 'splitter' }),
        enemy('broken', { child: 'nobody' }),
      ]),
      {
        path: 'enemies/f.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: [enemy('larva')] },
      },
    ]);
    expect(issues).toEqual([
      { path: 'enemies/e.enemies.json:enemies[2].child', message: 'unknown enemy id "nobody"' },
    ]);
    const byId = (id: string) => db.enemies[db.enemyIndex.get(id) ?? -1];
    expect(byId('hatch').childId).toBe(db.enemyIndex.get('larva'));
    expect(byId('splitter').childId).toBe(db.enemyIndex.get('splitter'));
    expect(byId('broken').childId).toBe(-1);
  });

  it('checks params names and values, and anim / settle / explosion bounds', () => {
    const { issues } = loadContent([
      enemiesFile([
        enemy('a', { params: { speed: 'fast' } }),
        enemy('b', { params: { '9lives': 1 } }),
        enemy('c', { anim: { frames: 65, ticks: 1 } }),
        enemy('d', { anim: { frames: 2, ticks: 601 } }),
        enemy('e', { settleTicks: 36001 }),
        enemy('f', { megaCrashImmune: 'yes' }),
        enemy('g', { child: '' }),
      ]),
    ]);
    const at = (i: number, field: string) => 'enemies/e.enemies.json:enemies[' + i + '].' + field;
    expect(issues.map((i) => i.path)).toEqual([
      at(0, 'params.speed'),
      at(1, 'params.9lives'),
      at(2, 'anim.frames'),
      at(3, 'anim.ticks'),
      at(4, 'settleTicks'),
      at(5, 'megaCrashImmune'),
      at(6, 'child'),
    ]);
    expect(issues[6].message).toBe('must be a non-empty enemy id');
  });

  it('keeps the code tables frozen and in the order the enemy system encodes them', () => {
    expect(ENEMY_GROUNDS).toEqual(['floor', 'ceiling']);
    expect(ENEMY_EXPLOSIONS).toEqual(['small', 'medium', 'large']);
    expect(ENEMY_DROPS).toEqual(['capsule', 'blueCapsule', 'powerup']);
    expect(MOVER_TYPES).toEqual([
      'straight',
      'sine',
      'path',
      'waypoint',
      'follow',
      'groundCrawl',
      'homing',
      'aimedDash',
    ]);
    for (const table of [ENEMY_GROUNDS, ENEMY_EXPLOSIONS, ENEMY_DROPS, MOVER_TYPES]) {
      expect(Object.isFrozen(table)).toBe(true);
    }
  });
});

describe('core/data enemies — movers', () => {
  it('accepts every mover variant with its parameters (and the optional ones left out)', () => {
    const movers = [
      { type: 'straight', vx: -16, vy: 16 },
      { type: 'sine', vx: -1, amp: 256, period: 36000 },
      { type: 'sine', vx: 0, amp: 0, period: 1, phase: 1023 },
      { type: 'path', speed: 0 },
      { type: 'waypoint', x: -64, y: 264, speed: 0.01, hold: 0, leaveVx: -2, leaveVy: 0 },
      { type: 'waypoint', x: 448, y: -64, speed: 16, hold: 36000, leaveVx: 0, leaveVy: 16 },
      { type: 'follow' },
      { type: 'groundCrawl', speed: -16 },
      { type: 'homing', speed: 16, turnRate: 512 },
      { type: 'homing', speed: 0, turnRate: 0 },
      { type: 'aimedDash', speed: 3, windup: 0 },
    ];
    const { db, issues } = loadContent([
      enemiesFile(movers.map((mover, i) => enemy('m' + String(i), { mover }))),
    ]);
    expect(issues).toEqual([]);
    expect(db.enemies.map((e) => e.mover?.type)).toEqual(movers.map((m) => m.type));
    expect(db.enemies[1].mover).not.toHaveProperty('phase'); // stays absent (read as 0)
  });

  it.each([
    [{ type: 'straight', vx: -17, vy: 0 }, 'mover.vx', 'must be a finite number in -16..16'],
    [{ type: 'straight', vx: 0 }, 'mover.vy', 'is required'],
    [
      { type: 'sine', vx: 0, amp: -1, period: 10 },
      'mover.amp',
      'must be a finite number in 0..256',
    ],
    [
      { type: 'sine', vx: 0, amp: 1, period: 10, phase: 1024 },
      'mover.phase',
      'must be an integer in 0..1023',
    ],
    [{ type: 'path', speed: -1 }, 'mover.speed', 'must be a finite number in 0..16'],
    [{ type: 'path', path: '', speed: 1 }, 'mover.path', 'must be a non-empty path id'],
    [
      { type: 'waypoint', x: 449, y: 0, speed: 1, hold: 0, leaveVx: 0, leaveVy: 0 },
      'mover.x',
      'must be a finite number in -64..448',
    ],
    [
      { type: 'waypoint', x: 0, y: 0, speed: 0, hold: 0, leaveVx: 0, leaveVy: 0 },
      'mover.speed',
      'must be a finite number in 0.01..16',
    ],
    [
      { type: 'waypoint', x: 0, y: 0, speed: 1, hold: 1.5, leaveVx: 0, leaveVy: 0 },
      'mover.hold',
      'must be an integer in 0..36000',
    ],
    [{ type: 'follow', speed: 1 }, 'mover.speed', 'unknown field'],
    [{ type: 'groundCrawl' }, 'mover.speed', 'is required'],
    [{ type: 'homing', speed: 1, turnRate: 513 }, 'mover.turnRate', 'must be an integer in 0..512'],
    [{ type: 'aimedDash', speed: 1, windup: -1 }, 'mover.windup', 'must be an integer in 0..36000'],
  ])('reports the bounds of mover %j', (mover, field, message) => {
    expect(moverIssues(mover)).toEqual([
      { path: 'enemies/e.enemies.json:enemies[0].' + field, message },
    ]);
  });

  it('reports a mover that is not an object or has no type', () => {
    expect(moverIssues('sine')[0].path).toBe('enemies/e.enemies.json:enemies[0].mover');
    expect(moverIssues({ vx: 1 })[0].path).toBe('enemies/e.enemies.json:enemies[0].mover.type');
  });
});

describe('core/data stage events — enemy spawn fields', () => {
  /**
   * The issues of a stage with the given events (and one enemy, `e`).
   *
   * @param events - The events.
   * @returns The issues and the loaded events.
   */
  function stage(events: unknown[]): {
    issues: readonly ValidationIssue[];
    events: readonly unknown[];
  } {
    const { db, issues } = loadContent([
      enemiesFile([enemy('e')]),
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
          tilemap: null,
          events,
        },
      },
    ]);
    return { issues, events: db.stages[0]?.events ?? [] };
  }

  it('accepts screenX from behind the view to past it, drop null / capsule and bonus 0', () => {
    const { issues, events } = stage([
      { x: 0, type: 'spawn', enemy: 'e', screenX: -128 },
      { x: 1, type: 'spawn', enemy: 'e', screenX: 512, y: -64 },
      { x: 2, type: 'formation', enemy: 'e', count: 1, interval: 1, drop: null, bonus: 0 },
      {
        x: 3,
        type: 'formation',
        enemy: 'e',
        count: 64,
        interval: 600,
        drop: 'capsule',
        bonus: 1000000,
      },
      { x: 4, type: 'formation', enemy: 'e', count: 3, interval: 5 },
    ]);
    expect(issues).toEqual([]);
    expect(events[0]).toMatchObject({ screenX: -128, enemyId: 0, pathId: -1 });
    expect(events[2]).toMatchObject({ drop: null, bonus: 0 });
    expect(events[4]).not.toHaveProperty('drop'); // absent = the enemy system's default (capsule)
    expect(events[4]).not.toHaveProperty('screenX');
  });

  it('reports out-of-range spawn fields at the event path', () => {
    const { issues } = stage([
      { x: 0, type: 'spawn', enemy: 'e', screenX: -129 },
      { x: 1, type: 'spawn', enemy: 'e', screenX: 513 },
      { x: 2, type: 'formation', enemy: 'e', count: 0, interval: 1 },
      { x: 3, type: 'formation', enemy: 'e', count: 65, interval: 1 },
      { x: 4, type: 'formation', enemy: 'e', count: 2, interval: 0 },
      { x: 5, type: 'formation', enemy: 'e', count: 2, interval: 1, drop: 'item' },
      { x: 6, type: 'formation', enemy: 'e', count: 2, interval: 1, bonus: -1 },
      { x: 7, type: 'formation', enemy: 'e', count: 2, interval: 1, bonus: 2.5 },
      { x: 8, type: 'spawn', enemy: 'e', drop: 'capsule' },
    ]);
    const at = (i: number, field: string) => 'stages/s.stage.json:events[' + i + '].' + field;
    expect(issues.map((i) => i.path)).toEqual([
      at(0, 'screenX'),
      at(1, 'screenX'),
      at(2, 'count'),
      at(3, 'count'),
      at(4, 'interval'),
      at(5, 'drop'),
      at(6, 'bonus'),
      at(7, 'bonus'),
      at(8, 'drop'),
    ]);
    expect(issues[5].message).toBe('must be one of: capsule, blueCapsule, powerup');
    expect(issues[8].message).toBe('unknown field');
  });
});
