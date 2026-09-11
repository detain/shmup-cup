/**
 * The fire primitives of `core/patterns` (plan M1-09): aimed (quantised), N-way (centred spread),
 * ring (even spacing, offset), spiral (script-held angle), stack (one heading, stepped speeds),
 * spray (seeded cone), homing and delayed bullets, rank scaling of every speed, `AIM_AT_TARGET`
 * defaults and bad counts.
 */
import { describe, expect, it } from 'vitest';
import {
  AIM_AT_TARGET,
  BulletKind,
  BulletOrigin,
  NO_TARGET_ANGLE,
} from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
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
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A free-flight world with the ship alive at `(x, y)`.
 *
 * @param x - Ship x.
 * @param y - Ship y.
 * @returns The world.
 */
function world(x = 100, y = 100): World {
  const w = createWorld(resolveGameConfig({}), EMPTY_CONTENT_DB);
  const input = createInputSnapshot();
  for (let i = 0; i < 60; i++) stepWorld(w, input);
  w.players[0].x = x;
  w.players[0].y = y;
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
 * Angles and speeds of the live bullets.
 *
 * @param w - The world.
 * @returns `[angle, speed]` per bullet, in slot order.
 */
function shots(w: World): Array<[number, number]> {
  const f = w.bullets.pool.fields;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < w.bullets.count; i++) out.push([f.angle[i], f.speed[i]]);
  return out;
}

describe('core/patterns fire primitives', () => {
  it('fireAimed: one bullet at the ship, snapped to 32 directions, from the origin', () => {
    const w = world(100, 140); // down-left of the origin
    const i = fireAimed(w.bullets, at(200, 100), 1.5, BulletKind.NeedleRed);
    const f = w.bullets.pool.fields;
    expect([f.x[i], f.y[i], f.speed[i], f.kind[i]]).toEqual([200, 100, 1.5, BulletKind.NeedleRed]);
    // atan2(40, -100) ≈ 158.2° → 449.9 units → nearest of 32 steps: 448.
    expect(f.angle[i]).toBe(448);
  });

  it('fireNWay: count bullets step apart centred on the aim (or a given angle)', () => {
    const w = world(0, 100); // straight left of the origin: aim 512
    expect(fireNWay(w.bullets, at(200, 100), 3, 48, 1, 0)).toBe(3);
    expect(shots(w).map(([a]) => a)).toEqual([464, 512, 560]);
    expect(fireNWay(w.bullets, at(200, 100), 4, 32, 1, 0, 256)).toBe(4);
    expect(
      shots(w)
        .slice(3)
        .map(([a]) => a),
    ).toEqual([208, 240, 272, 304]);
    expect(fireNWay(w.bullets, at(200, 100), 1, 64, 1, 0, 100)).toBe(1);
    expect(shots(w)[7][0]).toBe(100);
  });

  it('fireRing: evenly round the circle from the offset', () => {
    const w = world();
    expect(fireRing(w.bullets, at(200, 100), 8, 1, 0, 16)).toBe(8);
    expect(shots(w).map(([a]) => a)).toEqual([16, 144, 272, 400, 528, 656, 784, 912]);
    expect(fireRing(w.bullets, at(200, 100), 3, 1, 0)).toBe(3);
    expect(
      shots(w)
        .slice(8)
        .map(([a]) => a),
    ).toEqual([0, 1024 / 3, 2048 / 3]);
  });

  it('fireSpiral: arms evenly spaced at the given angle, returns the next angle (wrapped)', () => {
    const w = world();
    let a = 1000;
    a = fireSpiral(w.bullets, at(200, 100), a, 2, 40, 1, 0);
    expect(a).toBe(16);
    expect(shots(w).map(([angle]) => angle)).toEqual([1000, 488]);
    a = fireSpiral(w.bullets, at(200, 100), a, 2, 40, 1, 0);
    expect(a).toBe(56);
    expect(
      shots(w)
        .slice(2)
        .map(([angle]) => angle),
    ).toEqual([16, 528]);
    expect(fireSpiral(w.bullets, at(200, 100), 10, 1, -20, 1, 0)).toBe(1014);
  });

  it('fireStack: one heading, speeds speed + k · step', () => {
    const w = world(0, 100);
    expect(fireStack(w.bullets, at(200, 100), 4, 1, 0.25, 0)).toBe(4);
    expect(shots(w)).toEqual([
      [512, 1],
      [512, 1.25],
      [512, 1.5],
      [512, 1.75],
    ]);
  });

  it('fireSpray: headings within ±spread/2 of the centre, speeds in [min, max)', () => {
    const w = world();
    expect(fireSpray(w.bullets, at(200, 100), w.rng.gameplay, 50, 100, 0.5, 1.5, 0, 300)).toBe(50);
    for (const [angle, speed] of shots(w)) {
      expect(angle).toBeGreaterThanOrEqual(250);
      expect(angle).toBeLessThan(350);
      expect(speed).toBeGreaterThanOrEqual(0.5);
      expect(speed).toBeLessThan(1.5);
    }
  });

  it('fireHoming and fireDelayed set up their bullets (homing ticks, delay + aim on launch)', () => {
    const w = world(100, 100);
    const h = fireHoming(w.bullets, at(200, 100), 1, 0, 6, 90, 256);
    const f = w.bullets.pool.fields;
    expect([f.angle[h], f.turnRate[h], f.homing[h]]).toEqual([256, 6, 90]);
    const d = fireDelayed(w.bullets, at(200, 100), 10, 2, 0);
    expect([f.angle[d], f.delay[d]]).toEqual([512, 11]);
    const fixed = fireDelayed(w.bullets, at(200, 100), 10, 2, 0, 128);
    expect(f.angle[fixed]).toBe(128);
  });

  it('multiplies every speed by the rank speed scale', () => {
    const w = world(0, 100);
    w.bullets.setRank(16);
    const s = w.bullets.speedScale;
    fireAimed(w.bullets, at(200, 100), 1, 0);
    fireNWay(w.bullets, at(200, 100), 2, 32, 1, 0);
    fireRing(w.bullets, at(200, 100), 2, 1, 0);
    fireSpiral(w.bullets, at(200, 100), 0, 1, 0, 1, 0);
    fireStack(w.bullets, at(200, 100), 2, 1, 1, 0);
    fireHoming(w.bullets, at(200, 100), 1, 0, 1, 1);
    fireDelayed(w.bullets, at(200, 100), 1, 1, 0);
    expect(shots(w).map(([, speed]) => speed)).toEqual([s, s, s, s, s, s, s, 2 * s, s, s]);
    expect(s).toBeGreaterThan(1.2);
    expect(rankedWait(w.bullets, 60)).toBeLessThan(60);
  });

  it('aims left without a living target and ignores counts below 1', () => {
    const w = world();
    w.players[0].state = 'dead';
    const i = fireAimed(w.bullets, at(200, 100), 1, 0);
    expect(w.bullets.pool.fields.angle[i]).toBe(NO_TARGET_ANGLE);
    expect(fireNWay(w.bullets, at(200, 100), 0, 32, 1, 0)).toBe(0);
    expect(fireRing(w.bullets, at(200, 100), -3, 1, 0)).toBe(0);
    expect(fireStack(w.bullets, at(200, 100), Number.NaN, 1, 1, 0)).toBe(0);
    expect(fireSpray(w.bullets, at(200, 100), w.rng.gameplay, 0.5, 10, 1, 1, 0)).toBe(0);
    expect(fireRing(w.bullets, at(200, 100), 2, 1, 0, AIM_AT_TARGET)).toBe(2);
    expect(w.bullets.count).toBe(3);
  });
});
