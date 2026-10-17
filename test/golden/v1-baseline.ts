/**
 * The v1 baseline (plan_resolution.md R2-02, recorded ahead of R2-01 while `master` still runs the
 * 384×216 frame): what every shipped stage does on the clock and on the screen when the 4-way
 * playtest bot flies it with god mode — the tick each timeline event fires, each camera key is
 * reached and each checkpoint is passed, every enemy's spawn, first on-screen tick and first
 * vertical turning point (the "landing" of an enemy that enters from above), every boss's WARNING,
 * intro, fight and death, and the run's length. R2-02's acceptance compares the ×1.5 port against
 * these numbers ("camera travel time within ±2 %", "first-visible ticks ±1", "enemies entering
 * from above land at ×1.5 + 36 px within 2 px"); `test/fixtures/v1-baseline/README.md` says how
 * each field maps to the 640×360 game.
 *
 * {@link recordBaseline} runs one {@link BaselineScenario} exactly as the playtest harness
 * (`test/playtest/harness.ts` `runStage`) does — bare gameplay, the headless platform, the shipped
 * content, god mode, the bot's mask committed before every tick — and measures it with a
 * {@link BaselineMeter}. The meter only reads the World: it wraps four `world.enemies` methods on
 * the instance to learn which timeline event spawned which enemy and how each one left, and every
 * wrapper calls straight through, so the run's hashes are those of an unmeasured run (the
 * scenarios that are a golden replay's run end on that golden's final hash). {@link formatBaseline}
 * lays the result out with the repository's Prettier settings (`pnpm format:check` passes on the
 * committed files), and the `v1-baseline*.test.ts` files re-run every scenario and require the
 * committed `test/fixtures/v1-baseline/<id>.baseline.json` to be byte-identical while the frame is
 * still the recorded one.
 *
 * @module
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BodyAnchor,
  BossState,
  EnemyFlag,
  EnemyState,
  FRAME_H,
  FRAME_W,
  HUD_BAR_HEIGHT,
  PLAYFIELD_H,
  PLAYFIELD_W,
  TILE_SIZE,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  type ContentDb,
  type Enemy,
  type GameConfig,
  type World,
  type WorldStatus,
} from '@shmup/core';
import { format, resolveConfig } from 'prettier';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { maxBulletSpeed } from '../playtest/rules.js';
import { DEFAULT_MAX_TICKS, shippedContent, type PlaytestBot } from '../playtest/harness.js';

/** Format version of a baseline file (bump it when the layout of the file changes). */
export const BASELINE_FORMAT_VERSION = 1;

/** Environment variable that makes the `v1-baseline*.test.ts` files re-record (same frame only). */
export const BASELINE_UPDATE_ENV = 'SHMUP_V1_BASELINE_UPDATE';

/**
 * Below this a vertical step counts as no movement ({@link BaselineMeter}'s turning point): the
 * movers' sub-pixel arithmetic leaves differences far smaller than this, a real step is larger.
 */
export const STILL_EPSILON = 1e-6;

/** One recorded run: which stage, and how it is played. */
export interface BaselineScenario {
  /** File name without `.baseline.json` (the stage id, `-loop2` for a loop-2 run). */
  readonly id: string;
  /** The stage played. */
  readonly stageId: string;
  /** What the run is. */
  readonly description: string;
  /** Session options over the defaults (the seed is always given). */
  readonly config: Partial<GameConfig> & { readonly seed: number };
  /**
   * The golden replay (`test/golden/<name>.replay.json`) that recorded this very run — the same
   * stage, options, bot and god mode — or `null`: its ticks and final hash must equal the
   * baseline's, which proves the meter leaves the simulation alone.
   */
  readonly golden: string | null;
  /**
   * Ticks after which the run stops: the harness's ten minutes (`DEFAULT_MAX_TICKS`) — every run
   * clears its stage well before — except for a stage the bot cannot finish, which stops early.
   */
  readonly maxTicks: number;
  /**
   * Scroll x the run starts at (0 = the stage's start): the debug stage skip's
   * `StageRunner.jumpTo` before the first tick — the loadout is kept, pools are empty.
   */
  readonly startX: number;
}

/** Options of {@link scenario}. */
interface ScenarioOptions {
  /** File name (default: the stage id). */
  readonly id?: string;
  /** Options over the defaults (default: none — seed 1). */
  readonly config?: Partial<GameConfig>;
  /** The golden replay of the same run (default: none). */
  readonly golden?: string;
  /** Tick limit (default `DEFAULT_MAX_TICKS`). */
  readonly maxTicks?: number;
  /** Start x (default 0). */
  readonly startX?: number;
}

/**
 * A scenario with god mode and the 4-way bot.
 *
 * @param stageId - The stage.
 * @param description - What it covers.
 * @param options - File name, session options, the golden replay of the same run, a tick limit.
 * @returns The scenario.
 */
function scenario(
  stageId: string,
  description: string,
  options: ScenarioOptions = {},
): BaselineScenario {
  return Object.freeze({
    id: options.id ?? stageId,
    stageId,
    description,
    config: Object.freeze({ seed: 1, ...options.config }),
    golden: options.golden ?? null,
    maxTicks: options.maxTicks ?? DEFAULT_MAX_TICKS,
    startX: options.startX ?? 0,
  });
}

/**
 * A zone on loop 2 (M3-01: the stage's `remix` events join the timeline).
 *
 * @param zone - The zone's stage id.
 * @param name - The zone's name.
 * @param options - Session options and the golden replay of the same run.
 * @returns The scenario (`<zone>-loop2`).
 */
function loop2(zone: string, name: string, options: ScenarioOptions = {}): BaselineScenario {
  return scenario(zone, `${name} on loop 2 (the remix events)`, {
    id: `${zone}-loop2`,
    golden: options.golden,
    config: { ...options.config, loop: 2 },
  });
}

/** The full loadout: the ranges built around a boss and the bonus stages (as their goldens). */
const FULL: Partial<GameConfig> = { loadout: 'full' };

/**
 * Ticks the `dimension` run lasts (100 s). The 4-way bot cannot shoot down its captain IRON TALON
 * (the grabber) or its boss GRASPING BLOOM (the suction core), so the stage never clears with it
 * at the controls: the run stops past SHADOW STRIDER's timed escape and over a minute into the boss
 * fight — the whole timeline up to the boss lock is in it, the events behind the lock never fire.
 */
export const DIMENSION_TICKS = 6000;

/** Where `hunter-range-dive` starts: one second (60 px at 1 px/tick) before the diving hunter. */
export const HUNTER_DIVE_START_X = 1440;

/**
 * Every recorded run, in file order: the nine zones (loop 1, then loop 2 with the remix events),
 * the hidden bonus stages, the boss rush, the escape and the dimension, and every dev range — all
 * shipped stages except the format sample `example`. Seeds and loadouts follow the god-mode golden
 * replay of the stage where there is one (so the run is that golden's), else seed 1 and the
 * default loadout — the full loadout where the default one cannot finish the stage (the boss
 * ranges, the bonus stages, the boss rushes, the dimension) or meets nothing to measure (the
 * Option Hunters spawn only against Options).
 */
export const BASELINE_SCENARIOS: readonly BaselineScenario[] = Object.freeze([
  scenario('zone-a', 'AZURE VERGE, start to stage clear', { golden: 'zone-a-god' }),
  scenario('zone-b', 'BRINE NEBULA, start to stage clear', { golden: 'zone-b-god' }),
  scenario('zone-c', 'DUNE EXPANSE, start to stage clear', { golden: 'zone-c-god' }),
  scenario('zone-d', 'MAGMA DEEP, start to stage clear', { golden: 'zone-d-god' }),
  scenario('zone-e', 'TEMPEST RIDGE, start to stage clear', { golden: 'zone-e-god' }),
  scenario('zone-f', 'CELL VAULT, start to stage clear', { golden: 'zone-f-god' }),
  scenario('zone-g', 'PRISM LABYRINTH, start to stage clear', { golden: 'zone-g-god' }),
  scenario('zone-h', 'IRON CITADEL, start to stage clear', { golden: 'zone-h-god' }),
  scenario('zone-i', 'ABYSSAL THRONE, start to stage clear', { golden: 'zone-i-god' }),
  loop2('zone-a', 'AZURE VERGE', { config: { seed: 71 }, golden: 'zone-a-loop2-god' }),
  loop2('zone-b', 'BRINE NEBULA'),
  loop2('zone-c', 'DUNE EXPANSE'),
  loop2('zone-d', 'MAGMA DEEP'),
  loop2('zone-e', 'TEMPEST RIDGE'),
  loop2('zone-f', 'CELL VAULT'),
  loop2('zone-g', 'PRISM LABYRINTH'),
  loop2('zone-h', 'IRON CITADEL'),
  loop2('zone-i', 'ABYSSAL THRONE'),
  scenario('bonus-vault', 'the bonus stage of the bonus range, full loadout', {
    config: { ...FULL, seed: 65 },
    golden: 'bonus-vault-god',
  }),
  scenario('brine-grotto', 'PEARL GROTTO, zone B`s hidden bonus stage, full loadout', {
    config: { ...FULL, seed: 71 },
    golden: 'brine-grotto-god',
  }),
  scenario('glimmer-cache', 'GLIMMER CACHE, zone G`s hidden bonus stage, full loadout', {
    config: { ...FULL, seed: 81 },
    golden: 'glimmer-cache-god',
  }),
  scenario('boss-rush', 'the EXTRA menu`s boss rush, every zone`s boss, full loadout', {
    config: FULL,
  }),
  scenario('escape', 'the final zone`s escape run'),
  scenario('dimension', 'the high-speed dimension, 100 s of it, full loadout', {
    config: FULL,
    maxTicks: DIMENSION_TICKS,
  }),
  scenario('test-range', 'the M1 test range'),
  scenario('test-boss', 'the M1 boss range'),
  scenario('weapon-range', 'the weapon select`s live-preview range'),
  scenario('hunter-range', 'the Option Hunter range, full loadout', { config: FULL }),
  // The rear hunter steals every Option at x 700, so in a whole run the diving hunter at x 1500 —
  // the only spawn of the shipped content above the top edge (§2.6) — never comes (hunters spawn
  // only against Options): this run starts just before it, the full loadout's Options intact.
  scenario('hunter-range', 'the diving Option Hunter from above, from x 1440, full loadout', {
    id: 'hunter-range-dive',
    config: FULL,
    startX: HUNTER_DIVE_START_X,
  }),
  scenario('direct-range', 'the Direct-mode carrier range'),
  scenario('gimmick-range', 'the advanced stage systems range', {
    config: { seed: 31 },
    golden: 'gimmick-range-god',
  }),
  scenario('raster-range', 'the raster-effect range', {
    config: { seed: 41 },
    golden: 'raster-range-god',
  }),
  scenario('captain-range', 'the captains range', {
    config: { seed: 51 },
    golden: 'captain-range-god',
  }),
  scenario('raid-range', 'the battleship raid range, full loadout', {
    config: { ...FULL, seed: 52 },
    golden: 'raid-range-god',
  }),
  scenario('twin-range', 'the double-boss range, full loadout', {
    config: { ...FULL, seed: 53 },
    golden: 'twin-range-god',
  }),
  scenario('gauntlet-range', 'the first boss-rush range, full loadout', { config: FULL }),
  scenario('bonus-range', 'the bonus-entrance range, full loadout', {
    config: { ...FULL, seed: 62 },
    golden: 'bonus-range-god',
  }),
]);

/**
 * The scenarios of each re-run test file (so they run in parallel workers): the zones on loop 1
 * (`v1-baseline-zones.test.ts`), on loop 2 (`v1-baseline-loop2.test.ts`) and every other stage
 * (`v1-baseline.test.ts`).
 */
export const BASELINE_GROUPS = Object.freeze({
  zones: BASELINE_SCENARIOS.filter((s) => s.stageId.startsWith('zone-') && s.config.loop !== 2),
  loop2: BASELINE_SCENARIOS.filter((s) => s.stageId.startsWith('zone-') && s.config.loop === 2),
  stages: BASELINE_SCENARIOS.filter((s) => !s.stageId.startsWith('zone-')),
});

/** The frame a baseline was recorded at (all positions in the file are in its pixels). */
export interface BaselineFrame {
  /** `FRAME_W`. */
  readonly width: number;
  /** `FRAME_H`. */
  readonly height: number;
  /** `HUD_BAR_HEIGHT` (each bar). */
  readonly hudBar: number;
  /** `PLAYFIELD_W`. */
  readonly playfieldWidth: number;
  /** `PLAYFIELD_H`. */
  readonly playfieldHeight: number;
  /** `TILE_SIZE`. */
  readonly tileSize: number;
}

/** How the run ended and how long it took. */
export interface BaselineRun {
  /** The bot. */
  readonly bot: string;
  /** Always `true`: hits are ignored, so the run covers the whole stage. */
  readonly godMode: boolean;
  /** The World's status when the run stopped. */
  readonly status: WorldStatus;
  /** The run's tick limit ({@link BaselineScenario.maxTicks}). */
  readonly maxTicks: number;
  /** Ticks run (to the stage clear, or the limit). */
  readonly ticks: number;
  /** Ticks run when the status became `stageClear` (-1 = never). */
  readonly clearTicks: number;
  /** `hashWorld` after the last tick (the simulation the numbers were taken from). */
  readonly hash: number;
}

/** The camera's journey. */
export interface BaselineCamera {
  /** The stage's `length` (camera-x length, world pixels). */
  readonly length: number;
  /** First tick the camera's x reached `length` (-1 = never). */
  readonly endTick: number;
  /** Ticks on which the camera moved (`dx` or `dy` not 0). */
  readonly movingTicks: number;
  /** Ticks on which the camera was scroll-locked (a lock key, the boss's brake). */
  readonly lockedTicks: number;
  /** Ticks on which a `hold` key held it. */
  readonly holdTicks: number;
  /**
   * Per camera key, in stage order: `[x, tick the camera's x first reached it (-1 = never),
   * camera y then]`.
   */
  readonly keys: readonly (readonly number[])[];
  /** Per checkpoint, in stage order: `[x, tick it was passed (-1 = never)]`. */
  readonly checkpoints: readonly (readonly number[])[];
}

/** Column names of {@link StageBaseline.enemies} rows (also written into the file). */
export const ENEMY_COLUMNS = Object.freeze([
  'event',
  'member',
  'spec',
  'spawnTick',
  'x0',
  'y0',
  'entry',
  'visibleTick',
  'visibleX',
  'visibleY',
  'turnTick',
  'turnX',
  'turnY',
  'endTick',
  'fate',
] as const);

/** Column names of {@link StageBaseline.bosses} rows (also written into the file). */
export const BOSS_COLUMNS = Object.freeze([
  'id',
  'role',
  'warningTick',
  'introTick',
  'introX',
  'introY',
  'fightTick',
  'fightX',
  'fightY',
  'dyingTick',
  'escapeTick',
  'endTick',
] as const);

/** Column names of {@link StageBaseline.specs} rows (also written into the file). */
export const SPEC_COLUMNS = Object.freeze(['id', 'hw', 'hh', 'anchor'] as const);

/** Column names of {@link StageBaseline.events} rows (also written into the file). */
export const EVENT_COLUMNS = Object.freeze(['type', 'x', 'tick'] as const);

/** One baseline file. */
export interface StageBaseline {
  /** {@link BASELINE_FORMAT_VERSION}. */
  readonly formatVersion: number;
  /** The scenario's id. */
  readonly id: string;
  /** The stage played. */
  readonly stage: string;
  /** What the run is. */
  readonly description: string;
  /** The session options over the defaults. */
  readonly config: Readonly<Record<string, unknown>>;
  /** The golden replay that recorded the same run when this file was recorded (`null` = none). */
  readonly golden: string | null;
  /** Scroll x the run started at ({@link BaselineScenario.startX}; 0 = the stage's start). */
  readonly startX: number;
  /** The frame the numbers were recorded at. */
  readonly frame: BaselineFrame;
  /** How the run went. */
  readonly run: BaselineRun;
  /** The camera's journey. */
  readonly camera: BaselineCamera;
  /**
   * The fastest live enemy bullet of the whole run, in px/tick (`test/playtest/rules.ts`
   * `maxBulletSpeed`, the 4-way rule's measure, sampled after every tick).
   */
  readonly maxBulletSpeed: number;
  /** Rising edges of the WARNING banner (`world.bosses.warning.active`). */
  readonly warnings: readonly number[];
  /** Column names of {@link StageBaseline.events}. */
  readonly eventColumns: readonly string[];
  /** Per timeline event (index = event index): `[type, x, tick it fired (-1 = never)]`. */
  readonly events: readonly (readonly (string | number)[])[];
  /** Indices of the events the camera passed while their branch (or loop) was not taken. */
  readonly skippedEvents: readonly number[];
  /** Column names of {@link StageBaseline.specs}. */
  readonly specColumns: readonly string[];
  /** The enemy specs the enemy rows refer to (row `spec` = index here), hurtbox and anchor. */
  readonly specs: readonly (readonly (string | number)[])[];
  /** Column names of {@link StageBaseline.enemies}. */
  readonly enemyColumns: readonly string[];
  /** Every regular enemy that spawned, in spawn order (see the README for each column). */
  readonly enemies: readonly (readonly (string | number)[])[];
  /** Column names of {@link StageBaseline.bosses}. */
  readonly bossColumns: readonly string[];
  /** Every boss or captain encounter, in the order they began. */
  readonly bosses: readonly (readonly (string | number)[])[];
}

/**
 * Rounds a pixel value to 1/100 px, so the files stay short and diff well (the comparisons of
 * R2-02 work to a pixel or two).
 *
 * @param v - The value.
 * @returns The rounded value (`-0` becomes 0).
 */
function px(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

/** One enemy being measured. */
interface EnemyRecord {
  /** Its row (written into {@link StageBaseline.enemies} by {@link BaselineMeter.finish}). */
  readonly row: (string | number)[];
  /** Its slot. */
  readonly slot: number;
  /** Its spawn tick (with the slot, its identity). */
  readonly spawnTick: number;
  /** Its spec index. */
  readonly specIndex: number;
  /** Whether it flies (rides the camera) — else it is fixed in the world (ground). */
  readonly air: boolean;
  /** Sign of its first vertical movement (0 = none yet). */
  dir: number;
  /** Vertical position the last tick (playfield y when flying, world y on the ground). */
  lastY: number;
  /** Playfield x the last tick. */
  lastScreenX: number;
  /** Playfield y the last tick. */
  lastScreenY: number;
  /** Measuring ended (killed, escaped, a ghost leader, removed). */
  ended: boolean;
}

/** One boss or captain encounter being measured. */
interface BossRecord {
  /** Its row. */
  readonly row: (string | number)[];
}

/** Indices into an enemy row. */
const COL = Object.freeze({
  visibleTick: ENEMY_COLUMNS.indexOf('visibleTick'),
  visibleX: ENEMY_COLUMNS.indexOf('visibleX'),
  visibleY: ENEMY_COLUMNS.indexOf('visibleY'),
  turnTick: ENEMY_COLUMNS.indexOf('turnTick'),
  turnX: ENEMY_COLUMNS.indexOf('turnX'),
  turnY: ENEMY_COLUMNS.indexOf('turnY'),
  endTick: ENEMY_COLUMNS.indexOf('endTick'),
  fate: ENEMY_COLUMNS.indexOf('fate'),
});

/** Indices into a boss row. */
const BOSS_COL = Object.freeze({
  warningTick: BOSS_COLUMNS.indexOf('warningTick'),
  introTick: BOSS_COLUMNS.indexOf('introTick'),
  introX: BOSS_COLUMNS.indexOf('introX'),
  introY: BOSS_COLUMNS.indexOf('introY'),
  fightTick: BOSS_COLUMNS.indexOf('fightTick'),
  fightX: BOSS_COLUMNS.indexOf('fightX'),
  fightY: BOSS_COLUMNS.indexOf('fightY'),
  dyingTick: BOSS_COLUMNS.indexOf('dyingTick'),
  escapeTick: BOSS_COLUMNS.indexOf('escapeTick'),
  endTick: BOSS_COLUMNS.indexOf('endTick'),
});

/** Measures one run of a World (see {@link createBaselineMeter}). */
export interface BaselineMeter {
  /**
   * Takes the measurements of the tick just run. Call it once after every `game.step()`.
   */
  afterTick(): void;
  /**
   * The finished baseline.
   *
   * @param scenario - The run's scenario (id, stage, description, options).
   * @param run - How the run went (the bot, its status and ticks).
   * @returns The baseline document.
   */
  finish(scenario: BaselineScenario, run: Omit<BaselineRun, 'hash' | 'godMode'>): StageBaseline;
}

/**
 * Whether an enemy's hurtbox lies beyond each edge of the view (the World's own on-screen test,
 * `core/enemies` `checkView`: inclusive edges).
 *
 * @param e - The enemy.
 * @param world - Its World.
 * @returns `T` / `B` (above / below) then `L` / `R` (left / right), or `I` when it overlaps the
 *   view.
 */
function entrySide(e: Enemy, world: World): string {
  const camera = world.camera;
  let side = '';
  if (e.y + e.hh < camera.y) side += 'T';
  else if (e.y - e.hh > camera.y + PLAYFIELD_H) side += 'B';
  if (e.x + e.hw < camera.x) side += 'L';
  else if (e.x - e.hw > camera.x + PLAYFIELD_W) side += 'R';
  return side === '' ? 'I' : side;
}

/**
 * Starts measuring a World before its first tick: wraps `world.enemies.onStageEvent`,
 * `spawnPending`, `kill` and `destroy` on the instance (each calls the original with the same
 * arguments and only reads state afterwards; the enemy system calls them through `this`, so its
 * own kills and destroys pass through them too), then reads the World after every tick.
 *
 * @param world - A fresh World (no tick run yet) with a stage.
 * @param db - Its content.
 * @returns The meter.
 * @throws {Error} When the World has no stage or has already run.
 *
 * @remarks
 * What is measured, per tick: the events the stage runner's cursor passed (fired, or passed by
 * with their branch / loop not taken), the camera keys and checkpoints reached, the moving /
 * locked / hold ticks, the WARNING's rising edges, the fastest enemy bullet; per enemy —
 * attributed to its timeline event
 * (a `spawn`, or a `formation` and the member's index) or to nobody (spawned by a script or a
 * boss) — its spawn tick and playfield position (timeline enemies: the spawn point itself; script
 * children: the end of their spawn tick), which edge of the view it spawned beyond, the tick the
 * World first saw its hurtbox on screen (`Enemy.firstSeenTick`) and where it was then, its first
 * vertical turning point (the first tick its vertical movement stopped or reversed after it began
 * — playfield coordinates for a flying enemy, the world for a ground one — and the position there:
 * an enemy that enters from above "lands" there), and how it left (killed, destroyed by a script,
 * escaped — out of the view or never seen —, still alive);
 * per boss slot, each encounter's state changes and its position at the start of the intro and of
 * the fight.
 */
export function createBaselineMeter(world: World, db: ContentDb): BaselineMeter {
  const runner = world.stage;
  if (runner === null) throw new Error('the baseline needs a World with a stage');
  if (world.tick !== 0) throw new Error('start the baseline meter before the first tick');
  const stage = runner.stage;
  const enemies = world.enemies;
  const slots = enemies.enemies;
  const camera = world.camera;

  const records: EnemyRecord[] = [];
  const bySlot: (EnemyRecord | null)[] = slots.map(() => null);
  const formationEvent = new Int32Array(enemies.formations.active.length).fill(-1);
  /** How the enemies that left this tick went, by slot: `k` killed, `d` destroyed by a script. */
  const fates = new Map<number, string>();
  const specRows: (string | number)[][] = [];
  const specRow = new Map<number, number>();

  const eventTicks = stage.events.map(() => -1);
  const skipped: number[] = [];
  let cursor = runner.eventCursor;
  const keyTicks = stage.camera.map(() => -1);
  const keyY = stage.camera.map(() => 0);
  const checkpointTicks = stage.checkpoints.map(() => -1);
  let checkpoint = runner.checkpoint;
  let endTick = -1;
  let movingTicks = 0;
  let lockedTicks = 0;
  let holdTicks = 0;
  const warnings: number[] = [];
  let warningActive = false;
  let fastestBullet = 0;

  const bosses: BossRecord[] = [];
  const bossSlot: (BossRecord | null)[] = world.bosses.slots.map(() => null);
  const bossState = world.bosses.slots.map(() => BossState.None as number);

  /**
   * The row index of an enemy spec in the file's spec table (added on first use).
   *
   * @param e - An enemy of the spec.
   * @returns The index.
   */
  const specOf = (e: Enemy): number => {
    const known = specRow.get(e.specIndex);
    if (known !== undefined) return known;
    const index = specRows.length;
    specRows.push([db.enemies[e.specIndex]?.id ?? '?', px(e.hw), px(e.hh), e.anchor]);
    specRow.set(e.specIndex, index);
    return index;
  };

  /**
   * Starts measuring the enemy in a slot.
   *
   * @param slot - Its slot.
   * @param event - Its timeline event (-1 = a script or a boss spawned it).
   * @param member - Its formation member index (-1 = none).
   * @param tick - The tick it spawned on.
   */
  const adopt = (slot: number, event: number, member: number, tick: number): void => {
    const e = slots[slot];
    const sx = e.x - camera.x;
    const sy = e.y - camera.y;
    const air = e.anchor === BodyAnchor.Air;
    const record: EnemyRecord = {
      row: [
        event,
        member,
        specOf(e),
        tick,
        px(sx),
        px(sy),
        entrySide(e, world),
        -1,
        0,
        0,
        -1,
        0,
        0,
        -1,
        'a',
      ],
      slot,
      spawnTick: e.spawnTick,
      specIndex: e.specIndex,
      air,
      dir: 0,
      lastY: air ? sy : e.y,
      lastScreenX: sx,
      lastScreenY: sy,
      ended: false,
    };
    records.push(record);
    bySlot[slot] = record;
  };

  /**
   * The slots that are free now.
   *
   * @returns One flag per slot.
   */
  const freeSlots = (): boolean[] => slots.map((e) => e.state === EnemyState.Free);

  /**
   * Adopts the enemies that took a slot free before a call (timeline spawns).
   *
   * @param before - {@link freeSlots} before the call.
   * @param event - The event (`-2` = look it up from the member's formation).
   */
  const adoptNew = (before: readonly boolean[], event: number): void => {
    const tick = world.tick;
    for (let slot = 0; slot < slots.length; slot++) {
      const e = slots[slot];
      if (!before[slot] || e.state === EnemyState.Free || e.spawnTick !== tick) continue;
      const formation = e.formation;
      if (event === -2) {
        adopt(slot, formation >= 0 ? formationEvent[formation] : -1, e.member, tick);
      } else {
        adopt(slot, event, -1, tick);
      }
    }
  };

  const onStageEvent = enemies.onStageEvent.bind(enemies);
  const spawnPending = enemies.spawnPending.bind(enemies);
  const kill = enemies.kill.bind(enemies);
  const destroy = enemies.destroy.bind(enemies);
  const formations = enemies.formations;
  enemies.onStageEvent = (eventIndex: number): void => {
    const before = freeSlots();
    const wasActive = Array.from(formations.active);
    onStageEvent(eventIndex);
    for (let f = 0; f < wasActive.length; f++) {
      if (wasActive[f] === 0 && formations.active[f] === 1) formationEvent[f] = eventIndex;
    }
    adoptNew(before, eventIndex);
  };
  enemies.spawnPending = (): void => {
    const before = freeSlots();
    spawnPending();
    adoptNew(before, -2);
  };
  enemies.kill = (enemy: Enemy, by?: number): boolean => {
    const done = kill(enemy, by);
    if (done) fates.set(enemy.slot, 'k');
    return done;
  };
  enemies.destroy = (enemy: Enemy, explode?: boolean): boolean => {
    const done = destroy(enemy, explode);
    if (done) fates.set(enemy.slot, 'd');
    return done;
  };

  /**
   * Measures the enemies after a tick.
   *
   * @param tick - The tick just run.
   */
  const measureEnemies = (tick: number): void => {
    for (let slot = 0; slot < slots.length; slot++) {
      const e = slots[slot];
      let record = bySlot[slot];
      const live = e.state === EnemyState.Live && (e.flags & EnemyFlag.Ghost) === 0;
      // A child of a script or a boss: first seen here, after its spawn tick.
      if (
        live &&
        (record === null || record.spawnTick !== e.spawnTick || record.specIndex !== e.specIndex)
      ) {
        if (record !== null && !record.ended) {
          record.ended = true;
          record.row[COL.endTick] = tick;
          record.row[COL.fate] = 'e';
        }
        adopt(slot, -1, -1, e.spawnTick);
        record = bySlot[slot];
      }
      if (record === null || record.ended) continue;
      if (!live || e.spawnTick !== record.spawnTick) {
        record.ended = true;
        record.row[COL.endTick] = tick;
        record.row[COL.fate] = fates.get(slot) ?? 'e';
        continue;
      }
      const sx = e.x - camera.x;
      const sy = e.y - camera.y;
      if (record.row[COL.visibleTick] === -1 && e.firstSeenTick >= 0) {
        record.row[COL.visibleTick] = e.firstSeenTick;
        record.row[COL.visibleX] = px(sx);
        record.row[COL.visibleY] = px(sy);
      }
      const y = record.air ? sy : e.y;
      const dy = y - record.lastY;
      if (record.row[COL.turnTick] === -1) {
        if (record.dir === 0) {
          if (Math.abs(dy) > STILL_EPSILON) record.dir = dy > 0 ? 1 : -1;
        } else if (dy * record.dir <= STILL_EPSILON) {
          record.row[COL.turnTick] = tick - 1;
          record.row[COL.turnX] = px(record.lastScreenX);
          record.row[COL.turnY] = px(record.lastScreenY);
        }
      }
      record.lastY = y;
      record.lastScreenX = sx;
      record.lastScreenY = sy;
    }
    fates.clear();
  };

  /**
   * Measures the boss slots after a tick.
   *
   * @param tick - The tick just run.
   */
  const measureBosses = (tick: number): void => {
    const list = world.bosses.slots;
    for (let i = 0; i < list.length; i++) {
      const boss = list[i];
      const state: number = boss.state;
      const before = bossState[i];
      if (state === before) continue;
      bossState[i] = state;
      let record = bossSlot[i];
      const idle = (s: number): boolean => s === BossState.None || s === BossState.Dead;
      if (idle(before) && !idle(state)) {
        record = {
          row: [
            boss.specIndex >= 0 ? (db.enemies[boss.specIndex]?.id ?? '?') : '?',
            boss.role,
            -1,
            -1,
            0,
            0,
            -1,
            0,
            0,
            -1,
            -1,
            -1,
          ],
        };
        bosses.push(record);
        bossSlot[i] = record;
      }
      if (record === null) continue;
      const bx = px(boss.x - camera.x);
      const by = px(boss.y - camera.y);
      const row = record.row;
      if (state === BossState.Warning && row[BOSS_COL.warningTick] === -1) {
        row[BOSS_COL.warningTick] = tick;
      } else if (state === BossState.Intro && row[BOSS_COL.introTick] === -1) {
        row[BOSS_COL.introTick] = tick;
        row[BOSS_COL.introX] = bx;
        row[BOSS_COL.introY] = by;
      } else if (state === BossState.Fight && row[BOSS_COL.fightTick] === -1) {
        row[BOSS_COL.fightTick] = tick;
        row[BOSS_COL.fightX] = bx;
        row[BOSS_COL.fightY] = by;
      } else if (state === BossState.Dying && row[BOSS_COL.dyingTick] === -1) {
        row[BOSS_COL.dyingTick] = tick;
      } else if (state === BossState.Escape && row[BOSS_COL.escapeTick] === -1) {
        row[BOSS_COL.escapeTick] = tick;
      }
      if (idle(state)) {
        row[BOSS_COL.endTick] = tick;
        bossSlot[i] = null;
      }
    }
  };

  /**
   * Measures the stage runner and the camera after a tick.
   *
   * @param tick - The tick just run.
   */
  const measureStage = (tick: number): void => {
    const next = runner.eventCursor;
    for (let i = cursor; i < next && i < eventTicks.length; i++) {
      if (eventTicks[i] !== -1 || skipped.includes(i)) continue;
      if (runner.eventActive(i)) eventTicks[i] = tick;
      else skipped.push(i);
    }
    if (next > cursor) cursor = next;
    for (let k = 0; k < keyTicks.length; k++) {
      if (keyTicks[k] === -1 && camera.x >= stage.camera[k].x) {
        keyTicks[k] = tick;
        keyY[k] = px(camera.y);
      }
    }
    while (runner.checkpoint > checkpoint) {
      checkpoint++;
      if (checkpointTicks[checkpoint] === -1) checkpointTicks[checkpoint] = tick;
    }
    if (endTick === -1 && camera.x >= stage.length) endTick = tick;
    if (camera.dx !== 0 || camera.dy !== 0) movingTicks++;
    if (runner.locked) lockedTicks++;
    if (runner.holding) holdTicks++;
    const active = world.bosses.warning.active;
    if (active && !warningActive) warnings.push(tick);
    warningActive = active;
    const speed = maxBulletSpeed(world);
    if (speed > fastestBullet) fastestBullet = speed;
  };

  return {
    afterTick() {
      const tick = world.tick - 1;
      measureStage(tick);
      measureEnemies(tick);
      measureBosses(tick);
    },
    finish(scenario, run) {
      return {
        formatVersion: BASELINE_FORMAT_VERSION,
        id: scenario.id,
        stage: scenario.stageId,
        description: scenario.description,
        config: { ...scenario.config },
        golden: scenario.golden,
        startX: scenario.startX,
        frame: {
          width: FRAME_W,
          height: FRAME_H,
          hudBar: HUD_BAR_HEIGHT,
          playfieldWidth: PLAYFIELD_W,
          playfieldHeight: PLAYFIELD_H,
          tileSize: TILE_SIZE,
        },
        run: { ...run, godMode: world.debugFlags.godMode, hash: hashWorld(world) },
        camera: {
          length: stage.length,
          endTick,
          movingTicks,
          lockedTicks,
          holdTicks,
          keys: stage.camera.map((key, k) => [key.x, keyTicks[k], keyY[k]]),
          checkpoints: stage.checkpoints.map((c, k) => [c.x, checkpointTicks[k]]),
        },
        maxBulletSpeed: Math.round(fastestBullet * 10_000) / 10_000,
        warnings,
        eventColumns: [...EVENT_COLUMNS],
        events: stage.events.map((event, i) => [event.type, event.x, eventTicks[i]]),
        skippedEvents: skipped,
        specColumns: [...SPEC_COLUMNS],
        specs: specRows,
        enemyColumns: [...ENEMY_COLUMNS],
        enemies: records.map((r) => r.row),
        bossColumns: [...BOSS_COLUMNS],
        bosses: bosses.map((b) => b.row),
      };
    },
  };
}

/**
 * Plays one scenario with the 4-way bot (god mode) and measures it.
 *
 * @param scenario - The run.
 * @param bot - Who plays (default a fresh {@link fourWayBot}).
 * @returns The baseline.
 * @throws {Error} When the shipped content has issues (`shippedContent`).
 * @throws {RangeError} When the stage or the options are invalid (`createGame`).
 *
 * @remarks
 * The same session as `test/playtest/harness.ts` `runStage(stageId, bot, { godMode: true,
 * seed, config })`: bare gameplay on the headless platform and the shipped content, god mode on
 * `world.debugFlags`, the bot's mask cut to 16 bits and committed to player 1's snapshot before
 * each tick, the tick's presentation events discarded, until `stageClear`, `gameOver` or the
 * scenario's `maxTicks`. So `zone-a` here is the run of the `zone-a-god` golden replay.
 *
 * @example
 * ```ts
 * const baseline = recordBaseline(BASELINE_SCENARIOS[0]); // zone A
 * baseline.run.status; // → 'stageClear'
 * ```
 */
export function recordBaseline(
  scenario: BaselineScenario,
  bot: PlaytestBot = fourWayBot(),
): StageBaseline {
  const maxTicks = scenario.maxTicks;
  const db = shippedContent();
  const platform = createHeadlessPlatform();
  const game = createGame(
    platform,
    { ...scenario.config, stage: scenario.stageId, stageSkip: 'none' },
    db,
  );
  const world = game.world;
  world.debugFlags.godMode = true;
  if (scenario.startX > 0) world.stage?.jumpTo(scenario.startX);
  const meter = createBaselineMeter(world, db);
  const input = platform.snapshot.players[0];
  let ticks = 0;
  let clearTicks = -1;
  while (ticks < maxTicks) {
    commitPlayerInput(input, bot.decide(world) & 0xffff);
    game.step();
    ticks++;
    game.events.clear();
    meter.afterTick();
    if (world.status === 'stageClear' && clearTicks < 0) clearTicks = ticks;
    if (world.status === 'stageClear' || world.status === 'gameOver') break;
  }
  return meter.finish(scenario, {
    bot: bot.name,
    status: world.status,
    maxTicks,
    ticks,
    clearTicks,
  });
}

/**
 * Path of a scenario's baseline file.
 *
 * @param id - The scenario's id.
 * @returns The file path.
 */
export function baselinePath(id: string): string {
  return fileURLToPath(new URL(`../fixtures/v1-baseline/${id}.baseline.json`, import.meta.url));
}

/**
 * The text of a baseline file: `JSON.stringify`, then the repository's Prettier settings for that
 * path (so `pnpm format:check` passes and the rows stay one per line).
 *
 * @param baseline - The baseline.
 * @returns The file's text (final newline included).
 */
export async function formatBaseline(baseline: StageBaseline): Promise<string> {
  const path = baselinePath(baseline.id);
  const options = (await resolveConfig(path)) ?? {};
  return format(JSON.stringify(baseline), { ...options, filepath: path });
}

/**
 * Reads a committed baseline file.
 *
 * @param id - The scenario's id.
 * @returns Its text, or `null` when there is none.
 */
export function readBaselineText(id: string): string | null {
  const path = baselinePath(id);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Reads and parses a committed baseline file (what R2-02's comparison starts from).
 *
 * @param id - The scenario's id.
 * @returns The baseline.
 * @throws {Error} When the file is missing or not JSON.
 */
export function readBaseline(id: string): StageBaseline {
  const text = readBaselineText(id);
  if (text === null) throw new Error(`no v1 baseline for ${id}: ${baselinePath(id)}`);
  return JSON.parse(text) as StageBaseline;
}

/**
 * Writes a baseline file (re-recording — only while the frame is the recorded one).
 *
 * @param id - The scenario's id.
 * @param text - {@link formatBaseline}'s output.
 */
export function writeBaseline(id: string, text: string): void {
  writeFileSync(baselinePath(id), text);
}

/**
 * Whether the running engine's frame is the one a baseline was recorded at — the condition for
 * re-recording and for the byte-identical check. From R2-01 on (`FRAME_W` 640) it is false, and
 * the baseline is the frozen v1 record R2-02 compares against.
 *
 * @param frame - The baseline's frame.
 * @returns `true` when every frame constant still has the recorded value.
 */
export function sameFrame(frame: BaselineFrame): boolean {
  return (
    frame.width === FRAME_W &&
    frame.height === FRAME_H &&
    frame.hudBar === HUD_BAR_HEIGHT &&
    frame.playfieldWidth === PLAYFIELD_W &&
    frame.playfieldHeight === PLAYFIELD_H &&
    frame.tileSize === TILE_SIZE
  );
}
