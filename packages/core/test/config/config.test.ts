import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_POWER_UP_ORDER,
  DEFAULT_GAME_CONFIG,
  HUD_BAR_HEIGHT,
  MAX_AUTO_POWER_UP_ORDER,
  METER_SLOT_NAMES,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  moduleInfo,
  resolveGameConfig,
  type GameConfig,
} from '../../src/config/index.js';

describe('core/config', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('config');
  });

  it('defaults to the 384x216 internal resolution at 60 Hz, remote-first', () => {
    expect(DEFAULT_GAME_CONFIG.internalWidth).toBe(384);
    expect(DEFAULT_GAME_CONFIG.internalHeight).toBe(216);
    expect(DEFAULT_GAME_CONFIG.tickRate).toBe(60);
    expect(DEFAULT_GAME_CONFIG.remoteMode).toBe(true);
    expect(DEFAULT_GAME_CONFIG.autofire).toBe(true);
    expect(Object.isFrozen(DEFAULT_GAME_CONFIG)).toBe(true);
  });

  it('merges overrides and freezes the result', () => {
    const config = resolveGameConfig({ startingLives: 5, powerUpMode: 'meter' });
    expect(config.startingLives).toBe(5);
    expect(config.powerUpMode).toBe('meter');
    expect(config.tickRate).toBe(60);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('rejects out-of-range values', () => {
    expect(() => resolveGameConfig({ startingLives: 0 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ tickRate: 59.5 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ seed: -1 })).toThrow(RangeError);
  });

  it('aims at 32 directions by default and accepts powers of two from 4 to 1024 (M1-09)', () => {
    expect(DEFAULT_GAME_CONFIG.aimDirections).toBe(32);
    for (const n of [4, 16, 32, 1024])
      expect(resolveGameConfig({ aimDirections: n }).aimDirections).toBe(n);
    for (const n of [2, 12, 33, 2048, 16.5, Number.NaN]) {
      expect(() => resolveGameConfig({ aimDirections: n }), String(n)).toThrow(RangeError);
    }
  });

  it('autofires every 4 ticks, missiles every 10, with the default loadout (M1-10)', () => {
    expect(DEFAULT_GAME_CONFIG.autofireInterval).toBe(4);
    expect(DEFAULT_GAME_CONFIG.missileInterval).toBe(10);
    expect(DEFAULT_GAME_CONFIG.loadout).toBe('default');
    const config = resolveGameConfig({ autofireInterval: 1, missileInterval: 60, loadout: 'full' });
    expect([config.autofireInterval, config.missileInterval, config.loadout]).toEqual([
      1,
      60,
      'full',
    ]);
    for (const n of [0, 61, 2.5, Number.NaN]) {
      expect(() => resolveGameConfig({ autofireInterval: n }), String(n)).toThrow(RangeError);
      expect(() => resolveGameConfig({ missileInterval: n }), String(n)).toThrow(RangeError);
    }
    const bad = { loadout: 'max' } as unknown as Partial<GameConfig>;
    expect(() => resolveGameConfig(bad)).toThrow(/loadout/);
  });
});

describe('core/config power-up options (M1-11)', () => {
  it('defaults to the meter, Auto Power-Up off with its default order, and the magnet on', () => {
    expect(DEFAULT_GAME_CONFIG.powerUpMode).toBe('meter');
    expect(DEFAULT_GAME_CONFIG.autoPowerUp).toBe(false);
    expect(DEFAULT_GAME_CONFIG.pickupMagnet).toBe(true);
    expect(DEFAULT_GAME_CONFIG.autoPowerUpOrder).toEqual([
      'speed',
      'missile',
      'laser',
      'option',
      'option',
      'option',
      'option',
      'shield',
    ]);
    expect(DEFAULT_GAME_CONFIG.autoPowerUpOrder).toBe(DEFAULT_AUTO_POWER_UP_ORDER);
    expect(Object.isFrozen(DEFAULT_AUTO_POWER_UP_ORDER)).toBe(true);
    expect(METER_SLOT_NAMES).toEqual([
      'speed',
      'missile',
      'double',
      'laser',
      'option',
      'shield',
      'mega',
    ]);
  });

  it('accepts Direct mode since M2-05 (and rejects anything that is not a mode)', () => {
    const direct = resolveGameConfig({ powerUpMode: 'direct', shipId: 'manta' });
    expect(direct.powerUpMode).toBe('direct');
    expect(direct.shipId).toBe('manta');
    expect(DEFAULT_GAME_CONFIG.shipId).toBe('kestrel');
    const bad = { powerUpMode: 'items' } as unknown as Partial<GameConfig>;
    expect(() => resolveGameConfig(bad)).toThrow(RangeError);
    expect(() => resolveGameConfig({ shipId: '' })).toThrow(/shipId/);
  });

  it('validates and copies the Auto Power-Up order', () => {
    const order: GameConfig['autoPowerUpOrder'] = ['double', 'option', 'mega'];
    const config = resolveGameConfig({ autoPowerUp: true, autoPowerUpOrder: order });
    expect(config.autoPowerUpOrder).toEqual(order);
    expect(config.autoPowerUpOrder).not.toBe(order);
    expect(Object.isFrozen(config.autoPowerUpOrder)).toBe(true);
    expect(resolveGameConfig({ autoPowerUpOrder: [] }).autoPowerUpOrder).toEqual([]);
    const full = new Array<'speed'>(MAX_AUTO_POWER_UP_ORDER).fill('speed');
    expect(resolveGameConfig({ autoPowerUpOrder: full }).autoPowerUpOrder).toHaveLength(32);
    for (const bad of [
      [...full, 'speed'],
      ['speed', 'bomb'],
      'speed',
      null,
      [3],
    ] as unknown as GameConfig['autoPowerUpOrder'][]) {
      expect(() => resolveGameConfig({ autoPowerUpOrder: bad }), String(bad)).toThrow(RangeError);
    }
    // Still plain JSON for replay headers.
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
  });
});

describe('core/config screen layout (decision D20)', () => {
  it('puts a 384×200 playfield between two 8-px HUD bars of the 384×216 frame', () => {
    expect([HUD_BAR_HEIGHT, PLAYFIELD_Y, PLAYFIELD_W, PLAYFIELD_H]).toEqual([8, 8, 384, 200]);
    expect(PLAYFIELD_W).toBe(DEFAULT_GAME_CONFIG.internalWidth);
    expect(PLAYFIELD_Y + PLAYFIELD_H + HUD_BAR_HEIGHT).toBe(DEFAULT_GAME_CONFIG.internalHeight);
  });
});
