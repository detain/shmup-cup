/**
 * The M2-04 meter shields inside a World — edge cases beyond `shields-world.test.ts`:
 *
 * - a `'full'` starting loadout grants every `?` choice (a Free Shield: one pair);
 * - pods: two bullets on one pod in a tick (one hit, the second swallowed by its i-frames, both
 *   used up), a broken pod lets bullets through, pods never stop straight or bending lasers,
 *   Option Hunters and ghosts never wear them by contact, the pods sit where the ship is after
 *   this tick's move;
 * - Reduce's smaller hurt circle against straight lasers, bending lasers and enemy bodies (the
 *   same gaps hit the bare ship);
 * - the shield batch: Reduce's shimmer in its two frames, a pod blinking through its own
 *   i-frames, a broken pod not drawn, each pod in its own wear frame;
 * - presentation: a pod hit pushes `SFX ShieldHit`, a pod break `SFX ShieldBreak` + `FX
 *   ShieldBreak` (also when other pods still stand);
 * - death takes the pods; the rank's Reduce term goes once it broke;
 * - the Free Shield: pairs at the last direction flown (real input), ahead before any; `?` on four
 *   worn pods replaces the most worn pair in a World.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BULLET_KINDS,
  BulletFlag,
  BulletKind,
  LaserPhase,
  fireBendingLaser,
  fireLaser,
  spawnBullet,
} from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag } from '../../src/enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MeterSlot } from '../../src/powerups/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import {
  POD_RADIUS,
  REDUCE_SPRITE,
  SHIELD_HIT_IFRAMES,
  SHIELD_POD_HITS,
  SHIELD_POD_SPRITE,
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
 * Test content: the KESTREL, Type A, a scriptless target and a scriptless Option Hunter.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const base = {
    hp: 1000,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
  };
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
            { id: 'target', ...base },
            { id: 'hunter', ...base, optionHunter: true },
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
 * A free-flight world whose player 1 is alive at view (120, 100) (autofire off).
 *
 * @param config - Config overrides.
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
  w.players[0].invulnTicks = 0;
  stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Equips `?` through the meter and steps once (the pods get placed).
 *
 * @param w - The world.
 */
function equipShield(w: World): void {
  w.powerups.meters[0].cursor = MeterSlot.Shield;
  expect(w.powerups.equipHighlighted(0)).toBe(true);
  stepWorld(w, createInputSnapshot());
  w.events.clear();
}

/**
 * Places a still bullet.
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

/**
 * Runs the enemy contact test of phase 6 on its own (grid rebuilt from the live enemies).
 *
 * @param w - The world.
 */
function contact(w: World): void {
  w.grid.begin(Math.floor(w.camera.x) - 64, Math.floor(w.camera.y) - 64);
  w.enemies.insertColliders(w.grid);
  w.grid.build();
  w.enemies.collidePlayers(w.grid);
}

/**
 * Steps once and returns the tick's events.
 *
 * @param w - The world.
 * @returns The events.
 */
function tick(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  stepWorld(w, createInputSnapshot());
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/** Radius of the round pink bullet. */
const BULLET_R = BULLET_KINDS[BulletKind.RoundPink].radius;

describe('M2-04 shields in a World (edge): starting loadout', () => {
  it.each([
    ['forceField', ShieldKind.ForceField, 0, 5],
    ['shield', ShieldKind.Shield, 2, 28],
    ['freeShield', ShieldKind.FreeShield, 2, 28],
    ['rotateShield', ShieldKind.RotateShield, 2, 28],
    ['reduce', ShieldKind.Reduce, 0, 2],
  ] as const)('a full loadout starts with the `%s`', (choice, kind, pods, hits) => {
    const w = world({ loadout: 'full', shieldChoice: choice });
    const s = w.players[0].shield;
    expect([s.kind, s.podCount, s.hits]).toEqual([kind, pods, hits]);
    expect(s.hurtScale).toBe(choice === 'reduce' ? 1 / 3 : 1);
    // A full shield: `?` greyed (a Free Shield takes another pair), FULL BARRIER greyed.
    expect(w.powerups.canEquip(0, MeterSlot.Shield)).toBe(choice === 'freeShield');
  });
});

describe('M2-04 shields in a World (edge): pods', () => {
  it('two bullets on one pod in a tick: one hit, the second swallowed — both used up', () => {
    const w = world({ shieldChoice: 'shield' });
    equipShield(w);
    const s = w.players[0].shield;
    const a = bullet(w, s.podX[0] + POD_RADIUS, s.podY[0]);
    const b = bullet(w, s.podX[0], s.podY[0] - POD_RADIUS);
    w.bullets.collidePlayers();
    const flags = w.bullets.pool.fields.flags;
    expect(flags[a] & BulletFlag.Dead).toBe(BulletFlag.Dead);
    expect(flags[b] & BulletFlag.Dead).toBe(BulletFlag.Dead);
    expect([s.podHits[0], s.podHits[1], s.absorbed, s.podIFrames[0]]).toEqual([
      SHIELD_POD_HITS - 1,
      SHIELD_POD_HITS,
      2,
      SHIELD_HIT_IFRAMES,
    ]);
    expect(w.players[0].hitTick).toBe(-1);
  });

  it('a broken pod lets bullets through; the other pod still stops them', () => {
    const w = world({ shieldChoice: 'shield' });
    equipShield(w);
    const ship = w.players[0];
    const s = ship.shield;
    s.podHits[0] = 0;
    s.hits = SHIELD_POD_HITS;
    const through = bullet(w, s.podX[0] + POD_RADIUS, s.podY[0]);
    const stopped = bullet(w, s.podX[1] + POD_RADIUS, s.podY[1]);
    w.bullets.collidePlayers();
    const flags = w.bullets.pool.fields.flags;
    expect(flags[through] & BulletFlag.Dead).toBe(0);
    expect(flags[stopped] & BulletFlag.Dead).toBe(BulletFlag.Dead);
    expect([s.podHits[1], ship.hitTick]).toEqual([SHIELD_POD_HITS - 1, -1]);
  });

  it('pods never stop straight or bending lasers', () => {
    const w = world({ shieldChoice: 'shield' });
    equipShield(w);
    const ship = w.players[0];
    const s = ship.shield;
    // A beam through pod 0 only (well above the ship's hurt circle).
    const laser = fireLaser(
      w,
      { slot: -1, x: s.podX[0] - 60, y: s.podY[0] },
      0,
      120,
      0,
      0,
      30,
      2,
      0,
    );
    expect(laser).toBeGreaterThanOrEqual(0);
    expect(w.bullets.lasers.fields.phase[laser]).toBe(LaserPhase.Active);
    const bend = fireBendingLaser(w, { slot: -1, x: s.podX[1], y: s.podY[1] }, 0);
    expect(bend).toBeGreaterThanOrEqual(0);
    w.bullets.collidePlayers();
    expect([s.podHits[0], s.podHits[1], s.absorbed, ship.hitTick]).toEqual([14, 14, 0, -1]);
    // A beam through a pod and the ship: the ship is hit, the pod untouched.
    fireLaser(w, { slot: -1, x: ship.x - 60, y: ship.y }, 0, 120, 0, 0, 30, 30, 0);
    w.bullets.collidePlayers();
    expect(ship.hitTick).toBe(w.tick);
    expect([s.podHits[0], s.podHits[1]]).toEqual([14, 14]);
  });

  it('an Option Hunter or a ghost never wears a pod by contact', () => {
    const w = world({ shieldChoice: 'rotateShield' });
    w.weapons.loadouts[0].options = 1; // a hunter comes only for Options
    equipShield(w);
    const ship = w.players[0];
    const s = ship.shield;
    placeShieldPods(s, ship);
    const hunter = w.enemies.spawn(w.content.enemyIndex.get('hunter')!, s.podX[0], s.podY[0]);
    const ghost = w.enemies.spawn(w.content.enemyIndex.get('target')!, s.podX[1], s.podY[1]);
    expect(hunter).not.toBeNull();
    expect(ghost).not.toBeNull();
    ghost!.flags |= EnemyFlag.Ghost;
    contact(w);
    expect([s.podHits[0], s.podHits[1], ship.hitTick]).toEqual([14, 14, -1]);
    // The same slot without the ghost flag wears pod 1.
    ghost!.flags &= ~EnemyFlag.Ghost;
    contact(w);
    expect([s.podHits[0], s.podHits[1]]).toEqual([14, 13]);
  });

  it('the pods sit where the ship is after this tick`s move (phase 2)', () => {
    const w = world({ shieldChoice: 'shield' });
    equipShield(w);
    const ship = w.players[0];
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Down | Action.Right);
    for (let t = 0; t < 5; t++) stepWorld(w, input);
    const s = ship.shield;
    const px = [s.podX[0], s.podX[1], s.podY[0], s.podY[1]];
    placeShieldPods(s, ship);
    expect([s.podX[0], s.podX[1], s.podY[0], s.podY[1]]).toEqual(px);
    expect(w.powerups.shieldBatch.x[0]).toBe(s.podX[0]);
    expect(w.powerups.shieldBatch.y[1]).toBe(s.podY[1]);
  });
});

describe('M2-04 shields in a World (edge): Reduce against every hurt test', () => {
  /** The KESTREL's hurt radius (checked against the World's in {@link pair}). */
  const HURT = 1.5;

  /**
   * A bare ship and a Reduce ship side by side.
   *
   * @returns `[bare, reduced]`.
   */
  function pair(): [World, World] {
    const bare = world({ shieldChoice: 'reduce' });
    const reduced = world({ shieldChoice: 'reduce' });
    equipShield(reduced);
    expect(reduced.players[0].shield.hurtScale).toBe(1 / 3);
    expect(bare.ship.hurtRadius).toBe(HURT);
    return [bare, reduced];
  }

  it('straight lasers: a beam 0.8 hurt radii off the edge hits only the bare ship', () => {
    const [bare, reduced] = pair();
    for (const w of [bare, reduced]) {
      const ship = w.players[0];
      const width = 4;
      fireLaser(
        w,
        { slot: -1, x: ship.x - 80, y: ship.y + width / 2 + 0.8 * HURT },
        0,
        160,
        0,
        0,
        30,
        width,
        0,
      );
      w.bullets.collidePlayers();
    }
    expect(bare.players[0].hitTick).toBe(bare.tick);
    expect([reduced.players[0].hitTick, reduced.players[0].shield.hits]).toEqual([-1, 2]);
    // Closer (0.3 radii): the small ship is touched — Reduce absorbs it and grows one step.
    const ship = reduced.players[0];
    fireLaser(
      reduced,
      { slot: -1, x: ship.x - 80, y: ship.y + 2 + 0.3 * HURT },
      0,
      160,
      0,
      0,
      30,
      4,
      0,
    );
    reduced.bullets.collidePlayers();
    expect([ship.shield.hits, ship.shield.hurtScale, ship.hitTick]).toEqual([1, 2 / 3, -1]);
  });

  it('bending lasers: a head node 0.8 hurt radii off the edge hits only the bare ship', () => {
    const [bare, reduced] = pair();
    for (const w of [bare, reduced]) {
      const ship = w.players[0];
      const at = { slot: -1, x: ship.x + 3 + 0.8 * HURT, y: ship.y }; // width 6: radius 3
      expect(fireBendingLaser(w, at, 0)).toBeGreaterThanOrEqual(0);
      w.bullets.collidePlayers();
    }
    expect(bare.players[0].hitTick).toBe(bare.tick);
    expect([reduced.players[0].hitTick, reduced.players[0].shield.hits]).toEqual([-1, 2]);
  });

  it('enemy bodies: a box 0.8 hurt radii away hits only the bare ship', () => {
    const [bare, reduced] = pair();
    for (const w of [bare, reduced]) {
      const ship = w.players[0];
      w.enemies.spawn(w.content.enemyIndex.get('target')!, ship.x + 4 + 0.8 * HURT, ship.y);
      contact(w);
    }
    expect(bare.players[0].hitTick).toBe(bare.tick);
    expect([reduced.players[0].hitTick, reduced.players[0].shield.hits]).toEqual([-1, 2]);
  });

  it('bullets: the bare ship is hit where the small one is missed (the same gap)', () => {
    const [bare, reduced] = pair();
    for (const w of [bare, reduced]) {
      const ship = w.players[0];
      bullet(w, ship.x, ship.y + BULLET_R + 0.8 * HURT);
      w.bullets.collidePlayers();
    }
    expect(bare.players[0].hitTick).toBe(bare.tick);
    expect(reduced.players[0].hitTick).toBe(-1);
  });
});

describe('M2-04 shields in a World (edge): drawing and sounds', () => {
  it('draws Reduce`s shimmer at the ship: frame 0 at two hits, frame 1 at one', () => {
    const w = world({ shieldChoice: 'reduce' });
    equipShield(w);
    const batch = w.powerups.shieldBatch;
    const ship = w.players[0];
    expect(batch.count).toBe(1);
    expect(w.content.sprites.names[batch.spriteId[0]]).toBe(REDUCE_SPRITE);
    expect([batch.x[0], batch.y[0], batch.frame[0]]).toEqual([ship.x, ship.y, 0]);
    bullet(w, ship.x, ship.y);
    const events = tick(w);
    expect(ship.shield.hits).toBe(1);
    expect(events.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.ShieldHit)).toBe(
      true,
    );
    expect(batch.frame[0]).toBe(1);
  });

  it('a pod blinks through its own i-frames; a worn pod shows its wear; a broken one is gone', () => {
    const w = world({ shieldChoice: 'shield' });
    equipShield(w);
    const s = w.players[0].shield;
    const batch = w.powerups.shieldBatch;
    bullet(w, s.podX[0], s.podY[0]);
    tick(w); // hit on this tick: i-frames 8 (not counted down on the hit's tick)
    expect(s.podIFrames[0]).toBe(SHIELD_HIT_IFRAMES);
    tick(w); // 7: hidden
    expect(s.podIFrames[0]).toBe(SHIELD_HIT_IFRAMES - 1);
    expect([batch.flags[0] & SpriteFlag.Hidden, batch.flags[1] & SpriteFlag.Hidden]).toEqual([
      SpriteFlag.Hidden,
      0,
    ]);
    for (let t = 0; t < SHIELD_HIT_IFRAMES; t++) tick(w);
    expect(batch.flags[0] & SpriteFlag.Hidden).toBe(0);
    // Worn to 3 of 14: the critical frame; pod 1 fresh.
    s.podHits[0] = 3;
    s.hits = 17;
    tick(w);
    expect([batch.frame[0], batch.frame[1]]).toEqual([3, 0]);
    // Broken: one sprite left, pod 1's.
    s.podHits[0] = 0;
    s.hits = 14;
    tick(w);
    expect(batch.count).toBe(1);
    expect(batch.x[0]).toBe(s.podX[1]);
    expect(w.content.sprites.names[batch.spriteId[0]]).toBe(SHIELD_POD_SPRITE);
  });

  it('a pod breaking pushes the break SFX and FX though another pod still stands', () => {
    const w = world({ shieldChoice: 'shield' });
    equipShield(w);
    const s = w.players[0].shield;
    s.podHits[0] = 1;
    s.hits = 15;
    bullet(w, s.podX[0], s.podY[0]);
    const events = tick(w);
    expect(events.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.ShieldBreak)).toBe(
      true,
    );
    expect(
      events.some((e) => e.kind === SimEventKind.Particles && e.id === FX_CUES.ShieldBreak),
    ).toBe(true);
    expect(events.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.ShieldHit)).toBe(
      false,
    );
    expect([s.kind, s.podHits[0], s.hits]).toEqual([ShieldKind.Shield, 0, 14]);
    // A pod hit (not a break) is the plain hit sound.
    bullet(w, s.podX[1], s.podY[1]);
    const hit = tick(w);
    expect(hit.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.ShieldHit)).toBe(true);
  });
});

describe('M2-04 shields in a World (edge): death, rank, Free Shield', () => {
  it('death takes the pods: none drawn, none tested', () => {
    const w = world({ shieldChoice: 'rotateShield' });
    equipShield(w);
    const ship = w.players[0];
    bullet(w, ship.x, ship.y); // straight onto the unshielded ship
    tick(w);
    expect(ship.state).toBe('dying');
    for (let t = 0; t < 3; t++) tick(w);
    expect([ship.shield.kind, ship.shield.podCount]).toEqual([ShieldKind.None, 0]);
    expect(w.powerups.shieldBatch.count).toBe(0);
  });

  it('the rank counts Reduce +2 while it stands and nothing once it broke', () => {
    const w = world({ shieldChoice: 'reduce', rankGrowth: 1 });
    equipShield(w);
    expect(w.rankInputs.power).toBe(2);
    const ship = w.players[0];
    ship.shield.hits = 1;
    bullet(w, ship.x, ship.y);
    tick(w);
    expect(ship.shield.kind).toBe(ShieldKind.None);
    tick(w);
    expect(w.rankInputs.power).toBe(0);
  });

  it('attaches pairs at the direction last flown (real input), ahead before any', () => {
    const w = world({ shieldChoice: 'freeShield' });
    expect(w.weapons.freeWayHeading[0]).toBe(-1);
    equipShield(w);
    const ship = w.players[0];
    const s = ship.shield;
    expect([s.podAngle[0], s.podAngle[1]]).toEqual([1024 - 48, 48]);
    expect(s.podX[0]).toBeGreaterThan(ship.x + 10);
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Up);
    for (let t = 0; t < 4; t++) stepWorld(w, input);
    expect(w.weapons.freeWayHeading[0]).toBe(768);
    commitPlayerInput(input.players[0], 0);
    stepWorld(w, input);
    equipShield(w);
    expect([s.podCount, s.podAngle[2], s.podAngle[3]]).toEqual([4, 720, 816]);
    expect(s.podY[2]).toBeLessThan(ship.y - 10);
  });

  it('`?` on four worn pods replaces the most worn pair where the ship last flew', () => {
    const w = world({ shieldChoice: 'freeShield' });
    equipShield(w);
    w.weapons.freeWayHeading[0] = 256;
    equipShield(w);
    const s = w.players[0].shield;
    expect(w.powerups.canEquip(0, MeterSlot.Shield)).toBe(false);
    s.podHits[2] = 5;
    s.hits = 47;
    expect(w.powerups.canEquip(0, MeterSlot.Shield)).toBe(true);
    w.weapons.freeWayHeading[0] = 512;
    equipShield(w);
    expect([...s.podHits]).toEqual([14, 14, 14, 14]);
    expect([s.podAngle[2], s.podAngle[3], s.hits]).toEqual([464, 560, 56]);
    expect(w.powerups.canEquip(0, MeterSlot.Shield)).toBe(false);
  });
});
