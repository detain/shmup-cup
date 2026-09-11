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
 * start); player 2's ship exists but stays inactive until co-op (M2-06). The camera is static
 * unless something sets its scroll velocity (`camera.vx` / `camera.vy`) — the stage runner of
 * M1-07 will drive it. The view has one sprite batch so far, the players (`LayerId.Player`),
 * mirrored from the ship objects at the end of every tick.
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
 * {@link RegisteredPool}, {@link syncWorldView}, {@link GRID_MARGIN}.
 *
 * @module
 */
import { MAX_PLAYERS, type InputSnapshot } from '../input/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, type GameConfig } from '../config/index.js';
import { createSpatialGrid, type SpatialGrid } from '../collision/index.js';
import type { ContentDb, PlayerShipSpec } from '../data/index.js';
import { createDebugFlags, type DebugFlags } from '../debug/index.js';
import { createEventQueue, type EventQueue } from '../events/index.js';
import { defineModule } from '../module-info.js';
import {
  createPlayer,
  createPlayerIntent,
  playerBankFrame,
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
  /** Horizontal scroll velocity in px/tick (0 = static; the stage runner sets it from M1-07). */
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
 * Phase 3: moves the camera by its scroll velocity (static until the stage runner of M1-07
 * sets it) and records the step players ride along with next tick.
 *
 * @param world - The world.
 */
const stageSystem: WorldSystem = (world) => {
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
};

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
 * Creates a gameplay session: RNG streams from `config.seed`, the ship from `content`, player 1
 * starting its fly-in at the left edge of a static camera, player 2 inactive.
 *
 * @param config - The resolved session config (`resolveGameConfig`).
 * @param content - Validated content (`loadContent(...).db`; `EMPTY_CONTENT_DB` gives the
 *   built-in default ship, which is not drawn).
 * @returns The world at tick 0, view already filled (the first frame shows the ship).
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
  const camera: WorldCamera = { x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0 };
  const players: PlayerShip[] = [];
  const intents: PlayerIntent[] = [];
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    players.push(createPlayer(slot, config.startingLives));
    intents.push(createPlayerIntent());
  }
  players[0].active = true;
  spawnPlayer(players[0], camera);

  const playerBatch = createSpriteBatch(LayerId.Player, MAX_PLAYERS);
  const view: WorldView = { camera, parallax: null, terrain: null, batches: [playerBatch] };
  const world: World = {
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
    view,
  };
  syncWorldView(world);
  return world;
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
 * Refreshes the object-based mirror batches of {@link World.view} (today: the player ships).
 * Runs at the end of every tick (phase 9) and once at creation. Never allocates.
 *
 * @remarks
 * A ship is drawn when its slot is active, it is not `dying` / `dead` and its spec has a sprite;
 * during invulnerability it blinks (`SpriteFlag.Hidden` every other 4 ticks).
 *
 * @param world - The world.
 */
export function syncWorldView(world: World): void {
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
