/**
 * # patterns — behaviour coroutines, movers and attack patterns
 *
 * **Status: implemented.** The script runner and the movers (plan M1-08), the fire primitives
 * (plan M1-09) and the BulletML-inspired pattern DSL with its interpreter (plan M2-02).
 *
 * **Responsibility.** Scripting for enemy/boss behaviour and bullet patterns, split the way
 * decision D29 describes:
 *
 * - **Coroutines** ({@link Script}) decide *what* an enemy does: TypeScript generators
 *   (`function* () { … yield 30; … }` — generators work back to Chrome 39) that **sleep by
 *   yielding a tick count**. The runner ({@link resumeScript}) stores `wakeTick = tick + yielded`
 *   and calls `next()` only on the tick the script wakes — a sleeping script costs one
 *   comparison per tick.
 * - **Movers** decide *how* it moves every tick, with no generator involved: a numeric
 *   {@link MoverKind} plus six parameters and four state slots on the body ({@link MoverBody}),
 *   advanced by {@link updateMover}. Scripts switch movers with {@link setMover}.
 *
 * **The movers** (shmup_feat.md §11 "movement primitives"). Flying bodies ({@link BodyAnchor}
 * `Air`) move in the *view's* frame — the caller adds the camera scroll first, and
 * position-based movers measure from the camera — so a path or a wave keeps its shape on screen
 * while the stage scrolls; ground bodies (`Floor` / `Ceiling`) move in the world.
 *
 * Movers and their parameters `m0…m5`:
 *
 * - `Straight (vx, vy)` — constant velocity.
 * - `Sine (vx, amp, period, phase)` — `x += vx`; `y` = the start line
 *   `+ amp · sin(phase + t · 1024 / period)` (table sine).
 * - `Path (pathId, speed)` — along a baked `content/paths/` spline at constant speed (arc-length
 *   table), translated to start where the mover starts; past the end it continues along the end
 *   tangent.
 * - `Waypoint (x, y, speed, hold, leaveVx, leaveVy)` — fly to view point `(x, y)` at `speed`,
 *   hold `hold` ticks, leave at `(leaveVx, leaveVy)`.
 * - `Follow ()` — replay the formation leader's recorded positions ({@link FollowTrack}) at the
 *   body's own age (members spawned `k · interval` ticks later trail by that much); without data,
 *   keep the last velocity.
 * - `GroundCrawl (speed)` — walk along the floor / ceiling, snapping to the surface with
 *   `findFloor` / `findCeiling` (steps up to {@link CRAWL_STEP} px), turning round at walls,
 *   cliffs and the map edge.
 * - `Homing (speed, turnRate)` — steer towards the target with `turnToward` (whole binary units
 *   per tick).
 * - `AimedDash (speed, windup)` — hold `windup` ticks, aim at the target once (quantised to
 *   {@link AIM_DIRECTIONS}), dash straight.
 *
 * **Fire primitives** (shmup_feat.md §12 "pattern primitives") spawn enemy bullets through a
 * `core/bullets` {@link BulletSystem} from a {@link BulletOrigin} (the enemy `ScriptApi` fills
 * it with the enemy's centre and applies the fire rules). Every speed is multiplied by the
 * rank's `speedScale`; an angle argument may be {@link AIM_AT_TARGET} (at the nearest living
 * player, snapped to `config.aimDirections` — 32 directions, decision D17):
 *
 * - {@link fireAimed} — one bullet at the player;
 * - {@link fireNWay} — `count` bullets `step` units apart, centred on the angle;
 * - {@link fireRing} — `count` bullets evenly round the circle from `offset`;
 * - {@link fireSpiral} — `arms` evenly spaced bullets at a script-held angle; returns the angle
 *   advanced by `step` for the next call;
 * - {@link fireStack} — `count` bullets on one heading at speeds `speed + k · speedStep`;
 * - {@link fireSpray} — `count` bullets at random headings within `spread` and random speeds
 *   (the gameplay RNG — replay-safe);
 * - {@link fireHoming} — one bullet that homes for `lifetime` ticks at `turnRate`;
 * - {@link fireDelayed} — one bullet that waits `delay` ticks, then launches (re-aimed when the
 *   angle is `AIM_AT_TARGET`).
 *
 * {@link rankedWait} scales a fire interval by the rank's fire rate.
 *
 * **The pattern DSL (M2-02).** Bullet patterns authored as data (`content/patterns/`): the format,
 * the expression compiler ({@link compileExpression}) and the pattern compiler
 * ({@link compilePatternBank}, run by `core/data`'s loader) are in `./dsl.ts`; every action becomes
 * a stack-machine program in one `Float64Array` ({@link PatternBank}). {@link createPatternVm}
 * builds a World's interpreter ({@link PatternVm}): enemy behaviours start and step an emitter
 * (`ScriptApi.startPattern` / `stepPattern` — the yielded `wait` is the coroutine's sleep, so the
 * script runner steps the interpreter), and bullets fired with `actions` run their own programs
 * inside the bullet update (`BulletSystem.setProgramRunner`). Zero allocation: typed-array state,
 * a preallocated expression stack, no `eval`.
 *
 * **Zero allocation.** Movers only read typed arrays (the baked path tables, the collision map,
 * the sine table) and write numbers; the terrain queries get whole pixels (V8 boxes fractional
 * arguments of calls it does not inline). Resuming a generator allocates its `{ value, done }`
 * result in V8 (≈ 40 bytes) — the reason scripts sleep instead of being resumed every tick.
 *
 * **Implements.**
 * - shmup_feat.md §11 — movement primitives, coroutine AI scripts
 * - shmup_feat.md §12 — pattern primitives and the BulletML-inspired DSL (M1-09, M2-02)
 * - shmup_tech.md §4.6 — TS generator coroutines instead of time-based tweens
 *
 * **Public API.** Scripts: {@link Script}, {@link ScriptHolder}, {@link resumeScript},
 * {@link SLEEP_FOREVER}. Movers: {@link MoverKind}, {@link MOVER_NAMES}, {@link moverKindOf},
 * {@link BodyAnchor}, {@link MoverBody}, {@link MoverContext}, {@link createMoverContext},
 * {@link setMover}, {@link updateMover}, {@link FollowTrack}, {@link FOLLOW_HISTORY},
 * {@link samplePath}, {@link CRAWL_STEP}, {@link AIM_DIRECTIONS}. Fire primitives:
 * {@link fireAimed}, {@link fireNWay}, {@link fireRing}, {@link fireSpiral}, {@link fireStack},
 * {@link fireSpray}, {@link fireHoming}, {@link fireDelayed}, {@link rankedWait}. The DSL:
 * {@link createPatternVm}, {@link PatternVm}, {@link PatternHost}, {@link PatternSource},
 * {@link PatternRunners},
 * {@link MAX_PATTERN_EMITTERS}, {@link MAX_BULLET_PROGRAMS}, {@link PATTERN_RUNNERS},
 * {@link PATTERN_STEP_BUDGET}, {@link MAX_PATTERN_WAIT}; from `./dsl.ts` {@link compileExpression},
 * {@link compilePatternBank}, {@link applyExprOp}, {@link PatternBank}, {@link EMPTY_PATTERN_BANK},
 * {@link PATTERNS_FILE_SCHEMA}, {@link CollectedPatterns}, the node types ({@link PatternNode},
 * {@link PatternsFile}, {@link PatternActionEntry}, {@link PatternBulletEntry},
 * {@link PatternBulletSpec}, {@link PatternDirection}, {@link PatternSpeed},
 * {@link PatternSpeedSpec}, {@link PatternExpr}), the codes ({@link PatternOp}, {@link ExprOp},
 * {@link DirType}, {@link SpeedType}, {@link DIRECTION_TYPES}, {@link SPEED_TYPES},
 * {@link ACCEL_HAS_MIN}, {@link ACCEL_HAS_MAX}) and limits ({@link MAX_REPEAT_DEPTH},
 * {@link MAX_EXPR_STACK}, {@link MAX_PATTERN_CODE}, {@link DEFAULT_PATTERN_SPEED},
 * {@link DEFAULT_PATTERN_KIND}).
 *
 * @module
 */
import {
  AIM_AT_TARGET,
  BulletFlag,
  BulletOrigin,
  BulletShot,
  MAX_ENEMY_BULLETS,
  NO_TARGET_ANGLE,
  type BulletProgramRunner,
  type BulletSystem,
} from '../bullets/index.js';
import { findCeiling, findFloor, type TerrainMap } from '../collision/index.js';
import { MOVER_TYPES, PATH_SAMPLE_STEP, type MoverType, type PathSpec } from '../data/index.js';
import {
  ANGLE_MASK,
  ANGLE_QUARTER,
  ANGLE_UNITS,
  atan2B,
  quantizeAngle,
  sinB,
  turnToward,
} from '../math/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../math/trig-table.js';
import { defineModule } from '../module-info.js';
import type { CameraView } from '../presentation/index.js';
import type { Rng } from '../rng/index.js';
import {
  ACCEL_HAS_MAX,
  ACCEL_HAS_MIN,
  DEFAULT_PATTERN_SPEED,
  DirType,
  ExprOp,
  MAX_EXPR_STACK,
  MAX_REPEAT_DEPTH,
  PatternOp,
  SpeedType,
  type PatternBank,
} from './dsl.js';

export {
  ACCEL_HAS_MAX,
  ACCEL_HAS_MIN,
  DEFAULT_PATTERN_KIND,
  DEFAULT_PATTERN_SPEED,
  DIRECTION_TYPES,
  DirType,
  EMPTY_PATTERN_BANK,
  ExprOp,
  MAX_EXPR_STACK,
  MAX_PATTERN_CODE,
  MAX_REPEAT_DEPTH,
  PATTERNS_FILE_SCHEMA,
  PatternOp,
  SPEED_TYPES,
  SpeedType,
  applyExprOp,
  compileExpression,
  compilePatternBank,
  type CollectedPatterns,
  type PatternActionEntry,
  type PatternBank,
  type PatternBulletEntry,
  type PatternBulletSpec,
  type PatternDirection,
  type PatternExpr,
  type PatternNode,
  type PatternSpeed,
  type PatternSpeedSpec,
  type PatternsFile,
} from './dsl.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'patterns',
  status: 'implemented',
  specRefs: ['shmup_feat.md §12', 'shmup_feat.md §11', 'shmup_tech.md §4.6'],
});

// ------------------------------------------------------------------------------ scripts

/**
 * A behaviour coroutine: each `yield` gives the number of ticks to sleep — `yield n` resumes the
 * script `n` ticks later (`0`, `1`, negative or `NaN` = next tick; fractions are floored;
 * {@link SLEEP_FOREVER} = never again). Returning ends the script; the body keeps its mover.
 */
export type Script = Generator<number, void, void>;

/** Yield it to sleep for good (the mover carries on). */
export const SLEEP_FOREVER = Infinity;

/** Something that runs a {@link Script} (an enemy, later a boss). */
export interface ScriptHolder {
  /** The coroutine, or `null` once it returned (or for none). */
  script: Script | null;
  /** First tick on which the script may be resumed again. */
  wakeTick: number;
}

/**
 * Resumes a holder's script if it is due (`wakeTick ≤ tick`) and records when it wakes next.
 *
 * @remarks
 * The only place a script's `next()` is called: a sleeping script is never touched. A finished
 * script is dropped (`script = null`). Exceptions thrown by the script propagate (a behaviour bug
 * must not be swallowed).
 *
 * @param holder - The holder.
 * @param tick - The current tick.
 * @returns `true` when the script was resumed this call.
 *
 * @example
 * ```ts
 * function* blink(): Script { for (;;) { lamp = !lamp; yield 30; } }
 * const holder: ScriptHolder = { script: blink(), wakeTick: 0 };
 * for (let tick = 0; tick < 90; tick++) resumeScript(holder, tick); // resumed at 0, 30, 60
 * ```
 */
export function resumeScript(holder: ScriptHolder, tick: number): boolean {
  const script = holder.script;
  if (script === null || holder.wakeTick > tick) return false;
  const result = script.next();
  if (result.done === true) {
    holder.script = null;
    return true;
  }
  const wait = result.value;
  holder.wakeTick = wait >= 1 ? tick + Math.floor(wait) : tick + 1;
  return true;
}

// ------------------------------------------------------------------------------ movers

/**
 * Mover codes: 0 = none, then {@link MOVER_TYPES} in order (so content names map to codes by
 * position). Append new movers, never renumber (the codes are hashed).
 */
export const MoverKind = {
  /** No motion of its own (a flying body still rides the camera). */
  None: 0,
  /** Constant velocity. */
  Straight: 1,
  /** Horizontal drift + vertical sine wave. */
  Sine: 2,
  /** Arc-length path from `content/paths/`. */
  Path: 3,
  /** Enter → stop → leave. */
  Waypoint: 4,
  /** Replay the formation leader's track. */
  Follow: 5,
  /** Walk along the floor / ceiling. */
  GroundCrawl: 6,
  /** Turn-rate-capped homing. */
  Homing: 7,
  /** Hold, aim once, dash. */
  AimedDash: 8,
} as const;

/** A {@link MoverKind} code. */
export type MoverKind = (typeof MoverKind)[keyof typeof MoverKind];

/** Mover names by code (`none`, then the content names of {@link MOVER_TYPES}). */
export const MOVER_NAMES: readonly string[] = Object.freeze(['none', ...MOVER_TYPES]);

/**
 * The code of a mover's content name (load time: the enemy system compiles spec movers with it).
 *
 * @param type - A {@link MoverType}.
 * @returns Its {@link MoverKind}.
 *
 * @example
 * ```ts
 * moverKindOf('groundCrawl'); // → MoverKind.GroundCrawl (6)
 * ```
 */
export function moverKindOf(type: MoverType): MoverKind {
  return ((MOVER_TYPES as readonly string[]).indexOf(type) + 1) as MoverKind;
}

/** How a body is anchored: flying bodies move in the view's frame, ground bodies in the world. */
export const BodyAnchor = {
  /** Flying: rides the camera scroll. */
  Air: 0,
  /** Stands on the floor (its bottom edge on the surface). */
  Floor: 1,
  /** Hangs from the ceiling (its top edge on the surface). */
  Ceiling: 2,
} as const;

/** A {@link BodyAnchor} code. */
export type BodyAnchor = (typeof BodyAnchor)[keyof typeof BodyAnchor];

/**
 * Aimed movers snap their heading to this many directions (decision D17, retro feel).
 *
 * @remarks
 * A constant for the `AimedDash` mover only. Aimed *bullets* (the fire primitives, `core/bullets`
 * `AIM_AT_TARGET`) snap to the session's `GameConfig.aimDirections` instead (default 32 too), so
 * a difficulty preset can change them without touching enemy movement.
 */
export const AIM_DIRECTIONS = 32;

/** Highest step (up or down, in pixels) a crawler takes in one tick before it turns round. */
export const CRAWL_STEP = 8;

/** Ticks of leader history a {@link FollowTrack} keeps: followers may trail by at most this. */
export const FOLLOW_HISTORY = 256;

/**
 * The recorded path of a formation leader, in the leader's frame (view-relative for flying
 * leaders): entry `age` is where the leader was `age` ticks after it spawned. A ring buffer of
 * {@link FOLLOW_HISTORY} entries; a class so its fields keep one hidden class.
 *
 * @remarks
 * A `Follow` body of age `a` stands where the leader stood at age `a`; members spawned
 * `k · interval` ticks after the leader therefore trail it by exactly that many ticks, at most
 * {@link FOLLOW_HISTORY} − 1 (older entries are overwritten — the follower then keeps its last
 * velocity).
 *
 * @example
 * ```ts
 * const track = new FollowTrack();
 * track.record(0, 400, 60); // the leader at spawn
 * track.record(1, 398.5, 60);
 * track.has(1); // → true: a follower aged 1 moves to (398.5, 60) + the camera
 * ```
 */
export class FollowTrack {
  /** X per age (ring). */
  readonly x = new Float64Array(FOLLOW_HISTORY);
  /** Y per age (ring). */
  readonly y = new Float64Array(FOLLOW_HISTORY);
  /** Entries recorded so far (the leader's age + 1 while it records). */
  recorded = 0;

  /**
   * Records the leader's position at an age (ages must be recorded in order: 0, 1, 2 …).
   *
   * @param age - The leader's age.
   * @param x - X in the leader's frame.
   * @param y - Y in the leader's frame.
   */
  record(age: number, x: number, y: number): void {
    const slot = age % FOLLOW_HISTORY;
    this.x[slot] = x;
    this.y[slot] = y;
    if (age + 1 > this.recorded) this.recorded = age + 1;
  }

  /**
   * Whether the entry for an age is recorded and not yet overwritten.
   *
   * @param age - A follower's age.
   * @returns `true` when {@link FollowTrack.x} / {@link FollowTrack.y} hold that age.
   */
  has(age: number): boolean {
    return age >= 0 && age < this.recorded && this.recorded - age <= FOLLOW_HISTORY;
  }

  /** Forgets everything (the formation slot is reused). */
  reset(): void {
    this.recorded = 0;
  }
}

/**
 * The fields a mover reads and writes (the enemy object implements it). Movers keep all their
 * state in these numeric fields, so bodies stay monomorphic class instances.
 */
export interface MoverBody {
  /** World x of the centre. */
  x: number;
  /** World y of the centre. */
  y: number;
  /** Velocity of the last mover step in the body's frame (px/tick). */
  vx: number;
  /** Velocity of the last mover step in the body's frame (px/tick). */
  vy: number;
  /** Half height (crawlers keep their bottom / top edge on the surface). */
  readonly hh: number;
  /** {@link BodyAnchor} code. */
  anchor: number;
  /** Ticks since the body spawned (followers read the leader's track at this age). */
  age: number;
  /** {@link MoverKind} code. */
  mover: number;
  /** Mover parameter 0. */
  m0: number;
  /** Mover parameter 1. */
  m1: number;
  /** Mover parameter 2. */
  m2: number;
  /** Mover parameter 3. */
  m3: number;
  /** Mover parameter 4. */
  m4: number;
  /** Mover parameter 5. */
  m5: number;
  /** Mover state 0. */
  s0: number;
  /** Mover state 1. */
  s1: number;
  /** Mover state 2. */
  s2: number;
  /** Mover state 3. */
  s3: number;
  /** Ticks the current mover has run. */
  moverTicks: number;
  /** The formation track a `Follow` mover replays, or `null`. */
  track: FollowTrack | null;
}

/**
 * What movers read besides the body: the camera, the terrain, the baked paths and the current
 * target. One per system, reused every tick (the caller sets the target per body).
 */
export interface MoverContext {
  /** The camera (flying bodies' frame). */
  readonly camera: CameraView;
  /** The stage's collision map, or `null` in open space (crawlers then walk a straight line). */
  terrain: TerrainMap | null;
  /** Baked paths by `ContentDb.paths` index. */
  readonly paths: readonly PathSpec[];
  /** World x of the target (nearest player) — valid when {@link MoverContext.hasTarget}. */
  targetX: number;
  /** World y of the target. */
  targetY: number;
  /** Whether there is a target (a living player). */
  hasTarget: boolean;
}

/** The {@link MoverContext} class (its own hidden class keeps the numeric fields unboxed). */
class MoverContextImpl implements MoverContext {
  /** See {@link MoverContext.camera}. */
  readonly camera: CameraView;
  /** See {@link MoverContext.terrain}. */
  terrain: TerrainMap | null;
  /** See {@link MoverContext.paths}. */
  readonly paths: readonly PathSpec[];
  /** See {@link MoverContext.targetX}. */
  targetX = 0;
  /** See {@link MoverContext.targetY}. */
  targetY = 0;
  /** See {@link MoverContext.hasTarget}. */
  hasTarget = false;

  /**
   * Creates the context (see {@link createMoverContext}).
   *
   * @param camera - The camera.
   * @param terrain - The collision map or `null`.
   * @param paths - The baked paths.
   */
  constructor(camera: CameraView, terrain: TerrainMap | null, paths: readonly PathSpec[]) {
    this.camera = camera;
    this.terrain = terrain;
    this.paths = paths;
  }
}

/**
 * Creates a mover context (load time).
 *
 * @param camera - The camera flying bodies ride.
 * @param terrain - The stage's collision map, or `null`.
 * @param paths - The content's baked paths (`ContentDb.paths`).
 * @returns The context (no target yet).
 *
 * @example
 * ```ts
 * const ctx = createMoverContext(world.camera, world.terrain, db.paths);
 * ```
 */
export function createMoverContext(
  camera: CameraView,
  terrain: TerrainMap | null,
  paths: readonly PathSpec[],
): MoverContext {
  return new MoverContextImpl(camera, terrain, paths);
}

/*
 * Hot-path rule for the movers below: no call takes or returns a fractional number. V8 boxes a
 * fractional argument or return value of a call it does not inline into a 16-byte heap number,
 * and the inlining budget of the big per-tick loops runs out — so the frame origin is computed
 * inline (`camera.x · air`, 1 for flying bodies, 0 for ground ones: both arms a product), sines
 * come straight from the committed table (`SIN_TABLE_Q16[a] / TRIG_SCALE`, bit-identical to
 * `sinB` / `cosB`) and `atan2B` gets whole numbers (see `aimFrom`). Aiming at the target goes
 * through `aimAtTarget`, which reads the target's (fractional) coordinates itself rather than
 * taking them as arguments.
 */

/**
 * 1 for a flying body (its frame is the camera), 0 for a ground body (the world).
 *
 * @param body - The body.
 * @returns The frame factor (a small integer — never boxed).
 */
function airFactor(body: MoverBody): number {
  return body.anchor === BodyAnchor.Air ? 1 : 0;
}

/**
 * A baked path's position at an arc length (relative to its first point), beyond the end
 * continued along the end tangent. Writes into `out` (no allocation).
 *
 * @param path - The path.
 * @param distance - Arc length in pixels (negative counts as 0).
 * @param out - Receives `x` at index 0 and `y` at index 1.
 *
 * @example
 * ```ts
 * const at = new Float64Array(2);
 * samplePath(db.paths[0], 50, at); // at[0], at[1] = 50 px along the curve
 * ```
 */
export function samplePath(path: PathSpec, distance: number, out: Float64Array): void {
  const table = path.table;
  const samples = table.samples;
  const last = table.count - 1;
  const d = distance > 0 ? distance : 0;
  if (d >= table.length) {
    const over = d - table.length;
    out[0] = samples[2 * last] + table.endDx * over;
    out[1] = samples[2 * last + 1] + table.endDy * over;
    return;
  }
  let i = Math.floor(d / PATH_SAMPLE_STEP);
  if (i >= last) i = last - 1;
  const start = i * PATH_SAMPLE_STEP;
  const end = i + 1 === last ? table.length : start + PATH_SAMPLE_STEP;
  const f = end > start ? (d - start) / (end - start) : 0;
  out[0] = samples[2 * i] + (samples[2 * i + 2] - samples[2 * i]) * f;
  out[1] = samples[2 * i + 1] + (samples[2 * i + 3] - samples[2 * i + 1]) * f;
}

/**
 * Sub-pixel scale of the vectors handed to `atan2B` from per-tick code: the components are
 * turned into whole numbers (`(d · AIM_SCALE) | 0`) first, because V8 boxes a fractional argument
 * of a call it does not inline into a 16-byte heap number — an allocation per call.
 */
const AIM_SCALE = 64;

/**
 * Direction from one point to another as a binary angle, from whole-number components (see
 * {@link AIM_SCALE}; 1/64-px resolution, far below one binary unit at any useful distance).
 *
 * @param body - The body (the origin).
 * @param tx - Target x.
 * @param ty - Target y.
 * @returns The angle in `[0, 1024)`.
 */
function aimFrom(body: MoverBody, tx: number, ty: number): number {
  return atan2B(((ty - body.y) * AIM_SCALE) | 0, ((tx - body.x) * AIM_SCALE) | 0);
}

/**
 * Direction from a body to the context's target — `aimFrom(body, ctx.targetX, ctx.targetY)`,
 * bit for bit — for per-tick movers. It takes objects only: the target's coordinates are
 * fractional (the ship moves in sub-pixels), and passing them to `aimFrom` boxed two heap numbers
 * per homing body per tick whenever V8 did not inline the call (the 64-enemy allocation guard
 * caught ~128 bytes per tick in some runs).
 *
 * @param body - The body (the origin).
 * @param ctx - The context (its `targetX` / `targetY`).
 * @returns The angle in `[0, 1024)`.
 */
function aimAtTarget(body: MoverBody, ctx: MoverContext): number {
  return atan2B(((ctx.targetY - body.y) * AIM_SCALE) | 0, ((ctx.targetX - body.x) * AIM_SCALE) | 0);
}

/**
 * Switches a body to a mover, keeping its position continuous (position-based movers measure
 * from where the body is now). Never allocates.
 *
 * @remarks
 * Parameters by kind are listed in the module docs. `Sine` starts its wave at the body's current
 * height (the line it oscillates around is chosen so the first step does not jump), `Path` is
 * translated to start at the body, `Homing` starts from the current heading (left when the body
 * is at rest), `Straight` / `GroundCrawl` set the velocity at once.
 *
 * @param body - The body.
 * @param ctx - The context (the camera, for flying bodies' frame).
 * @param kind - The {@link MoverKind}.
 * @param p0 - Parameter 0.
 * @param p1 - Parameter 1.
 * @param p2 - Parameter 2.
 * @param p3 - Parameter 3.
 * @param p4 - Parameter 4.
 * @param p5 - Parameter 5.
 *
 * @example
 * ```ts
 * setMover(enemy, ctx, MoverKind.Sine, -1.25, 24, 90, 0); // drift left on a 24-px wave
 * ```
 */
export function setMover(
  body: MoverBody,
  ctx: MoverContext,
  kind: number,
  p0 = 0,
  p1 = 0,
  p2 = 0,
  p3 = 0,
  p4 = 0,
  p5 = 0,
): void {
  body.mover = kind;
  body.m0 = p0;
  body.m1 = p1;
  body.m2 = p2;
  body.m3 = p3;
  body.m4 = p4;
  body.m5 = p5;
  body.s0 = 0;
  body.s1 = 0;
  body.s2 = 0;
  body.s3 = 0;
  body.moverTicks = 0;
  const air = airFactor(body);
  const fx = ctx.camera.x * air;
  const fy = ctx.camera.y * air;
  switch (kind) {
    case MoverKind.None:
      body.vx = 0;
      body.vy = 0;
      break;
    case MoverKind.Straight:
      body.vx = p0;
      body.vy = p1;
      break;
    case MoverKind.Sine:
      body.s0 = body.y - fy - p1 * sinB(Math.floor(p3));
      break;
    case MoverKind.Path:
      body.s1 = body.x - fx;
      body.s2 = body.y - fy;
      break;
    case MoverKind.GroundCrawl:
      body.vx = p0;
      body.vy = 0;
      break;
    case MoverKind.Homing:
      body.s0 =
        body.vx !== 0 || body.vy !== 0
          ? aimFrom(body, body.x + body.vx, body.y + body.vy)
          : ANGLE_UNITS / 2;
      break;
    default:
      break;
  }
}

/**
 * Advances a body's mover by one tick (tick phase 5). Flying bodies must already have ridden the
 * camera scroll this tick (`x += camera.dx`, `y += camera.dy`); `age` must already count this
 * tick (followers read the track at it). Never allocates.
 *
 * @param body - The body.
 * @param ctx - The context (camera, terrain, paths, target).
 *
 * @example
 * ```ts
 * ctx.targetX = ship.x; ctx.targetY = ship.y; ctx.hasTarget = true;
 * updateMover(enemy, ctx);
 * ```
 */
export function updateMover(body: MoverBody, ctx: MoverContext): void {
  body.moverTicks++;
  switch (body.mover) {
    case MoverKind.Straight:
      body.x += body.vx;
      body.y += body.vy;
      return;
    case MoverKind.Sine:
      moveSine(body, ctx);
      return;
    case MoverKind.Path:
      movePath(body, ctx);
      return;
    case MoverKind.Waypoint:
      moveWaypoint(body, ctx);
      return;
    case MoverKind.Follow:
      moveFollow(body, ctx);
      return;
    case MoverKind.GroundCrawl:
      moveCrawl(body, ctx);
      return;
    case MoverKind.Homing:
      moveHoming(body, ctx);
      return;
    case MoverKind.AimedDash:
      moveAimedDash(body, ctx);
      return;
    default:
      body.vx = 0;
      body.vy = 0;
  }
}

/**
 * `Sine`: `x += vx`, `y` on the wave around the start line (`s0`, frame-relative).
 *
 * @param body - The body.
 * @param ctx - The context.
 */
function moveSine(body: MoverBody, ctx: MoverContext): void {
  const angle = Math.floor(body.m3 + (body.moverTicks * ANGLE_UNITS) / body.m2) & ANGLE_MASK;
  const sine = SIN_TABLE_Q16[angle] / TRIG_SCALE;
  const y = ctx.camera.y * airFactor(body) + body.s0 + body.m1 * sine;
  body.vx = body.m0;
  body.vy = y - body.y;
  body.x += body.vx;
  body.y = y;
}

/**
 * `Path`: advance `s0` by the speed and place the body on the translated curve.
 *
 * @param body - The body.
 * @param ctx - The context.
 */
function movePath(body: MoverBody, ctx: MoverContext): void {
  const index = body.m0;
  if (!(index >= 0 && index < ctx.paths.length)) {
    body.vx = 0;
    body.vy = 0;
    return;
  }
  const distance = body.s0 + body.m1;
  body.s0 = distance;
  // `samplePath` inlined: the arc length is fractional, and a fractional argument of a call V8
  // does not inline is boxed into a heap number (an allocation per tick).
  const table = ctx.paths[index].table;
  const samples = table.samples;
  const last = table.count - 1;
  let px: number;
  let py: number;
  if (distance >= table.length) {
    const over = distance - table.length;
    px = samples[2 * last] + table.endDx * over;
    py = samples[2 * last + 1] + table.endDy * over;
  } else {
    const d = distance > 0 ? distance : 0;
    let i = Math.floor(d / PATH_SAMPLE_STEP);
    if (i >= last) i = last - 1;
    const start = i * PATH_SAMPLE_STEP;
    const end = i + 1 === last ? table.length : start + PATH_SAMPLE_STEP;
    const f = end > start ? (d - start) / (end - start) : 0;
    px = samples[2 * i] + (samples[2 * i + 2] - samples[2 * i]) * f;
    py = samples[2 * i + 1] + (samples[2 * i + 3] - samples[2 * i + 1]) * f;
  }
  const air = airFactor(body);
  const x = ctx.camera.x * air + body.s1 + px;
  const y = ctx.camera.y * air + body.s2 + py;
  body.vx = x - body.x;
  body.vy = y - body.y;
  body.x = x;
  body.y = y;
}

/**
 * `Waypoint`: phase `s0` 0 = approach the view point, 1 = hold (`s1` counts), 2 = leave.
 *
 * @param body - The body.
 * @param ctx - The context.
 */
function moveWaypoint(body: MoverBody, ctx: MoverContext): void {
  if (body.s0 === 0) {
    const air = airFactor(body);
    const tx = ctx.camera.x * air + body.m0;
    const ty = ctx.camera.y * air + body.m1;
    const dx = tx - body.x;
    const dy = ty - body.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = body.m2;
    if (distance <= speed) {
      body.vx = dx;
      body.vy = dy;
      body.x = tx;
      body.y = ty;
      // Every hold tick is a tick in phase 1, so `hold` 0 skips it (leaves on the next tick).
      body.s0 = body.m3 > 0 ? 1 : 2;
      body.s1 = 0;
      return;
    }
    body.vx = (dx / distance) * speed;
    body.vy = (dy / distance) * speed;
    body.x += body.vx;
    body.y += body.vy;
    return;
  }
  if (body.s0 === 1) {
    body.vx = 0;
    body.vy = 0;
    body.s1++;
    if (body.s1 >= body.m3) body.s0 = 2;
    return;
  }
  body.vx = body.m4;
  body.vy = body.m5;
  body.x += body.vx;
  body.y += body.vy;
}

/**
 * `Follow`: the leader's track at the body's age, else the last velocity.
 *
 * @param body - The body.
 * @param ctx - The context.
 */
function moveFollow(body: MoverBody, ctx: MoverContext): void {
  const track = body.track;
  const age = body.age;
  if (track !== null && track.has(age)) {
    const slot = age % FOLLOW_HISTORY;
    const air = airFactor(body);
    const x = ctx.camera.x * air + track.x[slot];
    const y = ctx.camera.y * air + track.y[slot];
    body.vx = x - body.x;
    body.vy = y - body.y;
    body.x = x;
    body.y = y;
    return;
  }
  body.x += body.vx;
  body.y += body.vy;
}

/**
 * `GroundCrawl`: walk `vx` along the surface; turn round at walls, cliffs and the map edge. A
 * flying body (or open space) just moves horizontally.
 *
 * @param body - The body.
 * @param ctx - The context.
 */
function moveCrawl(body: MoverBody, ctx: MoverContext): void {
  const map = ctx.terrain;
  const nx = body.x + body.vx;
  if (map === null || body.anchor === BodyAnchor.Air) {
    body.vy = 0;
    body.x = nx;
    return;
  }
  const px = Math.floor(nx);
  if (body.anchor === BodyAnchor.Floor) {
    // Scan rows foot − STEP − 1 … foot + STEP: a surface at the first row is a wall.
    const top = Math.floor(body.y + body.hh) - CRAWL_STEP - 1;
    const surface = findFloor(map, px, top, 2 * CRAWL_STEP + 1);
    // NaN: a cliff deeper than the step (or the map edge); `top`: a wall higher than the step.
    if (!(surface > top)) {
      body.vx = -body.vx;
      body.vy = 0;
      return;
    }
    const y = surface - body.hh;
    body.vy = y - body.y;
    body.x = nx;
    body.y = y;
    return;
  }
  // Surfaces head − STEP … head + STEP; the start row itself being rock (→ bottom + 1) is a wall.
  const bottom = Math.floor(body.y - body.hh) + CRAWL_STEP;
  const surface = findCeiling(map, px, bottom, 2 * CRAWL_STEP);
  if (!(surface <= bottom)) {
    body.vx = -body.vx;
    body.vy = 0;
    return;
  }
  const y = surface + body.hh;
  body.vy = y - body.y;
  body.x = nx;
  body.y = y;
}

/**
 * `Homing`: turn the heading (`s0`) towards the target by at most `turnRate`, move at `speed`.
 *
 * @param body - The body.
 * @param ctx - The context.
 */
function moveHoming(body: MoverBody, ctx: MoverContext): void {
  if (ctx.hasTarget) {
    body.s0 = turnToward(body.s0, aimAtTarget(body, ctx), body.m1);
  }
  const speed = body.m0;
  const angle = body.s0 & ANGLE_MASK;
  body.vx = (SIN_TABLE_Q16[angle + ANGLE_QUARTER] / TRIG_SCALE) * speed;
  body.vy = (SIN_TABLE_Q16[angle] / TRIG_SCALE) * speed;
  body.x += body.vx;
  body.y += body.vy;
}

/**
 * `AimedDash`: hold for `windup` ticks, then aim once (`s0` = 1, heading `s1`) and dash.
 *
 * @param body - The body.
 * @param ctx - The context.
 */
function moveAimedDash(body: MoverBody, ctx: MoverContext): void {
  if (body.moverTicks <= body.m1) {
    body.vx = 0;
    body.vy = 0;
    return;
  }
  if (body.s0 === 0) {
    body.s0 = 1;
    body.s1 = ctx.hasTarget
      ? quantizeAngle(aimAtTarget(body, ctx), AIM_DIRECTIONS)
      : ANGLE_UNITS / 2;
  }
  const speed = body.m0;
  const angle = body.s1 & ANGLE_MASK;
  body.vx = (SIN_TABLE_Q16[angle + ANGLE_QUARTER] / TRIG_SCALE) * speed;
  body.vy = (SIN_TABLE_Q16[angle] / TRIG_SCALE) * speed;
  body.x += body.vx;
  body.y += body.vy;
}

// ------------------------------------------------------------------------------ fire primitives

/*
 * The primitives run when a script wakes (not per tick), so a fractional speed argument boxed by
 * a call V8 does not inline costs a few bytes per volley at most; they take no object literals,
 * arrays or closures.
 */

/**
 * An angle argument resolved: {@link AIM_AT_TARGET} → the quantised aim from the origin.
 *
 * @param bullets - The bullet system.
 * @param origin - The origin.
 * @param angle - Angle or `AIM_AT_TARGET`.
 * @returns The angle.
 */
function resolveAngle(bullets: BulletSystem, origin: BulletOrigin, angle: number): number {
  return angle === AIM_AT_TARGET ? bullets.aimFrom(origin) : angle;
}

/**
 * A count argument as a whole number ≥ 0.
 *
 * @param count - The argument.
 * @returns `floor(count)`, 0 for anything below 1 or non-finite.
 */
function wholeCount(count: number): number {
  return count >= 1 && count - count === 0 ? Math.floor(count) : 0;
}

/**
 * A fire interval scaled by the rank's fire rate (`bullets.fireScale`): `round(ticks /
 * fireScale)`, at least 1 — exactly `ticks` on Normal.
 *
 * @param bullets - The bullet system.
 * @param ticks - The interval on Normal.
 * @returns Ticks to wait.
 *
 * @example
 * ```ts
 * yield rankedWait(bullets, 90); // 90 ticks on Normal, fewer at higher rank
 * ```
 */
export function rankedWait(bullets: BulletSystem, ticks: number): number {
  const wait = Math.round(ticks / bullets.fireScale);
  return wait >= 1 ? wait : 1;
}

/**
 * Fires one bullet at the nearest living player (quantised to `config.aimDirections`; straight
 * left without a target).
 *
 * @param bullets - The bullet system.
 * @param origin - Where it starts.
 * @param speed - Speed on Normal (× the rank's `speedScale`).
 * @param kind - `BulletKind`.
 * @returns The bullet slot, or -1 (dropped: full pool or bad kind).
 *
 * @example
 * ```ts
 * origin.x = turret.x; origin.y = turret.y;
 * fireAimed(world.bullets, origin, 1.5, BulletKind.RoundPink);
 * ```
 */
export function fireAimed(
  bullets: BulletSystem,
  origin: BulletOrigin,
  speed: number,
  kind: number,
): number {
  return bullets.emit(origin, bullets.aimFrom(origin), speed * bullets.speedScale, kind);
}

/**
 * Fires an N-way spread: `count` bullets `step` binary units apart, centred on `angle`.
 *
 * @remarks
 * Bullet `k` flies at `angle + (k − (count − 1) / 2) · step`, so with an even count no bullet
 * takes the centre heading itself (the middle two are `step / 2` either side — an aimed 2-way
 * brackets the player). `count` is floored (below 1 fires nothing); a full pool drops the rest
 * quietly and the result counts only the bullets that spawned.
 *
 * @param bullets - The bullet system.
 * @param origin - Where they start.
 * @param count - Bullets (1 = a single shot on `angle`).
 * @param step - Units between neighbours (64 = 22.5°).
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @param angle - Centre heading (default {@link AIM_AT_TARGET}).
 * @returns Bullets spawned.
 *
 * @example
 * ```ts
 * fireNWay(bullets, origin, 3, 48, 1.25, BulletKind.OvalRed); // aimed 3-way
 * ```
 */
export function fireNWay(
  bullets: BulletSystem,
  origin: BulletOrigin,
  count: number,
  step: number,
  speed: number,
  kind: number,
  angle: number = AIM_AT_TARGET,
): number {
  const n = wholeCount(count);
  if (n === 0) return 0;
  const centre = resolveAngle(bullets, origin, angle);
  const s = speed * bullets.speedScale;
  let fired = 0;
  for (let k = 0; k < n; k++) {
    if (bullets.emit(origin, centre + (k - (n - 1) / 2) * step, s, kind) >= 0) fired++;
  }
  return fired;
}

/**
 * Fires a ring: `count` bullets evenly round the circle, the first at `offset`.
 *
 * @param bullets - The bullet system.
 * @param origin - Where they start.
 * @param count - Bullets.
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @param offset - Heading of the first bullet (default 0 = +x; may be {@link AIM_AT_TARGET}).
 * @returns Bullets spawned.
 *
 * @example
 * ```ts
 * fireRing(bullets, origin, 12, 1, BulletKind.RoundPurple);
 * ```
 */
export function fireRing(
  bullets: BulletSystem,
  origin: BulletOrigin,
  count: number,
  speed: number,
  kind: number,
  offset = 0,
): number {
  const n = wholeCount(count);
  if (n === 0) return 0;
  const first = resolveAngle(bullets, origin, offset);
  const s = speed * bullets.speedScale;
  let fired = 0;
  for (let k = 0; k < n; k++) {
    if (bullets.emit(origin, first + (k * ANGLE_UNITS) / n, s, kind) >= 0) fired++;
  }
  return fired;
}

/**
 * Fires one volley of a spiral: `arms` evenly spaced bullets starting at `angle`. The script
 * keeps the angle between calls (the result).
 *
 * @param bullets - The bullet system.
 * @param origin - Where they start.
 * @param angle - This volley's heading (binary units).
 * @param arms - Bullets per volley (evenly spaced).
 * @param step - How far the spiral turns per volley (units; negative = anticlockwise).
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @returns `angle + step` wrapped into `[0, 1024)` — pass it to the next call.
 *
 * @example
 * ```ts
 * let a = 0;
 * for (;;) { a = fireSpiral(bullets, origin, a, 2, 40, 1.2, BulletKind.NeedlePink); yield 6; }
 * ```
 */
export function fireSpiral(
  bullets: BulletSystem,
  origin: BulletOrigin,
  angle: number,
  arms: number,
  step: number,
  speed: number,
  kind: number,
): number {
  const n = wholeCount(arms);
  const s = speed * bullets.speedScale;
  for (let k = 0; k < n; k++) bullets.emit(origin, angle + (k * ANGLE_UNITS) / n, s, kind);
  const next = (angle + step) % ANGLE_UNITS;
  return next < 0 ? next + ANGLE_UNITS : next;
}

/**
 * Fires a stack: `count` bullets on one heading at speeds `speed`, `speed + speedStep`, …
 *
 * @param bullets - The bullet system.
 * @param origin - Where they start.
 * @param count - Bullets.
 * @param speed - Speed of the slowest on Normal.
 * @param speedStep - Extra speed per bullet on Normal.
 * @param kind - `BulletKind`.
 * @param angle - Heading (default {@link AIM_AT_TARGET}).
 * @returns Bullets spawned.
 *
 * @example
 * ```ts
 * fireStack(bullets, origin, 4, 1, 0.25, BulletKind.NeedleRed); // 1, 1.25, 1.5, 1.75 px/tick
 * ```
 */
export function fireStack(
  bullets: BulletSystem,
  origin: BulletOrigin,
  count: number,
  speed: number,
  speedStep: number,
  kind: number,
  angle: number = AIM_AT_TARGET,
): number {
  const n = wholeCount(count);
  if (n === 0) return 0;
  const heading = resolveAngle(bullets, origin, angle);
  const scale = bullets.speedScale;
  let fired = 0;
  for (let k = 0; k < n; k++) {
    if (bullets.emit(origin, heading, (speed + k * speedStep) * scale, kind) >= 0) fired++;
  }
  return fired;
}

/**
 * Fires a random spray: `count` bullets at headings uniformly within `angle ± spread / 2` and
 * speeds uniformly in `[minSpeed, maxSpeed)`, drawn from the given (gameplay) RNG — two draws per
 * bullet, whether or not it spawns, so replays stay in sync.
 *
 * @param bullets - The bullet system.
 * @param origin - Where they start.
 * @param rng - The gameplay RNG stream (`world.rng.gameplay`).
 * @param count - Bullets.
 * @param spread - Total width of the cone in binary units.
 * @param minSpeed - Slowest speed on Normal.
 * @param maxSpeed - Fastest speed on Normal.
 * @param kind - `BulletKind`.
 * @param angle - Cone centre (default {@link AIM_AT_TARGET}).
 * @returns Bullets spawned.
 *
 * @example
 * ```ts
 * fireSpray(bullets, origin, world.rng.gameplay, 6, 128, 0.8, 1.6, BulletKind.RoundRed);
 * ```
 */
export function fireSpray(
  bullets: BulletSystem,
  origin: BulletOrigin,
  rng: Rng,
  count: number,
  spread: number,
  minSpeed: number,
  maxSpeed: number,
  kind: number,
  angle: number = AIM_AT_TARGET,
): number {
  const n = wholeCount(count);
  if (n === 0) return 0;
  const centre = resolveAngle(bullets, origin, angle);
  const scale = bullets.speedScale;
  let fired = 0;
  for (let k = 0; k < n; k++) {
    const heading = centre + (rng.nextFloat() - 0.5) * spread;
    const speed = minSpeed + rng.nextFloat() * (maxSpeed - minSpeed);
    if (bullets.emit(origin, heading, speed * scale, kind) >= 0) fired++;
  }
  return fired;
}

/**
 * Fires one homing bullet: it starts on `angle`, then for `lifetime` ticks turns towards the
 * nearest living player by at most `turnRate` units per tick, then flies straight.
 *
 * @param bullets - The bullet system.
 * @param origin - Where it starts.
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @param turnRate - Maximum turn per tick (binary units).
 * @param lifetime - Homing ticks.
 * @param angle - Starting heading (default {@link AIM_AT_TARGET}).
 * @returns The bullet slot, or -1.
 *
 * @example
 * ```ts
 * fireHoming(bullets, origin, 1.25, BulletKind.OvalPurple, 6, 90, ANGLE_UNITS / 2);
 * ```
 */
export function fireHoming(
  bullets: BulletSystem,
  origin: BulletOrigin,
  speed: number,
  kind: number,
  turnRate: number,
  lifetime: number,
  angle: number = AIM_AT_TARGET,
): number {
  const i = bullets.emit(
    origin,
    resolveAngle(bullets, origin, angle),
    speed * bullets.speedScale,
    kind,
  );
  if (i >= 0) bullets.setHoming(i, turnRate, lifetime);
  return i;
}

/**
 * Fires one delayed bullet: it sits at the origin (riding the camera, able to hit) for `delay`
 * ticks, then launches at `speed` — re-aimed at the nearest living player at launch when `angle`
 * is {@link AIM_AT_TARGET}.
 *
 * @param bullets - The bullet system.
 * @param origin - Where it waits.
 * @param delay - Ticks to wait.
 * @param speed - Speed on Normal after launch.
 * @param kind - `BulletKind`.
 * @param angle - Heading (default {@link AIM_AT_TARGET}: aimed when it launches).
 * @returns The bullet slot, or -1.
 *
 * @example
 * ```ts
 * for (let k = 0; k < 4; k++) fireDelayed(bullets, origin, 20 + k * 10, 1.75, BulletKind.OvalPink);
 * ```
 */
export function fireDelayed(
  bullets: BulletSystem,
  origin: BulletOrigin,
  delay: number,
  speed: number,
  kind: number,
  angle: number = AIM_AT_TARGET,
): number {
  const aim = angle === AIM_AT_TARGET;
  const i = bullets.emit(
    origin,
    aim ? bullets.aimFrom(origin) : angle,
    speed * bullets.speedScale,
    kind,
  );
  if (i >= 0) bullets.setDelay(i, delay, aim);
  return i;
}

// ------------------------------------------------------------------------------ DSL (M2-02)

/** Emitter runner slots: one per enemy slot (`core/enemies` `MAX_ENEMIES`). */
export const MAX_PATTERN_EMITTERS = 64;

/** Runner slots of bullets' own programs: one per enemy bullet. */
export const MAX_BULLET_PROGRAMS = MAX_ENEMY_BULLETS;

/** Every runner slot: the emitters `[0, 64)`, then the bullet programs. */
export const PATTERN_RUNNERS = MAX_PATTERN_EMITTERS + MAX_BULLET_PROGRAMS;

/**
 * Most instructions one run may execute before it sleeps a tick on its own (a `repeat` without a
 * `wait` cannot hang the tick; the pattern resumes on the next one, deterministically).
 */
export const PATTERN_STEP_BUDGET = 1024;

/** Longest `wait` a program may yield (ticks). */
export const MAX_PATTERN_WAIT = 1_000_000;

/** Runner state bits (`PatternVm` `state`). */
const RunnerBit = { InUse: 1, SeqDir: 2, SeqSpeed: 4 } as const;

/** What the pattern interpreter reads from its World (the World implements it). */
export interface PatternHost {
  /** The enemy bullets (fire, aim, the rank's scales; bullets' motion fields). */
  readonly bullets: BulletSystem;
  /** The RNG streams (`$rand` draws from the gameplay stream). */
  readonly rng: { readonly gameplay: Rng };
  /** The session's rank (`$rank`). */
  readonly rank: number;
  /** What the rank is computed from (`$loop` reads `loop`). */
  readonly rankInputs: { readonly loop: number };
  /** The content (the compiled {@link PatternBank}). */
  readonly content: { readonly patterns: PatternBank };
}

/**
 * The runner table of a {@link PatternVm} ({@link PATTERN_RUNNERS} slots; `repeat` arrays are
 * runner-major, {@link MAX_REPEAT_DEPTH} per runner). Live interpreter state — never write it.
 */
export interface PatternRunners {
  /** Runner state bits (0 = free / idle; bit 1 = in use, 2 = has a `sequence` direction, 4 = speed). */
  readonly state: Uint8Array;
  /** Program counter (0 = nothing to run). */
  readonly pc: Int32Array;
  /** Entry the runner started from. */
  readonly entry: Int32Array;
  /** `repeat` depth. */
  readonly depth: Int32Array;
  /** `repeat` indices. */
  readonly loopI: Int32Array;
  /** `repeat` counts. */
  readonly loopN: Int32Array;
  /** Bullets: the age their program runs again. */
  readonly wake: Int32Array;
  /** Direction of the previous fire. */
  readonly seqDir: Float64Array;
  /** Speed of the previous fire (Normal units). */
  readonly seqSpeed: Float64Array;
  /** Emitters: heading of `relative` directions. */
  readonly heading: Float64Array;
  /** Bullets: the rank speed scale they fire with. */
  readonly scale: Float64Array;
  /** `[0]` = where the next bullet runner search starts, `[1]` = bullet runners in use. */
  readonly meta: Int32Array;
}

/** Where an emitter fires from (an `Enemy` works: only `x` / `y` are read). */
export interface PatternSource {
  /** World x. */
  readonly x: number;
  /** World y. */
  readonly y: number;
}

/**
 * The interpreter of compiled DSL programs (plan M2-02): one per World, created by `createWorld`
 * and installed as the bullet system's program runner.
 *
 * @remarks
 * **Runners.** {@link PATTERN_RUNNERS} runner slots in typed arrays ({@link PatternVm.runners},
 * hashed by `hashWorld` — the runners in use): slot `e < 64` belongs to enemy slot `e` (its
 * behaviour starts and steps it — `ScriptApi.startPattern` / `stepPattern`), the others are handed
 * out to bullets fired with `actions` (the first free slot from a rotating hint, so the choice
 * depends only on hashed state; a bullet stores `runner + 1` in its pool field) and freed when the
 * program ends or the bullet goes. A runner holds its program counter, its `repeat`
 * stack ({@link MAX_REPEAT_DEPTH} × index / count), the previous fire's direction and speed
 * (`sequence`), its heading (emitters: `relative`), the rank speed scale it fires with (bullets:
 * the shooter's at launch) and when it wakes (bullets: the age).
 *
 * **Running.** An emitter runs when its behaviour's coroutine wakes: {@link PatternVm.stepEmitter}
 * executes until a `wait` (its ticks are the coroutine's next `yield` — decision D29) or the end.
 * A bullet's program runs inside `BulletSystem.update` (phase 5), after the bullet aged and
 * before its kinematics, when its wake age has come. Each run executes at most
 * {@link PATTERN_STEP_BUDGET} instructions. Expressions are evaluated on a preallocated stack;
 * fractional values stay in typed arrays and class fields, so a run never allocates (a `$rand`
 * draw is the RNG's own call).
 *
 * **Firing.** A `fire` computes its direction and speed (see `dsl.ts`), records them for
 * `sequence`, and — when the emitter may fire (the enemy's fire rule) — launches one bullet at
 * `speed × the rank's speed scale` (`BulletSystem.speedScale` — the shooter's modifiers apply
 * while its script runs; a bullet's program uses the scale it was fired with), giving it a runner
 * of its own when its bullet has `actions` (no free runner: it flies without its program).
 */
export interface PatternVm extends BulletProgramRunner {
  /** The bank the programs come from. */
  readonly bank: PatternBank;
  /** The runner table (read-only for others: `hashWorld` mixes the runners in use). */
  readonly runners: PatternRunners;
  /** Bullet runners in use. */
  readonly bulletPrograms: number;
  /**
   * (Re)starts an emitter on a pattern (`ContentDb.patterns` action index).
   *
   * @param emitter - Emitter slot (the enemy slot, `0 … 63`).
   * @param pattern - Action index (e.g. `EnemySpec.patternId`).
   * @param heading - The emitter's heading for `relative` directions (default left).
   * @returns `false` (nothing started, the emitter stopped) for a bad slot or pattern, or one that
   *   did not compile.
   */
  startEmitter(emitter: number, pattern: number, heading?: number): boolean;
  /**
   * Runs an emitter until its next `wait` or its end (see the remarks of {@link PatternVm}).
   *
   * @param emitter - Emitter slot.
   * @param source - Where it fires from (the enemy).
   * @param canFire - The enemy's fire rule: `false` computes everything but launches nothing.
   * @returns Ticks to sleep (≥ 1), or -1 when the pattern ended (or none runs).
   */
  stepEmitter(emitter: number, source: PatternSource, canFire: boolean): number;
  /**
   * Stops an emitter (its enemy is gone).
   *
   * @param emitter - Emitter slot.
   */
  stopEmitter(emitter: number): void;
}

/** The {@link PatternVm} (a class: typed-array state, monomorphic methods). */
class PatternVmImpl implements PatternVm {
  /** See {@link PatternVm.bank}. */
  readonly bank: PatternBank;
  /** See {@link PatternVm.runners}. */
  readonly runners: PatternRunners;
  /** The bank's code. */
  private readonly code: Float64Array;
  /** Program counter per runner (0 = the bank's `End`: nothing to run). */
  private readonly pc = new Int32Array(PATTERN_RUNNERS);
  /** Entry per runner (emitters restart from it). */
  private readonly entry = new Int32Array(PATTERN_RUNNERS);
  /** `repeat` depth per runner. */
  private readonly depth = new Int32Array(PATTERN_RUNNERS);
  /** `repeat` indices (`$i`), runner-major. */
  private readonly loopI = new Int32Array(PATTERN_RUNNERS * MAX_REPEAT_DEPTH);
  /** `repeat` counts, runner-major. */
  private readonly loopN = new Int32Array(PATTERN_RUNNERS * MAX_REPEAT_DEPTH);
  /** Bullets: the age their program runs again. */
  private readonly wake = new Int32Array(PATTERN_RUNNERS);
  /** Direction of the previous fire (`sequence`). */
  private readonly seqDir = new Float64Array(PATTERN_RUNNERS);
  /** Speed of the previous fire (Normal units, `sequence`). */
  private readonly seqSpeed = new Float64Array(PATTERN_RUNNERS);
  /** Emitters: the heading of `relative` directions. */
  private readonly heading = new Float64Array(PATTERN_RUNNERS);
  /** Bullets: the rank speed scale they were fired with. */
  private readonly scale = new Float64Array(PATTERN_RUNNERS);
  /** {@link RunnerBit}s. */
  private readonly state = new Uint8Array(PATTERN_RUNNERS);
  /** `[0]` = next bullet runner to try, `[1]` = bullet runners in use. */
  private readonly meta = new Int32Array(2);
  /** The expression stack; `[0]` holds the last result. */
  private readonly stack = new Float64Array(MAX_EXPR_STACK + 1);
  /** The World. */
  private readonly host: PatternHost;
  /** Where the current fire starts (and aims from). */
  private readonly origin = new BulletOrigin();
  /** The bullet being launched. */
  private readonly shot = new BulletShot();

  /**
   * Creates the interpreter (see {@link createPatternVm}).
   *
   * @param host - The World.
   */
  constructor(host: PatternHost) {
    this.host = host;
    this.bank = host.content.patterns;
    this.code = this.bank.code;
    this.runners = Object.freeze({
      state: this.state,
      pc: this.pc,
      entry: this.entry,
      depth: this.depth,
      loopI: this.loopI,
      loopN: this.loopN,
      wake: this.wake,
      seqDir: this.seqDir,
      seqSpeed: this.seqSpeed,
      heading: this.heading,
      scale: this.scale,
      meta: this.meta,
    });
    this.clear();
  }

  /** See {@link PatternVm.bulletPrograms}. */
  get bulletPrograms(): number {
    return this.meta[1];
  }

  /**
   * See {@link BulletProgramRunner.clear}: every bullet runner free and every emitter stopped (a
   * session clear removes the enemies too).
   */
  clear(): void {
    for (let r = 0; r < PATTERN_RUNNERS; r++) {
      this.state[r] = 0;
      this.pc[r] = 0;
    }
    this.meta[0] = MAX_PATTERN_EMITTERS;
    this.meta[1] = 0;
  }

  /** See {@link BulletProgramRunner.release}. */
  release(runner: number): void {
    if (!(runner >= MAX_PATTERN_EMITTERS && runner < PATTERN_RUNNERS)) return;
    if ((this.state[runner] & RunnerBit.InUse) === 0) return;
    this.state[runner] = 0;
    this.pc[runner] = 0;
    this.meta[1]--;
  }

  /**
   * Takes the first free bullet runner at or after the search hint (wrapping).
   *
   * @returns The runner slot, or -1 when all are in use.
   */
  private allocRunner(): number {
    if (this.meta[1] >= MAX_BULLET_PROGRAMS) return -1;
    let r = this.meta[0];
    for (let k = 0; k < MAX_BULLET_PROGRAMS; k++) {
      if (this.state[r] === 0) {
        this.meta[0] = r + 1 < PATTERN_RUNNERS ? r + 1 : MAX_PATTERN_EMITTERS;
        this.meta[1]++;
        return r;
      }
      r = r + 1 < PATTERN_RUNNERS ? r + 1 : MAX_PATTERN_EMITTERS;
    }
    return -1;
  }

  /**
   * Resets a runner to an entry.
   *
   * @param r - Runner slot.
   * @param entry - Code offset.
   */
  private reset(r: number, entry: number): void {
    this.pc[r] = entry;
    this.entry[r] = entry;
    this.depth[r] = 0;
    this.wake[r] = 1;
    this.seqDir[r] = 0;
    this.seqSpeed[r] = 0;
    this.state[r] = RunnerBit.InUse;
  }

  /** See {@link PatternVm.startEmitter}. */
  startEmitter(emitter: number, pattern: number, heading: number = NO_TARGET_ANGLE): boolean {
    if (!(emitter >= 0 && emitter < MAX_PATTERN_EMITTERS && emitter % 1 === 0)) return false;
    const entries = this.bank.entries;
    const entry =
      pattern >= 0 && pattern < entries.length && pattern % 1 === 0 ? entries[pattern] : 0;
    if (entry <= 0) {
      this.stopEmitter(emitter);
      return false;
    }
    this.reset(emitter, entry);
    this.heading[emitter] = heading;
    this.scale[emitter] = 1;
    return true;
  }

  /** See {@link PatternVm.stopEmitter}. */
  stopEmitter(emitter: number): void {
    if (!(emitter >= 0 && emitter < MAX_PATTERN_EMITTERS && emitter % 1 === 0)) return;
    this.pc[emitter] = 0;
    this.state[emitter] = 0;
  }

  /** See {@link PatternVm.stepEmitter}. */
  stepEmitter(emitter: number, source: PatternSource, canFire: boolean): number {
    if (!(emitter >= 0 && emitter < MAX_PATTERN_EMITTERS && emitter % 1 === 0)) return -1;
    if (this.pc[emitter] === 0) return -1;
    this.origin.x = source.x;
    this.origin.y = source.y;
    const wait = this.exec(emitter, -1, canFire);
    if (wait > 0) return wait;
    this.stopEmitter(emitter);
    return -1;
  }

  /** See {@link BulletProgramRunner.runBullet}. */
  runBullet(index: number): number {
    const f = this.host.bullets.pool.fields;
    const r = f.runner[index] - 1;
    if (r < MAX_PATTERN_EMITTERS || (this.state[r] & RunnerBit.InUse) === 0) {
      f.runner[index] = 0;
      return 0;
    }
    const age = f.age[index];
    if (this.wake[r] > age) return 0;
    this.origin.x = f.x[index];
    this.origin.y = f.y[index];
    const wait = this.exec(r, index, true);
    if (wait > 0) {
      this.wake[r] = age + wait;
      return 1;
    }
    // The program ended (or the bullet vanished — its runner is already free then).
    if (f.runner[index] !== 0 && (f.flags[index] & BulletFlag.Dead) === 0) {
      f.runner[index] = 0;
      this.release(r);
    }
    return 1;
  }

  /**
   * Runs a runner until it sleeps or ends.
   *
   * @param r - Runner slot.
   * @param bullet - The bullet running it, or -1 for an emitter.
   * @param canFire - Whether fires launch bullets.
   * @returns Ticks to sleep (≥ 1), or 0 when the program ended.
   */
  private exec(r: number, bullet: number, canFire: boolean): number {
    const code = this.code;
    let pc = this.pc[r];
    let steps = 0;
    for (;;) {
      if (++steps > PATTERN_STEP_BUDGET) {
        this.pc[r] = pc;
        return 1;
      }
      switch (code[pc]) {
        case PatternOp.Wait: {
          const ranked = code[pc + 1];
          pc = this.evalExpr(pc + 2, r);
          const ticks = this.stack[0];
          let wait = 0;
          if (ranked !== 0) {
            wait = Math.round(ticks / this.host.bullets.fireScale);
            if (!(wait >= 1)) wait = 1;
          } else if (ticks >= 1) {
            wait = Math.floor(ticks);
          }
          if (wait >= 1) {
            this.pc[r] = pc;
            return wait < MAX_PATTERN_WAIT ? wait : MAX_PATTERN_WAIT;
          }
          break;
        }
        case PatternOp.Repeat: {
          const exit = code[pc + 1];
          pc = this.evalExpr(pc + 2, r);
          const times = Math.floor(this.stack[0]);
          const d = this.depth[r];
          if (!(times >= 1) || d >= MAX_REPEAT_DEPTH) {
            pc = exit;
            break;
          }
          this.loopI[r * MAX_REPEAT_DEPTH + d] = 0;
          this.loopN[r * MAX_REPEAT_DEPTH + d] = times < 0x3fffffff ? times : 0x3fffffff;
          this.depth[r] = d + 1;
          break;
        }
        case PatternOp.Loop: {
          const d = this.depth[r] - 1;
          const at = r * MAX_REPEAT_DEPTH + d;
          const i = this.loopI[at] + 1;
          if (d >= 0 && i < this.loopN[at]) {
            this.loopI[at] = i;
            pc = code[pc + 1];
          } else {
            this.depth[r] = d > 0 ? d : 0;
            pc += 2;
          }
          break;
        }
        case PatternOp.Fire:
          pc = this.fire(pc, r, bullet, canFire);
          break;
        case PatternOp.ChangeSpeed:
          pc = this.changeSpeed(pc, r, bullet);
          break;
        case PatternOp.ChangeDirection:
          pc = this.changeDirection(pc, r, bullet);
          break;
        case PatternOp.Accel:
          pc = this.accel(pc, r, bullet);
          break;
        case PatternOp.Vanish:
          this.pc[r] = 0;
          if (bullet >= 0) this.host.bullets.remove(bullet);
          return 0;
        default:
          // `End` (and anything unknown).
          this.pc[r] = 0;
          return 0;
      }
    }
  }

  /**
   * Evaluates the expression at `pc` into `stack[0]`.
   *
   * @param pc - Offset of the expression's length.
   * @param r - Runner slot (`$i`).
   * @returns The offset after the expression.
   */
  private evalExpr(pc: number, r: number): number {
    const code = this.code;
    const stack = this.stack;
    const end = pc + 1 + code[pc];
    let p = pc + 1;
    let sp = 0;
    while (p < end) {
      const op = code[p++];
      if (op === ExprOp.Const) {
        stack[sp++] = code[p++];
        continue;
      }
      switch (op) {
        case ExprOp.Rank:
          stack[sp++] = this.host.rank;
          break;
        case ExprOp.Rand:
          // Into the stack: a returned fraction would be boxed per draw.
          this.host.rng.gameplay.nextFloatInto(stack, sp++);
          break;
        case ExprOp.Loop:
          stack[sp++] = this.host.rankInputs.loop;
          break;
        case ExprOp.Index: {
          const d = this.depth[r];
          stack[sp++] = d > 0 ? this.loopI[r * MAX_REPEAT_DEPTH + d - 1] : 0;
          break;
        }
        case ExprOp.Neg:
          stack[sp - 1] = -stack[sp - 1];
          break;
        case ExprOp.Floor:
          stack[sp - 1] = Math.floor(stack[sp - 1]);
          break;
        case ExprOp.Round:
          stack[sp - 1] = Math.round(stack[sp - 1]);
          break;
        case ExprOp.Abs:
          stack[sp - 1] = Math.abs(stack[sp - 1]);
          break;
        case ExprOp.Sin:
          stack[sp - 1] = SIN_TABLE_Q16[Math.round(stack[sp - 1]) & ANGLE_MASK] / TRIG_SCALE;
          break;
        case ExprOp.Cos:
          stack[sp - 1] =
            SIN_TABLE_Q16[(Math.round(stack[sp - 1]) + ANGLE_QUARTER) & ANGLE_MASK] / TRIG_SCALE;
          break;
        default: {
          const b = stack[--sp];
          const a = stack[sp - 1];
          let v: number;
          switch (op) {
            case ExprOp.Add:
              v = a + b;
              break;
            case ExprOp.Sub:
              v = a - b;
              break;
            case ExprOp.Mul:
              v = a * b;
              break;
            case ExprOp.Div:
              v = a / b;
              break;
            case ExprOp.Mod:
              v = a % b;
              break;
            case ExprOp.Min:
              v = a < b ? a : b;
              break;
            case ExprOp.Max:
              v = a > b ? a : b;
              break;
            default:
              v = NaN;
          }
          stack[sp - 1] = v;
        }
      }
    }
    if (sp === 0) stack[0] = 0;
    return end;
  }

  /**
   * The heading a direction resolves to (its value is in `stack[0]`); aims from `origin`.
   *
   * @param type - `DirType`.
   * @param r - Runner slot.
   * @param bullet - The bullet running it, or -1.
   * @returns Nothing — the heading is written to `stack[1]`.
   */
  private resolveDirection(type: number, r: number, bullet: number): void {
    const stack = this.stack;
    const value = stack[0];
    let dir: number;
    if (type === DirType.Absolute) {
      dir = value;
    } else if (type === DirType.Relative) {
      dir = (bullet >= 0 ? this.host.bullets.pool.fields.angle[bullet] : this.heading[r]) + value;
    } else if (type === DirType.Sequence && (this.state[r] & RunnerBit.SeqDir) !== 0) {
      dir = this.seqDir[r] + value;
    } else {
      dir = this.host.bullets.aimFrom(this.origin) + value;
    }
    stack[1] = dir;
  }

  /**
   * `Fire` (see {@link PatternVm}).
   *
   * @param pc - Offset of the op.
   * @param r - Runner slot.
   * @param bullet - The bullet running it, or -1.
   * @param canFire - Whether it launches.
   * @returns The next offset.
   */
  private fire(pc: number, r: number, bullet: number, canFire: boolean): number {
    const code = this.code;
    const stack = this.stack;
    const dirType = code[pc + 1];
    const speedType = code[pc + 2];
    const kind = code[pc + 3];
    const entry = code[pc + 4];
    let p = this.evalExpr(pc + 5, r);
    this.resolveDirection(dirType, r, bullet);
    const dir = stack[1];
    p = this.evalExpr(p, r);
    const value = stack[0];
    const bullets = this.host.bullets;
    const scale = bullet >= 0 ? this.scale[r] : bullets.speedScale;
    let speed: number;
    if (speedType === SpeedType.Relative) {
      speed = (bullet >= 0 ? bullets.pool.fields.speed[bullet] / scale : 0) + value;
    } else if (speedType === SpeedType.Sequence) {
      speed =
        ((this.state[r] & RunnerBit.SeqSpeed) !== 0 ? this.seqSpeed[r] : DEFAULT_PATTERN_SPEED) +
        value;
    } else {
      speed = value;
    }
    this.seqDir[r] = dir;
    this.seqSpeed[r] = speed;
    this.state[r] |= RunnerBit.SeqDir | RunnerBit.SeqSpeed;
    if (!canFire) return p;
    const shot = this.shot;
    shot.x = this.origin.x;
    shot.y = this.origin.y;
    shot.angle = dir;
    shot.speed = speed * scale;
    const j = bullets.launch(shot, kind);
    const child = j >= 0 && entry > 0 ? this.allocRunner() : -1;
    if (child >= 0) {
      this.reset(child, entry);
      this.scale[child] = scale;
      this.heading[child] = 0;
      bullets.pool.fields.runner[j] = child + 1;
    }
    return p;
  }

  /**
   * `ChangeSpeed` of the running bullet (an emitter only evaluates it).
   *
   * @param pc - Offset of the op.
   * @param r - Runner slot.
   * @param bullet - The bullet, or -1.
   * @returns The next offset.
   */
  private changeSpeed(pc: number, r: number, bullet: number): number {
    const type = this.code[pc + 1];
    let p = this.evalExpr(pc + 2, r);
    const value = this.stack[0];
    p = this.evalExpr(p, r);
    const term = Math.floor(this.stack[0]);
    if (bullet < 0) return p;
    const f = this.host.bullets.pool.fields;
    const scale = this.scale[r];
    if (type === SpeedType.Sequence) {
      if (term >= 1) {
        f.accel[bullet] = value * scale;
        f.accelTerm[bullet] = term;
        f.termSpeed[bullet] = NaN;
      }
      return p;
    }
    const current = f.speed[bullet];
    const target = type === SpeedType.Relative ? current + value * scale : value * scale;
    if (target < f.minSpeed[bullet]) f.minSpeed[bullet] = target;
    if (target > f.maxSpeed[bullet]) f.maxSpeed[bullet] = target;
    if (!(term >= 1)) {
      f.speed[bullet] = target;
      f.accel[bullet] = 0;
      f.accelTerm[bullet] = 0;
      return p;
    }
    f.accel[bullet] = (target - current) / term;
    f.accelTerm[bullet] = term;
    f.termSpeed[bullet] = target;
    return p;
  }

  /**
   * `ChangeDirection` of the running bullet; an emitter's sets its `relative` heading at once.
   *
   * @param pc - Offset of the op.
   * @param r - Runner slot.
   * @param bullet - The bullet, or -1.
   * @returns The next offset.
   */
  private changeDirection(pc: number, r: number, bullet: number): number {
    const type = this.code[pc + 1];
    let p = this.evalExpr(pc + 2, r);
    const value = this.stack[0];
    p = this.evalExpr(p, r);
    const term = Math.floor(this.stack[0]);
    this.stack[0] = value;
    if (bullet < 0) {
      if (type !== DirType.Sequence) {
        this.resolveDirection(type, r, -1);
        this.heading[r] = this.stack[1];
      }
      return p;
    }
    const f = this.host.bullets.pool.fields;
    if (type === DirType.Sequence) {
      if (term >= 1) {
        f.angVel[bullet] = value;
        f.turnTerm[bullet] = term;
        f.termAngle[bullet] = NaN;
      }
      return p;
    }
    this.resolveDirection(type, r, bullet);
    let target = this.stack[1] % ANGLE_UNITS;
    if (target < 0) target += ANGLE_UNITS;
    if (!(term >= 1)) {
      f.angle[bullet] = target;
      f.angVel[bullet] = 0;
      f.turnTerm[bullet] = 0;
      return p;
    }
    let delta = (target - f.angle[bullet]) % ANGLE_UNITS;
    if (delta > ANGLE_UNITS / 2) delta -= ANGLE_UNITS;
    else if (delta <= -ANGLE_UNITS / 2) delta += ANGLE_UNITS;
    f.angVel[bullet] = delta / term;
    f.turnTerm[bullet] = term;
    f.termAngle[bullet] = target;
    return p;
  }

  /**
   * `Accel` of the running bullet (an emitter only evaluates it).
   *
   * @param pc - Offset of the op.
   * @param r - Runner slot.
   * @param bullet - The bullet, or -1.
   * @returns The next offset.
   */
  private accel(pc: number, r: number, bullet: number): number {
    const flags = this.code[pc + 1];
    let p = this.evalExpr(pc + 2, r);
    const accel = this.stack[0];
    p = this.evalExpr(p, r);
    const min = this.stack[0];
    p = this.evalExpr(p, r);
    const max = this.stack[0];
    p = this.evalExpr(p, r);
    const term = Math.floor(this.stack[0]);
    if (bullet < 0) return p;
    const f = this.host.bullets.pool.fields;
    const scale = this.scale[r];
    f.accel[bullet] = accel * scale;
    if ((flags & ACCEL_HAS_MIN) !== 0) f.minSpeed[bullet] = min * scale;
    if ((flags & ACCEL_HAS_MAX) !== 0) f.maxSpeed[bullet] = max * scale;
    f.accelTerm[bullet] = term >= 1 ? term : 0;
    f.termSpeed[bullet] = NaN;
    return p;
  }
}

/**
 * Creates the pattern interpreter of a World (load time; the World installs it with
 * `BulletSystem.setProgramRunner`).
 *
 * @param host - The World (its bullets, RNG, rank, loop and compiled patterns).
 * @returns The interpreter, every runner idle.
 *
 * @example
 * ```ts
 * const vm = createPatternVm(world);
 * world.bullets.setProgramRunner(vm);
 * vm.startEmitter(enemy.slot, db.patterns.actionIndex.get('fan-3') ?? -1);
 * const wait = vm.stepEmitter(enemy.slot, enemy, true); // → ticks until the next volley
 * ```
 */
export function createPatternVm(host: PatternHost): PatternVm {
  return new PatternVmImpl(host);
}
