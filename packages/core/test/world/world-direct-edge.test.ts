/**
 * Direct mode and the ship choice in the World (plan M2-05) beyond the powerups / weapons suites:
 *
 * - `createWorld` flies the config's ship, the content's first for an unknown id, the built-in ship
 *   without content — in either power-up model (Direct mode on a ship without families just never
 *   fires a family), and starts every player at the ship's `startSpeedLevel` in Direct mode only;
 * - the rank's power term in Direct mode reads the levels and the Arm (not the meter fields, not a
 *   meter shield) and takes the most powerful active ship; `directPowerRank` on odd input;
 * - the state hash covers the Direct-mode levels, the family and the plan cursor;
 * - a meter session on a stage with a plan never moves the cursor.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { Action, createInputSnapshot } from '../../src/input/index.js';
import { DEFAULT_PLAYER_SHIP } from '../../src/player/index.js';
import { ItemKind } from '../../src/powerups/index.js';
import { RANK_ARM_TIER, directPowerRank } from '../../src/rank/index.js';
import { FORCE_FIELD, ShieldKind, collectArm, grantShield } from '../../src/shields/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import { createWorld, stepWorld, updateWorldRank } from '../../src/world/index.js';
import { aliveWorld, directDb, run } from '../helpers/direct.js';

/** The shipped Direct-mode content. */
const DB = directDb();

describe('core/world the ship choice', () => {
  it('flies the config`s ship, else the content`s first, else the built-in one', () => {
    expect(aliveWorld(DB).ship.id).toBe('manta');
    expect(aliveWorld(DB, { shipId: 'kestrel', powerUpMode: 'meter' }).ship.id).toBe('kestrel');
    expect(aliveWorld(DB, { shipId: 'no-such-ship' }).ship.id).toBe(DB.ships[0].id);
    const bare = createWorld(
      resolveGameConfig({ shipId: 'manta', powerUpMode: 'direct' }),
      EMPTY_CONTENT_DB,
    );
    expect(bare.ship).toBe(DEFAULT_PLAYER_SHIP);
    expect(bare.weapons.mainFamilies).toEqual([]);
    // Free flight with no families: it steps and fires nothing.
    const input = createInputSnapshot();
    for (let t = 0; t < 120; t++) stepWorld(bare, input);
    expect(bare.weapons.pool.count).toBe(0);
  });

  it('starts at the ship`s startSpeedLevel in Direct mode, at level 0 in meter mode', () => {
    expect(aliveWorld(DB).players[0].speedLevel).toBe(1);
    expect(aliveWorld(DB, { powerUpMode: 'meter' }).players[0].speedLevel).toBe(0);
    // The KESTREL in Direct mode: its own start (0).
    expect(aliveWorld(DB, { shipId: 'kestrel' }).players[0].speedLevel).toBe(0);
  });

  it('the power-up model is the config`s, not the ship`s', () => {
    const kestrel = aliveWorld(DB, { shipId: 'kestrel' }); // Direct mode on the meter ship
    expect(kestrel.powerups.direct).toBe(true);
    expect(kestrel.weapons.direct).toBe(true);
    const manta = aliveWorld(DB, { powerUpMode: 'meter' }); // the MANTA on the meter
    expect(manta.powerups.direct).toBe(false);
    expect(manta.weapons.direct).toBe(false);
  });

  it('a meter session on a stage with a plan never moves the plan cursor', () => {
    const w = aliveWorld(DB, { stage: 'direct-range', powerUpMode: 'meter' });
    expect(w.powerups.plan.length).toBeGreaterThan(0);
    const input = createInputSnapshot();
    w.debugFlags.godMode = true;
    let capsules = 0;
    for (let t = 0; t < 1800; t++) {
      run(w, input, (t / 50) % 2 < 1 ? Action.Up : Action.Down);
      for (let i = 0; i < w.powerups.pool.count; i++) {
        if (w.powerups.pool.fields.kind[i] === ItemKind.Capsule) capsules++;
      }
    }
    // The carriers' `powerup` drops became capsules; the plan was never read.
    expect(capsules).toBeGreaterThan(0);
    expect(w.powerups.planCursor).toBe(0);
  });
});

describe('core/world the Direct-mode rank', () => {
  it('reads the levels and the Arm, never the meter fields or a meter shield', () => {
    const w = aliveWorld(DB);
    const base = w.config.rankBase;
    const loadout = w.weapons.loadouts[0];
    const ship = w.players[0];
    loadout.main = MainWeapon.Laser;
    loadout.missile = true;
    loadout.options = 4;
    grantShield(ship.shield, FORCE_FIELD);
    expect(updateWorldRank(w)).toBe(base);
    loadout.shot = 3;
    loadout.sub = 4;
    expect(updateWorldRank(w)).toBe(base + 3);
    for (let i = 0; i < 4; i++) collectArm(ship.shield); // silver
    expect(updateWorldRank(w)).toBe(base + 3 + RANK_ARM_TIER[2]);
  });

  it('takes the most powerful active ship', () => {
    const w = aliveWorld(DB);
    const base = w.config.rankBase;
    w.weapons.loadouts[0].shot = 2;
    w.players[1].active = true;
    w.weapons.loadouts[1].shot = 8;
    w.weapons.loadouts[1].sub = 8;
    expect(updateWorldRank(w)).toBe(base + 8);
    w.players[1].active = false;
    expect(updateWorldRank(w)).toBe(base + 1);
  });

  it('directPowerRank: whole non-negative levels, the tier clamped to 0 … 3', () => {
    expect(directPowerRank(Number.NaN, Number.NaN, Number.NaN)).toBe(0);
    expect(directPowerRank(2.9, 2.9, 0)).toBe(2);
    expect(directPowerRank(1, 0, 2.5)).toBe(RANK_ARM_TIER[2]);
    expect(directPowerRank(0, 0, 0.5)).toBe(0);
    expect(directPowerRank(0, 0, -2)).toBe(0);
    expect(directPowerRank(8, 7, 99)).toBe(7 + RANK_ARM_TIER[3]);
    for (let shot = 0; shot <= 8; shot++) {
      for (let tier = 0; tier <= 3; tier++) {
        const r = directPowerRank(shot, 8 - shot, tier);
        expect(r).toBe(4 + RANK_ARM_TIER[tier]);
        expect(r).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe('core/world the Direct-mode state in the hash', () => {
  it('covers the levels, the family and the plan cursor', () => {
    const fresh = (): ReturnType<typeof aliveWorld> => aliveWorld(DB);
    const cleared = (w: ReturnType<typeof aliveWorld>): number => {
      w.pools.clearAll();
      return hashWorld(w);
    };
    const reference = cleared(fresh());
    expect(cleared(fresh())).toBe(reference);
    const edits: Array<(w: ReturnType<typeof aliveWorld>) => void> = [
      (w) => (w.weapons.loadouts[0].shot = 1),
      (w) => (w.weapons.loadouts[0].sub = 1),
      (w) => (w.weapons.loadouts[0].family = 1),
      (w) => w.powerups.dropDirect(w.camera.x + 100, w.camera.y + 100), // the item is cleared: the cursor
    ];
    for (const edit of edits) {
      const w = fresh();
      edit(w);
      expect(cleared(w)).not.toBe(reference);
    }
    // An Arm too (its kind, hits, tier and count).
    const armed = fresh();
    collectArm(armed.players[0].shield);
    expect(armed.players[0].shield.kind).toBe(ShieldKind.Arm);
    expect(cleared(armed)).not.toBe(reference);
  });
});
