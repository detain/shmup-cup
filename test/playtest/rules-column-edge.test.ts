/**
 * Edge cases of the ship's-column rule (`rules.ts` `columnGap`, plan M2-18 — the "4-way gap rule"
 * generalised from lasers to bullet walls), beyond `rules.test.ts`:
 *
 * - a dead bullet and a fading laser close nothing; a bullet exactly `COLUMN_HALF_WIDTH` + its
 *   radius from the ship's x still crosses the column, one a hair further does not;
 * - bands are read in playfield rows (the camera's y removed) and clipped to the playfield — a
 *   bullet wholly above or below it closes nothing, one straddling the edge closes only the rows
 *   inside;
 * - overlapping bands merge (the open band is never negative), the widest of several gaps wins, a
 *   slanted laser closes every row it spans;
 * - the `player` argument picks whose column is checked;
 * - `createRuleWatch` keeps the narrowest column over a run (a quieter tick never widens it) and
 *   flags a column open less than `MIN_LANE_GAP` px — exactly 16 px is allowed.
 */
import {
  ANGLE_UNITS,
  BulletFlag,
  BulletKind,
  LaserPhase,
  PLAYFIELD_H,
  createWorld,
  fireLaser,
  resolveGameConfig,
  spawnBullet,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { shippedContent } from './harness.js';
import { COLUMN_HALF_WIDTH, MIN_LANE_GAP, columnGap, createRuleWatch } from './rules.js';

/**
 * A free-flight World (static camera at 0, 0) on the shipped content.
 *
 * @returns The World.
 */
function world(): World {
  return createWorld(resolveGameConfig({ seed: 1 }), shippedContent());
}

/**
 * Spawns a slow round bullet at a world point.
 *
 * @param w - The World.
 * @param x - World x.
 * @param y - World y.
 * @returns Its slot.
 */
function bullet(w: World, x: number, y: number): number {
  const slot = spawnBullet(w, x, y, ANGLE_UNITS / 2, 0.5, BulletKind.RoundPink);
  expect(slot).toBeGreaterThanOrEqual(0);
  return slot;
}

/**
 * The half-height of the rows a bullet closes (its radius plus the ship's hurt radius).
 *
 * @param w - The World.
 * @param slot - The bullet.
 * @returns Pixels.
 */
function halfBand(w: World, slot: number): number {
  return w.bullets.pool.fields.radius[slot] + w.ship.hurtRadius;
}

describe('playtest rules: columnGap — edge cases (M2-18 tests)', () => {
  it('ignores a dead bullet and a fading laser', () => {
    const w = world();
    const slot = bullet(w, w.players[0].x, 100);
    expect(columnGap(w)).toBeLessThan(PLAYFIELD_H);
    w.bullets.pool.fields.flags[slot] |= BulletFlag.Dead;
    expect(columnGap(w)).toBe(PLAYFIELD_H);
    const laser = fireLaser(w, { slot: -1, x: w.camera.x + 380, y: 100 }, ANGLE_UNITS / 2, 384);
    expect(columnGap(w)).toBeLessThan(PLAYFIELD_H);
    w.bullets.lasers.fields.phase[laser] = LaserPhase.Fade;
    expect(columnGap(w)).toBe(PLAYFIELD_H);
  });

  it('counts a bullet exactly at the column’s edge, not one a hair beyond it', () => {
    const w = world();
    const slot = bullet(w, 0, 100);
    const r = w.bullets.pool.fields.radius[slot];
    const edge = w.players[0].x + COLUMN_HALF_WIDTH + r;
    w.bullets.pool.fields.x[slot] = edge;
    expect(columnGap(w)).toBeLessThan(PLAYFIELD_H);
    w.bullets.pool.fields.x[slot] = edge + 0.01;
    expect(columnGap(w)).toBe(PLAYFIELD_H);
    // Left of the ship counts the same.
    w.bullets.pool.fields.x[slot] = w.players[0].x - COLUMN_HALF_WIDTH - r;
    expect(columnGap(w)).toBeLessThan(PLAYFIELD_H);
  });

  it('reads playfield rows: the camera’s y is removed', () => {
    const w = world();
    w.camera.y = 30;
    const slot = bullet(w, w.players[0].x, 30 + 150);
    const half = halfBand(w, slot);
    // Row 150: the open band above it (150 − half rows) is the widest.
    expect(columnGap(w)).toBeCloseTo(150 - half, 9);
  });

  it('clips bands to the playfield: outside closes nothing, across the edge only the rows inside', () => {
    const w = world();
    const x = w.players[0].x;
    bullet(w, x, -40);
    bullet(w, x, PLAYFIELD_H + 40);
    expect(columnGap(w)).toBe(PLAYFIELD_H);
    const top = bullet(w, x, 1);
    // The band [1 − half, 1 + half] is clipped at row 0: everything below it is open.
    expect(columnGap(w)).toBeCloseTo(PLAYFIELD_H - (1 + halfBand(w, top)), 9);
  });

  it('merges overlapping bands and picks the widest of several gaps', () => {
    const w = world();
    const x = w.players[0].x;
    const a = bullet(w, x, 60);
    bullet(w, x, 63); // overlaps the first
    const half = halfBand(w, a);
    // Open: [0, 60 − half] and [63 + half, 200].
    expect(columnGap(w)).toBeCloseTo(Math.max(60 - half, PLAYFIELD_H - (63 + half)), 9);
    bullet(w, x, 150);
    // Now [63 + half, 150 − half] is between them; above the first stays open too.
    const gaps = [60 - half, 150 - half - (63 + half), PLAYFIELD_H - (150 + half)];
    expect(columnGap(w)).toBeCloseTo(Math.max(...gaps), 9);
    expect(columnGap(w)).toBeGreaterThan(0);
  });

  it('closes every row a slanted laser spans', () => {
    const w = world();
    const slot = fireLaser(
      w,
      { slot: -1, x: w.camera.x + 380, y: 40 },
      ANGLE_UNITS / 2 - ANGLE_UNITS / 16, // up-left… or down-left: either way a slant
      384,
    );
    const lf = w.bullets.lasers.fields;
    const span = Math.abs(lf.ey[slot] - lf.y[slot]);
    expect(span).toBeGreaterThan(0);
    expect(columnGap(w)).toBeLessThanOrEqual(PLAYFIELD_H - span + 1e-9);
  });

  it('checks the column of the player asked for', () => {
    const w = world();
    const p1 = w.players[0];
    expect(w.players.length).toBeGreaterThan(1);
    const p2 = w.players[1];
    p2.x = p1.x + 100;
    bullet(w, p1.x, 100);
    expect(columnGap(w, 0)).toBeLessThan(PLAYFIELD_H);
    expect(columnGap(w, 1)).toBe(PLAYFIELD_H);
    bullet(w, p2.x, 100);
    expect(columnGap(w, 1)).toBeLessThan(PLAYFIELD_H);
  });
});

describe('playtest rules: createRuleWatch — the ship’s column (M2-18 tests)', () => {
  it('keeps the narrowest column of a run; a quieter tick never widens it', () => {
    const watch = createRuleWatch();
    expect(watch.narrowestColumn).toBe(PLAYFIELD_H);
    const busy = world();
    bullet(busy, busy.players[0].x, 100);
    const measured = columnGap(busy);
    watch.observe(busy);
    expect(watch.narrowestColumn).toBe(measured);
    watch.observe(world());
    expect(watch.narrowestColumn).toBe(measured);
    expect(watch.violations).toEqual([]);
  });

  it('allows a column open exactly 16 px and flags one under it with the measured width', () => {
    // Two wide lasers that leave exactly MIN_LANE_GAP rows between them and nothing else open.
    const w = world();
    const hurt = w.ship.hurtRadius;
    const lane = (y: number, width: number): number =>
      fireLaser(w, { slot: -1, x: w.camera.x + 380, y }, ANGLE_UNITS / 2, 384, 40, 8, 60, width);
    // Rows [−hurt, 80 + hurt] closed by the first.
    lane(40, 80);
    const holeTop = 80 + hurt;
    // The second's band starts MIN_LANE_GAP rows lower and reaches past the bottom.
    const width = 2 * PLAYFIELD_H;
    lane(holeTop + MIN_LANE_GAP + width / 2 + hurt, width);
    const open = columnGap(w);
    expect(open).toBeCloseTo(MIN_LANE_GAP, 9);
    const watch = createRuleWatch();
    watch.observe(w);
    expect(watch.violations.filter((v) => v.includes("ship's column"))).toEqual([]);
    // A bullet in the hole: the column is walled in.
    const b = bullet(w, w.players[0].x, holeTop + MIN_LANE_GAP / 2);
    expect(halfBand(w, b)).toBeGreaterThan(0);
    const closed = columnGap(w);
    expect(closed).toBeLessThan(MIN_LANE_GAP);
    watch.observe(w);
    const flagged = watch.violations.find((v) => v.includes("ship's column"));
    expect(flagged).toContain(`ship's column open ${closed.toFixed(1)}`);
    expect(watch.narrowestColumn).toBe(closed);
  });
});
