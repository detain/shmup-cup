/**
 * The headless playtest harness (plan M1-18, plan §1.4 "headless playtest bot"): runs a shipped
 * stage through `@shmup/core` exactly as a host does (bare gameplay, `createGame` on the headless
 * platform, the shipped content loaded like the shell loads it) with a {@link PlaytestBot} at the
 * controls, and reports what happened — how long the stage took, whether the boss fell, every
 * death, the pickups and equips — plus the recorded input of the run, so a run can be replayed
 * tick for tick ({@link replayStage}; M1-19's golden replays are recorded from it).
 *
 * The bot only ever sees the World (read-only) and answers with the actions player 1 holds this
 * tick; the harness commits them to the input snapshot like an input adapter would, so presses
 * are edges of the held mask (hold `PowerUp` for one tick to press it once). Observers
 * ({@link PlaytestFlags.observe}) run after every tick — the 4-way design rules of
 * `rules.ts` are checked that way. A bot that declares {@link PlaytestBot.remoteStrict} also has
 * its recorded input read back against the Samsung remote's real limits (`remote-strict`, M3-02b);
 * {@link PlaytestResult.remoteViolations} must be 0.
 *
 * @module
 */
import {
  Action,
  BossRole,
  BossState,
  KNOWN_SCRIPT_IDS,
  ENGINE_SPRITES,
  PLAYER_HIT_CAUSE_NAMES,
  SFX_CUES,
  SimEventKind,
  checkEnemyBehaviors,
  checkWeaponBehaviors,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  type ContentDb,
  type Game,
  type GameConfig,
  type StageSkip,
  type World,
  type WorldStatus,
} from '@shmup/core';
import { readContentFiles } from '../../vite.shared.js';
import { createRemoteStrictCheck } from './remote-strict.js';

/** Simulation ticks per second (the fixed step). */
export const TICKS_PER_SECOND = 60;

/** Default tick limit of a run: ten minutes — twice the longest stage the plan allows. */
export const DEFAULT_MAX_TICKS = 10 * 60 * TICKS_PER_SECOND;

/** The four direction actions. */
export const DIRECTIONS = Action.Up | Action.Down | Action.Left | Action.Right;

/** A player that drives the playtest: it reads the World and holds actions. */
export interface PlaytestBot {
  /** Name shown in reports. */
  readonly name: string;
  /**
   * Whether the bot promises to stay inside the Samsung remote's limits (M3-02b —
   * `remote-strict`): the harness then reads its recorded input back through
   * {@link createRemoteStrictCheck} and reports every tick the remote could not have produced in
   * {@link PlaytestResult.remoteViolations}. Absent = not checked (the weaving and fire-button
   * pilots of the golden replays press keys no remote could send).
   */
  readonly remoteStrict?: boolean;
  /**
   * The actions player 1 holds during the coming tick (called once per tick, before it runs).
   *
   * @param world - The World about to be stepped (read-only for the bot).
   * @returns An `Action` bit mask.
   */
  decide(world: World): number;
}

/** Options of {@link runStage}. */
export interface PlaytestFlags {
  /** God mode: hits are ignored (default `false`). */
  readonly godMode?: boolean;
  /** Session seed (default 1). */
  readonly seed?: number;
  /** The debug stage skip (default `'none'`). */
  readonly stageSkip?: StageSkip;
  /** Other session options (difficulty, death penalty, loadout …). */
  readonly config?: Partial<GameConfig>;
  /** Ticks after which the run gives up (default {@link DEFAULT_MAX_TICKS}). */
  readonly maxTicks?: number;
  /**
   * Called after every tick (rule checks, statistics). It must not change the World.
   *
   * @param world - The World after the tick.
   */
  readonly observe?: (world: World) => void;
}

/** One death of player 1. */
export interface PlaytestDeath {
  /** Tick of the death. */
  readonly tick: number;
  /** Camera x at the death. */
  readonly cameraX: number;
  /** What hit the ship (`PLAYER_HIT_CAUSE_NAMES`). */
  readonly cause: string;
  /** Playfield y of the ship. */
  readonly y: number;
  /** Whether it happened during the boss fight. */
  readonly boss: boolean;
  /** Lives left afterwards. */
  readonly livesLeft: number;
}

/** What a run did. */
export interface PlaytestResult {
  /** The stage played. */
  readonly stageId: string;
  /** The bot's name. */
  readonly bot: string;
  /** Whether god mode was on. */
  readonly godMode: boolean;
  /** The session seed. */
  readonly seed: number;
  /** The World's status when the run stopped. */
  readonly status: WorldStatus;
  /** Ticks run. */
  readonly ticks: number;
  /** Tick on which the status became `stageClear` (-1 = never). */
  readonly clearTick: number;
  /** The run's length in seconds: to the stage clear, else to the stop. */
  readonly seconds: number;
  /** Whether the stage's boss was destroyed. */
  readonly bossDefeated: boolean;
  /** Ticks from the boss's first fight tick to the kill (-1 = not killed). */
  readonly bossFightTicks: number;
  /** Player 1's deaths, in order. */
  readonly deaths: readonly PlaytestDeath[];
  /** Player 1's score at the end. */
  readonly score: number;
  /** Capsules picked up. */
  readonly pickups: number;
  /** Equips per meter slot (index = `MeterSlot`). */
  readonly equips: readonly number[];
  /** Ticks on which the bot held two or more directions (a 4-way bot: always 0). */
  readonly diagonalTicks: number;
  /**
   * Ticks of the recorded input the Samsung remote could not have produced (M3-02b): 0 for a
   * {@link PlaytestBot.remoteStrict} bot, and 0 for a bot that does not claim the model (it is
   * not checked then).
   */
  readonly remoteViolations: number;
  /** The first violation and its tick, for the failure message (`''` when there was none). */
  readonly remoteViolation: string;
  /** Lowest / highest playfield x of the alive ship. */
  readonly shipX: { readonly min: number; readonly max: number };
  /** The run's input: player 1's held mask per tick (replay with {@link replayStage}). */
  readonly inputs: Uint16Array;
  /** `hashWorld` after the last tick. */
  readonly hash: number;
}

/** Shipped content, loaded once per worker like the shell loads it. */
let shippedDb: ContentDb | null = null;

/**
 * The shipped content, validated with the engine's scripts and sprites (the shell's loader).
 *
 * @returns The content DB.
 * @throws {Error} When the shipped content has issues.
 */
export function shippedContent(): ContentDb {
  if (shippedDb !== null) return shippedDb;
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  const all = [...issues, ...checkEnemyBehaviors(db), ...checkWeaponBehaviors(db)];
  if (all.length > 0) {
    throw new Error('shipped content has issues: ' + JSON.stringify(all, null, 2));
  }
  shippedDb = db;
  return db;
}

/**
 * Creates the session of a run.
 *
 * @param stageId - Stage id.
 * @param flags - Run options.
 * @returns The game (bare gameplay; god mode applied).
 */
function createRunGame(stageId: string, flags: PlaytestFlags): Game {
  const game = createGame(
    createHeadlessPlatform(),
    {
      ...flags.config,
      seed: flags.seed ?? 1,
      stage: stageId,
      stageSkip: flags.stageSkip ?? 'none',
    },
    shippedContent(),
  );
  game.world.debugFlags.godMode = flags.godMode === true;
  return game;
}

/**
 * Counts the direction bits of a mask.
 *
 * @param mask - Action mask.
 * @returns 0–4.
 */
function directionCount(mask: number): number {
  let n = 0;
  for (const bit of [Action.Up, Action.Down, Action.Left, Action.Right]) if (mask & bit) n++;
  return n;
}

/**
 * The stage's main encounter (M2-11: a zone may have a mid-boss): the first boss slot of role
 * `boss` — never a captain — that is in its fight or death sequence.
 *
 * @param world - The World.
 * @returns The boss, or `null` when no stage boss fights or dies.
 */
function stageBoss(world: World): World['bosses']['boss'] | null {
  const slots = world.bosses.slots;
  for (let i = 0; i < slots.length; i++) {
    const boss = slots[i];
    if (boss.role !== BossRole.Boss) continue;
    if (boss.state === BossState.Fight || boss.state === BossState.Dying) return boss;
  }
  return null;
}

/**
 * Plays a stage with a bot until it is cleared, the game is over or the tick limit.
 *
 * @param stageId - A shipped stage id (e.g. `zone-a`).
 * @param bot - Who plays.
 * @param flags - Run options (god mode, seed, skip, config, limit, observer).
 * @returns The report, with the recorded input.
 * @throws {Error} When the shipped content has issues ({@link shippedContent}).
 * @throws {RangeError} When `stageId` is not a shipped stage or `flags.config` is invalid
 *   (`createGame` / `resolveGameConfig`).
 *
 * @remarks
 * Bare gameplay (no scene flow): the run ends on the tick the World's status becomes
 * `stageClear` or `gameOver`, or after `maxTicks`. Each tick the bot decides first (its mask is
 * cut to 16 bits and recorded), the harness commits it to player 1's snapshot, the game steps
 * once, the tick's events are drained into the report (equips from `PowerUp` events with
 * param 0, pickups from the `MeterAdvance` sound), then `observe` runs. `seed`, `stage` and
 * `stageSkip` from the flags override the same fields of `flags.config`; god mode is set on
 * `world.debugFlags` after creation (it is not part of the config, so a replay must pass it
 * again). A death is a tick on which player 1 went from `alive` to `dying`; `boss` is true when
 * a stage boss was in its fight then. The boss statistics follow the stage's main encounter — a
 * boss of role `boss` in any slot —, never a captain (M2-11: zone B's mid-boss comes first).
 *
 * @example
 * ```ts
 * const run = runStage('zone-a', fourWayBot(), { godMode: true });
 * run.status; // → 'stageClear'
 * ```
 */
export function runStage(
  stageId: string,
  bot: PlaytestBot,
  flags: PlaytestFlags = {},
): PlaytestResult {
  const game = createRunGame(stageId, flags);
  const world = game.world;
  const platform = game.platform as ReturnType<typeof createHeadlessPlatform>;
  const input = platform.snapshot.players[0];
  const maxTicks = flags.maxTicks ?? DEFAULT_MAX_TICKS;
  const inputs = new Uint16Array(maxTicks);
  const ship = world.players[0];
  const deaths: PlaytestDeath[] = [];
  const equips = [0, 0, 0, 0, 0, 0, 0];
  let pickups = 0;
  let diagonalTicks = 0;
  // M3-02b: a bot that claims the remote model has its recorded input read back against it.
  const remote = bot.remoteStrict === true ? createRemoteStrictCheck() : null;
  let clearTick = -1;
  let fightStart = -1;
  let killTick = -1;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let ticks = 0;
  while (ticks < maxTicks) {
    const mask = bot.decide(world) & 0xffff;
    if (directionCount(mask) > 1) diagonalTicks++;
    remote?.push(mask);
    inputs[ticks] = mask;
    commitPlayerInput(input, mask);
    const wasAlive = ship.state === 'alive';
    const tick = world.tick;
    game.step();
    ticks++;
    game.events.drain((e) => {
      if (e.kind === SimEventKind.PowerUp && e.param === 0) equips[e.id]++;
      else if (e.kind === SimEventKind.Sfx && e.id === SFX_CUES.MeterAdvance) pickups++;
    });
    if (wasAlive && ship.state === 'dying') {
      deaths.push({
        tick,
        cameraX: Math.round(world.camera.x),
        cause: PLAYER_HIT_CAUSE_NAMES[ship.hitCause] ?? 'unknown',
        y: Math.round(ship.y - world.camera.y),
        boss: stageBoss(world)?.state === BossState.Fight,
        livesLeft: ship.lives,
      });
    }
    if (ship.state === 'alive') {
      const x = ship.x - world.camera.x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    const boss = stageBoss(world);
    if (fightStart < 0 && boss?.state === BossState.Fight) fightStart = tick;
    if (killTick < 0 && fightStart >= 0 && boss?.state === BossState.Dying) killTick = tick;
    flags.observe?.(world);
    if (world.status === 'stageClear' && clearTick < 0) clearTick = ticks;
    if (world.status === 'stageClear' || world.status === 'gameOver') break;
  }
  remote?.end();
  return {
    stageId,
    bot: bot.name,
    godMode: flags.godMode === true,
    seed: flags.seed ?? 1,
    status: world.status,
    ticks,
    clearTick,
    seconds: (clearTick >= 0 ? clearTick : ticks) / TICKS_PER_SECOND,
    bossDefeated: killTick >= 0,
    bossFightTicks: killTick >= 0 ? killTick - fightStart : -1,
    deaths,
    score: world.scoring.board.scores[0].score,
    pickups,
    equips,
    diagonalTicks,
    remoteViolations: remote === null ? 0 : remote.violations,
    remoteViolation:
      remote === null || remote.first === null ? '' : remote.first + '@' + String(remote.firstTick),
    shipX: { min: minX, max: maxX },
    inputs: inputs.slice(0, ticks),
    hash: hashWorld(world),
  };
}

/** What {@link replayStage} ends with. */
export interface ReplayOutcome {
  /** The World's status after the last recorded tick. */
  readonly status: WorldStatus;
  /** Ticks replayed. */
  readonly ticks: number;
  /** Ticks of player 1's deaths. */
  readonly deathTicks: readonly number[];
  /** `hashWorld` after the last tick. */
  readonly hash: number;
}

/**
 * Replays a run's recorded input into a fresh session with the same options.
 *
 * @param stageId - The stage of the run.
 * @param inputs - {@link PlaytestResult.inputs}.
 * @param flags - The run's options (god mode, seed, skip, config).
 * @returns The outcome; equal to the run's when the simulation is deterministic.
 * @throws {Error} When the shipped content has issues ({@link shippedContent}).
 * @throws {RangeError} When `stageId` or `flags.config` is invalid.
 *
 * @remarks
 * Plays every recorded tick (it does not stop at `stageClear` — the recording already stopped
 * there) and ignores `maxTicks` and `observe`. Pass the run's flags unchanged: god mode, the seed
 * and the stage skip all change the simulation.
 *
 * @example
 * ```ts
 * const run = runStage('zone-a', fourWayBot(), { seed: 3 });
 * const again = replayStage('zone-a', run.inputs, { seed: 3 });
 * again.hash === run.hash; // → true
 * ```
 */
export function replayStage(
  stageId: string,
  inputs: Uint16Array,
  flags: PlaytestFlags = {},
): ReplayOutcome {
  const game = createRunGame(stageId, flags);
  const world = game.world;
  const platform = game.platform as ReturnType<typeof createHeadlessPlatform>;
  const input = platform.snapshot.players[0];
  const ship = world.players[0];
  const deathTicks: number[] = [];
  for (let i = 0; i < inputs.length; i++) {
    commitPlayerInput(input, inputs[i]);
    const wasAlive = ship.state === 'alive';
    const tick = world.tick;
    game.step();
    game.events.clear();
    if (wasAlive && ship.state === 'dying') deathTicks.push(tick);
  }
  return { status: world.status, ticks: inputs.length, deathTicks, hash: hashWorld(world) };
}

/**
 * A one-line summary of a run (for test output).
 *
 * @param run - The report.
 * @returns E.g. `zone-a four-way (god) stageClear in 221.4 s, boss 31.2 s, 0 deaths, …`.
 */
export function describeRun(run: PlaytestResult): string {
  const deaths = run.deaths
    .map((d) => `${d.cause}@x${String(d.cameraX)}${d.boss ? ' (boss)' : ''}`)
    .join(', ');
  return (
    `${run.stageId} ${run.bot}${run.godMode ? ' (god mode)' : ''}: ${run.status} after ` +
    `${run.seconds.toFixed(1)} s, boss ${run.bossDefeated ? (run.bossFightTicks / TICKS_PER_SECOND).toFixed(1) + ' s' : 'not defeated'}, ` +
    `${String(run.deaths.length)} death(s)${deaths === '' ? '' : ' [' + deaths + ']'}, ` +
    `score ${String(run.score)}, ${String(run.pickups)} capsules, equips ${run.equips.join('/')}`
  );
}
