/**
 * The campaign playtest harness (plan M2-10): plays the zones of a campaign run headless the way
 * the scene flow does — each zone a fresh World built by `@shmup/core` `runWorldConfig` +
 * `prepareRunWorld` from the run state, the players carried in, the zone played by a
 * {@link PlaytestBot} until its stage clear, then tallied, paid and carried out
 * (`tallyZone`, `awardZoneBonus`, `captureCarry`) — so every route of the map can be flown without
 * driving the menus.
 *
 * {@link walkCampaignRoutes} walks the route tree depth-first: each zone is played once per
 * distinct route prefix (31 zone runs for the 16 routes of the shipped diamond, zone A once), the
 * run state is copied at every fork ({@link cloneRun}).
 *
 * @module
 */
import {
  RunState,
  awardZoneBonus,
  captureCarry,
  commitPlayerInput,
  createDebugFlags,
  createInputSnapshot,
  createWorld,
  prepareRunWorld,
  resolveGameConfig,
  runWorldConfig,
  selectCampaignEnding,
  stepWorld,
  tallyZone,
  type CampaignSpec,
  type GameConfig,
  type World,
  type WorldStatus,
} from '@shmup/core';
import { DEFAULT_MAX_TICKS, shippedContent, type PlaytestBot } from './harness.js';

/** Options of a campaign run. */
export interface CampaignFlags {
  /** God mode (default `true`: the routes are about completion). */
  readonly godMode?: boolean;
  /** Session seed (default 1). */
  readonly seed?: number;
  /** Other session options. */
  readonly config?: Partial<GameConfig>;
  /** Tick limit of one zone (default {@link DEFAULT_MAX_TICKS}). */
  readonly maxTicks?: number;
}

/** What one zone of a run did. */
export interface ZoneOutcome {
  /** Campaign zone index. */
  readonly zone: number;
  /** Its stage id. */
  readonly stageId: string;
  /** The World's status when the zone stopped. */
  readonly status: WorldStatus;
  /** Ticks played. */
  readonly ticks: number;
  /** The zone tally's kill rate. */
  readonly killPercent: number;
  /** The zone tally's time bonus. */
  readonly timeBonus: number;
  /** Player 1's score after the tally. */
  readonly score: number;
  /** The World's rank stage term (`rankInputs.stage`). */
  readonly rankStage: number;
}

/** One route flown to its end. */
export interface RouteOutcome {
  /** Zone indices in order. */
  readonly route: readonly number[];
  /** Zone labels joined (`ABDFH`). */
  readonly labels: string;
  /** Every zone's outcome, in order. */
  readonly zones: readonly ZoneOutcome[];
  /** Whether every zone reached its stage clear. */
  readonly cleared: boolean;
  /** Id of the ending the run earned (`null` when it did not clear). */
  readonly ending: string | null;
  /** Player 1's final score. */
  readonly score: number;
}

/**
 * A copy of a run state (a fork in the route tree).
 *
 * @param run - The run.
 * @returns An independent copy.
 */
export function cloneRun(run: RunState): RunState {
  const copy = new RunState();
  copy.campaign = run.campaign;
  copy.zone = run.zone;
  copy.stage = run.stage;
  copy.depth = run.depth;
  copy.route.push(...run.route);
  copy.practice = run.practice;
  copy.checkpoint = run.checkpoint;
  copy.entry.copyFrom(run.entry);
  copy.carry.copyFrom(run.carry);
  copy.inBonus = run.inBonus;
  copy.bonusStage = run.bonusStage;
  copy.bonusReturnX = run.bonusReturnX;
  copy.bonusLocked = run.bonusLocked;
  copy.flags = run.flags;
  copy.deaths = run.deaths;
  copy.continues = run.continues;
  copy.continuesAtStart = run.continuesAtStart;
  copy.ending = run.ending;
  return copy;
}

/**
 * Plays the run's current zone with a bot: the World built as the scene flow builds it (the zone's
 * entry state carried in), stepped until its stage clear, game over or the tick limit; a clear is
 * tallied, paid and carried out into `run.carry`.
 *
 * @param run - The run (its current zone is played; `run.carry` receives the players on a clear).
 * @param bot - Who plays (a fresh bot per zone is best: bots may keep state).
 * @param flags - Options.
 * @returns The zone's outcome and its World.
 */
export function playRunZone(
  run: RunState,
  bot: PlaytestBot,
  flags: CampaignFlags = {},
): { outcome: ZoneOutcome; world: World } {
  const db = shippedContent();
  const base = resolveGameConfig(
    { ...flags.config, seed: flags.seed ?? 1, stage: run.stage },
    db.difficulty ?? undefined,
  );
  const debugFlags = createDebugFlags();
  debugFlags.godMode = flags.godMode ?? true;
  const world = prepareRunWorld(
    createWorld(runWorldConfig(base, run), db, { debugFlags }),
    run,
    run.entry,
  );
  const input = createInputSnapshot();
  const maxTicks = flags.maxTicks ?? DEFAULT_MAX_TICKS;
  let ticks = 0;
  while (ticks < maxTicks) {
    commitPlayerInput(input.players[0], bot.decide(world) & 0xffff);
    stepWorld(world, input);
    world.events.clear();
    ticks++;
    if (world.status === 'stageClear' || world.status === 'gameOver') break;
  }
  const result = run.result;
  if (world.status === 'stageClear') {
    tallyZone(world, result, run.inBonus);
    awardZoneBonus(world, result);
    run.noteWorldEnd(world);
    captureCarry(world, run.carry);
  }
  const campaign = run.campaign;
  return {
    outcome: {
      zone: run.zone,
      stageId: run.stage ?? '',
      status: world.status,
      ticks,
      killPercent: result.killPercent,
      timeBonus: result.timeBonus,
      score: world.scoring.board.scores[0].score,
      rankStage: campaign === null ? 1 : world.rankInputs.stage,
    },
    world,
  };
}

/**
 * Flies every route of a campaign with a bot (see the module docs): each zone once per route
 * prefix, forking the run state at every exit.
 *
 * @param campaign - The campaign.
 * @param newBot - Makes the bot of one zone.
 * @param flags - Options (god mode on by default).
 * @param start - Only the routes through these first zones after the start (default: all) — lets a
 *   test split the tree.
 * @returns One outcome per route, in the map's top-to-bottom order.
 */
export function walkCampaignRoutes(
  campaign: CampaignSpec,
  newBot: () => PlaytestBot,
  flags: CampaignFlags = {},
  start?: readonly number[],
): RouteOutcome[] {
  const out: RouteOutcome[] = [];
  const zones: ZoneOutcome[] = [];
  const walk = (run: RunState): void => {
    const { outcome } = playRunZone(run, newBot(), flags);
    zones.push(outcome);
    const cleared = outcome.status === 'stageClear';
    const exits = campaign.zones[run.zone].exits;
    if (!cleared || exits.length === 0) {
      const ending =
        cleared && campaign.zones[run.zone].final
          ? selectCampaignEnding(campaign, run.zone, run.endingFlags)
          : null;
      out.push({
        route: run.route.slice(),
        labels: run.route.map((z) => campaign.zones[z].label).join(''),
        zones: zones.slice(),
        cleared,
        ending: ending === null ? null : ending.id,
        score: outcome.score,
      });
    } else {
      for (const exit of exits) {
        if (run.depth === 0 && start !== undefined && !start.includes(exit)) continue;
        const next = cloneRun(run);
        next.advance(exit);
        walk(next);
      }
    }
    zones.pop();
  };
  const run = new RunState();
  run.begin(campaign, null);
  walk(run);
  return out;
}
