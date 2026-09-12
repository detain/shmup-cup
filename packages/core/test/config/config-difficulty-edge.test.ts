/**
 * Edge cases of the M2-01 difficulty presets in `core/config` beyond
 * `config-difficulty.test.ts`:
 *
 * - `withDifficulty` between every pair of presets keeps every non-preset field (seed, stage,
 *   loadout, power-up order, magnet …) and sets every preset field; a round trip through all four
 *   presets lands on the start; the result of a switch is valid for `resolveGameConfig`;
 * - `difficultyOverrides` returns a fresh object each call, not a table row;
 * - a table (the content's) with an out-of-range row fails `resolveGameConfig` only for that
 *   preset, naming the field — explicit overrides of the bad field repair it;
 * - `difficulty: undefined` means Normal; an explicit override of each preset field wins, one at a
 *   time; `withDifficulty` refuses an unknown preset.
 *
 * Regression (found by these tests): `resolveGameConfig({ difficulty: undefined })` filled the
 * Normal preset's fields but returned `difficulty: undefined` (the explicit key of the overrides
 * won the spread), so a "validated" config carried no preset — its hi-score table key read
 * `meter-undefined`.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIFFICULTY_TABLE,
  DEFAULT_GAME_CONFIG,
  DIFFICULTY_PRESETS,
  difficultyOverrides,
  resolveGameConfig,
  withDifficulty,
  type DifficultyPreset,
  type DifficultyRules,
  type DifficultyTable,
  type GameConfig,
} from '../../src/config/index.js';

/** The fields a preset sets. */
const PRESET_FIELDS = [
  'difficulty',
  'rankBase',
  'rankGrowth',
  'startingLives',
  'extendFirst',
  'extendEvery',
  'continues',
  'deathPenalty',
  'aimDirections',
  'bulletSpeedMul',
] as const;

/**
 * The built-in table with one preset's row changed.
 *
 * @param preset - The preset.
 * @param row - Fields to change in its row.
 * @returns The table.
 */
function tableWith(preset: DifficultyPreset, row: Partial<DifficultyRules>): DifficultyTable {
  return { ...DEFAULT_DIFFICULTY_TABLE, [preset]: { ...DEFAULT_DIFFICULTY_TABLE[preset], ...row } };
}

/**
 * The fields of a config a preset does not set.
 *
 * @param config - A config.
 * @returns Those fields.
 */
function otherFields(config: GameConfig): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config };
  for (const key of PRESET_FIELDS) delete out[key];
  return out;
}

describe('core/config withDifficulty edges (M2-01)', () => {
  const base = resolveGameConfig({
    seed: 77,
    stage: 'zone-a',
    loadout: 'full',
    pickupMagnet: false,
    autoPowerUpOrder: ['laser', 'option'],
    stageSkip: 'boss',
  });

  it('keeps every non-preset field and sets every preset field, for every pair', () => {
    for (const from of DIFFICULTY_PRESETS) {
      const start = withDifficulty(base, from);
      for (const to of DIFFICULTY_PRESETS) {
        const switched = withDifficulty(start, to);
        expect(otherFields(switched)).toEqual(otherFields(base));
        expect(switched).toMatchObject(difficultyOverrides(to));
        expect(Object.isFrozen(switched)).toBe(true);
        // Valid as it is: resolving it again changes nothing.
        expect(resolveGameConfig(switched)).toEqual(switched);
      }
    }
  });

  it('comes back to the start after a round trip through every preset', () => {
    let config = base;
    for (const preset of [...DIFFICULTY_PRESETS, 'normal'] as DifficultyPreset[]) {
      config = withDifficulty(config, preset);
    }
    expect(config).toEqual(base);
  });

  it('refuses an unknown preset', () => {
    expect(() => withDifficulty(base, 'insane' as DifficultyPreset)).toThrow(RangeError);
  });

  it('uses the given table for the switch and fails on its bad rows', () => {
    const bad = tableWith('hard', { aimDirections: 24 });
    expect(() => withDifficulty(base, 'hard', bad)).toThrow(/aimDirections must be a power of two/);
    expect(withDifficulty(base, 'easy', bad).aimDirections).toBe(16);
  });
});

describe('core/config difficultyOverrides edges (M2-01)', () => {
  it('returns a fresh, writable object each call (never a table row)', () => {
    const a = difficultyOverrides('easy');
    const b = difficultyOverrides('easy');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(false);
    expect(Object.keys(a).sort()).toEqual([...PRESET_FIELDS].sort());
    expect(a).not.toHaveProperty('extends');
    expect(a).not.toHaveProperty('lives');
  });

  it('maps a row`s lives and extends to the config fields', () => {
    const table = tableWith('arcade', { lives: 1, extends: { first: 5_000, every: 0 } });
    expect(difficultyOverrides('arcade', table)).toMatchObject({
      startingLives: 1,
      extendFirst: 5_000,
      extendEvery: 0,
    });
  });
});

describe('core/config a content table with a bad row (M2-01)', () => {
  it.each<[string, Partial<DifficultyRules>, RegExp]>([
    ['rankBase', { rankBase: 40 }, /rankBase/],
    ['rankGrowth', { rankGrowth: 9 }, /rankGrowth/],
    ['lives', { lives: 0 }, /startingLives/],
    ['extends.first', { extends: { first: -5, every: 70_000 } }, /extendFirst/],
    ['continues', { continues: 12 }, /continues/],
    ['aimDirections', { aimDirections: 48 }, /aimDirections/],
    ['bulletSpeedMul', { bulletSpeedMul: 10 }, /bulletSpeedMul/],
  ])('fails only the preset whose %s is out of range', (_name, row, message) => {
    const table = tableWith('hard', row);
    expect(() => resolveGameConfig({ difficulty: 'hard' }, table)).toThrow(message);
    for (const other of DIFFICULTY_PRESETS) {
      if (other !== 'hard')
        expect(() => resolveGameConfig({ difficulty: other }, table)).not.toThrow();
    }
  });

  it('lets an explicit override repair a bad row field', () => {
    const table = tableWith('hard', { continues: 12 });
    expect(resolveGameConfig({ difficulty: 'hard', continues: 2 }, table).continues).toBe(2);
  });
});

describe('core/config preset resolution edges (M2-01)', () => {
  it('treats a missing or undefined difficulty as Normal', () => {
    expect(resolveGameConfig({ difficulty: undefined })).toEqual(DEFAULT_GAME_CONFIG);
    expect(resolveGameConfig({ difficulty: undefined }).difficulty).toBe('normal');
    expect(resolveGameConfig({}, DEFAULT_DIFFICULTY_TABLE).difficulty).toBe('normal');
    // The key keeps its place (a replay header serialises the config in key order).
    expect(Object.keys(resolveGameConfig({ difficulty: 'hard' }))).toEqual(
      Object.keys(DEFAULT_GAME_CONFIG),
    );
  });

  it('lets each preset field be overridden on its own, keeping the others', () => {
    const overrides: Partial<GameConfig> = {
      rankBase: 9,
      rankGrowth: 0.25,
      startingLives: 1,
      extendFirst: 1_000,
      extendEvery: 2_000,
      continues: 7,
      deathPenalty: 'casual',
      aimDirections: 64,
      bulletSpeedMul: 1.5,
    };
    const rules = difficultyOverrides('arcade');
    for (const [key, value] of Object.entries(overrides)) {
      const config = resolveGameConfig({ difficulty: 'arcade', [key]: value });
      expect(config[key as keyof GameConfig], key).toBe(value);
      for (const other of PRESET_FIELDS) {
        if (other !== key) expect(config[other], `${key} → ${other}`).toBe(rules[other]);
      }
    }
  });

  it('accepts the fractional ends of rankGrowth and bulletSpeedMul', () => {
    expect(() => resolveGameConfig({ rankGrowth: 0 })).not.toThrow();
    expect(() => resolveGameConfig({ rankGrowth: 0.001 })).not.toThrow();
    expect(() => resolveGameConfig({ bulletSpeedMul: 4 })).not.toThrow();
    expect(() => resolveGameConfig({ bulletSpeedMul: 0.2499 })).toThrow(/bulletSpeedMul/);
    expect(() => resolveGameConfig({ rankGrowth: Infinity })).toThrow(/rankGrowth/);
    expect(() => resolveGameConfig({ extendFirst: 1.5 })).toThrow(/extendFirst/);
    expect(() => resolveGameConfig({ continues: -1 })).toThrow(/continues/);
  });
});
