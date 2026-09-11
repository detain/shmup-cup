/**
 * # math — deterministic math: binary angles, lookup tables, easing
 *
 * **Responsibility.** Engine-independent math for the simulation. Angles are *binary
 * angles*: {@link ANGLE_UNITS} = 1024 steps per turn, 0 = +x, increasing **clockwise on
 * screen** (world y points down). Sine and cosine come from the committed
 * {@link SIN_TABLE_Q16} and `atan2` from the committed {@link ATAN_TABLE}, because
 * `Math.sin` / `Math.cos` / `Math.atan2` may round differently between JS engines
 * (Chromium 69 on the TV vs. desktop Chrome, Electron or Node) and would desynchronise
 * replays. Those `Math` members are lint errors inside `packages/core`; so is `**`.
 *
 * Positions stay IEEE `number` (float64): `+ − × ÷` and `Math.sqrt` are exactly specified
 * by IEEE 754, so they are deterministic across engines. The 16.16 fixed-point helpers the
 * skeleton planned were therefore **dropped** — they would cost precision and speed
 * without buying determinism (shmup_plan.md M1-01).
 *
 * Nothing here allocates: every function takes and returns numbers, and the two lookup
 * tables are converted to `Float64Array`s once, at module load.
 *
 * **Implements.**
 * - shmup_feat.md §22 Determinism — sin/cos lookup tables with binary angles, table-based atan2
 * - shmup_feat.md §12 — aimed bullets quantised to 16 or 32 directions
 * - shmup_tech.md §4.6 — Penner-style easing, evaluated per tick (no time-based tweens)
 *
 * **Public API (implemented now).** {@link ANGLE_UNITS}, {@link ANGLE_MASK},
 * {@link ANGLE_QUARTER}, {@link BinaryAngle}, {@link sinB}, {@link cosB}, {@link atan2B},
 * {@link wrapAngle}, {@link quantizeAngle}, {@link angleDelta}, {@link turnToward},
 * {@link clamp}, {@link lerp}, {@link approach}, {@link EasingFn}, {@link EasingName},
 * {@link EASINGS}. The raw table data (`SIN_TABLE_Q16`, `ATAN_TABLE`, `TRIG_SCALE`,
 * `ATAN_TABLE_STEPS`) stays in `./trig-table.js`; the package entry re-exports it from
 * there for tests and tools, not for gameplay code — call the functions above instead.
 *
 * **Planned API (later steps).** Curve sampling helpers for camera paths (M1-07) and a
 * `distance`/`lengthSq` pair if profiling shows call sites want them.
 *
 * @module
 */
import { defineModule } from '../module-info.js';
import {
  ANGLE_MASK,
  ANGLE_QUARTER,
  ANGLE_UNITS,
  ATAN_TABLE,
  ATAN_TABLE_STEPS,
  SIN_TABLE_Q16,
  TRIG_SCALE,
} from './trig-table.js';

export { ANGLE_MASK, ANGLE_QUARTER, ANGLE_UNITS } from './trig-table.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'math',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §12', 'shmup_tech.md §4.6'],
});

/**
 * Angle in binary units: 0 = +x (right), increasing clockwise on screen (y down),
 * one turn = {@link ANGLE_UNITS}. Always an integer; values outside `[0, 1024)` are
 * wrapped by the functions that consume them.
 */
export type BinaryAngle = number;

/** Half a turn in binary units. */
const ANGLE_HALF = ANGLE_UNITS / 2;

/**
 * {@link SIN_TABLE_Q16} divided by {@link TRIG_SCALE}, built once at module load.
 * Dividing by a power of two is exact in IEEE 754, so this conversion adds no error.
 */
const SIN_TABLE = new Float64Array(SIN_TABLE_Q16.length);
for (let i = 0; i < SIN_TABLE_Q16.length; i += 1) {
  SIN_TABLE[i] = SIN_TABLE_Q16[i] / TRIG_SCALE;
}

/**
 * Sine of a binary angle.
 *
 * @param a - Angle in binary units (any integer; wrapped internally).
 * @returns `sin(2π·a / 1024)`, within 7.7e-6 of the real value.
 */
export function sinB(a: BinaryAngle): number {
  return SIN_TABLE[a & ANGLE_MASK];
}

/**
 * Cosine of a binary angle.
 *
 * @param a - Angle in binary units (any integer; wrapped internally).
 * @returns `cos(2π·a / 1024)`, within 7.7e-6 of the real value.
 *
 * @remarks
 * Reads the quarter-turn overhang of {@link SIN_TABLE_Q16}, so it costs one add more
 * than {@link sinB} and never wraps twice.
 */
export function cosB(a: BinaryAngle): number {
  return SIN_TABLE[(a & ANGLE_MASK) + ANGLE_QUARTER];
}

/**
 * Direction of the vector `(dx, dy)` as a binary angle — the deterministic replacement
 * for `Math.atan2`.
 *
 * @param dy - Vertical component (screen/world y, pointing down).
 * @param dx - Horizontal component.
 * @returns The angle in `[0, 1024)`, within ±1 unit of the exact value; `0` for the
 *   zero vector.
 *
 * @remarks
 * Reduces the vector to one octant, looks the slope up in {@link ATAN_TABLE} and mirrors
 * the result back. Argument order mirrors `Math.atan2(y, x)`.
 *
 * @example
 * ```ts
 * atan2B(0, 1);  // → 0    (right)
 * atan2B(1, 0);  // → 256  (down — a quarter turn clockwise)
 * ```
 */
export function atan2B(dy: number, dx: number): BinaryAngle {
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  if (ax === 0 && ay === 0) return 0;
  let angle =
    ay <= ax
      ? ATAN_TABLE[Math.round((ay / ax) * ATAN_TABLE_STEPS)]
      : ANGLE_QUARTER - ATAN_TABLE[Math.round((ax / ay) * ATAN_TABLE_STEPS)];
  if (dx < 0) angle = ANGLE_HALF - angle;
  if (dy < 0) angle = -angle;
  return angle & ANGLE_MASK;
}

/**
 * Wraps an angle into `[0, 1024)`.
 *
 * @param a - Angle in binary units (any integer, positive or negative).
 * @returns The equivalent angle in `[0, 1024)`.
 */
export function wrapAngle(a: BinaryAngle): BinaryAngle {
  return a & ANGLE_MASK;
}

/**
 * Snaps an angle to one of `directions` evenly spaced headings — the retro "aimed shots
 * come in 16 or 32 flavours" look (shmup_feat.md §12).
 *
 * @param a - Angle in binary units.
 * @param directions - How many directions to snap to; must divide 1024 (4, 8, 16, 32 …).
 * @returns The nearest multiple of `1024 / directions`, wrapped into `[0, 1024)`.
 *
 * @remarks
 * Ties round away from zero (`Math.round`), which is stable across engines.
 */
export function quantizeAngle(a: BinaryAngle, directions: number): BinaryAngle {
  const step = ANGLE_UNITS / directions;
  return (Math.round((a & ANGLE_MASK) / step) * step) & ANGLE_MASK;
}

/**
 * Signed shortest rotation from one angle to another.
 *
 * @param from - Start angle in binary units.
 * @param to - Target angle in binary units.
 * @returns A value in `[-512, 512)`: positive turns clockwise on screen.
 */
export function angleDelta(from: BinaryAngle, to: BinaryAngle): number {
  return ((to - from + ANGLE_HALF) & ANGLE_MASK) - ANGLE_HALF;
}

/**
 * Rotates an angle towards a target by at most `maxStep` units — the homing primitive
 * used by aimed enemies and missiles.
 *
 * @param from - Current angle in binary units.
 * @param to - Target angle in binary units.
 * @param maxStep - Maximum rotation this call may apply (≥ 0, in binary units).
 * @returns The new angle in `[0, 1024)`; equals `to` once the target is within reach.
 */
export function turnToward(from: BinaryAngle, to: BinaryAngle, maxStep: number): BinaryAngle {
  const delta = angleDelta(from, to);
  if (delta > maxStep) return (from + maxStep) & ANGLE_MASK;
  if (delta < -maxStep) return (from - maxStep) & ANGLE_MASK;
  return to & ANGLE_MASK;
}

/**
 * Clamps a value into a range.
 *
 * @param value - Value to clamp.
 * @param min - Lower bound (inclusive).
 * @param max - Upper bound (inclusive; must be ≥ `min`).
 * @returns `value` limited to `[min, max]`.
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Linear interpolation.
 *
 * @param from - Value at `t = 0`.
 * @param to - Value at `t = 1`.
 * @param t - Interpolation factor (not clamped).
 * @returns `from + (to - from) · t`.
 */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Moves a value towards a target by a fixed amount per call, without overshooting —
 * the per-tick alternative to time-based tweens.
 *
 * @param value - Current value.
 * @param target - Value to approach.
 * @param step - Maximum change per call (≥ 0).
 * @returns The new value; exactly `target` once it is within `step`.
 */
export function approach(value: number, target: number, step: number): number {
  if (value < target) return value + step < target ? value + step : target;
  if (value > target) return value - step > target ? value - step : target;
  return target;
}

/** An easing curve: takes and returns a normalised progress in 0…1. */
export type EasingFn = (t: number) => number;

/** Name of an easing curve in {@link EASINGS}. */
export type EasingName =
  | 'linear'
  | 'inQuad'
  | 'outQuad'
  | 'inOutQuad'
  | 'inCubic'
  | 'outCubic'
  | 'inOutCubic'
  | 'inOutSine';

/**
 * Easing curves for deterministic motion (camera moves, boss entrances, UI slides).
 *
 * @remarks
 * All curves are polynomial except `inOutSine`, which uses {@link cosB} so it stays
 * table-driven; every curve maps 0 → 0 and 1 → 1. Inputs are **not** clamped: pass a
 * progress you already limited to 0…1 (`clamp(tick / duration, 0, 1)`).
 * Referenced from content by {@link EasingName}, resolved to a function once at load.
 */
export const EASINGS: Readonly<Record<EasingName, EasingFn>> = Object.freeze({
  /**
   * No easing.
   *
   * @param t - Progress 0…1.
   * @returns `t`.
   */
  linear: (t: number): number => t,
  /**
   * Quadratic ease-in.
   *
   * @param t - Progress 0…1.
   * @returns `t²`.
   */
  inQuad: (t: number): number => t * t,
  /**
   * Quadratic ease-out.
   *
   * @param t - Progress 0…1.
   * @returns `1 - (1 - t)²`.
   */
  outQuad: (t: number): number => t * (2 - t),
  /**
   * Quadratic ease-in-out.
   *
   * @param t - Progress 0…1.
   * @returns The eased progress.
   */
  inOutQuad: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  /**
   * Cubic ease-in.
   *
   * @param t - Progress 0…1.
   * @returns `t³`.
   */
  inCubic: (t: number): number => t * t * t,
  /**
   * Cubic ease-out.
   *
   * @param t - Progress 0…1.
   * @returns `1 - (1 - t)³`.
   */
  outCubic: (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t),
  /**
   * Cubic ease-in-out.
   *
   * @param t - Progress 0…1.
   * @returns The eased progress.
   */
  inOutCubic: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t),
  /**
   * Sinusoidal ease-in-out, sampled from the committed sine table.
   *
   * @param t - Progress 0…1.
   * @returns `(1 - cos(π·t)) / 2`, quantised to the table's half-turn resolution.
   */
  inOutSine: (t: number): number => 0.5 - 0.5 * cosB(Math.round(t * ANGLE_HALF)),
});
