/**
 * # telemetry — guided render-profile capture streamed to the log server (plan M3-02f)
 *
 * **Responsibility.** Turns the on-device render measurement of
 * [`docs/dev/rendering-and-shell.md` § Measuring on the TV](../../../../docs/dev/rendering-and-shell.md)
 * (the review's §4 table, M1–M8) from "read a moving overlay and write the numbers down" into a
 * capture the game runs itself: a **sampler** that accumulates the M3-02c figures every frame, a
 * **guided checklist** that tells the owner where to fly and ticks itself when enough of the right
 * samples have arrived, and a **sender** that POSTs a batch of closed sampling windows to the input
 * probe's zero-dependency log server (`tools/input-probe/server/log-server.mjs`, `npm run
 * log-server`) every {@link RENDER_REPORT_INTERVAL_MS}. The session's JSONL is turned into the
 * tables of `docs/dev/input-probe-results.md` §11 by `tools/input-probe/results/analyze-render.mjs`.
 *
 * **It must not perturb what it measures.** That is the whole point of the step, so:
 *
 * - the per-frame path writes numbers into preallocated typed arrays only — the frame hands its
 *   values over through {@link RenderSampler.frame}, a `Float64Array` inbox, so no fractional value
 *   is ever passed as a call argument (which V8 boxes — `docs/dev/conventions.md`), and
 *   {@link RenderSampler.commitFrame} takes a single boolean;
 * - nothing is sent on a frame boundary: the window is closed, the payload built and the request
 *   started from a `setInterval` timer;
 * - every window records {@link RenderSample.sendInFlightFrames} — the frames during which a POST
 *   was still outstanding — so a spike the sender itself caused can be **identified and excluded**
 *   rather than silently recorded as a render cost;
 * - the checklist is drawn as a plain absolutely-positioned `<div>`, updated once per window, so
 *   the guided capture costs the renderer nothing at all.
 *
 * **A sample carries distributions, not readings** ({@link RenderSample}): min / median / p95 / max
 * of the frame, tick, render and draw-call series over the window, the ticks-per-frame and rAF
 * bucket counts, the structure rebuilds of the window and the pooled render-target total — plus the
 * {@link RenderSampleContext} that makes a row meaningful (build id, device line, scene, stage and
 * zone, camera, CRT setting, aspect and scale, GL version, viewport, internal size and the active
 * assists).
 *
 * **Dev / test builds only.** Nothing here is reachable from a release bundle: the module is only
 * imported by `../debug/index.js`, which the apps reach through `__SHMUP_DEV__ ? … : null`, and the
 * endpoint comes from the `__SHMUP_REPORT_URL__` define (`VITE_REPORT_URL` at build time), which is
 * `''` in a release build. `apps/tizen/test/build/tizen-build.test.ts` asserts the sender is absent
 * from `dist/app.js`.
 *
 * **Implements.**
 * - shmup_feat.md §24 — dev tooling: on-device measurement of the render profile
 * - shmup_feat.md §22 — engine systems: the render budget these captures are judged against
 *
 * **Public API.** {@link createRenderTelemetry}, {@link RenderTelemetry},
 * {@link RenderTelemetryOptions}, {@link RenderTelemetryEnv}; the sampler
 * ({@link RenderSampler}, {@link RENDER_FRAME_SLOT}, {@link RENDER_FRAME_SLOTS},
 * {@link RENDER_WINDOW_MAX_FRAMES}, {@link RenderSample}, {@link RenderSampleContext}); the
 * checklist ({@link RenderChecklist}, {@link RenderCheckTally}, {@link evaluateRenderChecklist},
 * {@link RenderCheckId}, {@link RenderCheckItem}, {@link RenderCheckFacts},
 * {@link RENDER_CHECK_LABELS}, {@link RENDER_CHECK_ORDER}, {@link RENDER_MANUAL_CHECKS},
 * {@link createRenderCheckFacts}); the transport ({@link RenderSampleQueue},
 * {@link RenderReporter}, {@link RenderReporterStatus}, {@link RenderProfilePayload},
 * {@link renderReportEndpoint}, {@link makeRenderSessionId}, {@link RENDER_PROFILE_KIND},
 * {@link RENDER_REPORT_INTERVAL_MS}, {@link MAX_QUEUED_SAMPLES}).
 *
 * @module
 */
import { defineModule } from '@shmup/core';
import { RAF_BUCKETS } from '@shmup/render-pixi';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'telemetry',
  status: 'implemented',
  specRefs: ['shmup_feat.md §24', 'shmup_feat.md §22'],
});

// ------------------------------------------------------------------ transport

/** The `kind` field of a render-telemetry payload — how the log server tells the senders apart. */
export const RENDER_PROFILE_KIND = 'render-profile';

/** Interval between report POSTs, in ms (the input probe's, so one log server serves both). */
export const RENDER_REPORT_INTERVAL_MS = 3000;

/** Samples buffered while the server is unreachable; the oldest beyond this are dropped. */
export const MAX_QUEUED_SAMPLES = 400;

/** Request timeout in ms — short enough that a dead server cannot stall the capture. */
export const RENDER_REQUEST_TIMEOUT_MS = 2500;

/**
 * Normalizes the configured base URL into the POST endpoint, or returns `null` when telemetry is
 * off (the `VITE_REPORT_URL` / `__SHMUP_REPORT_URL__` value of a build that was not configured).
 *
 * @param baseUrl - The configured base URL.
 * @returns `<base>/report` (an existing trailing `/report` is kept, trailing slashes removed), or
 *   `null` for an empty / missing value or anything that does not start with `http://` / `https://`.
 *
 * @example
 * ```ts
 * renderReportEndpoint('http://10.0.0.2:8787/');       // 'http://10.0.0.2:8787/report'
 * renderReportEndpoint('http://10.0.0.2:8787/report'); // 'http://10.0.0.2:8787/report'
 * renderReportEndpoint('');                            // null — telemetry off
 * ```
 */
export function renderReportEndpoint(baseUrl: string | undefined | null): string | null {
  if (baseUrl === undefined || baseUrl === null) return null;
  const trimmed = baseUrl.trim();
  if (trimmed === '' || !/^https?:\/\//i.test(trimmed)) return null;
  const noSlash = trimmed.replace(/\/+$/, '');
  return /\/report$/.test(noSlash) ? noSlash : noSlash + '/report';
}

/**
 * Creates a session id, e.g. `rp-lx2k3a-7f3k`. The `rp-` prefix keeps a render session's JSONL
 * apart from the input probe's `ip-` ones in the same log directory; only `[a-z0-9-]`, so it is
 * safe as a file name.
 *
 * @param nowMs - Wall-clock time (`Date.now()`), base 36 so ids sort roughly by start time.
 * @param random - A number in [0, 1) (`Math.random()`), as 4 base-36 digits.
 * @returns The session id.
 *
 * @example
 * ```ts
 * makeRenderSessionId(1_700_000_000_000, 0.5); // → 'rp-…-i000'
 * ```
 */
export function makeRenderSessionId(nowMs: number, random: number): string {
  const r = Math.floor(Math.abs(random) * 36 * 36 * 36 * 36)
    .toString(36)
    .padStart(4, '0');
  return 'rp-' + Math.floor(nowMs).toString(36) + '-' + r;
}

/** Session-level facts every payload repeats, collected once when the capture starts. */
export interface RenderTelemetryEnv {
  /** The build id (`__SHMUP_BUILD__`) — every row must say which bundle produced it. */
  buildId: string;
  /** The M2-17 device line (model, firmware, display, Chrome, GL); `''` in a browser. */
  device: string;
  /** `navigator.userAgent`, or `''` when unavailable. */
  userAgent: string;
  /** CSS pixels of the window. */
  innerWidth: number;
  /** CSS pixels of the window. */
  innerHeight: number;
  /** `window.devicePixelRatio`. */
  devicePixelRatio: number;
  /** The WebGL version the renderer really got (1 or 2 — the review's F8 A/B). */
  webGLVersion: number;
  /** Internal frame width the renderer draws at (384 by default). */
  internalWidth: number;
  /** Internal frame height (216 by default). */
  internalHeight: number;
  /** Launch-to-ready time in ms (`Shell.bootTiming.readyMs`), against the 10 s store budget. */
  bootMs: number;
  /** Wall-clock start of the session (ms since epoch). */
  startedAt: number;
}

/**
 * Payload POSTed to the log server as `text/plain` JSON (a CORS "simple request", no preflight).
 *
 * @remarks
 * The server stores each payload verbatim (plus `receivedAt` / `from`) as one JSONL line. A failed
 * POST re-queues its samples, so they arrive with the next payload under a new `seq` (the failed
 * `seq` never shows up in the log). Samples are only lost when the queue overflows, and that is
 * counted in `droppedSamples`.
 */
export interface RenderProfilePayload {
  /** Always {@link RENDER_PROFILE_KIND} — how the log server picks its summary formatter. */
  kind: string;
  /** Session id ({@link makeRenderSessionId}), one per app launch. */
  session: string;
  /** Monotonic sequence number per session, starting at 1. */
  seq: number;
  /** Wall-clock send time (ms since epoch). */
  sentAt: number;
  /** Session-level facts. */
  env: RenderTelemetryEnv;
  /** The guided checklist as it stands (cumulative, sticky). */
  checklist: RenderCheckItem[];
  /** Sampling windows closed since the previous successful send. */
  samples: RenderSample[];
  /** Samples dropped because the queue overflowed. */
  droppedSamples: number;
}

/**
 * Buffers closed sampling windows and numbers the payloads.
 *
 * @example
 * ```ts
 * const q = new RenderSampleQueue('rp-lx2k3a-7f3k');
 * q.push(sample);
 * const p = q.build(env, checklist.items(), Date.now()); // p.seq === 1
 * q.restore(p); // the POST failed — the sample goes out with seq 2
 * ```
 */
export class RenderSampleQueue {
  /** Samples not yet handed to a payload, oldest first. */
  private queue: RenderSample[] = [];
  /** Sequence number of the last built payload. */
  private seq = 0;
  /** Samples dropped by overflow since the last built payload. */
  private dropped = 0;

  /**
   * @param session - Session id.
   * @param maxSamples - Queue cap; the oldest samples beyond it are dropped and counted.
   */
  constructor(
    readonly session: string,
    readonly maxSamples = MAX_QUEUED_SAMPLES,
  ) {}

  /**
   * Queues a closed window for the next payload.
   *
   * @param sample - The window (stored by reference; do not mutate it afterwards).
   */
  push(sample: RenderSample): void {
    this.queue.push(sample);
    this.trim();
  }

  /** Samples waiting to be sent. */
  get pending(): number {
    return this.queue.length;
  }

  /** Sequence number of the last built payload. */
  get lastSeq(): number {
    return this.seq;
  }

  /**
   * Builds the next payload, draining the queued samples and the dropped counter.
   *
   * @param env - Session-level facts.
   * @param checklist - The checklist rows as they stand.
   * @param sentAt - Wall-clock time (ms since epoch).
   * @returns A payload with the next sequence number.
   */
  build(
    env: RenderTelemetryEnv,
    checklist: RenderCheckItem[],
    sentAt: number,
  ): RenderProfilePayload {
    const samples = this.queue;
    this.queue = [];
    const dropped = this.dropped;
    this.dropped = 0;
    this.seq++;
    return {
      kind: RENDER_PROFILE_KIND,
      session: this.session,
      seq: this.seq,
      sentAt,
      env,
      checklist,
      samples,
      droppedSamples: dropped,
    };
  }

  /**
   * Puts the samples of a failed payload back in front of the queue.
   *
   * @param payload - The payload whose POST failed; its `droppedSamples` count carries over too.
   */
  restore(payload: RenderProfilePayload): void {
    this.queue = payload.samples.concat(this.queue);
    this.dropped += payload.droppedSamples;
    this.trim();
  }

  /** Drops the oldest samples beyond {@link RenderSampleQueue.maxSamples}, counting them. */
  private trim(): void {
    const over = this.queue.length - this.maxSamples;
    if (over > 0) {
      this.queue.splice(0, over);
      this.dropped += over;
    }
  }
}

/** What {@link RenderReporter} shows about the sender, mutated in place. */
export interface RenderReporterStatus {
  /** POST URL, or `null` when telemetry is off. */
  endpoint: string | null;
  /** Whether a request is currently outstanding (the windows count the frames it spans). */
  inFlight: boolean;
  /** `seq` of the last payload the server accepted (0 = none yet). */
  lastOkSeq: number;
  /** Host-clock time of the last success (ms). */
  lastOkAt: number;
  /** Failed requests so far (never reset). */
  failures: number;
  /** Reason of the latest failure, cleared on the next success. */
  lastError: string | null;
}

/**
 * POSTs payloads to the log server; at most one request in flight. A failed request (network
 * error, {@link RENDER_REQUEST_TIMEOUT_MS} timeout, non-2xx status) puts its samples back into the
 * queue so the next payload carries them.
 *
 * @remarks
 * `XMLHttpRequest` rather than `fetch`, exactly as `tools/input-probe/src/reporter.ts`: it has a
 * built-in `timeout` and behaves identically on Chromium 69. `Content-Type: text/plain` keeps the
 * POST a CORS "simple request", so the TV never sends a preflight the log server would have to
 * answer.
 *
 * @example
 * ```ts
 * const reporter = new RenderReporter(renderReportEndpoint(url), queue, () => new XMLHttpRequest());
 * if (reporter.enabled) reporter.send(env, checklist.items(), now());
 * ```
 */
export class RenderReporter {
  /** Current status (mutated in place). */
  readonly status: RenderReporterStatus;

  /**
   * @param endpoint - POST URL, or `null` to disable.
   * @param queue - Sample queue / payload builder.
   * @param createRequest - Makes the request object (injected so tests need no DOM).
   * @param nowEpochMs - Wall-clock now, for the payload's `sentAt`.
   */
  constructor(
    endpoint: string | null,
    private readonly queue: RenderSampleQueue,
    private readonly createRequest: () => XMLHttpRequest,
    private readonly nowEpochMs: () => number,
  ) {
    this.status = {
      endpoint,
      inFlight: false,
      lastOkSeq: 0,
      lastOkAt: 0,
      failures: 0,
      lastError: null,
    };
  }

  /** Whether telemetry is configured (a build with `VITE_REPORT_URL`). */
  get enabled(): boolean {
    return this.status.endpoint !== null;
  }

  /**
   * Builds and sends a payload unless disabled, empty or a request is still in flight.
   *
   * @param env - Session-level facts.
   * @param checklist - The checklist rows as they stand.
   * @param nowMs - Host-clock time, for the status display.
   * @returns Whether a request went out.
   *
   * @remarks
   * Never throws: serialization errors and `send()` exceptions are recorded in {@link status} and
   * re-queue the payload's samples.
   */
  send(env: RenderTelemetryEnv, checklist: RenderCheckItem[], nowMs: number): boolean {
    const url = this.status.endpoint;
    if (url === null || this.status.inFlight || this.queue.pending === 0) return false;
    const payload = this.queue.build(env, checklist, this.nowEpochMs());
    let body: string;
    try {
      body = JSON.stringify(payload);
    } catch (error) {
      this.fail(payload, 'serialize: ' + String(error));
      return false;
    }
    let xhr: XMLHttpRequest;
    try {
      xhr = this.createRequest();
      xhr.open('POST', url, true);
      xhr.timeout = RENDER_REQUEST_TIMEOUT_MS;
      xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
    } catch (error) {
      // No `XMLHttpRequest` at all (a host that is not a browser): never take the frame loop down.
      this.fail(payload, 'open: ' + String(error));
      return false;
    }
    this.status.inFlight = true;
    xhr.onload = (): void => {
      this.status.inFlight = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        this.status.lastOkSeq = payload.seq;
        this.status.lastOkAt = nowMs;
        this.status.lastError = null;
      } else {
        this.fail(payload, 'HTTP ' + xhr.status);
      }
    };
    xhr.onerror = (): void => {
      this.status.inFlight = false;
      this.fail(payload, 'network error');
    };
    xhr.ontimeout = (): void => {
      this.status.inFlight = false;
      this.fail(payload, 'timeout');
    };
    try {
      xhr.send(body);
    } catch (error) {
      this.status.inFlight = false;
      this.fail(payload, String(error));
      return false;
    }
    return true;
  }

  /**
   * Records a failure and re-queues the payload's samples.
   *
   * @param payload - The payload that could not be delivered.
   * @param reason - Short reason (`HTTP 500`, `timeout`, `network error`, …).
   */
  private fail(payload: RenderProfilePayload, reason: string): void {
    this.status.failures++;
    this.status.lastError = reason;
    this.queue.restore(payload);
  }
}

// ------------------------------------------------------------------ sampler

/**
 * Slots of {@link RenderSampler.frame}, the inbox a frame writes its values into before
 * {@link RenderSampler.commitFrame}.
 *
 * @remarks
 * An inbox rather than call arguments on purpose: V8 boxes a fractional argument passed to a call
 * it does not inline (`docs/dev/conventions.md`), and this runs on every displayed frame. A write
 * into a `Float64Array` never boxes.
 */
export const RENDER_FRAME_SLOT = Object.freeze({
  /** Time since the previous displayed frame, ms (0 = no delta yet, the frame is not counted). */
  frameMs: 0,
  /** Time the frame's simulation ticks took, ms. */
  tickMs: 1,
  /** Time `renderer.render` took, ms. */
  renderMs: 2,
  /** Draw calls of the frame (-1 = unknown). */
  drawCalls: 3,
  /** `PixiRenderer.structureRebuilds` (cumulative — the window reports the delta). */
  rebuilds: 4,
  /** Pooled render-target bytes (cumulative — the window reports the reading at its end). */
  renderTargetBytes: 5,
  /** Simulation ticks the frame ran (0 / 1 / 2 / 3-or-more buckets). */
  ticks: 6,
  /** The frame delta's rAF histogram bucket (-1 = none). */
  rafBucket: 7,
} as const);

/** Number of {@link RENDER_FRAME_SLOT} slots. */
export const RENDER_FRAME_SLOTS = 8;

/** Frames whose timings one window stores; 3 s at 60 Hz is 180, so this never truncates in play. */
export const RENDER_WINDOW_MAX_FRAMES = 1024;

/** Ticks-per-frame buckets a window counts (0, 1, 2, 3-or-more — the M3-02b vsync-lock check). */
export const RENDER_TICK_BUCKETS = 4;

/** Decimals the millisecond distributions are rounded to before they go into the JSONL. */
const MS_DIGITS = 3;

/** Where a window was taken — the context that makes a row of the §4 table meaningful. */
export interface RenderSampleContext {
  /** The scene flow's top scene id (`'title'`, `'game'`, `'pause'` …). */
  scene: string;
  /** The stage actually running, or `null` outside a stage. */
  stage: string | null;
  /** The campaign zone's label (`'A'`), or `null` outside a campaign run. */
  zone: string | null;
  /** The campaign zone's name (`'AZURE VERGE'`), or `null`. */
  zoneName: string | null;
  /** The stage runner's checkpoint index (-1 when no stage runs). */
  checkpoint: number;
  /** Camera position, whole pixels (the "same section" check of an A/B run). */
  cameraX: number;
  /** Camera position, whole pixels. */
  cameraY: number;
  /** The CRT setting the renderer is on (`'off'` / `'light'` / `'full'` — the review's F2). */
  crtFilter: string;
  /** The renderer's screen pass (`'blit'` / `'filter'` — F3's pooled target). */
  screenPass: string;
  /** Aspect mode (`'normal'` / `'wide'` / `'classic'`). */
  aspect: string;
  /** Scale mode (`'integer'` / `'fit'` / `'stretch'`). */
  scaleMode: string;
  /** Viewport scale (whole-pixel zoom of the internal frame). */
  scale: number;
  /** Viewport width in device pixels. */
  viewportWidth: number;
  /** Viewport height in device pixels. */
  viewportHeight: number;
  /** The WebGL version the renderer got (F8). */
  webGLVersion: number;
  /** Live enemy bullets — the check that the scene is as loaded as it looks. */
  bullets: number;
  /** Live enemies. */
  enemies: number;
  /** Live particles. */
  particles: number;
  /** The session's rank. */
  rank: number;
  /** Whether the loop's vsync lock is engaged (M3-02b). */
  vsyncLock: boolean;
  /** The assists and debug switches that were on (`'god'`, `'invincible'`, `'slowmo'`, …). */
  assists: string[];
}

/** One closed sampling window: distributions over the window, plus where it was taken. */
export interface RenderSample {
  /** Window number within the session, starting at 1. */
  seq: number;
  /** Host-clock time the window opened, ms. */
  startMs: number;
  /** How long the window lasted, ms. */
  durationMs: number;
  /** Displayed frames in the window. */
  frames: number;
  /** Frames whose timings were stored (capped at {@link RENDER_WINDOW_MAX_FRAMES}). */
  measuredFrames: number;
  /** Frames a second over the window. */
  fps: number;
  /**
   * Frames during which a POST was still outstanding. **Not zero means this window may include the
   * sender's own cost** — the analyzer excludes such windows from the render figures.
   */
  sendInFlightFrames: number;
  /** `[min, median, p95, max]` of the frame deltas, ms. */
  frameMs: number[];
  /** `[min, median, p95, max]` of the tick time, ms. */
  tickMs: number[];
  /** `[min, median, p95, max]` of `renderer.render`, ms — the figure the review needs. */
  renderMs: number[];
  /** `[min, median, p95, max]` of the draw calls. */
  drawCalls: number[];
  /** Frames of this window on which Pixi rebuilt the whole instruction set (the review's F1). */
  rebuilds: number;
  /** Pooled render-target total at the end of the window, KB (F2 / F3). */
  renderTargetKb: number;
  /** Frames that ran 0 / 1 / 2 / 3-or-more ticks in this window. */
  tickFrames: number[];
  /** rAF-delta bucket counts of this window (`RAF_BUCKET_EDGES_MS`). */
  raf: number[];
  /** Where the window was taken. */
  context: RenderSampleContext;
  /** Checklist items this window counted toward, so the analyzer can find the captured runs. */
  marks: string[];
}

/**
 * Accumulates the per-frame render figures and closes them into windows.
 *
 * @remarks
 * Allocation-free per frame: {@link RenderSampler.frame} is the inbox the frame writes into and
 * {@link RenderSampler.commitFrame} only moves numbers into preallocated typed arrays.
 * {@link RenderSampler.close} allocates the window's arrays, but it runs on the report timer
 * (every {@link RENDER_REPORT_INTERVAL_MS}), never on a frame.
 *
 * @example
 * ```ts
 * const sampler = new RenderSampler();
 * sampler.frame[RENDER_FRAME_SLOT.frameMs] = 16.7;
 * sampler.frame[RENDER_FRAME_SLOT.renderMs] = 1.2;
 * sampler.commitFrame(false);
 * const window = sampler.close(1, now, context, marks);
 * ```
 */
export class RenderSampler {
  /** The frame's values; see {@link RENDER_FRAME_SLOT}. Reset by `commitFrame`. */
  readonly frame = new Float64Array(RENDER_FRAME_SLOTS);
  /** Frame deltas of the window, ms. */
  private readonly frameSeries = new Float64Array(RENDER_WINDOW_MAX_FRAMES);
  /** Tick times of the window, ms. */
  private readonly tickSeries = new Float64Array(RENDER_WINDOW_MAX_FRAMES);
  /** Render times of the window, ms. */
  private readonly renderSeries = new Float64Array(RENDER_WINDOW_MAX_FRAMES);
  /** Draw calls of the window. */
  private readonly drawSeries = new Float64Array(RENDER_WINDOW_MAX_FRAMES);
  /** Scratch the quartiles are sorted in. */
  private readonly scratch = new Float64Array(RENDER_WINDOW_MAX_FRAMES);
  /** Frames that ran 0 / 1 / 2 / 3-or-more ticks. */
  private readonly tickBuckets = new Int32Array(RENDER_TICK_BUCKETS);
  /** rAF-delta bucket counts. */
  private readonly rafBuckets = new Int32Array(RAF_BUCKETS);
  /** Whole-number window state: see {@link RenderSampler.counts}. */
  private readonly counts = new Float64Array(6);

  /** Slot indices of {@link RenderSampler.counts}. */
  private static readonly FRAMES = 0;
  /** Frames whose timings were stored. */
  private static readonly MEASURED = 1;
  /** Frames a POST was outstanding during. */
  private static readonly IN_FLIGHT = 2;
  /** `structureRebuilds` when the window opened (-1 = not seen yet). */
  private static readonly REBUILDS_START = 3;
  /** The latest `structureRebuilds` reading. */
  private static readonly REBUILDS_END = 4;
  /** The latest pooled render-target byte reading. */
  private static readonly RT_BYTES = 5;

  constructor() {
    this.reset();
  }

  /** Displayed frames accumulated in the open window. */
  get frames(): number {
    return this.counts[RenderSampler.FRAMES];
  }

  /** Frames of the open window during which a POST was outstanding. */
  get sendInFlightFrames(): number {
    return this.counts[RenderSampler.IN_FLIGHT];
  }

  /**
   * Records the frame whose values are in {@link RenderSampler.frame} and clears the inbox.
   *
   * @param sendInFlight - Whether a report POST was outstanding during this frame (the window
   *   counts them, so a spike the sender caused can be excluded rather than believed).
   *
   * @remarks
   * Allocation-free. A frame with no delta yet (`frameMs` 0, the first one after boot or after a
   * resume) still contributes its tick and render times but no frame delta and no rAF bucket.
   */
  commitFrame(sendInFlight: boolean): void {
    const values = this.frame;
    const counts = this.counts;
    const at = counts[RenderSampler.MEASURED];
    counts[RenderSampler.FRAMES]++;
    if (sendInFlight) counts[RenderSampler.IN_FLIGHT]++;
    if (at < RENDER_WINDOW_MAX_FRAMES) {
      const i = at | 0;
      this.frameSeries[i] = values[RENDER_FRAME_SLOT.frameMs];
      this.tickSeries[i] = values[RENDER_FRAME_SLOT.tickMs];
      this.renderSeries[i] = values[RENDER_FRAME_SLOT.renderMs];
      this.drawSeries[i] = values[RENDER_FRAME_SLOT.drawCalls];
      counts[RenderSampler.MEASURED] = at + 1;
    }
    const bucket = values[RENDER_FRAME_SLOT.rafBucket] | 0;
    if (bucket >= 0 && bucket < RAF_BUCKETS) this.rafBuckets[bucket]++;
    const ticks = values[RENDER_FRAME_SLOT.ticks] | 0;
    this.tickBuckets[ticks < 0 ? 0 : ticks > 3 ? 3 : ticks]++;
    const rebuilds = values[RENDER_FRAME_SLOT.rebuilds];
    if (counts[RenderSampler.REBUILDS_START] < 0) counts[RenderSampler.REBUILDS_START] = rebuilds;
    counts[RenderSampler.REBUILDS_END] = rebuilds;
    counts[RenderSampler.RT_BYTES] = values[RENDER_FRAME_SLOT.renderTargetBytes];
    values[RENDER_FRAME_SLOT.frameMs] = 0;
    values[RENDER_FRAME_SLOT.rafBucket] = -1;
  }

  /**
   * Closes the open window and starts a new one.
   *
   * @param seq - Window number within the session.
   * @param startMs - Host-clock time the window opened.
   * @param endMs - Host-clock time now.
   * @param context - Where the window was taken.
   * @param marks - Checklist items the window counts toward.
   * @returns The window, or `null` when no frame was recorded (nothing to report).
   */
  close(
    seq: number,
    startMs: number,
    endMs: number,
    context: RenderSampleContext,
    marks: string[],
  ): RenderSample | null {
    const counts = this.counts;
    const frames = counts[RenderSampler.FRAMES];
    if (frames === 0) {
      this.reset();
      return null;
    }
    const measured = counts[RenderSampler.MEASURED] | 0;
    const durationMs = endMs - startMs;
    const rebuildsStart = counts[RenderSampler.REBUILDS_START];
    const sample: RenderSample = {
      seq,
      startMs: round(startMs, 1),
      durationMs: round(durationMs, 1),
      frames,
      measuredFrames: measured,
      fps: durationMs > 0 ? round((frames * 1000) / durationMs, 2) : 0,
      sendInFlightFrames: counts[RenderSampler.IN_FLIGHT],
      frameMs: this.quartiles(this.frameSeries, measured, 1, true),
      tickMs: this.quartiles(this.tickSeries, measured, MS_DIGITS, false),
      renderMs: this.quartiles(this.renderSeries, measured, MS_DIGITS, false),
      drawCalls: this.quartiles(this.drawSeries, measured, 0, false),
      rebuilds: rebuildsStart < 0 ? 0 : counts[RenderSampler.REBUILDS_END] - rebuildsStart,
      renderTargetKb: Math.round(counts[RenderSampler.RT_BYTES] / 1024),
      tickFrames: toArray(this.tickBuckets),
      raf: toArray(this.rafBuckets),
      context,
      marks,
    };
    this.reset();
    return sample;
  }

  /** Empties the open window (a new one starts). */
  reset(): void {
    this.counts.fill(0);
    this.counts[RenderSampler.REBUILDS_START] = -1;
    this.tickBuckets.fill(0);
    this.rafBuckets.fill(0);
    this.frame.fill(0);
    this.frame[RENDER_FRAME_SLOT.rafBucket] = -1;
    this.frame[RENDER_FRAME_SLOT.drawCalls] = -1;
  }

  /**
   * `[min, median, p95, max]` of the first `count` entries of a series.
   *
   * @param series - The stored values.
   * @param count - How many are valid.
   * @param digits - Decimals to round to.
   * @param skipZero - Drop zero entries (frames with no delta yet).
   * @returns The four figures, `[0, 0, 0, 0]` when nothing qualifies.
   */
  private quartiles(
    series: Float64Array,
    count: number,
    digits: number,
    skipZero: boolean,
  ): number[] {
    const scratch = this.scratch;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const v = series[i];
      if (skipZero && v === 0) continue;
      scratch[n++] = v;
    }
    if (n === 0) return [0, 0, 0, 0];
    const sorted = scratch.subarray(0, n);
    sorted.sort();
    return [
      round(sorted[0], digits),
      round(sorted[quantileIndex(n, 0.5)], digits),
      round(sorted[quantileIndex(n, 0.95)], digits),
      round(sorted[n - 1], digits),
    ];
  }
}

/**
 * Index of a quantile in a sorted run of `n` values (the input probe analyzer's rule, so the two
 * write-ups quote comparable figures).
 *
 * @param n - How many values.
 * @param fraction - 0 … 1.
 * @returns The index.
 */
function quantileIndex(n: number, fraction: number): number {
  return Math.min(n - 1, Math.floor(fraction * (n - 1) + 0.5));
}

/**
 * Rounds to a number of decimals (JSONL stays small and diffable).
 *
 * @param value - The value.
 * @param digits - Decimals.
 * @returns The rounded value.
 */
function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  let factor = 1;
  for (let i = 0; i < digits; i++) factor *= 10;
  const out = Math.round(value * factor) / factor;
  return out === 0 ? 0 : out;
}

/**
 * Copies a counter array into a plain array (JSON has no typed arrays).
 *
 * @param counts - The counters.
 * @returns A fresh array.
 */
function toArray(counts: Int32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < counts.length; i++) out.push(counts[i]);
  return out;
}

// ------------------------------------------------------------------ guided checklist

/**
 * The guided-capture items, one per row of the measurement table in
 * `docs/dev/rendering-and-shell.md` § Measuring on the TV (the render review's §4, M1–M8).
 */
export type RenderCheckId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8';

/** Display order of the checklist. */
export const RENDER_CHECK_ORDER: readonly RenderCheckId[] = Object.freeze([
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'M6',
  'M7',
  'M8',
] as RenderCheckId[]);

/** What each item asks the owner to do — the whole point is that no notebook is needed. */
export const RENDER_CHECK_LABELS: Readonly<Record<RenderCheckId, string>> = Object.freeze({
  M1: 'Baseline: 30 s on the title, then 30 s of a dense scene (boss)',
  M2: 'CRT OFF, LIGHT and FULL: 20 s of the same practice section each',
  M3: 'Fly 10 s in three different stages (incl. the Mode-7 and the heat-haze one)',
  M4: 'A dense pattern now, and the same one again after a checkpoint restart',
  M5: '60 s in one stage on this WebGL version (repeat the session with ?gl=2)',
  M6: 'Memory: two zones, each with CRT on and with CRT off',
  M7: 'Press Home, wait 10 s, come back',
  M8: 'Input-to-photon: 240 fps video — manual, nothing to capture here',
});

/** Items nothing on the device can observe; they are shown but never tick themselves. */
export const RENDER_MANUAL_CHECKS: readonly RenderCheckId[] = Object.freeze([
  'M8',
] as RenderCheckId[]);

/** Seconds of a dense scene that count as "a dense pattern" for M4. */
export const DENSE_PATTERN_SECONDS = 5;

/** Live enemy bullets from which a window counts as "dense". */
export const DENSE_BULLETS = 60;

/** How long after the session started a window still counts as "a fresh launch" (ms). */
export const FRESH_LAUNCH_MS = 120_000;

/** What the checklist is evaluated from — everything a stream of {@link RenderSample}s can say. */
export interface RenderCheckFacts {
  /** Seconds sampled on the title screen. */
  titleSeconds: number;
  /** Seconds sampled while the scene was dense ({@link DENSE_BULLETS} bullets or more). */
  denseSeconds: number;
  /** Seconds sampled per CRT setting in a stage: `[off, light, full]`. */
  crtSeconds: number[];
  /** Seconds sampled in the stage the most time was spent in. */
  bestStageSeconds: number;
  /** Distinct stages sampled for at least 10 s. */
  stagesSampled: number;
  /** Distinct campaign zones sampled. */
  zonesSampled: number;
  /** Dense seconds sampled within {@link FRESH_LAUNCH_MS} of the session start. */
  freshDenseSeconds: number;
  /** Dense seconds sampled after that. */
  laterDenseSeconds: number;
  /** Whether the app was hidden (Home) and came back while sampling. */
  leftAndReturned: boolean;
}

/**
 * Fresh, all-zero facts.
 *
 * @returns The facts object (mutated in place by {@link RenderCheckTally}).
 */
export function createRenderCheckFacts(): RenderCheckFacts {
  return {
    titleSeconds: 0,
    denseSeconds: 0,
    crtSeconds: [0, 0, 0],
    bestStageSeconds: 0,
    stagesSampled: 0,
    zonesSampled: 0,
    freshDenseSeconds: 0,
    laterDenseSeconds: 0,
    leftAndReturned: false,
  };
}

/**
 * Which items the given facts satisfy (not sticky — see {@link RenderChecklist}).
 *
 * @param f - Current observations.
 * @returns A done flag per item; the {@link RENDER_MANUAL_CHECKS} are always `false`.
 *
 * @example
 * ```ts
 * const facts = createRenderCheckFacts();
 * facts.titleSeconds = 30;
 * facts.denseSeconds = 30;
 * evaluateRenderChecklist(facts).M1; // → true
 * ```
 */
export function evaluateRenderChecklist(f: RenderCheckFacts): Record<RenderCheckId, boolean> {
  const crtOn = f.crtSeconds[1] + f.crtSeconds[2];
  return {
    M1: f.titleSeconds >= 30 && f.denseSeconds >= 30,
    M2: f.crtSeconds[0] >= 20 && f.crtSeconds[1] >= 20 && f.crtSeconds[2] >= 20,
    M3: f.stagesSampled >= 3,
    M4:
      f.freshDenseSeconds >= DENSE_PATTERN_SECONDS && f.laterDenseSeconds >= DENSE_PATTERN_SECONDS,
    M5: f.bestStageSeconds >= 60,
    M6: f.zonesSampled >= 2 && f.crtSeconds[0] > 0 && crtOn > 0,
    M7: f.leftAndReturned,
    M8: false,
  };
}

/** One checklist row, as the panel draws it and the payload carries it. */
export interface RenderCheckItem {
  /** Item identifier. */
  id: RenderCheckId;
  /** What to do ({@link RENDER_CHECK_LABELS}). */
  label: string;
  /** Whether the item has been ticked (sticky). */
  done: boolean;
  /** Whether nothing on the device can tick it ({@link RENDER_MANUAL_CHECKS}). */
  manual: boolean;
}

/**
 * Sticky checklist: once an item is ticked it stays ticked for the rest of the session, exactly
 * like the input probe's (`tools/input-probe/src/checklist.ts`).
 *
 * @example
 * ```ts
 * const checklist = new RenderChecklist();
 * checklist.update(facts); // → ['M1'] — newly ticked ids
 * checklist.isDone('M1');  // → true, and it never goes back
 * ```
 */
export class RenderChecklist {
  /** Tick state per item. */
  private readonly done: Record<RenderCheckId, boolean> = {
    M1: false,
    M2: false,
    M3: false,
    M4: false,
    M5: false,
    M6: false,
    M7: false,
    M8: false,
  };

  /**
   * Ticks every item the facts satisfy.
   *
   * @param facts - Current observations.
   * @returns The ids that became done during this call, in display order.
   */
  update(facts: RenderCheckFacts): RenderCheckId[] {
    const now = evaluateRenderChecklist(facts);
    const newly: RenderCheckId[] = [];
    for (let i = 0; i < RENDER_CHECK_ORDER.length; i++) {
      const id = RENDER_CHECK_ORDER[i];
      if (now[id] && !this.done[id]) {
        this.done[id] = true;
        newly.push(id);
      }
    }
    return newly;
  }

  /**
   * Whether an item is ticked.
   *
   * @param id - Item identifier.
   * @returns The sticky done flag.
   */
  isDone(id: RenderCheckId): boolean {
    return this.done[id];
  }

  /**
   * The rows for display and for the payload.
   *
   * @returns Fresh {@link RenderCheckItem} rows in {@link RENDER_CHECK_ORDER}.
   */
  items(): RenderCheckItem[] {
    const out: RenderCheckItem[] = [];
    for (let i = 0; i < RENDER_CHECK_ORDER.length; i++) {
      const id = RENDER_CHECK_ORDER[i];
      out.push({
        id,
        label: RENDER_CHECK_LABELS[id],
        done: this.done[id],
        manual: RENDER_MANUAL_CHECKS.indexOf(id) >= 0,
      });
    }
    return out;
  }

  /** How many items are ticked. */
  get doneCount(): number {
    let n = 0;
    for (let i = 0; i < RENDER_CHECK_ORDER.length; i++) {
      if (this.done[RENDER_CHECK_ORDER[i]]) n++;
    }
    return n;
  }
}

/**
 * Turns a stream of closed windows into {@link RenderCheckFacts}, and says which items each window
 * counted toward so the analyzer can find the captured runs ({@link RenderSample.marks}).
 *
 * @example
 * ```ts
 * const tally = new RenderCheckTally();
 * const marks = tally.add(sample); // → ['M1', 'M5']
 * checklist.update(tally.facts);
 * ```
 */
export class RenderCheckTally {
  /** The accumulated facts (mutated in place). */
  readonly facts = createRenderCheckFacts();
  /** Seconds sampled per stage id. */
  private readonly stageSeconds: Record<string, number> = {};
  /** Zone labels seen. */
  private readonly zones: string[] = [];

  /**
   * Folds one closed window into the facts.
   *
   * @param sample - The window (its `context` and `durationMs` are what count).
   * @param resumed - Whether the app came back from being hidden during this window.
   * @returns The checklist ids this window fed, in display order (the window's `marks`).
   */
  add(sample: RenderSample, resumed = false): RenderCheckId[] {
    const seconds = sample.durationMs / 1000;
    const context = sample.context;
    const marks: RenderCheckId[] = [];
    const f = this.facts;
    if (resumed) f.leftAndReturned = true;
    const inStage = context.stage !== null && context.stage !== '';
    const dense = context.bullets >= DENSE_BULLETS;

    if (context.scene === 'title') {
      f.titleSeconds += seconds;
      marks.push('M1');
    }
    if (dense) {
      f.denseSeconds += seconds;
      if (sample.startMs <= FRESH_LAUNCH_MS) f.freshDenseSeconds += seconds;
      else f.laterDenseSeconds += seconds;
      if (marks.indexOf('M1') < 0) marks.push('M1');
      marks.push('M4');
    }
    if (inStage) {
      const crt = context.crtFilter === 'full' ? 2 : context.crtFilter === 'light' ? 1 : 0;
      f.crtSeconds[crt] += seconds;
      marks.push('M2');
      const stage = context.stage as string;
      const total = (this.stageSeconds[stage] ?? 0) + seconds;
      this.stageSeconds[stage] = total;
      if (total > f.bestStageSeconds) f.bestStageSeconds = total;
      let stages = 0;
      const ids = Object.keys(this.stageSeconds);
      for (let i = 0; i < ids.length; i++) if (this.stageSeconds[ids[i]] >= 10) stages++;
      f.stagesSampled = stages;
      marks.push('M3');
      marks.push('M5');
      const zone = context.zone;
      if (zone !== null && zone !== '' && this.zones.indexOf(zone) < 0) this.zones.push(zone);
      f.zonesSampled = this.zones.length;
      marks.push('M6');
    }
    if (resumed) marks.push('M7');
    return marks;
  }
}

// ------------------------------------------------------------------ the wired capture

/** What the telemetry needs from its host (the shell's debug tools supply it). */
export interface RenderTelemetryOptions {
  /** The base URL (`__SHMUP_REPORT_URL__` / `VITE_REPORT_URL`); anything else turns telemetry off. */
  readonly reportUrl: string | undefined | null;
  /** The window: the report timer, the visibility listeners and the checklist panel. */
  readonly win: Window;
  /**
   * The host clock (`performance.now()`).
   *
   * @returns Milliseconds.
   */
  readonly now: () => number;
  /**
   * Wall-clock now.
   *
   * @returns Milliseconds since the epoch (default `Date.now`).
   */
  readonly nowEpochMs?: () => number;
  /**
   * A number in [0, 1) for the session id.
   *
   * @returns The number (default `Math.random`).
   */
  readonly random?: () => number;
  /** Session-level facts (`env` of every payload). */
  readonly env: RenderTelemetryEnv;
  /**
   * Fills the context of a window that is about to close. Called once per window (never per
   * frame), so it may read strings.
   *
   * @returns Where the window was taken.
   */
  readonly context: () => RenderSampleContext;
  /** Interval between reports in ms (default {@link RENDER_REPORT_INTERVAL_MS}). */
  readonly intervalMs?: number;
  /** Whether to draw the on-screen checklist panel (default `true`). */
  readonly panel?: boolean;
  /**
   * Makes the request object (injected so tests need no DOM; default `new XMLHttpRequest()`).
   *
   * @returns The request.
   */
  readonly createRequest?: () => XMLHttpRequest;
}

/** The running capture (see {@link createRenderTelemetry}). */
export interface RenderTelemetry {
  /** The session id — it names the JSONL file on the desktop. */
  readonly session: string;
  /** Whether a log server is configured; `false` makes every hook a no-op. */
  readonly enabled: boolean;
  /** The sampler; a frame writes {@link RenderSampler.frame} and the tools call `commitFrame`. */
  readonly sampler: RenderSampler;
  /** The guided checklist. */
  readonly checklist: RenderChecklist;
  /** What the checklist is evaluated from. */
  readonly tally: RenderCheckTally;
  /** The sender's status (also shown on the panel). */
  readonly status: RenderReporterStatus;
  /** Records the frame whose values are in `sampler.frame` (allocation-free). */
  commitFrame(): void;
  /**
   * Closes the open window, folds it into the checklist and sends what is queued. The report timer
   * calls it; a test can call it directly.
   *
   * @returns The window that was closed, or `null` when no frame had been recorded.
   */
  report(): RenderSample | null;
  /** Stops the timer, the listeners and the panel (idempotent). */
  destroy(): void;
}

/** Inline style of the checklist panel: top-right, above the canvas, never interactive. */
const PANEL_STYLE =
  'position:fixed;top:0;right:0;z-index:2147483647;max-width:48ch;padding:4px 6px;' +
  'background:rgba(0,0,0,0.72);color:#cfe;font:11px/1.35 monospace;white-space:pre;' +
  'pointer-events:none;text-align:left;';

/**
 * Creates the guided render-profile capture (plan M3-02f).
 *
 * @param options - The endpoint, the window, the clocks and the context reader.
 * @returns The capture; `enabled` is `false` (and every hook a no-op) without a report URL.
 *
 * @remarks
 * With no `reportUrl` nothing is started at all — no timer, no listeners, no panel — so a dev build
 * that was not pointed at a log server pays only for the disabled object.
 *
 * @example
 * ```ts
 * const telemetry = createRenderTelemetry({
 *   reportUrl: __SHMUP_REPORT_URL__,
 *   win, now, env, context: () => readContext(),
 * });
 * // per frame, from the debug tools:
 * telemetry.sampler.frame[RENDER_FRAME_SLOT.renderMs] = ms;
 * telemetry.commitFrame();
 * ```
 */
export function createRenderTelemetry(options: RenderTelemetryOptions): RenderTelemetry {
  const endpoint = renderReportEndpoint(options.reportUrl);
  const nowEpochMs = options.nowEpochMs ?? Date.now;
  const random = options.random ?? Math.random;
  const session = makeRenderSessionId(nowEpochMs(), random());
  const sampler = new RenderSampler();
  const checklist = new RenderChecklist();
  const tally = new RenderCheckTally();
  const queue = new RenderSampleQueue(session);
  const createRequest =
    options.createRequest ??
    ((): XMLHttpRequest =>
      new (
        options.win as unknown as { XMLHttpRequest: new () => XMLHttpRequest }
      ).XMLHttpRequest());
  const reporter = new RenderReporter(endpoint, queue, createRequest, nowEpochMs);
  const state = {
    windowSeq: 0,
    windowStart: options.now(),
    hidden: false,
    resumed: false,
    destroyed: false,
  };

  if (endpoint === null) {
    return {
      session,
      enabled: false,
      sampler,
      checklist,
      tally,
      status: reporter.status,
      commitFrame(): void {},
      report(): RenderSample | null {
        return null;
      },
      destroy(): void {},
    };
  }

  const doc: Document | undefined = (options.win as Partial<Window>).document;
  /**
   * Adds the on-screen checklist to the page.
   *
   * @param into - The document.
   * @returns The element.
   */
  const makePanel = (into: Document): HTMLElement => {
    const element = into.createElement('div');
    element.setAttribute('data-shmup-render-telemetry', session);
    element.style.cssText = PANEL_STYLE;
    into.body.appendChild(element);
    return element;
  };
  /** The on-screen checklist, or `null` without a document (tests) or when switched off. */
  const panel =
    options.panel === false || doc === undefined || doc.body === null ? null : makePanel(doc);

  /**
   * Redraws the checklist panel — once per closed window, so it never costs a frame.
   *
   * @param sample - The window just closed, or `null`.
   */
  const drawPanel = (sample: RenderSample | null): void => {
    if (panel === null) return;
    const rows: string[] = [];
    const status = reporter.status;
    rows.push(
      'RENDER CAPTURE ' + session + '  ' + checklist.doneCount + '/' + RENDER_CHECK_ORDER.length,
    );
    const items = checklist.items();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      rows.push((item.done ? '[x] ' : item.manual ? '[-] ' : '[ ] ') + item.id + ' ' + item.label);
    }
    rows.push(
      'sent #' +
        status.lastOkSeq +
        ' · queued ' +
        queue.pending +
        ' · fails ' +
        status.failures +
        (status.lastError === null ? '' : ' · ' + status.lastError),
    );
    if (sample !== null) {
      rows.push(
        'last: ' +
          sample.context.scene +
          '/' +
          (sample.context.zone ?? sample.context.stage ?? '-') +
          ' crt=' +
          sample.context.crtFilter +
          ' · ' +
          sample.fps.toFixed(1) +
          ' fps · RENDER p95 ' +
          sample.renderMs[2].toFixed(2) +
          ' ms' +
          (sample.sendInFlightFrames > 0 ? ' · send in flight' : ''),
      );
    }
    panel.textContent = rows.join('\n');
  };

  /** The app went behind the TV's Home overlay, or came back (the M7 measurement). */
  const onVisibility = (): void => {
    const hidden = doc !== undefined && doc.visibilityState === 'hidden';
    if (hidden) state.hidden = true;
    else if (state.hidden) {
      state.hidden = false;
      state.resumed = true;
    }
  };
  /** A blur is what the M7 monitors really deliver — the probe saw no `visibilitychange`. */
  const onBlur = (): void => {
    state.hidden = true;
  };
  /** Focus back: the window the app returns in is the one M7 asks about. */
  const onFocus = (): void => {
    if (state.hidden) {
      state.hidden = false;
      state.resumed = true;
    }
  };
  options.win.addEventListener('blur', onBlur);
  options.win.addEventListener('focus', onFocus);
  doc?.addEventListener('visibilitychange', onVisibility);

  /**
   * Closes the open window, folds it into the checklist and sends the batch.
   *
   * @returns The closed window, or `null`.
   */
  const report = (): RenderSample | null => {
    const now = options.now();
    const seq = state.windowSeq + 1;
    const sample = sampler.close(seq, state.windowStart, now, options.context(), []);
    state.windowStart = now;
    if (sample !== null) {
      state.windowSeq = seq;
      const marks = tally.add(sample, state.resumed);
      state.resumed = false;
      for (let i = 0; i < marks.length; i++) sample.marks.push(marks[i]);
      checklist.update(tally.facts);
      queue.push(sample);
    }
    reporter.send(options.env, checklist.items(), now);
    drawPanel(sample);
    return sample;
  };

  const timer = options.win.setInterval(report, options.intervalMs ?? RENDER_REPORT_INTERVAL_MS);
  drawPanel(null);

  return {
    session,
    enabled: true,
    sampler,
    checklist,
    tally,
    status: reporter.status,
    commitFrame(): void {
      sampler.commitFrame(reporter.status.inFlight);
    },
    report,
    destroy(): void {
      if (state.destroyed) return;
      state.destroyed = true;
      options.win.clearInterval(timer);
      options.win.removeEventListener('blur', onBlur);
      options.win.removeEventListener('focus', onFocus);
      doc?.removeEventListener('visibilitychange', onVisibility);
      panel?.remove();
    },
  };
}
