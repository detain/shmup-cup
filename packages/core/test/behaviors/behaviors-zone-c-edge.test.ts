/**
 * Edge cases of the M2-11 behaviours (`core/behaviors`), beyond `behaviors-zone-c.test.ts`, on
 * variants of the shipped zone C roster (free flight — a static camera — unless a test needs
 * terrain, the ship holding its fire and invulnerable):
 *
 * - `worm.burst`: a trigger of 0 bursts at once, a lone spawn is a leader, the segments keep
 *   following a killed leader's arc (a ghost), the arc passes through the terrain; it never fires;
 * - `boss.widow`: swapped box bounds still keep it inside the box, it rests on whole pixels, the
 *   head spits its (floored) spreads while armoured, drones from each standing spinneret at most
 *   once per launch, silk lines — detached, to the left, as tuned — from the spinnerets in turn,
 *   only from standing ones, and the whole-lane wait between them.
 */
import { describe, expect, it } from 'vitest';
import { BossHit, BossState } from '../../src/bosses/index.js';
import {
  BulletFlag,
  BulletKind,
  LASER_FADE_TICKS,
  LASER_GROW_TICKS,
  LaserPhase,
} from '../../src/bullets/index.js';
import { PLAYFIELD_H } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { DropKind, EnemyFlag, EnemyState } from '../../src/enemies/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { BALLISTIC_LANDED, MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { bullets, rosterKitBc, run, zoneKitEdgeBc, type Entry } from '../helpers/zone-behaviors.js';
import { v1rel, v1screenX, v1speed, v1y } from '../helpers/v1-port.js';

/** Terrain-dune's tile edge as shipped (8 until R2-02's port, 12 after): this fixture pairs with it. */
const TS = (shipped('tilesets/terrain-dune.tileset.json').data as { tileSize: number }).tileSize;

/** The shipped zone C roster (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-c.enemies.json').data as { enemies: Entry[] }).enemies,
];

const { enemy, boss } = rosterKitBc(ROSTER);

/** Tunables of a quiet `boss.widow` phase: never stepping, firing or launching. */
const WIDOW_QUIET = { stepTicks: 100_000, fireTicks: 100_000, count: 0 } as const;

/** The test DB: the KESTREL, Type A, the shipped zone C roster, the variants and a still stage. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-c.enemies.json'),
      ...shippedPatterns(),
      shipped('tilesets/terrain-dune.tileset.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('dune-worm', 'worm-now', { trigger: 0 }),
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
            boss('sandgrave-widow', 'widow-overlap', {
              ...WIDOW_QUIET,
              laserTicks: 40,
              telegraph: 50,
              active: 40,
            }),
            boss('sandgrave-widow', 'widow-slow', {
              ...WIDOW_QUIET,
              laserTicks: 300,
              telegraph: 5,
              active: 5,
            }),
            boss('sandgrave-widow', 'widow-fraction', {
              ...WIDOW_QUIET,
              laserTicks: 1,
              telegraph: 20.4,
              active: 10.2,
            }),
            boss('sandgrave-widow', 'widow-negative', {
              ...WIDOW_QUIET,
              laserTicks: 1,
              telegraph: -5,
              active: 12,
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
            tileSize: TS,
            tileset: 'terrain-dune',
            rowsTall: PLAYFIELD_H / TS,
            generator: {
              type: 'heightfield',
              segments: [
                {
                  from: 0,
                  to: 2384,
                  floor: { base: v1rel(40), amp: 0, period: 64, seed: 1 },
                  ceiling: { base: v1y(32), amp: 0, period: 64, seed: 2 },
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

const { world, indexOf, spawn, fighting, live, part } = zoneKitEdgeBc(DB);

describe('core/behaviors worm.burst — edge cases (M2-11)', () => {
  it('bursts at once with a trigger of 0, a lone spawn leading itself, and never fires', () => {
    const w = world();
    const ship = w.players[0];
    const e = spawn(w, 'worm-now', w.camera.x + v1screenX(360), w.camera.y + 170);
    expect(Math.abs(e.x - ship.x)).toBeGreaterThan(v1rel(190));
    run(w, 3);
    expect(e.mover).toBe(MoverKind.Ballistic);
    expect(e.vy).toBeLessThan(0);
    expect(e.vx).toBeCloseTo(-v1speed(0.8), 9); // the default (the variant sets only the trigger)
    // The shipped worm with the same spawn waits (the ship is beyond its 190-px trigger, ported).
    const waiting = spawn(w, 'dune-worm', w.camera.x + v1screenX(360), w.camera.y + 170);
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

describe('core/behaviors boss.widow — edge cases (M2-11)', () => {
  it('orders swapped box bounds and rests on whole pixels inside the box', () => {
    const w = fighting('widow-box');
    const boss = w.bosses.boss;
    // The box is the variant's own inline params (never ported); the boss walks to it from its
    // shipped home (a screen-x, ported at the kit's ×1.5) after the first step (20 + 12 ticks).
    run(w, 40);
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

  it('waits a whole lane before the next silk line, however short laserTicks is (M2-18)', () => {
    const w = fighting('widow-overlap');
    const lasers = w.bullets.lasers;
    const lf = lasers.fields;
    // telegraph 50 + grow + active 40 + fade: never two lines at once, never sooner.
    const lane = 50 + LASER_GROW_TICKS + 40 + LASER_FADE_TICKS;
    const starts: number[] = [];
    for (let t = 0; t < 800; t++) {
      run(w, 1);
      let live = 0;
      for (let i = 0; i < lasers.count; i++) {
        if ((lf.flags[i] & BulletFlag.Dead) !== 0) continue;
        live++;
        // A line just telegraphed (its first ticks), counted once.
        const fresh = lf.phase[i] === LaserPhase.Telegraph && lf.ticks[i] <= 1;
        if (fresh && (starts.length === 0 || w.tick - starts[starts.length - 1] > 2)) {
          starts.push(w.tick);
        }
      }
      expect(live).toBeLessThanOrEqual(1);
    }
    expect(starts.length).toBeGreaterThanOrEqual(5);
    for (let k = 1; k < starts.length; k++) {
      expect(starts[k] - starts[k - 1]).toBeGreaterThanOrEqual(lane);
    }
  });
});

/**
 * Fights a `boss.widow` variant and records when each silk line was fired (the World's
 * `bullets.fireLaser` wrapped) and the most lines alive at once.
 *
 * @param id - The variant.
 * @param ticks - Ticks to fight.
 * @returns The fire ticks and the most live lines.
 */
function silkLines(id: string, ticks: number): { starts: number[]; mostLive: number } {
  const w = fighting(id);
  const bullets = w.bullets;
  const fire = bullets.fireLaser.bind(bullets);
  const starts: number[] = [];
  bullets.fireLaser = (...args: Parameters<typeof fire>): number => {
    starts.push(w.tick);
    return fire(...args);
  };
  const lf = bullets.lasers.fields;
  let mostLive = 0;
  for (let t = 0; t < ticks; t++) {
    run(w, 1);
    let alive = 0;
    for (let i = 0; i < bullets.lasers.count; i++) {
      if ((lf.flags[i] & BulletFlag.Dead) === 0) alive++;
    }
    if (alive > mostLive) mostLive = alive;
  }
  return { starts, mostLive };
}

describe('core/behaviors boss.widow — the whole-lane wait, edge cases (M2-18 tests)', () => {
  it('does not stretch a laserTicks longer than a lane: the lines keep their own rhythm', () => {
    const { starts, mostLive } = silkLines('widow-slow', 1300);
    const lane = 5 + LASER_GROW_TICKS + 5 + LASER_FADE_TICKS;
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(mostLive).toBe(1);
    const gaps = starts.slice(1).map((s, k) => s - starts[k]);
    for (const gap of gaps) {
      // Far longer than a lane (the rank-scaled 300), and the same every time.
      expect(gap).toBeGreaterThan(lane * 4);
      expect(gap).toBe(gaps[0]);
    }
  });

  it('rounds a fractional telegraph and active time up for the wait: never two lines at once', () => {
    const { starts, mostLive } = silkLines('widow-fraction', 600);
    const lane = 21 + LASER_GROW_TICKS + 11 + LASER_FADE_TICKS;
    expect(starts.length).toBeGreaterThanOrEqual(8);
    expect(mostLive).toBe(1);
    for (let k = 1; k < starts.length; k++) {
      // laserTicks 1: the lane alone sets the rhythm.
      expect(starts[k] - starts[k - 1]).toBe(lane);
    }
  });

  it('counts a negative telegraph as none: the lane is grow + active + fade', () => {
    const { starts, mostLive } = silkLines('widow-negative', 400);
    const lane = LASER_GROW_TICKS + 12 + LASER_FADE_TICKS;
    expect(starts.length).toBeGreaterThanOrEqual(8);
    expect(mostLive).toBe(1);
    for (let k = 1; k < starts.length; k++) {
      expect(starts[k] - starts[k - 1]).toBe(lane);
    }
  });
});
