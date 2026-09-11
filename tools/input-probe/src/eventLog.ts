/**
 * Event records, their one-line text form, and a bounded on-screen log.
 *
 * Pure module.
 *
 * @module eventLog
 */

import type { KeyDownKind } from './keyTracker';
import { padLeft, padRight } from './format';

/** Kind of a logged event. */
export type ProbeEventType = 'down' | 'up' | 'info' | 'gamepad';

/** One event as logged on screen, to the console and to the report server. */
export interface ProbeEvent {
  /** Event time (ms, `performance.now()` clock). */
  t: number;
  type: ProbeEventType;
  /** Key code (key events only). */
  code?: number;
  /** Key name (key events only). */
  name?: string;
  /** `event.repeat` (keydown only). */
  repeat?: boolean;
  /** Tracker classification (keydown only). */
  kind?: KeyDownKind;
  /** Raw hold duration in ms (keyup only; -1 for a stray keyup). */
  heldMs?: number;
  /** Time since the previous key event (ms). */
  dt?: number;
  /** Dispatch delay `performance.now() - event.timeStamp` (ms), when known. */
  delay?: number;
  /** Free text for info / gamepad lines. */
  text?: string;
}

/** Short on-screen labels for keydown classifications. */
export const KIND_LABELS: Readonly<Record<KeyDownKind, string>> = {
  press: 'press',
  repeat: 'rep',
  'repeat-noflag': 'noflag',
  bounce: 'BOUNCE',
};

/**
 * Formats an event as a single compact log line (fits the ~60-column log panel), e.g.
 * `   8123.4 DOWN ArrowRight(39)     repeat=0 press  Δ95.2` or
 * `   8200.1 UP   ArrowRight(39)     held=77ms       Δ76.9`.
 */
export function formatEvent(e: ProbeEvent): string {
  const t = padLeft(e.t.toFixed(1), 9);
  if (e.type === 'info') return t + ' ·  ' + (e.text ?? '');
  if (e.type === 'gamepad') return t + ' GP  ' + (e.text ?? '');
  const dir = e.type === 'down' ? 'DOWN' : 'UP  ';
  let line = t + ' ' + dir + ' ' + padRight((e.name ?? '?') + '(' + (e.code ?? '?') + ')', 18);
  if (e.type === 'down') {
    line += ' repeat=' + (e.repeat ? '1' : '0') + ' ' + padRight(e.kind ? KIND_LABELS[e.kind] : '', 6);
  } else {
    line += ' ' + padRight('held=' + (e.heldMs !== undefined && e.heldMs >= 0 ? e.heldMs.toFixed(0) + 'ms' : 'stray'), 15);
  }
  if (e.dt !== undefined && Number.isFinite(e.dt)) line += ' Δ' + e.dt.toFixed(1);
  return line;
}

/** Fixed-capacity list of the most recent log lines (newest last). */
export class LineLog {
  private readonly lines: string[] = [];
  private version = 0;

  /** @param capacity - lines kept (spec: ~28). */
  constructor(readonly capacity = 28) {}

  /** Appends a line, dropping the oldest when full. */
  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.capacity) this.lines.splice(0, this.lines.length - this.capacity);
    this.version++;
  }

  /** Increments on every push — lets the UI skip redundant DOM updates. */
  get changeCount(): number {
    return this.version;
  }

  /** The lines joined with newlines (oldest first). */
  text(): string {
    return this.lines.join('\n');
  }

  /** Copy of the current lines. */
  toArray(): string[] {
    return this.lines.slice();
  }
}
