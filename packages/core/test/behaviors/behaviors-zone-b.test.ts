/**
 * The behaviours of plan M2-11 on the shipped zone B roster (`content/enemies/zone-b.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `rocket.homing` (launched away
 * from the middle row, homing, then straight on) and `boss.maw` (GALVANIC MAW: the mouth opening
 * and shutting with its jaws, cutters only while open, rockets from the pods). R5-02.S4a adds the
 * design §6 types: `mine.burst` (brine-mine: the proximity mine of the flats) and `cell.chase`
 * (spume-skipper: the chaser that peels off onto the ship).
 */
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit } from '../../src/bosses/index.js';
import { PLAYFIELD_H } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1rel, v1speed } from '../helpers/v1-port.js';

/** The KESTREL, Type A, the zone B roster and the patterns it runs. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-b.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { freeFlight, fighting, live } = zoneKit(DB);

describe('core/behaviors — zone B (M2-11)', () => {
  // The case tests both zones B and C (and their registration); it rides the earlier zone's
  // file, which is why it names the worms and the widow next to the rockets and the maw.
  it('registers the rockets, the worms and the two zone bosses', () => {
    expect(BEHAVIOR_IDS).toEqual(expect.arrayContaining(['rocket.homing', 'worm.burst']));
    expect(BOSS_BEHAVIOR_IDS).toEqual(expect.arrayContaining(['boss.maw', 'boss.widow']));
    expect(DEFAULT_BEHAVIORS.get('rocket.homing')?.params).toMatchObject({ speed: v1speed(1.25) });
    expect(DEFAULT_BEHAVIORS.get('worm.burst')?.params).toMatchObject({ trigger: v1rel(128) });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.maw')?.params).toMatchObject({ gape: 0, ring: 0 });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.widow')?.params).toMatchObject({ laserTicks: 0 });
  });

  it('rocket.homing: launches away from the middle row, homes on the ship, then flies straight', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('maw-rocket') ?? -1;
    const high = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + 40);
    const low = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + PLAYFIELD_H - 40);
    expect(high).not.toBeNull();
    expect(low).not.toBeNull();
    if (high === null || low === null) return;
    run(w, 5);
    // Up-left above the middle row, down-left below it, at the launch speed.
    expect(high.mover).toBe(MoverKind.Straight);
    expect(high.vx).toBeLessThan(0);
    expect(high.vy).toBeLessThan(0);
    expect(low.vy).toBeGreaterThan(0);
    expect(Math.hypot(high.vx, high.vy)).toBeCloseTo(v1speed(1), 6);
    // Homing (from tick 20, 5 units a tick): it turns towards the ship, below-left of it.
    run(w, 20);
    expect(high.mover).toBe(MoverKind.Homing);
    expect(Math.hypot(high.vx, high.vy)).toBeCloseTo(v1speed(1.25), 4);
    const early = high.vy;
    run(w, 45);
    expect(high.vy).toBeGreaterThan(early);
    expect(high.vy).toBeGreaterThan(0);
    // After its 60 homing ticks it keeps its heading.
    run(w, 15);
    const vx = high.vx;
    const vy = high.vy;
    run(w, 20);
    if (high.state === EnemyState.Live) {
      expect(high.vx).toBeCloseTo(vx, 9);
      expect(high.vy).toBeCloseTo(vy, 9);
    }
  });

  it('boss.maw: the mouth opens and shuts with its jaws, cutters only while open, rockets from the pods', () => {
    const w = fighting('galvanic-maw');
    const boss = w.bosses.boss;
    const maw = part(w, 'maw');
    const jaw = part(w, 'jaw-top');
    const jawY = boss.parts[jaw].localY;
    // Shut: shots clink off the mouth, nothing is fired from it.
    expect(boss.parts[maw].open).toBe(false);
    expect(w.bosses.damagePart(maw, 1, 0)).toBe(BossHit.Clink);
    run(w, 100);
    expect(w.bullets.count).toBe(0);
    // Phase 0: shut for 150 ticks, then open with the jaws 8 px apart (M2-18: wide enough for the
    // MANTA's biggest disc) — and the cutters come.
    run(w, 60);
    expect(boss.parts[maw].open).toBe(true);
    expect(boss.parts[jaw].localY).toBe(jawY - v1rel(8));
    expect(w.bosses.damagePart(maw, 1, 0)).toBe(BossHit.Damaged);
    run(w, 20);
    expect(w.bullets.count).toBeGreaterThanOrEqual(3);
    // A rocket from a pod by now (every 160 ticks, rank-scaled).
    expect(live(w, 'maw-rocket').length).toBeGreaterThanOrEqual(1);
    // Shut again after 90 ticks open: the jaws back where they were.
    run(w, 90);
    expect(boss.parts[maw].open).toBe(false);
    expect(boss.parts[jaw].localY).toBe(jawY);
  });

  it('boss.maw: a phase change while the mouth is open shuts the jaws first — they never drift', () => {
    const w = fighting('galvanic-maw');
    const boss = w.bosses.boss;
    const maw = part(w, 'maw');
    const jaw = part(w, 'jaw-bottom');
    const jawY = boss.parts[jaw].localY;
    run(w, 170);
    expect(boss.parts[maw].open).toBe(true);
    // Below 50 hit points: phase 1 starts while the mouth is open.
    expect(w.bosses.damagePart(maw, 35, 0)).toBe(BossHit.Damaged);
    run(w, 3);
    expect(boss.phase).toBe(1);
    expect(boss.parts[jaw].localY).toBe(jawY);
    expect(boss.parts[maw].open).toBe(false);
    // Phase 1 opens it again later (130 shut): 8 px apart, not 16.
    run(w, 135);
    expect(boss.parts[maw].open).toBe(true);
    expect(boss.parts[jaw].localY).toBe(jawY + v1rel(8));
  });

  it('boss.maw: after every phase change the shut jaws stand at their spec offsets, whatever the gapes', () => {
    const w = fighting('galvanic-maw');
    const boss = w.bosses.boss;
    const maw = part(w, 'maw');
    const top = part(w, 'jaw-top');
    const bottom = part(w, 'jaw-bottom');
    // The shipped spec: the jaws rest 9 px above and below the mouth; gape 8, 8, then 9 (M2-18).
    const spec = DB.enemies[DB.enemyIndex.get('galvanic-maw') ?? -1].boss?.parts ?? [];
    const topY = spec[top].y;
    const bottomY = spec[bottom].y;
    expect([topY, bottomY]).toEqual([-v1rel(9), v1rel(9)]);
    expect(boss.parts[top].restY).toBe(topY);
    expect(boss.parts[bottom].restY).toBe(bottomY);
    const gapes = (DB.enemies[DB.enemyIndex.get('galvanic-maw') ?? -1].boss?.phases ?? []).map(
      (phase) => phase.params.gape,
    );
    expect(gapes).toEqual([v1rel(8), v1rel(8), v1rel(9)]);
    /**
     * Steps until the mouth is open (or shut).
     *
     * @param open - The state awaited.
     */
    const until = (open: boolean): void => {
      for (let t = 0; t < 400 && boss.parts[maw].open !== open; t++) run(w, 1);
      expect(boss.parts[maw].open).toBe(open);
    };
    /**
     * The jaws stand `apart` px beyond their spec offsets.
     *
     * @param apart - Pixels.
     */
    const jaws = (apart: number): void => {
      // The behaviour floors the gape (the shipped 9 ports to 13.5, floored to 13).
      const g = Math.floor(apart);
      expect(boss.parts[top].localY).toBe(topY - g);
      expect(boss.parts[bottom].localY).toBe(bottomY + g);
    };
    // Each phase change comes while the mouth is open (only then does the core take damage).
    for (const [phase, hp] of [
      [1, 49],
      [2, 23],
    ] as const) {
      until(true);
      jaws(gapes[phase - 1]);
      expect(w.bosses.damagePart(maw, boss.parts[maw].hp - hp, 0)).toBe(BossHit.Damaged);
      run(w, 3);
      expect(boss.phase).toBe(phase);
      expect(boss.parts[maw].open).toBe(false);
      jaws(0);
      // The new phase's first gape and the shut after it, measured from the spec.
      until(true);
      jaws(gapes[phase]);
      until(false);
      jaws(0);
    }
  });

  // R5-02.S4b — the design §8 rebuild, pinned on the compiled roster.

  it('boss.maw: the rebuilt MAW stands the design tree — 10 parts, 20/80/10 hp, thresholds 50 and 24', () => {
    const boss = DB.enemies[DB.enemyIndex.get('galvanic-maw') ?? -1].boss;
    expect(boss).not.toBeNull();
    if (boss === null) return;
    const parts = boss.parts;
    expect(parts.map((p) => p.name)).toEqual([
      'hull',
      'fin',
      'pod-top',
      'pod-bottom',
      'maw',
      'jaw-top',
      'jaw-bottom',
      'spine-1',
      'spine-2',
      'spine-3',
    ]);
    // The guns carry the longer stage (16 → 20), and so does the core (64 → 80), still the only
    // `whenOpen` weak point — the jaw pair and the shut mouth are the boss's only armour.
    expect([parts[2].hp, parts[3].hp]).toEqual([20, 20]);
    expect(parts[2].gun).toBe(true);
    expect(parts[3].gun).toBe(true);
    expect(parts[4].hp).toBe(80);
    expect(parts[4].core).toBe(true);
    expect(parts[4].vulnerable).toBe('whenOpen');
    // The dorsal ridge: a shootable row at −48 above the hull, always vulnerable, never gating.
    for (const [index, x] of [
      [7, -15],
      [8, 27],
      [9, 69],
    ] as const) {
      expect(parts[index].parent).toBe('hull');
      expect(parts[index].x).toBe(x);
      expect(parts[index].y).toBe(-48);
      expect(parts[index].hp).toBe(10);
      expect(parts[index].vulnerable).toBe('always');
      expect(parts[index].hurtbox).toEqual({ hw: 7, hh: 7 });
      expect(parts[index].sprite).toBe('bosses/maw-spine');
      expect(parts[index].score).toBe(600);
    }
    // The phases: exactly 3 on `boss.maw`, the single core's 80 hp ending below 50, then below
    // 24; the first rocket volley tightens 170 → 160; the ported gape set (12, 12, 13.5) stands.
    expect(boss.phases.map((p) => p.script)).toEqual(['boss.maw', 'boss.maw', 'boss.maw']);
    expect(boss.phases[0].until?.hpBelow).toBe(50);
    expect(boss.phases[1].until?.hpBelow).toBe(24);
    expect(boss.phases[2].until).toBeNull();
    expect(boss.phases[0].params.launchTicks).toBe(160);
    expect(boss.phases.map((p) => p.params.gape)).toEqual([12, 12, 13.5]);
  });

  // R5-02.S5b — the design §7 refit of the captain, pinned on the compiled roster.

  it('captain.launcher: the SPUME HERALD stands the §7 tree — 5 parts, 48/10/8 hp, the full phase row', () => {
    const boss = DB.enemies[DB.enemyIndex.get('spume-herald') ?? -1].boss;
    expect(boss).not.toBeNull();
    if (boss === null) return;
    expect(boss.code).toBe('SH-02');
    expect(boss.role).toBe('captain');
    expect([boss.introTicks, boss.score, boss.x, boss.y, boss.timeLimit]).toEqual([
      60, 4000, 538, 168, 1800,
    ]);
    expect(DB.enemies[boss.minionId]?.id).toBe('brood-bubble');
    const parts = boss.parts;
    expect(parts.map((p) => p.name)).toEqual([
      'shell',
      'tube-top',
      'tube-bottom',
      'crown-fin-top',
      'crown-fin-bottom',
    ]);
    // The shell grew 40 → 48 and its box to 21/15; it stays the core, always vulnerable (the
    // kept rule), with its 2/24 animation and the large death explosion.
    expect([parts[0].hp, parts[0].core, parts[0].vulnerable]).toEqual([48, true, 'always']);
    expect(parts[0].hurtbox).toEqual({ hw: 21, hh: 15 });
    expect(parts[0].anim).toEqual({ frames: 2, ticks: 24 });
    expect(parts[0].explosion).toBe('large');
    // The launcher tubes moved out to the design's ∓27 row; hp, gun, sprite and score stand.
    for (const [index, y] of [
      [1, -27],
      [2, 27],
    ] as const) {
      expect(parts[index].parent).toBe('shell');
      expect(parts[index].x).toBe(-3);
      expect(parts[index].y).toBe(y);
      expect(parts[index].hp).toBe(10);
      expect(parts[index].hurtbox).toEqual({ hw: 11, hh: 8 });
      expect(parts[index].gun).toBe(true);
      expect(parts[index].sprite).toBe('bosses/maw-pod');
      expect(parts[index].score).toBe(500);
    }
    // The crown: two always-vulnerable 8-hp fins at (−6, ∓40) on the boss anchor itself (no
    // parent), the new S2 herald-fin art, 400 each — a ridge of fire that never gates the shell.
    for (const [index, y] of [
      [3, -40],
      [4, 40],
    ] as const) {
      expect(parts[index].parent).toBeNull();
      expect(parts[index].x).toBe(-6);
      expect(parts[index].y).toBe(y);
      expect(parts[index].hp).toBe(8);
      expect(parts[index].hurtbox).toEqual({ hw: 12, hh: 4 });
      expect(parts[index].vulnerable).toBe('always');
      expect(parts[index].sprite).toBe('bosses/herald-fin');
      expect(parts[index].score).toBe(400);
    }
    // One captain.launcher phase carrying the full design row: track 0.6 within margins 96,
    // a brood of 2 every 110 ticks, a 3-way spread of 64 every 80 at 1.8 px/tick (≤ 3.0).
    expect(boss.phases.map((p) => p.script)).toEqual(['captain.launcher']);
    expect(boss.phases[0].params).toEqual({
      trackSpeed: 0.6,
      margin: 96,
      launchTicks: 110,
      count: 2,
      fireTicks: 80,
      bulletSpeed: 1.8,
      ways: 3,
      spread: 64,
    });
  });

  // R5-02.S4a — the design §6 types, flown at the design's v2 values.

  it('mine.burst: brine-mine arms within 108 px, flashes its fuse and bursts into eight reds, gone without a credit', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const mine = w.enemies.spawn(DB.enemyIndex.get('brine-mine') ?? -1, ship.x + 140, ship.y);
    expect(mine).not.toBeNull();
    if (mine === null) return;
    run(w, 2);
    expect(mine.mover).toBe(MoverKind.Sine);
    // It drifts in (0.45 px/tick) until the ship is within 108 px (the design trigger).
    let armedAt = -1;
    for (let t = 0; t < 200 && armedAt < 0; t++) {
      run(w, 1);
      if (mine.mover === MoverKind.None) armedAt = t;
    }
    expect(armedAt).toBeGreaterThan(0); // the ship's fly-in closes the 32 px band early
    expect(armedAt).toBeLessThan(120);
    expect(Math.abs(mine.x - ship.x)).toBeLessThanOrEqual(108);
    expect(mine.flashTicks).toBeGreaterThan(20); // the 24-tick fuse, flashing
    const count = w.bullets.count;
    const score = w.scoring.board.scores[0].score;
    run(w, 25);
    expect(mine.state).not.toBe(EnemyState.Live);
    expect(w.bullets.count - count).toBe(8); // the ring of 8 at 2.25 px/tick (C1 fold)
    expect(w.scoring.board.scores[0].score).toBe(score); // its own burst pays nothing
  });

  it('mine.burst: brine-mine out of vertical reach never arms; shot for its 3 hp it pays 350 and bursts nothing', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const far = w.enemies.spawn(DB.enemyIndex.get('brine-mine') ?? -1, ship.x + 250, ship.y - 150);
    expect(far).not.toBeNull();
    if (far === null) return;
    // 150 px above the ship's row, ±15 px of sine — never the 108-px trigger band.
    run(w, 300);
    expect(far.state).toBe(EnemyState.Live);
    expect(far.mover).toBe(MoverKind.Sine);
    expect(w.bullets.count).toBe(0);
    const score = w.scoring.board.scores[0].score;
    w.enemies.kill(far, 0);
    run(w, 60);
    expect(w.bullets.count).toBe(0);
    expect(w.scoring.board.scores[0].score).toBe(score + 350);
  });

  it('cell.chase: spume-skipper drifts in 40 ticks at 2.25, homes at 3 units a tick for 180, then flies on straight', () => {
    const w = freeFlight();
    const sk = w.enemies.spawn(
      DB.enemyIndex.get('spume-skipper') ?? -1,
      w.camera.x + 420,
      w.camera.y + 40,
    );
    expect(sk).not.toBeNull();
    if (sk === null) return;
    run(w, 5);
    expect(sk.mover).toBe(MoverKind.Straight);
    expect(sk.vx).toBeCloseTo(-2.25, 9); // the design speed, due left
    expect(sk.vy).toBe(0);
    // The shipped skipper drifts in for 40 ticks, then homes (the ship is below it).
    run(w, 36);
    expect(sk.mover).toBe(MoverKind.Homing);
    expect(sk.m1).toBe(3); // turnRate 3, whole angle units a tick
    expect(Math.hypot(sk.vx, sk.vy)).toBeCloseTo(2.25, 4);
    run(w, 20);
    expect(sk.vy).toBeGreaterThan(0); // turning down towards the ship
    // The 180 chase ticks end at tick 40 + 180 = 220: until then it keeps turning.
    run(w, 159);
    expect(sk.mover).toBe(MoverKind.Homing);
    expect(sk.m1).toBe(3);
    run(w, 1);
    expect(sk.m1).toBe(0); // straight on: the heading freezes
    const vx = sk.vx;
    const vy = sk.vy;
    run(w, 15);
    if (sk.state === EnemyState.Live) {
      expect(sk.vx).toBeCloseTo(vx, 9);
      expect(sk.vy).toBeCloseTo(vy, 9);
    }
    expect(w.bullets.count).toBe(0); // a chaser never fires
  });
});
