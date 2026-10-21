/**
 * The behaviours of plan M2-11 on the shipped zone C roster (`content/enemies/zone-c.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `worm.burst` (a sand worm: the
 * leader waits in the sand, bursts out on an arc, the segments follow its track) and `boss.widow`
 * (SANDGRAVE WIDOW: scuttling inside its box, spider drones from the spinnerets, silk lines once
 * its fangs are gone).
 */
import { describe, expect, it } from 'vitest';
import { BossHit } from '../../src/bosses/index.js';
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
});
