/**
 * The behaviours of plan M2-13 on the shipped zone F roster (`content/enemies/zone-f.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `cell.chase` (a chasing cell: in
 * along its row, then after the nearest ship with a capped turn, then straight on; the halves of a
 * dividing cell flying out first) and `boss.squid` (MANTLE REGENT: its tentacles curling in front of
 * the eye and uncurling in a cycle, the armour clinking while they guard, a broken tentacle ending
 * the first phase).
 */
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit, type BossPart } from '../../src/bosses/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { part, run, zoneKit } from '../helpers/zone-behaviors.js';
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
    // is covered by armour in front of it.
    run(w, 120 + 32);
    expect(Math.abs(tip.y - eye.y)).toBeLessThan(6);
    for (const y of rows())
      expect(guarded(parts, eye.x - eye.hw, y), `row ${String(y)}`).toBe(true);
    expect(w.bosses.damagePart(part(w, 'seg-top-3'), 1, 0)).toBe(BossHit.Clink);
    // The guard holds 70 ticks, then they uncurl (30 ticks) and the tip is back where it was.
    run(w, 68);
    expect(Math.abs(tip.y - eye.y)).toBeLessThan(6);
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
    for (const name of ['seg-top-1', 'seg-top-2', 'seg-top-3', 'tip-top']) {
      expect(parts[part(w, name)].destroyed, name).toBe(true);
    }
    run(w, 1);
    expect(boss.phase).toBe(1);
    // The other tentacle carries on from where it was (it uncurls: at most one step a tick).
    run(w, 1);
    const moved = Math.hypot(tip.x - boss.x - before.x, tip.y - boss.y - before.y);
    expect(moved).toBeLessThan(4);
  });
});
