/**
 * The behaviours of plan M2-11 on the shipped zone B and C rosters
 * (`content/enemies/zone-b.enemies.json`, `zone-c.enemies.json`), in free flight (a static camera)
 * with the ship holding its fire: `rocket.homing` (launched away from the middle row, homing, then
 * straight on), `worm.burst` (a sand worm: the leader waits in the sand, bursts out on an arc, the
 * segments follow its track), `boss.maw` (GALVANIC MAW: the mouth opening and shutting with its
 * jaws, cutters only while open, rockets from the pods) and `boss.widow` (SANDGRAVE WIDOW:
 * scuttling inside its box, spider drones from the spinnerets, silk lines once its fangs are gone).
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
import { PLAYFIELD_H, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { DropKind, EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
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

/** The KESTREL, Type A, the zone B and C rosters and the patterns they run. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-b.enemies.json'),
      shipped('enemies/zone-c.enemies.json'),
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

describe('core/behaviors — zones B and C (M2-11)', () => {
  it('registers the rockets, the worms and the two zone bosses', () => {
    expect(BEHAVIOR_IDS).toEqual(expect.arrayContaining(['rocket.homing', 'worm.burst']));
    expect(BOSS_BEHAVIOR_IDS).toEqual(expect.arrayContaining(['boss.maw', 'boss.widow']));
    expect(DEFAULT_BEHAVIORS.get('rocket.homing')?.params).toMatchObject({ speed: 1.25 });
    expect(DEFAULT_BEHAVIORS.get('worm.burst')?.params).toMatchObject({ trigger: 128 });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.maw')?.params).toMatchObject({ gape: 0, ring: 0 });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.widow')?.params).toMatchObject({ laserTicks: 0 });
  });

  it('rocket.homing: launches away from the middle row, homes on the ship, then flies straight', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('maw-rocket') ?? -1;
    const high = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + 40);
    const low = w.enemies.spawn(index, w.camera.x + 300, w.camera.y + PLAYFIELD_H - 40);
    expect(high).not.toBeNull();
    expect(low).not.toBeNull();
    if (high === null || low === null) return;
    run(w, 5);
    // Up-left above the middle row, down-left below it, at the launch speed.
    expect(high.mover).toBe(MoverKind.Straight);
    expect(high.vx).toBeLessThan(0);
    expect(high.vy).toBeLessThan(0);
    expect(low.vy).toBeGreaterThan(0);
    expect(Math.hypot(high.vx, high.vy)).toBeCloseTo(1, 6);
    // Homing (from tick 20, 5 units a tick): it turns towards the ship, below-left of it.
    run(w, 20);
    expect(high.mover).toBe(MoverKind.Homing);
    expect(Math.hypot(high.vx, high.vy)).toBeCloseTo(1.25, 4);
    const early = high.vy;
    run(w, 45);
    expect(high.vy).toBeGreaterThan(early);
    expect(high.vy).toBeGreaterThan(0);
    // After its 60 homing ticks it keeps its heading.
    run(w, 15);
    const vx = high.vx;
    const vy = high.vy;
    run(w, 20);
    if (high.state === EnemyState.Live) {
      expect(high.vx).toBeCloseTo(vx, 9);
      expect(high.vy).toBeCloseTo(vy, 9);
    }
  });

  it('worm.burst: the leader waits in the sand, bursts out, the segments follow its arc', () => {
    const w = freeFlight();
    const index = DB.enemyIndex.get('dune-worm') ?? -1;
    // Far to the right (400 px from the ship: beyond the 190-px trigger) — it waits there.
    const slot = w.enemies.startFormation(index, 4, 7, 380, 150, -1, DropKind.Capsule, 0);
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

  it('boss.maw: the mouth opens and shuts with its jaws, cutters only while open, rockets from the pods', () => {
    const w = fighting('galvanic-maw');
    const boss = w.bosses.boss;
    const maw = part(w, 'maw');
    const jaw = part(w, 'jaw-top');
    const jawY = boss.parts[jaw].localY;
    // Shut: shots clink off the mouth, nothing is fired from it.
    expect(boss.parts[maw].open).toBe(false);
    expect(w.bosses.damagePart(maw, 1, 0)).toBe(BossHit.Clink);
    run(w, 100);
    expect(w.bullets.count).toBe(0);
    // Phase 0: shut for 150 ticks, then open with the jaws 4 px apart — and the cutters come.
    run(w, 60);
    expect(boss.parts[maw].open).toBe(true);
    expect(boss.parts[jaw].localY).toBe(jawY - 4);
    expect(w.bosses.damagePart(maw, 1, 0)).toBe(BossHit.Damaged);
    run(w, 20);
    expect(w.bullets.count).toBeGreaterThanOrEqual(3);
    // A rocket from a pod by now (every 170 ticks, rank-scaled).
    expect(live(w, 'maw-rocket').length).toBeGreaterThanOrEqual(1);
    // Shut again after 90 ticks open: the jaws back where they were.
    run(w, 90);
    expect(boss.parts[maw].open).toBe(false);
    expect(boss.parts[jaw].localY).toBe(jawY);
  });

  it('boss.maw: a phase change while the mouth is open shuts the jaws first — they never drift', () => {
    const w = fighting('galvanic-maw');
    const boss = w.bosses.boss;
    const maw = part(w, 'maw');
    const jaw = part(w, 'jaw-bottom');
    const jawY = boss.parts[jaw].localY;
    run(w, 170);
    expect(boss.parts[maw].open).toBe(true);
    // Below 40 hit points: phase 1 starts while the mouth is open.
    expect(w.bosses.damagePart(maw, 30, 0)).toBe(BossHit.Damaged);
    run(w, 3);
    expect(boss.phase).toBe(1);
    expect(boss.parts[jaw].localY).toBe(jawY);
    expect(boss.parts[maw].open).toBe(false);
    // Phase 1 opens it again later (130 shut): 4 px apart, not 8.
    run(w, 135);
    expect(boss.parts[maw].open).toBe(true);
    expect(boss.parts[jaw].localY).toBe(jawY + 4);
  });

  it('boss.widow: scuttles inside its box, launches spider drones, spins silk lines without its fangs', () => {
    const w = fighting('sandgrave-widow');
    const boss = w.bosses.boss;
    for (let t = 0; t < 400; t++) {
      run(w, 1);
      expect(boss.screenX).toBeGreaterThanOrEqual(270 - 1e-9);
      expect(boss.screenX).toBeLessThanOrEqual(316 + 1e-9);
      expect(boss.screenY).toBeGreaterThanOrEqual(56 - 1e-9);
      expect(boss.screenY).toBeLessThanOrEqual(144 + 1e-9);
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
