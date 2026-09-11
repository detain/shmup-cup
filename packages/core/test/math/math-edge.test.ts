/**
 * `core/math` edge cases: degenerate and extreme inputs to the table trigonometry,
 * the exact boundaries of the angle helpers, and the determinism guarantees the
 * simulation relies on (shmup_plan.md M1-01, shmup_feat.md §22).
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
  quantizeAngle,
  sinB,
  turnToward,
  wrapAngle,
} from '../../src/math/index.js';

/** Radians of one binary angle unit. */
const RADIANS_PER_UNIT = (2 * Math.PI) / ANGLE_UNITS;

/** Every easing name, so a new curve cannot silently skip the shared checks. */
const EASING_NAMES = Object.keys(EASINGS) as (keyof typeof EASINGS)[];

describe('core/math — sinB / cosB outside one turn', () => {
  it('is periodic for angles many turns away, in both directions', () => {
    for (const a of [0, 1, 255, 256, 511, 512, 777, 1023]) {
      for (const turns of [-1000, -3, -1, 1, 3, 1000]) {
        expect(sinB(a + turns * ANGLE_UNITS), `sin ${String(a)}`).toBe(sinB(a));
        expect(cosB(a + turns * ANGLE_UNITS), `cos ${String(a)}`).toBe(cosB(a));
      }
    }
  });

  it('never reads outside the table, even a quarter turn before zero', () => {
    // cosB adds ANGLE_QUARTER after masking, so the highest index it can reach is
    // ANGLE_MASK + ANGLE_QUARTER — exactly the last committed entry.
    const undefinedAt: number[] = [];
    for (let a = -ANGLE_UNITS; a < 2 * ANGLE_UNITS; a += 1) {
      if (!Number.isFinite(sinB(a)) || !Number.isFinite(cosB(a))) undefinedAt.push(a);
    }
    expect(undefinedAt).toEqual([]);
    expect(cosB(ANGLE_MASK)).toBe(cosB(-1));
  });

  it('keeps every table value inside [-1, 1]', () => {
    const outOfRange: number[] = [];
    for (let a = 0; a < ANGLE_UNITS; a += 1) {
      if (Math.abs(sinB(a)) > 1 || Math.abs(cosB(a)) > 1) outOfRange.push(a);
    }
    expect(outOfRange).toEqual([]);
  });

  it('is exactly antisymmetric and exactly quarter-shifted', () => {
    const asymmetric: number[] = [];
    const misaligned: number[] = [];
    for (let a = 0; a < ANGLE_UNITS; a += 1) {
      // Adding rather than negating keeps the check clear of the -0 / 0 trap.
      if (sinB(a) + sinB(a + ANGLE_UNITS / 2) !== 0) asymmetric.push(a);
      if (cosB(a) !== sinB(a + ANGLE_QUARTER)) misaligned.push(a);
    }
    expect(asymmetric).toEqual([]);
    expect(misaligned).toEqual([]);
  });

  it('gives the same answer every call (the table is never mutated)', () => {
    const first = sinB(123);
    for (let i = 0; i < 1000; i += 1) sinB(i);
    expect(sinB(123)).toBe(first);
  });
});

describe('core/math — atan2B extremes', () => {
  it('is exact on all eight octant boundaries', () => {
    const eighth = ANGLE_UNITS / 8;
    expect(atan2B(0, 1)).toBe(0);
    expect(atan2B(1, 1)).toBe(eighth);
    expect(atan2B(1, 0)).toBe(2 * eighth);
    expect(atan2B(1, -1)).toBe(3 * eighth);
    expect(atan2B(0, -1)).toBe(4 * eighth);
    expect(atan2B(-1, -1)).toBe(5 * eighth);
    expect(atan2B(-1, 0)).toBe(6 * eighth);
    expect(atan2B(-1, 1)).toBe(7 * eighth);
  });

  it('is scale invariant: only the direction matters', () => {
    for (const scale of [1e-300, 1e-6, 0.5, 1, 7, 1e6, 1e300]) {
      expect(atan2B(3 * scale, 4 * scale), String(scale)).toBe(atan2B(3, 4));
      expect(atan2B(-3 * scale, 4 * scale), String(scale)).toBe(atan2B(-3, 4));
    }
  });

  it('handles vectors whose components differ by hundreds of orders of magnitude', () => {
    expect(atan2B(1e-300, 1e300)).toBe(0);
    expect(atan2B(1e300, 1e-300)).toBe(ANGLE_QUARTER);
    expect(atan2B(-1e300, 1e-300)).toBe(3 * ANGLE_QUARTER);
    expect(atan2B(1e-300, -1e300)).toBe(ANGLE_UNITS / 2);
  });

  it('returns 0 for the zero vector, whichever zero it is', () => {
    expect(atan2B(0, 0)).toBe(0);
    expect(atan2B(-0, 0)).toBe(0);
    expect(atan2B(0, -0)).toBe(0);
    expect(atan2B(-0, -0)).toBe(0);
  });

  it('treats a negative zero component as positive (deterministic, unlike Math.atan2)', () => {
    // Math.atan2(1, -0) is π; the table version sees -0 as +0 and answers a quarter
    // turn. Pinned here on purpose: the behaviour must be identical on every engine,
    // and no sim code depends on the sign of a zero.
    expect(atan2B(1, -0)).toBe(ANGLE_QUARTER);
    expect(atan2B(-0, 1)).toBe(0);
  });

  it('always returns an integer angle in [0, 1024) for any finite or non-finite input', () => {
    const inputs = [0, -0, 1, -1, 1e-320, -1e-320, 1e308, -1e308, Infinity, -Infinity, NaN];
    for (const dy of inputs) {
      for (const dx of inputs) {
        const angle = atan2B(dy, dx);
        expect(Number.isInteger(angle), `atan2B(${String(dy)}, ${String(dx)})`).toBe(true);
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThan(ANGLE_UNITS);
      }
    }
  });

  it('mirrors correctly across both axes for every sampled direction', () => {
    const badY: number[] = [];
    const badX: number[] = [];
    for (let a = 0; a < ANGLE_UNITS; a += 1) {
      const dx = cosB(a);
      const dy = sinB(a);
      const base = atan2B(dy, dx);
      if (atan2B(-dy, dx) !== wrapAngle(-base)) badY.push(a);
      if (atan2B(dy, -dx) !== wrapAngle(ANGLE_UNITS / 2 - base)) badX.push(a);
    }
    expect(badY).toEqual([]);
    expect(badX).toEqual([]);
  });

  it('stays within ±1 unit of Math.atan2 on a dense grid of integer offsets', () => {
    // Integer pixel offsets are what aimed enemies actually compute.
    let worst = 0;
    for (let dx = -32; dx <= 32; dx += 1) {
      for (let dy = -32; dy <= 32; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const expected = Math.atan2(dy, dx) / RADIANS_PER_UNIT;
        let delta = atan2B(dy, dx) - expected;
        while (delta > ANGLE_UNITS / 2) delta -= ANGLE_UNITS;
        while (delta < -ANGLE_UNITS / 2) delta += ANGLE_UNITS;
        worst = Math.max(worst, Math.abs(delta));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe('core/math — angle helpers at their boundaries', () => {
  it('wraps huge and deeply negative angles', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(ANGLE_UNITS)).toBe(0);
    expect(wrapAngle(-ANGLE_UNITS)).toBe(0);
    expect(wrapAngle(-1)).toBe(ANGLE_MASK);
    expect(wrapAngle(1024 * 1000 + 7)).toBe(7);
    expect(wrapAngle(-1024 * 1000 - 7)).toBe(ANGLE_UNITS - 7);
  });

  it('quantises to every power-of-two direction count, and always to an integer', () => {
    const bad: string[] = [];
    for (const directions of [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]) {
      const step = ANGLE_UNITS / directions;
      for (let a = 0; a < ANGLE_UNITS; a += 1) {
        const snapped = quantizeAngle(a, directions);
        if (
          !Number.isInteger(snapped) ||
          snapped < 0 ||
          snapped >= ANGLE_UNITS ||
          snapped % step !== 0 ||
          Math.abs(angleDelta(a, snapped)) > step / 2
        ) {
          bad.push(`${String(directions)}@${String(a)}→${String(snapped)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('wraps the top of the circle back to zero instead of overflowing', () => {
    // round(1020 / 64) is 16, i.e. one full turn — the mask has to bring it home.
    expect(quantizeAngle(1020, 16)).toBe(0);
    expect(quantizeAngle(ANGLE_MASK, 32)).toBe(0);
    expect(quantizeAngle(ANGLE_MASK, 1024)).toBe(ANGLE_MASK);
  });

  it('quantises unwrapped angles the same way as wrapped ones', () => {
    for (let a = 0; a < ANGLE_UNITS; a += 7) {
      expect(quantizeAngle(a + 3 * ANGLE_UNITS, 16), String(a)).toBe(quantizeAngle(a, 16));
      expect(quantizeAngle(a - 3 * ANGLE_UNITS, 16), String(a)).toBe(quantizeAngle(a, 16));
    }
  });

  it('resolves the antipodal angleDelta to exactly -512 (a stable tie-break)', () => {
    const bad: number[] = [];
    for (let a = 0; a < ANGLE_UNITS; a += 1) {
      if (angleDelta(a, a + ANGLE_UNITS / 2) !== -ANGLE_UNITS / 2) bad.push(a);
    }
    expect(bad).toEqual([]);
  });

  it('measures deltas of unwrapped angles', () => {
    expect(angleDelta(-10, 10)).toBe(20);
    expect(angleDelta(ANGLE_UNITS + 5, 5)).toBe(0);
    expect(angleDelta(5, -ANGLE_UNITS + 5)).toBe(0);
  });

  it('turns by exactly maxStep, never further, and lands exactly on the target', () => {
    for (let target = 0; target < ANGLE_UNITS; target += 37) {
      for (const step of [0, 1, 7, 511, 512, 1024]) {
        const next = turnToward(0, target, step);
        const delta = angleDelta(0, target);
        const label = `${String(target)}/${String(step)}`;
        expect(Math.abs(angleDelta(0, next)), label).toBeLessThanOrEqual(
          Math.min(step, Math.abs(delta)),
        );
        if (step >= Math.abs(delta)) expect(next, label).toBe(target);
      }
    }
  });

  it('does not move at all with maxStep 0, but still normalises the angle', () => {
    expect(turnToward(100, 300, 0)).toBe(100);
    expect(turnToward(-1, 300, 0)).toBe(ANGLE_MASK);
    expect(turnToward(5, 5, 0)).toBe(5);
    expect(turnToward(ANGLE_UNITS + 5, ANGLE_UNITS + 5, 0)).toBe(5);
  });

  it('turns counter-clockwise on an exactly antipodal target (deterministic tie-break)', () => {
    expect(turnToward(0, ANGLE_UNITS / 2, 10)).toBe(ANGLE_UNITS - 10);
    expect(turnToward(300, 300 + ANGLE_UNITS / 2, 10)).toBe(290);
  });

  it('converges on any target from any start within ceil(512 / step) calls', () => {
    for (const step of [1, 3, 16, 100]) {
      for (let target = 0; target < ANGLE_UNITS; target += 101) {
        let angle = 777;
        const limit = Math.ceil(ANGLE_UNITS / 2 / step) + 1;
        let turns = 0;
        while (angle !== target && turns <= limit) {
          angle = turnToward(angle, target, step);
          turns += 1;
        }
        expect(angle, `step ${String(step)} target ${String(target)}`).toBe(target);
      }
    }
  });
});

describe('core/math — scalar helpers', () => {
  it('clamps the boundaries themselves and a degenerate range', () => {
    expect(clamp(0, 0, 0)).toBe(0);
    expect(clamp(-5, 0, 0)).toBe(0);
    expect(clamp(5, 0, 0)).toBe(0);
    expect(clamp(-Infinity, -1, 1)).toBe(-1);
    expect(clamp(Infinity, -1, 1)).toBe(1);
    expect(Number.isNaN(clamp(NaN, 0, 1))).toBe(true);
  });

  it('interpolates exactly at the ends and extrapolates outside 0…1', () => {
    expect(lerp(3, 9, 0)).toBe(3);
    expect(lerp(3, 9, 1)).toBe(9);
    expect(lerp(3, 9, 0.5)).toBe(6);
    expect(lerp(3, 9, 2)).toBe(15);
    expect(lerp(3, 9, -1)).toBe(-3);
    expect(lerp(-4, -4, 0.3)).toBe(-4);
  });

  it('approaches without overshooting from either side, including huge steps', () => {
    expect(approach(0, 5, 0)).toBe(0);
    expect(approach(5, 0, 0)).toBe(5);
    expect(approach(0, 0, 0)).toBe(0);
    expect(approach(0, 5, 5)).toBe(5);
    expect(approach(0, 5, Infinity)).toBe(5);
    expect(approach(-1e9, 5, 1e12)).toBe(5);
    expect(approach(5, -1e9, 1e12)).toBe(-1e9);
    expect(approach(0.1, 0.2, 0.05)).toBeCloseTo(0.15, 12);
  });

  it('lands exactly on the target after enough equal steps', () => {
    let value = 0;
    for (let i = 0; i < 40; i += 1) value = approach(value, 3.7, 0.1);
    expect(value).toBe(3.7);
  });
});

describe('core/math — easing curves', () => {
  it('is a frozen registry with exactly the documented curves', () => {
    expect(Object.isFrozen(EASINGS)).toBe(true);
    expect(EASING_NAMES).toEqual([
      'linear',
      'inQuad',
      'outQuad',
      'inOutQuad',
      'inCubic',
      'outCubic',
      'inOutCubic',
      'inOutSine',
    ]);
    for (const name of EASING_NAMES) expect(typeof EASINGS[name], name).toBe('function');
  });

  it('pins the endpoints exactly at 0 and 1', () => {
    for (const name of EASING_NAMES) {
      expect(EASINGS[name](0), name).toBe(0);
      expect(EASINGS[name](1), name).toBe(1);
    }
  });

  it('stays inside 0…1 across the domain and is weakly monotone', () => {
    const bad: string[] = [];
    for (const name of EASING_NAMES) {
      let previous = -Infinity;
      for (let i = 0; i <= 1000; i += 1) {
        const value = EASINGS[name](i / 1000);
        if (value < -1e-12 || value > 1 + 1e-12 || value < previous - 1e-12) {
          bad.push(`${name}@${String(i)}=${String(value)}`);
        }
        previous = value;
      }
    }
    expect(bad).toEqual([]);
  });

  it('does not clamp its input (callers clamp their own progress)', () => {
    expect(EASINGS.linear(2)).toBe(2);
    expect(EASINGS.inQuad(2)).toBe(4);
    expect(EASINGS.inQuad(-1)).toBe(1);
    expect(EASINGS.outQuad(-1)).toBe(-3);
    // inOutSine samples the table, so out-of-range progress simply wraps around it.
    expect(Number.isFinite(EASINGS.inOutSine(-1))).toBe(true);
    expect(Number.isFinite(EASINGS.inOutSine(4))).toBe(true);
  });

  it('is symmetric for the in-out curves', () => {
    for (const name of ['inOutQuad', 'inOutCubic', 'inOutSine'] as const) {
      for (let i = 0; i <= 100; i += 1) {
        const t = i / 100;
        expect(EASINGS[name](t) + EASINGS[name](1 - t), `${name} at ${String(t)}`).toBeCloseTo(
          1,
          9,
        );
      }
    }
  });

  it('pairs each in/out curve as mirror images', () => {
    for (const [inName, outName] of [
      ['inQuad', 'outQuad'],
      ['inCubic', 'outCubic'],
    ] as const) {
      for (let i = 0; i <= 100; i += 1) {
        const t = i / 100;
        expect(EASINGS[inName](t), `${inName} at ${String(t)}`).toBeCloseTo(
          1 - EASINGS[outName](1 - t),
          12,
        );
      }
    }
  });

  it('uses only table lookups for inOutSine (no engine Math.cos)', () => {
    // Every value must be a table entry (a multiple of 1/65536 after the 0.5 scaling),
    // which proves it came from SIN_TABLE_Q16 rather than the host's trigonometry.
    for (let i = 0; i <= 100; i += 1) {
      const value = EASINGS.inOutSine(i / 100);
      expect(Number.isInteger(value * 2 * 65536), String(i)).toBe(true);
    }
  });
});
