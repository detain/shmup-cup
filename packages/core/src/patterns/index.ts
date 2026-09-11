/**
 * # patterns — behaviour coroutines, movers and attack patterns
 *
 * **Status: partial.** The script runner and the movers are implemented (plan M1-08); the fire
 * primitives (aimed, N-way, ring, spiral, stack, spray, homing, delayed bullets) arrive with the
 * enemy bullets of M1-09 and the BulletML-inspired pattern DSL with M2-02.
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
 * {@link samplePath}, {@link CRAWL_STEP}, {@link AIM_DIRECTIONS}. The planned DSL node type
 * {@link PatternNode}.
 *
 * **Planned API.** Fire primitives on the enemy `ScriptApi` (M1-09): `aimed`, `nWay`, `ring`,
 * `spiral`, `stack`, `spray`, `homing`, `delayed`; `compilePattern(nodes)` (M2-02).
 *
 * @module
 */
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

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'patterns',
  status: 'partial',
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

/** Aimed movers snap their heading to this many directions (decision D17, retro feel). */
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
 * `sinB` / `cosB`) and `atan2B` gets whole numbers (see `aimFrom`).
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
    body.s0 = turnToward(body.s0, aimFrom(body, ctx.targetX, ctx.targetY), body.m1);
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
      ? quantizeAngle(aimFrom(body, ctx.targetX, ctx.targetY), AIM_DIRECTIONS)
      : ANGLE_UNITS / 2;
  }
  const speed = body.m0;
  const angle = body.s1 & ANGLE_MASK;
  body.vx = (SIN_TABLE_Q16[angle + ANGLE_QUARTER] / TRIG_SCALE) * speed;
  body.vy = (SIN_TABLE_Q16[angle] / TRIG_SCALE) * speed;
  body.x += body.vx;
  body.y += body.vy;
}

// ------------------------------------------------------------------------------ DSL (M2-02)

/**
 * A node of the planned pattern DSL (JSON-serialisable, M2-02).
 *
 * @remarks
 * Numeric parameters are strings so they can be expressions over `$rank` and
 * `$rand`, e.g. `"2 + $rank / 8"` (BulletML-style), compiled once at load time.
 */
export type PatternNode =
  | {
      /** Discriminant: fire one bullet. */
      readonly op: 'fire';
      /** Direction expression (binary-angle units; default: aimed at the player). */
      readonly direction?: string;
      /** Speed expression in pixels per tick (default: the enemy's base speed). */
      readonly speed?: string;
    }
  | {
      /** Discriminant: pause the pattern. */
      readonly op: 'wait';
      /** Tick-count expression. */
      readonly ticks: string;
    }
  | {
      /** Discriminant: run `body` several times. */
      readonly op: 'repeat';
      /** Repetition-count expression. */
      readonly times: string;
      /** Nodes to repeat, in order. */
      readonly body: readonly PatternNode[];
    };
