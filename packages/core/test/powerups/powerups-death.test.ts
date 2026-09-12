/**
 * The death penalty (plan M1-12, decision D6) at the `core/powerups` level: `loseOneLevel` takes
 * one level in the order Option → Double / Laser → Missile → Speed, and `applyDeathPenalty`
 * applies each preset — `arcade` everything and the meter cursor, `classic` one level, `casual`
 * nothing but the shield (which every preset takes). The World-level outcomes (camera, pools,
 * respawn) are in `test/world/world-death.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { DeathPenaltyPreset } from '../../src/config/index.js';
import { MAX_OPTIONS } from '../../src/options/index.js';
import {
  MeterSlot,
  applyDeathPenalty,
  createPowerMeter,
  loseOneLevel,
} from '../../src/powerups/index.js';
import { ShieldKind, createShieldState, grantShield } from '../../src/shields/index.js';
import { Loadout, MainWeapon } from '../../src/weapons/index.js';

/**
 * A fully powered player: speed level 3, Missile, Laser, four Options, a Force Field, cursor on
 * `?`.
 *
 * @returns Ship state, loadout and meter.
 */
function full(): {
  ship: { speedLevel: number; shield: ReturnType<typeof createShieldState> };
  loadout: Loadout;
  meter: ReturnType<typeof createPowerMeter>;
} {
  const ship = { speedLevel: 3, shield: createShieldState() };
  grantShield(ship.shield);
  const loadout = new Loadout();
  loadout.main = MainWeapon.Laser;
  loadout.missile = true;
  loadout.options = MAX_OPTIONS;
  const meter = createPowerMeter();
  meter.cursor = MeterSlot.Shield;
  return { ship, loadout, meter };
}

/**
 * The power state as one comparable list.
 *
 * @param p - The player.
 * @returns `[speed, missile, main, options, shield kind, cursor]`.
 */
function state(p: ReturnType<typeof full>): unknown[] {
  return [
    p.ship.speedLevel,
    p.loadout.missile,
    p.loadout.main,
    p.loadout.options,
    p.ship.shield.kind,
    p.meter.cursor,
  ];
}

describe('core/powerups loseOneLevel (classic)', () => {
  it('takes Options first, then the Double / Laser, then the Missile, then Speed levels', () => {
    const p = full();
    const lost: number[] = [];
    for (let i = 0; i < 12; i++) lost.push(loseOneLevel(p.ship, p.loadout));
    expect(lost).toEqual([
      MeterSlot.Option,
      MeterSlot.Option,
      MeterSlot.Option,
      MeterSlot.Option,
      MeterSlot.Laser,
      MeterSlot.Missile,
      MeterSlot.Speed,
      MeterSlot.Speed,
      MeterSlot.Speed,
      -1,
      -1,
      -1,
    ]);
    expect([p.ship.speedLevel, p.loadout.missile, p.loadout.main, p.loadout.options]).toEqual([
      0,
      false,
      MainWeapon.Basic,
      0,
    ]);
  });

  it('reports the Double when that is the main weapon lost', () => {
    const p = full();
    p.loadout.options = 0;
    p.loadout.main = MainWeapon.Double;
    expect(loseOneLevel(p.ship, p.loadout)).toBe(MeterSlot.Double);
    expect(p.loadout.main).toBe(MainWeapon.Basic);
  });
});

describe('core/powerups applyDeathPenalty', () => {
  it('every preset takes the shield (no break: the shield is just gone)', () => {
    for (const preset of ['arcade', 'classic', 'casual'] as DeathPenaltyPreset[]) {
      const p = full();
      applyDeathPenalty(preset, p.ship, p.loadout, p.meter);
      expect([p.ship.shield.kind, p.ship.shield.hits, p.ship.shield.brokeTick], preset).toEqual([
        ShieldKind.None,
        0,
        -1,
      ]);
    }
  });

  it('arcade: everything, and the meter cursor back to -1', () => {
    const p = full();
    expect(applyDeathPenalty('arcade', p.ship, p.loadout, p.meter)).toBe(-1);
    expect(state(p)).toEqual([0, false, MainWeapon.Basic, 0, ShieldKind.None, -1]);
  });

  it('classic: one level (and the shield), the cursor kept', () => {
    const p = full();
    expect(applyDeathPenalty('classic', p.ship, p.loadout, p.meter)).toBe(MeterSlot.Option);
    expect(state(p)).toEqual([
      3,
      true,
      MainWeapon.Laser,
      MAX_OPTIONS - 1,
      ShieldKind.None,
      MeterSlot.Shield,
    ]);
    const bare = full();
    bare.ship.speedLevel = 0;
    bare.loadout.missile = false;
    bare.loadout.main = MainWeapon.Basic;
    bare.loadout.options = 0;
    expect(applyDeathPenalty('classic', bare.ship, bare.loadout, bare.meter)).toBe(-1);
  });

  it('casual: only the shield', () => {
    const p = full();
    expect(applyDeathPenalty('casual', p.ship, p.loadout, p.meter)).toBe(-1);
    expect(state(p)).toEqual([
      3,
      true,
      MainWeapon.Laser,
      MAX_OPTIONS,
      ShieldKind.None,
      MeterSlot.Shield,
    ]);
  });
});
