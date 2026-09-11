/**
 * # world — the gameplay session state and the fixed tick pipeline
 *
 * **Responsibility.** {@link World} holds everything one gameplay session simulates: the tick
 * counter, the two RNG streams, the presentation event queue, the player ships and their
 * intents, the camera, the session status, hit-stop, debug switches, the registry of
 * struct-of-arrays pools and the read-only {@link WorldView} the renderer draws.
 * {@link stepWorld} advances it by exactly one tick by running the systems of
 * {@link WORLD_PHASES} **in their fixed order** (plan §3.2, shmup_feat.md §22):
 *
 * ```
 * 1 input      per-player intents from the InputSnapshot (context 'game')
 * 2 players    movement, state timers, weapon fire requests, option trail record
 * 3 stage      camera path, event cursor, pending formation spawns, checkpoints
 * 4 scripts    wake sleeping enemy/boss coroutines; patterns fire bullets
 * 5 movement   movers (enemies), bullets, player shots, items, lasers
 * 6 collision  grid build; shots×enemies, bullets/lasers×players, enemies×players, items×players, terrain
 * 7 damage     apply hits, deaths, drops, score, player death/respawn, formation bonuses
 * 8 removal    deferred pool flushes
 * 9 fx         hit-stop/shake/flash timers, emit presentation events, view mirrors, debug counters
 * ```
 *
 * Later steps fill the slots (M1-07 stage, M1-08 enemies, M1-09 … M1-12 bullets, shots, items
 * and damage); the order never changes. While {@link World.hitStop} is non-zero at the start of a
 * tick, phases 2–8 are skipped but the tick counter and phase 9 (which counts the hit-stop down)
 * still run, so hit-stop is deterministic and replays stay in sync.
 *
 * **State built in M1-06.** Player 1's KESTREL (spec from `content/player/`, fly-in at session
 * start); player 2's ship exists but stays inactive until co-op (M2-06). The view's sprite
 * batches — the ground and flying enemies (M1-08) and the players (`LayerId.Player`) — are
 * mirrored from the objects at the end of every tick.
 *
 * **The stage (M1-07).** With `config.stage` set, the World runs that stage: its
 * {@link World.stage | runner} drives the camera in phase 3 (keys, ramps, pans, locks) and fires
 * the timeline through the World's stage hooks — `music` events become `SimEventKind.Music`
 * presentation events (the stage theme is queued at creation), `end` sets the status to
 * `stageClear`, `spawn` / `formation` go to the enemy system, a checkpoint restart clears every
 * pool and every enemy; `warning` / `boss` wait for M1-13. Phase 6 tests each alive ship's
 * terrain box against the stage's {@link World.terrain | collision map} and reports contact
 * through `playerHit` (recorded only until the death sequence of M1-12). The view carries the
 * stage's parallax bands (scrolled in phase 9) and terrain. Without a stage (`stage: null`) the
 * camera is static unless something sets its scroll velocity (`camera.vx` / `camera.vy`) — free
 * flight.
 *
 * **Enemies (M1-08).** {@link World.enemies} (`core/enemies`, behaviours from `core/behaviors`)
 * takes part in phases 3 (spawns: stage events and due formation members), 4 (behaviour
 * coroutines that wake), 5 (movers, off-screen rules), 6 (hurtboxes into the grid, contact with
 * the ships → `playerHit(Contact)`), 8 (freeing removed slots) and 9 (the ground / air sprite
 * batches, drawn below the ships).
 *
 * **Enemy bullets and lasers (M1-09).** {@link World.bullets} (`core/bullets`) owns the
 * `enemyBullets` / `enemyLasers` pools: scripts fire in phase 4, bullets and lasers move in
 * phase 5 (after the enemies, so attached lasers follow their enemy's new position) and hit the
 * players in phase 6 (`playerHit(Bullet / Laser)`); the view carries the bullet pool as the
 * `LayerId.EnemyBullets` batch and the lasers as `view.lasers`. {@link World.rank} is the
 * session's rank (`core/rank`: the difficulty's base, constant in M1); the bullet system scales
 * bullet speeds and fire intervals by it. The engine's own sprites (bullets, laser beam) are
 * {@link ENGINE_SPRITES} — hosts load content with `extraSprites: ENGINE_SPRITES` so they draw.
 *
 * **Player weapons (M1-10).** {@link World.weapons} (`core/weapons`, Options from `core/options`)
 * owns the `playerShots` pool, one loadout (`config.loadout` at creation) and one option group per
 * player: after the ships move in phase 2 the option trails advance and every shooter (ship and
 * Options) autofires; shots move in phase 5 (after the enemies and bullets), find their hits
 * through the grid in phase 6 and apply them in phase 7 (`EnemySystem.damage`); the view carries
 * the `LayerId.PlayerShots` batch and the Options' batch (below the ships). The Option sprite is
 * one of the {@link ENGINE_SPRITES}.
 *
 * **Zero allocation.** Everything is allocated by {@link createWorld}; {@link stepWorld} and the
 * systems only write numbers into existing objects and typed arrays.
 *
 * **Implements.**
 * - shmup_feat.md §22 — architecture (sim/presentation split, event queue), fixed tick order,
 *   determinism (seeded RNG streams), hybrid data layout (SoA pools + objects)
 * - shmup_feat.md §5 — the player ship inside the session
 * - shmup_feat.md §18 — hit-stop freezes the simulation, not the presentation
 *
 * **Public API.** {@link createWorld}, {@link WorldOptions}, {@link stepWorld}, {@link World},
 * {@link WorldCamera},
 * {@link WorldStatus}, {@link WORLD_STATUSES}, {@link WorldPhase}, {@link WORLD_PHASE_NAMES},
 * {@link WORLD_PHASES}, {@link WorldPhaseEntry}, {@link WorldSystem}, {@link PoolRegistry},
 * {@link RegisteredPool}, {@link syncWorldView}, {@link GRID_MARGIN}, {@link resolveWorldStage},
 * {@link ENGINE_SPRITES}.
 *
 * @module
 */
import { MAX_PLAYERS, type InputSnapshot } from '../input/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, type GameConfig } from '../config/index.js';
import {
  TerrainType,
  createSpatialGrid,
  terrainRectHit,
  type SpatialGrid,
  type TerrainMap,
} from '../collision/index.js';
import { DEFAULT_BEHAVIORS } from '../behaviors/index.js';
import { BULLET_SPRITES, createBulletSystem, type BulletSystem } from '../bullets/index.js';
import type { ContentDb, PlayerShipSpec, StageMusicEvent, StageSpec } from '../data/index.js';
import { createDebugFlags, type DebugFlags } from '../debug/index.js';
import { createEnemySystem, type EnemyBehaviorLookup, type EnemySystem } from '../enemies/index.js';
import { OPTION_SPRITE } from '../options/index.js';
import { applyLoadoutPreset, createWeaponSystem, type WeaponSystem } from '../weapons/index.js';
import { SimEventKind, createEventQueue, type EventQueue } from '../events/index.js';
import { defineModule } from '../module-info.js';
import {
  PlayerHitCause,
  createPlayer,
  createPlayerIntent,
  playerBankFrame,
  playerHit,
  readPlayerIntent,
  resolvePlayerShip,
  spawnPlayer,
  updatePlayer,
  type PlayerCamera,
  type PlayerIntent,
  type PlayerShip,
} from '../player/index.js';
import type { SoaArray, SoaPool, SoaSchema } from '../pools/index.js';
import {
  LayerId,
  SpriteFlag,
  createSpriteBatch,
  pushSprite,
  type SpriteBatch,
  type LaserView,
  type SpriteBatchView,
  type WorldView,
} from '../presentation/index.js';
import { computeRank, difficultyRankInputs } from '../rank/index.js';
import { createRngStreams, type RngStreams } from '../rng/index.js';
import {
  StageEventCode,
  createParallaxView,
  createStageCamera,
  createStageRunner,
  createStageTerrain,
  createTerrainView,
  updateParallaxView,
  type StageHooks,
  type StageParallaxView,
  type StageRunner,
} from '../stage/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'world',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §5', 'shmup_feat.md §18'],
});

/** What the session is doing (the scene stack of M1-16 reacts to it). */
export type WorldStatus = 'playing' | 'bossWarning' | 'stageClear' | 'gameOver';

/** Every {@link WorldStatus}; the index is the status code in state hashes. */
export const WORLD_STATUSES: readonly WorldStatus[] = Object.freeze([
  'playing',
  'bossWarning',
  'stageClear',
  'gameOver',
] as WorldStatus[]);

/**
 * The world camera: the world-space top-left corner of the playfield view, its scroll velocity
 * and its last movement. The renderer reads `x` / `y` (it is the view's {@link CameraView}).
 */
export interface WorldCamera extends PlayerCamera {
  /** World x of the playfield's left edge. */
  x: number;
  /** World y of the playfield's top edge. */
  y: number;
  /** Camera x movement of the last stage phase (players ride along with it). */
  dx: number;
  /** Camera y movement of the last stage phase. */
  dy: number;
  /** Horizontal scroll velocity in px/tick (0 = static; the stage runner sets it every tick). */
  vx: number;
  /** Vertical scroll velocity in px/tick. */
  vy: number;
}

/** A struct-of-arrays pool as the world tracks it (flushes, hashing, clearing). */
export interface RegisteredPool {
  /** Registry name, e.g. `enemyBullets`. */
  readonly name: string;
  /** The pool. */
  readonly pool: Pick<SoaPool<SoaSchema>, 'count' | 'capacity' | 'flush' | 'clear'>;
  /** The pool's field arrays in sorted field-name order (the state-hash order). */
  readonly arrays: readonly SoaArray[];
}

/**
 * The pools of a world. Systems register their SoA pools at creation; the removal phase flushes
 * them all, `hashWorld` hashes their live slots.
 */
export interface PoolRegistry {
  /** Registered pools, in registration order. */
  readonly entries: readonly RegisteredPool[];
  /**
   * Adds a pool (load time only).
   *
   * @param name - Unique name.
   * @param pool - The pool.
   * @returns The same pool, for chaining.
   * @throws {Error} When `name` is already registered.
   */
  register<S extends SoaSchema>(name: string, pool: SoaPool<S>): SoaPool<S>;
  /** Applies every pool's deferred frees (tick phase 8). */
  flushAll(): void;
  /** Empties every pool (stage restart). */
  clearAll(): void;
}

/** One gameplay session (see the module docs for the tick pipeline). */
export interface World {
  /** The session's configuration. */
  readonly config: GameConfig;
  /** Validated content. */
  readonly content: ContentDb;
  /** The ship the players fly (spec from `content/player/`, or the built-in default). */
  readonly ship: PlayerShipSpec;
  /** Ticks simulated so far (during a tick: the index of the tick being run). */
  tick: number;
  /** Gameplay and cosmetic RNG streams, seeded from `config.seed`. */
  readonly rng: RngStreams;
  /** Presentation events (SFX, particles, shake …); the host drains it once per frame. */
  readonly events: EventQueue;
  /** Exactly {@link MAX_PLAYERS} ships; index 0 = player 1 (P2 inactive until co-op). */
  readonly players: readonly PlayerShip[];
  /** Per-player intents of the current tick (phase 1). */
  readonly intents: readonly PlayerIntent[];
  /** The camera. */
  readonly camera: WorldCamera;
  /** Session status. */
  status: WorldStatus;
  /** Remaining hit-stop ticks: while > 0, phases 2–8 are skipped (M1-12 requests it). */
  hitStop: number;
  /** Debug switches (god mode, hitboxes, frame advance, slow motion). */
  readonly debugFlags: DebugFlags;
  /** Struct-of-arrays pools of the session's systems. */
  readonly pools: PoolRegistry;
  /** Broad-phase grid over the camera view (+ {@link GRID_MARGIN}), rebuilt in phase 6. */
  readonly grid: SpatialGrid;
  /** The player ships' mirror batch (`LayerId.Player`). */
  readonly playerBatch: SpriteBatch;
  /** The stage runner (`config.stage`), or `null` in free flight. */
  readonly stage: StageRunner | null;
  /** The stage's collision map (a private copy of its tiles), or `null` in open space. */
  readonly terrain: TerrainMap | null;
  /** The stage's parallax bands (also `view.parallax`), or `null`. */
  readonly parallax: StageParallaxView | null;
  /** The enemies (spawns, formations, scripts, movers, contact; `core/enemies`). */
  readonly enemies: EnemySystem;
  /** Enemy bullets and lasers (`core/bullets`). */
  readonly bullets: BulletSystem;
  /** The players' weapons, loadouts and Options (`core/weapons`, `core/options`). */
  readonly weapons: WeaponSystem;
  /** The session's rank (`core/rank`; constant in M1: the difficulty's base). */
  rank: number;
  /** What the renderer draws: live references, refreshed at the end of every tick. */
  readonly view: WorldView;
}

/**
 * Options of {@link createWorld} beyond the config (tests and tools). Not part of `GameConfig`:
 * nothing here is recorded in a replay header, so a session must use the defaults.
 *
 * @example
 * ```ts
 * const probe = defineBehavior('probe', {}, function* (api) {
 *   api.setMover(MoverKind.Straight, -1, 0);
 *   yield SLEEP_FOREVER;
 * });
 * const behaviors = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, probe]);
 * const world = createWorld(config, db, { behaviors });
 * ```
 */
export interface WorldOptions {
  /**
   * Enemy behaviours by script id (default: `core/behaviors` `DEFAULT_BEHAVIORS`). A spec whose
   * `script` the lookup does not know spawns without a script (it only runs its spec mover).
   */
  readonly behaviors?: EnemyBehaviorLookup;
}

/**
 * A system function of one tick phase.
 *
 * @param world - The world.
 * @param input - The tick's input snapshot (read-only).
 */
export type WorldSystem = (world: World, input: Readonly<InputSnapshot>) => void;

/** Tick phases in order (plan §3.2); the value is the position in {@link WORLD_PHASES}. */
export const WorldPhase = {
  /** 1 — per-player intents from the input snapshot. */
  Input: 0,
  /** 2 — player movement, state timers, fire requests, option trail. */
  Players: 1,
  /** 3 — camera path, event cursor, spawns, checkpoints. */
  Stage: 2,
  /** 4 — enemy / boss coroutines and attack patterns. */
  Scripts: 3,
  /** 5 — movers, bullets, shots, items, lasers. */
  Movement: 4,
  /** 6 — broad phase and every overlap test. */
  Collision: 5,
  /** 7 — hits, deaths, drops, score, respawn. */
  Damage: 6,
  /** 8 — deferred pool flushes. */
  Removal: 7,
  /** 9 — effect timers, presentation events, view mirrors. */
  Fx: 8,
} as const;

/** A {@link WorldPhase} value. */
export type WorldPhase = (typeof WorldPhase)[keyof typeof WorldPhase];

/** Phase names by {@link WorldPhase} (debug overlays, profiling). */
export const WORLD_PHASE_NAMES: readonly string[] = Object.freeze([
  'input',
  'players',
  'stage',
  'scripts',
  'movement',
  'collision',
  'damage',
  'removal',
  'fx',
]);

/** One entry of the tick pipeline. */
export interface WorldPhaseEntry {
  /** The phase. */
  readonly phase: WorldPhase;
  /** Its name (see {@link WORLD_PHASE_NAMES}). */
  readonly name: string;
  /** Whether the phase also runs during hit-stop (only input and fx do). */
  readonly runsDuringHitStop: boolean;
  /** The system function. */
  readonly run: WorldSystem;
}

/** Extra border of the broad-phase grid around the camera view, in pixels. */
export const GRID_MARGIN = 64;

/**
 * Phase 1: copies each player's input into its intent (every slot, active or not, so a joining
 * player's device is known).
 *
 * @param world - The world.
 * @param input - The tick's input.
 */
const inputSystem: WorldSystem = (world, input) => {
  const players = input.players;
  const intents = world.intents;
  for (let i = 0; i < intents.length && i < players.length; i++) {
    readPlayerIntent(intents[i], players[i]);
  }
};

/**
 * Phase 2: moves the ships, then the weapons follow them: option trails, autofire.
 *
 * @param world - The world.
 */
const playersSystem: WorldSystem = (world) => {
  const players = world.players;
  for (let i = 0; i < players.length; i++) {
    updatePlayer(players[i], world.ship, world.intents[i], world.camera);
  }
  world.weapons.updatePlayers();
};

/**
 * Phase 3: the stage runner moves the camera and fires the due timeline events; without a stage
 * the camera moves by its scroll velocity (`vx` / `vy`, static by default). Either way `dx` /
 * `dy` record the step players ride along with next tick.
 *
 * @param world - The world.
 */
const stageSystem: WorldSystem = (world) => {
  const enemies = world.enemies;
  enemies.beginTick();
  const stage = world.stage;
  if (stage !== null) {
    stage.tick();
  } else {
    const camera = world.camera;
    camera.dx = camera.vx;
    camera.dy = camera.vy;
    camera.x += camera.dx;
    camera.y += camera.dy;
  }
  enemies.spawnPending();
};

/**
 * Phase 4: resumes the enemy coroutines that wake this tick (they fire bullets and lasers).
 *
 * @param world - The world.
 */
const scriptsSystem: WorldSystem = (world) => {
  world.enemies.runScripts();
};

/**
 * Phase 5: enemy movers and the off-screen rules, then enemy bullets and lasers, then the player
 * shots (items join in M1-11).
 *
 * @param world - The world.
 */
const movementSystem: WorldSystem = (world) => {
  world.enemies.move();
  world.bullets.update();
  world.weapons.update();
};

/**
 * Phase 6: rebuilds the broad-phase grid around the camera view with the enemy hurtboxes, then
 * the overlap tests: enemies × players (contact), player shots × enemies (hits found here, applied
 * in phase 7), bullets / lasers × players, terrain × players.
 *
 * @remarks
 * The grid origin is the camera position floored to whole pixels: it only decides which cell a
 * box lands in (queries test the stored boxes exactly), and whole numbers travel as small
 * integers, whereas a fractional camera position would be boxed into a 16-byte heap number per
 * argument whenever V8 does not inline the call — an allocation per scrolling axis per tick.
 *
 * @param world - The world.
 */
const collisionSystem: WorldSystem = (world) => {
  const grid = world.grid;
  const camera = world.camera;
  const enemies = world.enemies;
  grid.begin(Math.floor(camera.x) - GRID_MARGIN, Math.floor(camera.y) - GRID_MARGIN);
  enemies.insertColliders(grid);
  grid.build();
  enemies.collidePlayers(grid);
  world.weapons.collide(grid);
  world.bullets.collidePlayers();
  const terrain = world.terrain;
  if (terrain !== null) terrainSystem(world, terrain);
};

/**
 * Part of phase 6: each alive ship's terrain box against the stage terrain; contact is reported
 * through `playerHit` (cause `Terrain` — recorded only until the death sequence of M1-12).
 *
 * @param world - The world.
 * @param terrain - The stage's collision map.
 */
function terrainSystem(world: World, terrain: TerrainMap): void {
  const box = world.ship.terrainBox;
  const players = world.players;
  for (let i = 0; i < players.length; i++) {
    const ship = players[i];
    if (!ship.active || ship.state !== 'alive') continue;
    // Whole-pixel bounds (as `boxHitsTerrain` computes them): fractional arguments would be
    // boxed into heap numbers by a call V8 does not inline.
    const x0 = Math.floor(ship.x - box.hw);
    const y0 = Math.floor(ship.y - box.hh);
    const x1 = Math.ceil(ship.x + box.hw) - 1;
    const y1 = Math.ceil(ship.y + box.hh) - 1;
    const hit = terrainRectHit(terrain, x0, y0, x1 < x0 ? x0 : x1, y1 < y0 ? y0 : y1);
    if (hit !== TerrainType.Empty) {
      playerHit(ship, PlayerHitCause.Terrain, world.tick, world.debugFlags);
    }
  }
}

/**
 * Phase 7: applies the player shots' hits (damage, deaths, drops, kill records — `core/weapons`);
 * score and respawn join in M1-12.
 *
 * @param world - The world.
 */
const damageSystem: WorldSystem = (world) => {
  world.weapons.applyHits();
};

/**
 * Phase 8: applies every pool's deferred frees.
 *
 * @param world - The world.
 */
const removalSystem: WorldSystem = (world) => {
  world.pools.flushAll();
  world.enemies.flush();
};

/**
 * Phase 9: counts hit-stop down and refreshes the view mirrors.
 *
 * @param world - The world.
 */
const fxSystem: WorldSystem = (world) => {
  if (world.hitStop > 0) world.hitStop--;
  syncWorldView(world);
};

/**
 * The tick pipeline in its fixed order (plan §3.2). {@link stepWorld} runs it front to back;
 * later steps fill the empty slots — never reorder it.
 */
export const WORLD_PHASES: readonly WorldPhaseEntry[] = Object.freeze([
  { phase: WorldPhase.Input, name: 'input', runsDuringHitStop: true, run: inputSystem },
  { phase: WorldPhase.Players, name: 'players', runsDuringHitStop: false, run: playersSystem },
  { phase: WorldPhase.Stage, name: 'stage', runsDuringHitStop: false, run: stageSystem },
  { phase: WorldPhase.Scripts, name: 'scripts', runsDuringHitStop: false, run: scriptsSystem },
  { phase: WorldPhase.Movement, name: 'movement', runsDuringHitStop: false, run: movementSystem },
  {
    phase: WorldPhase.Collision,
    name: 'collision',
    runsDuringHitStop: false,
    run: collisionSystem,
  },
  { phase: WorldPhase.Damage, name: 'damage', runsDuringHitStop: false, run: damageSystem },
  { phase: WorldPhase.Removal, name: 'removal', runsDuringHitStop: false, run: removalSystem },
  { phase: WorldPhase.Fx, name: 'fx', runsDuringHitStop: true, run: fxSystem },
]);

/**
 * Creates an empty pool registry.
 *
 * @returns The registry.
 */
function createPoolRegistry(): PoolRegistry {
  const entries: RegisteredPool[] = [];
  return {
    entries,
    register(name, pool) {
      for (const entry of entries) {
        if (entry.name === name) throw new Error(`pool "${name}" is already registered`);
      }
      const fields = pool.fields as Readonly<Record<string, SoaArray>>;
      const arrays: SoaArray[] = [];
      for (const key of Object.keys(fields).sort()) arrays.push(fields[key]);
      entries.push({ name, pool, arrays });
      return pool;
    },
    flushAll() {
      for (let i = 0; i < entries.length; i++) entries[i].pool.flush();
    },
    clearAll() {
      for (let i = 0; i < entries.length; i++) entries[i].pool.clear();
    },
  };
}

/**
 * Looks up the stage a config asks for.
 *
 * @param config - The session config.
 * @param content - Validated content.
 * @returns The stage spec, or `null` when `config.stage` is `null` (free flight).
 * @throws {RangeError} When `config.stage` names a stage the content does not have.
 *
 * @example
 * ```ts
 * resolveWorldStage(resolveGameConfig({ stage: 'test-range' }), db)?.name; // → 'TEST RANGE'
 * ```
 */
export function resolveWorldStage(config: GameConfig, content: ContentDb): StageSpec | null {
  const id = config.stage;
  if (id === null) return null;
  const index = content.stageIndex.get(id);
  if (index === undefined) {
    throw new RangeError(`GameConfig.stage: no stage "${id}" in the content`);
  }
  return content.stages[index];
}

/** A {@link World} while {@link createWorld} assembles it (the stage fields are set last). */
type WorldUnderConstruction = Omit<World, 'stage' | 'enemies' | 'bullets' | 'weapons'> & {
  /** See {@link World.stage}. */
  stage: StageRunner | null;
  /** See {@link World.enemies}. */
  enemies: EnemySystem;
  /** See {@link World.bullets}. */
  bullets: BulletSystem;
  /** See {@link World.weapons}. */
  weapons: WeaponSystem;
};

/**
 * The sprites the engine draws on its own, whatever the content: the enemy bullet kinds and the
 * laser beam (`core/bullets` `BULLET_SPRITES`), then the Option (`core/options` `OPTION_SPRITE`).
 * Hosts pass it as `loadContent`'s `extraSprites` (the shell's loader does by default) so the
 * World can resolve their sprite ids and `pnpm content:check` verifies them against the atlas.
 */
export const ENGINE_SPRITES: readonly string[] = Object.freeze([...BULLET_SPRITES, OPTION_SPRITE]);

/**
 * Creates a gameplay session: RNG streams from `config.seed`, the ship from `content`, the stage
 * `config.stage` (camera at its start, stage theme queued as a music event) or a static camera,
 * the enemy system (specs and the stage's spawn events compiled, 64 free slots), player 1
 * starting its fly-in at the left edge of the view, player 2 inactive.
 *
 * @param config - The resolved session config (`resolveGameConfig`).
 * @param content - Validated content (`loadContent(...).db`; `EMPTY_CONTENT_DB` gives the
 *   built-in default ship, which is not drawn).
 * @param options - Extra options (a behaviour registry for tests).
 * @returns The world at tick 0, view already filled (the first frame shows the ship).
 * @throws {RangeError} When `config.stage` names a stage the content does not have.
 *
 * @example
 * ```ts
 * const world = createWorld(resolveGameConfig({ seed: 7 }), db);
 * const input = createInputSnapshot();
 * for (let i = 0; i < 60; i++) stepWorld(world, input);
 * world.players[0].state; // → 'alive' (the 40-tick fly-in is over)
 * ```
 */
export function createWorld(
  config: GameConfig,
  content: ContentDb,
  options: WorldOptions = {},
): World {
  const ship = resolvePlayerShip(content);
  const stageSpec = resolveWorldStage(config, content);
  // A class instance, not a literal: see `createStageCamera` (keeps the fields unboxed doubles).
  const camera: WorldCamera = createStageCamera();
  const players: PlayerShip[] = [];
  const intents: PlayerIntent[] = [];
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    players.push(createPlayer(slot, config.startingLives));
    intents.push(createPlayerIntent());
  }
  players[0].active = true;
  spawnPlayer(players[0], camera);

  const playerBatch = createSpriteBatch(LayerId.Player, MAX_PLAYERS);
  const terrain = stageSpec === null ? null : createStageTerrain(stageSpec, content);
  const parallax = stageSpec === null ? null : createParallaxView(stageSpec);
  const batches: SpriteBatchView[] = [];
  // Mutable until the bullet system exists (its laser view is filled in below).
  const view = {
    camera,
    parallax,
    terrain:
      stageSpec === null || terrain === null
        ? null
        : createTerrainView(terrain, stageSpec, content),
    batches,
    lasers: null as LaserView | null,
  };
  const world: WorldUnderConstruction = {
    config,
    content,
    ship,
    tick: 0,
    rng: createRngStreams(config.seed),
    events: createEventQueue(),
    players,
    intents,
    camera,
    status: 'playing',
    hitStop: 0,
    debugFlags: createDebugFlags(),
    pools: createPoolRegistry(),
    grid: createSpatialGrid(PLAYFIELD_W + 2 * GRID_MARGIN, PLAYFIELD_H + 2 * GRID_MARGIN),
    playerBatch,
    stage: null,
    terrain,
    parallax,
    // Replaced right below: the enemy and bullet systems read the World they belong to.
    enemies: null as unknown as EnemySystem,
    bullets: null as unknown as BulletSystem,
    weapons: null as unknown as WeaponSystem,
    rank: computeRank(difficultyRankInputs(config.difficulty)),
    view,
  };
  world.bullets = createBulletSystem(world);
  world.bullets.setRank(world.rank);
  world.enemies = createEnemySystem(world, options.behaviors ?? DEFAULT_BEHAVIORS, stageSpec);
  world.weapons = createWeaponSystem(world);
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    applyLoadoutPreset(world.weapons.loadouts[slot], players[slot], config.loadout);
  }
  // Same-layer batches draw in list order: the Options below the ships.
  batches.push(
    world.enemies.groundBatch,
    world.enemies.airBatch,
    world.weapons.batch,
    world.weapons.optionBatch,
    playerBatch,
    world.bullets.batch,
  );
  view.lasers = world.bullets.laserView;
  if (stageSpec !== null) {
    world.stage = createStageRunner(stageSpec, createWorldStageHooks(world), camera);
    if (stageSpec.music.stageId >= 0) {
      world.events.push(SimEventKind.Music, stageSpec.music.stageId, 0, 0, 0);
    }
  }
  syncWorldView(world);
  return world;
}

/**
 * The World's side of the stage runner: timeline events it acts on now, and checkpoint clears.
 *
 * @param world - The world being built.
 * @returns The hooks.
 */
function createWorldStageHooks(world: WorldUnderConstruction): StageHooks {
  return {
    /**
     * `music` → a `SimEventKind.Music` presentation event, `end` → status `stageClear`; the
     * other types wait for their systems. Never allocates (the event queue stores numbers).
     *
     * @param code - The event's code.
     * @param event - The event (content data).
     */
    event(code, event, index) {
      if (code === StageEventCode.Spawn || code === StageEventCode.Formation) {
        world.enemies.onStageEvent(index);
      } else if (code === StageEventCode.Music) {
        world.events.push(SimEventKind.Music, (event as StageMusicEvent).cueId, 0, 0, 0);
      } else if (code === StageEventCode.End) {
        world.status = 'stageClear';
      }
      // warning / boss → bosses (M1-13).
    },
    /** A checkpoint restart: empties every registered pool, the enemy and weapon systems. */
    clear() {
      world.pools.clearAll();
      world.enemies.clear();
      world.weapons.clear();
    },
  };
}

/**
 * Advances the world by exactly one tick: runs {@link WORLD_PHASES} in order (skipping phases
 * 2–8 while hit-stop is active), then increments {@link World.tick}. Never allocates.
 *
 * @param world - The world.
 * @param input - This tick's input (read-only; typically `platform.input.poll()`).
 *
 * @example
 * ```ts
 * const input = platform.input.poll();
 * stepWorld(world, input);
 * renderer.render(frame); // frame.world === world.view
 * ```
 */
export function stepWorld(world: World, input: Readonly<InputSnapshot>): void {
  const frozen = world.hitStop > 0;
  for (let i = 0; i < WORLD_PHASES.length; i++) {
    const entry = WORLD_PHASES[i];
    if (frozen && !entry.runsDuringHitStop) continue;
    entry.run(world, input);
  }
  world.tick++;
}

/**
 * Refreshes the mirror batches of {@link World.view} (the enemies, the player shots and Options,
 * the player ships) and scrolls the parallax bands with the camera. Runs at the end of every tick (phase 9)
 * and once at creation. Never allocates.
 *
 * @remarks
 * A ship is drawn when its slot is active, it is not `dying` / `dead` and its spec has a sprite;
 * during invulnerability it blinks (`SpriteFlag.Hidden` every other 4 ticks).
 *
 * @param world - The world.
 */
export function syncWorldView(world: World): void {
  const parallax = world.parallax;
  if (parallax !== null) updateParallaxView(parallax, world.camera.x, world.camera.y);
  world.enemies.sync();
  world.weapons.sync();
  const batch = world.playerBatch;
  batch.count = 0;
  const spec = world.ship;
  if (spec.spriteId < 0) return;
  const players = world.players;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.active || p.state === 'dying' || p.state === 'dead') continue;
    const flags = p.invulnTicks > 0 && (p.invulnTicks & 4) !== 0 ? SpriteFlag.Hidden : 0;
    pushSprite(batch, p.x, p.y, spec.spriteId, playerBankFrame(p.bank, spec.bankFrames), flags);
  }
}
