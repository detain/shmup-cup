/**
 * The behaviours of plan M2-14 on the shipped zone H and I rosters
 * (`content/enemies/zone-h.enemies.json`, `zone-i.enemies.json`), in free flight (a static camera)
 * with the ship holding its fire: `emitter.laser` (IRON CITADEL's laser emitters: telegraphed lanes
 * to the left, attached, one per `laserTicks`), `mine.burst` (ABYSSAL THRONE's depth mines: armed by
 * a ship in reach, a flash, a ring, gone), `boss.sovereign` (IRON SOVEREIGN's four-phase finale:
 * the core behind its plates with lanes from the emitters, the turning shield wheel and rings, the
 * drones, the spiral), `boss.ark` (the ABYSS ARK's turret rows aiming and firing, its hooks) and
 * `boss.angler` (THE HOLLOW KING: the mouth that opens — the core — with its jaws, the swaying lure
 * and its needles and minions).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { LaserPhase } from '../../src/bullets/index.js';
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
 * The KESTREL, Type A, the rosters whose sprites the parade reuses, the zone H and I rosters and
 * the patterns they run.
 */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-h.enemies.json'),
      shipped('enemies/zone-i.enemies.json'),
      shipped('patterns/zones.patterns.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  // The parade reuses earlier bosses' sprites: without their rosters they are only unknown here.
  expect(issues.filter((issue) => !/sprite/.test(issue.message))).toEqual([]);
  return db;
})();

/**
 * A free-flight world (static camera), the ship holding fire and invulnerable.
 *
 * @returns The world.
 */
function freeFlight(): World {
  const w = createWorld(resolveGameConfig({ seed: 7, autofire: false, remoteMode: false }), DB);
  w.debugFlags.godMode = true;
  return w;
}

/**
 * Steps a world.
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
 * The live enemies of an id.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns Them, in slot order.
 */
function live(w: World, id: string): Enemy[] {
  const index = DB.enemyIndex.get(id);
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
}

/**
 * A world with a boss started and fighting (in slot 0).
 *
 * @param id - The boss's enemy id.
 * @returns The world.
 */
function fighting(id: string): World {
  const w = freeFlight();
  expect(w.bosses.startBoss(DB.enemyIndex.get(id) ?? -1)).toBe(true);
  for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  return w;
}

/**
 * A boss part's index by name (boss slot 0).
 *
 * @param w - The world.
 * @param name - Part name.
 * @returns Its index.
 */
function part(w: World, name: string): number {
  const boss = w.bosses.boss;
  const index = boss.parts.findIndex((p, i) => i < boss.partCount && p.name === name);
  expect(index, name).toBeGreaterThanOrEqual(0);
  return index;
}

/**
 * The live lasers attached to an enemy slot.
 *
 * @param w - The world.
 * @param slot - The enemy's slot.
 * @returns Laser pool indices.
 */
function lasersOf(w: World, slot: number): number[] {
  const lasers = w.bullets.lasers;
  const out: number[] = [];
  for (let i = 0; i < lasers.count; i++) if (lasers.fields.src[i] === slot) out.push(i);
  return out;
}

describe('core/behaviors — zones H and I (M2-14)', () => {
  it('registers the emitter, the mine and the three final bosses with their defaults', () => {
    expect(BEHAVIOR_IDS).toEqual(expect.arrayContaining(['emitter.laser', 'mine.burst']));
    expect(BOSS_BEHAVIOR_IDS).toEqual(
      expect.arrayContaining(['boss.sovereign', 'boss.ark', 'boss.angler']),
    );
    expect(DEFAULT_BEHAVIORS.get('emitter.laser')?.params).toEqual({
      firstTicks: 40,
      laserTicks: 150,
      heading: 512,
      laserLength: 384,
      laserWidth: 6,
      telegraph: 50,
      active: 40,
    });
    expect(DEFAULT_BEHAVIORS.get('mine.burst')?.params).toEqual({
      speed: 0.5,
      amp: 10,
      period: 140,
      trigger: 64,
      fuse: 36,
      ring: 8,
      bulletSpeed: 1,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.sovereign')?.params).toMatchObject({
      spin: 0,
      laserTicks: 0,
      ways: 0,
      ring: 0,
      launchTicks: 0,
      spiral: 0,
      spiralTicks: 8,
      spiralStep: 24,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.ark')?.params).toMatchObject({
      fireTicks: 60,
      launchTicks: 0,
      ring: 0,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.angler')?.params).toMatchObject({
      closedTicks: 150,
      openTicks: 100,
      gape: 6,
      sway: 1,
      swayTicks: 40,
      gunTicks: 0,
      launchTicks: 0,
    });
  });

  it('emitter.laser: a telegraphed lane to the left, attached to the emitter, one per laserTicks', () => {
    const w = freeFlight();
    const emitter = w.enemies.spawn(
      DB.enemyIndex.get('laser-emitter') ?? -1,
      w.camera.x + 300,
      w.camera.y + 150,
    );
    expect(emitter).not.toBeNull();
    if (emitter === null) return;
    const x = emitter.x;
    let first = -1;
    for (let t = 0; t < 200 && first < 0; t++) {
      run(w, 1);
      if (lasersOf(w, emitter.slot).length > 0) first = t;
    }
    // Its first lane after `firstTicks` (50 — once settled on screen).
    expect(first).toBeGreaterThanOrEqual(49);
    const [laser] = lasersOf(w, emitter.slot);
    const f = w.bullets.lasers.fields;
    expect(f.phase[laser]).toBe(LaserPhase.Telegraph);
    expect(f.telegraph[laser]).toBe(60);
    expect(f.active[laser]).toBe(36);
    expect(f.ex[laser]).toBeLessThan(f.x[laser] - 300); // to the left, the playfield's width
    expect(Math.abs(f.ey[laser] - f.y[laser])).toBeLessThan(1e-6); // along its row
    expect(emitter.x).toBe(x); // it stands still
    // One lane at a time: the next only after `laserTicks` (200).
    let most = 0;
    let lanes = 1;
    let before = 1;
    for (let t = 0; t < 420; t++) {
      run(w, 1);
      const now = lasersOf(w, emitter.slot).length;
      most = Math.max(most, now);
      if (now > before) lanes++;
      before = now;
    }
    expect(most).toBe(1);
    expect(lanes).toBe(3);
  });

  it('mine.burst: a ship in reach arms it — it stops, flashes, bursts into a ring and is gone', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const mine = w.enemies.spawn(DB.enemyIndex.get('depth-mine') ?? -1, ship.x + 140, ship.y);
    expect(mine).not.toBeNull();
    if (mine === null) return;
    run(w, 2);
    expect(mine.mover).toBe(MoverKind.Sine);
    // It drifts in (0.45 px/tick) until the ship is within 60 px (checked every 6 ticks).
    let armedAt = -1;
    for (let t = 0; t < 400 && armedAt < 0; t++) {
      run(w, 1);
      if (mine.mover === MoverKind.None) armedAt = t;
    }
    expect(armedAt).toBeGreaterThan(0);
    expect(Math.abs(mine.x - ship.x)).toBeLessThanOrEqual(66);
    expect(mine.flashTicks).toBeGreaterThan(30);
    const bullets = w.bullets.count;
    run(w, 41);
    expect(mine.state).not.toBe(EnemyState.Live);
    expect(w.bullets.count - bullets).toBe(8);
  });

  it('mine.burst: out of reach it keeps drifting; shot first, it scores and never bursts', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const far = w.enemies.spawn(DB.enemyIndex.get('depth-mine') ?? -1, ship.x + 300, ship.y - 90);
    expect(far).not.toBeNull();
    if (far === null) return;
    run(w, 300);
    expect(far.state).toBe(EnemyState.Live);
    expect(far.mover).toBe(MoverKind.Sine);
    const bullets = w.bullets.count;
    const score = w.scoring.board.scores[0].score;
    w.enemies.kill(far, 0);
    run(w, 60);
    expect(w.bullets.count).toBe(bullets);
    expect(w.scoring.board.scores[0].score).toBe(score + 300);
  });

  it('boss.sovereign: the core clinks behind its plates; lanes from the emitters, one at a time', () => {
    const w = fighting('iron-sovereign');
    const boss = w.bosses.boss;
    const core = part(w, 'core');
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Clink);
    let most = 0;
    let lanes = 0;
    let before = 0;
    for (let t = 0; t < 700; t++) {
      run(w, 1);
      const now = w.bullets.lasers.count;
      most = Math.max(most, now);
      if (now > before) lanes++;
      before = now;
    }
    expect(lanes).toBeGreaterThanOrEqual(3);
    expect(most).toBe(1);
    // The wheel stands still in the first phase (spin 0), turned off the core's lane (45°).
    const pod = boss.parts[part(w, 'pod-a')];
    expect(Math.abs(pod.y - boss.parts[core].y)).toBeGreaterThan(10);
    w.bosses.damagePart(part(w, 'plate-1'), 999, 0);
    w.bosses.damagePart(part(w, 'plate-2'), 999, 0);
    run(w, 2);
    expect(boss.phase).toBe(1);
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Damaged);
  });

  it('boss.sovereign: the wheel turns, the drones launch, the spiral turns in the last phase', () => {
    const w = fighting('iron-sovereign');
    const boss = w.bosses.boss;
    const core = part(w, 'core');
    w.bosses.damagePart(part(w, 'plate-1'), 999, 0);
    w.bosses.damagePart(part(w, 'plate-2'), 999, 0);
    run(w, 2);
    // Phase 1: the wheel turns (5 units a tick).
    const hub = part(w, 'hub');
    const a0 = w.bosses.boss.parts[hub].angle;
    run(w, 20);
    expect(Math.round(boss.parts[hub].angle - a0)).toBe(100);
    // Phase 2 (below 110 of 150): the drones launch from the emitters.
    w.bosses.damagePart(core, 45, 0);
    run(w, 2);
    expect(boss.phase).toBe(2);
    let drones = 0;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      drones = Math.max(drones, live(w, 'sovereign-drone').length);
    }
    expect(drones).toBeGreaterThanOrEqual(2);
    // Phase 3 (below 60): the spiral — three purple ovals every 10 ticks.
    w.bosses.damagePart(core, 50, 0);
    run(w, 2);
    expect(boss.phase).toBe(3);
    let volleys = 0;
    let before = w.bullets.count;
    for (let t = 0; t < 100; t++) {
      run(w, 1);
      if (w.bullets.count - before >= 3) volleys++;
      before = w.bullets.count;
    }
    expect(volleys).toBeGreaterThanOrEqual(9);
  });

  it('boss.ark: its turret rows turn to the ship and fire while on screen; hooks launch', () => {
    const w = fighting('abyss-ark');
    const boss = w.bosses.boss;
    const turret = boss.parts[part(w, 'turret-t1')];
    const start = turret.angle;
    let shots = 0;
    let before = w.bullets.count;
    for (let t = 0; t < 300; t++) {
      run(w, 1);
      if (w.bullets.count > before) shots++;
      before = w.bullets.count;
    }
    expect(shots).toBeGreaterThan(0);
    expect(turret.angle).not.toBe(start); // aimed at the ship
    // Its second phase casts hooks (the `minion`).
    w.bosses.damagePart(part(w, 'heart'), 70, 0);
    run(w, 2);
    expect(boss.phase).toBe(1);
    let hooks = 0;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      hooks = Math.max(hooks, live(w, 'ark-hook').length);
    }
    expect(hooks).toBeGreaterThan(0);
  });

  it('boss.angler: the mouth clinks shut, opens with its jaws apart; the lure sways and fires', () => {
    const w = fighting('hollow-king');
    const boss = w.bosses.boss;
    const maw = part(w, 'maw');
    const jawTop = boss.parts[part(w, 'jaw-top')];
    const jawBottom = boss.parts[part(w, 'jaw-bottom')];
    const shut = jawBottom.y - jawTop.y;
    expect(w.bosses.damagePart(maw, 1, 0)).toBe(BossHit.Clink);
    // After its 150 closed ticks it opens: the jaws 6 px further apart each, the throat takes hits.
    run(w, 152);
    expect(jawBottom.y - jawTop.y).toBeCloseTo(shut + 12, 6);
    expect(w.bosses.damagePart(maw, 1, 0)).toBe(BossHit.Damaged);
    // The lure sways (its bulb's height relative to the body changes) and fires needles.
    const lure = boss.parts[part(w, 'lure')];
    const body = boss.parts[part(w, 'body')];
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    let fired = 0;
    let before = w.bullets.count;
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      low = Math.min(low, lure.y - body.y);
      high = Math.max(high, lure.y - body.y);
      if (w.bullets.count > before) fired++;
      before = w.bullets.count;
    }
    expect(high - low).toBeGreaterThan(8);
    expect(fired).toBeGreaterThan(0);
    // Its second phase (below 75 of 110, hit while the mouth is open) launches spawn from the lure.
    for (let t = 0; t < 400 && w.bosses.damagePart(maw, 40, 0) !== BossHit.Damaged; t++) run(w, 1);
    run(w, 2);
    expect(boss.phase).toBe(1);
    let spawn = 0;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      spawn = Math.max(spawn, live(w, 'king-spawn').length);
    }
    expect(spawn).toBeGreaterThan(0);
  });
});
