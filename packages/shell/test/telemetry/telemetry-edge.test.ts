/**
 * `shell/telemetry` edge cases and error paths (plan M3-02f) — the things that only happen on the
 * owner's desk: a log server that went away mid-capture, a payload that cannot be serialized, a
 * host with no `XMLHttpRequest` at all, a Tizen `document` that has no `body` yet, the Home overlay
 * that fires `visibilitychange` on one monitor and only `blur` on the other, and the device line
 * that arrives minutes after the capture started.
 *
 * None of these may throw on the game's main thread: the capture is a measuring instrument bolted
 * to a running game, and an instrument that can crash the subject is worse than no instrument.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DENSE_BULLETS,
  FRESH_LAUNCH_MS,
  RENDER_CHECK_ORDER,
  RENDER_FRAME_SLOT,
  RENDER_REPORT_INTERVAL_MS,
  RENDER_REQUEST_TIMEOUT_MS,
  RenderCheckTally,
  RenderChecklist,
  RenderReporter,
  RenderSampleQueue,
  RenderSampler,
  createRenderTelemetry,
  type RenderSample,
  type RenderSampleContext,
  type RenderTelemetryEnv,
} from '../../src/telemetry/index.js';

/** Session-level facts. */
const ENV: RenderTelemetryEnv = {
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
    ...over,
  };
}

/**
 * A closed window with the given context and duration.
 *
 * @param over - Context overrides.
 * @param durationMs - Window length.
 * @param startMs - When the window opened.
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
    hist: { frameMs: [16.75, 180], tickMs: [0.2, 180], renderMs: [1.2, 180], drawCalls: [12, 180] },
    rebuilds: 179,
    renderTargetKb: 0,
    tickFrames: [0, 180, 0, 0],
    raf: [0, 0, 180, 0, 0, 0, 0, 0],
    context: context(over),
    marks: [],
  };
}

/** A window stand-in with a controllable timer and listener set. */
class FakeWindow {
  /** Listeners by type. */
  readonly listeners: Record<string, Array<() => void>> = {};
  /** The report timer's callback. */
  timer: (() => void) | null = null;
  /** The interval it asked for. */
  intervalMs = 0;

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

  /** Stops the report timer. */
  clearInterval(): void {
    this.timer = null;
  }

  /**
   * Fires a listener.
   *
   * @param type - Event type.
   */
  fire(type: string): void {
    for (const handler of [...(this.listeners[type] ?? [])]) handler();
  }
}

describe('telemetry/RenderReporter error paths', () => {
  /**
   * A reporter whose request factory is under the test's control.
   *
   * @param queue - The sample queue.
   * @param createRequest - Makes the request object.
   * @returns The reporter.
   */
  function reporter(queue: RenderSampleQueue, createRequest: () => XMLHttpRequest): RenderReporter {
    return new RenderReporter('http://10.0.0.2:8787/report', queue, createRequest, () => 1000);
  }

  it('records a payload it cannot serialize and puts its samples back', () => {
    const queue = new RenderSampleQueue('rp-test');
    const circular = sample();
    (circular.context as unknown as { self?: unknown }).self = circular.context;
    queue.push(circular);
    const sender = reporter(queue, () => ({}) as XMLHttpRequest);
    expect(sender.send(ENV, [], 0)).toBe(false);
    expect(sender.status.failures).toBe(1);
    expect(sender.status.lastError).toContain('serialize:');
    expect(sender.status.inFlight).toBe(false);
    // The samples are not lost — they go out with the next payload (once they can be serialized).
    expect(queue.pending).toBe(1);
  });

  it('survives a host with no XMLHttpRequest at all instead of taking the frame loop down', () => {
    const queue = new RenderSampleQueue('rp-test');
    queue.push(sample());
    const sender = reporter(queue, () => {
      throw new TypeError('XMLHttpRequest is not defined');
    });
    expect(() => sender.send(ENV, [], 0)).not.toThrow();
    expect(sender.status.lastError).toContain('open:');
    expect(sender.status.inFlight).toBe(false);
    expect(queue.pending).toBe(1);
  });

  it('survives a send() that throws, and is ready to try again', () => {
    const queue = new RenderSampleQueue('rp-test');
    queue.push(sample());
    let fail = true;
    const sent: string[] = [];
    const sender = reporter(queue, () => {
      const xhr = {
        /** Opens the request. */
        open: (): void => {},
        /** Sets a header. */
        setRequestHeader: (): void => {},
        timeout: 0,
        /**
         * Sends the body — throws on the first attempt (the TV's network dropped mid-call).
         *
         * @param body - The serialized payload.
         */
        send: (body: string): void => {
          if (fail) throw new Error('NetworkError');
          sent.push(body);
        },
      };
      return xhr as unknown as XMLHttpRequest;
    });
    expect(sender.send(ENV, [], 0)).toBe(false);
    expect(sender.status.failures).toBe(1);
    expect(sender.status.lastError).toContain('NetworkError');
    expect(sender.status.inFlight).toBe(false);
    fail = false;
    expect(sender.send(ENV, [], 0)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]) as { seq: number }).toMatchObject({ seq: 2 });
  });

  it('asks for the short timeout that keeps a dead server from stalling the capture', () => {
    const queue = new RenderSampleQueue('rp-test');
    queue.push(sample());
    const made: Array<{ timeout: number }> = [];
    const sender = reporter(queue, () => {
      const xhr = {
        /** Opens the request. */
        open: (): void => {},
        /** Sets a header. */
        setRequestHeader: (): void => {},
        /** Sends the body. */
        send: (): void => {},
        timeout: 0,
      };
      made.push(xhr);
      return xhr as unknown as XMLHttpRequest;
    });
    sender.send(ENV, [], 0);
    expect(made[0].timeout).toBe(RENDER_REQUEST_TIMEOUT_MS);
    expect(RENDER_REQUEST_TIMEOUT_MS).toBeLessThan(RENDER_REPORT_INTERVAL_MS);
  });
});

describe('telemetry/RenderSampleQueue overflow accounting', () => {
  it('carries the dropped count of a failed payload over to the next one', () => {
    const queue = new RenderSampleQueue('rp-test', 2);
    for (let i = 0; i < 4; i++) queue.push(sample({ cameraX: i }));
    const failed = queue.build(ENV, [], 1);
    expect(failed.droppedSamples).toBe(2);
    queue.restore(failed);
    queue.push(sample({ cameraX: 99 }));
    const next = queue.build(ENV, [], 2);
    // Two dropped before the failure, one more dropped re-queueing it: the count never goes missing.
    expect(next.droppedSamples).toBe(3);
    expect(next.samples).toHaveLength(2);
    expect(next.samples.map((s) => s.context.cameraX)).toEqual([3, 99]);
  });

  it('drops nothing while the cap is not reached, and reports zero', () => {
    const queue = new RenderSampleQueue('rp-test', 4);
    queue.push(sample());
    const payload = queue.build(ENV, [], 1);
    expect(payload.droppedSamples).toBe(0);
    expect(queue.pending).toBe(0);
    // A build with nothing queued is still a well-formed payload with the next seq.
    const empty = queue.build(ENV, [], 2);
    expect(empty.samples).toEqual([]);
    expect(empty.seq).toBe(2);
  });
});

describe('telemetry/RenderCheckTally edge cases', () => {
  it('treats an empty stage id as no stage, so a menu window feeds nothing', () => {
    const tally = new RenderCheckTally();
    expect(tally.add(sample({ scene: 'pause', stage: '', zone: null }))).toEqual([]);
    expect(tally.facts.crtSeconds).toEqual([0, 0, 0]);
    expect(tally.facts.bestStageSeconds).toBe(0);
  });

  it('files an unknown CRT setting as "off" rather than losing the window', () => {
    const tally = new RenderCheckTally();
    tally.add(sample({ crtFilter: 'scanlines-3000' }, 5000));
    expect(tally.facts.crtSeconds).toEqual([5, 0, 0]);
  });

  it('counts a zone once however many windows it spans', () => {
    const tally = new RenderCheckTally();
    for (let i = 0; i < 5; i++) tally.add(sample({ zone: 'A' }, 3000, i * 3000));
    tally.add(sample({ zone: 'D', stage: 'zone-d' }, 3000, 15_000));
    expect(tally.facts.zonesSampled).toBe(2);
  });

  it('splits dense seconds at the fresh-launch boundary, which is what M4 asks', () => {
    const tally = new RenderCheckTally();
    tally.add(sample({ bullets: DENSE_BULLETS }, 4000, FRESH_LAUNCH_MS - 1));
    tally.add(sample({ bullets: DENSE_BULLETS }, 4000, FRESH_LAUNCH_MS + 1));
    expect(tally.facts.freshDenseSeconds).toBe(4);
    expect(tally.facts.laterDenseSeconds).toBe(4);
    // One bullet short of dense is not dense.
    tally.add(sample({ bullets: DENSE_BULLETS - 1 }, 4000, FRESH_LAUNCH_MS + 2));
    expect(tally.facts.denseSeconds).toBe(8);
  });

  it('marks a title window that is also dense only once for M1', () => {
    const tally = new RenderCheckTally();
    const marks = tally.add(sample({ scene: 'title', stage: null, zone: null, bullets: 400 }));
    expect(marks.filter((m) => m === 'M1')).toHaveLength(1);
    expect(marks).toContain('M4');
  });

  it('needs ten seconds of a stage before it counts toward M3', () => {
    const tally = new RenderCheckTally();
    tally.add(sample({ stage: 'zone-a' }, 9000));
    expect(tally.facts.stagesSampled).toBe(0);
    tally.add(sample({ stage: 'zone-a' }, 2000, 9000));
    expect(tally.facts.stagesSampled).toBe(1);
    expect(tally.facts.bestStageSeconds).toBe(11);
  });
});

describe('telemetry/createRenderTelemetry edge cases', () => {
  /**
   * A request that records its body and answers 200 at once, so the next window can send too.
   *
   * @returns The factory and the bodies it was given.
   */
  function fakeXhrFactory(): { create: () => XMLHttpRequest; bodies: string[] } {
    const bodies: string[] = [];
    return {
      bodies,
      create: (): XMLHttpRequest => {
        const xhr = {
          /** Opens the request. */
          open: (): void => {},
          /** Sets a header. */
          setRequestHeader: (): void => {},
          /**
           * Records the body and completes the request.
           *
           * @param body - The serialized payload.
           */
          send: (body: string): void => {
            bodies.push(body);
            xhr.onload?.();
          },
          timeout: 0,
          status: 200,
          onload: null as (() => void) | null,
        };
        return xhr as unknown as XMLHttpRequest;
      },
    };
  }

  it('re-reads the device line for every window, not only the first (M2-17 is async)', () => {
    const win = new FakeWindow();
    const xhr = fakeXhrFactory();
    const clock = { now: 0 };
    const lines = ['', '', 'LS43AM702U FW M-KSU2SMWWC-2750.0'];
    let read = 0;
    const env = { ...ENV };
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win: win as unknown as Window,
      now: () => clock.now,
      nowEpochMs: () => ENV.startedAt,
      random: () => 0.5,
      env,
      device: () => lines[Math.min(read++, lines.length - 1)],
      context: () => context(),
      panel: false,
      createRequest: xhr.create,
    });
    for (let w = 0; w < 3; w++) {
      telemetry.sampler.frame[RENDER_FRAME_SLOT.renderMs] = 1;
      telemetry.commitFrame();
      clock.now += 3000;
      telemetry.report();
    }
    expect(read).toBe(3);
    // The last payload carries the line that only arrived on the third window.
    const last = JSON.parse(xhr.bodies[xhr.bodies.length - 1]) as { env: RenderTelemetryEnv };
    expect(last.env.device).toBe('LS43AM702U FW M-KSU2SMWWC-2750.0');
    telemetry.destroy();
  });

  it('works without a device getter at all (the browser build)', () => {
    const win = new FakeWindow();
    const env = { ...ENV, device: 'kept' };
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win: win as unknown as Window,
      now: () => 0,
      env,
      context: () => context(),
      panel: false,
      createRequest: () => ({}) as XMLHttpRequest,
    });
    telemetry.commitFrame();
    telemetry.report();
    expect(env.device).toBe('kept');
    telemetry.destroy();
  });

  it('notices the Home overlay through visibilitychange as well as blur', () => {
    const win = new FakeWindow() as FakeWindow & { document: unknown };
    const doc = {
      visibilityState: 'visible',
      body: null,
      /**
       * Registers a listener.
       *
       * @param type - Event type.
       * @param handler - The listener.
       */
      addEventListener: (type: string, handler: () => void): void => {
        (win.listeners[type] ??= []).push(handler);
      },
      /** Removes a listener. */
      removeEventListener: (): void => {},
      /** Creates an element — never reached, `body` is null. */
      createElement: vi.fn(),
    };
    win.document = doc;
    const clock = { now: 0 };
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win: win as unknown as Window,
      now: () => clock.now,
      env: { ...ENV },
      context: () => context(),
      createRequest: () => ({}) as XMLHttpRequest,
    });
    // A document whose body does not exist yet must not be drawn into.
    expect(doc.createElement).not.toHaveBeenCalled();
    telemetry.commitFrame();
    doc.visibilityState = 'hidden';
    win.fire('visibilitychange');
    doc.visibilityState = 'visible';
    win.fire('visibilitychange');
    clock.now = 3000;
    const window = telemetry.report() as RenderSample;
    expect(window.marks).toContain('M7');
    expect(telemetry.checklist.isDone('M7')).toBe(true);
    telemetry.destroy();
  });

  it('does not call a window resumed when it only lost focus', () => {
    const win = new FakeWindow();
    const clock = { now: 0 };
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win: win as unknown as Window,
      now: () => clock.now,
      env: { ...ENV },
      context: () => context(),
      panel: false,
      createRequest: () => ({}) as XMLHttpRequest,
    });
    telemetry.commitFrame();
    win.fire('blur');
    clock.now = 3000;
    // Still behind the Home bar when the window closed: nothing to say about M7 yet.
    expect((telemetry.report() as RenderSample).marks).not.toContain('M7');
    expect(telemetry.checklist.isDone('M7')).toBe(false);
    // A focus with no preceding blur is not a return either.
    win.fire('focus');
    win.fire('focus');
    telemetry.commitFrame();
    clock.now = 6000;
    const second = telemetry.report() as RenderSample;
    expect(second.marks).toContain('M7');
    telemetry.commitFrame();
    clock.now = 9000;
    // And the resumed flag is consumed, not sticky on the windows that follow.
    expect((telemetry.report() as RenderSample).marks).not.toContain('M7');
    telemetry.destroy();
  });

  it('sends what is queued even on a window in which no frame was drawn', () => {
    const win = new FakeWindow();
    const xhr = fakeXhrFactory();
    const clock = { now: 0 };
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win: win as unknown as Window,
      now: () => clock.now,
      nowEpochMs: () => ENV.startedAt,
      env: { ...ENV },
      context: () => context(),
      panel: false,
      createRequest: xhr.create,
    });
    // A window with no frame at all (the tab was hidden the whole 3 s) reports nothing …
    clock.now = 3000;
    expect(telemetry.report()).toBeNull();
    expect(xhr.bodies).toHaveLength(0);
    // … and the next one, with a frame, goes out normally.
    telemetry.commitFrame();
    clock.now = 6000;
    expect(telemetry.report()).not.toBeNull();
    expect(xhr.bodies).toHaveLength(1);
    const payload = JSON.parse(xhr.bodies[0]) as { samples: RenderSample[] };
    // The empty window did not take a sequence number with it.
    expect(payload.samples[0].seq).toBe(1);
    telemetry.destroy();
  });

  it('uses the interval it is given and stops it exactly once', () => {
    const win = new FakeWindow();
    const telemetry = createRenderTelemetry({
      reportUrl: 'http://10.0.0.2:8787',
      win: win as unknown as Window,
      now: () => 0,
      env: { ...ENV },
      context: () => context(),
      intervalMs: 500,
      panel: false,
      createRequest: () => ({}) as XMLHttpRequest,
    });
    expect(win.intervalMs).toBe(500);
    telemetry.destroy();
    telemetry.destroy();
    expect(win.timer).toBeNull();
    expect(win.listeners['blur']).toEqual([]);
    expect(win.listeners['focus']).toEqual([]);
  });

  it('a disabled capture exposes the same surface, so the debug tools need no branch', () => {
    const win = new FakeWindow();
    const telemetry = createRenderTelemetry({
      reportUrl: null,
      win: win as unknown as Window,
      now: () => 0,
      env: { ...ENV },
      context: () => {
        throw new Error('the context must never be read when telemetry is off');
      },
      createRequest: () => {
        throw new Error('no request may be made when telemetry is off');
      },
    });
    expect(telemetry.enabled).toBe(false);
    expect(telemetry.session).toMatch(/^rp-/);
    expect(telemetry.sampler).toBeInstanceOf(RenderSampler);
    expect(telemetry.checklist).toBeInstanceOf(RenderChecklist);
    expect(telemetry.tally).toBeInstanceOf(RenderCheckTally);
    expect(telemetry.checklist.items().map((i) => i.id)).toEqual([...RENDER_CHECK_ORDER]);
    expect(telemetry.status.endpoint).toBeNull();
    expect(() => {
      telemetry.commitFrame();
      telemetry.report();
      telemetry.destroy();
    }).not.toThrow();
  });
});
