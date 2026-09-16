/**
 * Turns raw statistics into verdicts and display text, and assembles the report payload parts.
 *
 * Pure module.
 *
 * @module summary
 */

import { LONG_HOLD_MS, type ChecklistItem } from './checklist';
import type { EnvInfo } from './envInfo';
import type { FrameSummary, RunningSummary } from './frameStats';
import { fmtHz, fmtMs, padRight, round1, truncate } from './format';
import type { KeyStats, SeenKey } from './keyTracker';
import { ARROW_CODES, KeyCode, type RegisterResult } from './keys';

/** Everything measured, at one point in time. */
export interface ProbeSnapshot {
  /** Key statistics and verdicts from `KeyTracker.getStats()`. */
  keys: KeyStats;
  /** Frame-time summary from `FrameStats.summary()`. */
  frames: FrameSummary;
  /** `performance.now() - event.timeStamp` statistics. */
  dispatch: RunningSummary;
}

/**
 * Compact, human-readable verdicts (also sent to the log server as the payload's `verdicts`).
 *
 * @remarks
 * Numbers are rounded to one decimal (`null` = no data yet). The field names are a de-facto contract with
 * `server/log-server.mjs` (`formatSummary`) and with anyone post-processing the JSONL logs — rename with care.
 */
export interface Verdicts {
  /**
   * Question 1 — can two arrows be held at once? `NO — not delivered` (M3-02b) means the second arrow
   * produced **no event at all** during a long hold: the hardware is single-key, which is not the same as
   * "not tested".
   */
  diagonals: 'YES' | 'NO' | 'NO — not delivered' | 'not tested';
  /** Question 2 — does an arrow stay held when OK is pressed? (`NO — not delivered`: see `diagonals`.) */
  okWhileArrowHeld:
    | 'arrow kept'
    | 'arrow kept (release blip)'
    | 'arrow dropped'
    | 'NO — not delivered'
    | 'not tested';
  /** Question 3 — dominant key-repeat style while holding. */
  repeatStyle: 'clean (repeat flag)' | 'keydown without repeat flag' | 'fake keyup/keydown pairs' | 'not observed';
  /** Average press → first repeat (ms). */
  repeatDelayMs: number | null;
  /** Average time between repeats (ms). */
  repeatIntervalMs: number | null;
  /** Repeat rate (Hz). */
  repeatHz: number | null;
  /** Fake keyup/keydown pairs seen. */
  bounces: number;
  /** Shortest bounce gap (ms). */
  bounceMinGapMs: number | null;
  /** Average bounce gap (ms). */
  bounceAvgGapMs: number | null;
  /** Most keys raw-held at the same time. */
  maxSimultaneous: number;
  /** Longest logical hold (ms, rounded to an integer). */
  longestHoldMs: number;
  /** Name of the key with the longest hold. */
  longestHoldKey: string | null;
  /** Average event dispatch delay (ms). */
  dispatchDelayAvgMs: number | null;
  /** Worst event dispatch delay (ms). */
  dispatchDelayMaxMs: number | null;
  /** Median rAF delta (ms). */
  frameMedianMs: number | null;
  /** 1000 / median (Hz). */
  frameHz: number | null;
  /** 95th-percentile rAF delta (ms). */
  frameP95Ms: number | null;
  /** Largest rAF delta in the window (ms). */
  frameMaxMs: number | null;
  /** Frames above 20 ms since the last reset. */
  hitches: number;
}

/**
 * Derives the verdicts from a snapshot.
 *
 * @param s - measured statistics.
 * @param keyName - maps a key code to its display name (for `longestHoldKey`).
 * @param seenCodes - every key code seen at least once (M3-02b): with a single-key device an
 *   attempted diagonal or OK-while-arrow leaves no event behind, so the verdict "NO — not
 *   delivered" is inferred from which keys were seen at all. Defaults to none, which keeps the
 *   pre-M3-02b "not tested" wording.
 * @returns the verdict record (fresh object).
 */
export function buildVerdicts(
  s: ProbeSnapshot,
  keyName: (code: number) => string,
  seenCodes: readonly number[] = [],
): Verdicts {
  const k = s.keys;
  // M3-02b: a single-key remote delivers nothing while a key is down, so an attempt leaves no event to
  // judge. When a long hold happened, never more than one key was ever down at once and the keys involved
  // were seen at all, the honest verdict is "not delivered" rather than "not tested".
  const singleKey = k.maxSimultaneous === 1 && k.longestHoldMs >= LONG_HOLD_MS;
  const seen = (code: number): boolean => seenCodes.indexOf(code) >= 0;
  let arrows = 0;
  for (const code of ARROW_CODES) if (seen(code)) arrows++;
  const notDelivered = singleKey && arrows >= 2;
  return {
    diagonals:
      k.diagonal.verdict === 'yes'
        ? 'YES'
        : k.diagonal.verdict === 'no'
          ? 'NO'
          : notDelivered
            ? 'NO — not delivered'
            : 'not tested',
    okWhileArrowHeld:
      k.chord.verdict === 'kept'
        ? 'arrow kept'
        : k.chord.verdict === 'blip'
          ? 'arrow kept (release blip)'
          : k.chord.verdict === 'dropped'
            ? 'arrow dropped'
            : singleKey && arrows >= 1 && seen(KeyCode.Enter)
              ? 'NO — not delivered'
              : 'not tested',
    repeatStyle:
      k.repeat.style === 'clean'
        ? 'clean (repeat flag)'
        : k.repeat.style === 'noflag'
          ? 'keydown without repeat flag'
          : k.repeat.style === 'fakepairs'
            ? 'fake keyup/keydown pairs'
            : 'not observed',
    repeatDelayMs: round1(k.repeat.delayAvgMs),
    repeatIntervalMs: round1(k.repeat.intervalAvgMs),
    repeatHz: round1(k.repeat.intervalHz),
    bounces: k.bounce.count,
    bounceMinGapMs: round1(k.bounce.minGapMs),
    bounceAvgGapMs: round1(k.bounce.avgGapMs),
    maxSimultaneous: k.maxSimultaneous,
    longestHoldMs: Math.round(k.longestHoldMs),
    longestHoldKey: k.longestHoldCode === null ? null : keyName(k.longestHoldCode),
    dispatchDelayAvgMs: round1(s.dispatch.avg),
    dispatchDelayMaxMs: round1(s.dispatch.max),
    frameMedianMs: round1(s.frames.medianMs),
    frameHz: round1(s.frames.medianHz),
    frameP95Ms: round1(s.frames.p95Ms),
    frameMaxMs: round1(s.frames.maxMs),
    hitches: s.frames.hitches,
  };
}

/**
 * Lines for the Verdicts & stats panel.
 *
 * @param v - verdicts built from `s` by {@link buildVerdicts}.
 * @param s - the same snapshot (for the raw counters shown next to the verdicts).
 * @returns 12 lines: dotted labels (15 columns) followed by values; continuation lines are indented
 *   under the values.
 *
 * @example
 * ```text
 * Diagonals ..... YES  (2 together, 0 replaced)
 * OK+arrow ...... arrow kept
 *                 1 kept · 0 blip · 0 dropped
 * ```
 */
export function verdictLines(v: Verdicts, s: ProbeSnapshot): string[] {
  const k = s.keys;
  const f = s.frames;
  const lbl = (name: string): string => padRight(name + ' ', 15, '.') + ' ';
  const sub = '                '; // aligns continuation lines under the values
  return [
    lbl('Diagonals') + v.diagonals +
      (k.diagonal.attempts > 0 ? '  (' + k.diagonal.yes + ' together, ' + k.diagonal.replaced + ' replaced)' : ''),
    lbl('OK+arrow') + v.okWhileArrowHeld,
    k.chord.attempts > 0
      ? sub + k.chord.kept + ' kept · ' + k.chord.blip + ' blip · ' + k.chord.dropped + ' dropped'
      : sub + 'hold an arrow, then tap OK',
    lbl('Repeat style') + v.repeatStyle,
    sub + 'flag ' + k.repeat.clean + ' · no-flag ' + k.repeat.noFlag + ' · fake pairs ' + k.repeat.fakePairs,
    lbl('Repeat timing') + 'delay ' + fmtMs(k.repeat.delayAvgMs, 0) + ' · every ' + fmtMs(k.repeat.intervalAvgMs, 1) +
      ' ⇒ ' + fmtHz(k.repeat.intervalHz),
    lbl('Bounces <60ms') + k.bounce.count + ' · min gap ' + fmtMs(k.bounce.minGapMs) + ' · avg ' + fmtMs(k.bounce.avgGapMs),
    lbl('Max held') + k.maxSimultaneous + ' keys · longest ' + fmtMs(k.longestHoldMs, 0) +
      (v.longestHoldKey ? ' (' + v.longestHoldKey + ')' : ''),
    lbl('Dispatch') + 'avg ' + fmtMs(s.dispatch.avg, 2) + ' · max ' + fmtMs(s.dispatch.max, 2) + ' · n=' + s.dispatch.count,
    lbl('Frames') + fmtMs(f.medianMs, 2) + ' ⇒ ' + fmtHz(f.medianHz) + ' · p95 ' + fmtMs(f.p95Ms, 1),
    sub + 'max ' + fmtMs(f.maxMs, 1) + ' · hitches>20ms ' + f.hitches + ' · worst ' + fmtMs(f.worstMs, 1),
    sub + 'pauses ' + f.pauses + ' · frames ' + f.frames,
  ];
}

/**
 * Lines for the seen-keys table, `name(code) d/u/r`, laid out in `columns` columns.
 *
 * @param seen - per-key counters (first-seen order).
 * @param keyName - maps a key code to its display name.
 * @param columns - cells per line (default 2).
 * @param width - cell width in characters (default 34); names are truncated to `width - 14`.
 * @returns the table lines (trailing spaces trimmed), or `(no keys yet)`.
 *
 * @example
 * ```text
 * ArrowRight(39) 12/3/9              Enter(13) 1/1/0
 * ```
 */
export function seenKeyLines(seen: readonly SeenKey[], keyName: (code: number) => string, columns = 2, width = 34): string[] {
  if (seen.length === 0) return ['(no keys yet)'];
  const cells = seen.map((s) =>
    padRight(truncate(keyName(s.code) + '(' + s.code + ')', width - 14) + ' ' + s.downs + '/' + s.ups + '/' + s.repeats, width),
  );
  const lines: string[] = [];
  for (let i = 0; i < cells.length; i += columns) lines.push(cells.slice(i, i + columns).join(' ').replace(/\s+$/, ''));
  return lines;
}

/**
 * Lines describing the key-registration results (Registered keys panel).
 *
 * @param supportedCount - size of the `getSupportedKeys()` list.
 * @param results - one entry per `registerKey()` call.
 * @param tizenPresent - whether the app runs on Tizen.
 * @returns a summary line, the `ok:` list and one `FAIL name(code): error` line per failure; a single
 *   placeholder line in a desktop browser.
 */
export function registerLines(supportedCount: number, results: readonly RegisterResult[], tizenPresent: boolean): string[] {
  if (!tizenPresent) return ['(no tizen.tvinputdevice — desktop browser)'];
  const ok = results.filter((r) => r.ok).map((r) => r.name);
  const failed = results.filter((r) => !r.ok);
  const lines = ['supported ' + supportedCount + ' · registered ' + ok.length + ' · failed ' + failed.length + ' (Exit skipped)'];
  if (ok.length > 0) lines.push('ok: ' + ok.join(' '));
  for (const r of failed) lines.push('FAIL ' + r.name + (r.code !== null ? '(' + r.code + ')' : '') + ': ' + (r.error ?? '?'));
  return lines;
}

/**
 * Lines for the checklist panel.
 *
 * @param items - checklist rows in display order.
 * @returns `[x] label` / `[ ] label` lines.
 */
export function checklistLines(items: readonly ChecklistItem[]): string[] {
  return items.map((it) => (it.done ? '[x] ' : '[ ] ') + it.label);
}

/** Inputs to {@link buildReportParts}. */
export interface ReportInputs {
  /** Environment facts, or null while not collected yet. */
  env: EnvInfo | null;
  /** Measured statistics. */
  snapshot: ProbeSnapshot;
  /** Maps a key code to its display name. */
  keyName: (code: number) => string;
  /** Per-key counters. */
  seen: readonly SeenKey[];
  /** Key-registration results. */
  registered: readonly RegisterResult[];
  /** Size of the `getSupportedKeys()` list. */
  supportedKeys: number;
  /** Checklist rows. */
  checklist: readonly ChecklistItem[];
  /** Gamepad summary (see `padsForReport` in `gamepad.ts`); passed through unchanged. */
  gamepads: unknown;
}

/**
 * Assembles the `env`, `verdicts` and `stats` parts of a report payload.
 *
 * @param i - everything the report needs.
 * @returns `{ env, verdicts, stats }` — `stats` holds the full key / frame / dispatch statistics, named seen
 *   keys, registration results, checklist state (`{id, done}`) and gamepads.
 */
export function buildReportParts(i: ReportInputs): { env: EnvInfo | null; verdicts: Verdicts; stats: unknown } {
  return {
    env: i.env,
    verdicts: buildVerdicts(
      i.snapshot,
      i.keyName,
      i.seen.map((entry) => entry.code),
    ),
    stats: {
      keys: i.snapshot.keys,
      frames: i.snapshot.frames,
      dispatch: i.snapshot.dispatch,
      seenKeys: i.seen.map((s) => ({ name: i.keyName(s.code), code: s.code, downs: s.downs, ups: s.ups, repeats: s.repeats })),
      supportedKeys: i.supportedKeys,
      registered: i.registered,
      checklist: i.checklist.map((c) => ({ id: c.id, done: c.done })),
      gamepads: i.gamepads,
    },
  };
}
