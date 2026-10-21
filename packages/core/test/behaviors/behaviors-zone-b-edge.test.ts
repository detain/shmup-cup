/**
 * Edge cases of the M2-11 behaviours (`core/behaviors`), beyond `behaviors-zone-b.test.ts`, on
 * variants of the shipped zone B roster (free flight — a static camera — the ship holding its fire
 * and invulnerable):
 *
 * - the tunables of all four behaviours are the documented defaults;
 * - `rocket.homing`: exactly `launchTicks` of launch, `homeTicks` of homing, then a turn rate of
 *   0; whole-tick floors of fractional times, 1 tick for times below 1, a negative turn rate
 *   clamped to 0 (the launch heading is kept); the middle row itself launches down-left; it never
 *   fires;
 * - `boss.maw`: the cutters need the mouth open for more than 12 ticks (the first volley's
 *   delay), `ways` floored / at least 1, a `ring` below 1 fires none, rings alternate their
 *   offset by half a gap, timers below 1 toggle the mouth every tick, the rockets come from the
 *   standing pods in turn (never more than one per pod per launch, none once both are gone), a
 *   part attached to the mouth on its row (rest offset 0) never moves, the jaws keep their x, it
 *   tracks the ship's height within its margins at its speed;
 * - `BossPart.restX` / `restY` (the review fix of M2-11): the boss data's offsets on activation,
 *   untouched by the jaw moves, reset for a new boss in the same slot.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BEHAVIORS, DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { PLAYFIELD_H, PLAYFIELD_W } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, type World } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { bullets, rosterKitBc, run, zoneKitEdgeBc, type Entry } from '../helpers/zone-behaviors.js';
import { v1rel, v1screenX, v1screenY, v1speed } from '../helpers/v1-port.js';

/** The shipped zone B roster (parsed once; the variants are deep copies). */
const ROSTER: Entry[] = [
  ...(shipped('enemies/zone-b.enemies.json').data as { enemies: Entry[] }).enemies,
  // The restX / restY reset case tests both zones (it restarts the widow in the maw's slot);
  // the widow and its drone ride this file, the earlier zone's (R5-P.P5a1).
  ...(shipped('enemies/zone-c.enemies.json').data as { enemies: Entry[] }).enemies.filter(
    (e) => e.id === 'sandgrave-widow' || e.id === 'widow-drone',
  ),
];

const { copy, enemy, boss } = rosterKitBc(ROSTER);

/** Tunables of a quiet `boss.maw` phase: held still, no rockets, the mouth shut for good. */
const MAW_QUIET = { trackSpeed: 0, closedTicks: 100_000, fireTicks: 100_000, count: 0 } as const;

/** The test DB: the KESTREL, Type A, the shipped zone B roster, the variants and the widow. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-b.enemies.json'),
      ...shippedPatterns(),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('maw-rocket', 'rocket-snap', { launchTicks: 0, turnRate: -3, homeTicks: 0 }),
            enemy('maw-rocket', 'rocket-floor', { launchTicks: 2.7, homeTicks: 3.9 }),
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
            // The shipped widow and its drone, unchanged, for the restX / restY reset case
            // (the widow's `minion` names the drone, so both entries ride this DB).
            copy('sandgrave-widow', 'sandgrave-widow'),
            copy('widow-drone', 'widow-drone'),
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { world, indexOf, spawn, fighting, live, part } = zoneKitEdgeBc(DB);

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

describe('core/behaviors — zone B, edge cases (M2-11)', () => {
  // The case tests both zones B and C; it rides the earlier zone's file (R5-P.P5a1).
  it('has the documented default tunables', () => {
    expect(DEFAULT_BEHAVIORS.get('rocket.homing')?.params).toEqual({
      launchTicks: 24,
      launchSpeed: v1speed(1),
      speed: v1speed(1.25),
      turnRate: 5,
      homeTicks: 60,
    });
    expect(DEFAULT_BEHAVIORS.get('worm.burst')?.params).toEqual({
      trigger: v1rel(128),
      vx: -v1speed(0.8),
      up: v1speed(3.4),
      gravity: v1speed(0.075),
      maxFall: v1speed(4),
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.maw')?.params).toEqual({
      trackSpeed: v1speed(0.4),
      margin: v1rel(44),
      closedTicks: 140,
      openTicks: 90,
      fireTicks: 36,
      bulletSpeed: v1speed(1.4),
      ways: 3,
      spread: 48,
      ring: 0,
      ringSpeed: v1speed(1),
      launchTicks: 150,
      count: 1,
      gape: v1rel(0),
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.widow')?.params).toEqual({
      stepTicks: 100,
      minX: v1screenX(250),
      maxX: v1screenX(320),
      minY: v1screenY(56),
      maxY: v1screenY(144),
      fireTicks: 80,
      bulletSpeed: v1speed(1.3),
      ways: 3,
      spread: 40,
      launchTicks: 160,
      count: 1,
      laserTicks: 0,
      laserLength: PLAYFIELD_W,
      laserWidth: v1rel(6),
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
      expect(e.vx).toBeCloseTo(-v1speed(1.25) * Math.SQRT1_2, 2);
      expect(e.vy).toBeCloseTo(-v1speed(1.25) * Math.SQRT1_2, 2);
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
      expect([top.localX, top.localY]).toEqual([-v1rel(8), open ? -(v1rel(9) + 6) : -v1rel(9)]);
      expect([bottom.localX, bottom.localY]).toEqual([-v1rel(8), open ? v1rel(9) + 6 : v1rel(9)]);
    }
  });

  it('tracks the ship’s height at its speed, never past its margins', () => {
    const w = fighting('galvanic-maw');
    const boss = w.bosses.boss;
    const ship = w.players[0];
    const margin = v1rel(44); // the shipped phase-0 margins (world px)
    const speed = v1speed(0.35); // phase 0
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
    expect(jaw.localY).toBe(-(v1rel(9) + v1rel(8))); // the shipped gape 8 (M2-18: the MANTA's biggest disc fits)
    expect(jaw.restY).toBe(-v1rel(9));
  });

  // The case tests both zones B and C: it restarts the shipped widow in the maw's slot, so the
  // widow entry rides this file (R5-P.P5a1).
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
    expect([jaw.localX, jaw.localY, jaw.restX, jaw.restY]).toEqual([
      -v1rel(8),
      -v1rel(9),
      -v1rel(8),
      -v1rel(9),
    ]);
  });
});
