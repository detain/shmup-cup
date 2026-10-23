/**
 * The behaviours of plan M2-14 and the R5-09.S4a roster additions on the shipped zone I roster
 * (`content/enemies/zone-i.enemies.json`), in free flight (a static camera) with the ship holding
 * its fire: `mine.burst` (ABYSSAL THRONE's depth mines: armed by a ship in reach, a flash, a ring,
 * gone), `boss.ark` (the ABYSS ARK's turret rows aiming and firing, its hooks) and `boss.angler`
 * (THE HOLLOW KING: the mouth that opens — the core — with its jaws, the swaying lure and its
 * needles and minions); and the new types: `walker.floor` (the abyss-crawler: it stalks the ship
 * and spits a 3-spread), `rocket.homing` (the stinger: `ark-hook`'s flight on new art),
 * `carrier.straight` (the deep-tender: a capsule carrier) and the zone's first captain on
 * `captain.crab` (THE TRENCH HERMIT: sidesteps its antechamber box, rings of 10 turned 16 units
 * each volley).
 */
import { describe, expect, it } from 'vitest';
import { BossHit, BossMotion, BossState } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { PLAYFIELD_H } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1rel, v1speed } from '../helpers/v1-port.js';

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
    // R5-09.S4b — the §8 rebuild: the 5-section hull, its two gun pods and the lighter heart.
    expect(boss.partCount).toBe(14);
    expect(boss.parts[part(w, 'hull-4')].hp).toBe(1); // decoration: it stands in the keel's row
    const heart = boss.parts[part(w, 'heart')];
    expect(heart.maxHp).toBe(105);
    const podL = boss.parts[part(w, 'pod-l')];
    const podR = boss.parts[part(w, 'pod-r')];
    const bow = boss.parts[part(w, 'bow')];
    expect(podL.maxHp).toBe(16);
    expect(podL.gun).toBe(true);
    expect(podR.gun).toBe(true);
    expect(bow.y - podL.y).toBe(60); // the ∓60 shelf offsets (translation-only parentage)
    expect(podR.y - bow.y).toBe(60);
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
    // R5-09.S4b — the §8 rebuild: eleven parts, the lighter maw and lure, and the never fins.
    expect(boss.partCount).toBe(11);
    expect(boss.parts[maw].maxHp).toBe(80);
    expect(boss.parts[part(w, 'lure')].maxHp).toBe(24);
    // The fins are armour shadows on the body's flanks: hits clink, they never break.
    expect(w.bosses.damagePart(part(w, 'fin-top'), 99, 0)).toBe(BossHit.Clink);
    expect(boss.parts[part(w, 'fin-top')].destroyed).toBe(false);
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

  // R5-09.S4a — the new roster types and the zone's first captain (design §6–§7).
  it('walker.floor (abyss-crawler): crawls left at 0.75, stops and spits a 32-unit 3-spread, walks on', () => {
    const w = freeFlight();
    const ship = w.players[0];
    // Same row as the ship, well right of it: its volley will face dead left (unit 512).
    const crawler = w.enemies.spawn(
      DB.enemyIndex.get('abyss-crawler') ?? -1,
      ship.x + v1rel(150),
      ship.y,
    );
    expect(crawler).not.toBeNull();
    if (crawler === null) return;
    run(w, 3);
    expect(crawler.mover).toBe(MoverKind.GroundCrawl);
    expect(crawler.vx).toBeCloseTo(-0.75, 9);
    const start = crawler.x;
    const angles: number[] = [];
    let stopped = -1;
    let speed = -1;
    for (let t = 3; t < 120 && stopped < 0; t++) {
      run(w, 1);
      if (crawler.mover !== MoverKind.None) continue;
      const f = w.bullets.pool.fields;
      for (let i = 0; i < w.bullets.pool.count; i++) {
        if (f.kind[i] === BulletKind.OvalRed && f.age[i] <= 1) {
          angles.push(((Math.round(f.angle[i]) % 1024) + 1024) % 1024);
          speed = f.speed[i];
        }
      }
      if (angles.length > 0) {
        angles.sort((a, b) => a - b);
        stopped = t;
      }
    }
    expect(stopped).toBeGreaterThan(40); // walkTicks 60: the stop comes after the walk
    expect(stopped).toBeLessThan(90);
    expect(start - crawler.x).toBeGreaterThan(40); // 60 ticks at 0.75 px/tick
    expect(start - crawler.x).toBeLessThanOrEqual(46);
    expect(crawler.y).toBe(ship.y); // open water: the crawl holds its row
    // Three ovals centred on the ship, 32 units apart (design §6), at 1.8 px/tick.
    expect(angles).toEqual([480, 512, 544]);
    expect(speed).toBe(1.8);
    // The 30 stop ticks pass, then it walks again.
    run(w, 28);
    expect(crawler.mover).toBe(MoverKind.None);
    run(w, 4);
    expect(crawler.mover).toBe(MoverKind.GroundCrawl);
  });

  it('rocket.homing (stinger): away from the middle row at 1.5, homing at 1.8, then straight on', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('stinger') ?? -1;
    const high = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + 40);
    const low = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + PLAYFIELD_H - 40);
    expect(high).not.toBeNull();
    expect(low).not.toBeNull();
    if (high === null || low === null) return;
    run(w, 5);
    // Up-left above the middle row, down-left below it, at the launch speed (`ark-hook`'s numbers).
    expect(high.mover).toBe(MoverKind.Straight);
    expect(high.vx).toBeLessThan(0);
    expect(high.vy).toBeLessThan(0);
    expect(low.vy).toBeGreaterThan(0);
    expect(Math.hypot(high.vx, high.vy)).toBeCloseTo(v1speed(1), 6);
    // Homing from tick 20, 4 units a tick: it turns towards the ship, below-left of it.
    run(w, 20);
    expect(high.mover).toBe(MoverKind.Homing);
    expect(Math.hypot(high.vx, high.vy)).toBeCloseTo(v1speed(1.2), 4); // its speed 1.8
    const early = high.vy;
    run(w, 55); // turnRate 4: it takes a tick slower to sweep the angle the 1.875 rocket does
    expect(high.vy).toBeGreaterThan(early);
    expect(high.vy).toBeGreaterThan(0); // still inside its 70 homing ticks
    // After its 70 homing ticks it keeps its heading.
    run(w, 15);
    const vx = high.vx;
    const vy = high.vy;
    run(w, 20);
    if (high.state === EnemyState.Live) {
      expect(high.vx).toBeCloseTo(vx, 9);
      expect(high.vy).toBeCloseTo(vy, 9);
    }
  });

  it('carrier.straight (deep-tender): flies left at 1.05 and never fires; shot, it scores and drops', () => {
    const w = freeFlight();
    const tender = w.enemies.spawn(
      DB.enemyIndex.get('deep-tender') ?? -1,
      w.camera.x + 480,
      w.camera.y + 120,
    );
    expect(tender).not.toBeNull();
    if (tender === null) return;
    run(w, 60);
    expect(tender.mover).toBe(MoverKind.Straight);
    expect(tender.vx).toBeCloseTo(-1.05, 9);
    expect(tender.vy).toBeCloseTo(0, 9);
    expect(w.bullets.count).toBe(0);
    const score = w.scoring.board.scores[0].score;
    expect(w.enemies.kill(tender, 0)).toBe(true);
    run(w, 2);
    expect(w.scoring.board.scores[0].score).toBe(score + 200);
    expect(w.powerups.pool.count).toBe(1); // the zone's capsule economy rides this carrier (§5)
  });

  it('captain.crab (trench-hermit): sidesteps its antechamber box, rings of 10 turned 16; claws clink', () => {
    const w = fighting('trench-hermit');
    const boss = w.bosses.boss;
    expect(boss.partCount).toBe(3); // the swarm-reactor shell and its two claws (design §7)
    expect(boss.parts[part(w, 'core')].core).toBe(true);
    expect(boss.parts[part(w, 'core')].maxHp).toBe(30);
    expect(boss.parts[part(w, 'claw-l')].maxHp).toBe(8);
    let stepped = 0;
    const volleys: number[][] = [];
    let speed = -1;
    for (let t = 0; t < 500; t++) {
      run(w, 1);
      if (boss.motion === BossMotion.MoveTo) {
        // The design's antechamber box, x 407…574 / y 96…264 (v2 px).
        expect(boss.moveToX).toBeGreaterThanOrEqual(407);
        expect(boss.moveToX).toBeLessThanOrEqual(574);
        expect(boss.moveToY).toBeGreaterThanOrEqual(96);
        expect(boss.moveToY).toBeLessThanOrEqual(264);
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
    expect(stepped).toBeGreaterThan(0); // stepTicks 70: it sidesteps through the fight
    expect(volleys.length).toBeGreaterThanOrEqual(2);
    expect(volleys[0]).toHaveLength(10); // ring 10 (design §7)
    expect(volleys[1]).toHaveLength(10);
    // Each ring leaves `turn` 16 units further than the last (the angles stay whole-rounded).
    for (let i = 0; i < 10; i++) expect(volleys[1][i] - volleys[0][i]).toBe(16);
    expect(speed).toBe(1.5); // the caustic ring speed — inside the 3.0 px/tick rule (rule 4)
    // The claws are armour shadows: hits clink, they never break. The shell carries the fight.
    expect(w.bosses.damagePart(part(w, 'claw-l'), 8, 0)).toBe(BossHit.Clink);
    expect(boss.parts[part(w, 'claw-l')].destroyed).toBe(false);
    expect(w.bosses.damagePart(part(w, 'core'), 29, 0)).toBe(BossHit.Damaged);
    expect(w.bosses.damagePart(part(w, 'core'), 1, 0)).toBe(BossHit.Destroyed);
    expect(boss.state).not.toBe(BossState.Fight);
  });
});
