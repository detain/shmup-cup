/**
 * The behaviours of plan M2-12 on the shipped zone D and E rosters
 * (`content/enemies/zone-d.enemies.json`, `zone-e.enemies.json`), in free flight (a static camera)
 * with the ship holding its fire: `rear.swoop` (a squall jumper: in from behind along its row,
 * overtaking, a shot back from its turn point, then away to the left), `boss.bastion` (CINDER
 * BASTION: its shield arms turning round the core on their pivot, reversing, the armour clinking,
 * lane lasers from the emitters in turn, spreads from the core in its later phases) and
 * `boss.steed` (SQUALL STEED: bobbing on its ellipse, the chest opening and shutting with its lids,
 * homing minis launched from the chest only while it is open, spreads from the snout).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_IDS,
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
} from '../../src/behaviors/index.js';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
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

/** The KESTREL, Type A, the zone D and E rosters and the patterns they run. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-d.enemies.json'),
      shipped('enemies/zone-e.enemies.json'),
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
 * The distance between two boss parts' centres.
 *
 * @param w - The world.
 * @param a - One part index.
 * @param b - The other.
 * @returns Pixels.
 */
function apart(w: World, a: number, b: number): number {
  const parts = w.bosses.boss.parts;
  return Math.hypot(parts[a].x - parts[b].x, parts[a].y - parts[b].y);
}

describe('core/behaviors — zones D and E (M2-12)', () => {
  it('registers the rear attacker and the two zone bosses', () => {
    expect(BEHAVIOR_IDS).toContain('rear.swoop');
    expect(BOSS_BEHAVIOR_IDS).toEqual(expect.arrayContaining(['boss.bastion', 'boss.steed']));
    expect(DEFAULT_BEHAVIORS.get('rear.swoop')?.params).toMatchObject({ speed: 1.6, turnX: 280 });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.bastion')?.params).toMatchObject({
      spin: 4,
      reverseTicks: 0,
      ways: 0,
      ring: 0,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.steed')?.params).toMatchObject({
      minis: 2,
      ring: 0,
      gape: 0,
    });
  });

  it('rear.swoop: in from behind along its row, a shot back from the turn point, then away left', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('squall-jumper') ?? -1;
    const jumper = w.enemies.spawn(index, w.camera.x - 24, w.camera.y + 60);
    expect(jumper).not.toBeNull();
    if (jumper === null) return;
    run(w, 5);
    // Overtaking: flying right at its speed along its row, drawn facing right.
    expect(jumper.mover).toBe(MoverKind.Waypoint);
    expect(jumper.vx).toBeCloseTo(1.6, 9);
    expect(jumper.vy).toBe(0);
    expect(jumper.flags & EnemyFlag.FaceRight).not.toBe(0);
    expect(w.bullets.count).toBe(0);
    // (290 + 24) / 1.6 → 197 ticks to the turn point, then half of its 20-tick hold: one needle.
    run(w, 200);
    expect(jumper.x - w.camera.x).toBeCloseTo(290, 6);
    expect(jumper.y - w.camera.y).toBeCloseTo(60, 6);
    expect(w.bullets.count).toBe(0);
    run(w, 12);
    expect(w.bullets.count).toBe(1);
    // It turned to the ship (behind it) and leaves to the left along its row.
    expect(jumper.flags & EnemyFlag.FaceRight).toBe(0);
    run(w, 20);
    expect(jumper.vx).toBeCloseTo(-1.3, 9);
    expect(jumper.vy).toBe(0);
    expect(w.bullets.count).toBeLessThanOrEqual(1);
  });

  it('boss.bastion: the shield arms turn round the core on their pivot, armoured, reversing later', () => {
    const w = fighting('cinder-bastion');
    const boss = w.bosses.boss;
    const core = part(w, 'core');
    const hub = part(w, 'hub');
    const inner = part(w, 'arm-a-inner');
    const outer = part(w, 'arm-b-outer');
    // Phase 0: the pivot turns 4 units a tick; the arms keep their radius round the core.
    expect(boss.parts[hub].spin).toBe(4);
    const a0 = boss.parts[hub].worldAngle;
    run(w, 10);
    expect((boss.parts[hub].worldAngle - a0 + 1024) % 1024).toBe(40);
    for (let t = 0; t < 8; t++) {
      run(w, 16);
      expect(apart(w, core, inner)).toBeCloseTo(19, 3);
      expect(apart(w, core, outer)).toBeCloseTo(28, 3);
    }
    // The arms clink, the core takes the hits.
    expect(w.bosses.damagePart(inner, 1, 0)).toBe(BossHit.Clink);
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Damaged);
    // Below 54 of 80 hit points: phase 1 turns the other way (−6) and reverses every 240 ticks.
    expect(w.bosses.damagePart(core, 26, 0)).toBe(BossHit.Damaged);
    run(w, 2);
    expect(boss.phase).toBe(1);
    expect(boss.parts[hub].spin).toBe(-6);
    run(w, 240);
    expect(boss.parts[hub].spin).toBe(6);
  });

  it('boss.bastion: lane lasers from the emitters in turn, spreads from the core from phase 1', () => {
    const w = fighting('cinder-bastion');
    const boss = w.bosses.boss;
    const top = part(w, 'emitter-top');
    const bottom = part(w, 'emitter-bottom');
    // Phase 0: no bullets, the first lane after 60 ticks from the top emitter, attached.
    run(w, 58);
    expect(w.bullets.count).toBe(0);
    expect(w.bullets.lasers.count).toBe(0);
    run(w, 4);
    expect(w.bullets.lasers.count).toBe(1);
    const lasers = w.bullets.lasers.fields;
    const laneY = (): number => lasers.y[0] - boss.y;
    expect(laneY()).toBeCloseTo(boss.parts[top].y - boss.y, 0);
    // The next one (120 ticks on, rank-scaled) from the bottom emitter.
    run(w, 130);
    let bottomLane = false;
    for (let i = 0; i < w.bullets.lasers.count; i++) {
      if (Math.abs(lasers.y[i] - boss.parts[bottom].y) < 2) bottomLane = true;
    }
    expect(bottomLane).toBe(true);
    expect(w.bullets.count).toBe(0);
    // Phase 1: aimed 3-way spreads of ovals from the core.
    w.bosses.damagePart(part(w, 'core'), 27, 0);
    run(w, 120);
    expect(boss.phase).toBe(1);
    expect(w.bullets.count).toBeGreaterThanOrEqual(3);
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
    // Phase 0 bobs 14 px round row 100 (2 units a tick: a quarter turn in 128 ticks).
    expect(low).toBeGreaterThanOrEqual(100 - 14 - 1e-6);
    expect(high).toBeLessThanOrEqual(100 + 14 + 1e-6);
    expect(high - low).toBeGreaterThan(10);
    // Open after its 130 shut ticks: the lids 3 px apart, the chest takes hits, a mini comes out.
    expect(opened).toBeGreaterThan(120);
    expect(opened).toBeLessThanOrEqual(131);
    expect(boss.parts[chest].open).toBe(true);
    expect(boss.parts[lid].localY).toBe(lidY - 3);
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
