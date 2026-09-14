/**
 * Edge cases of the plan M2-14 behaviours (`emitter.laser`, `mine.burst`, `boss.sovereign`,
 * `boss.ark`, `boss.angler`) beyond `behaviors-zones-hi.test.ts`, on test enemies and bosses that
 * run them with tunables at and past their documented limits, in free flight (a static camera, the
 * ship invulnerable and holding its fire):
 *
 * - `emitter.laser`: `firstTicks` / `laserTicks` below 1 are one tick; `heading` is masked into a
 *   turn (−256 → up, 1,536 → left); an air emitter keeps its mover, a ground one stands still; no
 *   lane before it settled; its lane goes with it when it dies;
 * - `mine.burst`: `trigger` 0 never arms (it drifts on); `ring` 0 bursts into nothing, `ring` is
 *   floored; `fuse` below 1 is one tick; a mine that bursts scores nothing and drops nothing;
 * - `boss.sovereign`: `spin` rounded, reversing every `reverseTicks`; `firstLaser` below 1 is one
 *   tick, the lanes go to the standing guns in turn (a destroyed one skipped); the spiral's tunables
 *   floored and each phase's spiral turning from heading 0; `count` 0 launches nothing, `count` 2
 *   launches from both guns;
 * - `boss.ark`: a gun off screen never fires or launches; `ways` below 1 is one bullet; `aimStep`
 *   caps the turn of a volley; the ring comes from the on-screen core, turned half a gap each time;
 * - `boss.angler`: an open mouth shorter than the first spread's 12 ticks fires nothing; `gape` 0
 *   keeps the jaws at rest, a fractional one is floored; the ring as it opens, turned half a gap
 *   each time; every phase starts with the mouth shut.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MoverKind } from '../../src/patterns/index.js';
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
 * A test enemy entry.
 *
 * @param id - Enemy id.
 * @param script - Behaviour.
 * @param params - Its tunables.
 * @param over - More fields.
 * @returns The entry.
 */
function enemy(
  id: string,
  script: string,
  params: Record<string, number>,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    hp: 3,
    score: 300,
    hurtbox: { hw: 5, hh: 5 },
    script,
    params,
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 0,
    ...over,
  };
}

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
  enemy('mine-inert', 'mine.burst', { trigger: 0 }),
  enemy('mine-dud', 'mine.burst', { ring: 0, fuse: 5 }, { drop: 'capsule' }),
  enemy('mine-quick', 'mine.burst', { fuse: 0.3, ring: 5.7 }, { drop: 'capsule' }),
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
      // A raid: the camera rides with it, 200 px left of it and level — its `far` gun off screen.
      raid: { segments: [{ x: -200, y: -108, ticks: 10, hold: 30000 }] },
      parts: [
        { name: 'hull', hurtbox: { hw: 12, hh: 12 }, vulnerable: 'never' },
        { name: 'heart', hp: 50, hurtbox: { hw: 5, hh: 5 }, core: true },
        { name: 'near', x: -40, y: -30, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
        { name: 'far', x: 250, y: 30, hp: 5, hurtbox: { hw: 3, hh: 3 }, gun: true },
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

/**
 * A free-flight world (static camera), the ship invulnerable and holding its fire.
 *
 * @returns The world.
 */
function freeFlight(): World {
  const w = createWorld(resolveGameConfig({ seed: 7, autofire: false, remoteMode: false }), DB);
  w.debugFlags.godMode = true;
  run(w, 60); // the fly-in
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
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * Spawns an enemy of the roster at a screen position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - Screen x.
 * @param y - Screen y.
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(DB.enemyIndex.get(id) ?? -1, w.camera.x + x, w.camera.y + y);
  if (e === null) throw new Error('no slot for ' + id);
  return e;
}

/**
 * The live lasers attached to a source slot.
 *
 * @param w - The world.
 * @param slot - Source slot (an enemy's, or a boss part's).
 * @returns Laser pool indices.
 */
function lasersOf(w: World, slot: number): number[] {
  const lasers = w.bullets.lasers;
  const out: number[] = [];
  for (let i = 0; i < lasers.count; i++) if (lasers.fields.src[i] === slot) out.push(i);
  return out;
}

/**
 * The live enemies of an id.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns Them.
 */
function live(w: World, id: string): Enemy[] {
  const index = DB.enemyIndex.get(id);
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
}

/**
 * A free-flight world whose boss fights (slot 0).
 *
 * @param id - Boss id.
 * @returns The world.
 */
function fighting(id: string): World {
  const w = freeFlight();
  expect(w.bosses.startBoss(DB.enemyIndex.get(id) ?? -1)).toBe(true);
  for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  run(w, 1); // its first phase's script has started
  return w;
}

/**
 * A part index of the fighting boss by name.
 *
 * @param w - The world.
 * @param name - Part name.
 * @returns Its index.
 */
function part(w: World, name: string): number {
  const boss = w.bosses.boss;
  const i = boss.parts.findIndex((p, k) => k < boss.partCount && p.name === name);
  if (i < 0) throw new Error('no part ' + name);
  return i;
}

/**
 * Steps one tick from an empty bullet pool and returns the bullets it fired.
 *
 * @param w - The world.
 * @returns `[x, y, heading, kind]` per bullet.
 */
function fired(w: World): Array<[number, number, number, number]> {
  w.bullets.pool.clear();
  run(w, 1);
  const f = w.bullets.pool.fields;
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < w.bullets.count; i++) out.push([f.x[i], f.y[i], f.angle[i], f.kind[i]]);
  return out;
}

describe('core/behaviors — zones H and I, edge cases (M2-14 tests)', () => {
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
});
