/**
 * The behaviours of plan M2-12 on the shipped zone E roster (`content/enemies/zone-e.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `rear.swoop` (a squall jumper:
 * in from behind along its row, overtaking, a shot back from its turn point, then away to the
 * left) and `boss.steed` (SQUALL STEED: bobbing on its ellipse, the chest opening and shutting
 * with its lids, homing minis launched from the chest only while it is open, spreads from the
 * snout).
 */
import { describe, expect, it } from 'vitest';
import { BossHit } from '../../src/bosses/index.js';
import { DEFAULT_BOSS_Y, loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyFlag } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { part, run, zoneKit } from '../helpers/zone-behaviors.js';
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
});
