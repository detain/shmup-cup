/**
 * `core/rank` (plan M1-09, rank growth M2-01): the rank formula of shmup_feat.md §15 as a table
 * (difficulty base, loop / stage terms, power terms, growth multiplier, 0–31, the cap of 16 on
 * loop 1), the power term, the rank → multiplier curves (exactly 1 at Normal, increasing, higher
 * steps matter more, clamped inputs, a floor on the result), the per-enemy sensitivity and the
 * World's rank-scaled bullet system.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type DifficultyPreset } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import {
  BULLET_SPEED_RANK_CURVE,
  DIFFICULTY_RANK_BASE,
  FIRE_RATE_RANK_CURVE,
  RANK_LOOP1_CAP,
  RANK_MAX,
  RANK_NORMAL,
  RANK_POWER,
  computeRank,
  createRankInputs,
  difficultyRankInputs,
  moduleInfo,
  powerRank,
  rankScale,
  rankSensitivity,
  type RankInputs,
} from '../../src/rank/index.js';
import { rankedWait } from '../../src/patterns/index.js';
import { createWorld } from '../../src/world/index.js';

/**
 * Rank inputs with defaults.
 *
 * @param fields - Fields to change.
 * @returns The inputs.
 */
function inputs(fields: Partial<RankInputs>): RankInputs {
  return { difficultyBase: 2, growth: 1, loop: 1, stage: 1, power: 0, special: 0, ...fields };
}

describe('core/rank', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('rank');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §15');
  });

  it('maps the difficulty presets to the §15 bases (Normal = 2)', () => {
    expect(DIFFICULTY_RANK_BASE).toEqual({ easy: 0, normal: 2, hard: 4, arcade: 6 });
    expect(RANK_NORMAL).toBe(DIFFICULTY_RANK_BASE.normal);
    expect([RANK_MAX, RANK_LOOP1_CAP]).toEqual([31, 16]);
  });

  it('starts every preset at its base (loop 1, stage 1, no power)', () => {
    for (const preset of ['easy', 'normal', 'hard', 'arcade'] as DifficultyPreset[]) {
      const start = difficultyRankInputs(preset);
      expect(start).toEqual({
        difficultyBase: DIFFICULTY_RANK_BASE[preset],
        growth: 1,
        loop: 1,
        stage: 1,
        power: 0,
        special: 0,
      });
      expect(computeRank(start)).toBe(DIFFICULTY_RANK_BASE[preset]);
      const config = resolveGameConfig({ difficulty: preset });
      expect(createRankInputs(config)).toEqual({ ...start, growth: config.rankGrowth });
      expect(computeRank(createRankInputs(config))).toBe(DIFFICULTY_RANK_BASE[preset]);
    }
  });

  it.each([
    // [base, growth, loop, stage, power, special, rank]
    [2, 1, 1, 1, 0, 0, 2],
    [2, 1, 1, 3, 0, 0, 4], // stage − 1
    [2, 1, 1, 3, 5, 0, 9], // + power
    [2, 1, 1, 1, 0, 3, 5], // + special
    [0, 1, 1, 5, 4, 0, 8],
    [4, 1, 1, 1, 12, 0, 16], // exactly the loop-1 cap
    [6, 1, 1, 1, 12, 0, 16], // 18 → capped at 16 on loop 1
    [6, 1, 1, 9, 16, 4, 16],
    [6, 1, 2, 1, 12, 0, 26], // loop 2: + 8, no loop-1 cap
    [6, 1, 3, 1, 12, 0, 31], // 34 → 31
    [2, 1, 2, 1, 0, 0, 10],
    [0, 0.5, 1, 1, 5, 0, 2], // floor(0.5 × 5)
    [0, 0.5, 1, 4, 4, 0, 3], // floor(0.5 × 7)
    [2, 0, 1, 9, 12, 0, 2], // growth 0: a constant rank
    [4, 1.5, 1, 1, 6, 0, 13],
    [2, 4, 1, 1, 12, 0, 16],
  ])(
    'rank(base %d, growth %d, loop %d, stage %d, power %d, special %d) = %d',
    (base, growth, loop, stage, power, special, rank) => {
      expect(
        computeRank(inputs({ difficultyBase: base, growth, loop, stage, power, special })),
      ).toBe(rank);
    },
  );

  it('caps the rank at 16 on loop 1 only', () => {
    expect(computeRank(inputs({ difficultyBase: 6, power: 30 }))).toBe(RANK_LOOP1_CAP);
    expect(computeRank(inputs({ difficultyBase: 6, power: 30, loop: 2 }))).toBe(RANK_MAX);
    // A loop or stage below 1 counts as 1 (loop 1: capped).
    expect(computeRank(inputs({ difficultyBase: 6, power: 30, loop: 0 }))).toBe(RANK_LOOP1_CAP);
    expect(computeRank(inputs({ stage: -4 }))).toBe(2);
  });

  it('rounds the base and clamps to 0 … 31 (non-finite inputs count as 0)', () => {
    const at = (difficultyBase: number, loop = 2): number =>
      computeRank(inputs({ difficultyBase, loop, growth: 0 }));
    expect([at(2.4), at(2.6), at(-3), at(40), at(Number.NaN), at(Infinity)]).toEqual([
      2, 3, 0, 31, 0, 0,
    ]);
    expect(computeRank(inputs({ power: Number.NaN, growth: Number.POSITIVE_INFINITY }))).toBe(2);
    expect(computeRank(inputs({ difficultyBase: 0, power: -9 }))).toBe(0);
  });

  it('adds the §15 power terms (Speed 0, Missile 1, Double 2, Laser 3, Option 1, Shield 4, Reduce 2)', () => {
    expect(RANK_POWER).toEqual({
      speed: 0,
      missile: 1,
      double: 2,
      laser: 3,
      option: 1,
      shield: 4,
      reduce: 2,
    });
    expect(powerRank(0, 0, 0, 0, 0, 0)).toBe(0);
    expect(powerRank(1, 0, 0, 0, 0, 0)).toBe(1);
    expect(powerRank(0, 1, 0, 0, 0, 0)).toBe(2);
    expect(powerRank(0, 0, 1, 0, 0, 0)).toBe(3);
    expect(powerRank(0, 0, 0, 3, 0, 0)).toBe(3);
    expect(powerRank(0, 0, 0, 0, 1, 0)).toBe(4);
    expect(powerRank(0, 0, 0, 0, 0, 1)).toBe(2);
    expect(powerRank(1, 0, 1, 4, 1, 0)).toBe(12);
    expect(powerRank(1, 0, 1, 4.9, 1, 0)).toBe(12); // whole Options only
  });

  it('scales exactly 1 at Normal and the documented values elsewhere', () => {
    for (const curve of [BULLET_SPEED_RANK_CURVE, FIRE_RATE_RANK_CURVE]) {
      expect(rankScale(RANK_NORMAL, curve)).toBe(1);
    }
    const speed = (r: number): number => rankScale(r, BULLET_SPEED_RANK_CURVE);
    const fire = (r: number): number => rankScale(r, FIRE_RATE_RANK_CURVE);
    expect(speed(0)).toBeCloseTo(0.978, 10);
    expect(speed(4)).toBeCloseTo(1.026, 10);
    expect(speed(16)).toBeCloseTo(1.266, 10);
    expect(speed(31)).toBeCloseTo(1.7685, 10);
    expect(fire(0)).toBeCloseTo(0.956, 10);
    expect(fire(31)).toBeCloseTo(2.537, 10);
  });

  it('grows with rank, faster at the top (higher steps matter more)', () => {
    for (const curve of [BULLET_SPEED_RANK_CURVE, FIRE_RATE_RANK_CURVE]) {
      let previousStep = 0;
      for (let r = 1; r <= RANK_MAX; r++) {
        const step = rankScale(r, curve) - rankScale(r - 1, curve);
        expect(step).toBeGreaterThan(previousStep);
        previousStep = step;
      }
    }
  });

  it('clamps the rank argument and never returns less than 0.05', () => {
    const curve = BULLET_SPEED_RANK_CURVE;
    expect(rankScale(-5, curve)).toBe(rankScale(0, curve));
    expect(rankScale(99, curve)).toBe(rankScale(31, curve));
    expect(rankScale(Number.NaN, curve)).toBe(rankScale(0, curve));
    expect(rankScale(31, { perRank: -1, perRankSq: 0 })).toBe(0.05);
  });

  it('bends a multiplier by an enemy modifier (1 keeps it, 0 ignores rank)', () => {
    const scale = rankScale(16, BULLET_SPEED_RANK_CURVE);
    expect(rankSensitivity(scale, 1)).toBe(scale);
    expect(rankSensitivity(scale, 0)).toBe(1);
    expect(rankSensitivity(scale, 2)).toBeCloseTo(1 + 2 * (scale - 1), 12);
    expect(rankSensitivity(scale, Number.NaN)).toBe(scale);
    expect(rankSensitivity(1, 8)).toBe(1); // Normal: every modifier gives × 1
    expect(rankSensitivity(0.5, 8)).toBe(0.05);
  });

  it('gives the World its rank and the bullet system its speed / fire-rate scales', () => {
    for (const difficulty of ['easy', 'normal', 'hard', 'arcade'] as DifficultyPreset[]) {
      const config = resolveGameConfig({ difficulty });
      const w = createWorld(config, EMPTY_CONTENT_DB);
      expect(w.rank).toBe(DIFFICULTY_RANK_BASE[difficulty]);
      expect(w.bullets.rank).toBe(w.rank);
      expect(w.bullets.speedScale).toBe(
        rankScale(w.rank, BULLET_SPEED_RANK_CURVE) * config.bulletSpeedMul,
      );
      expect(w.bullets.fireScale).toBe(rankScale(w.rank, FIRE_RATE_RANK_CURVE));
    }
  });

  it('scales fire intervals by the fire rate (rankedWait ≥ 1, exact on Normal)', () => {
    const w = createWorld(resolveGameConfig({}), EMPTY_CONTENT_DB);
    expect([rankedWait(w.bullets, 90), rankedWait(w.bullets, 0), rankedWait(w.bullets, 1)]).toEqual(
      [90, 1, 1],
    );
    w.bullets.setRank(31);
    expect(rankedWait(w.bullets, 90)).toBe(Math.round(90 / rankScale(31, FIRE_RATE_RANK_CURVE)));
    expect(w.bullets.speedScale).toBeCloseTo(1.7685, 10);
  });
});
