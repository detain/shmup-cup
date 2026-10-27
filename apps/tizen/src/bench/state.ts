/**
 * The TV render bench's **persisted run state** (plan R0-02 — part of the `bench` module, see
 * `./index.ts`).
 *
 * One scenario runs per page load (Pixi's `TexturePool` is global and never shrinks, so a second
 * scenario on the same page would inherit the first one's render targets), so the run's cursor
 * and its results live in `localStorage` between the `location.reload()`s — and stay there until a
 * later run overwrites them, so a crash or a power cut loses nothing. Everything here is a pure
 * function of the state, tested headlessly; `run.ts` reads and writes the storage.
 *
 * A run is the render scenarios of the matrix (174 since the resolution sweep and the video knob), then the `decode` scenario (plan R1-05 B4 —
 * `./decode.ts`), then the `standin-zone` page load (plan R3-04.M4a — `./scene.ts`) and the
 * `rewind` scenario (plan R2 TL-3 — `./rewind.ts`): the cursor runs to {@link BENCH_RUN_LENGTH},
 * the render records (the stand-in load's among them) go to `records`, the decode record to
 * `decode` and the rewind record to `rewind`. A state stored by a bench from before B4 (no
 * `decode`) or before TL-3 (no `rewind`) still reads — its record is `null`.
 *
 * @module
 */
import type { DecodeBenchRecord, RenderBenchRecord } from '@shmup/shell';
import { BENCH_RUN_LENGTH, DECODE_SCENARIO_INDEX } from './decode.js';
import { REWIND_SCENARIO_INDEX, type RewindBenchRecord } from './rewind.js';
import { type BenchTiming } from './matrix.js';

/** `localStorage` key of the run state (the game's `shmup-cup:` prefix). */
export const BENCH_STATE_KEY = 'shmup-cup:render-bench';

/** Format version of the stored state. */
export const BENCH_STATE_VERSION = 1;

/** A bench run as stored between page loads. */
export interface BenchRunState {
  /** {@link BENCH_STATE_VERSION}. */
  readonly version: number;
  /** Session id (`rb-…`) — names the log server's JSONL file. */
  readonly session: string;
  /** Wall-clock start of the run (ms since epoch). */
  readonly startedAt: number;
  /** Whether the matrix is still being worked through (each page load runs the next scenario). */
  readonly running: boolean;
  /** Whether only the scenario at the cursor runs, then the run stops (a **Red** re-run). */
  readonly single: boolean;
  /**
   * Index of the next scenario to run: a render scenario's index, `DECODE_SCENARIO_INDEX` for the
   * decode scenario, `STANDIN_SCENARIO_INDEX` for the stand-in load, `BENCH_RUN_LENGTH` = done.
   */
  readonly cursor: number;
  /** Sequence number of the last payload sent to the log server. */
  readonly seq: number;
  /** The WebGL version the run asks for. */
  readonly webGLVersion: number;
  /** Phase timing of the run. */
  readonly timing: BenchTiming;
  /** The results so far, one per scenario index (a re-run replaces its record). */
  readonly records: readonly RenderBenchRecord[];
  /** The decode scenario's record (plan R1-05 B4), or `null` before it ran. */
  readonly decode: DecodeBenchRecord | null;
  /** The rewind scenario's record (plan R2 TL-3), or `null` before it ran. */
  readonly rewind: RewindBenchRecord | null;
  /**
   * Scenario indexes whose record the log server has acknowledged (`DECODE_SCENARIO_INDEX` for the
   * decode record).
   */
  readonly sent: readonly number[];
  /** The last error that stopped the run, or `null`. */
  readonly lastError: string | null;
}

/**
 * A fresh run, positioned on the first scenario.
 *
 * @param session - Session id.
 * @param startedAt - Wall-clock start.
 * @param webGLVersion - WebGL version to ask for.
 * @param timing - Phase timing.
 * @returns The state (`running`, cursor 0, no records).
 */
export function createRunState(
  session: string,
  startedAt: number,
  webGLVersion: number,
  timing: BenchTiming,
): BenchRunState {
  return {
    version: BENCH_STATE_VERSION,
    session,
    startedAt,
    running: true,
    single: false,
    cursor: 0,
    seq: 0,
    webGLVersion,
    timing,
    records: [],
    decode: null,
    rewind: null,
    sent: [],
    lastError: null,
  };
}

/**
 * Whether a value is a finite number.
 *
 * @param value - The value.
 * @returns `true` for a finite number.
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Whether a value is a `[min, p50, p95, max]` tuple of numbers.
 *
 * @param value - The value.
 * @returns `true` for four finite numbers.
 */
function isTuple(value: unknown): boolean {
  return Array.isArray(value) && value.length === 4 && value.every(isNumber);
}

/**
 * Whether a value is a `[min, p50, p95, max]` tuple or `null` (a stage that was not measured).
 *
 * @param value - The value.
 * @returns `true` for a tuple of four finite numbers, or `null`.
 */
function isTupleOrNull(value: unknown): boolean {
  return value === null || isTuple(value);
}

/**
 * Whether a stored value is a decode record the results page can show (plan R1-05 B4 — everything
 * its decode table reads).
 *
 * @param value - The value.
 * @returns `true` for a usable record.
 */
export function isDecodeRecord(value: unknown): value is DecodeBenchRecord {
  if (value === null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (
    typeof r.scenario !== 'string' ||
    !isNumber(r.index) ||
    !isNumber(r.webGLVersion) ||
    !isNumber(r.repetitions) ||
    !(r.error === null || typeof r.error === 'string') ||
    !Array.isArray(r.pages)
  ) {
    return false;
  }
  return (r.pages as unknown[]).every((entry) => {
    if (entry === null || typeof entry !== 'object') return false;
    const p = entry as Record<string, unknown>;
    return (
      typeof p.id === 'string' &&
      typeof p.encoding === 'string' &&
      isNumber(p.width) &&
      isNumber(p.height) &&
      isNumber(p.bytes) &&
      isNumber(p.firstTotalMs) &&
      isTupleOrNull(p.fetchMs) &&
      isTupleOrNull(p.decodeMs) &&
      isTupleOrNull(p.uploadMs) &&
      isTupleOrNull(p.uploadSyncedMs) &&
      isTupleOrNull(p.totalMs) &&
      isTupleOrNull(p.bitmapMs) &&
      isTupleOrNull(p.bitmapUploadMs) &&
      (p.error === null || typeof p.error === 'string')
    );
  });
}

/**
 * Whether a stored value is a record the results page can show (everything the table reads).
 *
 * @param value - The value.
 * @returns `true` for a usable record.
 */
export function isRecord(value: unknown): value is RenderBenchRecord {
  if (value === null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.scenario === 'string' &&
    isNumber(r.index) &&
    typeof r.size === 'string' &&
    typeof r.variant === 'string' &&
    isNumber(r.webGLVersion) &&
    isTuple(r.renderMs) &&
    isTuple(r.syncedMs) &&
    Array.isArray(r.raf) &&
    isNumber(r.twoTickShare) &&
    isNumber(r.drawCalls) &&
    isNumber(r.renderTargetBytes) &&
    isNumber(r.textureBytes) &&
    typeof r.heapMeasured === 'boolean' &&
    isNumber(r.heapDeltaBytes)
  );
}

/**
 * Whether a stored value is a rewind record the results page can show (plan R2 TL-3 — the
 * fields its rewind table reads).
 *
 * @param value - The value.
 * @returns `true` for a usable record.
 */
export function isRewindRecord(value: unknown): value is RewindBenchRecord {
  if (value === null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    r.scenario === 'rewind' &&
    isNumber(r.index) &&
    isNumber(r.startedAt) &&
    isNumber(r.endedAt) &&
    typeof r.buildId === 'string' &&
    isNumber(r.ticks) &&
    isNumber(r.stepsPerSecond) &&
    isNumber(r.worldBuildMs) &&
    isNumber(r.hashMs) &&
    isNumber(r.hashChecks) &&
    isNumber(r.estCapTicks) &&
    typeof r.stage === 'string' &&
    (r.error === null || typeof r.error === 'string')
  );
}

/**
 * Reads a stored state defensively.
 *
 * @param text - The stored JSON, or `null` when nothing is stored.
 * @returns The state, or `null` when nothing usable is stored (no key, bad JSON, another version,
 *   missing fields) — the bench then shows its start page. Records the results page could not show
 *   (a field missing or of the wrong type — {@link isRecord}) are dropped.
 */
export function parseRunState(text: string | null): BenchRunState | null {
  if (text === null || text === '') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (_error) {
    return null;
  }
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const timing = o.timing as Record<string, unknown> | null | undefined;
  if (
    o.version !== BENCH_STATE_VERSION ||
    typeof o.session !== 'string' ||
    !isNumber(o.startedAt) ||
    typeof o.running !== 'boolean' ||
    !isNumber(o.cursor) ||
    !isNumber(o.seq) ||
    !isNumber(o.webGLVersion) ||
    timing === null ||
    typeof timing !== 'object' ||
    !isNumber(timing.warmupMs) ||
    !isNumber(timing.measureMs) ||
    !isNumber(timing.syncMs) ||
    !Array.isArray(o.records) ||
    !Array.isArray(o.sent)
  ) {
    return null;
  }
  const cursor = Math.max(0, Math.min(BENCH_RUN_LENGTH, Math.floor(o.cursor)));
  const records = (o.records as unknown[]).filter(isRecord);
  return {
    version: BENCH_STATE_VERSION,
    session: o.session,
    startedAt: o.startedAt,
    running: o.running && cursor < BENCH_RUN_LENGTH,
    single: o.single === true,
    cursor,
    seq: Math.max(0, Math.floor(o.seq)),
    webGLVersion: o.webGLVersion === 2 ? 2 : 1,
    timing: {
      warmupMs: timing.warmupMs,
      measureMs: timing.measureMs,
      syncMs: timing.syncMs,
      minFrames: isNumber(timing.minFrames) ? timing.minFrames : 0,
    },
    records,
    decode: isDecodeRecord(o.decode) ? o.decode : null,
    rewind: isRewindRecord(o.rewind) ? o.rewind : null,
    sent: (o.sent as unknown[]).filter(isNumber),
    lastError: typeof o.lastError === 'string' ? o.lastError : null,
  };
}

/**
 * Stores a state as JSON.
 *
 * @param state - The state.
 * @returns The text for `localStorage`.
 */
export function serializeRunState(state: BenchRunState): string {
  return JSON.stringify(state);
}

/**
 * Adds a scenario's record and moves the cursor past it.
 *
 * @param state - The state.
 * @param record - The record (replaces an earlier one of the same index).
 * @returns The new state; `running` turns off once the cursor reaches the end of the run (the
 *   decode scenario still follows the last render scenario).
 */
export function recordResult(state: BenchRunState, record: RenderBenchRecord): BenchRunState {
  const records = state.records.filter((other) => other.index !== record.index);
  records.push(record);
  records.sort((a, b) => a.index - b.index);
  const cursor = Math.max(state.cursor, record.index + 1);
  return {
    ...state,
    records,
    sent: state.sent.filter((index) => index !== record.index),
    cursor,
    running: state.running && !state.single && cursor < BENCH_RUN_LENGTH,
    single: false,
    lastError: null,
  };
}

/**
 * Stores the decode scenario's record (plan R1-05 B4) and moves the cursor past it — to the
 * stand-in load (plan R3-04.M4a), which is the run's last page load.
 *
 * @param state - The state.
 * @param record - The record (replaces an earlier one).
 * @returns The new state — the decode scenario done, its record not yet acknowledged.
 */
export function recordDecode(state: BenchRunState, record: DecodeBenchRecord): BenchRunState {
  const cursor = Math.max(state.cursor, DECODE_SCENARIO_INDEX + 1);
  return {
    ...state,
    decode: record,
    sent: state.sent.filter((index) => index !== DECODE_SCENARIO_INDEX),
    cursor,
    running: state.running && !state.single && cursor < BENCH_RUN_LENGTH,
    single: false,
    lastError: null,
  };
}

/**
 * Stores the rewind scenario's record (plan R2 TL-3) and moves the cursor past it — the run is
 * done. The record never reaches the log server (the payload protocol stays what it was); only
 * the results page shows it, so the POST bookkeeping skips it entirely.
 *
 * @param state - The state.
 * @param record - The record (replaces an earlier one).
 * @returns The new state — the rewind scenario done, the run closed by its cursor.
 */
export function recordRewind(state: BenchRunState, record: RewindBenchRecord): BenchRunState {
  const cursor = Math.max(state.cursor, REWIND_SCENARIO_INDEX + 1);
  return {
    ...state,
    rewind: record,
    cursor,
    running: state.running && !state.single && cursor < BENCH_RUN_LENGTH,
    single: false,
    lastError: null,
  };
}

/**
 * Whether the decode record still waits for the log server's acknowledgement.
 *
 * @param state - The state.
 * @returns `true` when there is a decode record the server has not acknowledged.
 */
export function decodeUnsent(state: BenchRunState): boolean {
  return state.decode !== null && state.sent.indexOf(DECODE_SCENARIO_INDEX) < 0;
}

/**
 * Notes that the log server acknowledged some records.
 *
 * @param state - The state.
 * @param indexes - Their scenario indexes.
 * @returns The new state.
 */
export function markSent(state: BenchRunState, indexes: readonly number[]): BenchRunState {
  const sent = state.sent.slice();
  for (const index of indexes) if (sent.indexOf(index) < 0) sent.push(index);
  sent.sort((a, b) => a - b);
  return { ...state, sent };
}

/**
 * The next payload's sequence number, taken.
 *
 * @param state - The state.
 * @returns The new state, whose `seq` is the number to send with.
 */
export function nextSeq(state: BenchRunState): BenchRunState {
  return { ...state, seq: state.seq + 1 };
}

/**
 * The records the log server has not acknowledged yet.
 *
 * @param state - The state.
 * @returns Those records, in matrix order.
 */
export function unsentRecords(state: BenchRunState): RenderBenchRecord[] {
  return state.records.filter((record) => state.sent.indexOf(record.index) < 0);
}

/**
 * Stops the run where it is (Back during a scenario, or an error).
 *
 * @param state - The state.
 * @param error - Why, or `null` for the owner's own Back.
 * @returns The new state (not `running`; the cursor is kept, so the results so far stay).
 */
export function stopRun(state: BenchRunState, error: string | null): BenchRunState {
  return { ...state, running: false, single: false, lastError: error };
}

/**
 * Skips the scenario at the cursor (the campaign mode's guard, `./campaign.ts`: a scenario that
 * crashed or hung the TV more than `MAX_SCENARIO_ATTEMPTS` times is passed over, so the relaunches
 * cannot loop on it forever).
 *
 * @param state - The state.
 * @param reason - Why, stored as `lastError` (e.g. `'skipped after 4 launches'`).
 * @returns The new state, the cursor one past the skipped scenario (no record for it); `running`
 *   while scenarios remain, never `single`.
 */
export function skipScenario(state: BenchRunState, reason: string): BenchRunState {
  const cursor = Math.min(BENCH_RUN_LENGTH, state.cursor + 1);
  return {
    ...state,
    cursor,
    running: cursor < BENCH_RUN_LENGTH,
    single: false,
    lastError: reason,
  };
}

/**
 * Moves a running run's cursor past the scenarios the build skips by design (a build output whose
 * backbuffer is smaller than their frame — `./output.ts`), so none of them is launched.
 *
 * @param state - The state.
 * @param isSkipped - Whether the render scenario at an index is skipped (never asked for the
 *   decode scenario's index).
 * @returns `state` itself when it is not running or the scenario at its cursor runs; else the
 *   state with the cursor on the first scenario at or after it that runs (or the decode scenario).
 *   No record is added and `lastError` is left alone — a planned skip is not an error, so a
 *   campaign's resume never passes over the scenario after it. A **Red** re-run (`single`) of a
 *   skipped scenario stops the run instead, its cursor one past it.
 * @remarks Unlike {@link skipScenario} it never reloads the page: nothing was launched, so the
 *   scenario page goes on to measure the scenario at the new cursor.
 */
export function skipPlannedScenarios(
  state: BenchRunState,
  isSkipped: (index: number) => boolean,
): BenchRunState {
  if (!state.running) return state;
  let cursor = state.cursor;
  while (cursor < DECODE_SCENARIO_INDEX && isSkipped(cursor)) {
    cursor++;
    if (state.single) break;
  }
  if (cursor === state.cursor) return state;
  if (state.single) return { ...state, cursor, running: false, single: false };
  return { ...state, cursor, running: cursor < BENCH_RUN_LENGTH };
}

/**
 * Resumes a stopped run (the campaign mode, `./campaign.ts`): after the owner's Back the scenario
 * at the cursor runs again; after an error (a scenario that threw) that scenario is skipped.
 *
 * @param state - The state (not `running`).
 * @returns The new state, `running` (and not `single`) with the cursor on the scenario to run —
 *   kept when `lastError` is `null`, one further on otherwise. `lastError` is kept, so the results
 *   page still says why a scenario is missing until the next record clears it.
 * @remarks Resuming a run whose cursor is already at {@link BENCH_RUN_LENGTH} leaves it stopped.
 */
export function resumeRun(state: BenchRunState): BenchRunState {
  const cursor = Math.min(
    BENCH_RUN_LENGTH,
    state.lastError !== null ? state.cursor + 1 : state.cursor,
  );
  return { ...state, cursor, running: cursor < BENCH_RUN_LENGTH, single: false };
}

/**
 * Re-runs one scenario (the remote's **Red**): during a run the current one, on the results page
 * the last one measured (after a whole run, the decode scenario).
 *
 * @param state - The state.
 * @returns The new state, `running` with the cursor on the scenario to repeat. During a run the
 *   matrix then carries on; from the results page only that one scenario runs (`single`), and the
 *   run stops again after it.
 */
export function rerunScenario(state: BenchRunState): BenchRunState {
  if (state.running) return { ...state, lastError: null };
  const cursor = Math.max(0, Math.min(state.cursor, BENCH_RUN_LENGTH) - 1);
  return { ...state, running: true, single: true, cursor, lastError: null };
}
