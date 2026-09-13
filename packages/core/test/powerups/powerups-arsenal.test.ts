/**
 * `core/powerups` with the meter arsenal of plan M2-03 (acceptance: "loadout → meter mapping,
 * `!` effects"): the MISSILE / DOUBLE / LASER slots equip the session's arsenal (Types A–D, Weapon
 * Edit) and the HUD names them; the `!` choices — Mega Crash, NORMAL, SPEED DOWN, LIFE OPTION,
 * FULL BARRIER — with their greyed rules, through the pure functions and through a World's PowerUp
 * press; the `?` choice; Auto Power-Up with a `!` choice in its order.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEGA_CHOICES, resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { createPlayer } from '../../src/player/index.js';
import {
  DEFAULT_METER_CHOICES,
  MegaEffect,
  MeterChoices,
  MeterSlot,
  canEquipSlot,
  equipSlot,
  equippableSlots,
  lifeOptionCount,
  megaEffectOf,
  meterChoicesOf,
} from '../../src/powerups/index.js';
import {
  FORCE_FIELD,
  SHIELD_CHOICE_SPECS,
  ShieldKind,
  grantShield,
  shieldSpecOf,
} from '../../src/shields/index.js';
import { METER_LABEL_FRAMES, meterLabelFrame } from '../../src/ui/index.js';
import { Loadout, MainWeapon, ShotFlag, ShotKind } from '../../src/weapons/index.js';
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

/** The KESTREL and the shipped Type A and Types B–D weapons. */
const DB: ContentDb = ((): ContentDb => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('weapons/types-b-d.weapons.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A free-flight world whose player 1 is alive, autofire on.
 *
 * @param config - Config overrides.
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 3, ...config }), DB);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Highlights a slot and presses PowerUp (one tick pressed, one released).
 *
 * @param w - The world.
 * @param slot - `MeterSlot`.
 * @returns The events of the two ticks.
 */
function equip(w: World, slot: number): SimEvent[] {
  w.powerups.meters[0].cursor = slot;
  const input = createInputSnapshot();
  const out: SimEvent[] = [];
  commitPlayerInput(input.players[0], Action.PowerUp);
  stepWorld(w, input);
  w.events.drain((e) => out.push({ ...e }));
  commitPlayerInput(input.players[0], 0);
  stepWorld(w, input);
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * The shot kinds alive in a world.
 *
 * @param w - The world.
 * @returns The set of `ShotKind`s.
 */
function kinds(w: World): Set<number> {
  const f = w.weapons.pool.fields;
  const out = new Set<number>();
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) === 0) out.add(f.kind[i]);
  }
  return out;
}

describe('core/powerups arsenal (M2-03): the loadout → meter mapping', () => {
  it('MISSILE / DOUBLE / LASER equip the session`s weapons for every type', () => {
    for (const [preset, missile, double, laser] of [
      ['type-a', ShotKind.Missile, ShotKind.Double, ShotKind.Laser],
      ['type-b', ShotKind.SpreadBomb, ShotKind.Double, ShotKind.Ripple],
      ['type-c', ShotKind.TwoWay, ShotKind.Double, ShotKind.Laser],
      ['type-d', ShotKind.Torpedo, ShotKind.FreeWay, ShotKind.Twin],
    ] as const) {
      const w = world({ weaponPreset: preset });
      for (let t = 0; t < 30; t++) stepWorld(w, createInputSnapshot());
      expect(kinds(w), preset).toEqual(new Set([ShotKind.Straight]));
      equip(w, MeterSlot.Missile);
      equip(w, MeterSlot.Double);
      for (let t = 0; t < 40; t++) stepWorld(w, createInputSnapshot());
      expect(kinds(w).has(missile), preset).toBe(true);
      expect(kinds(w).has(double), preset).toBe(true);
      equip(w, MeterSlot.Laser);
      expect(w.weapons.loadouts[0].main, preset).toBe(MainWeapon.Laser);
      for (let t = 0; t < 40; t++) stepWorld(w, createInputSnapshot());
      expect(kinds(w).has(laser), preset).toBe(true);
    }
  });

  it('a Weapon Edit maps onto the same slots', () => {
    const w = world({
      weaponEdit: { missile: 'missile.spread', double: 'shot.vertical', laser: 'laser.twin' },
    });
    equip(w, MeterSlot.Missile);
    equip(w, MeterSlot.Laser);
    for (let t = 0; t < 60; t++) stepWorld(w, createInputSnapshot());
    expect(kinds(w).has(ShotKind.SpreadBomb)).toBe(true);
    expect(kinds(w).has(ShotKind.Twin)).toBe(true);
  });

  it('the HUD names the slots after the arsenal`s weapons (hud/meter-labels frames)', () => {
    const labels = (w: World): string[] =>
      [0, 1, 2, 3, 4, 5, 6].map((slot) => METER_LABEL_FRAMES[meterLabelFrame(w, slot)]);
    expect(labels(world())).toEqual(['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', '?', '!']);
    expect(labels(world({ weaponPreset: 'type-b' }))).toEqual([
      'SPEED',
      'SPREAD',
      'TAIL',
      'RIPPLE',
      'OPTION',
      '?',
      '!',
    ]);
    expect(labels(world({ weaponPreset: 'type-c' })).slice(1, 4)).toEqual([
      '2-WAY',
      'VERTICAL',
      'CYCLONE',
    ]);
    expect(labels(world({ weaponPreset: 'type-d' })).slice(1, 4)).toEqual([
      'TORPEDO',
      'FREE WAY',
      'TWIN',
    ]);
    // Without weapons every slot keeps its own label.
    const bare = createWorld(resolveGameConfig({ seed: 1 }), loadContent([]).db);
    expect(labels(bare)).toEqual(['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', '?', '!']);
  });
});

describe('core/powerups arsenal (M2-03): the `!` choices', () => {
  /**
   * Meter choices for a `!` effect.
   *
   * @param mega - `MegaEffect`.
   * @returns The choices (Force Field on `?`).
   */
  const choices = (mega: MegaEffect): MeterChoices => {
    const c = new MeterChoices();
    c.mega = mega;
    return c;
  };

  it('maps the config`s names to effects and shields', () => {
    expect(MEGA_CHOICES.map((name) => megaEffectOf(name))).toEqual([0, 1, 2, 3, 4]);
    expect(megaEffectOf('nope' as never)).toBe(MegaEffect.MegaCrash);
    const c = meterChoicesOf(resolveGameConfig({ megaChoice: 'lifeOption' }));
    expect(c.mega).toBe(MegaEffect.LifeOption);
    expect(c.shield).toBe(FORCE_FIELD);
    expect([DEFAULT_METER_CHOICES.mega, DEFAULT_METER_CHOICES.shield]).toEqual([
      MegaEffect.MegaCrash,
      FORCE_FIELD,
    ]);
    expect(Object.isFrozen(DEFAULT_METER_CHOICES)).toBe(true);
    expect(shieldSpecOf('forceField')).toBe(FORCE_FIELD);
    expect(shieldSpecOf('nope' as never)).toBe(FORCE_FIELD);
    expect(SHIELD_CHOICE_SPECS.forceField).toBe(FORCE_FIELD);
  });

  it('NORMAL: back to the basic shot; greyed while the basic shot is current', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    const c = choices(MegaEffect.Normal);
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(false);
    loadout.main = MainWeapon.Laser;
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(true);
    expect(loadout.main).toBe(MainWeapon.Basic);
    loadout.main = MainWeapon.Double;
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(true);
    expect(loadout.main).toBe(MainWeapon.Basic);
  });

  it('SPEED DOWN: one level less; greyed at speed level 0', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    const c = choices(MegaEffect.SpeedDown);
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(false);
    ship.speedLevel = 3;
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(true);
    expect(ship.speedLevel).toBe(2);
  });

  it('LIFE OPTION: spare ships become Options up to four; greyed without a spare ship or room', () => {
    const c = choices(MegaEffect.LifeOption);
    const ship = createPlayer(0, 4); // three spare ships
    const loadout = new Loadout();
    loadout.options = 2;
    expect(lifeOptionCount(ship, loadout)).toBe(2);
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(true);
    expect([loadout.options, ship.lives]).toEqual([4, 2]);
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(false); // four Options
    loadout.options = 0;
    ship.lives = 2; // one spare ship
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(true);
    expect([loadout.options, ship.lives]).toEqual([1, 1]);
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(false); // the last ship
    // A ship without a `lives` field counts as the last one.
    expect(lifeOptionCount({ speedLevel: 0, shield: ship.shield }, new Loadout())).toBe(0);
  });

  it('FULL BARRIER: a fresh `?` shield, also over a worn one; greyed at full strength', () => {
    const c = choices(MegaEffect.FullBarrier);
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(true);
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(true);
    expect([ship.shield.kind, ship.shield.hits]).toEqual([ShieldKind.ForceField, 5]);
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(false);
    ship.shield.hits = 2;
    expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 5, c)).toBe(true);
    // `?` is greyed while any shield is up; FULL BARRIER is the way to top it up.
    expect(canEquipSlot(MeterSlot.Shield, ship, loadout, 5, c)).toBe(false);
    equipSlot(MeterSlot.Mega, ship, loadout, 5, c);
    expect(ship.shield.hits).toBe(5);
  });

  it('Mega Crash (the default) stays equippable; the greyed mask follows the choice', () => {
    const ship = createPlayer(0, 1);
    const loadout = new Loadout();
    grantShield(ship.shield);
    const bit = 1 << MeterSlot.Mega;
    expect(equippableSlots(ship, loadout, 5) & bit).toBe(bit);
    expect(equippableSlots(ship, loadout, 5, choices(MegaEffect.Normal)) & bit).toBe(0);
    expect(equippableSlots(ship, loadout, 5, choices(MegaEffect.SpeedDown)) & bit).toBe(0);
    expect(equippableSlots(ship, loadout, 5, choices(MegaEffect.LifeOption)) & bit).toBe(0);
    expect(equippableSlots(ship, loadout, 5, choices(MegaEffect.FullBarrier)) & bit).toBe(0);
  });

  it('in a World: the press applies the choice, and only Mega Crash detonates', () => {
    // NORMAL.
    const n = world({ megaChoice: 'normal' });
    expect(n.powerups.choices.mega).toBe(MegaEffect.Normal);
    n.weapons.loadouts[0].main = MainWeapon.Laser;
    const events = equip(n, MeterSlot.Mega);
    expect(n.weapons.loadouts[0].main).toBe(MainWeapon.Basic);
    expect(n.powerups.megaPending[0]).toBe(0);
    expect(events.some((e) => e.kind === SimEventKind.Flash)).toBe(false);
    expect(events.some((e) => e.kind === SimEventKind.PowerUp && e.id === MeterSlot.Mega)).toBe(
      true,
    );
    // A greyed `!` is denied and keeps the cursor.
    const denied = equip(n, MeterSlot.Mega);
    expect(denied.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.PowerUpDenied)).toBe(
      true,
    );
    expect(n.powerups.meters[0].cursor).toBe(MeterSlot.Mega);
    // LIFE OPTION: the stock turns into Options (Normal: 3 ships → 2 Options, 1 ship left).
    const l = world({ megaChoice: 'lifeOption' });
    equip(l, MeterSlot.Mega);
    expect([l.weapons.loadouts[0].options, l.players[0].lives]).toEqual([2, 1]);
    expect(l.weapons.options[0].count).toBe(2);
    // Mega Crash: the flash.
    const m = world();
    const crash = equip(m, MeterSlot.Mega);
    expect(crash.some((e) => e.kind === SimEventKind.Flash)).toBe(true);
  });

  it('Auto Power-Up equips a `!` choice when its turn comes and it can be equipped', () => {
    const w = world({ megaChoice: 'fullBarrier', autoPowerUp: true, autoPowerUpOrder: ['mega'] });
    for (let k = 0; k < 7; k++) w.powerups.collect(0);
    // The cursor wrapped past `!` once: FULL BARRIER equipped then (a fresh Force Field).
    expect(w.players[0].shield.hits).toBe(5);
    expect(w.powerups.meters[0].cursor).toBe(-1);
  });
});
