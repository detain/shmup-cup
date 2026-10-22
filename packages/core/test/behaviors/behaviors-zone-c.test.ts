/**
 * The behaviours of plan M2-11 on the shipped zone C roster (`content/enemies/zone-c.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `worm.burst` (a sand worm: the
 * leader waits in the sand, bursts out on an arc, the segments follow its track) and `boss.widow`
 * (SANDGRAVE WIDOW: scuttling inside its box, spider drones from the spinnerets, silk lines once
 * its fangs are gone) — and, since R5-03.S4a, the design §6/§7 types the roster now carries:
 * `turret.floor` (a spine-burrower: settled, it aims and fires every 120 ticks), `rear.swoop` (a
 * dune-lance: overtaking from behind, one needle back from its turn point at x 380, away to the
 * left) and `captain.ram` (DUNE SCORPION: fans of waves from its two claws, a ram down the
 * player's row to x 60 and back home).
 */
import { describe, expect, it } from 'vitest';
import { BulletKind } from '../../src/bullets/index.js';
import { BossHit, BossMotion } from '../../src/bosses/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { DropKind, EnemyFlag, EnemyState } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1screenX, v1screenY } from '../helpers/v1-port.js';

/** The KESTREL, Type A, the zone C roster and the patterns it runs. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-c.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { freeFlight, fighting, live } = zoneKit(DB);

describe('core/behaviors — zone C (M2-11)', () => {
  it('worm.burst: the leader waits in the sand, bursts out, the segments follow its arc', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('dune-worm') ?? -1;
    // Far to the right (a screen column beyond the 190-px trigger, ported) — it waits there.
    const slot = w.enemies.startFormation(
      index,
      4,
      7,
      v1screenX(380),
      150,
      -1,
      DropKind.Capsule,
      0,
    );
    expect(slot).toBeGreaterThanOrEqual(0);
    run(w, 40);
    const worm = live(w, 'dune-worm');
    expect(worm).toHaveLength(4);
    const leader = worm.find((e) => (e.flags & EnemyFlag.Leader) !== 0);
    expect(leader?.mover).toBe(MoverKind.Ballistic);
    const y0 = leader?.y ?? 0;
    expect(leader?.vx).toBe(0);
    expect(leader?.vy).toBe(0);
    for (const e of worm) if (e !== leader) expect(e.mover).toBe(MoverKind.Follow);
    // Bring the ship within the trigger: the leader bursts upwards and to the left.
    const ship = w.players[0];
    ship.x = (leader?.x ?? 0) - 150;
    run(w, 10);
    expect(leader?.vy).toBeLessThan(0);
    expect(leader?.vx).toBeLessThan(0);
    // A segment k·7 ticks behind stands where the leader stood 7·k ticks ago.
    const positions: [number, number][] = [];
    for (let t = 0; t < 30; t++) {
      run(w, 1);
      positions.push([leader?.x ?? 0, leader?.y ?? 0]);
    }
    const second = worm.find((e) => e.member === 1);
    expect(second?.x).toBeCloseTo(positions[positions.length - 8][0], 9);
    expect(second?.y).toBeCloseTo(positions[positions.length - 8][1], 9);
    // It rises well above where it lay, then falls back through (the arc ignores terrain).
    let top = y0;
    for (let t = 0; t < 200 && leader?.state === EnemyState.Live; t++) {
      run(w, 1);
      if ((leader?.y ?? 0) < top) top = leader?.y ?? 0;
    }
    expect(y0 - top).toBeGreaterThan(50);
  });

  it('boss.widow: scuttles inside its box, launches spider drones, spins silk lines without its fangs', () => {
    const w = fighting('sandgrave-widow');
    const boss = w.bosses.boss;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      expect(boss.screenX).toBeGreaterThanOrEqual(v1screenX(270) - 1e-9);
      expect(boss.screenX).toBeLessThanOrEqual(v1screenX(316) + 1e-9);
      expect(boss.screenY).toBeGreaterThanOrEqual(v1screenY(56) - 1e-9);
      expect(boss.screenY).toBeLessThanOrEqual(v1screenY(144) + 1e-9);
    }
    expect(live(w, 'widow-drone').length).toBeGreaterThanOrEqual(1);
    // Phase 0 has no silk lines; the head is armoured behind the fangs.
    expect(w.bullets.lasers.count).toBe(0);
    const head = part(w, 'head');
    expect(w.bosses.damagePart(head, 1, 0)).toBe(BossHit.Clink);
    // Both fangs gone: phase 1, the head takes damage, lanes from the spinnerets.
    w.bosses.damagePart(part(w, 'fang-top'), 99, 0);
    w.bosses.damagePart(part(w, 'fang-bottom'), 99, 0);
    run(w, 2);
    expect(boss.phase).toBe(1);
    expect(w.bosses.damagePart(head, 1, 0)).toBe(BossHit.Damaged);
    let lasers = 0;
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      if (w.bullets.lasers.count > lasers) lasers = w.bullets.lasers.count;
    }
    expect(lasers).toBe(1); // one silk line at a time
  });

  it('turret.floor: the burrower settles, aims and fires one shot every 120 ticks', () => {
    const w = freeFlight();
    run(w, 45); // the ship's fly-in — `aimed` shoots at a live target
    // The design §6 tunables (aim 24 · fire 120 · speed 2.25) are v2 values, authored as such.
    const index = DB.enemyIndex.get('spine-burrower') ?? -1;
    const turret = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + 200);
    expect(turret).not.toBeNull();
    if (turret === null) return;
    const shots: Array<[number, number]> = [];
    for (let t = turret.spawnTick + 1; t <= turret.spawnTick + 400; t++) {
      run(w, 1);
      const f = w.bullets.pool.fields;
      for (let i = 0; i < w.bullets.pool.count; i++) {
        if (f.kind[i] === BulletKind.RoundPink && f.age[i] <= 1) shots.push([t, f.angle[i]]);
      }
    }
    // Every shot pays one full 120-tick wait (the 30-tick settle falls inside it before the
    // first), then wakes at most one 24-tick aim step late; the rhythm is exactly the tunable.
    expect(shots.length).toBe(3); // 120, 240, 360 … of the 400 ticks measured
    expect(shots[0][0] - turret.spawnTick).toBeGreaterThanOrEqual(120);
    expect(shots[0][0] - turret.spawnTick).toBeLessThanOrEqual(120 + 24);
    for (let k = 1; k < shots.length; k++) expect(shots[k][0] - shots[k - 1][0]).toBe(120);
    for (const [, angle] of shots) expect(angle % 32).toBe(0); // the aim quantises to 32 steps
  });

  it('rear.swoop: the dune-lance overtakes, fires one needle back at x 380 and leaves left', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('dune-lance') ?? -1;
    const lance = w.enemies.spawn(index, w.camera.x - 24, w.camera.y + 60);
    expect(lance).not.toBeNull();
    if (lance === null) return;
    run(w, 5);
    // Overtaking: flying right at its §6 speed along its row, drawn facing right, silent.
    expect(lance.mover).toBe(MoverKind.Waypoint);
    expect(lance.vx).toBeCloseTo(2.7, 9);
    expect(lance.vy).toBe(0);
    expect(lance.flags & EnemyFlag.FaceRight).not.toBe(0);
    expect(w.bullets.count).toBe(0);
    // (380 + 24) / 2.7 → 150 ticks to the turn point; the shot wakes after half its 24-tick hold.
    const arrive = Math.ceil((380 + 24) / 2.7);
    run(w, arrive + 3); // 158 of them: it sits at the turn point, still silent
    expect(lance.x - w.camera.x).toBeCloseTo(380, 6);
    expect(w.bullets.count).toBe(0);
    run(w, 10); // 168 ≥ 150 + 12 + 1: the 1-way (§6 ways 1) aimed pink needle
    expect(w.bullets.count).toBe(1);
    expect(lance.flags & EnemyFlag.FaceRight).toBe(0); // it turned back to the ship
    run(w, 20); // the hold is over: away to the left at its 2.4 leaveSpeed
    expect(lance.vx).toBeCloseTo(-2.4, 9);
    expect(lance.vy).toBe(0);
    expect(w.bullets.count).toBeLessThanOrEqual(1);
  });

  it('captain.ram: the dune-scorpion fans four waves from its claws, rams x 60 and returns', () => {
    const w = fighting('dune-scorpion');
    const boss = w.bosses.boss;
    const ship = w.players[0];
    // The core is hittable at once (no `requires`); the tail is pure decoration (§7).
    expect(w.bosses.damagePart(part(w, 'shell'), 1, 0)).toBe(BossHit.Damaged);
    expect(w.bosses.damagePart(part(w, 'tail'), 1, 0)).toBe(BossHit.Clink);
    // §7 waves 4 · waveTicks 42 · ways 5 from BOTH guns: ten bullets a wave, 42 ticks apart.
    run(w, 42);
    expect(w.bullets.count).toBe(10);
    ship.y = w.camera.y + 100; // the ram row from here on
    run(w, 3 * 42);
    expect(w.bullets.count).toBe(40); // none of the four waves has left the view
    // The ram: a line to x 60 at the whole-pixel row, then the way home (returnTicks 80).
    const row = Math.floor(ship.y - w.camera.y);
    expect(boss.motion).toBe(BossMotion.MoveTo);
    expect([boss.moveToX, boss.moveToY]).toEqual([60, row]);
    run(w, 53);
    expect(boss.screenX).toBeCloseTo(60, 9);
    run(w, 7); // the 10-tick wait at the row, then home again
    expect([boss.moveToX, boss.moveToY]).toEqual([boss.homeX, boss.homeY]);
    run(w, 80);
    expect(boss.screenX).toBeCloseTo(boss.homeX, 9);
    expect(boss.screenY).toBeCloseTo(boss.homeY, 9);
  });
});
