/**
 * Boundary tests for resolveGameConfig: every numeric field accepts its inclusive range
 * and rejects anything outside it, non-integers, NaN and infinities.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG, resolveGameConfig, type GameConfig } from '../../src/config/index.js';

type NumericField =
  'internalWidth' | 'internalHeight' | 'tickRate' | 'maxTicksPerFrame' | 'seed' | 'startingLives';

const RANGES: ReadonlyArray<readonly [NumericField, number, number]> = [
  ['internalWidth', 16, 4096],
  ['internalHeight', 16, 4096],
  ['tickRate', 1, 1000],
  ['maxTicksPerFrame', 1, 60],
  ['seed', 0, 0xffffffff],
  ['startingLives', 1, 5],
];

describe('core/config resolveGameConfig boundaries', () => {
  it.each(RANGES)('%s accepts its inclusive bounds [%d, %d]', (field, min, max) => {
    expect(resolveGameConfig({ [field]: min })[field]).toBe(min);
    expect(resolveGameConfig({ [field]: max })[field]).toBe(max);
  });

  it.each(RANGES)('%s rejects values just outside [%d, %d]', (field, min, max) => {
    expect(() => resolveGameConfig({ [field]: min - 1 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ [field]: max + 1 })).toThrow(RangeError);
  });

  it.each(RANGES)('%s rejects non-integers, NaN and infinities', (field, min) => {
    for (const bad of [min + 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => resolveGameConfig({ [field]: bad }), `${field}=${bad}`).toThrow(RangeError);
    }
  });

  it('names the field, the range and the value in the error message', () => {
    expect(() => resolveGameConfig({ startingLives: 9 })).toThrow(
      'GameConfig.startingLives must be an integer in [1, 5], got 9',
    );
  });

  it('accepts the full unsigned 32-bit seed range (replay headers store it as u32)', () => {
    expect(resolveGameConfig({ seed: 0 }).seed).toBe(0);
    expect(resolveGameConfig({ seed: 2 ** 32 - 1 }).seed).toBe(4294967295);
    expect(() => resolveGameConfig({ seed: 2 ** 32 })).toThrow(RangeError);
  });

  it('never mutates the defaults and returns a new frozen object each call', () => {
    const before = { ...DEFAULT_GAME_CONFIG };
    const a = resolveGameConfig({ difficulty: 'hard', autofire: false });
    const b = resolveGameConfig();
    expect(DEFAULT_GAME_CONFIG).toEqual(before);
    expect(a).not.toBe(DEFAULT_GAME_CONFIG);
    expect(b).not.toBe(DEFAULT_GAME_CONFIG);
    expect(b).toEqual(DEFAULT_GAME_CONFIG);
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => {
      (a as { tickRate: number }).tickRate = 30;
    }).toThrow(TypeError);
  });

  it('passes string-valued presets through unchanged', () => {
    const config = resolveGameConfig({
      difficulty: 'arcade',
      powerUpMode: 'meter',
      deathPenalty: 'arcade',
      remoteMode: false,
    });
    expect(config).toMatchObject({
      difficulty: 'arcade',
      powerUpMode: 'meter',
      deathPenalty: 'arcade',
      remoteMode: false,
    });
  });

  it('keeps the config plain JSON data (it is copied into replay headers)', () => {
    const config: GameConfig = resolveGameConfig({ seed: 42 });
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
  });

  it('defaults to an internal resolution that scales to 1080p exactly by 5 and to 720p by 3', () => {
    const { internalWidth: w, internalHeight: h } = DEFAULT_GAME_CONFIG;
    expect([1920 / w, 1080 / h]).toEqual([5, 5]);
    expect([Math.floor(1280 / w), Math.floor(720 / h)]).toEqual([3, 3]);
    expect(w / h).toBeCloseTo(16 / 9, 10);
  });
});
