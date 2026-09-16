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
 * checkpoint restarts, `gameOver`). Two more are co-op games of M2-06 (`coop: true`): player 2
 * drops in with START at a set tick and is flown by a second bot on player 2's input slot — the
 * whole stage with two 4-way bots (two ships sharing the capsules, the co-op drop scaling), and the
 * 4-way bot with a weaving player 2 (player 2's deaths and its continues back into the running game
 * with START while player 1 plays on, until its continues are used up). Three more play the M2-07
 * dev stage `gimmick-range` (the advanced stage systems): the 4-way bot with god mode (the high
 * branch — the region trigger left alone —, a brick shot open, both moving blocks, the suction
 * pod's pull, the tentacle's chain, the cube rush stacking a cube into the terrain), the weaving
 * pilot with god mode (it dives through the region trigger: the low branch, a dozen bricks broken)
 * and the weaving pilot without it under the Arcade penalty (deaths, the checkpoint restarts
 * rolling the terrain back, `gameOver`). One more (M2-08) flies the `raster-range` dev stage with
 * the 4-way bot and god mode: its raster effects and palette cycle never touch the simulation —
 * `golden.test.ts` also plays it back on the stage with them stripped. Four more (M2-09) fly the
 * advanced-boss dev stages with the 4-way bot and god mode: `captain-range` (four captains on the
 * scrolling camera), `raid-range` with the full loadout (IRON LEVIATHAN's camera path, its death,
 * LEVIATHAN HEART revealed and shot down) and without power-ups (the battleship outlasts the bot
 * and escapes after its time limit — the ending flag), and `twin-range` with the full loadout (the
 * twins' turns, the survivor's enrage). Three more (M2-10) fly the hidden bonus-stage dev stages
 * with the 4-way bot and god mode: `bonus-range` with the full loadout (the three ground turrets
 * shot down — the `ground` entrance opens) and without power-ups (the turrets survive, the score's
 * thousands digit opens the `digit` entrance) — the World records the entry and plays on (the scene
 * flow does the warp) —, and `bonus-vault` with the full loadout (its carriers' 1,000-point bonus
 * capsules and the 1UP collected). Three more (M2-11) fly the real zones B and C with the 4-way bot and
 * god mode — `zone-b` (BRINE NEBULA: its mid-boss and GALVANIC MAW) and `zone-c` (DUNE EXPANSE: the
 * sand worms and SANDGRAVE WIDOW) start to stage clear — and zone B's hidden bonus stage
 * `brine-grotto` with the full loadout. Two more (M2-11 tests) fly them without god mode: the
 * weaving pilot in zone B under the Arcade penalty (deaths, the checkpoint restarts, `gameOver`)
 * and the 4-way bot through the whole of zone C (its deaths and respawns in place, the boss). Two
 * more (M2-12) fly the real zones D and E with the 4-way bot and god mode, start to stage clear —
 * `zone-d` (MAGMA DEEP: the dive into the caves, the brick maze, CINDER BASTION) and `zone-e`
 * (TEMPEST RIDGE: the rear attackers, SQUALL STEED). Three more (M2-12 tests) fly them without god
 * mode: the 4-way bot through the whole of zone D (a death and a Classic respawn in place down in
 * the caves) and of zone E (the rear attackers against a ship that can die), and the stage skip
 * into zone D's caves to CINDER BASTION with the full loadout under the Arcade penalty. Three more
 * (M2-13) fly the real zones F and G with the 4-way bot and god mode, start to stage clear —
 * `zone-f` (CELL VAULT: the chasing cells, the tissue walls, the grabbing tentacles, MANTLE REGENT)
 * and `zone-g` (PRISM LABYRINTH: the crystal labyrinth, the cube rush, FACET MONARCH) — and zone
 * G's hidden bonus stage `glimmer-cache` with the full loadout. Five more (M2-13 tests) fly them
 * without god mode: the 4-way bot through the whole of zone F at Arcade difficulty (it survives
 * the rank-scaled fire) and of zone G (a death in the cube rush and a Classic respawn in place),
 * the weaving pilot in zone F on Easy under the Arcade penalty (deaths, the checkpoint restarts
 * rolling the tissue it shot open back, `gameOver`), and the stage skips to MANTLE REGENT and
 * FACET MONARCH with the full loadout under the Arcade penalty. Two more (M2-14) fly the final
 * zones H and I with the 4-way bot and god mode, start to stage clear — `zone-h` (IRON CITADEL:
 * the piston hall, the parade of earlier bosses in reduced form, IRON SOVEREIGN's four-phase
 * finale) and `zone-i` (ABYSSAL THRONE: the depth mines, the trench eels, the ABYSS ARK raid and
 * THE HOLLOW KING inside it). Five more (M2-14 tests): the stage skips into zone H's parade hangar
 * and to zone I's ARK with the full loadout under the Arcade penalty (the four echoes, IRON
 * SOVEREIGN's four phases; the raid and THE HOLLOW KING), the 4-way bot through the whole of zone
 * H at Arcade difficulty without god mode, the weaving pilot in zone H on Easy under the Arcade
 * penalty (deaths, the restarts, `gameOver`) and, with god mode and no power-ups, the weaving pilot
 * that lets the ARK escape after its time limit (the `bossEscaped` ending flag, no king). Two more
 * (M2-16 tests) fly the autofire modes of the Options screen (`remoteMode: false` — the TV forces
 * autofire always on) to HALCYON BULWARK with the full loadout and god mode: the MANTA in the
 * `'toggle'` mode, the 4-way bot tapping `Shot` every 150 ticks (its Direct-mode volleys switched
 * off and on again — the per-player switch hashed in that mode), and the KESTREL in the `'hold'`
 * mode at the fastest rate, `Shot` and `Sub` held in bursts ({@link fireButtonBot}).
 * One more (M3-02 tests) flies the whole of zone A with the MANTA and **every mechanic extra on**
 * (`slowdown`, `graze`, `deathBomb`, `blackHole`), the {@link bomberBot} throwing a black hole
 * every {@link BOMB_THROW_TICKS} ticks: the vortices' pull, the bullets they swallow and their
 * lightning, the grazes the run scores and the slowdown's load count are all in its hashes.
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  Action,
  BossState,
  commitPlayerInput,
  playerCanJoin,
  createHeadlessPlatform,
  createPlayback,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  decodeReplay,
  encodeReplay,
  resolveGameConfig,
  type ContentDb,
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
  /** File name without `.replay.json` (`<stage id>-…`: `zone-a-…`, `gimmick-range-…`). */
  readonly name: string;
  /** What the run covers. */
  readonly description: string;
  /** The stage played. */
  readonly stageId: string;
  /** Session options (seed, skip, loadout, penalty …) over the defaults. */
  readonly config: Partial<GameConfig>;
  /** God mode for the whole run (the replay's `assisted`). */
  readonly godMode: boolean;
  /**
   * Who plays: the 4-way playtest bot, the careless {@link weaverBot}, or the 4-way bot with a fire
   * button ({@link fireButtonBot}: `'toggler'` taps `Shot`, `'burster'` holds `Shot` and `Sub` in
   * bursts — M2-16's autofire modes), or the {@link bomberBot} that also throws a black hole every
   * {@link BOMB_THROW_TICKS} ticks (M3-02's extras).
   */
  readonly bot: 'four-way' | 'weaver' | 'toggler' | 'burster' | 'bomber';
  /**
   * Co-op (M2-06; with `config.coop`): player 2's pilot and the tick its controller first presses
   * START (it drops in); afterwards it presses START again every other tick while it may join —
   * a continue once it is out of lives.
   */
  readonly p2?: {
    /** Player 2's pilot. */
    readonly bot: 'four-way' | 'weaver';
    /** The tick of its first START. */
    readonly joinTick: number;
  };
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

/** Ticks between two `Shot` taps of the {@link fireButtonBot}'s `'tap'` pattern. */
export const TOGGLE_TAP_TICKS = 150;

/** Ticks of one `'burst'` cycle of the {@link fireButtonBot}: fire held for the first half. */
export const BURST_CYCLE_TICKS = 90;

/**
 * The 4-way bot with a fire button (M2-16 tests — the autofire modes): `'tap'` presses `Shot` for
 * one tick every {@link TOGGLE_TAP_TICKS} ticks (in the `'toggle'` mode firing goes off, then on
 * again); `'burst'` holds `Shot` and `Sub` for the first half of every {@link BURST_CYCLE_TICKS}
 * ticks (in the `'hold'` mode the ship fires only then).
 *
 * @param pattern - How the fire button is pressed.
 * @returns The bot.
 */
export function fireButtonBot(pattern: 'tap' | 'burst'): PlaytestBot {
  const pilot = fourWayBot();
  return {
    name: pattern === 'tap' ? 'toggler' : 'burster',
    decide(world) {
      const tick = world.tick;
      const fire =
        pattern === 'tap'
          ? tick > 0 && tick % TOGGLE_TAP_TICKS === 0
            ? Action.Shot
            : 0
          : tick % BURST_CYCLE_TICKS < BURST_CYCLE_TICKS / 2
            ? Action.Shot | Action.Sub
            : 0;
      return pilot.decide(world) | fire;
    },
  };
}

/** Ticks between two `Special` presses of the {@link bomberBot} (M3-02). */
export const BOMB_THROW_TICKS = 90;

/**
 * The 4-way bot that throws a black hole (M3-02 — the extras golden): it presses `Special` for one
 * tick every {@link BOMB_THROW_TICKS} ticks, so the Direct ship spends every bomb the stage's
 * yellow items stock and the run covers the vortex's pull, its swallowed bullets and its lightning.
 *
 * @returns The bot.
 */
export function bomberBot(): PlaytestBot {
  const pilot = fourWayBot();
  return {
    name: 'bomber',
    decide(world) {
      const tick = world.tick;
      const bomb = tick > 0 && tick % BOMB_THROW_TICKS === 0 ? Action.Special : 0;
      return pilot.decide(world) | bomb;
    },
  };
}

/**
 * The pilot of a scenario's player 1.
 *
 * @param kind - {@link GoldenScenario.bot}.
 * @returns A fresh bot.
 */
function pilotOf(kind: GoldenScenario['bot']): PlaytestBot {
  if (kind === 'weaver') return weaverBot();
  if (kind === 'toggler') return fireButtonBot('tap');
  if (kind === 'burster') return fireButtonBot('burst');
  if (kind === 'bomber') return bomberBot();
  return fourWayBot();
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
  {
    name: 'zone-a-coop',
    description:
      'AZURE VERGE in co-op (M2-06): player 2 drops in with START, two 4-way bots share the capsules',
    stageId: 'zone-a',
    config: { seed: 17, coop: true },
    godMode: false,
    bot: 'four-way',
    p2: { bot: 'four-way', joinTick: 300 },
  },
  {
    name: 'zone-a-coop-deaths',
    description:
      'co-op with a weaving player 2 (M2-06): it dies, continues with START while player 1 plays on',
    stageId: 'zone-a',
    config: { seed: 18, coop: true },
    godMode: false,
    bot: 'four-way',
    p2: { bot: 'weaver', joinTick: 120 },
  },
  {
    name: 'gimmick-range-god',
    description:
      'GIMMICK RANGE with god mode (M2-07): a brick shot open, moving blocks, suction, a tentacle, the cube rush',
    stageId: 'gimmick-range',
    config: { seed: 31 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'gimmick-range-weaver',
    description:
      'GIMMICK RANGE with a weaving pilot and god mode (M2-07): it dives through the region trigger — the low branch',
    stageId: 'gimmick-range',
    config: { seed: 35 },
    godMode: true,
    bot: 'weaver',
  },
  {
    name: 'gimmick-range-deaths',
    description:
      'GIMMICK RANGE, a weaving pilot that never dodges, Arcade penalty (M2-07): checkpoint restarts roll the terrain back',
    stageId: 'gimmick-range',
    config: { seed: 33, deathPenalty: 'arcade' },
    godMode: false,
    bot: 'weaver',
  },
  {
    name: 'raster-range-god',
    description:
      'RASTER RANGE with god mode (M2-08): the 4-way bot flies the raster-effect dev stage — its wave, floor, haze and palette cycle are presentation only',
    stageId: 'raster-range',
    config: { seed: 41 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'captain-range-god',
    description:
      'CAPTAIN RANGE with god mode (M2-09): four captains fly in on the scrolling camera, the 4-way bot fights them, the stage ends at its end',
    stageId: 'captain-range',
    config: { seed: 51 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'raid-range-god',
    description:
      'RAID RANGE with god mode and the full loadout (M2-09): IRON LEVIATHAN’s camera path, its death, LEVIATHAN HEART revealed and shot down',
    stageId: 'raid-range',
    config: { seed: 52, loadout: 'full' },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'raid-range-escape',
    description:
      'RAID RANGE with god mode and no power-ups (M2-09): IRON LEVIATHAN outlasts the bot and escapes after its time limit — the ending flag',
    stageId: 'raid-range',
    config: { seed: 52 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'twin-range-god',
    description:
      'TWIN RANGE with god mode and the full loadout (M2-09): the EMBER and FROST twins take turns, the survivor enrages, both shot down',
    stageId: 'twin-range',
    config: { seed: 53, loadout: 'full' },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'bonus-range-god',
    description:
      'BONUS RANGE with god mode and the full loadout (M2-10): the three ground turrets shot down, the ground entrance to the vault opens, the stage runs on to its boss',
    stageId: 'bonus-range',
    config: { seed: 62, loadout: 'full' },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'bonus-range-digit',
    description:
      'BONUS RANGE with god mode and no power-ups (M2-10): the turrets survive, the score shows a thousands 0 at the digit window — that entrance opens',
    stageId: 'bonus-range',
    config: { seed: 61 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'bonus-vault-god',
    description:
      'BONUS VAULT with god mode and the full loadout (M2-10): the vault carriers drop 1,000-point bonus capsules and a 1UP, the bot collects them to the end',
    stageId: 'bonus-vault',
    config: { seed: 65, loadout: 'full' },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-b-god',
    description:
      'BRINE NEBULA start to stage clear with god mode (M2-11): the 4-way bot through the bubbles, the reef tunnel, SPUME HERALD, the deep current and the riptide, then GALVANIC MAW shot down',
    stageId: 'zone-b',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-c-god',
    description:
      "DUNE EXPANSE start to stage clear with god mode (M2-11): the 4-way bot past the sand worms, the canyon's ceiling walkers, the worm field and the sandstorm run, then SANDGRAVE WIDOW shot down",
    stageId: 'zone-c',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-b-deaths',
    description:
      'BRINE NEBULA, a weaving pilot that never dodges, Arcade penalty (M2-11 tests): deaths among the bubbles, the checkpoint restarts, game over',
    stageId: 'zone-b',
    config: { seed: 72, deathPenalty: 'arcade' },
    godMode: false,
    bot: 'weaver',
  },
  {
    name: 'zone-c-bot',
    description:
      'DUNE EXPANSE without god mode (M2-11 tests): the 4-way bot from the start, Classic penalty, through the sand worms to SANDGRAVE WIDOW',
    stageId: 'zone-c',
    config: { seed: 73 },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-d-god',
    description:
      'MAGMA DEEP start to stage clear with god mode (M2-12): the 4-way bot over the erupting caldera fields, down the dive into the caves, through the brick maze and along the lava river, then CINDER BASTION shot down',
    stageId: 'zone-d',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-e-god',
    description:
      'TEMPEST RIDGE start to stage clear with god mode (M2-12): the 4-way bot through the storm front, the ridge pass, the thunderheads and the gale run, kites and jumpers coming from behind, then SQUALL STEED shot down',
    stageId: 'zone-e',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-d-bot',
    description:
      'MAGMA DEEP without god mode (M2-12 tests): the 4-way bot from the start, Classic penalty, down the dive and through the brick maze — a death and a respawn in place down in the caves — to CINDER BASTION',
    stageId: 'zone-d',
    config: { seed: 77 },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-d-boss',
    description:
      'the stage skip into the caves of MAGMA DEEP (M2-12 tests): CINDER BASTION with the full loadout under the Arcade penalty, its core shot through the turning shield arms',
    stageId: 'zone-d',
    config: { seed: 75, stageSkip: 'boss', loadout: 'full', deathPenalty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-e-bot',
    description:
      'TEMPEST RIDGE without god mode (M2-12 tests): the 4-way bot from the start, Classic penalty, the rear attackers overtaking a ship that can die — a death and a respawn in place — to SQUALL STEED',
    stageId: 'zone-e',
    config: { seed: 74 },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'brine-grotto-god',
    description:
      "PEARL GROTTO, zone B's hidden bonus stage, with god mode and the full loadout (M2-11): its carriers' bonus capsules and the 1UP collected to the end",
    stageId: 'brine-grotto',
    config: { seed: 71, loadout: 'full' },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-f-god',
    description:
      'CELL VAULT start to stage clear with god mode (M2-13): the 4-way bot through the membrane, the regenerating tissue walls, the tentacle garden and the pulse run, then MANTLE REGENT shot down',
    stageId: 'zone-f',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-g-god',
    description:
      'PRISM LABYRINTH start to stage clear with god mode (M2-13): the 4-way bot through the prism field, the gallery, the crystal labyrinth, the cube rush stacking into its pillars and the refraction run, then FACET MONARCH shot down',
    stageId: 'zone-g',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'glimmer-cache-god',
    description:
      "GLIMMER CACHE, zone G's hidden bonus stage, with god mode and the full loadout (M2-13): its carriers' bonus capsules and the 1UP collected to the end, a cube rush and its cube walls",
    stageId: 'glimmer-cache',
    config: { seed: 81, loadout: 'full' },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-h-god',
    description:
      'IRON CITADEL start to stage clear with god mode (M2-14): the 4-way bot through the outer walls, the piston hall with its moving floors and laser emitters, the parade of four earlier bosses in reduced form and the core run, then IRON SOVEREIGN shot down through its four phases',
    stageId: 'zone-h',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-i-god',
    description:
      'ABYSSAL THRONE start to stage clear with god mode (M2-14): the 4-way bot through the descent, the trench, the mine field and the undertow, then the ABYSS ARK raid and THE HOLLOW KING its final blast reveals, both shot down',
    stageId: 'zone-i',
    config: { seed: 1 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-f-arcade',
    description:
      'CELL VAULT at Arcade difficulty without god mode (M2-13 tests): the 4-way bot from the start against the rank-scaled fire — the chasing cells, the tissue walls, the grabbing tentacles — to MANTLE REGENT shot down',
    stageId: 'zone-f',
    config: { seed: 91, difficulty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-f-deaths',
    description:
      'CELL VAULT on Easy under the Arcade penalty with a weaving pilot that never dodges (M2-13 tests): deaths in the membrane and at the first tissue walls, the checkpoint restarts at 2,200 rolling the tissue it shot open back, game over',
    stageId: 'zone-f',
    config: { seed: 91, deathPenalty: 'arcade', difficulty: 'easy' },
    godMode: false,
    bot: 'weaver',
  },
  {
    name: 'zone-f-boss',
    description:
      'the stage skip to MANTLE REGENT (M2-13 tests): the full loadout under the Arcade penalty, the eye shot between the curls of its tentacles',
    stageId: 'zone-f',
    config: { seed: 95, stageSkip: 'boss', loadout: 'full', deathPenalty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-g-bot',
    description:
      'PRISM LABYRINTH without god mode (M2-13 tests): the 4-way bot from the start, Classic penalty, through the crystal labyrinth — a death in the cube rush and a respawn in place — to FACET MONARCH',
    stageId: 'zone-g',
    config: { seed: 91 },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-g-boss',
    description:
      'the stage skip to FACET MONARCH (M2-13 tests): the full loadout under the Arcade penalty, its crystals broken, then the core behind them shot down',
    stageId: 'zone-g',
    config: { seed: 95, stageSkip: 'boss', loadout: 'full', deathPenalty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-h-boss',
    description:
      'the stage skip into the parade hangar of IRON CITADEL (M2-14 tests): the full loadout under the Arcade penalty, the four echoes of earlier bosses shot down, the core run, then IRON SOVEREIGN through its four phases',
    stageId: 'zone-h',
    config: { seed: 95, stageSkip: 'boss', loadout: 'full', deathPenalty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-h-arcade',
    description:
      'IRON CITADEL at Arcade difficulty without god mode (M2-14 tests): the 4-way bot from the start against the rank-scaled fire — the piston hall, the laser emitters, the parade — to IRON SOVEREIGN shot down',
    stageId: 'zone-h',
    config: { seed: 91, difficulty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-h-deaths',
    description:
      'IRON CITADEL on Easy under the Arcade penalty with a weaving pilot that never dodges (M2-14 tests): deaths at the outer walls, every restart back at the start, game over',
    stageId: 'zone-h',
    config: { seed: 91, deathPenalty: 'arcade', difficulty: 'easy' },
    godMode: false,
    bot: 'weaver',
  },
  {
    name: 'zone-i-boss',
    description:
      'the stage skip to the ABYSS ARK (M2-14 tests): the full loadout under the Arcade penalty, the raid shot down in its two phases, then THE HOLLOW KING its final blast reveals through its three',
    stageId: 'zone-i',
    config: { seed: 95, stageSkip: 'boss', loadout: 'full', deathPenalty: 'arcade' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-i-escape',
    description:
      'the stage skip to the ABYSS ARK with a weaving pilot, god mode and no power-ups (M2-14 tests): the ARK outlasts it and sails off after its 90-s time limit — EndingFlag.BossEscaped, THE HOLLOW KING never revealed, stageClear',
    stageId: 'zone-i',
    config: { seed: 52, stageSkip: 'boss' },
    godMode: true,
    bot: 'weaver',
  },
  {
    name: 'zone-a-manta-toggle',
    description:
      'HALCYON BULWARK with a fully powered MANTA, god mode and the toggle autofire mode (M2-16 tests): the 4-way bot taps SHOT every 150 ticks — the Direct-mode volleys off, then on again',
    stageId: 'zone-a',
    config: {
      seed: 61,
      shipId: 'manta',
      powerUpMode: 'direct',
      stageSkip: 'boss',
      loadout: 'full',
      remoteMode: false,
      autofireMode: 'toggle',
    },
    godMode: true,
    bot: 'toggler',
  },
  {
    name: 'zone-a-hold',
    description:
      'HALCYON BULWARK with the full loadout, god mode and the hold autofire mode at the fastest rate (M2-16 tests): SHOT and SUB held in bursts',
    stageId: 'zone-a',
    config: {
      seed: 62,
      stageSkip: 'boss',
      loadout: 'full',
      remoteMode: false,
      autofireMode: 'hold',
      autofireInterval: 2,
    },
    godMode: true,
    bot: 'burster',
  },
  {
    name: 'zone-a-loop2-god',
    description:
      'AZURE VERGE on loop 2 with god mode (M3-01): the remixed layout, faster bullets, revenge bullets from every kill, rank from 10 — the 4-way bot clears it',
    stageId: 'zone-a',
    config: { seed: 71, loop: 2 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-a-loop2-boss',
    description:
      'HALCYON BULWARK on loop 2 without power-ups or god mode (M3-01): the loop-2 rank, bullet speed and revenge bullets against the 4-way bot',
    stageId: 'zone-a',
    config: { seed: 72, loop: 2, stageSkip: 'boss' },
    godMode: false,
    bot: 'four-way',
  },
  {
    name: 'zone-a-caravan',
    description:
      'the CARAVAN clock on AZURE VERGE (M3-01): one minute with god mode, then time up — status stageClear with the World timeUp',
    stageId: 'zone-a',
    config: { seed: 73, timeLimit: 3600 },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-a-extra',
    description:
      'HALCYON BULWARK with an Extra Edit loadout (M3-01): the Hawk Wind rising over the middle and falling below it, god mode',
    stageId: 'zone-a',
    config: {
      seed: 74,
      stageSkip: 'boss',
      loadout: 'full',
      weaponEdit: { missile: 'missile.hawkWind', double: 'shot.spreadGun', laser: 'laser.pierce' },
    },
    godMode: true,
    bot: 'four-way',
  },
  {
    name: 'zone-a-recovery',
    description:
      'a weaving pilot with the full loadout and option recovery (M3-01): each death drops the Options it loses, drifting to be caught again',
    stageId: 'zone-a',
    config: { seed: 75, stageSkip: 'boss', loadout: 'full', optionRecovery: true },
    godMode: false,
    bot: 'weaver',
  },
  {
    name: 'zone-a-invincible',
    description:
      'HALCYON BULWARK with the invincibility assist (M3-01): hits ignored like god mode, the replay header flags it in `assists` (not as god mode)',
    stageId: 'zone-a',
    config: { seed: 76, stageSkip: 'boss', loadout: 'full', invincible: true },
    godMode: false,
    bot: 'weaver',
  },
  {
    name: 'zone-a-extras',
    description:
      'the M3-02 mechanic extras all on with the MANTA over the whole of AZURE VERGE: black-hole vortices thrown and discharged, bullets grazed, the death-bomb window armed and the authentic slowdown counting the load',
    stageId: 'zone-a',
    config: {
      seed: 77,
      shipId: 'manta',
      powerUpMode: 'direct',
      loadout: 'full',
      slowdown: true,
      graze: true,
      deathBomb: 8,
      blackHole: true,
    },
    godMode: true,
    bot: 'bomber',
  },
]);

/** Player 2's side of a co-op golden run (M2-06). */
export interface GoldenPlayer2 {
  /** Player 2's score. */
  readonly score: number;
  /** Player 2's lives left. */
  readonly lives: number;
  /** Ticks on which player 2 died. */
  readonly deathTicks: readonly number[];
  /** Continues player 2 used (its score's last digit). */
  readonly continues: number;
}

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
  /** Player 2 — co-op runs only (M2-06). */
  readonly p2?: GoldenPlayer2;
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
  /** Player 2's deaths so far (co-op). */
  readonly p2DeathTicks: number[] = [];
  /** Whether the boss reached its death sequence. */
  bossDefeated = false;
  /** Whether player 1 was alive before the tick. */
  private wasAlive = false;
  /** Whether player 2 was alive before the tick. */
  private p2WasAlive = false;

  /**
   * Starts watching a session (before its first tick).
   *
   * @param game - The session.
   */
  constructor(private readonly game: Game) {}

  /** Call before each tick. */
  before(): void {
    this.wasAlive = this.game.world.players[0].state === 'alive';
    this.p2WasAlive = this.game.world.players[1].state === 'alive';
  }

  /** Call after each tick. */
  after(): void {
    const world = this.game.world;
    if (this.wasAlive && world.players[0].state === 'dying') this.deathTicks.push(world.tick - 1);
    if (this.p2WasAlive && world.players[1].state === 'dying') {
      this.p2DeathTicks.push(world.tick - 1);
    }
    if (world.bosses.boss.state === BossState.Dying) this.bossDefeated = true;
  }

  /**
   * The outcome after the last tick.
   *
   * @returns The summary.
   */
  outcome(): GoldenOutcome {
    const world = this.game.world;
    const outcome: GoldenOutcome = {
      status: world.status,
      ticks: world.tick,
      score: world.scoring.board.scores[0].score,
      lives: world.players[0].lives,
      deathTicks: this.deathTicks.slice(),
      bossDefeated: this.bossDefeated,
    };
    if (!world.config.coop) return outcome;
    const p2 = world.scoring.board.scores[1];
    return {
      ...outcome,
      p2: {
        score: p2.score,
        lives: world.players[1].lives,
        deathTicks: this.p2DeathTicks.slice(),
        continues: p2.continues,
      },
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
  const bot = pilotOf(scenario.bot);
  const p2 = scenario.p2;
  const bot2 = p2 === undefined ? null : p2.bot === 'weaver' ? weaverBot() : fourWayBot(1);
  const watch = new OutcomeWatch(game);
  const input = platform.snapshot.players[0];
  const input2 = platform.snapshot.players[1];
  for (let i = 0; i < DEFAULT_MAX_TICKS; i++) {
    const world = game.world;
    commitPlayerInput(input, bot.decide(world) & 0xffff);
    if (p2 !== undefined && bot2 !== null) {
      // Player 2's controller (M2-06): START at the join tick, then again every other tick while
      // it may join (a continue once out of lives); its pilot while its ship plays.
      const tick = world.tick;
      let mask = 0;
      if (tick >= p2.joinTick && playerCanJoin(world, 1)) {
        mask = (tick - p2.joinTick) % 2 === 0 ? Action.Pause : 0;
      } else if (world.players[1].active) {
        mask = bot2.decide(world) & 0xffff;
      }
      commitPlayerInput(input2, mask);
    }
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
 * @param content - The content to play it on (default the shipped content; M2-08 tests pass a
 *   variant — the raster range without its presentation effects).
 * @param observe - Called with the World after every tick (M2-12 tests: where the run was when
 *   something happened — a death down in zone D's caves).
 * @returns The desync report, the outcome of the playback and the session's World after its last
 *   tick (for checks of what the run went through).
 */
export function playGolden(
  replay: Replay,
  content: ContentDb = shippedContent(),
  observe?: (world: Game['world']) => void,
): {
  report: DesyncReport;
  outcome: GoldenOutcome;
  world: Game['world'];
} {
  const playback = createPlayback(replay, { buildId: GOLDEN_BUILD_ID });
  const game = createReplayGame(
    { ...createHeadlessPlatform(), input: playback },
    replay.header,
    content,
  );
  const watch = new OutcomeWatch(game);
  while (!playback.done) {
    watch.before();
    game.step();
    game.events.clear();
    playback.check(game.world);
    watch.after();
    observe?.(game.world);
  }
  return { report: playback.report, outcome: watch.outcome(), world: game.world };
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
