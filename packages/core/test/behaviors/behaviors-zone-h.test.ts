/**
 * The behaviours of plan M2-14 on the shipped zone H roster (`content/enemies/zone-h.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `emitter.laser` (IRON CITADEL's
 * laser emitters: telegraphed lanes to the left, attached, one per `laserTicks`) and
 * `boss.sovereign` (IRON SOVEREIGN's four-phase finale: the core behind its plates with lanes from
 * the emitters, the turning shield wheel and rings, the drones, the spiral). R5-08.S4a adds the
 * design §6 types: `turret.floor` (gate-sentry: the gate's anchored aimed shot) and `drifter.sine`
 * (iron-banner: the yard's drifting standard, the zone's new capsule drop). R5-08.S4b rebuilds
 * IRON SOVEREIGN to the §7 tree, and R5-08.S4c trims the shield wheel to the case's four pods:
 * eighteen parts — six dark armour rows that add art and no destroyable HP (the release audit's
 * MANTA law out-vetoes §7's sixth pod — the option-A ruling, lanes report S5b).
 */
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit, BossVulnerable, type BossPart } from '../../src/bosses/index.js';
import { BulletKind, LaserPhase } from '../../src/bullets/index.js';
import { PLAYFIELD_W } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ItemKind } from '../../src/powerups/index.js';
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

/**
 * The roster index of an enemy id.
 *
 * @param id - Enemy id.
 * @returns Its index.
 */
function indexOf(id: string): number {
  return DB.enemyIndex.get(id) ?? -1;
}

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

  it('boss.sovereign: the rebuilt tree fights eighteen parts — six dark rows, four pods on the ring', () => {
    const w = fighting('iron-sovereign');
    const boss = w.bosses.boss;
    expect(boss.partCount).toBe(18); // the shipped twelve plus §7's armour rows, S4c's ring trim
    const hull = boss.parts[part(w, 'hull')];
    // The six armour rows are dark armour: every hit clinks, none can die, and the loaded
    // destroyable HP of the shipped twelve is untouched (D-RV m-3/m-4).
    for (const name of ['crown', 'prow', 'skirt-a', 'skirt-b', 'vent-a', 'vent-b']) {
      const i = part(w, name);
      expect(w.bosses.damagePart(i, 999, 0), name).toBe(BossHit.Clink);
      expect(boss.parts[i].destroyed, name).toBe(false);
    }
    let destroyable = 0;
    for (let i = 0; i < boss.partCount; i++) {
      const p = boss.parts[i];
      if (p.vulnerable !== BossVulnerable.Never) destroyable += p.hp;
    }
    expect(destroyable).toBe(260);
    // The six hull rows stand at the design's offsets off the hull (the un-turned chain is exact).
    const off = (name: string): number[] => {
      const p = boss.parts[part(w, name)];
      return [p.x - hull.x, p.y - hull.y];
    };
    expect(off('crown')).toEqual([0, -66]);
    expect(off('prow')).toEqual([-42, 0]);
    expect(off('skirt-a')).toEqual([-6, 70]);
    expect(off('skirt-b')).toEqual([-6, -70]);
    expect(off('vent-a')).toEqual([40, 48]);
    expect(off('vent-b')).toEqual([40, -48]);
    // The wheel stands at the case's minimum four never-vulnerable pods on the r-36 ring, every
    // position distinct (R5-08.S4c option A: pod-e and pod-f left the ring — the MANTA audit law
    // out-vetoes §7's sixth; the content case's floor of ≥ 4 holds at four).
    const hubIndex = part(w, 'hub');
    const core = boss.parts[part(w, 'core')];
    const pods: BossPart[] = [];
    for (let i = 0; i < boss.partCount; i++) {
      const p = boss.parts[i];
      if (p.parent !== hubIndex) continue;
      expect(p.vulnerable).toBe(BossVulnerable.Never);
      expect(p.radius).toBe(9);
      pods.push(p);
    }
    expect(pods).toHaveLength(4);
    for (const p of pods) {
      const dx = p.x - core.x;
      const dy = p.y - core.y;
      const r = Math.sqrt(dx * dx + dy * dy); // ring geometry is rotation-invariant
      expect(r).toBeGreaterThan(35);
      expect(r).toBeLessThanOrEqual(36.5);
    }
    for (let a = 0; a < pods.length; a++) {
      for (let b = a + 1; b < pods.length; b++) {
        const dx = pods[a].x - pods[b].x;
        const dy = pods[a].y - pods[b].y;
        expect(Math.sqrt(dx * dx + dy * dy), `pod ${String(a)} vs ${String(b)}`).toBeGreaterThan(
          12,
        );
      }
    }
  });

  // R5-08.S4a — the design §6 types, flown at the design's v2 values.

  it('turret.floor: gate-sentry stands its ground and fires one aimed 1.95 pink round every fireTicks', () => {
    const w = freeFlight();
    const sentry = w.enemies.spawn(indexOf('gate-sentry'), w.camera.x + 300, w.camera.y + 150);
    expect(sentry).not.toBeNull();
    if (sentry === null) return;
    const x = sentry.x;
    const y = sentry.y;
    // Watch the volleys like `behaviors-fire` does: a live bullet of age 1 is one fired last tick.
    const shots: Array<[number, number, number]> = []; // [tick, angle, speed]
    const f = w.bullets.pool.fields;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      for (let i = 0; i < w.bullets.count; i++) {
        if (f.age[i] === 1 && f.delay[i] === 0 && f.kind[i] === BulletKind.RoundPink) {
          shots.push([w.tick - 1, f.angle[i], f.speed[i]]);
        }
      }
    }
    expect(sentry.mover).toBe(MoverKind.None); // it stands still…
    expect([sentry.x, sentry.y]).toEqual([x, y]); // …on its row, every tick of the watch
    expect(shots).toHaveLength(2); // fireTicks 150: the shots land at 150 and 300
    expect(shots[0][0] - sentry.spawnTick).toBeGreaterThanOrEqual(30); // settleTicks (default 30)
    expect(shots[1][0] - shots[0][0]).toBe(150); // the design interval, exact at scale 1
    for (const [, angle, speed] of shots) {
      expect(angle % 32).toBe(0); // aimed: quantised to the 32-way grid
      expect(speed).toBeCloseTo(1.95, 9); // the design speed, inside the 3.0 4-way bound
    }
  });

  it('drifter.sine: iron-banner drifts the design wave, silent, and pays 150 with its capsule', () => {
    const w = freeFlight();
    const banner = w.enemies.spawn(indexOf('iron-banner'), w.camera.x + 380, w.camera.y + 90);
    expect(banner).not.toBeNull();
    if (banner === null) return;
    const row = banner.y; // the wave's centre line: the spawn row, before the mover ticks
    run(w, 5);
    expect(banner.mover).toBe(MoverKind.Sine);
    expect(banner.vx).toBeCloseTo(-1.8, 9); // the design speed, due left
    expect([banner.m1, banner.m2, banner.m3]).toEqual([30, 90, 0]); // amp, period, phase (alone: 0)
    let low = 0;
    let high = 0;
    for (let t = 0; t < 135; t++) {
      run(w, 1);
      low = Math.min(low, banner.y - row);
      high = Math.max(high, banner.y - row);
    }
    expect(high).toBeGreaterThan(25); // the wave climbs its 30 px above the row…
    expect(low).toBeLessThan(-25); // …and dives 30 below, silent the whole way
    expect(w.bullets.count).toBe(0); // a banner carries no gun
    const score = w.scoring.board.scores[0].score;
    const x = banner.x;
    const y = banner.y;
    w.enemies.kill(banner, 0);
    run(w, 1);
    expect(w.scoring.board.scores[0].score).toBe(score + 150); // the design score, on the kill
    expect(w.powerups.count).toBe(1); // the design's capsule drop, at the death point
    const g = w.powerups.pool.fields;
    expect(g.kind[0]).toBe(ItemKind.Capsule);
    expect(Math.abs(g.x[0] - x)).toBeLessThan(4);
    expect(Math.abs(g.y[0] - y)).toBeLessThan(4);
  });

  it('design §6: the three new entries carry exactly the planned values', () => {
    const floor = DB.enemies[indexOf('gate-sentry')];
    expect([
      floor.script,
      floor.hp,
      floor.score,
      floor.hurtbox.hw,
      floor.hurtbox.hh,
      floor.sprite,
      floor.ground,
      floor.drop,
    ]).toEqual(['turret.floor', 8, 400, 8, 8, 'enemies/gate-sentry', 'floor', null]);
    expect(floor.params).toEqual({ fireTicks: 150, bulletSpeed: 1.95 });
    const ceiling = DB.enemies[indexOf('gate-sentry-ceiling')];
    expect([
      ceiling.script,
      ceiling.hp,
      ceiling.score,
      ceiling.hurtbox.hw,
      ceiling.hurtbox.hh,
      ceiling.ground,
      ceiling.drop,
    ]).toEqual(['turret.floor', 8, 400, 8, 8, 'ceiling', null]);
    expect(ceiling.params).toEqual(floor.params); // the twin differs only by its anchor
    const banner = DB.enemies[indexOf('iron-banner')];
    expect([
      banner.script,
      banner.hp,
      banner.score,
      banner.hurtbox.hw,
      banner.hurtbox.hh,
      banner.sprite,
      banner.drop,
    ]).toEqual(['drifter.sine', 2, 150, 6, 6, 'enemies/iron-banner', 'capsule']);
    expect(banner.params).toEqual({ speed: 1.8, amp: 30, period: 90, memberPhase: 24 });
  });
});
