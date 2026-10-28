/**
 * The TV render bench's **rewind scenario** (plan R2 TV-resume, TL-3 — part of the `bench`
 * module, see `./index.ts`): how fast this engine replays a recorded run segment tick for tick,
 * because the title's CONTINUE? row (TL-4) rebuilds the killed game by exactly this loop. It
 * answers the owner's M7 question — *how many ticks of tail are worth rewinding before the
 * restart-at-checkpoint fallback simply looks faster* — with a MEASURED figure off the set.
 *
 * It runs after the render scenarios and the {@link STANDIN_SCENARIO_ID} / {@link
 * DECODE_SCENARIO_ID} loads, as a special `?scenario=rewind` dispatch (the decode scenario's
 * shape, R1-05 B4 — no renderer, no GL, nothing in the game bundle: rule 9 keeps the two
 * artifacts apart and `check-bundle.mjs` still proves it). The loop is the resume's own: a World
 * built from the bench's own small content (the shipped KESTREL and Type A JSON plus one synthetic
 * open stage — the shipped zones would pull their whole reference graphs into the bench page),
 * stepped one tick at a time with a held-shot autopilot wandering vertically, and `hashWorld` sampled every `REPLAY_HASH_INTERVAL`
 * ticks exactly like the recorder's checkpoints. `stepsPerSecond` is the **rewind** rate — the
 * resume rebuilds at the same determinism, so throughput is the number; `worldBuildMs` is the
 * fixed cost every resume pays; `estCapTicks` is the honest ESTIMATE of the tail length the
 * resume may spend on the rewind (the patience budget divided by the M7 slowdown assumption —
 * both printed with the record so the owner's row replaces the guess).
 *
 * The Node proxy of the same loop lives in `test/bench/rewind.perf.ts` (it replays the shipped
 * goldens — real bullet density — so ITS warm figures are the cap's source; this scenario is the
 * engine-floor check on the real set: open water and autofire only, a LOW-density pace, honest
 * to read beside the proxy, never instead of it).
 *
 * @module
 */
import {
  Action,
  ENGINE_SPRITES,
  REPLAY_HASH_INTERVAL,
  createDebugFlags,
  createInputSnapshot,
  createWorld,
  hashWorld,
  loadContent,
  resolveGameConfig,
  stepWorld,
} from '@shmup/core';
import type { ContentDb, ContentFile, GameConfig, World } from '@shmup/core';
import kestrelPlayer from '../../../../content/player/kestrel.player.json' with { type: 'json' };
import typeAWeapons from '../../../../content/weapons/type-a.weapons.json' with { type: 'json' };
import { searchParam } from './matrix.js';
import { STANDIN_SVG_SCENARIO_INDEX } from './decode.js';

/** The rewind scenario's id (`?scenario=rewind` runs it headlessly). */
export const REWIND_SCENARIO_ID = 'rewind';

/**
 * Its position in a TV run: the last page, after both stand-in loads (plan R-SVG WO-2 reserves the
 * slot before it for the SVG arm's stand-in frame, so the page that closes a run is one every build
 * measures — a **Red** at the results page always has something to re-run).
 */
export const REWIND_SCENARIO_INDEX = STANDIN_SVG_SCENARIO_INDEX + 1;

/** Ticks the headless run steps (SwiftShader — the sim is the point, seconds are enough). */
export const HEADLESS_REWIND_TICKS = 6_000;

/** Ticks the TV steps (a few seconds of steady-state scroll on the M7's engine). */
export const TV_REWIND_TICKS = 12_000;

/** Most ticks `?ticks=` may ask for. */
export const MAX_REWIND_BENCH_TICKS = 60_000;

/** Fewest ticks `?ticks=` may ask for (below a checkpoint interval the hash figure is moot). */
export const MIN_REWIND_BENCH_TICKS = 600;

/** Ticks of the steady-state loop dropped as warm-up (V8 promotes the step pipeline by then). */
export const REWIND_WARMUP_TICKS = 300;

/** Seconds a resume may spend rewinding before the checkpoint start wins (the patience budget). */
export const REWIND_PATIENCE_S = 4;

/**
 * How much slower the M7 is than this bench's Node at a determinism loop (the R0-02 render-bench
 * ratios suggest an order of 10–15; 12 is the placeholder **ESTIMATE** — the owner's measured
 * M7 row replaces it, exactly like `MAX_REWIND_TICKS` awaits the same row).
 */
export const M7_SLOWDOWN_ESTIMATE = 12;

/** The zone the scenario rewinds: the game's first — what a killed launch most likely resumes. */
export const REWIND_STAGE = 'bench-rewind';

/** The record the scenario publishes (the shape of the decode record, of its own kind). */
export interface RewindBenchRecord {
  /** The scenario id ({@link REWIND_SCENARIO_ID}). */
  readonly scenario: 'rewind';
  /** Its position in a TV run ({@link REWIND_SCENARIO_INDEX}). */
  readonly index: number;
  /** Wall clock at the start, ms since the epoch. */
  readonly startedAt: number;
  /** Wall clock at the end, ms since the epoch. */
  readonly endedAt: number;
  /** The build id recorded into the outcome. */
  readonly buildId: string;
  /** Ticks stepped in the measured loop. */
  readonly ticks: number;
  /** Steady-state sim steps per second (the warm loop's rate). */
  readonly stepsPerSecond: number;
  /** Milliseconds to build the World (content resolved, pools sized). */
  readonly worldBuildMs: number;
  /** Milliseconds per `hashWorld` call (the resume's every-600-tick verify). */
  readonly hashMs: number;
  /** How many hash checks the loop ran. */
  readonly hashChecks: number;
  /**
   * The tail length the resume may rewind at this rate within {@link REWIND_PATIENCE_S} divided
   * by {@link M7_SLOWDOWN_ESTIMATE} — an ESTIMATE until the owner's M7 row lands.
   */
  readonly estCapTicks: number;
  /** The stage the scenario plays. */
  readonly stage: string;
  /** What went wrong, or `null`. */
  readonly error: string | null;
}

/**
 * The ticks a query string asks for: `?ticks=<n>`, clamped into
 * [{@link MIN_REWIND_BENCH_TICKS}, {@link MAX_REWIND_BENCH_TICKS}].
 *
 * @param search - `location.search`.
 * @param fallback - Default.
 * @returns The ticks.
 */
export function rewindTicksFromSearch(search: string, fallback: number): number {
  const raw = searchParam(search, 'ticks');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  if (value < MIN_REWIND_BENCH_TICKS) return MIN_REWIND_BENCH_TICKS;
  return value > MAX_REWIND_BENCH_TICKS ? MAX_REWIND_BENCH_TICKS : value;
}

/**
 * The honest cap for one resume's rewind at a measured rate: the patience budget divided by the
 * M7 slowdown estimate, whole ticks, never above {@link MIN_REWIND_BENCH_TICKS} … the segment
 * capacity is the recorder's own ceiling — this is only the patience one.
 *
 * @param stepsPerSecond - A measured steady-state rate.
 * @returns The estimated tick cap (0 for a rate that cannot carry a resume at all).
 */
export function estimateRewindCap(stepsPerSecond: number): number {
  if (!(stepsPerSecond > 0)) return 0;
  return Math.floor((stepsPerSecond * REWIND_PATIENCE_S) / M7_SLOWDOWN_ESTIMATE);
}

/**
 * The scenario's content: the shipped KESTREL and Type A (bundled JSON, 2 KB) over one synthetic
 * open stage — long enough that 60 000 ticks at 2 px/tick never reach its `end`, checkpoints and
 * parallax minimal (the point is the sim's steady pace, not the zone's art). Loading the whole
 * shipped graph here would pull every zone's reference web into the bench page for nothing.
 *
 * @returns The loaded DB.
 * @throws RangeError when the content has issues (a bench bug — the scenario reports it as an
 *   error record, never steps a half-broken world).
 */
function loadBenchContent(): ContentDb {
  const files: ContentFile[] = [
    { path: 'player/kestrel.player.json', data: kestrelPlayer },
    { path: 'weapons/type-a.weapons.json', data: typeAWeapons },
    {
      path: `stages/${REWIND_STAGE}.stage.json`,
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: REWIND_STAGE,
        name: 'REWIND RANGE',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 200_000,
        camera: [{ x: 0, speed: 2 }],
        checkpoints: [{ x: 0 }, { x: 100 }],
        parallax: [],
        tilemap: null,
        events: [{ x: 199_000, type: 'end' }],
      },
    },
  ];
  const { db, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
  if (issues.length > 0) {
    throw new RangeError(`bench content: ${issues.length} issue(s): ${issues[0].message}`);
  }
  return db;
}

/** The config the scenario steps: the open range, fixed seed, god mode so the loop never dies. */
function benchConfig(): GameConfig {
  return resolveGameConfig({ stage: REWIND_STAGE, seed: 7 });
}

/**
 * Steps one World `ticks` times with a held-shot autopilot wandering vertically (the ship stays
 * in the corridor under god mode; the loop's cost is the sim's, not the input's), hashing every
 * {@link REPLAY_HASH_INTERVAL} ticks exactly like the recorder. The first
 * {@link REWIND_WARMUP_TICKS} ticks run unmeasured (V8 promotes the step pipeline by then); the
 * measured part is what a resume would pay. Cold path — a bench page, once.
 *
 * @param content - The loaded content.
 * @param ticks - Ticks to step (clamped above the warm-up by {@link rewindTicksFromSearch}).
 * @param now - The millisecond clock.
 * @returns The measured figures.
 */
function measureLoop(
  content: ContentDb,
  ticks: number,
  now: () => number,
): { worldBuildMs: number; stepsPerSecond: number; hashMs: number; hashChecks: number } {
  const config = benchConfig();
  const flags = createDebugFlags();
  flags.godMode = true;
  const t0 = now();
  const world: World = createWorld(config, content, { debugFlags: flags });
  const worldBuildMs = now() - t0;
  const input = createInputSnapshot();
  const player = input.players[0];
  /**
   * One stepped tick with the autopilot: shot held, vertical wander (whole numbers only).
   *
   * @param tick - The loop position, picking the wander's arm.
   */
  const stepOnce = (tick: number): void => {
    player.held = Action.Shot | ((tick & 8) < 4 ? Action.Up : Action.Down);
    player.pressed = 0;
    player.released = 0;
    stepWorld(world, input);
  };
  for (let tick = 0; tick < REWIND_WARMUP_TICKS; tick++) stepOnce(tick);
  let hashMs = 0;
  let hashChecks = 0;
  const t1 = now();
  for (let tick = REWIND_WARMUP_TICKS; tick < ticks; tick++) {
    stepOnce(tick);
    if (world.tick % REPLAY_HASH_INTERVAL === 0) {
      const h0 = now();
      hashWorld(world);
      hashMs += now() - h0;
      hashChecks++;
    }
  }
  const steadyMs = Math.max(now() - t1, 0.001);
  const steady = ticks - REWIND_WARMUP_TICKS;
  return {
    worldBuildMs,
    stepsPerSecond: Math.round((steady * 1000) / steadyMs),
    hashMs: hashChecks > 0 ? Math.round((hashMs / hashChecks) * 1000) / 1000 : 0,
    hashChecks,
  };
}
/**
 * Measures the rewind loop (see the module docs) into the record the outcome carries.
 *
 * @param buildId - The bench build's id.
 * @param ticks - Ticks to step.
 * @param wallClock - Wall clock for the record's stamps.
 * @param now - Millisecond clock for the stages.
 * @returns The record (`error: null`, or a failed record naming what broke).
 */
export function measureRewindScenario(
  buildId: string,
  ticks: number,
  wallClock: () => number,
  now: () => number,
): RewindBenchRecord {
  const startedAt = wallClock();
  const base = {
    scenario: 'rewind' as const,
    index: REWIND_SCENARIO_INDEX,
    startedAt,
    endedAt: startedAt,
    buildId,
    ticks,
    stepsPerSecond: 0,
    worldBuildMs: 0,
    hashMs: 0,
    hashChecks: 0,
    estCapTicks: 0,
    stage: REWIND_STAGE,
    error: null as string | null,
  };
  try {
    const content = loadBenchContent();
    const loop = measureLoop(content, ticks, now);
    return {
      ...base,
      endedAt: wallClock(),
      stepsPerSecond: loop.stepsPerSecond,
      worldBuildMs: Math.round(loop.worldBuildMs * 1000) / 1000,
      hashMs: loop.hashMs,
      hashChecks: loop.hashChecks,
      estCapTicks: estimateRewindCap(loop.stepsPerSecond),
    };
  } catch (error) {
    return {
      ...base,
      endedAt: wallClock(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
