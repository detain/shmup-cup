/**
 * Edge cases of Direct mode's items (plan M2-05, shmup_feat.md §6B) beyond `powerups-direct`: the
 * tables (item kinds, sprites, drop codes, the default plan), `directMaxLevel` / `directItemKind`
 * on odd input, `collectDirect` with bad players and items (nothing happens — no cue either), with
 * content lacking families or with a single main family, the octagon capping the level to a shorter
 * family, the exact feedback events of every colour, `dropDirect` on a full pool, the drift pairs,
 * the drift with a scrolling view, the cull, the top bounce, the capsule's endless life, the Speed
 * toggle's corner cases, the Direct-mode death penalty in a World under every preset and the
 * continue that restores the starting loadout.
 */
import { describe, expect, it } from 'vitest';
import { DIRECT_ITEMS, ENEMY_DROPS } from '../../src/data/index.js';
import { DropKind } from '../../src/enemies/index.js';
import { SFX_CUES, SfxPriority, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { Action, createInputSnapshot } from '../../src/input/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import {
  DEFAULT_DIRECT_ITEM_PLAN,
  DIRECT_ITEM_DRIFT,
  DIRECT_ITEM_KINDS,
  DIRECT_ITEM_SCORE,
  DIRECT_ITEM_SPRITES,
  DIRECT_ITEM_TICKS,
  DIRECT_POWER_UP_EVENT_BASE,
  FREE_OPTION_TICKS,
  ITEM_CULL_MARGIN,
  ITEM_KINDS,
  ITEM_SPRITES,
  ItemKind,
  MAX_ITEMS,
  METER_SLOT_COUNT,
  MeterSlot,
  applyDirectDeathPenalty,
  directItemKind,
  directMaxLevel,
  type DirectItem,
} from '../../src/powerups/index.js';
import { MAX_LIVES } from '../../src/scoring/index.js';
import {
  FORCE_FIELD,
  ShieldKind,
  collectArm,
  grantShield,
  shieldActive,
} from '../../src/shields/index.js';
import { DIRECT_MAX_LEVEL } from '../../src/weapons/index.js';
import {
  ENGINE_SPRITES,
  canContinue,
  continueWorld,
  stepWorld,
  type World,
} from '../../src/world/index.js';
import type { WeaponFamilySpec } from '../../src/data/index.js';
import { aliveWorld, directDb, familyDb, run, testWeapon } from '../helpers/direct.js';

/** The shipped Direct-mode content. */
const DB = directDb();

/**
 * Drains a world's events.
 *
 * @param w - The world.
 * @returns Copies of the events.
 */
function drain(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * The `[kind, id]` pairs of events.
 *
 * @param events - Events.
 * @returns The pairs.
 */
function pairs(events: readonly SimEvent[]): Array<[number, number]> {
  return events.map((e) => [e.kind, e.id]);
}

/**
 * A family of `n` levels of one weapon.
 *
 * @param id - Family id.
 * @param slot - Its slot.
 * @param weapon - The weapon every level fires.
 * @param n - Levels.
 * @returns The entry.
 */
function family(
  id: string,
  slot: 'main' | 'sub',
  weapon: string,
  n: number,
): Record<string, unknown> {
  return {
    id,
    label: id.toUpperCase().slice(0, 5),
    slot,
    levels: Array.from({ length: n }, () => ({ shots: [{ weapon }] })),
  };
}

describe('core/powerups Direct mode — the tables', () => {
  it('numbers the colour items 3–8 after the capsules and freed Options, 300 points each', () => {
    expect(DIRECT_ITEM_KINDS).toEqual([3, 4, 5, 6, 7, 8]);
    expect([ItemKind.DirectRed, ItemKind.DirectOctagon]).toEqual([3, 8]);
    // M2-10 appended the bonus stages' 1UP and bonus capsule after the colour items.
    expect(ITEM_KINDS).toHaveLength(ItemKind.BonusCapsule + 1);
    expect([ItemKind.OneUp, ItemKind.BonusCapsule]).toEqual([9, 10]);
    for (let i = 0; i < DIRECT_ITEMS.length; i++) {
      const spec = ITEM_KINDS[DIRECT_ITEM_KINDS[i]];
      expect(spec).toEqual({ sprite: 'items/direct-' + DIRECT_ITEMS[i], frames: 2, score: 300 });
      expect(DIRECT_ITEM_SPRITES[i]).toBe(spec.sprite);
      expect(ITEM_SPRITES).toContain(spec.sprite);
      expect(ENGINE_SPRITES).toContain(spec.sprite);
    }
    expect(DIRECT_ITEM_SCORE).toBe(300);
    expect(Object.isFrozen(DIRECT_ITEM_KINDS)).toBe(true);
    expect(Object.isFrozen(DIRECT_ITEM_SPRITES)).toBe(true);
  });

  it('maps every colour to its kind, an unknown name to -1', () => {
    for (let i = 0; i < DIRECT_ITEMS.length; i++) {
      expect(directItemKind(DIRECT_ITEMS[i])).toBe(ItemKind.DirectRed + i);
    }
    for (const bad of ['purple', '', 'RED', 'capsule']) {
      expect(directItemKind(bad as DirectItem)).toBe(-1);
    }
  });

  it('keeps the content drop codes before the Option Hunter`s freed Option', () => {
    // The enemy tables store `ENEMY_DROPS.indexOf(drop) + 1`: the codes must line up.
    expect(ENEMY_DROPS.indexOf('capsule') + 1).toBe(DropKind.Capsule);
    expect(ENEMY_DROPS.indexOf('blueCapsule') + 1).toBe(DropKind.BlueCapsule);
    expect(ENEMY_DROPS.indexOf('powerup') + 1).toBe(DropKind.PowerUp);
    expect(DropKind.FreeOption).toBe(ENEMY_DROPS.length + 1);
  });

  it('plans every colour in the default plan and keeps the effect ids above the meter slots', () => {
    expect(Object.isFrozen(DEFAULT_DIRECT_ITEM_PLAN)).toBe(true);
    for (const colour of DEFAULT_DIRECT_ITEM_PLAN) expect(DIRECT_ITEMS).toContain(colour);
    for (const colour of DIRECT_ITEMS) expect(DEFAULT_DIRECT_ITEM_PLAN).toContain(colour);
    expect(DIRECT_POWER_UP_EVENT_BASE).toBeGreaterThanOrEqual(METER_SLOT_COUNT);
    expect(DIRECT_ITEM_DRIFT).toHaveLength(4);
    // Both pairs drift left, one up and one down.
    expect(DIRECT_ITEM_DRIFT[0]).toBeLessThan(0);
    expect(DIRECT_ITEM_DRIFT[2]).toBeLessThan(0);
    expect(DIRECT_ITEM_DRIFT[1] * DIRECT_ITEM_DRIFT[3]).toBeLessThan(0);
  });

  it('directMaxLevel: levels − 1, never below 0 nor above the direct maximum', () => {
    const levels = (n: number): WeaponFamilySpec => ({
      id: 'f',
      label: 'F',
      slot: 'main',
      levels: Array.from({ length: n }, () => ({ shots: [] })),
    });
    expect(directMaxLevel(null)).toBe(0);
    expect(directMaxLevel(undefined)).toBe(0);
    expect(directMaxLevel(levels(0))).toBe(0);
    expect(directMaxLevel(levels(1))).toBe(0);
    expect(directMaxLevel(levels(4))).toBe(3);
    expect(directMaxLevel(levels(9))).toBe(DIRECT_MAX_LEVEL);
    expect(directMaxLevel(levels(12))).toBe(DIRECT_MAX_LEVEL);
  });
});

describe('core/powerups Direct mode — collectDirect edges', () => {
  it('a bad player or item does nothing at all: no level, no cue', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    const lives = w.players[0].lives;
    drain(w);
    for (const player of [-1, 0.5, Number.NaN, 2, 7]) {
      expect(w.powerups.collectDirect(player, 0)).toBe(false);
    }
    for (const item of [-1, 6, 0.5, Number.NaN, 99]) {
      expect(w.powerups.collectDirect(0, item)).toBe(false);
    }
    expect([loadout.shot, loadout.sub, loadout.family, w.players[0].lives]).toEqual([
      0,
      0,
      0,
      lives,
    ]);
    expect(shieldActive(w.players[0].shield)).toBe(false);
    expect(drain(w)).toEqual([]);
  });

  it('pushes exactly the cues of each colour`s effect (and the pickup cue alone at a cap)', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    const pickup: [number, number] = [SimEventKind.Sfx, SFX_CUES.CapsulePickup];
    const equip: [number, number] = [SimEventKind.Sfx, SFX_CUES.PowerUpEquip];
    const effect = (item: number): [number, number] => [
      SimEventKind.PowerUp,
      DIRECT_POWER_UP_EVENT_BASE + item,
    ];
    drain(w);
    // Red, green, blue, the octagon: the equip cue and the effect.
    for (const item of [0, 1, 2, 5]) {
      expect(w.powerups.collectDirect(0, item)).toBe(true);
      const events = drain(w);
      expect(pairs(events), DIRECT_ITEMS[item]).toEqual([pickup, equip, effect(item)]);
      // The effect event names the player, at the ship.
      expect(events[2]).toMatchObject({
        param: 0,
        x: Math.floor(ship.x),
        y: Math.floor(ship.y),
      });
    }
    // Orange: the 1UP jingle (critical) instead of the equip cue.
    expect(w.powerups.collectDirect(0, 3)).toBe(true);
    const orange = drain(w);
    expect(pairs(orange)).toEqual([pickup, [SimEventKind.Sfx, SFX_CUES.ExtraLife], effect(3)]);
    expect(orange[1].param).toBe(SfxPriority.Critical);
    // Yellow: Mega Crash's sound and flash, no equip cue.
    expect(w.powerups.collectDirect(0, 4)).toBe(true);
    const yellow = pairs(drain(w));
    expect(yellow[0]).toEqual(pickup);
    expect(yellow).toContainEqual([SimEventKind.Sfx, SFX_CUES.MegaCrash]);
    expect(yellow[yellow.length - 1]).toEqual(effect(4));
    expect(yellow).not.toContainEqual(equip);
    // At the caps: the pickup cue only.
    w.weapons.loadouts[0].shot = DIRECT_MAX_LEVEL;
    w.weapons.loadouts[0].sub = DIRECT_MAX_LEVEL;
    ship.lives = MAX_LIVES;
    for (const item of [0, 1, 3]) {
      expect(w.powerups.collectDirect(0, item)).toBe(false);
      expect(pairs(drain(w)), DIRECT_ITEMS[item]).toEqual([pickup]);
    }
  });

  it('orange climbs to exactly 9 lives', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    ship.lives = MAX_LIVES - 2;
    expect(w.powerups.collectDirect(0, 3)).toBe(true);
    expect(w.powerups.collectDirect(0, 3)).toBe(true);
    expect(w.powerups.collectDirect(0, 3)).toBe(false);
    expect(ship.lives).toBe(MAX_LIVES);
  });

  it('blue replaces a meter shield with the green Arm; a repair is still an effect', () => {
    const w = aliveWorld(DB);
    const shield = w.players[0].shield;
    grantShield(shield, FORCE_FIELD);
    expect(w.powerups.collectDirect(0, 2)).toBe(true);
    expect([shield.kind, shield.tier, shield.hits, shield.charge]).toEqual([
      ShieldKind.Arm,
      1,
      3,
      1,
    ]);
    shield.hits = 1;
    expect(w.powerups.collectDirect(0, 2)).toBe(true);
    expect([shield.hits, shield.charge]).toEqual([3, 2]);
  });

  it('without families red, green and the octagon only give points; blue still works', () => {
    const db = familyDb([testWeapon('w.main', 'main')], []);
    const w = aliveWorld(db);
    expect(w.weapons.mainFamilies).toEqual([]);
    expect(w.weapons.subFamily).toBeNull();
    for (const item of [0, 1, 5]) expect(w.powerups.collectDirect(0, item)).toBe(false);
    const loadout = w.weapons.loadouts[0];
    expect([loadout.shot, loadout.sub, loadout.family]).toEqual([0, 0, 0]);
    expect(w.powerups.collectDirect(0, 2)).toBe(true);
    expect(w.players[0].shield.kind).toBe(ShieldKind.Arm);
  });

  it('a single main family: the octagon changes nothing; red and green stop at short tops', () => {
    const db = familyDb(
      [testWeapon('w.main', 'main'), testWeapon('w.sub', 'sub')],
      [family('solo', 'main', 'w.main', 3), family('side', 'sub', 'w.sub', 2)],
    );
    const w = aliveWorld(db);
    const loadout = w.weapons.loadouts[0];
    expect(w.powerups.collectDirect(0, 5)).toBe(false);
    expect(loadout.family).toBe(0);
    const reds: boolean[] = [];
    for (let i = 0; i < 4; i++) reds.push(w.powerups.collectDirect(0, 0));
    expect(reds).toEqual([true, true, false, false]);
    expect(loadout.shot).toBe(2);
    const greens: boolean[] = [];
    for (let i = 0; i < 3; i++) greens.push(w.powerups.collectDirect(0, 1));
    expect(greens).toEqual([true, false, false]);
    expect(loadout.sub).toBe(1);
  });

  it('the octagon caps the level to a shorter family and keeps it on the way back', () => {
    const db = familyDb(
      [testWeapon('w.a', 'main'), testWeapon('w.b', 'main')],
      [family('long', 'main', 'w.a', 9), family('short', 'main', 'w.b', 4)],
    );
    const w = aliveWorld(db);
    const loadout = w.weapons.loadouts[0];
    loadout.shot = 7;
    expect(w.powerups.collectDirect(0, 5)).toBe(true);
    expect([loadout.family, loadout.shot]).toEqual([1, 3]);
    // At the short family's top, red gives points only.
    expect(w.powerups.collectDirect(0, 0)).toBe(false);
    expect(w.powerups.collectDirect(0, 5)).toBe(true);
    expect([loadout.family, loadout.shot]).toEqual([0, 3]);
    expect(w.powerups.collectDirect(0, 0)).toBe(true);
    expect(loadout.shot).toBe(4);
  });

  it('a family index beyond the families wraps for the red cap', () => {
    const db = familyDb(
      [testWeapon('w.a', 'main'), testWeapon('w.b', 'main')],
      [family('long', 'main', 'w.a', 9), family('short', 'main', 'w.b', 2)],
    );
    const w = aliveWorld(db);
    const loadout = w.weapons.loadouts[0];
    loadout.family = 3; // 3 % 2 = the short family: top level 1
    expect(w.powerups.collectDirect(0, 0)).toBe(true);
    expect(w.powerups.collectDirect(0, 0)).toBe(false);
    expect(loadout.shot).toBe(1);
    // A negative index is the first family (the one the weapons fire for it): top level 8.
    loadout.family = -1;
    expect(w.powerups.collectDirect(0, 0)).toBe(true);
    expect(loadout.shot).toBe(2);
    // The octagon moves on from it to the second family (level capped to its top, 1).
    expect(w.powerups.collectDirect(0, 5)).toBe(true);
    expect([loadout.family, loadout.shot]).toEqual([1, 1]);
  });
});

describe('core/powerups Direct mode — drops and item motion', () => {
  it('a full item pool drops nothing, but the plan still moves on', () => {
    const w = aliveWorld(DB);
    const cam = w.camera;
    for (let i = 0; i < MAX_ITEMS; i++) {
      expect(w.powerups.spawnItem(ItemKind.Capsule, cam.x + 10 + i, cam.y + 20)).toBeGreaterThan(
        -1,
      );
    }
    expect(w.powerups.dropDirect(cam.x + 100, cam.y + 100)).toBe(-1);
    expect(w.powerups.dropDirect(cam.x + 100, cam.y + 100)).toBe(-1);
    expect(w.powerups.planCursor).toBe(2);
    expect(w.powerups.count).toBe(MAX_ITEMS);
  });

  it('alternates the drift pairs with the plan cursor`s parity', () => {
    const w = aliveWorld(DB);
    const f = w.powerups.pool.fields;
    const seen: number[] = [];
    for (let k = 0; k < 4; k++) {
      const slot = w.powerups.dropDirect(w.camera.x + 100, w.camera.y + 100);
      seen.push(f.vx[slot], f.vy[slot]);
    }
    expect(seen).toEqual([...DIRECT_ITEM_DRIFT, ...DIRECT_ITEM_DRIFT]);
  });

  it('drifts 0.35 px/tick left across a scrolling view', () => {
    const w = aliveWorld(DB, { stage: 'direct-range' });
    w.players[0].active = false; // nobody picks it up
    const slot = w.powerups.spawnItem(ItemKind.DirectRed, w.camera.x + 300, w.camera.y + 100);
    const f = w.powerups.pool.fields;
    f.vx[slot] = DIRECT_ITEM_DRIFT[0];
    f.vy[slot] = 0;
    const camX = w.camera.x;
    const input = createInputSnapshot();
    for (let t = 0; t < 100; t++) stepWorld(w, input);
    expect(w.camera.x).toBeGreaterThan(camX); // the view scrolled …
    expect(f.x[slot] - w.camera.x).toBeCloseTo(300 - 35, 6); // … and the item went with it
    expect(f.y[slot] - w.camera.y).toBeCloseTo(100, 6);
  });

  it('bounces off the playfield`s top too', () => {
    const w = aliveWorld(DB);
    w.players[0].active = false;
    const slot = w.powerups.spawnItem(ItemKind.DirectGreen, w.camera.x + 200, w.camera.y + 12);
    const f = w.powerups.pool.fields;
    f.vx[slot] = 0;
    f.vy[slot] = -1;
    const input = createInputSnapshot();
    let lowest = Infinity;
    for (let t = 0; t < 30; t++) {
      stepWorld(w, input);
      lowest = Math.min(lowest, f.y[slot] - w.camera.y);
    }
    expect(f.vy[slot]).toBe(1);
    expect(lowest).toBeGreaterThan(0);
    expect(w.powerups.count).toBe(1);
  });

  it('culls an item that drifts out of the view before its time is up', () => {
    const w = aliveWorld(DB);
    w.players[0].active = false;
    w.powerups.spawnItem(
      ItemKind.DirectYellow,
      w.camera.x - ITEM_CULL_MARGIN + 0.5,
      w.camera.y + 90,
    );
    const f = w.powerups.pool.fields;
    f.vx[0] = -0.35;
    f.vy[0] = 0;
    stepWorld(w, createInputSnapshot());
    stepWorld(w, createInputSnapshot());
    expect(w.powerups.count).toBe(0);
  });

  it('gives each kind its life: capsules live on, freed Options and colour items 600 ticks', () => {
    const w = aliveWorld(DB);
    w.players[0].active = false;
    const cam = w.camera;
    const capsule = w.powerups.spawnItem(ItemKind.Capsule, cam.x + 200, cam.y + 60);
    const option = w.powerups.spawnItem(ItemKind.FreeOption, cam.x + 200, cam.y + 100);
    const orange = w.powerups.spawnItem(ItemKind.DirectOrange, cam.x + 200, cam.y + 140);
    const f = w.powerups.pool.fields;
    for (const slot of [capsule, option, orange]) {
      f.vx[slot] = 0;
      f.vy[slot] = 0;
    }
    const input = createInputSnapshot();
    const alive = (slot: number): boolean => (f.flags[slot] & 1) === 0;
    for (let t = 1; t <= FREE_OPTION_TICKS + 5; t++) {
      stepWorld(w, input);
      if (t === DIRECT_ITEM_TICKS - 1) expect(alive(orange)).toBe(true);
      if (t === DIRECT_ITEM_TICKS) expect(alive(orange)).toBe(false);
      if (t === FREE_OPTION_TICKS - 1) expect(alive(option)).toBe(true);
      if (t === FREE_OPTION_TICKS) expect(alive(option)).toBe(false);
      // The capsule never blinks.
      if (alive(capsule)) {
        expect(w.powerups.itemBatch.flags[0] & SpriteFlag.Hidden).toBe(0);
      }
    }
    expect(alive(option)).toBe(false);
    expect(alive(capsule)).toBe(true);
    expect(w.powerups.count).toBe(1);
  });

  it('the magnet pulls a colour item to the ship, and its effect applies', () => {
    const w = aliveWorld(DB, { pickupMagnet: true });
    const ship = w.players[0];
    w.powerups.spawnItem(ItemKind.DirectRed, ship.x + 30, ship.y);
    const input = createInputSnapshot();
    for (let t = 0; t < 20 && w.weapons.loadouts[0].shot === 0; t++) stepWorld(w, input);
    expect(w.weapons.loadouts[0].shot).toBe(1);
    expect(w.powerups.count).toBe(0);
  });
});

describe('core/powerups Direct mode — the Speed toggle`s corners', () => {
  it('a ship past its last speed wraps to the first; a single-speed ship stays put with the ding', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    const input = createInputSnapshot();
    ship.speedLevel = 7;
    run(w, input, Action.Speed);
    expect(ship.speedLevel).toBe(0);
    run(w, input, 0);
    // A single-speed direct ship (a MANTA of its own content, narrowed to one speed).
    const db = familyDb([testWeapon('w.main', 'main')], []);
    const manta = db.ships[db.shipIndex.get('manta') ?? -1] as unknown as {
      speeds: readonly number[];
    };
    manta.speeds = [2];
    const one = aliveWorld(db);
    expect(one.ship.speeds).toEqual([2]);
    one.players[0].speedLevel = 0;
    drain(one);
    run(one, input, Action.Speed);
    expect(one.players[0].speedLevel).toBe(0);
    expect(
      drain(one).some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.MeterAdvance),
    ).toBe(true);
  });

  it('is ignored while the ship is dying, and pressed together with PowerUp only toggles', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    const input = createInputSnapshot();
    w.powerups.meters[0].cursor = MeterSlot.Speed;
    drain(w);
    run(w, input, Action.Speed | Action.PowerUp);
    expect(ship.speedLevel).toBe(2);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Speed);
    const cues = drain(w).filter((e) => e.kind === SimEventKind.Sfx);
    expect(cues.map((e) => e.id)).toEqual([SFX_CUES.MeterAdvance]);
    run(w, input, 0);
    // Killed: the toggle waits for the next life.
    const e = w.enemies.spawn(DB.enemyIndex.get('drifter') ?? -1, ship.x, ship.y);
    expect(e).not.toBeNull();
    run(w, input, 0);
    expect(ship.state).toBe('dying');
    run(w, input, Action.Speed);
    expect(ship.speedLevel).toBe(2);
  });

  it('toggles during the fly-in (the ship is not dying or dead)', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    ship.state = 'entering';
    const input = createInputSnapshot();
    run(w, input, Action.Speed);
    expect(ship.speedLevel).toBe(2);
  });
});

describe('core/powerups Direct mode — the death penalty in a World', () => {
  /**
   * Kills player 1 with an enemy body (no shield) and returns the world after the tick.
   *
   * @param w - The world.
   */
  function kill(w: World): void {
    const ship = w.players[0];
    const e = w.enemies.spawn(DB.enemyIndex.get('drifter') ?? -1, ship.x, ship.y);
    expect(e).not.toBeNull();
    stepWorld(w, createInputSnapshot());
    expect(ship.state).toBe('dying');
  }

  it('casual keeps the levels and the family, only the Arm goes', () => {
    const w = aliveWorld(DB, { loadout: 'full', deathPenalty: 'casual' });
    const loadout = w.weapons.loadouts[0];
    loadout.family = 1;
    w.players[0].shield.kind = ShieldKind.None;
    w.players[0].shield.hits = 0;
    kill(w);
    expect([loadout.shot, loadout.sub, loadout.family]).toEqual([8, 8, 1]);
    expect([w.players[0].shield.tier, w.players[0].shield.charge]).toEqual([0, 0]);
  });

  it('arcade loses everything but the speed, and the plan cursor never rewinds', () => {
    const w = aliveWorld(DB, { loadout: 'full', deathPenalty: 'arcade', stage: 'direct-range' });
    const loadout = w.weapons.loadouts[0];
    loadout.family = 1;
    w.players[0].speedLevel = 2;
    w.players[0].shield.kind = ShieldKind.None;
    w.players[0].shield.hits = 0;
    w.powerups.dropDirect(w.camera.x + 200, w.camera.y + 50);
    w.powerups.dropDirect(w.camera.x + 200, w.camera.y + 80);
    kill(w);
    expect([loadout.shot, loadout.sub, loadout.family]).toEqual([0, 0, 0]);
    expect(w.players[0].speedLevel).toBe(2);
    const input = createInputSnapshot();
    for (let t = 0; t < 400 && w.players[0].state !== 'alive'; t++) stepWorld(w, input);
    expect(w.players[0].state).not.toBe('dying');
    expect(w.powerups.planCursor).toBe(2);
  });

  it('a meter shield on a direct ship is taken like the Arm', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    grantShield(ship.shield, FORCE_FIELD);
    const loadout = w.weapons.loadouts[0];
    loadout.sub = 3;
    expect(applyDirectDeathPenalty('classic', ship, loadout)).toBe(1);
    expect(shieldActive(ship.shield)).toBe(false);
    expect(loadout.sub).toBe(2);
  });
});

describe('core/powerups Direct mode — a continue', () => {
  it('restores the starting loadout: the start speed, level 0, no Arm (or the full one again)', () => {
    for (const preset of ['default', 'full'] as const) {
      const w = aliveWorld(DB, { loadout: preset });
      const ship = w.players[0];
      const loadout = w.weapons.loadouts[0];
      loadout.shot = 5;
      loadout.sub = 2;
      loadout.family = 1;
      ship.speedLevel = 0;
      collectArm(ship.shield);
      w.status = 'gameOver';
      expect(canContinue(w)).toBe(true);
      expect(continueWorld(w)).toBe(true);
      const full = preset === 'full';
      expect([loadout.shot, loadout.sub, loadout.family], preset).toEqual(
        full ? [8, 8, 0] : [0, 0, 0],
      );
      expect(ship.speedLevel, preset).toBe(w.ship.startSpeedLevel);
      expect(ship.shield.tier, preset).toBe(full ? 3 : 0);
      expect(shieldActive(ship.shield), preset).toBe(full);
      // The meter stays untouched in Direct mode.
      expect(loadout.options).toBe(0);
    }
  });
});
