/**
 * # scenes/run — the state of a run across zones (plan M2-10)
 *
 * **Responsibility.** What the scene flow keeps while a run goes from zone to zone
 * (shmup_feat.md §14 "branching zone map", §17 scene flow): every zone is a fresh World, so the
 * players' state is **carried** from one World to the next — scores (with the continue digit and
 * the next extend), lives, the loadout (meter weapons, Options, the Direct-mode levels and family),
 * the speed level, the meter cursor and the shield — by {@link captureCarry} at the end of a World
 * and {@link applyCarry} on the next one. The same carry moves the players into a hidden bonus
 * stage and back out of it.
 *
 * - {@link RunState}: the campaign and the current zone, the route so far, the zones cleared
 *   (the rank's stage term), practice (its checkpoint and loadout), the zone's entry state (RETRY
 *   STAGE starts the zone again from it), the bonus-stage state (inside one, the entrance's `x`
 *   to return to, the lock), the run's flags, deaths and continues — what picks the ending.
 * - {@link ZoneResult} / {@link tallyZone} / {@link awardZoneBonus}: the zone result tally — the
 *   kill rate ({@link KILL_BONUS_PER_PERCENT} points per percent) and the boss time bonus
 *   ({@link TIME_BONUS_PER_SECOND} points per second under {@link TIME_BONUS_PAR_TICKS}).
 * - {@link RunFlag}: the run flag bits (`core/data` `RUN_FLAG_NAMES` order) the ending selection
 *   (`core/data` `selectCampaignEnding`) tests.
 *
 * All of it runs on scene transitions (a zone clear, a bonus entry), never inside a tick.
 *
 * **Implements.** shmup_feat.md §14 — run state carried between the zones of the map, bonus
 * stages; §15 — the zone tally's time bonus, multiple endings by route and flags; §16 — practice
 * (start at a zone / checkpoint).
 *
 * {@link runWorldConfig} and {@link prepareRunWorld} build the World of the run's current zone (or
 * bonus stage) — the scene flow and the headless route playtests use the same two.
 *
 * **Public API.** Re-exported by `core/scenes`: {@link RunState}, {@link CarryState},
 * {@link CarriedPlayer}, {@link captureCarry}, {@link applyCarry}, {@link copyShieldState},
 * {@link worldDeaths}, {@link ZoneResult}, {@link tallyZone}, {@link awardZoneBonus},
 * {@link runWorldConfig}, {@link prepareRunWorld},
 * {@link RunFlag}, {@link KILL_BONUS_PER_PERCENT}, {@link TIME_BONUS_PAR_TICKS},
 * {@link TIME_BONUS_PER_SECOND}.
 *
 * @module
 */
import { BossRole, BossState } from '../bosses/index.js';
import { resolveGameConfig, type GameConfig, type StartingLoadout } from '../config/index.js';
import type { CampaignEndingSpec, CampaignSpec } from '../data/index.js';
import { jumpToCheckpoint } from '../debug/index.js';
import { MAX_PLAYERS } from '../input/index.js';
import {
  PLAYER_DEAD_TICKS,
  playerOut,
  respawnPlayer,
  setPlayerState,
  spawnPlayer,
} from '../player/index.js';
import { addScore } from '../scoring/index.js';
import { ShieldState, MAX_SHIELD_PODS } from '../shields/index.js';
import { MainWeapon } from '../weapons/index.js';
import { syncWorldView, updateWorldRank, type World } from '../world/index.js';

/**
 * Run flag bits — bit `i` is `core/data` `RUN_FLAG_NAMES[i]` (the conditions of the campaign's
 * endings). `BossEscaped` equals `core/bosses` `EndingFlag.BossEscaped`.
 */
export const RunFlag = {
  /** A stage boss escaped when its time ran out. */
  BossEscaped: 1,
  /** No ship was lost in the whole run. */
  NoDeath: 2,
  /** No continue was used. */
  NoContinue: 4,
  /** A hidden bonus stage was cleared. */
  Bonus: 8,
} as const;

/** Points per percent of the kill rate in the zone tally (100 % → 10,000). */
export const KILL_BONUS_PER_PERCENT = 100;

/** The boss time bonus counts the seconds a boss fight stayed under this many ticks (90 s). */
export const TIME_BONUS_PAR_TICKS = 90 * 60;

/** Points per second of the boss time bonus. */
export const TIME_BONUS_PER_SECOND = 100;

/**
 * One player's state carried from one World to the next (a class: monomorphic fields; its shield
 * is a private copy).
 */
export class CarriedPlayer {
  /** Whether the player is in the game (player 2 of a co-op game once joined). */
  active = false;
  /** Ships left including the one in play. */
  lives = 0;
  /** Out of the game: no life left (stays out — it may still continue). */
  out = false;
  /** Down when captured (dying, dead with a life left, or flying back in): respawns blinking. */
  down = false;
  /** Score (with the continue digit). */
  score = 0;
  /** Continues used (`PlayerScore.continues` — the score's last digit). */
  continues = 0;
  /** Score of the next extra life. */
  nextExtend = 0;
  /** Extra lives earned so far. */
  extendsEarned = 0;
  /** `core/weapons` `MainWeapon`. */
  main: number = MainWeapon.Basic;
  /** The Missile. */
  missile = false;
  /** Options owned. */
  options = 0;
  /** Direct mode: the main shot's level. */
  shot = 0;
  /** Direct mode: the sub-weapon's level. */
  sub = 0;
  /** Direct mode: the main-shot family. */
  family = 0;
  /** Speed level. */
  speedLevel = 0;
  /** The power meter's cursor (-1 = none). */
  cursor = -1;
  /** The shield. */
  readonly shield = new ShieldState();
}

/** Every player's carried state plus the run-level counters of the World it came from. */
export class CarryState {
  /** Whether it holds a captured state (`false`: a fresh start — the config's). */
  valid = false;
  /** One entry per player slot. */
  readonly players: readonly CarriedPlayer[];
  /** `World.continuesUsed` of the World it came from. */
  continuesUsed = 0;
  /** The session hi-score of that World's board. */
  hiScore = 0;

  /** Creates an empty state (invalid). */
  constructor() {
    const players: CarriedPlayer[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) players.push(new CarriedPlayer());
    this.players = players;
  }

  /**
   * Copies another state into this one.
   *
   * @param from - The source.
   */
  copyFrom(from: CarryState): void {
    this.valid = from.valid;
    this.continuesUsed = from.continuesUsed;
    this.hiScore = from.hiScore;
    for (let p = 0; p < this.players.length; p++) {
      const a = this.players[p];
      const b = from.players[p];
      a.active = b.active;
      a.lives = b.lives;
      a.out = b.out;
      a.down = b.down;
      a.score = b.score;
      a.continues = b.continues;
      a.nextExtend = b.nextExtend;
      a.extendsEarned = b.extendsEarned;
      a.main = b.main;
      a.missile = b.missile;
      a.options = b.options;
      a.shot = b.shot;
      a.sub = b.sub;
      a.family = b.family;
      a.speedLevel = b.speedLevel;
      a.cursor = b.cursor;
      copyShieldState(b.shield, a.shield);
    }
  }
}

/**
 * Copies a shield's lasting state (kind, hits, pods, Reduce's scale, the Arm's tier and charge);
 * the World-bound timers (i-frames, the hit and break ticks) start fresh.
 *
 * @param from - The source shield.
 * @param to - The shield to overwrite.
 */
export function copyShieldState(from: Readonly<ShieldState>, to: ShieldState): void {
  to.kind = from.kind;
  to.hits = from.hits;
  to.maxHits = from.maxHits;
  to.iFrames = 0;
  to.absorbsTerrain = from.absorbsTerrain;
  to.hitTick = -1;
  to.brokeTick = -1;
  to.absorbed = from.absorbed;
  to.hurtScale = from.hurtScale;
  to.podCount = from.podCount;
  to.podMaxHits = from.podMaxHits;
  to.podOrbit = from.podOrbit;
  to.spin = from.spin;
  for (let i = 0; i < MAX_SHIELD_PODS; i++) {
    to.podHits[i] = from.podHits[i];
    to.podAngle[i] = from.podAngle[i];
    to.podIFrames[i] = 0;
    to.podHitTick[i] = -1;
    to.podX[i] = from.podX[i];
    to.podY[i] = from.podY[i];
  }
  to.tier = from.tier;
  to.charge = from.charge;
}

/**
 * Takes the players' state out of a World (the end of a zone, a bonus entry or exit). Cold path.
 *
 * @param world - The World.
 * @param out - The state to fill (becomes valid).
 * @returns `out`.
 */
export function captureCarry(world: World, out: CarryState): CarryState {
  const board = world.scoring.board;
  const players = world.players;
  const loadouts = world.weapons.loadouts;
  const meters = world.powerups.meters;
  for (let p = 0; p < out.players.length; p++) {
    const c = out.players[p];
    const ship = players[p];
    const score = board.scores[p];
    const loadout = loadouts[p];
    const state = ship.state;
    c.active = ship.active;
    c.lives = ship.lives;
    const down = state === 'dying' || state === 'dead' || state === 'respawning';
    c.out = ship.active && (playerOut(ship) || (ship.lives <= 0 && down));
    c.down = down;
    c.score = score.score;
    c.continues = score.continues;
    c.nextExtend = score.nextExtend;
    c.extendsEarned = score.extendsEarned;
    c.main = loadout.main;
    c.missile = loadout.missile;
    c.options = loadout.options;
    c.shot = loadout.shot;
    c.sub = loadout.sub;
    c.family = loadout.family;
    c.speedLevel = ship.speedLevel;
    c.cursor = meters[p].cursor;
    copyShieldState(ship.shield, c.shield);
  }
  out.continuesUsed = world.continuesUsed;
  out.hiScore = board.hiScore;
  out.valid = true;
  return out;
}

/**
 * Puts carried players' state into a new World at tick 0 (the next zone, a bonus stage, the way
 * back): scores, lives, loadouts, speed, meter cursors, shields; every player in play flies in
 * (a player that was down respawns blinking, invulnerable), a player who was out stays out (the
 * game is over at once when nobody is left — the continue countdown follows), player 2 of a co-op
 * game stays inactive until it joined. Then the rank and the view are refreshed. Cold path.
 *
 * @param world - The new World (its stage already positioned).
 * @param carry - The carried state (an invalid one changes nothing).
 */
export function applyCarry(world: World, carry: CarryState): void {
  if (!carry.valid) return;
  const board = world.scoring.board;
  const camera = world.camera;
  const players = world.players;
  let best = carry.hiScore;
  for (let p = 0; p < players.length && p < carry.players.length; p++) {
    const c = carry.players[p];
    const ship = players[p];
    if (!c.active) {
      ship.active = false;
      continue;
    }
    ship.active = true;
    const score = board.scores[p];
    score.score = c.score;
    score.continues = c.continues;
    score.nextExtend = c.nextExtend;
    score.extendsEarned = c.extendsEarned;
    score.displayDirty = true;
    if (c.score > best) best = c.score;
    const loadout = world.weapons.loadouts[p];
    loadout.main = c.main as MainWeapon;
    loadout.missile = c.missile;
    loadout.options = c.options;
    loadout.shot = c.shot;
    loadout.sub = c.sub;
    loadout.family = c.family;
    ship.speedLevel = c.speedLevel;
    world.powerups.meters[p].cursor = c.cursor;
    copyShieldState(c.shield, ship.shield);
    if (c.out) {
      ship.lives = 0;
      setPlayerState(ship, 'dead');
      ship.stateTicks = PLAYER_DEAD_TICKS;
      continue;
    }
    ship.lives = c.lives;
    if (c.down) respawnPlayer(ship, world.ship, camera);
    else spawnPlayer(ship, camera);
    world.weapons.options[p].reset(ship, camera);
  }
  board.setHiScore(best);
  world.continuesUsed = carry.continuesUsed;
  updateWorldRank(world);
  syncWorldView(world);
}

/**
 * Ships lost in a World so far (every hit that got through to a ship started a death).
 *
 * @param world - The World.
 * @returns The deaths of its players.
 */
export function worldDeaths(world: World): number {
  let deaths = 0;
  for (const ship of world.players) deaths += ship.hits;
  return deaths;
}

/** The zone result tally (shmup_feat.md §15 "boss time bonus"; plan M2-10). */
export class ZoneResult {
  /** Regular enemies that appeared in the zone's World. */
  spawned = 0;
  /** Of those, destroyed by the players. */
  killed = 0;
  /** `killed / spawned` in whole percent (100 without enemies). */
  killPercent = 0;
  /** {@link ZoneResult.killPercent} × {@link KILL_BONUS_PER_PERCENT}. */
  killBonus = 0;
  /** Whole seconds the boss fight took (-1 = no boss was defeated: no time bonus). */
  bossSeconds = -1;
  /** Seconds under {@link TIME_BONUS_PAR_TICKS} × {@link TIME_BONUS_PER_SECOND}. */
  timeBonus = 0;
  /** Whether the World was a bonus stage (cleared — it skipped the zone's boss). */
  bonus = false;
}

/**
 * Tallies a cleared World (see {@link ZoneResult}): the kill rate of its regular enemies and the
 * time of its boss fight — the longest fight of a defeated (not escaped) stage boss, `-1` without
 * one. Cold path.
 *
 * @param world - The World (its status `stageClear`).
 * @param out - The result to fill.
 * @param bonus - Whether it was a bonus stage.
 * @returns `out`.
 */
export function tallyZone(world: World, out: ZoneResult, bonus = false): ZoneResult {
  const stats = world.enemies.stats;
  out.spawned = stats.spawned;
  out.killed = stats.killed;
  out.killPercent =
    stats.spawned > 0
      ? Math.floor((100 * Math.min(stats.killed, stats.spawned)) / stats.spawned)
      : 100;
  out.killBonus = out.killPercent * KILL_BONUS_PER_PERCENT;
  let fight = -1;
  for (const boss of world.bosses.slots) {
    if (boss.specIndex < 0 || boss.role !== BossRole.Boss || boss.escaped) continue;
    if (boss.state !== BossState.Dying && boss.state !== BossState.Dead) continue;
    if (boss.fightTicks > fight) fight = boss.fightTicks;
  }
  out.bossSeconds = fight < 0 ? -1 : Math.floor(fight / 60);
  const under = fight < 0 ? 0 : TIME_BONUS_PAR_TICKS - fight;
  out.timeBonus = under > 0 ? Math.floor(under / 60) * TIME_BONUS_PER_SECOND : 0;
  out.bonus = bonus;
  return out;
}

/**
 * Pays the zone tally: the kill bonus and the time bonus go to every player in play (active, not
 * out), then the extends are checked. Cold path.
 *
 * @param world - The World (frozen on its stage clear).
 * @param result - The tally.
 * @returns The points each player got.
 */
export function awardZoneBonus(world: World, result: ZoneResult): number {
  const points = result.killBonus + result.timeBonus;
  if (points <= 0) return 0;
  const players = world.players;
  for (let p = 0; p < players.length; p++) {
    const ship = players[p];
    if (!ship.active || playerOut(ship)) continue;
    addScore(world, p, points);
  }
  world.scoring.checkExtends();
  return points;
}

/**
 * The state of a run (see the module docs). One per scene flow; reset by every game start.
 */
export class RunState {
  /** The campaign the run follows (`null`: a single-stage run — no map, no carry). */
  campaign: CampaignSpec | null = null;
  /** The current zone (index into the campaign's zones; -1 in a single-stage run). */
  zone = -1;
  /** The stage the current zone plays (`null`: free flight). */
  stage: string | null = null;
  /** Zones cleared before the current one (the rank's stage term is `depth + 1`). */
  depth = 0;
  /** The route so far: zone indices, the current zone last. */
  readonly route: number[] = [];
  /** A practice run (plan M2-10 plumbing): one zone from a checkpoint, no hi-score. */
  practice = false;
  /** The checkpoint the current zone starts at (-1 = its start). */
  checkpoint = -1;
  /**
   * A practice run's starting loadout (M2-15 — the practice select's LOADOUT), or `null`: the
   * config's own.
   */
  loadout: StartingLoadout | null = null;
  /**
   * Set by the zone map and practice before the game scene opens: its `enter` then plays the
   * prepared zone instead of starting a new run.
   */
  pendingStart = false;
  /** The players' state when the current zone started (RETRY STAGE starts it again from it). */
  readonly entry = new CarryState();
  /** The state being carried into the next World (a bonus entry / exit, the next zone). */
  readonly carry = new CarryState();
  /** Whether the World being played is a hidden bonus stage. */
  inBonus = false;
  /** The bonus stage's id while {@link RunState.inBonus}. */
  bonusStage: string | null = null;
  /** Stage x of the entrance used (where a failed bonus stage returns; -1 = none). */
  bonusReturnX = -1;
  /** The current zone's bonus entrances are locked (a death in its bonus stage). */
  bonusLocked = false;
  /** Run flags so far ({@link RunFlag}: `BossEscaped`, `Bonus`). */
  flags = 0;
  /** Ships lost by the Worlds that ended so far (captured or left). */
  deaths = 0;
  /** Continues used by the Worlds that ended so far. */
  continues = 0;
  /** `World.continuesUsed` the current World started with (its carried count). */
  continuesAtStart = 0;
  /** The last zone's tally. */
  readonly result = new ZoneResult();
  /** The ending picked when the final zone was cleared (`null` before). */
  ending: CampaignEndingSpec | null = null;

  /**
   * The flags the ending selection tests: the accumulated ones plus `NoDeath` / `NoContinue`
   * when the run lost no ship / used no continue.
   *
   * @returns The flag mask.
   */
  get endingFlags(): number {
    let flags = this.flags;
    if (this.deaths === 0) flags |= RunFlag.NoDeath;
    if (this.continues === 0) flags |= RunFlag.NoContinue;
    return flags;
  }

  /** Whether the current zone is a final zone of the campaign. */
  get finalZone(): boolean {
    const campaign = this.campaign;
    return campaign !== null && this.zone >= 0 && campaign.zones[this.zone].final;
  }

  /**
   * Starts a run: the campaign's first zone, or a single stage.
   *
   * @param campaign - The campaign (`null`: a single-stage run of `stage`).
   * @param stage - The single stage (ignored with a campaign).
   */
  begin(campaign: CampaignSpec | null, stage: string | null): void {
    this.campaign = campaign;
    this.route.length = 0;
    if (campaign !== null) {
      this.zone = campaign.startIndex;
      this.stage = campaign.zones[this.zone].stage;
      this.route.push(this.zone);
    } else {
      this.zone = -1;
      this.stage = stage;
    }
    this.depth = 0;
    this.practice = false;
    this.checkpoint = -1;
    this.loadout = null;
    this.entry.valid = false;
    this.carry.valid = false;
    this.flags = 0;
    this.deaths = 0;
    this.continues = 0;
    this.continuesAtStart = 0;
    this.ending = null;
    this.leaveBonus(false);
  }

  /**
   * Starts a practice run at a campaign zone (and checkpoint).
   *
   * @param campaign - The campaign.
   * @param zone - Zone index.
   * @param checkpoint - Checkpoint index (-1 = the zone's start).
   * @param loadout - The starting loadout (M2-15; default `null` — the config's).
   */
  beginPractice(
    campaign: CampaignSpec,
    zone: number,
    checkpoint: number,
    loadout: StartingLoadout | null = null,
  ): void {
    this.begin(campaign, null);
    this.zone = zone;
    this.stage = campaign.zones[zone].stage;
    this.route.length = 0;
    this.route.push(zone);
    this.depth = campaign.zones[zone].depth;
    this.practice = true;
    this.checkpoint = checkpoint;
    this.loadout = loadout;
  }

  /**
   * Moves the run on to the next zone (the zone map's choice): the carried state becomes the new
   * zone's entry state.
   *
   * @param zone - The zone chosen (an exit of the current one).
   */
  advance(zone: number): void {
    const campaign = this.campaign;
    if (campaign === null) return;
    this.zone = zone;
    this.stage = campaign.zones[zone].stage;
    this.route.push(zone);
    this.depth++;
    this.checkpoint = -1;
    this.entry.copyFrom(this.carry);
    this.bonusLocked = false;
    this.leaveBonus(false);
  }

  /**
   * Leaves the bonus-stage state.
   *
   * @param lock - Lock the zone's entrances (a death in the bonus stage).
   */
  leaveBonus(lock: boolean): void {
    this.inBonus = false;
    this.bonusStage = null;
    if (!lock) {
      this.bonusReturnX = -1;
      this.bonusLocked = false;
    } else {
      this.bonusLocked = true;
    }
  }

  /**
   * A World of the run ends (cleared, left for a bonus stage, left after one, retried or
   * abandoned): its deaths, continues and ending flags count for the run.
   *
   * @param world - The World.
   */
  noteWorldEnd(world: World): void {
    this.deaths += worldDeaths(world);
    const used = world.continuesUsed - this.continuesAtStart;
    if (used > 0) this.continues += used;
    this.flags |= world.endingFlags & RunFlag.BossEscaped;
  }
}

/**
 * The config of the World a run plays now: `base` (the chosen difficulty, ship and loadout) with
 * the current zone's stage — or the bonus stage while inside one — and, in a practice run, the
 * practice select's starting loadout (M2-15). A config `base` already matches keeps the `base`
 * object (the first zone of a campaign run, every single-stage run).
 *
 * @param base - The config of the run's games (`SceneFlow.gameConfig`).
 * @param run - The run.
 * @returns The config (allocates only for another stage — a transition).
 * @throws {RangeError} Never for a valid `base` (the stage id is not checked here — `createWorld`
 *   throws for an unknown one).
 */
export function runWorldConfig(base: GameConfig, run: RunState): GameConfig {
  const stage = run.inBonus ? run.bonusStage : run.stage;
  const loadout = run.practice && run.loadout !== null ? run.loadout : base.loadout;
  return stage === base.stage && loadout === base.loadout
    ? base
    : resolveGameConfig({ ...base, stage, loadout });
}

/**
 * Prepares a new World (tick 0, built from {@link runWorldConfig}) for the run: in a campaign
 * run the rank's stage term becomes `depth + 1` (M2-01's `rankInputs.stage`); outside a bonus
 * stage the stage jumps back to the bonus entrance a failed bonus stage left from (else to a
 * practice checkpoint) and the entrances lock after such a failure; then the carried players come
 * in ({@link applyCarry} — none: the config's fresh start) and the run notes the continues the
 * World starts with. Cold path.
 *
 * @param world - The new World.
 * @param run - The run.
 * @param carry - The players to carry in (`null` or invalid: none).
 * @returns `world`.
 *
 * @example
 * ```ts
 * const world = prepareRunWorld(createWorld(runWorldConfig(config, run), db), run, run.entry);
 * ```
 */
export function prepareRunWorld(world: World, run: RunState, carry: CarryState | null): World {
  if (run.campaign !== null) {
    world.rankInputs.stage = run.depth + 1;
    updateWorldRank(world);
  }
  if (!run.inBonus) {
    if (run.bonusReturnX >= 0 && world.stage !== null) world.stage.jumpTo(run.bonusReturnX);
    else if (run.checkpoint >= 0) jumpToCheckpoint(world, run.checkpoint);
    if (run.bonusLocked) world.bonus.lock();
  }
  run.continuesAtStart = 0;
  if (carry !== null && carry.valid) {
    applyCarry(world, carry);
    run.continuesAtStart = carry.continuesUsed;
  } else {
    syncWorldView(world);
  }
  return world;
}
