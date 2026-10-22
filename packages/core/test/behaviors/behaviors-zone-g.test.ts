/**
 * The behaviours of plan M2-13 and of the R5-07.S4a roster (design §6/§7) on the shipped zone G
 * roster (`content/enemies/zone-g.enemies.json`), in free flight (a static camera) with the ship
 * holding its fire: `boss.facet` (FACET MONARCH: the core behind its crystals, the arms waving
 * like claws, needles from its four guns — the two arm tips and the two rebuilt-era emitters —
 * rings and one lane at a time from the core in the last
 * phase); `drifter.sine` (the prism-glint's silent 27-px sway, its 150 and its capsule, and the
 * prism-shards the geode now shatters into); `cube.pincer` (prisma meeting 12 px above the
 * midline at 296 and leaving at 2.625 without firing); and `captain.circler` (PRISM SENTINEL: the
 * 200×120 ellipse over the chamber's centre, a ring of eight at 1.5 every 90 ticks, orbs that
 * only clink, and the 5,000 its core pays — 4,000 with the captain and 250 per orb on the
 * cascade).
 */
import { describe, expect, it } from 'vitest';
import { BossHit } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { DropKind } from '../../src/enemies/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { bullets, part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1rel } from '../helpers/v1-port.js';

/** The KESTREL, Type A, the zone G roster and the patterns it runs. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-g.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { freeFlight, fighting, live } = zoneKit(DB);

describe('core/behaviors — zone G (M2-13)', () => {
  it('boss.facet: the core clinks behind its crystals; the arms wave like claws; needles from the four guns', () => {
    const w = fighting('facet-monarch');
    const boss = w.bosses.boss;
    const parts = boss.parts;
    const core = part(w, 'core');
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Clink);
    const tip = parts[part(w, 'arm-top-tip')];
    const body = parts[part(w, 'body')];
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      low = Math.min(low, tip.y - body.y);
      high = Math.max(high, tip.y - body.y);
    }
    // The top arm hangs 28 px above the body’s centre and sweeps ±56 units of curl per segment:
    // its tip swings from well above the arm's root row to near the core's row.
    expect(high).toBeGreaterThan(-v1rel(12));
    expect(low).toBeLessThan(-v1rel(44));
    expect(w.bullets.count).toBeGreaterThan(0);
    // Both crystals broken: the core takes damage and the second phase starts.
    w.bosses.damagePart(part(w, 'crystal-top'), 999, 0);
    w.bosses.damagePart(part(w, 'crystal-bottom'), 999, 0);
    run(w, 2);
    expect(boss.phase).toBe(1);
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Damaged);
  });

  it('boss.facet: its last phase fires one lane at a time from the core, and rings', () => {
    const w = fighting('facet-monarch');
    const boss = w.bosses.boss;
    w.bosses.damagePart(part(w, 'crystal-top'), 999, 0);
    w.bosses.damagePart(part(w, 'crystal-bottom'), 999, 0);
    run(w, 2);
    // The rebuilt core (84 hp, design §8): 43 damage leaves 41, below the phase-2 gate of 42.
    w.bosses.damagePart(part(w, 'core'), 43, 0);
    run(w, 2);
    expect(boss.phase).toBe(2);
    let most = 0;
    let lanes = 0;
    let reds = 0;
    for (let t = 0; t < 700; t++) {
      const before = w.bullets.lasers.count;
      run(w, 1);
      most = Math.max(most, w.bullets.lasers.count);
      if (w.bullets.lasers.count > before) lanes++;
      reds = Math.max(reds, bullets(w, BulletKind.RoundRed));
    }
    expect(lanes).toBeGreaterThanOrEqual(2);
    expect(most).toBe(1);
    // The phase-2 ring of eight round reds (design §8): the needles are purple, so eight live
    // reds — all of one volley, counted at the tick it fires — is the ring itself.
    expect(reds).toBeGreaterThanOrEqual(8);
  });

  it('drifter.sine: prism-glint crosses silent on its 27-px sway and dies for its 150 and a capsule', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const glint = w.enemies.spawn(
      DB.enemyIndex.get('prism-glint') ?? -1,
      ship.x + 260,
      ship.y - 90,
    );
    expect(glint).not.toBeNull();
    if (glint === null) return;
    run(w, 2);
    expect(glint.mover).toBe(MoverKind.Sine);
    const startX = glint.x;
    const startY = glint.y;
    const shots = w.bullets.count;
    let low = startY;
    let high = startY;
    for (let t = 0; t < 198; t++) {
      run(w, 1);
      low = Math.min(low, glint.y);
      high = Math.max(high, glint.y);
    }
    // The design's sine: amp 27 round the spawn row (the mover integrates its velocity, so
    // allow a pixel of overshoot), period 200, drifting left at 1.275 px/tick.
    expect(low).toBeGreaterThanOrEqual(startY - 30);
    expect(high).toBeLessThanOrEqual(startY + 30);
    expect(high - low).toBeGreaterThan(40);
    expect(startX - glint.x).toBeGreaterThan(1.275 * 190);
    expect(startX - glint.x).toBeLessThan(1.275 * 210);
    // It never fires: the glint is a capsule source, not a gun.
    expect(w.bullets.count).toBe(shots);
    const score = w.scoring.board.scores[0].score;
    w.enemies.kill(glint, 0);
    expect([w.enemies.outcomes.dropCount, w.enemies.outcomes.dropKind[0]]).toEqual([
      1,
      DropKind.Capsule,
    ]);
    run(w, 1); // the kill's outcome is consumed by the scoring system in the next tick
    expect(w.scoring.board.scores[0].score).toBe(score + 150);
  });

  it('bubble.split: the geode shatters into three prism-shards, which keep drifting on their own', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const geode = w.enemies.spawn(DB.enemyIndex.get('geode') ?? -1, ship.x + 220, ship.y - 90);
    expect(geode).not.toBeNull();
    if (geode === null) return;
    const score = w.scoring.board.scores[0].score;
    w.enemies.kill(geode, 0);
    // The R5-07.S4a child: the debris are the new prism-shards, and the geode pays no drop.
    expect(w.enemies.outcomes.dropCount).toBe(0);
    run(w, 1); // the kill's outcome is consumed by the scoring system in the next tick
    expect(w.scoring.board.scores[0].score).toBe(score + 700);
    const kids = live(w, 'prism-shard');
    expect(kids).toHaveLength(3);
    expect(live(w, 'geode-shard')).toHaveLength(0);
    // 30 scatter ticks on the split's straight, then each shard runs its own drifter.sine.
    run(w, 32);
    for (const kid of kids) expect(kid.mover).toBe(MoverKind.Sine);
    const x0 = kids.map((kid) => kid.x);
    run(w, 60);
    for (let k = 0; k < kids.length; k++) {
      expect(Math.abs(x0[k] - kids[k].x - 1.5 * 60)).toBeLessThanOrEqual(2);
    }
    // Debris is not economy: a shard dies for its 75 and drops nothing.
    const before = w.scoring.board.scores[0].score;
    w.enemies.kill(kids[0], 0);
    expect(w.enemies.outcomes.dropCount).toBe(0);
    run(w, 1);
    expect(w.scoring.board.scores[0].score).toBe(before + 75);
  });

  it('cube.pincer: prisma meets 12 px above the midline at 296 and leaves at 2.625, never firing', () => {
    const w = freeFlight();
    // A pincer wave enters just past the right edge (the zone rule's screenX 664) and must run
    // its waypoint from there — the free-flight camera sits at (0, 0), world = view.
    const cube = w.enemies.spawn(DB.enemyIndex.get('prisma') ?? -1, 664, 96);
    expect(cube).not.toBeNull();
    if (cube === null) return;
    run(w, 2);
    expect(cube.mover).toBe(MoverKind.Waypoint);
    const shots = w.bullets.count;
    let arrived = false;
    for (let t = 0; t < 300 && !arrived; t++) {
      run(w, 1);
      arrived = cube.x <= 296;
    }
    expect(arrived).toBe(true);
    // The design's meeting row: member 0 spawned above the playfield's half (168) meets at 156.
    expect(Math.abs(cube.y - 156)).toBeLessThanOrEqual(1);
    run(w, 8);
    const x0 = cube.x;
    const y0 = cube.y;
    run(w, 40);
    expect(x0 - cube.x).toBeCloseTo(2.625 * 40, 1);
    expect(Math.abs(cube.y - y0)).toBeLessThanOrEqual(1); // leaveVy 0: it leaves flat
    expect(w.bullets.count).toBe(shots); // the pincer carries no gun
    const score = w.scoring.board.scores[0].score;
    w.enemies.kill(cube, 0);
    expect(w.enemies.outcomes.dropCount).toBe(0); // drop: null — no economy
    run(w, 1);
    expect(w.scoring.board.scores[0].score).toBe(score + 100);
  });

  it('captain.circler: PRISM SENTINEL rings eights every 90 ticks on its 200×120 ellipse; the orbs clink and the core pays five thousand', () => {
    const w = fighting('prism-sentinel');
    const boss = w.bosses.boss;
    // The orbs are armour for all their printed hit points: they clink and keep their hp.
    expect(w.bosses.damagePart(part(w, 'orb-west'), 1, 0)).toBe(BossHit.Clink);
    expect(w.bosses.damagePart(part(w, 'orb-north'), 1, 0)).toBe(BossHit.Clink);
    expect(boss.parts[part(w, 'orb-west')].hp).toBe(6);
    // The core (36 hp, the bar's only row) takes hits from the first tick.
    expect(w.bosses.damagePart(part(w, 'core'), 1, 0)).toBe(BossHit.Damaged);
    // A ring of eight at 1.5 every 90 ticks, and the ellipse 320±100 × 168±60 it circles.
    let volleys = 0;
    let seen = false;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < 500; t++) {
      run(w, 1);
      const fresh = bullets(w, BulletKind.RoundPurple, 1);
      if (fresh > 0 && !seen) {
        expect(fresh).toBe(8);
        volleys++;
      }
      seen = fresh > 0;
      minX = Math.min(minX, boss.x);
      maxX = Math.max(maxX, boss.x);
      minY = Math.min(minY, boss.y);
      maxY = Math.max(maxY, boss.y);
    }
    expect(volleys).toBeGreaterThanOrEqual(4);
    expect(minX).toBeGreaterThanOrEqual(219);
    expect(maxX).toBeLessThanOrEqual(421);
    expect(minY).toBeGreaterThanOrEqual(107);
    expect(maxY).toBeLessThanOrEqual(229);
    expect(maxX - minX).toBeGreaterThan(195);
    expect(maxY - minY).toBeGreaterThan(115);
    // The fight is the core's 36: its death pays the four orbs' 250 on the cascade and the
    // captain's 4,000 when the death sequence finishes (the screen is still bullet-clean).
    const w2 = fighting('prism-sentinel');
    const score = w2.scoring.board.scores[0].score;
    expect(w2.bosses.damagePart(part(w2, 'core'), 36, 0)).toBe(BossHit.Destroyed);
    expect(w2.scoring.board.scores[0].score).toBe(score + 1000);
    run(w2, 400);
    expect(w2.scoring.board.scores[0].score).toBe(score + 5000);
  });
});
