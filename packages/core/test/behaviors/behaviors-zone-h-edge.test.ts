/**
 * Edge cases of the plan M2-14 behaviours (`emitter.laser`, `boss.sovereign`) beyond
 * `behaviors-zone-h.test.ts`, on test enemies and bosses that run them with tunables at and past
 * their documented limits, in free flight (a static camera, the ship invulnerable and holding its
 * fire):
 *
 * - `emitter.laser`: `firstTicks` / `laserTicks` below 1 are one tick; `heading` is masked into a
 *   turn (−256 → up, 1,536 → left); an air emitter keeps its mover, a ground one stands still; no
 *   lane before it settled; its lane goes with it when it dies;
 * - `boss.sovereign`: `spin` rounded, reversing every `reverseTicks`; `firstLaser` below 1 is one
 *   tick, the lanes go to the standing guns in turn (a destroyed one skipped); the spiral's
 *   tunables floored and each phase's spiral turning from heading 0; `count` 0 launches nothing,
 *   `count` 2 launches from both guns.
 *
 * The mine, the ark and the king are in `behaviors-zone-i-edge.test.ts`; the `drone` entry the
 * sovereign launches rides both files (R5-P.P5a2).
 */
import { describe, expect, it } from 'vitest';
import { BulletKind } from '../../src/bullets/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped } from '../helpers/shipped.js';
import { enemy, fired, lasersOf, run, zoneKitEdgeHi } from '../helpers/zone-behaviors.js';

/** A lane that telegraphs and burns for a few ticks only. */
const SHORT = { telegraph: 5, active: 5 };

/** The test roster. */
const ROSTER = [
  enemy(
    'em-air',
    'emitter.laser',
    { firstTicks: 0.4, laserTicks: 90, ...SHORT },
    { mover: { type: 'straight', vx: -0.5, vy: 0 } },
  ),
  enemy(
    'em-floor',
    'emitter.laser',
    { firstTicks: 0, laserTicks: 0.2, heading: 1536, ...SHORT },
    { ground: 'floor' },
  ),
  enemy('em-down', 'emitter.laser', { firstTicks: 1, laserTicks: 500, heading: 256, ...SHORT }),
  enemy('em-up', 'emitter.laser', { firstTicks: 1, laserTicks: 500, heading: -256, ...SHORT }),
  enemy(
    'em-slow',
    'emitter.laser',
    { firstTicks: 1, laserTicks: 10, ...SHORT },
    { ground: 'floor', settleTicks: 100 },
  ),
  // The drone the sovereign below launches (the ark and the king cast it too — the entry rides
  // both H and I edge files, R5-P.P5a2).
  enemy('drone', 'drifter.sine', {}),
  {
    id: 'sov',
    boss: {
      code: 'SV-90',
      displayName: 'TEST SOVEREIGN',
      introTicks: 0,
      score: 100,
      x: 280,
      y: 108,
      minion: 'drone',
      parts: [
        { name: 'hull', hurtbox: { hw: 12, hh: 12 }, vulnerable: 'never' },
        { name: 'core', hp: 100, hurtbox: { hw: 5, hh: 5 }, core: true },
        { name: 'hub', parent: 'core' },
        { name: 'pod', parent: 'hub', x: -20, radius: 4, vulnerable: 'never' },
        { name: 'gun-a', x: -4, y: -40, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
        { name: 'gun-b', x: -4, y: 40, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
      ],
      phases: [
        {
          script: 'boss.sovereign',
          params: {
            trackSpeed: 0,
            spin: 4.6,
            reverseTicks: 20,
            laserTicks: 40,
            firstLaser: 0,
            telegraph: 5,
            active: 5,
          },
          until: { hpBelow: 90 },
        },
        {
          script: 'boss.sovereign',
          params: { trackSpeed: 0, spiral: 2, spiralTicks: 0, spiralStep: 10.9, spiralSpeed: 1 },
          until: { hpBelow: 80 },
        },
        {
          script: 'boss.sovereign',
          params: {
            trackSpeed: 0,
            spiral: 1,
            spiralTicks: 3,
            spiralStep: -5,
            launchTicks: 10,
            count: 0,
          },
          until: { hpBelow: 70 },
        },
        { script: 'boss.sovereign', params: { trackSpeed: 0, launchTicks: 10, count: 2 } },
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

describe('core/behaviors — zone H, edge cases (M2-14 tests)', () => {
  describe('emitter.laser', () => {
    it('treats firstTicks and laserTicks below 1 as one tick: a lane every tick from the start', () => {
      const w = freeFlight();
      const e = spawn(w, 'em-floor', 300, 150);
      run(w, 1); // its start: the first wait
      let lanes = 0;
      for (let t = 0; t < 6; t++) {
        const before = lasersOf(w, e.slot).length;
        run(w, 1);
        if (lasersOf(w, e.slot).length > before) lanes++;
      }
      expect(lanes).toBe(6);
      // Heading 1,536 is masked to 512: every lane goes left along its row.
      const f = w.bullets.lasers.fields;
      for (const i of lasersOf(w, e.slot)) {
        expect(f.ex[i]).toBeLessThan(f.x[i] - 100);
        expect(Math.abs(f.ey[i] - f.y[i])).toBeLessThan(1e-6);
      }
      expect(e.mover).toBe(MoverKind.None); // a ground emitter stands still
    });

    it('masks the heading into a turn: 256 fires down, −256 up (768)', () => {
      const w = freeFlight();
      const down = spawn(w, 'em-down', 300, 60);
      const up = spawn(w, 'em-up', 200, 160);
      run(w, 4);
      const f = w.bullets.lasers.fields;
      const [d] = lasersOf(w, down.slot);
      const [u] = lasersOf(w, up.slot);
      expect(d).toBeDefined();
      expect(u).toBeDefined();
      expect(f.ey[d]).toBeGreaterThan(f.y[d] + 100);
      expect(Math.abs(f.ex[d] - f.x[d])).toBeLessThan(1e-6);
      expect(f.ey[u]).toBeLessThan(f.y[u] - 100);
      expect(Math.abs(f.ex[u] - f.x[u])).toBeLessThan(1e-6);
    });

    it('keeps an air emitter on its mover, its lane attached as it flies', () => {
      const w = freeFlight();
      const e = spawn(w, 'em-air', 330, 100);
      const x = e.x;
      run(w, 3);
      expect(e.mover).toBe(MoverKind.Straight);
      expect(e.x).toBeLessThan(x);
      const [lane] = lasersOf(w, e.slot);
      expect(lane).toBeDefined();
      run(w, 4);
      // The lane's origin follows the emitter.
      expect(w.bullets.lasers.fields.x[lasersOf(w, e.slot)[0]]).toBeCloseTo(e.x, 6);
    });

    it('fires no lane before it settled, and its lane dies with it', () => {
      const w = freeFlight();
      const e = spawn(w, 'em-slow', 300, 150);
      run(w, 90);
      expect(lasersOf(w, e.slot)).toEqual([]);
      let first = -1;
      for (let t = 0; t < 40 && first < 0; t++) {
        run(w, 1);
        if (lasersOf(w, e.slot).length > 0) first = t;
      }
      expect(first).toBeGreaterThanOrEqual(0); // once settled (100 ticks after it was seen)
      expect(first).toBeLessThanOrEqual(21);
      w.enemies.kill(e, 0);
      run(w, 2);
      expect(lasersOf(w, e.slot)).toEqual([]);
    });
  });

  describe('boss.sovereign', () => {
    it('rounds its spin and reverses it every reverseTicks', () => {
      const w = fighting('sov');
      const boss = w.bosses.boss;
      const hub = boss.parts[part(w, 'hub')];
      expect(hub.spin).toBe(5); // 4.6 rounded
      const seen = new Set<number>();
      for (let t = 0; t < 70; t++) {
        run(w, 1);
        seen.add(hub.spin);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual([-5, 5]);
      // The pod turns with the hub.
      expect(boss.parts[part(w, 'pod')].spin).toBe(0);
    });

    it('fires the first lane the tick after the phase starts (firstLaser 0), then the guns in turn', () => {
      const w = fighting('sov');
      const boss = w.bosses.boss;
      const gunA = boss.parts[part(w, 'gun-a')];
      const gunB = boss.parts[part(w, 'gun-b')];
      expect(lasersOf(w, gunA.slot).length + lasersOf(w, gunB.slot).length).toBe(0);
      run(w, 1);
      // The first lane, from the first standing gun.
      expect([lasersOf(w, gunA.slot).length, lasersOf(w, gunB.slot).length]).toEqual([1, 0]);
      const order: string[] = [];
      let before = 1;
      for (let t = 0; t < 130; t++) {
        run(w, 1);
        const a = lasersOf(w, gunA.slot).length;
        const b = lasersOf(w, gunB.slot).length;
        if (a + b > before) order.push(a > 0 ? 'a' : 'b');
        before = a + b;
      }
      expect(order.slice(0, 3)).toEqual(['b', 'a', 'b']);
      // A destroyed gun is skipped: every lane from the other one.
      w.bosses.damagePart(part(w, 'gun-b'), 999, 0);
      expect(gunB.destroyed).toBe(true);
      const after: number[] = [];
      before = lasersOf(w, gunA.slot).length;
      for (let t = 0; t < 130; t++) {
        run(w, 1);
        const a = lasersOf(w, gunA.slot).length;
        if (a > before) after.push(t);
        before = a;
        expect(lasersOf(w, gunB.slot)).toEqual([]);
      }
      expect(after.length).toBeGreaterThanOrEqual(3);
    });

    it('floors the spiral tunables, turns each phase`s spiral from heading 0; count 0 launches nothing', () => {
      const w = fighting('sov');
      const boss = w.bosses.boss;
      const core = part(w, 'core');
      w.bosses.damagePart(core, 11, 0); // phase 1: the spiral
      run(w, 2);
      expect(boss.phase).toBe(1);
      expect([boss.spiralWays, boss.spiralEvery, boss.spiralStep]).toEqual([2, 1, 10]);
      // One volley a tick, each from the core, the pair turned 10 units further each time.
      const volleys: number[][] = [];
      for (let t = 0; t < 5; t++) {
        const shots = fired(w).filter((s) => s[3] === BulletKind.OvalPurple);
        volleys.push(shots.map((s) => s[2]).sort((a, b) => a - b));
      }
      for (let v = 1; v < volleys.length; v++) {
        expect(volleys[v]).toHaveLength(2);
        expect(volleys[v][1] - volleys[v][0]).toBe(512);
        expect((volleys[v][0] - volleys[v - 1][0] + 1024) % 1024).toBe(10);
      }
      expect(boss.spiralAngle).not.toBe(0);
      // Phase 2: its own spiral from heading 0 — one bullet every 3 ticks, turning −5.
      w.bosses.damagePart(core, 10, 0);
      run(w, 1);
      expect(boss.phase).toBe(2);
      const headings: number[] = [];
      for (let t = 0; t < 12; t++) {
        for (const s of fired(w)) if (s[3] === BulletKind.OvalPurple) headings.push(s[2]);
      }
      expect(headings.slice(0, 3)).toEqual([0, 1019, 1014]);
      // count 0: its launchTicks launch nothing.
      for (let t = 0; t < 60; t++) run(w, 1);
      expect(live(w, 'drone')).toEqual([]);
      // Phase 3: count 2 — a drone from each gun every launchTicks.
      w.bosses.damagePart(core, 10, 0);
      run(w, 2);
      expect(boss.phase).toBe(3);
      run(w, 12);
      const drones = live(w, 'drone');
      expect(drones.length).toBe(2);
      const ys = drones.map((d) => d.y).sort((a, b) => a - b);
      expect(ys[1] - ys[0]).toBeGreaterThan(60); // one from each gun
    });
  });
});
