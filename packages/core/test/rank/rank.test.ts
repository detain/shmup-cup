/**
 * `core/rank` (plan M1-09, partial): the constant rank of M1 (the difficulty preset's base,
 * clamped), the rank → multiplier curves (exactly 1 at Normal, increasing, higher steps matter
 * more, clamped inputs, a floor on the result) and the World's rank-scaled bullet system.
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
  computeRank,
  difficultyRankInputs,
  moduleInfo,
  rankScale,
} from '../../src/rank/index.js';
import { rankedWait } from '../../src/patterns/index.js';
import { createWorld } from '../../src/world/index.js';

describe('core/rank', () => {
  it('describes itself as partial', () => {
    expect(moduleInfo.name).toBe('rank');
    expect(moduleInfo.status).toBe('partial');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §15');
  });

  it('maps the difficulty presets to the §15 bases (Normal = 2)', () => {
    expect(DIFFICULTY_RANK_BASE).toEqual({ easy: 0, normal: 2, hard: 4, arcade: 6 });
    expect(RANK_NORMAL).toBe(DIFFICULTY_RANK_BASE.normal);
    expect([RANK_MAX, RANK_LOOP1_CAP]).toEqual([31, 16]);
  });

  it('computes the constant M1 rank: the difficulty base, whatever the other inputs', () => {
    for (const preset of ['easy', 'normal', 'hard', 'arcade'] as DifficultyPreset[]) {
      const inputs = difficultyRankInputs(preset);
      expect(inputs).toEqual({
        difficultyBase: DIFFICULTY_RANK_BASE[preset],
        loop: 1,
        stage: 1,
        power: 0,
        special: 0,
      });
      expect(computeRank(inputs)).toBe(DIFFICULTY_RANK_BASE[preset]);
      expect(computeRank({ ...inputs, loop: 3, stage: 5, power: 9, special: 4 })).toBe(
        DIFFICULTY_RANK_BASE[preset],
      );
    }
  });

  it('rounds and clamps the rank to 0 … 31 (non-finite → 0)', () => {
    const at = (difficultyBase: number): number =>
      computeRank({ difficultyBase, loop: 1, stage: 1, power: 0, special: 0 });
    expect([at(2.4), at(2.6), at(-3), at(40), at(Number.NaN), at(Infinity)]).toEqual([
      2, 3, 0, 31, 0, 31,
    ]);
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

  it('gives the World its rank and the bullet system its speed / fire-rate scales', () => {
    for (const difficulty of ['easy', 'normal', 'hard', 'arcade'] as DifficultyPreset[]) {
      const w = createWorld(resolveGameConfig({ difficulty }), EMPTY_CONTENT_DB);
      expect(w.rank).toBe(DIFFICULTY_RANK_BASE[difficulty]);
      expect(w.bullets.rank).toBe(w.rank);
      expect(w.bullets.speedScale).toBe(rankScale(w.rank, BULLET_SPEED_RANK_CURVE));
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
