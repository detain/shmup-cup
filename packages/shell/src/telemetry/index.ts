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
 * of the frame, tick, render and draw-call series over the window, a quantized histogram of each of
 * those series ({@link RenderSampleHistograms}) so the analyzer can pool a group's frames into a
 * **true** percentile rather than a percentile of percentiles, the ticks-per-frame and rAF bucket
 * counts, the structure rebuilds of the window and the pooled render-target total — plus the
 * {@link RenderSampleContext} that makes a row meaningful (build id, device line, scene, stage and
 * zone, camera, CRT setting, aspect and scale, GL version, viewport, internal size and the active
 * assists). The histograms are folded out of the already-recorded series when a window closes, on
 * the report timer, so they cost the frame path nothing.
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
 * {@link RENDER_WINDOW_MAX_FRAMES}, {@link RENDER_TICK_BUCKETS}, {@link RenderSample},
 * {@link RenderSampleContext}, {@link RenderSampleHistograms}, {@link RENDER_HIST_STEP},
 * {@link RENDER_HIST_MAX_BUCKETS}); the
 * checklist ({@link RenderChecklist}, {@link RenderCheckTally}, {@link evaluateRenderChecklist},
 * {@link RenderCheckId}, {@link RenderCheckItem}, {@link RenderCheckFacts},
 * {@link RENDER_CHECK_LABELS}, {@link RENDER_CHECK_ORDER}, {@link RENDER_MANUAL_CHECKS},
 * {@link createRenderCheckFacts}, {@link DENSE_PATTERN_SECONDS}, {@link DENSE_BULLETS},
 * {@link FRESH_LAUNCH_MS}); the transport ({@link RenderSampleQueue},
 * {@link RenderReporter}, {@link RenderReporterStatus}, {@link RenderProfilePayload},
 * {@link renderReportEndpoint}, {@link makeRenderSessionId}, {@link RENDER_PROFILE_KIND},
 * {@link RENDER_REPORT_INTERVAL_MS}, {@link RENDER_REQUEST_TIMEOUT_MS},
 * {@link MAX_QUEUED_SAMPLES}); the TV render bench's wire format (plan R0-02 — see below:
 * {@link RENDER_BENCH_KIND}, {@link RenderBenchEnv}, {@link RenderBenchRecord},
 * {@link RenderBenchPayload}, {@link DecodeBenchRecord}, {@link DecodeBenchPage},
 * {@link makeRenderBenchSessionId}, {@link buildRenderBenchPayload}, {@link sendRenderBench});
 * the M7 hardware bench's wire format (plan v20x HARBENCH — see below: {@link HARBENCH_KIND},
 * {@link HARBENCH_FORMAT_VERSION}, {@link HARBENCH_RECORD_KINDS}, {@link MAX_HARBENCH_RECORDS},
 * {@link HarbenchEnv}, {@link HarbenchRecord}, {@link HarbenchRecordId},
 * {@link HarbenchRenderRecord}, {@link HarbenchDecodeRecord}, {@link HarbenchRewindRecord},
 * {@link HarbenchBootRecord}, {@link HarbenchBootPage}, {@link HarbenchMemoryRecord},
 * {@link HarbenchProbeRecord}, {@link HarbenchInputRecord}, {@link HarbenchInputKeyRow},
 * {@link HarbenchWatchdogRecord}, {@link HarbenchPayload}, {@link HarbenchIssue},
 * {@link makeHarbenchSessionId}, {@link buildHarbenchPayload}, {@link harbenchPayloadIssues},
 * {@link isHarbenchPayload}, {@link sendHarbench}).
 *
 * **The TV render bench (plan R0-02).** The bench widget (`apps/tizen/src/bench`, its own app id)
 * measures a density-scaled synthetic scene at 384×216, 640×360 and 960×540, one scenario per page
 * load, and POSTs each scenario's {@link RenderBenchRecord} to the same log server as a
 * `render-bench` payload ({@link RenderBenchPayload}) — and, since plan R1-05 (B4), a last
 * `decode` scenario's {@link DecodeBenchRecord} (what a PNG atlas page costs from file to GPU) in
 * the same payload's optional `decode` field;
 * `tools/input-probe/results/analyze-bench.mjs` turns the session into the relative tables of
 * `docs/dev/input-probe-results.md` §12. The bench is a separate bundle, so none of this reaches the
 * game's `app.js` either.
 *
 * **The M7 hardware bench (plan v20x HARBENCH).** The unified hardware program (sessions S1–S6 of
 * the HARBENCH scout: matrix refresh, boot + memory soak, input + game-mode A/B, extension probe,
 * guided capture, context-loss watchdog) rides a **new** payload kind — `harbench`
 * ({@link HarbenchPayload}, sessions {@link makeHarbenchSessionId hb-…}) — because its records go
 * beyond the frozen `render-bench` wire: a versioned header ({@link HARBENCH_FORMAT_VERSION} from
 * day one), an explicit knob per render row (the knob set incl. `video`), and the discriminated
 * record union ({@link HarbenchRecord}) that adds the rewind timing row — the number behind
 * `M7_SLOWDOWN_ESTIMATE`, today readable only by photographing the TV's results page because the
 * widget never POSTs it — plus boot, memory (with the supervisor's optional sdb-RSS pairing), probe,
 * input and watchdog rows. {@link harbenchPayloadIssues} is the zero-trust parse of that wire for
 * anybody who must check a record they did not build (the log server lane ports it; the analyzer
 * and the results page read untrusted JSONL). The `render-bench` and `render-profile` kinds stay
 * byte-for-byte frozen: this section only **adds**, so the not-yet-updated log server still accepts
 * and verbatim-writes every old payload — and, being kind-agnostic at its gate, tolerates these
 * until its own lane learns the `harbench` formatter.
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

/**
 * Session-level facts every payload repeats, collected once when the capture starts — except
 * {@link RenderTelemetryEnv.device}, which is re-read once per window.
 */
export interface RenderTelemetryEnv {
  /** The build id (`__SHMUP_BUILD__`) — every row must say which bundle produced it. */
  buildId: string;
  /**
   * The M2-17 device line (model, firmware, display, Chrome, GL); `''` in a browser.
   *
   * @remarks
   * Refreshed from {@link RenderTelemetryOptions.device} before every send, because on Tizen it is
   * still `''` when the capture is constructed (`describeDevice()` is async).
   */
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
  /** Internal frame width the renderer draws at (`renderer.width` — core's `FRAME_W` in the game). */
  internalWidth: number;
  /** Internal frame height (`renderer.height` — core's `FRAME_H` in the game). */
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

/**
 * Quantization step of each field's window histogram ({@link RenderSample.hist}), in the field's own
 * unit — fine enough that a pooled p95 is worth quoting to two decimals, coarse enough that a
 * window's frames fall into a few dozen buckets rather than one each.
 */
export const RENDER_HIST_STEP: Readonly<Record<keyof RenderSampleHistograms, number>> =
  Object.freeze({
    /** Frame deltas cluster at 16.7 ms; a quarter of a millisecond is well under any hitch. */
    frameMs: 0.25,
    /** Tick times are tenths of a millisecond on the TV. */
    tickMs: 0.05,
    /** Render times are 1–4 ms on the TV; 0.05 ms is ~2 % of a p95 worth arguing about. */
    renderMs: 0.05,
    /** Draw calls are whole numbers, so their histogram is exact. */
    drawCalls: 1,
  });

/**
 * Buckets one field's window histogram may use. Beyond it the step is doubled until the values fit,
 * which bounds a payload: {@link MAX_QUEUED_SAMPLES} windows of four histograms must stay well
 * under the log server's 2 MiB body limit even after a long outage.
 */
export const RENDER_HIST_MAX_BUCKETS = 48;

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

/**
 * Coarse histograms of a window's four series, one per field, as flat `[value, count, value,
 * count, …]` pairs with the values ascending.
 *
 * @remarks
 * **Why a window carries these as well as its own `[min, p50, p95, max]` tuple.** A group of the
 * §11 tables spans many windows, and a group's p95 must be the p95 of *its frames*. Folding the
 * windows' own p95s (a median of them, say) throws away the worse half of the windows and
 * systematically understates the tail — the one direction that matters when the figure is checked
 * against a frame budget, and the one that would stop the analyzer's figure being the same
 * statistic as the true p95s `pnpm bench` prints in `docs/dev/input-probe-results.md` §11.3 (the
 * same statistic, not a comparable magnitude — the bench runs under SwiftShader). Summing these
 * histograms across a group and reading the percentile off the total is the pooled percentile over
 * every frame, exact up to {@link RENDER_HIST_STEP}.
 *
 * Building them costs the frame path nothing: the per-frame series are already stored in
 * {@link RenderSampler}'s preallocated arrays, and the histogram is folded out of them in
 * {@link RenderSampler.close}, which runs on the report timer.
 */
export interface RenderSampleHistograms {
  /** Frame deltas, quantized to {@link RENDER_HIST_STEP}`.frameMs`. */
  frameMs: number[];
  /** Tick times, quantized to {@link RENDER_HIST_STEP}`.tickMs`. */
  tickMs: number[];
  /** Render times, quantized to {@link RENDER_HIST_STEP}`.renderMs`. */
  renderMs: number[];
  /** Draw calls (exact — the step is 1). */
  drawCalls: number[];
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
  /**
   * Quantized histograms of the same four series, so the analyzer can pool a group's frames and
   * report a **true** percentile instead of a percentile of percentiles.
   */
  hist: RenderSampleHistograms;
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
    // One fold per series: the tuple the panel and the server line show, and the quantized
    // histogram the analyzer pools into a group's true percentiles. Both come out of the same
    // sorted scratch, and both run here — on the report timer, never on a frame.
    const frame = this.fold(this.frameSeries, measured, 1, true, RENDER_HIST_STEP.frameMs);
    const tick = this.fold(this.tickSeries, measured, MS_DIGITS, false, RENDER_HIST_STEP.tickMs);
    const render = this.fold(
      this.renderSeries,
      measured,
      MS_DIGITS,
      false,
      RENDER_HIST_STEP.renderMs,
    );
    const draw = this.fold(this.drawSeries, measured, 0, false, RENDER_HIST_STEP.drawCalls);
    const sample: RenderSample = {
      seq,
      startMs: round(startMs, 1),
      durationMs: round(durationMs, 1),
      frames,
      measuredFrames: measured,
      fps: durationMs > 0 ? round((frames * 1000) / durationMs, 2) : 0,
      sendInFlightFrames: counts[RenderSampler.IN_FLIGHT],
      frameMs: frame.dist,
      tickMs: tick.dist,
      renderMs: render.dist,
      drawCalls: draw.dist,
      hist: {
        frameMs: frame.hist,
        tickMs: tick.hist,
        renderMs: render.hist,
        drawCalls: draw.hist,
      },
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
   * `[min, median, p95, max]` of the first `count` entries of a series, and the series' quantized
   * histogram.
   *
   * @param series - The stored values.
   * @param count - How many are valid.
   * @param digits - Decimals to round the tuple to.
   * @param skipZero - Drop zero entries (frames with no delta yet).
   * @param step - Histogram quantum ({@link RENDER_HIST_STEP}); doubled until the values fit into
   *   {@link RENDER_HIST_MAX_BUCKETS} buckets.
   * @returns `dist`: the four figures (`[0, 0, 0, 0]` when nothing qualifies); `hist`: flat
   *   `[value, count, …]` pairs, values ascending (empty when nothing qualifies).
   *
   * @remarks
   * Runs from {@link RenderSampler.close}, on the report timer — the arrays it allocates never
   * touch a frame.
   */
  private fold(
    series: Float64Array,
    count: number,
    digits: number,
    skipZero: boolean,
    step: number,
  ): { dist: number[]; hist: number[] } {
    const scratch = this.scratch;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const v = series[i];
      if (skipZero && v === 0) continue;
      scratch[n++] = v;
    }
    if (n === 0) return { dist: [0, 0, 0, 0], hist: [] };
    const sorted = scratch.subarray(0, n);
    sorted.sort();
    const dist = [
      round(sorted[0], digits),
      round(sorted[quantileIndex(n, 0.5)], digits),
      round(sorted[quantileIndex(n, 0.95)], digits),
      round(sorted[n - 1], digits),
    ];
    // A window whose values are unusually spread (a stall, a stage change) would otherwise get one
    // bucket per frame: coarsen until it fits, so a payload's size stays bounded.
    let q = step > 0 ? step : 1;
    while (countBuckets(sorted, n, q) > RENDER_HIST_MAX_BUCKETS) q *= 2;
    const hist: number[] = [];
    let key = Number.NaN;
    let run = 0;
    for (let i = 0; i < n; i++) {
      // Nearest multiple, so a bucket's label is its centre and the error is unbiased.
      const value = round(Math.round(sorted[i] / q) * q, HIST_DIGITS);
      if (value === key) {
        run++;
        continue;
      }
      if (run > 0) hist.push(key, run);
      key = value;
      run = 1;
    }
    if (run > 0) hist.push(key, run);
    return { dist, hist };
  }
}

/** Decimals a histogram's bucket labels are rounded to (every step used is a multiple of 0.05). */
const HIST_DIGITS = 3;

/**
 * How many distinct buckets a sorted run falls into at a given quantum.
 *
 * @param sorted - The values, ascending.
 * @param n - How many.
 * @param step - The quantum.
 * @returns The bucket count.
 */
function countBuckets(sorted: Float64Array, n: number, step: number): number {
  let buckets = 0;
  let last = Number.NaN;
  for (let i = 0; i < n; i++) {
    const value = Math.round(sorted[i] / step);
    if (value !== last) {
      buckets++;
      last = value;
    }
  }
  return buckets;
}

/**
 * Index of a quantile in a sorted run of `n` values (the input probe analyzer's rule, so the two
 * write-ups quote the same statistic).
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
   * The M2-17 device line, re-read once per window.
   *
   * @returns The model / firmware / display line, or `''` when there is none yet.
   *
   * @remarks
   * A getter rather than a string in {@link RenderTelemetryOptions.env} because on Tizen the line is
   * **empty at boot**: `describeDevice()` is async and resolves long after the debug tools (and this
   * capture) are constructed. Reading it once at construction would stamp every payload of a monitor
   * session with `''`, and the analyzer would report the capture as `device (browser)` — the plan
   * asks for "device info (the M2-17 line)" in every row. Called once per closed window (never per
   * frame), so it may allocate.
   */
  readonly device?: () => string;
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
    // The M2-17 line arrives asynchronously, well after this capture was constructed: re-read it
    // here (once per window, never per frame) so a monitor session is not labelled `(browser)`.
    if (options.device !== undefined) options.env.device = options.device();
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

// ------------------------------------------------------------------ the TV render bench (R0-02)

/**
 * The `kind` field of a TV render-bench payload (plan R0-02) — how the log server picks its
 * `render-bench` formatter.
 */
export const RENDER_BENCH_KIND = 'render-bench';

/** Session-level facts of one bench run, repeated by every payload of the run. */
export interface RenderBenchEnv {
  /** The build id (`__SHMUP_BUILD__`) of the bench bundle. */
  buildId: string;
  /** Which host ran it: `'tizen'`, `'webos'` or `'browser'`. */
  host: string;
  /** `navigator.userAgent`, or `''` when unavailable. */
  userAgent: string;
  /** CSS pixels of the window (the display the frame is upscaled to). */
  innerWidth: number;
  /** CSS pixels of the window. */
  innerHeight: number;
  /** `window.devicePixelRatio`. */
  devicePixelRatio: number;
  /** The WebGL version the run asked for (1, or 2 with `localStorage['shmup-cup:gl'] = '2'`). */
  webGLVersion: number;
  /** Scenarios in the run's matrix. */
  scenarios: number;
  /** Wall-clock start of the run (ms since epoch). */
  startedAt: number;
}

/** The live pool counts a bench scenario carried (the floor over its measured frames). */
export interface RenderBenchLoad {
  /** Enemy bullets. */
  bullets: number;
  /** Point items. */
  points: number;
  /** Enemies. */
  enemies: number;
  /** Particles (the renderer's pool). */
  particles: number;
  /** Terrain tile sprites in view. */
  tiles: number;
}

/**
 * What one bench scenario measured (plan R0-02) — the row the analyzer and the on-screen table
 * are built from.
 *
 * @remarks
 * Every millisecond series is a `[min, p50, p95, max]` tuple (the telemetry's nearest-rank rule,
 * `floor(q · (n − 1) + 0.5)`, rounded to 3 decimals). **The milliseconds only mean something
 * relative to the same session's 384×216 row** — the M7's rAF shows a p95 of ~30 ms with nothing
 * running at all — which is why `analyze-bench.mjs` prints ratios and percentage points, not
 * absolute budgets. The counted figures (draw calls, bytes, pages) are hardware-independent, and
 * they are what the headless `pnpm bench` gates.
 */
export interface RenderBenchRecord {
  /** Scenario id, e.g. `'640x360-busy'`. */
  scenario: string;
  /** Position of the scenario in the run's matrix (0-based). */
  index: number;
  /** Internal frame size id, e.g. `'640x360'`. */
  size: string;
  /** Internal frame width in pixels. */
  width: number;
  /** Internal frame height in pixels. */
  height: number;
  /** The scene's density factor `s` (1, 1.5 or 2.25): sprites, tiles and speeds are ×s. */
  density: number;
  /** Variant id: `busy`, `filter`, `mode7`, `crt-light`, `crt-full` or `worst`. */
  variant: string;
  /** CRT setting of the scenario (`off` / `light` / `full`). */
  crt: string;
  /** Whether a filtered layer (a raster effect) was on. */
  filter: boolean;
  /** Whether the Mode-7 floor was drawn. */
  mode7: boolean;
  /** The WebGL version the renderer really got. */
  webGLVersion: number;
  /** Canvas width in CSS pixels. */
  displayWidth: number;
  /** Canvas height in CSS pixels. */
  displayHeight: number;
  /** Viewport scale of the internal frame on the display. */
  scale: number;
  /** Durations of the three phases asked for, ms: `[warm-up, free-running, gl.finish()-synced]`. */
  phaseMs: number[];
  /** Frames measured free-running (the render, frame and tick figures). */
  frames: number;
  /** Frames measured in the synced pass. */
  syncedFrames: number;
  /** CPU ms of the timed render (`renderer.render()` plus the parallax / terrain sync). */
  renderMs: number[];
  /** The same render followed by `gl.finish()` — what the frame really costs the GPU too. */
  syncedMs: number[];
  /** rAF deltas of the free-running pass, ms. */
  frameMs: number[];
  /** rAF-delta histogram of the free-running pass (`RAF_BUCKET_EDGES_MS` buckets). */
  raf: number[];
  /** Free-running frames that ran 0 / 1 / 2 / 3-or-more fixed ticks (the vsync-locked loop). */
  tickFrames: number[];
  /** Share (0 … 1) of the free-running frames that needed two ticks or more. */
  twoTickShare: number;
  /** WebGL draw calls of the last measured frame (both passes). */
  drawCalls: number;
  /** Frames on which Pixi rebuilt the scene's whole instruction set (-1 = not counted). */
  rebuilds: number;
  /** Bytes of render targets Pixi pooled (filters; the frame target is separate). */
  renderTargetBytes: number;
  /** Bytes of the internal frame's own render target (`width · height · 4`). */
  frameTargetBytes: number;
  /** Bytes of the atlas pages as uploaded (`Σ w · h · 4`). */
  textureBytes: number;
  /** Atlas pages the scenario's density uses. */
  atlasPages: number;
  /** Whether the browser reported a JS heap (`performance.memory`) at all. */
  heapMeasured: boolean;
  /** Used JS heap when the free-running pass started, bytes (0 when not measured). */
  heapStartBytes: number;
  /** Used JS heap when the synced pass ended, bytes (0 when not measured). */
  heapEndBytes: number;
  /** `heapEndBytes − heapStartBytes` (coarse on the TV: no `gc()` there). */
  heapDeltaBytes: number;
  /** Fewest live sprites of each pool any measured frame carried. */
  load: RenderBenchLoad;
  /** Wall-clock end of the scenario (ms since epoch). */
  endedAt: number;
}

/**
 * One page the bench's `decode` scenario measured (plan R1-05 B4): fetched with XHR, decoded by an
 * `HTMLImageElement` and uploaded through the renderer's `uploadTextureSource`, several times.
 *
 * @remarks
 * Every millisecond series is a `[min, p50, p95, max]` tuple over the repetitions (the same
 * nearest-rank rule as {@link RenderBenchRecord}), or `null` when the stage was not measured (an
 * engine without `createImageBitmap`, or a stage that failed — then `error` says why).
 */
export interface DecodeBenchPage {
  /**
   * Page id: `standin-zone-a` (with `standin-zone-a-2` right after it when the stand-in group
   * packs two pages), `common` or `zone-a`. A session recorded before plan R3-04.M4a carries
   * `rgba-2048` and `png8-2048` instead of the stand-in page.
   */
  id: string;
  /** What the page stands for. */
  what: string;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** `'rgba'` (colour type 6), `'png8'` (3) or `'type <n>'`, read from the fetched file's header. */
  encoding: string;
  /** The PNG file's bytes. */
  bytes: number;
  /** Bytes of the texture it uploads to (`width · height · 4`). */
  textureBytes: number;
  /** Repetitions measured. */
  repetitions: number;
  /** The file fetched with `XMLHttpRequest` (`file://` on the TV, like the game's manifest). */
  fetchMs: number[] | null;
  /** The fetched bytes decoded by an `HTMLImageElement`: a blob URL → `onload` → `decode()`. */
  decodeMs: number[] | null;
  /** The renderer's `uploadTextureSource` (CPU time of the `texImage2D` call). */
  uploadMs: number[] | null;
  /** The same upload followed by `gl.finish()` — the GPU done too. */
  uploadSyncedMs: number[] | null;
  /** Fetch + decode + synced upload of each repetition: file to GPU. */
  totalMs: number[] | null;
  /** The first repetition's total (the coldest: nothing of the page was read before). */
  firstTotalMs: number;
  /** The fetched bytes decoded by `createImageBitmap` instead (the alternative path). */
  bitmapMs: number[] | null;
  /** That bitmap uploaded and `gl.finish()`ed. */
  bitmapUploadMs: number[] | null;
  /** Why a stage could not be measured, or `null`. */
  error: string | null;
}

/**
 * What the bench's `decode` scenario measured (plan R1-05 B4) — the 2048² decode figure plan R3-04
 * estimates its zone-load time from.
 */
export interface DecodeBenchRecord {
  /** Always `'decode'`. */
  scenario: string;
  /** Position of the scenario in the run (after the render matrix). */
  index: number;
  /** The WebGL version the renderer really got. */
  webGLVersion: number;
  /** Repetitions asked for per page. */
  repetitions: number;
  /** Whether the engine has `HTMLImageElement.decode()` (Chromium 64+). */
  imageDecode: boolean;
  /** Whether the engine has `createImageBitmap` (Chromium 50+). */
  imageBitmap: boolean;
  /** The pages, in the order measured. */
  pages: DecodeBenchPage[];
  /** Why the scenario stopped early (no renderer, …), or `null`. */
  error: string | null;
  /** Wall-clock end of the scenario (ms since epoch). */
  endedAt: number;
}

/**
 * Payload a bench run POSTs to the log server as `text/plain` JSON — after every scenario (one
 * record) and once more at the end of the run with every record the server has not acknowledged.
 */
export interface RenderBenchPayload {
  /** Always {@link RENDER_BENCH_KIND}. */
  kind: string;
  /** Session id ({@link makeRenderBenchSessionId}), one per run of the matrix. */
  session: string;
  /** Monotonic sequence number per session, starting at 1. */
  seq: number;
  /** Wall-clock send time (ms since epoch). */
  sentAt: number;
  /** Session-level facts. */
  env: RenderBenchEnv;
  /** The records this payload carries (the analyzer keeps the latest one per scenario). */
  results: RenderBenchRecord[];
  /**
   * The `decode` scenario's record, when this payload carries it (plan R1-05 B4 — absent from the
   * payloads of the render scenarios and of benches built before it).
   */
  decode?: DecodeBenchRecord;
  /** Whether the run's matrix is complete. */
  done: boolean;
}

/**
 * Creates a bench session id, e.g. `rb-lx2k3a-7f3k` — the `rb-` prefix keeps a bench run's JSONL
 * apart from the probe's `ip-…` and the render profile's `rp-…` in the same log directory.
 *
 * @param nowMs - Wall-clock time (`Date.now()`).
 * @param random - A number in [0, 1) (`Math.random()`).
 * @returns The session id.
 *
 * @example
 * ```ts
 * makeRenderBenchSessionId(1_700_000_000_000, 0.5); // → 'rb-…-i000'
 * ```
 */
export function makeRenderBenchSessionId(nowMs: number, random: number): string {
  return 'rb-' + makeRenderSessionId(nowMs, random).slice(3);
}

/**
 * Builds one bench payload.
 *
 * @param session - Session id.
 * @param seq - Sequence number (1-based).
 * @param sentAt - Wall-clock send time.
 * @param env - Session-level facts.
 * @param results - The records to carry.
 * @param done - Whether the matrix is complete.
 * @param decode - The `decode` scenario's record to carry, if any (plan R1-05 B4).
 * @returns The payload ({@link RENDER_BENCH_KIND}); it has a `decode` field only when one is given.
 */
export function buildRenderBenchPayload(
  session: string,
  seq: number,
  sentAt: number,
  env: RenderBenchEnv,
  results: RenderBenchRecord[],
  done: boolean,
  decode?: DecodeBenchRecord,
): RenderBenchPayload {
  return decode === undefined
    ? { kind: RENDER_BENCH_KIND, session, seq, sentAt, env, results, done }
    : { kind: RENDER_BENCH_KIND, session, seq, sentAt, env, results, decode, done };
}

/**
 * POSTs a bench payload to the log server and reports the outcome exactly once.
 *
 * @remarks
 * The same transport as {@link RenderReporter}: `XMLHttpRequest` with a
 * {@link RENDER_REQUEST_TIMEOUT_MS} timeout and `Content-Type: text/plain` (a CORS "simple
 * request", no preflight). The bench waits for `onDone` before it reloads the page for the next
 * scenario, so a slow or dead server costs at most the timeout. Never throws: a request that cannot
 * be built, opened or sent reports through `onDone` at once and returns `false`. The payload is
 * typed as either bench kind — {@link sendHarbench} rides this same transport, and the wire bytes
 * are whatever `JSON.stringify` makes of what the caller hands it.
 *
 * @param endpoint - POST URL ({@link renderReportEndpoint}), or `null` when no log server is
 *   configured — nothing is sent and `onDone(false, 'off')` runs at once.
 * @param payload - The payload.
 * @param createRequest - Makes the request object (injected so tests need no DOM).
 * @param onDone - Called exactly once: `ok` for a 2xx answer, else `false` and the reason.
 * @returns Whether a request went out.
 *
 * @example
 * ```ts
 * sendRenderBench(renderReportEndpoint(__SHMUP_REPORT_URL__), payload, () => new XMLHttpRequest(),
 *   (ok) => { if (ok) markSent(); location.reload(); });
 * ```
 */
export function sendRenderBench(
  endpoint: string | null,
  payload: RenderBenchPayload | HarbenchPayload,
  createRequest: () => XMLHttpRequest,
  onDone: (ok: boolean, error: string | null) => void,
): boolean {
  let finished = false;
  /**
   * Reports the outcome the first time only (a timeout followed by a late `onerror` must not
   * report twice).
   *
   * @param ok - Whether the server accepted the payload.
   * @param error - The reason it did not, or `null`.
   */
  const finish = (ok: boolean, error: string | null): void => {
    if (finished) return;
    finished = true;
    onDone(ok, error);
  };
  if (endpoint === null) {
    finish(false, 'off');
    return false;
  }
  let body: string;
  try {
    body = JSON.stringify(payload);
  } catch (error) {
    finish(false, 'serialize: ' + String(error));
    return false;
  }
  let xhr: XMLHttpRequest;
  try {
    xhr = createRequest();
    xhr.open('POST', endpoint, true);
    xhr.timeout = RENDER_REQUEST_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
  } catch (error) {
    finish(false, 'open: ' + String(error));
    return false;
  }
  xhr.onload = (): void => {
    const ok = xhr.status >= 200 && xhr.status < 300;
    finish(ok, ok ? null : 'HTTP ' + xhr.status);
  };
  xhr.onerror = (): void => {
    finish(false, 'network error');
  };
  xhr.ontimeout = (): void => {
    finish(false, 'timeout');
  };
  try {
    xhr.send(body);
  } catch (error) {
    finish(false, String(error));
    return false;
  }
  return true;
}

// ------------------------------------------------------------- the M7 hardware bench (v20x HARBENCH)

/**
 * The `kind` field of an M7 hardware-bench payload (plan v20x HARBENCH) — the `harbench` wire the
 * S1–S6 sessions ride, kept apart from the frozen `render-profile` and `render-bench` kinds so old
 * payloads and the log server's old formatters never move.
 */
export const HARBENCH_KIND = 'harbench';

/**
 * The wire version of a {@link HarbenchPayload}, declared ON the payload so a reader learns from the
 * row itself which schema it was recorded under. Version 1 is defined once and never edited —
 * breaking the record union apart is the only reason to bump it, exactly like the game's replay and
 * save formats.
 */
export const HARBENCH_FORMAT_VERSION = 1;

/** Every {@link HarbenchRecord} discriminator version 1 accepts. */
export const HARBENCH_RECORD_KINDS: readonly string[] = Object.freeze([
  'render',
  'decode',
  'rewind',
  'boot',
  'memory',
  'probe',
  'input',
  'watchdog',
]);

/** One of the {@link HARBENCH_RECORD_KINDS} (the literal union behind the wire discriminator). */
export type HarbenchRecordId =
  'render' | 'decode' | 'rewind' | 'boot' | 'memory' | 'probe' | 'input' | 'watchdog';

/** Most records one {@link HarbenchPayload} may carry (the cap {@link harbenchPayloadIssues} keeps). */
export const MAX_HARBENCH_RECORDS = 128;

/**
 * Session-level facts of one hardware-bench run: every {@link RenderBenchEnv} field (so the S1
 * matrix refresh keeps the identity the `rb-` sessions already carry — buildId, host, the window,
 * the GL version asked for, the run's shape and start), plus the two the program adds.
 */
export interface HarbenchEnv extends RenderBenchEnv {
  /**
   * The program session this run belongs to — an open id the analyzer groups rows by (`S1` matrix
   * refresh, `S2` boot and memory, `S3` input, `S4` probe, `S6` watchdog; `S5`'s guided capture
   * stays on the `render-profile` wire and is paired in the results folder).
   */
  phase: string;
  /**
   * The input-latency A/B flag: whether the installed app's `config.xml` carried
   * `<tizen:property name="use.game.mode" …>` (docs/old/shmup_plan.md §8.5). One build ships
   * with it and one without; the A/B pairs rows on this value — it is a fact of the INSTALL, so
   * it rides the env of every payload, not the input rows alone.
   */
  gameMode: boolean;
}

/**
 * One refreshed matrix row (session S1) on the harbench wire — every {@link RenderBenchRecord} stat
 * exactly as the frozen `rb-` kind carries it ("per-row verdicts/stats as today"), plus the two
 * things that shape could not say without a new kind: the knob as a field of its own (a knob row
 * hides it in the `<variant>-<knob>` string today) and an explicit video-surface flag.
 */
export interface HarbenchRenderRecord extends RenderBenchRecord {
  /** The discriminator — always `'render'`. */
  readonly record: 'render';
  /**
   * The knob id the row varies — `fit`, `stretch`, `interp`, `out720`, `out540` or `video` (the
   * {@link HARBENCH_RECORD_KINDS | matrix's} knob set incl. the v2 R7-VID surface), or `''` when the
   * row is a plain matrix row.
   */
  knob: string;
  /** Whether the cutscene video surface — the per-frame `createImageBitmap(video)` pull — was on. */
  video: boolean;
}

/**
 * The decode scenario on the harbench wire — the frozen {@link DecodeBenchRecord} verbatim (its
 * per-page rows already carry the sizes: `width`, `height`, the file's `bytes`, the uploaded
 * `textureBytes`), told apart only by its discriminator.
 */
export interface HarbenchDecodeRecord extends DecodeBenchRecord {
  /** The discriminator — always `'decode'`. */
  readonly record: 'decode';
}

/**
 * The rewind timing row — the number the bench's `M7_SLOWDOWN_ESTIMATE = 12` placeholder stands in
 * for, measured on the set. Plan R2's TL-3 scenario already computes it, but the widget keeps it in
 * its own localStorage state and never POSTs it, because "the server's schema does not move" — so
 * today it is readable only by photographing the TV's results page. The versioned `hb-` kind IS the
 * schema moving: this row makes the richer record legal on the wire before the widget lane emits it.
 */
export interface HarbenchRewindRecord {
  /** The discriminator — always `'rewind'`. */
  readonly record: 'rewind';
  /** The scenario id, always `'rewind'` as well (table parity with the render and decode rows). */
  scenario: string;
  /** Position of the scenario in the run's load order (after the stand-in load). */
  index: number;
  /** Wall-clock start of the measured loop, ms since the epoch. */
  startedAt: number;
  /** Wall-clock end of the scenario, ms since the epoch. */
  endedAt: number;
  /** Ticks the steady-state loop stepped (a few seconds of scroll at 60 Hz). */
  ticks: number;
  /** Warm sim steps per second — the rate a resume rewinds at (the row's headline number). */
  stepsPerSecond: number;
  /** Milliseconds to build the World (content resolved, pools sized) — every resume's fixed cost. */
  worldBuildMs: number;
  /** Milliseconds of one `hashWorld` (the resume's every-`REPLAY_HASH_INTERVAL` verify). */
  hashMs: number;
  /** How many hash checks the loop ran. */
  hashChecks: number;
  /**
   * Ticks of tail the resume may rewind at {@link HarbenchRewindRecord.stepsPerSecond} within the
   * patience budget — read ONLY together with {@link HarbenchRewindRecord.capTicksEstimated}.
   */
  capTicks: number;
  /**
   * The ESTIMATE flag: `true` while `capTicks` was divided out of the M7 slowdown ESTIMATE (the
   * placeholder), `false` once a measured divisor produced it. A patch-ready row with `true` is a
   * lead, never a committed number.
   */
  capTicksEstimated: boolean;
  /** The stage the scenario rewinds (the bench's own open-water stage). */
  stage: string;
  /** Why the scenario could not finish, or `null`. */
  error: string | null;
}

/**
 * One atlas page the boot scenario timed, file to GPU through the SHIPPED loader branch — the
 * per-page detail behind the zone-load CONFIRMS verdict (the −47…−56 % bitmap-vs-image claim,
 * re-measured on the final-art pages).
 */
export interface HarbenchBootPage {
  /** Page id (`common`, `zone-<letter>`, …). */
  id: string;
  /** Page width, px. */
  width: number;
  /** Page height, px. */
  height: number;
  /** The fetched PNG file's bytes. */
  bytes: number;
  /** The XHR fetch of the page file, `[min, p50, p95, max]` ms over the reps, or `null`. */
  fetchMs: number[] | null;
  /** `createImageBitmap(blob)` of the fetched bytes, or `null` when the engine lacks it. */
  bitmapMs: number[] | null;
  /** The `HTMLImageElement` path's decode (the shipped bitmap branch skips it), or `null`. */
  decodeMs: number[] | null;
  /** The renderer upload (`texImage2D`), or `null`. */
  uploadMs: number[] | null;
  /** The upload followed by `gl.finish()` — GPU done too, or `null`. */
  syncedMs: number[] | null;
  /** Fetch to synced upload of each repetition: file to GPU, or `null`. */
  totalMs: number[] | null;
  /** Whether this page's run went through `createImageBitmap` (the shipped branch really taken). */
  viaBitmap: boolean;
  /** Why the page could not be measured, or `null`. */
  error: string | null;
}

/**
 * The boot row (program session S2): what a cold start costs on the set — the manifest's `file://`
 * XHR (the W3-7 firmware question, answered by the bench's own fetch), the atlas pages through the
 * shipped bitmap loader, and the time to a first drawn frame (the boot ≤ 10 s budget, never yet
 * measured on hardware).
 */
export interface HarbenchBootRecord {
  /** The discriminator — always `'boot'`. */
  readonly record: 'boot';
  /** The scenario id, `'boot'`. */
  scenario: string;
  /** Position in the run's load order. */
  index: number;
  /** Wall-clock start of the scenario, ms since the epoch. */
  startedAt: number;
  /** Wall-clock end of the scenario, ms since the epoch. */
  endedAt: number;
  /** The `main.json` fetch over its repetitions, `[min, p50, p95, max]` ms. */
  manifestMs: number[];
  /** The manifest's bytes. */
  atlasBytes: number;
  /** Whether the engine has `createImageBitmap` at all. */
  imageBitmap: boolean;
  /** Whether the shipped loader really took the bitmap branch this run (the loader's own flag). */
  bitmapBranch: boolean;
  /** The pages, in fetch order. */
  pages: HarbenchBootPage[];
  /** Boot to first drawn frame as the page timed it, ms. */
  bootMs: number;
  /** Why the scenario could not finish, or `null`. */
  error: string | null;
}

/**
 * The memory row (program session S2, the soak page): the JS-heap series the page can see, the
 * atlas-page ledger the residency cycles drive, and — when the supervisor paired one — the
 * process-wide RSS no page can read. This is §8.4's first owed measurement: the counted estimator
 * sits 3.4× inside the 120 MB dev cap while the Chromium process total (surfaces, compositor
 * planes) has never been read at all.
 */
export interface HarbenchMemoryRecord {
  /** The discriminator — always `'memory'`. */
  readonly record: 'memory';
  /** The scenario id, `'soak'`. */
  scenario: string;
  /** Position in the run's load order. */
  index: number;
  /** Wall-clock start of the soak, ms since the epoch. */
  startedAt: number;
  /** Wall-clock end of the soak, ms since the epoch. */
  endedAt: number;
  /** Seconds of soak measured. */
  seconds: number;
  /** Residency load/unload cycles completed. */
  cycles: number;
  /** Whether `performance.memory` reported at all. */
  heapMeasured: boolean;
  /** Used JS heap at the first sample, at the peak, and at the last sample, bytes. */
  heapStartBytes: number;
  /** Peak used heap of the soak, bytes. */
  heapPeakBytes: number;
  /** Used JS heap at the last sample, bytes. */
  heapEndBytes: number;
  /** `heapEndBytes − heapStartBytes` — negative is fine: the drift over the soak is the point. */
  heapDeltaBytes: number;
  /** The used-heap bytes of every sample, in order (the leak-guard series the analyzer trends). */
  heapSamples: number[];
  /** Fewest / most atlas pages resident in any cycle (the page-count ledger of the soak). */
  pageLedgerMin: number;
  /** Most atlas pages resident in any cycle. */
  pageLedgerMax: number;
  /**
   * The optional sdb-RSS field: process-wide resident bytes the SUPERVISOR read over `sdb shell`
   * and paired to this send — never produced by the page, which cannot see it. The validator checks
   * only that it is a plausible non-negative count; pairing it to a supervisor sample is provenance
   * for the session-meta record, and a row carrying it without a pairing is a data bug, not a shape
   * one. The 120 MB dev-install cap is judged on THIS number.
   */
  rssBytes?: number;
  /** Why the soak could not finish, or `null`. */
  error: string | null;
}

/**
 * The extension-probe row (program session S4): the free addition §8.4 promised —
 * `getSupportedExtensions()` on both GL contexts (1×1, released like the probe's env report) and the
 * named verdicts the texture-format questions wait on. With this row on the wire the KTX2 / ETC /
 * ASTC question closes "with data instead of plausibility" (tizen_optimize §7.6).
 */
export interface HarbenchProbeRecord {
  /** The discriminator — always `'probe'`. */
  readonly record: 'probe';
  /** The scenario id, `'probe'`. */
  scenario: string;
  /** Position in the run's load order (the first payload of the S2 build's session). */
  index: number;
  /** Wall-clock start of the probe, ms since the epoch. */
  startedAt: number;
  /** Wall-clock end of the probe, ms since the epoch. */
  endedAt: number;
  /** `getSupportedExtensions()` on the `webgl` context (the Mali answer incl. index-uint). */
  webglExtensions: string[];
  /** …on a `webgl2` context, or `null` when one could not be created (on the TVs: it cannot). */
  webgl2Extensions: string[] | null;
  /** `navigator.deviceMemory` (GiB), or `null` when the engine does not report it. */
  deviceMemory: number | null;
  /** `navigator.hardwareConcurrency`, or `null`. */
  hardwareConcurrency: number | null;
  /** Whether `OffscreenCanvas` exists (the worker-decode P3 row records presence only). */
  offscreenCanvas: boolean;
  /** Whether `matchMedia('(prefers-reduced-motion)')` resolves (the §8.5 negative check). */
  reduceMotionResolves: boolean;
  /**
   * The ETC smoke upload (`compressedTexImage2D` of one tiny block-packed texture), `[min, p50,
   * p95, max]` ms — or `null` when the extension list showed no ETC and the question is moot.
   */
  smokeUploadMs: number[] | null;
  /** Why the probe could not run, or `null`. */
  error: string | null;
}

/** One key the input page watched: whether it arrives at all, its measured repeat, its tick lag. */
export interface HarbenchInputKeyRow {
  /** The key the page labels it by (its registered name — `ColorF0Red`, `MediaPlayPause`, …). */
  id: string;
  /** The delivered `keyCode` (0 when the key never arrived), the P0-2 delivery answer per key. */
  keyCode: number;
  /** Whether the key was delivered at all while watched. */
  delivered: boolean;
  /** Presses observed for it during the watch. */
  presses: number;
  /** Measured auto-repeat Hz of a held press, or `null` when it was not held or did not repeat. */
  repeatsPerSecond: number | null;
  /**
   * Key-down to tick-applied lag `[min, p50, p95, max]` ms counted in game ticks (the event-clock
   * law: Tizen `timeStamp` is whole seconds), or `null` when nothing was applied. This re-measures
   * the §findings figures (9.3 Hz, 356 ms) — those are the 2026-09-15 v1-era probe.
   */
  appliedMs: number[] | null;
}

/**
 * The input row (program session S3): registered-key delivery (the ColorF0–F3 question P0-2 left
 * unverified on a real remote) and the press-to-tick lag on the CURRENT firmware. Which A/B leg a
 * row belongs to is NOT in here: `use.game.mode` is a fact of the install, and it rides every
 * payload's env ({@link HarbenchEnv.gameMode}) so all row classes pair, not just input.
 */
export interface HarbenchInputRecord {
  /** The discriminator — always `'input'`. */
  readonly record: 'input';
  /** The scenario id, `'input'`. */
  scenario: string;
  /** Position in the run's load order. */
  index: number;
  /** Wall-clock start of the watch, ms since the epoch. */
  startedAt: number;
  /** Wall-clock end of the watch, ms since the epoch. */
  endedAt: number;
  /** Whether a gamepad was present at the watch (outstanding-work §3's two-pads row, presence). */
  gamepadPresent: boolean;
  /** The keys, in the press-list order the page asked the owner for. */
  keys: HarbenchInputKeyRow[];
  /** Why the watch could not run, or `null`. */
  error: string | null;
}

/**
 * The watchdog row (program session S6): what the P0-3 context-loss guard really does on firmware —
 * driven remotely with `WEBGL_lose_context.loseContext()` and NO restore (R3-04.M3d), where today
 * it is proven only synthetically. Frames-since-loss and the screen-swap latency become a recorded
 * row instead of an observed event.
 */
export interface HarbenchWatchdogRecord {
  /** The discriminator — always `'watchdog'`. */
  readonly record: 'watchdog';
  /** The scenario id, `'watchdog'`. */
  scenario: string;
  /** Position in the run's load order. */
  index: number;
  /** Wall-clock time of the injected loss, ms since the epoch. */
  startedAt: number;
  /** Wall-clock time the outcome was read, ms since the epoch. */
  endedAt: number;
  /** Dead frames counted when the error screen swapped in (the ~60-frame budget's real burn). */
  framesAfterLoss: number;
  /** Loss to error-screen latency, ms. */
  screenSwapMs: number;
  /** Whether a `webglcontextrestored` ever arrived (the watchdog must NOT fire when one does). */
  contextRestored: boolean;
  /** Why the row could not be observed, or `null`. */
  error: string | null;
}

/**
 * One measured row of a hardware-bench session, discriminated by its `record`: the render matrix
 * (`render`, S1), the decode rows (`decode`, S1), the rewind timing (`rewind` — the number behind
 * `M7_SLOWDOWN_ESTIMATE`, S1 once the widget lane POSTs it), boot timing (`boot`, S2), the memory
 * soak (`memory`, S2), the extension probe (`probe`, S4), input latency (`input`, S3) and the
 * context-loss watchdog (`watchdog`, S6).
 */
export type HarbenchRecord =
  | HarbenchRenderRecord
  | HarbenchDecodeRecord
  | HarbenchRewindRecord
  | HarbenchBootRecord
  | HarbenchMemoryRecord
  | HarbenchProbeRecord
  | HarbenchInputRecord
  | HarbenchWatchdogRecord;

/**
 * Payload a hardware-bench run POSTs to the log server as `text/plain` JSON — the header fields are
 * the `render-bench` payload's (session, seq, sentAt, env, done) under the {@link HARBENCH_KIND}
 * the old server's kind-agnostic gate tolerates verbatim, plus the wire version declared ON the
 * payload, and the rows as `records` (NOT `results`): the old per-kind formatters never inspect it,
 * so a new-kind payload can never be half-read as an old one.
 */
export interface HarbenchPayload {
  /** Always {@link HARBENCH_KIND}. */
  kind: string;
  /** Always {@link HARBENCH_FORMAT_VERSION} on a payload this build sends. */
  formatVersion: number;
  /** Session id ({@link makeHarbenchSessionId}), one per program session. */
  session: string;
  /** Monotonic sequence number per session, starting at 1. */
  seq: number;
  /** Wall-clock send time (ms since epoch). */
  sentAt: number;
  /** Session-level facts. */
  env: HarbenchEnv;
  /** The rows this payload carries (typically one; a flush carries the unacknowledged rest). */
  records: HarbenchRecord[];
  /** Whether the session's planned loads are complete. */
  done: boolean;
}

/**
 * Creates a hardware-bench session id — the `hb-` prefix keeps a program session's JSONL apart from
 * the probe's `ip-…`, the render profile's `rp-…` and the render bench's `rb-…` in the same log
 * directory (scout Part E: the namespace is free in the tree; it is claimed here).
 *
 * @param nowMs - Wall-clock time (`Date.now()`).
 * @param random - A number in [0, 1) (`Math.random()`).
 * @returns The session id.
 *
 * @example
 * ```ts
 * makeHarbenchSessionId(1_700_000_000_000, 0.5); // → 'hb-…-i000'
 * ```
 */
export function makeHarbenchSessionId(nowMs: number, random: number): string {
  return 'hb-' + makeRenderSessionId(nowMs, random).slice(3);
}

/**
 * Builds one hardware-bench payload. The `kind` and `formatVersion` are the module's constants, not
 * parameters — a payload cannot be built against a version this file does not define.
 *
 * @param session - Session id ({@link makeHarbenchSessionId}).
 * @param seq - Sequence number (1-based).
 * @param sentAt - Wall-clock send time.
 * @param env - Session-level facts.
 * @param records - The rows to carry.
 * @param done - Whether the session is complete.
 * @returns The payload ({@link HARBENCH_KIND} at {@link HARBENCH_FORMAT_VERSION}).
 */
export function buildHarbenchPayload(
  session: string,
  seq: number,
  sentAt: number,
  env: HarbenchEnv,
  records: HarbenchRecord[],
  done: boolean,
): HarbenchPayload {
  return {
    kind: HARBENCH_KIND,
    formatVersion: HARBENCH_FORMAT_VERSION,
    session,
    seq,
    sentAt,
    env,
    records,
    done,
  };
}

/**
 * POSTs a hardware-bench payload to the log server and reports the outcome exactly once.
 *
 * @remarks
 * {@link sendRenderBench} IS the transport — the same `XMLHttpRequest`, the same
 * {@link RENDER_REQUEST_TIMEOUT_MS} timeout, `Content-Type: text/plain` (a CORS "simple request").
 * A program session posts per row and a final flush carries what the server never acknowledged; the
 * widget waits for `onDone` before its next page load, so a slow or dead server costs at most the
 * timeout. Never throws.
 *
 * @param endpoint - POST URL ({@link renderReportEndpoint}), or `null` when no log server is
 *   configured — nothing is sent and `onDone(false, 'off')` runs at once.
 * @param payload - The payload.
 * @param createRequest - Makes the request object (injected so tests need no DOM).
 * @param onDone - Called exactly once: `ok` for a 2xx answer, else `false` and the reason.
 * @returns Whether a request went out.
 *
 * @example
 * ```ts
 * sendHarbench(renderReportEndpoint(__SHMUP_REPORT_URL__), payload, () => new XMLHttpRequest(),
 *   (ok) => { if (ok) markSent(); location.reload(); });
 * ```
 */
export function sendHarbench(
  endpoint: string | null,
  payload: HarbenchPayload,
  createRequest: () => XMLHttpRequest,
  onDone: (ok: boolean, error: string | null) => void,
): boolean {
  return sendRenderBench(endpoint, payload, createRequest, onDone);
}

/** One shape problem {@link harbenchPayloadIssues} found, and where it sits. */
export interface HarbenchIssue {
  /** Dotted path to the offending field (`records[3].stepsPerSecond`), `''` for the payload. */
  path: string;
  /** What the wire requires there. */
  message: string;
}

/** `Record<string, unknown>` view of a JSON object read off the wire. */
type WireObject = Record<string, unknown>;

/**
 * Whether the bag itself carries the key — a prototype-injected one does not count (the payload
 * arrives from `JSON.parse`, where only own keys exist, and an in-process caller must not cheat).
 *
 * @param o - The field bag.
 * @param key - The field name.
 * @returns Whether it is an own property.
 */
function hasOwnProp(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/** The largest magnitude a wire number may carry — timestamps and byte counts fit; garbage does not. */
const WIRE_MAX = 1e15;

/** Cap for an id-ish string (scenario, size, variant, knob, stage, key id, build id, extension). */
const ID_MAX = 128;

/** Cap for a free-text string (user agent, note, error). */
const TEXT_MAX = 512;

/** Length of a `[min, p50, p95, max]` series — every ms tuple on this wire. */
const SERIES_TUPLE = 4;

/** Shape of an `hb-` session id: the prefix plus the log server's own character set, capped at its 64-char file-name rule. */
const HARBENCH_SESSION_PATTERN = /^hb-[A-Za-z0-9._-]{1,61}$/;

/**
 * A JSON object usable as a field bag, or `null` for anything else (arrays included — a payload is
 * an object by schema, and a row's array fields are checked as lists, never as bags).
 *
 * @param value - The candidate.
 * @returns The bag, or `null`.
 */
function wireObject(value: unknown): WireObject | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as WireObject;
}

/**
 * Whether a value is a wire number — JSON carries no NaN or ±Infinity, and a producer that
 * stringified one had already lost the row; the refusal belongs at this boundary, not downstream.
 *
 * @param value - The candidate.
 * @returns Whether it is a finite number.
 */
function wireNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The path of a child field: `base.key`, or whichever side is empty.
 *
 * @param base - The parent path.
 * @param key - The child name (empty for the parent itself, e.g. an array element).
 * @returns The joined path.
 */
function joinPath(base: string, key: string): string {
  if (base === '') return key;
  if (key === '') return base;
  return base + '.' + key;
}

/**
 * Records one issue at `joinPath(base, key)`.
 *
 * @param issues - The sink.
 * @param base - The parent path.
 * @param key - The child name.
 * @param message - What the wire requires there.
 */
function addIssue(issues: HarbenchIssue[], base: string, key: string, message: string): void {
  issues.push({ path: joinPath(base, key), message });
}

/**
 * Requires an own, non-empty string field of at most `maxLen` characters.
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param maxLen - The length cap.
 */
function checkString(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  maxLen: number,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) {
    addIssue(issues, base, key, 'must be a non-empty string');
    return;
  }
  if (v.length > maxLen) {
    addIssue(issues, base, key, 'must be at most ' + maxLen + ' characters');
  }
}

/**
 * Requires an own string-or-`null` field (a note or error slot: `null` means checked and none).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param maxLen - The string length cap.
 */
function checkStringOrNull(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  maxLen: number,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (v === null) return;
  if (typeof v !== 'string' || v.length === 0) {
    addIssue(issues, base, key, 'must be a non-empty string or null');
    return;
  }
  if (v.length > maxLen) {
    addIssue(issues, base, key, 'must be at most ' + maxLen + ' characters');
  }
}

/**
 * Requires an own boolean field.
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 */
function checkBool(o: WireObject, key: string, base: string, issues: HarbenchIssue[]): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  if (typeof o[key] !== 'boolean') addIssue(issues, base, key, 'must be a boolean');
}

/**
 * Requires an own signed finite field (|v| ≤ {@link WIRE_MAX}).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 */
function checkNumber(o: WireObject, key: string, base: string, issues: HarbenchIssue[]): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (!wireNumber(v) || v < -WIRE_MAX || v > WIRE_MAX) {
    addIssue(issues, base, key, 'must be a finite number');
  }
}

/**
 * Requires an own non-negative finite field.
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 */
function checkNonNeg(o: WireObject, key: string, base: string, issues: HarbenchIssue[]): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (!wireNumber(v) || v < 0 || v > WIRE_MAX) {
    addIssue(issues, base, key, 'must be a non-negative finite number');
  }
}

/**
 * Requires an own integral field within [min, max].
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param min - The least legal value.
 * @param max - The greatest legal value.
 */
function checkInt(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  min: number,
  max: number,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (!wireNumber(v) || !Number.isInteger(v) || v < min || v > max) {
    addIssue(issues, base, key, 'must be a whole number');
  }
}

/**
 * Requires an own number-or-`null` field (a probe of something the engine may not report).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 */
function checkNumberOrNull(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (v === null) return;
  if (!wireNumber(v) || v < 0 || v > WIRE_MAX) {
    addIssue(issues, base, key, 'must be a non-negative finite number or null');
  }
}

/**
 * Requires an own integral-or-`null` field.
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 */
function checkIntOrNull(o: WireObject, key: string, base: string, issues: HarbenchIssue[]): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (v === null) return;
  if (!wireNumber(v) || !Number.isInteger(v) || v < 0 || v > WIRE_MAX) {
    addIssue(issues, base, key, 'must be a whole number or null');
  }
}

/**
 * Allows an OMITTED non-negative field (`rssBytes` and friends: absent on every row the page could
 * not pair, present and checked when the supervisor wrote one).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 */
function checkOptionalNonNeg(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
): void {
  if (!hasOwnProp(o, key)) return;
  const v = o[key];
  if (v === undefined) return;
  if (!wireNumber(v) || v < 0 || v > WIRE_MAX) {
    addIssue(issues, base, key, 'must be a non-negative finite number when present');
  }
}

/**
 * Requires an own ratio field in [0, 1].
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 */
function checkRatio(o: WireObject, key: string, base: string, issues: HarbenchIssue[]): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (!wireNumber(v) || v < 0 || v > 1) {
    addIssue(issues, base, key, 'must be a fraction from 0 to 1');
  }
}

/**
 * Checks a series value (an array of exactly `length` non-negative finite numbers) at `elemBase`.
 *
 * @param v - The value under test.
 * @param elemBase - The path of the array itself.
 * @param issues - The sink.
 * @param length - The exact element count the field declares.
 */
function checkSeriesValues(
  v: unknown,
  elemBase: string,
  issues: HarbenchIssue[],
  length: number,
): void {
  if (!Array.isArray(v)) {
    addIssue(issues, elemBase, '', 'must be a number array');
    return;
  }
  if (v.length !== length) {
    addIssue(issues, elemBase, '', 'must hold exactly ' + length + ' numbers');
    return;
  }
  for (let i = 0; i < v.length; i++) {
    const x: unknown = v[i];
    if (!wireNumber(x) || x < 0 || x > WIRE_MAX) {
      addIssue(issues, elemBase + '[' + i + ']', '', 'must be a non-negative finite number');
    }
  }
}

/**
 * Requires an own series field ([min, p50, p95, max] or one of the declared count tuples).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param length - The exact element count.
 */
function checkSeries(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  length: number,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  checkSeriesValues(o[key], joinPath(base, key), issues, length);
}

/**
 * Requires an own series-or-`null` field (`null` means the stage never ran — an absent engine
 * feature or a failed measurement, with the reason in the row's `error`).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param length - The exact element count when not `null`.
 */
function checkSeriesOrNull(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  length: number,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (v === null) return;
  checkSeriesValues(v, joinPath(base, key), issues, length);
}

/**
 * Requires an own array of non-negative finite numbers up to `maxItems` (the soak's heap series).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param maxItems - The length cap.
 */
function checkNumberList(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  maxItems: number,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (!Array.isArray(v)) {
    addIssue(issues, base, key, 'must be a number array');
    return;
  }
  if (v.length > maxItems) {
    addIssue(issues, base, key, 'carries more than ' + maxItems + ' values');
    return;
  }
  for (let i = 0; i < v.length; i++) {
    const x: unknown = v[i];
    if (!wireNumber(x) || x < 0 || x > WIRE_MAX) {
      addIssue(
        issues,
        joinPath(base, key) + '[' + i + ']',
        '',
        'must be a non-negative finite number',
      );
    }
  }
}

/**
 * Requires an own array of strings up to `maxItems`, each 1 to `maxLen` characters (a GL extension
 * list).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param maxItems - The length cap.
 * @param maxLen - The per-entry cap.
 */
function checkStringList(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  maxItems: number,
  maxLen: number,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (!Array.isArray(v)) {
    addIssue(issues, base, key, 'must be a string array');
    return;
  }
  if (v.length > maxItems) {
    addIssue(issues, base, key, 'carries more than ' + maxItems + ' entries');
    return;
  }
  for (let i = 0; i < v.length; i++) {
    const s: unknown = v[i];
    if (typeof s !== 'string' || s.length === 0 || s.length > maxLen) {
      addIssue(issues, joinPath(base, key) + '[' + i + ']', '', 'must be a non-empty short string');
    }
  }
}

/**
 * Requires an own string-list-or-`null` field (the WebGL2 extension list, `null` for a context the
 * engine could not create).
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param maxItems - The length cap.
 * @param maxLen - The per-entry cap.
 */
function checkStringListOrNull(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  maxItems: number,
  maxLen: number,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  if (o[key] === null) return;
  checkStringList(o, key, base, issues, maxItems, maxLen);
}

/**
 * Requires an own array of row objects up to `maxItems`, each validated by `checkRow`.
 *
 * @param o - The bag.
 * @param key - The field.
 * @param base - The parent path.
 * @param issues - The sink.
 * @param maxItems - The length cap (a payload is small; a runaway list is a bug, not a dataset).
 * @param checkRow - The per-row shape check.
 */
function checkRows(
  o: WireObject,
  key: string,
  base: string,
  issues: HarbenchIssue[],
  maxItems: number,
  checkRow: (row: unknown, rowBase: string, sink: HarbenchIssue[]) => void,
): void {
  if (!hasOwnProp(o, key)) {
    addIssue(issues, base, key, 'missing');
    return;
  }
  const v = o[key];
  if (!Array.isArray(v)) {
    addIssue(issues, base, key, 'must be an array');
    return;
  }
  if (v.length > maxItems) {
    addIssue(issues, base, key, 'carries more than ' + maxItems + ' rows');
    return;
  }
  const listPath = joinPath(base, key);
  for (let i = 0; i < v.length; i++) {
    checkRow(v[i], listPath + '[' + i + ']', issues);
  }
}

/** The five live pool counts a render row carried (the floor over its measured frames). */
function checkLoad(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  if (!hasOwnProp(o, 'load')) {
    addIssue(issues, base, 'load', 'missing');
    return;
  }
  const load = wireObject(o.load);
  if (load === null) {
    addIssue(issues, base, 'load', 'must be an object');
    return;
  }
  const lb = joinPath(base, 'load');
  checkInt(load, 'bullets', lb, issues, 0, WIRE_MAX);
  checkInt(load, 'points', lb, issues, 0, WIRE_MAX);
  checkInt(load, 'enemies', lb, issues, 0, WIRE_MAX);
  checkInt(load, 'particles', lb, issues, 0, WIRE_MAX);
  checkInt(load, 'tiles', lb, issues, 0, WIRE_MAX);
}

/** The inherited `render-bench` stat fields — the frozen shape's per-row verdicts/stats as today. */
function checkRenderStats(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkString(o, 'scenario', base, issues, ID_MAX);
  checkInt(o, 'index', base, issues, 0, WIRE_MAX);
  checkString(o, 'size', base, issues, ID_MAX);
  checkNonNeg(o, 'width', base, issues);
  checkNonNeg(o, 'height', base, issues);
  checkNonNeg(o, 'density', base, issues);
  checkString(o, 'variant', base, issues, ID_MAX);
  checkString(o, 'crt', base, issues, ID_MAX);
  checkBool(o, 'filter', base, issues);
  checkBool(o, 'mode7', base, issues);
  checkInt(o, 'webGLVersion', base, issues, 0, 16);
  checkNonNeg(o, 'displayWidth', base, issues);
  checkNonNeg(o, 'displayHeight', base, issues);
  checkNonNeg(o, 'scale', base, issues);
  checkSeries(o, 'phaseMs', base, issues, 3);
  checkInt(o, 'frames', base, issues, 0, WIRE_MAX);
  checkInt(o, 'syncedFrames', base, issues, 0, WIRE_MAX);
  checkSeries(o, 'renderMs', base, issues, SERIES_TUPLE);
  checkSeries(o, 'syncedMs', base, issues, SERIES_TUPLE);
  checkSeries(o, 'frameMs', base, issues, SERIES_TUPLE);
  checkSeries(o, 'raf', base, issues, RAF_BUCKETS);
  checkSeries(o, 'tickFrames', base, issues, SERIES_TUPLE);
  checkRatio(o, 'twoTickShare', base, issues);
  checkInt(o, 'drawCalls', base, issues, 0, WIRE_MAX);
  checkInt(o, 'rebuilds', base, issues, -1, WIRE_MAX);
  checkNonNeg(o, 'renderTargetBytes', base, issues);
  checkNonNeg(o, 'frameTargetBytes', base, issues);
  checkNonNeg(o, 'textureBytes', base, issues);
  checkInt(o, 'atlasPages', base, issues, 0, WIRE_MAX);
  checkBool(o, 'heapMeasured', base, issues);
  checkNonNeg(o, 'heapStartBytes', base, issues);
  checkNonNeg(o, 'heapEndBytes', base, issues);
  checkNumber(o, 'heapDeltaBytes', base, issues);
  checkLoad(o, base, issues);
  checkNonNeg(o, 'endedAt', base, issues);
}

/** A render row: the frozen stats, plus the knob as a field and the video-surface flag. */
function checkRenderRecord(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkRenderStats(o, base, issues);
  checkString(o, 'knob', base, issues, ID_MAX);
  checkBool(o, 'video', base, issues);
}

/** One measured atlas page of the decode scenario (the file-to-GPU stages are the record's own). */
function checkDecodePage(row: unknown, base: string, issues: HarbenchIssue[]): void {
  const page = wireObject(row);
  if (page === null) {
    addIssue(issues, base, '', 'must be an object');
    return;
  }
  checkString(page, 'id', base, issues, ID_MAX);
  checkString(page, 'what', base, issues, TEXT_MAX);
  checkNonNeg(page, 'width', base, issues);
  checkNonNeg(page, 'height', base, issues);
  checkString(page, 'encoding', base, issues, ID_MAX);
  checkNonNeg(page, 'bytes', base, issues);
  checkNonNeg(page, 'textureBytes', base, issues);
  checkInt(page, 'repetitions', base, issues, 0, WIRE_MAX);
  checkSeriesOrNull(page, 'fetchMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'decodeMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'uploadMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'uploadSyncedMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'totalMs', base, issues, SERIES_TUPLE);
  checkNonNeg(page, 'firstTotalMs', base, issues);
  checkSeriesOrNull(page, 'bitmapMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'bitmapUploadMs', base, issues, SERIES_TUPLE);
  checkStringOrNull(page, 'error', base, issues, TEXT_MAX);
}

/** A decode row: the frozen record verbatim, pages and their sizes included. */
function checkDecodeRecord(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkString(o, 'scenario', base, issues, ID_MAX);
  checkInt(o, 'index', base, issues, 0, WIRE_MAX);
  checkInt(o, 'webGLVersion', base, issues, 0, 16);
  checkInt(o, 'repetitions', base, issues, 0, WIRE_MAX);
  checkBool(o, 'imageDecode', base, issues);
  checkBool(o, 'imageBitmap', base, issues);
  checkRows(o, 'pages', base, issues, 16, checkDecodePage);
  checkStringOrNull(o, 'error', base, issues, TEXT_MAX);
  checkNonNeg(o, 'endedAt', base, issues);
}

/** A rewind row: the timing record — steps per second, ticks, and the cap with its estimate flag. */
function checkRewindRecord(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkString(o, 'scenario', base, issues, ID_MAX);
  checkInt(o, 'index', base, issues, 0, WIRE_MAX);
  checkNonNeg(o, 'startedAt', base, issues);
  checkNonNeg(o, 'endedAt', base, issues);
  checkInt(o, 'ticks', base, issues, 0, WIRE_MAX);
  checkNonNeg(o, 'stepsPerSecond', base, issues);
  checkNonNeg(o, 'worldBuildMs', base, issues);
  checkNonNeg(o, 'hashMs', base, issues);
  checkInt(o, 'hashChecks', base, issues, 0, WIRE_MAX);
  checkInt(o, 'capTicks', base, issues, 0, WIRE_MAX);
  checkBool(o, 'capTicksEstimated', base, issues);
  checkString(o, 'stage', base, issues, ID_MAX);
  checkStringOrNull(o, 'error', base, issues, TEXT_MAX);
}

/** One boot-scenario atlas page (file to GPU through the shipped loader branch). */
function checkBootPage(row: unknown, base: string, issues: HarbenchIssue[]): void {
  const page = wireObject(row);
  if (page === null) {
    addIssue(issues, base, '', 'must be an object');
    return;
  }
  checkString(page, 'id', base, issues, ID_MAX);
  checkNonNeg(page, 'width', base, issues);
  checkNonNeg(page, 'height', base, issues);
  checkNonNeg(page, 'bytes', base, issues);
  checkSeriesOrNull(page, 'fetchMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'bitmapMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'decodeMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'uploadMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'syncedMs', base, issues, SERIES_TUPLE);
  checkSeriesOrNull(page, 'totalMs', base, issues, SERIES_TUPLE);
  checkBool(page, 'viaBitmap', base, issues);
  checkStringOrNull(page, 'error', base, issues, TEXT_MAX);
}

/** A boot row: manifest XHR, the shipped bitmap branch's flags, the page rows, time to a frame. */
function checkBootRecord(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkString(o, 'scenario', base, issues, ID_MAX);
  checkInt(o, 'index', base, issues, 0, WIRE_MAX);
  checkNonNeg(o, 'startedAt', base, issues);
  checkNonNeg(o, 'endedAt', base, issues);
  checkSeries(o, 'manifestMs', base, issues, SERIES_TUPLE);
  checkInt(o, 'atlasBytes', base, issues, 0, WIRE_MAX);
  checkBool(o, 'imageBitmap', base, issues);
  checkBool(o, 'bitmapBranch', base, issues);
  checkRows(o, 'pages', base, issues, 32, checkBootPage);
  checkNonNeg(o, 'bootMs', base, issues);
  checkStringOrNull(o, 'error', base, issues, TEXT_MAX);
}

/** A memory row: the soak's heap series and page ledger, and the supervisor-paired RSS when any. */
function checkMemoryRecord(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkString(o, 'scenario', base, issues, ID_MAX);
  checkInt(o, 'index', base, issues, 0, WIRE_MAX);
  checkNonNeg(o, 'startedAt', base, issues);
  checkNonNeg(o, 'endedAt', base, issues);
  checkNonNeg(o, 'seconds', base, issues);
  checkInt(o, 'cycles', base, issues, 0, WIRE_MAX);
  checkBool(o, 'heapMeasured', base, issues);
  checkNonNeg(o, 'heapStartBytes', base, issues);
  checkNonNeg(o, 'heapPeakBytes', base, issues);
  checkNonNeg(o, 'heapEndBytes', base, issues);
  checkNumber(o, 'heapDeltaBytes', base, issues);
  checkNumberList(o, 'heapSamples', base, issues, 65536);
  checkInt(o, 'pageLedgerMin', base, issues, 0, WIRE_MAX);
  checkInt(o, 'pageLedgerMax', base, issues, 0, WIRE_MAX);
  checkOptionalNonNeg(o, 'rssBytes', base, issues);
  checkStringOrNull(o, 'error', base, issues, TEXT_MAX);
}

/** A probe row: both extension lists (GL2's may be null), the presence flags, the ETC smoke. */
function checkProbeRecord(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkString(o, 'scenario', base, issues, ID_MAX);
  checkInt(o, 'index', base, issues, 0, WIRE_MAX);
  checkNonNeg(o, 'startedAt', base, issues);
  checkNonNeg(o, 'endedAt', base, issues);
  checkStringList(o, 'webglExtensions', base, issues, 512, ID_MAX);
  checkStringListOrNull(o, 'webgl2Extensions', base, issues, 512, ID_MAX);
  checkNumberOrNull(o, 'deviceMemory', base, issues);
  checkIntOrNull(o, 'hardwareConcurrency', base, issues);
  checkBool(o, 'offscreenCanvas', base, issues);
  checkBool(o, 'reduceMotionResolves', base, issues);
  checkSeriesOrNull(o, 'smokeUploadMs', base, issues, SERIES_TUPLE);
  checkStringOrNull(o, 'error', base, issues, TEXT_MAX);
}

/** One watched key of an input row. */
function checkKeyRow(row: unknown, base: string, issues: HarbenchIssue[]): void {
  const key = wireObject(row);
  if (key === null) {
    addIssue(issues, base, '', 'must be an object');
    return;
  }
  checkString(key, 'id', base, issues, ID_MAX);
  checkInt(key, 'keyCode', base, issues, 0, 65535);
  checkBool(key, 'delivered', base, issues);
  checkInt(key, 'presses', base, issues, 0, WIRE_MAX);
  checkNumberOrNull(key, 'repeatsPerSecond', base, issues);
  checkSeriesOrNull(key, 'appliedMs', base, issues, SERIES_TUPLE);
}

/** An input row: gamepad presence and the per-key delivery / repeat / tick-lag rows. */
function checkInputRecord(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkString(o, 'scenario', base, issues, ID_MAX);
  checkInt(o, 'index', base, issues, 0, WIRE_MAX);
  checkNonNeg(o, 'startedAt', base, issues);
  checkNonNeg(o, 'endedAt', base, issues);
  checkBool(o, 'gamepadPresent', base, issues);
  checkRows(o, 'keys', base, issues, 64, checkKeyRow);
  checkStringOrNull(o, 'error', base, issues, TEXT_MAX);
}

/** A watchdog row: the dead-frame burn, the screen-swap latency, the restore answer. */
function checkWatchdogRecord(o: WireObject, base: string, issues: HarbenchIssue[]): void {
  checkString(o, 'scenario', base, issues, ID_MAX);
  checkInt(o, 'index', base, issues, 0, WIRE_MAX);
  checkNonNeg(o, 'startedAt', base, issues);
  checkNonNeg(o, 'endedAt', base, issues);
  checkInt(o, 'framesAfterLoss', base, issues, 0, WIRE_MAX);
  checkNonNeg(o, 'screenSwapMs', base, issues);
  checkBool(o, 'contextRestored', base, issues);
  checkStringOrNull(o, 'error', base, issues, TEXT_MAX);
}

/** The session-level facts every payload of a run repeats (env identity, the A/B and phase tags). */
function checkEnv(p: WireObject, issues: HarbenchIssue[]): void {
  if (!hasOwnProp(p, 'env')) {
    addIssue(issues, '', 'env', 'missing');
    return;
  }
  const env = wireObject(p.env);
  if (env === null) {
    addIssue(issues, '', 'env', 'must be an object');
    return;
  }
  const base = 'env';
  checkString(env, 'buildId', base, issues, ID_MAX);
  checkString(env, 'host', base, issues, 32);
  checkString(env, 'userAgent', base, issues, TEXT_MAX);
  checkNonNeg(env, 'innerWidth', base, issues);
  checkNonNeg(env, 'innerHeight', base, issues);
  checkNonNeg(env, 'devicePixelRatio', base, issues);
  checkNonNeg(env, 'webGLVersion', base, issues);
  checkInt(env, 'scenarios', base, issues, 0, WIRE_MAX);
  checkNonNeg(env, 'startedAt', base, issues);
  checkString(env, 'phase', base, issues, ID_MAX);
  checkBool(env, 'gameMode', base, issues);
}

/** The record array: shape, size, discriminator, then the per-kind checker. */
function checkRecords(p: WireObject, issues: HarbenchIssue[]): void {
  if (!hasOwnProp(p, 'records')) {
    addIssue(issues, '', 'records', 'missing');
    return;
  }
  const list = p.records;
  if (!Array.isArray(list)) {
    addIssue(issues, '', 'records', 'must be an array');
    return;
  }
  if (list.length > MAX_HARBENCH_RECORDS) {
    addIssue(issues, '', 'records', 'carries more than ' + MAX_HARBENCH_RECORDS + ' rows');
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const base = 'records[' + i + ']';
    const row = wireObject(list[i]);
    if (row === null) {
      addIssue(issues, base, '', 'must be an object');
      continue;
    }
    if (!hasOwnProp(row, 'record')) {
      addIssue(issues, base, 'record', 'missing discriminator');
      continue;
    }
    const id = row.record;
    if (typeof id !== 'string' || HARBENCH_RECORD_KINDS.indexOf(id) < 0) {
      addIssue(issues, base, 'record', 'unknown record kind at format version 1');
      continue;
    }
    if (id === 'render') checkRenderRecord(row, base, issues);
    else if (id === 'decode') checkDecodeRecord(row, base, issues);
    else if (id === 'rewind') checkRewindRecord(row, base, issues);
    else if (id === 'boot') checkBootRecord(row, base, issues);
    else if (id === 'memory') checkMemoryRecord(row, base, issues);
    else if (id === 'probe') checkProbeRecord(row, base, issues);
    else if (id === 'input') checkInputRecord(row, base, issues);
    else checkWatchdogRecord(row, base, issues);
  }
}

/**
 * The zero-trust parse of the harbench wire: takes anything — the value a `JSON.parse` of a request
 * body or one stored session line yields — and reports EVERY shape problem against
 * {@link HARBENCH_FORMAT_VERSION}, deciding nothing for a broken row and trusting nothing the page
 * claimed. The log server lane ports this function (the tree's zero-dependency rule keeps the wire
 * types on this side of the boundary); the results page and the analyzer read the same untrusted
 * JSON and may lean on it exactly as far. Fields the version 1 schema does not name PASS — additive
 * compatibility the other way, so a reader written against an older union never wedges on a newer
 * row it does not dispatch. Numbers must be finite (JSON has no NaN or ±Infinity and a producer
 * that stringified one had already lost the row), strings non-empty and bounded, booleans strict,
 * and only OWN properties count (a prototype-injected "valid" payload is not a valid payload).
 *
 * @param value - The parsed candidate.
 * @returns One {@link HarbenchIssue} per broken field, empty when the payload is exactly a
 *   {@link HARBENCH_FORMAT_VERSION | version-1} {@link HarbenchPayload}.
 *
 * @example
 * ```ts
 * // log server, once its lane learns the kind:
 * harbenchPayloadIssues(JSON.parse(body)).forEach((i) => log(i.path + ': ' + i.message));
 * ```
 */
export function harbenchPayloadIssues(value: unknown): HarbenchIssue[] {
  const issues: HarbenchIssue[] = [];
  const p = wireObject(value);
  if (p === null) {
    issues.push({ path: '', message: 'payload must be a JSON object' });
    return issues;
  }
  if (!hasOwnProp(p, 'kind')) addIssue(issues, '', 'kind', 'missing');
  else if (p.kind !== HARBENCH_KIND) addIssue(issues, '', 'kind', 'must be ' + HARBENCH_KIND);
  if (!hasOwnProp(p, 'formatVersion')) addIssue(issues, '', 'formatVersion', 'missing');
  else if (p.formatVersion !== HARBENCH_FORMAT_VERSION) {
    addIssue(issues, '', 'formatVersion', 'unsupported wire version');
  }
  const session = p.session;
  if (typeof session !== 'string' || !HARBENCH_SESSION_PATTERN.test(session)) {
    addIssue(issues, '', 'session', 'must be an hb- id: hb- then 1 to 61 of A-Z a-z 0-9 . _ -');
  }
  checkInt(p, 'seq', '', issues, 1, WIRE_MAX);
  checkNonNeg(p, 'sentAt', '', issues);
  checkEnv(p, issues);
  checkRecords(p, issues);
  checkBool(p, 'done', '', issues);
  return issues;
}

/**
 * Whether a parsed value is exactly a version-1 harbench payload — the typed gate for readers of
 * untrusted JSON (the results page's stored rows, a replayed session log).
 *
 * @param value - The candidate.
 * @returns `true` when {@link harbenchPayloadIssues} would report no issues.
 */
export function isHarbenchPayload(value: unknown): value is HarbenchPayload {
  return harbenchPayloadIssues(value).length === 0;
}
