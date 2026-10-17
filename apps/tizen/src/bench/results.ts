/**
 * The TV render bench's **on-screen results table** (plan R0-02 — part of the `bench` module, see
 * `./index.ts`): one fixed-width line per scenario in the bitmap font, so a photograph of the TV is
 * enough to keep a run, and the relative columns — against the same variant at 384×216 in the same
 * session — are the ones plan §13 decides by.
 *
 * Pure string building plus one draw-list writer; the bench draws the lines on its results page
 * (`run.ts`), unit-tested against fake records in `apps/tizen/test/bench/`.
 *
 * @module
 */
import type { DrawList } from '@shmup/core';
import { RAF_BUCKET_EDGES_MS } from '@shmup/render-pixi';
import type { RenderBenchRecord } from '@shmup/shell';
import { BENCH_SIZES, type BenchTiming } from './matrix.js';
import type { BenchRunState } from './state.js';

/** One line of a bench page and its colour. */
export interface BenchLine {
  /** The text (ASCII — the bitmap font's glyphs). */
  readonly text: string;
  /** Tint, 0xRRGGBB. */
  readonly color: number;
}

/** Colour of a table's header line. */
export const HEADER_COLOR = 0xffd34d;

/** Colour of a result row. */
export const ROW_COLOR = 0xffffff;

/** Colour of a status / help line. */
export const NOTE_COLOR = 0x9fd8ff;

/** Colour of an error line. */
export const ERROR_COLOR = 0xff6b6b;

/** First rAF bucket of the frames that came 21 ms or later (`RAF_BUCKET_EDGES_MS`). */
const LATE_BUCKET = RAF_BUCKET_EDGES_MS.indexOf(21) + 1;

/** The baseline frame: v1's 384×216 (the first of `BENCH_SIZES`). */
const BASELINE_SIZE = BENCH_SIZES[0].id;

/**
 * The record a row is read against: the same variant and WebGL version at 384×216.
 *
 * @param record - The row's record.
 * @param records - Every record of the session.
 * @returns The baseline record, or `null` when the session has none yet.
 */
export function baselineOf(
  record: RenderBenchRecord,
  records: readonly RenderBenchRecord[],
): RenderBenchRecord | null {
  for (let i = 0; i < records.length; i++) {
    const other = records[i];
    if (
      other.size === BASELINE_SIZE &&
      other.variant === record.variant &&
      other.webGLVersion === record.webGLVersion
    ) {
      return other;
    }
  }
  return null;
}

/**
 * Share of the free-running frames that came 21 ms or later.
 *
 * @param record - The record.
 * @returns 0 … 1.
 */
export function lateShare(record: RenderBenchRecord): number {
  let total = 0;
  let late = 0;
  for (let i = 0; i < record.raf.length; i++) {
    total += record.raf[i];
    if (i >= LATE_BUCKET) late += record.raf[i];
  }
  return total === 0 ? 0 : late / total;
}

/**
 * A number right-aligned in a column.
 *
 * @param text - The cell.
 * @param width - Column width (the cell's leading spaces included).
 * @returns The padded cell.
 */
function cell(text: string, width: number): string {
  let out = text;
  while (out.length < width) out = ' ' + out;
  return out;
}

/**
 * A signed figure (`+1.2`, `-0.4`, `0.0`).
 *
 * @param value - The value.
 * @param digits - Decimals.
 * @returns The text.
 */
function signed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return value > 0 ? '+' + text : text;
}

/** The table's columns: header and width (every width includes the column's leading space). */
const COLUMNS: readonly (readonly [string, number])[] = [
  ['SCENARIO', 17],
  ['GL', 3],
  ['REND95', 7],
  ['SYNC50', 7],
  ['SYNC95', 7],
  ['xBASE', 6],
  ['2TICK%', 7],
  ['D2T', 6],
  ['RAF21%', 7],
  ['DRAW', 5],
  ['RT_KB', 7],
  ['TEX_KB', 7],
  ['HEAPKB', 8],
];

/**
 * The table's header line.
 *
 * @returns The header, column for column with {@link formatResultRow}.
 */
export function formatResultsHeader(): string {
  let out = '';
  for (let i = 0; i < COLUMNS.length; i++) {
    const [header, width] = COLUMNS[i];
    out += i === 0 ? header + ' '.repeat(Math.max(0, width - header.length)) : cell(header, width);
  }
  return out;
}

/**
 * One scenario's line of the table.
 *
 * @remarks
 * `REND95` is the p95 of the timed render (CPU), `SYNC50` / `SYNC95` the synced pass's (render +
 * `gl.finish()`), `xBASE` the synced p95 over the baseline's, `2TICK%` the share of frames the
 * vsync-locked loop gave two ticks or more and `D2T` its difference from the baseline in
 * percentage points (plan §13's "+2 points" rule), `RAF21%` the frames that came 21 ms or later,
 * then the draw calls, pooled render-target KB, atlas texture KB and the heap delta. A cell without
 * a baseline (the baseline row itself shows `1.00x` / `0.0`) or a heap reading reads `-`.
 *
 * @param record - The record.
 * @param baseline - Its baseline ({@link baselineOf}), or `null`.
 * @returns The line.
 */
export function formatResultRow(
  record: RenderBenchRecord,
  baseline: RenderBenchRecord | null,
): string {
  const label = `${record.size} ${record.variant}`;
  const ratio =
    baseline === null || !(baseline.syncedMs[2] > 0)
      ? '-'
      : (record.syncedMs[2] / baseline.syncedMs[2]).toFixed(2) + 'x';
  const delta =
    baseline === null ? '-' : signed((record.twoTickShare - baseline.twoTickShare) * 100, 1);
  const heap = record.heapMeasured ? signed(Math.round(record.heapDeltaBytes / 1024), 0) : '-';
  const cells = [
    label.length > COLUMNS[0][1] ? label.slice(0, COLUMNS[0][1]) : label,
    String(record.webGLVersion),
    record.renderMs[2].toFixed(2),
    record.syncedMs[1].toFixed(2),
    record.syncedMs[2].toFixed(2),
    ratio,
    (record.twoTickShare * 100).toFixed(1) + '%',
    delta,
    (lateShare(record) * 100).toFixed(1) + '%',
    String(record.drawCalls),
    String(Math.round(record.renderTargetBytes / 1024)),
    String(Math.round(record.textureBytes / 1024)),
    heap,
  ];
  let out = '';
  for (let i = 0; i < COLUMNS.length; i++) {
    const width = COLUMNS[i][1];
    out +=
      i === 0 ? cells[i] + ' '.repeat(Math.max(0, width - cells[i].length)) : cell(cells[i], width);
  }
  return out;
}

/**
 * The whole table: the header and one line per record, in matrix order.
 *
 * @param records - The session's records (any order).
 * @returns The lines.
 *
 * @example
 * ```ts
 * formatResultsTable(state.records); // → ['SCENARIO … HEAPKB', '384x216 busy …', …]
 * ```
 */
export function formatResultsTable(records: readonly RenderBenchRecord[]): string[] {
  const sorted = records.slice().sort((a, b) => a.index - b.index);
  const out = [formatResultsHeader()];
  for (let i = 0; i < sorted.length; i++) {
    out.push(formatResultRow(sorted[i], baselineOf(sorted[i], sorted)));
  }
  return out;
}

/** What the results page says (see {@link benchPageLines}). */
export interface BenchPageInput {
  /** The stored run, or `null` before the first one. */
  readonly state: BenchRunState | null;
  /** The bundle's build id. */
  readonly buildId: string;
  /** The host's name. */
  readonly host: string;
  /** The WebGL version the next run would ask for. */
  readonly webGLVersion: number;
  /** The display, e.g. `'1920x1080'`. */
  readonly display: string;
  /** The log server's POST URL, or `null` when the build has none. */
  readonly endpoint: string | null;
  /** A status for the log line (`''` for none). */
  readonly status: string;
  /** Scenarios in the matrix. */
  readonly scenarios: number;
  /** The phase timing of a TV run. */
  readonly timing: BenchTiming;
}

/**
 * The results page's lines: title, the keys, the log server, the run's summary, the table and
 * the run's last error.
 *
 * @param input - What to show.
 * @returns The lines, top to bottom.
 */
export function benchPageLines(input: BenchPageInput): BenchLine[] {
  const t = input.timing;
  const seconds = (ms: number): string => String(Math.round(ms / 1000));
  const minutes = Math.round(
    (input.scenarios * (t.warmupMs + t.measureMs + t.syncMs + 2000)) / 60000,
  );
  const lines: BenchLine[] = [
    {
      text:
        `SHMUP CUP TV RENDER BENCH (R0-02)  build ${input.buildId}  host ${input.host}  ` +
        `GL ${input.webGLVersion}  display ${input.display}`,
      color: HEADER_COLOR,
    },
    {
      text:
        `ENTER run the matrix: ${input.scenarios} scenarios, ~${minutes} min ` +
        `(${seconds(t.warmupMs)} s warm-up, ${seconds(t.measureMs)} s measured, ` +
        `${seconds(t.syncMs)} s synced each)`,
      color: NOTE_COLOR,
    },
    { text: 'RED re-run the last scenario    BACK exit', color: NOTE_COLOR },
    {
      text:
        'LOG ' +
        (input.endpoint === null ? 'off (build with VITE_REPORT_URL)' : input.endpoint) +
        (input.status === '' ? '' : `  ${input.status}`),
      color: NOTE_COLOR,
    },
    { text: '', color: NOTE_COLOR },
  ];
  const state = input.state;
  if (state === null || state.records.length === 0) {
    lines.push({ text: 'No results yet.', color: ROW_COLOR });
  } else {
    lines.push({
      text:
        `RUN ${state.session}  ${state.records.length}/${input.scenarios} measured  ` +
        `sent ${state.sent.length}/${state.records.length}` +
        (state.running ? '  (still running)' : ''),
      color: NOTE_COLOR,
    });
    const table = formatResultsTable(state.records);
    for (let i = 0; i < table.length; i++) {
      lines.push({ text: table[i], color: i === 0 ? HEADER_COLOR : ROW_COLOR });
    }
  }
  if (state !== null && state.lastError !== null) {
    lines.push({ text: `ERROR ${state.lastError}`, color: ERROR_COLOR });
  }
  return lines;
}

/**
 * Draws lines of text into a draw list, one string slot per line (a cold path — the bench calls it
 * when its page changes, never per frame).
 *
 * @param list - The list (cleared first).
 * @param lines - The lines; those beyond the list's string slots are left out.
 * @param x - Left edge.
 * @param y - Top of the first line.
 * @param lineHeight - Pixels from one line to the next.
 * @returns Lines drawn.
 */
export function drawBenchLines(
  list: DrawList,
  lines: readonly BenchLine[],
  x: number,
  y: number,
  lineHeight: number,
): number {
  list.clear();
  const count = Math.min(lines.length, list.stringCapacity);
  for (let i = 0; i < count; i++) {
    list.setString(i, lines[i].text);
    list.text(i, x, y + i * lineHeight, lines[i].color);
  }
  return count;
}
