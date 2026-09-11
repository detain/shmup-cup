/**
 * # rank — rank / dynamic difficulty
 *
 * **Status: partial.** The rank value and the rank → multiplier curves are implemented with a
 * **constant** rank (plan M1-09): {@link computeRank} returns the difficulty preset's base
 * (Normal = 2) and the systems scale by {@link rankScale}, so M2-01 only has to turn rank growth
 * on (the stage, power-up and special terms of shmup_feat.md §15).
 *
 * **Responsibility.** Rank: a Gradius III-style 0–31 value (`difficulty + loop/stage + power-ups +
 * special`, capped at 16 on loop 1) that scales enemy speed, fire rate, bullet speed and
 * boss behaviour; higher steps matter more. Difficulty presets map to rank base and
 * growth. Rank is shown in the debug overlay.
 *
 * **Curves.** A {@link RankCurve} turns a rank into a multiplier that is **exactly 1 at
 * {@link RANK_NORMAL}** (Normal's base rank), so content speeds and fire intervals are the Normal
 * values and every other rank scales them: `1 + perRank · (r − 2) + perRankSq · (r² − 4)` — the
 * quadratic term makes the higher steps matter more. {@link BULLET_SPEED_RANK_CURVE} scales enemy
 * bullet speeds, {@link FIRE_RATE_RANK_CURVE} divides fire intervals (`core/patterns`,
 * `core/enemies`).
 *
 * **Implements.**
 * - shmup_feat.md §15 — rank formula (difficulty base), rank scaling of bullet speed and fire rate
 *
 * **Public API.** {@link RankInputs}, {@link computeRank}, {@link rankScale}, {@link RankCurve},
 * {@link RANK_MAX}, {@link RANK_LOOP1_CAP}, {@link RANK_NORMAL}, {@link DIFFICULTY_RANK_BASE},
 * {@link difficultyRankInputs}, {@link BULLET_SPEED_RANK_CURVE}, {@link FIRE_RATE_RANK_CURVE}.
 *
 * **Planned API.** Rank growth (stage, loop, power-ups, special) and the difficulty preset tables
 * (M2-01).
 *
 * @module
 */
import type { DifficultyPreset } from '../config/index.js';
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'rank',
  status: 'partial',
  specRefs: ['shmup_feat.md §15'],
});

/** Everything the rank formula reads. */
export interface RankInputs {
  /** Easy 0 / Normal 2 / Hard 4 / Very Hard 6. */
  readonly difficultyBase: number;
  /** 1-based loop number. */
  readonly loop: number;
  /** 1-based stage number within the loop. */
  readonly stage: number;
  /** Power contribution (Missile +1, Double +2, Laser +3, each Option +1, Shield +4 …). */
  readonly power: number;
  /** Extra rank from special conditions (no-miss streaks, loop bonuses, debug overrides). */
  readonly special: number;
}

/** Highest rank (shmup_feat.md §15: rank runs 0–31). */
export const RANK_MAX = 31;

/** Highest rank on loop 1 (shmup_feat.md §15; applies once rank growth is on, M2-01). */
export const RANK_LOOP1_CAP = 16;

/** Normal difficulty's base rank: the rank at which every {@link RankCurve} gives exactly 1. */
export const RANK_NORMAL = 2;

/**
 * Base rank of each difficulty preset (shmup_feat.md §15: Easy 0 / Normal 2 / Hard 4 / Very
 * Hard 6 — the Arcade preset takes the Very Hard base).
 */
export const DIFFICULTY_RANK_BASE: Readonly<Record<DifficultyPreset, number>> = Object.freeze({
  easy: 0,
  normal: 2,
  hard: 4,
  arcade: 6,
});

/**
 * The rank inputs of a session start: the preset's base, loop 1, stage 1, no power, nothing
 * special.
 *
 * @param difficulty - The difficulty preset (`GameConfig.difficulty`).
 * @returns Fresh inputs (load time — allocates).
 *
 * @example
 * ```ts
 * computeRank(difficultyRankInputs('hard')); // → 4
 * ```
 */
export function difficultyRankInputs(difficulty: DifficultyPreset): RankInputs {
  return {
    difficultyBase: DIFFICULTY_RANK_BASE[difficulty],
    loop: 1,
    stage: 1,
    power: 0,
    special: 0,
  };
}

/**
 * The current rank.
 *
 * @remarks
 * M1 plays at a **constant** rank: the result is the difficulty base, rounded and clamped to
 * `0…`{@link RANK_MAX}; `loop`, `stage`, `power` and `special` are ignored until rank growth
 * arrives with M2-01 (the plumbing — inputs, curves, scaled systems — already exists).
 *
 * @param inputs - Everything the formula reads.
 * @returns A whole rank in `[0, 31]` (a non-finite base counts as 0).
 *
 * @example
 * ```ts
 * computeRank(difficultyRankInputs('normal')); // → 2
 * ```
 */
export function computeRank(inputs: RankInputs): number {
  const base = Math.round(inputs.difficultyBase);
  if (!(base > 0)) return 0;
  return base > RANK_MAX ? RANK_MAX : base;
}

/**
 * How a quantity grows with rank (see {@link rankScale}). Both coefficients may be negative
 * (a quantity that shrinks with rank, e.g. a wind-up time).
 */
export interface RankCurve {
  /** Linear growth per rank step. */
  readonly perRank: number;
  /** Quadratic growth (higher steps matter more). */
  readonly perRankSq: number;
}

/**
 * Enemy bullet speed multiplier: Easy (0) × 0.978, Normal (2) × 1, Hard (4) × 1.026, rank 16 ×
 * 1.266, rank 31 × 1.768.
 */
export const BULLET_SPEED_RANK_CURVE: RankCurve = Object.freeze({
  perRank: 0.01,
  perRankSq: 0.0005,
});

/**
 * Enemy fire-rate multiplier (fire intervals are divided by it): Easy (0) × 0.956, Normal (2) × 1,
 * Hard (4) × 1.052, rank 16 × 1.532, rank 31 × 2.537.
 */
export const FIRE_RATE_RANK_CURVE: RankCurve = Object.freeze({
  perRank: 0.02,
  perRankSq: 0.001,
});

/**
 * The multiplier a rank gives on a curve: `1 + perRank · (r − 2) + perRankSq · (r² − 4)` with
 * `r` the rank clamped to `0…31` — exactly 1 at {@link RANK_NORMAL}.
 *
 * @remarks
 * Call it when the rank changes (world creation in M1), not per tick: it returns a fractional
 * number, which V8 boxes when the call is not inlined. The result is never below 0.05 (a curve
 * with negative coefficients cannot stop time or reverse a bullet).
 *
 * @param rank - The rank (non-finite counts as 0).
 * @param curve - The curve.
 * @returns The multiplier.
 *
 * @example
 * ```ts
 * const speed = 1.5 * rankScale(world.rank, BULLET_SPEED_RANK_CURVE); // 1.5 on Normal
 * ```
 */
export function rankScale(rank: number, curve: RankCurve): number {
  const r = rank > 0 ? (rank < RANK_MAX ? rank : RANK_MAX) : 0;
  const scale =
    1 + curve.perRank * (r - RANK_NORMAL) + curve.perRankSq * (r * r - RANK_NORMAL * RANK_NORMAL);
  return scale > 0.05 ? scale : 0.05;
}
