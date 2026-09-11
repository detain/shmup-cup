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
 * Later steps fill the slots (M1-07 stage, M1-08 scripts/movement, M1-09 … M1-12 collision and
 * damage); the order never changes. While {@link World.hitStop} is non-zero at the start of a
 * tick, phases 2–8 are skipped but the tick counter and phase 9 (which counts the hit-stop down)
 * still run, so hit-stop is deterministic and replays stay in sync.
 *
 * **State built in M1-06.** Player 1's KESTREL (spec from `content/player/`, fly-in at session
 * start); player 2's ship exists but stays inactive until co-op (M2-06). The view has one sprite
 * batch so far, the players (`LayerId.Player`), mirrored from the ship objects at the end of
 * every tick.
 *
 * **The stage (M1-07).** With `config.stage` set, the World runs that stage: its
 * {@link World.stage | runner} drives the camera in phase 3 (keys, ramps, pans, locks) and fires
 * the timeline through the World's stage hooks — `music` events become `SimEventKind.Music`
 * presentation events (the stage theme is queued at creation), `end` sets the status to
 * `stageClear`, a checkpoint restart clears every pool; `spawn` / `formation` wait for the
 * enemies of M1-08 and `warning` / `boss` for M1-13. Phase 6 tests each alive ship's terrain box
 * against the stage's {@link World.terrain | collision map} and reports contact through
 * `playerHit` (recorded only until the death sequence of M1-12). The view carries the stage's
 * parallax bands (scrolled in phase 9) and terrain. Without a stage (`stage: null`) the camera
 * is static unless something sets its scroll velocity (`camera.vx` / `camera.vy`) — free flight.
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
 * **Public API.** {@link createWorld}, {@link stepWorld}, {@link World}, {@link WorldCamera},
 * {@link WorldStatus}, {@link WORLD_STATUSES}, {@link WorldPhase}, {@link WORLD_PHASE_NAMES},
 * {@link WORLD_PHASES}, {@link WorldPhaseEntry}, {@link WorldSystem}, {@link PoolRegistry},
 * {@link RegisteredPool}, {@link syncWorldView}, {@link GRID_MARGIN}, {@link resolveWorldStage}.
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
import type { ContentDb, PlayerShipSpec, StageMusicEvent, StageSpec } from '../data/index.js';
import { createDebugFlags, type DebugFlags } from '../debug/index.js';
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
  type WorldView,
} from '../presentation/index.js';
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
  /** What the renderer draws: live references, refreshed at the end of every tick. */
  readonly view: WorldView;
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
 * Phase 2: moves the ships.
 *
 * @param world - The world.
 */
const playersSystem: WorldSystem = (world) => {
  const players = world.players;
  for (let i = 0; i < players.length; i++) {
    updatePlayer(players[i], world.ship, world.intents[i], world.camera);
  }
};

/**
 * Phase 3: the stage runner moves the camera and fires the due timeline events; without a stage
 * the camera moves by its scroll velocity (`vx` / `vy`, static by default). Either way `dx` /
 * `dy` record the step players ride along with next tick.
 *
 * @param world - The world.
 */
const stageSystem: WorldSystem = (world) => {
  const stage = world.stage;
  if (stage !== null) {
    stage.tick();
    return;
  }
  const camera = world.camera;
  camera.dx = camera.vx;
  camera.dy = camera.vy;
  camera.x += camera.dx;
  camera.y += camera.dy;
};

/**
 * Phase 4: enemy / boss scripts (M1-08). Empty slot.
 *
 * @param _world - The world.
 */
const scriptsSystem: WorldSystem = (_world) => {
  // Filled by M1-08 (behaviour coroutines) and M1-09 (patterns).
};

/**
 * Phase 5: movers, bullets, shots, items, lasers (M1-08 … M1-11). Empty slot.
 *
 * @param _world - The world.
 */
const movementSystem: WorldSystem = (_world) => {
  // Filled by M1-08 onwards.
};

/**
 * Phase 6: rebuilds the broad-phase grid around the camera view; the overlap tests of M1-08 …
 * M1-11 insert their boxes and query it here.
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
  grid.begin(Math.floor(camera.x) - GRID_MARGIN, Math.floor(camera.y) - GRID_MARGIN);
  grid.build();
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
 * Phase 7: hits, deaths, drops, score, respawn (M1-10 … M1-12). Empty slot.
 *
 * @param _world - The world.
 */
const damageSystem: WorldSystem = (_world) => {
  // Filled by M1-10 onwards.
};

/**
 * Phase 8: applies every pool's deferred frees.
 *
 * @param world - The world.
 */
const removalSystem: WorldSystem = (world) => {
  world.pools.flushAll();
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
type WorldUnderConstruction = Omit<World, 'stage'> & {
  /** See {@link World.stage}. */
  stage: StageRunner | null;
};

/**
 * Creates a gameplay session: RNG streams from `config.seed`, the ship from `content`, the stage
 * `config.stage` (camera at its start, stage theme queued as a music event) or a static camera,
 * player 1 starting its fly-in at the left edge of the view, player 2 inactive.
 *
 * @param config - The resolved session config (`resolveGameConfig`).
 * @param content - Validated content (`loadContent(...).db`; `EMPTY_CONTENT_DB` gives the
 *   built-in default ship, which is not drawn).
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
export function createWorld(config: GameConfig, content: ContentDb): World {
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
  const view: WorldView = {
    camera,
    parallax,
    terrain:
      stageSpec === null || terrain === null
        ? null
        : createTerrainView(terrain, stageSpec, content),
    batches: [playerBatch],
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
    view,
  };
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
    event(code, event) {
      if (code === StageEventCode.Music) {
        world.events.push(SimEventKind.Music, (event as StageMusicEvent).cueId, 0, 0, 0);
      } else if (code === StageEventCode.End) {
        world.status = 'stageClear';
      }
      // spawn / formation → the enemy spawner (M1-08); warning / boss → bosses (M1-13).
    },
    /** A checkpoint restart: empties every registered pool (enemies, bullets, items). */
    clear() {
      world.pools.clearAll();
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
 * Refreshes the object-based mirror batches of {@link World.view} (today: the player ships) and
 * scrolls the parallax bands with the camera. Runs at the end of every tick (phase 9) and once
 * at creation. Never allocates.
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
