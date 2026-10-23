/**
 * Edge cases of the plan M2-14 behaviours (`mine.burst`, `boss.ark`, `boss.angler`) beyond
 * `behaviors-zone-i.test.ts`, on test enemies and bosses that run them with tunables at and past
 * their documented limits, in free flight (a static camera, the ship invulnerable and holding its
 * fire):
 *
 * - `mine.burst`: `trigger` 0 never arms (it drifts on); `ring` 0 bursts into nothing, `ring` is
 *   floored; `fuse` below 1 is one tick; a mine that bursts scores nothing and drops nothing;
 * - `boss.ark`: a gun off screen never fires or launches; `ways` below 1 is one bullet; `aimStep`
 *   caps the turn of a volley; the ring comes from the on-screen core, turned half a gap each time;
 * - `boss.angler`: an open mouth shorter than the first spread's 12 ticks fires nothing; `gape` 0
 *   keeps the jaws at rest, a fractional one is floored; the ring as it opens, turned half a gap
 *   each time; every phase starts with the mouth shut;
 * - `rocket.homing` (R5-09.S4a): `turnRate` 0 holds the launch's diagonal — the rocket never
 *   turns towards the ship;
 * - `captain.crab` (R5-09.S4a): a reversed box still holds its steps inside the same shelves
 *   (the bounds swap), `ring` 0.6 fires one bullet, `turn` 16.7 floors to 16-unit steps.
 *
 * The emitter and the sovereign are in `behaviors-zone-h-edge.test.ts`; the `drone` entry the ark
 * casts rides both files (R5-P.P5a2).
 */
import { describe, expect, it } from 'vitest';
import { BossHit, BossMotion, BossState } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { PLAYFIELD_W } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped } from '../helpers/shipped.js';
import { enemy, fired, run, zoneKitEdgeHi } from '../helpers/zone-behaviors.js';

/** The test roster. */
const ROSTER = [
  enemy('mine-inert', 'mine.burst', { trigger: 0 }),
  enemy('mine-dud', 'mine.burst', { ring: 0, fuse: 5 }, { drop: 'capsule' }),
  enemy('mine-quick', 'mine.burst', { fuse: 0.3, ring: 5.7 }, { drop: 'capsule' }),
  // The drone the ark below casts (the sovereign launches it too — the entry rides both H and
  // I edge files, R5-P.P5a2).
  enemy('drone', 'drifter.sine', {}),
  // R5-09.S4a — the stinger as a rocket that never homes (`turnRate` 0).
  enemy('stinger-flat', 'rocket.homing', {
    launchTicks: 20,
    launchSpeed: 1.5,
    speed: 1.8,
    turnRate: 0,
    homeTicks: 70,
  }),
  {
    id: 'arkt',
    boss: {
      code: 'AK-90',
      displayName: 'TEST ARK',
      introTicks: 0,
      score: 100,
      x: 250,
      y: 108,
      minion: 'drone',
      // A raid: the camera rides with it, 200 px left of it and level — its `far` gun off screen,
      // 66 px past the right edge (x 250 at 384×216).
      raid: { segments: [{ x: -200, y: -108, ticks: 10, hold: 30000 }] },
      parts: [
        { name: 'hull', hurtbox: { hw: 12, hh: 12 }, vulnerable: 'never' },
        { name: 'heart', hp: 50, hurtbox: { hw: 5, hh: 5 }, core: true },
        { name: 'near', x: -40, y: -30, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
        { name: 'far', x: PLAYFIELD_W - 134, y: 30, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
      ],
      phases: [
        {
          script: 'boss.ark',
          params: {
            fireTicks: 10,
            ways: 0,
            aimStep: 8,
            ring: 4,
            ringTicks: 25,
            launchTicks: 12,
            count: 5,
          },
        },
      ],
    },
  },
  {
    id: 'ark3',
    boss: {
      code: 'AK-91',
      displayName: 'TEST ARK THREE',
      introTicks: 0,
      score: 100,
      x: 280,
      y: 108,
      minion: 'drone',
      parts: [
        { name: 'hull', hurtbox: { hw: 12, hh: 12 }, vulnerable: 'never' },
        { name: 'heart', hp: 50, hurtbox: { hw: 5, hh: 5 }, core: true },
        { name: 'g1', x: -20, y: -60, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
        { name: 'g2', x: -20, y: 0, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
        { name: 'g3', x: -20, y: 60, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
      ],
      phases: [{ script: 'boss.ark', params: { fireTicks: 1000, launchTicks: 20, count: 2 } }],
    },
  },
  {
    id: 'angl',
    boss: {
      code: 'AN-90',
      displayName: 'TEST ANGLER',
      introTicks: 0,
      score: 100,
      x: 280,
      y: 108,
      parts: [
        { name: 'body', hurtbox: { hw: 12, hh: 12 }, vulnerable: 'never' },
        {
          name: 'maw',
          x: -14,
          hp: 60,
          hurtbox: { hw: 5, hh: 5 },
          core: true,
          vulnerable: 'whenOpen',
        },
        {
          name: 'jaw-top',
          parent: 'maw',
          x: -6,
          y: -8,
          hurtbox: { hw: 6, hh: 2 },
          vulnerable: 'never',
        },
        {
          name: 'jaw-bot',
          parent: 'maw',
          x: -6,
          y: 8,
          hurtbox: { hw: 6, hh: 2 },
          vulnerable: 'never',
        },
        { name: 'stalk', parent: 'body', x: -16, y: -24, radius: 3, vulnerable: 'never' },
        { name: 'lure', parent: 'stalk', x: -8, radius: 4, hp: 20, gun: true },
      ],
      phases: [
        {
          script: 'boss.angler',
          params: { trackSpeed: 0, closedTicks: 0.5, openTicks: 5, gape: 0, ways: 2 },
          until: { hpBelow: 50 },
        },
        {
          script: 'boss.angler',
          params: { trackSpeed: 0, closedTicks: 10, openTicks: 40, gape: 4.7, ring: 6 },
        },
      ],
    },
  },
  // R5-09.S4a — THE TRENCH HERMIT's shell with its bounds reversed and its ring / turn below 1
  // and fractional (a hand entry: this file's roster carries no sprites).
  {
    id: 'crabflip',
    boss: {
      code: 'CF-99',
      displayName: 'TEST CRAB',
      introTicks: 0,
      score: 100,
      x: 480,
      y: 180,
      parts: [
        { name: 'hub', hp: 40, radius: 12, core: true, spin: 6 },
        { name: 'claw-l', parent: 'hub', x: -21, y: -24, radius: 9, vulnerable: 'never' },
        { name: 'claw-r', parent: 'hub', x: -21, y: 24, radius: 9, vulnerable: 'never' },
      ],
      phases: [
        {
          script: 'captain.crab',
          params: {
            stepTicks: 40,
            minX: 574,
            maxX: 407,
            minY: 264,
            maxY: 96,
            ringTicks: 40,
            ring: 0.6,
            bulletSpeed: 1.5,
            turn: 16.7,
          },
        },
      ],
    },
  },
];

/** The KESTREL, Type A and the test roster. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/hi-edge.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: ROSTER },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { freeFlight, spawn, fighting, live, part } = zoneKitEdgeHi(DB);

describe('core/behaviors — zone I, edge cases (M2-14 tests)', () => {
  describe('mine.burst', () => {
    it('never arms with trigger 0: it drifts on past the ship', () => {
      const w = freeFlight();
      const ship = w.players[0];
      const mine = spawn(w, 'mine-inert', ship.x - w.camera.x + 30, ship.y - w.camera.y);
      const bullets = w.bullets.count;
      run(w, 120);
      expect(mine.state).toBe(EnemyState.Live);
      expect(mine.mover).toBe(MoverKind.Sine);
      expect(mine.x).toBeLessThan(ship.x); // drifted past it
      expect(mine.flashTicks).toBe(0);
      expect(w.bullets.count).toBe(bullets);
    });

    it('bursts into nothing with ring 0 — no score, no drop — and floors a fractional ring', () => {
      const w = freeFlight();
      const ship = w.players[0];
      const score = w.scoring.board.scores[0].score;
      const dud = spawn(w, 'mine-dud', ship.x - w.camera.x + 20, ship.y - w.camera.y);
      run(w, 3); // seen, woken, armed
      expect(dud.mover).toBe(MoverKind.None);
      expect(dud.flashTicks).toBeGreaterThanOrEqual(4);
      w.bullets.pool.clear();
      run(w, 8);
      expect(dud.state).not.toBe(EnemyState.Live);
      expect(w.bullets.count).toBe(0);
      expect(w.scoring.board.scores[0].score).toBe(score);
      run(w, 2);
      expect(w.powerups.pool.count).toBe(0);
      // fuse 0.3 → one tick; ring 5.7 → five bullets.
      const quick = spawn(w, 'mine-quick', ship.x - w.camera.x + 20, ship.y - w.camera.y);
      let armed = -1;
      let burst: Array<[number, number, number, number]> = [];
      for (let t = 0; t < 8 && burst.length === 0; t++) {
        burst = fired(w);
        if (armed < 0 && quick.mover === MoverKind.None) armed = t;
      }
      // Armed on its third tick, burst on the next: a one-tick fuse.
      expect(armed).toBe(2);
      expect(burst).toHaveLength(5);
      for (const b of burst) expect(b[3]).toBe(BulletKind.RoundRed);
      expect(quick.state).not.toBe(EnemyState.Live);
      run(w, 2);
      expect(w.powerups.pool.count).toBe(0);
      expect(w.scoring.board.scores[0].score).toBe(score);
    });

    it('scores and drops when shot before it arms', () => {
      const w = freeFlight();
      const mine = spawn(w, 'mine-dud', 330, 30);
      run(w, 5);
      const score = w.scoring.board.scores[0].score;
      expect(w.enemies.kill(mine, 0)).toBe(true);
      run(w, 2);
      expect(w.scoring.board.scores[0].score).toBe(score + 300);
      expect(w.powerups.pool.count).toBe(1);
    });
  });

  describe('boss.ark', () => {
    it('fires and launches only from the guns on screen; ways below 1 is one bullet; aimStep caps the turn', () => {
      const w = fighting('arkt');
      const boss = w.bosses.boss;
      const near = boss.parts[part(w, 'near')];
      const far = boss.parts[part(w, 'far')];
      expect(near.inView).toBe(true);
      expect(far.inView).toBe(false);
      const start = near.angle;
      let volleys = 0;
      for (let t = 0; t < 12 && volleys === 0; t++) {
        const shots = fired(w).filter((s) => s[3] === BulletKind.RoundPink);
        if (shots.length === 0) continue;
        volleys++;
        // One pink round (ways 0 → 1), from the gun on screen.
        expect(shots).toHaveLength(1);
        expect(Math.abs(shots[0][1] - near.y)).toBeLessThan(3);
      }
      expect(volleys).toBe(1);
      // Turned at most aimStep (8) units towards the ship.
      const turn = ((near.angle - start + 512 + 1024) % 1024) - 512;
      expect(Math.abs(turn)).toBeGreaterThan(0);
      expect(Math.abs(turn)).toBeLessThanOrEqual(8);
      expect(far.angle).toBe(0);
      // Hooks: count 5, but only the gun on screen casts — one per launch, from it.
      const launches: number[] = [];
      let drones = live(w, 'drone').length;
      for (let t = 0; t < 40; t++) {
        run(w, 1);
        const now = live(w, 'drone');
        if (now.length > drones) {
          launches.push(now.length - drones);
          for (const d of now.slice(drones)) expect(Math.abs(d.y - near.y)).toBeLessThan(4);
        }
        drones = now.length;
      }
      expect(launches.length).toBeGreaterThanOrEqual(3);
      for (const n of launches) expect(n).toBe(1);
    });

    it('casts its hooks from distinct guns in turn: never two from one gun in a launch (M2-14 tests fix)', () => {
      const w = fighting('ark3');
      const boss = w.bosses.boss;
      const rows = ['g1', 'g2', 'g3'].map((name) => boss.parts[part(w, name)].y);
      /**
       * The gun a drone left from, by its height.
       *
       * @param d - The drone on its first tick.
       * @returns The gun's name.
       */
      const gunOf = (d: Enemy): string =>
        'g' + String(rows.findIndex((y) => Math.abs(d.y - y) < 4) + 1);
      const casts: string[][] = [];
      let drones = live(w, 'drone').length;
      for (let t = 0; t < 70; t++) {
        run(w, 1);
        const now = live(w, 'drone');
        if (now.length > drones) casts.push(now.slice(drones).map(gunOf).sort());
        drones = now.length;
      }
      // count 2: two distinct guns a launch, the search going on after the last caster.
      expect(casts.slice(0, 3)).toEqual([
        ['g1', 'g2'],
        ['g1', 'g3'],
        ['g2', 'g3'],
      ]);
    });

    it('rings from its core on screen, each ring turned half a gap from the last', () => {
      const w = fighting('arkt');
      const rings: number[][] = [];
      for (let t = 0; t < 60 && rings.length < 2; t++) {
        const shots = fired(w).filter((s) => s[3] === BulletKind.RoundRed);
        if (shots.length > 0) rings.push(shots.map((s) => s[2]).sort((a, b) => a - b));
      }
      expect(rings).toEqual([
        [0, 256, 512, 768],
        [128, 384, 640, 896],
      ]);
    });
  });

  describe('boss.angler', () => {
    it('fires nothing while its mouth opens for less than 12 ticks; gape 0 keeps the jaws at rest', () => {
      const w = fighting('angl');
      const boss = w.bosses.boss;
      const maw = boss.parts[part(w, 'maw')];
      const top = boss.parts[part(w, 'jaw-top')];
      const bottom = boss.parts[part(w, 'jaw-bot')];
      const shut = bottom.localY - top.localY;
      let opened = 0;
      let wasOpen = maw.open;
      let bullets = 0;
      for (let t = 0; t < 120; t++) {
        bullets += fired(w).length;
        if (maw.open && !wasOpen) opened++;
        wasOpen = maw.open;
        expect(bottom.localY - top.localY).toBe(shut);
      }
      // closedTicks 0.5 → one tick: it opens every 6 ticks (1 shut + 5 open).
      expect(opened).toBeGreaterThanOrEqual(19);
      expect(bullets).toBe(0);
    });

    it('starts every phase shut; opens with its jaws a floored gape apart, a ring turned half a gap each time', () => {
      const w = fighting('angl');
      const boss = w.bosses.boss;
      const mawIndex = part(w, 'maw');
      const maw = boss.parts[mawIndex];
      const top = boss.parts[part(w, 'jaw-top')];
      const bottom = boss.parts[part(w, 'jaw-bot')];
      const shut = bottom.localY - top.localY;
      // Hit the throat while it is open, into phase 1.
      for (let t = 0; t < 60 && w.bosses.damagePart(mawIndex, 15, 0) !== BossHit.Damaged; t++) {
        run(w, 1);
      }
      for (let t = 0; t < 5 && boss.phase !== 1; t++) run(w, 1);
      expect(boss.phase).toBe(1);
      run(w, 1); // its script has started
      expect(maw.open).toBe(false);
      expect(bottom.localY - top.localY).toBe(shut);
      const rings: number[][] = [];
      let openAt = -1;
      for (let t = 0; t < 120 && rings.length < 2; t++) {
        const shots = fired(w).filter((s) => s[3] === BulletKind.RoundPurple);
        if (shots.length > 0) {
          rings.push(shots.map((s) => s[2]).sort((a, b) => a - b));
          if (openAt < 0) {
            openAt = t;
            expect(maw.open).toBe(true);
            // gape 4.7 → 4 px each way.
            expect(bottom.localY - top.localY).toBe(shut + 8);
          }
        }
      }
      expect(openAt).toBeGreaterThanOrEqual(8); // after its 10 shut ticks
      expect(openAt).toBeLessThanOrEqual(11);
      const half = Math.floor(1024 / 6 / 2);
      expect(rings[0]).toHaveLength(6);
      expect(rings[1]).toHaveLength(6);
      expect(rings[1][0] - rings[0][0]).toBe(half);
    });
  });

  describe('rocket.homing', () => {
    it('with turnRate 0 it holds the launch diagonal — it never turns towards the ship', () => {
      const w = freeFlight();
      const rocket = spawn(w, 'stinger-flat', 300, 40); // above the middle row
      run(w, 22); // past the 20 launch ticks, before the homing ones end
      expect(rocket.mover).toBe(MoverKind.Homing);
      expect(rocket.vx).toBeLessThan(0);
      expect(rocket.vy).toBeLessThan(0); // still up-left — the ship sits below-left of it
      expect(Math.hypot(rocket.vx, rocket.vy)).toBeCloseTo(1.8, 4); // its speed, normalised
      const vx = rocket.vx;
      const vy = rocket.vy;
      run(w, 80); // past the launch + 70 home ticks: the heading still holds
      expect(rocket.vx).toBeCloseTo(vx, 9);
      expect(rocket.vy).toBeCloseTo(vy, 9);
    });
  });

  describe('captain.crab', () => {
    it('a reversed box holds its steps on the same shelves; ring 0.6 fires one; turn floors', () => {
      const w = fighting('crabflip');
      const boss = w.bosses.boss;
      const volleys: number[][] = [];
      let stepped = 0;
      for (let t = 0; t < 200 && volleys.length < 3; t++) {
        run(w, 1);
        if (boss.motion === BossMotion.MoveTo) {
          // The flipped bounds are swapped, not broken: the same 407…574 / 96…264 shelves.
          expect(boss.moveToX).toBeGreaterThanOrEqual(407);
          expect(boss.moveToX).toBeLessThanOrEqual(574);
          expect(boss.moveToY).toBeGreaterThanOrEqual(96);
          expect(boss.moveToY).toBeLessThanOrEqual(264);
          stepped++;
        }
        const fresh: number[] = [];
        const f = w.bullets.pool.fields;
        for (let i = 0; i < w.bullets.pool.count; i++) {
          if (f.kind[i] === BulletKind.OvalRed && f.age[i] <= 1) {
            fresh.push(((Math.round(f.angle[i]) % 1024) + 1024) % 1024);
          }
        }
        if (fresh.length > 0) volleys.push(fresh);
      }
      expect(stepped).toBeGreaterThan(0); // stepTicks 40: it sidesteps through the fight
      expect(volleys.length).toBeGreaterThanOrEqual(2);
      for (const ring of volleys) expect(ring).toHaveLength(1); // ring 0.6 → the floor of one
      // turn 16.7 floors to 16: each single bullet leaves 16 units further than the last.
      expect((volleys[1][0] - volleys[0][0] + ANGLE_UNITS) % ANGLE_UNITS).toBe(16);
      expect((volleys[2][0] - volleys[1][0] + ANGLE_UNITS) % ANGLE_UNITS).toBe(16);
      expect(boss.state).toBe(BossState.Fight);
    });
  });
});
