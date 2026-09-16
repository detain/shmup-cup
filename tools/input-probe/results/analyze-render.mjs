#!/usr/bin/env node
/**
 * Turns a render-telemetry session (from `npm run log-server`, plan M3-02f) into the tables waiting in
 * `docs/dev/input-probe-results.md` §11 — so the results are **pasted, not transcribed**.
 *
 * The game's dev build (`pnpm --filter @shmup/tizen build:dev` with `VITE_REPORT_URL=http://<desktop>:8787`)
 * POSTs one payload every 3 s; each carries the sampling windows closed since the last successful send, and
 * each window carries **distributions** (min / median / p95 / max of the frame, tick, render and draw-call
 * series, plus the TPF and rAF bucket counts) rather than a glanced reading. This script groups those
 * windows the way the measurement table of `docs/dev/rendering-and-shell.md` § Measuring on the TV asks
 * (the render review's §4, M1–M8) and prints ready-made Markdown.
 *
 * Usage (from tools/input-probe/):
 *   node results/analyze-render.mjs results/2026-xx-xx/rp-xxxxx.jsonl [--all] [--windows]
 *
 *   --all      keep the windows a report POST was in flight during (excluded by default: the sender's own
 *              XHR runs on the main thread, so such a window may have recorded the sender as a render cost)
 *   --windows  also list every window
 *
 * How a group's figures are derived from the windows' own distributions: **min** is the smallest window
 * minimum, **p50** and **p95** are the medians of the windows' p50s and p95s (a median of p95s, not a p95
 * of p95s — one bad window must not become the answer), and **max** is the single worst frame seen.
 *
 * Zero dependencies; prints plain text with Markdown tables.
 *
 * @module results/analyze-render
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Live enemy bullets from which a window counts as a dense (boss-grade) scene. */
const DENSE_BULLETS = 60;

/** How long after the session start a window still counts as "a fresh launch" (ms). */
const FRESH_LAUNCH_MS = 120_000;

/** Frame time (ms) at or above which a window is reported as carrying a hitch. */
const HITCH_MS = 30;

/**
 * Reads a session's payloads, newest duplicates of a `seq` dropped.
 *
 * @param {string} file - Path to the `<session>.jsonl` the log server wrote.
 * @returns {{payloads: any[], windows: any[]}} the payloads in arrival order and every window they carry.
 */
export function readSession(file) {
  const payloads = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  const seen = new Set();
  const windows = [];
  for (const p of payloads) {
    if (seen.has(p.seq)) continue;
    seen.add(p.seq);
    for (const s of p.samples ?? []) windows.push(s);
  }
  windows.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  return { payloads, windows };
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
 * The median of a list of numbers.
 *
 * @param {number[]} values - the values (not modified).
 * @returns {number | null} the median, or null when the list is empty.
 */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(0.5 * (sorted.length - 1) + 0.5))];
}

/**
 * Folds the windows' own `[min, p50, p95, max]` tuples of one field into the group's figures.
 *
 * @param {any[]} windows - the group's windows.
 * @param {string} field - `'renderMs'`, `'tickMs'`, `'frameMs'` or `'drawCalls'`.
 * @returns {{min: number|null, p50: number|null, p95: number|null, max: number|null}} the figures.
 */
export function aggregate(windows, field) {
  const mins = [];
  const p50s = [];
  const p95s = [];
  const maxes = [];
  for (const w of windows) {
    const d = w[field];
    if (!Array.isArray(d) || d.length < 4) continue;
    mins.push(d[0]);
    p50s.push(d[1]);
    p95s.push(d[2]);
    maxes.push(d[3]);
  }
  if (p50s.length === 0) return { min: null, p50: null, p95: null, max: null };
  return {
    min: Math.min(...mins),
    p50: median(p50s),
    p95: median(p95s),
    max: Math.max(...maxes),
  };
}

/**
 * Frames per second over a group, from the windows' frame counts and durations.
 *
 * @param {any[]} windows - the group's windows.
 * @returns {number | null} the rate, or null when the group is empty.
 */
function groupFps(windows) {
  let frames = 0;
  let ms = 0;
  for (const w of windows) {
    frames += w.frames ?? 0;
    ms += w.durationMs ?? 0;
  }
  return ms > 0 ? (frames * 1000) / ms : null;
}

/**
 * Sums a per-window counter array (the TPF or rAF buckets).
 *
 * @param {any[]} windows - the group's windows.
 * @param {string} field - `'tickFrames'` or `'raf'`.
 * @param {number} length - how many buckets.
 * @returns {number[]} the totals.
 */
function buckets(windows, field, length) {
  const out = new Array(length).fill(0);
  for (const w of windows) {
    const list = w[field];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < Math.min(length, list.length); i++) out[i] += list[i] ?? 0;
  }
  return out;
}

/**
 * Structure rebuilds and frames of a group (the review's F1: near-equal means every frame pays).
 *
 * @param {any[]} windows - the group's windows.
 * @returns {{rebuilds: number, frames: number}} the totals.
 */
function rebuilds(windows) {
  let r = 0;
  let f = 0;
  for (const w of windows) {
    r += w.rebuilds ?? 0;
    f += w.frames ?? 0;
  }
  return { rebuilds: r, frames: f };
}

/**
 * The largest pooled render-target reading of a group (it only ever goes up within a session).
 *
 * @param {any[]} windows - the group's windows.
 * @returns {number | null} kilobytes, or null when the group is empty.
 */
function renderTargetKb(windows) {
  let kb = null;
  for (const w of windows) {
    if (typeof w.renderTargetKb === 'number') kb = kb === null ? w.renderTargetKb : Math.max(kb, w.renderTargetKb);
  }
  return kb;
}

/**
 * Seconds a group covers.
 *
 * @param {any[]} windows - the group's windows.
 * @returns {number} seconds.
 */
function seconds(windows) {
  let ms = 0;
  for (const w of windows) ms += w.durationMs ?? 0;
  return ms / 1000;
}

/**
 * Whether a window was taken inside a stage.
 *
 * @param {any} w - the window.
 * @returns {boolean} true when its context names a stage.
 */
const inStage = (w) => typeof w.context?.stage === 'string' && w.context.stage !== '';

/**
 * Whether a window was taken on a dense (boss-grade) scene.
 *
 * @param {any} w - the window.
 * @returns {boolean} true at or above {@link DENSE_BULLETS} live enemy bullets.
 */
const isDense = (w) => (w.context?.bullets ?? 0) >= DENSE_BULLETS;

/**
 * One row of the §11.1 baseline table.
 *
 * @param {string} label - the row's name.
 * @param {any[]} windows - its windows.
 * @returns {string} the Markdown row (empty cells when the group is empty).
 */
function baselineRow(label, windows) {
  if (windows.length === 0) return `| ${label} | | | | | | | | | *(not captured)* |`;
  const tick = aggregate(windows, 'tickMs');
  const render = aggregate(windows, 'renderMs');
  const draw = aggregate(windows, 'drawCalls');
  const reb = rebuilds(windows);
  const tpf = buckets(windows, 'tickFrames', 4);
  const locked = windows.every((w) => w.context?.vsyncLock === true);
  return (
    `| ${label} | ${num(groupFps(windows), 1)} | ${num(tick.p50)} (p95 ${num(tick.p95)}) |` +
    ` ${num(render.p50)} (p95 ${num(render.p95)}, max ${num(render.max)}) | ${num(draw.p50, 0)} |` +
    ` ${reb.rebuilds} / ${reb.frames} | ${renderTargetKb(windows) ?? '—'} | ${tpf.join('/')} |` +
    ` ${locked ? 'yes' : 'no'} |`
  );
}

/**
 * The §11.1 baseline table — title, mid-stage and boss — plus the session's boot time.
 *
 * @param {any[]} windows - the session's windows.
 * @param {any} env - the last payload's `env`.
 * @returns {string[]} the lines.
 */
function baselineTable(windows, env) {
  const title = windows.filter((w) => w.context?.scene === 'title');
  const stage = windows.filter((w) => inStage(w) && !isDense(w));
  const boss = windows.filter((w) => inStage(w) && isDense(w));
  return [
    '### 11.1 Baseline',
    '',
    '| Where | FPS | TICK ms | RENDER ms | DRAW | REB / frames | RT KB | TPF 0/1/2/3+ | LOCK |',
    '|---|---|---|---|---|---|---|---|---|',
    baselineRow('Title, idle', title),
    baselineRow('Zone A, mid-stage', stage),
    baselineRow('Zone A, boss', boss),
    '',
    `Boot ms: ${env.bootMs ?? '—'} (budget 10 000). Bundle measured: \`${env.buildId ?? '?'}\`.`,
    `rAF histogram over everything (12/15/17/19/21/25/33 ms buckets): ${buckets(windows, 'raf', 8).join(' ')}`,
    '',
  ];
}

/**
 * Groups windows by a key their context gives.
 *
 * @param {any[]} windows - the windows.
 * @param {(w: any) => string | null} key - the grouping key, or null to skip the window.
 * @returns {Map<string, any[]>} the groups, in first-seen order.
 */
function groupBy(windows, key) {
  const out = new Map();
  for (const w of windows) {
    const k = key(w);
    if (k === null) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(w);
  }
  return out;
}

/**
 * The §11.2 measurement rows, M1–M8, each answered from the windows that carry its mark.
 *
 * @param {any[]} windows - the session's windows.
 * @param {any} last - the last payload.
 * @returns {string[]} the lines.
 */
function measurementTable(windows, last) {
  const title = windows.filter((w) => w.context?.scene === 'title');
  const dense = windows.filter((w) => inStage(w) && isDense(w));
  const stageWindows = windows.filter(inStage);
  const lines = ['### 11.2 The measurements', '', '| # | What | Result |', '|---|---|---|'];

  // M1 — the per-frame scene rebuild (F1).
  const titleRender = aggregate(title, 'renderMs');
  const denseRender = aggregate(dense, 'renderMs');
  const all = rebuilds(windows);
  lines.push(
    `| M1 | RENDER ms, title vs. a dense scene, against the rebuild rate (**F1**) |` +
      ` title p95 ${num(titleRender.p95)} ms, dense p95 ${num(denseRender.p95)} ms;` +
      ` ${all.rebuilds} of ${all.frames} frames rebuilt the scene |`,
  );

  // M2 — what the CRT look costs after M3-02d.
  const byCrt = groupBy(stageWindows, (w) => w.context?.crtFilter ?? null);
  const crtCells = [];
  for (const setting of ['off', 'light', 'full']) {
    const group = byCrt.get(setting) ?? [];
    const render = aggregate(group, 'renderMs');
    crtCells.push(
      `${setting}: ${group.length === 0 ? 'not captured' : `p95 ${num(render.p95)} ms, RT ${renderTargetKb(group) ?? '—'} KB (${num(seconds(group), 0)} s)`}`,
    );
  }
  lines.push(`| M2 | RENDER ms and RT with CRT off / light / full (**F2**) | ${crtCells.join('; ')} |`);

  // M3 — entry hitches into the Mode-7 and layer-effect stages (F4).
  const byStage = groupBy(stageWindows, (w) => w.context?.stage ?? null);
  const stageCells = [];
  for (const [stage, group] of byStage) {
    const frame = aggregate(group, 'frameMs');
    stageCells.push(`${stage}: worst frame ${num(frame.max, 1)} ms, RT ${renderTargetKb(group) ?? '—'} KB`);
  }
  lines.push(
    `| M3 | Frame-graph spike entering each stage (**F4**) | ${stageCells.length === 0 ? 'not captured' : stageCells.join('; ')} |`,
  );

  // M4 — the batch-growth hitch on the first dense pattern of a fresh launch (F5).
  const fresh = dense.filter((w) => (w.startMs ?? 0) <= FRESH_LAUNCH_MS);
  const later = dense.filter((w) => (w.startMs ?? 0) > FRESH_LAUNCH_MS);
  lines.push(
    `| M4 | Frame-graph spike on the first very dense pattern of a fresh launch (**F5**) |` +
      ` fresh worst frame ${num(aggregate(fresh, 'frameMs').max, 1)} ms (${fresh.length} windows),` +
      ` later ${num(aggregate(later, 'frameMs').max, 1)} ms (${later.length} windows) |`,
  );

  // M5 — WebGL1 vs WebGL2 (F8). One session runs one context; the analyzer states this one.
  const byGl = groupBy(stageWindows, (w) => String(w.context?.webGLVersion ?? '?'));
  const glCells = [];
  for (const [version, group] of byGl) {
    const render = aggregate(group, 'renderMs');
    glCells.push(`WebGL${version}: p95 ${num(render.p95)} ms over ${num(seconds(group), 0)} s`);
  }
  lines.push(
    `| M5 | WebGL1 vs WebGL2 (**F8**) | ${glCells.join('; ') || 'not captured'} — compare with the other session's row |`,
  );

  // M6 — memory: the pooled targets per zone, with the CRT setting that was on.
  const byZone = groupBy(stageWindows, (w) => w.context?.zone ?? w.context?.stage ?? null);
  const zoneCells = [];
  for (const [zone, group] of byZone) {
    const settings = [...new Set(group.map((w) => w.context?.crtFilter ?? '?'))].join('/');
    zoneCells.push(`${zone}: RT ${renderTargetKb(group) ?? '—'} KB (CRT ${settings})`);
  }
  lines.push(
    `| M6 | \`estimateStageMemory\` per zone vs. RT, CRT on and off (**F3**) | ${zoneCells.join('; ') || 'not captured'} |`,
  );

  // M7 — does the app stop rendering under the Home overlay?
  const resumed = windows.filter((w) => (w.marks ?? []).indexOf('M7') >= 0);
  lines.push(
    `| M7 | Does the app stop rendering under the Home overlay? |` +
      ` ${resumed.length === 0 ? 'not captured' : `${resumed.length} window(s) spanned a Home / return; the window it came back in ran at ${num(groupFps(resumed), 1)} fps`} |`,
  );

  // M8 — the one number no instrumentation reaches.
  lines.push('| M8 | Input-to-photon latency, 240 fps video | manual — nothing here can measure it |');
  lines.push('');

  const checklist = last.checklist ?? [];
  const done = checklist.filter((i) => i && i.done);
  lines.push(
    `Guided checklist: ${done.length}/${checklist.length} — ` +
      checklist.map((i) => `${i.done ? '[x]' : i.manual ? '[-]' : '[ ]'} ${i.id}`).join(' '),
  );
  for (const item of checklist) {
    if (!item.done) lines.push(`  still to do: ${item.id} — ${item.label}`);
  }
  lines.push('');
  return lines;
}

/**
 * One line per window, for `--windows`.
 *
 * @param {any[]} windows - the session's windows.
 * @returns {string[]} the lines.
 */
function windowLines(windows) {
  const out = ['### Every window', ''];
  for (const w of windows) {
    const c = w.context ?? {};
    out.push(
      `  #${w.seq} t+${num((w.startMs ?? 0) / 1000, 1)} s ${c.scene}/${c.zone ?? c.stage ?? '-'}` +
        ` crt=${c.crtFilter} gl=${c.webGLVersion} bullets=${c.bullets}` +
        ` · ${num(w.fps, 1)} fps · RENDER ${(w.renderMs ?? []).map((v) => num(v)).join('/')}` +
        ` · FRAME ${(w.frameMs ?? []).map((v) => num(v, 1)).join('/')} · DRAW ${(w.drawCalls ?? []).map((v) => num(v, 0)).join('/')}` +
        ` · REB ${w.rebuilds}/${w.frames} · RT ${w.renderTargetKb} KB` +
        (w.sendInFlightFrames ? ` · ⚠ ${w.sendInFlightFrames} frames with a send in flight` : '') +
        ((w.marks ?? []).length ? ` · marks ${w.marks.join(',')}` : ''),
    );
  }
  out.push('');
  return out;
}

/**
 * The whole report for one session file.
 *
 * @param {string} file - path to the `<session>.jsonl`.
 * @param {{keepPerturbed?: boolean, withWindows?: boolean}} [options] - `keepPerturbed`: keep the windows a
 *   POST was in flight during (default false); `withWindows`: list every window.
 * @returns {string} the report.
 */
export function analyzeRenderSession(file, options = {}) {
  const { payloads, windows } = readSession(file);
  if (payloads.length === 0) return 'no payloads in ' + file;
  const last = payloads[payloads.length - 1];
  const env = last.env ?? {};
  const perturbed = windows.filter((w) => (w.sendInFlightFrames ?? 0) > 0);
  const used = options.keepPerturbed === true ? windows : windows.filter((w) => (w.sendInFlightFrames ?? 0) === 0);
  const hitched = used.filter((w) => (w.frameMs?.[3] ?? 0) >= HITCH_MS);

  const out = [];
  out.push(`# ${last.session} — render profile`);
  out.push('');
  out.push(
    `${payloads.length} report(s), ${windows.length} window(s) over ${num(seconds(windows), 0)} s,` +
      ` dropped ${last.droppedSamples ?? 0}; from ${last.from ?? '?'}.`,
  );
  out.push(`Build \`${env.buildId ?? '?'}\` · device ${env.device || '(browser)'} · UA ${env.userAgent ?? '?'}`);
  out.push(
    `viewport ${env.innerWidth}×${env.innerHeight} @${env.devicePixelRatio} · internal ${env.internalWidth}×${env.internalHeight}` +
      ` · WebGL ${env.webGLVersion} · boot ${env.bootMs} ms`,
  );
  out.push(
    `${perturbed.length} window(s) had a report POST in flight and are **${options.keepPerturbed === true ? 'kept (--all)' : 'excluded'}**` +
      ' — the sender runs on the main thread, so those frames may carry its cost rather than the renderer’s.',
  );
  out.push(`${hitched.length} of the ${used.length} used window(s) contain a frame of ${HITCH_MS} ms or more.`);
  out.push('');
  out.push('Paste the two tables below into `docs/dev/input-probe-results.md` §11.');
  out.push('');
  for (const line of baselineTable(used, env)) out.push(line);
  for (const line of measurementTable(used, last)) out.push(line);
  if (options.withWindows === true) for (const line of windowLines(used)) out.push(line);
  return out.join('\n');
}

// ------------------------------------------------------------------ CLI
/** True when run as a script (`node results/analyze-render.mjs`), false when imported (tests). */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const file = process.argv[2];
  if (file === undefined) {
    console.error('usage: node results/analyze-render.mjs <session.jsonl> [--all] [--windows]');
    process.exit(2);
  }
  console.log(
    analyzeRenderSession(file, {
      keepPerturbed: process.argv.includes('--all'),
      withWindows: process.argv.includes('--windows'),
    }),
  );
}
