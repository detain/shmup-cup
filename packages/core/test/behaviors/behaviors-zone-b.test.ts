/**
 * The behaviours of plan M2-11 on the shipped zone B roster (`content/enemies/zone-b.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `rocket.homing` (launched away
 * from the middle row, homing, then straight on) and `boss.maw` (GALVANIC MAW: the mouth opening
 * and shutting with its jaws, cutters only while open, rockets from the pods).
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
    // A rocket from a pod by now (every 170 ticks, rank-scaled).
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
    // Below 40 hit points: phase 1 starts while the mouth is open.
    expect(w.bosses.damagePart(maw, 30, 0)).toBe(BossHit.Damaged);
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
      [1, 39],
      [2, 15],
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
});
