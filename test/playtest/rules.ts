/**
 * The 4-way design rules of plan M1-18 (shmup_feat.md §4 rule 2, decision D17), as checks on a
 * running World — shared by the content test (`pnpm content:check`) and the playtest:
 *
 * - **Aimed bullet speed ≤ {@link MAX_AIMED_BULLET_SPEED} px/tick** on Normal: a ship that can only
 *   move up, down, left or right at 1.5 px/tick must be able to side-step an aimed shot.
 *   {@link maxBulletSpeed} reads every live enemy bullet (zone A fires nothing faster than its
 *   aimed shots, so every bullet is held to the limit).
 * - **No simultaneous laser lanes leaving less than {@link MIN_LANE_GAP} px of safe gap**: the
 *   lanes of every laser live at the same time (warning line, growing or active — a warned lane
 *   is as good as closed) are the rows their beam covers plus the ship's hurt radius;
 *   {@link laserLaneGaps} measures the open rows between two such lanes and the widest open band
 *   of the playfield. A 4-way player dodges lasers only by moving up or down into such a gap.
 *
 * @module
 */
import { BulletFlag, LaserPhase, PLAYFIELD_H, type World } from '@shmup/core';

/** Fastest enemy bullet a 4-way player can be asked to side-step (px/tick, Normal). */
export const MAX_AIMED_BULLET_SPEED = 2.0;

/** Narrowest open gap between two simultaneous laser lanes (px). */
export const MIN_LANE_GAP = 16;

/**
 * The fastest live enemy bullet.
 *
 * @param world - The World.
 * @returns Its speed in px/tick (0 without bullets).
 */
export function maxBulletSpeed(world: World): number {
  const pool = world.bullets.pool;
  const f = pool.fields;
  let max = 0;
  for (let i = 0; i < pool.count; i++) {
    if ((f.flags[i] & BulletFlag.Dead) !== 0) continue;
    if (f.speed[i] > max) max = f.speed[i];
  }
  return max;
}

/** What {@link laserLaneGaps} measured on one tick. */
export interface LaneGaps {
  /** Laser lanes live at the same time. */
  readonly lanes: number;
  /** Separate lanes among them (overlapping or touching lanes merge into one). */
  readonly separate: number;
  /** Narrowest open gap between two separate lanes (`Infinity` with fewer than two). */
  readonly narrowestBetween: number;
  /** Widest open band of rows of the playfield (`PLAYFIELD_H` without lanes). */
  readonly widestOpen: number;
}

/**
 * Measures the laser lanes of a tick (see the module docs). A lane's rows are the beam's
 * vertical extent over the playfield width (a horizontal beam: its row ± half its width) widened
 * by the ship's hurt radius; lanes that overlap merge and leave no gap between them.
 *
 * @param world - The World.
 * @returns The lanes and gaps.
 */
export function laserLaneGaps(world: World): LaneGaps {
  const lasers = world.bullets.lasers;
  const f = lasers.fields;
  const hurt = world.ship.hurtRadius;
  const camera = world.camera;
  const bands: [number, number][] = [];
  for (let i = 0; i < lasers.count; i++) {
    if ((f.flags[i] & BulletFlag.Dead) !== 0 || f.phase[i] === LaserPhase.Fade) continue;
    const half = f.width[i] / 2 + hurt;
    const top = Math.min(f.y[i], f.ey[i]) - camera.y - half;
    const bottom = Math.max(f.y[i], f.ey[i]) - camera.y + half;
    bands.push([Math.max(0, top), Math.min(PLAYFIELD_H, bottom)]);
  }
  bands.sort((a, b) => a[0] - b[0]);
  let narrowest = Number.POSITIVE_INFINITY;
  let widest = 0;
  let separate = 0;
  let edge = 0;
  for (let i = 0; i < bands.length; i++) {
    const [top, bottom] = bands[i];
    const open = top - edge;
    if (open > widest) widest = open;
    // An overlapping or touching lane merges with the one above: no gap between them.
    if (separate === 0 || open > 0) {
      if (separate > 0) narrowest = Math.min(narrowest, open);
      separate++;
    }
    if (bottom > edge) edge = bottom;
  }
  if (PLAYFIELD_H - edge > widest) widest = PLAYFIELD_H - edge;
  return { lanes: bands.length, separate, narrowestBetween: narrowest, widestOpen: widest };
}

/** Violations of the 4-way rules collected over a run ({@link createRuleWatch}). */
export interface RuleWatch {
  /** Fastest enemy bullet seen (px/tick). */
  maxBulletSpeed: number;
  /** Most laser lanes live at once. */
  maxLanes: number;
  /** Most separate laser lanes live at once. */
  maxSeparate: number;
  /** Narrowest gap seen between two separate simultaneous lanes (`Infinity` = never two). */
  narrowestGap: number;
  /** Narrowest "widest open band" seen while lanes were live. */
  narrowestOpen: number;
  /** Ticks on which a rule was broken, with what broke it (the first 20). */
  readonly violations: string[];
  /**
   * Checks one tick (use as the playtest's `observe` — a bound function).
   *
   * @param world - The World after the tick.
   */
  readonly observe: (world: World) => void;
}

/**
 * Creates a collector that checks the 4-way rules on every tick it observes.
 *
 * @returns The collector.
 *
 * @example
 * ```ts
 * const rules = createRuleWatch();
 * runStage('zone-a', fourWayBot(), { godMode: true, observe: rules.observe });
 * rules.violations; // → []
 * ```
 */
export function createRuleWatch(): RuleWatch {
  const watch: RuleWatch = {
    maxBulletSpeed: 0,
    maxLanes: 0,
    maxSeparate: 0,
    narrowestGap: Number.POSITIVE_INFINITY,
    narrowestOpen: PLAYFIELD_H,
    violations: [],
    observe: (world) => {
      const speed = maxBulletSpeed(world);
      if (speed > watch.maxBulletSpeed) watch.maxBulletSpeed = speed;
      const gaps = laserLaneGaps(world);
      if (gaps.lanes > watch.maxLanes) watch.maxLanes = gaps.lanes;
      if (gaps.separate > watch.maxSeparate) watch.maxSeparate = gaps.separate;
      if (gaps.narrowestBetween < watch.narrowestGap) watch.narrowestGap = gaps.narrowestBetween;
      if (gaps.lanes > 0 && gaps.widestOpen < watch.narrowestOpen) {
        watch.narrowestOpen = gaps.widestOpen;
      }
      const broken: string[] = [];
      if (speed > MAX_AIMED_BULLET_SPEED + 1e-9) broken.push(`bullet at ${speed.toFixed(3)}`);
      if (gaps.narrowestBetween < MIN_LANE_GAP) {
        broken.push(`lane gap ${gaps.narrowestBetween.toFixed(1)}`);
      }
      if (gaps.lanes > 0 && gaps.widestOpen < MIN_LANE_GAP) {
        broken.push(`widest open band ${gaps.widestOpen.toFixed(1)}`);
      }
      if (broken.length > 0 && watch.violations.length < 20) {
        watch.violations.push(`tick ${String(world.tick)}: ${broken.join(', ')}`);
      }
    },
  };
  return watch;
}
