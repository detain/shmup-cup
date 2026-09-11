/**
 * report (endpoint, session ids, event queue with retry/overflow) and reporter (XHR sender glue).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProbeEvent } from '../src/eventLog';
import { MAX_QUEUED_EVENTS, REPORT_INTERVAL_MS, ReportQueue, makeSessionId, reportEndpoint } from '../src/report';
import { Reporter } from '../src/reporter';
import { FakeXhr } from './helpers/fakeXhr';

const ev = (text: string): ProbeEvent => ({ t: 0, type: 'info', text });
const texts = (events: ProbeEvent[]): string[] => events.map((e) => e.text ?? '');

describe('constants', () => {
  it('reports every 3 s (spec)', () => {
    expect(REPORT_INTERVAL_MS).toBe(3000);
    expect(MAX_QUEUED_EVENTS).toBeGreaterThanOrEqual(1000);
  });
});

describe('reportEndpoint', () => {
  it.each([
    ['http://192.168.1.20:8787', 'http://192.168.1.20:8787/report'],
    ['http://192.168.1.20:8787/', 'http://192.168.1.20:8787/report'],
    ['http://192.168.1.20:8787///', 'http://192.168.1.20:8787/report'],
    ['  http://10.0.0.2:8787  ', 'http://10.0.0.2:8787/report'],
    ['http://10.0.0.2:8787/report', 'http://10.0.0.2:8787/report'],
    ['http://10.0.0.2:8787/report/', 'http://10.0.0.2:8787/report'],
    ['https://logs.example/probe', 'https://logs.example/probe/report'],
    ['HTTP://HOST:1', 'HTTP://HOST:1/report'],
  ])('%j → %s', (input, out) => {
    expect(reportEndpoint(input)).toBe(out);
  });

  it.each([undefined, null, '', '   ', '192.168.1.20:8787', 'ftp://host', 'javascript:alert(1)'])(
    'disabled for %j',
    (input) => {
      expect(reportEndpoint(input)).toBeNull();
    },
  );
});

describe('makeSessionId', () => {
  it('is file-name safe and deterministic for given inputs', () => {
    expect(makeSessionId(1_700_000_000_000, 0)).toBe('ip-' + (1_700_000_000_000).toString(36) + '-0000');
    expect(makeSessionId(1_700_000_000_000, 0.5)).toBe(makeSessionId(1_700_000_000_000, 0.5));
    for (const r of [0, 0.123, 0.5, 0.999999]) {
      expect(makeSessionId(Date.UTC(2026, 8, 10), r)).toMatch(/^ip-[a-z0-9]+-[a-z0-9]{4}$/);
    }
  });

  it('differs for different random values / times', () => {
    expect(makeSessionId(1000, 0.1)).not.toBe(makeSessionId(1000, 0.2));
    expect(makeSessionId(1000, 0.1)).not.toBe(makeSessionId(2000, 0.1));
  });

  it('tolerates fractional times and negative randoms', () => {
    expect(makeSessionId(1234.9, -0.5)).toMatch(/^ip-ya-[a-z0-9]{4}$/);
  });
});

describe('ReportQueue', () => {
  it('numbers payloads from 1 and drains events', () => {
    const q = new ReportQueue('s1');
    q.push(ev('a'));
    q.push(ev('b'));
    expect(q.pending).toBe(2);
    const p1 = q.build({ e: 1 }, { v: 1 }, { s: 1 }, 111);
    expect(p1).toEqual({
      session: 's1',
      seq: 1,
      sentAt: 111,
      env: { e: 1 },
      verdicts: { v: 1 },
      stats: { s: 1 },
      newEvents: [ev('a'), ev('b')],
      droppedEvents: 0,
    });
    expect(q.pending).toBe(0);
    expect(q.lastSeq).toBe(1);
    expect(q.build(null, null, null, 222)).toMatchObject({ seq: 2, newEvents: [] });
  });

  it('restore() puts failed events back in front of newer ones', () => {
    const q = new ReportQueue('s');
    q.push(ev('a'));
    const failed = q.build(null, null, null, 0);
    q.push(ev('b'));
    q.restore(failed);
    expect(texts(q.build(null, null, null, 0).newEvents)).toEqual(['a', 'b']);
  });

  it('drops the oldest events beyond the cap and reports how many', () => {
    const q = new ReportQueue('s', 3);
    for (const t of ['a', 'b', 'c', 'd', 'e']) q.push(ev(t));
    const p = q.build(null, null, null, 0);
    expect(texts(p.newEvents)).toEqual(['c', 'd', 'e']);
    expect(p.droppedEvents).toBe(2);
    expect(q.build(null, null, null, 0).droppedEvents).toBe(0); // counter resets after a build
  });

  it('dropped counts survive a failed send and restore trims to the cap', () => {
    const q = new ReportQueue('s', 3);
    for (const t of ['a', 'b', 'c', 'd']) q.push(ev(t));
    const failed = q.build(null, null, null, 0); // [b c d], dropped 1
    q.push(ev('e'));
    q.push(ev('f'));
    q.restore(failed); // [b c d e f] → trimmed to [d e f], +2 dropped
    const p = q.build(null, null, null, 0);
    expect(texts(p.newEvents)).toEqual(['d', 'e', 'f']);
    expect(p.droppedEvents).toBe(3);
  });

  it('payloads survive JSON round-trips', () => {
    const q = new ReportQueue('ip-abc-0000');
    q.push({ t: 1.5, type: 'down', code: 39, name: 'ArrowRight', repeat: false, kind: 'press', dt: 3, delay: 0.4 });
    const p = q.build({ ua: 'x' }, { diagonals: 'YES' }, { n: 1 }, 5);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

describe('Reporter', () => {
  beforeEach(() => {
    FakeXhr.reset();
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const parts = (): { env: unknown; verdicts: unknown; stats: unknown } => ({ env: { e: 1 }, verdicts: { v: 1 }, stats: { s: 1 } });

  it('is disabled without an endpoint and never builds a payload', () => {
    const q = new ReportQueue('s');
    const r = new Reporter(null, q);
    const make = vi.fn(parts);
    r.send(make, 0);
    expect(r.enabled).toBe(false);
    expect(make).not.toHaveBeenCalled();
    expect(FakeXhr.instances).toHaveLength(0);
    expect(q.lastSeq).toBe(0);
  });

  it('POSTs the payload as text/plain JSON (CORS simple request) with a timeout', () => {
    const q = new ReportQueue('sess');
    q.push(ev('hello'));
    const r = new Reporter('http://10.0.0.5:8787/report', q);
    r.send(parts, 1000);
    const x = FakeXhr.last;
    expect(x.method).toBe('POST');
    expect(x.url).toBe('http://10.0.0.5:8787/report');
    expect(x.async).toBe(true);
    expect(x.timeout).toBeGreaterThan(0);
    expect(x.timeout).toBeLessThan(REPORT_INTERVAL_MS);
    expect(x.headers['Content-Type']).toMatch(/^text\/plain/);
    expect(x.json()).toMatchObject({ session: 'sess', seq: 1, env: { e: 1 }, verdicts: { v: 1 }, stats: { s: 1 } });
    expect(texts(x.json<{ newEvents: ProbeEvent[] }>().newEvents)).toEqual(['hello']);
    expect(r.status.inFlight).toBe(true);
  });

  it('keeps at most one request in flight', () => {
    const r = new Reporter('http://h/report', new ReportQueue('s'));
    r.send(parts, 0);
    r.send(parts, 1);
    expect(FakeXhr.instances).toHaveLength(1);
    FakeXhr.last.respond(200);
    r.send(parts, 2);
    expect(FakeXhr.instances).toHaveLength(2);
  });

  it('records success', () => {
    const r = new Reporter('http://h/report', new ReportQueue('s'));
    r.send(parts, 1234);
    FakeXhr.last.respond(204);
    expect(r.status).toMatchObject({ inFlight: false, lastOkSeq: 1, lastOkAt: 1234, failures: 0, lastError: null });
  });

  it.each([
    ['HTTP error', (x: FakeXhr): void => x.respond(500), 'HTTP 500'],
    ['network error', (x: FakeXhr): void => x.failNetwork(), 'network error'],
    ['timeout', (x: FakeXhr): void => x.failTimeout(), 'timeout'],
  ])('on %s: records the failure and re-sends the events next time', (_label, fail, reason) => {
    const q = new ReportQueue('s');
    q.push(ev('a'));
    const r = new Reporter('http://h/report', q);
    r.send(parts, 0);
    fail(FakeXhr.last);
    expect(r.status).toMatchObject({ inFlight: false, failures: 1, lastError: reason, lastOkSeq: 0 });
    q.push(ev('b'));
    r.send(parts, 3000);
    const second = FakeXhr.last.json<{ seq: number; newEvents: ProbeEvent[] }>();
    expect(second.seq).toBe(2);
    expect(texts(second.newEvents)).toEqual(['a', 'b']);
    FakeXhr.last.respond(200);
    expect(r.status.lastError).toBeNull();
    expect(r.status.failures).toBe(1);
  });

  it('a throwing send() is recorded as a failure and does not leave a request in flight', () => {
    const q = new ReportQueue('s');
    q.push(ev('a'));
    const r = new Reporter('http://h/report', q);
    FakeXhr.throwOnSend = new Error('blocked');
    r.send(parts, 0);
    expect(r.status.inFlight).toBe(false);
    expect(r.status.lastError).toContain('blocked');
    expect(q.pending).toBe(1);
  });

  it('an unserializable payload is recorded as a failure without a request', () => {
    const q = new ReportQueue('s');
    q.push(ev('a'));
    const r = new Reporter('http://h/report', q);
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    r.send(() => ({ env: cyclic, verdicts: null, stats: null }), 0);
    expect(FakeXhr.instances).toHaveLength(0);
    expect(r.status.lastError).toMatch(/^serialize:/);
    expect(q.pending).toBe(1);
  });
});
