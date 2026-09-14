/**
 * Edge cases of the M2-11 behaviours (`core/behaviors`), beyond `behaviors-zones.test.ts`, on
 * variants of the shipped zone B and C rosters (free flight — a static camera — unless a test
 * needs terrain, the ship holding its fire and invulnerable):
 *
 * - the tunables of all four behaviours are the documented defaults;
 * - `rocket.homing`: exactly `launchTicks` of launch, `homeTicks` of homing, then a turn rate of
 *   0; whole-tick floors of fractional times, 1 tick for times below 1, a negative turn rate
 *   clamped to 0 (the launch heading is kept); the middle row itself launches down-left; it never
 *   fires;
 * - `worm.burst`: a trigger of 0 bursts at once, a lone spawn is a leader, the segments keep
 *   following a killed leader's arc (a ghost), the arc passes through the terrain; it never fires;
 * - `boss.maw`: the cutters need the mouth open for more than 12 ticks (the first volley's
 *   delay), `ways` floored / at least 1, a `ring` below 1 fires none, rings alternate their
 *   offset by half a gap, timers below 1 toggle the mouth every tick, the rockets come from the
 *   standing pods in turn (never more than one per pod per launch, none once both are gone), a
 *   part attached to the mouth on its row (rest offset 0) never moves, the jaws keep their x, it
 *   tracks the ship's height within its margins at its speed;
 * - `BossPart.restX` / `restY` (the review fix of M2-11): the boss data's offsets on activation,
 *   untouched by the jaw moves, reset for a new boss in the same slot;
 * - `boss.widow`: swapped box bounds still keep it inside the box, it rests on whole pixels, the
 *   head spits its (floored) spreads while armoured, drones from each standing spinneret at most
 *   once per launch, silk lines — detached, to the left, as tuned — from the spinnerets in turn,
 *   only from standing ones.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BEHAVIORS, DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { BulletKind, LaserPhase } from '../../src/bullets/index.js';
import { PLAYFIELD_H, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { DropKind, EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { BALLISTIC_LANDED, MoverKind } from '../../src/patterns/index.js';
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

/** A roster entry as JSON (only the fields the variants touch are typed). */
interface Entry {
  id: string;
  params?: Record<string, number>;
  boss?: {
    code: string;
    displayName: string;
    parts: Record<string, unknown>[];
    phases: { script: string; params?: Record<string, number>; until?: unknown }[];
  };
  [key: string]: unknown;
}

/** The shipped zone B and C rosters (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-b.enemies.json').data as { enemies: Entry[] }).enemies,
  ...(shipped('enemies/zone-c.enemies.json').data as { enemies: Entry[] }).enemies,
];

/**
 * A deep copy of a shipped roster entry under a new id.
 *
 * @param base - The shipped id.
 * @param id - The variant's id.
 * @returns The copy.
 */
function copy(base: string, id: string): Entry {
  const entry = ROSTER.find((e) => e.id === base);
  if (entry === undefined) throw new Error('no ' + base);
  const out = JSON.parse(JSON.stringify(entry)) as Entry;
  out.id = id;
  return out;
}

/**
 * A variant of a shipped enemy with other tunables.
 *
 * @param base - The shipped id.
 * @param id - The variant's id.
 * @param params - Its tunables (replacing the shipped ones).
 * @returns The entry.
 */
function enemy(base: string, id: string, params: Record<string, number>): Entry {
  const out = copy(base, id);
  out.params = params;
  return out;
}

/**
 * A variant of a shipped boss with one phase of its own script.
 *
 * @param base - The shipped boss id.
 * @param id - The variant's id.
 * @param params - The phase's tunables.
 * @param extraParts - Parts added after the shipped ones.
 * @returns The entry.
 */
function boss(
  base: string,
  id: string,
  params: Record<string, number>,
  extraParts: Record<string, unknown>[] = [],
): Entry {
  const out = copy(base, id);
  const data = out.boss;
  if (data === undefined) throw new Error(base + ' is no boss');
  data.code = 'V-' + id.length.toString();
  data.displayName = id.toUpperCase();
  data.phases = [{ script: data.phases[0].script, params }];
  data.parts.push(...extraParts);
  return out;
}

/** Tunables of a quiet `boss.maw` phase: held still, no rockets, the mouth shut for good. */
const MAW_QUIET = { trackSpeed: 0, closedTicks: 100_000, fireTicks: 100_000, count: 0 } as const;

/** Tunables of a quiet `boss.widow` phase: never stepping, firing or launching. */
const WIDOW_QUIET = { stepTicks: 100_000, fireTicks: 100_000, count: 0 } as const;

/** The test DB: the KESTREL, Type A, the shipped rosters, the variants and a still stage. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-b.enemies.json'),
      shipped('enemies/zone-c.enemies.json'),
      shipped('patterns/zones.patterns.json'),
      shipped('tilesets/terrain-dune.tileset.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('maw-rocket', 'rocket-snap', { launchTicks: 0, turnRate: -3, homeTicks: 0 }),
            enemy('maw-rocket', 'rocket-floor', { launchTicks: 2.7, homeTicks: 3.9 }),
            enemy('dune-worm', 'worm-now', { trigger: 0 }),
            boss('galvanic-maw', 'maw-ring', {
              ...MAW_QUIET,
              closedTicks: 30,
              openTicks: 40,
              ring: 8,
              ringSpeed: 1,
            }),
            boss('galvanic-maw', 'maw-open-12', { ...MAW_QUIET, closedTicks: 20, openTicks: 12 }),
            boss('galvanic-maw', 'maw-open-13', { ...MAW_QUIET, closedTicks: 20, openTicks: 13 }),
            boss('galvanic-maw', 'maw-ways-low', {
              ...MAW_QUIET,
              closedTicks: 20,
              openTicks: 30,
              ways: 0.4,
              ring: 0.6,
            }),
            boss('galvanic-maw', 'maw-ways-mid', {
              ...MAW_QUIET,
              closedTicks: 20,
              openTicks: 30,
              ways: 2.7,
            }),
            boss('galvanic-maw', 'maw-flicker', { ...MAW_QUIET, closedTicks: 0, openTicks: 0.5 }),
            boss('galvanic-maw', 'maw-guns', { ...MAW_QUIET, launchTicks: 30, count: 1 }),
            boss('galvanic-maw', 'maw-volley', { ...MAW_QUIET, launchTicks: 30, count: 5 }),
            boss(
              'galvanic-maw',
              'maw-tongue',
              { ...MAW_QUIET, closedTicks: 20, openTicks: 30, gape: 6.8 },
              [{ name: 'tongue', parent: 'maw', x: -14, sprite: 'bosses/maw-fin' }],
            ),
            boss('sandgrave-widow', 'widow-box', {
              ...WIDOW_QUIET,
              minX: 320,
              maxX: 250,
              minY: 144,
              maxY: 56,
              stepTicks: 20,
            }),
            boss('sandgrave-widow', 'widow-volley', {
              ...WIDOW_QUIET,
              fireTicks: 30,
              ways: 2.7,
              launchTicks: 50,
              count: 5,
            }),
            boss('sandgrave-widow', 'widow-lanes', {
              ...WIDOW_QUIET,
              laserTicks: 40,
              laserLength: 200,
              laserWidth: 8,
              telegraph: 5,
              active: 5,
            }),
          ],
        },
      },
      {
        path: 'stages/w.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'w',
          name: 'W',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 2000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-dune',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [
                {
                  from: 0,
                  to: 2384,
                  floor: { base: 40, amp: 0, period: 64, seed: 1 },
                  ceiling: { base: 32, amp: 0, period: 64, seed: 2 },
                },
              ],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A world, the ship holding fire and invulnerable: free flight, or the still stage `w`
 * (floor at y 160) with the ship flown in.
 *
 * @param stage - Play the still stage.
 * @returns The world.
 */
function world(stage = false): World {
  const w = createWorld(
    resolveGameConfig({
      seed: 11,
      autofire: false,
      remoteMode: false,
      ...(stage ? { stage: 'w' } : {}),
    }),
    DB,
  );
  w.debugFlags.godMode = true;
  if (stage) run(w, 45);
  return w;
}

/**
 * Steps a world with no input, events dropped.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * An enemy index by id.
 *
 * @param id - Enemy id.
 * @returns The index.
 */
function indexOf(id: string): number {
  const index = DB.enemyIndex.get(id);
  if (index === undefined) throw new Error('no ' + id);
  return index;
}

/**
 * Spawns an enemy.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y (`NaN` = on its ground).
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(indexOf(id), x, y);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

/**
 * The live (non-ghost) enemies of an id.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns Them, in slot order.
 */
function live(w: World, id: string): Enemy[] {
  const index = indexOf(id);
  return w.enemies.enemies.filter(
    (e) =>
      e.state === EnemyState.Live && e.specIndex === index && (e.flags & EnemyFlag.Ghost) === 0,
  );
}

/**
 * A free-flight world with a boss started and fighting.
 *
 * @param id - The boss's enemy id.
 * @returns The world.
 */
function fighting(id: string): World {
  const w = world();
  expect(w.bosses.startBoss(indexOf(id))).toBe(true);
  for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  return w;
}

/**
 * A boss part's index by name.
 *
 * @param w - The world.
 * @param name - Part name.
 * @returns Its index.
 */
function part(w: World, name: string): number {
  const b = w.bosses.boss;
  const index = b.parts.findIndex((p, i) => i < b.partCount && p.name === name);
  expect(index, name).toBeGreaterThanOrEqual(0);
  return index;
}

/**
 * Counts the live enemy bullets of a kind.
 *
 * @param w - The world.
 * @param kind - `BulletKind`.
 * @param maxAge - Only bullets at most this old (default: any).
 * @returns The count.
 */
function bullets(w: World, kind: number, maxAge = Number.POSITIVE_INFINITY): number {
  const pool = w.bullets.pool;
  const f = pool.fields;
  let n = 0;
  for (let i = 0; i < pool.count; i++) if (f.kind[i] === kind && f.age[i] <= maxAge) n++;
  return n;
}

/**
 * Steps until the boss's mouth (`maw`) is open (or shut).
 *
 * @param w - The world.
 * @param open - The state awaited.
 * @returns Ticks stepped.
 */
function untilMouth(w: World, open: boolean): number {
  const maw = w.bosses.boss.parts[part(w, 'maw')];
  let t = 0;
  for (; t < 400 && maw.open !== open; t++) run(w, 1);
  expect(maw.open).toBe(open);
  return t;
}

describe('core/behaviors — zones B and C, edge cases (M2-11)', () => {
  it('has the documented default tunables', () => {
    expect(DEFAULT_BEHAVIORS.get('rocket.homing')?.params).toEqual({
      launchTicks: 24,
      launchSpeed: 1,
      speed: 1.25,
      turnRate: 5,
      homeTicks: 60,
    });
    expect(DEFAULT_BEHAVIORS.get('worm.burst')?.params).toEqual({
      trigger: 128,
      vx: -0.8,
      up: 3.4,
      gravity: 0.075,
      maxFall: 4,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.maw')?.params).toEqual({
      trackSpeed: 0.4,
      margin: 44,
      closedTicks: 140,
      openTicks: 90,
      fireTicks: 36,
      bulletSpeed: 1.4,
      ways: 3,
      spread: 48,
      ring: 0,
      ringSpeed: 1,
      launchTicks: 150,
      count: 1,
      gape: 0,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.widow')?.params).toEqual({
      stepTicks: 100,
      minX: 250,
      maxX: 320,
      minY: 56,
      maxY: 144,
      fireTicks: 80,
      bulletSpeed: 1.3,
      ways: 3,
      spread: 40,
      launchTicks: 160,
      count: 1,
      laserTicks: 0,
      laserLength: 384,
      laserWidth: 6,
      telegraph: 50,
      active: 40,
    });
  });
});

describe('core/behaviors rocket.homing — edge cases (M2-11)', () => {
  /**
   * The mover states a rocket runs through, tick by tick from its spawn: `S` = the straight
   * launch, `H<turnRate>` = homing, `-` = none yet.
   *
   * @param id - The rocket's enemy id.
   * @param ticks - Ticks to record.
   * @returns The run-length list, e.g. `['S×20', 'H5×60', 'H0×10']`.
   */
  function phases(id: string, ticks: number): string[] {
    const w = world();
    const e = spawn(w, id, w.camera.x + 330, w.camera.y + 30);
    const out: string[] = [];
    let last = '';
    let n = 0;
    for (let t = 0; t < ticks; t++) {
      run(w, 1);
      const now =
        e.mover === MoverKind.Straight
          ? 'S'
          : e.mover === MoverKind.Homing
            ? 'H' + e.m1.toString()
            : '-';
      if (now !== last && n > 0) {
        out.push(last + '×' + n.toString());
        n = 0;
      }
      last = now;
      n++;
    }
    out.push(last + '×' + n.toString());
    return out;
  }

  it('launches for exactly launchTicks, homes for exactly homeTicks, then flies on at turn rate 0', () => {
    // The shipped rocket: 20 ticks out, 60 homing at 5 units a tick.
    expect(phases('maw-rocket', 100)).toEqual(['S×20', 'H5×60', 'H0×20']);
  });

  it('floors fractional times and turns times below 1 into one tick', () => {
    expect(phases('rocket-floor', 12)).toEqual(['S×2', 'H5×3', 'H0×7']);
    // 1 tick out, 1 homing at turn rate 0 (clamped), then on at 0: one run of H0.
    expect(phases('rocket-snap', 6)).toEqual(['S×1', 'H0×5']);
  });

  it('clamps a negative turn rate to 0: it keeps its launch heading at its homing speed', () => {
    const w = world();
    // Above the middle row: launched up-left; the ship lies far below-left of it.
    const e = spawn(w, 'rocket-snap', w.camera.x + 330, w.camera.y + 30);
    run(w, 1);
    expect(e.mover).toBe(MoverKind.Straight);
    run(w, 1);
    expect(e.mover).toBe(MoverKind.Homing);
    expect(e.m1).toBe(0);
    for (let t = 0; t < 20; t++) {
      run(w, 1);
      expect(e.vx).toBeCloseTo(-1.25 * Math.SQRT1_2, 2);
      expect(e.vy).toBeCloseTo(-1.25 * Math.SQRT1_2, 2);
    }
  });

  it('launches down-left from the middle row itself, and never fires', () => {
    const w = world();
    const e = spawn(w, 'maw-rocket', w.camera.x + 330, w.camera.y + PLAYFIELD_H / 2);
    run(w, 2);
    expect(e.vx).toBeLessThan(0);
    expect(e.vy).toBeGreaterThan(0);
    run(w, 150);
    expect(w.bullets.count).toBe(0);
  });
});

describe('core/behaviors worm.burst — edge cases (M2-11)', () => {
  it('bursts at once with a trigger of 0, a lone spawn leading itself, and never fires', () => {
    const w = world();
    const ship = w.players[0];
    const e = spawn(w, 'worm-now', w.camera.x + 360, w.camera.y + 170);
    expect(Math.abs(e.x - ship.x)).toBeGreaterThan(190);
    run(w, 3);
    expect(e.mover).toBe(MoverKind.Ballistic);
    expect(e.vy).toBeLessThan(0);
    expect(e.vx).toBeCloseTo(-0.8, 9); // the default (the variant sets only the trigger)
    // The shipped worm with the same spawn waits (the ship is beyond its 190-px trigger).
    const waiting = spawn(w, 'dune-worm', w.camera.x + 360, w.camera.y + 170);
    run(w, 60);
    expect(waiting.vx).toBe(0);
    expect(waiting.vy).toBe(0);
    expect(w.bullets.count).toBe(0);
  });

  it('keeps the segments on the arc of a leader that was shot (its ghost records on)', () => {
    const w = world();
    const slot = w.enemies.startFormation(
      indexOf('worm-now'),
      4,
      7,
      380,
      170,
      -1,
      DropKind.None,
      0,
    );
    expect(slot).toBeGreaterThanOrEqual(0);
    run(w, 25);
    const worm = w.enemies.enemies.filter(
      (e) => e.state === EnemyState.Live && e.specIndex === indexOf('worm-now'),
    );
    expect(worm).toHaveLength(4);
    const leader = worm.find((e) => (e.flags & EnemyFlag.Leader) !== 0);
    const second = worm.find((e) => e.member === 1);
    if (leader === undefined || second === undefined) throw new Error('no worm');
    expect(w.enemies.kill(leader, 0)).toBe(true);
    expect(leader.state).toBe(EnemyState.Live);
    expect(leader.flags & EnemyFlag.Ghost).not.toBe(0);
    const track: [number, number][] = [];
    for (let t = 0; t < 30; t++) {
      run(w, 1);
      track.push([leader.x, leader.y]);
    }
    // The ghost flies on along the arc, and the next segment stands where it stood 7 ticks ago.
    expect(track[29][1]).not.toBe(track[0][1]);
    expect(second.state).toBe(EnemyState.Live);
    expect(second.x).toBeCloseTo(track[29 - 7][0], 9);
    expect(second.y).toBeCloseTo(track[29 - 7][1], 9);
  });

  it('passes through the terrain: back down into the dune it came from, never landing', () => {
    const w = world(true);
    const e = spawn(w, 'worm-now', w.camera.x + 300, Number.NaN);
    const floor = e.y + e.hh; // it lies on the floor
    expect(floor).toBeGreaterThan(150);
    let top = e.y;
    let buried = false;
    for (let t = 0; t < 200 && e.state === EnemyState.Live; t++) {
      run(w, 1);
      if (e.y < top) top = e.y;
      if (e.y - e.hh > floor) buried = true;
      expect(e.s0).not.toBe(BALLISTIC_LANDED);
    }
    expect(floor - top).toBeGreaterThan(50);
    expect(buried).toBe(true);
  });
});

describe('core/behaviors boss.maw — edge cases (M2-11)', () => {
  it.each([
    ['maw-open-12', 0],
    ['maw-open-13', 3],
  ])(
    '%s: the cutters come 12 ticks after the mouth opens — only if it stays open longer (%i)',
    (id, needles) => {
      const w = fighting(id);
      untilMouth(w, true);
      let most = 0;
      for (let t = 0; t < 40; t++) {
        run(w, 1);
        const n = bullets(w, BulletKind.NeedlePurple);
        if (n > most) most = n;
      }
      expect(most).toBe(needles);
    },
  );

  it.each([
    ['maw-ways-low', 1],
    ['maw-ways-mid', 2],
  ])('%s: ways floored, at least 1 (%i per volley); a ring below 1 fires none', (id, ways) => {
    const w = fighting(id);
    untilMouth(w, true);
    run(w, 12);
    expect(bullets(w, BulletKind.NeedlePurple)).toBe(ways);
    expect(bullets(w, BulletKind.RoundRed)).toBe(0);
  });

  it('fires a ring as the mouth opens, each ring turned half a gap from the last', () => {
    const w = fighting('maw-ring');
    const angles = (): number[] => {
      const pool = w.bullets.pool;
      const f = pool.fields;
      const out: number[] = [];
      for (let i = 0; i < pool.count; i++) {
        if (f.kind[i] === BulletKind.RoundRed && f.age[i] <= 1) {
          out.push(((Math.round(f.angle[i]) % ANGLE_UNITS) + ANGLE_UNITS) % ANGLE_UNITS);
        }
      }
      return out.sort((a, b) => a - b);
    };
    const gap = ANGLE_UNITS / 8;
    untilMouth(w, true);
    const first = angles();
    expect(first).toEqual(Array.from({ length: 8 }, (_v, k) => k * gap));
    // Nothing more while it stays open; the next ring at the next opening.
    run(w, 5);
    expect(angles()).toEqual([]);
    untilMouth(w, false);
    untilMouth(w, true);
    expect(angles()).toEqual(Array.from({ length: 8 }, (_v, k) => k * gap + gap / 2));
    untilMouth(w, false);
    untilMouth(w, true);
    expect(angles()).toEqual(first);
  });

  it('toggles the mouth every tick when its timers are below 1 (and never has time to cut)', () => {
    const w = fighting('maw-flicker');
    const maw = w.bosses.boss.parts[part(w, 'maw')];
    run(w, 2);
    let flips = 0;
    let was = maw.open;
    for (let t = 0; t < 60; t++) {
      run(w, 1);
      if (maw.open !== was) flips++;
      was = maw.open;
    }
    expect(flips).toBe(60);
    expect(w.bullets.count).toBe(0);
  });

  it('launches the rockets from the standing pods in turn, none once both are gone', () => {
    const w = fighting('maw-guns');
    const boss = w.bosses.boss;
    const top = part(w, 'pod-top');
    const bottom = part(w, 'pod-bottom');
    /**
     * Steps until the next rocket leaves a pod.
     *
     * @param ticks - Most ticks to wait.
     * @returns `'top'`, `'bottom'` or `'none'`.
     */
    const next = (ticks: number): string => {
      for (let t = 0; t < ticks; t++) {
        run(w, 1);
        const fresh = live(w, 'maw-rocket').filter((e) => e.age <= 1);
        if (fresh.length === 0) continue;
        expect(fresh).toHaveLength(1);
        const y = fresh[0].y;
        return Math.abs(y - boss.parts[top].y) < 4
          ? 'top'
          : Math.abs(y - boss.parts[bottom].y) < 4
            ? 'bottom'
            : 'other';
      }
      return 'none';
    };
    expect([next(40), next(40), next(40)]).toEqual(['top', 'bottom', 'top']);
    // A pod shot away: the other one launches every time.
    expect(w.bosses.damagePart(top, 99, 0)).toBe(BossHit.Destroyed);
    expect([next(40), next(40)]).toEqual(['bottom', 'bottom']);
    expect(w.bosses.damagePart(bottom, 99, 0)).toBe(BossHit.Destroyed);
    expect(next(100)).toBe('none');
    expect(boss.state).toBe(BossState.Fight);
  });

  it('never launches more rockets at once than it has standing pods', () => {
    const w = fighting('maw-volley');
    let most = 0;
    for (let t = 0; t < 100; t++) {
      run(w, 1);
      const fresh = live(w, 'maw-rocket').filter((e) => e.age <= 1).length;
      if (fresh > most) most = fresh;
    }
    expect(most).toBe(2);
    expect(live(w, 'maw-rocket').length).toBe(6); // three launches of two
  });

  it('moves only the jaws (floored gape), along y: a part on the mouth’s row stays put', () => {
    const w = fighting('maw-tongue');
    const parts = w.bosses.boss.parts;
    const tongue = parts[part(w, 'tongue')];
    const top = parts[part(w, 'jaw-top')];
    const bottom = parts[part(w, 'jaw-bottom')];
    expect([tongue.restX, tongue.restY]).toEqual([-14, 0]);
    for (const open of [true, false, true]) {
      untilMouth(w, open);
      expect([tongue.localX, tongue.localY]).toEqual([-14, 0]);
      expect([top.localX, top.localY]).toEqual([-8, open ? -15 : -9]);
      expect([bottom.localX, bottom.localY]).toEqual([-8, open ? 15 : 9]);
    }
  });

  it('tracks the ship’s height at its speed, never past its margins', () => {
    const w = fighting('galvanic-maw');
    const boss = w.bosses.boss;
    const ship = w.players[0];
    const margin = 44;
    const speed = 0.35; // phase 0
    for (const shipY of [4, PLAYFIELD_H - 4, PLAYFIELD_H / 2 + 7]) {
      for (let t = 0; t < 500; t++) {
        ship.y = w.camera.y + shipY;
        const y = boss.screenY;
        run(w, 1);
        expect(Math.abs(boss.screenY - y)).toBeLessThanOrEqual(speed + 1e-9);
        expect(boss.screenY).toBeGreaterThanOrEqual(margin - 1e-9);
        expect(boss.screenY).toBeLessThanOrEqual(PLAYFIELD_H - margin + 1e-9);
      }
    }
    expect(boss.phase).toBe(0);
  });
});

describe('core/bosses BossPart.restX / restY (M2-11 review fix)', () => {
  it('holds the boss data’s offsets from activation on, whatever the behaviour moves', () => {
    const w = fighting('galvanic-maw');
    const spec = DB.enemies[indexOf('galvanic-maw')].boss?.parts ?? [];
    const parts = w.bosses.boss.parts;
    spec.forEach((source, i) => {
      expect([parts[i].restX, parts[i].restY], source.name).toEqual([source.x, source.y]);
    });
    untilMouth(w, true);
    const jaw = parts[part(w, 'jaw-top')];
    expect(jaw.localY).toBe(-13);
    expect(jaw.restY).toBe(-9);
  });

  it('is reset for the next boss in the slot, which starts at its own offsets', () => {
    const w = fighting('galvanic-maw');
    untilMouth(w, true); // the jaws gape
    w.bosses.clear();
    expect(w.bosses.startBoss(indexOf('sandgrave-widow'))).toBe(true);
    const widow = DB.enemies[indexOf('sandgrave-widow')].boss?.parts ?? [];
    const parts = w.bosses.boss.parts;
    widow.forEach((source, i) => {
      expect([parts[i].restX, parts[i].restY], source.name).toEqual([source.x, source.y]);
      expect([parts[i].localX, parts[i].localY], source.name).toEqual([source.x, source.y]);
    });
    w.bosses.clear();
    expect(w.bosses.startBoss(indexOf('galvanic-maw'))).toBe(true);
    const jaw = parts[part(w, 'jaw-top')];
    expect([jaw.localX, jaw.localY, jaw.restX, jaw.restY]).toEqual([-8, -9, -8, -9]);
  });
});

describe('core/behaviors boss.widow — edge cases (M2-11)', () => {
  it('orders swapped box bounds and rests on whole pixels inside the box', () => {
    const w = fighting('widow-box');
    const boss = w.bosses.boss;
    const rests = new Set<string>();
    let x = boss.screenX;
    let y = boss.screenY;
    for (let t = 0; t < 600; t++) {
      run(w, 1);
      expect(boss.screenX).toBeGreaterThanOrEqual(250 - 1e-9);
      expect(boss.screenX).toBeLessThanOrEqual(320 + 1e-9);
      expect(boss.screenY).toBeGreaterThanOrEqual(56 - 1e-9);
      expect(boss.screenY).toBeLessThanOrEqual(144 + 1e-9);
      if (boss.screenX === x && boss.screenY === y) {
        expect(Number.isInteger(x) && Number.isInteger(y), `${x}, ${y}`).toBe(true);
        rests.add(`${x},${y}`);
      }
      x = boss.screenX;
      y = boss.screenY;
    }
    expect(rests.size).toBeGreaterThanOrEqual(10);
  });

  it('spits the floored spread from the armoured head, one drone per standing spinneret', () => {
    const w = fighting('widow-volley');
    const head = part(w, 'head');
    run(w, 25);
    expect(bullets(w, BulletKind.OvalRed)).toBe(0);
    run(w, 10);
    expect(bullets(w, BulletKind.OvalRed)).toBe(2); // ways 2.7 → 2
    expect(w.bosses.damagePart(head, 1, 0)).toBe(BossHit.Clink);
    expect(live(w, 'widow-drone')).toHaveLength(0);
    run(w, 20);
    expect(live(w, 'widow-drone')).toHaveLength(2); // count 5, two spinnerets
    w.bosses.damagePart(part(w, 'spinneret-top'), 99, 0);
    run(w, 50);
    expect(live(w, 'widow-drone').filter((e) => e.age <= 50)).toHaveLength(1);
  });

  it('spins detached silk lines to the left from the spinnerets in turn, only standing ones', () => {
    const w = fighting('widow-lanes');
    const boss = w.bosses.boss;
    const top = part(w, 'spinneret-top');
    const bottom = part(w, 'spinneret-bottom');
    const lasers = w.bullets.lasers;
    const lf = lasers.fields;
    /**
     * Steps until a new silk line is telegraphed and names its spinneret.
     *
     * @param ticks - Most ticks to wait.
     * @returns `'top'`, `'bottom'` or `'none'`.
     */
    const next = (ticks: number): string => {
      for (let t = 0; t < ticks; t++) {
        run(w, 1);
        for (let i = 0; i < lasers.count; i++) {
          if (lf.phase[i] !== LaserPhase.Telegraph || lf.ticks[i] > 1) continue;
          expect(lf.src[i]).toBe(-1); // detached: it stays in its lane
          expect(lf.angle[i]).toBe(ANGLE_UNITS / 2);
          expect([lf.length[i], lf.width[i], lf.telegraph[i], lf.active[i]]).toEqual([
            200, 8, 5, 5,
          ]);
          const y = lf.y[i];
          run(w, 3); // past this line's first ticks
          return Math.abs(y - boss.parts[top].y) < 1
            ? 'top'
            : Math.abs(y - boss.parts[bottom].y) < 1
              ? 'bottom'
              : 'other';
        }
      }
      return 'none';
    };
    expect([next(50), next(50), next(50)]).toEqual(['top', 'bottom', 'top']);
    expect(lasers.count).toBeLessThanOrEqual(1);
    w.bosses.damagePart(top, 99, 0);
    expect([next(50), next(50)]).toEqual(['bottom', 'bottom']);
    w.bosses.damagePart(bottom, 99, 0);
    expect(next(120)).toBe('none');
    expect(boss.state).toBe(BossState.Fight);
  });
});
