import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG,
  HUD_BAR_HEIGHT,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  moduleInfo,
  resolveGameConfig,
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
});

describe('core/config screen layout (decision D20)', () => {
  it('puts a 384×200 playfield between two 8-px HUD bars of the 384×216 frame', () => {
    expect([HUD_BAR_HEIGHT, PLAYFIELD_Y, PLAYFIELD_W, PLAYFIELD_H]).toEqual([8, 8, 384, 200]);
    expect(PLAYFIELD_W).toBe(DEFAULT_GAME_CONFIG.internalWidth);
    expect(PLAYFIELD_Y + PLAYFIELD_H + HUD_BAR_HEIGHT).toBe(DEFAULT_GAME_CONFIG.internalHeight);
  });
});
