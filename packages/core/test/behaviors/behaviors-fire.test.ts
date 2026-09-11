/**
 * The M1 roster fires (plan M1-09): `turret.floor` aimed shots once settled (never off screen),
 * `walker.floor` an aimed 3-way at each stop, `orbiter.loop` alternating rings, the others
 * nothing; and the `ScriptApi` fire primitives — the fire rule (off screen / unsettled / ghost →
 * nothing fired), rank-scaled intervals, attached lasers that follow their enemy and are
 * cancelled or faded when it dies.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import { BulletKind, LaserPhase } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import type { Enemy, ScriptApi } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MoverKind, SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
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

/** Test enemies (a gunner using every primitive, a laser turret). */
const TEST_ENEMIES = [
  {
    id: 'gunner',
    hp: 5,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.gunner',
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 10,
  },
  {
    id: 'laser-turret',
    hp: 5,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.laser',
    sprite: 'enemies/turret',
    drop: null,
    settleTicks: 0,
  },
];

/**
 * The shipped test-range enemies plus the test enemies, the KESTREL and a static flat stage.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      shipped('enemies/test-range.enemies.json'),
      shipped('paths/test-range.paths.json'),
      {
        path: 'enemies/t.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: TEST_ENEMIES },
      },
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 3000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 3384, floor: { base: 24, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

const DB = db();

/** Return values of the gunner's primitives per wake: `[tick, canFire, ...results]`. */
const gunnerLog: number[][] = [];

/** A behaviour calling every primitive each 20 ticks. */
const gunner = defineBehavior('test.gunner', {}, function* gun(api: ScriptApi): Script {
  api.setMover(MoverKind.None);
  let spiral = 0;
  for (;;) {
    const before = spiral;
    spiral = api.spiral(spiral, 2, 32, 1, BulletKind.RoundRed);
    gunnerLog.push([
      api.tick,
      api.canFire() ? 1 : 0,
      api.aimed(1, BulletKind.RoundPink),
      api.nWay(3, 32, 1, BulletKind.OvalPink),
      api.ring(4, 1, BulletKind.RoundPurple),
      api.stack(2, 1, 0.5, BulletKind.NeedlePink),
      api.spray(2, 64, 1, 2, BulletKind.RoundRed),
      api.homing(1, BulletKind.OvalRed, 4, 30),
      api.delayed(5, 1, BulletKind.OvalPurple),
      spiral - before,
    ]);
    yield 20;
  }
});

/** A behaviour firing one attached laser straight left when it may. */
const laserTurret = defineBehavior('test.laser', {}, function* laser(api: ScriptApi): Script {
  api.setMover(MoverKind.None);
  for (;;) {
    if (api.laser(512, 200, 6, 10, 4, 30, 4) >= 0) yield SLEEP_FOREVER;
    yield 1;
  }
});

const REGISTRY = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, gunner, laserTurret]);

/**
 * A world on the flat stage with the ship alive, parked at `(60, 100)`, god mode on.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ stage: 't', seed: 9 }), DB, { behaviors: REGISTRY });
  run(w, 45);
  w.players[0].x = 60;
  w.players[0].y = 100;
  w.debugFlags.godMode = true;
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
 * Spawns an enemy at a view position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param sx - Playfield x.
 * @param sy - Playfield y (NaN = default / ground snap).
 * @returns The enemy.
 */
function spawn(w: World, id: string, sx: number, sy: number): Enemy {
  const e = w.enemies.spawn(DB.enemyIndex.get(id) ?? -1, w.camera.x + sx, w.camera.y + sy);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

/**
 * Steps tick by tick and records every bullet fired (a live bullet of age 1 after the tick).
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @returns Per shot: `[tick, kind, angle]`.
 */
function watch(w: World, ticks: number): Array<[number, number, number]> {
  const fired: Array<[number, number, number]> = [];
  const f = w.bullets.pool.fields;
  for (let t = 0; t < ticks; t++) {
    run(w, 1);
    for (let i = 0; i < w.bullets.count; i++) {
      if (f.age[i] === 1 && f.delay[i] === 0) fired.push([w.tick - 1, f.kind[i], f.angle[i]]);
    }
  }
  return fired;
}

describe('core/behaviors firing (M1-09)', () => {
  it('turret.floor: aimed pink shots every fireTicks once settled, quantised to 32 steps', () => {
    const w = world();
    const turret = spawn(w, 'turret', 300, Number.NaN);
    const shots = watch(w, 400);
    expect(shots.length).toBeGreaterThanOrEqual(4);
    expect(shots.length).toBeLessThanOrEqual(5);
    const first = shots[0][0] - turret.spawnTick;
    expect(first).toBeGreaterThanOrEqual(30); // settleTicks (default 30)
    for (let k = 1; k < shots.length; k++) expect(shots[k][0] - shots[k - 1][0]).toBe(90);
    for (const [, kind, angle] of shots) {
      expect(kind).toBe(BulletKind.RoundPink);
      expect(angle % 32).toBe(0);
    }
  });

  it('turret.floor never fires while off screen', () => {
    const w = world();
    spawn(w, 'turret', 470, Number.NaN);
    expect(watch(w, 300)).toEqual([]);
  });

  it('walker.floor: an aimed 3-way of red ovals, 48 units apart, at each stop', () => {
    const w = world();
    spawn(w, 'walker', 330, Number.NaN);
    const shots = watch(w, 150);
    expect(shots).toHaveLength(3);
    expect(new Set(shots.map(([tick]) => tick)).size).toBe(1);
    const angles = shots.map(([, , angle]) => angle).sort((a, b) => a - b);
    expect([angles[1] - angles[0], angles[2] - angles[1]]).toEqual([48, 48]);
    expect(angles[1] % 32).toBe(0);
    expect(shots.every(([, kind]) => kind === BulletKind.OvalRed)).toBe(true);
  });

  it('orbiter.loop: rings of 8 purple bullets every ringTicks, alternately turned half a gap', () => {
    const w = world();
    spawn(w, 'orbiter', 390, 60);
    const shots = watch(w, 300);
    const ticks = [...new Set(shots.map(([tick]) => tick))];
    expect(ticks).toHaveLength(2);
    expect(ticks[1] - ticks[0]).toBe(120);
    const ring = (tick: number): number[] =>
      shots
        .filter(([t]) => t === tick)
        .map(([, , angle]) => angle)
        .sort((a, b) => a - b);
    expect(ring(ticks[0])).toEqual([0, 128, 256, 384, 512, 640, 768, 896]);
    expect(ring(ticks[1])).toEqual([64, 192, 320, 448, 576, 704, 832, 960]);
    expect(shots.every(([, kind]) => kind === BulletKind.RoundPurple)).toBe(true);
  });

  it('drifter, fan, carrier, hatch and rammer fire nothing', () => {
    const w = world();
    spawn(w, 'drifter', 300, 60);
    spawn(w, 'fan', 330, 80);
    spawn(w, 'carrier', 360, 120);
    spawn(w, 'hatch', 250, Number.NaN);
    spawn(w, 'rammer', 380, 40);
    expect(watch(w, 200)).toEqual([]);
    expect(w.enemies.count).toBeGreaterThan(5); // the hatch released children
  });
});

describe('core/enemies ScriptApi fire primitives', () => {
  it('fire nothing (-1 / 0) until the enemy is settled, then every primitive fires', () => {
    gunnerLog.length = 0;
    const w = world();
    spawn(w, 'gunner', 300, 60);
    run(w, 45);
    const [early, , late] = gunnerLog;
    expect(early.slice(1)).toEqual([0, -1, 0, 0, 0, 0, -1, -1, 32]);
    expect(late[1]).toBe(1);
    expect(late.slice(2, 9).every((v) => v >= 0)).toBe(true);
    expect(late.slice(3, 7)).toEqual([3, 4, 2, 2]);
  });

  it('fire nothing once the enemy is off screen', () => {
    gunnerLog.length = 0;
    const w = world();
    const e = spawn(w, 'gunner', 300, 60);
    run(w, 25);
    const fired = w.bullets.count;
    expect(fired).toBeGreaterThan(0);
    e.x = w.camera.x + 400 + 20; // off screen, not yet despawned
    run(w, 1);
    const before = gunnerLog.length;
    run(w, 20);
    expect(gunnerLog.length).toBe(before + 1);
    expect(gunnerLog[gunnerLog.length - 1].slice(1, 3)).toEqual([0, -1]);
  });

  it('scales fire intervals with the rank (fireWait)', () => {
    let seen = 0;
    const probe = defineBehavior('test.wait', {}, function* wait(api: ScriptApi): Script {
      seen = api.fireWait(90);
      yield SLEEP_FOREVER;
    });
    const registry = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, probe, gunner, laserTurret]);
    const content = loadContent(
      [
        {
          path: 'enemies/w.enemies.json',
          data: {
            formatVersion: 1,
            kind: 'enemies',
            enemies: [{ ...TEST_ENEMIES[0], id: 'w', script: 'test.wait' }],
          },
        },
      ],
      {},
    ).db;
    for (const [difficulty, expected] of [
      ['normal', 90],
      ['arcade', 81],
    ] as const) {
      const w = createWorld(resolveGameConfig({ difficulty }), content, { behaviors: registry });
      w.enemies.spawn(0, 200, 100);
      run(w, 1);
      expect(seen).toBe(expected);
    }
  });

  it('fires an attached laser that follows its enemy; killing it cancels the warning', () => {
    const w = world();
    const e = spawn(w, 'laser-turret', 300, 60);
    run(w, 1); // not on screen yet when its script first runs (the move comes after)
    expect(w.bullets.lasers.count).toBe(0);
    run(w, 1);
    const lasers = w.bullets.lasers;
    expect(lasers.count).toBe(1);
    const f = lasers.fields;
    expect([f.src[0], f.phase[0], f.x[0], f.angle[0]]).toEqual([
      e.slot,
      LaserPhase.Telegraph,
      e.x,
      512,
    ]);
    e.y += 5;
    run(w, 1);
    expect(f.y[0]).toBe(e.y);
    w.enemies.kill(e);
    run(w, 1);
    expect(lasers.count).toBe(0);
  });

  it('fades an active attached laser when its enemy dies (no hitbox from then on)', () => {
    const w = world();
    const e = spawn(w, 'laser-turret', 300, 100);
    run(w, 16);
    const f = w.bullets.lasers.fields;
    expect(f.phase[0]).toBe(LaserPhase.Active);
    w.debugFlags.godMode = false;
    w.players[0].x = 150; // on the beam (x 100 … 300)
    w.players[0].y = 100;
    run(w, 1);
    const hits = w.players[0].hits;
    expect(hits).toBe(1);
    w.enemies.kill(e);
    expect([f.phase[0], f.src[0]]).toEqual([LaserPhase.Fade, -1]);
    run(w, 2);
    expect(w.players[0].hits).toBe(hits);
    run(w, 4);
    expect(w.bullets.lasers.count).toBe(0);
  });
});
