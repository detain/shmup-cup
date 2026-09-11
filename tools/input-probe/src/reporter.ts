/**
 * Sends report payloads to the optional log server (DOM glue: XMLHttpRequest).
 *
 * Uses `Content-Type: text/plain` so the POST is a CORS "simple request" (no preflight).
 *
 * @module reporter
 */

import type { ReportPayload, ReportQueue } from './report';

/** Sender status shown in the header. */
export interface ReporterStatus {
  endpoint: string | null;
  inFlight: boolean;
  lastOkSeq: number;
  lastOkAt: number;
  failures: number;
  lastError: string | null;
}

/** Periodically POSTs payloads; at most one request in flight. */
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
   * @param makeParts - returns env / verdicts / stats at send time.
   * @param nowMs - performance-clock time, for status display.
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

  private fail(payload: ReportPayload, reason: string): void {
    this.status.failures++;
    this.status.lastError = reason;
    this.queue.restore(payload);
  }
}
