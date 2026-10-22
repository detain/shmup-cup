/**
 * The behaviours of plan M2-12 and the R5-04.S4a roster additions on the shipped zone D roster
 * (`content/enemies/zone-d.enemies.json`), in free flight (a static camera) with the ship holding
 * its fire: `boss.bastion` (CINDER BASTION: its destructible shield arms turning round the core
 * on their pivot, reversing, the hull armour clinking, lane lasers from the emitters in turn,
 * spreads from the core in
 * its later phases), and the S4a types — `mine.burst` (the slag-mine: drifts in, arms within its
 * 120-px trigger, fuses 42 ticks, bursts a ring of 8 at 1.8), `hatch.spawner` (the magma-geode:
 * hatches four cinder-bats above it, one per 120 ticks, and stops) and `captain.crab` (OBSIDIAN
 * CLAW: sidesteps inside its shelf box and fires rings of 10 that turn 24 units each volley).
 */
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit, BossMotion, BossState } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
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

const { fighting, freeFlight, live } = zoneKit(DB);

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

  it('boss.bastion: the shield arms turn round the core on their pivot, taking hits, reversing later', () => {
    const w = fighting('cinder-bastion');
    const boss = w.bosses.boss;
    const core = part(w, 'core');
    const hub = part(w, 'hub');
    const inner = part(w, 'arm-a-inner');
    const mid = part(w, 'arm-a-mid');
    const outer = part(w, 'arm-b-outer');
    // Phase 0: the pivot turns 4 units a tick; the three-segment arms keep their radii round the
    // core (design §8's rebuilt tree: inner 28.5, mid 36, outer 43.5).
    expect(boss.parts[hub].spin).toBe(4);
    const a0 = boss.parts[hub].worldAngle;
    run(w, 10);
    expect((boss.parts[hub].worldAngle - a0 + 1024) % 1024).toBe(40);
    for (let t = 0; t < 8; t++) {
      run(w, 16);
      expect(apart(w, core, inner)).toBeCloseTo(v1rel(19), 3);
      expect(apart(w, core, mid)).toBeCloseTo(v1rel(24), 3);
      expect(apart(w, core, outer)).toBeCloseTo(v1rel(29), 3);
    }
    // The shield arms take the hits (R5-04.FIX: they are destructible — the full-loadout
    // corridor law), the hull behind them is the armour that clinks, and the core takes its hits.
    expect(w.bosses.damagePart(inner, 1, 0)).toBe(BossHit.Damaged);
    expect(w.bosses.damagePart(part(w, 'hull'), 1, 0)).toBe(BossHit.Clink);
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Damaged);
    // Below 72 of 96 hit points: phase 1 turns the other way (−6) and reverses every 240 ticks.
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
    // The next one (140 ticks on, rank-scaled) from the bottom emitter.
    run(w, 150);
    let bottomLane = false;
    for (let i = 0; i < w.bullets.lasers.count; i++) {
      if (Math.abs(lasers.y[i] - boss.parts[bottom].y) < 2) bottomLane = true;
    }
    expect(bottomLane).toBe(true);
    expect(w.bullets.count).toBe(0);
    // Phase 1: aimed 3-way spreads of ovals from the core (every `fireTicks` 120, design §8).
    w.bosses.damagePart(part(w, 'core'), 27, 0);
    run(w, 130);
    expect(boss.phase).toBe(1);
    expect(w.bullets.count).toBeGreaterThanOrEqual(3);
  });
});

describe('core/behaviors — zone D roster additions (R5-04.S4a)', () => {
  it('mine.burst (slag-mine): drifts in, arms within its 120-px trigger, fuses 42 ticks, bursts a ring of 8 at 1.8', () => {
    const w = freeFlight();
    const ship = w.players[0];
    // The ship sits at its fly-in x until the world ticks, so the mine enters at world x ≈ 264
    // and the two meet inside the view (design §6: drift 0.675, trigger 120, fuse 42, ring 8).
    const mine = w.enemies.spawn(DB.enemyIndex.get('slag-mine') ?? -1, ship.x + 300, ship.y);
    expect(mine).not.toBeNull();
    if (mine === null) return;
    run(w, 2);
    expect(mine.mover).toBe(MoverKind.Sine); // drifting — not yet armed
    let armedAt = -1;
    for (let t = 0; t < 600 && armedAt < 0; t++) {
      run(w, 1);
      if (mine.mover === MoverKind.None) armedAt = t;
    }
    expect(armedAt).toBeGreaterThan(0);
    // The design's trigger: it arms at the first moment within 120 px of the ship (0.675 a tick).
    expect(Math.abs(mine.x - ship.x)).toBeGreaterThanOrEqual(118);
    expect(Math.abs(mine.x - ship.x)).toBeLessThanOrEqual(120);
    expect(mine.flashTicks).toBeGreaterThan(36); // the 42-tick fuse (one tick already spent)
    const count = w.bullets.count;
    run(w, 43);
    expect(mine.state).not.toBe(EnemyState.Live); // the fuse ran — it burst and is gone
    expect(w.bullets.count - count).toBe(8); // the ring of 8
    const fields = w.bullets.pool.fields;
    for (let i = 0; i < w.bullets.pool.count; i++) {
      if (fields.kind[i] === BulletKind.RoundRed) expect(fields.speed[i]).toBe(1.8);
    }
  });

  it('mine.burst (slag-mine): out of reach it keeps drifting; shot first, it dies and scores 200, no burst', () => {
    const w = freeFlight();
    const ship = w.players[0];
    // 150 px above the ship: the 18-px sine sway keeps it beyond the 120-px trigger forever.
    const mine = w.enemies.spawn(DB.enemyIndex.get('slag-mine') ?? -1, ship.x + 300, ship.y - 150);
    expect(mine).not.toBeNull();
    if (mine === null) return;
    run(w, 300);
    expect(mine.state).toBe(EnemyState.Live);
    expect(mine.mover).toBe(MoverKind.Sine); // still drifting — never armed
    expect(w.bullets.count).toBe(0);
    const score = w.scoring.board.scores[0].score;
    w.enemies.kill(mine, 0);
    run(w, 60);
    expect(w.bullets.count).toBe(0); // a shot mine does not burst
    expect(w.scoring.board.scores[0].score).toBe(score + 200); // the design's 200 points
  });

  it('hatch.spawner (magma-geode): hatches four cinder-bats above it, one per 120 ticks, and stops', () => {
    const w = freeFlight();
    const geode = w.enemies.spawn(DB.enemyIndex.get('magma-geode') ?? -1, 320, 140);
    expect(geode).not.toBeNull();
    if (geode === null) return;
    run(w, 119);
    expect(live(w, 'cinder-bat')).toHaveLength(0); // design §6: the first at 120, not before
    run(w, 2);
    const first = live(w, 'cinder-bat');
    expect(first).toHaveLength(1);
    expect(first[0].y).toBeLessThan(geode.y); // a floor hatch releases from its top
    run(w, 120); // t = 241
    expect(live(w, 'cinder-bat')).toHaveLength(2); // … and the second one interval later
    // Each bat flies left at 2.25 a tick and is culled ~168 ticks after its release.
    run(w, 368); // t = 609
    // Exactly the fourth (600 ticks) rides here: the first three are culled, and a fifth
    // (released at 600 with no cap) would still be on screen.
    expect(live(w, 'cinder-bat')).toHaveLength(1);
    run(w, 192); // t = 801
    // None left — and the sixth interval (720) hatched nothing: max 4 holds.
    expect(live(w, 'cinder-bat')).toHaveLength(0);
  });

  it('captain.crab (obsidian-claw): sidesteps inside its shelf box and fires rings of 10 that turn 24', () => {
    const w = fighting('obsidian-claw');
    const boss = w.bosses.boss;
    expect(boss.partCount).toBe(3); // shell + two claw arms (design §7)
    expect(boss.parts[part(w, 'shell')].core).toBe(true);
    expect(boss.parts[part(w, 'shell')].gun).toBe(true);
    expect(boss.parts[part(w, 'shell')].maxHp).toBe(48);
    expect(boss.parts[part(w, 'claw-left')].maxHp).toBe(8);
    let stepped = 0;
    const volleys: number[][] = [];
    let speed = -1;
    for (let t = 0; t < 500; t++) {
      run(w, 1);
      if (boss.motion === BossMotion.MoveTo) {
        // The design's shelf box, x 400…560 / y 140…260 (v2 px).
        expect(boss.moveToX).toBeGreaterThanOrEqual(400);
        expect(boss.moveToX).toBeLessThanOrEqual(560);
        expect(boss.moveToY).toBeGreaterThanOrEqual(140);
        expect(boss.moveToY).toBeLessThanOrEqual(260);
        stepped++;
      }
      const fresh: number[] = [];
      const f = w.bullets.pool.fields;
      for (let i = 0; i < w.bullets.pool.count; i++) {
        if (f.kind[i] === BulletKind.OvalRed && f.age[i] <= 1) {
          fresh.push(((Math.round(f.angle[i]) % 1024) + 1024) % 1024);
          speed = f.speed[i];
        }
      }
      if (fresh.length > 0) volleys.push(fresh.sort((a, b) => a - b));
    }
    expect(stepped).toBeGreaterThan(0); // stepTicks 80: it sidesteps through the fight
    expect(volleys.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 10; i++) expect(volleys[0][i]).toBeDefined(); // ring of 10 (design §7)
    expect(volleys[0]).toHaveLength(10);
    expect(volleys[1]).toHaveLength(10);
    // Each ring leaves `turn` 24 units further than the last (the angles stay whole-rounded).
    for (let i = 0; i < 10; i++) expect(volleys[1][i] - volleys[0][i]).toBe(24);
    expect(speed).toBe(1.725); // the aimed ring speed — inside the 3.0 px/tick rule (rule 4)
    // The claws break off; the shell carries the fight (hp 48) and the boss falls with its core.
    expect(w.bosses.damagePart(part(w, 'claw-left'), 8, 0)).toBe(BossHit.Destroyed);
    expect(w.bosses.damagePart(part(w, 'shell'), 47, 0)).toBe(BossHit.Damaged);
    expect(w.bosses.damagePart(part(w, 'shell'), 1, 0)).toBe(BossHit.Destroyed);
    expect(boss.state).not.toBe(BossState.Fight);
  });
});
