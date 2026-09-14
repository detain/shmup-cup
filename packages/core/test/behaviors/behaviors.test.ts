/**
 * `core/behaviors` (plan M1-08): the registry (ids, duplicates, frozen tunables), the script-id
 * list content validation uses (an unknown id is a content issue), `checkEnemyBehaviors`, and
 * every behaviour of the M1 roster driving its enemy in a World on the shipped test-range
 * content.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BEHAVIOR_DEFS,
  KNOWN_SCRIPT_IDS,
  WEAPON_SCRIPT_IDS,
  checkEnemyBehaviors,
  createBehaviorRegistry,
  defineBehavior,
  moduleInfo,
} from '../../src/behaviors/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MoverKind, SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/** Every shipped content file (examples excluded). */
function shippedFiles(): ContentFile[] {
  const root = new URL('../../../../content/', import.meta.url);
  const files: ContentFile[] = [];
  for (const folder of readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const name of readdirSync(new URL(folder.name + '/', root))) {
      if (!name.endsWith('.json') || name.startsWith('example.')) continue;
      const path = folder.name + '/' + name;
      files.push({ path, data: JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown });
    }
  }
  return files;
}

/** The shipped content, validated with the engine's script ids. */
function shipped(): ContentDb {
  const { db, issues } = loadContent(shippedFiles(), { knownScripts: KNOWN_SCRIPT_IDS });
  expect(issues).toEqual([]);
  return db;
}

const DB = shipped();

/**
 * A world on the test range (its own timeline runs too — the tests spawn next to it).
 *
 * @returns The world after the 40-tick fly-in.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 5, stage: 'test-range' }), DB);
  run(w, 45);
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
 * Spawns a shipped enemy at a view position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param sx - Playfield x.
 * @param sy - Playfield y (NaN = ground snap).
 * @param path - Path id.
 * @returns The enemy.
 */
function spawn(w: World, id: string, sx: number, sy: number, path?: string): Enemy {
  const index = DB.enemyIndex.get(id);
  const pathId = path === undefined ? -1 : (DB.pathIndex.get(path) ?? -1);
  const e = w.enemies.spawn(index ?? -1, w.camera.x + sx, w.camera.y + sy, pathId);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

describe('core/behaviors registry', () => {
  it('describes itself and registers the M1 roster (plus the M2 behaviours and gimmicks)', () => {
    expect(moduleInfo.name).toBe('behaviors');
    expect(moduleInfo.status).toBe('partial');
    expect(BEHAVIOR_IDS).toEqual([
      'bubble.split',
      'carrier.straight',
      'cube.pincer',
      'cube.stack',
      'drifter.sine',
      'fan.loop',
      'field.suction',
      'hatch.spawner',
      'hunter.option',
      'orbiter.loop',
      'pattern.loop',
      'rammer.aimed',
      'rock.fall',
      'rocket.homing',
      'tentacle.grab',
      'turret.floor',
      'volcano.lob',
      'walker.floor',
      'worm.burst',
    ]);
    // Zones B and C added the homing rocket and the sand worm (M2-11).
    expect(DEFAULT_BEHAVIOR_DEFS).toHaveLength(19);
    expect(DEFAULT_BEHAVIORS.get('volcano.lob')?.needsChild).toBe(true);
    expect(typeof DEFAULT_BEHAVIORS.get('bubble.split')?.death).toBe('function');
    expect(DEFAULT_BEHAVIORS.get('drifter.sine')?.death).toBeUndefined();
    expect(DEFAULT_BEHAVIORS.get('pattern.loop')?.needsPattern).toBe(true);
    for (const id of BEHAVIOR_IDS) expect(DEFAULT_BEHAVIORS.get(id)?.id).toBe(id);
    expect(DEFAULT_BEHAVIORS.get('boss.warden')).toBeUndefined();
    expect(DEFAULT_BEHAVIORS.get('hatch.spawner')?.needsChild).toBe(true);
    expect(Object.isFrozen(DEFAULT_BEHAVIORS.get('drifter.sine')?.params)).toBe(true);
  });

  it('knows the weapon behaviours too (one script table), sorted', () => {
    expect(WEAPON_SCRIPT_IDS).toEqual([
      // The Direct-mode families' behaviours (M2-05).
      'direct.bolt',
      'direct.bomb',
      'laser.beam',
      'laser.cyclone',
      'laser.ripple',
      'laser.twin',
      'missile.groundSlide',
      'missile.spreadBomb',
      'missile.torpedo',
      'missile.twoWay',
      'shot.double',
      'shot.freeWay',
      'shot.straight',
      'shot.tailGun',
      'shot.vertical',
    ]);
    expect(KNOWN_SCRIPT_IDS).toEqual(
      [...BEHAVIOR_IDS, ...BOSS_BEHAVIOR_IDS, ...WEAPON_SCRIPT_IDS].sort(),
    );
    expect(Object.isFrozen(KNOWN_SCRIPT_IDS)).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const a = defineBehavior('x', {}, function* x(): Script {
      yield SLEEP_FOREVER;
    });
    expect(() => createBehaviorRegistry([a, a])).toThrow(/defined twice/);
    expect(createBehaviorRegistry([a]).ids).toEqual(['x']);
  });
});

describe('core/behaviors content validation', () => {
  /**
   * An enemies file with one entry.
   *
   * @param fields - The entry.
   * @returns The file.
   */
  const enemies = (fields: Record<string, unknown>): ContentFile => ({
    path: 'enemies/e.enemies.json',
    data: {
      formatVersion: 1,
      kind: 'enemies',
      enemies: [
        {
          id: 'e',
          hp: 1,
          score: 1,
          hurtbox: { hw: 2, hh: 2 },
          sprite: 'enemies/drifter',
          drop: null,
          ...fields,
        },
      ],
    },
  });

  it('reports an unknown script id as a content issue', () => {
    const { issues } = loadContent([enemies({ script: 'drifter.sinus' })], {
      knownScripts: KNOWN_SCRIPT_IDS,
    });
    expect(issues).toEqual([
      {
        path: 'enemies/e.enemies.json:enemies[0].script',
        message: 'unknown script id "drifter.sinus"',
      },
    ]);
  });

  it('reports unknown tunables and spawners without a child', () => {
    const { db } = loadContent([
      enemies({ script: 'hatch.spawner', params: { interval: 30, speed: 2 } }),
    ]);
    expect(checkEnemyBehaviors(db)).toEqual([
      {
        path: 'enemies:e.params.speed',
        message: 'unknown param for behaviour "hatch.spawner" (known: interval, max)',
      },
      { path: 'enemies:e.child', message: 'behaviour "hatch.spawner" needs a child enemy' },
    ]);
    // Unknown scripts are loadContent's job, not this check's.
    expect(checkEnemyBehaviors(loadContent([enemies({ script: 'nope' })]).db)).toEqual([]);
  });

  it('passes the shipped enemies', () => {
    expect(checkEnemyBehaviors(DB)).toEqual([]);
    expect(DB.enemies.length).toBeGreaterThanOrEqual(8);
    const scripts = new Set(DB.enemies.map((e) => e.script));
    for (const id of BEHAVIOR_IDS) expect(scripts.has(id), id).toBe(true);
  });
});

describe('core/behaviors — the roster in a World', () => {
  it('drifter.sine drifts left on its wave (params override the defaults)', () => {
    const w = world();
    const e = spawn(w, 'drifter', 300, 80);
    run(w, 1);
    expect(e.mover).toBe(MoverKind.Sine);
    const params = DB.enemies[e.specIndex].params;
    expect([e.m0, e.m1, e.m2]).toEqual([
      -(params.speed ?? 1.25),
      params.amp ?? 24,
      params.period ?? 96,
    ]);
  });

  it('fan.loop: the leader flies the path, the members follow it, straight without a path', () => {
    const w = world();
    const fan = DB.enemyIndex.get('fan') ?? -1;
    const path = DB.pathIndex.get('fan-loop') ?? -1;
    w.enemies.startFormation(fan, 3, 10, 380, 120, path, 1, 0);
    run(w, 25);
    const members = w.enemies.enemies.filter(
      (e) => e.state === EnemyState.Live && e.specIndex === fan && e.formation >= 0,
    );
    expect(members.map((e) => e.mover)).toEqual([
      MoverKind.Path,
      MoverKind.Follow,
      MoverKind.Follow,
    ]);
    const alone = spawn(w, 'fan', 350, 50);
    run(w, 1);
    expect([alone.mover, alone.vx]).toEqual([MoverKind.Straight, -1.75]);
  });

  it('carrier.straight flies straight left and carries a capsule', () => {
    const w = world();
    const e = spawn(w, 'carrier', 300, 100);
    run(w, 1);
    expect([e.mover, e.vx, e.vy]).toEqual([MoverKind.Straight, -0.75, 0]);
    expect(DB.enemies[e.specIndex].drop).toBe('capsule');
  });

  it('turret.floor stands on the floor and faces the nearest player', () => {
    const w = world();
    const e = spawn(w, 'turret', 300, Number.NaN);
    run(w, 1);
    expect(e.mover).toBe(MoverKind.None);
    expect(e.flags & EnemyFlag.FaceRight).toBe(0); // the ship is to its left
    w.players[0].x = e.x + 40;
    run(w, 31);
    expect(e.flags & EnemyFlag.FaceRight).toBe(EnemyFlag.FaceRight);
  });

  it('walker.floor walks towards the player, stops, walks again', () => {
    const w = world();
    const e = spawn(w, 'walker', 250, Number.NaN);
    run(w, 1);
    expect(e.mover).toBe(MoverKind.GroundCrawl);
    expect(e.vx).toBeLessThan(0);
    run(w, 90);
    expect(e.mover).toBe(MoverKind.None);
    run(w, 45);
    expect(e.mover).toBe(MoverKind.GroundCrawl);
  });

  it('hatch.spawner releases hatchlings while on screen (at most `max`)', () => {
    const w = world();
    const hatch = spawn(w, 'hatch', 300, Number.NaN);
    const child = hatch.specIndex >= 0 ? DB.enemies[hatch.specIndex].childId : -1;
    expect(child).toBe(DB.enemyIndex.get('hatchling'));
    let released = 0;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      for (const e of w.enemies.enemies) {
        if (e.state === EnemyState.Live && e.specIndex === child && e.age === 1) released++;
      }
    }
    expect(released).toBeGreaterThan(0);
    expect(released).toBeLessThanOrEqual(DB.enemies[hatch.specIndex].params.max ?? 8);
  });

  it('rammer.aimed enters with its mover, then winds up and dashes', () => {
    const w = world();
    const e = spawn(w, 'rammer', 360, 60);
    run(w, 1);
    expect(e.mover).toBe(MoverKind.Straight);
    run(w, 60);
    expect(e.mover).toBe(MoverKind.AimedDash);
  });

  it('orbiter.loop loops along its path, or enters, holds and leaves without one', () => {
    const w = world();
    const looped = spawn(w, 'orbiter', 380, 70, 'orbit-loop');
    const plain = spawn(w, 'orbiter', 380, 60);
    run(w, 1);
    expect(looped.mover).toBe(MoverKind.Path);
    expect(plain.mover).toBe(MoverKind.Waypoint);
  });
});
