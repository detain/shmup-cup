/**
 * The behaviours of plan M2-12 on the shipped zone D roster (`content/enemies/zone-d.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `boss.bastion` (CINDER BASTION:
 * its shield arms turning round the core on their pivot, reversing, the armour clinking, lane
 * lasers from the emitters in turn, spreads from the core in its later phases).
 */
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit } from '../../src/bosses/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { ENGINE_SPRITES, type World } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1rel, v1screenX, v1speed } from '../helpers/v1-port.js';

/** The KESTREL, Type A, the zone D roster and the patterns it runs. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-d.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { fighting } = zoneKit(DB);

/**
 * The distance between two boss parts' centres.
 *
 * @param w - The world.
 * @param a - One part index.
 * @param b - The other.
 * @returns Pixels.
 */
function apart(w: World, a: number, b: number): number {
  const parts = w.bosses.boss.parts;
  return Math.hypot(parts[a].x - parts[b].x, parts[a].y - parts[b].y);
}

describe('core/behaviors — zone D (M2-12)', () => {
  // The case tests both zones D and E (and their registration); it rides the earlier zone's
  // file, which is why it names the jumper and the steed next to the bastion.
  it('registers the rear attacker and the two zone bosses', () => {
    expect(BEHAVIOR_IDS).toContain('rear.swoop');
    expect(BOSS_BEHAVIOR_IDS).toEqual(expect.arrayContaining(['boss.bastion', 'boss.steed']));
    expect(DEFAULT_BEHAVIORS.get('rear.swoop')?.params).toMatchObject({
      speed: v1speed(1.6),
      turnX: v1screenX(280),
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.bastion')?.params).toMatchObject({
      spin: 4,
      reverseTicks: 0,
      ways: 0,
      ring: 0,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.steed')?.params).toMatchObject({
      minis: 2,
      ring: 0,
      gape: 0,
    });
  });

  it('boss.bastion: the shield arms turn round the core on their pivot, armoured, reversing later', () => {
    const w = fighting('cinder-bastion');
    const boss = w.bosses.boss;
    const core = part(w, 'core');
    const hub = part(w, 'hub');
    const inner = part(w, 'arm-a-inner');
    const outer = part(w, 'arm-b-outer');
    // Phase 0: the pivot turns 4 units a tick; the arms keep their radius round the core.
    expect(boss.parts[hub].spin).toBe(4);
    const a0 = boss.parts[hub].worldAngle;
    run(w, 10);
    expect((boss.parts[hub].worldAngle - a0 + 1024) % 1024).toBe(40);
    for (let t = 0; t < 8; t++) {
      run(w, 16);
      expect(apart(w, core, inner)).toBeCloseTo(v1rel(19), 3);
      expect(apart(w, core, outer)).toBeCloseTo(v1rel(28), 3);
    }
    // The arms clink, the core takes the hits.
    expect(w.bosses.damagePart(inner, 1, 0)).toBe(BossHit.Clink);
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Damaged);
    // Below 54 of 80 hit points: phase 1 turns the other way (−6) and reverses every 240 ticks.
    expect(w.bosses.damagePart(core, 26, 0)).toBe(BossHit.Damaged);
    run(w, 2);
    expect(boss.phase).toBe(1);
    expect(boss.parts[hub].spin).toBe(-6);
    run(w, 240);
    expect(boss.parts[hub].spin).toBe(6);
  });

  it('boss.bastion: lane lasers from the emitters in turn, spreads from the core from phase 1', () => {
    const w = fighting('cinder-bastion');
    const boss = w.bosses.boss;
    const top = part(w, 'emitter-top');
    const bottom = part(w, 'emitter-bottom');
    // Phase 0: no bullets, the first lane after 60 ticks from the top emitter, attached.
    run(w, 58);
    expect(w.bullets.count).toBe(0);
    expect(w.bullets.lasers.count).toBe(0);
    run(w, 4);
    expect(w.bullets.lasers.count).toBe(1);
    const lasers = w.bullets.lasers.fields;
    const laneY = (): number => lasers.y[0] - boss.y;
    expect(laneY()).toBeCloseTo(boss.parts[top].y - boss.y, 0);
    // The next one (120 ticks on, rank-scaled) from the bottom emitter.
    run(w, 130);
    let bottomLane = false;
    for (let i = 0; i < w.bullets.lasers.count; i++) {
      if (Math.abs(lasers.y[i] - boss.parts[bottom].y) < 2) bottomLane = true;
    }
    expect(bottomLane).toBe(true);
    expect(w.bullets.count).toBe(0);
    // Phase 1: aimed 3-way spreads of ovals from the core.
    w.bosses.damagePart(part(w, 'core'), 27, 0);
    run(w, 120);
    expect(boss.phase).toBe(1);
    expect(w.bullets.count).toBeGreaterThanOrEqual(3);
  });
});
