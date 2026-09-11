/**
 * `core/powerups` (plan M1-11 acceptance): the meter's wrap and maxed rules, Double / Laser
 * exclusivity, equipping only on the pressed edge (holding OK never re-equips), the Auto Power-Up
 * order, rapid successive pickups each advancing, the pickup magnet, capsules from enemy and
 * formation drops, the Force Field in the World (hits, i-frames, no terrain absorption, break
 * events), Mega Crash (bullets, enemies, immunity, flash, credit) and determinism. The
 * allocation guard lives in `powerups-alloc.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { spawnBullet, BulletKind } from '../../src/bullets/index.js';
import {
  DEFAULT_AUTO_POWER_UP_ORDER,
  resolveGameConfig,
  type GameConfig,
  type MeterSlotName,
} from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { PlayerHitCause, createPlayer } from '../../src/player/index.js';
import {
  CAPSULE_SCORE,
  ITEM_RADIUS,
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
  moduleInfo,
} from '../../src/powerups/index.js';
import { LayerId, SpriteFlag } from '../../src/presentation/index.js';
import { ShieldKind, grantShield } from '../../src/shields/index.js';
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
 * Test content: the KESTREL, Type A weapons, the shipped tileset, test enemies, a static stage `t`
 * (flat 32-px floor) whose timeline starts a three-member formation of `weak` enemies, and the
 * same stage without events (`quiet`).
 *
 * @returns The DB.
 */
function db(): ContentDb {
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
    {
      path: 'stages/t.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 't',
        name: 'T',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 3000,
        camera: [{ x: 0, speed: 0 }],
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
        events: [
          {
            x: 0,
            type: 'formation',
            enemy: 'weak',
            count: 3,
            interval: 30,
            screenX: 200,
            y: 100,
            bonus: 500,
          },
        ],
      },
    },
  ];
  // `t` without its formation: a quiet stage for everything but the formation test.
  const quiet = JSON.parse(JSON.stringify(files[4].data)) as { id: string; events: unknown[] };
  quiet.id = 'quiet';
  quiet.events = [];
  files.push({ path: 'stages/quiet.stage.json', data: quiet });
  const { db: content, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB (content is read-only). */
const DB = db();

/**
 * A free-flight world (no stage) whose player 1 is alive, parked at (`x`, `y`) in the view.
 *
 * @param config - Config overrides.
 * @param x - Ship x relative to the camera.
 * @param y - Ship y relative to the camera.
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}, x = 60, y = 100): World {
  const w = createWorld(
    resolveGameConfig({ seed: 3, autofire: false, remoteMode: false, ...config }),
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
 * Steps a world once with player 1 holding `held` (edges computed from the previous tick) and
 * collects the events.
 *
 * @param w - The world.
 * @param input - The snapshot (kept across ticks, so `pressed` is a real edge).
 * @param held - Actions held this tick.
 * @returns The events of the tick.
 */
function tick(w: World, input: InputSnapshot, held = 0): SimEvent[] {
  commitPlayerInput(input.players[0], held);
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

describe('core/powerups — the meter', () => {
  it('describes itself and names the seven slots in meter order', () => {
    expect(moduleInfo.name).toBe('powerups');
    expect(moduleInfo.status).toBe('partial');
    expect(METER_SLOT_COUNT).toBe(7);
    expect(METER_LABELS).toEqual(['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', '?', '!']);
    const names: MeterSlotName[] = [
      'speed',
      'missile',
      'double',
      'laser',
      'option',
      'shield',
      'mega',
    ];
    expect(names.map(meterSlotOf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(MeterSlot.Mega).toBe(6);
  });

  it('advances from none to Speed and wraps after "!"', () => {
    const meter = createPowerMeter();
    expect(meter.cursor).toBe(-1);
    const seen: number[] = [];
    for (let i = 0; i < 9; i++) seen.push(advanceMeter(meter));
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 0, 1]);
  });

  it('greys maxed slots: Speed ×5, Missile ×1, Option ×4, "?" while a shield is up', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    // Everything: the basic shot is neither the Double nor the Laser.
    expect(equippableSlots(ship, loadout, 5)).toBe(0b1111111);
    for (let i = 0; i < 5; i++) expect(equipSlot(MeterSlot.Speed, ship, loadout, 5)).toBe(true);
    expect(ship.speedLevel).toBe(5);
    expect(canEquipSlot(MeterSlot.Speed, ship, loadout, 5)).toBe(false);
    expect(equipSlot(MeterSlot.Speed, ship, loadout, 5)).toBe(false);
    expect(equipSlot(MeterSlot.Missile, ship, loadout, 5)).toBe(true);
    expect(canEquipSlot(MeterSlot.Missile, ship, loadout, 5)).toBe(false);
    for (let i = 0; i < 4; i++) expect(equipSlot(MeterSlot.Option, ship, loadout, 5)).toBe(true);
    expect(loadout.options).toBe(4);
    expect(canEquipSlot(MeterSlot.Option, ship, loadout, 5)).toBe(false);
    expect(equipSlot(MeterSlot.Shield, ship, loadout, 5)).toBe(true);
    expect(ship.shield.kind).toBe(ShieldKind.ForceField);
    expect(canEquipSlot(MeterSlot.Shield, ship, loadout, 5)).toBe(false);
    // "!" is never maxed; unknown codes never equip.
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 5)).toBe(true);
    expect(canEquipSlot(7, ship, loadout, 5)).toBe(false);
    expect(canEquipSlot(-1, ship, loadout, 5)).toBe(false);
    expect(equippableSlots(ship, loadout, 5)).toBe(
      (1 << MeterSlot.Double) | (1 << MeterSlot.Laser) | (1 << MeterSlot.Mega),
    );
  });

  it('keeps Double and Laser mutually exclusive', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    expect(equipSlot(MeterSlot.Double, ship, loadout, 5)).toBe(true);
    expect(loadout.main).toBe(MainWeapon.Double);
    expect(canEquipSlot(MeterSlot.Double, ship, loadout, 5)).toBe(false);
    expect(canEquipSlot(MeterSlot.Laser, ship, loadout, 5)).toBe(true);
    expect(equipSlot(MeterSlot.Laser, ship, loadout, 5)).toBe(true);
    expect(loadout.main).toBe(MainWeapon.Laser);
    expect(canEquipSlot(MeterSlot.Double, ship, loadout, 5)).toBe(true);
    expect(canEquipSlot(MeterSlot.Laser, ship, loadout, 5)).toBe(false);
  });
});

describe('core/powerups — in the World', () => {
  it('registers the item pool and draws items and shields', () => {
    const w = world();
    expect(w.pools.entries.map((e) => e.name)).toContain('items');
    expect(w.powerups.pool.capacity).toBe(MAX_ITEMS);
    expect(w.powerups.itemBatch.layer).toBe(LayerId.Items);
    expect(w.powerups.shieldBatch.layer).toBe(LayerId.Player);
    expect(w.config.powerUpMode).toBe('meter');
    const input = createInputSnapshot();
    capsule(w, 250, 50);
    grantShield(w.players[0].shield);
    tick(w, input);
    const items = w.powerups.itemBatch;
    expect(items.count).toBe(1);
    expect(w.content.sprites.names[items.spriteId[0]]).toBe('items/capsule');
    const shields = w.powerups.shieldBatch;
    expect(shields.count).toBe(1);
    expect(w.content.sprites.names[shields.spriteId[0]]).toBe('shields/force-field');
    expect([shields.x[0], shields.y[0], shields.frame[0]]).toEqual([
      w.players[0].x,
      w.players[0].y,
      0,
    ]);
  });

  it('equips only on the pressed edge: holding OK does not re-equip', () => {
    const w = world();
    const input = createInputSnapshot();
    const meter = w.powerups.meters[0];
    meter.cursor = MeterSlot.Speed;
    let events = tick(w, input, Action.PowerUp);
    expect(w.players[0].speedLevel).toBe(1);
    expect(meter.cursor).toBe(-1);
    expect(events.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PowerUpEquip)).toBe(
      true,
    );
    expect(events.find((e) => e.kind === SimEventKind.PowerUp)).toMatchObject({
      id: MeterSlot.Speed,
      param: 0,
    });
    // Still holding OK while the cursor comes back to Speed: nothing happens.
    meter.cursor = MeterSlot.Speed;
    for (let i = 0; i < 20; i++) {
      events = tick(w, input, Action.PowerUp);
      expect(events.filter((e) => e.kind === SimEventKind.PowerUp)).toEqual([]);
    }
    expect([w.players[0].speedLevel, meter.cursor]).toEqual([1, MeterSlot.Speed]);
    // Release, press again: equips.
    tick(w, input, 0);
    tick(w, input, Action.PowerUp | Action.Up); // OK while holding an arrow
    expect([w.players[0].speedLevel, meter.cursor]).toEqual([2, -1]);
  });

  it('denies a press on an empty or greyed slot (the cursor stays)', () => {
    const w = world();
    const input = createInputSnapshot();
    let events = tick(w, input, Action.PowerUp);
    expect(events.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PowerUpDenied)).toBe(
      true,
    );
    tick(w, input);
    w.weapons.loadouts[0].missile = true;
    w.powerups.meters[0].cursor = MeterSlot.Missile;
    events = tick(w, input, Action.PowerUp);
    expect(events.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PowerUpDenied)).toBe(
      true,
    );
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Missile);
    expect(w.powerups.equippable(0) & (1 << MeterSlot.Missile)).toBe(0);
  });

  it('counts every capsule of a quick succession (three at once → cursor on Double)', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    for (let k = 0; k < 3; k++) capsule(w, ship.x - w.camera.x + k, ship.y - w.camera.y);
    const events = tick(w, input);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Double);
    expect(w.powerups.outcomes.pickupCount).toBe(3);
    expect(Array.from(w.powerups.outcomes.pickupScore.subarray(0, 3))).toEqual([
      CAPSULE_SCORE,
      CAPSULE_SCORE,
      CAPSULE_SCORE,
    ]);
    expect(
      events.filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.MeterAdvance),
    ).toHaveLength(3);
    tick(w, input);
    expect(items(w)).toEqual([]);
    expect(w.powerups.pool.count).toBe(0);
  });

  it('collects with the pickup box (closed test) and only while alive', () => {
    const w = world({ pickupMagnet: false });
    const input = createInputSnapshot();
    const ship = w.players[0];
    const box = w.ship.pickupBox;
    // Touching the right edge of the pickup box: collected.
    capsule(w, ship.x - w.camera.x + box.hw + ITEM_RADIUS, ship.y - w.camera.y);
    tick(w, input);
    expect(w.powerups.meters[0].cursor).toBe(0);
    // Half a pixel further out: not collected.
    capsule(w, ship.x - w.camera.x + box.hw + ITEM_RADIUS + 0.5, ship.y - w.camera.y);
    tick(w, input);
    expect(w.powerups.meters[0].cursor).toBe(0);
    expect(items(w)).toHaveLength(1);
    ship.state = 'dying';
    capsule(w, ship.x - w.camera.x, ship.y - w.camera.y);
    tick(w, input);
    expect(w.powerups.meters[0].cursor).toBe(0);
  });

  it('pulls items within 16 px of the pickup box towards the ship (magnet)', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const box = w.ship.pickupBox;
    const reach = box.hw + ITEM_RADIUS + PICKUP_MAGNET_RANGE;
    const near = capsule(w, ship.x - w.camera.x + reach - 1, ship.y - w.camera.y);
    capsule(w, ship.x - w.camera.x + reach + 30, ship.y - w.camera.y + 40);
    const fields = w.powerups.pool.fields;
    const x0 = fields.x[near];
    tick(w, input);
    expect(fields.x[near]).toBeCloseTo(x0 - PICKUP_MAGNET_SPEED, 9);
    expect(fields.flags[near] & ItemFlag.Magnet).toBe(ItemFlag.Magnet);
    for (let i = 0; i < 20; i++) tick(w, input);
    expect(w.powerups.meters[0].cursor).toBe(0);
    // The far one never moved (world-space capsules stay with the terrain).
    expect(items(w)).toEqual([
      { x: w.camera.x + ship.x - w.camera.x + reach + 30, y: ship.y + 40 },
    ]);
    // Without the magnet nothing drifts.
    const off = world({ pickupMagnet: false });
    const i = capsule(off, off.players[0].x - off.camera.x + reach - 1, 100);
    const x1 = off.powerups.pool.fields.x[i];
    for (let k = 0; k < 10; k++) tick(off, input);
    expect(off.powerups.pool.fields.x[i]).toBe(x1);
  });

  it('drops a capsule where a capsule enemy dies and scrolls it with the terrain', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    w.camera.vx = 0;
    const carrier = spawn(w, 'carrier', 300, 60);
    w.enemies.damage(carrier, 1, 0);
    tick(w, input);
    expect(items(w)).toEqual([{ x: carrier.x, y: carrier.y }]);
    // A kill between ticks (debug tools) still drops its capsule at the next tick.
    const other = spawn(w, 'carrier', 320, 30);
    w.enemies.kill(other);
    tick(w, input);
    expect(items(w)).toHaveLength(2);
  });

  it('turns a completed formation into a capsule (stage timeline)', () => {
    const w = world({ stage: 't' });
    const input = createInputSnapshot();
    let bonus = 0;
    for (let t = 0; t < 120 && bonus === 0; t++) {
      for (const e of w.enemies.enemies) {
        if (e.state === EnemyState.Live && (e.flags & EnemyFlag.Ghost) === 0) w.enemies.kill(e, 0);
      }
      for (const ev of tick(w, input)) if (ev.kind === SimEventKind.FormationBonus) bonus++;
    }
    expect(bonus).toBe(1);
    tick(w, input);
    expect(items(w)).toHaveLength(1);
  });

  it('follows the Auto Power-Up order: Speed, Missile, Laser, Option ×4, "?"', () => {
    const w = world({ autoPowerUp: true, pickupMagnet: false });
    expect(w.config.autoPowerUpOrder).toEqual(DEFAULT_AUTO_POWER_UP_ORDER);
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    const log: string[] = [];
    for (let k = 0; k < 40 && ship.shield.kind === ShieldKind.None; k++) {
      expect(w.powerups.nextAutoSlot(0)).toBeGreaterThanOrEqual(0);
      w.powerups.collect(0);
      log.push(`${ship.speedLevel}${loadout.missile ? 'M' : ''}${loadout.main}${loadout.options}`);
    }
    // Equipping resets the cursor, so slot k takes k + 1 capsules: Speed at the 1st capsule,
    // Missile at the 3rd, Laser at the 7th, then an Option every 5, the Force Field after 6 more.
    expect(log.slice(0, 8)).toEqual(['100', '100', '1M00', '1M00', '1M00', '1M00', '1M20', '1M20']);
    expect(log).toHaveLength(1 + 2 + 4 + 4 * 5 + 6);
    expect([ship.speedLevel, loadout.missile, loadout.main, loadout.options]).toEqual([
      1,
      true,
      MainWeapon.Laser,
      4,
    ]);
    expect(ship.shield.hits).toBe(5);
    expect(w.powerups.nextAutoSlot(0)).toBe(-1);
    // A broken shield is wanted again.
    ship.shield.hits = 0;
    ship.shield.kind = ShieldKind.None;
    expect(w.powerups.nextAutoSlot(0)).toBe(MeterSlot.Shield);
  });

  it('auto-equips only the next wanted slot, never a parked one, and only when enabled', () => {
    const manual = world({ pickupMagnet: false });
    manual.powerups.collect(0);
    expect([manual.players[0].speedLevel, manual.powerups.meters[0].cursor]).toEqual([0, 0]);
    // Double first, then Laser: both are satisfied once the Laser is in (no ping-pong).
    const order: MeterSlotName[] = ['double', 'laser', 'speed'];
    const w = world({ autoPowerUp: true, autoPowerUpOrder: order });
    const loadout = w.weapons.loadouts[0];
    w.powerups.meters[0].cursor = MeterSlot.Missile;
    w.powerups.collect(0); // lands on Double: wanted
    expect([loadout.main, w.powerups.meters[0].cursor]).toEqual([MainWeapon.Double, -1]);
    expect(w.powerups.nextAutoSlot(0)).toBe(MeterSlot.Laser);
    w.powerups.meters[0].cursor = MeterSlot.Double;
    w.powerups.collect(0); // Laser
    expect(loadout.main).toBe(MainWeapon.Laser);
    expect(w.powerups.nextAutoSlot(0)).toBe(MeterSlot.Speed);
    // Six Speed entries on a 5-level ship: satisfied at the top speed.
    const fast = world({ autoPowerUp: true, autoPowerUpOrder: Array(8).fill('speed') });
    fast.players[0].speedLevel = 5;
    expect(fast.powerups.nextAutoSlot(0)).toBe(-1);
    const none = world({ autoPowerUp: true, autoPowerUpOrder: [] });
    none.powerups.collect(0);
    expect(none.players[0].speedLevel).toBe(0);
  });

  it('adds an Option that follows the ship from the tick it is equipped', () => {
    const w = world();
    const input = createInputSnapshot();
    w.powerups.meters[0].cursor = MeterSlot.Option;
    tick(w, input, Action.PowerUp);
    expect(w.weapons.loadouts[0].options).toBe(1);
    expect(w.weapons.options[0].count).toBe(1);
  });
});

describe('core/powerups — the Force Field in the World', () => {
  it('absorbs five bullets with 8-tick i-frames, then breaks with its events', () => {
    const w = world({ stage: 'quiet' }, 60, 100);
    const input = createInputSnapshot();
    const ship = w.players[0];
    grantShield(ship.shield);
    const events: SimEvent[] = [];
    const hitTicks: number[] = [];
    let hits = ship.shield.hits;
    for (let t = 0; t < 80 && ship.shield.kind !== ShieldKind.None; t++) {
      // A bullet on the ship every tick.
      spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
      events.push(...tick(w, input));
      if (ship.shield.hits < hits) hitTicks.push(t);
      hits = ship.shield.hits;
    }
    expect(ship.hits).toBe(0);
    expect(hitTicks).toHaveLength(5);
    for (let k = 1; k < hitTicks.length; k++) expect(hitTicks[k] - hitTicks[k - 1]).toBe(9);
    const sfx = events.filter((e) => e.kind === SimEventKind.Sfx).map((e) => e.id);
    expect(sfx.filter((id) => id === SFX_CUES.ShieldHit)).toHaveLength(4);
    expect(sfx.filter((id) => id === SFX_CUES.ShieldBreak)).toHaveLength(1);
    expect(
      events.filter((e) => e.kind === SimEventKind.Particles && e.id === FX_CUES.ShieldBreak),
    ).toHaveLength(1);
    expect(w.powerups.shieldBatch.count).toBe(0);
    // The break's i-frames cover the bare ship; then bullets reach it.
    for (let t = 0; t < 12; t++) {
      spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
      tick(w, input);
    }
    expect(ship.hits).toBeGreaterThan(0);
    expect(ship.hitCause).toBe(PlayerHitCause.Bullet);
  });

  it('shows wear and blinks during its i-frames', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    grantShield(ship.shield);
    ship.shield.hits = 2;
    tick(w, input);
    const batch = w.powerups.shieldBatch;
    expect(batch.frame[0]).toBe(2);
    ship.shield.iFrames = 3; // (3 & 2) → hidden this tick
    ship.shield.hitTick = w.tick; // not counted down on the tick it is set
    tick(w, input);
    expect(batch.flags[0] & SpriteFlag.Hidden).toBe(SpriteFlag.Hidden);
  });

  it('does not absorb terrain contact', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    grantShield(ship.shield);
    ship.y = w.camera.y + 200 - 28; // the terrain box reaches into the 32-px floor
    for (let i = 0; i < 3; i++) tick(w, input);
    expect(ship.hits).toBeGreaterThan(0);
    expect(ship.hitCause).toBe(PlayerHitCause.Terrain);
    expect(ship.shield.hits).toBe(5);
  });

  it('absorbs enemy contact', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    grantShield(ship.shield);
    spawn(w, 'target', ship.x - w.camera.x, ship.y - w.camera.y);
    tick(w, input);
    expect([ship.hits, ship.shield.hits]).toEqual([0, 4]);
  });
});

describe('core/powerups — Mega Crash', () => {
  it('cancels bullets, destroys non-immune enemies (credited), flashes; no ship effect', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    const a = spawn(w, 'target', 250, 50);
    const b = spawn(w, 'weak', 300, 120);
    b.flags |= EnemyFlag.Invulnerable; // armour does not protect
    const immune = spawn(w, 'immune', 200, 150);
    const carrier = spawn(w, 'carrier', 320, 40);
    for (let k = 0; k < 10; k++)
      spawnBullet(w, w.camera.x + 200 + k * 5, w.camera.y + 30, 512, 0.5, 0);
    expect(w.bullets.count).toBe(10);
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    const events = tick(w, input, Action.PowerUp);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    expect([a.state, b.state, carrier.state]).toEqual([
      EnemyState.Free,
      EnemyState.Free,
      EnemyState.Free,
    ]);
    expect(immune.state).toBe(EnemyState.Live);
    expect(w.bullets.count).toBe(0);
    const o = w.enemies.outcomes;
    expect(o.killCount).toBe(3);
    expect(Array.from(o.killBy.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: SimEventKind.Flash, param: MEGA_CRASH_FLASH_TICKS }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: SimEventKind.Sfx, id: SFX_CUES.MegaCrash }),
    );
    expect(
      events.some((e) => e.kind === SimEventKind.Particles && e.id === FX_CUES.BulletCancel),
    ).toBe(true);
    // The carrier's capsule dropped like any other kill.
    expect(items(w)).toHaveLength(1);
    expect(w.players[0].hits).toBe(0);
    // "!" is never greyed.
    expect(w.powerups.canEquip(0, MeterSlot.Mega)).toBe(true);
  });

  it('can be detonated directly (tools) and credits nobody for a bad player', () => {
    const w = world();
    spawn(w, 'target', 250, 50);
    expect(w.powerups.detonateMegaCrash(-1)).toBe(1);
    expect(w.enemies.outcomes.killBy[0]).toBe(-1);
  });
});

describe('core/powerups — determinism and restarts', () => {
  it('keeps two lockstep worlds equal through pickups, equips and Mega Crash', () => {
    const run = (): number[] => {
      const w = world({ stage: 'quiet', autoPowerUp: true });
      const input = createInputSnapshot();
      const hashes: number[] = [];
      for (let t = 0; t < 400; t++) {
        if (t % 25 === 0) capsule(w, 80 + (t % 7) * 10, 90 + (t % 5) * 5);
        if (t % 60 === 0) spawn(w, 'carrier', 250, 60);
        const held =
          (t % 90 < 45 ? Action.Right : Action.Left) | (t % 50 === 0 ? Action.PowerUp : 0);
        tick(w, input, held);
        if (t % 20 === 0) hashes.push(hashWorld(w));
      }
      return hashes;
    };
    expect(run()).toEqual(run());
  });

  it('hashes the meter, the pending Mega Crash and the shield', () => {
    const w = world();
    const base = hashWorld(w);
    const probes: [string, () => void, () => void][] = [
      ['cursor', () => (w.powerups.meters[0].cursor = 3), () => (w.powerups.meters[0].cursor = -1)],
      ['mega', () => (w.powerups.megaPending[0] = 1), () => (w.powerups.megaPending[0] = 0)],
      ['shield', () => (w.players[0].shield.hits = 2), () => (w.players[0].shield.hits = 0)],
      ['iFrames', () => (w.players[1].shield.iFrames = 2), () => (w.players[1].shield.iFrames = 0)],
    ];
    for (const [label, change, undo] of probes) {
      change();
      expect(hashWorld(w), label).not.toBe(base);
      undo();
      expect(hashWorld(w), label).toBe(base);
    }
  });

  it('empties the items on a checkpoint restart', () => {
    const w = world({ stage: 'quiet' });
    const input = createInputSnapshot();
    capsule(w, 200, 50);
    w.powerups.megaPending[0] = 1;
    w.stage!.restartAt(0);
    expect(w.powerups.pool.count).toBe(0);
    expect(w.powerups.megaPending[0]).toBe(0);
    tick(w, input);
    expect(items(w)).toEqual([]);
  });
});
