/**
 * # debug — debug and dev-tool hooks
 *
 * **Responsibility.** Development hooks inside the simulation: the debug switches
 * ({@link DebugFlags} — god mode, hitbox and grid outlines, frame advance, slow motion, the
 * overlay), the controls that act on them ({@link createDebugControls}: god mode, stage skip to the
 * boss, jump to the next checkpoint, frame advance and single steps, slow motion), the counters
 * shown by the debug overlay ({@link collectDebugCounters}: pool usage, rank, RNG calls, a state
 * hash every {@link DEBUG_HASH_INTERVAL} ticks) and the deterministic state hash
 * {@link hashWorld} that golden replays and desync checks compare. The switches live on the
 * `Game` (`game.debug`) and every World of the session shares them (`world.debugFlags`). Off in
 * release builds (the hosts only create the controls in dev / test builds — `__SHMUP_DEV__`);
 * god mode is recorded in a replay header as `assisted`, the stage jumps restart the stage like a
 * checkpoint restart, and frame advance / slow motion only change how many ticks a displayed frame
 * runs — never what a tick does — so none of them desyncs a replay of the ticks that ran.
 *
 * **State hash.** {@link hashWorld} is FNV-1a (32-bit) over a fixed sequence of values: the tick,
 * both RNG states, the camera, the stage runner's state (whether there is one, then every slot of
 * its state array), the session status, hit-stop and rank, every player's fields, every
 * registered pool's live slots (fields in sorted name order, slots `0 … count-1` — the enemy
 * bullets and lasers of M1-09, the player shots of M1-10 and the point items of M2-02 among
 * them), then the bending lasers (M2-02: each slot's active flag; an active one's fields and body
 * nodes) and the pattern interpreter's runners (M2-02: the search hint and count, then every
 * runner in use), then the enemies
 * (every slot's state, and the numeric fields of each slot in use — M1-08), the formation table
 * (the fields of every active slot, and each track's recorded count), the player weapons (M1-10:
 * each player's loadout — main, missile, options — and option group — count, stolen, trail head,
 * the whole trail and the option positions — the autofire timers, and the hit-cooldown table of
 * every live piercing shot), then the power-ups (M1-11: each player's meter cursor, pending Mega
 * Crash and shield — kind, hits, max hits, i-frames, terrain flag, hit and break ticks, absorbed
 * count — and the count of enemy drops already turned into items; the items themselves are a
 * registered pool), then the effect timers and scores (M1-12: shake magnitude, ticks, duration and
 * request tick, flash ticks, kind and request tick, every player's score — with its next extend
 * threshold and continue count (M2-01) — and the counts of kills and formation bonuses already
 * credited — not the session hi-score, which a host may raise from its save —, then the continues
 * used and the rank inputs' loop, stage, power and special terms, M2-01), then the boss (M1-13:
 * its state, position, timers, phase, script wake tick, motion, destroyed-part mask, killer, blast
 * flag and every part's offset, position, hit points, destroyed / open flags and hit flash — plus
 * the WARNING's active flag and ticks; the piercing shots' boss-part cooldown tables join their
 * enemy tables above). Scripts are covered by their `wakeTick`; a coroutine's internal position
 * cannot be hashed. Numbers are hashed as their little-endian IEEE-754 double bytes, so the hash
 * is identical on every engine and platform, and two worlds that simulated the same inputs from
 * the same seed hash equal. Golden replays (M1-19) compare these hashes. The hash reads state only
 * — it never draws from an RNG — and works in module-level scratch buffers, so the only
 * allocation left is the engine boxing the returned unsigned 32-bit value (a 16-byte heap number
 * when it does not fit a small integer); call it every few ticks, not per entity.
 *
 * **Stage jumps.** {@link skipToBoss} jumps a World's stage to {@link BOSS_SKIP_LEAD} px before its
 * first `warning` / `boss` event and {@link jumpToCheckpoint} / {@link jumpToNextCheckpoint}
 * restart it at a checkpoint (`StageRunner.jumpTo` / `restartAt`: speed, pan and flags
 * re-derived, every pool and system cleared) and fly the ships in again at the new view.
 * `createWorld` calls `skipToBoss` when `GameConfig.stageSkip` is `'boss'` — a sim option, so a
 * replay of a skipped session skips too — which is how the e2e smoke and the playtest reach the
 * boss quickly; a replay that starts at a checkpoint (`ReplayHeader.checkpoint`) is set up with
 * `jumpToCheckpoint` before its first tick (`core/replay` `createReplayGame`).
 *
 * **Frame advance and slow motion (M1-19).** `Game.frame` reads {@link DebugFlags.frameAdvance}
 * (only the ticks queued with `Game.requestStep` run) and {@link DebugFlags.slowMo} (the frame
 * clock runs 2× / 4× slower, so a tick runs every 2nd / 4th frame at 60 Hz). Each tick still
 * polls input once and runs the whole pipeline, so the simulation stays deterministic.
 *
 * **Implements.**
 * - shmup_feat.md §24 Dev tooling & debug features (god mode, stage skip, jump to checkpoint,
 *   frame advance, slow-mo, overlay counters)
 * - shmup_feat.md §22 — determinism (state hashes compared across runs)
 *
 * **Public API.** {@link DebugFlags}, {@link SlowMo}, {@link SLOW_MO_STEPS},
 * {@link createDebugFlags}, {@link DebugCounters}, {@link createDebugCounters},
 * {@link collectDebugCounters}, {@link DEBUG_HASH_INTERVAL}, {@link DebugCommand},
 * {@link DEBUG_COMMAND_NAMES}, {@link DebugControls}, {@link createDebugControls},
 * {@link hashWorld}, {@link FNV_OFFSET_BASIS}, {@link FNV_PRIME}, {@link skipToBoss},
 * {@link BOSS_SKIP_LEAD}, {@link jumpToCheckpoint}, {@link jumpToNextCheckpoint}.
 *
 * @module
 */
import type { BendingLaserTable } from '../bullets/index.js';
import { MAX_BOSS_PARTS } from '../data/index.js';
import {
  EnemyState,
  MAX_ENEMIES,
  MAX_FORMATIONS,
  type Enemy,
  type FormationTable,
} from '../enemies/index.js';
import type { Game } from '../game/index.js';
import { defineModule } from '../module-info.js';
import { MAX_REPEAT_DEPTH, type PatternRunners } from '../patterns/index.js';
import { PLAYER_STATES, spawnPlayer } from '../player/index.js';
import { RNG_STATE_WORDS } from '../rng/index.js';
import { StageEventCode } from '../stage/index.js';
import type { World } from '../world/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'debug',
  status: 'implemented',
  specRefs: ['shmup_feat.md §24', 'shmup_feat.md §22'],
});

/** Slow-motion factors: 1 = normal speed, 2 = half speed, 4 = quarter speed. */
export type SlowMo = 1 | 2 | 4;

/** Every {@link SlowMo} factor, in the order the slow-motion command cycles through them. */
export const SLOW_MO_STEPS: readonly SlowMo[] = Object.freeze([1, 2, 4] as SlowMo[]);

/**
 * Toggleable debug switches. One object per `Game` (`game.debug`), shared by every World the
 * session creates (`world.debugFlags`), so a switch survives a new game start.
 */
export interface DebugFlags {
  /** Player hits are ignored (sim-affecting: a replay records it as `assisted`). */
  godMode: boolean;
  /** The overlay draws hurtboxes, terrain boxes, shot boxes and bullet circles. */
  showHitboxes: boolean;
  /** The overlay draws the broad-phase collision grid's cells. */
  showGrid: boolean;
  /** When `true`, ticks run only when requested (`Game.requestStep` — the step command). */
  frameAdvance: boolean;
  /** Slow motion: a tick runs every `slowMo`-th tick period (1 = normal speed). */
  slowMo: SlowMo;
  /** The debug overlay's panel (FPS, timings, pools, rank, RNG, hash) is shown. */
  overlay: boolean;
}

/**
 * Creates the default switches: everything off, normal speed.
 *
 * @returns Fresh flags.
 *
 * @example
 * ```ts
 * const flags = createDebugFlags(); // { godMode: false, …, slowMo: 1, overlay: false }
 * ```
 */
export function createDebugFlags(): DebugFlags {
  return {
    godMode: false,
    showHitboxes: false,
    showGrid: false,
    frameAdvance: false,
    slowMo: 1,
    overlay: false,
  };
}

/** Ticks between two state hashes of {@link collectDebugCounters} (the overlay's hash line). */
export const DEBUG_HASH_INTERVAL = 60;

/** Counters for the debug overlay (filled by {@link collectDebugCounters}). */
export interface DebugCounters {
  /** The World's tick. */
  tick: number;
  /** Enemy slots in use. */
  enemies: number;
  /** Enemy slots (64). */
  enemyCapacity: number;
  /** Live enemy bullets. */
  enemyBullets: number;
  /** Bullet pool size (512). */
  bulletCapacity: number;
  /** Live enemy lasers. */
  lasers: number;
  /** Laser pool size. */
  laserCapacity: number;
  /** Live player shots. */
  playerShots: number;
  /** Shot pool size (96). */
  shotCapacity: number;
  /** Live items (capsules). */
  items: number;
  /** Item pool size. */
  itemCapacity: number;
  /** The session's rank. */
  rank: number;
  /** Draws from the gameplay RNG stream since the World was created (determinism debugging). */
  rngCalls: number;
  /** The last state hash ({@link hashWorld}), computed every {@link DEBUG_HASH_INTERVAL} ticks. */
  stateHash: number;
  /** Tick the hash was computed at (-1 = none yet). */
  hashTick: number;
}

/**
 * Creates zeroed counters (no hash yet).
 *
 * @returns Fresh counters.
 */
export function createDebugCounters(): DebugCounters {
  return {
    tick: 0,
    enemies: 0,
    enemyCapacity: MAX_ENEMIES,
    enemyBullets: 0,
    bulletCapacity: 0,
    lasers: 0,
    laserCapacity: 0,
    playerShots: 0,
    shotCapacity: 0,
    items: 0,
    itemCapacity: 0,
    rank: 0,
    rngCalls: 0,
    stateHash: 0,
    hashTick: -1,
  };
}

/**
 * Fills the overlay counters from a World (read-only: nothing in the World changes). The state
 * hash is recomputed when none was taken yet, when {@link DEBUG_HASH_INTERVAL} ticks have passed
 * since the last one, or when the tick went back (a new World).
 *
 * @remarks
 * Per-frame code: writes numbers into `out` only; the hash (every 60 ticks) is the one allocation
 * left — the engine boxing {@link hashWorld}'s unsigned result when it does not fit a small
 * integer.
 *
 * @param world - The World.
 * @param out - Counters to overwrite.
 * @returns `out`.
 *
 * @example
 * ```ts
 * const counters = createDebugCounters();
 * // every frame:
 * collectDebugCounters(game.world, counters);
 * counters.enemyBullets; // → live bullets
 * ```
 */
export function collectDebugCounters(world: World, out: DebugCounters): DebugCounters {
  const tick = world.tick;
  out.tick = tick;
  const enemies = world.enemies.enemies;
  let used = 0;
  for (let i = 0; i < enemies.length; i++) if (enemies[i].state !== EnemyState.Free) used++;
  out.enemies = used;
  out.enemyCapacity = enemies.length;
  const bullets = world.bullets.pool;
  out.enemyBullets = bullets.count;
  out.bulletCapacity = bullets.capacity;
  const lasers = world.bullets.lasers;
  out.lasers = lasers.count;
  out.laserCapacity = lasers.capacity;
  const shots = world.weapons.pool;
  out.playerShots = shots.count;
  out.shotCapacity = shots.capacity;
  const items = world.powerups.pool;
  out.items = items.count;
  out.itemCapacity = items.capacity;
  out.rank = world.rank;
  out.rngCalls = world.rng.gameplay.callCount;
  if (out.hashTick < 0 || tick < out.hashTick || tick - out.hashTick >= DEBUG_HASH_INTERVAL) {
    out.stateHash = hashWorld(world);
    out.hashTick = tick;
  }
  return out;
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
 * Mixes the bending lasers (M2-02): every slot's active flag; for an active slot its fields and
 * the nodes of its body, newest first.
 *
 * @param b - The bending laser table.
 */
function mixBendingLasers(b: BendingLaserTable): void {
  for (let s = 0; s < b.capacity; s++) {
    mixWord(b.active[s]);
    if (b.active[s] === 0) continue;
    const filled = b.filled[s];
    mixNumber(filled);
    mixNumber(b.head[s]);
    mixNumber(b.length[s]);
    mixNumber(b.emit[s]);
    mixNumber(b.homing[s]);
    mixNumber(b.stride[s]);
    mixNumber(b.angle[s]);
    mixNumber(b.speed[s]);
    mixNumber(b.turnRate[s]);
    mixNumber(b.width[s]);
    mixWord(b.bits[s]);
    const base = s * b.nodes;
    let k = b.head[s];
    for (let n = 0; n < filled; n++) {
      mixNumber(b.x[base + k]);
      mixNumber(b.y[base + k]);
      k = (k - 1) & (b.nodes - 1);
    }
  }
}

/**
 * Mixes the pattern interpreter's runners (M2-02): the bullet runner search hint and count, then
 * every runner in use (its slot, entry, counter, `repeat` stack, wake age, `sequence` values,
 * heading, scale and state bits).
 *
 * @param r - The runner table.
 */
function mixPatternRunners(r: PatternRunners): void {
  mixNumber(r.meta[0]);
  mixNumber(r.meta[1]);
  const state = r.state;
  for (let i = 0; i < state.length; i++) {
    if (state[i] === 0) continue;
    mixNumber(i);
    mixWord(state[i]);
    mixNumber(r.entry[i]);
    mixNumber(r.pc[i]);
    const depth = r.depth[i];
    mixNumber(depth);
    for (let d = 0; d < depth; d++) {
      mixNumber(r.loopI[i * MAX_REPEAT_DEPTH + d]);
      mixNumber(r.loopN[i * MAX_REPEAT_DEPTH + d]);
    }
    mixNumber(r.wake[i]);
    mixNumber(r.seqDir[i]);
    mixNumber(r.seqSpeed[i]);
    mixNumber(r.heading[i]);
    mixNumber(r.scale[i]);
  }
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
  const partCooldowns = weapons.partCooldowns;
  for (let i = 0; i < n; i++) {
    const table = f.table[i];
    if (table <= 0) continue;
    const base = (table - 1) * MAX_ENEMIES;
    for (let e = base; e < base + MAX_ENEMIES; e++) mixWord(cooldowns[e]);
    const partBase = (table - 1) * MAX_BOSS_PARTS;
    for (let e = partBase; e < partBase + MAX_BOSS_PARTS; e++) mixWord(partCooldowns[e]);
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
 * Mixes the effect timers and the scores into {@link accumulator} (M1-12; fixed order). The
 * session hi-score is left out on purpose: a host may raise it from a save.
 *
 * @param world - The world.
 */
function mixFxAndScores(world: World): void {
  const fx = world.fx;
  mixNumber(fx.shakeMagnitude);
  mixNumber(fx.shakeTicks);
  mixNumber(fx.shakeDuration);
  mixNumber(fx.shakeTick);
  mixNumber(fx.flashTicks);
  mixNumber(fx.flashKind);
  mixNumber(fx.flashTick);
  const scoring = world.scoring;
  const scores = scoring.board.scores;
  for (let p = 0; p < scores.length; p++) {
    const entry = scores[p];
    mixNumber(entry.score);
    mixNumber(entry.nextExtend);
    mixNumber(entry.continues);
  }
  mixNumber(scoring.killsScored);
  mixNumber(scoring.bonusesScored);
  mixNumber(world.continuesUsed);
  const rank = world.rankInputs;
  mixNumber(rank.loop);
  mixNumber(rank.stage);
  mixNumber(rank.power);
  mixNumber(rank.special);
}

/**
 * Mixes the boss slot, its parts and the WARNING into {@link accumulator} (M1-13; fixed order).
 *
 * @param world - The world.
 */
function mixBosses(world: World): void {
  const bosses = world.bosses;
  const b = bosses.boss;
  mixWord(b.state);
  mixNumber(b.specIndex);
  mixNumber(b.x);
  mixNumber(b.y);
  mixNumber(b.screenX);
  mixNumber(b.screenY);
  mixNumber(b.stateTicks);
  mixNumber(b.phase);
  mixNumber(b.phaseTicks);
  mixWord(b.script === null ? 0 : 1);
  mixNumber(b.wakeTick);
  mixWord(b.motion);
  mixNumber(b.trackSpeed);
  mixNumber(b.trackMin);
  mixNumber(b.trackMax);
  mixNumber(b.moveFromX);
  mixNumber(b.moveFromY);
  mixNumber(b.moveToX);
  mixNumber(b.moveToY);
  mixNumber(b.moveTicks);
  mixNumber(b.moveElapsed);
  mixWord(b.destroyedMask);
  mixNumber(b.killer);
  mixWord(b.blasted ? 1 : 0);
  mixNumber(b.partCount);
  const parts = b.parts;
  for (let i = 0; i < b.partCount; i++) {
    const part = parts[i];
    mixNumber(part.localX);
    mixNumber(part.localY);
    mixNumber(part.x);
    mixNumber(part.y);
    mixNumber(part.hp);
    mixWord(part.destroyed ? 1 : 0);
    mixWord(part.open ? 1 : 0);
    mixNumber(part.flashTicks);
  }
  const warning = bosses.warning;
  mixWord(warning.active ? 1 : 0);
  mixNumber(warning.ticks);
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

  // State kept outside the registered pools (M2-02): the bending lasers' stable slots and the
  // pattern interpreter's runners in use.
  mixBendingLasers(world.bullets.bending);
  mixPatternRunners(world.patterns.runners);

  const enemies = world.enemies.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    mixWord(e.state);
    if (e.state !== EnemyState.Free) mixEnemy(e);
  }
  mixFormations(world.enemies.formations);
  mixWeapons(world.weapons);
  mixPowerUps(world);
  mixFxAndScores(world);
  mixBosses(world);
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

/** How far before its boss event {@link skipToBoss} puts the camera, in pixels. */
export const BOSS_SKIP_LEAD = 96;

/**
 * The debug stage skip: jumps the World's stage to {@link BOSS_SKIP_LEAD} px before its first
 * `warning` / `boss` event and flies every ship in play (not dying / dead) in again at the new
 * view.
 *
 * @remarks
 * Load-time / debug code (cold): `StageRunner.jumpTo` re-derives the scroll speed, pan and flags
 * the stage has there and its `clear` hook empties every pool and system (enemies, bullets, shots,
 * items, the boss and its WARNING); the events between the old and the new position never fire.
 * Loadouts, lives and scores stay. `createWorld` calls it for `GameConfig.stageSkip: 'boss'`; the
 * debug controls ({@link createDebugControls}, `DebugCommand.SkipToBoss`) call it on a running
 * World.
 *
 * Only the **first** `warning` / `boss` event counts (a stage with two bosses skips to the first);
 * the target is clamped to 0, so a WARNING closer than {@link BOSS_SKIP_LEAD} px to the start
 * restarts the stage there. The ships' `spawnPlayer` restarts their fly-in (the controls are
 * ignored for its ticks, as at a respawn); a dying or dead ship keeps its death sequence. The
 * World's tick counter, RNG streams and hashed state move on from the jump like any other
 * restart, so a replay of a skipped session reproduces it exactly.
 *
 * @throws {RangeError} Never for content that passed `loadContent` (its event x lies in
 * `[0, stage.length]`); a hand-made `StageSpec` with an event beyond its `length` makes
 * `StageRunner.jumpTo` throw.
 *
 * @param world - The world.
 * @returns `true` when it jumped; `false` in free flight or on a stage without a boss event.
 *
 * @example
 * ```ts
 * const world = createWorld(resolveGameConfig({ stage: 'zone-a' }), db);
 * skipToBoss(world); // → true: the WARNING is about two seconds away
 * ```
 */
export function skipToBoss(world: World): boolean {
  const runner = world.stage;
  if (runner === null) return false;
  const codes = runner.eventCodes;
  for (let i = 0; i < codes.length; i++) {
    if (codes[i] !== StageEventCode.Warning && codes[i] !== StageEventCode.Boss) continue;
    const x = runner.stage.events[i].x - BOSS_SKIP_LEAD;
    runner.jumpTo(x > 0 ? x : 0);
    flyShipsIn(world);
    return true;
  }
  return false;
}

/**
 * Restarts the fly-in of every ship in play (not dying / dead) at the current view — after a
 * stage jump.
 *
 * @param world - The world.
 */
function flyShipsIn(world: World): void {
  const players = world.players;
  for (let p = 0; p < players.length; p++) {
    const ship = players[p];
    if (ship.active && ship.state !== 'dying' && ship.state !== 'dead') {
      spawnPlayer(ship, world.camera);
    }
  }
}

/**
 * Restarts the World's stage at a checkpoint (`StageRunner.restartAt`: the camera at the
 * checkpoint, speed / pan / flags as the stage has them there, every pool and system cleared) and
 * flies every ship in play in again at the new view — the debug "jump to checkpoint", and how a
 * replay that starts at a checkpoint is set up (`ReplayHeader.checkpoint`, before its first tick).
 *
 * @remarks
 * Debug / load-time code (cold). Loadouts, lives and scores stay; the World's tick counter and RNG
 * streams move on, so a replay reproduces a jump made at the same tick.
 *
 * @param world - The world.
 * @param checkpoint - Index into the stage's `checkpoints`, or -1 for the stage start.
 * @returns `true` when it jumped; `false` in free flight or for an index outside
 *   `[-1, checkpoints.length)`.
 *
 * @example
 * ```ts
 * jumpToCheckpoint(world, 1); // → true: the camera is at the second checkpoint
 * ```
 */
export function jumpToCheckpoint(world: World, checkpoint: number): boolean {
  const runner = world.stage;
  if (runner === null) return false;
  if (!Number.isInteger(checkpoint) || checkpoint < -1) return false;
  if (checkpoint >= runner.stage.checkpoints.length) return false;
  runner.restartAt(checkpoint);
  flyShipsIn(world);
  return true;
}

/**
 * The debug "jump to next checkpoint": {@link jumpToCheckpoint} with the checkpoint after the last
 * one the camera passed.
 *
 * @param world - The world.
 * @returns `true` when it jumped; `false` in free flight or when the camera already passed the
 *   stage's last checkpoint.
 *
 * @example
 * ```ts
 * jumpToNextCheckpoint(world); // → true at the stage start of a stage with checkpoints
 * ```
 */
export function jumpToNextCheckpoint(world: World): boolean {
  const runner = world.stage;
  if (runner === null) return false;
  return jumpToCheckpoint(world, runner.checkpoint + 1);
}

// ------------------------------------------------------------------------------ controls

/**
 * Commands of the debug controls ({@link DebugControls.run}); the hosts bind keys to them (web dev
 * builds: F1–F8, `@shmup/shell` `debug`).
 */
export const DebugCommand = {
  /** Shows / hides the overlay panel. */
  Overlay: 1,
  /** Toggles god mode. */
  GodMode: 2,
  /** Cycles the outlines: off → hitboxes → hitboxes + grid → off. */
  Outlines: 3,
  /** Toggles the collision-grid outline alone. */
  Grid: 4,
  /** Toggles frame advance (the game freezes; steps run one tick each). */
  FrameAdvance: 5,
  /** Runs one tick under frame advance (switching frame advance on first). */
  Step: 6,
  /** Cycles slow motion 1 → 2 → 4 → 1 ({@link SLOW_MO_STEPS}). */
  SlowMo: 7,
  /** Jumps to the next checkpoint of the running stage. */
  NextCheckpoint: 8,
  /** Skips the running stage to just before its boss. */
  SkipToBoss: 9,
} as const;

/** A {@link DebugCommand} code. */
export type DebugCommand = (typeof DebugCommand)[keyof typeof DebugCommand];

/** Names of the commands by code (index 0 unused) — for key help and logs. */
export const DEBUG_COMMAND_NAMES: readonly string[] = Object.freeze([
  '',
  'overlay',
  'god mode',
  'outlines',
  'grid',
  'frame advance',
  'step',
  'slow motion',
  'next checkpoint',
  'skip to boss',
]);

/** The debug controls of one game session (see {@link createDebugControls}). */
export interface DebugControls {
  /** The session. */
  readonly game: Game;
  /** The switches the commands flip (`game.debug`). */
  readonly flags: DebugFlags;
  /**
   * Runs one command.
   *
   * @param command - The command.
   * @returns `true` when it changed something; `false` for an unknown code, and for the stage
   *   jumps when no stage is being played (free flight, the title, a finished game).
   */
  run(command: DebugCommand): boolean;
}

/**
 * Whether the session is playing a stage the debug jumps may act on: the World has a stage, is
 * still `playing` (or in its boss WARNING) and — with the scene flow — the game scene is on top.
 *
 * @param game - The session.
 * @returns `true` when a jump makes sense.
 */
function playingStage(game: Game): boolean {
  const flow = game.scenes;
  if (flow !== null) {
    const top = flow.stack.top;
    if (top === null || top.id !== 'game') return false;
  }
  const world = game.world;
  if (world.stage === null) return false;
  return world.status === 'playing' || world.status === 'bossWarning';
}

/**
 * Creates the debug controls of a session: god mode, the outlines, the overlay, frame advance and
 * single steps, slow motion, the stage skip to the boss and the jump to the next checkpoint — all
 * through {@link DebugControls.run} and the session's switches (`game.debug`).
 *
 * @remarks
 * Hosts create them only in dev / test builds and bind keys to the commands (`@shmup/shell`
 * `debug`: F1–F8 on the web, the Pause, Ch+, Ch+, Ch+ sequence first on the TV). Frame advance and
 * slow motion take effect in `Game.frame` (the step command queues one tick with
 * `Game.requestStep`); the stage jumps act on `game.world` at once ({@link skipToBoss},
 * {@link jumpToNextCheckpoint}) and only while a stage is being played. God mode is sim-affecting:
 * a replay recorded while it changes mid-run does not reproduce (record with it fixed — the
 * header's `assisted`). Cold code: commands run on key presses, not per tick.
 *
 * @param game - The session.
 * @returns The controls.
 *
 * @example
 * ```ts
 * const controls = createDebugControls(game);
 * controls.run(DebugCommand.GodMode);   // game.debug.godMode → true
 * controls.run(DebugCommand.Step);      // freezes the game, then one tick per press
 * controls.run(DebugCommand.SkipToBoss); // → true while zone A is being played
 * ```
 */
export function createDebugControls(game: Game): DebugControls {
  const flags = game.debug;
  return {
    game,
    flags,
    run(command) {
      switch (command) {
        case DebugCommand.Overlay:
          flags.overlay = !flags.overlay;
          return true;
        case DebugCommand.GodMode:
          flags.godMode = !flags.godMode;
          return true;
        case DebugCommand.Outlines:
          if (!flags.showHitboxes) {
            flags.showHitboxes = true;
            flags.showGrid = false;
          } else if (!flags.showGrid) {
            flags.showGrid = true;
          } else {
            flags.showHitboxes = false;
            flags.showGrid = false;
          }
          return true;
        case DebugCommand.Grid:
          flags.showGrid = !flags.showGrid;
          return true;
        case DebugCommand.FrameAdvance:
          flags.frameAdvance = !flags.frameAdvance;
          return true;
        case DebugCommand.Step:
          flags.frameAdvance = true;
          game.requestStep(1);
          return true;
        case DebugCommand.SlowMo: {
          const next = SLOW_MO_STEPS.indexOf(flags.slowMo) + 1;
          flags.slowMo = SLOW_MO_STEPS[next < SLOW_MO_STEPS.length ? next : 0];
          return true;
        }
        case DebugCommand.NextCheckpoint:
          return playingStage(game) && jumpToNextCheckpoint(game.world);
        case DebugCommand.SkipToBoss:
          return playingStage(game) && skipToBoss(game.world);
        default:
          return false;
      }
    },
  };
}
