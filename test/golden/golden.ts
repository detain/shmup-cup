/**
 * Golden replays (plan M1-19, shmup_feat.md §24): runs of the shipped zone A recorded from the
 * 4-way playtest bot (`test/playtest/four-way-bot.ts`) as `core/replay` replays — the input of
 * every tick plus a state hash every 600 ticks and after the last tick — and committed as
 * `test/golden/<name>.replay.json` with the run's expected outcome. `golden.test.ts` (part of
 * `pnpm test`) plays every file back into a fresh session and requires every hash and the outcome
 * to match: any change to what the simulation does fails it. When a change is intended,
 * `pnpm golden:update` re-records the files from the bot (re-bless — say why in the commit
 * message).
 *
 * The scenarios cover the whole stage with god mode (the boss killed, `stageClear`), the stage at
 * Arcade difficulty without god mode (the 4-way bot survives it), a careless weaving pilot that
 * dies until the game is over (the Classic penalty, respawns, `gameOver`) and the stage skip to
 * HALCYON BULWARK with the full loadout under the Arcade penalty; four more boss runs fly the meter
 * arsenal of M2-03 (full Type B, Type C and Type D loadouts, and a Weapon Edit with LIFE OPTION on
 * `!`) — together every Types B–D weapon; four more fly the Option types and `?` shields of M2-04
 * (Rotate Options with the Rotate Shield, Formation with Reduce, Snake with the front Shield, the
 * trail with the Free Shield) — together every Option type and every meter shield; three more fly
 * the Direct-mode MANTA of M2-05 (the whole stage collecting its planned colour items — a family
 * switch and the Arm included —, HALCYON BULWARK fully powered: level-8 discs and sub discs, the
 * Hyper Arm — and the careless weaving pilot under the Arcade penalty: Direct-mode deaths, the
 * checkpoint restarts, `gameOver`).
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  Action,
  BossState,
  commitPlayerInput,
  createHeadlessPlatform,
  createPlayback,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  decodeReplay,
  encodeReplay,
  resolveGameConfig,
  type DesyncReport,
  type Game,
  type GameConfig,
  type Replay,
  type ReplayJson,
  type WorldStatus,
} from '@shmup/core';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { DEFAULT_MAX_TICKS, shippedContent, type PlaytestBot } from '../playtest/harness.js';

/** The build id golden replays are recorded with (their hashes, not a build, lock them). */
export const GOLDEN_BUILD_ID = 'golden';

/** Environment variable that turns `golden.test.ts` into the re-blessing run. */
export const GOLDEN_UPDATE_ENV = 'SHMUP_GOLDEN_UPDATE';

/** One golden replay: how it is recorded. */
export interface GoldenScenario {
  /** File name without `.replay.json` (`zone-a-…`). */
  readonly name: string;
  /** What the run covers. */
  readonly description: string;
  /** The stage played. */
  readonly stageId: string;
  /** Session options (seed, skip, loadout, penalty …) over the defaults. */
  readonly config: Partial<GameConfig>;
  /** God mode for the whole run (the replay's `assisted`). */
  readonly godMode: boolean;
  /** Who plays: the 4-way playtest bot or the careless {@link weaverBot}. */
  readonly bot: 'four-way' | 'weaver';
}

/**
 * A careless pilot for the death scenario: never dodges, weaves up and down (40 ticks each way)
 * and relies on the forced autofire — it dies until the game is over.
 *
 * @returns The bot.
 */
export function weaverBot(): PlaytestBot {
  return {
    name: 'weaver',
    decide(world) {
      return (world.tick / 40) % 2 < 1 ? Action.Up : Action.Down;
    },
  };
}

/** The committed golden replays. */
export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = Object.freeze([
  {
    name: 'zone-a-god',
    description:
      'AZURE VERGE start to stage clear with god mode: the 4-way bot shoots HALCYON BULWARK down',
    stageId: 'zone-a',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-a-arcade',
    description: 'AZURE VERGE at Arcade difficulty without god mode: the 4-way bot clears it',
    stageId: 'zone-a',
    config: { seed: 2, difficulty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-deaths',
    description:
      'a weaving pilot that never dodges, Classic penalty: deaths, respawns in place, game over',
    stageId: 'zone-a',
    config: { seed: 4 },
    godMode: false,
    bot: 'weaver',
  },
  {
    name: 'zone-a-boss',
    description: 'the stage skip to HALCYON BULWARK with the full loadout and the Arcade penalty',
    stageId: 'zone-a',
    config: { seed: 3, stageSkip: 'boss', loadout: 'full', deathPenalty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-type-b',
    description:
      'HALCYON BULWARK with a full Type B loadout (M2-03): Ripple Laser, Spread Bomb blasts, Options',
    stageId: 'zone-a',
    config: { seed: 6, stageSkip: 'boss', loadout: 'full', weaponPreset: 'type-b' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-edit',
    description:
      'HALCYON BULWARK with a Weapon Edit loadout (M2-03): Twin Laser, 2-Way Missile, LIFE OPTION on `!`',
    stageId: 'zone-a',
    config: {
      seed: 7,
      stageSkip: 'boss',
      loadout: 'full',
      weaponEdit: { missile: 'missile.twoWay', double: 'shot.free', laser: 'laser.twin' },
      megaChoice: 'lifeOption',
    },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-type-c',
    description:
      'HALCYON BULWARK with a full Type C loadout (M2-03): Cyclone Laser, 2-Way Missile, Vertical, SPEED DOWN on `!`',
    stageId: 'zone-a',
    config: {
      seed: 8,
      stageSkip: 'boss',
      loadout: 'full',
      weaponPreset: 'type-c',
      megaChoice: 'speedDown',
    },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-type-d',
    description:
      'HALCYON BULWARK with a full Type D loadout (M2-03): Twin Laser, Photon Torpedo, Free Way, FULL BARRIER on `!`',
    stageId: 'zone-a',
    config: {
      seed: 9,
      stageSkip: 'boss',
      loadout: 'full',
      weaponPreset: 'type-d',
      megaChoice: 'fullBarrier',
    },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-rotate',
    description:
      'HALCYON BULWARK with Rotate Options and the Rotate Shield (M2-04): orbiting Options, spinning pods',
    stageId: 'zone-a',
    config: {
      seed: 10,
      stageSkip: 'boss',
      loadout: 'full',
      optionChoice: 'rotate',
      shieldChoice: 'rotateShield',
    },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-reduce',
    description:
      'HALCYON BULWARK with Formation Options and Reduce (M2-04): a `>` of Options, the shrunken hurtbox',
    stageId: 'zone-a',
    config: {
      seed: 11,
      stageSkip: 'boss',
      loadout: 'full',
      optionChoice: 'formation',
      shieldChoice: 'reduce',
    },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-snake',
    description:
      'AZURE VERGE with Snake Options and the front Shield (M2-04): a pulled chain, two pods wearing apart',
    stageId: 'zone-a',
    config: {
      seed: 12,
      loadout: 'full',
      optionChoice: 'snake',
      shieldChoice: 'shield',
    },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-manta',
    description:
      'AZURE VERGE with the MANTA (M2-05): Direct-mode colour items from the carriers, the Arm, a family switch',
    stageId: 'zone-a',
    config: { seed: 14, shipId: 'manta', powerUpMode: 'direct' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-manta-boss',
    description:
      'HALCYON BULWARK with a fully powered MANTA (M2-05): level-8 discs and sub discs, the gold Hyper Arm',
    stageId: 'zone-a',
    config: {
      seed: 15,
      shipId: 'manta',
      powerUpMode: 'direct',
      stageSkip: 'boss',
      loadout: 'full',
    },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-manta-deaths',
    description:
      'a weaving MANTA that never dodges, Arcade penalty (M2-05): Direct-mode deaths, checkpoint restarts, game over',
    stageId: 'zone-a',
    config: { seed: 16, shipId: 'manta', powerUpMode: 'direct', deathPenalty: 'arcade' },
    godMode: false,
    bot: 'weaver',
  },
  {
    name: 'zone-a-free-shield',
    description:
      'AZURE VERGE at Arcade difficulty with trailing Options and the Free Shield (M2-04): a pod pair ahead',
    stageId: 'zone-a',
    config: {
      seed: 13,
      difficulty: 'arcade',
      loadout: 'full',
      shieldChoice: 'freeShield',
    },
    godMode: false,
    bot: 'four-way',
  },
]);

/** What a golden run ended with (recorded in the file, checked on playback). */
export interface GoldenOutcome {
  /** The World's status after the last tick. */
  readonly status: WorldStatus;
  /** Ticks run. */
  readonly ticks: number;
  /** Player 1's score. */
  readonly score: number;
  /** Player 1's lives left. */
  readonly lives: number;
  /** Ticks on which player 1 died. */
  readonly deathTicks: readonly number[];
  /** Whether the boss was destroyed. */
  readonly bossDefeated: boolean;
}

/** A golden file: the encoded replay plus what it is and how it must end. */
export interface GoldenFile extends ReplayJson {
  /** The scenario's description. */
  readonly description: string;
  /** The expected outcome. */
  readonly expected: GoldenOutcome;
}

/**
 * Path of a scenario's file.
 *
 * @param name - Scenario name.
 * @returns The file URL.
 */
export function goldenPath(name: string): URL {
  return new URL(`./${name}.replay.json`, import.meta.url);
}

/** Follows a session tick by tick and summarises it (the same for recording and playback). */
class OutcomeWatch {
  /** Deaths so far. */
  readonly deathTicks: number[] = [];
  /** Whether the boss reached its death sequence. */
  bossDefeated = false;
  /** Whether player 1 was alive before the tick. */
  private wasAlive = false;

  /**
   * Starts watching a session (before its first tick).
   *
   * @param game - The session.
   */
  constructor(private readonly game: Game) {}

  /** Call before each tick. */
  before(): void {
    this.wasAlive = this.game.world.players[0].state === 'alive';
  }

  /** Call after each tick. */
  after(): void {
    const world = this.game.world;
    if (this.wasAlive && world.players[0].state === 'dying') this.deathTicks.push(world.tick - 1);
    if (world.bosses.boss.state === BossState.Dying) this.bossDefeated = true;
  }

  /**
   * The outcome after the last tick.
   *
   * @returns The summary.
   */
  outcome(): GoldenOutcome {
    const world = this.game.world;
    return {
      status: world.status,
      ticks: world.tick,
      score: world.scoring.board.scores[0].score,
      lives: world.players[0].lives,
      deathTicks: this.deathTicks.slice(),
      bossDefeated: this.bossDefeated,
    };
  }
}

/**
 * Records a scenario: its bot plays the stage (until `stageClear`, `gameOver` or the playtest's
 * tick limit) through a replay recorder.
 *
 * @param scenario - The scenario.
 * @returns The replay and its outcome.
 * @throws {Error} When the shipped content has issues.
 */
export function recordGolden(scenario: GoldenScenario): { replay: Replay; outcome: GoldenOutcome } {
  const config = resolveGameConfig({ ...scenario.config, stage: scenario.stageId });
  const header = createReplayHeader(config, {
    buildId: GOLDEN_BUILD_ID,
    assisted: scenario.godMode,
  });
  const platform = createHeadlessPlatform();
  const recorder = createReplayRecorder(platform.input, header);
  const game = createReplayGame({ ...platform, input: recorder }, header, shippedContent());
  const bot = scenario.bot === 'weaver' ? weaverBot() : fourWayBot();
  const watch = new OutcomeWatch(game);
  const input = platform.snapshot.players[0];
  for (let i = 0; i < DEFAULT_MAX_TICKS; i++) {
    const world = game.world;
    commitPlayerInput(input, bot.decide(world) & 0xffff);
    watch.before();
    game.step();
    game.events.clear();
    recorder.check(world);
    watch.after();
    if (world.status === 'stageClear' || world.status === 'gameOver') break;
  }
  return { replay: recorder.finish(game.world), outcome: watch.outcome() };
}

/**
 * Plays a golden replay back into a fresh session.
 *
 * @param replay - The replay.
 * @returns The desync report and the outcome of the playback.
 */
export function playGolden(replay: Replay): { report: DesyncReport; outcome: GoldenOutcome } {
  const playback = createPlayback(replay, { buildId: GOLDEN_BUILD_ID });
  const game = createReplayGame(
    { ...createHeadlessPlatform(), input: playback },
    replay.header,
    shippedContent(),
  );
  const watch = new OutcomeWatch(game);
  while (!playback.done) {
    watch.before();
    game.step();
    game.events.clear();
    playback.check(game.world);
    watch.after();
  }
  return { report: playback.report, outcome: watch.outcome() };
}

/**
 * Reads a committed golden file.
 *
 * @param name - Scenario name.
 * @returns The file's document and its decoded replay.
 * @throws {Error} When the file is missing or not a valid replay.
 */
export function readGolden(name: string): { file: GoldenFile; replay: Replay } {
  const file = JSON.parse(readFileSync(goldenPath(name), 'utf8')) as GoldenFile;
  return { file, replay: decodeReplay(file) };
}

/**
 * The text of a scenario's golden file: the encoded replay, the description and the expected
 * outcome, as `JSON.stringify` lays it out (two-space indent, final newline).
 *
 * @param scenario - The scenario.
 * @param replay - Its recording.
 * @param outcome - The recording's outcome.
 * @returns The file's text.
 */
export function formatGolden(
  scenario: GoldenScenario,
  replay: Replay,
  outcome: GoldenOutcome,
): string {
  const file: GoldenFile = {
    ...encodeReplay(replay),
    description: scenario.description,
    expected: outcome,
  };
  return JSON.stringify(file, null, 2) + '\n';
}

/**
 * Writes a scenario's golden file (re-bless).
 *
 * @param scenario - The scenario.
 * @param replay - Its fresh recording.
 * @param outcome - The recording's outcome.
 */
export function writeGolden(
  scenario: GoldenScenario,
  replay: Replay,
  outcome: GoldenOutcome,
): void {
  writeFileSync(goldenPath(scenario.name), formatGolden(scenario, replay, outcome));
}
