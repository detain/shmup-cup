/**
 * # stage — stage runtime: camera path, timeline, checkpoints, terrain, parallax
 *
 * **Responsibility.** Runs one stage (`content/stages/*.stage.json`, validated and expanded by
 * `core/data`):
 *
 * - the **scripted camera path** — speed keys with linear ramps, scroll stops, vertical pans
 *   (`yTo` over `yTicks`, eased), boss **scroll locks** (the camera stops exactly at the lock key
 *   and waits for {@link StageRunner.unlock}), the boss WARNING's **brake** (decelerate, then
 *   locked — {@link StageRunner.brake}, M1-13), `speed` events for scripted / high-speed
 *   sections; the camera never scrolls past the stage `length`;
 * - the **event timeline** — events are pre-sorted by camera x and consumed through a cursor:
 *   every tick fires, in order, each event with `x ≤ camera.x`, exactly once (several may fire on
 *   one tick). The runner applies `speed`, `flag` and `end` itself and hands **every** event to
 *   its {@link StageHooks} (the World spawns enemies from them from M1-08, starts bosses in M1-13
 *   and emits music changes now);
 * - **invisible checkpoints** (shmup_feat.md §10) — the last passed checkpoint is tracked;
 *   {@link StageRunner.restartAt} puts the camera back, re-derives the scroll speed, pan and flags
 *   the stage had there, finds the event cursor by binary search (events at exactly the
 *   checkpoint's x fire again, for the hooks) and calls `hooks.clear()`; {@link StageRunner.jumpTo}
 *   does the same at any scroll x (the debug stage skip of M1-18);
 * - the **terrain** and **parallax** descriptions: {@link createStageTerrain} turns the stage's
 *   expanded tile grid into the `TerrainMap` the collision queries read (a private copy, so the
 *   destructible terrain cannot touch the content), {@link createTerrainView} /
 *   {@link createParallaxView} build the read-only views the renderer draws and
 *   {@link updateParallaxView} scrolls the bands with the camera;
 * - since M2-07 the **advanced stage systems** (shmup_feat.md §14): timed scroll stops (`hold`
 *   keys — vertical sections), diagonal pans (`yOver`: the camera y follows the scroll x), in-stage
 *   **branches** (an event naming a branch fires only while its flag has the branch's value;
 *   {@link StageRunner.eventActive}) and **region triggers** (`trigger` events arm a world rectangle;
 *   the first living ship inside it sets / clears a flag — {@link StageRunner.probe}); high-speed
 *   sections are the speed keys and `speed` events (up to 16 px/tick). The World-side systems —
 *   destructible terrain, moving blocks (`block` events), pull fields and chains of gimmick
 *   scripts — are {@link StageGimmicks} (`./systems.ts`).
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
 * **Holds, diagonal pans (M2-07).** A `hold` key is a stop key like a lock: the camera halts
 * exactly at its x, and when the key applies it stays `hold` ticks (a `yTo` pan of the key runs
 * meanwhile), then scrolls on at the key's speed with its ramp. A `yOver` key pans linearly: the
 * camera y goes from where it was to `yTo` while the camera x goes from the key's x to `x + yOver`
 * (so a speed change mid-pan keeps the slope).
 *
 * **Following (M2-09).** A battleship raid (`core/bosses`) makes the camera follow a target it
 * moves around the boss ({@link StageRunner.follow}): while set, step 3 puts the camera on the
 * target (the recorded `dx` / `dy` carry the ships along) instead of scrolling. The timeline
 * stays where the follow began — no key, event, checkpoint or trigger disarm past that x until the
 * camera is back — so a pan beyond the boss cannot fire the `end` event. `null` hands the camera
 * back to the scroll, a restart forgets the target.
 *
 * **Branches and triggers (M2-07).** Branches are data (`StageSpec.branches`: id, flag, value); an
 * event with a `branch` is skipped — no runner part, no hooks — when the camera reaches it while
 * its branch is not taken. A `trigger` event arms its region (its runner part); every tick the
 * World probes the armed regions with its living ships; a trigger fires once (setting or clearing
 * its flag), and disarms when the camera passes its `until`. The armed / fired masks are slots of
 * the state array (hashed).
 *
 * **Restart order.** {@link StageRunner.restartAt} replays that order by x: keys and events
 * before the checkpoint at once, an event before a key at the same x (but the key at 0 before
 * the events at 0, as the first tick applies them); then the events at exactly the checkpoint's
 * x (as live play fired them on arrival: speed ramps start, flags and `end` apply), which
 * re-fire on the next tick for the hooks only; keys at the checkpoint's x apply on that tick, as
 * live play applied them the tick after arriving. Exact for ties; a key and a speed event less
 * than one tick's movement apart (key first) are replayed key → event, while live play may have
 * crossed both in one tick (event → key). Branch-gated events are re-derived under the flags as
 * they evolve in that order; a trigger before the restart x that had fired applies its flag at its
 * place in the timeline (live play fired it later, while it was armed — an approximation) and stays
 * fired, one that had not is armed again while its region lies ahead; a diagonal pan running at the
 * restart x resumes where live play had it (a `yTo` key replayed while an earlier diagonal pan
 * still runs starts from that pan's y at the key's x, as live play did).
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
 * {@link StageEventCode}, {@link StageSlot}, {@link STAGE_STATE_SLOTS}, {@link findEventCursor},
 * {@link StageCameraTarget} (M2-09: {@link StageRunner.follow} — a raid's camera path);
 * camera {@link StageCamera}, {@link createStageCamera}; terrain {@link createStageTerrain},
 * {@link createTerrainView}, {@link stageMapWidth}; parallax {@link createParallaxView},
 * {@link updateParallaxView}, {@link StageParallaxView}; presentation effects
 * {@link createStageEffectsView} (M2-08); M2-07 (from `./systems.ts`)
 * {@link StageGimmicks}, {@link StageGimmicksHost}, {@link createStageGimmicks},
 * {@link MovingBlockSystem}, {@link MAX_PULL_FIELDS}, {@link MAX_CHAINS}, {@link MAX_CHAIN_LINKS},
 * {@link CHAIN_SPRITE}, {@link GIMMICK_SPRITES}, {@link BLOCK_DESPAWN_MARGIN},
 * {@link BLOCK_BATCH_CAPACITY}.
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
 * **Bonus entrances (M2-10, `./bonus.ts`).** {@link BonusEntrances}, {@link BonusEntrancesHost},
 * {@link createBonusEntrances}, {@link BonusEntrance}: a stage's `bonus` events (hidden bonus-stage
 * entrances — a marked gap, all ground targets destroyed, a score digit) armed through the World's
 * stage hook ({@link StageEventCode}.Bonus) and tested in phase 3; the scene flow runs the bonus
 * stage itself.
 *
 * @module
 */
import { MAX_TERRAIN_BLOCKS, TerrainBlocks, type TerrainMap } from '../collision/index.js';
import { PLAYFIELD_W } from '../config/index.js';
import {
  STAGE_EVENT_TYPES,
  stageEventInLoop,
  type ContentDb,
  type StageCameraKey,
  type StageEvent,
  type StageSpec,
} from '../data/index.js';
import { EASINGS } from '../math/index.js';
import { defineModule } from '../module-info.js';
import {
  LayerId,
  RasterKind,
  type ColorCycleView,
  type ParallaxView,
  type RasterEffectView,
  type StageEffectsView,
  type TerrainChanges,
  type TerrainView,
} from '../presentation/index.js';

export {
  BLOCK_BATCH_CAPACITY,
  BLOCK_DESPAWN_MARGIN,
  CHAIN_SPRITE,
  GIMMICK_SPRITES,
  MAX_CHAINS,
  MAX_CHAIN_LINKS,
  MAX_PULL_FIELDS,
  MovingBlockSystem,
  StageGimmicks,
  createStageGimmicks,
  type StageGimmicksHost,
} from './systems.js';
export {
  BonusEntrance,
  BonusEntrances,
  createBonusEntrances,
  type BonusEntrancesHost,
} from './bonus.js';

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
  /** `trigger` — arm a region trigger (applied by the runner, M2-07). */
  Trigger: 8,
  /** `block` — a moving block (the World's `MovingBlockSystem`, M2-07). */
  Block: 9,
  /** `bonus` — a hidden bonus-stage entrance arms (the World's `BonusEntrances`, M2-10). */
  Bonus: 10,
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
  /**
   * 1 while a brake (the boss WARNING, {@link StageRunner.brake}) holds the camera: decelerating,
   * then locked, until {@link StageRunner.unlock}.
   */
  Braking: 19,
  /** Speed scrolling resumes at after a brake (the keys and `speed` events met while braking). */
  ResumeSpeed: 20,
  /** Ramp of the brake in ticks (also the ramp back up after the unlock). */
  BrakeRamp: 21,
  /** Ticks a `hold` key still holds the camera (0 = none; M2-07). */
  Hold: 22,
  /** Index of the key holding the camera (its speed and ramp apply when the hold ends). */
  HoldKey: 23,
  /** Length in scroll pixels of the running diagonal pan (0 = none; M2-07 `yOver`). */
  PanOver: 24,
  /** Camera x where the running diagonal pan started (its key's x). */
  PanStartX: 25,
  /** Armed triggers: bit `t` = trigger `t` (in timeline order) is armed (M2-07). */
  TriggersArmed: 26,
  /** Fired triggers: bit `t` = trigger `t` fired (M2-07; kept by restarts behind them). */
  TriggersFired: 27,
} as const;

/** Number of slots in {@link StageRunner.state}. */
export const STAGE_STATE_SLOTS = 28;

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
  /** `true` while a `hold` key holds the camera (M2-07). */
  readonly holding: boolean;
  /** Armed triggers as a bit mask (bit `t` = the stage's `t`-th `trigger` event; M2-07). */
  readonly triggersArmed: number;
  /** Fired triggers as a bit mask (M2-07). */
  readonly triggersFired: number;
  /** Advances the camera by one tick and fires the due events. Never allocates. */
  tick(): void;
  /**
   * The loop the runner plays (M3-01 — `GameConfig.loop`): events whose `minLoop` / `maxLoop`
   * exclude it (`core/data` `stageEventInLoop`) never fire.
   */
  readonly loop: number;
  /**
   * Whether an event's branch is taken right now (M2-07): `true` for an event without a branch,
   * else whether its branch's flag has the branch's value. The timeline skips an event whose branch
   * is not taken when the camera reaches it. Since M3-01 an event of another loop (the remix of
   * the loops — `minLoop` / `maxLoop`) is never active.
   *
   * @param index - Index in `stage.events`.
   * @returns `true` when it would fire.
   */
  eventActive(index: number): boolean;
  /**
   * Sets or clears a stage flag (M2-07: what `flag` events and triggers do; scripts and tools may
   * too). Never allocates.
   *
   * @param flagId - Index in `stage.flagNames` (0 … 31; others do nothing).
   * @param value - `true` sets, `false` clears.
   */
  setFlag(flagId: number, value: boolean): void;
  /**
   * Tests a point — a living ship's centre — against every armed region trigger (M2-07): each one
   * whose region contains it (left / top edges inclusive, right / bottom exclusive) fires (sets /
   * clears its flag) and disarms. Never allocates.
   *
   * @remarks
   * Takes the point object (a ship), not two numbers: V8 boxes fractional arguments of a call it
   * does not inline.
   *
   * @param point - The point (its `x` / `y` in world pixels).
   * @returns Triggers fired by this call.
   *
   * @example
   * ```ts
   * for (const ship of world.players) if (ship.state === 'alive') runner.probe(ship);
   * ```
   */
  probe(point: { readonly x: number; readonly y: number }): number;
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
   * Jumps to any scroll x (the debug stage skip — `core/debug` `skipToBoss`, M1-18): exactly like
   * {@link StageRunner.restartAt} at a checkpoint lying at `x` — speed / pan / flags re-derived
   * from the keys and events before it, the events at exactly `x` re-fired for the hooks on the
   * next tick, the cursor at the first event with `x ≥` it, then `hooks.clear()` — and the last
   * passed checkpoint becomes the last one at or before `x` (-1 when none).
   *
   * @remarks
   * `jumpTo(checkpoints[i].x)` leaves the runner in the same state as `restartAt(i)`; without a
   * checkpoint at 0, `jumpTo(0)` equals `restartAt(-1)`. Allowed from inside
   * {@link StageHooks.event}, like a restart.
   *
   * @param x - Scroll x, `0 … stage.length`.
   * @throws {RangeError} When `x` is not a finite number in `[0, stage.length]`.
   *
   * @example
   * ```ts
   * runner.jumpTo(8500); // a little before the zone's WARNING
   * ```
   */
  jumpTo(x: number): void;
  /**
   * Releases a scroll lock (the boss died): scrolling resumes at the current speed — the lock
   * key's speed once its ramp is done. Calling it before the camera reaches the lock key does
   * nothing (the key locks when it applies). A brake ({@link StageRunner.brake}) is released too:
   * the speed ramps back up over the brake's ramp to the speed the stage asks for by now.
   */
  unlock(): void;
  /**
   * Brakes the camera to a scroll lock (the boss WARNING — `core/bosses`, M1-13): the speed ramps
   * linearly to 0 over `ticks` ticks (at once for `ticks ≤ 0`), then the camera is locked until
   * {@link StageRunner.unlock}.
   *
   * @remarks
   * While braking or locked by a brake, camera keys and `speed` events the camera still reaches
   * keep their pans and locks but only record their speed ({@link StageSlot.ResumeSpeed}) for
   * the unlock. A second brake while one holds changes nothing. A restart
   * ({@link StageRunner.restartAt}) forgets the brake.
   *
   * @param ticks - Deceleration ticks.
   *
   * @example
   * ```ts
   * runner.brake(60); // a second to stop, then locked
   * // … the boss dies:
   * runner.unlock(); // back up to speed over 60 ticks
   * ```
   */
  brake(ticks: number): void;
  /**
   * The target the camera follows (M2-09 — a battleship raid's boss-relative camera path,
   * `core/bosses`), or `null`.
   */
  readonly following: StageCameraTarget | null;
  /**
   * Makes the camera follow a target (M2-09, a raid): while set, step 3 of every tick moves the
   * camera **to the target's x / y** instead of scrolling (the speed, the pans and the stop keys
   * wait; the stage length still caps x), recording `dx` / `dy` so the ships, shots and bullets
   * ride along. `null` stops following: scrolling resumes from where the camera is.
   *
   * @remarks
   * The **timeline stays where the follow began**: while following, camera keys, events,
   * checkpoints and trigger disarms go no further than the camera x at the `follow(target)` call
   * (a raid's pan past the boss must not fire the stage's `end` or use up the spawns beyond it).
   * The owner brings the camera back there before `follow(null)` — a raid's return — and the
   * timeline carries on from it; a camera handed back further on catches up on the next tick.
   * Re-targeting while following keeps the original x.
   *
   * The owner writes the target's fields before the runner's tick (the boss system in phase 3);
   * the runner only reads them — never allocates. A restart ({@link StageRunner.restartAt},
   * {@link StageRunner.jumpTo}) forgets the target. The target is not part of
   * {@link StageRunner.state}: its owner hashes it.
   *
   * @param target - The target (a reused object), or `null`.
   *
   * @example
   * ```ts
   * const target = { x: runner.camera.x, y: runner.camera.y };
   * runner.brake(0); // locked…
   * runner.follow(target); // …and following: target.x += 1 per tick pans the view
   * ```
   */
  follow(target: StageCameraTarget | null): void;
}

/**
 * Where the camera goes while a {@link StageRunner} follows it (M2-09): the view's top-left corner
 * in world pixels, written by the target's owner every tick.
 */
export interface StageCameraTarget {
  /** World x of the playfield's left edge to move to. */
  readonly x: number;
  /** World y of the playfield's top edge to move to. */
  readonly y: number;
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
  /** Camera key hold ticks (0 = none; M2-07). */
  readonly keyHold: Float64Array;
  /** Camera key diagonal-pan length in scroll pixels (0 = a timed pan or none; M2-07). */
  readonly keyYOver: Float64Array;
  /**
   * Per key index `i` (and `keys.length`): the index of the first **stop** key — a lock or a hold
   * — at or after `i` (`keys.length` = none): what step 3 clamps the movement against.
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
  /** Flag bit of an event's branch (0 = no branch — always fires; M2-07). */
  readonly eventBranchBit: Uint32Array;
  /** 1 when the branch is taken with its flag set, 0 when with it clear. */
  readonly eventBranchValue: Uint8Array;
  /** Trigger ordinal of a `trigger` event (-1 for other events; M2-07). */
  readonly eventTrigger: Int8Array;
  /** Trigger regions (ordinal order): left edge. */
  readonly triggerX0: Float64Array;
  /** Trigger regions: top edge. */
  readonly triggerY0: Float64Array;
  /** Trigger regions: right edge (exclusive). */
  readonly triggerX1: Float64Array;
  /** Trigger regions: bottom edge (exclusive). */
  readonly triggerY1: Float64Array;
  /** Camera x past which a trigger disarms. */
  readonly triggerUntil: Float64Array;
  /** Flag bit a trigger sets / clears. */
  readonly triggerBit: Uint32Array;
  /** 1 when a trigger sets its flag, 0 when it clears it. */
  readonly triggerSet: Uint8Array;
  /** Checkpoint x. */
  readonly checkpointX: Float64Array;
}

/** Most triggers the runner tracks (the bits of one 32-bit mask). */
const MAX_TRIGGERS = 32;

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
  let triggers = 0;
  for (const event of events) if (event.type === 'trigger' && triggers < MAX_TRIGGERS) triggers++;
  const compiled: CompiledStage = {
    keyX: new Float64Array(keys.length),
    keySpeed: new Float64Array(keys.length),
    keyRamp: new Float64Array(keys.length),
    keyYTo: new Float64Array(keys.length),
    keyYTicks: new Float64Array(keys.length),
    keyLock: new Uint8Array(keys.length),
    keyHold: new Float64Array(keys.length),
    keyYOver: new Float64Array(keys.length),
    keyNextLock: new Int32Array(keys.length + 1),
    eventX: new Float64Array(events.length),
    eventCode: new Uint8Array(events.length),
    eventSpeed: new Float64Array(events.length),
    eventRamp: new Float64Array(events.length),
    eventFlagBit: new Uint32Array(events.length),
    eventFlagSet: new Uint8Array(events.length),
    eventBranchBit: new Uint32Array(events.length),
    eventBranchValue: new Uint8Array(events.length),
    eventTrigger: new Int8Array(events.length),
    triggerX0: new Float64Array(triggers),
    triggerY0: new Float64Array(triggers),
    triggerX1: new Float64Array(triggers),
    triggerY1: new Float64Array(triggers),
    triggerUntil: new Float64Array(triggers),
    triggerBit: new Uint32Array(triggers),
    triggerSet: new Uint8Array(triggers),
    checkpointX: new Float64Array(checkpoints.length),
  };
  const branches = stage.branches ?? [];
  for (let i = 0; i < keys.length; i++) {
    const key: StageCameraKey = keys[i];
    compiled.keyX[i] = key.x;
    compiled.keySpeed[i] = key.speed;
    compiled.keyRamp[i] = key.ramp === undefined ? 0 : key.ramp;
    compiled.keyYTo[i] = key.yTo === undefined ? NaN : key.yTo;
    // A pan "at once" is a one-tick pan: the same tick's step moves the camera all the way.
    compiled.keyYTicks[i] = key.yTicks === undefined || key.yTicks <= 0 ? 1 : key.yTicks;
    compiled.keyLock[i] = key.lock === true ? 1 : 0;
    compiled.keyHold[i] = key.hold !== undefined && key.hold > 0 ? Math.floor(key.hold) : 0;
    compiled.keyYOver[i] = key.yOver !== undefined && key.yOver > 0 ? key.yOver : 0;
  }
  compiled.keyNextLock[keys.length] = keys.length;
  for (let i = keys.length - 1; i >= 0; i--) {
    const stop = compiled.keyLock[i] !== 0 || compiled.keyHold[i] > 0;
    compiled.keyNextLock[i] = stop ? i : compiled.keyNextLock[i + 1];
  }
  let trigger = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const code = (STAGE_EVENT_TYPES as readonly string[]).indexOf(event.type);
    if (code < 0) throw new RangeError(`stage "${stage.id}": unknown event type ${event.type}`);
    compiled.eventX[i] = event.x;
    compiled.eventCode[i] = code;
    compiled.eventTrigger[i] = -1;
    const branchId = event.branchId;
    const branch = branchId !== undefined && branchId >= 0 ? branches[branchId] : undefined;
    if (branch !== undefined && branch.flagId >= 0) {
      compiled.eventBranchBit[i] = (1 << branch.flagId) >>> 0;
      compiled.eventBranchValue[i] = branch.value ? 1 : 0;
    }
    if (event.type === 'speed') {
      compiled.eventSpeed[i] = event.speed;
      compiled.eventRamp[i] = event.ramp === undefined ? 0 : event.ramp;
    } else if (event.type === 'flag') {
      compiled.eventFlagBit[i] = (1 << event.flagId) >>> 0;
      compiled.eventFlagSet[i] = event.value === false ? 0 : 1;
    } else if (event.type === 'trigger' && trigger < MAX_TRIGGERS) {
      const region = event.region;
      compiled.eventTrigger[i] = trigger;
      compiled.triggerX0[trigger] = region.x;
      compiled.triggerY0[trigger] = region.y;
      compiled.triggerX1[trigger] = region.x + region.w;
      compiled.triggerY1[trigger] = region.y + region.h;
      compiled.triggerUntil[trigger] = event.until ?? region.x + region.w;
      compiled.triggerBit[trigger] = (1 << event.flagId) >>> 0;
      compiled.triggerSet[trigger] = event.value === false ? 0 : 1;
      trigger++;
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
  /** See {@link StageRunner.loop}. */
  readonly loop: number;
  /** 1 per event of another loop than {@link StageRunnerImpl.loop} (M3-01 — never fires). */
  private readonly outOfLoop: Uint8Array;
  /** See {@link StageRunner.following}. */
  following: StageCameraTarget | null = null;
  /**
   * Camera x when the current follow began: the timeline goes no further while following. Not
   * part of {@link StageRunner.state}: it is the (hashed) camera x of that tick — a raid's home,
   * where its camera returns before it lets go.
   */
  private followX = 0;

  /**
   * Compiles the timeline and puts the runner at the stage start (no `hooks.clear()`).
   *
   * @param stage - The stage.
   * @param hooks - The hooks.
   * @param camera - The camera to drive (its fields are overwritten).
   * @throws {RangeError} When an event has a type the runtime does not know.
   */
  constructor(stage: StageSpec, hooks: StageHooks, camera: StageCamera, loop: number) {
    this.stage = stage;
    this.hooks = hooks;
    this.camera = camera;
    this.loop = loop >= 1 ? Math.floor(loop) : 1;
    this.state = new Float64Array(STAGE_STATE_SLOTS);
    this.compiled = compileStage(stage);
    this.eventCodes = this.compiled.eventCode;
    // M3-01: the events of other loops (the remix) are skipped like a branch not taken.
    const events = stage.events;
    const outOfLoop = new Uint8Array(events.length);
    for (let i = 0; i < events.length; i++) {
      outOfLoop[i] = stageEventInLoop(events[i], this.loop) ? 0 : 1;
    }
    this.outOfLoop = outOfLoop;
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

  /** See {@link StageRunner.holding}. */
  get holding(): boolean {
    return this.state[StageSlot.Hold] > 0;
  }

  /** See {@link StageRunner.triggersArmed}. */
  get triggersArmed(): number {
    return this.state[StageSlot.TriggersArmed];
  }

  /** See {@link StageRunner.triggersFired}. */
  get triggersFired(): number {
    return this.state[StageSlot.TriggersFired];
  }

  /** See {@link StageRunner.tick}. */
  tick(): void {
    const state = this.state;
    const camera = this.camera;
    const compiled = this.compiled;
    const keyX = compiled.keyX;
    const keyCount = keyX.length;
    // While a raid moves the camera (M2-09) the timeline stays where the follow began: its keys,
    // events, checkpoints and trigger disarms wait for the camera's return (see `follow`).
    const followX = this.followX;

    // 1. Camera keys the camera has reached.
    let reach = this.following === null || camera.x < followX ? camera.x : followX;
    let nextKey = state[StageSlot.NextKey];
    while (nextKey < keyCount && keyX[nextKey] <= reach) {
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
    // A brake locks once its ramp has stopped the camera (this tick moves by the last speed, 0).
    if (state[StageSlot.Braking] !== 0 && state[StageSlot.Speed] === 0) {
      state[StageSlot.Locked] = 1;
    }
    // A hold (M2-07) keeps the camera still for its ticks; on its last one the key's speed and
    // ramp take over (so the camera moves again from the next tick).
    const holding = state[StageSlot.Hold] > 0;
    if (holding) {
      const left = state[StageSlot.Hold] - 1;
      state[StageSlot.Hold] = left;
      if (left === 0) this.endHold();
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

    // 3. Move: not while locked or held, never past the first pending stop key (other pending
    // keys may lie before it within this tick's movement) or the stage end.
    let dx = state[StageSlot.Locked] !== 0 || holding ? 0 : state[StageSlot.Speed];
    const lock = compiled.keyNextLock[nextKey];
    if (lock < keyCount) {
      const stop = keyX[lock] - camera.x;
      if (dx > stop) dx = stop > 0 ? stop : 0;
    }
    // A raid (M2-09): the camera goes where its target is.
    const target = this.following;
    if (target !== null) dx = target.x - camera.x;
    const room = this.stage.length - camera.x;
    if (dx > room) dx = room > 0 ? room : 0;
    // A diagonal pan (M2-07 `yOver`): y follows the scroll x linearly.
    const over = state[StageSlot.PanOver];
    if (target !== null) {
      y = target.y;
    } else if (over > 0) {
      const t = (camera.x + dx - state[StageSlot.PanStartX]) / over;
      const from = state[StageSlot.PanFrom];
      const to = state[StageSlot.PanTo];
      if (t >= 1) {
        y = to;
        state[StageSlot.PanOver] = 0;
      } else if (t > 0) {
        y = from + (to - from) * t;
      }
    }
    const dy = y - camera.y;
    camera.dx = dx;
    camera.dy = dy;
    camera.vx = dx;
    camera.vy = dy;
    camera.x += dx;
    camera.y = y;

    // 4. Every event the camera reached, in order, exactly once (skipped when its branch is not
    // taken) — while following, only up to where the follow began.
    reach = target === null || camera.x < followX ? camera.x : followX;
    const eventX = compiled.eventX;
    const restarts = state[StageSlot.Restarts];
    let cursor = state[StageSlot.Cursor];
    while (cursor < eventX.length && eventX[cursor] <= reach) {
      state[StageSlot.Cursor] = cursor + 1;
      this.fire(cursor);
      if (state[StageSlot.Restarts] !== restarts) return; // a hook restarted the stage
      cursor = state[StageSlot.Cursor];
    }
    // Armed triggers whose region the camera left behind disarm.
    if (state[StageSlot.TriggersArmed] !== 0) this.disarmPassed(reach);

    // 5. The last checkpoint passed.
    const checkpointX = compiled.checkpointX;
    let next = state[StageSlot.NextCheckpoint];
    while (next < checkpointX.length && checkpointX[next] <= reach) {
      state[StageSlot.Checkpoint] = next;
      next++;
    }
    state[StageSlot.NextCheckpoint] = next;
    state[StageSlot.Ticks]++;
  }

  /** See {@link StageRunner.eventActive}. */
  eventActive(index: number): boolean {
    if (this.outOfLoop[index] === 1) return false;
    const bit = this.compiled.eventBranchBit[index];
    if (bit === 0 || bit === undefined) return true;
    const set = (this.state[StageSlot.Flags] & bit) !== 0;
    return set === (this.compiled.eventBranchValue[index] !== 0);
  }

  /** See {@link StageRunner.setFlag}. */
  setFlag(flagId: number, value: boolean): void {
    if (!(flagId >= 0 && flagId < 32 && flagId % 1 === 0)) return;
    this.writeFlag((1 << flagId) >>> 0, value);
  }

  /** See {@link StageRunner.probe}. */
  probe(point: { readonly x: number; readonly y: number }): number {
    const x = point.x;
    const y = point.y;
    const state = this.state;
    const armed = state[StageSlot.TriggersArmed];
    if (armed === 0) return 0;
    const c = this.compiled;
    let fired = 0;
    for (let t = 0; t < c.triggerX0.length; t++) {
      const bit = (1 << t) >>> 0;
      if ((armed & bit) === 0) continue;
      if (!(
        x >= c.triggerX0[t] &&
        x < c.triggerX1[t] &&
        y >= c.triggerY0[t] &&
        y < c.triggerY1[t]
      )) {
        continue;
      }
      this.fireTrigger(t);
      fired++;
    }
    return fired;
  }

  /**
   * A trigger fires: its flag is set / cleared, it disarms and counts as fired.
   *
   * @param t - Trigger ordinal.
   */
  private fireTrigger(t: number): void {
    const state = this.state;
    const bit = (1 << t) >>> 0;
    state[StageSlot.TriggersArmed] = (state[StageSlot.TriggersArmed] & ~bit) >>> 0;
    state[StageSlot.TriggersFired] = (state[StageSlot.TriggersFired] | bit) >>> 0;
    this.writeFlag(this.compiled.triggerBit[t], this.compiled.triggerSet[t] !== 0);
  }

  /**
   * Disarms every armed trigger the camera has passed (`x > until`).
   *
   * @param x - How far the timeline has come (the camera x; while following, at most where the
   * follow began).
   */
  private disarmPassed(x: number): void {
    const state = this.state;
    const c = this.compiled;
    let armed = state[StageSlot.TriggersArmed];
    for (let t = 0; t < c.triggerUntil.length; t++) {
      const bit = (1 << t) >>> 0;
      if ((armed & bit) !== 0 && x > c.triggerUntil[t]) armed = (armed & ~bit) >>> 0;
    }
    state[StageSlot.TriggersArmed] = armed;
  }

  /**
   * Sets or clears flag bits.
   *
   * @param bit - The bit(s).
   * @param value - `true` sets them.
   */
  private writeFlag(bit: number, value: boolean): void {
    const state = this.state;
    const flags = state[StageSlot.Flags];
    state[StageSlot.Flags] = value ? (flags | bit) >>> 0 : (flags & ~bit) >>> 0;
  }

  /** A hold ran out: the holding key's speed (and ramp) apply — or wait, while braking. */
  private endHold(): void {
    const state = this.state;
    const key = state[StageSlot.HoldKey];
    const speed = this.compiled.keySpeed[key];
    if (state[StageSlot.Braking] !== 0) state[StageSlot.ResumeSpeed] = speed;
    else this.setTarget(speed, this.compiled.keyRamp[key]);
  }

  /** See {@link StageRunner.restartAt}. */
  restartAt(checkpoint: number): void {
    this.reset(checkpoint, true);
  }

  /** See {@link StageRunner.jumpTo}. */
  jumpTo(x: number): void {
    const length = this.stage.length;
    if (typeof x !== 'number' || !(x >= 0 && x <= length)) {
      throw new RangeError(`jump x must be a number in [0, ${length}], got ${String(x)}`);
    }
    const checkpointX = this.compiled.checkpointX;
    let index = -1;
    while (index + 1 < checkpointX.length && checkpointX[index + 1] <= x) index++;
    this.resetTo(x, index, true);
  }

  /** See {@link StageRunner.unlock}. */
  unlock(): void {
    const state = this.state;
    state[StageSlot.Locked] = 0;
    if (state[StageSlot.Braking] !== 0) {
      state[StageSlot.Braking] = 0;
      this.setTarget(state[StageSlot.ResumeSpeed], state[StageSlot.BrakeRamp]);
    }
  }

  /** See {@link StageRunner.follow}. */
  follow(target: StageCameraTarget | null): void {
    if (target !== null && this.following === null) this.followX = this.camera.x;
    this.following = target;
  }

  /** See {@link StageRunner.brake}. */
  brake(ticks: number): void {
    const state = this.state;
    if (state[StageSlot.Braking] !== 0) return;
    const ramp = ticks > 0 ? Math.floor(ticks) : 0;
    state[StageSlot.Braking] = 1;
    state[StageSlot.ResumeSpeed] = state[StageSlot.Target];
    state[StageSlot.BrakeRamp] = ramp;
    this.setTarget(0, ramp);
    if (ramp === 0) state[StageSlot.Locked] = 1;
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
    const hold = compiled.keyHold[index];
    if (state[StageSlot.Braking] !== 0) {
      state[StageSlot.ResumeSpeed] = compiled.keySpeed[index];
    } else if (hold > 0) {
      // A timed stop (M2-07): still at once; the key's speed applies when the hold ends.
      state[StageSlot.Hold] = hold;
      state[StageSlot.HoldKey] = index;
      this.setTarget(0, 0);
    } else {
      this.setTarget(compiled.keySpeed[index], compiled.keyRamp[index]);
    }
    const yTo = compiled.keyYTo[index];
    if (yTo === yTo) {
      state[StageSlot.PanFrom] = this.camera.y;
      state[StageSlot.PanTo] = yTo;
      state[StageSlot.PanElapsed] = 0;
      const over = compiled.keyYOver[index];
      if (over > 0) {
        // A diagonal pan: y follows the scroll from the key's x (step 3).
        state[StageSlot.PanTicks] = 0;
        state[StageSlot.PanOver] = over;
        state[StageSlot.PanStartX] = compiled.keyX[index];
      } else {
        state[StageSlot.PanTicks] = compiled.keyYTicks[index];
        state[StageSlot.PanOver] = 0;
      }
    }
    if (compiled.keyLock[index] !== 0) state[StageSlot.Locked] = 1;
  }

  /**
   * Sets or clears the flag bit of a `flag` event.
   *
   * @param index - Event index.
   */
  private applyFlag(index: number): void {
    this.writeFlag(this.compiled.eventFlagBit[index], this.compiled.eventFlagSet[index] !== 0);
  }

  /**
   * Fires one event: the runner's own part, then the hooks.
   *
   * @param index - Event index.
   */
  private fire(index: number): void {
    // An event whose branch is not taken is passed by (M2-07): no runner part, no hooks.
    if (!this.eventActive(index)) return;
    const code = this.compiled.eventCode[index] as StageEventCode;
    // Events at a restart checkpoint's x already had their runner part applied by the restart.
    if (index >= this.state[StageSlot.Replay]) this.applyEvent(index, code, true);
    this.hooks.event(code, this.stage.events[index], index);
  }

  /**
   * The runner's own part of an event: `speed` sets the target speed, `flag` sets / clears its
   * flag, `end` ends the stage, `trigger` arms its region (unless it already fired).
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
      if (live && state[StageSlot.Braking] !== 0) {
        state[StageSlot.ResumeSpeed] = speed;
      } else if (live) {
        this.setTarget(speed, compiled.eventRamp[index]);
      } else {
        state[StageSlot.Speed] = speed;
        state[StageSlot.Target] = speed;
      }
    } else if (code === StageEventCode.Flag) {
      this.applyFlag(index);
    } else if (code === StageEventCode.End && live) {
      state[StageSlot.Ended] = 1;
    } else if (code === StageEventCode.Trigger) {
      const t = compiled.eventTrigger[index];
      if (t < 0) return;
      const bit = (1 << t) >>> 0;
      if ((state[StageSlot.TriggersFired] & bit) !== 0) return;
      // Long passed (a restart): armed again only while the camera has not passed its `until`
      // (live play disarms it once `camera.x > until`).
      if (live || compiled.triggerUntil[t] >= this.camera.x) {
        state[StageSlot.TriggersArmed] = (state[StageSlot.TriggersArmed] | bit) >>> 0;
      }
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
    const checkpointX = this.compiled.checkpointX;
    if (!Number.isInteger(index) || index < -1 || index >= checkpointX.length) {
      throw new RangeError(
        `checkpoint must be an integer in [-1, ${checkpointX.length}), got ${index}`,
      );
    }
    this.resetTo(index < 0 ? 0 : checkpointX[index], index, notify);
  }

  /**
   * Resets the runner to a scroll x (see {@link StageRunner.restartAt} /
   * {@link StageRunner.jumpTo}).
   *
   * @param x - Scroll x (validated by the caller).
   * @param index - The last checkpoint at or before `x`, or -1.
   * @param notify - Call `hooks.clear()` afterwards.
   */
  private resetTo(x: number, index: number, notify: boolean): void {
    const state = this.state;
    const camera = this.camera;
    const compiled = this.compiled;
    const restarts = state[StageSlot.Restarts];
    const firedBefore = state[StageSlot.TriggersFired];
    state.fill(0);
    state[StageSlot.Restarts] = restarts + 1;
    this.following = null;
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
    // The diagonal pan (M2-07 `yOver`) of the last replayed `yTo` key: from `panFrom` to `panTo`
    // over `panOver` scroll px from `panStartX` (0 = none: the camera y is final). A later `yTo`
    // key starts from where this pan had the camera at that key's x, as in live play.
    let panFrom = 0;
    let panTo = 0;
    let panStartX = 0;
    let panOver = 0;
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
        if (yTo === yTo) {
          if (panOver > 0) {
            const t = (keyX[k] - panStartX) / panOver;
            camera.y = t >= 1 ? panTo : panFrom + (panTo - panFrom) * t;
          }
          const over = compiled.keyYOver[k];
          if (over > 0) {
            panFrom = camera.y;
            panTo = yTo;
            panStartX = keyX[k];
            panOver = over;
          } else {
            camera.y = yTo;
            panOver = 0;
          }
        }
        k++;
      } else {
        // A branch not taken under the flags re-derived so far is skipped, as live play did.
        if (this.eventActive(e)) {
          const code = compiled.eventCode[e] as StageEventCode;
          const t = compiled.eventTrigger[e];
          if (code === StageEventCode.Trigger && t >= 0 && e < cursor) {
            this.restoreTrigger(t, firedBefore);
          } else {
            this.applyEvent(e, code, e >= cursor);
          }
        }
        e++;
      }
    }
    if (panOver > 0) {
      const t = (x - panStartX) / panOver;
      if (t >= 1) {
        camera.y = panTo;
      } else {
        // A diagonal pan still running at x: where live play had it, and on it goes.
        camera.y = panFrom + (panTo - panFrom) * t;
        state[StageSlot.PanFrom] = panFrom;
        state[StageSlot.PanTo] = panTo;
        state[StageSlot.PanOver] = panOver;
        state[StageSlot.PanStartX] = panStartX;
      }
    }
    state[StageSlot.NextKey] = k;
    state[StageSlot.Cursor] = cursor;
    state[StageSlot.Replay] = replay;
    state[StageSlot.Checkpoint] = index;
    state[StageSlot.NextCheckpoint] = index + 1;
    if (notify) this.hooks.clear();
  }

  /**
   * A trigger before a restart's x (M2-07): one that fired before keeps its outcome (its flag is
   * applied here, in timeline order) and stays fired; one that did not is armed again while its
   * region is still ahead — while the camera has not passed its `until`, as live play keeps it
   * armed up to `camera.x = until`.
   *
   * @param t - Trigger ordinal.
   * @param firedBefore - The fired mask before the restart.
   */
  private restoreTrigger(t: number, firedBefore: number): void {
    const state = this.state;
    const c = this.compiled;
    const bit = (1 << t) >>> 0;
    if ((firedBefore & bit) !== 0) {
      state[StageSlot.TriggersFired] = (state[StageSlot.TriggersFired] | bit) >>> 0;
      this.writeFlag(c.triggerBit[t], c.triggerSet[t] !== 0);
    } else if (c.triggerUntil[t] >= this.camera.x) {
      state[StageSlot.TriggersArmed] = (state[StageSlot.TriggersArmed] | bit) >>> 0;
    }
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
 * @param loop - The loop it plays (M3-01 — `GameConfig.loop`, default 1): the events of other
 *   loops (`minLoop` / `maxLoop`) never fire.
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
  loop = 1,
): StageRunner {
  return new StageRunnerImpl(stage, hooks, camera, loop);
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
 * without touching the shared content; the tileset tables are shared read-only references. A
 * stage with `block` events gets the map's moving-block slots ({@link TerrainBlocks}, filled by the
 * World's `MovingBlockSystem`).
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
  let blocks = false;
  for (const event of stage.events) if (event.type === 'block') blocks = true;
  return {
    tileSize: terrain.tileSize,
    cols: terrain.cols,
    rows: terrain.rows,
    tiles: terrain.tiles.slice(),
    tileType: tileset.tables.type,
    tileAnchor: tileset.tables.anchor,
    tileMask: tileset.tables.mask,
    blocks: blocks ? new TerrainBlocks(MAX_TERRAIN_BLOCKS) : null,
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
 * @param changes - The map's change log (M2-07: the World's `DestructibleTerrain`), or `null`.
 * @returns The view (the renderer re-reads `tiles` as the camera crosses tile columns and when
 *   `changes` lists a cell).
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
  changes: TerrainChanges | null = null,
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
    changes,
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

/** `LayerId` of each stage effect layer name (M2-08). */
const EFFECT_LAYERS: Readonly<Record<string, LayerId>> = Object.freeze({
  far: LayerId.BgFar,
  mid: LayerId.BgMid,
  terrain: LayerId.Terrain,
  ground: LayerId.GroundEnemies,
  air: LayerId.AirEnemies,
});

/** `RasterKind` of each raster kind name (M2-08). */
const RASTER_KINDS: Readonly<Record<string, RasterKind>> = Object.freeze({
  wave: RasterKind.Wave,
  haze: RasterKind.Haze,
  lines: RasterKind.Lines,
});

/**
 * Builds the presentation effects view of a stage (plan M2-08): its raster effects and palette
 * cycles with the layer names turned into `LayerId`s and the kinds into `RasterKind` codes — static
 * data the renderer reads once when it binds the World's view. Load time (allocates).
 *
 * @param stage - The stage.
 * @returns The view (frozen), or `null` when the stage has neither raster effects nor cycles.
 *
 * @example
 * ```ts
 * const effects = createStageEffectsView(stage); // → WorldView.effects
 * ```
 */
export function createStageEffectsView(stage: StageSpec): StageEffectsView | null {
  if (stage.raster.length === 0 && stage.cycles.length === 0) return null;
  const raster: RasterEffectView[] = [];
  for (const effect of stage.raster) {
    raster.push(
      Object.freeze({
        layer: EFFECT_LAYERS[effect.layer],
        kind: RASTER_KINDS[effect.kind],
        top: effect.top,
        bottom: effect.bottom,
        amplitude: effect.amplitude,
        wavelength: effect.wavelength,
        period: effect.period,
        factorTop: effect.factorTop,
        factorBottom: effect.factorBottom,
        bands: Object.freeze(effect.bands.slice()),
        wrap: effect.wrap,
        from: effect.from,
        to: effect.to,
      }),
    );
  }
  const cycles: ColorCycleView[] = [];
  for (const cycle of stage.cycles) {
    cycles.push(
      Object.freeze({
        layer: EFFECT_LAYERS[cycle.layer],
        colors: Object.freeze(cycle.rgb.slice()),
        ticks: cycle.ticks,
        from: cycle.from,
        to: cycle.to,
      }),
    );
  }
  return Object.freeze({ raster: Object.freeze(raster), cycles: Object.freeze(cycles) });
}
