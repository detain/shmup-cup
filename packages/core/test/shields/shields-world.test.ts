/**
 * The M2-04 meter shields inside a World: the `?` slot grants the config's `shieldChoice`, pods
 * stop the enemy bullets and bodies that touch them (and wear independently) but never what reaches
 * the ship past them, Reduce's hurtbox sizes against real bullets (two steps, back to normal once
 * it broke; the terrain box unchanged), the Free Shield's pairs at the player's last direction, the
 * shield batch (one sprite per standing pod), FULL BARRIER, the rank's Reduce term and
 * determinism.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BULLET_KINDS, BulletFlag, BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot, commitPlayerInput } from '../../src/input/index.js';
import { MeterSlot } from '../../src/powerups/index.js';
import {
  POD_ORBIT,
  POD_RADIUS,
  SHIELD_POD_HITS,
  ShieldKind,
  placeShieldPods,
} from '../../src/shields/index.js';
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

/**
 * Test content: the KESTREL, Type A and a scriptless target enemy.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            {
              id: 'target',
              hp: 1000,
              score: 100,
              hurtbox: { hw: 4, hh: 4 },
              script: 'test.idle',
              sprite: 'enemies/drifter',
              drop: null,
            },
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB. */
const DB = db();

/**
 * A free-flight world whose player 1 is alive at view (120, 100), with the `?` shield of the
 * config granted through the meter.
 *
 * @param config - Config overrides (`shieldChoice` …).
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({ seed: 5, autofire: false, remoteMode: false, ...config }),
    DB,
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + 120;
  w.players[0].y = w.camera.y + 100;
  w.events.clear();
  return w;
}

/**
 * Equips `?` (the meter cursor on the shield slot, then one PowerUp press) and steps once so the
 * pods are placed.
 *
 * @param w - The world.
 */
function equipShield(w: World): void {
  w.powerups.meters[0].cursor = MeterSlot.Shield;
  expect(w.powerups.equipHighlighted(0)).toBe(true);
  stepWorld(w, createInputSnapshot());
}

/**
 * Places a still bullet at a position.
 *
 * @param w - The world.
 * @param x - World x.
 * @param y - World y.
 * @returns Its slot.
 */
function bullet(w: World, x: number, y: number): number {
  const i = spawnBullet(w, x, y, 0, 0, BulletKind.RoundPink);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

/** Radius of the round pink bullet. */
const BULLET_R = BULLET_KINDS[BulletKind.RoundPink].radius;

describe('M2-04 shields in the World: pods', () => {
  it('the `?` slot grants the config`s choice: front pods at the nose', () => {
    const w = world({ shieldChoice: 'shield' });
    equipShield(w);
    const s = w.players[0].shield;
    expect([s.kind, s.podCount, s.hits]).toEqual([ShieldKind.Shield, 2, 2 * SHIELD_POD_HITS]);
    expect(s.podX[0]).toBeGreaterThan(w.players[0].x + 10);
    // The shield batch draws one sprite per standing pod.
    const batch = w.powerups.shieldBatch;
    expect(batch.count).toBe(2);
    expect(w.content.sprites.names[batch.spriteId[0]]).toBe('shields/pod');
    expect(batch.x[0]).toBeCloseTo(s.podX[0], 9);
  });

  it('a bullet touching a pod is used up and wears only that pod; one past it kills the ship', () => {
    const w = world({ shieldChoice: 'shield' });
    equipShield(w);
    const ship = w.players[0];
    const s = ship.shield;
    const hit = bullet(w, s.podX[0] + POD_RADIUS, s.podY[0]);
    w.bullets.collidePlayers();
    expect(w.bullets.pool.fields.flags[hit] & BulletFlag.Dead).toBe(BulletFlag.Dead);
    expect([s.podHits[0], s.podHits[1], ship.hitTick]).toEqual([SHIELD_POD_HITS - 1, 14, -1]);
    // Behind the ship there is no pod: the bullet reaches it.
    bullet(w, ship.x - 1, ship.y);
    w.bullets.collidePlayers();
    expect(ship.hitTick).toBe(w.tick);
    expect(s.hits).toBe(2 * SHIELD_POD_HITS - 1);
  });

  it('an enemy body touching a pod wears it; the enemy flies on', () => {
    const w = world({ shieldChoice: 'rotateShield' });
    equipShield(w);
    const ship = w.players[0];
    const s = ship.shield;
    // Sit a target where pod 0 will be after the next placement (outside the ship's reach).
    stepWorld(w, createInputSnapshot());
    placeShieldPods(s, ship);
    const e = w.enemies.spawn(w.content.enemyIndex.get('target')!, s.podX[0], s.podY[0]);
    expect(e).not.toBeNull();
    w.grid.begin(Math.floor(w.camera.x) - 64, Math.floor(w.camera.y) - 64);
    w.enemies.insertColliders(w.grid);
    w.grid.build();
    w.enemies.collidePlayers(w.grid);
    expect(s.podHits[0]).toBe(SHIELD_POD_HITS - 1);
    expect(s.podHits[1]).toBe(SHIELD_POD_HITS);
    expect(ship.hitTick).toBe(-1);
    expect(e!.hp).toBe(1000);
  });

  it('attaches Free Shield pairs where the player last flew, up to two pairs', () => {
    const w = world({ shieldChoice: 'freeShield' });
    w.weapons.freeWayHeading[0] = 512; // last flew left: the pair goes behind
    equipShield(w);
    const ship = w.players[0];
    const s = ship.shield;
    expect(s.podCount).toBe(2);
    expect(s.podX[0]).toBeLessThan(ship.x - POD_ORBIT + 2);
    // `?` stays equippable while a pair fits.
    expect(w.powerups.canEquip(0, MeterSlot.Shield)).toBe(true);
    w.weapons.freeWayHeading[0] = 0;
    equipShield(w);
    expect([s.podCount, s.hits]).toEqual([4, 4 * SHIELD_POD_HITS]);
    expect(w.powerups.canEquip(0, MeterSlot.Shield)).toBe(false);
    expect(w.powerups.shieldBatch.count).toBe(4);
  });

  it('FULL BARRIER refills a worn pod shield and is greyed at full strength', () => {
    const w = world({ shieldChoice: 'shield', megaChoice: 'fullBarrier' });
    equipShield(w);
    const s = w.players[0].shield;
    expect(w.powerups.canEquip(0, MeterSlot.Mega)).toBe(false);
    s.podHits[1] = 3;
    s.hits = 17;
    expect(w.powerups.canEquip(0, MeterSlot.Mega)).toBe(true);
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    w.powerups.equipHighlighted(0);
    expect([s.podHits[0], s.podHits[1], s.hits]).toEqual([14, 14, 28]);
  });
});

describe('M2-04 shields in the World: Reduce', () => {
  it('shrinks the hurtbox in two steps against real bullets', () => {
    const w = world({ shieldChoice: 'reduce' });
    const ship = w.players[0];
    const hurt = w.ship.hurtRadius;
    // A bullet 1.2 px beyond touching the centre: inside the bare ship's 1.5-px hurt circle.
    const gap = BULLET_R + 0.8 * hurt;
    equipShield(w);
    expect(ship.shield.hurtScale).toBe(1 / 3);
    bullet(w, ship.x + gap, ship.y);
    w.bullets.collidePlayers();
    expect([ship.shield.hits, ship.hitTick]).toEqual([2, -1]); // missed the small ship
    w.bullets.clear();
    w.pools.clearAll();
    // A bullet grazing the small hurt circle is absorbed: the ship grows one step.
    bullet(w, ship.x + BULLET_R + 0.3 * hurt, ship.y);
    w.bullets.collidePlayers();
    expect([ship.shield.hits, ship.shield.hurtScale, ship.hitTick]).toEqual([1, 2 / 3, -1]);
    w.pools.clearAll();
    // Still smaller than the bare ship: the first bullet's distance misses it too.
    for (let i = 0; i < 12; i++) stepWorld(w, createInputSnapshot()); // i-frames over
    bullet(w, ship.x + gap, ship.y);
    w.bullets.collidePlayers();
    expect([ship.shield.hits, ship.hitTick]).toEqual([1, -1]);
  });

  it('once broken the full hurtbox is back, and the terrain box never changed', () => {
    const w = world({ shieldChoice: 'reduce' });
    const ship = w.players[0];
    equipShield(w);
    const box = w.ship.terrainBox;
    ship.shield.hits = 1;
    ship.shield.hurtScale = 2 / 3;
    bullet(w, ship.x + BULLET_R, ship.y);
    w.bullets.collidePlayers();
    expect([ship.shield.kind, ship.shield.hurtScale]).toEqual([ShieldKind.None, 1]);
    expect(w.ship.terrainBox).toBe(box);
    expect(box).toEqual({ hw: 5, hh: 3 });
  });

  it('counts +2 towards the rank instead of a shield`s +4', () => {
    const reduced = world({ shieldChoice: 'reduce', rankGrowth: 1 });
    const shielded = world({ shieldChoice: 'forceField', rankGrowth: 1 });
    equipShield(reduced);
    equipShield(shielded);
    expect(reduced.rankInputs.power).toBe(2);
    expect(shielded.rankInputs.power).toBe(4);
  });
});

describe('M2-04 shields in the World: determinism', () => {
  it('two worlds with pods under the same input hash equal', () => {
    const hashes: number[] = [];
    for (let run = 0; run < 2; run++) {
      const w = world({ shieldChoice: 'rotateShield', optionChoice: 'rotate', loadout: 'full' });
      const input = createInputSnapshot();
      for (let t = 0; t < 200; t++) {
        commitPlayerInput(input.players[0], t % 40 < 20 ? 1 : 2);
        if (t % 17 === 0) bullet(w, w.players[0].x + 16, w.players[0].y + (t % 5) - 2);
        stepWorld(w, input);
      }
      hashes.push(hashWorld(w));
    }
    expect(hashes[0]).toBe(hashes[1]);
  });
});
