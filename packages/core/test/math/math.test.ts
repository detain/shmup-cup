/**
 * `core/math` — table trigonometry against the engine's `Math` (test side only),
 * angle helpers and easing curves (shmup_plan.md M1-01).
 */
import { describe, expect, it } from 'vitest';
import {
  ANGLE_MASK,
  ANGLE_QUARTER,
  ANGLE_UNITS,
  EASINGS,
  angleDelta,
  approach,
  atan2B,
  clamp,
  cosB,
  lerp,
  moduleInfo,
  quantizeAngle,
  sinB,
  turnToward,
  wrapAngle,
} from '../../src/math/index.js';

/** Radians of one binary angle unit. */
const RADIANS_PER_UNIT = (2 * Math.PI) / ANGLE_UNITS;

/**
 * A tiny deterministic LCG so the random-point sweeps are reproducible without
 * depending on `core/rng`.
 *
 * @param seed - 32-bit seed.
 * @returns A function producing floats in [0, 1).
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('core/math', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('math');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('uses 1024 binary angle units with a matching mask and quarter turn', () => {
    expect(ANGLE_UNITS).toBe(1024);
    expect(ANGLE_MASK).toBe(ANGLE_UNITS - 1);
    expect(ANGLE_QUARTER).toBe(ANGLE_UNITS / 4);
  });

  it('matches Math.sin and Math.cos within 2e-5 over the whole turn', () => {
    for (let a = 0; a < ANGLE_UNITS; a += 1) {
      expect(Math.abs(sinB(a) - Math.sin(a * RADIANS_PER_UNIT))).toBeLessThan(2e-5);
      expect(Math.abs(cosB(a) - Math.cos(a * RADIANS_PER_UNIT))).toBeLessThan(2e-5);
    }
  });

  it('is exact on the cardinal directions', () => {
    expect(sinB(0)).toBe(0);
    expect(cosB(0)).toBe(1);
    expect(sinB(ANGLE_QUARTER)).toBe(1);
    expect(cosB(ANGLE_QUARTER)).toBe(0);
    expect(sinB(2 * ANGLE_QUARTER)).toBe(0);
    expect(cosB(2 * ANGLE_QUARTER)).toBe(-1);
    expect(sinB(3 * ANGLE_QUARTER)).toBe(-1);
    expect(cosB(3 * ANGLE_QUARTER)).toBe(0);
  });

  it('wraps angles outside one turn, including negative ones', () => {
    expect(sinB(ANGLE_UNITS)).toBe(sinB(0));
    expect(sinB(-ANGLE_QUARTER)).toBe(sinB(3 * ANGLE_QUARTER));
    expect(cosB(-1)).toBe(cosB(ANGLE_UNITS - 1));
    expect(wrapAngle(-1)).toBe(ANGLE_UNITS - 1);
    expect(wrapAngle(ANGLE_UNITS + 5)).toBe(5);
  });

  it('keeps the unit circle: sin² + cos² ≈ 1', () => {
    for (let a = 0; a < ANGLE_UNITS; a += 1) {
      expect(Math.abs(sinB(a) * sinB(a) + cosB(a) * cosB(a) - 1)).toBeLessThan(1e-4);
    }
  });

  it('returns the cardinal directions from atan2B', () => {
    expect(atan2B(0, 1)).toBe(0);
    expect(atan2B(1, 0)).toBe(ANGLE_QUARTER);
    expect(atan2B(0, -1)).toBe(2 * ANGLE_QUARTER);
    expect(atan2B(-1, 0)).toBe(3 * ANGLE_QUARTER);
    expect(atan2B(1, 1)).toBe(ANGLE_QUARTER / 2);
    expect(atan2B(0, 0)).toBe(0);
  });

  it('stays within ±1 unit of Math.atan2 for 10k random points', () => {
    const random = lcg(0x5eedc0de);
    let worst = 0;
    for (let i = 0; i < 10000; i += 1) {
      const dx = (random() - 0.5) * 2000;
      const dy = (random() - 0.5) * 2000;
      const expected = Math.atan2(dy, dx) / RADIANS_PER_UNIT;
      const actual = atan2B(dy, dx);
      let delta = actual - expected;
      while (delta > ANGLE_UNITS / 2) delta -= ANGLE_UNITS;
      while (delta < -ANGLE_UNITS / 2) delta += ANGLE_UNITS;
      worst = Math.max(worst, Math.abs(delta));
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('round-trips sinB/cosB through atan2B within a unit', () => {
    for (let a = 0; a < ANGLE_UNITS; a += 1) {
      const back = atan2B(sinB(a) * 1000, cosB(a) * 1000);
      expect(
        Math.abs(angleDelta(a, back)),
        `angle ${String(a)} came back as ${String(back)}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('always returns an angle inside one turn', () => {
    const random = lcg(7);
    for (let i = 0; i < 5000; i += 1) {
      const angle = atan2B((random() - 0.5) * 1e6, (random() - 0.5) * 1e-3);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(ANGLE_UNITS);
      expect(Number.isInteger(angle)).toBe(true);
    }
  });

  it('quantises angles to 16 and 32 directions', () => {
    expect(quantizeAngle(0, 32)).toBe(0);
    expect(quantizeAngle(15, 32)).toBe(0);
    expect(quantizeAngle(16, 32)).toBe(32);
    expect(quantizeAngle(40, 32)).toBe(32);
    expect(quantizeAngle(1000, 16)).toBe(0);
    for (const directions of [4, 8, 16, 32]) {
      const step = ANGLE_UNITS / directions;
      for (let a = 0; a < ANGLE_UNITS; a += 1) {
        const snapped = quantizeAngle(a, directions);
        expect(snapped % step).toBe(0);
        expect(Math.abs(angleDelta(a, snapped))).toBeLessThanOrEqual(step / 2);
      }
    }
  });

  it('measures the signed shortest rotation', () => {
    expect(angleDelta(0, 10)).toBe(10);
    expect(angleDelta(10, 0)).toBe(-10);
    expect(angleDelta(0, ANGLE_UNITS - 1)).toBe(-1);
    expect(angleDelta(ANGLE_UNITS - 1, 0)).toBe(1);
    expect(angleDelta(0, ANGLE_UNITS / 2)).toBe(-ANGLE_UNITS / 2);
    for (let a = 0; a < ANGLE_UNITS; a += 7) {
      for (let b = 0; b < ANGLE_UNITS; b += 13) {
        const delta = angleDelta(a, b);
        expect(delta).toBeGreaterThanOrEqual(-ANGLE_UNITS / 2);
        expect(delta).toBeLessThan(ANGLE_UNITS / 2);
        expect(wrapAngle(a + delta)).toBe(b);
      }
    }
  });

  it('turns towards a target without overshooting', () => {
    expect(turnToward(0, 100, 10)).toBe(10);
    expect(turnToward(0, 100, 1000)).toBe(100);
    expect(turnToward(100, 0, 10)).toBe(90);
    expect(turnToward(10, ANGLE_UNITS - 10, 5)).toBe(5);
    expect(turnToward(5, 5, 10)).toBe(5);
    let angle = 0;
    for (let i = 0; i < 100; i += 1) angle = turnToward(angle, 300, 4);
    expect(angle).toBe(300);
  });

  it('clamps, interpolates and approaches', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 3)).toBe(7);
    expect(approach(1, 0, 3)).toBe(0);
    expect(approach(4, 4, 3)).toBe(4);
  });

  it('has easing curves that run from 0 to 1 monotonically', () => {
    for (const [name, ease] of Object.entries(EASINGS)) {
      expect(ease(0), name).toBeCloseTo(0, 10);
      expect(ease(1), name).toBeCloseTo(1, 10);
      let previous = -Infinity;
      for (let i = 0; i <= 100; i += 1) {
        const value = ease(i / 100);
        expect(value, `${name} at ${String(i)}`).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });

  it('eases in below and out above the linear ramp', () => {
    expect(EASINGS.inQuad(0.5)).toBeLessThan(0.5);
    expect(EASINGS.inCubic(0.5)).toBeLessThan(EASINGS.inQuad(0.5));
    expect(EASINGS.outQuad(0.5)).toBeGreaterThan(0.5);
    expect(EASINGS.outCubic(0.5)).toBeGreaterThan(EASINGS.outQuad(0.5));
    expect(EASINGS.linear(0.37)).toBe(0.37);
    for (const name of ['inOutQuad', 'inOutCubic', 'inOutSine'] as const) {
      expect(EASINGS[name](0.5), name).toBeCloseTo(0.5, 4);
    }
  });

  it('matches the real sine curve for inOutSine', () => {
    for (let i = 0; i <= 100; i += 1) {
      const t = i / 100;
      const expected = (1 - Math.cos(Math.PI * t)) / 2;
      expect(Math.abs(EASINGS.inOutSine(t) - expected)).toBeLessThan(2e-3);
    }
  });
});
