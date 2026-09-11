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

/** Payload POSTed to the log server (as `text/plain` JSON). */
export interface ReportPayload<Env = unknown, Verdicts = unknown, Stats = unknown> {
  /** Session id (one per app launch). */
  session: string;
  /** Monotonic sequence number per session, starting at 1. */
  seq: number;
  /** Wall-clock send time (ms since epoch). */
  sentAt: number;
  env: Env;
  verdicts: Verdicts;
  stats: Stats;
  /** Events since the previous successful send. */
  newEvents: ProbeEvent[];
  /** Events dropped because the queue overflowed. */
  droppedEvents: number;
}

/**
 * Normalizes the configured base URL into the POST endpoint, or returns null when reporting is off.
 *
 * @example reportEndpoint('http://192.168.1.20:8787/') === 'http://192.168.1.20:8787/report'
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
 */
export function makeSessionId(nowMs: number, random: number): string {
  const r = Math.floor(Math.abs(random) * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return 'ip-' + Math.floor(nowMs).toString(36) + '-' + r;
}

/** Buffers events and numbers payloads. */
export class ReportQueue {
  private queue: ProbeEvent[] = [];
  private seq = 0;
  private dropped = 0;

  /**
   * @param session - session id.
   * @param maxEvents - queue cap.
   */
  constructor(
    readonly session: string,
    readonly maxEvents = MAX_QUEUED_EVENTS,
  ) {}

  /** Queues an event for the next payload. */
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

  /** Builds the next payload, draining the queued events. */
  build<E, V, S>(env: E, verdicts: V, stats: S, sentAt: number): ReportPayload<E, V, S> {
    const events = this.queue;
    this.queue = [];
    const dropped = this.dropped;
    this.dropped = 0;
    this.seq++;
    return { session: this.session, seq: this.seq, sentAt, env, verdicts, stats, newEvents: events, droppedEvents: dropped };
  }

  /** Puts the events of a failed payload back in front of the queue (so they are sent next time). */
  restore(payload: ReportPayload<unknown, unknown, unknown>): void {
    this.queue = payload.newEvents.concat(this.queue);
    this.dropped += payload.droppedEvents;
    this.trim();
  }

  private trim(): void {
    const over = this.queue.length - this.maxEvents;
    if (over > 0) {
      this.queue.splice(0, over);
      this.dropped += over;
    }
  }
}
