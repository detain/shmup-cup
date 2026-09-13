/**
 * # rank — rank / dynamic difficulty
 *
 * **Responsibility.** Rank: a Gradius III-style 0–31 value (`difficulty + loop/stage + power-ups +
 * special`, capped at 16 on loop 1) that scales enemy bullet speed and fire rate — higher steps
 * matter more. Difficulty presets (`core/config`, `content/rules/`) give the rank base and growth;
 * the World recomputes the rank every tick (`core/world`) and the debug overlay shows it.
 *
 * **Formula** ({@link computeRank}, shmup_feat.md §15):
 *
 * ```
 * rank = base + floor(growth × (8·(loop − 1) + (stage − 1) + power + special))
 * ```
 *
 * clamped to `0…`{@link RANK_MAX} and to {@link RANK_LOOP1_CAP} on loop 1. `base` is the preset's
 * `rankBase` (Easy 0 / Normal 2 / Hard 4 / Arcade 6), `growth` its `rankGrowth` (Easy 0.5, the
 * others 1; 0 = a constant rank). The **power** term ({@link powerRank}) adds, per ship: Speed
 * +0 per level, Missile +1, Double +2, Laser +3, each Option +1, a shield +4 (Reduce +2 — M2-04);
 * with several ships in play the World uses the most powerful one. `special` is for no-miss
 * streaks, loop bonuses and debug overrides (0 today). A **Direct-mode** ship (M2-05,
 * {@link directPowerRank}) counts half its main-shot and sub-weapon levels together
 * (`floor((shot + sub) / 2)`) plus its Arm ({@link RANK_ARM_TIER}: +2 / +3 / +4 by tier) — at most
 * 12, the fully powered meter ship's term (Missile, Laser, four Options, a shield).
 *
 * **Curves.** A {@link RankCurve} turns a rank into a multiplier that is **exactly 1 at
 * {@link RANK_NORMAL}** (Normal's base rank), so content speeds and fire intervals are the Normal
 * values and every other rank scales them: `1 + perRank · (r − 2) + perRankSq · (r² − 4)` — the
 * quadratic term makes the higher steps matter more. {@link BULLET_SPEED_RANK_CURVE} scales enemy
 * bullet speeds, {@link FIRE_RATE_RANK_CURVE} divides fire intervals (`core/patterns`,
 * `core/enemies`). An enemy's `rank` modifiers (`content/enemies/`: `bulletSpeed`, `fireRate`)
 * set how strongly it follows a curve: {@link rankSensitivity} gives `1 + k · (scale − 1)` — `k`
 * 1 is the curve, 0 ignores rank, 2 doubles its effect (`core/bullets` `setShooterRank`).
 *
 * **Zero allocation.** {@link computeRank} and {@link powerRank} only do integer arithmetic on
 * their arguments; the World keeps one mutable {@link RankInputs} object
 * ({@link createRankInputs}) and recomputes the rank from it each tick. {@link rankScale} returns
 * a fraction: call it when the rank changes, not per tick.
 *
 * **Implements.**
 * - shmup_feat.md §15 — rank formula (difficulty, loop / stage, power-ups, special; 0–31, 16 on
 *   loop 1), rank scaling of bullet speed and fire rate, difficulty presets' rank base / growth
 * - shmup_feat.md §11 — per-enemy rank modifiers (fire rate, bullet speed)
 * - shmup_feat.md §6C — the Direct-mode power level feeds rank ({@link directPowerRank}, M2-05)
 *
 * **Public API.** {@link RankInputs}, {@link createRankInputs}, {@link difficultyRankInputs},
 * {@link computeRank}, {@link powerRank}, {@link RANK_POWER}, {@link directPowerRank},
 * {@link RANK_ARM_TIER} (M2-05), {@link rankScale},
 * {@link rankSensitivity}, {@link RankCurve}, {@link RANK_MAX}, {@link RANK_LOOP1_CAP},
 * {@link RANK_NORMAL}, {@link DIFFICULTY_RANK_BASE}, {@link BULLET_SPEED_RANK_CURVE},
 * {@link FIRE_RATE_RANK_CURVE}.
 *
 * @module
 */
import type { DifficultyPreset, GameConfig } from '../config/index.js';
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'rank',
  status: 'implemented',
  specRefs: ['shmup_feat.md §15', 'shmup_feat.md §11', 'shmup_feat.md §6'],
});

/** Everything the rank formula reads ({@link computeRank}). */
export interface RankInputs {
  /** The preset's base rank (Easy 0 / Normal 2 / Hard 4 / Arcade 6 — `GameConfig.rankBase`). */
  readonly difficultyBase: number;
  /**
   * Multiplier of the growth terms (`GameConfig.rankGrowth`: 0 = constant rank, 1 = the Gradius
   * III formula).
   */
  readonly growth: number;
  /** 1-based loop number. */
  readonly loop: number;
  /** 1-based stage number within the loop. */
  readonly stage: number;
  /** Power contribution ({@link powerRank}: Missile +1, Double +2, Laser +3, each Option +1 …). */
  readonly power: number;
  /** Extra rank from special conditions (no-miss streaks, loop bonuses, debug overrides). */
  readonly special: number;
}

/** Highest rank (shmup_feat.md §15: rank runs 0–31). */
export const RANK_MAX = 31;

/** Highest rank on loop 1 (shmup_feat.md §15). */
export const RANK_LOOP1_CAP = 16;

/** Normal difficulty's base rank: the rank at which every {@link RankCurve} gives exactly 1. */
export const RANK_NORMAL = 2;

/**
 * Base rank of each difficulty preset in the built-in table (shmup_feat.md §15: Easy 0 / Normal 2
 * / Hard 4 / Very Hard 6 — the Arcade preset takes the Very Hard base). The content's
 * `rules` table may differ; sessions read `GameConfig.rankBase`.
 */
export const DIFFICULTY_RANK_BASE: Readonly<Record<DifficultyPreset, number>> = Object.freeze({
  easy: 0,
  normal: 2,
  hard: 4,
  arcade: 6,
});

/**
 * Rank added by each power-up a ship holds (shmup_feat.md §15 "Power: Speed +0, Missile +1, Double
 * +2, Laser +3, each Option +1, Shield +4 (Reduce +2)").
 */
export const RANK_POWER = Object.freeze({
  /** Per Speed level. */
  speed: 0,
  /** The Missile. */
  missile: 1,
  /** The Double. */
  double: 2,
  /** The Laser. */
  laser: 3,
  /** Per Option. */
  option: 1,
  /** A shield (the Force Field; the front shields of M2-04). */
  shield: 4,
  /** Reduce (M2-04: the smaller hurtbox counts instead of a shield). */
  reduce: 2,
});

/**
 * A mutable {@link RankInputs} (what the World keeps and updates every tick).
 */
type MutableRankInputs = { -readonly [K in keyof RankInputs]: RankInputs[K] };

/**
 * The rank inputs of a session start: the config's base and growth, loop 1, stage 1, no power,
 * nothing special.
 *
 * @param config - The session config (`rankBase`, `rankGrowth`).
 * @returns A fresh, **mutable** object (load time — allocates); the World writes its `power`
 *   (and, with the campaign of M2-10, `loop` / `stage`) every tick.
 *
 * @example
 * ```ts
 * computeRank(createRankInputs(resolveGameConfig({ difficulty: 'hard' }))); // → 4
 * ```
 */
export function createRankInputs(
  config: Pick<GameConfig, 'rankBase' | 'rankGrowth'>,
): MutableRankInputs {
  return {
    difficultyBase: config.rankBase,
    growth: config.rankGrowth,
    loop: 1,
    stage: 1,
    power: 0,
    special: 0,
  };
}

/**
 * The rank inputs of a session start on a preset of the built-in table: its base
 * ({@link DIFFICULTY_RANK_BASE}), growth 1, loop 1, stage 1, no power, nothing special.
 *
 * @param difficulty - The difficulty preset.
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
    growth: 1,
    loop: 1,
    stage: 1,
    power: 0,
    special: 0,
  };
}

/**
 * The current rank (shmup_feat.md §15; see the module docs for the formula).
 *
 * @remarks
 * `base + floor(growth × (8·(loop − 1) + (stage − 1) + power + special))`, then clamped to
 * `0…`{@link RANK_MAX} — and to {@link RANK_LOOP1_CAP} while `loop` is 1 (or below). The base is
 * rounded; a loop or stage below 1 counts as 1; a non-finite input counts as 0 (the growth as 0 —
 * a constant rank). Never allocates.
 *
 * @param inputs - Everything the formula reads.
 * @returns A whole rank in `[0, 31]` (`[0, 16]` on loop 1).
 *
 * @example
 * ```ts
 * computeRank({ difficultyBase: 2, growth: 1, loop: 1, stage: 3, power: 5, special: 0 }); // → 9
 * computeRank({ difficultyBase: 6, growth: 1, loop: 1, stage: 1, power: 16, special: 0 }); // → 16
 * computeRank({ difficultyBase: 6, growth: 1, loop: 2, stage: 1, power: 16, special: 0 }); // → 30
 * ```
 */
export function computeRank(inputs: RankInputs): number {
  const base = finite(Math.round(inputs.difficultyBase));
  const loop = inputs.loop >= 1 ? Math.floor(inputs.loop) : 1;
  const stage = inputs.stage >= 1 ? Math.floor(inputs.stage) : 1;
  const growth = finite(inputs.growth);
  const terms = 8 * (loop - 1) + (stage - 1) + finite(inputs.power) + finite(inputs.special);
  const rank = base + Math.floor(growth * terms);
  const cap = loop <= 1 ? RANK_LOOP1_CAP : RANK_MAX;
  if (!(rank > 0)) return 0;
  return rank > cap ? cap : rank;
}

/**
 * A number, or 0 when it is not finite.
 *
 * @param value - Any number.
 * @returns `value` when finite, else 0.
 */
function finite(value: number): number {
  return value - value === 0 ? value : 0;
}

/**
 * The power term of one ship's rank (shmup_feat.md §15, {@link RANK_POWER}). Never allocates.
 *
 * @remarks
 * Flags are `0` / `1` (anything positive counts as held); `options` is a count. Speed levels add
 * nothing (`RANK_POWER.speed` is 0), so they are not an argument. A `reduce` ship counts
 * `RANK_POWER.reduce`, a shielded one `RANK_POWER.shield` — both only when both flags are set.
 *
 * @param missile - 1 when the Missile is equipped.
 * @param double - 1 when the Double is the main weapon.
 * @param laser - 1 when the Laser is the main weapon.
 * @param options - Options owned.
 * @param shield - 1 while a shield is up.
 * @param reduce - 1 while Reduce is active (M2-04).
 * @returns The ship's power rank (a whole number ≥ 0).
 *
 * @example
 * ```ts
 * powerRank(1, 0, 1, 4, 1, 0); // → 1 + 3 + 4 + 4 = 12 (Missile, Laser, four Options, a shield)
 * ```
 */
export function powerRank(
  missile: number,
  double: number,
  laser: number,
  options: number,
  shield: number,
  reduce: number,
): number {
  let power = 0;
  if (missile > 0) power += RANK_POWER.missile;
  if (double > 0) power += RANK_POWER.double;
  if (laser > 0) power += RANK_POWER.laser;
  if (options > 0) power += RANK_POWER.option * Math.floor(options);
  if (shield > 0) power += RANK_POWER.shield;
  if (reduce > 0) power += RANK_POWER.reduce;
  return power;
}

/**
 * Rank of the Direct-mode Arm by tier (M2-05; index = tier, 0 = none): the green Arm +2, the silver
 * Super Arm +3, the gold Hyper Arm +4 (the meter's shield).
 */
export const RANK_ARM_TIER: readonly number[] = Object.freeze([0, 2, 3, 4]);

/**
 * The power term of a Direct-mode ship's rank (M2-05, shmup_feat.md §6C "power level feeds rank"):
 * half its main-shot and sub-weapon levels together, plus its Arm. Never allocates.
 *
 * @remarks
 * `floor((shot + sub) / 2) + RANK_ARM_TIER[tier]` — both levels at 8 with the Hyper Arm give 12,
 * the fully powered meter ship's term. Negative or fractional levels count as their whole
 * non-negative part; a tier above 3 counts as 3.
 *
 * @param shot - Main-shot level (0–8).
 * @param sub - Sub-weapon level (0–8).
 * @param armTier - Arm tier (0 = none … 3).
 * @returns The ship's power rank (a whole number ≥ 0).
 *
 * @example
 * ```ts
 * directPowerRank(8, 8, 3); // → 8 + 4 = 12
 * ```
 */
export function directPowerRank(shot: number, sub: number, armTier: number): number {
  const s = shot > 0 ? Math.floor(shot) : 0;
  const u = sub > 0 ? Math.floor(sub) : 0;
  const tier = armTier >= 3 ? 3 : armTier >= 1 ? Math.floor(armTier) : 0;
  return ((s + u) >> 1) + RANK_ARM_TIER[tier];
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
 * Call it when the rank changes (`core/bullets` `setRank`), not per tick: it returns a fractional
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

/**
 * A rank multiplier seen by an enemy with a rank modifier `k` (shmup_feat.md §11 "rank modifiers
 * per enemy"): `1 + k · (scale − 1)` — `k` 1 keeps the curve's multiplier, 0 ignores rank, 2
 * doubles its effect (at Normal's base rank every `k` gives 1).
 *
 * @remarks
 * Never below 0.05, like {@link rankScale}. `core/bullets` inlines the same arithmetic in
 * `setShooterRank` (reading `k` from a typed array, so no fraction crosses a call per tick).
 *
 * @param scale - The rank's multiplier ({@link rankScale}).
 * @param k - The enemy's modifier (non-finite counts as 1).
 * @returns The enemy's multiplier.
 *
 * @example
 * ```ts
 * rankSensitivity(rankScale(16, BULLET_SPEED_RANK_CURVE), 0.5); // → 1.133 (half the +26.6 %)
 * ```
 */
export function rankSensitivity(scale: number, k: number): number {
  const m = k - k === 0 ? k : 1;
  const out = 1 + m * (scale - 1);
  return out > 0.05 ? out : 0.05;
}
