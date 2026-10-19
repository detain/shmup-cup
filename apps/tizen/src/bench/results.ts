/**
 * The TV render bench's **on-screen results table** (plan R0-02 — part of the `bench` module, see
 * `./index.ts`): one fixed-width line per scenario in the bitmap font, so a photograph of the TV is
 * enough to keep a run, and the relative columns — against the same variant at 384×216 in the same
 * session — are the ones plan §13 decides by. A knob row (`640x360-busy-stretch`) is read against
 * its own plain row instead (`640x360-busy`), so its relative columns say what the knob cost.
 *
 * **Paged.** The resolution sweep's 172 rows do not fit one screen, so {@link benchPageLines}
 * returns one page — the head, then as many rows as fit — and **Left / Right** turn the page; the
 * decode table is the last page. (R0-03's 18-row table already lost the end of its last row on the
 * TV: the page's text overran the renderer's 1024-glyph UI pool, which the results page now sizes
 * for a whole page — `run.ts`.)
 *
 * Below the table, once the run's `decode` scenario has run (plan R1-05 B4 — `./decode.ts`), a
 * second table: per page its size, encoding and file bytes, and the median / p95 of each stage from
 * file to GPU ({@link formatDecodeTable}).
 *
 * Pure string building plus one draw-list writer; the bench draws the lines on its results page
 * (`run.ts`), unit-tested against fake records in `apps/tizen/test/bench/`.
 *
 * @module
 */
import type { DrawList } from '@shmup/core';
import { RAF_BUCKET_EDGES_MS } from '@shmup/render-pixi';
import type { DecodeBenchPage, DecodeBenchRecord, RenderBenchRecord } from '@shmup/shell';
import { DECODE_SCENARIO_INDEX } from './decode.js';
import { BENCH_SIZES, findBenchScenario, type BenchTiming } from './matrix.js';
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
 * The record a row is read against: the same variant and WebGL version at 384×216 — or, for a knob
 * row, the same size and variant without the knob (so the row says what the knob cost).
 *
 * @param record - The row's record.
 * @param records - Every record of the session.
 * @returns The baseline record, or `null` when the session has none yet.
 */
export function baselineOf(
  record: RenderBenchRecord,
  records: readonly RenderBenchRecord[],
): RenderBenchRecord | null {
  const knobRow = findBenchScenario(record.scenario);
  const plain = knobRow !== null && knobRow.knob !== null ? knobRow.variant.id : null;
  const size = plain === null ? BASELINE_SIZE : record.size;
  const variant = plain === null ? record.variant : plain;
  for (let i = 0; i < records.length; i++) {
    const other = records[i];
    if (
      other.size === size &&
      other.variant === variant &&
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
  ['SCENARIO', 25],
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
 * percentage points (plan §13's "+2 points" rule) — a knob row's against its plain row —,
 * `RAF21%` the frames that came 21 ms or later,
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

/** The decode table's columns: header and width (every width includes the leading space). */
const DECODE_COLUMNS: readonly (readonly [string, number])[] = [
  ['PAGE', 10],
  ['SIZE', 10],
  ['ENC', 5],
  ['FILE_KB', 8],
  ['FETCH50', 8],
  ['DEC50', 7],
  ['DEC95', 7],
  ['UPL50', 7],
  ['UPL95', 7],
  ['TOT50', 7],
  ['TOT95', 7],
  ['FIRST', 7],
  ['BMP50', 7],
  ['BMPUP', 7],
];

/**
 * A row of fixed-width cells: the first left-aligned, the others right-aligned.
 *
 * @param cells - The cells.
 * @param columns - Column headers and widths.
 * @returns The line.
 */
function fixedRow(
  cells: readonly string[],
  columns: readonly (readonly [string, number])[],
): string {
  let out = '';
  for (let i = 0; i < columns.length; i++) {
    const width = columns[i][1];
    const text = cells[i].length > width ? cells[i].slice(0, width) : cells[i];
    out += i === 0 ? text + ' '.repeat(Math.max(0, width - text.length)) : cell(text, width);
  }
  return out;
}

/**
 * The decode table's header line (plan R1-05 B4).
 *
 * @returns The header, column for column with {@link formatDecodeRow}.
 */
export function formatDecodeHeader(): string {
  return fixedRow(
    DECODE_COLUMNS.map((column) => column[0]),
    DECODE_COLUMNS,
  );
}

/**
 * One page's line of the decode table.
 *
 * @remarks
 * `FETCH50` is the XHR's median, `DEC50` / `DEC95` the image decode's, `UPL50` / `UPL95` the
 * upload's with `gl.finish()`, `TOT50` / `TOT95` fetch + decode + upload per repetition, `FIRST`
 * the first repetition's total, `BMP50` / `BMPUP` the medians of the `createImageBitmap` decode and
 * of its upload.
 * A stage that was not measured reads `-`.
 *
 * @param page - The page's figures.
 * @returns The line.
 */
export function formatDecodeRow(page: DecodeBenchPage): string {
  /**
   * A median or p95 cell.
   *
   * @param tuple - `[min, p50, p95, max]`, or `null`.
   * @param at - 1 for the median, 2 for the p95.
   * @returns The cell.
   */
  const ms = (tuple: readonly number[] | null, at: number): string =>
    tuple === null ? '-' : tuple[at].toFixed(1);
  return fixedRow(
    [
      page.id,
      `${page.width}x${page.height}`,
      page.encoding === 'png8' ? 'PNG8' : page.encoding === 'rgba' ? 'RGBA' : '?',
      String(Math.round(page.bytes / 1024)),
      ms(page.fetchMs, 1),
      ms(page.decodeMs, 1),
      ms(page.decodeMs, 2),
      ms(page.uploadSyncedMs, 1),
      ms(page.uploadSyncedMs, 2),
      ms(page.totalMs, 1),
      ms(page.totalMs, 2),
      page.totalMs === null ? '-' : page.firstTotalMs.toFixed(1),
      ms(page.bitmapMs, 1),
      ms(page.bitmapUploadMs, 1),
    ],
    DECODE_COLUMNS,
  );
}

/**
 * The decode table: a title, the header, one line per page, and the scenario's or a page's error.
 *
 * @param record - The decode scenario's record.
 * @returns The lines (text and colour).
 *
 * @example
 * ```ts
 * formatDecodeTable(state.decode); // → [{ text: 'DECODE (R1-05) 8 reps GL1 …' }, header, rows…]
 * ```
 */
export function formatDecodeTable(record: DecodeBenchRecord): BenchLine[] {
  const lines: BenchLine[] = [
    {
      text:
        `DECODE (R1-05) ${record.repetitions} reps GL${record.webGLVersion}  file -> GPU ms: ` +
        'XHR fetch, Image decode, upload + gl.finish',
      color: NOTE_COLOR,
    },
    { text: formatDecodeHeader(), color: HEADER_COLOR },
  ];
  for (let i = 0; i < record.pages.length; i++) {
    lines.push({ text: formatDecodeRow(record.pages[i]), color: ROW_COLOR });
  }
  if (record.error !== null) {
    lines.push({ text: `ERROR decode: ${record.error}`, color: ERROR_COLOR });
  }
  for (let i = 0; i < record.pages.length; i++) {
    const page = record.pages[i];
    if (page.error !== null) {
      lines.push({ text: `NOTE ${page.id}: ${page.error}`, color: ERROR_COLOR });
    }
  }
  return lines;
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
  /** The page to show, from 0 (clamped to the pages there are; default 0). */
  readonly page?: number;
  /** Lines that fit the screen (default: no limit — one page holds everything). */
  readonly maxLines?: number;
}

/**
 * How many pages {@link benchPageLines} splits a state into.
 *
 * @param input - What to show (`page` is ignored).
 * @returns At least 1.
 */
export function benchResultPages(input: BenchPageInput): number {
  return benchPage(input).pages;
}

/**
 * The results page's lines: title, the keys, the log server, the run's summary, one page of the
 * table (or, on the last page, the decode table) and the run's last error.
 *
 * @param input - What to show.
 * @returns The lines, top to bottom — never more than `input.maxLines`.
 *
 * @example
 * ```ts
 * benchPageLines({ ...input, page: 2, maxLines: 35 }); // the head, then rows 2·n … 3·n − 1
 * ```
 */
export function benchPageLines(input: BenchPageInput): BenchLine[] {
  return benchPage(input).lines;
}

/**
 * Lays out one page (see {@link benchPageLines}).
 *
 * @param input - What to show.
 * @returns The page's lines and how many pages there are.
 */
function benchPage(input: BenchPageInput): { lines: BenchLine[]; pages: number } {
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
        `ENTER run the matrix: ${input.scenarios} scenarios + decode, ~${minutes} min ` +
        `(${seconds(t.warmupMs)} s warm-up, ${seconds(t.measureMs)} s measured, ` +
        `${seconds(t.syncMs)} s synced each)`,
      color: NOTE_COLOR,
    },
    {
      text: 'LEFT/RIGHT page    RED re-run the last scenario    BACK exit (stops a run)',
      color: NOTE_COLOR,
    },
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
  const error: BenchLine | null =
    state !== null && state.lastError !== null
      ? { text: `ERROR ${state.lastError}`, color: ERROR_COLOR }
      : null;
  if (state === null || (state.records.length === 0 && state.decode === null)) {
    lines.push({ text: 'No results yet.', color: ROW_COLOR });
    if (error !== null) lines.push(error);
    return { lines, pages: 1 };
  }
  let sent = 0;
  for (let i = 0; i < state.records.length; i++) {
    if (state.sent.indexOf(state.records[i].index) >= 0) sent++;
  }
  const decodeSent = state.sent.indexOf(DECODE_SCENARIO_INDEX) >= 0;
  const table = formatResultsTable(state.records);
  const rows = table.length - 1;
  const decode = state.decode === null ? null : formatDecodeTable(state.decode);
  // Without a line limit one page holds everything: the table, then the decode table below it.
  const unlimited = input.maxLines === undefined;
  // Room for the rows on one page: the head, the RUN line, the table's header and the error line.
  const room = unlimited
    ? Math.max(1, rows)
    : Math.max(1, (input.maxLines ?? 0) - lines.length - 3);
  const tablePages = rows === 0 ? 0 : Math.ceil(rows / room);
  const pages = unlimited ? 1 : Math.max(1, tablePages + (decode === null ? 0 : 1));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(input.page ?? 0)));
  lines.push({
    text:
      `RUN ${state.session}  ${state.records.length}/${input.scenarios} measured  ` +
      `sent ${sent}/${state.records.length}` +
      (state.decode === null ? '' : decodeSent ? '  decode sent' : '  decode not sent') +
      (state.running ? '  (still running)' : '') +
      `  PAGE ${page + 1}/${pages}`,
    color: NOTE_COLOR,
  });
  if (page < tablePages) {
    lines.push({ text: table[0], color: HEADER_COLOR });
    const first = 1 + page * room;
    const last = Math.min(table.length, first + room);
    for (let i = first; i < last; i++) lines.push({ text: table[i], color: ROW_COLOR });
  }
  if (decode !== null && (unlimited || page >= tablePages)) {
    for (let i = 0; i < decode.length; i++) lines.push(decode[i]);
  }
  if (error !== null) lines.push(error);
  if (input.maxLines !== undefined && lines.length > input.maxLines) {
    lines.length = Math.max(0, input.maxLines);
  }
  return { lines, pages };
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
