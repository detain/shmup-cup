/**
 * The behaviours of plan M2-13 on the shipped zone F and G rosters
 * (`content/enemies/zone-f.enemies.json`, `zone-g.enemies.json`), in free flight (a static camera)
 * with the ship holding its fire: `cell.chase` (a chasing cell: in along its row, then after the
 * nearest ship with a capped turn, then straight on; the halves of a dividing cell flying out
 * first), `boss.squid` (MANTLE REGENT: its tentacles curling in front of the eye and uncurling in
 * a cycle, the armour clinking while they guard, a broken tentacle ending the first phase) and
 * `boss.facet` (FACET MONARCH: the core behind its crystals, the arms waving like claws, needles
 * from the tips, rings and one lane at a time from the core in the last phase).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit, BossState, type BossPart } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/** The KESTREL, Type A, the zone F and G rosters and the patterns they run. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-f.enemies.json'),
      shipped('enemies/zone-g.enemies.json'),
      shipped('patterns/zones.patterns.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A free-flight world (static camera), the ship holding fire and invulnerable.
 *
 * @returns The world.
 */
function freeFlight(): World {
  const w = createWorld(resolveGameConfig({ seed: 7, autofire: false, remoteMode: false }), DB);
  w.debugFlags.godMode = true;
  return w;
}

/**
 * Steps a world.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * The live enemies of an id.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns Them, in slot order.
 */
function live(w: World, id: string): Enemy[] {
  const index = DB.enemyIndex.get(id);
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
}

/**
 * A world with a boss started and fighting.
 *
 * @param id - The boss's enemy id.
 * @returns The world.
 */
function fighting(id: string): World {
  const w = freeFlight();
  expect(w.bosses.startBoss(DB.enemyIndex.get(id) ?? -1)).toBe(true);
  for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  return w;
}

/**
 * A boss part's index by name.
 *
 * @param w - The world.
 * @param name - Part name.
 * @returns Its index.
 */
function part(w: World, name: string): number {
  const boss = w.bosses.boss;
  const index = boss.parts.findIndex((p, i) => i < boss.partCount && p.name === name);
  expect(index, name).toBeGreaterThanOrEqual(0);
  return index;
}

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

describe('core/behaviors — zones F and G (M2-13)', () => {
  it('registers the chasing cell and the two zone bosses', () => {
    expect(BEHAVIOR_IDS).toContain('cell.chase');
    expect(BOSS_BEHAVIOR_IDS).toEqual(expect.arrayContaining(['boss.squid', 'boss.facet']));
    expect(DEFAULT_BEHAVIORS.get('cell.chase')?.params).toEqual({
      speed: 1.1,
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
    expect(cell.vx).toBeCloseTo(-1.05, 9);
    expect(cell.vy).toBe(0);
    // The shipped cell drifts in for 46 ticks, then homes (the ship is below it).
    run(w, 42);
    expect(cell.mover).toBe(MoverKind.Homing);
    const speed = Math.hypot(cell.vx, cell.vy);
    expect(speed).toBeCloseTo(1.05, 4);
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

  it('boss.facet: the core clinks behind its crystals; the arms wave like claws; needles from the tips', () => {
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
    expect(high).toBeGreaterThan(-12);
    expect(low).toBeLessThan(-44);
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
    w.bosses.damagePart(part(w, 'core'), 40, 0);
    run(w, 2);
    expect(boss.phase).toBe(2);
    let most = 0;
    let lanes = 0;
    let rings = false;
    for (let t = 0; t < 700; t++) {
      const bullets = w.bullets.count;
      const before = w.bullets.lasers.count;
      run(w, 1);
      most = Math.max(most, w.bullets.lasers.count);
      if (w.bullets.lasers.count > before) lanes++;
      if (w.bullets.count >= bullets + 10) rings = true;
    }
    expect(lanes).toBeGreaterThanOrEqual(2);
    expect(most).toBe(1);
    expect(rings).toBe(true);
  });
});
