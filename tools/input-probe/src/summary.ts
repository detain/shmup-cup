/**
 * Turns raw statistics into verdicts and display text, and assembles the report payload parts.
 *
 * Pure module.
 *
 * @module summary
 */

import type { ChecklistItem } from './checklist';
import type { EnvInfo } from './envInfo';
import type { FrameSummary, RunningSummary } from './frameStats';
import { fmtHz, fmtMs, padRight, round1, truncate } from './format';
import type { KeyStats, SeenKey } from './keyTracker';
import type { RegisterResult } from './keys';

/** Everything measured, at one point in time. */
export interface ProbeSnapshot {
  keys: KeyStats;
  frames: FrameSummary;
  /** `performance.now() - event.timeStamp` statistics. */
  dispatch: RunningSummary;
}

/** Compact, human-readable verdicts (also sent to the log server). */
export interface Verdicts {
  diagonals: 'YES' | 'NO' | 'not tested';
  okWhileArrowHeld: 'arrow kept' | 'arrow kept (release blip)' | 'arrow dropped' | 'not tested';
  repeatStyle: 'clean (repeat flag)' | 'keydown without repeat flag' | 'fake keyup/keydown pairs' | 'not observed';
  repeatDelayMs: number | null;
  repeatIntervalMs: number | null;
  repeatHz: number | null;
  bounces: number;
  bounceMinGapMs: number | null;
  bounceAvgGapMs: number | null;
  maxSimultaneous: number;
  longestHoldMs: number;
  longestHoldKey: string | null;
  dispatchDelayAvgMs: number | null;
  dispatchDelayMaxMs: number | null;
  frameMedianMs: number | null;
  frameHz: number | null;
  frameP95Ms: number | null;
  frameMaxMs: number | null;
  hitches: number;
}

/** Derives the verdicts from a snapshot. */
export function buildVerdicts(s: ProbeSnapshot, keyName: (code: number) => string): Verdicts {
  const k = s.keys;
  return {
    diagonals: k.diagonal.verdict === 'yes' ? 'YES' : k.diagonal.verdict === 'no' ? 'NO' : 'not tested',
    okWhileArrowHeld:
      k.chord.verdict === 'kept'
        ? 'arrow kept'
        : k.chord.verdict === 'blip'
          ? 'arrow kept (release blip)'
          : k.chord.verdict === 'dropped'
            ? 'arrow dropped'
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

/** Lines for the Verdicts & stats panel. */
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

/** Lines for the seen-keys table, `name(code) d/u/r`, laid out in `columns` columns. */
export function seenKeyLines(seen: readonly SeenKey[], keyName: (code: number) => string, columns = 2, width = 34): string[] {
  if (seen.length === 0) return ['(no keys yet)'];
  const cells = seen.map((s) =>
    padRight(truncate(keyName(s.code) + '(' + s.code + ')', width - 14) + ' ' + s.downs + '/' + s.ups + '/' + s.repeats, width),
  );
  const lines: string[] = [];
  for (let i = 0; i < cells.length; i += columns) lines.push(cells.slice(i, i + columns).join(' ').replace(/\s+$/, ''));
  return lines;
}

/** Lines describing the key-registration results. */
export function registerLines(supportedCount: number, results: readonly RegisterResult[], tizenPresent: boolean): string[] {
  if (!tizenPresent) return ['(no tizen.tvinputdevice — desktop browser)'];
  const ok = results.filter((r) => r.ok).map((r) => r.name);
  const failed = results.filter((r) => !r.ok);
  const lines = ['supported ' + supportedCount + ' · registered ' + ok.length + ' · failed ' + failed.length + ' (Exit skipped)'];
  if (ok.length > 0) lines.push('ok: ' + ok.join(' '));
  for (const r of failed) lines.push('FAIL ' + r.name + (r.code !== null ? '(' + r.code + ')' : '') + ': ' + (r.error ?? '?'));
  return lines;
}

/** Lines for the checklist panel. */
export function checklistLines(items: readonly ChecklistItem[]): string[] {
  return items.map((it) => (it.done ? '[x] ' : '[ ] ') + it.label);
}

/** Inputs to {@link buildReportParts}. */
export interface ReportInputs {
  env: EnvInfo | null;
  snapshot: ProbeSnapshot;
  keyName: (code: number) => string;
  seen: readonly SeenKey[];
  registered: readonly RegisterResult[];
  supportedKeys: number;
  checklist: readonly ChecklistItem[];
  gamepads: unknown;
}

/** Assembles the `env`, `verdicts` and `stats` parts of a report payload. */
export function buildReportParts(i: ReportInputs): { env: EnvInfo | null; verdicts: Verdicts; stats: unknown } {
  return {
    env: i.env,
    verdicts: buildVerdicts(i.snapshot, i.keyName),
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
