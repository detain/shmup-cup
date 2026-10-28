#!/usr/bin/env node
/**
 * Turns TV render-bench sessions (plan R0-02 — `pnpm bench:tv`, collected by `npm run log-server`) into the
 * tables of `docs/dev/input-probe-results.md` §12 "Resolution benchmark".
 *
 * **A campaign, not a run.** One run on the M7 is not enough to decide anything that differs by less than the
 * run-to-run noise: two identical WebGL 1 runs of R0-03 differed by up to 1.51× in synced p95
 * (`results/2026-10-19-m7-bench/README.md`). So a campaign records several sessions on one set — today GL 1,
 * GL 2, GL 1, GL 2 — and this script reads them together:
 *
 * 1. **Aggregation per WebGL version.** Every scenario's synced p95, render p95 and two-tick share become a
 *    median / min / max across that version's runs.
 * 2. **Noise floor.** From the same-version repeats: per scenario the relative spread of the synced p95
 *    (`(max − min) / median`) and the absolute spread of the two-tick share (`max − min`, percentage points);
 *    the band is the median and the p90 of those spreads across scenarios.
 * 3. **GL 1 vs GL 2.** Only with ≥ {@link MIN_RUNS_FOR_VERDICT} runs of each version. A scenario's difference
 *    (of the two versions' medians) is called only beyond the band's **p90** and with the versions' run ranges
 *    apart; the overall shift (the median of the per-scenario differences) only beyond the **run-to-run drift**
 *    (the largest median shift between two runs of one version). Anything else is "within noise — no verdict".
 *    With fewer runs the script refuses.
 * 4. **Summary matrices** (rows = the 25 size ids, scaled then native, in matrix order; columns = the six
 *    variants): two-tick % and synced p95 ms per version, plus a **knob table** (a knob row against its own
 *    plain row at the same size, paired run by run) and plan §13's outcome at 640×360 and at 960×540.
 *
 * **Output resolutions.** The same matrix is also recorded with the canvas backbuffer at 1280×720 and 960×540
 * (separate builds: `env.output` and a `buildId` ending in `@1280x720`); a session without `env.output` ran at
 * the full window (`innerWidth × innerHeight`, 1920×1080 on the TV). Sessions are grouped by (build, output,
 * WebGL version), largest output first: every section above is produced per build × output under an
 * `## Output …` heading, the noise band from that output's own same-version repeats (an output without any
 * borrows the pooled band of the other outputs **of its own build** and says so). With ≥ 2 outputs of one
 * build a **cross-output comparison** puts each size × variant's two-tick share and synced p95 side by side
 * (`—` where a build skipped the row) and says where the reduced outputs beat the largest beyond the noise band.
 *
 * **Drawn pixels are never mixed in one table** (the 2026-10-27 contamination law, refined by the 2026-10-28
 * BENCSKIP amendment): a folder campaign may hold several `buildId`s — e.g. a legacy replay of an older bench
 * whose session a newer app later resumed — and aggregation, noise pooling and cross-output comparison all
 * stay inside one identity: sessions that carry `env.gameCodeHash` pool by it (equal = the same shipped game
 * code under a rebuilt bench — those runs legitimately pool, newest samples never supersede older ones, they
 * stack into the noise floor); sessions without it pool by `env.buildId` exactly as before, so the committed
 * history regenerates byte for byte.
 * A session's `env` is read by **majority over its payloads** (see {@link modalEnv}), never from the last one:
 * when the TV resumes a finished old run, the new app appends one header payload with its own `env` under the
 * OLD session id, and the log server files payloads by session id.
 *
 * Why the figures are read relative: the M7's `requestAnimationFrame` already shows a p95 of ~30 ms with nothing
 * running at all (`input-probe-results.md` §8), so an absolute frame time says more about the panel than about
 * the frame. Plan §13 reads each 640×360 and 960×540 row against the same variant at 384×216 **of the same
 * run** (the median of those per-run differences), which also cancels a run's own drift (a slow first run after
 * an install).
 *
 * Each JSONL line is one payload the bench POSTed: `{kind:'render-bench', session, seq, sentAt, env, results,
 * done}` plus the server's `receivedAt` / `from`. `results` holds that scenario's record — the shape is
 * `RenderBenchRecord` in `packages/shell/src/telemetry/index.ts` — and the end of a run re-sends the records
 * the server had not acknowledged, so the **latest record per scenario and WebGL version wins** (a **Red**
 * re-run on the TV replaces its scenario's row the same way). The matrix (`apps/tizen/src/bench/matrix.ts`):
 * scenario ids `<size>-<variant>` — scaled `640x360` (density height / 240) or native `1280x720n` (density 1) —
 * and knob rows `<size>-<variant>-<knob>` whose record `variant` is `<variant>-<knob>`. Sessions of the old
 * 18-scenario matrix (three scaled sizes, no knobs) read the same way.
 *
 * Since plan R1-05 (B4) a run ends with a **decode scenario**, whose `DecodeBenchRecord` rides in a payload's
 * optional `decode` field: per atlas page the median / p95 of the XHR fetch, the `HTMLImageElement` decode, the
 * upload through the renderer (with `gl.finish()`) and the `createImageBitmap` alternative. It is printed as its
 * own table with plan R3-04's zone-load estimate (≤ 2 s); sessions recorded before B4 simply have none.
 *
 * Usage (from tools/input-probe/):
 *   node results/analyze-bench.mjs <session.jsonl | folder> [more …] [--full] [--records]
 *
 *   folder       every `rb-*.jsonl` in it (every `*.jsonl` when none is named `rb-…`)
 *   --full       also print each session's own report: the per-size detail tables and its §13 block
 *   --records    also list every record in full (JSON) — implies the per-session reports
 *
 * Zero dependencies; prints Markdown that stays within ~120 columns (the --full detail tables are wider).
 *
 * @module results/analyze-bench
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The baseline frame: v1's internal size. */
export const BASELINE_SIZE = '384x216';

/** The v2 frame the plan decides by. */
export const V2_SIZE = '640x360';

/** The "hi-bit" frame recorded for after v2. */
export const HI_BIT_SIZE = '960x540';

/** The R0-02 sizes with their density and what they stand for (headings of the per-session tables). */
const SIZES = [
  [BASELINE_SIZE, 1, 'the baseline (v1 as it ships)'],
  [V2_SIZE, 1.5, 'the v2 frame and density'],
  [HI_BIT_SIZE, 2.25, 'the same field of view at 1.5× the density (for the record)'],
];

/** The load variants in column order (`BENCH_VARIANTS` of `apps/tizen/src/bench/matrix.ts`). */
export const VARIANTS = ['busy', 'filter', 'mode7', 'crt-light', 'crt-full', 'worst'];

/** The knobs in matrix order (`BENCH_KNOBS`). */
export const KNOBS = ['fit', 'stretch', 'interp', 'out720', 'out540'];

/** Runs of each WebGL version the GL 1-vs-2 verdict needs (and the noise floor needs of one version). */
export const MIN_RUNS_FOR_VERDICT = 2;

/** Most scenarios the GL 1-vs-2 section lists without `--full`. */
const CALLED_LIST_MAX = 25;

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

/** Plan R3-04: a zone change (or a lazy zone load) must take at most this long on the M7, ms. */
export const ZONE_LOAD_TARGET_MS = 2000;

/** Plan R3-04's page target per zone: `common` ≤ 1 page, the zone's own ≤ 2 pages. */
export const ZONE_PAGES = { common: 1, zone: 2 };

/**
 * Plan R3-04.M4a: the scenario id of the run's last page load — the stand-in zone drawn once on the 640×360
 * frame. It is measured like a render scenario but is not a matrix row: it is excluded from the size tables and
 * the campaign aggregation, and printed on its own line (see {@link standinLine}).
 */
export const STANDIN_SCENARIO = 'standin-zone';

/** §13's tiers and the action each maps to (none of them blocks). */
const SECTION13_ACTIONS = {
  planned: 'proceed as planned; record the headroom as the R3-04 / R6-02 budget',
  'tv-profile':
    'proceed; R3-06 and R5 adopt the TV profile from the start (parallax capped at 4 on Tizen, far backdrop at' +
    ' half resolution, CRT off by default on TV)',
  'performance-step': 'proceed; open a performance step before R5, then re-measure',
};

/**
 * Reads a session's payloads and keeps the latest record per scenario and WebGL version.
 *
 * @param {string} file - Path to the `<session>.jsonl` the log server wrote.
 * @returns {{payloads: any[], records: any[], standin: any[], decode: any | null}} the payloads in arrival
 *   order, the matrix records in matrix order (plan R3-04.M4a: without the {@link STANDIN_SCENARIO} load's
 *   record), that record in `standin`, and the latest decode record (plan R1-05 B4), or null when the session
 *   has none.
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
  const all = [...latest.values()].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0) || (a.webGLVersion ?? 0) - (b.webGLVersion ?? 0),
  );
  const standin = all.filter((r) => r.scenario === STANDIN_SCENARIO);
  const records = all.filter((r) => r.scenario !== STANDIN_SCENARIO);
  let decode = null;
  for (const p of payloads) {
    const d = p.decode;
    if (d === null || typeof d !== 'object' || !Array.isArray(d.pages)) continue;
    if (decode === null || (d.endedAt ?? 0) >= (decode.endedAt ?? 0)) decode = d;
  }
  return { payloads, records, standin, decode };
}

/**
 * The `env` a session ran under: the modal one over its payloads, ties to the last occurrence.
 *
 * The bench writes `env` into every payload, so within one honest run they are all equal and the mode is that
 * value. The mode matters when it is not: a new app that **resumes** a finished old run (the Oct-19 README's
 * resume trap) appends its header payload with the new `env` under the OLD session id — the log server files by
 * session id — and a one-payload straggler must not re-attribute a whole old-build session to the new build
 * (`results/2026-10-27-m7-bench/`, the 2026-10-27 contamination law).
 *
 * @param {any[]} payloads - the session's payloads, arrival order.
 * @returns {any} the most frequent `env` object (the last of the equally-frequent ones), or `{}` when no
 *   payload carries one.
 */
export function modalEnv(payloads) {
  const counts = new Map();
  for (const p of payloads) {
    const env = p !== null && typeof p === 'object' && p.env !== null && typeof p.env === 'object' ? p.env : null;
    const key = env === null ? '' : JSON.stringify(env);
    const hit = counts.get(key);
    if (hit === undefined) counts.set(key, { env: env ?? {}, n: 1 });
    else hit.n += 1;
  }
  let best = null;
  for (const hit of counts.values()) {
    if (best === null || hit.n >= best.n) best = hit;
  }
  return best === null ? {} : best.env;
}

/**
 * The pool a session's rows go into: the identity the skip ledger and every budget read is taken
 * over (plan v20x BENCSKIP, extended by plan R-SVG WO-1 for the atlas-page encoding).
 *
 * A session that carries `env.gameCodeHash` pools by it (`code:<hash>`); one that does not pools by
 * `env.buildId`, exactly as every session recorded before the field does — so the committed analysis
 * tables regenerate byte for byte on that rule. An **SVG-arm** session (`env.svgEnc` other than
 * `'png'` or absent) gains a `|svg=<enc>` suffix, and a PNG session's key never carries it: the two
 * arms draw the same scenes from differently encoded pages, so their samples must never average
 * together, and an older table's keys stay untouched.
 *
 * @param {Record<string, unknown>} env - The session's modal env (`modalEnv` of its payloads).
 * @returns {string} The pool key, part of the group key `${pool}|${output.id}`.
 */
export function benchPoolOf(env) {
  const code = typeof env.gameCodeHash === 'string' && env.gameCodeHash !== '' ? env.gameCodeHash : null;
  const enc =
    typeof env.svgEnc === 'string' && env.svgEnc !== '' && env.svgEnc !== 'png' ? env.svgEnc : null;
  const base = code === null ? (typeof env.buildId === 'string' ? env.buildId : '?') : `code:${code}`;
  return enc === null ? base : `${base}|svg=${enc}`;
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
 * A signed number (`+1.2`, `-0.4`, `0.0`), or `—`.
 *
 * @param {unknown} v - the value.
 * @param {number} [digits] - decimals (default 1).
 * @returns {string} the text.
 */
function signed(v, digits = 1) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const text = v.toFixed(digits);
  return v > 0 && Number(text) !== 0 ? '+' + text : text;
}

/**
 * A percentage of a 0 … 1 fraction, or `—`.
 *
 * @param {unknown} v - the fraction.
 * @returns {string} the text, e.g. `12%`.
 */
function pct(v) {
  return typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—';
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
 * The p95 of a `[min, p50, p95, max]` tuple.
 *
 * @param {unknown} d - the tuple.
 * @returns {number | null} the p95, or null.
 */
function p95Of(d) {
  return Array.isArray(d) && typeof d[2] === 'number' && Number.isFinite(d[2]) ? d[2] : null;
}

/**
 * A value at quantile `q` of a list (linear interpolation between the closest ranks).
 *
 * @param {number[]} values - the values (non-finite ones are ignored).
 * @param {number} q - 0 … 1 (0.5 = the median).
 * @returns {number | null} the quantile, or null for an empty list.
 */
export function quantile(values, q) {
  const s = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * Median / min / max of a list of run values.
 *
 * @param {number[]} values - the values (non-finite ones are ignored).
 * @returns {{n: number, median: number, min: number, max: number, values: number[]} | null} the figures, or
 *   null when no value is finite.
 */
export function runStats(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (v.length === 0) return null;
  return { n: v.length, median: /** @type {number} */ (quantile(v, 0.5)), min: Math.min(...v), max: Math.max(...v), values: v };
}

/**
 * Splits a record's `variant` into the load variant and the knob of a knob row.
 *
 * @param {unknown} variant - the record's `variant`: `busy`, `crt-light`, `busy-stretch`, `worst-out720` ….
 * @returns {{base: string, knob: string | null}} the load variant and the knob (null on a plain row).
 */
export function parseRow(variant) {
  const v = String(variant ?? '');
  let best = null;
  for (const base of VARIANTS) {
    if (v === base) return { base, knob: null };
    if (v.startsWith(base + '-') && (best === null || base.length > best.length)) best = base;
  }
  return best === null ? { base: v, knob: null } : { base: best, knob: v.slice(best.length + 1) };
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
 * The record a row is read against: the same variant and WebGL version at 384×216 — or, for a knob row
 * (`busy-stretch`), its own plain row (`busy`) at the same size, as the bench's `results.ts` `baselineOf` does.
 *
 * @param {any} r - the row's record.
 * @param {any[]} records - the session's records.
 * @returns {any | null} the baseline, or null.
 */
export function baselineFor(r, records) {
  const { base, knob } = parseRow(r.variant);
  const size = knob === null ? BASELINE_SIZE : r.size;
  const variant = knob === null ? r.variant : base;
  return records.find((b) => b.size === size && b.variant === variant && b.webGLVersion === r.webGLVersion) ?? null;
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
 * Plan §13's tier for a two-tick difference and a synced p95.
 *
 * @param {number | null} points - the two-tick share's difference against 384×216, percentage points.
 * @param {number | null} synced - the synced render p95, ms.
 * @returns {'planned' | 'tv-profile' | 'performance-step' | 'unknown'} the tier.
 */
export function section13Tier(points, synced) {
  if (typeof points !== 'number' || typeof synced !== 'number') return 'unknown';
  if (points <= TWO_TICK_OK_POINTS && synced <= SYNC_OK_MS) return 'planned';
  if (points <= TWO_TICK_TV_PROFILE_POINTS && synced <= SYNC_TV_PROFILE_MS) return 'tv-profile';
  return 'performance-step';
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
  const tier = section13Tier(relativeTo(r, base).twoTickPoints, p95Of(r.syncedMs));
  return tier === 'unknown'
    ? { tier, action: 'no baseline in this session — re-run the 384x216 rows' }
    : { tier, action: SECTION13_ACTIONS[tier] };
}

/**
 * A bench size id as plan §13's headings and notes write the frame.
 *
 * @param {string} size - a size id (`640x360`).
 * @returns {string} the frame text (`640×360`).
 */
function prettyFrame(size) {
  return size.replace('x', '×');
}

/**
 * The size ids of some records in display order: the scaled ids first, then the native (`…n`) ones, each in
 * matrix order (the first record index a size has).
 *
 * @param {any[]} records - the records.
 * @returns {{id: string, density: number | null, native: boolean}[]} the sizes.
 */
export function sizeOrder(records) {
  const sizes = new Map();
  for (const r of records) {
    if (typeof r.size !== 'string') continue;
    const s = sizes.get(r.size);
    const index = typeof r.index === 'number' ? r.index : Infinity;
    if (s === undefined) {
      sizes.set(r.size, {
        id: r.size,
        density: typeof r.density === 'number' ? r.density : null,
        native: /n$/.test(r.size),
        index,
        height: typeof r.height === 'number' ? r.height : 0,
      });
    } else {
      s.index = Math.min(s.index, index);
      if (parseRow(r.variant).knob === null && typeof r.density === 'number') s.density = r.density;
    }
  }
  return [...sizes.values()]
    .sort((a, b) => Number(a.native) - Number(b.native) || a.index - b.index || a.height - b.height)
    .map(({ id, density, native }) => ({ id, density, native }));
}

/**
 * A Markdown table with its columns padded, so it reads as plain text too.
 *
 * @param {string[]} header - the column titles.
 * @param {string[][]} rows - the cells.
 * @param {number[]} [left] - indices of left-aligned columns (the rest are right-aligned; default: column 0).
 * @returns {string[]} the lines.
 */
export function mdTable(header, rows, left = [0]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i] ?? '').length)));
  const line = (cells) =>
    '| ' +
    widths
      .map((w, i) => (left.includes(i) ? String(cells[i] ?? '').padEnd(w) : String(cells[i] ?? '').padStart(w)))
      .join(' | ') +
    ' |';
  return [line(header), '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...rows.map(line)];
}

/**
 * The Markdown table of one internal size (one session's records; the `--full` detail).
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
 * The median (p50) of a `[min, p50, p95, max]` tuple.
 *
 * @param {unknown} d - the tuple.
 * @returns {number | null} the median, or null when the tuple is missing.
 */
function median(d) {
  return Array.isArray(d) && d.length >= 4 && typeof d[1] === 'number' && Number.isFinite(d[1]) ? d[1] : null;
}

/**
 * Plan R3-04's zone-load estimate from a decode record — two shapes, by the page ids the session measured.
 * Since plan R3-04.M4a the stand-in zone's own pages are on the bench: `common` (the shipped page) plus the
 * `standin-zone-a` page (or two, `standin-zone-a-2` right after it) each at its own median, with no page-count
 * multiplier — those pages ARE the zone's pages. A session recorded before the change carries the synthetic
 * 2048² pages instead: `common` (the RGBA 2048² page) plus two zone pages (the PNG-8 2048² page), each at its
 * median — loaded cold (fetch + decode + upload: a lazy zone load, B3b) and uploaded only (today's policy
 * "all": the images are decoded at boot and the zone change uploads them). The synthetic shape scales the
 * PNG-8 page by {@link ZONE_PAGES}; the measured shape does not multiply anything.
 *
 * @param {any} decode - the decode record.
 * @returns {{lazyMs: number, eagerMs: number, perMpxMs: number | null, basis: 'standin' | 'synthetic',
 *   pages: number} | null} the two estimates, the PNG-8 (or stand-in) decode ms per megapixel, which shape
 *   was used and how many pages it loaded, or null when the record has neither shape's pages measured.
 */
export function decodeZoneEstimate(decode) {
  const pages = decode !== null && typeof decode === 'object' && Array.isArray(decode.pages) ? decode.pages : [];
  const valid = pages.filter((p) => p !== null && typeof p === 'object');
  const common = valid.find((p) => p.id === 'common');
  const standin = valid.filter(
    (p) => typeof p.id === 'string' && p.id.indexOf('standin-zone-') === 0,
  );
  if (common !== undefined && standin.length > 0) {
    const zone = [...standin, valid.find((p) => p.id === 'zone-a')].filter((p) => p !== undefined);
    const totals = [median(common.totalMs), ...zone.map((p) => median(p.totalMs))];
    const uploads = [median(common.uploadSyncedMs), ...zone.map((p) => median(p.uploadSyncedMs))];
    if (totals.some((v) => v === null) || uploads.some((v) => v === null)) return null;
    let lazyMs = 0;
    let eagerMs = 0;
    let decodeMs = 0;
    let mpx = 0;
    for (const p of [common, ...zone]) {
      lazyMs += median(p.totalMs);
      eagerMs += median(p.uploadSyncedMs);
      const d = median(p.decodeMs);
      if (d !== null) {
        decodeMs += d;
        mpx += (p.width * p.height) / 1e6;
      }
    }
    return {
      lazyMs,
      eagerMs,
      perMpxMs: mpx > 0 ? decodeMs / mpx : null,
      basis: 'standin',
      pages: 1 + zone.length,
    };
  }
  const rgba = valid.find((p) => p.id === 'rgba-2048');
  const png8 = valid.find((p) => p.id === 'png8-2048');
  if (rgba === undefined || png8 === undefined) return null;
  const totals = [median(rgba.totalMs), median(png8.totalMs)];
  const uploads = [median(rgba.uploadSyncedMs), median(png8.uploadSyncedMs)];
  if (totals.some((v) => v === null) || uploads.some((v) => v === null)) return null;
  const decodeMs = median(png8.decodeMs);
  const mpx = (png8.width * png8.height) / 1e6;
  return {
    lazyMs: ZONE_PAGES.common * totals[0] + ZONE_PAGES.zone * totals[1],
    eagerMs: ZONE_PAGES.common * uploads[0] + ZONE_PAGES.zone * uploads[1],
    perMpxMs: decodeMs === null || !(mpx > 0) ? null : decodeMs / mpx,
    basis: 'synthetic',
    pages: ZONE_PAGES.common + ZONE_PAGES.zone,
  };
}

/**
 * The decode scenario's section (plan R1-05 B4): one row per page and R3-04's zone-load estimate.
 *
 * @param {any} decode - the decode record.
 * @returns {string[]} the lines.
 */
export function decodeSection(decode) {
  const pages = Array.isArray(decode.pages) ? decode.pages : [];
  const out = [
    '## Decode and upload — file to GPU (plan R1-05 B4, for R3-04)',
    '',
    `${pages.length} page(s), ${decode.repetitions ?? '?'} repetition(s) each, WebGL ${decode.webGLVersion ?? '?'};` +
      ` \`HTMLImageElement.decode()\` ${decode.imageDecode === true ? 'yes' : 'no'},` +
      ` \`createImageBitmap\` ${decode.imageBitmap === true ? 'yes' : 'no'}. Fetch = XHR (\`file://\` on the TV),` +
      ' decode = an image on a blob URL (`onload` + `decode()`), upload = the renderer’s `uploadTextureSource`' +
      ' then `gl.finish()`; every texture is released between repetitions. "First" is the first (coldest)' +
      ' repetition’s file → GPU total.',
    '',
    '| Page | Size | Encoding | File KB | Fetch p50 / p95 | Decode p50 / p95 | Upload CPU p50 / p95 | Upload + finish p50 / p95 | File → GPU p50 / p95 | First | Bitmap decode p50 / p95 | Bitmap upload p50 / p95 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const p of pages) {
    if (p === null || typeof p !== 'object') continue;
    out.push(
      `| ${p.id ?? '?'} | ${p.width ?? '?'}×${p.height ?? '?'} | ${p.encoding ?? '?'} | ${num((p.bytes ?? 0) / 1024, 0)} |` +
        ` ${pair(p.fetchMs)} | ${pair(p.decodeMs)} | ${pair(p.uploadMs)} | ${pair(p.uploadSyncedMs)} |` +
        ` ${pair(p.totalMs)} | ${p.totalMs ? num(p.firstTotalMs) : '—'} | ${pair(p.bitmapMs)} | ${pair(p.bitmapUploadMs)} |`,
    );
  }
  for (const p of pages) {
    if (p !== null && typeof p === 'object' && typeof p.error === 'string') out.push('', `- **${p.id}:** ${p.error}`);
  }
  if (typeof decode.error === 'string') out.push('', `**The decode scenario stopped:** ${decode.error}`);
  const estimate = decodeZoneEstimate(decode);
  out.push('');
  if (estimate === null) {
    out.push('No zone-load estimate: neither the stand-in pages (plan R3-04.M4a) nor both synthetic 2048² pages were measured.');
  } else {
    const verdict = (ms) =>
      ms <= ZONE_LOAD_TARGET_MS ? `within R3-04’s ${ZONE_LOAD_TARGET_MS} ms` : `**over** R3-04’s ${ZONE_LOAD_TARGET_MS} ms`;
    const basisLine =
      estimate.basis === 'standin'
        ? 'R3-04 zone-load estimate (the measured pages: `common` + the stand-in zone pages,' +
          ` ${estimate.pages} page(s) in all, each at its median):`
        : `R3-04 zone-load estimate (\`common\` = ${ZONE_PAGES.common} RGBA 2048² page + ${ZONE_PAGES.zone} PNG-8 2048² zone` +
          ' pages, medians):';
    out.push(
      basisLine,
      '',
      `- **cold load** (fetch + decode + upload — a lazy zone load, B3b): **${num(estimate.lazyMs, 0)} ms**, ${verdict(estimate.lazyMs)};`,
      `- **zone change today** (policy "all": decoded at boot, uploaded at the change): **${num(estimate.eagerMs, 0)} ms**,` +
        ` ${verdict(estimate.eagerMs)};`,
      estimate.basis === 'standin'
        ? `- stand-in PNG-8 decode ≈ ${estimate.perMpxMs === null ? '—' : num(estimate.perMpxMs, 1)} ms per megapixel — the` +
          ' measured pages, not a scaled stand-in.'
        : `- PNG-8 decode ≈ ${estimate.perMpxMs === null ? '—' : num(estimate.perMpxMs, 1)} ms per megapixel — scale it to the` +
          ' real pages’ size.',
    );
  }
  return out;
}

/**
 * The `--full` plan §13 outcome table of one frame size: every plain row of the frame against this session's
 * own 384×216 baseline (the campaign report prints the same outcome from the per-run medians — see
 * {@link section13Block}).
 *
 * @param {string} size - the size id (`640x360`, `960x540`).
 * @param {any[]} rows - the frame's plain rows, in matrix order.
 * @param {any[]} records - every record of the session (for the baselines).
 * @returns {string[]} the lines, starting with the blank that separates the section.
 */
function section13SessionBlock(size, rows, records) {
  const out = [
    '',
    `## Plan §13 at ${prettyFrame(size)}`,
    '',
    '| Variant | GL | Δ 2-tick points | Synced p95 ms | Outcome |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const outcome = section13Outcome(r, baselineFor(r, records));
    const points = relativeTo(r, baselineFor(r, records)).twoTickPoints;
    out.push(
      `| ${r.variant} | ${r.webGLVersion} | ${points === null ? '—' : num(points, 1)} |` +
        ` ${Array.isArray(r.syncedMs) ? num(r.syncedMs[2]) : '—'} | **${outcome.tier}** — ${outcome.action} |`,
    );
  }
  return out;
}

/**
 * The report of one session (the `--full` detail): a table per internal size, every row relative to the same
 * session's baseline, plan §13 on this run alone, and the decode section.
 *
 * @param {string} file - path to the `<session>.jsonl`.
 * @param {{withRecords?: boolean}} [options] - `withRecords`: list every record in full.
 * @returns {string} the Markdown report.
 */
export function analyzeBenchSession(file, options = {}) {
  const { payloads, records, standin, decode } = readBenchSession(file);
  if (payloads.length === 0) return 'no payloads in ' + file;
  const last = payloads[payloads.length - 1];
  const env = modalEnv(payloads);
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
      ` @${env.devicePixelRatio}${typeof env.output === 'string' ? ` · output ${env.output}` : ''} · WebGL` +
      ` ${glVersions.join(' + ') || '?'} · UA ${env.userAgent ?? '?'}`,
  );
  out.push(
    'Each row is read against the same variant at 384×216 in this session (a knob row such as `busy-stretch`' +
      ' against its own plain row at the same size): **Synced p95 × 384** is the `gl.finish()`-synced render p95' +
      ' over the baseline’s, **Δ points** the two-tick share’s difference. The M7’s rAF jitters to a p95 of' +
      ' ~30 ms on its own, so the absolute frame times are context, not budgets. One run is inside the run-to-run' +
      ' noise — read the campaign summary for anything that compares runs.',
  );
  for (const size of sizeOrder(records)) {
    const rows = records.filter((r) => r.size === size.id);
    const known = SIZES.find(([id]) => id === size.id);
    out.push('');
    out.push(
      known !== undefined
        ? `## ${size.id} (s = ${known[1]}) — ${known[2]}`
        : `## ${size.id} (s = ${size.density ?? '?'}) — ${size.native ? 'native art: more world at s = 1' : 'scaled art: the same world at s = height / 240'}`,
    );
    out.push('');
    for (const line of sizeTable(rows, records)) out.push(line);
  }
  const v2 = records.filter((r) => r.size === V2_SIZE && parseRow(r.variant).knob === null);
  if (v2.length > 0) {
    out.push(...section13SessionBlock(V2_SIZE, v2, records));
    const hiBit = records.filter((r) => r.size === HI_BIT_SIZE);
    if (hiBit.length > 0) {
      const busyV2 = v2.find((r) => r.variant === 'busy');
      const busyHi = hiBit.find((r) => r.variant === 'busy' && r.webGLVersion === busyV2?.webGLVersion);
      if (busyV2 !== undefined && busyHi !== undefined) {
        const tierV2 = section13Outcome(busyV2, baselineFor(busyV2, records)).tier;
        const tierHi = section13Outcome(busyHi, baselineFor(busyHi, records)).tier;
        out.push('');
        out.push(hiBitNote(tierV2, tierHi));
      }
    }
  }
  const hi = records.filter((r) => r.size === HI_BIT_SIZE && parseRow(r.variant).knob === null);
  if (hi.length > 0) out.push(...section13SessionBlock(HI_BIT_SIZE, hi, records));
  if (standin.length > 0) {
    out.push('');
    out.push(`## Stand-in draw (the run's last page load, plan R3-04.M4a) — ${standin.length} record(s)`);
    out.push('');
    out.push('| GL | Render p50 / p95 | Synced p50 / p95 | Draws | Atlas pages |');
    out.push('|---|---|---|---|---|');
    for (const r of standin) {
      out.push(
        `| ${r.webGLVersion ?? '?'} | ${pair(r.renderMs)} | ${pair(r.syncedMs)} | ${r.drawCalls ?? '?'} |` +
          ` ${r.atlasPages ?? '?'} |`,
      );
    }
  }
  if (decode !== null) {
    out.push('');
    for (const line of decodeSection(decode)) out.push(line);
  }
  if (options.withRecords === true) {
    out.push('');
    out.push('## Records');
    out.push('');
    for (const r of [...records, ...standin]) out.push('    ' + JSON.stringify(r));
    if (decode !== null) out.push('    ' + JSON.stringify(decode));
  }
  return out.join('\n');
}

/**
 * The 960×540 note §13 attaches to the busy row.
 *
 * @param {string} tierV2 - 640×360 busy's tier.
 * @param {string} tierHi - 960×540 busy's tier.
 * @returns {string} the note.
 */
function hiBitNote(tierV2, tierHi) {
  return tierHi === tierV2
    ? `960×540 (busy) lands in the same §13 tier as 640×360 (**${tierHi}**): note "960×540 is viable on the` +
        ' M7" for after v2 (a desktop HD mode / v3). It changes nothing in this plan.'
    : `960×540 (busy) is **${tierHi}** where 640×360 is **${tierV2}**: clearly worse — note it; nothing changes.`;
}

// ------------------------------------------------------------------ campaigns

/**
 * Expands the command line's paths: a folder stands for every `rb-*.jsonl` in it (every `*.jsonl` when none is
 * named `rb-…`), a file for itself.
 *
 * @param {string[]} paths - files and folders.
 * @returns {string[]} the session files.
 */
export function expandSessionArgs(paths) {
  const out = [];
  for (const p of paths) {
    let dir = false;
    try {
      dir = statSync(p).isDirectory();
    } catch (_error) {
      dir = false;
    }
    if (!dir) {
      out.push(p);
      continue;
    }
    const names = readdirSync(p)
      .filter((n) => n.endsWith('.jsonl'))
      .sort();
    const rb = names.filter((n) => n.startsWith('rb-'));
    for (const n of rb.length > 0 ? rb : names) out.push(join(p, n));
  }
  return out;
}

/**
 * Aggregates the runs of one WebGL version per scenario.
 *
 * @param {any[]} runs - the runs (`{session, gl, byScenario}`), oldest first.
 * @returns {Map<string, any>} per scenario id: `{scenario, size, density, variant, base, knob, index, runs, sync,
 *   render, twoTick}` — `sync` / `render` the synced and CPU render p95 (ms) and `twoTick` the two-tick share
 *   (percent) as {@link runStats}, each over the runs that measured the scenario.
 */
export function aggregateRuns(runs) {
  const acc = new Map();
  for (const run of runs) {
    for (const r of run.byScenario.values()) {
      let a = acc.get(r.scenario);
      if (a === undefined) {
        const { base, knob } = parseRow(r.variant);
        a = {
          scenario: r.scenario,
          size: r.size,
          density: r.density ?? null,
          variant: r.variant,
          base,
          knob,
          index: typeof r.index === 'number' ? r.index : 0,
          runs: 0,
          syncValues: [],
          renderValues: [],
          twoTickValues: [],
        };
        acc.set(r.scenario, a);
      }
      a.runs += 1;
      a.syncValues.push(p95Of(r.syncedMs));
      a.renderValues.push(p95Of(r.renderMs));
      a.twoTickValues.push(typeof r.twoTickShare === 'number' ? r.twoTickShare * 100 : null);
    }
  }
  const out = new Map();
  for (const [id, a] of acc) {
    out.set(id, {
      scenario: a.scenario,
      size: a.size,
      density: a.density,
      variant: a.variant,
      base: a.base,
      knob: a.knob,
      index: a.index,
      runs: a.runs,
      sync: runStats(a.syncValues),
      render: runStats(a.renderValues),
      twoTick: runStats(a.twoTickValues),
    });
  }
  return out;
}

/**
 * The noise floor from same-version repeats: per scenario and WebGL version with ≥ 2 runs, the relative spread
 * of the synced p95 (`(max − min) / median`) and the absolute spread of the two-tick share (`max − min`, points);
 * the band is the median and the p90 of each across those scenarios.
 *
 * @param {Map<number, Map<string, any>>} aggregates - {@link aggregateRuns} per WebGL version.
 * @returns {{samples: {gl: number, scenario: string, relSync: number | null, twoTick: number | null}[],
 *   relSync: {n: number, median: number, p90: number, worst: any} | null,
 *   twoTick: {n: number, median: number, p90: number, worst: any} | null} | null} the band, or null without a
 *   single repeated scenario.
 */
export function noiseFloor(aggregates) {
  const samples = [];
  for (const [gl, scenarios] of aggregates) {
    for (const a of scenarios.values()) {
      const relSync = a.sync !== null && a.sync.n >= 2 && a.sync.median > 0 ? (a.sync.max - a.sync.min) / a.sync.median : null;
      const twoTick = a.twoTick !== null && a.twoTick.n >= 2 ? a.twoTick.max - a.twoTick.min : null;
      if (relSync !== null || twoTick !== null) samples.push({ gl, scenario: a.scenario, relSync, twoTick });
    }
  }
  return noiseFromSamples(samples);
}

/**
 * The bands of a list of spread samples (see {@link noiseFloor}).
 *
 * @param {{gl: number, scenario: string, relSync: number | null, twoTick: number | null, output?: string}[]} samples - per
 *   scenario and version, the spreads of its repeated runs.
 * @returns {any | null} the band (`{samples, relSync, twoTick}`), or null for no sample.
 */
function noiseFromSamples(samples) {
  if (samples.length === 0) return null;
  const band = (key) => {
    const with_ = samples.filter((s) => s[key] !== null);
    if (with_.length === 0) return null;
    const values = with_.map((s) => s[key]);
    const worst = with_.reduce((w, s) => (s[key] > w[key] ? s : w));
    return { n: values.length, median: quantile(values, 0.5), p90: quantile(values, 0.9), worst };
  };
  return { samples, relSync: band('relSync'), twoTick: band('twoTick') };
}

/**
 * The pooled noise band of several outputs: every output's same-version spread samples together, and the
 * largest run-to-run drift of any output. The fallback for an output that has no repeats of its own.
 *
 * @param {any[]} bands - the outputs' own {@link noiseFloor} results (with `drift`), none null.
 * @returns {any | null} the band, flagged `pooled` and with `pooledFrom` (the output ids), or null without bands.
 */
export function poolNoise(bands) {
  const samples = [];
  const from = [];
  for (const b of bands) {
    for (const s of b.samples) samples.push({ ...s, output: b.outputId });
    from.push(b.outputId);
  }
  const pooled = noiseFromSamples(samples);
  if (pooled === null) return null;
  const drifts = bands.map((b) => b.drift).filter((d) => d !== undefined);
  const maxOf = (key) => drifts.reduce((m, d) => (typeof d[key] === 'number' ? Math.max(m ?? 0, d[key]) : m), null);
  pooled.drift = { twoTick: maxOf('twoTick'), relSync: maxOf('relSync'), pairs: drifts.reduce((n, d) => n + d.pairs, 0) };
  pooled.pooled = true;
  pooled.pooledFrom = from;
  return pooled;
}

/**
 * The output resolution a session was recorded at: the canvas backbuffer of the reduced-output builds
 * (`env.output`, e.g. `1280x720`), else the full window (`innerWidth × innerHeight`, 1920×1080 on the TV).
 *
 * @param {any} env - the session's `env`.
 * @returns {{id: string, label: string, area: number, window: boolean}} the output: its id (`WxH`, or `?` when
 *   the session knows neither), its heading label (`1920x1080 (window)`, `1280x720 (backbuffer)`), its pixel
 *   count (for the order, largest first) and whether it was derived from the window.
 */
export function sessionOutput(env) {
  const e = env !== null && typeof env === 'object' ? env : {};
  const explicit = typeof e.output === 'string' && /^\d+x\d+$/.test(e.output.trim()) ? e.output.trim() : null;
  const windowed =
    typeof e.innerWidth === 'number' && typeof e.innerHeight === 'number' ? `${e.innerWidth}x${e.innerHeight}` : null;
  const id = explicit ?? windowed ?? '?';
  const [w, h] = id.split('x').map(Number);
  return {
    id,
    label: id === '?' ? '? (unknown output)' : `${id} (${explicit !== null ? 'backbuffer' : 'window'})`,
    area: Number.isFinite(w) && Number.isFinite(h) ? w * h : 0,
    window: explicit === null,
  };
}

/**
 * One output's campaign: its sessions' runs per WebGL version, their aggregates, the size order and the
 * output's own noise floor (null without same-version repeats).
 *
 * @param {{id: string, label: string, area: number, window: boolean}} output - the output.
 * @param {any[]} sessions - the output's sessions (oldest first).
 * @returns {any} the output campaign: `{output, sessions, gls, runsByGl, aggregates, sizes, noise, ownNoise}`.
 */
function outputCampaign(output, sessions) {
  const runsByGl = new Map();
  for (const session of sessions) {
    const gls = [...new Set(session.records.map((r) => r.webGLVersion))].sort();
    for (const gl of gls) {
      const byScenario = new Map();
      for (const r of session.records) if (r.webGLVersion === gl) byScenario.set(r.scenario, r);
      if (!runsByGl.has(gl)) runsByGl.set(gl, []);
      runsByGl.get(gl).push({ session, gl, byScenario });
    }
  }
  const gls = [...runsByGl.keys()].sort();
  const aggregates = new Map(gls.map((gl) => [gl, aggregateRuns(runsByGl.get(gl))]));
  const ownNoise = noiseFloor(aggregates);
  if (ownNoise !== null) {
    ownNoise.drift = runDrift(runsByGl);
    ownNoise.outputId = output.id;
  }
  return {
    output,
    sessions,
    gls,
    runsByGl,
    aggregates,
    sizes: sizeOrder(sessions.flatMap((s) => s.records)),
    noise: ownNoise,
    ownNoise,
  };
}

/**
 * Loads a campaign: its sessions (oldest first), grouped by pooling identity — game code hash, or the
 * build id for a session without one (plan v20x BENCSKIP) — and output resolution
 * ({@link sessionOutput} under the {@link modalEnv}, largest output first; the 2026-10-27 contamination
 * law: sessions whose drawn game code differs are never aggregated into one block), and per group one run
 * per session and WebGL version, the per-version aggregates, the display order of the sizes and the noise
 * floor. An output without same-version repeats borrows the pooled band of its own build's other outputs
 * (`noise.pooled`).
 *
 * @param {string[]} files - the session files.
 * @returns {any} the campaign: `{sessions, outputs, sizes}` plus — for callers that predate the outputs — the
 *   fields of the first (largest) output: `gls`, `runsByGl`, `aggregates`, `noise`, `output`. With one output
 *   (every older campaign) those are the whole campaign's.
 */
export function loadCampaign(files) {
  const sessions = files
    .map((file, order) => {
      const { payloads, records, decode } = readBenchSession(file);
      const last = payloads[payloads.length - 1] ?? {};
      const env = modalEnv(payloads);
      const pool = benchPoolOf(env);
      return {
        file,
        order,
        id: last.session ?? basename(file),
        env,
        buildId: typeof env.buildId === 'string' ? env.buildId : '?',
        // Plan v20x BENCSKIP: rows pool by game code when the bundle carried one, by build id
        // when it did not — every session recorded before the field exists groups exactly as it
        // always did (the committed analysis tables regenerate byte for byte on that rule). The
        // `code:` shape can never collide with a build id (`4b37d12`, `8ba0e7c@960x540`, …).
        pool,
        output: sessionOutput(env),
        from: last.from ?? null,
        payloads,
        records,
        decode,
        startedAt: typeof env.startedAt === 'number' ? env.startedAt : null,
        complete: payloads.some((p) => p.done === true),
      };
    })
    .filter((s) => s.payloads.length > 0)
    .sort((a, b) =>
      a.startedAt !== null && b.startedAt !== null ? a.startedAt - b.startedAt || a.order - b.order : a.order - b.order,
    );
  const groups = new Map();
  for (const session of sessions) {
    const key = `${session.pool}|${session.output.id}`;
    const g = groups.get(key);
    if (g === undefined)
      groups.set(key, { output: { ...session.output, buildId: session.buildId }, sessions: [session] });
    else {
      g.sessions.push(session);
      // A label says "(window)" only when no session of the output named it explicitly.
      if (!session.output.window) g.output = { ...session.output, buildId: session.buildId };
    }
  }
  const outputs = [...groups.values()]
    .sort((a, b) => b.output.area - a.output.area || (a.output.id < b.output.id ? -1 : 1))
    .map((g) => outputCampaign(g.output, g.sessions));
  // A multi-build campaign names the build in every output heading (a single-build one reads as before).
  const builds = new Set(sessions.map((s) => s.buildId));
  if (builds.size > 1) for (const o of outputs) o.output.label = `${o.output.label} [build ${o.output.buildId}]`;
  for (const [, outs] of groupsByBuild(outputs)) {
    if (outs.length < 2) continue; // noise is pooled within one build only
    const own = outs.filter((o) => o.ownNoise !== null).map((o) => o.ownNoise);
    const pooled = own.length > 0 ? poolNoise(own) : null;
    for (const o of outs) if (o.noise === null && pooled !== null) o.noise = pooled;
  }
  const first = outputs[0] ?? {
    output: null,
    gls: [],
    runsByGl: new Map(),
    aggregates: new Map(),
    sizes: [],
    noise: null,
    ownNoise: null,
  };
  return { ...first, sessions, outputs, sizes: sizeOrder(sessions.flatMap((s) => s.records)) };
}

/**
 * Run-to-run drift: for every pair of runs of the same version, the median across their common scenarios of
 * the two-tick difference (points) and of the synced p95 ratio — how far a whole run moves on its own (R0-03's
 * first run after an install sat ~4 points above the repeat). The largest pair is the band an overall GL 1-vs-2
 * shift must exceed.
 *
 * @param {Map<number, any[]>} runsByGl - the runs per version.
 * @returns {{twoTick: number | null, relSync: number | null, pairs: number}} the largest absolute drift of each
 *   metric (`relSync` as `|ratio − 1|`) and how many run pairs were compared.
 */
export function runDrift(runsByGl) {
  let twoTick = null;
  let relSync = null;
  let pairs = 0;
  for (const runs of runsByGl.values()) {
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const points = [];
        const ratios = [];
        for (const [id, a] of runs[i].byScenario) {
          const b = runs[j].byScenario.get(id);
          if (b === undefined) continue;
          const rel = relativeTo(b, a);
          points.push(rel.twoTickPoints);
          ratios.push(rel.syncRatio);
        }
        const p = quantile(points, 0.5);
        const r = quantile(ratios, 0.5);
        if (p === null && r === null) continue;
        pairs += 1;
        if (p !== null) twoTick = Math.max(twoTick ?? 0, Math.abs(p));
        if (r !== null) relSync = Math.max(relSync ?? 0, Math.abs(r - 1));
      }
    }
  }
  return { twoTick, relSync, pairs };
}

/**
 * The aggregate of a size and row (`busy`, `busy-stretch`) in one version's aggregates.
 *
 * @param {Map<string, any>} agg - one version's aggregates.
 * @param {string} size - size id.
 * @param {string} variant - the record's `variant`.
 * @returns {any | null} the aggregate, or null.
 */
function aggOf(agg, size, variant) {
  for (const a of agg.values()) if (a.size === size && a.variant === variant) return a;
  return null;
}

/**
 * A summary-matrix cell: the median across runs and, with ≥ 2 runs, `±` half the min–max range.
 *
 * @param {any} stats - {@link runStats} or null.
 * @param {number} digits - decimals.
 * @returns {string} the cell.
 */
function cell(stats, digits) {
  if (stats === null || stats === undefined) return '—';
  return stats.n >= 2 ? `${num(stats.median, digits)} ±${num((stats.max - stats.min) / 2, digits)}` : num(stats.median, digits);
}

/**
 * One summary matrix of a version: rows = the size ids, columns = the variants.
 *
 * @param {any} campaign - {@link loadCampaign}.
 * @param {number} gl - the WebGL version.
 * @param {'twoTick' | 'sync' | 'render'} metric - the figure.
 * @param {number} digits - decimals.
 * @returns {string[]} the lines.
 */
function summaryMatrix(campaign, gl, metric, digits) {
  const agg = campaign.aggregates.get(gl);
  const plain = [...agg.values()].filter((a) => a.knob === null);
  const columns = [...VARIANTS, ...new Set(plain.map((a) => a.base).filter((b) => !VARIANTS.includes(b)))].filter((v) =>
    plain.some((a) => a.base === v),
  );
  const rows = [];
  for (const size of campaign.sizes) {
    if (!plain.some((a) => a.size === size.id)) continue;
    rows.push([
      size.id,
      size.density === null ? '?' : String(size.density),
      ...columns.map((v) => {
        const a = aggOf(agg, size.id, v);
        return a === null ? '—' : cell(a[metric], digits);
      }),
    ]);
  }
  return mdTable(['Size', 's', ...columns], rows, [0]);
}

/**
 * The per-run difference between two rows of the same run, as median / min / max over the runs that have both.
 *
 * @param {any[]} runs - one version's runs.
 * @param {(run: any) => [any, any] | null} rowsOf - the two records of a run (`[row, reference]`), or null.
 * @returns {{points: any, ratio: any}} the two-tick difference (points) and the synced p95 ratio, as
 *   {@link runStats} (null when no run has both).
 */
function pairedDelta(runs, rowsOf) {
  const points = [];
  const ratios = [];
  for (const run of runs) {
    const pairOf = rowsOf(run);
    if (pairOf === null) continue;
    const rel = relativeTo(pairOf[0], pairOf[1]);
    points.push(rel.twoTickPoints);
    ratios.push(rel.syncRatio);
  }
  return { points: runStats(points), ratio: runStats(ratios) };
}

/**
 * The record of a size and row in one run.
 *
 * @param {any} run - the run.
 * @param {string} size - size id.
 * @param {string} variant - the record's `variant`.
 * @returns {any | null} the record.
 */
function recordOf(run, size, variant) {
  for (const r of run.byScenario.values()) if (r.size === size && r.variant === variant) return r;
  return null;
}

/**
 * Whether a value exceeds a band (`beyond`), stays inside it (`within`) or cannot be judged (`—`).
 *
 * @param {number | null | undefined} value - the absolute difference.
 * @param {number | null | undefined} band - the band.
 * @returns {string} the call.
 */
function call(value, band) {
  if (typeof value !== 'number' || typeof band !== 'number') return '—';
  return Math.abs(value) > band ? 'beyond' : 'within';
}

/**
 * The GL 1-vs-2 call of one scenario: `beyond` only when the difference exceeds the band **and** the two
 * versions' run ranges do not overlap (with two runs a version, a difference half its own spread is otherwise
 * "called" against a version that happened to repeat itself exactly).
 *
 * @param {number | null} value - the difference (points, or ratio − 1).
 * @param {number | null | undefined} band - the noise floor's p90.
 * @param {any} a - GL 1's {@link runStats}.
 * @param {any} b - GL 2's {@link runStats}.
 * @returns {string} `beyond`, `within` or `—`.
 */
function scenarioCall(value, band, a, b) {
  const c = call(value, band);
  if (c !== 'beyond' || a === null || b === null) return c;
  return a.max < b.min || b.max < a.min ? 'beyond' : 'within';
}

/**
 * Plan §13's outcome tables for one version, on the medians of the per-run figures (each run's row at the frame
 * against that run's 384×216 row): 640×360 first, then the 960×540 note between the frames, then 960×540 — a
 * first-class decision frame read against the very same thresholds, not a prose note alone.
 *
 * @param {any} campaign - {@link loadCampaign}.
 * @param {number} gl - the WebGL version.
 * @returns {string[]} the lines (empty without rows at either frame).
 */
function section13Block(campaign, gl) {
  const runs = campaign.runsByGl.get(gl);
  const agg = campaign.aggregates.get(gl);
  const tierOf = (size, variant) => {
    const a = aggOf(agg, size, variant);
    if (a === null) return null;
    const d = pairedDelta(runs, (run) => {
      const row = recordOf(run, size, variant);
      const base = recordOf(run, BASELINE_SIZE, variant);
      return row === null || base === null ? null : [row, base];
    });
    const points = d.points === null ? null : d.points.median;
    const synced = a.sync === null ? null : a.sync.median;
    return { a, d, points, synced, tier: section13Tier(points, synced) };
  };
  const n = runs.length;
  const out = [];
  const frameBlock = (size) => {
    const rows = [];
    for (const variant of VARIANTS) {
      const t = tierOf(size, variant);
      if (t === null) continue;
      rows.push([
        variant,
        String(t.a.runs),
        t.d.points === null ? '—' : signed(t.points) + (t.d.points.n >= 2 ? ` (${signed(t.d.points.min)} … ${signed(t.d.points.max)})` : ''),
        cell(t.a.sync, 2),
        `**${t.tier}**`,
      ]);
    }
    if (rows.length === 0) return;
    if (out.length > 0) out.push('');
    const frame = prettyFrame(size);
    out.push(
      `### Plan §13 at ${frame} — GL ${gl}, ${n === 1 ? 'one run' : `median of ${n} runs`}`,
      '',
      `Δ 2-tick = each run’s ${frame} row against the same run’s 384×216 row (median, and the runs’ range).`,
      '',
      ...mdTable(['Variant', 'Runs', 'Δ 2-tick points', 'Synced p95 ms', 'Outcome'], rows, [0, 4]),
      '',
    );
    for (const tier of Object.keys(SECTION13_ACTIONS)) {
      if (rows.some((r) => r[4] === `**${tier}**`)) out.push(`- **${tier}**: ${SECTION13_ACTIONS[tier]}`);
    }
    if (rows.some((r) => r[4] === '**unknown**')) out.push('- **unknown**: no 384x216 baseline in the same run — re-run it');
  };
  frameBlock(V2_SIZE);
  const busyV2 = tierOf(V2_SIZE, 'busy');
  const busyHi = tierOf(HI_BIT_SIZE, 'busy');
  if (busyV2 !== null && busyHi !== null) out.push('', hiBitNote(busyV2.tier, busyHi.tier));
  frameBlock(HI_BIT_SIZE);
  return out;
}

/**
 * The knob table of one version: every knob row against its own plain row at the same size, paired run by run
 * (median of the per-run differences), and whether the difference exceeds the noise floor's p90.
 *
 * @param {any} campaign - {@link loadCampaign}.
 * @param {number} gl - the WebGL version.
 * @returns {string[]} the lines (empty without knob rows).
 */
function knobTable(campaign, gl) {
  const runs = campaign.runsByGl.get(gl);
  const agg = campaign.aggregates.get(gl);
  const knobRows = [...agg.values()]
    .filter((a) => a.knob !== null)
    .sort((a, b) => {
      const ka = KNOBS.indexOf(a.knob);
      const kb = KNOBS.indexOf(b.knob);
      return (ka < 0 ? KNOBS.length : ka) - (kb < 0 ? KNOBS.length : kb) || a.index - b.index;
    });
  if (knobRows.length === 0) return [];
  const noise = campaign.noise;
  const rows = knobRows.map((k) => {
    const plain = aggOf(agg, k.size, k.base);
    const d = pairedDelta(runs, (run) => {
      const row = recordOf(run, k.size, k.variant);
      const base = recordOf(run, k.size, k.base);
      return row === null || base === null ? null : [row, base];
    });
    return [
      k.size,
      k.variant,
      plain === null ? '—' : num(plain.twoTick?.median, 1),
      num(k.twoTick?.median, 1),
      d.points === null ? '—' : signed(d.points.median),
      plain === null ? '—' : num(plain.sync?.median, 1),
      num(k.sync?.median, 1),
      d.ratio === null ? '—' : num(d.ratio.median) + '×',
      noise === null || d.points === null ? '—' : call(d.points.median, noise.twoTick?.p90),
      noise === null || d.ratio === null ? '—' : call(d.ratio.median - 1, noise.relSync?.p90),
    ];
  });
  return [
    `### Knobs — GL ${gl} (each against its plain row at the same size, paired per run)`,
    '',
    ...mdTable(['Size', 'Row', '2t plain', '2t knob', 'Δ pts', 'p95 plain', 'p95 knob', 'p95 ×', 'noise 2t', 'noise p95'], rows, [0, 1]),
    '',
    noise === null
      ? 'No noise floor (one run per version): every knob difference is unjudged.'
      : `"beyond" = the difference exceeds the noise floor’s p90 (two-tick ${num(noise.twoTick?.p90, 1)} points, synced` +
        ` p95 ${pct(noise.relSync?.p90)}${noise.pooled === true ? ', pooled over all outputs' : ''}); "within" = no call.`,
  ];
}

/**
 * The noise-floor section.
 *
 * @param {any} campaign - {@link loadCampaign}.
 * @returns {string[]} the lines.
 */
function noiseSection(campaign) {
  const out = ['## Noise floor — same-GL repeats', ''];
  const noise = campaign.noise;
  const counts = campaign.gls.map((gl) => `GL ${gl} × ${campaign.runsByGl.get(gl).length}`).join(', ');
  if (noise !== null && noise.pooled === true) {
    out.push(
      `**No same-GL repeats at this output** (${counts || 'no runs'}): falling back to the **pooled band of all outputs**` +
        ` (${noise.pooledFrom.join(', ')}). The band is a stand-in: a reduced output may jitter differently.`,
      '',
    );
  }
  if (noise === null) {
    out.push(
      `No noise floor: no WebGL version has ${MIN_RUNS_FOR_VERDICT} runs (${counts || 'no runs'}). Without one,` +
        ' no difference between runs can be judged.',
    );
    return out;
  }
  const perGl = campaign.gls
    .map((gl) => `GL ${gl}: ${noise.samples.filter((s) => s.gl === gl).length}`)
    .join(', ');
  out.push(
    `${noise.pooled === true ? 'Pooled over the outputs' : `Runs: ${counts}`}. ${noise.samples.length} scenario × version` +
      ` pair(s) measured at least twice (${perGl}). A pair’s` +
      ' spread is `(max − min) / median` of its synced p95 across runs, and `max − min` of its two-tick share in' +
      ' points.',
  );
  out.push('');
  const worst = (b, fmt) =>
    b === null
      ? '—'
      : `${fmt(b.worst)} ${b.worst.scenario} GL ${b.worst.gl}${noise.pooled === true ? ` @${b.worst.output}` : ''}`;
  out.push(
    ...mdTable(
      ['Spread', 'Pairs', 'Median', 'p90', 'Worst'],
      [
        [
          'synced p95, relative',
          String(noise.relSync?.n ?? 0),
          pct(noise.relSync?.median),
          pct(noise.relSync?.p90),
          worst(noise.relSync, (s) => pct(s.relSync)),
        ],
        [
          'two-tick share, points',
          String(noise.twoTick?.n ?? 0),
          num(noise.twoTick?.median, 1),
          num(noise.twoTick?.p90, 1),
          worst(noise.twoTick, (s) => num(s.twoTick, 1)),
        ],
      ],
      [0, 4],
    ),
  );
  out.push('');
  const drift = noise.drift;
  if (drift !== undefined && drift.pairs > 0) {
    out.push(
      `Run-to-run drift (a whole run moving on its own: the median over scenarios of one run against another of the` +
        ` same version, largest of ${drift.pairs} pair(s)): two-tick **${num(drift.twoTick, 1)} points**, synced p95` +
        ` **${pct(drift.relSync)}**.`,
    );
    out.push('');
  }
  out.push(
    'GL 1 vs 2 calls a scenario’s difference only beyond the **p90** spread *and* with the two versions’ run' +
      ' ranges apart; the overall shift (the median of the per-scenario differences) only beyond the run-to-run' +
      ' **drift**. Two-tick share is the stable metric; synced p95 is the noisy one.',
  );
  return out;
}

/**
 * The WebGL 1-vs-2 verdict (plan §13, review F8): only with ≥ {@link MIN_RUNS_FOR_VERDICT} runs of each version,
 * and only differences beyond the noise floor.
 *
 * @param {any} campaign - {@link loadCampaign}.
 * @param {{full?: boolean}} [options] - `full`: list every compared scenario, not only the called ones.
 * @returns {string[]} the lines.
 */
export function glVerdict(campaign, options = {}) {
  const out = ['## WebGL 1 vs 2 (plan §13, review F8)', ''];
  const n1 = campaign.runsByGl.get(1)?.length ?? 0;
  const n2 = campaign.runsByGl.get(2)?.length ?? 0;
  if (n1 === 0 || n2 === 0) {
    out.push(`No comparison: the sessions hold WebGL ${campaign.gls.join(' + ') || '?'} runs only.`);
    return out;
  }
  if (n1 < MIN_RUNS_FOR_VERDICT || n2 < MIN_RUNS_FOR_VERDICT) {
    out.push(
      `**No verdict:** it needs ≥ ${MIN_RUNS_FOR_VERDICT} runs of each WebGL version, these sessions hold` +
        ` GL 1 × ${n1} and GL 2 × ${n2}. Identical runs of one version differ by as much as the versions do (R0-03:` +
        ' up to 1.51× in synced p95), so a single run of a version cannot be told from run-to-run noise — record' +
        ' the campaign (GL 1, GL 2, GL 1, GL 2) and analyse the four sessions together.',
    );
    return out;
  }
  const noise = campaign.noise;
  const a1 = campaign.aggregates.get(1);
  const a2 = campaign.aggregates.get(2);
  const compared = [];
  for (const a of a1.values()) {
    const b = a2.get(a.scenario);
    if (b === undefined) continue;
    const points = a.twoTick !== null && b.twoTick !== null ? b.twoTick.median - a.twoTick.median : null;
    const ratio = a.sync !== null && b.sync !== null && a.sync.median > 0 ? b.sync.median / a.sync.median : null;
    compared.push({
      a,
      b,
      points,
      ratio,
      callPoints: scenarioCall(points, noise?.twoTick?.p90, a.twoTick, b.twoTick),
      callRatio: ratio === null ? '—' : scenarioCall(ratio - 1, noise?.relSync?.p90, a.sync, b.sync),
    });
  }
  compared.sort((x, y) => x.a.index - y.a.index);
  const tally = (key, value, callKey) => {
    const better = compared.filter((c) => c[callKey] === 'beyond' && c[key] < value).length;
    const worse = compared.filter((c) => c[callKey] === 'beyond' && c[key] > value).length;
    const within = compared.filter((c) => c[callKey] === 'within').length;
    return { better, worse, within };
  };
  const t2 = tally('points', 0, 'callPoints');
  const tp = tally('ratio', 1, 'callRatio');
  const medPoints = quantile(compared.map((c) => c.points), 0.5);
  const medRatio = quantile(compared.map((c) => c.ratio), 0.5);
  const overallPoints = call(medPoints, noise?.drift?.twoTick);
  const overallRatio = medRatio === null ? '—' : call(medRatio - 1, noise?.drift?.relSync);
  out.push(
    `GL 1 × ${n1} runs against GL 2 × ${n2}, ${compared.length} scenario(s) in both; each version’s figure is its` +
      ' median across runs. Lower is better for both metrics.',
  );
  out.push('');
  out.push(
    ...mdTable(
      ['Metric', 'GL 2 better', 'GL 2 worse', 'Within noise', 'Overall (median)', 'Overall band', 'Overall'],
      [
        ['two-tick share', String(t2.better), String(t2.worse), String(t2.within), `${signed(medPoints)} pts`, `${num(noise?.drift?.twoTick, 1)} pts`, overallPoints],
        ['synced p95', String(tp.better), String(tp.worse), String(tp.within), medRatio === null ? '—' : num(medRatio) + '×', pct(noise?.drift?.relSync), overallRatio],
      ],
      [0],
    ),
  );
  const isBusy = (c) => c.a.scenario === `${V2_SIZE}-busy`;
  const called = compared.filter((c) => c.callPoints === 'beyond' || c.callRatio === 'beyond' || isBusy(c));
  // Without --full the called scenarios are capped: the largest two-tick differences, shown in matrix order.
  const shown =
    options.full === true
      ? compared
      : called.length <= CALLED_LIST_MAX
        ? called
        : called
            .filter((c) => !isBusy(c))
            .sort((x, y) => Math.abs(y.points ?? 0) - Math.abs(x.points ?? 0))
            .slice(0, CALLED_LIST_MAX - 1)
            .concat(called.filter(isBusy));
  const listed = compared.filter((c) => shown.includes(c));
  if (listed.length > 0) {
    out.push('');
    out.push(
      options.full === true
        ? 'Every compared scenario:'
        : listed.length < called.length
          ? `The ${listed.filter((c) => !isBusy(c)).length} largest two-tick differences of the` +
            ` ${called.filter((c) => !isBusy(c)).length} scenario(s) beyond the` +
            ` p90 band (and ${V2_SIZE}-busy); \`--full\` lists all:`
          : `Scenarios with a difference beyond the p90 band (and ${V2_SIZE}-busy); \`--full\` lists all:`,
    );
    out.push('');
    out.push(
      ...mdTable(
        ['Scenario', '2t GL 1', '2t GL 2', 'Δ pts', '2t', 'p95 GL 1', 'p95 GL 2', 'p95 ×', 'p95'],
        listed.map((c) => [
          c.a.scenario,
          cell(c.a.twoTick, 1),
          cell(c.b.twoTick, 1),
          signed(c.points),
          c.callPoints,
          cell(c.a.sync, 1),
          cell(c.b.sync, 1),
          c.ratio === null ? '—' : num(c.ratio) + '×',
          c.callRatio,
        ]),
        [0, 4, 8],
      ),
    );
  }
  out.push('');
  const busy = compared.find((c) => c.a.scenario === `${V2_SIZE}-busy`);
  if (busy === undefined || busy.ratio === null) {
    out.push(`§13’s rule: no ${V2_SIZE}-busy row in both versions — no rule verdict.`);
  } else if (busy.ratio <= 1 - WEBGL2_GAIN && busy.callRatio === 'beyond') {
    out.push(
      `§13’s rule: WebGL 2 is clearly better at 640×360 (${num(busy.ratio)}× the synced p95, beyond the noise` +
        ` floor’s ${pct(noise?.relSync?.p90)}).`,
    );
  } else if (busy.ratio <= 1 - WEBGL2_GAIN) {
    out.push(
      `§13’s rule: ${num(busy.ratio)}× the synced p95 at 640×360 would pass ≤ ${num(1 - WEBGL2_GAIN)}×, but it is` +
        ` within noise (p90 band ${pct(noise?.relSync?.p90)}) — no verdict.`,
    );
  } else {
    out.push(`§13’s rule: WebGL 2 is not clearly better at 640×360 (${num(busy.ratio)}× the synced p95, the rule is ≤ ${num(1 - WEBGL2_GAIN)}×).`);
  }
  out.push('');
  const verdict = (() => {
    const better = overallPoints === 'beyond' && medPoints < 0;
    const worse = (overallPoints === 'beyond' && medPoints > 0) || (overallRatio === 'beyond' && medRatio > 1);
    const p95Better = overallRatio === 'beyond' && medRatio < 1;
    if (better && !worse) {
      return 'WebGL 2 is better beyond the noise floor (two-tick share): §13 — a step to make WebGL 2 the TV default with a WebGL 1 fallback.';
    }
    if (worse && !better && !p95Better) return 'WebGL 2 is worse beyond the noise floor: WebGL 1 stays the default.';
    if (better || worse || p95Better) return 'mixed — the two metrics disagree beyond noise: no verdict; WebGL 1 stays the default.';
    // No overall shift, but the per-scenario calls may still lean one way (a gain on some variants only).
    const lean = Math.max(3, Math.ceil(compared.length / 10));
    if (t2.better >= lean && t2.worse === 0) {
      return `within noise overall — no verdict; but WebGL 2 is better beyond noise on ${t2.better} scenario(s) and` +
        ' worse on none (two-tick share; the list above): worth a targeted look, WebGL 1 stays the default.';
    }
    if (t2.worse >= lean && t2.better === 0) {
      return `within noise overall — no verdict; but WebGL 2 is worse beyond noise on ${t2.worse} scenario(s) and` +
        ' better on none (two-tick share): WebGL 1 stays the default.';
    }
    return 'within noise — no verdict: WebGL 1 (the shipped default) stays.';
  })();
  out.push(`**Verdict:** ${verdict}`);
  return out;
}

/**
 * Turns a block's headings one level down (`## x` → `### x`), so the block sits under its output's heading.
 *
 * @param {string[]} lines - the block's lines.
 * @returns {string[]} the lines, every Markdown heading one level deeper.
 */
function demote(lines) {
  return lines.map((line) => (/^#{1,5} /.test(line) ? '#' + line : line));
}

/**
 * The report of one output: its runs per WebGL version (summary matrices, plan §13, knobs), its noise floor and
 * its GL 1-vs-2 verdict — everything a single-output campaign always printed.
 *
 * @param {any} oc - an output campaign of {@link loadCampaign}.
 * @param {{full?: boolean}} options - `full`: every compared scenario of the verdict.
 * @returns {string[]} the lines, headings at level 1 / 2 / 3 (the caller demotes them).
 */
function outputBlock(oc, options) {
  const out = [];
  const gls = oc.gls.map((gl) => `GL ${gl} × ${oc.runsByGl.get(gl).length}`).join(', ') || 'no runs';
  out.push(`# Output ${oc.output.label}`, '');
  out.push(
    `${oc.sessions.length} session(s) (${oc.sessions.map((s) => s.id).join(', ')}); runs: ${gls}.` +
      (oc.output.window
        ? ' The canvas fills the window (no `env.output`).'
        : ' The canvas backbuffer is this size; the page is scaled to the window.'),
  );
  for (const gl of oc.gls) {
    const n = oc.runsByGl.get(gl).length;
    const how = n === 1 ? 'one run' : `median ±half the min–max range of ${n} runs`;
    out.push('');
    out.push(`## WebGL ${gl} — ${n} run(s)`);
    out.push('');
    out.push(`### Two-tick share % (frames the vsync-locked loop needed two ticks for) — ${how}`);
    out.push('');
    out.push(...summaryMatrix(oc, gl, 'twoTick', 1));
    out.push('');
    out.push(`### Synced render p95 ms (\`gl.finish()\` after every render) — ${how}`);
    out.push('');
    out.push(...summaryMatrix(oc, gl, 'sync', 1));
    const s13 = section13Block(oc, gl);
    if (s13.length > 0) out.push('', ...s13);
    const knobs = knobTable(oc, gl);
    if (knobs.length > 0) out.push('', ...knobs);
  }
  out.push('');
  out.push(...noiseSection(oc));
  out.push('');
  out.push(...glVerdict(oc, options));
  return out;
}

/**
 * Per scenario (plain rows only: size × load variant) the median across an output's runs of the two-tick share
 * (percent) and of the synced p95 (ms).
 *
 * @param {any} oc - an output campaign.
 * @param {number | null} gl - only this WebGL version's runs, or null for all of them pooled.
 * @returns {Map<string, {size: string, variant: string, index: number, twoTick: number | null, sync: number | null}>}
 *   the cells by `size|variant`; a scenario the output skipped has none.
 */
export function outputCells(oc, gl) {
  const acc = new Map();
  for (const [g, runs] of oc.runsByGl) {
    if (gl !== null && g !== gl) continue;
    for (const run of runs) {
      for (const r of run.byScenario.values()) {
        if (parseRow(r.variant).knob !== null) continue;
        const key = `${r.size}|${r.variant}`;
        let a = acc.get(key);
        if (a === undefined) {
          a = { size: r.size, variant: r.variant, index: typeof r.index === 'number' ? r.index : 0, twoTick: [], sync: [] };
          acc.set(key, a);
        }
        a.twoTick.push(typeof r.twoTickShare === 'number' ? r.twoTickShare * 100 : null);
        a.sync.push(p95Of(r.syncedMs));
      }
    }
  }
  const out = new Map();
  for (const [key, a] of acc) out.set(key, { ...a, twoTick: quantile(a.twoTick, 0.5), sync: quantile(a.sync, 0.5) });
  return out;
}

/**
 * Whether a reduced output's cell beats the reference output's by more than the noise band: the two-tick
 * share lower by more than the larger of the two outputs' p90 spreads (points), the synced p95 lower by more
 * than the larger relative p90 spread.
 *
 * @param {any} ref - the reference cell (`{twoTick, sync}`) or undefined.
 * @param {any} cur - the reduced output's cell or undefined.
 * @param {any} refNoise - the reference output's noise band (or null).
 * @param {any} curNoise - the reduced output's noise band (or null).
 * @returns {{twoTick: boolean, sync: boolean, points: number | null, ratio: number | null}} the calls and the
 *   differences (points; ratio of the synced p95s).
 */
export function beatsReference(ref, cur, refNoise, curNoise) {
  const bandOf = (key) => {
    const v = [refNoise?.[key]?.p90, curNoise?.[key]?.p90].filter((x) => typeof x === 'number');
    return v.length === 0 ? null : Math.max(...v);
  };
  const both = ref !== undefined && cur !== undefined;
  const points = both && ref.twoTick !== null && cur.twoTick !== null ? cur.twoTick - ref.twoTick : null;
  const ratio = both && ref.sync !== null && cur.sync !== null && ref.sync > 0 ? cur.sync / ref.sync : null;
  const twoBand = bandOf('twoTick');
  const syncBand = bandOf('relSync');
  return {
    twoTick: points !== null && twoBand !== null && points < -twoBand,
    sync: ratio !== null && syncBand !== null && ratio < 1 - syncBand,
    points,
    ratio,
  };
}

/**
 * The load variants of some cells in column order: the known ones, then any other.
 *
 * @param {Map<string, any>[]} cells - {@link outputCells} per output.
 * @returns {string[]} the variants.
 */
function cellVariants(cells) {
  return [
    ...VARIANTS,
    ...new Set(cells.flatMap((c) => [...c.values()].map((x) => x.variant)).filter((v) => !VARIANTS.includes(v))),
  ];
}

/**
 * The cross-output table of one WebGL selection: one row per size × load variant, the two-tick share and the
 * synced p95 at every output side by side (`—` where the output skipped the row). A `*` marks a reduced output
 * that beats the largest output beyond the noise band.
 *
 * @param {any[]} outputs - the output campaigns, largest first.
 * @param {number | null} gl - only this version's runs, or null for all pooled.
 * @param {any[]} sizes - the size order.
 * @returns {string[]} the lines (empty without any row).
 */
function crossOutputTable(outputs, gl, sizes) {
  const cells = outputs.map((o) => outputCells(o, gl));
  const rows = [];
  for (const size of sizes) {
    for (const variant of cellVariants(cells)) {
      const key = `${size.id}|${variant}`;
      const here = cells.map((c) => c.get(key));
      if (here.every((c) => c === undefined)) continue;
      const mark = (i, field) =>
        i > 0 && beatsReference(here[0], here[i], outputs[0].noise, outputs[i].noise)[field] ? '*' : '';
      rows.push([
        size.id,
        variant,
        ...here.map((c, i) => (c === undefined ? '—' : num(c.twoTick, 1) + mark(i, 'twoTick'))),
        ...here.map((c, i) => (c === undefined ? '—' : num(c.sync, 1) + mark(i, 'sync'))),
      ]);
    }
  }
  if (rows.length === 0) return [];
  const ids = outputs.map((o) => o.output.id);
  return mdTable(['Size', 'Variant', ...ids.map((id) => `2t % ${id}`), ...ids.map((id) => `p95 ms ${id}`)], rows, [0, 1]);
}

/**
 * Where the reduced outputs beat the largest one: per load variant, the sizes whose two-tick share or synced
 * p95 is lower by more than the noise band (pooled over the WebGL versions).
 *
 * @param {any[]} outputs - the output campaigns, largest first.
 * @param {any[]} sizes - the size order.
 * @returns {string[]} one bullet per variant that has a row at the largest output and a reduced one.
 */
function crossOutputVerdicts(outputs, sizes) {
  const ref = outputs[0];
  const cells = outputs.map((o) => outputCells(o, null));
  const out = [];
  for (const variant of cellVariants(cells)) {
    const clauses = [];
    for (let i = 1; i < outputs.length; i++) {
      let compared = 0;
      const two = [];
      const sync = [];
      for (const size of sizes) {
        const key = `${size.id}|${variant}`;
        const b = beatsReference(cells[0].get(key), cells[i].get(key), ref.noise, outputs[i].noise);
        if (b.points === null && b.ratio === null) continue;
        compared += 1;
        if (b.twoTick) two.push({ size: size.id, points: b.points });
        if (b.sync) sync.push({ size: size.id, ratio: b.ratio });
      }
      if (compared === 0) continue;
      const parts = [];
      if (two.length > 0) {
        const best = two.reduce((w, x) => (x.points < w.points ? x : w));
        parts.push(`two-tick at ${two.length}/${compared} size(s) (most: ${best.size} ${signed(best.points)} pts)`);
      }
      if (sync.length > 0) {
        const best = sync.reduce((w, x) => (x.ratio < w.ratio ? x : w));
        parts.push(`synced p95 at ${sync.length}/${compared} size(s) (most: ${best.size} ${num(best.ratio)}×)`);
      }
      clauses.push(
        `${outputs[i].output.id} ${parts.length > 0 ? 'beats ' + ref.output.id + ' on ' + parts.join(' and ') : 'beats it nowhere'}` +
          ` (${compared} size(s) compared)`,
      );
    }
    if (clauses.length > 0) out.push(`- **${variant}** — ${clauses.join('; ')}.`);
  }
  return out;
}

/**
 * The campaign's output campaigns grouped by the build they were recorded on, in first-seen order. The
 * partition the 2026-10-27 contamination law asks for: aggregation pools noise inside a build and the
 * cross-output comparison compares inside a build, never across builds.
 *
 * @param {any[]} outputs - the output campaigns (each `output.buildId` set by {@link loadCampaign}).
 * @returns {Map<string, any[]>} the outputs of each build.
 */
function groupsByBuild(outputs) {
  const byBuild = new Map();
  for (const o of outputs) {
    const b = o.output.buildId ?? '?';
    const list = byBuild.get(b);
    if (list === undefined) byBuild.set(b, [o]);
    else list.push(o);
  }
  return byBuild;
}

/**
 * The cross-output comparison of ONE build (only with ≥ 2 outputs of it): every size × variant at each output
 * side by side, and a line per variant on where the reduced outputs beat the largest beyond the noise band.
 *
 * @param {any[]} outputs - the build's output campaigns, largest first.
 * @param {string | null} buildId - the build to name in the heading, or null to leave it unnamed (a
 *   single-build campaign — the shape every older campaign has).
 * @param {{full?: boolean}} [options] - `full`: also the table per WebGL version.
 * @returns {string[]} the lines (empty without any row).
 */
function crossOutputBlock(outputs, buildId, options = {}) {
  const ref = outputs[0];
  const sizes = sizeOrder(outputs.flatMap((o) => o.sessions.flatMap((s) => s.records)));
  const cells = outputs.map((o) => outputCells(o, null));
  const out = [`## Cross-output comparison${buildId === null ? '' : ` — build ${buildId}`}`, ''];
  out.push(
    `Outputs, largest first: ${outputs.map((o) => o.output.label).join(' · ')}. Each cell is the **median over all runs of` +
      ' that output** (both WebGL versions pooled; `--full` adds a table per version) for a plain row — knob rows are' +
      ' not compared. `—` = the output skipped the row (its frame is larger than the output) or has no run of it.' +
      ` \`*\` = a reduced output beats ${ref.output.id} by more than the noise band (the larger of the two outputs’ p90` +
      ' spreads: two-tick in points, synced p95 relative). The M7’s run-to-run noise is as large as many of these' +
      ' differences — a mark is a hint to look, not a verdict.',
  );
  const tableOf = (gl) => crossOutputTable(outputs, gl, sizes);
  const pooled = tableOf(null);
  out.push('');
  if (pooled.length === 0) {
    out.push('No plain rows to compare.');
    return out;
  }
  out.push(...pooled);
  const lines = crossOutputVerdicts(outputs, sizes);
  out.push('', `Where the reduced outputs beat ${ref.output.id} beyond the noise band, per load variant:`, '');
  out.push(...(lines.length > 0 ? lines : ['- none: no row has a reduced output and the largest in common.']));
  if (options.full === true) {
    const gls = [...new Set(outputs.flatMap((o) => o.gls))].sort();
    for (const gl of gls) {
      const t = tableOf(gl);
      if (t.length > 0) out.push('', `### Cross-output — WebGL ${gl} runs only`, '', ...t);
    }
  }
  return out;
}

/**
 * The cross-output comparison (only with ≥ 2 outputs of one build): a block per such build. A campaign whose
 * outputs all belong to different builds prints the refusal — builds are never compared in one table
 * (the 2026-10-27 contamination law).
 *
 * @param {any} campaign - {@link loadCampaign}.
 * @param {{full?: boolean}} [options] - `full`: also the table per WebGL version.
 * @returns {string[]} the lines.
 */
export function crossOutputSection(campaign, options = {}) {
  const byBuild = groupsByBuild(campaign.outputs);
  const comparable = [...byBuild.values()].filter((outs) => outs.length > 1);
  const out = [];
  if (comparable.length === 0) {
    out.push('## Cross-output comparison', '');
    out.push(
      'No cross-output comparison: no build contributes two output resolutions to this campaign. Sessions of' +
        ' different builds are never compared in one table (the 2026-10-27 contamination law) — every build' +
        ' keeps its own output block above.',
    );
    return out;
  }
  for (const [buildId, outs] of byBuild) {
    if (outs.length <= 1) continue;
    if (out.length > 0) out.push('');
    out.push(...crossOutputBlock(outs, byBuild.size > 1 ? buildId : null, options));
  }
  return out;
}

/**
 * The campaign report: the sessions, then per output resolution (largest first) per WebGL version the summary
 * matrices, plan §13 and the knob table, the noise floor and the GL 1-vs-2 verdict; with ≥ 2 outputs the
 * cross-output comparison; then the decode section; with `full` (or `withRecords`) each session’s own report
 * after it.
 *
 * @param {string[]} paths - session files and folders of them.
 * @param {{withRecords?: boolean, full?: boolean}} [options] - `full`: the per-session detail reports, every
 *   compared scenario of the verdict and the cross-output table per version; `withRecords`: the per-session
 *   reports with every record in full.
 * @returns {string} the Markdown report.
 */
export function analyzeBenchSessions(paths, options = {}) {
  const files = expandSessionArgs(paths);
  const campaign = loadCampaign(files);
  if (campaign.sessions.length === 0) return 'no payloads in ' + (files.join(', ') || paths.join(', '));
  const latest = campaign.sessions[campaign.sessions.length - 1];
  const env = latest.env;
  const multi = campaign.outputs.length > 1;
  const out = [];
  out.push(`# TV render bench — ${campaign.sessions.length} session(s)`);
  out.push('');
  out.push(
    `From ${latest.from ?? '?'} · host ${env.host ?? '?'} · display ${env.innerWidth ?? '?'}×${env.innerHeight ?? '?'}` +
      ` @${env.devicePixelRatio ?? '?'} · UA ${env.userAgent ?? '?'}`,
  );
  out.push('');
  out.push(
    ...mdTable(
      ['#', 'Session', ...(multi ? ['Output'] : []), 'GL', 'Scenarios', 'Run', 'Build', 'Zone load cold / change ms'],
      campaign.sessions.map((s, i) => {
        const gls = [...new Set(s.records.map((r) => r.webGLVersion))].sort().join('+') || '?';
        const est = s.decode === null ? null : decodeZoneEstimate(s.decode);
        return [
          String(i + 1),
          s.id,
          ...(multi ? [s.output.id] : []),
          gls,
          `${s.records.length}/${typeof s.env.scenarios === 'number' ? s.env.scenarios : '?'}`,
          s.complete ? 'complete' : '**incomplete**',
          s.env.buildId ?? '?',
          est === null ? '—' : `${num(est.lazyMs, 0)} / ${num(est.eagerMs, 0)}`,
        ];
      }),
      multi ? [1, 2, 5, 6] : [1, 4, 5],
    ),
  );
  for (const oc of campaign.outputs) {
    out.push('');
    out.push(...demote(outputBlock(oc, options)));
  }
  if (multi) {
    out.push('');
    out.push(...crossOutputSection(campaign, options));
  }
  const withDecode = [...campaign.sessions].reverse().find((s) => s.decode !== null);
  if (withDecode !== undefined) {
    out.push('');
    const lines = decodeSection(withDecode.decode);
    out.push(lines[0], '', `From the latest session with one (${withDecode.id}); every session’s estimate is in the table above.`);
    out.push(...lines.slice(1));
  }
  if (options.full === true || options.withRecords === true) {
    for (const s of campaign.sessions) out.push('', '---', '', analyzeBenchSession(s.file, options));
  }
  return out.join('\n');
}

// ------------------------------------------------------------------ CLI
/** True when run as a script (`node results/analyze-bench.mjs`), false when imported (tests). */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const files = args.filter((arg) => !arg.startsWith('--'));
  if (files.length === 0) {
    console.error('usage: node results/analyze-bench.mjs <session.jsonl | folder> [more …] [--full] [--records]');
    process.exit(2);
  }
  console.log(analyzeBenchSessions(files, { withRecords: args.includes('--records'), full: args.includes('--full') }));
}
