/**
 * Boundary tests for resolveGameConfig: every numeric field accepts its inclusive range
 * and rejects anything outside it, non-integers, NaN and infinities.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_POWER_UP_ORDER,
  DEFAULT_GAME_CONFIG,
  MAX_AUTO_POWER_UP_ORDER,
  METER_SLOT_NAMES,
  resolveGameConfig,
  type GameConfig,
  type MeterSlotName,
} from '../../src/config/index.js';

type NumericField =
  | 'internalWidth'
  | 'internalHeight'
  | 'tickRate'
  | 'maxTicksPerFrame'
  | 'seed'
  | 'startingLives'
  | 'loop'
  | 'timeLimit';

const RANGES: ReadonlyArray<readonly [NumericField, number, number]> = [
  ['internalWidth', 16, 4096],
  ['internalHeight', 16, 4096],
  ['tickRate', 1, 1000],
  ['maxTicksPerFrame', 1, 60],
  ['seed', 0, 0xffffffff],
  // 1–9 since M3-01 (the title's secret code gives more ships than the menus' 1–5).
  ['startingLives', 1, 9],
  // M3-01: the loop and the caravan's clock.
  ['loop', 1, 8],
  ['timeLimit', 0, 216_000],
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
    expect(() => resolveGameConfig({ startingLives: 10 })).toThrow(
      'GameConfig.startingLives must be an integer in [1, 9], got 10',
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

describe('core/config power-up options edge cases (M1-11)', () => {
  it('keeps the default order itself, even when passed explicitly', () => {
    expect(resolveGameConfig().autoPowerUpOrder).toBe(DEFAULT_AUTO_POWER_UP_ORDER);
    expect(
      resolveGameConfig({ autoPowerUpOrder: DEFAULT_AUTO_POWER_UP_ORDER }).autoPowerUpOrder,
    ).toBe(DEFAULT_AUTO_POWER_UP_ORDER);
  });

  it("isolates the config from later changes to the caller's array", () => {
    const order: MeterSlotName[] = ['speed', 'option'];
    const config = resolveGameConfig({ autoPowerUpOrder: order });
    order[0] = 'mega';
    order.push('shield');
    expect(config.autoPowerUpOrder).toEqual(['speed', 'option']);
    expect(() => {
      (config.autoPowerUpOrder as MeterSlotName[]).push('laser');
    }).toThrow(TypeError);
  });

  it('accepts every slot name, repeated, up to the limit', () => {
    const order: MeterSlotName[] = [];
    while (order.length < MAX_AUTO_POWER_UP_ORDER) {
      order.push(METER_SLOT_NAMES[order.length % METER_SLOT_NAMES.length]);
    }
    expect(resolveGameConfig({ autoPowerUpOrder: order }).autoPowerUpOrder).toEqual(order);
  });

  it('names the bad entry and its index, and rejects holes and non-arrays', () => {
    expect(() =>
      resolveGameConfig({ autoPowerUpOrder: ['speed', 'Speed'] as unknown as MeterSlotName[] }),
    ).toThrow(
      'GameConfig.autoPowerUpOrder[1] must be one of speed, missile, double, laser, option, ' +
        'shield, mega, got Speed',
    );
    // eslint-disable-next-line no-sparse-arrays
    const holey = ['speed', , 'laser'] as unknown as MeterSlotName[];
    expect(() => resolveGameConfig({ autoPowerUpOrder: holey })).toThrow('[1]');
    const notArrays: [string, unknown][] = [
      ['undefined', undefined],
      ['object', {}],
      ['array-like', { length: 1, 0: 'speed' }],
      ['number', 7],
    ];
    for (const [label, bad] of notArrays) {
      expect(
        () =>
          resolveGameConfig({
            autoPowerUpOrder: bad as GameConfig['autoPowerUpOrder'],
          }),
        label,
      ).toThrow(`at most ${MAX_AUTO_POWER_UP_ORDER} meter slots`);
    }
  });

  it('names the bad power-up mode (Direct mode is accepted since M2-05)', () => {
    expect(() =>
      resolveGameConfig({ powerUpMode: 'Meter' as unknown as GameConfig['powerUpMode'] }),
    ).toThrow("GameConfig.powerUpMode must be 'meter' or 'direct', got Meter");
    expect(resolveGameConfig({ powerUpMode: 'direct' }).powerUpMode).toBe('direct');
  });

  it('survives a replay-header round trip with a custom order', () => {
    const config = resolveGameConfig({
      autoPowerUp: true,
      pickupMagnet: false,
      autoPowerUpOrder: ['laser', 'option', 'option', 'mega'],
    });
    const again = resolveGameConfig(JSON.parse(JSON.stringify(config)) as Partial<GameConfig>);
    expect(again).toEqual(config);
    expect(again.autoPowerUpOrder).not.toBe(config.autoPowerUpOrder);
    // The booleans pass through untouched.
    expect([again.autoPowerUp, again.pickupMagnet]).toEqual([true, false]);
    expect(DEFAULT_GAME_CONFIG.autoPowerUpOrder).toBe(DEFAULT_AUTO_POWER_UP_ORDER);
  });
});
