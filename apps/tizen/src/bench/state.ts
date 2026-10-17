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
 * @module
 */
import type { RenderBenchRecord } from '@shmup/shell';
import { BENCH_SCENARIOS, type BenchTiming } from './matrix.js';

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
  /** Index of the next scenario to run (`BENCH_SCENARIOS.length` = done). */
  readonly cursor: number;
  /** Sequence number of the last payload sent to the log server. */
  readonly seq: number;
  /** The WebGL version the run asks for. */
  readonly webGLVersion: number;
  /** Phase timing of the run. */
  readonly timing: BenchTiming;
  /** The results so far, one per scenario index (a re-run replaces its record). */
  readonly records: readonly RenderBenchRecord[];
  /** Scenario indexes whose record the log server has acknowledged. */
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
  const cursor = Math.max(0, Math.min(BENCH_SCENARIOS.length, Math.floor(o.cursor)));
  const records = (o.records as unknown[]).filter(isRecord);
  return {
    version: BENCH_STATE_VERSION,
    session: o.session,
    startedAt: o.startedAt,
    running: o.running && cursor < BENCH_SCENARIOS.length,
    single: o.single === true,
    cursor,
    seq: Math.max(0, Math.floor(o.seq)),
    webGLVersion: o.webGLVersion === 2 ? 2 : 1,
    timing: { warmupMs: timing.warmupMs, measureMs: timing.measureMs, syncMs: timing.syncMs },
    records,
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
 * @returns The new state; `running` turns off once the cursor reaches the end of the matrix.
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
    running: state.running && !state.single && cursor < BENCH_SCENARIOS.length,
    single: false,
    lastError: null,
  };
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
 * Re-runs one scenario (the remote's **Red**): during a run the current one, on the results page
 * the last one of the matrix.
 *
 * @param state - The state.
 * @returns The new state, `running` with the cursor on the scenario to repeat. During a run the
 *   matrix then carries on; from the results page only that one scenario runs (`single`), and the
 *   run stops again after it.
 */
export function rerunScenario(state: BenchRunState): BenchRunState {
  if (state.running) return { ...state, lastError: null };
  const cursor = Math.max(0, Math.min(state.cursor, BENCH_SCENARIOS.length) - 1);
  return { ...state, running: true, single: true, cursor, lastError: null };
}
