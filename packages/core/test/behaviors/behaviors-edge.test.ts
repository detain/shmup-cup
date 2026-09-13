/**
 * Edge cases of `core/behaviors` (plan M1-08), beyond `behaviors.test.ts`:
 *
 * - `defineBehavior` copies and freezes its tunables; registries sort their ids whatever the
 *   order they were given in, are frozen, and may be empty;
 * - `KNOWN_SCRIPT_IDS` is duplicate-free and sorted; `checkEnemyBehaviors` with a custom
 *   registry, every unknown tunable in order, behaviours without tunables, and every roster
 *   behaviour accepting all of its own tunable names;
 * - the roster's documented details on hand-made content (default registry): `drifter.sine`'s
 *   per-member phase, `fan.loop` without a path, `turret.floor` turning only on its aim ticks
 *   (and on a ceiling), `walker.floor` choosing its direction at each walk start (left without
 *   a target) and walking a ceiling, `hatch.spawner` with `max: 0` (no limit), off screen (no
 *   release), on a ceiling (children leave downwards) and without a child, `rammer.aimed`'s
 *   timing and aim, `orbiter.loop`'s waypoint tunables, `carrier.straight`'s speed.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BEHAVIOR_DEFS,
  KNOWN_SCRIPT_IDS,
  checkEnemyBehaviors,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import { PLAYFIELD_W, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_UNITS, angleDelta, atan2B } from '../../src/math/index.js';
import {
  AIM_DIRECTIONS,
  BodyAnchor,
  MoverKind,
  SLEEP_FOREVER,
  type Script,
} from '../../src/patterns/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

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

/**
 * An enemy entry using a roster behaviour.
 *
 * @param id - Enemy id.
 * @param script - Behaviour id.
 * @param over - More fields.
 * @returns The entry.
 */
function enemy(
  id: string,
  script: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    hp: 5,
    score: 10,
    hurtbox: { hw: 4, hh: 4 },
    script,
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/** The roster enemies of the test content, with non-default tunables. */
const ENEMIES = [
  enemy('drifter', 'drifter.sine', {
    params: { speed: 1, amp: 10, period: 64, phase: 32, memberPhase: 100 },
  }),
  enemy('fan', 'fan.loop', { params: { speed: 2 } }),
  enemy('carrier', 'carrier.straight', { params: { speed: 0.5 } }),
  enemy('turret', 'turret.floor', { ground: 'floor', params: { aimTicks: 20 } }),
  enemy('turret-top', 'turret.floor', { ground: 'ceiling', params: { aimTicks: 20 } }),
  enemy('walker', 'walker.floor', {
    ground: 'floor',
    params: { speed: 1, walkTicks: 30, stopTicks: 10 },
  }),
  enemy('walker-top', 'walker.floor', {
    ground: 'ceiling',
    params: { speed: 1, walkTicks: 30, stopTicks: 10 },
  }),
  enemy('hatch', 'hatch.spawner', {
    ground: 'floor',
    child: 'larva',
    settleTicks: 0,
    params: { interval: 10, max: 0 },
  }),
  enemy('hatch-top', 'hatch.spawner', {
    ground: 'ceiling',
    child: 'larva',
    settleTicks: 0,
    params: { interval: 10, max: 2 },
  }),
  enemy('hatch-empty', 'hatch.spawner', {
    ground: 'floor',
    settleTicks: 0,
    params: { interval: 5 },
  }),
  enemy('larva', 'carrier.straight', { params: { speed: 0 } }),
  enemy('rammer', 'rammer.aimed', {
    mover: { type: 'straight', vx: -1, vy: 0 },
    params: { enterTicks: 15, windup: 5, speed: 3 },
  }),
  enemy('orbiter', 'orbiter.loop', {
    params: { speed: 2, x: 200, y: 50, hold: 12, leaveSpeed: 3 },
  }),
];

/**
 * Test content: KESTREL, the shipped tileset, the roster above and a stage with a flat floor
 * (surface at 168) and a flat ceiling (surface at 24).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'enemies/r.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: ENEMIES },
      },
      {
        path: 'stages/r.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'r',
          name: 'R',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 3000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [
                {
                  from: 0,
                  to: 3384,
                  floor: { base: 32, amp: 0, period: 64, seed: 1 },
                  ceiling: { base: 24, amp: 0, period: 64, seed: 2 },
                },
              ],
            },
          },
          events: [],
        },
      },
    ],
    { knownScripts: KNOWN_SCRIPT_IDS },
  );
  expect(issues).toEqual([]);
  expect(checkEnemyBehaviors(content).map((i) => i.path)).toEqual(['enemies:hatch-empty.child']);
  return content;
}

const DB = db();

/**
 * A world on the test stage with the default behaviours.
 *
 * @param ticks - Ticks to run first (41 = past the fly-in).
 * @returns The world.
 */
function world(ticks = 41): World {
  const w = createWorld(resolveGameConfig({ seed: 2, stage: 'r' }), DB);
  run(w, ticks);
  return w;
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * Spawns a test enemy at a world position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y (NaN = snap to the ground).
 * @returns The enemy.
 */
function put(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(DB.enemyIndex.get(id) ?? -1, x, y);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

/**
 * The live enemies of one spec.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns The enemies.
 */
function liveOf(w: World, id: string): Enemy[] {
  const index = DB.enemyIndex.get(id);
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
}

describe('core/behaviors edge — definitions and registries', () => {
  it('copies and freezes the tunables; needsChild defaults to false', () => {
    const params = { speed: 1 };
    const create = function* create(): Script {
      yield SLEEP_FOREVER;
    };
    const def = defineBehavior('x', params, create);
    params.speed = 99;
    expect(def.params).toEqual({ speed: 1 });
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.params)).toBe(true);
    expect(def.needsChild).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- identity check, never called
    expect(def.create).toBe(create);
    expect(defineBehavior('y', {}, create, true).needsChild).toBe(true);
  });

  it('sorts registry ids whatever the order given, and may be empty', () => {
    const make = (id: string) =>
      defineBehavior(id, {}, function* none(): Script {
        yield SLEEP_FOREVER;
      });
    const registry = createBehaviorRegistry([make('zeta'), make('alpha'), make('mid.dle')]);
    expect(registry.ids).toEqual(['alpha', 'mid.dle', 'zeta']);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.ids)).toBe(true);
    expect(registry.get('alpha')?.id).toBe('alpha');
    expect(registry.get('toString')).toBeUndefined();
    const empty = createBehaviorRegistry([]);
    expect(empty.ids).toEqual([]);
    expect(empty.get('drifter.sine')).toBeUndefined();
    expect(() => createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, make('fan.loop')])).toThrow(
      'behaviour "fan.loop" is defined twice',
    );
  });

  it('lists every known script id once, sorted', () => {
    expect(new Set(KNOWN_SCRIPT_IDS).size).toBe(KNOWN_SCRIPT_IDS.length);
    expect(KNOWN_SCRIPT_IDS).toEqual(KNOWN_SCRIPT_IDS.slice().sort());
    for (const id of BEHAVIOR_IDS) expect(KNOWN_SCRIPT_IDS).toContain(id);
    expect(BEHAVIOR_IDS).toEqual(DEFAULT_BEHAVIORS.ids);
  });
});

describe('core/behaviors edge — checkEnemyBehaviors', () => {
  /**
   * Loads enemies (scripts unchecked).
   *
   * @param enemies - Entries.
   * @returns The DB.
   */
  function load(enemies: unknown[]): ContentDb {
    const { db: content } = loadContent([
      { path: 'enemies/c.enemies.json', data: { formatVersion: 1, kind: 'enemies', enemies } },
    ]);
    return content;
  }

  it('accepts every tunable name of every roster behaviour', () => {
    const enemies = DEFAULT_BEHAVIOR_DEFS.map((def) =>
      enemy('e-' + def.id, def.id, { params: { ...def.params }, child: 'e-' + def.id }),
    );
    // `pattern.loop` also needs a pattern (M2-02): the one it names is reported missing.
    expect(checkEnemyBehaviors(load(enemies))).toEqual([
      {
        path: 'enemies:e-pattern.loop.pattern',
        message: 'behaviour "pattern.loop" needs a pattern',
      },
    ]);
  });

  it('checks against a custom registry, reporting every unknown name in order', () => {
    const registry = createBehaviorRegistry([
      defineBehavior('bare', {}, function* bare(): Script {
        yield SLEEP_FOREVER;
      }),
      defineBehavior(
        'spawns',
        { a: 1 },
        function* spawns(): Script {
          yield SLEEP_FOREVER;
        },
        true,
      ),
    ]);
    const content = load([
      enemy('one', 'bare', { params: { z: 1, y: 2 } }),
      enemy('two', 'spawns', { params: { a: 3 } }),
      enemy('three', 'spawns', { child: 'one' }),
      enemy('four', 'drifter.sine', { params: { nope: 1 } }), // not in this registry: skipped
    ]);
    expect(checkEnemyBehaviors(content, registry)).toEqual([
      { path: 'enemies:one.params.z', message: 'unknown param for behaviour "bare" (known: )' },
      { path: 'enemies:one.params.y', message: 'unknown param for behaviour "bare" (known: )' },
      { path: 'enemies:two.child', message: 'behaviour "spawns" needs a child enemy' },
    ]);
  });

  it('does not flag an inherited object property as a tunable', () => {
    const content = load([enemy('p', 'carrier.straight', { params: { toString: 1 } })]);
    expect(checkEnemyBehaviors(content)).toEqual([
      {
        path: 'enemies:p.params.toString',
        message: 'unknown param for behaviour "carrier.straight" (known: speed)',
      },
    ]);
  });
});

describe('core/behaviors edge — the roster in detail', () => {
  it('drifter.sine: formation members add memberPhase per member index', () => {
    const w = world();
    w.enemies.startFormation(DB.enemyIndex.get('drifter') ?? -1, 3, 1, 300, 100, -1, 0, 0);
    run(w, 3);
    const members = liveOf(w, 'drifter');
    expect(members.map((e) => e.m3)).toEqual([32, 132, 232]);
    expect(members.map((e) => [e.m0, e.m1, e.m2])).toEqual([
      [-1, 10, 64],
      [-1, 10, 64],
      [-1, 10, 64],
    ]);
    const alone = put(w, 'drifter', 300, 60);
    run(w, 1);
    expect(alone.m3).toBe(32); // outside a formation: member counts as 0
  });

  it('fan.loop: without a path the leader flies straight left; members follow regardless', () => {
    const w = world();
    w.enemies.startFormation(DB.enemyIndex.get('fan') ?? -1, 3, 6, 350, 90, -1, 0, 0);
    run(w, 30);
    const [leader, ...members] = liveOf(w, 'fan');
    expect([leader.mover, leader.vx, leader.vy]).toEqual([MoverKind.Straight, -2, 0]);
    expect(members.map((e) => e.mover)).toEqual([MoverKind.Follow, MoverKind.Follow]);
    // The first follower trails the leader by its 6-tick delay: 12 px behind on the same line.
    expect(members[0].x - leader.x).toBeCloseTo(12, 9);
    expect(members[0].y).toBe(leader.y);
  });

  it('carrier.straight: flies left at its speed tunable', () => {
    const w = world();
    const e = put(w, 'carrier', 300, 80);
    run(w, 10);
    expect([e.mover, e.vx, e.x]).toEqual([MoverKind.Straight, -0.5, 295]);
  });

  it('turret.floor: turns to the player only on its aim ticks, on floors and ceilings', () => {
    const w = world();
    const floor = put(w, 'turret', 200, Number.NaN);
    const ceiling = put(w, 'turret-top', 220, Number.NaN);
    expect([floor.anchor, floor.y]).toEqual([BodyAnchor.Floor, 164]);
    expect([ceiling.anchor, ceiling.y]).toEqual([BodyAnchor.Ceiling, 28]);
    const spawned = w.tick;
    run(w, 1); // first wake: faces the ship on the left
    expect(floor.flags & EnemyFlag.FaceRight).toBe(0);
    w.players[0].x = 300; // now right of both
    const flips: number[] = [];
    for (let t = 0; t < 45; t++) {
      run(w, 1);
      if ((floor.flags & EnemyFlag.FaceRight) !== 0 && flips.length === 0) flips.push(w.tick - 1);
    }
    expect(flips).toEqual([spawned + 20]);
    expect(ceiling.flags & EnemyFlag.FaceRight).toBe(EnemyFlag.FaceRight);
    expect([floor.x, floor.y, ceiling.x, ceiling.y]).toEqual([200, 164, 220, 28]);
  });

  it('walker.floor: walks left without a target, then towards the player at each walk start', () => {
    const early = world(0); // tick 0: the ship is still flying in — no target
    const lost = put(early, 'walker', 20, Number.NaN);
    early.players[0].x = 300; // (ignored anyway: the fly-in places the ship)
    run(early, 1);
    expect([lost.mover, lost.vx]).toEqual([MoverKind.GroundCrawl, -1]);

    const w = world();
    const ship = w.players[0];
    ship.x = 300;
    const e = put(w, 'walker', 200, Number.NaN);
    const start = w.tick;
    run(w, 1);
    expect(e.vx).toBe(1); // towards the ship on the right
    run(w, 30);
    expect([e.mover, e.vx]).toEqual([MoverKind.None, 0]); // tick start + 30: stopped for 10
    expect(e.flags & EnemyFlag.FaceRight).toBe(EnemyFlag.FaceRight); // faces the ship
    ship.x = 100;
    run(w, 9);
    expect(e.mover).toBe(MoverKind.None);
    run(w, 1); // tick start + 40: the next walk starts towards the ship, now on the left
    expect(w.tick - 1).toBe(start + 40);
    expect([e.mover, e.vx]).toEqual([MoverKind.GroundCrawl, -1]);
    expect(e.y).toBe(164); // on the floor all along
  });

  it('walker.floor: a ceiling walker hangs from the ceiling while walking', () => {
    const w = world();
    const e = put(w, 'walker-top', 200, Number.NaN);
    for (let t = 0; t < 120; t++) {
      run(w, 1);
      expect(e.y).toBe(24 + 4);
    }
    expect(e.x).not.toBe(200);
  });

  it('hatch.spawner: `max: 0` never stops releasing', () => {
    const w = world();
    put(w, 'hatch', 200, Number.NaN);
    run(w, 200);
    // Releases at 10, 20, …; the larvae stand still (speed 0) next to the hatch.
    expect(liveOf(w, 'larva').length).toBeGreaterThanOrEqual(18);
  });

  it('hatch.spawner: releases nothing while off screen', () => {
    const w = world();
    put(w, 'hatch', PLAYFIELD_W + 20, Number.NaN); // just right of the view, within the margins
    run(w, 300);
    expect(liveOf(w, 'larva')).toEqual([]);
  });

  it('hatch.spawner: a ceiling hatch releases downwards, at most `max`', () => {
    const w = world();
    const hatch = put(w, 'hatch-top', 150, Number.NaN);
    run(w, 100);
    const larvae = liveOf(w, 'larva');
    expect(larvae).toHaveLength(2);
    for (const l of larvae) expect([l.x, l.y]).toEqual([150, hatch.y + hatch.hh]);
  });

  it('hatch.spawner: without a child it releases nothing (and does not crash)', () => {
    const w = world();
    put(w, 'hatch-empty', 150, Number.NaN);
    run(w, 60);
    expect(w.enemies.count).toBe(1);
  });

  it('rammer.aimed: spec mover for enterTicks, windup, then an aimed dash', () => {
    const w = world();
    const ship = w.players[0];
    const e = put(w, 'rammer', 300, 60);
    run(w, 15);
    expect([e.mover, e.x]).toEqual([MoverKind.Straight, 285]);
    run(w, 1); // tick of the second wake: the dash mover is set, the windup starts
    expect(e.mover).toBe(MoverKind.AimedDash);
    const x = e.x;
    run(w, 4);
    expect([e.x, e.vx, e.vy]).toEqual([x, 0, 0]); // windup: 5 ticks holding still
    const aim = atan2B(ship.y - e.y, ship.x - e.x);
    run(w, 1);
    const step = ANGLE_UNITS / AIM_DIRECTIONS;
    expect(e.s1 % step).toBe(0);
    expect(Math.abs(angleDelta(e.s1, aim))).toBeLessThanOrEqual(step / 2 + 1);
    expect(Math.sqrt(e.vx * e.vx + e.vy * e.vy)).toBeCloseTo(3, 4);
  });

  it('orbiter.loop: without a path it uses its waypoint tunables', () => {
    const w = world();
    const e = put(w, 'orbiter', 300, 50);
    run(w, 1);
    expect(e.mover).toBe(MoverKind.Waypoint);
    expect([e.m0, e.m1, e.m2, e.m3, e.m4, e.m5]).toEqual([200, 50, 2, 12, -3, 0]);
    run(w, 49); // 100 px at 2 px/tick: arrived on tick 50, holding
    expect([e.x, e.y]).toEqual([200, 50]);
    run(w, 13);
    expect(e.x).toBe(197); // left after the 12-tick hold
  });
});
