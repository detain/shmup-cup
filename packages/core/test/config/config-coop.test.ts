/**
 * The co-op fields of `GameConfig` (plan M2-06): `coop` (off by default) and its drop scaling
 * `coopExtra` (0.5 by default, a finite number 0–4), their validation, and `withCoop` (the title's
 * `1 PLAYER` / `2 PLAYERS`), which keeps the config object when nothing changes.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COOP_EXTRA,
  DEFAULT_GAME_CONFIG,
  MAX_COOP_EXTRA,
  resolveGameConfig,
  withCoop,
  withDifficulty,
} from '../../src/config/index.js';

describe('core/config co-op (M2-06)', () => {
  it('plays one player by default, with half an extra item per drop in co-op', () => {
    expect(DEFAULT_GAME_CONFIG.coop).toBe(false);
    expect(DEFAULT_GAME_CONFIG.coopExtra).toBe(DEFAULT_COOP_EXTRA);
    expect(DEFAULT_COOP_EXTRA).toBe(0.5);
    const config = resolveGameConfig({ coop: true, coopExtra: 1.25 });
    expect([config.coop, config.coopExtra]).toEqual([true, 1.25]);
  });

  it('validates coop and coopExtra', () => {
    for (const coopExtra of [-0.1, MAX_COOP_EXTRA + 0.5, Number.NaN, Infinity]) {
      expect(() => resolveGameConfig({ coopExtra }), String(coopExtra)).toThrow(RangeError);
    }
    expect(resolveGameConfig({ coopExtra: 0 }).coopExtra).toBe(0);
    expect(resolveGameConfig({ coopExtra: MAX_COOP_EXTRA }).coopExtra).toBe(MAX_COOP_EXTRA);
    expect(() => resolveGameConfig({ coop: 'yes' as unknown as boolean })).toThrow(
      /GameConfig.coop must be a boolean/,
    );
  });

  it('switches players with withCoop, keeping the object when unchanged and the rest intact', () => {
    const one = resolveGameConfig({ seed: 7, difficulty: 'hard' });
    expect(withCoop(one, false)).toBe(one);
    const two = withCoop(one, true);
    expect(two.coop).toBe(true);
    expect(Object.isFrozen(two)).toBe(true);
    expect({ ...two, coop: false }).toEqual(one);
    expect(withCoop(two, true)).toBe(two);
    // A difficulty switch keeps the players.
    expect(withDifficulty(two, 'easy').coop).toBe(true);
  });
});
