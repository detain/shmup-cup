/**
 * # stage — stage runtime: camera path, timeline, checkpoints, terrain, parallax
 *
 * **Responsibility.** Runs one stage (`content/stages/*.stage.json`, validated and expanded by
 * `core/data`):
 *
 * - the **scripted camera path** — speed keys with linear ramps, scroll stops, vertical pans
 *   (`yTo` over `yTicks`, eased), boss **scroll locks** (the camera stops exactly at the lock key
 *   and waits for {@link StageRunner.unlock}), `speed` events for scripted / high-speed sections;
 *   the camera never scrolls past the stage `length`;
 * - the **event timeline** — events are pre-sorted by camera x and consumed through a cursor:
 *   every tick fires, in order, each event with `x ≤ camera.x`, exactly once (several may fire on
 *   one tick). The runner applies `speed`, `flag` and `end` itself and hands **every** event to
 *   its {@link StageHooks} (the World spawns enemies from them from M1-08, starts bosses in M1-13
 *   and emits music changes now);
 * - **invisible checkpoints** (shmup_feat.md §10) — the last passed checkpoint is tracked;
 *   {@link StageRunner.restartAt} puts the camera back, re-derives the scroll speed, pan and flags
 *   the stage had there, finds the event cursor by binary search (events at exactly the
 *   checkpoint's x fire again, for the hooks) and calls `hooks.clear()`;
 * - the **terrain** and **parallax** descriptions: {@link createStageTerrain} turns the stage's
 *   expanded tile grid into the `TerrainMap` the collision queries read (a private copy, so later
 *   destructible terrain cannot touch the content), {@link createTerrainView} /
 *   {@link createParallaxView} build the read-only views the renderer draws and
 *   {@link updateParallaxView} scrolls the bands with the camera.
 *
 * **Tick order inside {@link StageRunner.tick}.** 1 apply the camera keys the camera has reached
 * (`key.x ≤ camera.x`), 2 advance the speed ramp and the vertical pan, 3 move the camera (not
 * while locked; stopping exactly at the first pending lock key — even with other pending keys
 * before it — and at `length`), recording `dx`/`dy`, 4 fire the due events, 5 update the last
 * passed checkpoint. So an event fires on the tick the camera reaches its x and a key applies
 * one tick later: on a tie (and whenever one tick's movement crosses both) the event's speed
 * is overridden by the key's. The stage start is the exception: the camera is at x 0 from the
 * outset, so the first tick applies the key at 0 and then fires the events at 0 — a `speed`
 * event at 0 overrides the first key.
 *
 * **Restart order.** {@link StageRunner.restartAt} replays that order by x: keys and events
 * before the checkpoint at once, an event before a key at the same x (but the key at 0 before
 * the events at 0, as the first tick applies them); then the events at exactly the checkpoint's
 * x (as live play fired them on arrival: speed ramps start, flags and `end` apply), which
 * re-fire on the next tick for the hooks only; keys at the checkpoint's x apply on that tick, as
 * live play applied them the tick after arriving. Exact for ties; a key and a speed event less
 * than one tick's movement apart (key first) are replayed key → event, while live play may have
 * crossed both in one tick (event → key).
 *
 * **Zero allocation.** All numeric runner state lives in one `Float64Array`
 * ({@link StageRunner.state}, also what `hashWorld` hashes); at creation the camera keys, events
 * (type strings resolved to {@link StageEventCode}s) and checkpoints are compiled into typed
 * arrays, so `tick()` only reads arrays and writes numbers — the content objects are touched
 * only to hand a fired event to the hooks. The runner is a class, so every runner shares one
 * set of (monomorphic) methods.
 *
 * **Implements.**
 * - shmup_feat.md §14 Stages / zones — scroll-driven timeline (pre-sorted events + cursor),
 *   scripted camera path (ramps, stops, vertical sections, boss lock, high-speed sections),
 *   tilemap terrain, parallax layers
 * - shmup_feat.md §10 — invisible checkpoints (scroll x + event cursor)
 * - shmup_feat.md §22 Stage runtime — camera path runner, event cursor, checkpoint system,
 *   tilemap collider, parallax manager
 *
 * **Public API.** Runner {@link createStageRunner}, {@link StageRunner}, {@link StageHooks},
 * {@link StageEventCode}, {@link StageSlot}, {@link STAGE_STATE_SLOTS}, {@link findEventCursor};
 * camera {@link StageCamera}, {@link createStageCamera}; terrain {@link createStageTerrain},
 * {@link createTerrainView}, {@link stageMapWidth}; parallax {@link createParallaxView},
 * {@link updateParallaxView}, {@link StageParallaxView}.
 *
 * @example
 * ```ts
 * const stage = db.stages[db.stageIndex.get('test-range')!];
 * const runner = createStageRunner(stage, { event() {}, clear() {} });
 * const terrain = createStageTerrain(stage, db); // null for open space
 * runner.tick(); // once per sim tick (the World's phase 3)
 * if (terrain && boxHitsTerrain(terrain, x, y, 5, 3)) { … } // ship touched rock
 * runner.restartAt(runner.checkpoint); // after a death with the `arcade` penalty
 * ```
 *
 * **Planned API.** Time-keyed events during scroll stops and boss fights, diagonal scrolling,
 * in-stage branches and the zone map (M2-07, M2-10).
 *
 * @module
 */
import type { TerrainMap } from '../collision/index.js';
import { PLAYFIELD_W } from '../config/index.js';
import {
  STAGE_EVENT_TYPES,
  type ContentDb,
  type StageCameraKey,
  type StageEvent,
  type StageSpec,
} from '../data/index.js';
import { EASINGS } from '../math/index.js';
import { defineModule } from '../module-info.js';
import { LayerId, type ParallaxView, type TerrainView } from '../presentation/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'stage',
  status: 'implemented',
  specRefs: ['shmup_feat.md §14', 'shmup_feat.md §10', 'shmup_feat.md §22'],
});

/**
 * Numeric codes of the stage event types (their position in `STAGE_EVENT_TYPES`), handed to
 * {@link StageHooks.event} so nothing compares strings per tick.
 */
export const StageEventCode = {
  /** `spawn` — one enemy (M1-08). */
  Spawn: 0,
  /** `formation` — a timed group of enemies (M1-08). */
  Formation: 1,
  /** `warning` — the boss WARNING intro (M1-13). */
  Warning: 2,
  /** `boss` — the boss itself (M1-13). */
  Boss: 3,
  /** `music` — change the track. */
  Music: 4,
  /** `speed` — change the scroll speed (applied by the runner). */
  Speed: 5,
  /** `flag` — set / clear a stage flag (applied by the runner). */
  Flag: 6,
  /** `end` — the stage is over (applied by the runner). */
  End: 7,
} as const;

/** A {@link StageEventCode} value. */
export type StageEventCode = (typeof StageEventCode)[keyof typeof StageEventCode];

/**
 * The camera the runner drives: the view's top-left corner in world pixels and its last movement
 * (the World's camera satisfies it).
 */
export interface StageCamera {
  /** World x of the playfield's left edge. */
  x: number;
  /** World y of the playfield's top edge. */
  y: number;
  /** X movement of the last tick. */
  dx: number;
  /** Y movement of the last tick. */
  dy: number;
  /** Horizontal scroll velocity of the last tick (px/tick; equals `dx`). */
  vx: number;
  /** Vertical scroll velocity of the last tick (equals `dy`). */
  vy: number;
}

/**
 * The camera object's class: a constructor of its own gives camera objects a hidden class no
 * object literal shares, so its fields stay unboxed doubles.
 *
 * @remarks
 * V8 shares the hidden-class tree of object literals with the same property count and key order
 * prefix. A 6-key literal starting with `x` elsewhere (a content schema shape holding objects in
 * `x`, say) would generalise a literal camera's `x` field to "tagged", and every fractional write
 * would then allocate a heap number — per tick.
 */
class CameraState implements StageCamera {
  /** See {@link StageCamera.x}. */
  x = 0;
  /** See {@link StageCamera.y}. */
  y = 0;
  /** See {@link StageCamera.dx}. */
  dx = 0;
  /** See {@link StageCamera.dy}. */
  dy = 0;
  /** See {@link StageCamera.vx}. */
  vx = 0;
  /** See {@link StageCamera.vy}. */
  vy = 0;
}

/**
 * Creates a camera at world (0, 0), not moving.
 *
 * @returns A fresh camera (its own hidden class — see the remarks of the module's camera class).
 */
export function createStageCamera(): StageCamera {
  return new CameraState();
}

/** What the runner calls back into (the World implements it). */
export interface StageHooks {
  /**
   * An event fired (after the runner applied its own part of it). Called in timeline order.
   *
   * @param code - The event's {@link StageEventCode}.
   * @param event - The event (content data — read-only).
   * @param index - Its index in `stage.events`.
   */
  event(code: StageEventCode, event: StageEvent, index: number): void;
  /** A checkpoint restart: remove every enemy, bullet and item of the stage. */
  clear(): void;
}

/** Slots of {@link StageRunner.state}. */
export const StageSlot = {
  /** Current scroll speed (px/tick). */
  Speed: 0,
  /** Speed the ramp heads for. */
  Target: 1,
  /** Speed when the ramp started. */
  RampFrom: 2,
  /** Ramp length in ticks (0 = no ramp running). */
  RampTicks: 3,
  /** Ramp ticks done. */
  RampElapsed: 4,
  /** Camera y when the pan started. */
  PanFrom: 5,
  /** Camera y the pan heads for. */
  PanTo: 6,
  /** Pan length in ticks (0 = no pan running). */
  PanTicks: 7,
  /** Pan ticks done. */
  PanElapsed: 8,
  /** 1 while scroll-locked. */
  Locked: 9,
  /** Index of the next event to fire. */
  Cursor: 10,
  /** Index of the next camera key to apply. */
  NextKey: 11,
  /** Index of the next checkpoint to pass. */
  NextCheckpoint: 12,
  /** Index of the last passed checkpoint (-1 = none). */
  Checkpoint: 13,
  /** Stage flags (bit `flagId`). */
  Flags: 14,
  /** 1 once the `end` event fired. */
  Ended: 15,
  /** Ticks since the start or the last restart. */
  Ticks: 16,
  /** Restarts so far (a hook restarting mid-tick stops that tick's event loop). */
  Restarts: 17,
  /**
   * Events below this index fire for the hooks only: the last restart already applied their
   * runner part (the events at exactly the checkpoint's x).
   */
  Replay: 18,
} as const;

/** Number of slots in {@link StageRunner.state}. */
export const STAGE_STATE_SLOTS = 19;

/** Drives one stage (see the module docs). */
export interface StageRunner {
  /** The stage. */
  readonly stage: StageSpec;
  /** The camera the runner moves (the World's camera when created by `createWorld`). */
  readonly camera: StageCamera;
  /** {@link StageEventCode} per event of `stage.events`. */
  readonly eventCodes: Uint8Array;
  /** All numeric state, indexed by {@link StageSlot} (read-only outside the runner; hashed). */
  readonly state: Float64Array;
  /** Current scroll speed in px/tick. */
  readonly speed: number;
  /** Speed the current ramp heads for. */
  readonly targetSpeed: number;
  /** `true` while scroll-locked (a boss holds the camera). */
  readonly locked: boolean;
  /** Index of the next timeline event to fire. */
  readonly eventCursor: number;
  /** Index of the last checkpoint the camera passed (-1 before the first). */
  readonly checkpoint: number;
  /** Stage flags: bit `i` = `stage.flagNames[i]` is set. */
  readonly flags: number;
  /** `true` once the `end` event fired. */
  readonly ended: boolean;
  /** Ticks since the stage started or was last restarted. */
  readonly ticks: number;
  /** Advances the camera by one tick and fires the due events. Never allocates. */
  tick(): void;
  /**
   * Restarts from a checkpoint (death penalty `arcade`, continues): camera x at the checkpoint,
   * speed / pan / flags as the stage had them there (keys and events before it applied at once,
   * in live order — an event before a key at the same x, except the key at 0, which the first
   * tick applies before the events at 0 — then the runner part of the events at exactly its x),
   * the event cursor at the first event with `x ≥` the checkpoint (binary search; those events
   * re-fire on the next tick for the hooks), then `hooks.clear()`.
   *
   * @remarks
   * Deterministic: the result depends only on the stage data and the index, never on how the
   * run got there, so a restart matches what live play had at the checkpoint (exact for keys and
   * events sharing an x; see "Restart order" in the module docs for the one approximation). A
   * lock key before the checkpoint does not re-lock the camera. Calling it from inside
   * {@link StageHooks.event} is allowed: the current tick's event loop stops there.
   *
   * @param checkpoint - Index into `stage.checkpoints`, or -1 for the stage start.
   * @throws {RangeError} When the index is not an integer in `[-1, checkpoints.length)`.
   *
   * @example
   * ```ts
   * runner.restartAt(runner.checkpoint); // back to the last checkpoint passed (-1 = start)
   * ```
   */
  restartAt(checkpoint: number): void;
  /**
   * Releases a scroll lock (the boss died): scrolling resumes at the current speed — the lock
   * key's speed once its ramp is done. Calling it before the camera reaches the lock key does
   * nothing (the key locks when it applies).
   */
  unlock(): void;
}

/**
 * Index of the first event with `x ≥ scrollX` (binary search over the sorted timeline).
 *
 * @param events - The stage's events (sorted by `x`).
 * @param scrollX - Camera x.
 * @returns The cursor (`events.length` when every event lies before `scrollX`).
 *
 * @example
 * ```ts
 * findEventCursor([{ x: 0 }, { x: 100 }, { x: 100 }, { x: 250 }] as StageEvent[], 100); // → 1
 * ```
 */
export function findEventCursor(events: readonly StageEvent[], scrollX: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].x < scrollX) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * A stage's timeline compiled into typed arrays at runner creation, so `tick()` reads only
 * arrays and numbers (convention 1.5) — never the content objects, whose shapes vary with their
 * optional fields and would make the per-tick property loads megamorphic.
 */
interface CompiledStage {
  /** Camera key x. */
  readonly keyX: Float64Array;
  /** Camera key target speed. */
  readonly keySpeed: Float64Array;
  /** Camera key ramp ticks (0 = at once). */
  readonly keyRamp: Float64Array;
  /** Camera key pan target (`NaN` = no pan). */
  readonly keyYTo: Float64Array;
  /** Camera key pan ticks (at least 1 when the key pans). */
  readonly keyYTicks: Float64Array;
  /** 1 for a lock key. */
  readonly keyLock: Uint8Array;
  /**
   * Per key index `i` (and `keys.length`): the index of the first lock key at or after `i`
   * (`keys.length` = none) — what step 3 clamps the movement against.
   */
  readonly keyNextLock: Int32Array;
  /** Event x. */
  readonly eventX: Float64Array;
  /** {@link StageEventCode} per event. */
  readonly eventCode: Uint8Array;
  /** Speed of `speed` events. */
  readonly eventSpeed: Float64Array;
  /** Ramp of `speed` events. */
  readonly eventRamp: Float64Array;
  /** Flag bit of `flag` events (0 for other events). */
  readonly eventFlagBit: Uint32Array;
  /** 1 when a `flag` event sets its flag, 0 when it clears it. */
  readonly eventFlagSet: Uint8Array;
  /** Checkpoint x. */
  readonly checkpointX: Float64Array;
}

/**
 * Compiles a stage's keys, events and checkpoints into typed arrays (load time).
 *
 * @param stage - The stage.
 * @returns The arrays.
 * @throws {RangeError} When an event has a type the runtime does not know.
 */
function compileStage(stage: StageSpec): CompiledStage {
  const keys = stage.camera;
  const events = stage.events;
  const checkpoints = stage.checkpoints;
  const compiled: CompiledStage = {
    keyX: new Float64Array(keys.length),
    keySpeed: new Float64Array(keys.length),
    keyRamp: new Float64Array(keys.length),
    keyYTo: new Float64Array(keys.length),
    keyYTicks: new Float64Array(keys.length),
    keyLock: new Uint8Array(keys.length),
    keyNextLock: new Int32Array(keys.length + 1),
    eventX: new Float64Array(events.length),
    eventCode: new Uint8Array(events.length),
    eventSpeed: new Float64Array(events.length),
    eventRamp: new Float64Array(events.length),
    eventFlagBit: new Uint32Array(events.length),
    eventFlagSet: new Uint8Array(events.length),
    checkpointX: new Float64Array(checkpoints.length),
  };
  for (let i = 0; i < keys.length; i++) {
    const key: StageCameraKey = keys[i];
    compiled.keyX[i] = key.x;
    compiled.keySpeed[i] = key.speed;
    compiled.keyRamp[i] = key.ramp === undefined ? 0 : key.ramp;
    compiled.keyYTo[i] = key.yTo === undefined ? NaN : key.yTo;
    // A pan "at once" is a one-tick pan: the same tick's step moves the camera all the way.
    compiled.keyYTicks[i] = key.yTicks === undefined || key.yTicks <= 0 ? 1 : key.yTicks;
    compiled.keyLock[i] = key.lock === true ? 1 : 0;
  }
  compiled.keyNextLock[keys.length] = keys.length;
  for (let i = keys.length - 1; i >= 0; i--) {
    compiled.keyNextLock[i] = compiled.keyLock[i] !== 0 ? i : compiled.keyNextLock[i + 1];
  }
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const code = (STAGE_EVENT_TYPES as readonly string[]).indexOf(event.type);
    if (code < 0) throw new RangeError(`stage "${stage.id}": unknown event type ${event.type}`);
    compiled.eventX[i] = event.x;
    compiled.eventCode[i] = code;
    if (event.type === 'speed') {
      compiled.eventSpeed[i] = event.speed;
      compiled.eventRamp[i] = event.ramp === undefined ? 0 : event.ramp;
    } else if (event.type === 'flag') {
      compiled.eventFlagBit[i] = (1 << event.flagId) >>> 0;
      compiled.eventFlagSet[i] = event.value === false ? 0 : 1;
    }
  }
  for (let i = 0; i < checkpoints.length; i++) compiled.checkpointX[i] = checkpoints[i].x;
  return compiled;
}

/**
 * The runner's implementation. A class rather than a closure factory: every runner shares the
 * prototype's methods, so the optimised `tick()` sees one call target for its helpers no matter
 * how many runners a process creates (per-instance closures made V8 deoptimise it with "wrong
 * call target" and run it unoptimised — boxing every double — for a while after each new stage).
 */
class StageRunnerImpl implements StageRunner {
  /** See {@link StageRunner.stage}. */
  readonly stage: StageSpec;
  /** See {@link StageRunner.camera}. */
  readonly camera: StageCamera;
  /** See {@link StageRunner.eventCodes}. */
  readonly eventCodes: Uint8Array;
  /** See {@link StageRunner.state}. */
  readonly state: Float64Array;
  /** The hooks. */
  private readonly hooks: StageHooks;
  /** The timeline as typed arrays. */
  private readonly compiled: CompiledStage;

  /**
   * Compiles the timeline and puts the runner at the stage start (no `hooks.clear()`).
   *
   * @param stage - The stage.
   * @param hooks - The hooks.
   * @param camera - The camera to drive (its fields are overwritten).
   * @throws {RangeError} When an event has a type the runtime does not know.
   */
  constructor(stage: StageSpec, hooks: StageHooks, camera: StageCamera) {
    this.stage = stage;
    this.hooks = hooks;
    this.camera = camera;
    this.state = new Float64Array(STAGE_STATE_SLOTS);
    this.compiled = compileStage(stage);
    this.eventCodes = this.compiled.eventCode;
    this.reset(-1, false);
    this.state[StageSlot.Restarts] = 0;
  }

  /** See {@link StageRunner.speed}. */
  get speed(): number {
    return this.state[StageSlot.Speed];
  }

  /** See {@link StageRunner.targetSpeed}. */
  get targetSpeed(): number {
    return this.state[StageSlot.Target];
  }

  /** See {@link StageRunner.locked}. */
  get locked(): boolean {
    return this.state[StageSlot.Locked] !== 0;
  }

  /** See {@link StageRunner.eventCursor}. */
  get eventCursor(): number {
    return this.state[StageSlot.Cursor];
  }

  /** See {@link StageRunner.checkpoint}. */
  get checkpoint(): number {
    return this.state[StageSlot.Checkpoint];
  }

  /** See {@link StageRunner.flags}. */
  get flags(): number {
    return this.state[StageSlot.Flags];
  }

  /** See {@link StageRunner.ended}. */
  get ended(): boolean {
    return this.state[StageSlot.Ended] !== 0;
  }

  /** See {@link StageRunner.ticks}. */
  get ticks(): number {
    return this.state[StageSlot.Ticks];
  }

  /** See {@link StageRunner.tick}. */
  tick(): void {
    const state = this.state;
    const camera = this.camera;
    const compiled = this.compiled;
    const keyX = compiled.keyX;
    const keyCount = keyX.length;

    // 1. Camera keys the camera has reached.
    let nextKey = state[StageSlot.NextKey];
    while (nextKey < keyCount && keyX[nextKey] <= camera.x) {
      this.applyKey(nextKey);
      nextKey++;
    }
    state[StageSlot.NextKey] = nextKey;

    // 2. Speed ramp (linear, exact at the end) and vertical pan (eased).
    const rampTicks = state[StageSlot.RampTicks];
    if (state[StageSlot.RampElapsed] < rampTicks) {
      const elapsed = state[StageSlot.RampElapsed] + 1;
      state[StageSlot.RampElapsed] = elapsed;
      const from = state[StageSlot.RampFrom];
      const target = state[StageSlot.Target];
      state[StageSlot.Speed] =
        elapsed >= rampTicks ? target : from + (target - from) * (elapsed / rampTicks);
    }
    let y = camera.y;
    const panTicks = state[StageSlot.PanTicks];
    if (state[StageSlot.PanElapsed] < panTicks) {
      const elapsed = state[StageSlot.PanElapsed] + 1;
      state[StageSlot.PanElapsed] = elapsed;
      const from = state[StageSlot.PanFrom];
      const to = state[StageSlot.PanTo];
      y = elapsed >= panTicks ? to : from + (to - from) * EASINGS.inOutQuad(elapsed / panTicks);
    }

    // 3. Move: not while locked, never past the first pending lock key (other pending keys may
    // lie before it within this tick's movement) or the stage end.
    let dx = state[StageSlot.Locked] !== 0 ? 0 : state[StageSlot.Speed];
    const lock = compiled.keyNextLock[nextKey];
    if (lock < keyCount) {
      const stop = keyX[lock] - camera.x;
      if (dx > stop) dx = stop > 0 ? stop : 0;
    }
    const room = this.stage.length - camera.x;
    if (dx > room) dx = room > 0 ? room : 0;
    const dy = y - camera.y;
    camera.dx = dx;
    camera.dy = dy;
    camera.vx = dx;
    camera.vy = dy;
    camera.x += dx;
    camera.y = y;

    // 4. Every event the camera reached, in order, exactly once.
    const eventX = compiled.eventX;
    const restarts = state[StageSlot.Restarts];
    let cursor = state[StageSlot.Cursor];
    while (cursor < eventX.length && eventX[cursor] <= camera.x) {
      state[StageSlot.Cursor] = cursor + 1;
      this.fire(cursor);
      if (state[StageSlot.Restarts] !== restarts) return; // a hook restarted the stage
      cursor = state[StageSlot.Cursor];
    }

    // 5. The last checkpoint passed.
    const checkpointX = compiled.checkpointX;
    let next = state[StageSlot.NextCheckpoint];
    while (next < checkpointX.length && checkpointX[next] <= camera.x) {
      state[StageSlot.Checkpoint] = next;
      next++;
    }
    state[StageSlot.NextCheckpoint] = next;
    state[StageSlot.Ticks]++;
  }

  /** See {@link StageRunner.restartAt}. */
  restartAt(checkpoint: number): void {
    this.reset(checkpoint, true);
  }

  /** See {@link StageRunner.unlock}. */
  unlock(): void {
    this.state[StageSlot.Locked] = 0;
  }

  /**
   * Sets a new target speed, reached linearly over `ramp` ticks (at once when `ramp ≤ 0`).
   *
   * @param speed - Target speed.
   * @param ramp - Ramp length in ticks.
   */
  private setTarget(speed: number, ramp: number): void {
    const state = this.state;
    state[StageSlot.Target] = speed;
    state[StageSlot.RampElapsed] = 0;
    if (ramp > 0) {
      state[StageSlot.RampFrom] = state[StageSlot.Speed];
      state[StageSlot.RampTicks] = ramp;
    } else {
      state[StageSlot.Speed] = speed;
      state[StageSlot.RampTicks] = 0;
    }
  }

  /**
   * Applies the camera key the camera reached.
   *
   * @param index - Key index.
   */
  private applyKey(index: number): void {
    const state = this.state;
    const compiled = this.compiled;
    this.setTarget(compiled.keySpeed[index], compiled.keyRamp[index]);
    const yTo = compiled.keyYTo[index];
    if (yTo === yTo) {
      state[StageSlot.PanFrom] = this.camera.y;
      state[StageSlot.PanTo] = yTo;
      state[StageSlot.PanTicks] = compiled.keyYTicks[index];
      state[StageSlot.PanElapsed] = 0;
    }
    if (compiled.keyLock[index] !== 0) state[StageSlot.Locked] = 1;
  }

  /**
   * Sets or clears the flag bit of a `flag` event.
   *
   * @param index - Event index.
   */
  private applyFlag(index: number): void {
    const state = this.state;
    const bit = this.compiled.eventFlagBit[index];
    const flags = state[StageSlot.Flags];
    state[StageSlot.Flags] =
      this.compiled.eventFlagSet[index] !== 0 ? (flags | bit) >>> 0 : (flags & ~bit) >>> 0;
  }

  /**
   * Fires one event: the runner's own part, then the hooks.
   *
   * @param index - Event index.
   */
  private fire(index: number): void {
    const code = this.compiled.eventCode[index] as StageEventCode;
    // Events at a restart checkpoint's x already had their runner part applied by the restart.
    if (index >= this.state[StageSlot.Replay]) this.applyEvent(index, code, true);
    this.hooks.event(code, this.stage.events[index], index);
  }

  /**
   * The runner's own part of an event: `speed` sets the target speed, `flag` sets / clears its
   * flag, `end` ends the stage.
   *
   * @param index - Event index.
   * @param code - Its {@link StageEventCode}.
   * @param live - Apply it as live play does (a speed ramp starts; `end` ends the stage); `false`
   *   applies an event long passed at a restart (the speed at once, `end` ignored).
   */
  private applyEvent(index: number, code: StageEventCode, live: boolean): void {
    const state = this.state;
    const compiled = this.compiled;
    if (code === StageEventCode.Speed) {
      const speed = compiled.eventSpeed[index];
      if (live) {
        this.setTarget(speed, compiled.eventRamp[index]);
      } else {
        state[StageSlot.Speed] = speed;
        state[StageSlot.Target] = speed;
      }
    } else if (code === StageEventCode.Flag) {
      this.applyFlag(index);
    } else if (code === StageEventCode.End && live) {
      state[StageSlot.Ended] = 1;
    }
  }

  /**
   * Resets the runner to a checkpoint (see {@link StageRunner.restartAt}).
   *
   * @param index - Checkpoint index or -1.
   * @param notify - Call `hooks.clear()` afterwards.
   * @throws {RangeError} When the index is out of range.
   */
  private reset(index: number, notify: boolean): void {
    const state = this.state;
    const camera = this.camera;
    const compiled = this.compiled;
    const checkpointX = compiled.checkpointX;
    if (!Number.isInteger(index) || index < -1 || index >= checkpointX.length) {
      throw new RangeError(
        `checkpoint must be an integer in [-1, ${checkpointX.length}), got ${index}`,
      );
    }
    const x = index < 0 ? 0 : checkpointX[index];
    const restarts = state[StageSlot.Restarts];
    state.fill(0);
    state[StageSlot.Restarts] = restarts + 1;
    camera.x = x;
    camera.y = 0;
    camera.dx = 0;
    camera.dy = 0;
    camera.vx = 0;
    camera.vy = 0;
    // Re-derive the state at x in live order (see "Restart order" in the module docs): an event
    // fires on the tick the camera reaches its x, a key applies one tick later, so on a tie the
    // event goes first — except at x 0, where the camera starts: the first tick applies the key
    // at 0 before it fires the events at 0. Keys and events before x apply at once; the events
    // at exactly x as live play fired them on arrival (they re-fire next tick for the hooks
    // only — `Replay`); keys at x stay pending for the next tick. At x 0 nothing was reached
    // yet: the first tick applies the keys at 0 and fires the events at 0, like a fresh stage.
    const keyX = compiled.keyX;
    const eventX = compiled.eventX;
    const cursor = findEventCursor(this.stage.events, x);
    let replay = cursor;
    if (x > 0) while (replay < eventX.length && eventX[replay] <= x) replay++;
    let k = 0;
    let e = 0;
    while (true) {
      const keyDue = k < keyX.length && keyX[k] < x;
      const eventDue = e < replay;
      if (!keyDue && !eventDue) break;
      if (keyDue && (!eventDue || keyX[k] < eventX[e] || keyX[k] === 0)) {
        const speed = compiled.keySpeed[k];
        state[StageSlot.Speed] = speed;
        state[StageSlot.Target] = speed;
        const yTo = compiled.keyYTo[k];
        if (yTo === yTo) camera.y = yTo;
        k++;
      } else {
        this.applyEvent(e, compiled.eventCode[e] as StageEventCode, e >= cursor);
        e++;
      }
    }
    state[StageSlot.NextKey] = k;
    state[StageSlot.Cursor] = cursor;
    state[StageSlot.Replay] = replay;
    state[StageSlot.Checkpoint] = index;
    state[StageSlot.NextCheckpoint] = index + 1;
    if (notify) this.hooks.clear();
  }
}

/**
 * Creates the runner of a stage, at the stage start (camera x 0, y 0, speed 0 — the first camera
 * key applies on the first tick, with its ramp).
 *
 * @param stage - The stage (validated by `loadContent`: keys, checkpoints and events sorted).
 * @param hooks - Receives every fired event and checkpoint clears.
 * @param camera - Camera object to drive (default: {@link createStageCamera}). Its fields are
 *   overwritten.
 * @returns The runner.
 * @throws {RangeError} When an event has a type the runtime does not know (content that did not
 *   come through `loadContent`).
 *
 * @example
 * ```ts
 * const runner = createStageRunner(db.stages[0], {
 *   event(code, event) { if (code === StageEventCode.Music) playMusic(event); },
 *   clear() {},
 * });
 * for (let i = 0; i < 600; i++) runner.tick();
 * runner.camera.x; // → how far ten seconds scrolled
 * ```
 */
export function createStageRunner(
  stage: StageSpec,
  hooks: StageHooks,
  camera: StageCamera = createStageCamera(),
): StageRunner {
  return new StageRunnerImpl(stage, hooks, camera);
}

/**
 * Width in tiles of a stage's map: the stage length plus one screen, rounded up (the camera's
 * right edge reaches `length + PLAYFIELD_W`).
 *
 * @param length - Stage length in pixels.
 * @param tileSize - Tile edge in pixels.
 * @returns Columns.
 *
 * @example
 * ```ts
 * stageMapWidth(4800, 8); // → 648 (test-range: (4800 + 384) / 8)
 * ```
 */
export function stageMapWidth(length: number, tileSize: number): number {
  return Math.ceil((length + PLAYFIELD_W) / tileSize);
}

/**
 * Builds the collision map of a stage: a private copy of its expanded tile grid plus its
 * tileset's lookup tables (load time).
 *
 * @remarks
 * The tile grid is copied so that a World may change its map (destructible terrain, M2-07)
 * without touching the shared content; the tileset tables are shared read-only references.
 *
 * @param stage - The stage.
 * @param content - The content DB holding its tileset.
 * @returns The map, or `null` for an open-space stage (no tilemap, or it failed to expand).
 */
export function createStageTerrain(stage: StageSpec, content: ContentDb): TerrainMap | null {
  const terrain = stage.terrain;
  if (terrain === null) return null;
  const tileset = content.tilesets[terrain.tilesetId];
  if (tileset === undefined) return null;
  return {
    tileSize: terrain.tileSize,
    cols: terrain.cols,
    rows: terrain.rows,
    tiles: terrain.tiles.slice(),
    tileType: tileset.tables.type,
    tileAnchor: tileset.tables.anchor,
    tileMask: tileset.tables.mask,
  };
}

/**
 * The terrain view the renderer draws: live references to a collision map's grid, plus the
 * tileset's sprite and per-tile frames.
 *
 * @remarks
 * `tiles` is the map's own array, not a copy, so a later change to the collision map (the
 * destructible tiles of M2-07) is what the renderer draws once the cell scrolls into view.
 *
 * @param map - The stage's collision map ({@link createStageTerrain}).
 * @param stage - The stage.
 * @param content - The content DB holding its tileset.
 * @returns The view (the renderer re-reads `tiles` as the camera crosses tile columns).
 * @throws {RangeError} When the stage has no expanded terrain or its tileset is missing.
 *
 * @example
 * ```ts
 * const map = createStageTerrain(stage, db);
 * const view = map === null ? null : createTerrainView(map, stage, db);
 * ```
 */
export function createTerrainView(
  map: TerrainMap,
  stage: StageSpec,
  content: ContentDb,
): TerrainView {
  const tileset = stage.terrain === null ? undefined : content.tilesets[stage.terrain.tilesetId];
  if (tileset === undefined) {
    throw new RangeError(`stage "${stage.id}" has no terrain to view`);
  }
  return {
    tileSize: map.tileSize,
    cols: map.cols,
    rows: map.rows,
    tiles: map.tiles,
    tilesetSpriteId: tileset.spriteId,
    tileFrame: tileset.tables.frame,
  };
}

/** A writable {@link ParallaxView} plus the scroll factors {@link updateParallaxView} needs. */
export interface StageParallaxView extends ParallaxView {
  /** Bands. */
  readonly count: number;
  /** {@link LayerId} per band (`BgFar` / `BgMid`). */
  readonly layer: Uint8Array;
  /** Sprite id per band. */
  readonly spriteId: Uint16Array;
  /** Current horizontal scroll offset per band, `0 ≤ offsetX < spacing`. */
  readonly offsetX: Float64Array;
  /** Current playfield row of each band's top edge. */
  readonly y: Float64Array;
  /** Repeat distance per band. */
  readonly spacing: Uint16Array;
  /** Scroll factor per band. */
  readonly factor: Float64Array;
  /** Band row at camera y 0. */
  readonly baseY: Float64Array;
}

/**
 * Builds the parallax view of a stage (one band per `stage.parallax` entry, far to near).
 *
 * @param stage - The stage.
 * @returns The view (offsets at camera 0), or `null` when the stage has no parallax bands.
 */
export function createParallaxView(stage: StageSpec): StageParallaxView | null {
  const bands = stage.parallax;
  if (bands.length === 0) return null;
  const count = bands.length;
  const view: StageParallaxView = {
    count,
    layer: new Uint8Array(count),
    spriteId: new Uint16Array(count),
    offsetX: new Float64Array(count),
    y: new Float64Array(count),
    spacing: new Uint16Array(count),
    factor: new Float64Array(count),
    baseY: new Float64Array(count),
  };
  for (let i = 0; i < count; i++) {
    const band = bands[i];
    view.layer[i] = band.layer === 'far' ? LayerId.BgFar : LayerId.BgMid;
    view.spriteId[i] = band.spriteId < 0 ? 0xffff : band.spriteId;
    view.spacing[i] = band.spacing;
    view.factor[i] = band.factor;
    view.baseY[i] = band.y;
  }
  updateParallaxView(view, 0, 0);
  return view;
}

/**
 * Scrolls the parallax bands with the camera: `offsetX = (camera.x · factor) mod spacing`,
 * `y = baseY − camera.y · factor`. Never allocates.
 *
 * @param view - The view.
 * @param cameraX - Camera x.
 * @param cameraY - Camera y.
 *
 * @example
 * ```ts
 * // A band with factor 0.25 and spacing 128, camera at x 1000:
 * updateParallaxView(view, 1000, 0); // view.offsetX[i] → 122 (250 mod 128)
 * ```
 */
export function updateParallaxView(
  view: StageParallaxView,
  cameraX: number,
  cameraY: number,
): void {
  for (let i = 0; i < view.count; i++) {
    const factor = view.factor[i];
    const spacing = view.spacing[i];
    const scrolled = cameraX * factor;
    view.offsetX[i] = scrolled - Math.floor(scrolled / spacing) * spacing;
    view.y[i] = view.baseY[i] - cameraY * factor;
  }
}
