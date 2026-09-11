/**
 * Remote-report payloads for the optional log server (`server/log-server.mjs`).
 *
 * Pure module: builds `{session, seq, env, verdicts, stats, newEvents}` payloads and buffers events between
 * sends (with retry on failure). The network call itself lives in `reporter.ts`.
 *
 * @module report
 */

import type { ProbeEvent } from './eventLog';

/** Interval between report POSTs (spec: every 3 s). */
export const REPORT_INTERVAL_MS = 3000;

/** Maximum events buffered while the server is unreachable (oldest are dropped beyond this). */
export const MAX_QUEUED_EVENTS = 5000;

/**
 * Payload POSTed to the log server (as `text/plain` JSON).
 *
 * @typeParam Env - environment facts type (`EnvInfo | null` in the app).
 * @typeParam Verdicts - verdicts type (`Verdicts` from `summary.ts` in the app).
 * @typeParam Stats - detailed statistics type (see `buildReportParts` in `summary.ts`).
 *
 * @remarks
 * The log server stores each payload verbatim (plus `receivedAt` / `from`) as one JSONL line. A failed POST
 * re-queues its events, so they arrive with the next payload under a new `seq` (the failed `seq` never shows
 * up in the log). Events are only lost when the queue overflows (counted in `droppedEvents`); if a request
 * reached the server but its response was lost (timeout), its events can appear twice.
 */
export interface ReportPayload<Env = unknown, Verdicts = unknown, Stats = unknown> {
  /** Session id (one per app launch). */
  session: string;
  /** Monotonic sequence number per session, starting at 1. */
  seq: number;
  /** Wall-clock send time (ms since epoch). */
  sentAt: number;
  /** Environment facts at send time. */
  env: Env;
  /** Current verdicts (cumulative, not a delta). */
  verdicts: Verdicts;
  /** Current detailed statistics (cumulative, not a delta). */
  stats: Stats;
  /** Events since the previous successful send. */
  newEvents: ProbeEvent[];
  /** Events dropped because the queue overflowed. */
  droppedEvents: number;
}

/**
 * Normalizes the configured base URL into the POST endpoint, or returns null when reporting is off.
 *
 * @param baseUrl - `import.meta.env.VITE_REPORT_URL` (baked in at build time).
 * @returns `<base>/report` (an existing trailing `/report` is kept, trailing slashes removed), or null for
 *   an empty / missing value or anything that does not start with `http://` or `https://`.
 *
 * @example
 * ```ts
 * reportEndpoint('http://192.168.1.20:8787/');       // 'http://192.168.1.20:8787/report'
 * reportEndpoint('http://192.168.1.20:8787/report'); // 'http://192.168.1.20:8787/report'
 * reportEndpoint('192.168.1.20:8787');               // null (scheme required)
 * ```
 */
export function reportEndpoint(baseUrl: string | undefined | null): string | null {
  if (baseUrl === undefined || baseUrl === null) return null;
  const trimmed = baseUrl.trim();
  if (trimmed === '' || !/^https?:\/\//i.test(trimmed)) return null;
  const noSlash = trimmed.replace(/\/+$/, '');
  return /\/report$/.test(noSlash) ? noSlash : noSlash + '/report';
}

/**
 * Creates a session id from a wall-clock time and a random number, e.g. `ip-lx2k3a-7f3k`.
 * Only `[a-z0-9-]` characters, safe as a file name.
 *
 * @param nowMs - wall-clock time (`Date.now()`), encoded in base 36 so ids sort roughly by start time.
 * @param random - a number in [0, 1) (`Math.random()`), encoded as 4 base-36 digits.
 * @returns the session id.
 */
export function makeSessionId(nowMs: number, random: number): string {
  const r = Math.floor(Math.abs(random) * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return 'ip-' + Math.floor(nowMs).toString(36) + '-' + r;
}

/**
 * Buffers events and numbers payloads.
 *
 * @example
 * ```ts
 * const q = new ReportQueue('ip-lx2k3a-7f3k');
 * q.push({ t: 1, type: 'info', text: 'hello' });
 * const p = q.build(env, verdicts, stats, Date.now()); // p.seq === 1, p.newEvents.length === 1
 * // …POST failed:
 * q.restore(p);                                        // the event goes out with seq 2
 * ```
 */
export class ReportQueue {
  /** Events not yet handed to a payload, oldest first. */
  private queue: ProbeEvent[] = [];
  /** Sequence number of the last built payload. */
  private seq = 0;
  /** Events dropped by overflow since the last built payload. */
  private dropped = 0;

  /**
   * @param session - session id.
   * @param maxEvents - queue cap; the oldest events beyond it are dropped and counted.
   */
  constructor(
    readonly session: string,
    readonly maxEvents = MAX_QUEUED_EVENTS,
  ) {}

  /**
   * Queues an event for the next payload.
   *
   * @param e - the event (stored by reference; do not mutate it afterwards).
   */
  push(e: ProbeEvent): void {
    this.queue.push(e);
    this.trim();
  }

  /** Events waiting to be sent. */
  get pending(): number {
    return this.queue.length;
  }

  /** Sequence number of the last built payload. */
  get lastSeq(): number {
    return this.seq;
  }

  /**
   * Builds the next payload, draining the queued events and the dropped counter.
   *
   * @typeParam E - environment type.
   * @typeParam V - verdicts type.
   * @typeParam S - statistics type.
   * @param env - environment facts.
   * @param verdicts - current verdicts.
   * @param stats - current statistics.
   * @param sentAt - wall-clock time (ms since epoch).
   * @returns a payload with the next sequence number.
   */
  build<E, V, S>(env: E, verdicts: V, stats: S, sentAt: number): ReportPayload<E, V, S> {
    const events = this.queue;
    this.queue = [];
    const dropped = this.dropped;
    this.dropped = 0;
    this.seq++;
    return { session: this.session, seq: this.seq, sentAt, env, verdicts, stats, newEvents: events, droppedEvents: dropped };
  }

  /**
   * Puts the events of a failed payload back in front of the queue (so they are sent next time).
   *
   * @param payload - the payload whose POST failed; its `droppedEvents` count is carried over too.
   */
  restore(payload: ReportPayload<unknown, unknown, unknown>): void {
    this.queue = payload.newEvents.concat(this.queue);
    this.dropped += payload.droppedEvents;
    this.trim();
  }

  /** Drops the oldest events beyond {@link ReportQueue.maxEvents}, counting them as dropped. */
  private trim(): void {
    const over = this.queue.length - this.maxEvents;
    if (over > 0) {
      this.queue.splice(0, over);
      this.dropped += over;
    }
  }
}
