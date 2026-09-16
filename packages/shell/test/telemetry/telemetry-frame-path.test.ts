/**
 * The per-frame path of the render capture (plan M3-02f), the one thing the whole step depends on:
 * **sampling must not change what it samples.** The allocation guard next door
 * (`telemetry-alloc.test.ts`) proves the frame allocates nothing; this file proves the frame does
 * no *work* either — no folding, no sorting, no host calls, no request — so that all of it stays on
 * the report timer where the analyzer can see it and exclude it.
 *
 * The histograms are the reason this matters now: they are folded out of the per-frame series in
 * `RenderSampler.close`, and a future edit that built them per frame instead would keep every test
 * of their *values* green while quietly adding a sort to every displayed frame — measuring the
 * capture instead of the renderer. The sort counter below is what makes that impossible.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RENDER_FRAME_SLOT,
  RENDER_WINDOW_MAX_FRAMES,
  RenderSampler,
  createRenderTelemetry,
  type RenderSample,
  type RenderSampleContext,
  type RenderTelemetryEnv,
} from '../../src/telemetry/index.js';

/** Session-level facts (never read on a frame). */
const ENV: RenderTelemetryEnv = {
  buildId: 'frame-path',
  device: '',
  userAgent: '',
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
 * A neutral window context.
 *
 * @returns The context.
 */
function context(): RenderSampleContext {
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
    rank: 0,
    vsyncLock: true,
    assists: [],
  };
}

/**
 * Feeds one frame of plausible, always-moving figures.
 *
 * @param sampler - The sampler.
 * @param i - The frame index.
 * @param inFlight - Whether a POST was outstanding.
 */
function frame(sampler: RenderSampler, i: number, inFlight = false): void {
  const inbox = sampler.frame;
  inbox[RENDER_FRAME_SLOT.frameMs] = 16.4 + (i % 7) * 0.37;
  inbox[RENDER_FRAME_SLOT.tickMs] = 0.11 + (i % 11) * 0.013;
  inbox[RENDER_FRAME_SLOT.renderMs] = 1.07 + (i % 13) * 0.29;
  inbox[RENDER_FRAME_SLOT.drawCalls] = 4 + (i % 9);
  inbox[RENDER_FRAME_SLOT.rebuilds] = i;
  inbox[RENDER_FRAME_SLOT.renderTargetBytes] = 512 * 1024;
  inbox[RENDER_FRAME_SLOT.ticks] = i % 4;
  inbox[RENDER_FRAME_SLOT.rafBucket] = i % 8;
  sampler.commitFrame(inFlight);
}

/**
 * Counts every `sort()` of a typed array or of an array while the counter is installed — the one
 * observable trace a fold leaves. `Float64Array` has no own `sort`, so patching `%TypedArray%`'s
 * catches the sampler's `scratch.subarray(…).sort()` as well as any array copy a future fold made.
 *
 * @returns The counter and the function that puts the real `sort`s back (always call it).
 */
function countSorts(): { calls: () => number; restore: () => void } {
  let calls = 0;
  const typed = Object.getPrototypeOf(Float64Array.prototype) as {
    sort: (compare?: (a: number, b: number) => number) => unknown;
  };
  const typedSort = typed.sort;
  const arraySort = Array.prototype.sort;
  typed.sort = function patched(
    this: unknown,
    compare?: (a: number, b: number) => number,
  ): unknown {
    calls++;
    return typedSort.call(this, compare);
  };
  Array.prototype.sort = function patched<T>(this: T[], compare?: (a: T, b: T) => number): T[] {
    calls++;
    return arraySort.call(this, compare) as T[];
  };
  return {
    calls: (): number => calls,
    restore: (): void => {
      typed.sort = typedSort;
      Array.prototype.sort = arraySort;
    },
  };
}

describe('shell/telemetry per-frame path does no folding (M3-02f)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sorts nothing on a frame, and exactly once per series when the window closes', () => {
    const sampler = new RenderSampler();
    const sorts = countSorts();
    try {
      for (let i = 0; i < 1000; i++) frame(sampler, i);
      // A histogram built per frame — or any percentile taken on the frame path — would show up
      // here. This is the assertion that keeps the fold on the report timer.
      expect(sorts.calls()).toBe(0);
      const before = sorts.calls();
      const window = sampler.close(1, 0, 3000, context(), []) as RenderSample;
      // Four series (frame, tick, render, draw), one fold each, whatever the frame count was.
      expect(sorts.calls() - before).toBe(4);
      expect(window.hist.renderMs.length).toBeGreaterThan(0);

      // And the count does not grow with the window: a short window folds as often as a long one.
      const short = sorts.calls();
      for (let i = 0; i < 12; i++) frame(sampler, i);
      expect(sorts.calls()).toBe(short);
      sampler.close(2, 3000, 6000, context(), []);
      expect(sorts.calls() - short).toBe(4);
    } finally {
      sorts.restore();
    }
  });

  it('never calls the host on a frame — the context, the device line and the clock are per window', () => {
    const now = vi.fn(() => 0);
    const device = vi.fn(() => 'LS43AM702U');
    const readContext = vi.fn(() => context());
    const createRequest = vi.fn(() => ({}) as XMLHttpRequest);
    const win = {
      /**
       * Installs the report timer.
       *
       * @returns The handle.
       */
      setInterval: (): number => 1,
      /** Stops the timer. */
      clearInterval: (): void => {},
      /** Registers a listener. */
      addEventListener: (): void => {},
      /** Removes a listener. */
      removeEventListener: (): void => {},
    } as unknown as Window;
    const env = { ...ENV };
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win,
      now,
      nowEpochMs: () => ENV.startedAt,
      random: () => 0.5,
      env,
      device,
      context: readContext,
      panel: false,
      createRequest,
    });
    const nowCallsAtStart = now.mock.calls.length;
    for (let i = 0; i < 600; i++) {
      frame(telemetry.sampler, i);
      telemetry.commitFrame();
    }
    // The three things that may allocate or read strings are untouched by 600 frames …
    expect(readContext).not.toHaveBeenCalled();
    expect(device).not.toHaveBeenCalled();
    expect(createRequest).not.toHaveBeenCalled();
    expect(now.mock.calls.length).toBe(nowCallsAtStart);
    // … and all of them happen once when the timer closes the window.
    telemetry.report();
    expect(readContext).toHaveBeenCalledTimes(1);
    expect(device).toHaveBeenCalledTimes(1);
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(env.device).toBe('LS43AM702U');
    telemetry.destroy();
  });

  it('keeps a fixed amount of state however long the window runs', () => {
    const sampler = new RenderSampler();
    for (let i = 0; i < RENDER_WINDOW_MAX_FRAMES * 4; i++) frame(sampler, i);
    const window = sampler.close(1, 0, 60_000, context(), []) as RenderSample;
    expect(window.frames).toBe(RENDER_WINDOW_MAX_FRAMES * 4);
    // Past the cap the frame is still counted, but nothing new is stored — so a session that never
    // reaches its report timer (a stalled sender, a paused tab) cannot grow without bound.
    expect(window.measuredFrames).toBe(RENDER_WINDOW_MAX_FRAMES);
    let histFrames = 0;
    for (let i = 1; i < window.hist.renderMs.length; i += 2) histFrames += window.hist.renderMs[i];
    expect(histFrames).toBe(RENDER_WINDOW_MAX_FRAMES);
  });

  it('clears only the frame’s own slots, so a stale delta is never counted twice', () => {
    const sampler = new RenderSampler();
    frame(sampler, 0);
    // The host writes `frameMs` / `rafBucket` only when it has a delta (the first frame after a
    // resume has none), so `commitFrame` must clear those two and leave the rest for the next
    // frame's own write.
    expect(sampler.frame[RENDER_FRAME_SLOT.frameMs]).toBe(0);
    expect(sampler.frame[RENDER_FRAME_SLOT.rafBucket]).toBe(-1);
    expect(sampler.frame[RENDER_FRAME_SLOT.renderMs]).toBeGreaterThan(0);
    sampler.commitFrame(false);
    const window = sampler.close(1, 0, 100, context(), []) as RenderSample;
    expect(window.frames).toBe(2);
    // Two frames, but only one had a delta and a bucket.
    expect(window.raf.reduce((a, b) => a + b, 0)).toBe(1);
    let frameHist = 0;
    for (let i = 1; i < window.hist.frameMs.length; i += 2) frameHist += window.hist.frameMs[i];
    expect(frameHist).toBe(1);
  });

  it('sends only from the timer: a frame never starts a request, however much is queued', () => {
    const created: unknown[] = [];
    const win = {
      /**
       * Installs the report timer.
       *
       * @returns The handle.
       */
      setInterval: (): number => 1,
      /** Stops the timer. */
      clearInterval: (): void => {},
      /** Registers a listener. */
      addEventListener: (): void => {},
      /** Removes a listener. */
      removeEventListener: (): void => {},
    } as unknown as Window;
    const clock = { now: 0 };
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win,
      now: () => clock.now,
      nowEpochMs: () => ENV.startedAt,
      random: () => 0.5,
      env: { ...ENV },
      context,
      panel: false,
      createRequest: () => {
        const xhr = {
          /** Opens the request. */
          open: (): void => {},
          /** Sets a header. */
          setRequestHeader: (): void => {},
          /** Sends the body — never answered, so the request stays in flight. */
          send: (): void => {},
          timeout: 0,
        };
        created.push(xhr);
        return xhr as unknown as XMLHttpRequest;
      },
    });
    for (let i = 0; i < 300; i++) {
      frame(telemetry.sampler, i);
      telemetry.commitFrame();
    }
    expect(created).toHaveLength(0);
    clock.now = 3000;
    telemetry.report();
    expect(created).toHaveLength(1);
    expect(telemetry.status.inFlight).toBe(true);
    // The request is never answered: the frames that run through it are counted, and still no
    // second request goes out on a frame.
    for (let i = 0; i < 120; i++) {
      frame(telemetry.sampler, i);
      telemetry.commitFrame();
    }
    expect(created).toHaveLength(1);
    expect(telemetry.sampler.sendInFlightFrames).toBe(120);
    telemetry.destroy();
  });
});
