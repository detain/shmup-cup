/**
 * Edge cases of the Direct-mode shot families (plan M2-05, shmup_feat.md §7B) beyond
 * `weapons-direct`, on content of their own: `resolveFamilies` (no families, several sub families,
 * mixed order), a Direct-mode World without families or without a sub family, odd loadout values
 * (negative / fractional / NaN levels, a family index out of range), the octant frames of `turn`
 * (every octant and the boundaries), the still `frame`, the all-or-nothing weapon groups of a
 * volley (a capped group waits, another keeps firing), the `volleys` cap, the volley intervals
 * (`refireTicks`, else the config's autofire / missile intervals), the `Shot` / `Sub` presses
 * without autofire, the direct roles of `spawnShot`, the {@link MAX_DIRECT_WEAPONS} limit, a
 * Weapon Edit swap leaving the direct roles alone, and the loadout presets resetting each other.
 */
import { describe, expect, it } from 'vitest';
import type { ContentDb } from '../../src/data/index.js';
import { Action, createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { ShieldKind, collectArm } from '../../src/shields/index.js';
import {
  MAX_DIRECT_WEAPONS,
  MainWeapon,
  ShotFlag,
  ShotKind,
  WEAPON_ROLE_COUNT,
  WEAPON_ROLE_SLOTS,
  applyDirectLoadout,
  applyLoadoutPreset,
  resolveFamilies,
} from '../../src/weapons/index.js';
import { FORCE_FIELD } from '../../src/shields/index.js';
import { stepWorld, type World } from '../../src/world/index.js';
import type { GameConfig } from '../../src/config/index.js';
import { aliveWorld, directDb, familyDb, run, testWeapon } from '../helpers/direct.js';

/**
 * A level of emitters.
 *
 * @param shots - The emitters (`weapon`, optional `angle`, `ox`, `oy`).
 * @param extra - `refireTicks`, `volleys`.
 * @returns The entry.
 */
function level(
  shots: readonly Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { shots, ...extra };
}

/**
 * A family.
 *
 * @param id - Id (its label is the first five characters in upper case).
 * @param slot - Slot.
 * @param levels - Levels.
 * @returns The entry.
 */
function fam(
  id: string,
  slot: 'main' | 'sub',
  levels: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return { id, label: id.toUpperCase().slice(0, 5), slot, levels };
}

/**
 * A MANTA world on the given content, its pool and timers emptied.
 *
 * @param db - The content.
 * @param config - Config overrides.
 * @returns The world.
 */
function ready(db: ContentDb, config: Partial<GameConfig> = {}): World {
  const w = aliveWorld(db, config);
  w.weapons.pool.clear();
  w.weapons.timers.fill(0);
  return w;
}

/**
 * The live shots' weapon ids (by role → the content's weapon of that direct role).
 *
 * @param w - The world.
 * @returns The ids, in pool order.
 */
function liveIds(w: World): string[] {
  const ids = directRoleIds(w);
  const f = w.weapons.pool.fields;
  const out: string[] = [];
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) !== 0) continue;
    out.push(ids[f.role[i] - WEAPON_ROLE_COUNT] ?? '?');
  }
  return out;
}

/**
 * The weapon of each direct role: the families' weapons in first-appearance order (main families,
 * then the sub family).
 *
 * @param w - The world.
 * @returns The ids.
 */
function directRoleIds(w: World): string[] {
  const families = [...w.weapons.mainFamilies];
  if (w.weapons.subFamily !== null) families.push(w.weapons.subFamily);
  const ids: string[] = [];
  for (const family of families) {
    for (const lv of family.levels) {
      for (const shot of lv.shots) if (!ids.includes(shot.weapon)) ids.push(shot.weapon);
    }
  }
  return ids.slice(0, MAX_DIRECT_WEAPONS);
}

/**
 * The live shots' frames, in pool order.
 *
 * @param w - The world.
 * @returns The frames.
 */
function frames(w: World): number[] {
  const f = w.weapons.pool.fields;
  const out: number[] = [];
  for (let i = 0; i < w.weapons.pool.count; i++) out.push(f.frame[i]);
  return out;
}

describe('core/weapons Direct mode — resolveFamilies', () => {
  it('gives no families for content without any', () => {
    const db = familyDb([testWeapon('w.a', 'main')], []);
    expect(resolveFamilies(db)).toEqual({ main: [], sub: null });
  });

  it('keeps the main families in content order and takes the first sub family', () => {
    const db = familyDb(
      [testWeapon('w.a', 'main'), testWeapon('w.s', 'sub')],
      [
        fam('sub1', 'sub', [level([{ weapon: 'w.s' }])]),
        fam('main1', 'main', [level([{ weapon: 'w.a' }])]),
        fam('sub2', 'sub', [level([{ weapon: 'w.s' }])]),
        fam('main2', 'main', [level([{ weapon: 'w.a' }])]),
      ],
    );
    const families = resolveFamilies(db);
    expect(families.main.map((f) => f.id)).toEqual(['main1', 'main2']);
    expect(families.sub?.id).toBe('sub1');
    const w = aliveWorld(db);
    expect(w.weapons.mainFamilies.map((f) => f.id)).toEqual(['main1', 'main2']);
    expect(Object.isFrozen(w.weapons.mainFamilies)).toBe(true);
    expect(w.weapons.subFamily?.id).toBe('sub1');
  });
});

describe('core/weapons Direct mode — sparse content and odd loadouts', () => {
  it('a Direct-mode World without families fires nothing (and does not throw)', () => {
    const w = ready(familyDb([testWeapon('w.a', 'main')], []));
    const input = createInputSnapshot();
    run(w, input, Action.Shot | Action.Sub, 60);
    expect(w.weapons.pool.count).toBe(0);
  });

  it('without a sub family only the main shot fires', () => {
    const db = familyDb(
      [testWeapon('w.a', 'main')],
      [fam('only', 'main', [level([{ weapon: 'w.a' }])])],
    );
    const w = ready(db);
    stepWorld(w, createInputSnapshot());
    expect(liveIds(w)).toEqual(['w.a']);
  });

  it('reads a negative or NaN level as 0, a fractional one as its whole part, a big family index wrapped', () => {
    const db = familyDb(
      [testWeapon('w.a', 'main'), testWeapon('w.b', 'main'), testWeapon('w.c', 'main')],
      [
        fam('one', 'main', [
          level([{ weapon: 'w.a' }]),
          level([{ weapon: 'w.b' }]),
          level([{ weapon: 'w.c' }]),
        ]),
        fam('two', 'main', [level([{ weapon: 'w.c' }, { weapon: 'w.c', oy: 4 }])]),
      ],
    );
    const at = (shot: number, family = 0): string[] => {
      const w = ready(db);
      w.weapons.loadouts[0].shot = shot;
      w.weapons.loadouts[0].family = family;
      stepWorld(w, createInputSnapshot());
      return liveIds(w);
    };
    expect(at(-2)).toEqual(['w.a']);
    expect(at(Number.NaN)).toEqual(['w.a']);
    expect(at(1.7)).toEqual(['w.b']);
    expect(at(99)).toEqual(['w.c']);
    expect(at(0, 3)).toEqual(['w.c', 'w.c']); // 3 % 2: the second family
    expect(at(0, -1)).toEqual(['w.a']); // a negative family index: the first
  });
});

describe('core/weapons Direct mode — frames and headings', () => {
  it('a `turn` bolt shows its heading`s octant, boundaries included', () => {
    const angles = [0, 128, 256, 384, 512, 640, 768, 896];
    const db = familyDb(
      [testWeapon('w.turn', 'main', { cap: 64, params: { turn: 1 } })],
      [
        fam('octants', 'main', [
          level(angles.map((angle) => ({ weapon: 'w.turn', angle }))),
          level([63, 64, -64, -65, 1000].map((angle) => ({ weapon: 'w.turn', angle }))),
        ]),
      ],
    );
    const w = ready(db);
    stepWorld(w, createInputSnapshot());
    expect(frames(w)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Every shot flies its heading at the weapon's speed.
    const f = w.weapons.pool.fields;
    for (let i = 0; i < w.weapons.pool.count; i++) {
      expect(Math.sqrt(f.vx[i] * f.vx[i] + f.vy[i] * f.vy[i])).toBeCloseTo(4, 3);
    }
    expect(f.vy[2]).toBeCloseTo(4, 3); // 256: straight down
    expect(f.vx[4]).toBeCloseTo(-4, 3); // 512: straight back
    const edge = ready(db);
    edge.weapons.loadouts[0].shot = 1;
    stepWorld(edge, createInputSnapshot());
    // 63 → 0, 64 → 1, -64 (960) → 0, -65 (959) → 7, 1000 → 0.
    expect(frames(edge)).toEqual([0, 1, 0, 7, 0]);
    expect(ANGLE_UNITS).toBe(1024);
  });

  it('a still bolt shows its `frame` (whole, never negative)', () => {
    const db = familyDb(
      [
        testWeapon('w.three', 'main', { params: { frame: 3 } }),
        testWeapon('w.neg', 'main', { params: { frame: -2 } }),
        testWeapon('w.frac', 'main', { params: { frame: 2.7 } }),
      ],
      [
        fam('still', 'main', [
          level([{ weapon: 'w.three' }, { weapon: 'w.neg' }, { weapon: 'w.frac' }]),
        ]),
      ],
    );
    const w = ready(db);
    stepWorld(w, createInputSnapshot());
    expect(liveIds(w)).toEqual(['w.three', 'w.neg', 'w.frac']);
    expect(frames(w)).toEqual([3, 0, 2]);
  });

  it('adds each emitter`s offset to the weapon`s own', () => {
    const db = familyDb(
      [testWeapon('w.a', 'main', { speed: 0, params: { ox: 8, oy: 1 } })],
      [
        fam('offs', 'main', [
          level([{ weapon: 'w.a' }, { weapon: 'w.a', ox: -5, oy: 6 }, { weapon: 'w.a', oy: -6 }]),
        ]),
      ],
    );
    const w = ready(db);
    const ship = w.players[0];
    stepWorld(w, createInputSnapshot());
    const f = w.weapons.pool.fields;
    const offsets: Array<[number, number]> = [];
    for (let i = 0; i < w.weapons.pool.count; i++) {
      offsets.push([f.x[i] - ship.x, f.y[i] - ship.y]);
    }
    expect(offsets).toEqual([
      [8, 1],
      [3, 7],
      [8, -5],
    ]);
  });
});

describe('core/weapons Direct mode — caps, groups and intervals', () => {
  it('fires each weapon`s group all or nothing: a capped group waits, another keeps firing', () => {
    const db = familyDb(
      [
        testWeapon('w.a', 'main', { cap: 3, speed: 0.25 }),
        testWeapon('w.b', 'main', { cap: 8, speed: 0.25 }),
      ],
      [
        fam('mixed', 'main', [
          level([{ weapon: 'w.a' }, { weapon: 'w.b' }, { weapon: 'w.a', oy: 4 }], {
            refireTicks: 2,
          }),
        ]),
      ],
    );
    const w = ready(db);
    const input = createInputSnapshot();
    stepWorld(w, input);
    // Grouped by weapon in first-appearance order: both A shots, then B.
    expect(liveIds(w)).toEqual(['w.a', 'w.a', 'w.b']);
    for (let t = 0; t < 20; t++) stepWorld(w, input);
    const ids = liveIds(w);
    // Two A shots fit the cap of 3 once, never a lone third; B kept firing up to its cap.
    expect(ids.filter((id) => id === 'w.a')).toHaveLength(2);
    expect(ids.filter((id) => id === 'w.b')).toHaveLength(8);
  });

  it('caps a level at `volleys` volleys in flight', () => {
    const db = familyDb(
      [testWeapon('w.a', 'main', { cap: 64, speed: 0.25 })],
      [
        fam('vol', 'main', [
          level([{ weapon: 'w.a' }, { weapon: 'w.a', oy: 3 }, { weapon: 'w.a', oy: -3 }], {
            refireTicks: 1,
            volleys: 2,
          }),
        ]),
      ],
    );
    const w = ready(db);
    const input = createInputSnapshot();
    let most = 0;
    for (let t = 0; t < 30; t++) {
      stepWorld(w, input);
      most = Math.max(most, liveIds(w).length);
    }
    expect(most).toBe(6);
  });

  /**
   * The ticks on which a world's shots of one role were fired (the live count went up).
   *
   * @param w - The world.
   * @param role - The direct role.
   * @param ticks - Ticks to run.
   * @param held - Held actions.
   * @returns The ticks.
   */
  function fireTicks(w: World, role: number, ticks: number, held = 0): number[] {
    const input = createInputSnapshot();
    const out: number[] = [];
    let before = 0;
    for (let t = 0; t < ticks; t++) {
      run(w, input, held);
      const f = w.weapons.pool.fields;
      let n = 0;
      for (let i = 0; i < w.weapons.pool.count; i++) {
        if ((f.flags[i] & ShotFlag.Dead) === 0 && f.role[i] === role) n++;
      }
      if (n > before) out.push(t);
      before = n;
    }
    return out;
  }

  it('fires a level every `refireTicks`, else every autofire (main) or missile (sub) interval', () => {
    const db = familyDb(
      [
        testWeapon('w.a', 'main', { cap: 64, speed: 0.25 }),
        testWeapon('w.s', 'sub', { cap: 64, speed: 0.25 }),
      ],
      [
        fam('m', 'main', [
          level([{ weapon: 'w.a' }]),
          level([{ weapon: 'w.a' }], { refireTicks: 7 }),
        ]),
        fam('s', 'sub', [level([{ weapon: 'w.s' }])]),
      ],
    );
    const config = { autofireInterval: 5, missileInterval: 9 };
    const gaps = (ticks: readonly number[]): number[] => ticks.slice(1).map((t, i) => t - ticks[i]);
    const main = ready(db, config);
    expect(new Set(gaps(fireTicks(main, WEAPON_ROLE_COUNT, 40)))).toEqual(new Set([5]));
    const sub = ready(db, config);
    expect(new Set(gaps(fireTicks(sub, WEAPON_ROLE_COUNT + 1, 40)))).toEqual(new Set([9]));
    const refire = ready(db, config);
    refire.weapons.loadouts[0].shot = 1;
    expect(new Set(gaps(fireTicks(refire, WEAPON_ROLE_COUNT, 40)))).toEqual(new Set([7]));
  });

  it('without autofire the main family needs Shot held, the sub family Sub', () => {
    const db = familyDb(
      [
        testWeapon('w.a', 'main', { cap: 64, speed: 0.25 }),
        testWeapon('w.s', 'sub', { cap: 64, speed: 0.25 }),
      ],
      [
        fam('m', 'main', [level([{ weapon: 'w.a' }])]),
        fam('s', 'sub', [level([{ weapon: 'w.s' }])]),
      ],
    );
    const config = { autofire: false, remoteMode: false };
    expect(fireTicks(ready(db, config), WEAPON_ROLE_COUNT, 20)).toEqual([]);
    expect(fireTicks(ready(db, config), WEAPON_ROLE_COUNT, 20, Action.Shot).length).toBeGreaterThan(
      2,
    );
    expect(fireTicks(ready(db, config), WEAPON_ROLE_COUNT + 1, 20, Action.Shot)).toEqual([]);
    expect(
      fireTicks(ready(db, config), WEAPON_ROLE_COUNT + 1, 20, Action.Sub).length,
    ).toBeGreaterThan(1);
    // Remote mode forces both on.
    const remote = { autofire: false, remoteMode: true };
    expect(fireTicks(ready(db, remote), WEAPON_ROLE_COUNT + 1, 20).length).toBeGreaterThan(1);
  });

  it('the Options in play fire the family volleys too', () => {
    const db = familyDb(
      [testWeapon('w.a', 'main', { cap: 64, speed: 0.25 })],
      [fam('m', 'main', [level([{ weapon: 'w.a' }])])],
    );
    const w = ready(db);
    w.weapons.loadouts[0].options = 2;
    const input = createInputSnapshot();
    for (let t = 0; t < 30; t++) stepWorld(w, input);
    const f = w.weapons.pool.fields;
    const shooters = new Set<number>();
    for (let i = 0; i < w.weapons.pool.count; i++) shooters.add(f.shooter[i]);
    expect([...shooters].sort()).toEqual([0, 1, 2]);
  });
});

describe('core/weapons Direct mode — roles', () => {
  it('spawnShot accepts the compiled direct roles only', () => {
    const w = ready(directDb());
    const x = w.camera.x + 100;
    const y = w.camera.y + 100;
    const live = w.weapons.liveCounts[WEAPON_ROLE_COUNT];
    expect(w.weapons.spawnShot(WEAPON_ROLE_COUNT, 0, x, y)).toBeGreaterThanOrEqual(0);
    expect(w.weapons.spawnShot(WEAPON_ROLE_SLOTS - 1, 0, x, y)).toBe(-1); // not compiled
    expect(w.weapons.spawnShot(WEAPON_ROLE_SLOTS, 0, x, y)).toBe(-1);
    expect(w.weapons.spawnShot(WEAPON_ROLE_COUNT + 0.5, 0, x, y)).toBe(-1);
    // Counted in the direct role's slot of the shooter's stride.
    expect(w.weapons.liveCounts[WEAPON_ROLE_COUNT]).toBe(live + 1);
    expect(w.weapons.pool.count).toBe(1);
  });

  it(`gives at most ${MAX_DIRECT_WEAPONS} weapons a direct role: the ones beyond never fire`, () => {
    const weapons = Array.from({ length: MAX_DIRECT_WEAPONS + 1 }, (_, k) =>
      testWeapon('w.' + String(k), 'main', { cap: 64, speed: 0.25 }),
    );
    const levels: Record<string, unknown>[] = [];
    for (let l = 0; l < MAX_DIRECT_WEAPONS / 8; l++) {
      levels.push(
        level(Array.from({ length: 8 }, (_, k) => ({ weapon: 'w.' + String(l * 8 + k) }))),
      );
    }
    levels.push(level([{ weapon: 'w.' + String(MAX_DIRECT_WEAPONS) }]));
    const db = familyDb(weapons, [fam('many', 'main', levels)]);
    const full = ready(db);
    full.weapons.loadouts[0].shot = 3;
    stepWorld(full, createInputSnapshot());
    expect(full.weapons.pool.count).toBe(8);
    const f = full.weapons.pool.fields;
    for (let i = 0; i < 8; i++) expect(f.role[i]).toBe(WEAPON_ROLE_COUNT + 24 + i);
    const beyond = ready(db);
    beyond.weapons.loadouts[0].shot = MAX_DIRECT_WEAPONS / 8;
    stepWorld(beyond, createInputSnapshot());
    expect(beyond.weapons.pool.count).toBe(0);
  });

  it('a Weapon Edit swap of the meter roles leaves the direct roles alone', () => {
    const db = directDb();
    const w = ready(db);
    stepWorld(w, createInputSnapshot());
    const before = liveIds(w);
    const w2 = ready(db);
    w2.weapons.setArsenal([null, null, null, null]);
    stepWorld(w2, createInputSnapshot());
    expect(liveIds(w2)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });
});

describe('core/weapons Direct mode — loadout presets', () => {
  it('the meter preset clears the Direct-mode fields; the direct one clears the meter`s', () => {
    const w = aliveWorld(directDb());
    const loadout = w.weapons.loadouts[0];
    const ship = w.players[0];
    loadout.shot = 6;
    loadout.sub = 4;
    loadout.family = 1;
    applyLoadoutPreset(loadout, ship, 'full', FORCE_FIELD);
    expect([loadout.shot, loadout.sub, loadout.family]).toEqual([0, 0, 0]);
    expect([loadout.main, loadout.missile, loadout.options]).toEqual([MainWeapon.Laser, true, 4]);
    applyDirectLoadout(loadout, ship, 'default', 2);
    expect([loadout.main, loadout.missile, loadout.options]).toEqual([MainWeapon.Basic, false, 0]);
    expect(ship.shield.kind).toBe(ShieldKind.None);
    expect(ship.speedLevel).toBe(2);
    applyDirectLoadout(loadout, ship, 'default', -3);
    expect(ship.speedLevel).toBe(0);
  });

  it('the full direct preset builds the Hyper Arm from scratch, whatever stood before', () => {
    const w = aliveWorld(directDb());
    const loadout = w.weapons.loadouts[0];
    const ship = w.players[0];
    for (let i = 0; i < 20; i++) collectArm(ship.shield); // a count of 20
    applyDirectLoadout(loadout, ship, 'full');
    expect([ship.shield.tier, ship.shield.charge, ship.shield.hits]).toEqual([3, 9, 5]);
    expect(ship.shield.absorbsTerrain).toBe(true);
    expect(ship.speedLevel).toBe(0);
  });

  it('Direct-mode shots are Straight or SpreadBomb kinds only', () => {
    const w = ready(directDb());
    const loadout = w.weapons.loadouts[0];
    const kinds = new Set<number>();
    const input = createInputSnapshot();
    for (let shot = 0; shot <= 8; shot++) {
      for (const family of [0, 1]) {
        loadout.shot = shot;
        loadout.sub = shot;
        loadout.family = family;
        w.weapons.pool.clear();
        w.weapons.timers.fill(0);
        stepWorld(w, input);
        const f = w.weapons.pool.fields;
        for (let i = 0; i < w.weapons.pool.count; i++) kinds.add(f.kind[i]);
      }
    }
    expect([...kinds].sort()).toEqual([ShotKind.Straight, ShotKind.SpreadBomb].sort());
  });
});
