/**
 * The boss behaviours of plan M2-09 on the shipped advanced bosses
 * (`content/enemies/advanced-bosses.enemies.json`), in free flight with the ship holding its fire:
 * the four captain archetypes of shmup_feat.md §13 — `captain.ram` (fans of waves, then a ram
 * along the player's row and back), `captain.launcher` (tracking, its splitting minions launched
 * from the guns in turn, spreads), `captain.circler` (an ellipse round the playfield's middle,
 * rings a half gap apart), `captain.crab` (sidesteps inside its box, turning rings) — and the
 * raid turrets of `boss.raid` (turned to the player, heading frames, fire only from the screen).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOSS_BEHAVIOR_IDS, DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { BossMotion, BossState, turnedFrame } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { PLAYFIELD_W } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { atan2B } from '../../src/math/index.js';
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

/** The KESTREL, Type A, the advanced bosses and their minion (the gimmick range's bubble). */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/advanced-bosses.enemies.json'),
      shipped('enemies/gimmick-range.enemies.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A free-flight world (static camera) with a boss started and fighting, the ship holding fire.
 *
 * @param id - The boss's enemy id.
 * @returns The world.
 */
function fighting(id: string): World {
  const w = createWorld(resolveGameConfig({ seed: 5, autofire: false, remoteMode: false }), DB);
  w.debugFlags.godMode = true;
  expect(w.bosses.startBoss(DB.enemyIndex.get(id) ?? -1)).toBe(true);
  const boss = w.bosses.boss;
  for (let i = 0; i < 400 && boss.state !== BossState.Fight; i++) run(w, 1);
  expect(boss.state).toBe(BossState.Fight);
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
 * Live enemies of an id.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns How many.
 */
function live(w: World, id: string): number {
  const index = DB.enemyIndex.get(id);
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index)
    .length;
}

describe('core/behaviors — captains and raid turrets (M2-09)', () => {
  it('registers them next to the M1 boss roster', () => {
    for (const id of ['captain.ram', 'captain.launcher', 'captain.circler', 'captain.crab']) {
      expect(BOSS_BEHAVIOR_IDS).toContain(id);
    }
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.raid')?.params).toMatchObject({ fireTicks: 50 });
  });

  it('captain.ram: waves of fans, then a ram along the player’s row and back home', () => {
    const w = fighting('captain-ram');
    const boss = w.bosses.boss;
    const ship = w.players[0];
    // Three 5-way fans, 36 ticks apart.
    run(w, 36);
    expect(w.bullets.count).toBe(5);
    run(w, 72);
    expect(w.bullets.count).toBeGreaterThanOrEqual(10);
    // Then the ram: toward view x 40 at the ship's row.
    const row = Math.floor(ship.y - w.camera.y);
    expect(boss.motion).toBe(BossMotion.MoveTo);
    expect([boss.moveToX, boss.moveToY]).toEqual([40, row]);
    run(w, 45);
    expect(boss.screenX).toBeCloseTo(40, 9);
    run(w, 10);
    // Home again after the way back.
    expect([boss.moveToX, boss.moveToY]).toEqual([boss.homeX, boss.homeY]);
    run(w, 70);
    expect(boss.screenX).toBeCloseTo(boss.homeX, 9);
    expect(boss.screenY).toBeCloseTo(boss.homeY, 9);
  });

  it('captain.launcher: tracks the player and launches its minion from the guns in turn', () => {
    const w = fighting('captain-launcher');
    const boss = w.bosses.boss;
    expect(boss.motion).toBe(BossMotion.Track);
    expect(live(w, 'bubble')).toBe(0);
    run(w, 100);
    // Two guns: one minion each.
    expect(live(w, 'bubble')).toBe(2);
    run(w, 100);
    expect(live(w, 'bubble')).toBeGreaterThanOrEqual(3);
    // Spreads too.
    expect(w.bullets.count).toBeGreaterThan(0);
    // No gun left: the shell launches.
    boss.parts[1].destroyed = true;
    boss.parts[2].destroyed = true;
    const before = live(w, 'bubble');
    run(w, 100);
    expect(live(w, 'bubble')).toBe(before + 1);
  });

  it('captain.circler: circles the ellipse round the playfield’s middle, rings each half a gap on', () => {
    const w = fighting('captain-circler');
    const boss = w.bosses.boss;
    expect(boss.motion).toBe(BossMotion.Orbit);
    for (let i = 0; i < 120; i++) {
      run(w, 1);
      const u = (boss.screenX - 192) / 140;
      const v = (boss.screenY - 100) / 64;
      expect(u * u + v * v).toBeCloseTo(1, 4);
    }
    // 3 units a tick: a third of a turn in 120 ticks → past the middle's bottom.
    expect(boss.screenX).toBeLessThan(192);
    // Its orbs spin round the hub (spin 6), so they are turned too.
    expect(boss.parts[1].worldAngle).not.toBe(0);
    // Rings of 8 (two so far; those leaving the view are culled).
    expect(w.bullets.count).toBeGreaterThanOrEqual(8);
  });

  it('captain.crab: sidesteps inside its box and fires turning rings', () => {
    const w = fighting('captain-crab');
    const boss = w.bosses.boss;
    let seen = 0;
    for (let i = 0; i < 600; i++) {
      run(w, 1);
      if (boss.motion === BossMotion.MoveTo) {
        expect(boss.moveToX).toBeGreaterThanOrEqual(250);
        expect(boss.moveToX).toBeLessThanOrEqual(340);
        expect(boss.moveToY).toBeGreaterThanOrEqual(40);
        expect(boss.moveToY).toBeLessThanOrEqual(160);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(w.bullets.count).toBeGreaterThanOrEqual(12);
  });

  it('boss.raid: turns the turrets on screen to the player and fires along their heading', () => {
    const w = fighting('raid-leviathan');
    const boss = w.bosses.boss;
    expect(boss.anchored).toBe(true);
    // Before the first volley every turret points the way the data turned it.
    const turret = boss.parts[5];
    expect(turret.worldAngle).toBe(768);
    expect(turret.frame).toBe(12);
    // The first volley (70 ticks); the turned turrets' world angles and frames follow next tick.
    run(w, 71);
    const ship = w.players[0];
    let aimed = 0;
    for (let i = 0; i < boss.partCount; i++) {
      const part = boss.parts[i];
      if (!part.gun) continue;
      if (!part.inView) {
        // Off screen: never turned, never fired.
        expect(part.worldAngle === 768 || part.worldAngle === 256).toBe(true);
        continue;
      }
      aimed++;
      // The heading of an aimed shot: 32 directions on Normal — within half a step.
      const want = atan2B(ship.y - part.y, ship.x - part.x);
      const got = Math.floor(part.worldAngle) & 1023;
      expect(Math.abs(((want - got + 512) & 1023) - 512)).toBeLessThanOrEqual(17);
      expect(got % 32).toBe(0);
      expect(part.frame).toBe(turnedFrame(part.worldAngle, 16));
      const x = part.x - w.camera.x;
      expect(x >= -8 && x <= PLAYFIELD_W + 8).toBe(true);
    }
    expect(aimed).toBeGreaterThan(0);
    // One bullet per turret that may fire (on screen).
    expect(w.bullets.count).toBe(aimed);
  });
});
