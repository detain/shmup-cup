/**
 * `core/config` — the meter arsenal fields of plan M2-03: `weaponPreset`, `weaponEdit`,
 * `megaChoice` and `shieldChoice` (defaults, validation, frozen copies), `withArsenal` (the weapon
 * select's START) and `arsenalMatches`, and a replay header that records and restores them.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG,
  MEGA_CHOICES,
  SHIELD_CHOICES,
  WEAPON_EDIT_SLOTS,
  arsenalMatches,
  resolveGameConfig,
  withArsenal,
  withDifficulty,
  type GameConfig,
} from '../../src/config/index.js';
import { createReplayHeader, decodeReplay, encodeReplay } from '../../src/replay/index.js';

describe('core/config arsenal fields (M2-03)', () => {
  it('defaults to Type A, no Weapon Edit, Mega Crash and the Force Field', () => {
    expect(DEFAULT_GAME_CONFIG).toMatchObject({
      weaponPreset: 'type-a',
      weaponEdit: null,
      megaChoice: 'megaCrash',
      shieldChoice: 'forceField',
    });
    expect(MEGA_CHOICES).toEqual(['megaCrash', 'normal', 'speedDown', 'lifeOption', 'fullBarrier']);
    expect(SHIELD_CHOICES).toEqual(['forceField']);
    expect(WEAPON_EDIT_SLOTS).toEqual(['missile', 'double', 'laser']);
    for (const list of [MEGA_CHOICES, SHIELD_CHOICES, WEAPON_EDIT_SLOTS]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });

  it('validates the new fields', () => {
    expect(() => resolveGameConfig({ weaponPreset: '' })).toThrow(/weaponPreset/);
    expect(() => resolveGameConfig({ weaponPreset: 3 as unknown as string })).toThrow(
      /weaponPreset/,
    );
    expect(() => resolveGameConfig({ megaChoice: 'bomb' as never })).toThrow(/megaChoice/);
    expect(() => resolveGameConfig({ shieldChoice: 'reduce' as never })).toThrow(/shieldChoice/);
    expect(() => resolveGameConfig({ weaponEdit: 'x' as never })).toThrow(/weaponEdit must be/);
    expect(() =>
      resolveGameConfig({ weaponEdit: { missile: 'a', double: '', laser: 'c' } }),
    ).toThrow(/weaponEdit.double/);
    expect(() => resolveGameConfig({ weaponEdit: { missile: 'a', laser: 'c' } as never })).toThrow(
      /weaponEdit.double/,
    );
    // An explicit `undefined` Weapon Edit is none.
    expect(resolveGameConfig({ weaponEdit: undefined }).weaponEdit).toBeNull();
  });

  it('keeps a frozen copy of the Weapon Edit with exactly its three fields', () => {
    const edit = { missile: 'm', double: 'd', laser: 'l', extra: 1 };
    const config = resolveGameConfig({ weaponEdit: edit });
    expect(config.weaponEdit).toEqual({ missile: 'm', double: 'd', laser: 'l' });
    expect(config.weaponEdit).not.toBe(edit);
    expect(Object.isFrozen(config.weaponEdit)).toBe(true);
  });

  it('withArsenal sets the loadout fields and keeps everything else', () => {
    const base = withDifficulty(resolveGameConfig({ seed: 9, startingLives: 5 }), 'hard');
    const armed = withArsenal(base, {
      weaponPreset: 'type-c',
      weaponEdit: { missile: 'missile.torpedo', double: 'shot.free', laser: 'laser.twin' },
      megaChoice: 'speedDown',
      shieldChoice: 'forceField',
      autoPowerUp: true,
      autoPowerUpOrder: ['speed', 'option'],
      // `undefined` keeps the config's value.
      difficulty: undefined,
    } as never);
    expect(armed).toMatchObject({
      seed: 9,
      difficulty: 'hard',
      startingLives: base.startingLives,
      rankBase: 4,
      weaponPreset: 'type-c',
      megaChoice: 'speedDown',
      autoPowerUp: true,
      autoPowerUpOrder: ['speed', 'option'],
    });
    expect(armed.weaponEdit?.laser).toBe('laser.twin');
    expect(Object.isFrozen(armed)).toBe(true);
    expect(() => withArsenal(base, { megaChoice: 'x' as never })).toThrow(RangeError);
  });

  it('arsenalMatches tells whether a loadout changes a config', () => {
    const config: GameConfig = resolveGameConfig();
    expect(arsenalMatches(config, {})).toBe(true);
    expect(
      arsenalMatches(config, {
        weaponPreset: 'type-a',
        weaponEdit: null,
        megaChoice: 'megaCrash',
        shieldChoice: 'forceField',
        autoPowerUp: false,
        autoPowerUpOrder: config.autoPowerUpOrder.slice(),
      }),
    ).toBe(true);
    expect(arsenalMatches(config, { weaponPreset: 'type-b' })).toBe(false);
    expect(arsenalMatches(config, { megaChoice: 'normal' })).toBe(false);
    expect(arsenalMatches(config, { autoPowerUp: true })).toBe(false);
    expect(arsenalMatches(config, { autoPowerUpOrder: ['speed'] })).toBe(false);
    expect(
      arsenalMatches(config, { autoPowerUpOrder: config.autoPowerUpOrder.map(() => 'speed') }),
    ).toBe(false);
    const edit = { missile: 'a', double: 'b', laser: 'c' };
    expect(arsenalMatches(config, { weaponEdit: edit })).toBe(false);
    const edited = resolveGameConfig({ weaponEdit: edit });
    expect(arsenalMatches(edited, { weaponEdit: { ...edit } })).toBe(true);
    expect(arsenalMatches(edited, { weaponEdit: { ...edit, laser: 'd' } })).toBe(false);
    expect(arsenalMatches(edited, { weaponEdit: null })).toBe(false);
  });

  it('a replay header records the loadout and restores it', () => {
    const config = resolveGameConfig({
      seed: 4,
      weaponPreset: 'type-d',
      weaponEdit: { missile: 'missile.spread', double: 'shot.tail', laser: 'laser.ripple' },
      megaChoice: 'fullBarrier',
    });
    const header = createReplayHeader(config, { buildId: 'test' });
    const json = encodeReplay({
      header,
      ticks: 0,
      hashInterval: 600,
      inputs: [new Uint32Array(0), new Uint32Array(0)],
      hashes: new Uint32Array(0),
      finalHash: 0,
    });
    const text = JSON.parse(JSON.stringify(json)) as unknown;
    const decoded = decodeReplay(text);
    expect(decoded.header.config).toMatchObject({
      weaponPreset: 'type-d',
      weaponEdit: { missile: 'missile.spread', double: 'shot.tail', laser: 'laser.ripple' },
      megaChoice: 'fullBarrier',
      shieldChoice: 'forceField',
    });
  });
});
