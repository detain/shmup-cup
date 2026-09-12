/**
 * `core/config` difficulty presets (plan M2-01, shmup_feat.md §15): the built-in table, the preset
 * fields `resolveGameConfig` fills from a table under explicit overrides, `difficultyOverrides`,
 * `withDifficulty` (the difficulty menu) and the validation of the new fields.
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
  type DifficultyTable,
  type GameConfig,
} from '../../src/config/index.js';

/** A table whose presets differ from the built-in one everywhere. */
const CUSTOM: DifficultyTable = {
  ...DEFAULT_DIFFICULTY_TABLE,
  hard: {
    rankBase: 5,
    rankGrowth: 1.5,
    lives: 1,
    extends: { first: 30_000, every: 0 },
    continues: 1,
    deathPenalty: 'arcade',
    aimDirections: 64,
    bulletSpeedMul: 1.2,
  },
};

describe('core/config difficulty presets (M2-01)', () => {
  it('ships the §15 table: Easy 0 / Normal 2 / Hard 4 / Arcade 6, 16 aim directions on Easy', () => {
    expect([...DIFFICULTY_PRESETS]).toEqual(['easy', 'normal', 'hard', 'arcade']);
    const t = DEFAULT_DIFFICULTY_TABLE;
    expect(DIFFICULTY_PRESETS.map((p) => t[p].rankBase)).toEqual([0, 2, 4, 6]);
    expect(DIFFICULTY_PRESETS.map((p) => t[p].rankGrowth)).toEqual([0.5, 1, 1, 1]);
    expect(DIFFICULTY_PRESETS.map((p) => t[p].lives)).toEqual([5, 3, 3, 2]);
    expect(DIFFICULTY_PRESETS.map((p) => t[p].continues)).toEqual([5, 3, 2, 0]);
    expect(DIFFICULTY_PRESETS.map((p) => t[p].deathPenalty)).toEqual([
      'casual',
      'classic',
      'classic',
      'arcade',
    ]);
    expect(DIFFICULTY_PRESETS.map((p) => t[p].aimDirections)).toEqual([16, 32, 32, 32]);
    expect(DIFFICULTY_PRESETS.map((p) => t[p].bulletSpeedMul)).toEqual([0.85, 1, 1, 1]);
    for (const p of DIFFICULTY_PRESETS)
      expect(t[p].extends).toEqual({ first: 20_000, every: 70_000 });
    expect(Object.isFrozen(t) && Object.isFrozen(t.easy) && Object.isFrozen(t.easy.extends)).toBe(
      true,
    );
  });

  it('makes the default config the Normal row', () => {
    expect(DEFAULT_GAME_CONFIG).toMatchObject(difficultyOverrides('normal'));
    expect(resolveGameConfig()).toEqual(DEFAULT_GAME_CONFIG);
  });

  it.each(DIFFICULTY_PRESETS.map((p) => [p]))(
    'fills the %s preset fields from the table',
    (preset) => {
      const rules = DEFAULT_DIFFICULTY_TABLE[preset];
      const config = resolveGameConfig({ difficulty: preset, seed: 9 });
      expect(config).toMatchObject({
        difficulty: preset,
        seed: 9,
        rankBase: rules.rankBase,
        rankGrowth: rules.rankGrowth,
        startingLives: rules.lives,
        extendFirst: rules.extends.first,
        extendEvery: rules.extends.every,
        continues: rules.continues,
        deathPenalty: rules.deathPenalty,
        aimDirections: rules.aimDirections,
        bulletSpeedMul: rules.bulletSpeedMul,
      });
    },
  );

  it('lets explicit overrides win over the preset', () => {
    const config = resolveGameConfig({ difficulty: 'arcade', startingLives: 5, continues: 4 });
    expect([config.startingLives, config.continues, config.deathPenalty]).toEqual([5, 4, 'arcade']);
  });

  it('reads the preset from another table (the content`s)', () => {
    const config = resolveGameConfig({ difficulty: 'hard' }, CUSTOM);
    expect(config).toMatchObject({
      rankBase: 5,
      rankGrowth: 1.5,
      startingLives: 1,
      extendFirst: 30_000,
      extendEvery: 0,
      continues: 1,
      deathPenalty: 'arcade',
      aimDirections: 64,
      bulletSpeedMul: 1.2,
    });
    expect(difficultyOverrides('hard', CUSTOM).rankBase).toBe(5);
  });

  it('withDifficulty switches every preset field and keeps the rest', () => {
    const base = resolveGameConfig({ seed: 3, stage: 'zone-a', startingLives: 5 });
    const hard = withDifficulty(base, 'hard');
    expect(hard).toMatchObject({ seed: 3, stage: 'zone-a', difficulty: 'hard', rankBase: 4 });
    expect(hard.startingLives).toBe(3); // the preset's, not the old override
    expect(Object.isFrozen(hard)).toBe(true);
    expect(withDifficulty(base, 'hard', CUSTOM).aimDirections).toBe(64);
    expect(withDifficulty(hard, 'normal')).toEqual({ ...base, startingLives: 3 });
  });

  it('rejects an unknown preset and out-of-range preset fields', () => {
    const bad = (overrides: Record<string, unknown>): (() => GameConfig) => {
      return () => resolveGameConfig(overrides);
    };
    expect(bad({ difficulty: 'nightmare' })).toThrow(/difficulty must be one of/);
    expect(() => difficultyOverrides('nightmare' as DifficultyPreset)).toThrow(RangeError);
    expect(bad({ rankBase: 32 })).toThrow(/rankBase/);
    expect(bad({ rankBase: 1.5 })).toThrow(/rankBase/);
    expect(bad({ rankGrowth: -0.1 })).toThrow(/rankGrowth/);
    expect(bad({ rankGrowth: 5 })).toThrow(/rankGrowth/);
    expect(bad({ rankGrowth: Number.NaN })).toThrow(/rankGrowth/);
    expect(bad({ extendFirst: -1 })).toThrow(/extendFirst/);
    expect(bad({ extendEvery: 100_000_000 })).toThrow(/extendEvery/);
    expect(bad({ continues: 10 })).toThrow(/continues/);
    expect(bad({ bulletSpeedMul: 0.1 })).toThrow(/bulletSpeedMul/);
    expect(bad({ bulletSpeedMul: '1' })).toThrow(/bulletSpeedMul/);
    expect(bad({ deathPenalty: 'hardcore' })).toThrow(/deathPenalty/);
    // The ends of every range are fine.
    expect(() =>
      resolveGameConfig({
        rankBase: 31,
        rankGrowth: 4,
        extendFirst: 0,
        extendEvery: 99_999_990,
        continues: 9,
        bulletSpeedMul: 0.25,
      }),
    ).not.toThrow();
  });
});
