/**
 * Edge cases of the fire primitives of `core/patterns` (plan M1-09): N-way spreads with even
 * counts (fractional offsets) and across 0, centred on the aim in every one of the 32 directions;
 * fractional / non-finite counts; partially full pools (the count actually fired); rings of one
 * bullet, negative offsets and aimed offsets; spirals that fire nothing but keep turning and come
 * back round after a full turn; stacks with negative steps; sprays with no spread or one speed
 * that still draw two numbers per bullet when the pool is full (replay sync) and never touch the
 * cosmetic stream; homing and delayed bullets on a full pool, delay 0, re-aim at launch;
 * `rankedWait` rounding, floors and its monotony over the whole rank range.
 */
import { describe, expect, it } from 'vitest';
import {
  AIM_AT_TARGET,
  BulletFlag,
  BulletKind,
  BulletOrigin,
  MAX_ENEMY_BULLETS,
} from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import {
  fireAimed,
  fireDelayed,
  fireHoming,
  fireNWay,
  fireRing,
  fireSpiral,
  fireSpray,
  fireStack,
  rankedWait,
} from '../../src/patterns/index.js';
import { FIRE_RATE_RANK_CURVE, RANK_MAX, rankScale } from '../../src/rank/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A free-flight world with the ship alive at `(x, y)`.
 *
 * @param x - Ship x.
 * @param y - Ship y.
 * @param difficulty - Difficulty preset.
 * @returns The world.
 */
function world(x = 100, y = 100, difficulty: 'easy' | 'normal' = 'normal'): World {
  const w = createWorld(resolveGameConfig({ difficulty }), EMPTY_CONTENT_DB);
  const input = createInputSnapshot();
  for (let i = 0; i < 60; i++) stepWorld(w, input);
  w.players[0].x = x;
  w.players[0].y = y;
  w.debugFlags.godMode = true;
  return w;
}

/**
 * An origin.
 *
 * @param x - World x.
 * @param y - World y.
 * @returns The origin.
 */
function at(x: number, y: number): BulletOrigin {
  const o = new BulletOrigin();
  o.x = x;
  o.y = y;
  return o;
}

/**
 * Angles of the live bullets from a slot on.
 *
 * @param w - The world.
 * @param from - First slot.
 * @returns The angles, in slot order.
 */
function angles(w: World, from = 0): number[] {
  const f = w.bullets.pool.fields;
  const out: number[] = [];
  for (let i = from; i < w.bullets.count; i++) out.push(f.angle[i]);
  return out;
}

/**
 * Speeds of the live bullets.
 *
 * @param w - The world.
 * @returns The speeds, in slot order.
 */
function speeds(w: World): number[] {
  const f = w.bullets.pool.fields;
  const out: number[] = [];
  for (let i = 0; i < w.bullets.count; i++) out.push(f.speed[i]);
  return out;
}

/**
 * Fills the pool so only `free` slots are left.
 *
 * @param w - The world.
 * @param free - Slots to leave.
 */
function fill(w: World, free: number): void {
  while (w.bullets.count < MAX_ENEMY_BULLETS - free) w.bullets.spawn(200, 20, 0, 0, 0);
}

describe('core/patterns fire edge: fireNWay', () => {
  it('spreads even counts symmetrically (fractional offsets) and wraps across 0', () => {
    const w = world();
    expect(fireNWay(w.bullets, at(200, 100), 2, 33, 1, 0, 512)).toBe(2);
    expect(angles(w)).toEqual([495.5, 528.5]);
    expect(fireNWay(w.bullets, at(200, 100), 3, 32, 1, 0, 0)).toBe(3);
    expect(angles(w, 2)).toEqual([992, 0, 32]);
    expect(fireNWay(w.bullets, at(200, 100), 4, 20, 1, 0, 1020)).toBe(4);
    expect(angles(w, 5)).toEqual([990, 1010, 6, 26]);
  });

  it('centres the spread on the quantised aim in all 32 directions', () => {
    const w = world();
    const o = at(200, 100);
    for (let d = 0; d < 32; d++) {
      w.bullets.pool.clear();
      const rad = (d * 2 * Math.PI) / 32;
      w.players[0].x = 200 + Math.cos(rad) * 70;
      w.players[0].y = 100 + Math.sin(rad) * 70;
      expect(fireNWay(w.bullets, o, 5, 40, 1, 0)).toBe(5);
      const aim = (d * 32) % 1024;
      expect(angles(w), `direction ${d}`).toEqual(
        [-80, -40, 0, 40, 80].map((k) => (((aim + k) % 1024) + 1024) % 1024),
      );
    }
  });

  it('floors fractional counts; non-finite and < 1 counts fire nothing', () => {
    const w = world();
    expect(fireNWay(w.bullets, at(200, 100), 3.9, 32, 1, 0, 0)).toBe(3);
    for (const count of [0.99, 0, -2, Number.NaN, Infinity, -Infinity]) {
      expect(fireNWay(w.bullets, at(200, 100), count, 32, 1, 0, 0), String(count)).toBe(0);
    }
    expect(w.bullets.count).toBe(3);
  });

  it('returns only the bullets that fit into a nearly full pool', () => {
    const w = world();
    fill(w, 2);
    expect(fireNWay(w.bullets, at(200, 100), 5, 32, 1, 0, 0)).toBe(2);
    // The first bullets of the spread are the ones that fit.
    expect(angles(w, MAX_ENEMY_BULLETS - 2)).toEqual([960, 992]);
    expect(fireNWay(w.bullets, at(200, 100), 5, 32, 1, 0, 0)).toBe(0);
  });

  it('drops the whole volley for a bad kind', () => {
    const w = world();
    expect(fireNWay(w.bullets, at(200, 100), 5, 32, 1, 99)).toBe(0);
    expect(fireRing(w.bullets, at(200, 100), 5, 1, -1)).toBe(0);
    expect(fireStack(w.bullets, at(200, 100), 5, 1, 1, 0.5)).toBe(0);
    expect(fireAimed(w.bullets, at(200, 100), 1, 9)).toBe(-1);
    expect(w.bullets.count).toBe(0);
  });
});

describe('core/patterns fire edge: fireRing', () => {
  it('fires one bullet at the offset for a ring of 1; wraps negative offsets', () => {
    const w = world();
    expect(fireRing(w.bullets, at(200, 100), 1, 1, 0, 300)).toBe(1);
    expect(fireRing(w.bullets, at(200, 100), 4, 1, 0, -16)).toBe(4);
    expect(angles(w)).toEqual([300, 1008, 240, 496, 752]);
  });

  it('starts an aimed ring at the quantised aim; spacing is exact for odd counts', () => {
    const w = world(200, 190); // straight below: aim 256
    expect(fireRing(w.bullets, at(200, 100), 5, 1, 0, AIM_AT_TARGET)).toBe(5);
    expect(angles(w)).toEqual([
      256,
      256 + 1024 / 5,
      256 + 2048 / 5,
      256 + 3072 / 5,
      256 + 4096 / 5 - 1024,
    ]);
    expect(fireRing(w.bullets, at(200, 100), 7.5, 1, 0)).toBe(7);
  });

  it('fires what fits into the pool', () => {
    const w = world();
    fill(w, 3);
    expect(fireRing(w.bullets, at(200, 100), 8, 1, 0)).toBe(3);
    expect(w.bullets.count).toBe(MAX_ENEMY_BULLETS);
  });
});

describe('core/patterns fire edge: fireSpiral', () => {
  it('fires nothing for arms < 1 / NaN, but still returns the advanced angle', () => {
    const w = world();
    for (const arms of [0, -1, 0.5, Number.NaN]) {
      expect(fireSpiral(w.bullets, at(200, 100), 100, arms, 24, 1, 0), String(arms)).toBe(124);
    }
    expect(w.bullets.count).toBe(0);
  });

  it('always returns an angle in [0, 1024), for any step', () => {
    const w = world();
    for (const [angle, step, next] of [
      [0, -1030, 1018],
      [1000, 2048 + 30, 6],
      [512, 0, 512],
      [10.5, -10.5, 0],
      [1023.75, 0.5, 0.25],
    ]) {
      const result = fireSpiral(w.bullets, at(200, 100), angle, 1, step, 1, 0);
      expect(result, `${angle} + ${step}`).toBeCloseTo(next, 10);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(ANGLE_UNITS);
    }
  });

  it('comes back to its start after a full turn of volleys, arms evenly spaced each time', () => {
    const w = world();
    let a = 37;
    for (let k = 0; k < 16; k++) {
      const before = w.bullets.count;
      a = fireSpiral(w.bullets, at(200, 100), a, 3, 64, 1, 0);
      const volley = angles(w, before);
      expect(volley).toHaveLength(3);
      expect((volley[1] - volley[0] + 1024) % 1024).toBeCloseTo(1024 / 3, 10);
      expect((volley[2] - volley[1] + 1024) % 1024).toBeCloseTo(1024 / 3, 10);
    }
    expect(a).toBe(37);
  });
});

describe('core/patterns fire edge: fireStack and fireSpray', () => {
  it('fireStack: negative steps slow the stack down; one bullet is a plain shot', () => {
    const w = world(0, 100);
    expect(fireStack(w.bullets, at(200, 100), 3, 2, -0.5, 0)).toBe(3);
    expect(speeds(w)).toEqual([2, 1.5, 1]);
    expect(fireStack(w.bullets, at(200, 100), 1, 1.25, 9, 0, 100)).toBe(1);
    expect(angles(w)).toEqual([512, 512, 512, 100]);
  });

  it('fireSpray: spread 0 → every bullet on the centre; min = max → one speed', () => {
    const w = world();
    expect(fireSpray(w.bullets, at(200, 100), w.rng.gameplay, 10, 0, 1.5, 1.5, 0, 200)).toBe(10);
    expect(new Set(angles(w))).toEqual(new Set([200]));
    expect(new Set(speeds(w))).toEqual(new Set([1.5]));
  });

  it('fireSpray: draws two numbers per bullet even when nothing fits (replays stay in sync)', () => {
    const w = world();
    fill(w, 1);
    const rng = w.rng.gameplay;
    const cosmetic = w.rng.cosmetic.callCount;
    const before = rng.callCount;
    expect(fireSpray(w.bullets, at(200, 100), rng, 6, 100, 1, 2, 0)).toBe(1);
    expect(rng.callCount - before).toBe(12);
    expect(fireSpray(w.bullets, at(200, 100), rng, 6, 100, 1, 2, 0)).toBe(0);
    expect(rng.callCount - before).toBe(24);
    expect(fireSpray(w.bullets, at(200, 100), rng, 0, 100, 1, 2, 0)).toBe(0);
    expect(rng.callCount - before).toBe(24); // no bullets, no draws
    expect(w.rng.cosmetic.callCount).toBe(cosmetic);
  });

  it('fireSpray: the same RNG state gives the same volley, whatever else is in the pool', () => {
    const volley = (prefill: number): number[] => {
      const w = world();
      for (let k = 0; k < prefill; k++) w.bullets.spawn(10, 10, 0, 0, 0);
      fireSpray(w.bullets, at(200, 100), w.rng.gameplay, 8, 256, 0.5, 2.5, 0, 700);
      const f = w.bullets.pool.fields;
      const out: number[] = [];
      for (let i = prefill; i < w.bullets.count; i++) out.push(f.angle[i], f.speed[i]);
      return out;
    };
    const a = volley(0);
    expect(a).toHaveLength(16);
    expect(volley(40)).toEqual(a);
    for (let k = 0; k < 8; k++) {
      expect(Math.abs(a[2 * k] - 700)).toBeLessThanOrEqual(128);
      expect(a[2 * k + 1]).toBeGreaterThanOrEqual(0.5);
      expect(a[2 * k + 1]).toBeLessThan(2.5);
    }
  });
});

describe('core/patterns fire edge: fireHoming and fireDelayed', () => {
  it('fireHoming: -1 on a full pool (no homing set anywhere); default heading is the aim', () => {
    const w = world(100, 100);
    fill(w, 0);
    expect(fireHoming(w.bullets, at(200, 100), 1, 0, 4, 60)).toBe(-1);
    const f = w.bullets.pool.fields;
    expect(f.homing.subarray(0, MAX_ENEMY_BULLETS).every((h) => h === 0)).toBe(true);
    const v = world(200, 190);
    const i = fireHoming(v.bullets, at(200, 100), 1, 0, 4, 60);
    expect([v.bullets.pool.fields.angle[i], v.bullets.pool.fields.homing[i]]).toEqual([256, 60]);
  });

  it('fireDelayed: delay 0 moves at once with no re-aim flag; a full pool returns -1', () => {
    const w = world(100, 100);
    const i = fireDelayed(w.bullets, at(200, 100), 0, 2, 0);
    const f = w.bullets.pool.fields;
    expect([f.delay[i], f.flags[i] & BulletFlag.AimOnLaunch, f.angle[i]]).toEqual([0, 0, 512]);
    stepWorld(w, createInputSnapshot());
    expect(f.x[i]).toBe(198);
    fill(w, 0);
    expect(fireDelayed(w.bullets, at(200, 100), 5, 2, 0)).toBe(-1);
  });

  it('fireDelayed: an aimed bullet is re-aimed at launch, a fixed one never', () => {
    const w = world(100, 100);
    const aimed = fireDelayed(w.bullets, at(200, 100), 3, 1, BulletKind.OvalRed);
    const fixed = fireDelayed(w.bullets, at(200, 120), 3, 1, BulletKind.OvalRed, 512);
    const f = w.bullets.pool.fields;
    expect([f.angle[aimed], f.angle[fixed]]).toEqual([512, 512]);
    const input = createInputSnapshot();
    for (let t = 0; t < 3; t++) stepWorld(w, input);
    w.players[0].x = 200;
    w.players[0].y = 20; // straight above the aimed bullet at launch
    stepWorld(w, input);
    expect([f.angle[aimed], f.angle[fixed]]).toEqual([768, 512]);
    expect([f.x[aimed], f.y[aimed]]).toEqual([200, 99]);
  });
});

describe('core/patterns fire edge: rank', () => {
  it('rankedWait: exactly the interval on Normal for every whole interval up to 600', () => {
    const w = world();
    for (let ticks = 1; ticks <= 600; ticks++) expect(rankedWait(w.bullets, ticks)).toBe(ticks);
  });

  it('rankedWait: rounds fractions, never below 1 (negative, NaN)', () => {
    const w = world();
    expect([2.4, 2.5, 2.6, 0.4, -10, Number.NaN].map((t) => rankedWait(w.bullets, t))).toEqual([
      2, 3, 3, 1, 1, 1,
    ]);
  });

  it('rankedWait never grows with rank and matches round(ticks / fireScale)', () => {
    const w = world();
    let previous = Infinity;
    for (let rank = 0; rank <= RANK_MAX; rank++) {
      w.bullets.setRank(rank);
      const wait = rankedWait(w.bullets, 120);
      expect(wait).toBe(Math.round(120 / rankScale(rank, FIRE_RATE_RANK_CURVE)));
      expect(wait).toBeLessThanOrEqual(previous);
      previous = wait;
    }
    expect(previous).toBe(Math.round(120 / rankScale(31, FIRE_RATE_RANK_CURVE)));
  });

  it('slows every primitive on Easy (speedScale < 1) and lengthens its waits', () => {
    const w = world(0, 100, 'easy');
    const s = w.bullets.speedScale;
    expect(s).toBeLessThan(1);
    fireAimed(w.bullets, at(200, 100), 2, 0);
    fireSpray(w.bullets, at(200, 100), w.rng.gameplay, 1, 0, 2, 2, 0);
    expect(speeds(w)).toEqual([2 * s, 2 * s]);
    expect(rankedWait(w.bullets, 90)).toBe(94);
  });
});
