/**
 * The behaviour tunables anchored to the frame (plan_resolution.md R1-01, §2.6): every
 * `laserLength` default is one screen width (`PLAYFIELD_W`), `captain.circler` circles the
 * playfield's centre and `boss.steed` bobs round a boss's default home (`DEFAULT_BOSS_X` /
 * `DEFAULT_BOSS_Y`). They derive from the frame constants, so R2-01's switch moves them with the
 * frame; world tunables (radii, margins, speeds, view points such as `turnX`) stay literal.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BEHAVIORS, DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { PLAYFIELD_CY, PLAYFIELD_W } from '../../src/config/index.js';
import { DEFAULT_BOSS_X, DEFAULT_BOSS_Y } from '../../src/data/index.js';

/** The behaviours with a `laserLength` tunable (enemy and boss registries). */
const LASER_BEHAVIORS = [
  'emitter.laser',
  'boss.lanes',
  'boss.bulwark',
  'boss.widow',
  'boss.bastion',
  'boss.facet',
  'boss.sovereign',
];

/**
 * The defaults of a behaviour, from whichever registry has it.
 *
 * @param id - Script id.
 * @returns Its default tunables (empty when unknown).
 */
function defaults(id: string): Readonly<Record<string, number>> {
  return DEFAULT_BEHAVIORS.get(id)?.params ?? DEFAULT_BOSS_BEHAVIORS.get(id)?.params ?? {};
}

describe('core/behaviors — frame-anchored defaults (R1-01)', () => {
  it('gives every laserLength default one screen width', () => {
    const found: string[] = [];
    for (const id of [...DEFAULT_BEHAVIORS.ids, ...DEFAULT_BOSS_BEHAVIORS.ids]) {
      const length = defaults(id).laserLength;
      if (length === undefined) continue;
      found.push(id);
      expect(length, id).toBe(PLAYFIELD_W);
    }
    expect(found.sort()).toEqual([...LASER_BEHAVIORS].sort());
  });

  it('centres captain.circler on the playfield and boss.steed on the default boss home', () => {
    expect(defaults('captain.circler')).toMatchObject({ cx: PLAYFIELD_W / 2, cy: PLAYFIELD_CY });
    expect(defaults('boss.steed')).toMatchObject({ cx: DEFAULT_BOSS_X, cy: DEFAULT_BOSS_Y });
  });

  it('keeps the derived defaults whole numbers (they reach the movers as positions)', () => {
    const derived = [
      defaults('captain.circler').cx,
      defaults('captain.circler').cy,
      defaults('boss.steed').cx,
      defaults('boss.steed').cy,
    ];
    for (const id of LASER_BEHAVIORS) derived.push(defaults(id).laserLength);
    for (const value of derived) expect(Number.isInteger(value)).toBe(true);
  });
});
