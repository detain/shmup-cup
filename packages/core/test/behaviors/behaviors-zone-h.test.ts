/**
 * The behaviours of plan M2-14 on the shipped zone H roster (`content/enemies/zone-h.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `emitter.laser` (IRON CITADEL's
 * laser emitters: telegraphed lanes to the left, attached, one per `laserTicks`) and
 * `boss.sovereign` (IRON SOVEREIGN's four-phase finale: the core behind its plates with lanes from
 * the emitters, the turning shield wheel and rings, the drones, the spiral).
 */
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit } from '../../src/bosses/index.js';
import { LaserPhase } from '../../src/bullets/index.js';
import { PLAYFIELD_W } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { lasersOf, part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1rel, v1speed } from '../helpers/v1-port.js';

/**
 * The KESTREL, Type A, the roster whose sprites the parade reuses, the zone H roster and the
 * patterns it runs.
 */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-h.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  // The parade reuses earlier bosses' sprites: without their rosters they are only unknown here.
  expect(issues.filter((issue) => !/sprite/.test(issue.message))).toEqual([]);
  return db;
})();

const { freeFlight, fighting, live } = zoneKit(DB);

describe('core/behaviors — zone H (M2-14)', () => {
  // The case tests both zones H and I (it registers the mine, the ark and the king with the
  // emitter and the sovereign); it rides the earlier zone's file (R5-P.P5a2).
  it('registers the emitter, the mine and the three final bosses with their defaults', () => {
    expect(BEHAVIOR_IDS).toEqual(expect.arrayContaining(['emitter.laser', 'mine.burst']));
    expect(BOSS_BEHAVIOR_IDS).toEqual(
      expect.arrayContaining(['boss.sovereign', 'boss.ark', 'boss.angler']),
    );
    expect(DEFAULT_BEHAVIORS.get('emitter.laser')?.params).toEqual({
      firstTicks: 40,
      laserTicks: 150,
      heading: 512,
      laserLength: PLAYFIELD_W,
      laserWidth: v1rel(6),
      telegraph: 50,
      active: 40,
    });
    expect(DEFAULT_BEHAVIORS.get('mine.burst')?.params).toEqual({
      speed: v1speed(0.5),
      amp: v1rel(10),
      period: 140,
      trigger: v1rel(64),
      fuse: 36,
      ring: 8,
      bulletSpeed: v1speed(1),
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
      gape: v1rel(6),
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
});
