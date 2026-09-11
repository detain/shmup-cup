/**
 * Sends report payloads to the optional log server (DOM glue: XMLHttpRequest).
 *
 * Uses `Content-Type: text/plain` so the POST is a CORS "simple request" (no preflight).
 *
 * XMLHttpRequest rather than `fetch` because it gives a built-in `timeout` and works identically on
 * Chromium 69; payload building and retry bookkeeping live in the pure module `report.ts`.
 *
 * @module reporter
 */

import type { ReportPayload, ReportQueue } from './report';

/** Sender status shown in the header. */
export interface ReporterStatus {
  /** POST URL, or null when reporting is off. */
  endpoint: string | null;
  /** Whether a request is currently outstanding. */
  inFlight: boolean;
  /** `seq` of the last payload the server accepted (0 = none yet). */
  lastOkSeq: number;
  /** Performance-clock time of the last success (ms). */
  lastOkAt: number;
  /** Failed requests so far (never reset). */
  failures: number;
  /** Reason of the latest failure, cleared on the next success. */
  lastError: string | null;
}

/**
 * Periodically POSTs payloads; at most one request in flight. A failed request (network error, 2.5 s
 * timeout, non-2xx status) puts its events back into the queue so the next payload carries them.
 *
 * @example
 * ```ts
 * const queue = new ReportQueue(session);
 * const reporter = new Reporter(reportEndpoint(import.meta.env.VITE_REPORT_URL), queue);
 * if (reporter.enabled) reporter.send(() => buildReportParts(inputs), performance.now());
 * ```
 */
export class Reporter {
  /** Current status (mutated in place). */
  readonly status: ReporterStatus;

  /**
   * @param endpoint - POST URL, or null to disable.
   * @param queue - event queue / payload builder.
   */
  constructor(
    endpoint: string | null,
    private readonly queue: ReportQueue,
  ) {
    this.status = { endpoint, inFlight: false, lastOkSeq: 0, lastOkAt: 0, failures: 0, lastError: null };
  }

  /** Whether reporting is configured. */
  get enabled(): boolean {
    return this.status.endpoint !== null;
  }

  /**
   * Builds and sends a payload unless disabled or a request is still in flight.
   *
   * @param makeParts - returns env / verdicts / stats at send time (only called when a request goes out).
   * @param nowMs - performance-clock time, for status display.
   *
   * @remarks
   * Never throws: serialization errors and `send()` exceptions are recorded as failures in {@link status}.
   */
  send(makeParts: () => { env: unknown; verdicts: unknown; stats: unknown }, nowMs: number): void {
    const url = this.status.endpoint;
    if (url === null || this.status.inFlight) return;
    const parts = makeParts();
    const payload = this.queue.build(parts.env, parts.verdicts, parts.stats, Date.now());
    let body: string;
    try {
      body = JSON.stringify(payload);
    } catch (e) {
      this.fail(payload, 'serialize: ' + String(e));
      return;
    }
    const xhr = new XMLHttpRequest();
    this.status.inFlight = true;
    xhr.open('POST', url, true);
    xhr.timeout = 2500;
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
    xhr.onload = () => {
      this.status.inFlight = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        this.status.lastOkSeq = payload.seq;
        this.status.lastOkAt = nowMs;
        this.status.lastError = null;
      } else {
        this.fail(payload, 'HTTP ' + xhr.status);
      }
    };
    xhr.onerror = () => {
      this.status.inFlight = false;
      this.fail(payload, 'network error');
    };
    xhr.ontimeout = () => {
      this.status.inFlight = false;
      this.fail(payload, 'timeout');
    };
    try {
      xhr.send(body);
    } catch (e) {
      this.status.inFlight = false;
      this.fail(payload, String(e));
    }
  }

  /**
   * Records a failure and re-queues the payload's events.
   *
   * @param payload - the payload that could not be delivered.
   * @param reason - short reason for the header (`HTTP 500`, `timeout`, `network error`, …).
   */
  private fail(payload: ReportPayload, reason: string): void {
    this.status.failures++;
    this.status.lastError = reason;
    this.queue.restore(payload);
  }
}
