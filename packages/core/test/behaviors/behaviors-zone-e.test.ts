/**
 * The behaviours of plan M2-12 (and of R5-05.S4a's roster) on the shipped zone E roster
 * (`content/enemies/zone-e.enemies.json`), in free flight (a static camera) with the ship holding
 * its fire: `rear.swoop` (a squall jumper: in from behind along its row, overtaking, a shot back
 * from its turn point, then away to the left), `boss.steed` (SQUALL STEED: bobbing on its ellipse,
 * the chest opening and shutting with its lids, homing minis launched from the chest only while it
 * is open, spreads from the snout), `rock.fall` (an ice slab hanging on the ceiling until the ship
 * nears, then falling to its cap), `rammer.aimed` (a lightbird: entering, telegraphing, dashing at
 * the ship) and `captain.circler` (THE STORM EYE: orbiting the ellipse, rings from its two cloud
 * guns, the fight going till the eye falls).
 */
import { describe, expect, it } from 'vitest';
import { BossHit, BossMotion, BossState } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { DEFAULT_BOSS_Y, loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyFlag, EnemyState } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { bullets, part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1rel, v1screenX, v1speed } from '../helpers/v1-port.js';

/** The KESTREL, Type A, the zone E roster and the patterns it runs. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-e.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { freeFlight, fighting, live } = zoneKit(DB);

describe('core/behaviors — zone E (M2-12)', () => {
  it('rear.swoop: in from behind along its row, a shot back from the turn point, then away left', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('squall-jumper') ?? -1;
    const jumper = w.enemies.spawn(index, w.camera.x - 24, w.camera.y + 60);
    expect(jumper).not.toBeNull();
    if (jumper === null) return;
    run(w, 5);
    // Overtaking: flying right at its speed along its row, drawn facing right.
    expect(jumper.mover).toBe(MoverKind.Waypoint);
    expect(jumper.vx).toBeCloseTo(v1speed(1.6), 9);
    expect(jumper.vy).toBe(0);
    expect(jumper.flags & EnemyFlag.FaceRight).not.toBe(0);
    expect(w.bullets.count).toBe(0);
    // (290 + 24) / 1.6 → 197 ticks to the turn point (205 with the ported geometry), then half
    // of its 20-tick hold: one needle.
    const arrive = Math.ceil((v1screenX(290) + 24) / v1speed(1.6));
    run(w, arrive + 3);
    expect(jumper.x - w.camera.x).toBeCloseTo(v1screenX(290), 6);
    expect(jumper.y - w.camera.y).toBeCloseTo(60, 6);
    expect(w.bullets.count).toBe(0);
    run(w, 12);
    expect(w.bullets.count).toBe(1);
    // It turned to the ship (behind it) and leaves to the left along its row.
    expect(jumper.flags & EnemyFlag.FaceRight).toBe(0);
    run(w, 20);
    expect(jumper.vx).toBeCloseTo(-v1speed(1.3), 9);
    expect(jumper.vy).toBe(0);
    expect(w.bullets.count).toBeLessThanOrEqual(1);
  });

  it('boss.steed: bobs on its ellipse; the chest opens with its lids and launches minis only then', () => {
    const w = fighting('squall-steed');
    const boss = w.bosses.boss;
    const chest = part(w, 'chest');
    const lid = part(w, 'lid-top');
    const lidY = boss.parts[lid].localY;
    expect(lidY).toBe(boss.parts[lid].restY);
    // Shut: the chest clinks, no minis.
    expect(boss.parts[chest].open).toBe(false);
    expect(w.bosses.damagePart(chest, 1, 0)).toBe(BossHit.Clink);
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    let opened = -1;
    for (let t = 1; t <= 140 && opened < 0; t++) {
      run(w, 1);
      low = Math.min(low, boss.y - w.camera.y);
      high = Math.max(high, boss.y - w.camera.y);
      if (boss.parts[chest].open) opened = t;
      else expect(live(w, 'steed-foal')).toHaveLength(0);
    }
    // Phase 0 bobs 14 px round its row DEFAULT_BOSS_Y (100 at 384×216; 2 units a tick: a quarter
    // turn in 128 ticks).
    expect(low).toBeGreaterThanOrEqual(DEFAULT_BOSS_Y - 14 - 1e-6);
    expect(high).toBeLessThanOrEqual(DEFAULT_BOSS_Y + v1rel(14) + 1e-6);
    expect(high - low).toBeGreaterThan(10);
    // Open after its 130 shut ticks: the lids 3 px apart, the chest takes hits, a mini comes out.
    expect(opened).toBeGreaterThan(120);
    expect(opened).toBeLessThanOrEqual(131);
    expect(boss.parts[chest].open).toBe(true);
    expect(boss.parts[lid].localY).toBe(lidY - Math.floor(v1rel(3)));
    expect(w.bosses.damagePart(chest, 1, 0)).toBe(BossHit.Damaged);
    run(w, 12);
    expect(live(w, 'steed-foal')).toHaveLength(1);
    // Phase 0 launches one per opening: none more until it has shut (130 ticks open) and reopened.
    run(w, 125);
    expect(live(w, 'steed-foal').length).toBeLessThanOrEqual(1);
    expect(boss.parts[chest].open).toBe(false);
    expect(boss.parts[lid].localY).toBe(lidY);
    // The snout fired its aimed spreads meanwhile.
    expect(w.bullets.count).toBeGreaterThanOrEqual(3);
  });

  it('boss.steed: a later phase launches two minis per opening and rings from the snout as it shuts', () => {
    const w = fighting('squall-steed');
    const boss = w.bosses.boss;
    const chest = part(w, 'chest');
    // Straight to the last phase: the chest below 18 of 64.
    run(w, 140);
    expect(boss.parts[chest].open).toBe(true);
    w.bosses.damagePart(chest, 47, 0);
    run(w, 2);
    expect(boss.phase).toBe(2);
    expect(boss.parts[chest].open).toBe(false);
    let launched = 0;
    let before = live(w, 'steed-foal').length;
    let ringed = false;
    for (let t = 0; t < 360; t++) {
      const wasOpen = boss.parts[chest].open;
      const bullets = w.bullets.count;
      run(w, 1);
      const now = live(w, 'steed-foal').length;
      if (now > before) launched += now - before;
      before = now;
      if (wasOpen && !boss.parts[chest].open && w.bullets.count >= bullets + 10) ringed = true;
    }
    expect(launched).toBeGreaterThanOrEqual(2);
    expect(ringed).toBe(true);
  });

  it('rock.fall: an ice slab hangs until the ship comes within 96 px, then gathers to its 4.5 cap', () => {
    const w = freeFlight();
    run(w, 45); // the fly-in first: from here the ship holds its position
    const ship = w.players[0];
    const index = DB.enemyIndex.get('ice-slab') ?? -1;
    // Out of reach 300 px ahead of the ship: it hangs on the ceiling (a static camera, and free
    // flight has no terrain — the shatter law belongs to `gimmick-range`'s falling rock).
    const far = w.enemies.spawn(index, ship.x + 300, w.camera.y + 24);
    expect(far).not.toBeNull();
    // Inside the trigger, 48 px ahead of the ship: dropped from its first mover tick.
    const near = w.enemies.spawn(index, ship.x + 48, w.camera.y + 24);
    expect(near).not.toBeNull();
    if (far === null || near === null) return;
    run(w, 10);
    expect(far.mover).toBe(MoverKind.Ballistic);
    expect(far.y).toBe(w.camera.y + 24);
    expect(far.vy).toBe(0);
    // Gravity 0.06 px/tick²: ten ticks in, 0.6 px/tick; it falls straight down.
    expect(near.mover).toBe(MoverKind.Ballistic);
    expect(near.vx).toBe(0);
    expect(near.vy).toBeCloseTo(0.6, 9);
    run(w, 80);
    // The 4.5 px/tick cap is its terminal velocity from then on (reached after 75 ticks).
    expect(near.vy).toBe(4.5);
    expect(near.x).toBe(ship.x + 48);
    expect(near.state).toBe(EnemyState.Live);
    run(w, 30);
    expect(near.vy).toBe(4.5);
  });

  it('rammer.aimed: a lightbird enters for 90, telegraphs for 30, then dashes level at 2.7', () => {
    const w = freeFlight();
    run(w, 45); // the fly-in first: the ship's row and position hold from here
    const ship = w.players[0];
    const index = DB.enemyIndex.get('lightbird') ?? -1;
    const bird = w.enemies.spawn(index, w.camera.x + 300, ship.y);
    expect(bird).not.toBeNull();
    if (bird === null) return;
    // Asleep: no mover yet, frozen in the air (it rides the stage scroll into view).
    run(w, 80);
    expect(bird.mover).not.toBe(MoverKind.AimedDash);
    expect([bird.vx, bird.vy]).toEqual([0, 0]);
    const x0 = bird.x;
    // The telegraph: the dash mover holds while its 30 windup ticks run out.
    run(w, 20);
    expect(bird.mover).toBe(MoverKind.AimedDash);
    expect(bird.x).toBe(x0);
    expect([bird.vx, bird.vy]).toEqual([0, 0]);
    // The dash: aimed at the ship dead level — the 32-way quantisation of a due-west aim is exact,
    // so it flies its row at 2.7 px/tick and never fires.
    run(w, 32);
    expect(bird.vx).toBeCloseTo(-2.7, 9);
    expect(bird.vy).toBe(0);
    run(w, 20);
    expect(bird.y).toBe(ship.y); // the direction stays locked for the whole dash
    expect(bird.x).toBeLessThan(x0 - 50);
    expect(w.bullets.count).toBe(0);
  });

  it('captain.circler: THE STORM EYE orbits its ellipse, rings 8 from each cloud, and falls by its eye', () => {
    const w = fighting('storm-eye');
    const boss = w.bosses.boss;
    expect(boss.motion).toBe(BossMotion.Orbit);
    const eye = part(w, 'eye');
    const top = part(w, 'cloud-top');
    const bottom = part(w, 'cloud-bottom');
    const ring = part(w, 'ring');
    // On the 195 × 84 ellipse round (330, 168) all the way, 2.7 angle units a tick.
    const start = boss.orbitAngle;
    for (let i = 0; i < 120; i++) {
      run(w, 1);
      const u = (boss.screenX - 330) / 195;
      const v = (boss.screenY - 168) / 84;
      expect(u * u + v * v).toBeCloseTo(1, 4);
    }
    expect((boss.orbitAngle - start + 1024) % 1024).toBeCloseTo(324, 0);
    // The core takes hits from the first tick of the fight — the swirl ring is decor armour:
    // unkillable, and (with no hurtbox) it shields nothing.
    expect(w.bosses.damagePart(eye, 1, 0)).toBe(BossHit.Damaged);
    expect(w.bosses.damagePart(ring, 99, 0)).toBe(BossHit.Clink);
    expect(boss.parts[ring].destroyed).toBe(false);
    // Both cloud guns rain their rings of 8 with each volley: sixteen fresh rounds by 95+ ticks
    // into the fight (the loop above spent 120, so the volley has fired; view-culled none).
    expect(bullets(w, BulletKind.RoundPurple)).toBeGreaterThanOrEqual(16);
    // The guns die, the fight goes on (design §7): a volley later it is eight from the one cloud.
    expect(w.bosses.damagePart(top, 12, 0)).toBe(BossHit.Destroyed);
    expect(boss.state).toBe(BossState.Fight);
    run(w, 96);
    expect(w.bosses.damagePart(bottom, 12, 0)).toBe(BossHit.Destroyed);
    expect(boss.state).toBe(BossState.Fight);
    // And the eye falls: the last 43 of its 44 kill the fight (nothing else is a core).
    expect(w.bosses.damagePart(eye, 43, 0)).toBe(BossHit.Destroyed);
    run(w, 2);
    expect([BossState.Dying, BossState.Dead]).toContain(boss.state);
  });
});
