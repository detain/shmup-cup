#!/usr/bin/env node
/**
 * Turns a TV render-bench session (plan R0-02 — `pnpm bench:tv`, collected by `npm run log-server`) into the
 * tables of `docs/dev/input-probe-results.md` §12 "Resolution benchmark" — **relative to the session's own
 * 384×216 rows**.
 *
 * Why relative: the M7's `requestAnimationFrame` already shows a p95 of ~30 ms with nothing running at all
 * (`input-probe-results.md` §8), so an absolute frame time says more about the panel than about the frame.
 * Each scenario is therefore printed next to the same variant at 384×216 measured minutes earlier on the same
 * set: the synced render's p95 as a ratio, the share of frames the vsync-locked loop needed two ticks for as a
 * difference in percentage points. Plan §13's decision rules are applied to the 640×360 rows (and the 960×540
 * note) at the end.
 *
 * Each JSONL line is one payload the bench POSTed: `{kind:'render-bench', session, seq, sentAt, env, results,
 * done}` plus the server's `receivedAt` / `from`. `results` holds that scenario's record — the shape is
 * `RenderBenchRecord` in `packages/shell/src/telemetry/index.ts` — and the end of a run re-sends the records
 * the server had not acknowledged, so the **latest record per scenario and WebGL version wins** (a **Red**
 * re-run on the TV replaces its scenario's row the same way).
 *
 * Usage (from tools/input-probe/):
 *   node results/analyze-bench.mjs logs/rb-<session>.jsonl [more sessions …] [--records]
 *
 *   several sessions   printed one after the other; a WebGL 1 and a WebGL 2 session of the same set are
 *                      also compared scenario by scenario (§13's "WebGL 2 clearly better" rule)
 *   --records          also list every record in full (JSON)
 *
 * Zero dependencies; prints Markdown.
 *
 * @module results/analyze-bench
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The baseline frame: v1's internal size. */
export const BASELINE_SIZE = '384x216';

/** The v2 frame the plan decides by. */
export const V2_SIZE = '640x360';

/** The "hi-bit" frame recorded for after v2. */
export const HI_BIT_SIZE = '960x540';

/** The sizes in table order, with their density and what they stand for. */
const SIZES = [
  [BASELINE_SIZE, 1, 'the baseline (v1 as it ships)'],
  [V2_SIZE, 1.5, 'the v2 frame and density'],
  [HI_BIT_SIZE, 2.25, 'the same field of view at 1.5× the density (for the record)'],
];

/** First rAF bucket (of `RAF_BUCKET_EDGES_MS` 12/15/17/19/21/25/33) of a frame 21 ms or later. */
const LATE_BUCKET = 5;

/** §13: synced render p95 (ms) at or under which 640×360 proceeds as planned. */
export const SYNC_OK_MS = 8;

/** §13: synced render p95 (ms) up to which the TV profile is the answer. */
export const SYNC_TV_PROFILE_MS = 12;

/** §13: two-tick difference (percentage points) up to which 640×360 proceeds as planned. */
export const TWO_TICK_OK_POINTS = 2;

/** §13: two-tick difference (percentage points) up to which the TV profile is the answer. */
export const TWO_TICK_TV_PROFILE_POINTS = 10;

/** §13: WebGL 2's synced render must be at least this much lower to count as "clearly better". */
export const WEBGL2_GAIN = 0.1;

/**
 * Reads a session's payloads and keeps the latest record per scenario and WebGL version.
 *
 * @param {string} file - Path to the `<session>.jsonl` the log server wrote.
 * @returns {{payloads: any[], records: any[]}} the payloads in arrival order, and the records in matrix order.
 */
export function readBenchSession(file) {
  const payloads = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
    .filter((p) => p !== null && typeof p === 'object');
  const latest = new Map();
  for (const p of payloads) {
    for (const r of Array.isArray(p.results) ? p.results : []) {
      if (r === null || typeof r !== 'object' || typeof r.scenario !== 'string') continue;
      const key = `${r.scenario}|${r.webGLVersion}`;
      const previous = latest.get(key);
      if (previous === undefined || (r.endedAt ?? 0) >= (previous.endedAt ?? 0)) latest.set(key, r);
    }
  }
  const records = [...latest.values()].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0) || (a.webGLVersion ?? 0) - (b.webGLVersion ?? 0),
  );
  return { payloads, records };
}

/**
 * Formats a number, or `—` when it is missing.
 *
 * @param {unknown} v - the value.
 * @param {number} [digits] - decimals (default 2).
 * @returns {string} the text.
 */
function num(v, digits = 2) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';
}

/**
 * A `p50 / p95` cell from a `[min, p50, p95, max]` tuple.
 *
 * @param {unknown} d - the tuple.
 * @returns {string} the text.
 */
function pair(d) {
  return Array.isArray(d) && d.length >= 4 ? `${num(d[1])} / ${num(d[2])}` : '—';
}

/**
 * Share (0 … 1) of a record's free-running frames that came 21 ms or later.
 *
 * @param {any} r - the record.
 * @returns {number | null} the share, or null without a histogram.
 */
export function lateShare(r) {
  if (!Array.isArray(r.raf)) return null;
  let total = 0;
  let late = 0;
  r.raf.forEach((count, i) => {
    if (typeof count !== 'number') return;
    total += count;
    if (i >= LATE_BUCKET) late += count;
  });
  return total === 0 ? null : late / total;
}

/**
 * The record a row is read against: the same variant and WebGL version at 384×216.
 *
 * @param {any} r - the row's record.
 * @param {any[]} records - the session's records.
 * @returns {any | null} the baseline, or null.
 */
export function baselineFor(r, records) {
  return (
    records.find((b) => b.size === BASELINE_SIZE && b.variant === r.variant && b.webGLVersion === r.webGLVersion) ??
    null
  );
}

/**
 * A row's figures relative to its baseline.
 *
 * @param {any} r - the record.
 * @param {any | null} base - its baseline.
 * @returns {{syncRatio: number | null, renderRatio: number | null, twoTickPoints: number | null}} the synced and
 *   CPU render p95 over the baseline's, and the two-tick share's difference in percentage points.
 */
export function relativeTo(r, base) {
  const ratio = (a, b) =>
    Array.isArray(a) && Array.isArray(b) && typeof a[2] === 'number' && typeof b[2] === 'number' && b[2] > 0
      ? a[2] / b[2]
      : null;
  return {
    syncRatio: base === null ? null : ratio(r.syncedMs, base.syncedMs),
    renderRatio: base === null ? null : ratio(r.renderMs, base.renderMs),
    twoTickPoints:
      base === null || typeof r.twoTickShare !== 'number' || typeof base.twoTickShare !== 'number'
        ? null
        : (r.twoTickShare - base.twoTickShare) * 100,
  };
}

/**
 * Plan §13's outcome for one frame at 640×360 against its baseline.
 *
 * @param {any} r - the 640×360 record.
 * @param {any | null} base - its 384×216 baseline.
 * @returns {{tier: 'planned' | 'tv-profile' | 'performance-step' | 'unknown', action: string}} the tier and the
 *   action §13 maps it to (none of them blocks).
 */
export function section13Outcome(r, base) {
  const points = relativeTo(r, base).twoTickPoints;
  const synced = Array.isArray(r.syncedMs) ? r.syncedMs[2] : null;
  if (points === null || typeof synced !== 'number') {
    return { tier: 'unknown', action: 'no baseline in this session — re-run the 384x216 rows' };
  }
  if (points <= TWO_TICK_OK_POINTS && synced <= SYNC_OK_MS) {
    return { tier: 'planned', action: 'proceed as planned; record the headroom as the R3-04 / R6-02 budget' };
  }
  if (points <= TWO_TICK_TV_PROFILE_POINTS && synced <= SYNC_TV_PROFILE_MS) {
    return {
      tier: 'tv-profile',
      action:
        'proceed; R3-06 and R5 adopt the TV profile from the start (parallax capped at 4 on Tizen, far backdrop at' +
        ' half resolution, CRT off by default on TV)',
    };
  }
  return {
    tier: 'performance-step',
    action: 'proceed; open a performance step before R5, then re-measure',
  };
}

/**
 * The Markdown table of one internal size.
 *
 * @param {any[]} rows - the size's records.
 * @param {any[]} records - every record of the session (for the baselines).
 * @returns {string[]} the lines.
 */
function sizeTable(rows, records) {
  const out = [
    '| Scenario | GL | Render p50 / p95 ms | Synced p50 / p95 ms | Synced p95 × 384 | 2-tick % | Δ points | rAF ≥ 21 ms % | Draws | RT KB | Texture KB (pages) | Heap Δ KB | Frames |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const base = baselineFor(r, records);
    const rel = relativeTo(r, base);
    const late = lateShare(r);
    const heap = r.heapMeasured === true ? num((r.heapDeltaBytes ?? 0) / 1024, 0) : 'n/a';
    out.push(
      `| ${r.variant ?? r.scenario} | ${r.webGLVersion ?? '?'} | ${pair(r.renderMs)} | ${pair(r.syncedMs)} |` +
        ` ${rel.syncRatio === null ? '—' : num(rel.syncRatio) + '×'} |` +
        ` ${typeof r.twoTickShare === 'number' ? num(r.twoTickShare * 100, 1) : '—'} |` +
        ` ${rel.twoTickPoints === null ? '—' : (rel.twoTickPoints > 0 ? '+' : '') + num(rel.twoTickPoints, 1)} |` +
        ` ${late === null ? '—' : num(late * 100, 1)} | ${r.drawCalls ?? '—'} |` +
        ` ${num((r.renderTargetBytes ?? 0) / 1024, 0)} | ${num((r.textureBytes ?? 0) / 1024, 0)} (${r.atlasPages ?? '?'}) |` +
        ` ${heap} | ${r.frames ?? '?'} + ${r.syncedFrames ?? '?'} |`,
    );
  }
  return out;
}

/**
 * The report of one session.
 *
 * @param {string} file - path to the `<session>.jsonl`.
 * @param {{withRecords?: boolean}} [options] - `withRecords`: list every record in full.
 * @returns {string} the Markdown report.
 */
export function analyzeBenchSession(file, options = {}) {
  const { payloads, records } = readBenchSession(file);
  if (payloads.length === 0) return 'no payloads in ' + file;
  const last = payloads[payloads.length - 1];
  const env = last.env ?? {};
  const scenarios = typeof env.scenarios === 'number' ? env.scenarios : '?';
  const glVersions = [...new Set(records.map((r) => r.webGLVersion))].sort();
  const out = [];
  out.push(`# ${last.session} — TV render bench`);
  out.push('');
  out.push(
    `${payloads.length} payload(s), ${records.length} of ${scenarios} scenario(s) measured` +
      `${payloads.some((p) => p.done === true) ? ', run complete' : ', run **incomplete**'}; from ${last.from ?? '?'}.`,
  );
  out.push(
    `Build \`${env.buildId ?? '?'}\` · host ${env.host ?? '?'} · display ${env.innerWidth}×${env.innerHeight}` +
      ` @${env.devicePixelRatio} · WebGL ${glVersions.join(' + ') || '?'} · UA ${env.userAgent ?? '?'}`,
  );
  out.push(
    'Each row is read against the same variant at 384×216 in this session: **Synced p95 × 384** is the' +
      ' `gl.finish()`-synced render p95 over the baseline’s, **Δ points** the two-tick share’s difference. The M7’s' +
      ' rAF jitters to a p95 of ~30 ms on its own, so the absolute frame times are context, not budgets.',
  );
  out.push('');
  out.push('Paste the tables below into `docs/dev/input-probe-results.md` §12.');
  for (const [size, density, what] of SIZES) {
    const rows = records.filter((r) => r.size === size);
    if (rows.length === 0) continue;
    out.push('');
    out.push(`## ${size} (s = ${density}) — ${what}`);
    out.push('');
    for (const line of sizeTable(rows, records)) out.push(line);
  }
  const v2 = records.filter((r) => r.size === V2_SIZE);
  if (v2.length > 0) {
    out.push('');
    out.push('## Plan §13 at 640×360');
    out.push('');
    out.push('| Variant | GL | Δ 2-tick points | Synced p95 ms | Outcome |');
    out.push('|---|---|---|---|---|');
    for (const r of v2) {
      const outcome = section13Outcome(r, baselineFor(r, records));
      const points = relativeTo(r, baselineFor(r, records)).twoTickPoints;
      out.push(
        `| ${r.variant} | ${r.webGLVersion} | ${points === null ? '—' : num(points, 1)} |` +
          ` ${Array.isArray(r.syncedMs) ? num(r.syncedMs[2]) : '—'} | **${outcome.tier}** — ${outcome.action} |`,
      );
    }
    const hiBit = records.filter((r) => r.size === HI_BIT_SIZE);
    if (hiBit.length > 0) {
      const busyV2 = v2.find((r) => r.variant === 'busy');
      const busyHi = hiBit.find((r) => r.variant === 'busy' && r.webGLVersion === busyV2?.webGLVersion);
      if (busyV2 !== undefined && busyHi !== undefined) {
        const tierV2 = section13Outcome(busyV2, baselineFor(busyV2, records)).tier;
        const tierHi = section13Outcome(busyHi, baselineFor(busyHi, records)).tier;
        out.push('');
        out.push(
          tierHi === tierV2
            ? `960×540 (busy) lands in the same §13 tier as 640×360 (**${tierHi}**): note "960×540 is viable on the` +
                ' M7" for after v2 (a desktop HD mode / v3). It changes nothing in this plan.'
            : `960×540 (busy) is **${tierHi}** where 640×360 is **${tierV2}**: clearly worse — note it; nothing` +
                ' changes.',
        );
      }
    }
  }
  if (options.withRecords === true) {
    out.push('');
    out.push('## Records');
    out.push('');
    for (const r of records) out.push('    ' + JSON.stringify(r));
  }
  return out.join('\n');
}

/**
 * Plan §13's WebGL 1-vs-2 comparison between two sessions of the same set (review F8).
 *
 * @param {any[]} gl1 - the WebGL 1 session's records.
 * @param {any[]} gl2 - the WebGL 2 session's records.
 * @returns {string[]} a Markdown table and the verdict on the 640×360 busy frame.
 */
export function compareWebGL(gl1, gl2) {
  const out = [
    '| Scenario | Synced p95 GL 1 | Synced p95 GL 2 | GL 2 / GL 1 |',
    '|---|---|---|---|',
  ];
  let busy = null;
  for (const a of gl1) {
    const b = gl2.find((r) => r.scenario === a.scenario);
    if (b === undefined) continue;
    const ratio =
      Array.isArray(a.syncedMs) && Array.isArray(b.syncedMs) && a.syncedMs[2] > 0 ? b.syncedMs[2] / a.syncedMs[2] : null;
    if (a.scenario === `${V2_SIZE}-busy`) busy = ratio;
    out.push(`| ${a.scenario} | ${num(a.syncedMs?.[2])} | ${num(b.syncedMs?.[2])} | ${ratio === null ? '—' : num(ratio) + '×'} |`);
  }
  out.push('');
  out.push(
    busy === null
      ? 'No 640x360-busy row in both sessions: no WebGL verdict.'
      : busy <= 1 - WEBGL2_GAIN
        ? `WebGL 2 is clearly better at 640×360 (${num(busy)}× the synced p95): §13 — a step to make WebGL 2 the TV` +
          ' default with a WebGL 1 fallback.'
        : `WebGL 2 is not clearly better at 640×360 (${num(busy)}× the synced p95, the rule is ≤ ${num(1 - WEBGL2_GAIN)}×):` +
          ' WebGL 1 stays the default.',
  );
  return out;
}

/**
 * The report of several sessions: each one's, then the WebGL comparison when a WebGL 1 and a WebGL 2 session
 * are among them.
 *
 * @param {string[]} files - the `<session>.jsonl` paths.
 * @param {{withRecords?: boolean}} [options] - see {@link analyzeBenchSession}.
 * @returns {string} the Markdown report.
 */
export function analyzeBenchSessions(files, options = {}) {
  const parts = files.map((file) => analyzeBenchSession(file, options));
  const sessions = files.map((file) => readBenchSession(file).records);
  const gl1 = sessions.find((records) => records.length > 0 && records.every((r) => r.webGLVersion === 1));
  const gl2 = sessions.find((records) => records.length > 0 && records.every((r) => r.webGLVersion === 2));
  if (gl1 !== undefined && gl2 !== undefined) {
    parts.push(['## WebGL 1 vs 2 (plan §13, review F8)', '', ...compareWebGL(gl1, gl2)].join('\n'));
  }
  return parts.join('\n\n');
}

// ------------------------------------------------------------------ CLI
/** True when run as a script (`node results/analyze-bench.mjs`), false when imported (tests). */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (files.length === 0) {
    console.error('usage: node results/analyze-bench.mjs <session.jsonl> [more …] [--records]');
    process.exit(2);
  }
  console.log(analyzeBenchSessions(files, { withRecords: process.argv.includes('--records') }));
}
