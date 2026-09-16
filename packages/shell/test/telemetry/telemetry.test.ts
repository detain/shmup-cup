/**
 * `shell/telemetry` (plan M3-02f — the guided render capture): the sampler's distributions over a
 * scripted frame sequence, the in-flight flag that marks a window the sender may have perturbed,
 * the sticky checklist driven from synthetic sample streams, the payload queue's retry and the
 * `XMLHttpRequest` sender — plus the wiring, which starts nothing at all without a log-server URL.
 *
 * The allocation guard of the per-frame path lives in its own file
 * (`telemetry-alloc.test.ts`), as `docs/dev/conventions.md` requires.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_QUEUED_SAMPLES,
  RENDER_CHECK_ORDER,
  RENDER_FRAME_SLOT,
  RENDER_HIST_MAX_BUCKETS,
  RENDER_HIST_STEP,
  RENDER_PROFILE_KIND,
  RENDER_WINDOW_MAX_FRAMES,
  RenderCheckTally,
  RenderChecklist,
  RenderReporter,
  RenderSampleQueue,
  RenderSampler,
  createRenderCheckFacts,
  createRenderTelemetry,
  evaluateRenderChecklist,
  makeRenderSessionId,
  renderReportEndpoint,
  type RenderSample,
  type RenderSampleContext,
  type RenderTelemetryEnv,
} from '../../src/telemetry/index.js';

/**
 * A context with the given overrides (everything else neutral).
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
    cameraX: 100,
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
    enemies: 0,
    particles: 0,
    rank: 2,
    vsyncLock: true,
    assists: [],
    ...over,
  };
}

/** Session-level facts for the payload tests. */
const ENV: RenderTelemetryEnv = {
  buildId: '9524c84',
  device: 'LS43AM702U',
  userAgent: 'Chrome/69',
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
 * A closed window with the given context and duration.
 *
 * @param over - Context overrides.
 * @param durationMs - Window length (default 3000).
 * @param startMs - When the window opened (default 0).
 * @returns The sample.
 */
function sample(
  over: Partial<RenderSampleContext> = {},
  durationMs = 3000,
  startMs = 0,
): RenderSample {
  return {
    seq: 1,
    startMs,
    durationMs,
    frames: 180,
    measuredFrames: 180,
    fps: 60,
    sendInFlightFrames: 0,
    frameMs: [16, 16.7, 17, 20],
    tickMs: [0.1, 0.2, 0.3, 0.4],
    renderMs: [0.9, 1.2, 2.1, 4],
    drawCalls: [12, 12, 12, 12],
    hist: {
      frameMs: [16, 1, 16.75, 178, 20, 1],
      tickMs: [0.1, 1, 0.2, 178, 0.4, 1],
      renderMs: [0.9, 1, 1.2, 170, 2.1, 8, 4, 1],
      drawCalls: [12, 180],
    },
    rebuilds: 179,
    renderTargetKb: 0,
    tickFrames: [0, 180, 0, 0],
    raf: [0, 0, 180, 0, 0, 0, 0, 0],
    context: context(over),
    marks: [],
  };
}

describe('telemetry/renderReportEndpoint', () => {
  it.each([
    ['http://10.0.0.2:8787', 'http://10.0.0.2:8787/report'],
    ['http://10.0.0.2:8787/', 'http://10.0.0.2:8787/report'],
    ['http://10.0.0.2:8787/report', 'http://10.0.0.2:8787/report'],
    ['  https://host/x//  ', 'https://host/x/report'],
  ])('%j → %j', (input, expected) => {
    expect(renderReportEndpoint(input)).toBe(expected);
  });

  it.each([undefined, null, '', '   ', '10.0.0.2:8787', 'ws://10.0.0.2:8787'])(
    'turns telemetry off for %j',
    (input) => {
      expect(renderReportEndpoint(input)).toBeNull();
    },
  );
});

describe('telemetry/makeRenderSessionId', () => {
  it('is a file-safe id that keeps render sessions apart from the probe’s', () => {
    const id = makeRenderSessionId(1_700_000_000_000, 0.5);
    expect(id).toMatch(/^rp-[a-z0-9]+-[a-z0-9]{4}$/);
    expect(id.startsWith('rp-')).toBe(true);
  });

  it('pads a tiny random to four digits and sorts by start time', () => {
    expect(makeRenderSessionId(1_700_000_000_000, 0).endsWith('-0000')).toBe(true);
    const a = makeRenderSessionId(1_700_000_000_000, 0.1);
    const b = makeRenderSessionId(1_700_000_100_000, 0.1);
    expect(a < b).toBe(true);
  });
});

/**
 * How many frames a flat `[value, count, …]` histogram holds.
 *
 * @param hist - The histogram.
 * @returns The total count.
 */
function histFrames(hist: number[]): number {
  let total = 0;
  for (let i = 1; i < hist.length; i += 2) total += hist[i];
  return total;
}

/**
 * The bucket values of a flat `[value, count, …]` histogram.
 *
 * @param hist - The histogram.
 * @returns The values, in the order they are stored.
 */
function histValues(hist: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < hist.length; i += 2) out.push(hist[i]);
  return out;
}

/**
 * The value at a quantile of a flat `[value, count, …]` histogram — what
 * `results/analyze-render.mjs` does to a whole group.
 *
 * @param hist - The histogram.
 * @param fraction - 0 … 1.
 * @returns The value, or `NaN` when the histogram is empty.
 */
function histPercentile(hist: number[], fraction: number): number {
  const total = histFrames(hist);
  if (total === 0) return Number.NaN;
  const target = Math.min(total - 1, Math.floor(fraction * (total - 1) + 0.5));
  let seen = 0;
  for (let i = 0; i < hist.length; i += 2) {
    seen += hist[i + 1];
    if (seen > target) return hist[i];
  }
  return Number.NaN;
}

describe('telemetry/RenderSampler', () => {
  /**
   * Feeds one frame to a sampler.
   *
   * @param sampler - The sampler.
   * @param values - The frame's figures.
   * @param values.frameMs - Frame delta (0 = none yet).
   * @param values.tickMs - Tick time.
   * @param values.renderMs - Render time.
   * @param values.drawCalls - Draw calls.
   * @param values.rebuilds - Cumulative structure rebuilds.
   * @param values.rtBytes - Cumulative pooled render-target bytes.
   * @param values.ticks - Ticks the frame ran.
   * @param values.rafBucket - rAF histogram bucket.
   * @param inFlight - Whether a POST was outstanding.
   */
  function frame(
    sampler: RenderSampler,
    values: {
      frameMs?: number;
      tickMs?: number;
      renderMs?: number;
      drawCalls?: number;
      rebuilds?: number;
      rtBytes?: number;
      ticks?: number;
      rafBucket?: number;
    },
    inFlight = false,
  ): void {
    const inbox = sampler.frame;
    inbox[RENDER_FRAME_SLOT.frameMs] = values.frameMs ?? 16.7;
    inbox[RENDER_FRAME_SLOT.tickMs] = values.tickMs ?? 0.2;
    inbox[RENDER_FRAME_SLOT.renderMs] = values.renderMs ?? 1;
    inbox[RENDER_FRAME_SLOT.drawCalls] = values.drawCalls ?? 12;
    inbox[RENDER_FRAME_SLOT.rebuilds] = values.rebuilds ?? 0;
    inbox[RENDER_FRAME_SLOT.renderTargetBytes] = values.rtBytes ?? 0;
    inbox[RENDER_FRAME_SLOT.ticks] = values.ticks ?? 1;
    inbox[RENDER_FRAME_SLOT.rafBucket] = values.rafBucket ?? 2;
    sampler.commitFrame(inFlight);
  }

  it('reports min / median / p95 / max of a scripted frame sequence, not the last reading', () => {
    const sampler = new RenderSampler();
    for (let i = 0; i < 100; i++) {
      frame(sampler, {
        renderMs: i + 1,
        drawCalls: 10 + (i % 3),
        rebuilds: i,
        rtBytes: 512 * 1024,
      });
    }
    const closed = sampler.close(1, 0, 1000, context(), []);
    expect(closed).not.toBeNull();
    const window = closed as RenderSample;
    // 100 values 1 … 100: p50 is the 51st, p95 the 95th (the input probe analyzer's rule).
    expect(window.renderMs).toEqual([1, 51, 95, 100]);
    expect(window.frameMs).toEqual([16.7, 16.7, 16.7, 16.7]);
    expect(window.drawCalls).toEqual([10, 11, 12, 12]);
    expect(window.frames).toBe(100);
    expect(window.measuredFrames).toBe(100);
    expect(window.fps).toBe(100);
    expect(window.tickFrames).toEqual([0, 100, 0, 0]);
    expect(window.raf[2]).toBe(100);
    // The rebuild counter is cumulative — a window reports its own delta.
    expect(window.rebuilds).toBe(99);
    expect(window.renderTargetKb).toBe(512);
    expect(window.context.zone).toBe('A');
  });

  it('carries a quantized histogram of every series, so a group can be pooled exactly', () => {
    const sampler = new RenderSampler();
    // A plausible window: 180 frames whose render time sits at ~1.2 ms with a tail at ~3 ms.
    for (let i = 0; i < 180; i++) {
      frame(sampler, {
        renderMs: i < 171 ? 1.18 + (i % 3) * 0.02 : 2.95 + (i % 3) * 0.04,
        drawCalls: 12 + (i % 2),
      });
    }
    const window = sampler.close(1, 0, 3000, context(), []) as RenderSample;
    // Every measured frame is in each histogram (the frame series skips the no-delta frames only).
    expect(histFrames(window.hist.renderMs)).toBe(window.measuredFrames);
    expect(histFrames(window.hist.tickMs)).toBe(window.measuredFrames);
    expect(histFrames(window.hist.drawCalls)).toBe(window.measuredFrames);
    // Values ascend and the pair count stays bounded, so a payload cannot grow without limit.
    expect(histValues(window.hist.renderMs)).toEqual(
      [...histValues(window.hist.renderMs)].sort((a, b) => a - b),
    );
    expect(window.hist.renderMs.length / 2).toBeLessThanOrEqual(RENDER_HIST_MAX_BUCKETS);
    // The percentile read off the histogram is the window's own, up to the quantum.
    expect(
      Math.abs(histPercentile(window.hist.renderMs, 0.95) - window.renderMs[2]),
    ).toBeLessThanOrEqual(RENDER_HIST_STEP.renderMs);
    expect(
      Math.abs(histPercentile(window.hist.renderMs, 0.5) - window.renderMs[1]),
    ).toBeLessThanOrEqual(RENDER_HIST_STEP.renderMs);
    // Draw calls are whole numbers, so their histogram is exact: 90 frames each of 12 and 13.
    expect(window.hist.drawCalls).toEqual([12, 90, 13, 90]);
    // A window with nothing in it carries empty histograms rather than junk.
    frame(sampler, { frameMs: 0, rafBucket: -1 });
    const first = sampler.close(2, 3000, 6000, context(), []) as RenderSample;
    expect(first.hist.frameMs).toEqual([]);
    expect(first.frameMs).toEqual([0, 0, 0, 0]);
  });

  it('coarsens the histogram of a wildly spread window instead of one bucket per frame', () => {
    const sampler = new RenderSampler();
    // A stalling window: every frame a different render time across two orders of magnitude.
    for (let i = 0; i < 400; i++) frame(sampler, { renderMs: 0.5 + i * 0.37 });
    const window = sampler.close(1, 0, 6000, context(), []) as RenderSample;
    expect(window.hist.renderMs.length / 2).toBeLessThanOrEqual(RENDER_HIST_MAX_BUCKETS);
    expect(histFrames(window.hist.renderMs)).toBe(400);
    // Coarse, but still the right answer to within a few per cent of the real p95.
    expect(
      Math.abs(histPercentile(window.hist.renderMs, 0.95) - window.renderMs[2]) /
        window.renderMs[2],
    ).toBeLessThan(0.05);
  });

  it('counts the frames a send was in flight during so a perturbed window can be excluded', () => {
    const sampler = new RenderSampler();
    for (let i = 0; i < 10; i++) frame(sampler, { renderMs: 1 }, i < 3);
    expect(sampler.sendInFlightFrames).toBe(3);
    const window = sampler.close(1, 0, 1000, context(), []) as RenderSample;
    expect(window.sendInFlightFrames).toBe(3);
    // And a clean window says so.
    for (let i = 0; i < 10; i++) frame(sampler, { renderMs: 1 });
    expect((sampler.close(2, 1000, 2000, context(), []) as RenderSample).sendInFlightFrames).toBe(
      0,
    );
  });

  it('ignores a frame with no delta yet but still records its tick and render times', () => {
    const sampler = new RenderSampler();
    frame(sampler, { frameMs: 0, rafBucket: -1, renderMs: 5 });
    frame(sampler, { frameMs: 16.7, renderMs: 5 });
    const window = sampler.close(1, 0, 100, context(), []) as RenderSample;
    expect(window.frames).toBe(2);
    expect(window.frameMs).toEqual([16.7, 16.7, 16.7, 16.7]);
    expect(window.renderMs).toEqual([5, 5, 5, 5]);
    expect(window.raf.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('buckets the ticks per frame like the overlay (0 / 1 / 2 / 3-or-more)', () => {
    const sampler = new RenderSampler();
    frame(sampler, { ticks: 0 });
    frame(sampler, { ticks: 1 });
    frame(sampler, { ticks: 2 });
    frame(sampler, { ticks: 7 });
    frame(sampler, { ticks: -1 });
    const window = sampler.close(1, 0, 100, context(), []) as RenderSample;
    expect(window.tickFrames).toEqual([2, 1, 1, 1]);
  });

  it('returns null and starts a new window when no frame was recorded', () => {
    const sampler = new RenderSampler();
    expect(sampler.close(1, 0, 3000, context(), [])).toBeNull();
    frame(sampler, {});
    expect(sampler.close(1, 3000, 6000, context(), [])).not.toBeNull();
  });

  it('counts every frame but stores at most RENDER_WINDOW_MAX_FRAMES timings', () => {
    const sampler = new RenderSampler();
    for (let i = 0; i < RENDER_WINDOW_MAX_FRAMES + 50; i++) frame(sampler, { renderMs: 1 });
    const window = sampler.close(1, 0, 1000, context(), []) as RenderSample;
    expect(window.frames).toBe(RENDER_WINDOW_MAX_FRAMES + 50);
    expect(window.measuredFrames).toBe(RENDER_WINDOW_MAX_FRAMES);
  });
});

describe('telemetry/checklist', () => {
  it('evaluates the M1–M8 items from facts, and never ticks the manual one', () => {
    const facts = createRenderCheckFacts();
    expect(evaluateRenderChecklist(facts).M1).toBe(false);
    facts.titleSeconds = 30;
    facts.denseSeconds = 30;
    expect(evaluateRenderChecklist(facts).M1).toBe(true);
    facts.crtSeconds = [20, 20, 20];
    expect(evaluateRenderChecklist(facts).M2).toBe(true);
    facts.stagesSampled = 3;
    expect(evaluateRenderChecklist(facts).M3).toBe(true);
    facts.freshDenseSeconds = 6;
    facts.laterDenseSeconds = 6;
    expect(evaluateRenderChecklist(facts).M4).toBe(true);
    facts.bestStageSeconds = 60;
    expect(evaluateRenderChecklist(facts).M5).toBe(true);
    facts.zonesSampled = 2;
    expect(evaluateRenderChecklist(facts).M6).toBe(true);
    facts.leftAndReturned = true;
    expect(evaluateRenderChecklist(facts).M7).toBe(true);
    expect(evaluateRenderChecklist(facts).M8).toBe(false);
  });

  it('is sticky: an item never un-ticks', () => {
    const checklist = new RenderChecklist();
    const facts = createRenderCheckFacts();
    facts.leftAndReturned = true;
    expect(checklist.update(facts)).toEqual(['M7']);
    expect(checklist.update(facts)).toEqual([]);
    facts.leftAndReturned = false;
    checklist.update(facts);
    expect(checklist.isDone('M7')).toBe(true);
    expect(checklist.doneCount).toBe(1);
  });

  it('lists every item with its label and marks the manual one', () => {
    const items = new RenderChecklist().items();
    expect(items.map((i) => i.id)).toEqual([...RENDER_CHECK_ORDER]);
    expect(items.every((i) => i.label.length > 0)).toBe(true);
    expect(items.filter((i) => i.manual).map((i) => i.id)).toEqual(['M8']);
  });

  it('ticks itself from a synthetic sample stream and marks each captured window', () => {
    const tally = new RenderCheckTally();
    const checklist = new RenderChecklist();
    /**
     * Folds a window in and updates the checklist.
     *
     * @param s - The window.
     * @param resumed - Whether the app came back from Home during it.
     * @returns The window's marks.
     */
    const add = (s: RenderSample, resumed = false): string[] => {
      const marks = tally.add(s, resumed);
      checklist.update(tally.facts);
      return marks;
    };

    // 30 s on the title, then 30 s of a dense boss frame → M1.
    expect(add(sample({ scene: 'title', stage: null, zone: null }, 30_000))).toEqual(['M1']);
    expect(checklist.isDone('M1')).toBe(false);
    const dense = add(sample({ bullets: 400 }, 30_000, 10_000));
    expect(dense).toContain('M1');
    expect(dense).toContain('M4');
    expect(checklist.isDone('M1')).toBe(true);

    // The same section three times, once per CRT setting → M2 (and the stage time feeds M5).
    add(sample({ crtFilter: 'off' }, 20_000));
    add(sample({ crtFilter: 'light' }, 20_000));
    expect(checklist.isDone('M2')).toBe(false);
    add(sample({ crtFilter: 'full' }, 20_000));
    expect(checklist.isDone('M2')).toBe(true);
    expect(checklist.isDone('M5')).toBe(true);

    // Two more stages, 10 s each → M3; a second zone with CRT on and off → M6.
    add(sample({ stage: 'zone-d', zone: 'D' }, 12_000));
    expect(checklist.isDone('M3')).toBe(false);
    add(sample({ stage: 'zone-h', zone: 'H' }, 12_000));
    expect(checklist.isDone('M3')).toBe(true);
    expect(checklist.isDone('M6')).toBe(true);

    // A dense pattern again, well after the fresh-launch window → M4.
    add(sample({ bullets: 400 }, 8000, 300_000));
    expect(checklist.isDone('M4')).toBe(true);

    // Home and back → M7; M8 stays manual for ever.
    expect(add(sample({}, 3000), true)).toContain('M7');
    expect(checklist.isDone('M7')).toBe(true);
    expect(checklist.isDone('M8')).toBe(false);
    expect(checklist.doneCount).toBe(7);
  });
});

describe('telemetry/RenderSampleQueue', () => {
  it('numbers payloads and drains the queue', () => {
    const queue = new RenderSampleQueue('rp-test');
    queue.push(sample());
    queue.push(sample());
    expect(queue.pending).toBe(2);
    const payload = queue.build(ENV, [], 123);
    expect(payload.kind).toBe(RENDER_PROFILE_KIND);
    expect(payload.session).toBe('rp-test');
    expect(payload.seq).toBe(1);
    expect(payload.sentAt).toBe(123);
    expect(payload.samples).toHaveLength(2);
    expect(payload.droppedSamples).toBe(0);
    expect(queue.pending).toBe(0);
    expect(queue.lastSeq).toBe(1);
  });

  it('re-queues a failed payload’s samples in front, under a new seq', () => {
    const queue = new RenderSampleQueue('rp-test');
    queue.push(sample({ zone: 'A' }));
    const failed = queue.build(ENV, [], 1);
    queue.push(sample({ zone: 'B' }));
    queue.restore(failed);
    const next = queue.build(ENV, [], 2);
    expect(next.seq).toBe(2);
    expect(next.samples.map((s) => s.context.zone)).toEqual(['A', 'B']);
  });

  it('drops the oldest samples past the cap and counts them', () => {
    const queue = new RenderSampleQueue('rp-test', 3);
    for (let i = 0; i < 5; i++) queue.push(sample({ cameraX: i }));
    const payload = queue.build(ENV, [], 1);
    expect(payload.droppedSamples).toBe(2);
    expect(payload.samples.map((s) => s.context.cameraX)).toEqual([2, 3, 4]);
    expect(MAX_QUEUED_SAMPLES).toBeGreaterThan(3);
  });
});

/** A recording `XMLHttpRequest` stand-in: nothing is sent until the test resolves it. */
class FakeXhr {
  /** Every request made, newest last. */
  static readonly all: FakeXhr[] = [];
  /** Method and URL of `open`. */
  opened: string[] = [];
  /** Request headers. */
  readonly headers: Record<string, string> = {};
  /** The body handed to `send`. */
  body: string | null = null;
  /** Response status the test sets before calling `onload`. */
  status = 200;
  /** Timeout the sender set. */
  timeout = 0;
  /** Success handler. */
  onload: (() => void) | null = null;
  /** Network-error handler. */
  onerror: (() => void) | null = null;
  /** Timeout handler. */
  ontimeout: (() => void) | null = null;

  constructor() {
    FakeXhr.all.push(this);
  }

  /**
   * Records the request line.
   *
   * @param method - HTTP method.
   * @param url - The URL.
   */
  open(method: string, url: string): void {
    this.opened = [method, url];
  }

  /**
   * Records a header.
   *
   * @param name - Header name.
   * @param value - Header value.
   */
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  /**
   * Records the body (the response is delivered by the test).
   *
   * @param body - The serialized payload.
   */
  send(body: string): void {
    this.body = body;
  }
}

/**
 * A reporter over {@link FakeXhr}.
 *
 * @param queue - The sample queue.
 * @returns The reporter.
 */
function fakeReporter(queue: RenderSampleQueue): RenderReporter {
  return new RenderReporter(
    'http://10.0.0.2:8787/report',
    queue,
    () => new FakeXhr() as unknown as XMLHttpRequest,
    () => 1000,
  );
}

describe('telemetry/RenderReporter', () => {
  it('POSTs text/plain (a CORS simple request) with a timeout, and one request at a time', () => {
    FakeXhr.all.length = 0;
    const queue = new RenderSampleQueue('rp-test');
    const reporter = fakeReporter(queue);
    expect(reporter.enabled).toBe(true);
    queue.push(sample());
    expect(reporter.send(ENV, [], 0)).toBe(true);
    const xhr = FakeXhr.all[0];
    expect(xhr.opened).toEqual(['POST', 'http://10.0.0.2:8787/report']);
    expect(xhr.headers['Content-Type']).toBe('text/plain;charset=UTF-8');
    expect(xhr.timeout).toBeGreaterThan(0);
    expect(JSON.parse(xhr.body ?? '{}')).toMatchObject({ kind: RENDER_PROFILE_KIND, seq: 1 });
    expect(reporter.status.inFlight).toBe(true);

    // A second window while the first request is still out: nothing goes on the wire.
    queue.push(sample());
    expect(reporter.send(ENV, [], 0)).toBe(false);
    expect(FakeXhr.all).toHaveLength(1);

    xhr.onload?.();
    expect(reporter.status.inFlight).toBe(false);
    expect(reporter.status.lastOkSeq).toBe(1);
    expect(reporter.send(ENV, [], 0)).toBe(true);
    expect(FakeXhr.all).toHaveLength(2);
  });

  it('sends nothing when there is nothing to send', () => {
    FakeXhr.all.length = 0;
    const reporter = fakeReporter(new RenderSampleQueue('rp-test'));
    expect(reporter.send(ENV, [], 0)).toBe(false);
    expect(FakeXhr.all).toHaveLength(0);
  });

  it.each([
    ['network error', (x: FakeXhr): void => x.onerror?.()],
    ['timeout', (x: FakeXhr): void => x.ontimeout?.()],
    [
      'HTTP 500',
      (x: FakeXhr): void => {
        x.status = 500;
        x.onload?.();
      },
    ],
  ])('re-queues the samples of a failed request (%s)', (reason, fail) => {
    FakeXhr.all.length = 0;
    const queue = new RenderSampleQueue('rp-test');
    const reporter = fakeReporter(queue);
    queue.push(sample({ zone: 'A' }));
    reporter.send(ENV, [], 0);
    fail(FakeXhr.all[0]);
    expect(reporter.status.failures).toBe(1);
    expect(reporter.status.lastError).toBe(reason);
    expect(reporter.status.inFlight).toBe(false);
    expect(queue.pending).toBe(1);
    reporter.send(ENV, [], 0);
    const resent = JSON.parse(FakeXhr.all[1].body ?? '{}') as { seq: number; samples: unknown[] };
    expect(resent.seq).toBe(2);
    expect(resent.samples).toHaveLength(1);
  });

  it('is disabled without an endpoint', () => {
    const queue = new RenderSampleQueue('rp-test');
    const reporter = new RenderReporter(
      null,
      queue,
      () => new FakeXhr() as unknown as XMLHttpRequest,
      () => 0,
    );
    queue.push(sample());
    expect(reporter.enabled).toBe(false);
    expect(reporter.send(ENV, [], 0)).toBe(false);
  });
});

/** A window stand-in: the report timer, the listeners and (optionally) a document. */
class FakeWindow {
  /** Listeners by event type. */
  readonly listeners: Record<string, Array<() => void>> = {};
  /** The interval callback the telemetry installed, or `null`. */
  timer: (() => void) | null = null;
  /** Interval the telemetry asked for. */
  intervalMs = 0;
  /** `clearInterval` calls. */
  cleared = 0;

  /**
   * Registers a listener.
   *
   * @param type - Event type.
   * @param handler - The listener.
   */
  addEventListener(type: string, handler: () => void): void {
    (this.listeners[type] ??= []).push(handler);
  }

  /**
   * Removes a listener.
   *
   * @param type - Event type.
   * @param handler - The listener.
   */
  removeEventListener(type: string, handler: () => void): void {
    const list = this.listeners[type] ?? [];
    const at = list.indexOf(handler);
    if (at >= 0) list.splice(at, 1);
  }

  /**
   * Installs the report timer.
   *
   * @param handler - What the timer runs.
   * @param ms - The interval.
   * @returns The handle.
   */
  setInterval(handler: () => void, ms: number): number {
    this.timer = handler;
    this.intervalMs = ms;
    return 7;
  }

  /**
   * Stops the report timer.
   *
   * @param handle - The handle `setInterval` returned.
   */
  clearInterval(handle: number): void {
    if (handle === 7) this.timer = null;
    this.cleared++;
  }

  /**
   * Fires a listener.
   *
   * @param type - Event type.
   */
  fire(type: string): void {
    for (const handler of this.listeners[type] ?? []) handler();
  }
}

/**
 * A running capture over a {@link FakeWindow}.
 *
 * @param reportUrl - The log-server URL (`''` switches telemetry off).
 * @returns The capture, its window and the requests it made.
 */
function wired(reportUrl: string) {
  FakeXhr.all.length = 0;
  const win = new FakeWindow();
  const clock = { now: 0 };
  const telemetry = createRenderTelemetry({
    reportUrl,
    win: win as unknown as Window,
    now: () => clock.now,
    nowEpochMs: () => 1_700_000_000_000,
    random: () => 0.25,
    env: ENV,
    context: () => context(),
    panel: false,
    createRequest: () => new FakeXhr() as unknown as XMLHttpRequest,
  });
  return { telemetry, win, clock };
}

describe('telemetry/createRenderTelemetry', () => {
  it('starts nothing at all without a log-server URL', () => {
    const { telemetry, win } = wired('');
    expect(telemetry.enabled).toBe(false);
    expect(win.timer).toBeNull();
    expect(win.listeners['blur']).toBeUndefined();
    telemetry.commitFrame();
    expect(telemetry.sampler.frames).toBe(0);
    expect(telemetry.report()).toBeNull();
    telemetry.destroy();
    expect(FakeXhr.all).toHaveLength(0);
  });

  it('samples frames, closes a window on the timer and POSTs it', () => {
    const { telemetry, win, clock } = wired('http://10.0.0.2:8787');
    expect(telemetry.session.startsWith('rp-')).toBe(true);
    expect(win.intervalMs).toBe(3000);
    for (let i = 0; i < 180; i++) {
      telemetry.sampler.frame[RENDER_FRAME_SLOT.frameMs] = 16.7;
      telemetry.sampler.frame[RENDER_FRAME_SLOT.renderMs] = 1 + (i % 4);
      telemetry.sampler.frame[RENDER_FRAME_SLOT.ticks] = 1;
      telemetry.sampler.frame[RENDER_FRAME_SLOT.rafBucket] = 2;
      telemetry.commitFrame();
    }
    clock.now = 3000;
    win.timer?.();
    expect(FakeXhr.all).toHaveLength(1);
    const payload = JSON.parse(FakeXhr.all[0].body ?? '{}') as {
      kind: string;
      env: RenderTelemetryEnv;
      checklist: Array<{ id: string }>;
      samples: RenderSample[];
    };
    expect(payload.kind).toBe(RENDER_PROFILE_KIND);
    expect(payload.env.buildId).toBe('9524c84');
    expect(payload.checklist.map((i) => i.id)).toEqual([...RENDER_CHECK_ORDER]);
    expect(payload.samples).toHaveLength(1);
    expect(payload.samples[0].frames).toBe(180);
    expect(payload.samples[0].durationMs).toBe(3000);
    expect(payload.samples[0].renderMs[3]).toBe(4);
    expect(payload.samples[0].marks).toContain('M2');
    telemetry.destroy();
  });

  it('marks the windows a request spanned, so a sender-induced spike can be excluded', () => {
    const { telemetry, win, clock } = wired('http://10.0.0.2:8787');
    telemetry.commitFrame();
    clock.now = 3000;
    win.timer?.(); // sends — the request now stays in flight
    expect(telemetry.status.inFlight).toBe(true);
    telemetry.commitFrame();
    telemetry.commitFrame();
    expect(telemetry.sampler.sendInFlightFrames).toBe(2);
    FakeXhr.all[0].onload?.();
    telemetry.commitFrame();
    clock.now = 6000;
    const window = telemetry.report() as RenderSample;
    expect(window.frames).toBe(3);
    expect(window.sendInFlightFrames).toBe(2);
    telemetry.destroy();
  });

  it('notices Home and the return (the M7 measurement) and stops cleanly', () => {
    const { telemetry, win, clock } = wired('http://10.0.0.2:8787');
    telemetry.commitFrame();
    win.fire('blur');
    win.fire('focus');
    clock.now = 3000;
    const window = telemetry.report() as RenderSample;
    expect(window.marks).toContain('M7');
    expect(telemetry.checklist.isDone('M7')).toBe(true);
    telemetry.destroy();
    expect(win.timer).toBeNull();
    expect(win.listeners['blur']).toEqual([]);
    telemetry.destroy();
    expect(win.cleared).toBe(1);
  });

  it('draws the on-screen checklist once per window, never per frame', () => {
    FakeXhr.all.length = 0;
    const element = {
      style: { cssText: '' },
      textContent: '',
      setAttribute: vi.fn(),
      remove: vi.fn(),
    };
    const doc = {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => element),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible',
    };
    const win = new FakeWindow() as unknown as FakeWindow & { document: unknown };
    win.document = doc;
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win: win as unknown as Window,
      now: () => 0,
      env: ENV,
      context: () => context(),
      createRequest: () => new FakeXhr() as unknown as XMLHttpRequest,
    });
    expect(doc.createElement).toHaveBeenCalledWith('div');
    expect(doc.body.appendChild).toHaveBeenCalledTimes(1);
    expect(element.textContent).toContain('RENDER CAPTURE');
    expect(element.textContent).toContain('[ ] M1');
    expect(element.textContent).toContain('[-] M8');
    const drawn = element.textContent;
    telemetry.commitFrame();
    telemetry.commitFrame();
    expect(element.textContent).toBe(drawn); // a frame never redraws it
    telemetry.report();
    expect(element.textContent).not.toBe(drawn);
    telemetry.destroy();
    expect(element.remove).toHaveBeenCalledTimes(1);
  });
});
