/**
 * results/analyze-render.mjs (plan M3-02f): a fixture session of render-telemetry payloads turns into the
 * two tables of `docs/dev/input-probe-results.md` §11, ready to paste — and the windows a report POST was
 * in flight during are left out of them unless `--all` says otherwise.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { aggregate, analyzeRenderSession, readSession } from '../results/analyze-render.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Context overrides a fixture window may carry. */
interface ContextOver {
  scene?: string;
  stage?: string | null;
  zone?: string | null;
  crtFilter?: string;
  bullets?: number;
  webGLVersion?: number;
}

/** How a fixture window differs from the neutral one. */
interface WindowOver extends ContextOver {
  seq?: number;
  startMs?: number;
  durationMs?: number;
  renderMs?: number[];
  frameMs?: number[];
  renderTargetKb?: number;
  sendInFlightFrames?: number;
  marks?: string[];
  /** Leaves the window without a histogram, as a session recorded before M3-02f's fix would be. */
  noHist?: boolean;
}

/** Frames a fixture window measured (the shell caps a window at 1024 stored timings). */
const MEASURED = 1024;

/**
 * A plausible window histogram for a `[min, p50, p95, max]` tuple: one worst and one best frame,
 * the bulk at the median and a 6 % tail at the p95 — shaped so the percentile read off it is the
 * window's own, exactly as the shell's sampler produces.
 *
 * @param d - The window's tuple.
 * @param frames - How many frames it holds (default {@link MEASURED}).
 * @returns Flat `[value, count, …]` pairs.
 */
function histOf(d: number[], frames = MEASURED): number[] {
  const tail = Math.round(frames * 0.06);
  return [d[0], 1, d[1], frames - tail - 2, d[2], tail, d[3], 1];
}

/**
 * One fixture sampling window.
 *
 * @param over - What differs from the neutral window.
 * @returns The window, shaped exactly as the shell's `RenderSample`.
 */
function win(over: WindowOver = {}): Record<string, unknown> {
  const frameMs = over.frameMs ?? [16, 16.7, 17, 20];
  const renderMs = over.renderMs ?? [0.9, 1.2, 2.1, 4];
  const tickMs = [0.1, 0.2, 0.3, 0.4];
  const drawCalls = [12, 12, 12, 12];
  return {
    seq: over.seq ?? 1,
    startMs: over.startMs ?? 0,
    durationMs: over.durationMs ?? 30_000,
    frames: 1800,
    measuredFrames: 1024,
    fps: 60,
    sendInFlightFrames: over.sendInFlightFrames ?? 0,
    frameMs,
    tickMs,
    renderMs,
    drawCalls,
    hist:
      over.noHist === true
        ? undefined
        : {
            frameMs: histOf(frameMs),
            tickMs: histOf(tickMs),
            renderMs: histOf(renderMs),
            drawCalls: histOf(drawCalls),
          },
    rebuilds: 1790,
    renderTargetKb: over.renderTargetKb ?? 0,
    tickFrames: [0, 1800, 0, 0],
    raf: [0, 0, 1800, 0, 0, 0, 0, 0],
    context: {
      scene: over.scene ?? 'game',
      stage: over.stage === undefined ? 'zone-a' : over.stage,
      zone: over.zone === undefined ? 'A' : over.zone,
      zoneName: 'AZURE VERGE',
      checkpoint: 0,
      cameraX: 100,
      cameraY: 0,
      crtFilter: over.crtFilter ?? 'off',
      screenPass: 'blit',
      aspect: 'normal',
      scaleMode: 'integer',
      scale: 5,
      viewportWidth: 1920,
      viewportHeight: 1080,
      webGLVersion: over.webGLVersion ?? 1,
      bullets: over.bullets ?? 0,
      enemies: 4,
      particles: 20,
      rank: 2,
      vsyncLock: true,
      assists: [],
    },
    marks: over.marks ?? ['M2'],
  };
}

/** The checklist rows a payload carries. */
const CHECKLIST = [
  { id: 'M1', label: 'Baseline', done: true, manual: false },
  { id: 'M2', label: 'CRT OFF, LIGHT and FULL', done: true, manual: false },
  { id: 'M3', label: 'Three stages', done: false, manual: false },
  { id: 'M4', label: 'Dense pattern twice', done: false, manual: false },
  { id: 'M5', label: '60 s in one stage', done: true, manual: false },
  { id: 'M6', label: 'Two zones', done: false, manual: false },
  { id: 'M7', label: 'Home and back', done: true, manual: false },
  { id: 'M8', label: '240 fps video', done: false, manual: true },
];

/**
 * One fixture payload.
 *
 * @param seq - The sequence number.
 * @param samples - Its windows.
 * @returns The payload as the log server stored it (with `receivedAt` / `from`).
 */
function payload(seq: number, samples: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    receivedAt: '2026-09-16T08:00:00.000Z',
    from: '::ffff:10.0.0.8',
    kind: 'render-profile',
    session: 'rp-test-0001',
    seq,
    sentAt: 1_700_000_000_000 + seq * 3000,
    env: {
      buildId: '9524c84',
      device: 'LS43AM702U 20_KANTSU2 FW M-KSU2SMWWC-2750.0 1920x1080@1 C69 GL1/4096',
      userAgent: 'Mozilla/5.0 Chrome/69',
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      webGLVersion: 1,
      internalWidth: 384,
      internalHeight: 216,
      bootMs: 4200,
      startedAt: 1_700_000_000_000,
    },
    checklist: CHECKLIST,
    samples,
    droppedSamples: 0,
  };
}

describe('analyze-render', () => {
  let dir: string;
  let file: string;
  let report: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'render-analyze-'));
    file = join(dir, 'rp-test-0001.jsonl');
    const lines = [
      payload(1, [
        win({ seq: 1, scene: 'title', stage: null, zone: null, marks: ['M1'] }),
        win({ seq: 2, crtFilter: 'off', startMs: 30_000 }),
      ]),
      payload(2, [
        win({ seq: 3, crtFilter: 'light', startMs: 60_000, renderMs: [1, 1.3, 2.2, 4.4], renderTargetKb: 512 }),
        win({ seq: 4, crtFilter: 'full', startMs: 90_000, renderMs: [1, 1.25, 2.15, 4.2] }),
      ]),
      payload(3, [
        win({ seq: 5, startMs: 120_000, bullets: 400, marks: ['M1', 'M4'], frameMs: [16, 16.7, 18, 42] }),
        win({ seq: 6, startMs: 150_000, stage: 'zone-d', zone: 'D' }),
        // A window the sender perturbed: excluded from the tables unless --all.
        win({ seq: 7, startMs: 180_000, renderMs: [9, 9, 9, 99], sendInFlightFrames: 12 }),
        win({ seq: 8, startMs: 210_000, marks: ['M2', 'M7'] }),
      ]),
      // A duplicate seq (a retried POST whose response was lost) must not count twice.
      payload(3, [win({ seq: 5, startMs: 120_000, bullets: 400 })]),
    ];
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    report = analyzeRenderSession(file);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the session, drops duplicate reports and orders the windows', () => {
    const session = readSession(file);
    expect(session.payloads).toHaveLength(4);
    expect(session.windows).toHaveLength(8);
    expect(session.windows.map((w: { seq: number }) => w.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('folds the windows’ own distributions into a group’s figures', () => {
    const { windows } = readSession(file);
    const all = aggregate(windows, 'renderMs');
    expect(all.min).toBe(0.9);
    expect(all.max).toBe(99); // the perturbed window is only excluded by the report, not here
    expect(all.pooled).toBe(true);
    expect(all.frames).toBe(windows.length * MEASURED);
    expect(aggregate([], 'renderMs')).toEqual({
      min: null,
      p50: null,
      p95: null,
      max: null,
      frames: 0,
      pooled: false,
    });
  });

  it('pools the group’s frames instead of taking a median of the windows’ p95s', () => {
    // Three windows of 100 frames. Two are calm (their own p95 is 2 ms); the third spends half its
    // frames at 9 ms. A median of the windows' p95s answers 2 ms — it throws the worst window away
    // and understates the tail, which is the one direction that matters against a frame budget.
    // A sixth of the group's frames really are at 9 ms, so the group's p95 is 9 ms.
    const calm = { renderMs: [1, 1, 2, 2], hist: { renderMs: [1, 90, 2, 10] } };
    const heavy = { renderMs: [1, 1, 9, 9], hist: { renderMs: [1, 50, 9, 50] } };
    const group = [calm, calm, heavy];
    const pooled = aggregate(group, 'renderMs');
    expect(pooled.pooled).toBe(true);
    expect(pooled.frames).toBe(300);
    expect(pooled.p95).toBe(9);
    expect(pooled.p50).toBe(1);

    // Without the histograms only the median of the windows' own percentiles is available, and it
    // is marked as such rather than quoted as a p95.
    const legacy = aggregate(
      group.map((w) => ({ renderMs: w.renderMs })),
      'renderMs',
    );
    expect(legacy.pooled).toBe(false);
    expect(legacy.p95).toBe(2);
  });

  it('says in the report what the percentiles are, and marks the ones it could not pool', () => {
    expect(report).toContain('pooled over the row’s frames');
    expect(report).toContain('pooled percentiles over every frame');
    expect(report).toContain('comparable with them');
    expect(report).not.toMatch(/p95 \d+\.\d+~/);

    const legacyFile = join(dir, 'rp-legacy-0001.jsonl');
    writeFileSync(legacyFile, JSON.stringify(payload(1, [win({ seq: 1, noHist: true })])) + '\n');
    const legacy = analyzeRenderSession(legacyFile);
    expect(legacy).toContain('understates the tail');
    expect(legacy).toContain('p95 2.10~ ms');
  });

  it('prints the §11.1 baseline table with a row per scene', () => {
    expect(report).toContain('### 11.1 Baseline');
    expect(report).toContain(
      '| Where | FPS | TICK ms | RENDER ms | DRAW | REB / frames | RT KB | TPF 0/1/2/3+ | LOCK |',
    );
    expect(report).toMatch(/\| Title, idle \| 60\.0 \|/);
    expect(report).toMatch(/\| Zone A, mid-stage \| 60\.0 \|/);
    expect(report).toMatch(/\| Zone A, boss \| 60\.0 \|/);
    expect(report).toContain('Boot ms: 4200');
    expect(report).toContain('Bundle measured: `9524c84`');
  });

  it('prints the §11.2 measurement table, M1–M8, answered from the marked windows', () => {
    expect(report).toContain('### 11.2 The measurements');
    expect(report).toContain('| # | What | Result |');
    for (const id of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8']) {
      expect(report).toContain(`| ${id} |`);
    }
    // M2 reports each CRT setting separately, with its pooled-target reading.
    expect(report).toMatch(/off: p95 2\.10 ms, RT 0 KB/);
    expect(report).toMatch(/light: p95 2\.20 ms, RT 512 KB/);
    expect(report).toMatch(/full: p95 2\.15 ms, RT 0 KB/);
    // M3 names every stage with its worst frame — the entry hitch F4 asks about.
    expect(report).toContain('zone-a: worst frame 42.0 ms');
    expect(report).toContain('zone-d: worst frame 20.0 ms, RT 0 KB');
    // M5 states the GL version this session ran on.
    expect(report).toContain('WebGL1: p95');
    // M7 found the Home / return window.
    expect(report).toContain('1 window(s) spanned a Home / return');
    // M8 stays honest.
    expect(report).toContain('manual — nothing here can measure it');
  });

  it('excludes the windows a POST was in flight during, and says so', () => {
    expect(report).toContain('1 window(s) had a report POST in flight and are **excluded**');
    // 9.00 ms is the perturbed window's p95 — it must not reach a table.
    expect(report).not.toContain('p95 9.00 ms');
    const kept = analyzeRenderSession(file, { keepPerturbed: true });
    expect(kept).toContain('kept (--all)');
  });

  it('repeats the guided checklist and what is still to do', () => {
    expect(report).toContain('Guided checklist: 4/8');
    expect(report).toContain('[x] M1');
    expect(report).toContain('[-] M8');
    expect(report).toContain('still to do: M3 — Three stages');
  });

  it('lists every window with --windows', () => {
    const listed = analyzeRenderSession(file, { withWindows: true });
    expect(listed).toContain('### Every window');
    expect(listed).toContain('#1 t+0.0 s title/-');
    expect(listed).toContain('marks M1,M4');
  });

  it('runs as a CLI and refuses without a file', async () => {
    /**
     * Runs the analyzer.
     *
     * @param args - Command-line arguments.
     * @returns Its exit code and stdout.
     */
    const run = (args: string[]): Promise<{ code: number; out: string }> =>
      new Promise((done) => {
        const child = spawn(process.execPath, [join(ROOT, 'results', 'analyze-render.mjs'), ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        child.stdout.on('data', (d: Buffer) => void (out += d.toString()));
        child.stderr.on('data', (d: Buffer) => void (out += d.toString()));
        child.on('exit', (code) => done({ code: code ?? 0, out }));
      });
    const ok = await run([file]);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('# rp-test-0001 — render profile');
    expect(ok.out).toContain('### 11.1 Baseline');
    const bad = await run([]);
    expect(bad.code).toBe(2);
    expect(bad.out).toContain('usage: node results/analyze-render.mjs');
  });
});
