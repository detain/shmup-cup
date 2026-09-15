/**
 * `core/config` game and controls options (plan M2-16): `userGameOverrides` /
 * `withUserGameOptions` fold the saved lives, death penalty, Auto Power-Up, magnet, autofire mode
 * and rate — and the one-button preset over them — into a config (the same object when nothing
 * changes), and `resolveBindingOverrides` reads the rebinding defensively.
 */
import { describe, expect, it } from 'vitest';
import {
  AUTOFIRE_INTERVALS,
  AUTOFIRE_MODES,
  BINDING_TOKEN_PATTERN,
  DEFAULT_USER_OPTIONS,
  MAX_ACTION_TOKENS,
  MAX_BINDING_PROFILES,
  resolveBindingOverrides,
  resolveGameConfig,
  resolveUserOptions,
  userGameOverrides,
  withUserGameOptions,
} from '../../src/config/index.js';

describe('core/config game options (M2-16)', () => {
  it('lists the autofire modes and rates', () => {
    expect(AUTOFIRE_MODES).toEqual(['always', 'toggle', 'hold']);
    expect(AUTOFIRE_INTERVALS).toEqual([8, 6, 5, 4, 3, 2]);
    expect(AUTOFIRE_INTERVALS).toContain(resolveGameConfig().autofireInterval);
  });

  it('changes nothing with the defaults: the same config object', () => {
    const config = resolveGameConfig({ seed: 4 });
    expect(userGameOverrides(DEFAULT_USER_OPTIONS)).toEqual({});
    expect(withUserGameOptions(config, DEFAULT_USER_OPTIONS)).toBe(config);
    // Options equal to what the config has change nothing either.
    const same = resolveUserOptions({ game: { lives: 3, pickupMagnet: true } });
    expect(withUserGameOptions(config, same)).toBe(config);
  });

  it('applies every set option over the config', () => {
    const options = resolveUserOptions({
      input: { autofire: 'hold', autofireInterval: 6 },
      game: { lives: 1, deathPenalty: 'arcade', autoPowerUp: true, pickupMagnet: false },
    });
    const config = withUserGameOptions(resolveGameConfig({ difficulty: 'easy' }), options);
    expect(config).toMatchObject({
      difficulty: 'easy',
      startingLives: 1,
      deathPenalty: 'arcade',
      autoPowerUp: true,
      pickupMagnet: false,
      autofireMode: 'hold',
      autofireInterval: 6,
    });
    expect(Object.isFrozen(config)).toBe(true);
    // The rest of the preset stays (Easy's aimed directions).
    expect(config.aimDirections).toBe(16);
  });

  it('the one-button preset wins over the other options', () => {
    const options = resolveUserOptions({
      input: { autofire: 'toggle' },
      game: { oneButton: true, autoPowerUp: false, deathPenalty: 'arcade' },
    });
    expect(userGameOverrides(options)).toEqual({
      autofire: true,
      autofireMode: 'always',
      autoPowerUp: true,
      deathPenalty: 'casual',
    });
    const config = withUserGameOptions(resolveGameConfig({ autofire: false }), options);
    expect([config.autofire, config.autofireMode, config.autoPowerUp, config.deathPenalty]).toEqual(
      [true, 'always', true, 'casual'],
    );
  });

  it('reads the rebinding defensively', () => {
    expect(BINDING_TOKEN_PATTERN.test('code:KeyZ')).toBe(true);
    expect(BINDING_TOKEN_PATTERN.test('key:10009')).toBe(true);
    expect(BINDING_TOKEN_PATTERN.test('button:31')).toBe(true);
    for (const bad of ['button:32', 'key:0', 'code:', 'code:1a', 'pad:3', 'key:1234567']) {
      expect(BINDING_TOKEN_PATTERN.test(bad), bad).toBe(false);
    }
    const tokens = ['code:KeyA', 'code:KeyB', 'code:KeyC', 'code:KeyD', 'code:KeyE'];
    const read = resolveBindingOverrides({
      'keyboard-default': { game: { Shot: tokens, Bogus: ['code:KeyZ'] }, extra: 1 },
      'x y': { game: { Shot: ['code:KeyZ'] } },
      empty: { game: 'no', menu: { Sub: 5 } },
    });
    expect(Object.keys(read)).toEqual(['keyboard-default']);
    expect(read['keyboard-default']?.game?.Shot).toEqual(tokens.slice(0, MAX_ACTION_TOKENS));
    expect(read['keyboard-default']?.menu).toBeUndefined();
    const many: Record<string, unknown> = {};
    for (let i = 0; i < MAX_BINDING_PROFILES + 4; i++) {
      many[`p${String(i).padStart(2, '0')}`] = { menu: { Back: ['key:8'] } };
    }
    expect(Object.keys(resolveBindingOverrides(many))).toHaveLength(MAX_BINDING_PROFILES);
    expect(resolveBindingOverrides('nope')).toEqual({});
  });
});
