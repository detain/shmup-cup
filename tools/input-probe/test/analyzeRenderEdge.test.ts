/**
 * `results/analyze-render.mjs` at its edges (plan M3-02f): the sessions the owner will really hand
 * it — a capture that never left the title, one the sender perturbed from end to end, one recorded
 * by a build from before the histograms existed, one the log server filed alongside junk — plus the
 * pooling rules of {@link aggregate} itself, which is where the numbers in the pasted tables come
 * from.
 *
 * The happy path is `analyzeRender.test.ts`; this file is the "what if it is not that" half.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { aggregate, analyzeRenderSession, readSession } from '../results/analyze-render.mjs';

/** What a fixture window may override. */
interface WindowOver {
  seq?: number;
  startMs?: number;
  durationMs?: number;
  scene?: string;
  stage?: string | null;
  zone?: string | null;
  crtFilter?: string;
  bullets?: number;
  renderMs?: number[];
  hist?: Record<string, number[]> | undefined;
  sendInFlightFrames?: number;
  marks?: string[];
}

/**
 * One fixture window, shaped as `@shmup/shell`'s `RenderSample`.
 *
 * @param over - What differs from the neutral window.
 * @returns The window.
 */
function win(over: WindowOver = {}): Record<string, unknown> {
  const renderMs = over.renderMs ?? [0.9, 1.2, 2.1, 4];
  return {
    seq: over.seq ?? 1,
    startMs: over.startMs ?? 0,
    durationMs: over.durationMs ?? 3000,
    frames: 180,
    measuredFrames: 180,
    fps: 60,
    sendInFlightFrames: over.sendInFlightFrames ?? 0,
    frameMs: [16, 16.7, 17, 20],
    tickMs: [0.1, 0.2, 0.3, 0.4],
    renderMs,
    drawCalls: [12, 12, 12, 12],
    hist:
      'hist' in over
        ? over.hist
        : {
            frameMs: [16.75, 180],
            tickMs: [0.2, 180],
            renderMs: [renderMs[1], 170, renderMs[2], 9, renderMs[3], 1],
            drawCalls: [12, 180],
          },
    rebuilds: 179,
    renderTargetKb: 256,
    tickFrames: [0, 180, 0, 0],
    raf: [0, 0, 180, 0, 0, 0, 0, 0],
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
      webGLVersion: 1,
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

/**
 * One fixture payload.
 *
 * @param seq - Sequence number.
 * @param samples - Its windows (or anything else, for the junk cases).
 * @param over - Payload-level overrides.
 * @returns The payload as the log server stored it.
 */
function payload(seq: number, samples: unknown, over: Record<string, unknown> = {}): unknown {
  return {
    receivedAt: '2026-09-16T08:00:00.000Z',
    from: '::ffff:10.0.0.8',
    kind: 'render-profile',
    session: 'rp-edge-0001',
    seq,
    sentAt: 1_700_000_000_000 + seq * 3000,
    env: {
      buildId: '9524c84',
      device: '',
      userAgent: 'Chrome/69',
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      webGLVersion: 1,
      internalWidth: 384,
      internalHeight: 216,
      bootMs: 4200,
      startedAt: 1_700_000_000_000,
    },
    checklist: [{ id: 'M1', label: 'Baseline', done: false, manual: false }],
    samples,
    droppedSamples: 0,
    ...over,
  };
}

describe('analyze-render/aggregate', () => {
  it('answers nothing for an empty group rather than NaN cells', () => {
    const empty = aggregate([], 'renderMs');
    expect(empty).toEqual({ min: null, p50: null, p95: null, max: null, frames: 0, pooled: false });
  });

  it('skips a window whose distribution tuple is missing or short', () => {
    const good = win();
    const agg = aggregate(
      [{}, { renderMs: [1, 2] }, { renderMs: 'nope' }, good],
      'renderMs',
    ) as { frames: number; pooled: boolean; p95: number };
    // Only the usable window counted, and it counted in full.
    expect(agg.frames).toBe(180);
    expect(agg.pooled).toBe(true);
    expect(agg.p95).toBe(2.1);
  });

  it('falls back to the median of the windows’ percentiles as soon as one window has no histogram', () => {
    const calm = win({ renderMs: [1, 1, 2, 2] });
    const heavy = win({ renderMs: [1, 1, 9, 9], hist: undefined });
    const agg = aggregate([calm, calm, heavy], 'renderMs') as {
      pooled: boolean;
      frames: number;
      p95: number;
    };
    // The fallback is the old, weaker statistic — the median of the windows' own p95s, which drops
    // the heavy window entirely — and it says so, so the report can mark the cell `~`.
    expect(agg.pooled).toBe(false);
    expect(agg.frames).toBe(0);
    expect(agg.p95).toBe(2);
  });

  it('ignores junk buckets inside a histogram instead of counting them as frames', () => {
    const w = win({ renderMs: [1, 1, 1, 1] });
    (w as { hist: Record<string, unknown> }).hist = {
      renderMs: ['x', 4, 1, 'y', 2, 0, 3, -5, 1.5, 10],
    };
    const agg = aggregate([w], 'renderMs') as { frames: number; p95: number; pooled: boolean };
    // Only the one well-formed pair (1.5 × 10) survived.
    expect(agg.frames).toBe(10);
    expect(agg.pooled).toBe(true);
    expect(agg.p95).toBe(1.5);
  });

  it('takes min and max from the windows’ own tuples — the single best and worst frames', () => {
    const agg = aggregate(
      [win({ renderMs: [0.4, 1, 2, 30] }), win({ renderMs: [0.9, 1.2, 2.1, 4] })],
      'renderMs',
    ) as { min: number; max: number };
    expect(agg.min).toBe(0.4);
    expect(agg.max).toBe(30);
  });
});

describe('analyze-render/readSession', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'render-analyze-edge-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Writes a session file.
   *
   * @param name - File name.
   * @param lines - The JSONL lines (objects are serialized).
   * @returns The path.
   */
  function sessionFile(name: string, lines: unknown[]): string {
    const file = join(dir, name);
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return file;
  }

  it('ignores blank lines and payloads that carry no windows at all', () => {
    const file = join(dir, 'rp-blank.jsonl');
    writeFileSync(
      file,
      [
        JSON.stringify(payload(1, [win({ seq: 1 })])),
        '',
        '   ',
        JSON.stringify(payload(2, null)),
        JSON.stringify(payload(3, [])),
        '',
      ].join('\n'),
    );
    const session = readSession(file);
    expect(session.payloads).toHaveLength(3);
    expect(session.windows).toHaveLength(1);
  });

  it('keeps the first copy of a retried seq and orders the windows by start time', () => {
    const file = sessionFile('rp-dupes.jsonl', [
      payload(1, [win({ seq: 3, startMs: 6000 }), win({ seq: 1, startMs: 0 })]),
      payload(1, [win({ seq: 99, startMs: 1 })]),
      payload(2, [win({ seq: 2, startMs: 3000 })]),
    ]);
    const session = readSession(file);
    expect(session.payloads).toHaveLength(3);
    expect(session.windows.map((w: { seq: number }) => w.seq)).toEqual([1, 2, 3]);
  });
});

describe('analyze-render/analyzeRenderSession', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'render-report-edge-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Writes a session file and analyzes it.
   *
   * @param name - File name.
   * @param lines - The JSONL lines.
   * @param options - Analyzer options.
   * @returns The report.
   */
  function reportOf(
    name: string,
    lines: unknown[],
    options: { keepPerturbed?: boolean; withWindows?: boolean } = {},
  ): string {
    const file = join(dir, name);
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return analyzeRenderSession(file, options) as string;
  }

  it('says so for an empty session instead of printing empty tables', () => {
    const file = join(dir, 'rp-empty.jsonl');
    writeFileSync(file, '\n');
    expect(analyzeRenderSession(file)).toContain('no payloads in ');
  });

  it('prints the tables of a capture that never left the title', () => {
    const report = reportOf('rp-title.jsonl', [
      payload(1, [
        win({ seq: 1, scene: 'title', stage: null, zone: null, marks: ['M1'] }),
        win({ seq: 2, scene: 'title', stage: null, zone: null, startMs: 3000, marks: ['M1'] }),
      ]),
    ]);
    expect(report).toContain('| Title, idle |');
    // Nothing was captured in a stage, so every stage row says so rather than inventing a number.
    expect(report).toContain('| Zone A, mid-stage | | | | | | | | | *(not captured)* |');
    expect(report).toContain('off: not captured');
    expect(report).toContain('| M3 | Frame-graph spike entering each stage (**F4**) | not captured |');
    expect(report).toContain('| M5 | WebGL1 vs WebGL2 (**F8**) | not captured');
    expect(report).toContain('| M6 | `estimateStageMemory` per zone vs. RT, CRT on and off (**F3**) | not captured |');
  });

  it('keeps its head when every window was perturbed and none may be used', () => {
    const report = reportOf('rp-all-perturbed.jsonl', [
      payload(1, [
        win({ seq: 1, sendInFlightFrames: 40 }),
        win({ seq: 2, startMs: 3000, sendInFlightFrames: 180 }),
      ]),
    ]);
    expect(report).toContain('2 window(s) had a report POST in flight and are **excluded**');
    expect(report).toContain('0 of the 0 used window(s)');
    expect(report).toContain('*(not captured)*');
    // With nothing usable it must not claim a pooled figure at all.
    expect(report).not.toContain('Every p50 / p95 below is pooled');
    const kept = reportOf(
      'rp-all-perturbed.jsonl',
      [
        payload(1, [
          win({ seq: 1, sendInFlightFrames: 40 }),
          win({ seq: 2, startMs: 3000, sendInFlightFrames: 180 }),
        ]),
      ],
      { keepPerturbed: true },
    );
    expect(kept).toContain('kept (--all)');
    expect(kept).toContain('0 of the 2 used window(s)');
    expect(kept).toContain('Every p50 / p95 below is pooled');
  });

  it('marks a session recorded before the histograms existed, and never calls it a pooled p95', () => {
    const report = reportOf('rp-legacy.jsonl', [
      payload(1, [win({ seq: 1, hist: undefined }), win({ seq: 2, startMs: 3000, hist: undefined })]),
    ]);
    expect(report).toContain('understates the tail');
    expect(report).not.toContain('Every p50 / p95 below is pooled');
    expect(report).toMatch(/p95 2\.10~/);
  });

  it('reports a capture from a browser as such, and a monitor by its device line', () => {
    const browser = reportOf('rp-browser.jsonl', [payload(1, [win({ seq: 1 })])]);
    expect(browser).toContain('device (browser)');
    const monitor = reportOf('rp-monitor.jsonl', [
      payload(1, [win({ seq: 1 })], {
        env: { buildId: '9524c84', device: 'LS43AM702U FW M-KSU2SMWWC-2750.0', bootMs: 4200 },
      }),
    ]);
    expect(monitor).toContain('device LS43AM702U FW M-KSU2SMWWC-2750.0');
    expect(monitor).not.toContain('device (browser)');
  });

  it('survives a window the sender never produced: no context, no tuples, no marks', () => {
    const report = reportOf(
      'rp-junk-window.jsonl',
      [
        payload(1, [
          {},
          { seq: 2, startMs: 3000 },
          { seq: 3, startMs: 6000, context: null, renderMs: null, marks: null },
          win({ seq: 4, startMs: 9000 }),
        ]),
      ],
      { withWindows: true },
    );
    expect(report).toContain('### 11.1 Baseline');
    expect(report).toContain('### Every window');
    // The one real window still answers its row.
    expect(report).toContain('| Zone A, mid-stage |');
  });

  it('answers a one-window group with that window’s own figures', () => {
    const report = reportOf('rp-one.jsonl', [
      payload(1, [win({ seq: 1, renderMs: [0.9, 1.2, 2.1, 4] })]),
    ]);
    expect(report).toContain('1.20 (p95 2.10, max 4.00)');
    expect(report).toContain('pooled over the row’s frames (180 frames');
  });
});
