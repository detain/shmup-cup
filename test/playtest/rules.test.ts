/**
 * The 4-way design rules of plan M1-18 (`rules.ts`) on hand-made situations, so the checks the
 * content test and the playtest rely on are themselves right:
 *
 * - `maxBulletSpeed` reads the fastest **live** enemy bullet (0 without any);
 * - `laserLaneGaps` turns every warning / growing / active laser (never a fading one) into a band
 *   of rows widened by the ship's hurt radius (in playfield rows — the camera's y removed),
 *   merges overlapping and touching bands, and measures the narrowest gap between separate ones
 *   and the widest open band; a laser entirely above or below the playfield is no lane
 *   (regression: it used to count as a lane at row 0 / 200 and fake a narrow gap);
 * - `createRuleWatch` keeps the extremes over a run and lists at most 20 violations;
 * - `columnGap` (M2-18) closes the rows of the bullets crossing the ship's column (±8 px, each
 *   widened by its radius and the hurt radius) and of every live laser lane, and gives the widest
 *   open band — a wall of bullets across the column is a violation of the watch.
 */
import {
  ANGLE_UNITS,
  BulletKind,
  PLAYFIELD_H,
  createWorld,
  fireLaser,
  resolveGameConfig,
  spawnBullet,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { shippedContent } from './harness.js';
import {
  COLUMN_HALF_WIDTH,
  MAX_AIMED_BULLET_SPEED,
  MIN_LANE_GAP,
  columnGap,
  createRuleWatch,
  laserLaneGaps,
  maxBulletSpeed,
} from './rules.js';

/**
 * A free-flight World (static camera at 0, 0) on the shipped content.
 *
 * @returns The World.
 */
function world(): World {
  return createWorld(resolveGameConfig({ seed: 1 }), shippedContent());
}

/**
 * Fires a horizontal laser to the left from the right edge (a fixed laser, no source).
 *
 * @param w - The World.
 * @param y - World y of the beam.
 * @param width - Beam width (default 6).
 * @param timings - Telegraph / grow / active / fade ticks.
 * @returns The laser slot.
 */
function lane(
  w: World,
  y: number,
  width = 6,
  timings: readonly [number, number, number, number] = [40, 8, 60, 8],
): number {
  const [telegraph, grow, active, fade] = timings;
  return fireLaser(
    w,
    { slot: -1, x: w.camera.x + 380, y },
    ANGLE_UNITS / 2,
    384,
    telegraph,
    grow,
    active,
    width,
    fade,
  );
}

describe('playtest rules: maxBulletSpeed', () => {
  it('is 0 without bullets and reads the fastest live one', () => {
    const w = world();
    expect(maxBulletSpeed(w)).toBe(0);
    spawnBullet(w, 200, 100, ANGLE_UNITS / 2, 1, BulletKind.RoundPink);
    spawnBullet(w, 200, 120, ANGLE_UNITS / 2, 1.75, BulletKind.RoundPink);
    spawnBullet(w, 200, 140, ANGLE_UNITS / 2, 1.25, BulletKind.NeedlePurple);
    expect(maxBulletSpeed(w)).toBe(1.75);
  });
});

describe('playtest rules: laserLaneGaps', () => {
  it('reports no lanes and the whole playfield open without lasers', () => {
    expect(laserLaneGaps(world())).toEqual({
      lanes: 0,
      separate: 0,
      narrowestBetween: Number.POSITIVE_INFINITY,
      widestOpen: PLAYFIELD_H,
    });
  });

  it('widens a beam by the ship hurt radius', () => {
    const w = world();
    const hurt = w.ship.hurtRadius;
    lane(w, 100, 6);
    const gaps = laserLaneGaps(w);
    expect(gaps.lanes).toBe(1);
    expect(gaps.separate).toBe(1);
    expect(gaps.narrowestBetween).toBe(Number.POSITIVE_INFINITY);
    expect(gaps.widestOpen).toBeCloseTo(100 - 3 - hurt, 9); // above and below are equal
  });

  it('measures the open rows between separate lanes', () => {
    const w = world();
    const hurt = w.ship.hurtRadius;
    lane(w, 20);
    lane(w, 60);
    lane(w, 75);
    const gaps = laserLaneGaps(w);
    expect(gaps.lanes).toBe(3);
    expect(gaps.separate).toBe(3);
    // Between 60 and 75: 15 rows between the centres minus a half beam + hurt radius on each side.
    expect(gaps.narrowestBetween).toBeCloseTo(15 - 2 * (3 + hurt), 9);
    expect(gaps.widestOpen).toBeCloseTo(PLAYFIELD_H - 75 - 3 - hurt, 9);
  });

  it('merges overlapping and touching lanes (no gap between them)', () => {
    const w = world();
    const hurt = w.ship.hurtRadius;
    lane(w, 100);
    lane(w, 104); // overlapping
    lane(w, 104 + 6 + 2 * hurt); // touching the second exactly
    const gaps = laserLaneGaps(w);
    expect(gaps.lanes).toBe(3);
    expect(gaps.separate).toBe(1);
    expect(gaps.narrowestBetween).toBe(Number.POSITIVE_INFINITY);
  });

  it('counts warning and growing lasers, never a fading one', () => {
    const w = world();
    lane(w, 50, 6, [10, 0, 0, 0]); // warning only
    lane(w, 100, 6, [0, 10, 0, 0]); // growing only
    lane(w, 150, 6, [0, 0, 0, 10]); // fading only
    expect(laserLaneGaps(w).lanes).toBe(2);
  });

  it('reads playfield rows: the camera y is removed and bands are clipped to the playfield', () => {
    const w = world();
    const hurt = w.ship.hurtRadius;
    w.camera.y = 30;
    lane(w, 30 + 2); // the top of the playfield
    const gaps = laserLaneGaps(w);
    expect(gaps.lanes).toBe(1);
    expect(gaps.widestOpen).toBeCloseTo(PLAYFIELD_H - (2 + 3 + hurt), 9);
  });

  it('ignores a laser entirely above or below the playfield (regression)', () => {
    const w = world();
    lane(w, -40); // above the view
    lane(w, PLAYFIELD_H + 40); // below the view
    lane(w, 12); // a real lane near the top
    const gaps = laserLaneGaps(w);
    expect(gaps.lanes).toBe(1);
    expect(gaps.separate).toBe(1);
    expect(gaps.narrowestBetween).toBe(Number.POSITIVE_INFINITY);
    // The watch sees no violation either.
    const watch = createRuleWatch();
    watch.observe(w);
    expect(watch.violations).toEqual([]);
  });
});

describe('playtest rules: createRuleWatch', () => {
  it('keeps the extremes of a run and starts neutral', () => {
    const watch = createRuleWatch();
    expect(watch.maxBulletSpeed).toBe(0);
    expect(watch.maxLanes).toBe(0);
    expect(watch.narrowestGap).toBe(Number.POSITIVE_INFINITY);
    expect(watch.narrowestOpen).toBe(PLAYFIELD_H);
    const quiet = world();
    watch.observe(quiet);
    expect(watch.narrowestOpen).toBe(PLAYFIELD_H); // no lanes: the open band is not measured
    const w = world();
    spawnBullet(w, 200, 100, ANGLE_UNITS / 2, 1.5, BulletKind.RoundPink);
    lane(w, 40);
    lane(w, 100);
    watch.observe(w);
    watch.observe(quiet);
    expect(watch.maxBulletSpeed).toBe(1.5);
    expect(watch.maxLanes).toBe(2);
    expect(watch.maxSeparate).toBe(2);
    expect(watch.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
    expect(watch.narrowestOpen).toBeLessThan(PLAYFIELD_H);
    expect(watch.violations).toEqual([]);
  });

  it('reports a bullet over 2 px/tick, lanes too close and a closed playfield', () => {
    const fast = world();
    spawnBullet(
      fast,
      200,
      100,
      ANGLE_UNITS / 2,
      MAX_AIMED_BULLET_SPEED + 0.5,
      BulletKind.RoundPink,
    );
    const close = world();
    lane(close, 100);
    lane(close, 115); // 15 rows apart: 15 − 9 = 6 open rows
    const closed = world();
    for (let y = 10; y < PLAYFIELD_H; y += 30) lane(closed, y, 32);
    const watch = createRuleWatch();
    watch.observe(fast);
    watch.observe(close);
    watch.observe(closed);
    expect(watch.violations).toHaveLength(3);
    expect(watch.violations[0]).toMatch(/^tick 0: bullet at 2\.500$/);
    expect(watch.violations[1]).toMatch(/^tick 0: lane gap 6\.0$/);
    expect(watch.violations[2]).toMatch(/widest open band/);
    expect(watch.maxBulletSpeed).toBe(2.5);
    expect(watch.narrowestGap).toBeCloseTo(6, 9);
  });

  it('allows a bullet at exactly 2 px/tick and lanes exactly 16 px apart', () => {
    const w = world();
    const hurt = w.ship.hurtRadius;
    spawnBullet(w, 200, 100, ANGLE_UNITS / 2, MAX_AIMED_BULLET_SPEED, BulletKind.RoundPink);
    lane(w, 100);
    lane(w, 100 + MIN_LANE_GAP + 2 * (3 + hurt));
    const watch = createRuleWatch();
    watch.observe(w);
    expect(watch.narrowestGap).toBeCloseTo(MIN_LANE_GAP, 9);
    expect(watch.violations).toEqual([]);
  });

  it('lists at most 20 violations', () => {
    const w = world();
    spawnBullet(w, 200, 100, ANGLE_UNITS / 2, 3, BulletKind.RoundPink);
    const watch = createRuleWatch();
    for (let i = 0; i < 25; i++) watch.observe(w);
    expect(watch.violations).toHaveLength(20);
  });
});

describe('playtest rules: columnGap (M2-18)', () => {
  it('is the whole playfield with nothing in the ship’s column', () => {
    const w = world();
    expect(columnGap(w)).toBe(PLAYFIELD_H);
    // A bullet well away from the column closes nothing.
    spawnBullet(w, w.players[0].x + 60, 100, ANGLE_UNITS / 2, 1, BulletKind.RoundPink);
    expect(columnGap(w)).toBe(PLAYFIELD_H);
  });

  it('closes the rows of a bullet crossing the column, widened by its radius and the hurt radius', () => {
    const w = world();
    const x = w.players[0].x + COLUMN_HALF_WIDTH;
    spawnBullet(w, x, 100, ANGLE_UNITS / 2, 1, BulletKind.RoundPink);
    const f = w.bullets.pool.fields;
    const half = f.radius[0] + w.ship.hurtRadius;
    // The open band above (100 − half rows) is wider than the one below.
    expect(columnGap(w)).toBeCloseTo(100 - half, 9);
  });

  it('finds the gap a wall of bullets leaves, and the watch flags a wall under 16 px', () => {
    const w = world();
    const x = w.players[0].x;
    // A wall every 8 px from row 0 to 200 but a 30-px hole around row 100.
    for (let y = 4; y < PLAYFIELD_H; y += 8) {
      if (y > 85 && y < 115) continue;
      spawnBullet(w, x, y, ANGLE_UNITS / 2, 0.5, BulletKind.RoundPink);
    }
    const open = columnGap(w);
    expect(open).toBeGreaterThan(MIN_LANE_GAP);
    expect(open).toBeLessThan(40);
    const watch = createRuleWatch();
    watch.observe(w);
    expect(watch.narrowestColumn).toBe(open);
    expect(watch.violations).toEqual([]);
    // Plug the hole: the column is walled in.
    for (const y of [92, 100, 108])
      spawnBullet(w, x, y, ANGLE_UNITS / 2, 0.5, BulletKind.RoundPink);
    expect(columnGap(w)).toBeLessThan(MIN_LANE_GAP);
    watch.observe(w);
    expect(watch.violations.some((v) => v.includes("ship's column"))).toBe(true);
  });

  it('counts every live laser lane, wherever it is along the playfield', () => {
    const w = world();
    lane(w, 100, 6);
    const open = columnGap(w);
    const half = 3 + w.ship.hurtRadius;
    expect(open).toBeCloseTo(Math.max(100 - half, PLAYFIELD_H - (100 + half)), 9);
  });
});
