/**
 * The behaviours of plan M2-14 on the shipped zone I roster (`content/enemies/zone-i.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `mine.burst` (ABYSSAL THRONE's
 * depth mines: armed by a ship in reach, a flash, a ring, gone), `boss.ark` (the ABYSS ARK's turret
 * rows aiming and firing, its hooks) and `boss.angler` (THE HOLLOW KING: the mouth that opens — the
 * core — with its jaws, the swaying lure and its needles and minions).
 */
import { describe, expect, it } from 'vitest';
import { BossHit } from '../../src/bosses/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1rel } from '../helpers/v1-port.js';

/**
 * The KESTREL, Type A, the roster whose sprites the parade reuses, the zone I roster and the
 * patterns it runs.
 */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-i.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  // The parade reuses earlier bosses' sprites: without their rosters they are only unknown here.
  expect(issues.filter((issue) => !/sprite/.test(issue.message))).toEqual([]);
  return db;
})();

const { freeFlight, fighting, live } = zoneKit(DB);

describe('core/behaviors — zone I (M2-14)', () => {
  it('mine.burst: a ship in reach arms it — it stops, flashes, bursts into a ring and is gone', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const mine = w.enemies.spawn(DB.enemyIndex.get('depth-mine') ?? -1, ship.x + 140, ship.y);
    expect(mine).not.toBeNull();
    if (mine === null) return;
    run(w, 2);
    expect(mine.mover).toBe(MoverKind.Sine);
    // It drifts in (0.45 px/tick) until the ship is within 60 px (checked every 6 ticks).
    let armedAt = -1;
    for (let t = 0; t < 400 && armedAt < 0; t++) {
      run(w, 1);
      if (mine.mover === MoverKind.None) armedAt = t;
    }
    expect(armedAt).toBeGreaterThan(0);
    expect(Math.abs(mine.x - ship.x)).toBeLessThanOrEqual(66);
    expect(mine.flashTicks).toBeGreaterThan(30);
    const bullets = w.bullets.count;
    run(w, 41);
    expect(mine.state).not.toBe(EnemyState.Live);
    expect(w.bullets.count - bullets).toBe(8);
  });

  it('mine.burst: out of reach it keeps drifting; shot first, it scores and never bursts', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const far = w.enemies.spawn(
      DB.enemyIndex.get('depth-mine') ?? -1,
      ship.x + v1rel(300),
      ship.y - 90,
    );
    expect(far).not.toBeNull();
    if (far === null) return;
    run(w, 300);
    expect(far.state).toBe(EnemyState.Live);
    expect(far.mover).toBe(MoverKind.Sine);
    const bullets = w.bullets.count;
    const score = w.scoring.board.scores[0].score;
    w.enemies.kill(far, 0);
    run(w, 60);
    expect(w.bullets.count).toBe(bullets);
    expect(w.scoring.board.scores[0].score).toBe(score + 300);
  });

  it('boss.ark: its turret rows turn to the ship and fire while on screen; hooks launch', () => {
    const w = fighting('abyss-ark');
    const boss = w.bosses.boss;
    const turret = boss.parts[part(w, 'turret-t1')];
    const start = turret.angle;
    let shots = 0;
    let before = w.bullets.count;
    for (let t = 0; t < 300; t++) {
      run(w, 1);
      if (w.bullets.count > before) shots++;
      before = w.bullets.count;
    }
    expect(shots).toBeGreaterThan(0);
    expect(turret.angle).not.toBe(start); // aimed at the ship
    // Its second phase casts hooks (the `minion`).
    w.bosses.damagePart(part(w, 'heart'), 70, 0);
    run(w, 2);
    expect(boss.phase).toBe(1);
    let hooks = 0;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      hooks = Math.max(hooks, live(w, 'ark-hook').length);
    }
    expect(hooks).toBeGreaterThan(0);
  });

  it('boss.angler: the mouth clinks shut, opens with its jaws apart; the lure sways and fires', () => {
    const w = fighting('hollow-king');
    const boss = w.bosses.boss;
    const maw = part(w, 'maw');
    const jawTop = boss.parts[part(w, 'jaw-top')];
    const jawBottom = boss.parts[part(w, 'jaw-bottom')];
    const shut = jawBottom.y - jawTop.y;
    expect(w.bosses.damagePart(maw, 1, 0)).toBe(BossHit.Clink);
    // After its 150 closed ticks it opens: the jaws 6 px further apart each, the throat takes hits.
    run(w, 152);
    expect(jawBottom.y - jawTop.y).toBeCloseTo(shut + v1rel(12), 6);
    expect(w.bosses.damagePart(maw, 1, 0)).toBe(BossHit.Damaged);
    // The lure sways (its bulb's height relative to the body changes) and fires needles.
    const lure = boss.parts[part(w, 'lure')];
    const body = boss.parts[part(w, 'body')];
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    let fired = 0;
    let before = w.bullets.count;
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      low = Math.min(low, lure.y - body.y);
      high = Math.max(high, lure.y - body.y);
      if (w.bullets.count > before) fired++;
      before = w.bullets.count;
    }
    expect(high - low).toBeGreaterThan(8);
    expect(fired).toBeGreaterThan(0);
    // Its second phase (below 75 of 110, hit while the mouth is open) launches spawn from the lure.
    for (let t = 0; t < 400 && w.bosses.damagePart(maw, 40, 0) !== BossHit.Damaged; t++) run(w, 1);
    run(w, 2);
    expect(boss.phase).toBe(1);
    let spawn = 0;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      spawn = Math.max(spawn, live(w, 'king-spawn').length);
    }
    expect(spawn).toBeGreaterThan(0);
  });
});
