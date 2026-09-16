/**
 * Render telemetry end to end (plan M3-02f): the shell's sampler → the input probe's log server →
 * `results/analyze-render.mjs`. The three live in different projects and only this repo-level suite
 * can hold them together, so the invariants that span them live here.
 *
 * What it pins, in the order the step's risk runs:
 *
 * - **the reported percentile is the real one.** A group of the §11 tables pools many windows, and
 *   the analyzer reads its `p50` / `p95` off the windows' quantized histograms. Over hundreds of
 *   generated frame streams — calm, bimodal, heavy-tailed and wide enough to force the histogram's
 *   step-doubling — the pooled figure must equal the exact percentile of the same frames to within
 *   the quantum the windows actually used. The first cut of the step folded the windows' own p95s
 *   instead (their median), which understates the tail; a scenario built for it is checked here
 *   against both answers.
 * - **the worst-case payload still fits the receiver.** {@link MAX_QUEUED_SAMPLES} windows, each
 *   with the most buckets a window may carry, must stay under the server's
 *   {@link MAX_BODY_BYTES} — and a real POST of it must be accepted, not 413'd.
 * - **a window the sender perturbed stays out of the numbers** unless `--all` asks for it.
 * - **the sender is reachable only from the module behind the dev gate** — the source-level half of
 *   the two build-output assertions (`apps/tizen`, `apps/web`), which can only notice a leak after
 *   a whole release build has been run.
 * - **the write-ups never invite comparing the two magnitudes.** Three review rounds moved that
 *   wording and the third still found a spot the first two had missed.
 * - **the two quantile conventions in the repo are one sample index apart**, and both are pinned.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// A relative source import rather than `@shmup/shell`: the repo-level suite depends on `core`,
// `input-web`, `render-pixi` and `audio-web` only, and reading a few constants is no reason to add
// a fifth workspace dependency to the root package.
import {
  MAX_QUEUED_SAMPLES,
  RENDER_FRAME_SLOT,
  RENDER_HIST_MAX_BUCKETS,
  RENDER_HIST_STEP,
  RENDER_WINDOW_MAX_FRAMES,
  RenderSampleQueue,
  RenderSampler,
  type RenderSample,
  type RenderSampleContext,
  type RenderTelemetryEnv,
} from '../../packages/shell/src/telemetry/index.js';
import { quantile } from '../bench/render-harness/load.js';
import { MAX_BODY_BYTES, createLogServer } from '../../tools/input-probe/server/log-server.mjs';
import {
  aggregate,
  analyzeRenderSession,
} from '../../tools/input-probe/results/analyze-render.mjs';

/** Session-level facts every generated payload repeats. */
const ENV: RenderTelemetryEnv = {
  buildId: '9524c84',
  device: 'LS43AM702U 20_KANTSU2 FW M-KSU2SMWWC-2750.0 1920x1080@1 C69 GL1/4096',
  userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 Chrome/69.0.3497.106',
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  webGLVersion: 1,
  internalWidth: 384,
  internalHeight: 216,
  bootMs: 4200,
  startedAt: 1_700_000_000_000,
};

/**
 * A window context with the given overrides.
 *
 * @param over - Fields to change.
 * @returns The context.
 */
function context(over: Partial<RenderSampleContext> = {}): RenderSampleContext {
  return {
    scene: 'game',
    stage: 'zone-a',
    zone: 'A',
    zoneName: 'AZURE VERGE',
    checkpoint: 0,
    cameraX: 1200,
    cameraY: 0,
    crtFilter: 'off',
    screenPass: 'blit',
    aspect: 'normal',
    scaleMode: 'integer',
    scale: 5,
    viewportWidth: 1920,
    viewportHeight: 1080,
    webGLVersion: 1,
    bullets: 0,
    enemies: 4,
    particles: 20,
    rank: 2,
    vsyncLock: true,
    assists: [],
    ...over,
  };
}

/**
 * A deterministic PRNG (mulberry32) — the property runs must be reproducible.
 *
 * @param seed - The seed.
 * @returns A function returning the next number in [0, 1).
 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The exact value at a quantile of a raw sample list, by the sampler's index rule.
 *
 * @param values - The values (not modified).
 * @param fraction - 0 … 1.
 * @returns The value.
 */
function exactPercentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1) + 0.5))];
}

/**
 * The median of a list of numbers, by the same index rule.
 *
 * @param values - The values.
 * @returns The median.
 */
function medianOf(values: readonly number[]): number {
  return exactPercentile(values, 0.5);
}

/**
 * The greatest common divisor of two integers.
 *
 * @param a - First.
 * @param b - Second.
 * @returns The GCD.
 */
function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * The quantum a set of windows' histograms really used, derived from the bucket labels alone (so
 * the check does not restate the sampler's coarsening rule): every label is a multiple of the
 * window's step, so the GCD of the gaps is a multiple of it and bounds the quantization error.
 *
 * @param windows - The closed windows.
 * @param field - Which series.
 * @returns The quantum, in the field's own unit.
 */
function quantumOf(windows: readonly RenderSample[], field: 'renderMs' | 'frameMs'): number {
  // Per window, in thousandths so the GCD is over integers (every label is rounded to three
  // decimals); the widest window's quantum bounds the whole group's quantization error, because a
  // window that spread too far for the bucket cap had its step doubled and the others did not.
  let worst = RENDER_HIST_STEP[field];
  for (const w of windows) {
    const hist = w.hist[field];
    let units = 0;
    for (let i = 2; i < hist.length; i += 2) {
      units = gcd(units, Math.round((hist[i] - hist[i - 2]) * 1000));
    }
    if (units / 1000 > worst) worst = units / 1000;
  }
  return worst;
}

/**
 * Feeds a sampler one window of render times and closes it.
 *
 * @param sampler - The sampler.
 * @param renderMs - The window's per-frame render times.
 * @param seq - Window number.
 * @param startMs - When the window opened.
 * @param over - Context overrides.
 * @param inFlightFrames - How many of the frames a POST was outstanding during.
 * @returns The closed window.
 */
function windowOf(
  sampler: RenderSampler,
  renderMs: readonly number[],
  seq: number,
  startMs = 0,
  over: Partial<RenderSampleContext> = {},
  inFlightFrames = 0,
): RenderSample {
  const inbox = sampler.frame;
  for (let i = 0; i < renderMs.length; i++) {
    inbox[RENDER_FRAME_SLOT.frameMs] = 16.7;
    inbox[RENDER_FRAME_SLOT.tickMs] = 0.2;
    inbox[RENDER_FRAME_SLOT.renderMs] = renderMs[i];
    inbox[RENDER_FRAME_SLOT.drawCalls] = 12;
    inbox[RENDER_FRAME_SLOT.rebuilds] = i;
    inbox[RENDER_FRAME_SLOT.renderTargetBytes] = 0;
    inbox[RENDER_FRAME_SLOT.ticks] = 1;
    inbox[RENDER_FRAME_SLOT.rafBucket] = 2;
    sampler.commitFrame(i < inFlightFrames);
  }
  const closed = sampler.close(seq, startMs, startMs + renderMs.length * 16.7, context(over), []);
  if (closed === null) throw new Error('the window recorded no frame');
  return closed;
}

/** One generated capture: the windows the sampler closed and the raw frames behind them. */
interface Scenario {
  /** What the stream looks like, for the failure message. */
  name: string;
  /** The closed windows. */
  windows: RenderSample[];
  /** Every frame's render time, in the order it was recorded. */
  raw: number[];
}

/**
 * Generates a capture: several windows of render times drawn from one of a few shapes.
 *
 * @param seed - PRNG seed.
 * @param shape - Which distribution the frames follow.
 * @returns The scenario.
 */
function scenario(seed: number, shape: 'calm' | 'bimodal' | 'heavy-tail' | 'wide'): Scenario {
  const random = rng(seed);
  const sampler = new RenderSampler();
  const windows: RenderSample[] = [];
  const raw: number[] = [];
  const windowCount = 2 + Math.floor(random() * 6);
  for (let w = 0; w < windowCount; w++) {
    const frames = 40 + Math.floor(random() * 220);
    const values: number[] = [];
    // A window's own character: the analyzer pools windows that are not alike, which is exactly
    // where a median of their p95s stops being a p95.
    const calm = random() < 0.6;
    for (let i = 0; i < frames; i++) {
      const u = random();
      let value: number;
      if (shape === 'calm') value = 1 + u * 0.4;
      else if (shape === 'bimodal') value = u < 0.7 ? 1.1 + u * 0.2 : 8 + u * 0.5;
      else if (shape === 'heavy-tail') value = calm ? 1 + u * 0.3 : u < 0.9 ? 1 + u : 4 + u * 12;
      else value = 0.2 + u * u * u * 240;
      values.push(Math.round(value * 1000) / 1000);
    }
    const closed = windowOf(sampler, values, w + 1, w * 3000);
    windows.push(closed);
    for (const v of values) raw.push(v);
  }
  return { name: `${shape} #${seed}`, windows, raw };
}

describe('render telemetry: the pooled percentile is the percentile of the pooled frames', () => {
  const shapes = ['calm', 'bimodal', 'heavy-tail', 'wide'] as const;
  for (const shape of shapes) {
    it(`matches the exact percentile of every frame — ${shape} streams`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const { name, windows, raw } = scenario(seed, shape);
        const agg = aggregate(windows, 'renderMs') as {
          min: number;
          p50: number;
          p95: number;
          max: number;
          frames: number;
          pooled: boolean;
        };
        const quantum = quantumOf(windows, 'renderMs');
        const slack = quantum / 2 + 1e-6;
        expect(agg.pooled, name).toBe(true);
        expect(agg.frames, name).toBe(raw.length);
        // The quantization moves every frame by at most half a quantum, so it moves an order
        // statistic by at most half a quantum: the pooled figure is the real one, not a proxy.
        expect(Math.abs(agg.p50 - exactPercentile(raw, 0.5)), `${name} p50`).toBeLessThanOrEqual(
          slack,
        );
        expect(Math.abs(agg.p95 - exactPercentile(raw, 0.95)), `${name} p95`).toBeLessThanOrEqual(
          slack,
        );
        // `min` / `max` are the single best and worst frames, exactly.
        expect(agg.min, `${name} min`).toBeCloseTo(Math.min(...raw), 3);
        expect(agg.max, `${name} max`).toBeCloseTo(Math.max(...raw), 3);
        // However wide the window was, its histogram stayed bounded.
        for (const w of windows) {
          expect(w.hist.renderMs.length / 2, name).toBeLessThanOrEqual(RENDER_HIST_MAX_BUCKETS);
        }
      }
    });
  }

  it('is not the median of the windows’ own p95s — the statistic the first cut reported', () => {
    // Windows that are not alike: four calm ones and two that spend a third of their frames at
    // 9 ms. A median of the six windows' p95s answers ~1.4 ms and throws the worse third of the
    // capture away; a seventh of the group's frames really are at 9 ms, so its p95 is 9 ms.
    const sampler = new RenderSampler();
    const windows: RenderSample[] = [];
    const raw: number[] = [];
    for (let w = 0; w < 6; w++) {
      const heavy = w >= 4;
      const values: number[] = [];
      for (let i = 0; i < 180; i++) values.push(heavy && i % 3 === 0 ? 9 : 1 + (i % 5) * 0.1);
      windows.push(windowOf(sampler, values, w + 1, w * 3000));
      for (const v of values) raw.push(v);
    }
    const agg = aggregate(windows, 'renderMs') as { p95: number; pooled: boolean };
    const medianOfP95s = medianOf(windows.map((w) => w.renderMs[2]));
    expect(agg.pooled).toBe(true);
    expect(agg.p95).toBeCloseTo(exactPercentile(raw, 0.95), 2);
    expect(agg.p95).toBe(9);
    expect(medianOfP95s).toBeLessThan(2);
  });

  it('answers a single window with that window’s own figures', () => {
    const sampler = new RenderSampler();
    const values: number[] = [];
    for (let i = 0; i < 200; i++) values.push(1 + (i % 40) * 0.05);
    const only = windowOf(sampler, values, 1);
    const agg = aggregate([only], 'renderMs') as { p50: number; p95: number };
    expect(Math.abs(agg.p95 - only.renderMs[2])).toBeLessThanOrEqual(
      RENDER_HIST_STEP.renderMs / 2 + 1e-6,
    );
    expect(Math.abs(agg.p50 - only.renderMs[1])).toBeLessThanOrEqual(
      RENDER_HIST_STEP.renderMs / 2 + 1e-6,
    );
  });
});

/**
 * A window whose four histograms are as large as a window's may get: {@link RENDER_WINDOW_MAX_FRAMES}
 * frames, every one a different value in each series, so the step doubles until the values fit
 * {@link RENDER_HIST_MAX_BUCKETS} buckets — and every string of the context as long as the shell
 * can really make it. This is the window the payload-size bounds are built from.
 *
 * @param sampler - The sampler to close the window on.
 * @param seq - Window number.
 * @returns The window.
 */
function fatWindow(sampler: RenderSampler, seq: number): RenderSample {
  const inbox = sampler.frame;
  for (let i = 0; i < RENDER_WINDOW_MAX_FRAMES; i++) {
    inbox[RENDER_FRAME_SLOT.frameMs] = 8.123 + i * 0.317;
    inbox[RENDER_FRAME_SLOT.tickMs] = 0.101 + i * 0.037;
    inbox[RENDER_FRAME_SLOT.renderMs] = 0.937 + i * 0.211;
    inbox[RENDER_FRAME_SLOT.drawCalls] = i;
    inbox[RENDER_FRAME_SLOT.rebuilds] = i;
    inbox[RENDER_FRAME_SLOT.renderTargetBytes] = 4096 * 1024;
    inbox[RENDER_FRAME_SLOT.ticks] = i % 4;
    inbox[RENDER_FRAME_SLOT.rafBucket] = i % 8;
    sampler.commitFrame(true);
  }
  const closed = sampler.close(
    seq,
    seq * 3000,
    seq * 3000 + 3000,
    context({
      stage: 'zone-i-descent-into-the-lattice',
      zoneName: 'THE LATTICE, DESCENDING',
      assists: [
        'god',
        'hitboxes',
        'grid',
        'frameAdvance',
        'slowMo8',
        'invincible',
        'optionRecovery',
        'slowdown',
        'speed150',
      ],
    }),
    ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'],
  );
  if (closed === null) throw new Error('the window recorded no frame');
  return closed;
}

describe('render telemetry: the worst-case payload fits the receiver', () => {
  it('stays under the log server’s body limit with a full queue of the fattest windows', () => {
    const sampler = new RenderSampler();
    const queue = new RenderSampleQueue('rp-worst-case');
    for (let i = 0; i < MAX_QUEUED_SAMPLES; i++) queue.push(fatWindow(sampler, i + 1));
    expect(queue.pending).toBe(MAX_QUEUED_SAMPLES);
    const checklist = [
      {
        id: 'M1',
        label: 'Baseline: 30 s on the title, then 30 s of a dense scene (boss)',
        done: true,
        manual: false,
      },
      {
        id: 'M8',
        label: 'Input-to-photon: 240 fps video — manual, nothing to capture here',
        done: false,
        manual: true,
      },
    ];
    const payload = queue.build(ENV, checklist as never, Date.now());
    expect(payload.samples).toHaveLength(MAX_QUEUED_SAMPLES);
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    // The queue is what an outage of `MAX_QUEUED_SAMPLES * 3 s` — twenty minutes — leaves behind,
    // and it all goes out in the next POST. Above the cap the server 413s it and the capture is
    // lost, so this is the bound that keeps `MAX_QUEUED_SAMPLES` and the bucket cap honest.
    expect(bytes).toBeLessThan(MAX_BODY_BYTES);
    for (const s of payload.samples) {
      expect(s.hist.renderMs.length / 2).toBeLessThanOrEqual(RENDER_HIST_MAX_BUCKETS);
    }
  }, 60_000);

  it('would still fit if every window carried the largest histogram the schema allows', () => {
    // The bound above depends on how the sampler coarsens; this one does not. Every one of the
    // four series is given {@link RENDER_HIST_MAX_BUCKETS} buckets with the longest labels and
    // counts a window can hold, which is the most a `RenderSample` can ever serialize to.
    const sampler = new RenderSampler();
    const template = fatWindow(sampler, 1);
    /**
     * The fattest histogram a window may carry.
     *
     * @returns Flat `[value, count, …]` pairs at the bucket cap.
     */
    const maxHist = (): number[] => {
      const out: number[] = [];
      for (let i = 0; i < RENDER_HIST_MAX_BUCKETS; i++) {
        out.push(Math.round((1234.567 + i * 40.96) * 1000) / 1000, RENDER_WINDOW_MAX_FRAMES - i);
      }
      return out;
    };
    const queue = new RenderSampleQueue('rp-schema-bound');
    for (let i = 0; i < MAX_QUEUED_SAMPLES; i++) {
      queue.push({
        ...template,
        seq: i + 1,
        hist: {
          frameMs: maxHist(),
          tickMs: maxHist(),
          renderMs: maxHist(),
          drawCalls: maxHist(),
        },
      });
    }
    const bytes = Buffer.byteLength(JSON.stringify(queue.build(ENV, [], ENV.startedAt)), 'utf8');
    expect(bytes).toBeLessThan(MAX_BODY_BYTES);
  });
});

describe('render telemetry: sampler → log server → analyzer', () => {
  let dir = '';
  let server: Server | null = null;
  let url = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'render-telemetry-pipeline-'));
    server = createLogServer({ logDir: dir, log: (): void => {} });
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/report`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => {
      if (server === null) return done();
      server.close(() => done());
    });
    if (dir !== '') rmSync(dir, { recursive: true, force: true });
  });

  /**
   * POSTs a payload exactly as the sender does — `text/plain`, so the TV's request stays a CORS
   * simple request and needs no preflight.
   *
   * @param body - The serialized payload.
   * @returns The response status and body.
   */
  async function post(body: string): Promise<{ status: number; text: string }> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
    });
    return { status: res.status, text: await res.text() };
  }

  /**
   * A payload of the given windows for a session.
   *
   * @param session - Session id.
   * @param seq - Payload sequence number.
   * @param samples - The windows.
   * @returns The payload, as the sender builds it.
   */
  function payloadOf(
    session: string,
    seq: number,
    samples: RenderSample[],
  ): Record<string, unknown> {
    return {
      kind: 'render-profile',
      session,
      seq,
      sentAt: ENV.startedAt + seq * 3000,
      env: ENV,
      checklist: [
        { id: 'M1', label: 'Baseline', done: true, manual: false },
        { id: 'M8', label: '240 fps video', done: false, manual: true },
      ],
      samples,
      droppedSamples: 0,
    };
  }

  it('accepts the worst-case payload the queue can build rather than 413ing the capture away', async () => {
    const sampler = new RenderSampler();
    const queue = new RenderSampleQueue('rp-worst-0001');
    for (let w = 0; w < MAX_QUEUED_SAMPLES; w++) queue.push(fatWindow(sampler, w + 1));
    const body = JSON.stringify(queue.build(ENV, [], ENV.startedAt));
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThan(MAX_BODY_BYTES);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(readdirSync(dir)).toContain('rp-worst-0001.jsonl');
  }, 120_000);

  it('excludes a window a POST was in flight during, and keeps it only for --all', async () => {
    const sampler = new RenderSampler();
    const clean: RenderSample[] = [];
    for (let w = 0; w < 3; w++) {
      const values: number[] = [];
      for (let i = 0; i < 180; i++) values.push(1 + (i % 10) * 0.05);
      clean.push(windowOf(sampler, values, w + 1, w * 3000));
    }
    // The window the sender's own POST ran through: every frame far worse than any other window's.
    const spike: number[] = [];
    for (let i = 0; i < 180; i++) spike.push(9 + (i % 5) * 0.1);
    const perturbed = windowOf(sampler, spike, 4, 9000, {}, 180);
    expect(perturbed.sendInFlightFrames).toBe(180);

    const session = 'rp-inflight-0001';
    const res = await post(JSON.stringify(payloadOf(session, 1, [...clean, perturbed])));
    expect(res.status).toBe(200);
    const file = join(dir, session + '.jsonl');

    const report = analyzeRenderSession(file);
    expect(report).toContain('1 window(s) had a report POST in flight and are **excluded**');
    // The perturbed window's ~9 ms must not reach a single cell of the pasted tables.
    expect(report).not.toMatch(/9\.\d\d ms/);
    const kept = analyzeRenderSession(file, { keepPerturbed: true });
    expect(kept).toContain('kept (--all)');
    expect(kept).toMatch(/9\.\d\d ms/);
  });

  it('turns a capture the server stored into the §11 tables, pooled over its frames', async () => {
    const sampler = new RenderSampler();
    const session = 'rp-tables-0001';
    /**
     * A window of `frames` render times around `base`.
     *
     * @param base - The typical render time.
     * @param seq - Window number.
     * @param startMs - When it opened.
     * @param over - Context overrides.
     * @returns The window.
     */
    const w = (
      base: number,
      seq: number,
      startMs: number,
      over: Partial<RenderSampleContext> = {},
    ): RenderSample => {
      const values: number[] = [];
      for (let i = 0; i < 180; i++) values.push(base + (i % 7) * 0.05);
      return windowOf(sampler, values, seq, startMs, over);
    };
    const title = w(0.5, 1, 0, { scene: 'title', stage: null, zone: null });
    title.marks.push('M1');
    const mid = w(1.2, 2, 3000);
    mid.marks.push('M2', 'M3', 'M5');
    const boss = w(2.4, 3, 6000, { bullets: 400 });
    boss.marks.push('M1', 'M4');
    await post(JSON.stringify(payloadOf(session, 1, [title, mid])));
    await post(JSON.stringify(payloadOf(session, 2, [boss])));

    const file = join(dir, session + '.jsonl');
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
    const report = analyzeRenderSession(file);
    expect(report).toContain('### 11.1 Baseline');
    expect(report).toContain('### 11.2 The measurements');
    expect(report).toContain('pooled over the row’s frames (540 frames');
    expect(report).toContain('not a comparable magnitude');
    // The device line the sender re-read per window reaches the report, so a monitor capture is
    // never filed as `(browser)` (the round-1 bug).
    expect(report).toContain('device ' + ENV.device);
    expect(report).not.toContain('device (browser)');
    // No figure is marked `~`: every window carried its histogram, so every percentile is pooled
    // (the footnote explaining the mark is the only `~` in the report).
    expect(report).not.toMatch(/\d~/);
  });
});

describe('render telemetry: the repo’s two quantile conventions', () => {
  it('are one sample index apart at most, and each is what its own write-up quotes', () => {
    // The telemetry sampler, `results/analyze.mjs` and `results/analyze-render.mjs` all take the
    // value at `floor(q * (n - 1) + 0.5)`; the render bench (`test/bench/render-harness/load.ts`,
    // and the two `*.perf.ts` copies) takes `floor(q * n)`. Both are nearest-rank rules without
    // interpolation and they never differ by more than one sample — pinned here rather than
    // unified, because moving the bench's rule would move the p95s already published in
    // `docs/dev/input-probe-results.md` §11.3 and the budgets tuned against them, for a difference
    // the tables' footnote already declares incomparable (the bench runs under SwiftShader).
    const telemetryIndex = (n: number, q: number): number =>
      Math.min(n - 1, Math.floor(q * (n - 1) + 0.5));
    const benchIndex = (n: number, q: number): number =>
      Math.min(n - 1, Math.max(0, Math.floor(q * n)));
    for (let n = 1; n <= 2048; n++) {
      for (const q of [0.5, 0.95, 0.99]) {
        expect(
          Math.abs(benchIndex(n, q) - telemetryIndex(n, q)),
          `n=${n} q=${q}`,
        ).toBeLessThanOrEqual(1);
      }
    }
    // And each implementation really follows its own rule: 100 ascending values, 1 … 100.
    const ascending = new Float64Array(100);
    for (let i = 0; i < 100; i++) ascending[i] = i + 1;
    expect(quantile(ascending, 0.95)).toBe(96); // index 95
    const sampler = new RenderSampler();
    const values: number[] = [];
    for (let i = 0; i < 100; i++) values.push(i + 1);
    expect(windowOf(sampler, values, 1).renderMs[2]).toBe(95); // index 94
  });
});

describe('render telemetry: the sender only exists behind the dev gate', () => {
  /**
   * Every `.ts` file under a directory, recursively.
   *
   * @param dir - Where to look.
   * @returns Absolute paths.
   */
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sources(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  it('is imported by shell/debug and by nothing else in the shipped tree', () => {
    const repo = fileURLToPath(new URL('../../', import.meta.url));
    const roots = [
      join(repo, 'packages/shell/src'),
      join(repo, 'packages/core/src'),
      join(repo, 'packages/render-pixi/src'),
      join(repo, 'packages/input-web/src'),
      join(repo, 'packages/audio-web/src'),
      join(repo, 'apps/web/src'),
      join(repo, 'apps/tizen/src'),
      join(repo, 'apps/electron/src'),
    ];
    const importers: string[] = [];
    for (const root of roots) {
      for (const file of sources(root)) {
        const text = readFileSync(file, 'utf8');
        if (/from '[^']*telemetry\/index\.js'/.test(text)) {
          importers.push(file.slice(repo.length));
        }
      }
    }
    // Two, and only two: the module that already sits behind `__SHMUP_DEV__ ? … : null`, and the
    // package barrel every module must be re-exported from (`test/integration/module-layout.test.ts`),
    // which nothing but a dev build pulls in. A third importer — an app, the boot path, a renderer —
    // would drag the sender and its endpoint into a release bundle, which the two build-output
    // assertions would then have to catch after the fact.
    expect(importers.sort()).toEqual([
      'packages/shell/src/debug/index.ts',
      'packages/shell/src/index.ts',
    ]);
  });
});

describe('render telemetry: the write-ups never invite comparing the two magnitudes', () => {
  it('names the caveat wherever it calls the pooled percentile the bench’s statistic', () => {
    // Three review rounds moved this wording, and the third still found an eleventh spot the first
    // two had missed: the analyzer's percentile and `pnpm bench`'s are the *same statistic* but not
    // *comparable magnitudes* (the bench runs under SwiftShader). Every place that says the first
    // half must say the second, or a reader pastes the tables and compares milliseconds.
    const repo = fileURLToPath(new URL('../../', import.meta.url));
    const files = [
      'docs/dev/input-probe-results.md',
      'docs/dev/rendering-and-shell.md',
      'docs/client/debug-tools.md',
      'packages/shell/src/telemetry/index.ts',
      'tools/input-probe/results/analyze-render.mjs',
      'CHANGELOG.md',
    ];
    let claims = 0;
    for (const name of files) {
      const text = readFileSync(join(repo, name), 'utf8');
      for (const match of text.matchAll(/same \*?statistic\*?/g)) {
        const around = text.slice(
          Math.max(0, (match.index ?? 0) - 300),
          (match.index ?? 0) + match[0].length + 400,
        );
        // Only the claims made next to the bench need the caveat; the sampler's own note about the
        // input probe's index rule is a different sentence entirely.
        if (!/bench|benchmark|11\.3/.test(around)) continue;
        claims++;
        expect(
          /not a comparable|not even the same statistic/.test(around),
          `${name} @${match.index}`,
        ).toBe(true);
      }
    }
    // The wording exists at all — a rewrite that dropped every claim would otherwise pass.
    expect(claims).toBeGreaterThanOrEqual(11);
    // And nothing anywhere says the opposite.
    for (const name of files) {
      const text = readFileSync(join(repo, name), 'utf8');
      expect(text, name).not.toMatch(/directly comparable/i);
      expect(text, name).not.toMatch(/comparable (with|to) (the )?(`?pnpm bench`?|bench)/i);
    }
  });
});
