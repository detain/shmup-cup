/**
 * # replay/checkpoint — the run checkpoint record of the TV-resume (v2's R2)
 *
 * **Responsibility.** A Samsung M7 loses the app when the source switches (the documented exit
 * hook is the `visibilitychange` the platform binds to `PlatformLifecycle.onSuspend`), so a run
 * must survive being killed. The scene flow **flushes** a compact record of the live run to its
 * own storage key, `run.checkpoint.v1`, at every durable edge (a World's birth, a checkpoint
 * pass, the platform's suspend — never per tick) and clears it when the run ends. A later boot
 * reads it back: still the same build, the current replay format, a config that resolves and —
 * for the exact-tick tail — a replay that decodes, or the record is silently discarded (the
 * {@link ReplayVersionError} refusal pattern of R2-01: a stale save never resumes into a wrong
 * game). {@link RunCheckpointStore} owns the key; the record itself is plain JSON:
 *
 * ```json
 * { "kind": "run.checkpoint", "v": 1, "buildId": "…", "replayFormat": 2,
 *   "savedTick": 1234, "checkpointPassed": 2, "pendingStart": false,
 *   "config": { …GameConfig JSON… },
 *   "run": { "campaignId": "main", "zone": 1, "stage": "zone-b", … RunState fields … },
 *   "carry": { …the flush-time start state (core/scenes worldStartJson) … },
 *   "tail": { "replay": { …ReplayJson since this World's birth… }, "start": …, "actions": … } }
 * ```
 *
 * `tail` is the live segment copied by `SegmentRecorder.snapshot` ({@link runSegmentToJson}):
 * replaying it from the World's birth reproduces the killed World **exactly**, hash for hash
 * (`core/scenes` `RunReplayPlayback` is the player). It is `null` when the record carries only
 * the checkpoint state (`carry` + `run.checkpoint` restart the zone the game's own way) — the
 * record then holds no inputs, and the resume starts at the last passed checkpoint.
 *
 * - **The key is its own.** The save document (`core/save`, key `save.v1`, version 4) is
 *   untouched; a format change of the checkpoint bumps {@link CHECKPOINT_FORMAT_VERSION} and the
 *   old record discards itself.
 * - **Silent discard.** Nothing here throws for stored data: {@link classifyCheckpointText}
 *   reads the boundary and says `'none' | 'invalid' | 'stale' | 'ok'` (an invalid or stale record
 *   is deleted by the store on load, so the title never shows a row that cannot be resumed).
 * - **Quota.** One key of at most {@link CHECKPOINT_MAX_CHARS} characters: the replay library,
 *   the save and its corrupt copy hold 1,024,438 B of the 1 MiB worst case (see `./run.ts`);
 *   12,000 chars with the prefixed key (54 B) add 24,054 B — 1,048,492 B, inside the budget.
 *   The realistic record is a few KB (the tail is what grows it: the run-length-encoded inputs
 *   cost about a byte a tick, so a long World flushes without one and resumes from the
 *   checkpoint).
 *
 * Pure: the storage arrives as a `PlatformStorage`; nothing here reads a clock.
 *
 * **Implements.** shmup_feat.md §24 ("save game state" platform surface), §21 (the replay
 * formats the tail reuses); the TV-resume plan (docs/v2-run: R2 — HDMI-switch survival, owner
 * pick R2 = exact-tick resume with a silent checkpoint fallback — *verified-or-checkpoint, never
 * wrong*).
 *
 * **Public API.** {@link RUN_CHECKPOINT_STORAGE_KEY}, {@link RUN_CHECKPOINT_KIND},
 * {@link CHECKPOINT_FORMAT_VERSION}, {@link CHECKPOINT_MAX_CHARS}, {@link RunCheckpointRun},
 * {@link RunCheckpointRecord}, {@link RunCheckpointInput}, {@link buildCheckpointText},
 * {@link classifyCheckpointText}, {@link RunCheckpointVerdict}, {@link RunCheckpointStore}.
 *
 * @module
 */
import { resolveGameConfig, type GameConfig } from '../config/index.js';
import type { PlatformStorage } from '../platform/index.js';
import { REPLAY_FORMAT_VERSION, ReplayVersionError } from './format.js';
import {
  runSegmentFromJson,
  runSegmentToJson,
  type RunSegment,
  type RunSegmentJson,
} from './run.js';

/** `Platform.storage` key of the run checkpoint (the web adapter prefixes it). */
export const RUN_CHECKPOINT_STORAGE_KEY = 'run.checkpoint.v1';

/** The `kind` of a checkpoint document ({@link RunCheckpointRecord}). */
export const RUN_CHECKPOINT_KIND = 'run.checkpoint';

/** Format version of the checkpoint document (bump when the layout changes — old records discard). */
export const CHECKPOINT_FORMAT_VERSION = 1;

/**
 * Characters a checkpoint text may occupy at most (the storage budget of the module docs: the
 * library + save + corrupt copy worst case leaves 24,138 B and the prefixed key costs 54 B).
 */
export const CHECKPOINT_MAX_CHARS = 12_000;

/** The run-level fields of the checkpoint (a plain-JSON copy of `core/scenes` `RunState`). */
export interface RunCheckpointRun {
  /** The campaign's id, or `null` for a single-stage run (must match the content at resume). */
  readonly campaignId: string | null;
  /** The current zone (index into the campaign's zones; -1 outside one). */
  readonly zone: number;
  /** The stage the current zone plays (the World's stage or the pending one). */
  readonly stage: string | null;
  /** Zones cleared before the current one (the rank's stage term). */
  readonly depth: number;
  /** The route so far: zone indices, the current zone last. */
  readonly route: readonly number[];
  /** The checkpoint the current zone starts at (-1 = its start). */
  readonly checkpoint: number;
  /** What kind of run it is (`core/scenes` `RunMode`). */
  readonly mode: string;
  /** The loop the run plays. */
  readonly loop: number;
  /** The caravan's clock of the run's Worlds (0 = none). */
  readonly timeLimit: number;
  /** Run flags so far (`core/scenes` `RunFlag` bits). */
  readonly flags: number;
  /** Ships lost by the Worlds that ended so far. */
  readonly deaths: number;
  /** Continues used by the Worlds that ended so far. */
  readonly continues: number;
  /** The continues the current World started with (its carried count). */
  readonly continuesAtStart: number;
  /** The run's `core/replay` `AssistFlag` bits. */
  readonly assists: number;
  /** Whether the World being played is a hidden bonus stage. */
  readonly inBonus: boolean;
  /** The bonus stage's id while `inBonus`. */
  readonly bonusStage: string | null;
  /** Stage x of the entrance used (-1 = none). */
  readonly bonusReturnX: number;
  /** The current zone's bonus entrances are locked. */
  readonly bonusLocked: boolean;
  /** Whether the World being played is the final zone's escape sequence. */
  readonly inEscape: boolean;
  /** The escape stage's id while `inEscape`. */
  readonly escapeStage: string | null;
}

/** The parsed checkpoint record (see the module docs for the document). */
export interface RunCheckpointRecord {
  /** The build that wrote it (must equal the host's). */
  readonly buildId: string;
  /** The replay format the tail was recorded in (must equal {@link REPLAY_FORMAT_VERSION}). */
  readonly replayFormat: number;
  /** The tick the record was written at (the live World's, or -1 between Worlds). */
  readonly savedTick: number;
  /** The live World's last passed checkpoint at the write (-1 before the first). */
  readonly checkpointPassed: number;
  /** Whether the record was written between Worlds (no tail, the next zone already prepared). */
  readonly pendingStart: boolean;
  /** The config the live World was built with (validated on parse). */
  readonly config: GameConfig;
  /** The run-level fields. */
  readonly run: RunCheckpointRun;
  /** The players' state at the write (`core/scenes` `worldStartJson`; read back by the flow). */
  readonly carry: Readonly<Record<string, unknown>>;
  /** The exact-tick tail (the live segment), or `null` (checkpoint-only resume). */
  readonly tail: RunSegmentJson | null;
}

/** What {@link buildCheckpointText} is given (all live parts, cold path). */
export interface RunCheckpointInput {
  /** The host build id. */
  readonly buildId: string;
  /** The config JSON (a `ReplayHeader.config` — the live World's own). */
  readonly config: Record<string, unknown>;
  /** The live World's tick at the write (-1 between Worlds). */
  readonly savedTick: number;
  /** The live World's last passed checkpoint at the write (-1 before the first). */
  readonly checkpointPassed: number;
  /** Whether the run is between Worlds (a prepared next zone, no live World). */
  readonly pendingStart: boolean;
  /** The run-level fields. */
  readonly run: RunCheckpointRun;
  /** The carry JSON (`core/scenes` `worldStartJson` of the flush-time state). */
  readonly carry: Readonly<Record<string, unknown>>;
  /** The live segment copy, or `null` (checkpoint-only record). */
  readonly tailSegment: RunSegment | null;
}

/** Verdict of {@link classifyCheckpointText} (see {@link RunCheckpointStore.load}). */
export type RunCheckpointVerdict = 'none' | 'invalid' | 'stale' | 'ok';

/** The outcome of {@link classifyCheckpointText} (a record only for `'ok'`). */
export interface RunCheckpointClassified {
  /** What the stored text is (see {@link RunCheckpointVerdict}). */
  readonly verdict: RunCheckpointVerdict;
  /** The parsed record (`null` for any other verdict). */
  readonly record: RunCheckpointRecord | null;
}

/** Whether a value is a plain (non-array, non-null) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a whole-number field in range, or `undefined` for a malformed record.
 *
 * @param source - The object to read.
 * @param key - The field name.
 * @param min - Smallest accepted value.
 * @param max - Largest accepted value.
 * @returns The value, or `undefined`.
 */
function intField(
  source: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return undefined;
  }
  return value;
}

/** Reads a string-or-null id field, or `undefined` for a malformed record. */
function idField(source: Record<string, unknown>, key: string): string | null | undefined {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 96) return undefined;
  return value;
}

/** Reads a boolean field, or `undefined` for a malformed record. */
function boolField(source: Record<string, unknown>, key: string): boolean | undefined {
  return typeof source[key] === 'boolean' ? source[key] : undefined;
}

/** Reads the route array (integer zone indices, at most 64 of them), or `undefined`. */
function routeField(source: Record<string, unknown>, key: string): number[] | undefined {
  const value = source[key];
  if (!Array.isArray(value) || value.length > 64) return undefined;
  const items = value as unknown[];
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const zone = items[i];
    if (typeof zone !== 'number' || !Number.isInteger(zone) || zone < 0 || zone > 63) {
      return undefined;
    }
    out.push(zone);
  }
  return out;
}

/**
 * Builds the checkpoint text of a flush (see {@link RunCheckpointInput}).
 *
 * @param input - The live parts.
 * @returns The text, or `null` when it would not fit {@link CHECKPOINT_MAX_CHARS} even without
 *   the tail (the caller keeps the previous record — the run stays resumable without the copy).
 * @throws {RangeError} For a config that does not resolve (programmer error: the caller hands
 *   the live World's own header config, which resolved at its creation).
 *
 * @remarks
 * Cold path (a flush). With an oversized tail the tail is dropped and the record rebuilt
 * checkpoint-only, so a long World still resumes from its last checkpoint.
 */
export function buildCheckpointText(input: RunCheckpointInput): string | null {
  // Fail fast: a config that does not resolve can never rebuild the World.
  resolveGameConfig(input.config);
  const build = (tail: RunSegmentJson | null): string =>
    JSON.stringify({
      kind: RUN_CHECKPOINT_KIND,
      v: CHECKPOINT_FORMAT_VERSION,
      buildId: input.buildId,
      replayFormat: REPLAY_FORMAT_VERSION,
      savedTick: input.savedTick,
      checkpointPassed: input.checkpointPassed,
      pendingStart: input.pendingStart,
      config: input.config,
      run: input.run,
      carry: input.carry,
      tail,
    });
  const withTail = input.tailSegment === null ? null : runSegmentToJson(input.tailSegment);
  const text = build(withTail);
  if (text.length <= CHECKPOINT_MAX_CHARS) return text;
  if (withTail === null) return null;
  const fallback = build(null);
  return fallback.length <= CHECKPOINT_MAX_CHARS ? fallback : null;
}

/**
 * Reads and classifies a checkpoint text (the boundary parse of {@link RunCheckpointStore}).
 * Never throws for stored data.
 *
 * @param text - The stored text (`''` / `null`: no record).
 * @param buildId - The host's build id.
 * @returns The verdict and, for `'ok'`, the parsed record.
 */
export function classifyCheckpointText(
  text: string | null,
  buildId: string,
): RunCheckpointClassified {
  if (text === null || text === '') return { verdict: 'none', record: null };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    return { verdict: 'invalid', record: null };
  }
  if (!isRecord(data) || data.kind !== RUN_CHECKPOINT_KIND) {
    return { verdict: 'invalid', record: null };
  }
  if (data.v !== CHECKPOINT_FORMAT_VERSION) return { verdict: 'stale', record: null };
  if (data.replayFormat !== REPLAY_FORMAT_VERSION) return { verdict: 'stale', record: null };
  if (data.buildId !== buildId) return { verdict: 'stale', record: null };
  if (!isRecord(data.config) || !isRecord(data.run) || !isRecord(data.carry)) {
    return { verdict: 'invalid', record: null };
  }
  const savedTick = intField(data, 'savedTick', -1, 0x7fffffff);
  const checkpointPassed = intField(data, 'checkpointPassed', -1, 4095);
  const pendingStart = boolField(data, 'pendingStart');
  const run = data.run;
  const campaignId = idField(run, 'campaignId');
  const stage = idField(run, 'stage');
  const bonusStage = idField(run, 'bonusStage');
  const escapeStage = idField(run, 'escapeStage');
  const mode = run.mode;
  const zone = intField(run, 'zone', -1, 63);
  const depth = intField(run, 'depth', 0, 64);
  const checkpoint = intField(run, 'checkpoint', -1, 4095);
  const loop = intField(run, 'loop', 1, 99);
  const timeLimit = intField(run, 'timeLimit', 0, 10_000_000);
  const flags = intField(run, 'flags', 0, 15);
  const deaths = intField(run, 'deaths', 0, 100_000);
  const continues = intField(run, 'continues', 0, 100_000);
  const continuesAtStart = intField(run, 'continuesAtStart', 0, 100_000);
  const assists = intField(run, 'assists', 0, 1023);
  const inBonus = boolField(run, 'inBonus');
  const bonusReturnX = intField(run, 'bonusReturnX', -1, 1_000_000);
  const bonusLocked = boolField(run, 'bonusLocked');
  const inEscape = boolField(run, 'inEscape');
  const route = routeField(run, 'route');
  if (
    savedTick === undefined ||
    checkpointPassed === undefined ||
    pendingStart === undefined ||
    campaignId === undefined ||
    stage === undefined ||
    bonusStage === undefined ||
    escapeStage === undefined ||
    typeof mode !== 'string' ||
    (mode !== 'normal' && mode !== 'bossRush' && mode !== 'caravan' && mode !== 'arcade') ||
    zone === undefined ||
    depth === undefined ||
    checkpoint === undefined ||
    loop === undefined ||
    timeLimit === undefined ||
    flags === undefined ||
    deaths === undefined ||
    continues === undefined ||
    continuesAtStart === undefined ||
    assists === undefined ||
    inBonus === undefined ||
    bonusReturnX === undefined ||
    bonusLocked === undefined ||
    inEscape === undefined ||
    route === undefined
  ) {
    return { verdict: 'invalid', record: null };
  }
  let config: GameConfig;
  try {
    config = resolveGameConfig(data.config);
  } catch (_error) {
    return { verdict: 'invalid', record: null };
  }
  let tail: RunSegmentJson | null = null;
  if (data.tail !== null) {
    if (!isRecord(data.tail)) return { verdict: 'invalid', record: null };
    try {
      // Validates the replay (format, frame, config through resolveGameConfig); a v1 or
      // foreign-frame recording throws ReplayVersionError — the record is stale, never wrong.
      runSegmentFromJson(data.tail);
      tail = data.tail as unknown as RunSegmentJson;
    } catch (error) {
      return {
        verdict: error instanceof ReplayVersionError ? 'stale' : 'invalid',
        record: null,
      };
    }
  }
  return {
    verdict: 'ok',
    record: {
      buildId,
      replayFormat: REPLAY_FORMAT_VERSION,
      savedTick,
      checkpointPassed,
      pendingStart,
      config,
      run: {
        campaignId,
        zone,
        stage,
        depth,
        route,
        checkpoint,
        mode,
        loop,
        timeLimit,
        flags,
        deaths,
        continues,
        continuesAtStart,
        assists,
        inBonus,
        bonusStage,
        bonusReturnX,
        bonusLocked,
        inEscape,
        escapeStage,
      },
      carry: data.carry,
      tail,
    },
  };
}

/**
 * The run checkpoint over one `Platform.storage` key (see the module docs). The flow writes it at
 * its durable edges and the title reads the parsed record synchronously after {@link load}.
 */
export class RunCheckpointStore {
  /** The live record (`null`: none, cleared, or discarded at load). */
  private record: RunCheckpointRecord | null = null;
  /**
   * The chain of writes: each settles after the previous one, whatever the adapter does, so a
   * `clear()` followed by a `store()` cannot lose to the adapter and leave the cleared key.
   */
  private chain: Promise<void> = Promise.resolve();

  /**
   * Creates the store (nothing reads until {@link load}).
   *
   * @param storage - The platform storage.
   * @param buildId - The host's build id (a record of another build discards silently).
   */
  constructor(
    private readonly storage: PlatformStorage,
    private readonly buildId: string,
  ) {}

  /** Whether a resumable record is in hand (the title's CONTINUE? row). */
  get available(): boolean {
    return this.record !== null;
  }

  /** The parsed record (`null` when {@link RunCheckpointStore.available} is false). */
  get current(): RunCheckpointRecord | null {
    return this.record;
  }

  /**
   * Reads the stored record (before the title opens, like the replay library): an invalid or
   * stale record deletes itself, so a broken key cannot outlive one boot.
   *
   * @returns Resolves once the key has been read (and cleared, when it was stale).
   */
  async load(): Promise<void> {
    let text: string | null;
    try {
      text = await this.storage.get(RUN_CHECKPOINT_STORAGE_KEY);
    } catch (_error) {
      this.record = null;
      return;
    }
    const { verdict, record } = classifyCheckpointText(text, this.buildId);
    this.record = record;
    if (verdict === 'invalid' || verdict === 'stale') {
      await this.clear();
    }
  }

  /**
   * Writes a record (best-effort — a storage failure keeps the old one; the next flush retries).
   * The cache updates at once, the disk write follows the chain.
   *
   * @param text - The {@link buildCheckpointText} output.
   * @returns Resolves when the write settled.
   */
  store(text: string): Promise<void> {
    const { verdict, record } = classifyCheckpointText(text, this.buildId);
    if (verdict !== 'ok' || record === null) return this.chain;
    this.record = record;
    this.chain = this.chain.then(() =>
      this.storage.set(RUN_CHECKPOINT_STORAGE_KEY, text).catch(() => undefined),
    );
    return this.chain;
  }

  /**
   * Clears the record (a run that ended, or a resume consumed): the title row goes away with it.
   *
   * @returns Resolves when the key settled.
   */
  clear(): Promise<void> {
    this.record = null;
    this.chain = this.chain.then(() =>
      this.storage.set(RUN_CHECKPOINT_STORAGE_KEY, '').catch(() => undefined),
    );
    return this.chain;
  }
}
