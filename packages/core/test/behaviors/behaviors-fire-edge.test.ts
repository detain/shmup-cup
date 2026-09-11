/**
 * Edge cases of the roster's fire patterns and the enemy `ScriptApi` fire primitives (plan
 * M1-09):
 *
 * - `turret.floor` tunables: `fireTicks` counted in `aimTicks` steps (100 → every 120 ticks),
 *   `aimTicks` 0 (every tick), the rank-scaled interval at Arcade (81 ticks with 1-tick aim
 *   steps, still 90 with the default 30-tick steps), the first shot as soon as it settles after
 *   a long `settleTicks`, the ceiling turret shooting down at a ship below;
 * - `orbiter.loop` with `ringCount` 0 (never fires), fractional counts, its own interval and
 *   speed, the half-gap turn only counted for rings actually fired;
 * - `walker.floor` with `spread` 0 (three bullets on one heading);
 * - the `ScriptApi`: `bullets` is the World's, `laser()` defaults (aimed, 384 px, 40 / 8 / 60 / 8,
 *   6 px, attached), ghosts fire nothing, bullets outlive their enemy, and a laser detached from
 *   an escaped enemy never follows the next enemy spawned into the same slot.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import {
  BulletKind,
  LASER_ACTIVE_TICKS,
  LASER_FADE_TICKS,
  LASER_GROW_TICKS,
  LASER_TELEGRAPH_TICKS,
  LASER_WIDTH,
  LaserPhase,
} from '../../src/bullets/index.js';
import { PLAYFIELD_W, resolveGameConfig, type DifficultyPreset } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import {
  DESPAWN_MARGIN,
  EnemyFlag,
  EnemyState,
  type Enemy,
  type ScriptApi,
} from '../../src/enemies/index.js';
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

/**
 * An enemy entry with the common fields.
 *
 * @param id - Enemy id.
 * @param script - Behaviour id.
 * @param extra - More fields (params, ground, settleTicks …).
 * @returns The entry.
 */
function enemy(id: string, script: string, extra: Record<string, unknown> = {}): object {
  return {
    id,
    hp: 5,
    score: 100,
    hurtbox: { hw: 5, hh: 4 },
    script,
    sprite: 'enemies/turret',
    drop: null,
    ...extra,
  };
}

/** Test enemies (tunable variants of the roster, a probe and a laser gunner). */
const TEST_ENEMIES = [
  enemy('turret-100', 'turret.floor', { ground: 'floor', params: { fireTicks: 100 } }),
  enemy('turret-fast', 'turret.floor', { ground: 'floor', params: { aimTicks: 0, fireTicks: 10 } }),
  enemy('turret-fine', 'turret.floor', { ground: 'floor', params: { aimTicks: 1 } }),
  enemy('turret-late', 'turret.floor', { ground: 'floor', settleTicks: 200 }),
  enemy('orbiter-none', 'orbiter.loop', { params: { ringCount: 0 } }),
  enemy('orbiter-5', 'orbiter.loop', {
    params: { ringCount: 5.5, ringTicks: 30, bulletSpeed: 2 },
  }),
  enemy('walker-flat', 'walker.floor', { ground: 'floor', params: { spread: 0 } }),
  enemy('probe', 'test.probe', { settleTicks: 0 }),
  enemy('beamer', 'test.beamer', { settleTicks: 0 }),
];

/**
 * The shipped roster, the test enemies, the KESTREL and a static flat stage `t`.
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

/** What the probe saw at each wake: `[canFire, aimed, ring, nWay, laser, bullets === world's]`. */
const probeLog: number[][] = [];

/** The World the probe compares `api.bullets` against. */
let probeWorld: World | null = null;

/** A behaviour that tries a few primitives every 5 ticks and records the results. */
const probe = defineBehavior('test.probe', {}, function* run(api: ScriptApi): Script {
  api.setMover(MoverKind.None);
  for (;;) {
    probeLog.push([
      api.canFire() ? 1 : 0,
      api.aimed(1, BulletKind.RoundPink),
      api.ring(2, 1, BulletKind.RoundRed),
      api.nWay(2, 16, 1, BulletKind.RoundRed),
      api.laser(),
      probeWorld !== null && api.bullets === probeWorld.bullets ? 1 : 0,
    ]);
    yield 5;
  }
});

/** A behaviour firing one attached beam (no warning, 100 active ticks, 20 of fade). */
const beamer = defineBehavior('test.beamer', {}, function* run(api: ScriptApi): Script {
  api.setMover(MoverKind.None);
  for (;;) {
    if (api.laser(512, 150, 6, 0, 0, 100, 20) >= 0) yield SLEEP_FOREVER;
    yield 1;
  }
});

const REGISTRY = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, probe, beamer]);

/**
 * A world on the flat stage with the ship alive, parked at `(60, 100)`, god mode on.
 *
 * @param difficulty - Difficulty preset.
 * @returns The world.
 */
function world(difficulty: DifficultyPreset = 'normal'): World {
  const w = createWorld(resolveGameConfig({ stage: 't', seed: 9, difficulty }), DB, {
    behaviors: REGISTRY,
  });
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

/** One shot seen by {@link watch}. */
interface Shot {
  /** Tick it was fired on. */
  readonly tick: number;
  /** Bullet kind. */
  readonly kind: number;
  /** Heading. */
  readonly angle: number;
  /** Speed. */
  readonly speed: number;
}

/**
 * Steps tick by tick and records every bullet fired (a live bullet of age 1 after the tick).
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @returns The shots.
 */
function watch(w: World, ticks: number): Shot[] {
  const fired: Shot[] = [];
  const f = w.bullets.pool.fields;
  for (let t = 0; t < ticks; t++) {
    run(w, 1);
    for (let i = 0; i < w.bullets.count; i++) {
      if (f.age[i] === 1 && f.delay[i] === 0) {
        fired.push({ tick: w.tick - 1, kind: f.kind[i], angle: f.angle[i], speed: f.speed[i] });
      }
    }
  }
  return fired;
}

/**
 * The distinct ticks of some shots, in order.
 *
 * @param shots - The shots.
 * @returns Their ticks.
 */
function ticksOf(shots: readonly Shot[]): number[] {
  return [...new Set(shots.map((s) => s.tick))];
}

/**
 * Gaps between consecutive numbers.
 *
 * @param values - The numbers.
 * @returns `values[k + 1] − values[k]`.
 */
function gaps(values: readonly number[]): number[] {
  return values.slice(1).map((v, k) => v - values[k]);
}

describe('core/behaviors fire edge: turret.floor tunables', () => {
  it('counts fireTicks in aimTicks steps: fireTicks 100 with 30-tick steps → every 120 ticks', () => {
    const w = world();
    spawn(w, 'turret-100', 300, Number.NaN);
    const ticks = ticksOf(watch(w, 500));
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(gaps(ticks).every((g) => g === 120)).toBe(true);
  });

  it('aimTicks 0 wakes every tick: fireTicks 10 → every 10 ticks', () => {
    const w = world();
    spawn(w, 'turret-fast', 300, Number.NaN);
    const ticks = ticksOf(watch(w, 150));
    expect(ticks.length).toBeGreaterThanOrEqual(10);
    expect(gaps(ticks).every((g) => g === 10)).toBe(true);
  });

  it('scales its interval with the rank: Arcade 81 ticks with 1-tick steps, 90 with 30-tick ones', () => {
    for (const [difficulty, id, expected] of [
      ['normal', 'turret-fine', 90],
      ['arcade', 'turret-fine', 81],
      ['easy', 'turret-fine', 94],
      ['arcade', 'turret', 90],
    ] as const) {
      const w = world(difficulty);
      spawn(w, id, 300, Number.NaN);
      const ticks = ticksOf(watch(w, 400));
      expect(ticks.length, `${difficulty} ${id}`).toBeGreaterThanOrEqual(3);
      expect(new Set(gaps(ticks)), `${difficulty} ${id}`).toEqual(new Set([expected]));
    }
  });

  it('fires at its first aim step after a long settle (the interval already passed)', () => {
    const w = world();
    const turret = spawn(w, 'turret-late', 300, Number.NaN);
    const shots = watch(w, 400);
    expect(shots.length).toBeGreaterThan(0);
    const first = shots[0].tick - turret.spawnTick;
    expect(first).toBeGreaterThanOrEqual(200);
    expect(first).toBeLessThanOrEqual(200 + 30 + 1);
    expect(ticksOf(shots)[1] - shots[0].tick).toBe(90);
  });

  it('the ceiling turret shoots down at a ship below it', () => {
    const w = world();
    w.players[0].x = 150;
    w.players[0].y = 150;
    const turret = spawn(w, 'turret-ceiling', 300, Number.NaN);
    const shots = watch(w, 200);
    expect(shots.length).toBeGreaterThan(0);
    expect(turret.y).toBeLessThan(100);
    for (const shot of shots) {
      expect(shot.kind).toBe(BulletKind.RoundPink);
      expect(shot.angle).toBeGreaterThan(256); // down and to the left
      expect(shot.angle).toBeLessThan(512);
      expect(shot.speed).toBe(1.5);
    }
  });
});

describe('core/behaviors fire edge: orbiter.loop and walker.floor tunables', () => {
  it('ringCount 0 never fires', () => {
    const w = world();
    spawn(w, 'orbiter-none', 390, 60);
    expect(watch(w, 400)).toEqual([]);
  });

  it('fires rings of floor(ringCount) at its own interval and speed, turning half a gap', () => {
    const w = world();
    spawn(w, 'orbiter-5', 390, 60);
    const shots = watch(w, 140);
    const ticks = ticksOf(shots);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(gaps(ticks).every((g) => g === 30)).toBe(true);
    const gap = 1024 / 5;
    ticks.forEach((tick, k) => {
      const ring = shots.filter((s) => s.tick === tick);
      expect(ring).toHaveLength(5);
      expect(ring.every((s) => s.speed === 2 && s.kind === BulletKind.RoundPurple)).toBe(true);
      const first = Math.min(...ring.map((s) => s.angle));
      expect(first).toBeCloseTo((k & 1) * (gap / 2), 9); // the first ring fired is not turned
    });
  });

  it('walker spread 0 fires its three bullets on one heading', () => {
    const w = world();
    spawn(w, 'walker-flat', 330, Number.NaN);
    const shots = watch(w, 150);
    expect(shots).toHaveLength(3);
    expect(new Set(shots.map((s) => s.angle)).size).toBe(1);
    expect(shots.every((s) => s.speed === 1.25)).toBe(true);
  });
});

describe('core/enemies ScriptApi fire edge', () => {
  it('exposes the World bullet system and fires an aimed, attached default laser', () => {
    probeLog.length = 0;
    const w = world();
    probeWorld = w;
    w.players[0].x = 60;
    w.players[0].y = 60;
    const e = spawn(w, 'probe', 300, 60);
    run(w, 7);
    const fired = probeLog.find((entry) => entry[0] === 1);
    expect(fired).toBeDefined();
    if (fired === undefined) return;
    expect(fired[5]).toBe(1);
    expect(fired.slice(2, 4)).toEqual([2, 2]);
    const f = w.bullets.lasers.fields;
    const i = fired[4];
    expect(i).toBeGreaterThanOrEqual(0);
    expect([f.src[i], f.angle[i], f.length[i], f.width[i]]).toEqual([
      e.slot,
      512,
      PLAYFIELD_W,
      LASER_WIDTH,
    ]);
    expect([f.telegraph[i], f.grow[i], f.active[i], f.fade[i]]).toEqual([
      LASER_TELEGRAPH_TICKS,
      LASER_GROW_TICKS,
      LASER_ACTIVE_TICKS,
      LASER_FADE_TICKS,
    ]);
    probeWorld = null;
  });

  it('fires nothing from a ghost', () => {
    probeLog.length = 0;
    const w = world();
    const e = spawn(w, 'probe', 300, 60);
    run(w, 7);
    expect(probeLog.some((entry) => entry[0] === 1)).toBe(true);
    e.flags |= EnemyFlag.Ghost;
    const before = probeLog.length;
    const bullets = w.bullets.count;
    const lasers = w.bullets.lasers.count;
    run(w, 10);
    const ghost = probeLog.slice(before);
    expect(ghost.length).toBeGreaterThan(0);
    for (const entry of ghost) expect(entry.slice(0, 5)).toEqual([0, -1, 0, 0, -1]);
    expect(w.bullets.lasers.count).toBe(lasers);
    expect(w.bullets.count).toBeLessThanOrEqual(bullets);
  });

  it('lets bullets fly on after their enemy is killed', () => {
    const w = world();
    const turret = spawn(w, 'turret', 300, Number.NaN);
    const shots = watch(w, 200);
    expect(shots.length).toBeGreaterThan(0);
    const count = w.bullets.count;
    expect(count).toBeGreaterThan(0);
    const f = w.bullets.pool.fields;
    const x = f.x[0];
    expect(w.enemies.kill(turret)).toBe(true);
    run(w, 1);
    expect(w.bullets.count).toBe(count);
    expect(f.x[0]).not.toBe(x);
  });

  it('never lets a laser detached from an escaped enemy follow the next enemy in that slot', () => {
    const w = world();
    const first = spawn(w, 'beamer', 300, 100);
    run(w, 3);
    const lasers = w.bullets.lasers;
    const f = lasers.fields;
    expect(lasers.count).toBe(1);
    expect([f.src[0], f.phase[0]]).toEqual([first.slot, LaserPhase.Active]);
    const slot = first.slot;
    first.x = w.camera.x - DESPAWN_MARGIN - 60; // escapes off the left edge
    run(w, 1);
    expect(first.state).not.toBe(EnemyState.Live);
    expect([f.src[0], f.phase[0]]).toEqual([-1, LaserPhase.Fade]);
    const x = f.x[0];
    const second = spawn(w, 'turret', 250, Number.NaN);
    expect(second.slot).toBe(slot);
    run(w, 1);
    second.x += 30;
    run(w, 1);
    expect(f.x[0]).toBe(x); // a fixed laser on a static camera stays put
    run(w, 30);
    expect(lasers.count).toBe(0);
  });
});
