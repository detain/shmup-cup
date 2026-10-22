/**
 * The behaviours of plan M2-13 on the shipped zone F roster (`content/enemies/zone-f.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `cell.chase` (a chasing cell: in
 * along its row, then after the nearest ship with a capped turn, then straight on; the halves of a
 * dividing cell flying out first) and `boss.squid` (MANTLE REGENT: its tentacles curling in front of
 * the eye and uncurling in a cycle, the armour clinking while they guard, a broken tentacle ending
 * the first phase). The R5-06.S4a leg adds the design's new bodies on their existing scripts:
 * `hatch.spawner` on the shipped `tissue-cyst` (three cells a minute, out of the open side, then
 * sleep for good), `rocket.homing` on the shipped `viral-dart` (the §6 line: away from the middle
 * for 30 ticks, 110 of chase at 1.95 with a turn cap of 4, then straight), and `captain.circler` on
 * the shipped `nucleus-warden` mid-boss (§7: the design's ellipse at 2.25 units a tick, rings of
 * eight every 100, each turned half a gap).
 */
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit, BossMotion, type BossPart } from '../../src/bosses/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { PLAYFIELD_H } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { freshAngles, part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1speed } from '../helpers/v1-port.js';

/** The KESTREL, Type A, the zone F roster and the patterns it runs. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-f.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { freeFlight, fighting, live } = zoneKit(DB);

/**
 * Whether a shot flying right-to-left along row `y` (world) meets a standing, armoured circle part
 * left of `x` before it reaches `x` — the guard in front of a weak point.
 *
 * @param parts - The boss's parts in play.
 * @param x - World x of the weak point's left edge.
 * @param y - World row.
 * @returns `true` when an armoured circle covers the row in front.
 */
function guarded(parts: readonly BossPart[], x: number, y: number): boolean {
  return parts.some(
    (p) =>
      p.active &&
      !p.destroyed &&
      p.radius > 0 &&
      p.vulnerable === 3 &&
      p.x - p.radius < x &&
      Math.abs(p.y - y) <= p.radius,
  );
}

describe('core/behaviors — zone F (M2-13)', () => {
  // The case tests both zones F and G (and their registration); it rides the earlier zone's
  // file, which is why it names the monarch next to the cell and the regent.
  it('registers the chasing cell and the two zone bosses', () => {
    expect(BEHAVIOR_IDS).toContain('cell.chase');
    expect(BOSS_BEHAVIOR_IDS).toEqual(expect.arrayContaining(['boss.squid', 'boss.facet']));
    expect(DEFAULT_BEHAVIORS.get('cell.chase')?.params).toEqual({
      speed: v1speed(1.1),
      enterTicks: 50,
      turnRate: 6,
      chaseTicks: 150,
      scatterTicks: 24,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.squid')?.params).toMatchObject({
      curl: 1,
      sweepTicks: 48,
      gunTicks: 0,
      ring: 0,
      launchTicks: 0,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.facet')?.params).toMatchObject({
      wave: 1,
      waveTicks: 40,
      ring: 0,
      laserTicks: 0,
    });
  });

  it('cell.chase: in along its row, then after the ship with a capped turn, then straight on', () => {
    const w = freeFlight();
    const ship = w.players[0];
    const cell = w.enemies.spawn(DB.enemyIndex.get('chaser-cell') ?? -1, w.camera.x + 360, 40);
    expect(cell).not.toBeNull();
    if (cell === null) return;
    run(w, 5);
    expect(cell.mover).toBe(MoverKind.Straight);
    expect(cell.vx).toBeCloseTo(-v1speed(1.05), 9);
    expect(cell.vy).toBe(0);
    // The shipped cell drifts in for 46 ticks, then homes (the ship is below it).
    run(w, 42);
    expect(cell.mover).toBe(MoverKind.Homing);
    const speed = Math.hypot(cell.vx, cell.vy);
    expect(speed).toBeCloseTo(v1speed(1.05), 4);
    run(w, 40);
    expect(cell.vy).toBeGreaterThan(0); // turning down towards the ship
    expect(ship.y).toBeGreaterThan(cell.y);
    // After its 130 chase ticks it keeps its heading.
    run(w, 100);
    const vx = cell.vx;
    const vy = cell.vy;
    run(w, 20);
    expect(cell.vx).toBeCloseTo(vx, 9);
    expect(cell.vy).toBeCloseTo(vy, 9);
  });

  it('cell.chase: a dividing cell’s halves fly out first, then chase', () => {
    const w = freeFlight();
    const mitosis = w.enemies.spawn(DB.enemyIndex.get('mitosis-cell') ?? -1, w.camera.x + 250, 100);
    expect(mitosis).not.toBeNull();
    if (mitosis === null) return;
    run(w, 40);
    w.enemies.kill(mitosis, 0);
    run(w, 2);
    const halves = live(w, 'chaser-cell');
    expect(halves).toHaveLength(2);
    // Fanned round "left" (256 units apart): one up-left, one down-left, flying out straight.
    for (const half of halves) {
      expect(half.mover).toBe(MoverKind.Straight);
      expect(half.vx).toBeLessThan(0);
    }
    expect(Math.sign(halves[0].vy)).toBe(-Math.sign(halves[1].vy));
    run(w, 26);
    for (const half of halves) expect(half.mover).toBe(MoverKind.Homing);
  });

  it('boss.squid: the tentacles curl in front of the eye, guard it, and uncurl in a cycle', () => {
    const w = fighting('mantle-regent');
    const boss = w.bosses.boss;
    const parts = boss.parts;
    const eye = parts[part(w, 'eye')];
    const tip = parts[part(w, 'tip-top')];
    const rows = (): number[] => {
      const out: number[] = [];
      for (let y = eye.y - eye.hh; y <= eye.y + eye.hh; y++) out.push(y);
      return out;
    };
    // Straight at first: the eye's row is open, the eye takes hits.
    expect(rows().some((y) => !guarded(parts, eye.x - eye.hw, y))).toBe(true);
    expect(w.bosses.damagePart(part(w, 'eye'), 1, 0)).toBe(BossHit.Damaged);
    const straightTip = tip.y - eye.y;
    expect(straightTip).toBeLessThan(-12);
    // After its 120 open ticks the tentacles curl in (30 ticks) and guard it: every row of the eye
    // is covered by armour in front of it. The rebuilt five-joint arm hooks deeper than the old
    // four: at the landed curl (30 units a joint, each offset turned by its parent's world angle)
    // the tip rests at −25.5 + 16.5·sin 30 + 15·(sin 60 + sin 90 + sin 120 + sin 150) units ≈
    // +12.8 px below the core's row — past it, wrapping the eye (§8's longer chain, same curl).
    run(w, 120 + 32);
    expect(tip.y - eye.y).toBeGreaterThan(0);
    expect(Math.abs(tip.y - eye.y)).toBeCloseTo(12.8, 1);
    for (const y of rows())
      expect(guarded(parts, eye.x - eye.hw, y), `row ${String(y)}`).toBe(true);
    expect(w.bosses.damagePart(part(w, 'seg-top-3'), 1, 0)).toBe(BossHit.Clink);
    // The guard holds 70 ticks, then they uncurl (30 ticks) and the tip is back where it was.
    // (Sample two ticks before the uncurl begins: the hold ends on tick 220, and the old
    // four-joint tip sat near enough the row that its first uncurl step hid inside `< 6`.)
    run(w, 66);
    expect(Math.abs(tip.y - eye.y)).toBeCloseTo(12.8, 1);
    run(w, 36);
    expect(tip.y - eye.y).toBeCloseTo(straightTip, 6);
  });

  it('boss.squid: breaking a tentacle ends the first phase without making the other one jump', () => {
    const w = fighting('mantle-regent');
    const boss = w.bosses.boss;
    const parts = boss.parts;
    // Mid-curl: 12 ticks into the sweep.
    run(w, 120 + 12);
    const tip = parts[part(w, 'tip-bottom')];
    const before = { x: tip.x - boss.x, y: tip.y - boss.y };
    const root = part(w, 'root-top');
    expect(w.bosses.damagePart(root, 999, 0)).toBe(BossHit.Destroyed);
    // The root takes its segments and tip with it.
    for (const name of ['seg-top-1', 'seg-top-2', 'seg-top-3', 'seg-top-4', 'tip-top']) {
      expect(parts[part(w, name)].destroyed, name).toBe(true);
    }
    run(w, 1);
    expect(boss.phase).toBe(1);
    // The other tentacle carries on from where it was (it uncurls: at most one step a tick).
    run(w, 1);
    const moved = Math.hypot(tip.x - boss.x - before.x, tip.y - boss.y - before.y);
    expect(moved).toBeLessThan(4);
  });

  it('hatch.spawner on the shipped tissue-cyst: three cells one interval apart, out of its top', () => {
    const w = freeFlight();
    const cyst = w.enemies.spawn(DB.enemyIndex.get('tissue-cyst') ?? -1, w.camera.x + 300, 90);
    expect(cyst).not.toBeNull();
    if (cyst === null) return;
    const cell = DB.enemyIndex.get('chaser-cell') ?? -1;
    const births: { t: number; y: number }[] = [];
    for (let t = 1; t <= 560; t++) {
      run(w, 1);
      for (const e of w.enemies.enemies) {
        if (e.state === EnemyState.Live && e.specIndex === cell && e.age === 1) {
          births.push({ t, y: e.y });
        }
      }
    }
    // §6: `interval` 130, `max` 3 — three chaser cells over a minute, then the cyst sleeps for
    // good (the sweep keeps running 169 ticks past the third birth: a fourth is never released).
    expect(births.map((b) => b.t)).toEqual([131, 261, 391]);
    // A floor hatch opens upward: every cell left the cyst's top (its hh 6), and enters along
    // that row (the child is the shipped chaser-cell).
    for (const b of births) expect(b.y).toBe(90 - 6);
  });

  it('rocket.homing on the shipped viral-dart: 30 away from the middle, 110 chasing, then straight', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('viral-dart') ?? -1;
    const high = w.enemies.spawn(index, w.camera.x + 420, w.camera.y + 60);
    const low = w.enemies.spawn(index, w.camera.x + 420, w.camera.y + PLAYFIELD_H - 60);
    expect(high).not.toBeNull();
    expect(low).not.toBeNull();
    if (high === null || low === null) return;
    run(w, 5);
    // §6: launchSpeed 1.5 away from the middle row — up-left above it, down-left below.
    expect(high.mover).toBe(MoverKind.Straight);
    expect(high.vx).toBeLessThan(0);
    expect(high.vy).toBeLessThan(0);
    expect(low.vy).toBeGreaterThan(0);
    expect(Math.hypot(high.vx, high.vy)).toBeCloseTo(v1speed(1), 6);
    // launchTicks 30: homing from tick 31, at 1.95 px/tick with the turn cap of 4 — faster than
    // the chaser's 1.575 but slower-turning, so the pursuing swarm reads as different bodies.
    run(w, 26);
    expect(high.mover).toBe(MoverKind.Homing);
    expect(Math.hypot(high.vx, high.vy)).toBeCloseTo(v1speed(1.3), 4);
    const early = high.vy;
    run(w, 60);
    expect(high.vy).toBeGreaterThan(early); // turning down towards the ship's row
    // homeTicks 110: the turn stops and the last heading holds to the end of the fly. The darts
    // never fire — their bodies are the danger (§4 rule 2, and the aimed cap: 1.95 ≤ 3.0).
    run(w, 50);
    const vx = high.vx;
    const vy = high.vy;
    run(w, 20);
    if (high.state === EnemyState.Live) {
      expect(high.vx).toBeCloseTo(vx, 9);
      expect(high.vy).toBeCloseTo(vy, 9);
    }
    expect(w.bullets.count).toBe(0);
  });

  it('captain.circler on the shipped nucleus-warden: the §7 ellipse, rings of eight every 100', () => {
    const w = fighting('nucleus-warden');
    const boss = w.bosses.boss;
    expect(boss.motion).toBe(BossMotion.Orbit);
    expect(boss.partCount).toBe(3);
    const shell = boss.parts[part(w, 'shell')];
    expect(shell.core).toBe(true);
    expect(shell.maxHp).toBe(48);
    // §7's orbit: centre (320, 168), radii 210 × 84 — the box x 110–530, y 84–252 at the surface
    // camera; the home (514, 168) sits inside it and the ellipse starts at its rightmost point.
    const start = boss.orbitAngle;
    const volleys: number[][] = [];
    let tick = 0;
    while (tick < 260) {
      run(w, 1);
      tick++;
      const u = (boss.screenX - 320) / 210;
      const v = (boss.screenY - 168) / 84;
      expect(u * u + v * v).toBeCloseTo(1, 4);
      const fresh = freshAngles(w, BulletKind.RoundPurple);
      if (fresh.length === 8) {
        volleys.push(fresh);
        run(w, 2); // the same volley reads as fresh for one more tick (age ≤ 1)
        tick += 2;
      }
    }
    // speed 2.25 binary units a tick (9/4 — exact through the whole accumulation, no wrap inside
    // the measured window).
    expect((boss.orbitAngle - start + ANGLE_UNITS) % ANGLE_UNITS).toBe((tick * 2.25) % ANGLE_UNITS);
    // fireTicks 100, ring 8: two volleys in the window, eight round-purples each 128 units apart,
    // the second turned half a gap (64) from the first — the script's own law (§7's dodge).
    expect(volleys).toHaveLength(2);
    const [first, second] = volleys;
    for (const angles of [first, second]) {
      for (let i = 0; i < angles.length; i++) {
        expect((angles[(i + 1) % 8] - angles[i] + ANGLE_UNITS) % ANGLE_UNITS).toBe(128);
      }
    }
    expect((second[0] - first[0] + ANGLE_UNITS) % ANGLE_UNITS).toBe(64);
    // One phase, no `until`: the warden never changes cadence (§7).
    expect(boss.phase).toBe(0);
  });
});
