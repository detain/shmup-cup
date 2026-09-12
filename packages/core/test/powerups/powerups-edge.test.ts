/**
 * Edge cases of `core/powerups` (plan M1-11): the meter helpers outside their normal range
 * (out-of-range and NaN cursors, fractional and unknown slot codes, a ship without Speed Ups),
 * the system's guards (bad player indices, bad item kinds, a full item pool, zero-filled reused
 * slots), the press rules (ships that may not press, whole-pixel event positions, co-op presses on
 * the same tick, two Mega Crashes at once), the Auto Power-Up order in its corners (repeated slots,
 * Laser-then-Double, `!` in the order detonating on the pickup's own tick, entries past a slot's
 * maximum), items (culling bounds and scrolling, NaN positions, the blink, age, the magnet's reach
 * boundary, snap, nearest ship and alive-only rule, pickup ties in co-op, the outcomes' reset) and
 * Mega Crash / Force Field details (non-cancelable bullets, ghosts, an empty screen, a formation
 * wiped out by it, lasers, consumed bullets, a break and a re-grant on the same tick, restarts).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletFlag, BulletKind, fireLaser, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig, type MeterSlotName } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  Action,
  MAX_PLAYERS,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { createPlayer, setPlayerState, spawnPlayer } from '../../src/player/index.js';
import {
  CAPSULE_SCORE,
  CAPSULE_SPRITE,
  ITEM_BLINK_TICKS,
  ITEM_CULL_MARGIN,
  ITEM_KINDS,
  ITEM_RADIUS,
  ITEM_SCHEMA,
  ITEM_SPRITES,
  ItemFlag,
  ItemKind,
  MAX_ITEMS,
  MEGA_CRASH_FLASH_TICKS,
  METER_LABELS,
  METER_SLOT_COUNT,
  MeterSlot,
  PICKUP_MAGNET_RANGE,
  PICKUP_MAGNET_SPEED,
  advanceMeter,
  canEquipSlot,
  createPowerMeter,
  equipSlot,
  equippableSlots,
  meterSlotOf,
} from '../../src/powerups/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import {
  FORCE_FIELD_HITS,
  ShieldKind,
  absorbShieldHit,
  grantShield,
  shieldActive,
} from '../../src/shields/index.js';
import { Loadout, MainWeapon } from '../../src/weapons/index.js';
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
 * An enemy entry: a scriptless flying target that stays where it spawns.
 *
 * @param id - Enemy id.
 * @param over - Fields to change.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 1000,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/**
 * A static stage with a flat 32-px floor.
 *
 * @param id - Stage id.
 * @param speed - Camera scroll speed.
 * @param events - Timeline events.
 * @returns The stage file data.
 */
function stage(id: string, speed: number, events: unknown[]): Record<string, unknown> {
  return {
    formatVersion: 1,
    kind: 'stage',
    id,
    name: id.toUpperCase(),
    music: { stage: 'Stage', boss: 'Boss' },
    length: 3000,
    camera: [{ x: 0, speed }],
    checkpoints: [{ x: 0 }],
    parallax: [],
    tilemap: {
      tileSize: 8,
      tileset: 'terrain-a',
      rowsTall: 25,
      generator: {
        type: 'heightfield',
        segments: [{ from: 0, to: 3384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
      },
    },
    events,
  };
}

/**
 * Test content: the KESTREL, Type A, the shipped tileset, test enemies, a quiet static stage, a
 * scrolling one, and two static stages with a three-member `weak` formation (one drops a capsule
 * when completed, the other nothing).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const formation = (drop?: null): Record<string, unknown> => ({
    x: 0,
    type: 'formation',
    enemy: 'weak',
    count: 3,
    interval: 10,
    screenX: 200,
    y: 100,
    bonus: 500,
    ...(drop === null ? { drop: null } : {}),
  });
  const files: ContentFile[] = [
    shipped('player/kestrel.player.json'),
    shipped('weapons/type-a.weapons.json'),
    shipped('tilesets/terrain-a.tileset.json'),
    {
      path: 'enemies/t.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [
          enemy('target'),
          enemy('weak', { hp: 1, score: 200 }),
          enemy('carrier', { hp: 1, drop: 'capsule' }),
          enemy('immune', { megaCrashImmune: true }),
        ],
      },
    },
    { path: 'stages/quiet.stage.json', data: stage('quiet', 0, []) },
    { path: 'stages/scroll.stage.json', data: stage('scroll', 2, []) },
    { path: 'stages/wing.stage.json', data: stage('wing', 0, [formation()]) },
    { path: 'stages/bare.stage.json', data: stage('bare', 0, [formation(null)]) },
  ];
  const { db: content, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB (content is read-only). */
const DB = db();

/**
 * A world whose player 1 is alive, parked at (`x`, `y`) in the view.
 *
 * @param config - Config overrides.
 * @param x - Ship x relative to the camera.
 * @param y - Ship y relative to the camera.
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}, x = 60, y = 100): World {
  const w = createWorld(
    resolveGameConfig({ seed: 7, autofire: false, remoteMode: false, ...config }),
    DB,
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + x;
  w.players[0].y = w.camera.y + y;
  w.events.clear();
  return w;
}

/**
 * A world with both players alive: player 1 at view (60, 60), player 2 at view (60, 140).
 *
 * @param config - Config overrides.
 * @returns The world.
 */
function coop(config: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({ seed: 8, autofire: false, remoteMode: false, ...config }),
    DB,
  );
  const p2 = w.players[1];
  p2.active = true;
  spawnPlayer(p2, w.camera);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive' || p2.state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + 60;
  w.players[0].y = w.camera.y + 60;
  p2.x = w.camera.x + 60;
  p2.y = w.camera.y + 140;
  w.events.clear();
  return w;
}

/**
 * Steps a world once with player 1 holding `held` and player 2 holding `held2` (edges computed
 * from the previous tick) and collects the events.
 *
 * @param w - The world.
 * @param input - The snapshot (kept across ticks, so `pressed` is a real edge).
 * @param held - Actions player 1 holds this tick.
 * @param held2 - Actions player 2 holds this tick.
 * @returns The events of the tick.
 */
function tick(w: World, input: InputSnapshot, held = 0, held2 = 0): SimEvent[] {
  commitPlayerInput(input.players[0], held);
  commitPlayerInput(input.players[1], held2);
  stepWorld(w, input);
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Drops a capsule at a view position.
 *
 * @param w - The world.
 * @param x - X relative to the camera.
 * @param y - Y relative to the camera.
 * @returns The item slot.
 */
function capsule(w: World, x: number, y: number): number {
  const i = w.powerups.spawnItem(ItemKind.Capsule, w.camera.x + x, w.camera.y + y);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

/**
 * Spawns a test enemy at a view position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - X relative to the camera.
 * @param y - Y relative to the camera.
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id)!, w.camera.x + x, w.camera.y + y);
  expect(e).not.toBeNull();
  return e!;
}

/**
 * Live items as plain records.
 *
 * @param w - The world.
 * @returns Their positions.
 */
function items(w: World): { x: number; y: number }[] {
  const f = w.powerups.pool.fields;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < w.powerups.pool.count; i++) {
    if ((f.flags[i] & ItemFlag.Dead) === 0) out.push({ x: f.x[i], y: f.y[i] });
  }
  return out;
}

/**
 * Events of one kind and id.
 *
 * @param events - The events.
 * @param kind - `SimEventKind`.
 * @param id - Event id (any when omitted).
 * @returns The matching events.
 */
function only(events: readonly SimEvent[], kind: number, id?: number): SimEvent[] {
  return events.filter((e) => e.kind === kind && (id === undefined || e.id === id));
}

describe('core/powerups edge — meter helpers', () => {
  it('keeps the constants and tables consistent', () => {
    expect([
      MAX_ITEMS,
      CAPSULE_SCORE,
      ITEM_RADIUS,
      PICKUP_MAGNET_RANGE,
      PICKUP_MAGNET_SPEED,
      ITEM_CULL_MARGIN,
      ITEM_BLINK_TICKS,
      MEGA_CRASH_FLASH_TICKS,
    ]).toEqual([32, 300, 5, 16, 2, 32, 8, 12]);
    expect(METER_LABELS).toHaveLength(METER_SLOT_COUNT);
    expect(Object.isFrozen(METER_LABELS)).toBe(true);
    expect(Object.values(MeterSlot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(ITEM_KINDS[ItemKind.Capsule]).toEqual({
      sprite: CAPSULE_SPRITE,
      frames: 2,
      score: CAPSULE_SCORE,
    });
    expect(Object.isFrozen(ITEM_KINDS)).toBe(true);
    expect(Object.isFrozen(ITEM_KINDS[0])).toBe(true);
    expect(ITEM_SPRITES).toEqual(['items/capsule']);
    expect(ENGINE_SPRITES).toContain(CAPSULE_SPRITE);
    expect(Object.keys(ITEM_SCHEMA).sort()).toEqual(['age', 'flags', 'kind', 'vx', 'vy', 'x', 'y']);
    expect(meterSlotOf('bogus' as MeterSlotName)).toBe(-1);
  });

  it('brings an out-of-range cursor back to Speed', () => {
    const meter = createPowerMeter();
    for (const bad of [-5, -2, 6, 7, 99]) {
      meter.cursor = bad;
      expect(advanceMeter(meter), `cursor ${bad}`).toBe(0);
    }
    // A full turn from Speed comes back to Speed.
    meter.cursor = 0;
    for (let i = 0; i < METER_SLOT_COUNT; i++) advanceMeter(meter);
    expect(meter.cursor).toBe(0);
  });

  it('recovers from a NaN cursor instead of staying NaN forever (regression)', () => {
    const meter = createPowerMeter();
    meter.cursor = Number.NaN;
    expect(advanceMeter(meter)).toBe(MeterSlot.Speed);
    expect(advanceMeter(meter)).toBe(MeterSlot.Missile);
  });

  it('never equips fractional, NaN or unknown slot codes', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    for (const bad of [0.5, 2.5, Number.NaN, -1, 7, Infinity]) {
      expect(canEquipSlot(bad, ship, loadout, 5), String(bad)).toBe(false);
      expect(equipSlot(bad, ship, loadout, 5), String(bad)).toBe(false);
    }
    expect([ship.speedLevel, loadout.main, loadout.missile, loadout.options]).toEqual([
      0,
      MainWeapon.Basic,
      false,
      0,
    ]);
    expect(ship.shield.kind).toBe(ShieldKind.None);
  });

  it('greys Speed on a ship without Speed Ups and above its top speed', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    expect(canEquipSlot(MeterSlot.Speed, ship, loadout, 0)).toBe(false);
    ship.speedLevel = 9; // above the top (a debug tool)
    expect(canEquipSlot(MeterSlot.Speed, ship, loadout, 5)).toBe(false);
    expect(equipSlot(MeterSlot.Speed, ship, loadout, 5)).toBe(false);
    expect(ship.speedLevel).toBe(9);
  });

  it('lets "!" through without any lasting effect', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 5)).toBe(true);
    expect([ship.speedLevel, loadout.main, loadout.missile, loadout.options]).toEqual([
      0,
      MainWeapon.Basic,
      false,
      0,
    ]);
    expect(shieldActive(ship.shield)).toBe(false);
  });

  it('greys everything but the other main weapon and "!" when fully powered', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    ship.speedLevel = 5;
    loadout.main = MainWeapon.Laser;
    loadout.missile = true;
    loadout.options = 4;
    grantShield(ship.shield);
    expect(equippableSlots(ship, loadout, 5)).toBe((1 << MeterSlot.Double) | (1 << MeterSlot.Mega));
    loadout.main = MainWeapon.Double;
    expect(equippableSlots(ship, loadout, 5)).toBe((1 << MeterSlot.Laser) | (1 << MeterSlot.Mega));
  });

  it('puts up a fresh Force Field over a broken one that still has i-frames', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    grantShield(ship.shield);
    ship.shield.hits = 1;
    absorbShieldHit(ship.shield, false, 10); // breaks: kind None, i-frames running
    expect(ship.shield.kind).toBe(ShieldKind.None);
    expect(ship.shield.iFrames).toBeGreaterThan(0);
    expect(canEquipSlot(MeterSlot.Shield, ship, loadout, 5)).toBe(true);
    expect(equipSlot(MeterSlot.Shield, ship, loadout, 5)).toBe(true);
    expect([ship.shield.kind, ship.shield.hits, ship.shield.maxHits, ship.shield.iFrames]).toEqual([
      ShieldKind.ForceField,
      FORCE_FIELD_HITS,
      FORCE_FIELD_HITS,
      0,
    ]);
  });
});

describe('core/powerups edge — system guards', () => {
  it('answers bad player indices without touching anything or pushing events', () => {
    const w = world();
    const p = w.powerups;
    const before = hashWorld(w);
    for (const bad of [-1, MAX_PLAYERS, 0.5, Number.NaN, 99]) {
      expect(p.canEquip(bad, MeterSlot.Mega), String(bad)).toBe(false);
      expect(p.equippable(bad), String(bad)).toBe(0);
      expect(p.nextAutoSlot(bad), String(bad)).toBe(-1);
      expect(p.collect(bad), String(bad)).toBe(-1);
      expect(p.equipHighlighted(bad), String(bad)).toBe(false);
    }
    expect(w.events.length).toBe(0);
    expect(hashWorld(w)).toBe(before);
    expect(p.maxSpeedLevel).toBe(5); // the KESTREL: six speeds
    expect(p.equippable(0)).toBe(0b1111111);
  });

  it('rejects bad item kinds and drops quietly when the pool is full', () => {
    const w = world();
    const p = w.powerups;
    for (const bad of [-1, ITEM_KINDS.length, 0.5, Number.NaN]) {
      expect(p.spawnItem(bad, w.camera.x + 200, w.camera.y + 50), String(bad)).toBe(-1);
    }
    expect(p.count).toBe(0);
    for (let i = 0; i < MAX_ITEMS; i++) capsule(w, 200 + (i % 8) * 10, 20 + Math.floor(i / 8) * 10);
    expect(p.count).toBe(MAX_ITEMS);
    expect(p.spawnItem(ItemKind.Capsule, w.camera.x + 300, w.camera.y + 150)).toBe(-1);
    // A carrier killed with the pool full: its capsule is lost, nothing throws.
    const input = createInputSnapshot();
    const carrier = spawn(w, 'carrier', 330, 170);
    w.enemies.damage(carrier, 1, 0);
    expect(() => tick(w, input)).not.toThrow();
    expect(carrier.state).toBe(EnemyState.Free);
    expect(p.count).toBe(MAX_ITEMS);
  });

  it('zero-fills a reused slot (age, flags, velocity)', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const i = capsule(w, ship.x - w.camera.x + 20, ship.y - w.camera.y); // in magnet reach
    const f = w.powerups.pool.fields;
    tick(w, input);
    expect(f.age[i]).toBe(1);
    expect(f.flags[i] & ItemFlag.Magnet).toBe(ItemFlag.Magnet);
    for (let t = 0; t < 20 && w.powerups.pool.count > 0; t++) tick(w, input);
    expect(w.powerups.pool.count).toBe(0);
    const j = capsule(w, 300, 20);
    expect(j).toBe(i);
    expect([f.age[j], f.flags[j], f.vx[j], f.vy[j], f.kind[j]]).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('core/powerups edge — the PowerUp press', () => {
  it('ignores presses of dying, dead and inactive ships (no denied sound either)', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const meter = w.powerups.meters[0];
    for (const state of ['dying', 'dead'] as const) {
      setPlayerState(ship, state);
      meter.cursor = MeterSlot.Speed;
      const events = tick(w, input, Action.PowerUp);
      tick(w, input, 0);
      expect(only(events, SimEventKind.Sfx, SFX_CUES.PowerUpDenied), state).toEqual([]);
      expect(only(events, SimEventKind.PowerUp), state).toEqual([]);
      expect([ship.speedLevel, meter.cursor], state).toEqual([0, MeterSlot.Speed]);
    }
    // Player 2 is not in play: its press does nothing.
    const meter2 = w.powerups.meters[1];
    meter2.cursor = MeterSlot.Speed;
    const events = tick(w, input, 0, Action.PowerUp);
    expect(events).toEqual([]);
    expect([w.players[1].speedLevel, meter2.cursor]).toEqual([0, MeterSlot.Speed]);
  });

  it('lets a ship equip during its fly-in', () => {
    const w = createWorld(resolveGameConfig({ seed: 1, autofire: false }), DB);
    const input = createInputSnapshot();
    stepWorld(w, input);
    expect(w.players[0].state).toBe('entering');
    w.powerups.meters[0].cursor = MeterSlot.Missile;
    tick(w, input, Action.PowerUp);
    expect(w.players[0].state).toBe('entering');
    expect(w.weapons.loadouts[0].missile).toBe(true);
  });

  it('pushes its events at the ship in whole pixels', () => {
    const w = world({}, 60.7, 100.4);
    const input = createInputSnapshot();
    const ship = w.players[0];
    const x = Math.floor(ship.x);
    const y = Math.floor(ship.y);
    expect(x).not.toBe(ship.x);
    const denied = tick(w, input, Action.PowerUp);
    expect(only(denied, SimEventKind.Sfx, SFX_CUES.PowerUpDenied)).toEqual([
      { kind: SimEventKind.Sfx, id: SFX_CUES.PowerUpDenied, x, y, param: 0 },
    ]);
    tick(w, input, 0);
    w.powerups.meters[0].cursor = MeterSlot.Option;
    const equipped = tick(w, input, Action.PowerUp);
    expect(only(equipped, SimEventKind.Sfx, SFX_CUES.PowerUpEquip)).toEqual([
      { kind: SimEventKind.Sfx, id: SFX_CUES.PowerUpEquip, x, y, param: 0 },
    ]);
    expect(only(equipped, SimEventKind.PowerUp)).toEqual([
      { kind: SimEventKind.PowerUp, id: MeterSlot.Option, x, y, param: 0 },
    ]);
  });

  it('denies a second press after an equip (the cursor went back to none)', () => {
    const w = world();
    const input = createInputSnapshot();
    w.powerups.meters[0].cursor = MeterSlot.Double;
    tick(w, input, Action.PowerUp);
    expect(w.weapons.loadouts[0].main).toBe(MainWeapon.Double);
    tick(w, input, 0);
    const events = tick(w, input, Action.PowerUp);
    expect(only(events, SimEventKind.Sfx, SFX_CUES.PowerUpDenied)).toHaveLength(1);
    expect(w.powerups.meters[0].cursor).toBe(-1);
  });

  it('gives each co-op player their own meter; both may press on the same tick', () => {
    const w = coop();
    const input = createInputSnapshot();
    const [m1, m2] = w.powerups.meters;
    m1.cursor = MeterSlot.Missile;
    m2.cursor = MeterSlot.Laser;
    const events = tick(w, input, Action.PowerUp, Action.PowerUp);
    expect(w.weapons.loadouts[0]).toMatchObject({ missile: true, main: MainWeapon.Basic });
    expect(w.weapons.loadouts[1]).toMatchObject({ missile: false, main: MainWeapon.Laser });
    expect([m1.cursor, m2.cursor]).toEqual([-1, -1]);
    expect(only(events, SimEventKind.PowerUp).map((e) => [e.id, e.param])).toEqual([
      [MeterSlot.Missile, 0],
      [MeterSlot.Laser, 1],
    ]);
    // Player 2's press alone leaves player 1's meter alone.
    tick(w, input, 0, 0);
    m1.cursor = MeterSlot.Speed;
    m2.cursor = MeterSlot.Speed;
    tick(w, input, 0, Action.PowerUp);
    expect([w.players[0].speedLevel, w.players[1].speedLevel]).toEqual([0, 1]);
    expect([m1.cursor, m2.cursor]).toEqual([MeterSlot.Speed, -1]);
  });

  it('detonates two Mega Crashes of one tick in player order (the second finds nothing)', () => {
    const w = coop({ stage: 'quiet' });
    const input = createInputSnapshot();
    spawn(w, 'target', 250, 40);
    spawn(w, 'target', 300, 100);
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    w.powerups.meters[1].cursor = MeterSlot.Mega;
    const events = tick(w, input, Action.PowerUp, Action.PowerUp);
    const o = w.enemies.outcomes;
    expect(o.killCount).toBe(2);
    expect(Array.from(o.killBy.subarray(0, 2))).toEqual([0, 0]);
    expect(only(events, SimEventKind.Flash)).toHaveLength(2);
    expect(only(events, SimEventKind.Sfx, SFX_CUES.MegaCrash)).toHaveLength(2);
    expect(Array.from(w.powerups.megaPending)).toEqual([0, 0]);
  });
});

describe('core/powerups edge — Auto Power-Up', () => {
  it('asks for a repeated slot again until its level is reached', () => {
    const w = world({ autoPowerUp: true, autoPowerUpOrder: ['speed', 'speed', 'missile'] });
    const p = w.powerups;
    expect(p.nextAutoSlot(0)).toBe(MeterSlot.Speed);
    p.collect(0); // Speed 1
    expect([w.players[0].speedLevel, p.nextAutoSlot(0)]).toEqual([1, MeterSlot.Speed]);
    p.collect(0); // Speed 2
    expect([w.players[0].speedLevel, p.nextAutoSlot(0)]).toEqual([2, MeterSlot.Missile]);
    // A lost level (a death penalty, M1-12) is wanted again.
    w.players[0].speedLevel = 1;
    expect(p.nextAutoSlot(0)).toBe(MeterSlot.Speed);
  });

  it('parks a slot that is not the next wanted one', () => {
    const w = world({ autoPowerUp: true, autoPowerUpOrder: ['missile', 'speed'] });
    const p = w.powerups;
    expect(p.collect(0)).toBe(MeterSlot.Speed); // lands on Speed, but the Missile comes first
    expect(w.players[0].speedLevel).toBe(0);
    expect(p.collect(0)).toBe(-1); // Missile: equipped at once
    expect(w.weapons.loadouts[0].missile).toBe(true);
    expect(p.nextAutoSlot(0)).toBe(MeterSlot.Speed);
  });

  it('treats a Laser entry as satisfied by a later Double entry, not the other way round', () => {
    const w = world({ autoPowerUp: true, autoPowerUpOrder: ['laser', 'double'] });
    const loadout = w.weapons.loadouts[0];
    expect(w.powerups.nextAutoSlot(0)).toBe(MeterSlot.Laser);
    loadout.main = MainWeapon.Double;
    expect(w.powerups.nextAutoSlot(0)).toBe(-1);
    loadout.main = MainWeapon.Laser;
    expect(w.powerups.nextAutoSlot(0)).toBe(MeterSlot.Double);
  });

  it('caps a slot listed past its maximum (Options, Speed)', () => {
    const order: MeterSlotName[] = ['option', 'option', 'option', 'option', 'option', 'option'];
    const w = world({ autoPowerUp: true, autoPowerUpOrder: order });
    w.weapons.loadouts[0].options = 3;
    expect(w.powerups.nextAutoSlot(0)).toBe(MeterSlot.Option);
    w.weapons.loadouts[0].options = 4;
    expect(w.powerups.nextAutoSlot(0)).toBe(-1);
  });

  it('never considers "!" satisfied, and an auto-equipped "!" detonates on the pickup tick', () => {
    const w = world({ stage: 'quiet', autoPowerUp: true, autoPowerUpOrder: ['speed', 'mega'] });
    const input = createInputSnapshot();
    const ship = w.players[0];
    w.players[0].speedLevel = 1;
    expect(w.powerups.nextAutoSlot(0)).toBe(MeterSlot.Mega);
    const a = spawn(w, 'target', 250, 40);
    const immune = spawn(w, 'immune', 280, 60);
    w.powerups.meters[0].cursor = MeterSlot.Shield;
    capsule(w, ship.x - w.camera.x, ship.y - w.camera.y);
    const events = tick(w, input);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    expect(a.state).toBe(EnemyState.Free);
    expect(immune.state).toBe(EnemyState.Live);
    expect(only(events, SimEventKind.PowerUp)).toMatchObject([{ id: MeterSlot.Mega, param: 0 }]);
    expect(only(events, SimEventKind.Flash)).toHaveLength(1);
    expect(w.powerups.megaPending[0]).toBe(0);
    // Still wanted: the next capsule landing on "!" goes off again.
    expect(w.powerups.nextAutoSlot(0)).toBe(MeterSlot.Mega);
  });

  it('applies several pickups of one tick in order, each able to auto-equip', () => {
    const w = world({ autoPowerUp: true, pickupMagnet: false });
    const input = createInputSnapshot();
    const ship = w.players[0];
    // Three capsules at once: Speed (auto, cursor back to none), Speed again (wanted? no: the
    // Missile is next) — parked on Speed, then Missile (auto).
    for (let k = 0; k < 3; k++) capsule(w, ship.x - w.camera.x, ship.y - w.camera.y + k);
    const events = tick(w, input);
    expect(w.powerups.outcomes.pickupCount).toBe(3);
    expect(ship.speedLevel).toBe(1);
    expect(w.weapons.loadouts[0].missile).toBe(true);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    expect(only(events, SimEventKind.PowerUp).map((e) => e.id)).toEqual([
      MeterSlot.Speed,
      MeterSlot.Missile,
    ]);
    expect(only(events, SimEventKind.Sfx, SFX_CUES.MeterAdvance)).toHaveLength(3);
  });
});

describe('core/powerups edge — items', () => {
  it('keeps items up to 32 px outside the view and culls them beyond (NaN too)', () => {
    const w = world({ pickupMagnet: false });
    const input = createInputSnapshot();
    const right = 384 + ITEM_CULL_MARGIN;
    const bottom = 200 + ITEM_CULL_MARGIN;
    const inside = [
      capsule(w, right, 100),
      capsule(w, -ITEM_CULL_MARGIN, 150),
      capsule(w, 300, bottom),
      capsule(w, 300, -ITEM_CULL_MARGIN),
    ];
    capsule(w, right + 0.5, 100);
    capsule(w, -ITEM_CULL_MARGIN - 0.5, 150);
    capsule(w, 300, bottom + 0.5);
    capsule(w, 300, -ITEM_CULL_MARGIN - 0.5);
    w.powerups.spawnItem(ItemKind.Capsule, Number.NaN, w.camera.y + 50);
    w.powerups.spawnItem(ItemKind.Capsule, w.camera.x + 200, Number.NaN);
    tick(w, input);
    expect(items(w)).toHaveLength(inside.length);
    expect(w.powerups.pool.count).toBe(inside.length);
    expect(w.powerups.itemBatch.count).toBe(inside.length);
  });

  it('leaves capsules behind as the camera scrolls, then culls them', () => {
    const w = world({ stage: 'scroll', pickupMagnet: false });
    const input = createInputSnapshot();
    const i = capsule(w, 300, 40);
    const x = w.powerups.pool.fields.x[i];
    const camera0 = w.camera.x;
    tick(w, input);
    expect(w.camera.x).toBeGreaterThan(camera0);
    expect(items(w)).toEqual([{ x, y: w.camera.y + 40 }]); // world space: it does not move
    let ticks = 1;
    while (items(w).length > 0 && ticks < 1000) {
      tick(w, input);
      ticks++;
    }
    expect(items(w)).toEqual([]);
    // Culled on the first tick the camera left it more than 32 px behind.
    expect(w.camera.x - ITEM_CULL_MARGIN).toBeGreaterThan(x);
    expect(w.camera.x - w.camera.dx - ITEM_CULL_MARGIN).toBeLessThanOrEqual(x);
  });

  it('blinks with the tick and ages one per tick', () => {
    const w = world({ pickupMagnet: false });
    const input = createInputSnapshot();
    const i = capsule(w, 300, 40);
    const frames: number[] = [];
    for (let t = 0; t < 3 * ITEM_BLINK_TICKS; t++) {
      tick(w, input);
      // Drawn in phase 9 of tick `w.tick − 1` (the tick counter advances after the phases).
      const drawn = w.tick - 1;
      expect(w.powerups.itemBatch.frame[0]).toBe(Math.floor(drawn / ITEM_BLINK_TICKS) % 2);
      frames.push(w.powerups.itemBatch.frame[0]);
    }
    expect(new Set(frames)).toEqual(new Set([0, 1]));
    expect(w.powerups.pool.fields.age[i]).toBe(3 * ITEM_BLINK_TICKS);
    expect(w.powerups.itemBatch.flags[0]).toBe(0);
  });

  it('reaches exactly 16 px beyond the pickup box (closed), not half a pixel more', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const box = w.ship.pickupBox;
    const edge = box.hw + ITEM_RADIUS + PICKUP_MAGNET_RANGE;
    const at = capsule(w, ship.x - w.camera.x + edge, ship.y - w.camera.y);
    const beyond = capsule(w, ship.x - w.camera.x - edge - 0.5, ship.y - w.camera.y);
    const f = w.powerups.pool.fields;
    const xBeyond = f.x[beyond];
    tick(w, input);
    expect(f.flags[at] & ItemFlag.Magnet).toBe(ItemFlag.Magnet);
    expect(f.flags[beyond] & ItemFlag.Magnet).toBe(0);
    expect(f.x[beyond]).toBe(xBeyond);
  });

  it('snaps an item within one step onto the ship', () => {
    const w = world({}, 60, 100);
    const ship = w.players[0];
    const i = w.powerups.spawnItem(ItemKind.Capsule, ship.x + 1, ship.y + 1);
    w.powerups.update();
    const f = w.powerups.pool.fields;
    expect([f.x[i], f.y[i]]).toEqual([ship.x, ship.y]);
  });

  it('is pulled by the nearest alive ship only, and lets go when out of reach', () => {
    const w = coop();
    const [p1, p2] = w.players;
    // Between the two ships, nearer player 2 (both boxes within reach).
    p1.y = w.camera.y + 90;
    p2.y = w.camera.y + 118;
    const i = w.powerups.spawnItem(ItemKind.Capsule, p1.x, w.camera.y + 106);
    const f = w.powerups.pool.fields;
    w.powerups.update();
    expect(f.y[i]).toBeCloseTo(w.camera.y + 106 + PICKUP_MAGNET_SPEED, 9);
    // Player 2 dying: player 1 pulls instead.
    setPlayerState(p2, 'dying');
    w.powerups.update();
    expect(f.y[i]).toBeCloseTo(w.camera.y + 106, 9);
    // Both out of play: no pull, the magnet flag clears.
    setPlayerState(p1, 'entering');
    w.powerups.update();
    expect(f.y[i]).toBeCloseTo(w.camera.y + 106, 9);
    expect(f.flags[i] & ItemFlag.Magnet).toBe(0);
  });

  it('gives an item touching both co-op ships to player 1', () => {
    const w = coop({ pickupMagnet: false });
    const input = createInputSnapshot();
    const [p1, p2] = w.players;
    p1.y = w.camera.y + 100;
    p2.y = w.camera.y + 112;
    p2.x = p1.x;
    w.powerups.spawnItem(ItemKind.Capsule, p1.x, w.camera.y + 106);
    tick(w, input);
    const o = w.powerups.outcomes;
    expect(o.pickupCount).toBe(1);
    expect(o.pickupPlayer[0]).toBe(0);
    expect(o.pickupKind[0]).toBe(ItemKind.Capsule);
    expect([o.pickupX[0], o.pickupY[0]]).toEqual([p1.x, w.camera.y + 106]);
    expect([w.powerups.meters[0].cursor, w.powerups.meters[1].cursor]).toEqual([0, -1]);
    // Player 2 collects its own.
    w.powerups.spawnItem(ItemKind.Capsule, p2.x, p2.y + 8);
    tick(w, input);
    expect(o.pickupPlayer[0]).toBe(1);
    expect(w.powerups.meters[1].cursor).toBe(0);
  });

  it('resets the tick outcomes every collision phase', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    capsule(w, ship.x - w.camera.x, ship.y - w.camera.y);
    tick(w, input);
    expect(w.powerups.outcomes.pickupCount).toBe(1);
    tick(w, input);
    expect(w.powerups.outcomes.pickupCount).toBe(0);
  });

  it('turns kills of a direct Mega Crash between ticks into capsules at the next tick', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    const carrier = spawn(w, 'carrier', 300, 60);
    expect(w.powerups.detonateMegaCrash(0)).toBe(1);
    expect(items(w)).toEqual([]);
    tick(w, input);
    expect(items(w)).toEqual([{ x: carrier.x, y: carrier.y }]);
    expect(w.powerups.dropsTaken).toBe(0);
    // Not taken twice.
    tick(w, input);
    expect(items(w)).toHaveLength(1);
  });

  it('drops nothing for a completed formation whose drop is null', () => {
    const w = world({ stage: 'bare' });
    const input = createInputSnapshot();
    let bonus = 0;
    for (let t = 0; t < 120 && bonus === 0; t++) {
      for (const e of w.enemies.enemies) {
        if (e.state === EnemyState.Live && (e.flags & EnemyFlag.Ghost) === 0) w.enemies.kill(e, 0);
      }
      bonus += only(tick(w, input), SimEventKind.FormationBonus).length;
    }
    expect(bonus).toBe(1);
    tick(w, input);
    expect(items(w)).toEqual([]);
  });

  it('does not bring back dropped capsules after a checkpoint restart', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    const carrier = spawn(w, 'carrier', 300, 60);
    w.enemies.damage(carrier, 1, 0);
    tick(w, input);
    expect(items(w)).toHaveLength(1);
    w.stage!.restartAt(0);
    expect(w.powerups.itemBatch.count).toBe(0);
    expect(w.powerups.dropsTaken).toBe(0);
    for (let t = 0; t < 3; t++) tick(w, input);
    expect(items(w)).toEqual([]);
  });

  it('hashes the items and the taken drops', () => {
    const w = world();
    const base = hashWorld(w);
    const i = capsule(w, 200, 50);
    const withItem = hashWorld(w);
    expect(withItem).not.toBe(base);
    w.powerups.pool.fields.age[i] = 5;
    expect(hashWorld(w)).not.toBe(withItem);
    w.powerups.pool.fields.age[i] = 0;
    expect(hashWorld(w)).toBe(withItem);
    const mutable = w.powerups as { dropsTaken: number };
    mutable.dropsTaken = 3;
    expect(hashWorld(w)).not.toBe(withItem);
    mutable.dropsTaken = 0;
    expect(hashWorld(w)).toBe(withItem);
  });
});

describe('core/powerups edge — Mega Crash details', () => {
  it('spares non-cancelable bullets and ghosts, cancels lasers', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    const keep = spawnBullet(w, w.camera.x + 300, w.camera.y + 30, 512, 0, BulletKind.RoundRed);
    w.bullets.setFlags(keep, BulletFlag.DieOnTerrain); // not cancelable
    spawnBullet(w, w.camera.x + 310, w.camera.y + 30, 512, 0, BulletKind.RoundRed);
    const laser = fireLaser(
      w,
      { slot: -1, x: w.camera.x + 350, y: w.camera.y + 20 },
      512,
      100,
      40,
      0,
      30,
      8,
      0,
    );
    expect(laser).toBeGreaterThanOrEqual(0);
    const ghost = spawn(w, 'target', 260, 80);
    ghost.flags |= EnemyFlag.Ghost;
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    tick(w, input, Action.PowerUp);
    expect(w.bullets.count).toBe(1);
    expect(w.bullets.pool.fields.flags[0] & BulletFlag.Cancelable).toBe(0);
    expect(w.bullets.lasers.count).toBe(0);
    expect(ghost.state).toBe(EnemyState.Live);
  });

  it('flashes and sounds even with nothing on screen', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    const events = tick(w, input, Action.PowerUp);
    expect(only(events, SimEventKind.Flash)).toEqual([
      { kind: SimEventKind.Flash, id: 0, x: 0, y: 0, param: MEGA_CRASH_FLASH_TICKS },
    ]);
    const ship = w.players[0];
    expect(only(events, SimEventKind.Sfx, SFX_CUES.MegaCrash)).toEqual([
      {
        kind: SimEventKind.Sfx,
        id: SFX_CUES.MegaCrash,
        x: Math.floor(ship.x),
        y: Math.floor(ship.y),
        param: 0,
      },
    ]);
    expect(w.enemies.outcomes.killCount).toBe(0);
  });

  it('wipes out a formation: bonus and capsule on the same tick', () => {
    const w = world({ stage: 'wing' });
    const input = createInputSnapshot();
    const weak = w.content.enemyIndex.get('weak')!;
    const live = (): number =>
      w.enemies.enemies.filter(
        (e) =>
          e.state === EnemyState.Live && e.specIndex === weak && (e.flags & EnemyFlag.Ghost) === 0,
      ).length;
    for (let t = 0; t < 120 && live() < 3; t++) tick(w, input);
    expect(live()).toBe(3);
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    const events = tick(w, input, Action.PowerUp);
    expect(live()).toBe(0);
    expect(only(events, SimEventKind.FormationBonus)).toHaveLength(1);
    expect(w.enemies.outcomes.bonusPoints).toBe(500);
    expect(items(w)).toHaveLength(1);
  });
});

describe('core/powerups edge — the Force Field in the World', () => {
  it('uses up the bullets it absorbs or blocks; blocked hits make no sound', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    grantShield(ship.shield);
    spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
    let events = tick(w, input);
    expect(ship.shield.hits).toBe(4);
    expect(only(events, SimEventKind.Sfx, SFX_CUES.ShieldHit)).toHaveLength(1);
    tick(w, input);
    expect(w.bullets.count).toBe(0);
    // During the i-frames: blocked for free, the bullet is gone, no sound.
    spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
    events = tick(w, input);
    expect(ship.shield.hits).toBe(4);
    expect(ship.shield.absorbed).toBe(2);
    expect(only(events, SimEventKind.Sfx, SFX_CUES.ShieldHit)).toEqual([]);
    tick(w, input);
    expect(w.bullets.count).toBe(0);
    expect(ship.hits).toBe(0);
  });

  it('absorbs a laser beam', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    grantShield(ship.shield);
    fireLaser(w, { slot: -1, x: ship.x + 60, y: ship.y }, 512, 120, 0, 0, 20, 8, 0);
    for (let t = 0; t < 25; t++) tick(w, input);
    expect(ship.hits).toBe(0);
    // 20 active ticks, one costly hit every 9: three hits.
    expect(ship.shield.hits).toBe(FORCE_FIELD_HITS - 3);
    expect(ship.shield.absorbed).toBe(20);
  });

  it('starts fully powered sessions with a Force Field and default ones without', () => {
    const full = world({ loadout: 'full' });
    expect(full.players.map((p) => p.shield.hits)).toEqual([FORCE_FIELD_HITS, FORCE_FIELD_HITS]);
    expect(full.powerups.equippable(0) & (1 << MeterSlot.Shield)).toBe(0);
    const plain = world();
    expect(plain.players.map((p) => p.shield.kind)).toEqual([ShieldKind.None, ShieldKind.None]);
  });

  it('is not drawn for a dying ship or an inactive P2, and blinks with invulnerability', () => {
    const w = world({ loadout: 'full' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    tick(w, input);
    const batch = w.powerups.shieldBatch;
    expect(batch.count).toBe(1); // player 2 has one too, but is not in play
    ship.invulnTicks = 5; // (4 & 4) after this tick's count-down → hidden
    tick(w, input);
    expect(ship.invulnTicks).toBe(4);
    expect(batch.flags[0] & SpriteFlag.Hidden).toBe(SpriteFlag.Hidden);
    ship.invulnTicks = 0;
    tick(w, input);
    expect(batch.flags[0]).toBe(0);
    setPlayerState(ship, 'dying');
    tick(w, input);
    expect(batch.count).toBe(0);
  });

  it('breaks and is re-granted by an auto-equipped "?" on the same tick', () => {
    const w = world({ stage: 'quiet', autoPowerUp: true, autoPowerUpOrder: ['shield'] });
    const input = createInputSnapshot();
    const ship = w.players[0];
    grantShield(ship.shield);
    ship.shield.hits = 1;
    spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
    w.powerups.meters[0].cursor = MeterSlot.Option;
    capsule(w, ship.x - w.camera.x, ship.y - w.camera.y);
    const events = tick(w, input);
    expect(ship.shield.brokeTick).toBe(ship.shield.hitTick);
    expect(only(events, SimEventKind.Sfx, SFX_CUES.ShieldBreak)).toHaveLength(1);
    expect(only(events, SimEventKind.Particles, FX_CUES.ShieldBreak)).toHaveLength(1);
    expect(only(events, SimEventKind.PowerUp)).toMatchObject([{ id: MeterSlot.Shield }]);
    expect([ship.shield.kind, ship.shield.hits, ship.shield.iFrames]).toEqual([
      ShieldKind.ForceField,
      FORCE_FIELD_HITS,
      0,
    ]);
    expect(w.powerups.shieldBatch.count).toBe(1);
    expect(ship.hits).toBe(0);
  });
});
