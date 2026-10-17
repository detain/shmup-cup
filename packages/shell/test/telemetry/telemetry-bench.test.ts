/**
 * `shell/telemetry`'s TV render-bench wire format (plan R0-02): the `render-bench` payload a bench
 * run POSTs to the input probe's log server after each scenario, its session id, and the sender —
 * one answer per request, whatever goes wrong, so the bench can reload for its next scenario.
 */
import { describe, expect, it } from 'vitest';
import {
  RENDER_BENCH_KIND,
  RENDER_REQUEST_TIMEOUT_MS,
  buildRenderBenchPayload,
  makeRenderBenchSessionId,
  makeRenderSessionId,
  sendRenderBench,
  type DecodeBenchRecord,
  type RenderBenchEnv,
  type RenderBenchRecord,
} from '../../src/telemetry/index.js';

/** Session facts. */
const ENV: RenderBenchEnv = {
  buildId: 'abc1234',
  host: 'tizen',
  userAgent: 'Chrome/69',
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  webGLVersion: 1,
  scenarios: 18,
  startedAt: 1_700_000_000_000,
};

/** A record (only its identity matters to the transport). */
const RECORD = { scenario: '640x360-busy', index: 6 } as RenderBenchRecord;

/** A scripted XMLHttpRequest stand-in. */
class FakeXhr {
  method = '';
  url = '';
  timeout = 0;
  status = 0;
  headers: Record<string, string> = {};
  body: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  /**
   * @param fail - Which call throws, if any.
   */
  constructor(private readonly fail: 'open' | 'send' | null = null) {}
  open(method: string, url: string): void {
    if (this.fail === 'open') throw new Error('blocked');
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: string): void {
    if (this.fail === 'send') throw new Error('offline');
    this.body = body;
  }
}

/**
 * Sends one payload through a fake request.
 *
 * @param xhr - The fake.
 * @param endpoint - The endpoint.
 * @returns The outcomes reported and whether a request went out.
 */
function send(
  xhr: FakeXhr,
  endpoint: string | null = 'http://10.0.0.2:8787/report',
): { outcomes: [boolean, string | null][]; sent: boolean } {
  const outcomes: [boolean, string | null][] = [];
  const payload = buildRenderBenchPayload('rb-x', 3, 99, ENV, [RECORD], false);
  const sent = sendRenderBench(
    endpoint,
    payload,
    () => xhr as unknown as XMLHttpRequest,
    (ok, error) => {
      outcomes.push([ok, error]);
    },
  );
  return { outcomes, sent };
}

describe('shell/telemetry render-bench payload (R0-02)', () => {
  it('builds a render-bench payload around the records', () => {
    expect(RENDER_BENCH_KIND).toBe('render-bench');
    expect(buildRenderBenchPayload('rb-x', 1, 5, ENV, [RECORD], true)).toEqual({
      kind: 'render-bench',
      session: 'rb-x',
      seq: 1,
      sentAt: 5,
      env: ENV,
      results: [RECORD],
      done: true,
    });
  });

  it('carries the decode scenario’s record only when given one (plan R1-05 B4)', () => {
    const decode = { scenario: 'decode', index: 18, pages: [] } as unknown as DecodeBenchRecord;
    const payload = buildRenderBenchPayload('rb-x', 19, 5, ENV, [], true, decode);
    expect(payload).toEqual({
      kind: 'render-bench',
      session: 'rb-x',
      seq: 19,
      sentAt: 5,
      env: ENV,
      results: [],
      decode,
      done: true,
    });
    // A render scenario's payload has no `decode` key at all, as before B4.
    expect('decode' in buildRenderBenchPayload('rb-x', 1, 5, ENV, [RECORD], false)).toBe(false);
  });

  it('names a bench session rb-…, apart from the probe and the render profile', () => {
    const id = makeRenderBenchSessionId(1_700_000_000_000, 0.5);
    expect(id).toMatch(/^rb-[a-z0-9]+-[a-z0-9]{4}$/);
    expect(id.slice(3)).toBe(makeRenderSessionId(1_700_000_000_000, 0.5).slice(3));
  });

  it('POSTs text/plain JSON with the timeout and reports a 2xx once', () => {
    const xhr = new FakeXhr();
    const { outcomes, sent } = send(xhr);
    expect(sent).toBe(true);
    expect([xhr.method, xhr.url, xhr.timeout]).toEqual([
      'POST',
      'http://10.0.0.2:8787/report',
      RENDER_REQUEST_TIMEOUT_MS,
    ]);
    expect(xhr.headers['Content-Type']).toBe('text/plain;charset=UTF-8');
    expect(JSON.parse(xhr.body as string)).toMatchObject({ kind: 'render-bench', seq: 3 });
    expect(outcomes).toEqual([]);
    xhr.status = 200;
    xhr.onload?.();
    xhr.onerror?.(); // a late event never reports twice
    expect(outcomes).toEqual([[true, null]]);
  });

  it('reports an HTTP error, a network error and a timeout', () => {
    const http = new FakeXhr();
    const a = send(http);
    http.status = 500;
    http.onload?.();
    expect(a.outcomes).toEqual([[false, 'HTTP 500']]);

    const network = new FakeXhr();
    const b = send(network);
    network.onerror?.();
    expect(b.outcomes).toEqual([[false, 'network error']]);

    const slow = new FakeXhr();
    const c = send(slow);
    slow.ontimeout?.();
    slow.onload?.();
    expect(c.outcomes).toEqual([[false, 'timeout']]);
  });

  it('never throws: no server, a request that cannot open or send, a payload that cannot serialize', () => {
    expect(send(new FakeXhr(), null)).toEqual({ outcomes: [[false, 'off']], sent: false });
    expect(send(new FakeXhr('open'))).toEqual({
      outcomes: [[false, 'open: Error: blocked']],
      sent: false,
    });
    expect(send(new FakeXhr('send'))).toEqual({
      outcomes: [[false, 'Error: offline']],
      sent: false,
    });
    const cyclic = { scenario: 'x', index: 0 } as RenderBenchRecord & { self?: unknown };
    cyclic.self = cyclic;
    const outcomes: boolean[] = [];
    const payload = buildRenderBenchPayload('rb-x', 1, 0, ENV, [cyclic], false);
    expect(
      sendRenderBench(
        'http://h/report',
        payload,
        () => new FakeXhr() as unknown as XMLHttpRequest,
        (ok) => {
          outcomes.push(ok);
        },
      ),
    ).toBe(false);
    expect(outcomes).toEqual([false]);
  });
});
