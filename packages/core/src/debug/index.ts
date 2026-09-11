/**
 * # debug — debug and dev-tool hooks
 *
 * **Status: partial.** The debug switches ({@link DebugFlags}, carried by every `World`) and the
 * deterministic state hash {@link hashWorld} are implemented (plan M1-06); the controls that act
 * on the switches (god mode, stage skip, frame advance, slow motion) and the overlay counters
 * arrive with the debug tools of M1-19.
 *
 * **Responsibility.** Development hooks inside the simulation: god mode, stage skip, jump to scroll X or
 * checkpoint, frame advance (pause + step one tick), slow motion, state hashing and the
 * counters shown by the debug overlay (pool usage, entity counts, RNG calls, rank). Off in
 * release builds; never affects a replay unless flagged in its header.
 *
 * **State hash.** {@link hashWorld} is FNV-1a (32-bit) over a fixed sequence of values: the tick,
 * both RNG states, the camera, the stage runner's state (whether there is one, then every slot of
 * its state array), the session status, hit-stop and rank, every player's fields, every
 * registered pool's live slots (fields in sorted name order, slots `0 … count-1` — the enemy
 * bullets and lasers of M1-09 and the player shots of M1-10 among them), then the enemies
 * (every slot's state, and the numeric fields of each slot in use — M1-08), the formation table
 * (the fields of every active slot, and each track's recorded count), the player weapons (M1-10:
 * each player's loadout — main, missile, options — and option group — count, stolen, trail head,
 * the whole trail and the option positions — the autofire timers, and the hit-cooldown table of
 * every live piercing shot), then the power-ups (M1-11: each player's meter cursor, pending Mega
 * Crash and shield — kind, hits, max hits, i-frames, terrain flag, hit and break ticks, absorbed
 * count — and the count of enemy drops already turned into items; the items themselves are a
 * registered pool). Scripts are covered by their `wakeTick`; a coroutine's internal position
 * cannot be hashed. Numbers are hashed as their little-endian IEEE-754 double bytes, so the hash
 * is identical on every engine and platform, and two worlds that simulated the same inputs from
 * the same seed hash equal. Golden replays (M1-19) compare these hashes. The hash reads state only
 * — it never draws from an RNG — and works in module-level scratch buffers, so the only
 * allocation left is the engine boxing the returned unsigned 32-bit value (a 16-byte heap number
 * when it does not fit a small integer); call it every few ticks, not per entity.
 *
 * **Implements.**
 * - shmup_feat.md §24 Dev tooling & debug features
 * - shmup_feat.md §22 — determinism (state hashes compared across runs)
 *
 * **Public API.** {@link DebugFlags}, {@link createDebugFlags}, {@link DebugCounters},
 * {@link hashWorld}, {@link FNV_OFFSET_BASIS}, {@link FNV_PRIME}.
 *
 * **Planned API.** `createDebugControls(game)` (M1-19): god mode, frame advance, slow motion,
 * stage skip / jump, overlay counters.
 *
 * @module
 */
import {
  EnemyState,
  MAX_ENEMIES,
  MAX_FORMATIONS,
  type Enemy,
  type FormationTable,
} from '../enemies/index.js';
import { defineModule } from '../module-info.js';
import { PLAYER_STATES } from '../player/index.js';
import { RNG_STATE_WORDS } from '../rng/index.js';
import type { World } from '../world/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'debug',
  status: 'partial',
  specRefs: ['shmup_feat.md §24', 'shmup_feat.md §22'],
});

/** Toggleable debug switches. */
export interface DebugFlags {
  /** Player hits are ignored. */
  godMode: boolean;
  /** Renderer draws hurtboxes, terrain boxes and bullet circles. */
  showHitboxes: boolean;
  /** When `true`, ticks run only on explicit frame-advance requests. */
  frameAdvance: boolean;
  /** 1 = normal speed, 2 = half speed, … */
  slowMo: number;
}

/**
 * Creates the default switches: everything off, normal speed.
 *
 * @returns Fresh flags.
 */
export function createDebugFlags(): DebugFlags {
  return { godMode: false, showHitboxes: false, frameAdvance: false, slowMo: 1 };
}

/** Counters for the debug overlay. */
export interface DebugCounters {
  /** Live enemy instances. */
  enemies: number;
  /** Live enemy bullets (budget ~512). */
  enemyBullets: number;
  /** Live player shots (budget 96). */
  playerShots: number;
  /** Gameplay RNG draws this tick (determinism debugging). */
  rngCalls: number;
  /** Hash of the sim state, compared against replay checkpoints. */
  stateHash: number;
}

/** FNV-1a 32-bit offset basis. */
export const FNV_OFFSET_BASIS = 0x811c9dc5;

/** FNV-1a 32-bit prime. */
export const FNV_PRIME = 0x01000193;

/** Scratch buffer for RNG states (module-level: hashing never allocates). */
const rngWords = new Uint32Array(RNG_STATE_WORDS);

/** Scratch view that turns a double into its little-endian bytes. */
const doubleBytes = new DataView(new ArrayBuffer(8));

/**
 * The running hash. Kept in a typed array (not passed around as a return value) so the
 * unsigned 32-bit intermediate values are never boxed into heap numbers.
 */
const accumulator = new Uint32Array(1);

/**
 * Mixes the four bytes of a 32-bit word (least significant first) into {@link accumulator}.
 *
 * @param word - A 32-bit value (signed or unsigned — only the low 32 bits count).
 */
function mixWord(word: number): void {
  let h = accumulator[0];
  h = Math.imul(h ^ (word & 0xff), FNV_PRIME);
  h = Math.imul(h ^ ((word >>> 8) & 0xff), FNV_PRIME);
  h = Math.imul(h ^ ((word >>> 16) & 0xff), FNV_PRIME);
  h = Math.imul(h ^ ((word >>> 24) & 0xff), FNV_PRIME);
  accumulator[0] = h;
}

/**
 * Mixes a number as its IEEE-754 double bytes (little-endian) into {@link accumulator}.
 *
 * @param value - Any number.
 */
function mixNumber(value: number): void {
  doubleBytes.setFloat64(0, value, true);
  mixWord(doubleBytes.getInt32(0, true));
  mixWord(doubleBytes.getInt32(4, true));
}

/**
 * Mixes the numbers `[0, count)` of an array (a pool field) into {@link accumulator}.
 *
 * @param array - The field array.
 * @param count - Live slots.
 */
function mixArray(array: ArrayLike<number>, count: number): void {
  for (let slot = 0; slot < count; slot++) mixNumber(array[slot]);
}

/**
 * Mixes one player's fields into {@link accumulator}.
 *
 * @param p - The ship.
 */
function mixPlayer(p: World['players'][number]): void {
  mixWord(p.active ? 1 : 0);
  mixNumber(p.x);
  mixNumber(p.y);
  mixWord(PLAYER_STATES.indexOf(p.state));
  mixNumber(p.stateTicks);
  mixNumber(p.speedLevel);
  mixNumber(p.invulnTicks);
  mixNumber(p.bank);
  mixNumber(p.lives);
  mixWord(p.moving ? 1 : 0);
  mixWord(p.hitCause);
  mixNumber(p.hitTick);
  mixNumber(p.hits);
}

/**
 * Mixes one enemy slot's fields into {@link accumulator} (fixed order).
 *
 * @param e - The enemy (a slot in use).
 */
function mixEnemy(e: Enemy): void {
  mixNumber(e.specIndex);
  mixNumber(e.x);
  mixNumber(e.y);
  mixNumber(e.vx);
  mixNumber(e.vy);
  mixNumber(e.hp);
  mixNumber(e.flashTicks);
  mixNumber(e.age);
  mixNumber(e.spawnTick);
  mixNumber(e.formation);
  mixNumber(e.member);
  mixNumber(e.anchor);
  mixNumber(e.mover);
  mixNumber(e.m0);
  mixNumber(e.m1);
  mixNumber(e.m2);
  mixNumber(e.m3);
  mixNumber(e.m4);
  mixNumber(e.m5);
  mixNumber(e.s0);
  mixNumber(e.s1);
  mixNumber(e.s2);
  mixNumber(e.s3);
  mixNumber(e.moverTicks);
  mixWord(e.script === null ? 0 : 1);
  mixNumber(e.wakeTick);
  mixWord(e.flags);
  mixNumber(e.firstSeenTick);
  mixNumber(e.animFrame);
  mixNumber(e.pathId);
  mixNumber(e.camX);
  mixNumber(e.camY);
}

/**
 * Mixes the player weapons' own state (loadouts, option groups, timers, the cooldown tables of
 * live piercing shots) into {@link accumulator}.
 *
 * @param weapons - The World's weapon system.
 */
function mixWeapons(weapons: World['weapons']): void {
  const loadouts = weapons.loadouts;
  for (let p = 0; p < loadouts.length; p++) {
    const l = loadouts[p];
    mixNumber(l.main);
    mixWord(l.missile ? 1 : 0);
    mixNumber(l.options);
    const g = weapons.options[p];
    mixNumber(g.count);
    mixNumber(g.stolen);
    mixNumber(g.head);
    mixArray(g.trailX, g.trailX.length);
    mixArray(g.trailY, g.trailY.length);
    mixArray(g.x, g.x.length);
    mixArray(g.y, g.y.length);
  }
  mixArray(weapons.timers, weapons.timers.length);
  const f = weapons.pool.fields;
  const n = weapons.pool.count;
  const cooldowns = weapons.cooldowns;
  for (let i = 0; i < n; i++) {
    const table = f.table[i];
    if (table <= 0) continue;
    const base = (table - 1) * MAX_ENEMIES;
    for (let e = base; e < base + MAX_ENEMIES; e++) mixWord(cooldowns[e]);
  }
}

/**
 * Mixes the power-up state (meters, pending Mega Crashes, the ships' shields, taken drops) into
 * {@link accumulator}.
 *
 * @param world - The world.
 */
function mixPowerUps(world: World): void {
  const powerups = world.powerups;
  const players = world.players;
  for (let p = 0; p < powerups.meters.length; p++) {
    mixNumber(powerups.meters[p].cursor);
    mixWord(powerups.megaPending[p]);
    if (p >= players.length) continue;
    const shield = players[p].shield;
    mixWord(shield.kind);
    mixNumber(shield.hits);
    mixNumber(shield.maxHits);
    mixNumber(shield.iFrames);
    mixWord(shield.absorbsTerrain ? 1 : 0);
    mixNumber(shield.hitTick);
    mixNumber(shield.brokeTick);
    mixNumber(shield.absorbed);
  }
  mixNumber(powerups.dropsTaken);
}

/**
 * Mixes the active slots of the formation table into {@link accumulator}.
 *
 * @param f - The table.
 */
function mixFormations(f: FormationTable): void {
  for (let slot = 0; slot < MAX_FORMATIONS; slot++) {
    mixWord(f.active[slot]);
    if (f.active[slot] === 0) continue;
    mixNumber(f.enemy[slot]);
    mixNumber(f.total[slot]);
    mixNumber(f.spawned[slot]);
    mixNumber(f.killed[slot]);
    mixNumber(f.escaped[slot]);
    mixNumber(f.interval[slot]);
    mixNumber(f.nextTick[slot]);
    mixNumber(f.screenX[slot]);
    mixNumber(f.screenY[slot]);
    mixNumber(f.path[slot]);
    mixNumber(f.drop[slot]);
    mixNumber(f.bonus[slot]);
    mixNumber(f.lastX[slot]);
    mixNumber(f.lastY[slot]);
    mixNumber(f.leader[slot]);
    mixNumber(f.tracks[slot].recorded);
  }
}

/**
 * Hashes the simulation state of a world (see the module docs for what is covered and in which
 * order). Does not change the world.
 *
 * @remarks
 * Works in module-level scratch buffers (the running hash lives in a `Uint32Array`, so no
 * intermediate is boxed); the only allocation is the engine boxing the returned value when it
 * does not fit a small integer (≤ 16 bytes per call).
 *
 * @param world - The world.
 * @returns An unsigned 32-bit FNV-1a hash.
 *
 * @example
 * ```ts
 * const a = createWorld(config, db);
 * const b = createWorld(config, db);
 * for (let i = 0; i < 5000; i++) { stepWorld(a, input); stepWorld(b, input); }
 * hashWorld(a) === hashWorld(b); // → true
 * ```
 */
export function hashWorld(world: World): number {
  accumulator[0] = FNV_OFFSET_BASIS;
  mixNumber(world.tick);

  world.rng.gameplay.getStateInto(rngWords);
  for (let i = 0; i < RNG_STATE_WORDS; i++) mixWord(rngWords[i]);
  world.rng.cosmetic.getStateInto(rngWords);
  for (let i = 0; i < RNG_STATE_WORDS; i++) mixWord(rngWords[i]);

  const camera = world.camera;
  mixNumber(camera.x);
  mixNumber(camera.y);
  mixNumber(camera.dx);
  mixNumber(camera.dy);
  mixNumber(camera.vx);
  mixNumber(camera.vy);

  const stage = world.stage;
  if (stage === null) {
    mixWord(0);
  } else {
    mixWord(1);
    mixArray(stage.state, stage.state.length);
  }

  mixWord(statusCode(world));
  mixNumber(world.hitStop);
  mixNumber(world.rank);

  const players = world.players;
  for (let i = 0; i < players.length; i++) mixPlayer(players[i]);

  const pools = world.pools.entries;
  for (let i = 0; i < pools.length; i++) {
    const entry = pools[i];
    const count = entry.pool.count;
    mixWord(count);
    const arrays = entry.arrays;
    for (let f = 0; f < arrays.length; f++) mixArray(arrays[f], count);
  }

  const enemies = world.enemies.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    mixWord(e.state);
    if (e.state !== EnemyState.Free) mixEnemy(e);
  }
  mixFormations(world.enemies.formations);
  mixWeapons(world.weapons);
  mixPowerUps(world);
  return accumulator[0];
}

/**
 * Numeric code of the world status (its index in the `WORLD_STATUSES` order).
 *
 * @param world - The world.
 * @returns 0 playing, 1 bossWarning, 2 stageClear, 3 gameOver.
 */
function statusCode(world: World): number {
  switch (world.status) {
    case 'playing':
      return 0;
    case 'bossWarning':
      return 1;
    case 'stageClear':
      return 2;
    case 'gameOver':
      return 3;
  }
}
