/**
 * Edge cases of `core/rank` (plan M2-01, shmup_feat.md §15 / §11) beyond the formula table:
 *
 * - `computeRank` over a sweep of every base, growth, loop, stage, power and special: always a
 *   whole number in `0…31`, never above 16 on loop 1, never decreasing when any growth input rises,
 *   equal to the formula written out by hand;
 * - fractional and out-of-range inputs (fractional loops and stages floor, a loop below 1 counts as
 *   loop 1 and is capped, negative power / special lower the rank, infinite terms count as 0);
 * - the inputs are only read (`computeRank` never writes them) and `createRankInputs` /
 *   `difficultyRankInputs` return fresh objects;
 * - `powerRank`: negative, fractional and non-finite flags and counts;
 * - `rankScale` / `rankSensitivity`: infinite ranks and modifiers, negative modifiers, the 0.05
 *   floor, both curves frozen.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY_TABLE, DIFFICULTY_PRESETS } from '../../src/config/index.js';
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
  powerRank,
  rankScale,
  rankSensitivity,
  type RankInputs,
} from '../../src/rank/index.js';

/**
 * Rank inputs with defaults (Normal, loop 1, stage 1, nothing held).
 *
 * @param fields - Fields to change.
 * @returns The inputs.
 */
function inputs(fields: Partial<RankInputs>): RankInputs {
  return { difficultyBase: 2, growth: 1, loop: 1, stage: 1, power: 0, special: 0, ...fields };
}

/**
 * The formula of shmup_feat.md §15 written out independently of the module.
 *
 * @param i - Whole, in-range inputs.
 * @returns The expected rank.
 */
function reference(i: RankInputs): number {
  const raw =
    i.difficultyBase +
    Math.floor(i.growth * (8 * (i.loop - 1) + (i.stage - 1) + i.power + i.special));
  const cap = i.loop === 1 ? 16 : 31;
  return Math.max(0, Math.min(cap, raw));
}

const BASES = [0, 2, 4, 6, 31];
const GROWTHS = [0, 0.5, 1, 1.5, 4];
const LOOPS = [1, 2, 3, 4];
const STAGES = [1, 2, 5, 9];
const POWERS = [0, 1, 6, 12, 16, 22];
const SPECIALS = [0, 3];

describe('core/rank computeRank sweep', () => {
  it('stays a whole number in range and matches the formula for every combination', () => {
    let checked = 0;
    for (const difficultyBase of BASES)
      for (const growth of GROWTHS)
        for (const loop of LOOPS)
          for (const stage of STAGES)
            for (const power of POWERS)
              for (const special of SPECIALS) {
                const i = inputs({ difficultyBase, growth, loop, stage, power, special });
                const rank = computeRank(i);
                expect(Number.isInteger(rank)).toBe(true);
                expect(rank).toBeGreaterThanOrEqual(0);
                expect(rank).toBeLessThanOrEqual(loop === 1 ? RANK_LOOP1_CAP : RANK_MAX);
                expect(rank).toBe(reference(i));
                checked++;
              }
    expect(checked).toBe(
      BASES.length *
        GROWTHS.length *
        LOOPS.length *
        STAGES.length *
        POWERS.length *
        SPECIALS.length,
    );
  });

  it('never drops when a growth input rises (monotonic in each term)', () => {
    const keys = ['difficultyBase', 'loop', 'stage', 'power', 'special'] as const;
    for (const growth of GROWTHS) {
      for (const key of keys) {
        let previous = -1;
        for (let v = key === 'loop' || key === 'stage' ? 1 : 0; v <= 12; v++) {
          const rank = computeRank(inputs({ growth, power: 3, [key]: v }));
          expect(rank, `${key} = ${v}, growth ${growth}`).toBeGreaterThanOrEqual(previous);
          previous = rank;
        }
      }
    }
  });

  it('never drops when the growth rises (non-negative terms)', () => {
    for (const power of POWERS) {
      let previous = -1;
      for (let g = 0; g <= 4; g += 0.25) {
        const rank = computeRank(inputs({ growth: g, power, stage: 3 }));
        expect(rank).toBeGreaterThanOrEqual(previous);
        previous = rank;
      }
    }
  });

  it('reaches the loop-1 cap from every preset base with enough power, and 31 from loop 3', () => {
    for (const preset of DIFFICULTY_PRESETS) {
      const base = DEFAULT_DIFFICULTY_TABLE[preset].rankBase;
      expect(computeRank(inputs({ difficultyBase: base, power: 40 }))).toBe(RANK_LOOP1_CAP);
      expect(computeRank(inputs({ difficultyBase: base, power: 40, loop: 3 }))).toBe(RANK_MAX);
      // Loop 2 lifts the cap: a fully powered Normal ship (12) on loop 2 stage 1 is 2 + 8 + 12.
      expect(computeRank(inputs({ difficultyBase: base, power: 12, loop: 2 }))).toBe(
        Math.min(RANK_MAX, base + 20),
      );
    }
  });
});

describe('core/rank computeRank odd inputs', () => {
  it('floors fractional loops and stages; a loop in (0, 2) is loop 1 and capped', () => {
    expect(computeRank(inputs({ stage: 3.9 }))).toBe(4); // stage 3
    expect(computeRank(inputs({ loop: 1.99, power: 30 }))).toBe(RANK_LOOP1_CAP);
    expect(computeRank(inputs({ loop: 2.5 }))).toBe(10); // loop 2: 2 + 8
    expect(computeRank(inputs({ loop: 0.5, power: 30 }))).toBe(RANK_LOOP1_CAP);
    expect(computeRank(inputs({ loop: Number.NaN, power: 30 }))).toBe(RANK_LOOP1_CAP);
    expect(computeRank(inputs({ stage: Number.NaN }))).toBe(2);
  });

  it('lowers the rank with negative power or special, never below 0', () => {
    expect(computeRank(inputs({ power: 6, special: -2 }))).toBe(6);
    expect(computeRank(inputs({ special: -1 }))).toBe(1);
    expect(computeRank(inputs({ special: -100 }))).toBe(0);
    // growth 0.5 floors towards −∞: floor(0.5 × −1) = −1.
    expect(computeRank(inputs({ growth: 0.5, special: -1 }))).toBe(1);
  });

  it('counts infinite power / special / base as 0 and a negative growth as written', () => {
    expect(computeRank(inputs({ power: Infinity }))).toBe(2);
    expect(computeRank(inputs({ special: -Infinity, power: 4 }))).toBe(6);
    expect(computeRank(inputs({ difficultyBase: -Infinity, power: 4 }))).toBe(4);
    // `resolveGameConfig` never lets a negative growth through; the formula itself just applies it.
    expect(computeRank(inputs({ difficultyBase: 10, growth: -1, power: 4 }))).toBe(6);
  });

  it('only reads its inputs', () => {
    const i = inputs({ loop: 0, stage: -3, power: Number.NaN, difficultyBase: 2.6 });
    const copy = { ...i };
    computeRank(i);
    expect(i).toEqual(copy);
  });

  it('makes fresh, independent inputs for every session', () => {
    const config = { rankBase: 4, rankGrowth: 1.5 };
    const a = createRankInputs(config);
    const b = createRankInputs(config);
    expect(a).not.toBe(b);
    a.power = 9;
    a.loop = 2;
    expect([b.power, b.loop]).toEqual([0, 1]);
    expect(Object.isFrozen(a)).toBe(false);
    expect(computeRank(a)).toBe(29); // 4 + floor(1.5 × (8 + 9)), loop 2: no cap of 16
    expect(difficultyRankInputs('hard')).not.toBe(difficultyRankInputs('hard'));
    // difficultyRankInputs always reads the built-in bases with growth 1.
    for (const preset of DIFFICULTY_PRESETS) {
      expect(difficultyRankInputs(preset).difficultyBase).toBe(DIFFICULTY_RANK_BASE[preset]);
      expect(difficultyRankInputs(preset).growth).toBe(1);
    }
  });
});

describe('core/rank powerRank odd inputs', () => {
  it('counts only positive flags and whole positive Option counts', () => {
    expect(powerRank(-1, -1, -1, -3, -1, -1)).toBe(0);
    expect(powerRank(Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN)).toBe(
      0,
    );
    expect(powerRank(0.1, 0, 0, 0, 0, 0)).toBe(RANK_POWER.missile);
    expect(powerRank(0, 0, 0, 0.5, 0, 0)).toBe(0); // half an Option is none
    expect(powerRank(0, 0, 0, 2.99, 0, 0)).toBe(2);
    expect(powerRank(0, 0, 0, 1_000, 0, 0)).toBe(1_000); // computeRank clamps, not powerRank
  });

  it('adds a shield and Reduce together, and both main weapons if both flags are set', () => {
    expect(powerRank(0, 0, 0, 0, 1, 1)).toBe(RANK_POWER.shield + RANK_POWER.reduce);
    expect(powerRank(0, 1, 1, 0, 0, 0)).toBe(RANK_POWER.double + RANK_POWER.laser);
    // The most a meter ship can hold: Missile, Laser, four Options, a shield.
    const full = powerRank(1, 0, 1, 4, 1, 0);
    expect(full).toBe(12);
    expect(computeRank(inputs({ difficultyBase: RANK_NORMAL, power: full }))).toBe(14);
  });
});

describe('core/rank curves at the edges', () => {
  it('freezes both curves', () => {
    expect(Object.isFrozen(BULLET_SPEED_RANK_CURVE)).toBe(true);
    expect(Object.isFrozen(FIRE_RATE_RANK_CURVE)).toBe(true);
    expect(Object.isFrozen(RANK_POWER)).toBe(true);
    expect(Object.isFrozen(DIFFICULTY_RANK_BASE)).toBe(true);
  });

  it('clamps infinite ranks to the ends of the table', () => {
    for (const curve of [BULLET_SPEED_RANK_CURVE, FIRE_RATE_RANK_CURVE]) {
      expect(rankScale(Infinity, curve)).toBe(rankScale(RANK_MAX, curve));
      expect(rankScale(-Infinity, curve)).toBe(rankScale(0, curve));
      // A fractional rank interpolates the polynomial (no rounding).
      expect(rankScale(2.5, curve)).toBeGreaterThan(1);
      expect(rankScale(2.5, curve)).toBeLessThan(rankScale(3, curve));
    }
  });

  it('shrinks with rank on a negative curve and stays at least 0.05', () => {
    const shrink = { perRank: -0.05, perRankSq: 0 };
    expect(rankScale(RANK_NORMAL, shrink)).toBe(1);
    expect(rankScale(0, shrink)).toBeCloseTo(1.1, 12);
    expect(rankScale(12, shrink)).toBeCloseTo(0.5, 12);
    expect(rankScale(31, shrink)).toBe(0.05);
    for (let r = 0; r <= RANK_MAX; r++) expect(rankScale(r, shrink)).toBeGreaterThanOrEqual(0.05);
  });

  it('bends by negative and infinite modifiers within the floor', () => {
    const scale = rankScale(16, BULLET_SPEED_RANK_CURVE); // > 1
    expect(rankSensitivity(scale, -1)).toBeCloseTo(2 - scale, 12); // a reversed modifier
    expect(rankSensitivity(scale, -100)).toBe(0.05);
    expect(rankSensitivity(scale, Infinity)).toBe(scale); // non-finite = 1
    expect(rankSensitivity(scale, -Infinity)).toBe(scale);
    // Below Normal a modifier over 1 slows further, but never under the floor.
    const easy = rankScale(0, BULLET_SPEED_RANK_CURVE);
    expect(rankSensitivity(easy, 8)).toBeCloseTo(1 + 8 * (easy - 1), 12);
    expect(rankSensitivity(easy, 1000)).toBe(0.05);
  });

  it('gives × 1 at Normal for every modifier on both curves', () => {
    for (const curve of [BULLET_SPEED_RANK_CURVE, FIRE_RATE_RANK_CURVE]) {
      const normal = rankScale(RANK_NORMAL, curve);
      for (const k of [0, 0.25, 1, 2, 8]) expect(rankSensitivity(normal, k)).toBe(1);
    }
  });
});
