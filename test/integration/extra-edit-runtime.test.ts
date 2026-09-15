/**
 * The Extra Edit weapons of plan M3-01 end to end on the shipped content (shmup_feat.md §7A: the
 * Control and Upper Missiles, Small Spread, Hawk Wind, 2-Way Back, Back Double and the Spread Gun),
 * each checked for the flight that sets it apart, on the shipped `test-range` stage:
 *
 * - the Control Missile flies ahead with its height following the ship's;
 * - the Upper Missile climbs (the Missile upside down); Hawk Wind's shots climb above the
 *   playfield's middle and dive below it;
 * - Small Spread lobs its bomb backwards, 2-Way Back flies a climbing and a diving missile
 *   backwards, the Back Double adds a backward shot to the forward one;
 * - the Spread Gun is equipped twice on the power meter: two diagonals, then the forward shot too.
 */
import {
  Action,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MainWeapon,
  MeterSlot,
  PLAYFIELD_H,
  ShotFlag,
  ShotKind,
  WeaponRole,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
  type Game,
  type GameConfig,
  type HeadlessPlatform,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content with the engine sprites.
 *
 * @returns The DB (asserted issue-free).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

const DB = shipped();

/** Fires everything (`Shot`: the main weapon, `Sub`: the Missile). */
const FIRE = Action.Shot | Action.Sub;

/** A live shot, as the tests read it. */
interface Shot {
  /** Its {@link ShotKind}. */
  readonly kind: number;
  /** Its weapon role. */
  readonly role: number;
  /** World x. */
  readonly x: number;
  /** World y. */
  readonly y: number;
  /** Velocity x. */
  readonly vx: number;
  /** Velocity y. */
  readonly vy: number;
  /** Sprite mirror bits. */
  readonly draw: number;
}

/** A headless session: the game, its platform and helpers. */
class Session {
  /** The game (bare gameplay). */
  readonly g: Game;
  /** Its platform. */
  readonly platform: HeadlessPlatform;

  /**
   * Starts a game on the test range, firing only while `Shot` is held.
   *
   * @param config - Config overrides (the Weapon Edit, the loadout …).
   */
  constructor(config: Partial<GameConfig>) {
    this.platform = createHeadlessPlatform();
    this.g = createGame(
      this.platform,
      { seed: 5, stage: 'test-range', autofireMode: 'hold', remoteMode: false, ...config },
      DB,
    );
  }

  /**
   * Steps with buttons held.
   *
   * @param actions - The action mask.
   * @param ticks - Ticks.
   */
  hold(actions: number, ticks: number): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], actions);
      this.g.step();
      this.g.world.events.clear();
    }
  }

  /**
   * The live shots of a role.
   *
   * @param role - A `WeaponRole`.
   * @returns The shots.
   */
  shots(role: number): Shot[] {
    const pool = this.g.world.weapons.pool;
    const f = pool.fields;
    const out: Shot[] = [];
    for (let i = 0; i < pool.count; i++) {
      if ((f.flags[i] & ShotFlag.Dead) !== 0 || f.role[i] !== role) continue;
      out.push({
        kind: f.kind[i],
        role: f.role[i],
        x: f.x[i],
        y: f.y[i],
        vx: f.vx[i],
        vy: f.vy[i],
        draw: f.draw[i],
      });
    }
    return out;
  }
}

/**
 * A session with one Extra Edit weapon in its role, the ship flown in and given the Missile and a
 * main weapon (no Options: the ship is the only shooter).
 *
 * @param slot - The weapon's slot.
 * @param id - The weapon.
 * @param main - The main weapon to fly with.
 * @returns The session.
 */
function armed(
  slot: 'missile' | 'double',
  id: string,
  main: MainWeapon = MainWeapon.Laser,
): Session {
  const edit = { missile: 'missile.ground', double: 'shot.double', laser: 'laser.pierce' };
  edit[slot] = id;
  const s = new Session({ weaponEdit: edit });
  s.hold(0, 60);
  const loadout = s.g.world.weapons.loadouts[0];
  loadout.main = main;
  loadout.missile = true;
  return s;
}

describe('Extra Edit missiles (M3-01)', () => {
  it('the Control Missile follows the ship`s height', () => {
    const s = armed('missile', 'missile.control');
    s.hold(FIRE, 2);
    const first = s.shots(WeaponRole.Missile);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((m) => m.kind === ShotKind.Control && m.vx > 0 && m.vy === 0)).toBe(true);
    const y0 = first[0].y;
    // The ship climbs: the missile's height follows.
    s.hold(Action.Up | Action.Sub, 12);
    const ship = s.g.world.players[0];
    const now = s.shots(WeaponRole.Missile);
    expect(now.length).toBeGreaterThan(0);
    expect(now[0].y).toBeLessThan(y0 - 6);
    expect(Math.abs(now[0].y - (ship.y + 4))).toBeLessThan(y0 - now[0].y);
  });

  it('the Upper Missile climbs; Hawk Wind climbs above the middle and dives below it', () => {
    const upper = armed('missile', 'missile.upper');
    upper.hold(FIRE, 2);
    const up = upper.shots(WeaponRole.Missile);
    expect(up.length).toBeGreaterThan(0);
    expect(up.every((m) => m.kind === ShotKind.Upper && m.vy < 0 && m.vx > 0)).toBe(true);

    const high = armed('missile', 'missile.hawkWind');
    high.hold(Action.Up, 20);
    const w = high.g.world;
    expect(w.players[0].y).toBeLessThan(w.camera.y + PLAYFIELD_H / 2 - 16);
    high.hold(FIRE, 2);
    const climbing = high.shots(WeaponRole.Missile);
    expect(climbing.length).toBeGreaterThan(0);
    expect(climbing.every((m) => m.kind === ShotKind.Upper && m.vy < 0)).toBe(true);

    const low = armed('missile', 'missile.hawkWind');
    low.hold(Action.Down, 20);
    expect(low.g.world.players[0].y).toBeGreaterThan(low.g.world.camera.y + PLAYFIELD_H / 2 + 16);
    low.hold(FIRE, 2);
    const diving = low.shots(WeaponRole.Missile);
    expect(diving.length).toBeGreaterThan(0);
    expect(diving.every((m) => m.kind === ShotKind.Missile && m.vy > 0)).toBe(true);
  });

  it('Small Spread lobs backwards; 2-Way Back flies a climbing and a diving missile backwards', () => {
    const small = armed('missile', 'missile.smallSpread');
    small.hold(FIRE, 2);
    const bombs = small.shots(WeaponRole.Missile);
    expect(bombs.length).toBeGreaterThan(0);
    expect(bombs.every((m) => m.kind === ShotKind.SpreadBomb && m.vx < 0)).toBe(true);

    const back = armed('missile', 'missile.twoWayBack');
    back.hold(FIRE, 2);
    const pair = back.shots(WeaponRole.Missile);
    expect(pair).toHaveLength(2);
    expect(pair.every((m) => m.kind === ShotKind.TwoWay && m.vx < 0)).toBe(true);
    expect(pair.map((m) => Math.sign(m.vy)).sort()).toEqual([-1, 1]);
  });
});

describe('Extra Edit doubles (M3-01)', () => {
  it('the Back Double fires ahead and backwards together', () => {
    const s = armed('double', 'shot.backDouble', MainWeapon.Double);
    s.hold(Action.Shot, 2);
    const pair = s.shots(WeaponRole.Double);
    expect(pair).toHaveLength(2);
    expect(pair.map((m) => Math.sign(m.vx)).sort()).toEqual([-1, 1]);
    // The backward shot is drawn mirrored.
    const behind = pair.find((m) => m.vx < 0)!;
    expect(behind.draw & 1).toBe(1);
  });

  it('the Spread Gun is equipped twice: two diagonals, then the forward shot too', () => {
    const edit = { missile: 'missile.ground', double: 'shot.spreadGun', laser: 'laser.pierce' };
    const s = new Session({ weaponEdit: edit });
    s.hold(0, 60);
    const w = s.g.world;
    const meter = w.powerups.meters[0];
    const equip = (): boolean => {
      meter.cursor = MeterSlot.Double;
      return w.powerups.equipHighlighted(0);
    };
    expect(equip()).toBe(true);
    const loadout = w.weapons.loadouts[0];
    expect([loadout.main, loadout.spread]).toEqual([MainWeapon.Double, 0]);
    s.hold(Action.Shot, 2);
    const two = s.shots(WeaponRole.Double);
    expect(two).toHaveLength(2);
    expect(two.every((m) => m.kind === ShotKind.SpreadGun && m.vx > 0)).toBe(true);
    expect(two.map((m) => Math.sign(m.vy)).sort()).toEqual([-1, 1]);
    // The lower diagonal is drawn upside down.
    expect(two.find((m) => m.vy > 0)!.draw & 2).toBe(2);
    // Equipped again: the third, forward shot (and no third equip).
    expect(equip()).toBe(true);
    expect(loadout.spread).toBe(1);
    expect(equip()).toBe(false);
    s.hold(0, 90);
    expect(s.shots(WeaponRole.Double)).toEqual([]);
    s.hold(Action.Shot, 1);
    const three = s.shots(WeaponRole.Double);
    expect(three).toHaveLength(3);
    expect(three.filter((m) => m.vy === 0)).toHaveLength(1);
    // The Laser replaces the Spread Gun and resets its level; a Double equips it at one level.
    meter.cursor = MeterSlot.Laser;
    expect(w.powerups.equipHighlighted(0)).toBe(true);
    expect([loadout.main, loadout.spread]).toEqual([MainWeapon.Laser, 0]);
  });
});
