/**
 * # enemies — enemy runtime: spawning, formations, scripts, movers, off-screen rules, contact
 *
 * **Status: partial.** Spawning (stage `spawn` / `formation` events, script spawns), formations
 * with their kill tracking, the behaviour coroutines and movers, the off-screen / settle rules,
 * hit points, hit flash, deaths (explosion events, drops, formation bonus), enemy–player contact
 * and the sprite mirror are implemented (plan M1-08). Rank modifiers and revenge bullets arrive
 * with M2-01, the Option Hunter with M2-04; shots start damaging enemies in M1-10.
 *
 * **Responsibility.** Enemies are pooled class instances ({@link Enemy}, {@link MAX_ENEMIES}
 * slots — the plan's "`Pool` (64)") composed of a mover (`core/patterns`), a hurtbox, hit points
 * and a behaviour coroutine (`core/behaviors`). {@link EnemySystem} owns them and runs their part
 * of every tick phase for the World:
 *
 * - phase 3 (stage): `spawn` / `formation` events spawn enemies; formation members due this tick
 *   spawn;
 * - phase 4 (scripts): scripts whose `wakeTick` has come are resumed (`next()` only on wake);
 * - phase 5 (movement): age, hit flash, camera ride (flying enemies), mover, leader track,
 *   animation, on-screen / settle / despawn rules;
 * - phase 6 (collision): hurtboxes go into the World's grid (ids = slots); the players' hurt
 *   circles against the hurtboxes → `playerHit(Contact)`;
 * - phase 7 (damage): {@link EnemySystem.damage} (shots from M1-10) → deaths, drops, formation
 *   bonus;
 * - phase 8 (removal): removed slots are freed;
 * - phase 9 (fx): the ground / air sprite batches are refilled.
 *
 * **Frames.** Flying enemies ride the camera scroll, so their movers work in the view's frame
 * (spawn points, paths and waves are laid out on screen); ground enemies (`ground: floor |
 * ceiling`) are anchored in the world and snap to the terrain surface when they spawn.
 *
 * **Formations.** A `formation` event takes one of {@link MAX_FORMATIONS} slots and spawns
 * `count` members, one every `interval` ticks, all at the same spawn point. The table counts
 * spawned, killed and escaped members; when every member is resolved and all were killed, the
 * formation drops its capsule at the last kill and emits `SimEventKind.FormationBonus`. The
 * leader (member 0) records its track ({@link FollowTrack}) for `follow` movers; a leader that
 * dies or leaves while members are still out becomes an invisible, harmless **ghost** that keeps
 * recording until the formation is resolved.
 *
 * **Off-screen rules** (shmup_feat.md §11). An enemy is on screen while its hurtbox overlaps the
 * view; {@link ScriptApi.canFire} is `true` only on screen and at least `settleTicks` after its
 * first on-screen tick. An enemy that was on screen and leaves the view by {@link DESPAWN_MARGIN}
 * pixels is removed and counts as **escaped**; one that never shows up is removed once it is
 * {@link UNSEEN_MARGIN} pixels away or after {@link UNSEEN_TICKS} ticks.
 *
 * **Tick outcomes.** Kills and drops of the current tick are listed in
 * {@link EnemySystem.outcomes} (reset at the start of phase 3) for the systems that turn them
 * into score (M1-12) and capsules (M1-11).
 *
 * **Zero allocation.** Every enemy, script API, track and table is built by
 * {@link createEnemySystem}; the per-tick methods only write numbers. The allocations left are
 * inherent to the coroutines of decision D29: spawning an enemy with a behaviour creates its
 * generator object, and each wake allocates the generator's `{ value, done }` result.
 *
 * **Implements.**
 * - shmup_feat.md §11 Enemies — movement primitives (via `patterns`), formation tracking and drops,
 *   HP / score / hurtbox / flash-on-hit / death explosion / drops from `enemies.json`, off-screen
 *   and settle rules, coroutine scripts
 * - shmup_feat.md §22 — enemies as pooled objects composed of mover, hurtbox, health and script;
 *   enemies × players contact through the uniform grid
 *
 * **Public API.** {@link createEnemySystem}, {@link EnemySystem}, {@link EnemyHost},
 * {@link Enemy}, {@link EnemyState}, {@link EnemyFlag}, {@link ScriptApi}, {@link EnemyBehavior},
 * {@link EnemyBehaviorLookup}, {@link EnemyOutcomes}, {@link FormationTable}, {@link DropKind},
 * {@link MAX_ENEMIES}, {@link MAX_FORMATIONS}, {@link DEFAULT_SPAWN_SCREEN_X},
 * {@link DESPAWN_MARGIN}, {@link UNSEEN_MARGIN}, {@link UNSEEN_TICKS}, {@link GHOST_MARGIN},
 * {@link HIT_FLASH_TICKS}.
 *
 * **Planned API.** Rank modifiers and revenge bullets (M2-01), the Option Hunter (M2-04), boss
 * parts sharing the damage path (M1-13).
 *
 * @module
 */
import {
  findCeiling,
  findFloor,
  type SpatialGrid,
  type SpatialGridVisitor,
  type TerrainMap,
} from '../collision/index.js';
import { PLAYFIELD_H, PLAYFIELD_W } from '../config/index.js';
import {
  ENEMY_EXPLOSIONS,
  ENEMY_GROUNDS,
  type ContentDb,
  type EnemySpec,
  type PlayerShipSpec,
  type StageFormationEvent,
  type StageSpawnEvent,
  type StageSpec,
} from '../data/index.js';
import type { DebugFlags } from '../debug/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type EventQueue } from '../events/index.js';
import { defineModule } from '../module-info.js';
import {
  BodyAnchor,
  FOLLOW_HISTORY,
  FollowTrack,
  MoverKind,
  createMoverContext,
  moverKindOf,
  resumeScript,
  setMover,
  updateMover,
  type MoverBody,
  type MoverContext,
  type Script,
  type ScriptHolder,
} from '../patterns/index.js';
import { PlayerHitCause, playerHit, type PlayerCamera, type PlayerShip } from '../player/index.js';
import { LayerId, SpriteFlag, createSpriteBatch, type SpriteBatch } from '../presentation/index.js';
import type { Rng, RngStreams } from '../rng/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'enemies',
  status: 'partial',
  specRefs: ['shmup_feat.md §11', 'shmup_feat.md §22'],
});

/** Enemy slots (shmup_feat.md §22 budget: 64 enemies / parts). */
export const MAX_ENEMIES = 64;

/** Formation slots (formations alive or still spawning at the same time). */
export const MAX_FORMATIONS = 32;

/** Default spawn x in playfield pixels: 16 px beyond the right edge of the view. */
export const DEFAULT_SPAWN_SCREEN_X = PLAYFIELD_W + 16;

/** An enemy that was on screen is removed (escaped) once it is this far outside the view. */
export const DESPAWN_MARGIN = 32;

/** An enemy that never came on screen is removed once it is this far outside the view. */
export const UNSEEN_MARGIN = 128;

/** An enemy that never came on screen is removed after this many ticks. */
export const UNSEEN_TICKS = 600;

/** A formation's ghost leader is removed once it is this far outside the view. */
export const GHOST_MARGIN = 128;

/** Ticks an enemy shows its hit flash after taking damage (decision D30). */
export const HIT_FLASH_TICKS = 4;

/** Life-cycle state of an enemy slot. */
export const EnemyState = {
  /** The slot is unused. */
  Free: 0,
  /** In play (possibly a ghost leader — see {@link EnemyFlag.Ghost}). */
  Live: 1,
  /** Killed or escaped this tick; the slot is freed in phase 8. */
  Removed: 2,
} as const;

/** An {@link EnemyState} code. */
export type EnemyState = (typeof EnemyState)[keyof typeof EnemyState];

/** Flag bits of {@link Enemy.flags}. */
export const EnemyFlag = {
  /** Shots do no damage (armour; M1-10 answers with a `clink`). */
  Invulnerable: 1,
  /** `settleTicks` have passed since the first on-screen tick (may fire while on screen). */
  Settled: 2,
  /** The hurtbox has overlapped the view at least once. */
  WasOnScreen: 4,
  /** The hurtbox overlaps the view this tick. */
  OnScreen: 8,
  /** A dead or departed formation leader still recording the track: not drawn, not hit. */
  Ghost: 16,
  /** Drawn mirrored (the sprite faces right); follows the sign of the horizontal velocity. */
  FaceRight: 32,
  /** Member 0 of its formation: records the formation's track. */
  Leader: 64,
} as const;

/** What an enemy or a completed formation leaves behind (the codes of `ENEMY_DROPS` + 1). */
export const DropKind = {
  /** Nothing. */
  None: 0,
  /** A power capsule (M1-11 turns it into an item). */
  Capsule: 1,
} as const;

/** A {@link DropKind} code. */
export type DropKind = (typeof DropKind)[keyof typeof DropKind];

/**
 * One enemy instance (a pooled class: its hidden class is shared and its numeric fields stay
 * unboxed). The mover fields are documented on `MoverBody`, the script fields on `ScriptHolder`.
 */
export class Enemy implements MoverBody, ScriptHolder {
  /** Slot index in {@link EnemySystem.enemies} (stable for the enemy's whole life). */
  readonly slot: number;
  /** {@link EnemyState} code. */
  state: number = EnemyState.Free;
  /** `ContentDb.enemies` index of the spec it was spawned from. */
  specIndex = -1;
  /** World x of the centre. */
  x = 0;
  /** World y of the centre. */
  y = 0;
  /** Velocity of the last mover step (px/tick, in the enemy's frame). */
  vx = 0;
  /** Velocity of the last mover step (px/tick, in the enemy's frame). */
  vy = 0;
  /** Hurtbox half width. */
  hw = 0;
  /** Hurtbox half height. */
  hh = 0;
  /** Remaining hit points. */
  hp = 0;
  /** Remaining hit-flash ticks. */
  flashTicks = 0;
  /** Ticks since spawning. */
  age = 0;
  /** Tick it spawned on. */
  spawnTick = 0;
  /** Formation slot, or -1. */
  formation = -1;
  /** Member index in its formation (0 = leader), or -1. */
  member = -1;
  /** `BodyAnchor` code (0 = flying). */
  anchor = 0;
  /** `MoverKind` code. */
  mover = 0;
  /** Mover parameter 0. */
  m0 = 0;
  /** Mover parameter 1. */
  m1 = 0;
  /** Mover parameter 2. */
  m2 = 0;
  /** Mover parameter 3. */
  m3 = 0;
  /** Mover parameter 4. */
  m4 = 0;
  /** Mover parameter 5. */
  m5 = 0;
  /** Mover state 0. */
  s0 = 0;
  /** Mover state 1. */
  s1 = 0;
  /** Mover state 2. */
  s2 = 0;
  /** Mover state 3. */
  s3 = 0;
  /** Ticks the current mover has run. */
  moverTicks = 0;
  /** The formation's track (read by `Follow`, written by the leader), or `null`. */
  track: FollowTrack | null = null;
  /** The behaviour coroutine, or `null`. */
  script: Script | null = null;
  /** Tick the script wakes on. */
  wakeTick = 0;
  /** {@link EnemyFlag} bits. */
  flags = 0;
  /** Tick of the first on-screen tick (-1 = not yet). */
  firstSeenTick = -1;
  /** Sprite id (`ContentDb.sprites` index; -1 = not drawn). */
  spriteId = -1;
  /** Current animation frame. */
  animFrame = 0;
  /** `ContentDb.paths` index given by the spawn event (-1 = none). */
  pathId = -1;
  /** Camera x a flying enemy last rode along with (its frame's origin). */
  camX = 0;
  /** Camera y a flying enemy last rode along with. */
  camY = 0;

  /**
   * Creates a free slot (the enemy system builds all {@link MAX_ENEMIES} at load time).
   *
   * @param slot - The slot index.
   */
  constructor(slot: number) {
    this.slot = slot;
  }
}

/**
 * What a behaviour coroutine can use — one reused object per enemy slot (decision D29). Fire
 * primitives (`aimed`, `ring`, …) join it with M1-09.
 */
export interface ScriptApi {
  /** The enemy the script drives. */
  readonly self: Enemy;
  /** Its spec (content data — read it when the script starts, not every wake). */
  readonly spec: EnemySpec;
  /** The current tick. */
  readonly tick: number;
  /** The gameplay RNG stream (replay-safe randomness). */
  readonly rng: Rng;
  /**
   * The nearest living player ship.
   *
   * @returns The ship, or `null` when none is alive.
   */
  target(): PlayerShip | null;
  /**
   * Switches the enemy's mover (see `core/patterns` `setMover` for the parameters by kind).
   *
   * @param kind - `MoverKind` code.
   * @param p0 - Parameter 0.
   * @param p1 - Parameter 1.
   * @param p2 - Parameter 2.
   * @param p3 - Parameter 3.
   * @param p4 - Parameter 4.
   * @param p5 - Parameter 5.
   */
  setMover(
    kind: MoverKind,
    p0?: number,
    p1?: number,
    p2?: number,
    p3?: number,
    p4?: number,
    p5?: number,
  ): void;
  /**
   * Spawns another enemy relative to this one (hatches, splitters). It starts moving this tick
   * and runs its script from the next one. Ghosts spawn nothing.
   *
   * @remarks
   * The child takes the lowest free slot and belongs to no formation; its spawn position is a
   * world position (a flying child rides the camera from there, a ground child keeps it — no
   * surface snap). A spawn that finds no free slot is dropped quietly.
   *
   * @param enemyIndex - `ContentDb.enemies` index (e.g. `spec.childId`); must be a whole number
   *   in range.
   * @param dx - X offset from this enemy's centre.
   * @param dy - Y offset.
   * @returns The new enemy, or `null` (no free slot, a bad or fractional index, or a ghost).
   *
   * @example
   * ```ts
   * // inside a behaviour: release the spec's child from the top edge of a floor hatch
   * if (api.canFire()) api.spawn(api.spec.childId, 0, -api.self.hh);
   * ```
   */
  spawn(enemyIndex: number, dx: number, dy: number): Enemy | null;
  /**
   * Whether the hurtbox overlaps the view this tick.
   *
   * @returns `true` while on screen.
   */
  onScreen(): boolean;
  /**
   * The fire rule of shmup_feat.md §11: on screen, settled (`settleTicks` after the first
   * on-screen tick) and not a ghost.
   *
   * @returns Whether the enemy may fire (or release children) now.
   */
  canFire(): boolean;
}

/** An enemy behaviour as the enemy system uses it (`core/behaviors` provides them). */
export interface EnemyBehavior {
  /** Script id (`EnemySpec.script`). */
  readonly id: string;
  /** Tunables with their defaults; a spec's `params` override them by name. */
  readonly params: Readonly<Record<string, number>>;
  /**
   * Creates the coroutine for one enemy (called when it spawns; the body runs from the first
   * wake).
   *
   * @param api - The enemy's script API.
   * @param params - The defaults merged with the spec's `params` (same keys as `params`).
   * @returns The coroutine.
   */
  create(api: ScriptApi, params: Readonly<Record<string, number>>): Script;
}

/** Looks behaviours up by script id (load time only). */
export interface EnemyBehaviorLookup {
  /**
   * Finds a behaviour.
   *
   * @param id - Script id.
   * @returns The behaviour, or `undefined`.
   */
  get(id: string): EnemyBehavior | undefined;
}

/** What the enemy system needs from its World (the World implements it). */
export interface EnemyHost {
  /** The tick being run. */
  readonly tick: number;
  /** The camera (flying enemies ride its scroll). */
  readonly camera: PlayerCamera;
  /** The player ships (targets, contact). */
  readonly players: readonly PlayerShip[];
  /** The ship spec (hurt radius for contact). */
  readonly ship: PlayerShipSpec;
  /** The stage's collision map, or `null`. */
  readonly terrain: TerrainMap | null;
  /** The content (enemy specs, paths). */
  readonly content: ContentDb;
  /** The RNG streams (scripts get the gameplay stream). */
  readonly rng: RngStreams;
  /** Presentation events (explosions, formation bonus). */
  readonly events: EventQueue;
  /** Debug switches (god mode for contact). */
  readonly debugFlags: DebugFlags;
}

/**
 * The formation table ({@link MAX_FORMATIONS} slots, struct of arrays, hashed by `hashWorld`).
 */
export interface FormationTable {
  /** 1 while the slot is in use. */
  readonly active: Uint8Array;
  /** Enemy spec index of the members. */
  readonly enemy: Int32Array;
  /** Members in the formation. */
  readonly total: Int32Array;
  /** Members spawned so far (a spawn dropped for lack of slots counts, as escaped). */
  readonly spawned: Int32Array;
  /** Members killed. */
  readonly killed: Int32Array;
  /** Members that escaped (or could not spawn). */
  readonly escaped: Int32Array;
  /** Ticks between members. */
  readonly interval: Int32Array;
  /** Tick the next member spawns on. */
  readonly nextTick: Float64Array;
  /** Spawn x (playfield pixels). */
  readonly screenX: Float64Array;
  /** Spawn y (playfield pixels; NaN = default). */
  readonly screenY: Float64Array;
  /** Path index of the spawn event (-1 = none). */
  readonly path: Int32Array;
  /** {@link DropKind} of a completed formation. */
  readonly drop: Uint8Array;
  /** Bonus points of a completed formation. */
  readonly bonus: Float64Array;
  /** World x of the last kill (where the capsule drops). */
  readonly lastX: Float64Array;
  /** World y of the last kill. */
  readonly lastY: Float64Array;
  /** Enemy slot of the (possibly ghost) leader, -1 once it is gone. */
  readonly leader: Int32Array;
  /** The leader's recorded track per formation. */
  readonly tracks: readonly FollowTrack[];
}

/** Kills and drops of the current tick (reset at the start of phase 3). */
export interface EnemyOutcomes {
  /** Kills this tick. */
  readonly killCount: number;
  /** Spec index per kill. */
  readonly killSpec: Int32Array;
  /** World x per kill. */
  readonly killX: Float64Array;
  /** World y per kill. */
  readonly killY: Float64Array;
  /** Score of the killed enemy (scoring: M1-12). */
  readonly killScore: Float64Array;
  /** Drops this tick (enemy drops, then completed formations, in kill order). */
  readonly dropCount: number;
  /** {@link DropKind} per drop. */
  readonly dropKind: Uint8Array;
  /** World x per drop. */
  readonly dropX: Float64Array;
  /** World y per drop. */
  readonly dropY: Float64Array;
  /** Formation bonus points awarded this tick (scoring: M1-12). */
  readonly bonusPoints: number;
}

/** The enemy system of one World (see the module docs for its part of each tick phase). */
export interface EnemySystem {
  /** Every slot, index = {@link Enemy.slot} (iterate and skip the `Free` ones). */
  readonly enemies: readonly Enemy[];
  /** Slots in use (live, ghost or removed-this-tick). */
  readonly count: number;
  /** The formation table. */
  readonly formations: FormationTable;
  /** Kills and drops of the current tick. */
  readonly outcomes: EnemyOutcomes;
  /** Sprite batch of the ground enemies (`LayerId.GroundEnemies`). */
  readonly groundBatch: SpriteBatch;
  /** Sprite batch of the flying enemies (`LayerId.AirEnemies`). */
  readonly airBatch: SpriteBatch;
  /** The mover context (camera, terrain, paths). */
  readonly movers: MoverContext;
  /**
   * Spawns one enemy at a world position, outside any formation (tests, debug tools).
   *
   * @remarks
   * The enemy takes the lowest free slot, starts its spec's mover at once and its script on the
   * current tick (it runs in phase 4 when called before that phase). `y` = `NaN` means "the
   * default height": mid-view for a flying enemy, and for a ground enemy the surface below
   * (floor) / above (ceiling) mid-view — the view's edge without terrain.
   *
   * @param enemyIndex - `ContentDb.enemies` index (a whole number in range).
   * @param x - World x.
   * @param y - World y (`NaN` = mid-view; a ground enemy snaps to the surface below / above it).
   * @param pathId - Path for `path` movers and path behaviours (-1 = none).
   * @returns The enemy, or `null` (a bad or fractional index or no free slot — the spawn is
   *   dropped).
   *
   * @example
   * ```ts
   * const turret = world.enemies.spawn(db.enemyIndex.get('turret')!, world.camera.x + 300, NaN);
   * ```
   */
  spawn(enemyIndex: number, x: number, y: number, pathId?: number): Enemy | null;
  /**
   * Starts a formation (a stage `formation` event): members spawn one every `interval` ticks
   * from this tick's phase 3 on.
   *
   * @remarks
   * Takes the lowest free formation slot and resets its counters and track. `count < 1` starts
   * nothing (→ -1); an `interval` below 1 counts as 1. The first member spawns in the next
   * `spawnPending` call on or after this tick (the World calls it right after the stage runner,
   * so a stage event's first member appears on the event's tick). A member that cannot spawn
   * (no free enemy slot, bad spec) counts as escaped.
   *
   * @param enemyIndex - Spec index of every member.
   * @param count - Members (≥ 1).
   * @param interval - Ticks between members (≥ 1).
   * @param screenX - Spawn x in playfield pixels.
   * @param screenY - Spawn y in playfield pixels (`NaN` = default).
   * @param pathId - Path index (-1 = none).
   * @param drop - {@link DropKind} when completed.
   * @param bonus - Bonus points when completed.
   * @returns The formation slot, or -1 when the table is full or `count < 1` (the formation is
   *   dropped).
   *
   * @example
   * ```ts
   * // five drifters, 14 ticks apart, 60 px down at the view's right edge, 500 bonus points
   * const drifter = db.enemyIndex.get('drifter')!;
   * enemies.startFormation(drifter, 5, 14, 400, 60, -1, DropKind.Capsule, 500);
   * ```
   */
  startFormation(
    enemyIndex: number,
    count: number,
    interval: number,
    screenX: number,
    screenY: number,
    pathId: number,
    drop: number,
    bonus: number,
  ): number;
  /**
   * The World's stage hook: spawns the enemy of a `spawn` event or starts a `formation`.
   *
   * @param eventIndex - Index in the stage's `events` (compiled at creation).
   */
  onStageEvent(eventIndex: number): void;
  /** Phase 3, before the stage runner: resets the tick outcomes. */
  beginTick(): void;
  /** Phase 3, after the stage runner: spawns the formation members due this tick. */
  spawnPending(): void;
  /** Phase 4: resumes the scripts that wake this tick. */
  runScripts(): void;
  /** Phase 5: moves every enemy and applies the off-screen rules. */
  move(): void;
  /**
   * Phase 6: inserts the hurtboxes into the grid (between `begin` and `build`).
   *
   * @param grid - The World's grid.
   */
  insertColliders(grid: SpatialGrid): void;
  /**
   * Phase 6, after `grid.build()`: players' hurt circles against the hurtboxes.
   *
   * @param grid - The World's grid.
   */
  collidePlayers(grid: SpatialGrid): void;
  /**
   * Damages an enemy (phase 7; shots from M1-10). Starts the hit flash; at 0 hp the enemy dies:
   * explosion events, its drop, formation accounting.
   *
   * @remarks
   * Ignored (→ `false`, no flash) for a slot that is not `Live`, a ghost leader and an
   * `Invulnerable` enemy. A hit that leaves hit points pushes `Sfx EnemyHit`; the killing hit
   * goes through {@link EnemySystem.kill}. Any amount counts, 0 included (it flashes).
   *
   * @param enemy - The enemy.
   * @param amount - Damage.
   * @returns `true` when it died from this hit.
   *
   * @example
   * ```ts
   * if (world.enemies.damage(enemy, weapon.damage)) shotsThatKilled++;
   * ```
   */
  damage(enemy: Enemy, amount: number): boolean;
  /**
   * Kills an enemy outright (Mega Crash, debug): as if its hit points ran out.
   *
   * @remarks
   * Records the kill in {@link EnemySystem.outcomes} (spec, position, score), pushes the
   * explosion `Sfx` + `Particles` events of its spec's size, adds its own drop, then resolves
   * its formation membership (killed count, last-kill position, completion check — which may add
   * the formation's drop and `FormationBonus` in the same tick). The slot is freed in phase 8.
   *
   * @param enemy - The enemy.
   * @returns `true` when it was alive (and not a ghost).
   */
  kill(enemy: Enemy): boolean;
  /** Phase 8: frees the slots removed this tick. */
  flush(): void;
  /** Removes every enemy and formation at once (checkpoint restart). */
  clear(): void;
  /** Phase 9: refills the ground and air sprite batches. */
  sync(): void;
}

/** A placeholder spec for script APIs of free slots. */
const NO_SPEC: EnemySpec = Object.freeze({
  id: '',
  hp: 1,
  score: 0,
  hurtbox: Object.freeze({ hw: 1, hh: 1 }),
  script: '',
  scriptId: -1,
  sprite: '',
  spriteId: -1,
  anim: Object.freeze({ frames: 1, ticks: 1 }),
  params: Object.freeze({}),
  mover: null,
  drop: null,
  ground: null,
  settleTicks: 0,
  explosion: 'small',
  megaCrashImmune: false,
  child: null,
  childId: -1,
});

/** Sound of each explosion size (index = `ENEMY_EXPLOSIONS` position). */
const EXPLOSION_SFX = [
  SFX_CUES.EnemyExplodeSmall,
  SFX_CUES.EnemyExplodeMedium,
  SFX_CUES.EnemyExplodeLarge,
];

/** Particle cue of each explosion size. */
const EXPLOSION_FX = [FX_CUES.ExplosionSmall, FX_CUES.ExplosionMedium, FX_CUES.ExplosionLarge];

/** Capacity of the per-tick kill and drop lists. */
const OUTCOME_CAPACITY = MAX_ENEMIES + MAX_FORMATIONS;

/** The {@link EnemyOutcomes} class. */
class OutcomeLists implements EnemyOutcomes {
  /** See {@link EnemyOutcomes.killCount}. */
  killCount = 0;
  /** See {@link EnemyOutcomes.killSpec}. */
  readonly killSpec = new Int32Array(OUTCOME_CAPACITY);
  /** See {@link EnemyOutcomes.killX}. */
  readonly killX = new Float64Array(OUTCOME_CAPACITY);
  /** See {@link EnemyOutcomes.killY}. */
  readonly killY = new Float64Array(OUTCOME_CAPACITY);
  /** See {@link EnemyOutcomes.killScore}. */
  readonly killScore = new Float64Array(OUTCOME_CAPACITY);
  /** See {@link EnemyOutcomes.dropCount}. */
  dropCount = 0;
  /** See {@link EnemyOutcomes.dropKind}. */
  readonly dropKind = new Uint8Array(OUTCOME_CAPACITY);
  /** See {@link EnemyOutcomes.dropX}. */
  readonly dropX = new Float64Array(OUTCOME_CAPACITY);
  /** See {@link EnemyOutcomes.dropY}. */
  readonly dropY = new Float64Array(OUTCOME_CAPACITY);
  /** See {@link EnemyOutcomes.bonusPoints}. */
  bonusPoints = 0;

  /**
   * Adds a drop.
   *
   * @param kind - {@link DropKind}.
   * @param x - World x.
   * @param y - World y.
   */
  addDrop(kind: number, x: number, y: number): void {
    const i = this.dropCount;
    if (i >= OUTCOME_CAPACITY) return;
    this.dropKind[i] = kind;
    this.dropX[i] = x;
    this.dropY[i] = y;
    this.dropCount = i + 1;
  }
}

/**
 * Creates the formation table.
 *
 * @returns Empty slots.
 */
function createFormationTable(): FormationTable {
  const tracks: FollowTrack[] = [];
  for (let i = 0; i < MAX_FORMATIONS; i++) tracks.push(new FollowTrack());
  return {
    active: new Uint8Array(MAX_FORMATIONS),
    enemy: new Int32Array(MAX_FORMATIONS),
    total: new Int32Array(MAX_FORMATIONS),
    spawned: new Int32Array(MAX_FORMATIONS),
    killed: new Int32Array(MAX_FORMATIONS),
    escaped: new Int32Array(MAX_FORMATIONS),
    interval: new Int32Array(MAX_FORMATIONS),
    nextTick: new Float64Array(MAX_FORMATIONS),
    screenX: new Float64Array(MAX_FORMATIONS),
    screenY: new Float64Array(MAX_FORMATIONS),
    path: new Int32Array(MAX_FORMATIONS),
    drop: new Uint8Array(MAX_FORMATIONS),
    bonus: new Float64Array(MAX_FORMATIONS),
    lastX: new Float64Array(MAX_FORMATIONS),
    lastY: new Float64Array(MAX_FORMATIONS),
    leader: new Int32Array(MAX_FORMATIONS).fill(-1),
    tracks,
  };
}

/** The content's enemy specs compiled into typed arrays (the per-tick code reads only these). */
interface SpecTable {
  /** Hit points. */
  readonly hp: Float64Array;
  /** Score. */
  readonly score: Float64Array;
  /** Hurtbox half width. */
  readonly hw: Float64Array;
  /** Hurtbox half height. */
  readonly hh: Float64Array;
  /** Sprite id (-1 = none). */
  readonly sprite: Int32Array;
  /** Animation frames. */
  readonly animFrames: Int32Array;
  /** Ticks per animation frame. */
  readonly animTicks: Int32Array;
  /** `BodyAnchor` code. */
  readonly anchor: Uint8Array;
  /** Settle ticks. */
  readonly settle: Float64Array;
  /** Explosion size index. */
  readonly explosion: Uint8Array;
  /** {@link DropKind}. */
  readonly drop: Uint8Array;
  /** Starting `MoverKind`. */
  readonly mover: Uint8Array;
  /** Starting mover parameters, 6 per spec (a `path` mover's path: -1 = the spawn's). */
  readonly moverParams: Float64Array;
  /** Behaviour per spec, or `null`. */
  readonly behavior: ReadonlyArray<EnemyBehavior | null>;
  /** Resolved behaviour params per spec. */
  readonly params: ReadonlyArray<Readonly<Record<string, number>>>;
}

/**
 * Compiles the enemy specs (load time).
 *
 * @param specs - `ContentDb.enemies`.
 * @param behaviors - Behaviour lookup.
 * @returns The table.
 */
function compileSpecs(specs: readonly EnemySpec[], behaviors: EnemyBehaviorLookup): SpecTable {
  const n = specs.length;
  const behavior: Array<EnemyBehavior | null> = [];
  const params: Array<Readonly<Record<string, number>>> = [];
  const table = {
    hp: new Float64Array(n),
    score: new Float64Array(n),
    hw: new Float64Array(n),
    hh: new Float64Array(n),
    sprite: new Int32Array(n),
    animFrames: new Int32Array(n),
    animTicks: new Int32Array(n),
    anchor: new Uint8Array(n),
    settle: new Float64Array(n),
    explosion: new Uint8Array(n),
    drop: new Uint8Array(n),
    mover: new Uint8Array(n),
    moverParams: new Float64Array(n * 6),
    behavior,
    params,
  };
  for (let i = 0; i < n; i++) {
    const spec = specs[i];
    table.hp[i] = spec.hp;
    table.score[i] = spec.score;
    table.hw[i] = spec.hurtbox.hw;
    table.hh[i] = spec.hurtbox.hh;
    table.sprite[i] = spec.spriteId;
    table.animFrames[i] = spec.anim.frames;
    table.animTicks[i] = spec.anim.ticks;
    table.anchor[i] =
      spec.ground === null ? BodyAnchor.Air : ENEMY_GROUNDS.indexOf(spec.ground) + 1;
    table.settle[i] = spec.settleTicks;
    table.explosion[i] = ENEMY_EXPLOSIONS.indexOf(spec.explosion);
    table.drop[i] = spec.drop === 'capsule' ? DropKind.Capsule : DropKind.None;
    const mover = spec.mover;
    const p = i * 6;
    if (mover !== null) {
      table.mover[i] = moverKindOf(mover.type);
      const mp = table.moverParams;
      switch (mover.type) {
        case 'straight':
          mp[p] = mover.vx;
          mp[p + 1] = mover.vy;
          break;
        case 'sine':
          mp[p] = mover.vx;
          mp[p + 1] = mover.amp;
          mp[p + 2] = mover.period;
          mp[p + 3] = mover.phase ?? 0;
          break;
        case 'path':
          mp[p] = mover.pathId;
          mp[p + 1] = mover.speed;
          break;
        case 'waypoint':
          mp[p] = mover.x;
          mp[p + 1] = mover.y;
          mp[p + 2] = mover.speed;
          mp[p + 3] = mover.hold;
          mp[p + 4] = mover.leaveVx;
          mp[p + 5] = mover.leaveVy;
          break;
        case 'groundCrawl':
          mp[p] = mover.speed;
          break;
        case 'homing':
          mp[p] = mover.speed;
          mp[p + 1] = mover.turnRate;
          break;
        case 'aimedDash':
          mp[p] = mover.speed;
          mp[p + 1] = mover.windup;
          break;
        case 'follow':
          break;
      }
    }
    const def = behaviors.get(spec.script) ?? null;
    behavior.push(def);
    params.push(def === null ? {} : resolveParams(def.params, spec.params));
  }
  return table;
}

/**
 * Merges a spec's `params` over a behaviour's defaults (keys and their order come from the
 * defaults, so every spec of one behaviour yields the same object shape).
 *
 * @param defaults - The behaviour's defaults.
 * @param given - The spec's `params`.
 * @returns A frozen object.
 */
function resolveParams(
  defaults: Readonly<Record<string, number>>,
  given: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(defaults)) {
    out[key] = Object.prototype.hasOwnProperty.call(given, key) ? given[key] : defaults[key];
  }
  return Object.freeze(out);
}

/** A stage's `spawn` / `formation` events compiled into arrays (index = event index). */
interface SpawnEvents {
  /** 0 = not a spawn event, 1 = spawn, 2 = formation. */
  readonly kind: Uint8Array;
  /** Enemy spec index. */
  readonly enemy: Int32Array;
  /** Spawn x in playfield pixels. */
  readonly screenX: Float64Array;
  /** Spawn y in playfield pixels (NaN = default). */
  readonly screenY: Float64Array;
  /** Path index (-1 = none). */
  readonly path: Int32Array;
  /** Formation members. */
  readonly count: Int32Array;
  /** Formation interval. */
  readonly interval: Int32Array;
  /** Formation {@link DropKind}. */
  readonly drop: Uint8Array;
  /** Formation bonus. */
  readonly bonus: Float64Array;
}

/**
 * Compiles a stage's spawn events (load time).
 *
 * @param stage - The stage, or `null`.
 * @returns The arrays (empty without a stage).
 */
function compileSpawnEvents(stage: StageSpec | null): SpawnEvents {
  const events = stage === null ? [] : stage.events;
  const n = events.length;
  const out: SpawnEvents = {
    kind: new Uint8Array(n),
    enemy: new Int32Array(n),
    screenX: new Float64Array(n),
    screenY: new Float64Array(n),
    path: new Int32Array(n),
    count: new Int32Array(n),
    interval: new Int32Array(n),
    drop: new Uint8Array(n),
    bonus: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const event = events[i];
    if (event.type !== 'spawn' && event.type !== 'formation') continue;
    const spawn: StageSpawnEvent | StageFormationEvent = event;
    out.kind[i] = event.type === 'spawn' ? 1 : 2;
    out.enemy[i] = spawn.enemyId;
    out.screenX[i] = spawn.screenX ?? DEFAULT_SPAWN_SCREEN_X;
    out.screenY[i] = spawn.y ?? NaN;
    out.path[i] = spawn.pathId;
    if (event.type === 'formation') {
      out.count[i] = event.count;
      out.interval[i] = event.interval;
      out.drop[i] = event.drop === null ? DropKind.None : DropKind.Capsule;
      out.bonus[i] = event.bonus ?? 0;
    }
  }
  return out;
}

/** The {@link ScriptApi} of one slot. */
class EnemyScriptApi implements ScriptApi {
  /** See {@link ScriptApi.self}. */
  readonly self: Enemy;
  /** See {@link ScriptApi.spec}. */
  spec: EnemySpec = NO_SPEC;
  /** The system. */
  private readonly system: EnemySystemImpl;

  /**
   * Creates the API of one slot (load time; reused by every enemy that slot ever holds).
   *
   * @param self - The slot's enemy.
   * @param system - The system.
   */
  constructor(self: Enemy, system: EnemySystemImpl) {
    this.self = self;
    this.system = system;
  }

  /** See {@link ScriptApi.tick}. */
  get tick(): number {
    return this.system.host.tick;
  }

  /** See {@link ScriptApi.rng}. */
  get rng(): Rng {
    return this.system.host.rng.gameplay;
  }

  /** See {@link ScriptApi.target}. */
  target(): PlayerShip | null {
    return this.system.nearestPlayer(this.self);
  }

  /** See {@link ScriptApi.setMover}. */
  setMover(kind: MoverKind, p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0): void {
    setMover(this.self, this.system.movers, kind, p0, p1, p2, p3, p4, p5);
  }

  /** See {@link ScriptApi.spawn}. */
  spawn(enemyIndex: number, dx: number, dy: number): Enemy | null {
    const self = this.self;
    if (self.state !== EnemyState.Live || (self.flags & EnemyFlag.Ghost) !== 0) return null;
    return this.system.spawnEnemy(enemyIndex, self.x + dx, self.y + dy, -1, -1, -1, true);
  }

  /** See {@link ScriptApi.onScreen}. */
  onScreen(): boolean {
    return (this.self.flags & EnemyFlag.OnScreen) !== 0;
  }

  /** See {@link ScriptApi.canFire}. */
  canFire(): boolean {
    const flags = this.self.flags;
    return (
      (flags & (EnemyFlag.OnScreen | EnemyFlag.Settled)) ===
        (EnemyFlag.OnScreen | EnemyFlag.Settled) && (flags & EnemyFlag.Ghost) === 0
    );
  }
}

/** The enemy system (a class: one set of monomorphic methods for every World). */
class EnemySystemImpl implements EnemySystem {
  /** See {@link EnemySystem.enemies}. */
  readonly enemies: readonly Enemy[];
  /** See {@link EnemySystem.formations}. */
  readonly formations: FormationTable;
  /** See {@link EnemySystem.outcomes}. */
  readonly outcomes: OutcomeLists;
  /** See {@link EnemySystem.groundBatch}. */
  readonly groundBatch: SpriteBatch;
  /** See {@link EnemySystem.airBatch}. */
  readonly airBatch: SpriteBatch;
  /** See {@link EnemySystem.movers}. */
  readonly movers: MoverContext;
  /** The World. */
  readonly host: EnemyHost;
  /** Script API per slot. */
  private readonly apis: readonly EnemyScriptApi[];
  /** The compiled specs. */
  private readonly specs: SpecTable;
  /** The compiled spawn events of the stage. */
  private readonly spawnEvents: SpawnEvents;
  /** The content's specs (handed to script APIs). */
  private readonly specList: readonly EnemySpec[];
  /** Slots in use. */
  private used = 0;
  /** The player tested by {@link EnemySystemImpl.onContact} (set per query). */
  private contactShip: PlayerShip | null = null;
  /** Whether the current contact query already hit its player. */
  private contactHit = false;
  /** The grid visitor of the contact test (created once). */
  private readonly onContact: SpatialGridVisitor;

  /**
   * Builds everything the system will ever use (see {@link createEnemySystem}).
   *
   * @param host - The World.
   * @param behaviors - Behaviour lookup.
   * @param stage - The stage, or `null`.
   */
  constructor(host: EnemyHost, behaviors: EnemyBehaviorLookup, stage: StageSpec | null) {
    this.host = host;
    this.specList = host.content.enemies;
    this.specs = compileSpecs(host.content.enemies, behaviors);
    this.spawnEvents = compileSpawnEvents(stage);
    this.formations = createFormationTable();
    this.outcomes = new OutcomeLists();
    this.groundBatch = createSpriteBatch(LayerId.GroundEnemies, MAX_ENEMIES);
    this.airBatch = createSpriteBatch(LayerId.AirEnemies, MAX_ENEMIES);
    this.movers = createMoverContext(host.camera, host.terrain, host.content.paths);
    const enemies: Enemy[] = [];
    const apis: EnemyScriptApi[] = [];
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const enemy = new Enemy(i);
      enemies.push(enemy);
      apis.push(new EnemyScriptApi(enemy, this));
    }
    this.enemies = enemies;
    this.apis = apis;
    this.onContact = (slot: number): void => {
      this.contactVisit(slot);
    };
  }

  /** See {@link EnemySystem.count}. */
  get count(): number {
    return this.used;
  }

  /**
   * The nearest living player ship.
   *
   * @remarks
   * Takes the enemy, not its coordinates: V8 boxes fractional arguments of calls it does not
   * inline (an allocation per enemy per tick).
   *
   * @param from - The enemy measuring.
   * @returns The ship, or `null`.
   */
  nearestPlayer(from: Enemy): PlayerShip | null {
    const x = from.x;
    const y = from.y;
    const players = this.host.players;
    let best: PlayerShip | null = null;
    let bestDistance = 0;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.active || p.state !== 'alive') continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (best === null || d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
    return best;
  }

  /** See {@link EnemySystem.spawn}. */
  spawn(enemyIndex: number, x: number, y: number, pathId = -1): Enemy | null {
    return this.spawnEnemy(enemyIndex, x, y, pathId, -1, -1, false);
  }

  /**
   * Spawns an enemy (every spawn goes through here).
   *
   * @param enemyIndex - Spec index.
   * @param x - World x.
   * @param y - World y (`NaN` for a ground enemy = snap to the surface).
   * @param pathId - Spawn path (-1 = none).
   * @param formation - Formation slot (-1 = none).
   * @param member - Member index (-1 = none).
   * @param fromScript - Spawned by a script during phase 4 (its script starts next tick).
   * @returns The enemy, or `null`.
   */
  spawnEnemy(
    enemyIndex: number,
    x: number,
    y: number,
    pathId: number,
    formation: number,
    member: number,
    fromScript: boolean,
  ): Enemy | null {
    const specs = this.specs;
    // A whole index in range (a fractional one would read `undefined` from the spec tables).
    if (!(enemyIndex >= 0 && enemyIndex < specs.hp.length && enemyIndex % 1 === 0)) return null;
    const enemies = this.enemies;
    let enemy: Enemy | null = null;
    for (let i = 0; i < enemies.length; i++) {
      if (enemies[i].state === EnemyState.Free) {
        enemy = enemies[i];
        break;
      }
    }
    if (enemy === null) return null;
    const host = this.host;
    const tick = host.tick;
    const anchor = specs.anchor[enemyIndex];
    enemy.state = EnemyState.Live;
    enemy.specIndex = enemyIndex;
    enemy.hw = specs.hw[enemyIndex];
    enemy.hh = specs.hh[enemyIndex];
    enemy.hp = specs.hp[enemyIndex];
    enemy.anchor = anchor;
    enemy.x = x;
    enemy.y = y === y ? y : this.groundY(anchor, x, enemy.hh, host.camera.y + PLAYFIELD_H / 2);
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.flashTicks = 0;
    enemy.age = 0;
    enemy.spawnTick = tick;
    enemy.formation = formation;
    enemy.member = member;
    enemy.flags = 0;
    enemy.firstSeenTick = -1;
    enemy.spriteId = specs.sprite[enemyIndex];
    enemy.animFrame = 0;
    enemy.pathId = pathId;
    // A flying enemy rides the camera from where it is now: spawns in phases 3 and 4 happen after
    // this tick's camera move, so the next ride only adds the camera's *next* movement.
    enemy.camX = host.camera.x;
    enemy.camY = host.camera.y;
    enemy.track = formation >= 0 ? this.formations.tracks[formation] : null;
    const p = enemyIndex * 6;
    const mp = specs.moverParams;
    const kind = specs.mover[enemyIndex];
    setMover(
      enemy,
      this.movers,
      kind,
      kind === MoverKind.Path && mp[p] < 0 ? pathId : mp[p],
      mp[p + 1],
      mp[p + 2],
      mp[p + 3],
      mp[p + 4],
      mp[p + 5],
    );
    if (formation >= 0 && member === 0) {
      enemy.flags |= EnemyFlag.Leader;
      this.formations.leader[formation] = enemy.slot;
      this.recordTrack(enemy);
    }
    const api = this.apis[enemy.slot];
    api.spec = this.specList[enemyIndex];
    const behavior = specs.behavior[enemyIndex];
    enemy.script = behavior === null ? null : behavior.create(api, specs.params[enemyIndex]);
    enemy.wakeTick = fromScript ? tick + 1 : tick;
    this.used++;
    return enemy;
  }

  /**
   * Where a ground enemy stands: the surface below (floor) / above (ceiling) a start height, or
   * the view's edge when there is none; flying enemies keep the start height.
   *
   * @param anchor - `BodyAnchor` code.
   * @param x - World x.
   * @param hh - Half height.
   * @param startY - World y to search from.
   * @returns The enemy's centre y.
   */
  private groundY(anchor: number, x: number, hh: number, startY: number): number {
    if (anchor === BodyAnchor.Air) return startY;
    const map = this.host.terrain;
    const camera = this.host.camera;
    const px = Math.floor(x);
    const py = Math.floor(startY);
    if (anchor === BodyAnchor.Floor) {
      const surface = map === null ? NaN : findFloor(map, px, py, 4096);
      return (surface === surface ? surface : camera.y + PLAYFIELD_H) - hh;
    }
    const surface = map === null ? NaN : findCeiling(map, px, py, 4096);
    return (surface === surface ? surface : camera.y) + hh;
  }

  /**
   * Spawns an enemy at a view position (stage events, formation members).
   *
   * @param enemyIndex - Spec index.
   * @param screenX - Playfield x.
   * @param screenY - Playfield y (NaN = default).
   * @param pathId - Spawn path.
   * @param formation - Formation slot or -1.
   * @param member - Member index or -1.
   * @returns The enemy, or `null`.
   */
  private spawnAtScreen(
    enemyIndex: number,
    screenX: number,
    screenY: number,
    pathId: number,
    formation: number,
    member: number,
  ): Enemy | null {
    const camera = this.host.camera;
    const x = camera.x + screenX;
    if (!(enemyIndex >= 0 && enemyIndex < this.specs.hp.length)) return null;
    const anchor = this.specs.anchor[enemyIndex];
    const startY = camera.y + (screenY === screenY ? screenY : PLAYFIELD_H / 2);
    const y =
      anchor === BodyAnchor.Air
        ? startY
        : this.groundY(anchor, x, this.specs.hh[enemyIndex], startY);
    return this.spawnEnemy(enemyIndex, x, y, pathId, formation, member, false);
  }

  /** See {@link EnemySystem.startFormation}. */
  startFormation(
    enemyIndex: number,
    count: number,
    interval: number,
    screenX: number,
    screenY: number,
    pathId: number,
    drop: number,
    bonus: number,
  ): number {
    const f = this.formations;
    let slot = -1;
    for (let i = 0; i < MAX_FORMATIONS; i++) {
      if (f.active[i] === 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0 || count < 1) return -1;
    f.active[slot] = 1;
    f.enemy[slot] = enemyIndex;
    f.total[slot] = count;
    f.spawned[slot] = 0;
    f.killed[slot] = 0;
    f.escaped[slot] = 0;
    f.interval[slot] = interval < 1 ? 1 : interval;
    f.nextTick[slot] = this.host.tick;
    f.screenX[slot] = screenX;
    f.screenY[slot] = screenY;
    f.path[slot] = pathId;
    f.drop[slot] = drop;
    f.bonus[slot] = bonus;
    f.lastX[slot] = 0;
    f.lastY[slot] = 0;
    f.leader[slot] = -1;
    f.tracks[slot].reset();
    return slot;
  }

  /** See {@link EnemySystem.onStageEvent}. */
  onStageEvent(eventIndex: number): void {
    const ev = this.spawnEvents;
    const kind = ev.kind[eventIndex];
    if (kind === 1) {
      this.spawnAtScreen(
        ev.enemy[eventIndex],
        ev.screenX[eventIndex],
        ev.screenY[eventIndex],
        ev.path[eventIndex],
        -1,
        -1,
      );
    } else if (kind === 2) {
      this.startFormation(
        ev.enemy[eventIndex],
        ev.count[eventIndex],
        ev.interval[eventIndex],
        ev.screenX[eventIndex],
        ev.screenY[eventIndex],
        ev.path[eventIndex],
        ev.drop[eventIndex],
        ev.bonus[eventIndex],
      );
    }
  }

  /** See {@link EnemySystem.beginTick}. */
  beginTick(): void {
    const o = this.outcomes;
    o.killCount = 0;
    o.dropCount = 0;
    o.bonusPoints = 0;
  }

  /** See {@link EnemySystem.spawnPending}. */
  spawnPending(): void {
    const f = this.formations;
    const tick = this.host.tick;
    for (let slot = 0; slot < MAX_FORMATIONS; slot++) {
      if (f.active[slot] === 0) continue;
      if (f.spawned[slot] >= f.total[slot] || f.nextTick[slot] > tick) continue;
      const member = f.spawned[slot];
      f.spawned[slot] = member + 1;
      f.nextTick[slot] += f.interval[slot];
      const enemy = this.spawnAtScreen(
        f.enemy[slot],
        f.screenX[slot],
        f.screenY[slot],
        f.path[slot],
        slot,
        member,
      );
      if (enemy === null) {
        // No slot (or a bad spec): the member counts as escaped, so the formation can end.
        f.escaped[slot]++;
        this.checkFormation(slot);
      }
    }
  }

  /** See {@link EnemySystem.runScripts}. */
  runScripts(): void {
    const enemies = this.enemies;
    const tick = this.host.tick;
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (enemy.state !== EnemyState.Live || enemy.script === null) continue;
      if (enemy.wakeTick > tick) continue;
      resumeScript(enemy, tick);
    }
  }

  /** See {@link EnemySystem.move}. */
  move(): void {
    const enemies = this.enemies;
    const camera = this.host.camera;
    const movers = this.movers;
    const specs = this.specs;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.state !== EnemyState.Live) continue;
      e.age++;
      if (e.flashTicks > 0) e.flashTicks--;
      if (e.anchor === BodyAnchor.Air) {
        e.x += camera.x - e.camX;
        e.y += camera.y - e.camY;
        e.camX = camera.x;
        e.camY = camera.y;
      }
      const target = this.nearestPlayer(e);
      if (target === null) {
        movers.hasTarget = false;
      } else {
        movers.hasTarget = true;
        movers.targetX = target.x;
        movers.targetY = target.y;
      }
      updateMover(e, movers);
      if (e.vx > 0) e.flags |= EnemyFlag.FaceRight;
      else if (e.vx < 0) e.flags &= ~EnemyFlag.FaceRight;
      const track = e.track;
      if ((e.flags & EnemyFlag.Leader) !== 0 && track !== null) {
        // `recordTrack` inlined: a method called once per tick stays in V8's lower tiers for a
        // long time, and those box every double field they read (an allocation per tick).
        const air = e.anchor === BodyAnchor.Air ? 1 : 0;
        const slot = e.age % FOLLOW_HISTORY;
        track.x[slot] = e.x - camera.x * air;
        track.y[slot] = e.y - camera.y * air;
        if (e.age + 1 > track.recorded) track.recorded = e.age + 1;
      }
      const frames = specs.animFrames[e.specIndex];
      e.animFrame = frames > 1 ? Math.floor(e.age / specs.animTicks[e.specIndex]) % frames : 0;
      this.checkView(e);
    }
  }

  /**
   * Records a leader's spawn position (age 0) in its formation's track (in its frame; the
   * per-tick recording is inlined in {@link EnemySystemImpl.move}).
   *
   * @param e - The leader.
   */
  private recordTrack(e: Enemy): void {
    const track = e.track;
    if (track === null) return;
    const camera = this.host.camera;
    const air = e.anchor === BodyAnchor.Air;
    track.record(e.age, air ? e.x - camera.x : e.x, air ? e.y - camera.y : e.y);
  }

  /**
   * The on-screen, settle and despawn rules for one enemy after it moved.
   *
   * @param e - The enemy.
   */
  private checkView(e: Enemy): void {
    const camera = this.host.camera;
    const left = camera.x;
    const top = camera.y;
    const right = left + PLAYFIELD_W;
    const bottom = top + PLAYFIELD_H;
    const x0 = e.x - e.hw;
    const x1 = e.x + e.hw;
    const y0 = e.y - e.hh;
    const y1 = e.y + e.hh;
    const ghost = (e.flags & EnemyFlag.Ghost) !== 0;
    if (!ghost) {
      if (x1 >= left && x0 <= right && y1 >= top && y0 <= bottom) {
        e.flags |= EnemyFlag.OnScreen;
        if ((e.flags & EnemyFlag.WasOnScreen) === 0) {
          e.flags |= EnemyFlag.WasOnScreen;
          e.firstSeenTick = this.host.tick;
        }
      } else {
        e.flags &= ~EnemyFlag.OnScreen;
      }
      if (
        (e.flags & EnemyFlag.WasOnScreen) !== 0 &&
        this.host.tick - e.firstSeenTick >= this.specs.settle[e.specIndex]
      ) {
        e.flags |= EnemyFlag.Settled;
      }
    }
    const seen = (e.flags & EnemyFlag.WasOnScreen) !== 0;
    const margin = ghost ? GHOST_MARGIN : seen ? DESPAWN_MARGIN : UNSEEN_MARGIN;
    const outside =
      x1 < left - margin || x0 > right + margin || y1 < top - margin || y0 > bottom + margin;
    if (ghost) {
      if (outside) this.removeGhost(e);
    } else if (outside || (!seen && e.age >= UNSEEN_TICKS)) {
      this.escape(e);
    }
  }

  /** See {@link EnemySystem.insertColliders}. */
  insertColliders(grid: SpatialGrid): void {
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
      // Whole-pixel bounds that contain the hurtbox: the grid is only the broad phase (callers
      // test the exact box), and small integers are never boxed as call arguments (`| 0` also
      // turns the -0 of `Math.ceil(-0.5)` into 0, which V8 would have to box).
      grid.insert(
        e.slot,
        Math.floor(e.x - e.hw) | 0,
        Math.floor(e.y - e.hh) | 0,
        Math.ceil(e.x + e.hw) | 0,
        Math.ceil(e.y + e.hh) | 0,
      );
    }
  }

  /** See {@link EnemySystem.collidePlayers}. */
  collidePlayers(grid: SpatialGrid): void {
    const players = this.host.players;
    const r = this.host.ship.hurtRadius;
    for (let i = 0; i < players.length; i++) {
      const ship = players[i];
      if (!ship.active || ship.state !== 'alive') continue;
      this.contactShip = ship;
      this.contactHit = false;
      grid.query(
        Math.floor(ship.x - r) | 0,
        Math.floor(ship.y - r) | 0,
        Math.ceil(ship.x + r) | 0,
        Math.ceil(ship.y + r) | 0,
        this.onContact,
      );
    }
    this.contactShip = null;
  }

  /**
   * Grid visitor of {@link EnemySystemImpl.collidePlayers}: exact circle-vs-box test, then
   * `playerHit(Contact)` (at most one accepted hit per player and tick).
   *
   * @param slot - The enemy slot the grid returned.
   */
  private contactVisit(slot: number): void {
    const ship = this.contactShip;
    if (ship === null || this.contactHit || !(slot >= 0 && slot < MAX_ENEMIES)) return;
    const e = this.enemies[slot];
    if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) return;
    const host = this.host;
    // `circleAabb` inlined (closed test: touching counts), so no fractional call arguments.
    const r = host.ship.hurtRadius;
    const ox = Math.abs(ship.x - e.x) - e.hw;
    const oy = Math.abs(ship.y - e.y) - e.hh;
    const dx = ox > 0 ? ox : 0;
    const dy = oy > 0 ? oy : 0;
    if (dx * dx + dy * dy <= r * r) {
      if (playerHit(ship, PlayerHitCause.Contact, host.tick, host.debugFlags)) {
        this.contactHit = true;
      }
    }
  }

  /** See {@link EnemySystem.damage}. */
  damage(enemy: Enemy, amount: number): boolean {
    if (enemy.state !== EnemyState.Live) return false;
    const flags = enemy.flags;
    if ((flags & (EnemyFlag.Ghost | EnemyFlag.Invulnerable)) !== 0) return false;
    enemy.hp -= amount;
    enemy.flashTicks = HIT_FLASH_TICKS;
    if (enemy.hp > 0) {
      this.host.events.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, enemy.x, enemy.y, 0);
      return false;
    }
    return this.kill(enemy);
  }

  /** See {@link EnemySystem.kill}. */
  kill(enemy: Enemy): boolean {
    if (enemy.state !== EnemyState.Live || (enemy.flags & EnemyFlag.Ghost) !== 0) return false;
    const specs = this.specs;
    const spec = enemy.specIndex;
    const x = enemy.x;
    const y = enemy.y;
    const o = this.outcomes;
    if (o.killCount < OUTCOME_CAPACITY) {
      const k = o.killCount;
      o.killSpec[k] = spec;
      o.killX[k] = x;
      o.killY[k] = y;
      o.killScore[k] = specs.score[spec];
      o.killCount = k + 1;
    }
    const size = specs.explosion[spec];
    const events = this.host.events;
    events.push(SimEventKind.Sfx, EXPLOSION_SFX[size], x, y, 0);
    events.push(SimEventKind.Particles, EXPLOSION_FX[size], x, y, 1);
    if (specs.drop[spec] !== DropKind.None) o.addDrop(specs.drop[spec], x, y);
    const slot = enemy.formation;
    if (slot < 0) {
      this.remove(enemy);
      return true;
    }
    const f = this.formations;
    f.killed[slot]++;
    f.lastX[slot] = x;
    f.lastY[slot] = y;
    this.leaveFormation(enemy, slot);
    return true;
  }

  /**
   * An enemy left the view for good: removed, counted as escaped.
   *
   * @param enemy - The enemy.
   */
  private escape(enemy: Enemy): void {
    const slot = enemy.formation;
    if (slot < 0) {
      this.remove(enemy);
      return;
    }
    this.formations.escaped[slot]++;
    this.leaveFormation(enemy, slot);
  }

  /**
   * A formation member was resolved (killed or escaped): a leader with members still out turns
   * into a ghost, anything else is removed; then the formation is checked for completion.
   *
   * @param enemy - The member.
   * @param slot - Its formation slot.
   */
  private leaveFormation(enemy: Enemy, slot: number): void {
    const f = this.formations;
    const pending = f.spawned[slot] < f.total[slot];
    const unresolved = f.killed[slot] + f.escaped[slot] < f.total[slot];
    if ((enemy.flags & EnemyFlag.Leader) !== 0 && (pending || unresolved)) {
      enemy.flags = (enemy.flags | EnemyFlag.Ghost) & ~(EnemyFlag.OnScreen | EnemyFlag.Settled);
    } else {
      if ((enemy.flags & EnemyFlag.Leader) !== 0) f.leader[slot] = -1;
      this.remove(enemy);
    }
    this.checkFormation(slot);
  }

  /**
   * Ends a formation once every member is resolved; a complete kill drops its capsule and emits
   * the bonus.
   *
   * @param slot - The formation slot.
   */
  private checkFormation(slot: number): void {
    const f = this.formations;
    if (f.active[slot] === 0) return;
    const total = f.total[slot];
    if (f.spawned[slot] < total || f.killed[slot] + f.escaped[slot] < total) return;
    if (f.escaped[slot] === 0 && f.killed[slot] === total) {
      const x = f.lastX[slot];
      const y = f.lastY[slot];
      if (f.drop[slot] !== DropKind.None) this.outcomes.addDrop(f.drop[slot], x, y);
      this.outcomes.bonusPoints += f.bonus[slot];
      this.host.events.push(SimEventKind.FormationBonus, slot, x, y, f.bonus[slot]);
    }
    const leader = f.leader[slot];
    if (leader >= 0) {
      const ghost = this.enemies[leader];
      if (ghost.state === EnemyState.Live && ghost.formation === slot) this.remove(ghost);
    }
    f.leader[slot] = -1;
    f.active[slot] = 0;
  }

  /**
   * Removes a ghost leader that flew too far (its formation goes on without a track).
   *
   * @param ghost - The ghost.
   */
  private removeGhost(ghost: Enemy): void {
    const slot = ghost.formation;
    if (slot >= 0 && this.formations.leader[slot] === ghost.slot) this.formations.leader[slot] = -1;
    this.remove(ghost);
  }

  /**
   * Marks an enemy removed (its slot is freed in phase 8) and drops its script.
   *
   * @param enemy - The enemy.
   */
  private remove(enemy: Enemy): void {
    enemy.state = EnemyState.Removed;
    enemy.script = null;
    enemy.flags &= ~(EnemyFlag.OnScreen | EnemyFlag.Settled);
  }

  /** See {@link EnemySystem.flush}. */
  flush(): void {
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.state !== EnemyState.Removed) continue;
      e.state = EnemyState.Free;
      e.script = null;
      e.track = null;
      this.apis[i].spec = NO_SPEC;
      this.used--;
    }
  }

  /** See {@link EnemySystem.clear}. */
  clear(): void {
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      e.state = EnemyState.Free;
      e.script = null;
      e.track = null;
      this.apis[i].spec = NO_SPEC;
    }
    this.used = 0;
    const f = this.formations;
    f.active.fill(0);
    f.leader.fill(-1);
    for (let i = 0; i < MAX_FORMATIONS; i++) f.tracks[i].reset();
    this.beginTick();
    this.groundBatch.count = 0;
    this.airBatch.count = 0;
  }

  /** See {@link EnemySystem.sync}. */
  sync(): void {
    const ground = this.groundBatch;
    const air = this.airBatch;
    ground.count = 0;
    air.count = 0;
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.state !== EnemyState.Live || e.spriteId < 0) continue;
      const flags = e.flags;
      if ((flags & EnemyFlag.Ghost) !== 0) continue;
      const draw =
        (e.flashTicks > 0 ? SpriteFlag.Flash : 0) |
        ((flags & EnemyFlag.FaceRight) !== 0 ? SpriteFlag.FlipX : 0) |
        (e.anchor === BodyAnchor.Ceiling ? SpriteFlag.FlipY : 0);
      // `pushSprite` inlined (its fractional x / y arguments would be boxed if not inlined).
      const batch = e.anchor === BodyAnchor.Air ? air : ground;
      const slot = batch.count;
      if (slot >= batch.capacity) continue;
      batch.x[slot] = e.x;
      batch.y[slot] = e.y;
      batch.spriteId[slot] = e.spriteId;
      batch.frame[slot] = e.animFrame;
      batch.flags[slot] = draw;
      batch.count = slot + 1;
    }
  }
}

/**
 * Creates the enemy system of a World (load time): {@link MAX_ENEMIES} enemies with their script
 * APIs, the formation table and tracks, the sprite batches, the compiled specs and the compiled
 * spawn events of the stage.
 *
 * @param host - The World (read at every call — pass the World itself).
 * @param behaviors - Behaviour lookup (`core/behaviors` `DEFAULT_BEHAVIORS`); specs whose script
 *   it does not know spawn without a script (content validation reports them).
 * @param stage - The World's stage (its spawn events are compiled), or `null`.
 * @returns The system.
 *
 * @example
 * ```ts
 * const enemies = createEnemySystem(world, DEFAULT_BEHAVIORS, stageSpec);
 * const drifter = enemies.spawn(db.enemyIndex.get('drifter')!, camera.x + 300, 100);
 * ```
 */
export function createEnemySystem(
  host: EnemyHost,
  behaviors: EnemyBehaviorLookup,
  stage: StageSpec | null,
): EnemySystem {
  return new EnemySystemImpl(host, behaviors, stage);
}
