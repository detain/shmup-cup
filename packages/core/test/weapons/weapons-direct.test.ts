/**
 * The Direct-mode shot families (plan M2-05, shmup_feat.md §7B): the families the MANTA fires
 * (Beam → Disc and Laser → Wave, the sub-weapon — 9 levels each, as data), every level's volley
 * (its weapons, headings and offsets), the `volleys` caps, the family switch, the sub-weapon's
 * direction frames and bombs, the Direct-mode starting loadouts and the separation from the meter
 * roles.
 */
import { describe, expect, it } from 'vitest';
import type { WeaponFamilySpec } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_MASK } from '../../src/math/index.js';
import { ShieldKind } from '../../src/shields/index.js';
import {
  DIRECT_MAX_LEVEL,
  MAX_DIRECT_WEAPONS,
  ShotFlag,
  ShotKind,
  WEAPON_ROLE_COUNT,
  WEAPON_ROLE_SLOTS,
  applyDirectLoadout,
  resolveFamilies,
} from '../../src/weapons/index.js';
import { stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

/** The shared content. */
const DB = directDb();

/**
 * The weapon ids of the live shots, in pool order.
 *
 * @param w - The world.
 * @returns The ids.
 */
function shotWeapons(w: World): string[] {
  const f = w.weapons.pool.fields;
  const out: string[] = [];
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) !== 0) continue;
    out.push(roleWeapon(w, f.role[i]));
  }
  return out;
}

/**
 * The weapon id a shot role fires (a meter role or a direct one).
 *
 * @param w - The world.
 * @param role - The role.
 * @returns The weapon id, or `?`.
 */
function roleWeapon(w: World, role: number): string {
  if (role < WEAPON_ROLE_COUNT) return w.weapons.roleWeapons[role]?.id ?? '?';
  // The direct roles follow the families' first appearance order of their weapons.
  const ids: string[] = [];
  const families = [...w.weapons.mainFamilies];
  if (w.weapons.subFamily !== null) families.push(w.weapons.subFamily);
  for (const family of families) {
    for (const level of family.levels) {
      for (const shot of level.shots) if (!ids.includes(shot.weapon)) ids.push(shot.weapon);
    }
  }
  return ids[role - WEAPON_ROLE_COUNT] ?? '?';
}

/**
 * The weapon ids of one level's volley, grouped by weapon in first-appearance order.
 *
 * @param family - The family.
 * @param level - The level.
 * @returns The ids.
 */
function volley(family: WeaponFamilySpec, level: number): string[] {
  const shots = family.levels[level].shots;
  const order: string[] = [];
  for (const shot of shots) if (!order.includes(shot.weapon)) order.push(shot.weapon);
  const out: string[] = [];
  for (const id of order) for (const shot of shots) if (shot.weapon === id) out.push(id);
  return out;
}

/**
 * A MANTA world at the given levels, its first volley of each fired (autofire, one tick).
 *
 * @param shot - Main-shot level.
 * @param sub - Sub-weapon level.
 * @param family - Main family.
 * @returns The world after the tick the volleys fired on.
 */
function fired(shot: number, sub: number, family = 0): World {
  const w = aliveWorld(DB);
  w.weapons.pool.clear();
  w.weapons.timers.fill(0);
  const loadout = w.weapons.loadouts[0];
  loadout.shot = shot;
  loadout.sub = sub;
  loadout.family = family;
  stepWorld(w, createInputSnapshot());
  return w;
}

describe('core/weapons Direct mode — the families', () => {
  it('fires the content`s main families in order and its first sub family', () => {
    const w = aliveWorld(DB);
    expect(w.weapons.direct).toBe(true);
    expect(w.weapons.mainFamilies.map((f) => f.id)).toEqual(['beam-disc', 'laser-wave']);
    expect(w.weapons.subFamily?.id).toBe('sub-weapon');
    for (const family of [...w.weapons.mainFamilies, w.weapons.subFamily!]) {
      expect(family.levels).toHaveLength(DIRECT_MAX_LEVEL + 1);
    }
    const families = resolveFamilies(DB);
    expect(families.main.map((f) => f.id)).toEqual(['beam-disc', 'laser-wave']);
    expect(families.sub?.id).toBe('sub-weapon');
    expect(WEAPON_ROLE_SLOTS).toBe(WEAPON_ROLE_COUNT + MAX_DIRECT_WEAPONS);
  });

  it('fires each main level`s volley of Beam → Disc (with the sub-weapon`s level 0)', () => {
    const family = DB.weaponFamilies[DB.weaponFamilyIndex.get('beam-disc') ?? -1];
    const sub = DB.weaponFamilies[DB.weaponFamilyIndex.get('sub-weapon') ?? -1];
    for (let level = 0; level <= DIRECT_MAX_LEVEL; level++) {
      const w = fired(level, 0);
      expect(shotWeapons(w), 'level ' + level).toEqual([
        ...volley(family, level),
        ...volley(sub, 0),
      ]);
    }
  });

  it('fires each main level of Laser → Wave, and each sub-weapon level', () => {
    const wave = DB.weaponFamilies[DB.weaponFamilyIndex.get('laser-wave') ?? -1];
    const sub = DB.weaponFamilies[DB.weaponFamilyIndex.get('sub-weapon') ?? -1];
    for (let level = 0; level <= DIRECT_MAX_LEVEL; level++) {
      const w = fired(level, level, 1);
      expect(shotWeapons(w), 'level ' + level).toEqual([
        ...volley(wave, level),
        ...volley(sub, level),
      ]);
    }
  });

  it('clamps a level beyond the family to its top one', () => {
    const top = fired(DIRECT_MAX_LEVEL, 0);
    const over = fired(20, 0);
    expect(shotWeapons(over)).toEqual(shotWeapons(top));
    expect(shotWeapons(fired(-3, 0))).toEqual(shotWeapons(fired(0, 0)));
  });

  it('flies each emitter`s heading and offset; the sub lasers show their octant`s frame', () => {
    const w = fired(0, 4); // four diagonal lasers (X pattern)
    const f = w.weapons.pool.fields;
    const ship = w.players[0];
    const frames: number[] = [];
    for (let i = 0; i < w.weapons.pool.count; i++) {
      if (f.kind[i] !== ShotKind.Straight || roleWeapon(w, f.role[i]) !== 'direct.sub.laser')
        continue;
      // The heading in binary units back from the velocity's octant.
      frames.push(f.frame[i]);
      expect(Math.sign(f.vx[i])).not.toBe(0);
      expect(Math.sign(f.vy[i])).not.toBe(0);
      expect(Math.abs(f.x[i] - ship.x)).toBeLessThan(12);
    }
    expect(frames.sort()).toEqual([1, 3, 5, 7]);
    // Twin wide missiles: one above, one below the ship's row.
    const twin = fired(2, 0);
    const tf = twin.weapons.pool.fields;
    const rows: number[] = [];
    for (let i = 0; i < twin.weapons.pool.count; i++) {
      if (roleWeapon(twin, tf.role[i]) === 'direct.missile.wide')
        rows.push(tf.y[i] - twin.players[0].y);
    }
    expect(rows.sort((a, b) => a - b)).toEqual([-4, 4]);
  });

  it('fires the sub-weapon`s bombs as Spread Bomb shots in their emitters` headings', () => {
    const w = fired(0, 2); // four bombs, all diagonals
    const f = w.weapons.pool.fields;
    const signs: string[] = [];
    for (let i = 0; i < w.weapons.pool.count; i++) {
      if (f.kind[i] !== ShotKind.SpreadBomb) continue;
      signs.push((f.vx[i] > 0 ? '+' : '-') + (f.vy[i] > 0 ? '+' : '-'));
      expect(f.table[i]).toBeGreaterThan(0); // the blast's cooldown table is reserved
    }
    expect(signs.sort()).toEqual(['++', '+-', '-+', '--']);
  });

  it('keeps each level`s volleys under its cap (three small discs, three volleys: nine)', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    loadout.shot = 5;
    loadout.sub = 0;
    const input = createInputSnapshot();
    let most = 0;
    for (let t = 0; t < 240; t++) {
      stepWorld(w, input);
      const discs = shotWeapons(w).filter((id) => id === 'direct.disc.small').length;
      if (discs > most) most = discs;
    }
    expect(most).toBe(9);
  });

  it('never fires the meter roles in Direct mode, nor the families in meter mode', () => {
    const direct = fired(8, 8);
    const f = direct.weapons.pool.fields;
    for (let i = 0; i < direct.weapons.pool.count; i++) {
      expect(f.role[i]).toBeGreaterThanOrEqual(WEAPON_ROLE_COUNT);
    }
    const meter = aliveWorld(DB, { shipId: 'kestrel', powerUpMode: 'meter' });
    expect(meter.weapons.direct).toBe(false);
    meter.weapons.loadouts[0].shot = 8;
    meter.weapons.loadouts[0].sub = 8;
    const input = createInputSnapshot();
    for (let t = 0; t < 30; t++) stepWorld(meter, input);
    const mf = meter.weapons.pool.fields;
    expect(meter.weapons.pool.count).toBeGreaterThan(0);
    for (let i = 0; i < meter.weapons.pool.count; i++) {
      expect(mf.role[i]).toBeLessThan(WEAPON_ROLE_COUNT);
    }
  });

  it('pierces with the piercing weapons (the waves) and keeps a hit-cooldown table per shot', () => {
    const w = fired(8, 0, 1);
    const f = w.weapons.pool.fields;
    let waves = 0;
    for (let i = 0; i < w.weapons.pool.count; i++) {
      if (roleWeapon(w, f.role[i]) !== 'direct.wave.huge') continue;
      waves++;
      expect(f.flags[i] & ShotFlag.Pierce).toBe(ShotFlag.Pierce);
      expect(f.table[i]).toBeGreaterThan(0);
      expect(f.hh[i]).toBe(16);
    }
    expect(waves).toBe(1);
  });

  it('applies the Direct-mode starting loadouts', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    const ship = w.players[0];
    applyDirectLoadout(loadout, ship, 'full', 1);
    expect([loadout.shot, loadout.sub, loadout.family]).toEqual([8, 8, 0]);
    expect([ship.shield.kind, ship.shield.tier, ship.shield.hits]).toEqual([ShieldKind.Arm, 3, 5]);
    expect(ship.speedLevel).toBe(1);
    loadout.options = 2;
    loadout.family = 1;
    applyDirectLoadout(loadout, ship, 'default');
    expect([loadout.shot, loadout.sub, loadout.family, loadout.options]).toEqual([0, 0, 0, 0]);
    expect([ship.shield.kind, ship.speedLevel]).toEqual([ShieldKind.None, 0]);
    // The emitter angles stay whole binary units.
    for (const family of DB.weaponFamilies) {
      for (const level of family.levels) {
        for (const shot of level.shots)
          expect((shot.angle ?? 0) & ANGLE_MASK).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
