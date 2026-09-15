/**
 * # scenes/replays — recording and playing whole runs (plan M3-01)
 *
 * **Responsibility.** The scene flow's side of `core/replay`'s run replays (shmup_feat.md §21
 * "[P2] save/share replays, replay browser, fast-forward"):
 *
 * - {@link RunRecorder} — records the run the flow plays: every World the game scene adopts starts a
 *   **segment** ({@link RunRecorder.beginSegment}: the World's header, the start state the flow gave
 *   it — {@link worldStartJson}), every tick the game scene steps is recorded with its input, the
 *   flow's between-tick actions (a continue, a pause secret) are noted, the segment is sealed before
 *   the zone tally pays its bonus, and when the run ends ({@link RunRecorder.finishRun}) the
 *   segments become a `RunReplay`. A run that outgrew the recorder (a World over 20 minutes, too many
 *   segments) or was played with the debug stage jumps cannot be saved (`null`).
 * - {@link RunReplayPlayback} — plays a run replay back, segment after segment: each segment's World
 *   is created from its header like a demo's (`createWorld` with the header's config, god mode from
 *   `assisted`), its start state applied (`./run.ts` {@link prepareWorldStart} and the carried
 *   players), then stepped tick by tick with the recorded input — the actions applied between the
 *   ticks where the flow applied them — and every hash compared (periodic ones right after their
 *   tick, the final one after the segment's last actions, as the recorder took them). A desync ends
 *   the playback.
 * - {@link worldStartJson} / {@link readWorldStart} — the start state as plain JSON and back
 *   (validated: a malformed start throws, the replay is refused).
 *
 * Recording never allocates per tick (the `core/replay` `SegmentRecorder` is preallocated); segment
 * and run transitions allocate (a scene transition, like a World's creation).
 *
 * **Implements.** shmup_feat.md §21 Replays (save / share / browser / fast-forward — the scenes are
 * in `./index.ts`), §22 determinism.
 *
 * @module
 */
import { DEFAULT_DIFFICULTY_TABLE, resolveGameConfig, type GameConfig } from '../config/index.js';
import type { ContentDb } from '../data/index.js';
import { createDebugFlags, hashWorld, jumpToCheckpoint, type DebugFlags } from '../debug/index.js';
import { createEventQueue, type EventQueue } from '../events/index.js';
import { MAX_PLAYERS, type InputSnapshot } from '../input/index.js';
import {
  REPLAY_HASH_INTERVAL,
  createPlayback,
  createReplayHeader,
  type ReplayPlayback,
} from '../replay/format.js';
import {
  MAX_RUN_SEGMENTS,
  RUN_REPLAY_FORMAT_VERSION,
  RunAction,
  SegmentRecorder,
  type RunReplay,
  type RunSegment,
} from '../replay/run.js';
import { MAX_SHIELD_PODS } from '../shields/index.js';
import {
  continueWorld,
  createWorld,
  grantFullPower,
  selfDestruct,
  stepWorld,
  type World,
} from '../world/index.js';
import { CarryState, WorldStart, prepareWorldStart } from './run.js';

/** The number fields of a carried player, in their JSON order. */
const PLAYER_NUMBERS = Object.freeze([
  'lives',
  'score',
  'continues',
  'nextExtend',
  'extendsEarned',
  'main',
  'options',
  'spread',
  'shot',
  'sub',
  'family',
  'speedLevel',
  'cursor',
] as const);

/** The number fields of a carried shield. */
const SHIELD_NUMBERS = Object.freeze([
  'kind',
  'hits',
  'maxHits',
  'absorbed',
  'hurtScale',
  'podCount',
  'podMaxHits',
  'podOrbit',
  'spin',
  'tier',
  'charge',
] as const);

/** The per-pod arrays of a carried shield. */
const SHIELD_ARRAYS = Object.freeze(['podHits', 'podAngle', 'podX', 'podY'] as const);

/**
 * The start state of a World as plain JSON (M3-01 — a run replay segment's `start`).
 *
 * @param start - What the flow put into the World.
 * @param carry - The players carried in (`null` / invalid: none).
 * @param hiScore - The session hi-score the World's board shows at its start.
 * @returns A fresh object (a transition).
 */
export function worldStartJson(
  start: Readonly<WorldStart>,
  carry: CarryState | null,
  hiScore: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    stageTerm: start.stageTerm,
    returnX: start.returnX,
    checkpoint: start.checkpoint,
    locked: start.locked,
    hiScore,
  };
  if (carry === null || !carry.valid) return out;
  const players: Record<string, unknown>[] = [];
  for (const c of carry.players) {
    const player: Record<string, unknown> = { active: c.active, out: c.out, down: c.down };
    for (const key of PLAYER_NUMBERS) player[key] = c[key];
    player.missile = c.missile;
    const shield: Record<string, unknown> = { absorbsTerrain: c.shield.absorbsTerrain };
    for (const key of SHIELD_NUMBERS) shield[key] = c.shield[key];
    for (const key of SHIELD_ARRAYS) shield[key] = Array.from(c.shield[key]);
    player.shield = shield;
    players.push(player);
  }
  out.carry = { continuesUsed: carry.continuesUsed, hiScore: carry.hiScore, players };
  return out;
}

/**
 * Reads a finite number field.
 *
 * @param record - The object.
 * @param key - The field.
 * @param path - Its path for the error.
 * @returns The number.
 * @throws {RangeError} When it is not a finite number.
 */
function num(record: Readonly<Record<string, unknown>>, key: string, path: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`run replay start ${path}${key} must be a number`);
  }
  return value;
}

/**
 * Reads a boolean field.
 *
 * @param record - The object.
 * @param key - The field.
 * @param path - Its path for the error.
 * @returns The value.
 * @throws {RangeError} When it is not a boolean.
 */
function bool(record: Readonly<Record<string, unknown>>, key: string, path: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new RangeError(`run replay start ${path}${key} must be a boolean`);
  }
  return value;
}

/**
 * Reads an object field.
 *
 * @param value - Anything.
 * @param path - Its path for the error.
 * @returns The object.
 * @throws {RangeError} When it is not a plain object.
 */
function record(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RangeError(`run replay start ${path} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

/** A start state read back ({@link readWorldStart}). */
export interface ReadWorldStart {
  /** The start state. */
  readonly start: WorldStart;
  /** The carried players, or `null`. */
  readonly carry: CarryState | null;
  /** The session hi-score the World's board shows at its start. */
  readonly hiScore: number;
}

/**
 * Reads a segment's start state (M3-01 — {@link worldStartJson}'s output).
 *
 * @param json - The segment's `start` (`null`: a fresh World at its stage start).
 * @returns The start state, the carried players and the hi-score (fresh objects).
 * @throws {RangeError} When a field is missing or malformed.
 */
export function readWorldStart(json: Readonly<Record<string, unknown>> | null): ReadWorldStart {
  const start = new WorldStart();
  if (json === null) return { start, carry: null, hiScore: 0 };
  start.stageTerm = num(json, 'stageTerm', '');
  start.returnX = num(json, 'returnX', '');
  start.checkpoint = num(json, 'checkpoint', '');
  start.locked = bool(json, 'locked', '');
  const hiScore = num(json, 'hiScore', '');
  if (json.carry === undefined) return { start, carry: null, hiScore };
  const c = record(json.carry, 'carry');
  const carry = new CarryState();
  carry.valid = true;
  carry.continuesUsed = num(c, 'continuesUsed', 'carry.');
  carry.hiScore = num(c, 'hiScore', 'carry.');
  const players = c.players;
  if (!Array.isArray(players) || players.length !== MAX_PLAYERS) {
    throw new RangeError(`run replay start carry.players must hold ${MAX_PLAYERS} players`);
  }
  for (let p = 0; p < MAX_PLAYERS; p++) {
    const path = `carry.players[${p}].`;
    const row = record(players[p], path);
    const target = carry.players[p];
    target.active = bool(row, 'active', path);
    target.out = bool(row, 'out', path);
    target.down = bool(row, 'down', path);
    target.missile = bool(row, 'missile', path);
    for (const key of PLAYER_NUMBERS) target[key] = num(row, key, path);
    const shield = record(row.shield, path + 'shield');
    const t = target.shield;
    t.absorbsTerrain = bool(shield, 'absorbsTerrain', path + 'shield.');
    for (const key of SHIELD_NUMBERS) {
      (t as unknown as Record<string, number>)[key] = num(shield, key, path + 'shield.');
    }
    for (const key of SHIELD_ARRAYS) {
      const list = shield[key];
      if (!Array.isArray(list) || list.length !== MAX_SHIELD_PODS) {
        throw new RangeError(`run replay start ${path}shield.${key} must hold ${MAX_SHIELD_PODS}`);
      }
      for (let i = 0; i < MAX_SHIELD_PODS; i++) {
        const value: unknown = list[i];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new RangeError(`run replay start ${path}shield.${key}[${i}] must be a number`);
        }
        t[key][i] = value;
      }
    }
  }
  return { start, carry, hiScore };
}

/** What a finished run is recorded as ({@link RunRecorder.finishRun}). */
export interface RunReplayMeta {
  /** The build id (`__SHMUP_BUILD__`). */
  readonly buildId: string;
  /** The hi-score mode of the run. */
  readonly mode: string;
  /** The browser's title of the run. */
  readonly label: string;
  /** Player 1's final score. */
  readonly score: number;
  /** The last zone's map label. */
  readonly reached: string;
  /** The run's `AssistFlag`s. */
  readonly assists: number;
}

/**
 * Records the run the scene flow plays (see the module docs). One per flow; reused for every run.
 */
export class RunRecorder {
  /** The World segment being recorded. */
  readonly segment = new SegmentRecorder();
  /** The segments of the run so far. */
  readonly segments: RunSegment[] = [];
  /** Whether the run can still be saved (no overflow, no debug jump, not too many segments). */
  valid = false;
  /** Whether a run is being recorded. */
  recording = false;

  /** Starts recording a run (a game start). */
  beginRun(): void {
    this.segments.length = 0;
    this.segment.reset();
    this.valid = true;
    this.recording = true;
  }

  /** Stops recording without a replay (a run the flow abandons unrecorded). */
  cancel(): void {
    this.segment.reset();
    this.segments.length = 0;
    this.valid = false;
    this.recording = false;
  }

  /**
   * A World of the run starts: ends the segment before (if any) and starts this World's. A
   * transition (it allocates the start state's JSON).
   *
   * @param world - The new World at tick 0 (adopted: its board shows the session hi-score).
   * @param previous - The World the run played until now (`null` for none).
   * @param start - The start state the flow gave the new World.
   * @param carry - The players carried in.
   * @param buildId - The build id for the header.
   * @param godMode - Whether the debug god mode is on (the header's `assisted`).
   * @param assists - The run's assist flags so far.
   */
  beginSegment(
    world: World,
    previous: World | null,
    start: Readonly<WorldStart>,
    carry: CarryState | null,
    buildId: string,
    godMode: boolean,
    assists: number,
  ): void {
    if (!this.recording) return;
    if (previous !== null) this.endSegment(previous, assists);
    if (!this.valid) return;
    const header = createReplayHeader(world.config, { buildId, assisted: godMode, assists });
    this.segment.begin(header, worldStartJson(start, carry, world.scoring.board.hiScore));
  }

  /**
   * Ends the segment being recorded (a transition): kept when it recorded cleanly, else the run
   * can no longer be saved.
   *
   * @param world - Its World.
   * @param assists - The run's assist flags.
   */
  endSegment(world: World, assists: number): void {
    if (!this.segment.active) return;
    const segment = this.segment.finish(world, assists);
    if (segment === null || this.segments.length >= MAX_RUN_SEGMENTS) {
      this.valid = false;
      return;
    }
    this.segments.push(segment);
  }

  /** The debug tools changed a World outside a tick (a stage jump): the run cannot be replayed. */
  invalidate(): void {
    this.valid = false;
  }

  /**
   * Records one tick's input (call right before the game scene steps its World). Never allocates.
   *
   * @param input - The tick's input.
   */
  record(input: Readonly<InputSnapshot>): void {
    if (this.recording && this.valid) this.segment.record(input);
  }

  /**
   * Call after every recorded tick (the periodic hashes). Never allocates.
   *
   * @param world - The World after the tick.
   */
  check(world: World): void {
    if (this.recording && this.valid) this.segment.check(world);
  }

  /**
   * Records a flow action between ticks (a continue, a pause secret).
   *
   * @param code - The `RunAction`.
   * @param param - Its parameter.
   */
  action(code: RunAction, param: number): void {
    if (this.recording && this.valid) this.segment.action(code, param);
  }

  /**
   * Seals the segment before the flow changes its World outside a tick (the zone tally).
   *
   * @param world - The World.
   */
  seal(world: World): void {
    if (this.recording && this.valid) this.segment.seal(world);
  }

  /**
   * The run ended: ends the segment being recorded and returns the replay (a transition).
   *
   * @param world - The World the run ended in.
   * @param meta - What the replay is recorded as.
   * @returns The replay, or `null` when the run cannot be saved (nothing recorded, an overflow, a
   *   debug jump).
   */
  finishRun(world: World, meta: RunReplayMeta): RunReplay | null {
    if (!this.recording) return null;
    this.endSegment(world, meta.assists);
    this.recording = false;
    if (!this.valid || this.segments.length === 0) {
      this.segments.length = 0;
      return null;
    }
    let ticks = 0;
    for (const segment of this.segments) ticks += segment.replay.ticks;
    const replay: RunReplay = Object.freeze({
      formatVersion: RUN_REPLAY_FORMAT_VERSION,
      buildId: meta.buildId,
      mode: meta.mode,
      label: meta.label,
      score: meta.score,
      reached: meta.reached,
      assists: meta.assists,
      ticks,
      segments: Object.freeze(this.segments.slice()),
    });
    this.segments.length = 0;
    return replay;
  }
}

/** Where a {@link RunReplayPlayback} stands (see {@link RunReplayPlayback.report}). */
export class RunPlaybackReport {
  /** No hash differed so far. */
  ok = true;
  /** Hashes compared so far. */
  checked = 0;
  /** The segment whose hash differed first (-1 = none). */
  desyncSegment = -1;
  /** The tick of that segment whose hash differed (-1 = none). */
  desyncTick = -1;
  /** Whether every segment was played to its end. */
  finished = false;
}

/**
 * Plays a run replay back (see the module docs). A transition creates each segment's World; a
 * {@link RunReplayPlayback.step} plays one tick without allocating (apart from the behaviour
 * coroutines of the stage's spawns — decision D29, as in a game).
 */
export class RunReplayPlayback {
  /** The run replay. */
  readonly run: RunReplay;
  /** The report. */
  readonly report = new RunPlaybackReport();
  /** The segment playing (index into the run's segments). */
  segment = -1;
  /** The segment's World (`null` before the first segment or after the last). */
  world: World | null = null;
  /** The segment's input playback. */
  private playback: ReplayPlayback | null = null;
  /** The next action of the segment (index of its pair). */
  private nextAction = 0;
  /** The content the run was recorded with. */
  private readonly content: ContentDb;
  /** Where the Worlds push their events. */
  private readonly events: EventQueue;
  /** The Worlds' own debug switches (god mode from the headers). */
  readonly flags: DebugFlags = createDebugFlags();

  /**
   * Prepares the playback (no World yet — {@link RunReplayPlayback.nextSegment} creates the first).
   *
   * @param run - The run replay.
   * @param content - The content it was recorded with.
   * @param events - Where the Worlds push their presentation events (default: a private queue).
   */
  constructor(run: RunReplay, content: ContentDb, events: EventQueue = createEventQueue()) {
    this.run = run;
    this.content = content;
    this.events = events;
  }

  /** Whether the playback goes on: segments or ticks are left and every hash matched. */
  get running(): boolean {
    return this.report.ok && !this.report.finished;
  }

  /** The config of the segment playing (`null` between segments). */
  get config(): GameConfig | null {
    return this.world === null ? null : this.world.config;
  }

  /**
   * The stage the next {@link RunReplayPlayback.step} starts a segment on — the host prepares its
   * music set first —, or `null` when the step goes on in the segment playing (or nothing is left).
   */
  get nextStage(): string | null {
    if (!this.running) return null;
    if (this.world !== null && this.playback !== null && !this.playback.done) return null;
    const next = this.run.segments[this.segment + 1];
    return next === undefined ? null : next.replay.header.stageId;
  }

  /**
   * Starts the next segment: creates its World from the header, applies the start state and its
   * hi-score, checks a zero-tick segment's final hash. A transition.
   *
   * @returns `true` when a segment started; `false` at the end of the run (the report is then
   *   finished) or when a segment cannot start (the report records a desync at tick 0).
   */
  nextSegment(): boolean {
    const report = this.report;
    this.segment++;
    this.world = null;
    this.playback = null;
    if (this.segment >= this.run.segments.length) {
      report.finished = true;
      return false;
    }
    const segment = this.run.segments[this.segment];
    const header = segment.replay.header;
    try {
      const config = resolveGameConfig(
        header.config,
        this.content.difficulty ?? DEFAULT_DIFFICULTY_TABLE,
      );
      this.flags.godMode = header.assisted;
      const world = createWorld(config, this.content, {
        events: this.events,
        debugFlags: this.flags,
      });
      if (header.checkpoint >= 0 && !jumpToCheckpoint(world, header.checkpoint)) {
        throw new RangeError('no such checkpoint');
      }
      const start = readWorldStart(segment.start);
      prepareWorldStart(world, start.start, start.carry);
      world.scoring.board.setHiScore(start.hiScore);
      this.world = world;
    } catch (_error) {
      report.ok = false;
      report.desyncSegment = this.segment;
      report.desyncTick = 0;
      return false;
    }
    this.playback = createPlayback(segment.replay);
    this.nextAction = 0;
    if (segment.replay.ticks === 0) this.finishSegment();
    return true;
  }

  /**
   * Plays one recorded tick (starting the first or next segment when one is due). Does nothing
   * once the playback is over. Never allocates within a segment.
   *
   * @returns Whether the playback goes on ({@link RunReplayPlayback.running}).
   */
  step(): boolean {
    if (!this.running) return false;
    if (this.world === null || this.playback === null || this.playback.done) {
      if (!this.nextSegment()) return this.running;
      if (this.playback === null || this.playback.done) return this.running;
    }
    const world = this.world as World;
    const playback = this.playback;
    const input = playback.poll();
    stepWorld(world, input);
    const segment = this.run.segments[this.segment];
    const tick = playback.ticks;
    if (tick % REPLAY_HASH_INTERVAL === 0) {
      const index = tick / REPLAY_HASH_INTERVAL - 1;
      const hashes = segment.replay.hashes;
      if (index >= 0 && index < hashes.length) this.compare(tick, hashes[index]);
    }
    if (playback.done) this.finishSegment();
    else this.applyActions(tick);
    return this.running;
  }

  /**
   * Applies the segment's actions recorded at a tick count (between ticks).
   *
   * @param tick - The World's tick count.
   */
  private applyActions(tick: number): void {
    const world = this.world;
    if (world === null) return;
    const actions = this.run.segments[this.segment].actions;
    let k = this.nextAction;
    while (k * 2 < actions.length && actions[k * 2] === tick) {
      const word = actions[k * 2 + 1];
      const code = word & 0xff;
      const param = word >>> 8;
      if (code === RunAction.Continue) continueWorld(world, param);
      else if (code === RunAction.FullPower) grantFullPower(world, param);
      else if (code === RunAction.SelfDestruct) selfDestruct(world, param);
      k++;
    }
    this.nextAction = k;
  }

  /** The segment's recorded ticks are played: its last actions, then its final hash. */
  private finishSegment(): void {
    const playback = this.playback;
    if (playback === null) return;
    const segment = this.run.segments[this.segment];
    this.applyActions(segment.replay.ticks);
    this.compare(segment.replay.ticks, segment.replay.finalHash);
    if (this.report.ok && this.segment >= this.run.segments.length - 1) {
      this.report.finished = true;
    }
  }

  /**
   * Compares the World's hash with a recorded one.
   *
   * @param tick - The segment tick it belongs to.
   * @param expected - The recorded hash.
   */
  private compare(tick: number, expected: number): void {
    const world = this.world;
    if (world === null) return;
    const report = this.report;
    report.checked++;
    if (hashWorld(world) !== expected && report.ok) {
      report.ok = false;
      report.desyncSegment = this.segment;
      report.desyncTick = tick;
    }
  }
}
