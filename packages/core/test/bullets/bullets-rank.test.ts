/**
 * The bullet system's rank scales (plan M2-01, shmup_feat.md §15 / §11):
 *
 * - `setRank` gives the session's scales — the speed curve × `config.bulletSpeedMul`, the fire
 *   curve — and makes them current; the scales at creation (rank 0 before the World's `setRank`)
 *   already carry the multiplier, and a host config without the field counts as × 1;
 * - `setShooterRank` narrows the current scales to one enemy's modifiers exactly like
 *   `core/rank` `rankSensitivity` (× `bulletSpeedMul` on the speed), for every rank and modifier
 *   of a sweep, with the 0.05 floor; it never changes the session's scales or the rank;
 * - `clearShooterRank` restores the session's scales, `setRank` during a shooter's turn resets
 *   the current scales too; the fire primitives (`rankedWait`) read the current scales.
 */
import { describe, expect, it } from 'vitest';
import { createBulletSystem } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { rankedWait } from '../../src/patterns/index.js';
import {
  BULLET_SPEED_RANK_CURVE,
  FIRE_RATE_RANK_CURVE,
  RANK_MAX,
  rankScale,
  rankSensitivity,
} from '../../src/rank/index.js';
import { createWorld, type World } from '../../src/world/index.js';

/**
 * A World on a config (no content).
 *
 * @param overrides - Config overrides.
 * @returns The World.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  return createWorld(resolveGameConfig(overrides), EMPTY_CONTENT_DB);
}

/**
 * Modifier tables with one spec (index 0).
 *
 * @param speedK - The bullet-speed modifier.
 * @param fireK - The fire-rate modifier.
 * @returns `[speedK, fireK]` tables.
 */
function mods(speedK: number, fireK: number): [Float64Array, Float64Array] {
  return [Float64Array.of(speedK), Float64Array.of(fireK)];
}

describe('core/bullets session rank scales (M2-01)', () => {
  it('multiplies the speed curve by bulletSpeedMul, not the fire curve', () => {
    for (const mul of [0.25, 0.85, 1, 1.5, 4]) {
      const w = world({ bulletSpeedMul: mul });
      for (const rank of [0, 2, 7, 16, 31]) {
        w.bullets.setRank(rank);
        expect(w.bullets.rank).toBe(rank);
        expect(w.bullets.rankSpeedScale).toBe(rankScale(rank, BULLET_SPEED_RANK_CURVE) * mul);
        expect(w.bullets.rankFireScale).toBe(rankScale(rank, FIRE_RATE_RANK_CURVE));
        expect(w.bullets.speedScale).toBe(w.bullets.rankSpeedScale);
        expect(w.bullets.fireScale).toBe(w.bullets.rankFireScale);
      }
    }
  });

  it('carries the multiplier from creation, before any setRank', () => {
    const w = world({ bulletSpeedMul: 0.5 });
    const fresh = createBulletSystem({
      ...w,
      pools: { register: (_name, pool) => pool },
    });
    expect([fresh.rank, fresh.rankSpeedScale, fresh.speedScale]).toEqual([0, 0.5, 0.5]);
    expect([fresh.rankFireScale, fresh.fireScale]).toEqual([1, 1]);
  });

  it('counts a host config without bulletSpeedMul (hand-made hosts) as × 1', () => {
    const w = world();
    for (const mul of [undefined, 0, -2, Number.NaN]) {
      const config = { ...w.config, bulletSpeedMul: mul } as unknown as GameConfig;
      const bullets = createBulletSystem({
        ...w,
        config,
        pools: { register: (_name, pool) => pool },
      });
      expect(bullets.speedScale).toBe(1);
      bullets.setRank(16);
      expect(bullets.rankSpeedScale).toBe(rankScale(16, BULLET_SPEED_RANK_CURVE));
    }
  });
});

describe('core/bullets shooter rank (M2-01)', () => {
  it('matches rankSensitivity (× bulletSpeedMul) for every rank and modifier', () => {
    for (const mul of [0.85, 1, 2]) {
      const b = world({ bulletSpeedMul: mul }).bullets;
      for (let rank = 0; rank <= RANK_MAX; rank += 3) {
        b.setRank(rank);
        const speedCurve = rankScale(rank, BULLET_SPEED_RANK_CURVE);
        const fireCurve = rankScale(rank, FIRE_RATE_RANK_CURVE);
        for (const ks of [0, 0.5, 1, 2, 8]) {
          for (const kf of [0, 1, 3]) {
            const [speedK, fireK] = mods(ks, kf);
            b.setShooterRank(speedK, fireK, 0);
            expect(b.speedScale).toBeCloseTo(rankSensitivity(speedCurve, ks) * mul, 12);
            expect(b.fireScale).toBeCloseTo(rankSensitivity(fireCurve, kf), 12);
            // The session's scales and the rank stay.
            expect(b.rank).toBe(rank);
            expect(b.rankSpeedScale).toBe(speedCurve * mul);
            expect(b.rankFireScale).toBe(fireCurve);
            b.clearShooterRank();
            expect(b.speedScale).toBe(b.rankSpeedScale);
            expect(b.fireScale).toBe(b.rankFireScale);
          }
        }
      }
    }
  });

  it('keeps the modifier 1 exact and makes 0 ignore the rank (only bulletSpeedMul stays)', () => {
    const b = world({ difficulty: 'easy' }).bullets; // × 0.85
    b.setRank(20);
    b.setShooterRank(...mods(1, 1), 0);
    expect([b.speedScale, b.fireScale]).toEqual([b.rankSpeedScale, b.rankFireScale]);
    b.setShooterRank(...mods(0, 0), 0);
    expect([b.speedScale, b.fireScale]).toEqual([0.85, 1]);
    expect(rankedWait(b, 60)).toBe(60);
  });

  it('floors both narrowed scales at 0.05 (the speed floor before bulletSpeedMul)', () => {
    const b = world({ bulletSpeedMul: 2 }).bullets;
    b.setRank(0); // both curves under 1: a big modifier drives them below 0
    b.setShooterRank(...mods(1000, 1000), 0);
    expect(b.speedScale).toBe(0.05 * 2);
    expect(b.fireScale).toBe(0.05);
    // A negative modifier reverses the curve at a high rank the same way.
    b.setRank(31);
    b.setShooterRank(...mods(-100, -100), 0);
    expect(b.speedScale).toBe(0.1);
    expect(b.fireScale).toBe(0.05);
  });

  it('reads the shooter`s own row of the tables', () => {
    const b = world().bullets;
    b.setRank(16);
    const speedK = Float64Array.of(1, 0, 2);
    const fireK = Float64Array.of(1, 2, 0);
    const curveS = rankScale(16, BULLET_SPEED_RANK_CURVE);
    const curveF = rankScale(16, FIRE_RATE_RANK_CURVE);
    b.setShooterRank(speedK, fireK, 1);
    expect(b.speedScale).toBe(1);
    expect(b.fireScale).toBeCloseTo(1 + 2 * (curveF - 1), 12);
    b.setShooterRank(speedK, fireK, 2);
    expect(b.speedScale).toBeCloseTo(1 + 2 * (curveS - 1), 12);
    expect(b.fireScale).toBe(1);
  });

  it('lets the fire primitives follow the current scales', () => {
    const b = world().bullets;
    b.setRank(31);
    const session = rankedWait(b, 120);
    expect(session).toBe(Math.round(120 / rankScale(31, FIRE_RATE_RANK_CURVE)));
    b.setShooterRank(...mods(1, 0), 0);
    expect(rankedWait(b, 120)).toBe(120);
    b.setShooterRank(...mods(1, 2), 0);
    expect(rankedWait(b, 120)).toBeLessThan(session);
    b.clearShooterRank();
    expect(rankedWait(b, 120)).toBe(session);
  });

  it('is reset by a setRank during a shooter`s turn; clearShooterRank then keeps the new rank', () => {
    const b = world().bullets;
    b.setRank(10);
    b.setShooterRank(...mods(0, 0), 0);
    b.setRank(20);
    expect(b.speedScale).toBe(rankScale(20, BULLET_SPEED_RANK_CURVE));
    b.clearShooterRank();
    expect(b.speedScale).toBe(rankScale(20, BULLET_SPEED_RANK_CURVE));
    expect(b.fireScale).toBe(rankScale(20, FIRE_RATE_RANK_CURVE));
  });
});
