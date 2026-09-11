/**
 * server/log-server.mjs: pure helpers and the HTTP server end-to-end (real sockets on 127.0.0.1, temp log dir).
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MAX_BODY_BYTES,
  createLogServer,
  formatSummary,
  lanAddresses,
  sanitizeSession,
  validatePayload,
} from '../server/log-server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('sanitizeSession', () => {
  it.each([
    ['ip-lx2k3a-7f3k', 'ip-lx2k3a-7f3k'],
    ['../../etc/passwd', '_.._etc_passwd'],
    ['..\\..\\win', '_.._win'],
    ['a b/c:d', 'a_b_c_d'],
    ['ümlaut', '_mlaut'],
    ['.hidden', 'hidden'],
  ])('%j → %j', (input, out) => {
    expect(sanitizeSession(input)).toBe(out);
  });

  it('caps the length at 64', () => {
    expect(sanitizeSession('x'.repeat(100))).toBe('x'.repeat(64));
  });

  it.each([undefined, null, 42, {}, '', '...'])('rejects %j', (input) => {
    expect(sanitizeSession(input)).toBeNull();
  });
});

describe('validatePayload', () => {
  it('accepts a probe payload', () => {
    expect(validatePayload({ session: 's', seq: 1, newEvents: [] })).toBeNull();
    expect(validatePayload({ session: 's', seq: 0 })).toBeNull();
  });

  it.each([
    [null, 'payload must be a JSON object'],
    [[], 'payload must be a JSON object'],
    ['str', 'payload must be a JSON object'],
    [{ seq: 1 }, 'missing session'],
    [{ session: '...', seq: 1 }, 'missing session'],
    [{ session: 's' }, 'missing seq'],
    [{ session: 's', seq: '1' }, 'missing seq'],
    [{ session: 's', seq: 1, newEvents: {} }, 'newEvents must be an array'],
  ])('%j → %s', (p, err) => {
    expect(validatePayload(p)).toBe(err);
  });
});

describe('formatSummary', () => {
  it('prints verdicts and the latest events', () => {
    const text = formatSummary({
      session: 's1',
      seq: 3,
      droppedEvents: 2,
      verdicts: {
        diagonals: 'YES',
        okWhileArrowHeld: 'arrow kept',
        repeatStyle: 'clean (repeat flag)',
        repeatDelayMs: 500,
        repeatIntervalMs: 50,
        bounces: 0,
        maxSimultaneous: 2,
        longestHoldMs: 3000,
        dispatchDelayAvgMs: 1.2,
        frameMedianMs: 16.7,
        frameHz: 60,
        frameP95Ms: 17,
        hitches: 1,
      },
      newEvents: [
        { t: 100, type: 'down', code: 39, name: 'ArrowRight', repeat: false, kind: 'press', dt: 5 },
        { t: 200, type: 'up', code: 39, name: 'ArrowRight', heldMs: 100 },
        { t: 300, type: 'gamepad', text: 'GP0 b0 down' },
        { t: 400, type: 'info', text: 'blur' },
      ],
    });
    const lines = text.split('\n');
    expect(lines[0]).toBe('[s1 #3] 4 new events (2 dropped)');
    expect(lines[1]).toContain('diagonals=YES · OK+arrow=arrow kept · repeat=clean (repeat flag) (delay 500 / every 50 ms) · bounces=0');
    expect(lines[2]).toContain('maxHeld=2 · longest=3000 ms · dispatch avg 1.2 ms · frames 16.7 ms (60 Hz) p95 17 · hitches 1');
    expect(lines[3]).toBe('        100.0 DOWN ArrowRight(39) repeat=0 press Δ5.0');
    expect(lines[4]).toBe('        200.0 UP   ArrowRight(39) held=100ms');
    expect(lines[5]).toBe('        300.0 GP GP0 b0 down');
    expect(lines[6]).toBe('        400.0 ·  blur');
  });

  it('tolerates missing verdicts and odd events; shows only the last 12 events', () => {
    const events: unknown[] = [];
    for (let i = 0; i < 15; i++) events.push({ t: i, type: 'info', text: 'e' + i });
    events.push('weird', null, { type: 'up' });
    const lines = formatSummary({ session: 's', seq: 1, newEvents: events }).split('\n');
    expect(lines[0]).toBe('[s #1] 18 new events');
    expect(lines[1]).toContain('diagonals=? ');
    expect(lines[1]).toContain('delay — / every — ms');
    expect(lines[3]).toBe('    … 6 earlier events in the JSONL file');
    expect(lines).toHaveLength(3 + 1 + 12);
    expect(lines[lines.length - 3]).toBe('    weird');
    expect(lines[lines.length - 2]).toBe('    null');
    expect(lines[lines.length - 1]).toBe('            ? UP   ?(?) held=?ms');
  });

  it('handles a payload without newEvents', () => {
    expect(formatSummary({ session: 's', seq: 1 }).split('\n')[0]).toBe('[s #1] 0 new events');
  });
});

describe('lanAddresses', () => {
  it('returns non-internal IPv4 addresses', () => {
    const ips = lanAddresses();
    expect(Array.isArray(ips)).toBe(true);
    for (const ip of ips) {
      expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(ip.startsWith('127.')).toBe(false);
    }
  });
});

describe('log server (HTTP)', () => {
  let server: Server;
  let base: string;
  let logDir: string;
  const logged: string[] = [];

  beforeAll(async () => {
    logDir = join(mkdtempSync(join(tmpdir(), 'probe-logs-')), 'nested', 'logs');
    server = createLogServer({ logDir, log: (m: string) => void logged.push(m) });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dirname(dirname(logDir)), { recursive: true, force: true });
  });

  const post = (body: string, path = '/report'): Promise<Response> =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body });

  const readJsonl = (session: string): Array<Record<string, unknown>> =>
    readFileSync(join(logDir, session + '.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);

  it('creates the log directory', () => {
    expect(readdirSync(logDir)).toEqual([]);
  });

  it('GET /health', async () => {
    const res = await fetch(base + '/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok\n');
  });

  it('OPTIONS answers CORS preflights', async () => {
    const res = await fetch(base + '/report', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('appends each payload as one JSONL line per session and logs a summary', async () => {
    const p1 = { session: 'ip-test-0001', seq: 1, sentAt: 1, verdicts: { diagonals: 'YES' }, newEvents: [{ t: 1, type: 'info', text: 'hi' }] };
    const res = await post(JSON.stringify(p1));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.text()).toBe('ok\n');
    const res2 = await post(JSON.stringify({ ...p1, seq: 2, newEvents: [] }), '/');
    expect(res2.status).toBe(200);
    const rows = readJsonl('ip-test-0001');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ session: 'ip-test-0001', seq: 1, verdicts: { diagonals: 'YES' } });
    expect(typeof rows[0]?.['receivedAt']).toBe('string');
    expect(rows[0]?.['from']).toMatch(/127\.0\.0\.1/);
    expect(rows[1]?.['seq']).toBe(2);
    expect(logged.some((l) => l.startsWith('[ip-test-0001 #1] 1 new events'))).toBe(true);
  });

  it('keeps sessions in separate files and never escapes the log directory', async () => {
    const res = await post(JSON.stringify({ session: '../../escape', seq: 1 }));
    expect(res.status).toBe(200);
    expect(readdirSync(logDir).sort()).toEqual(['_.._escape.jsonl', 'ip-test-0001.jsonl']);
  });

  it('GET / lists sessions', async () => {
    const res = await fetch(base + '/');
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('2 session(s)');
    expect(text).toContain('ip-test-0001.jsonl');
  });

  it.each([
    ['not json', /^invalid JSON/],
    ['[1,2]', /^payload must be a JSON object/],
    ['{"seq":1}', /^missing session/],
    ['{"session":"s","seq":1,"newEvents":"x"}', /^newEvents must be an array/],
  ])('400 for %j', async (body, msg) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(msg);
  });

  it('404 for unknown routes and methods', async () => {
    expect((await fetch(base + '/nope')).status).toBe(404);
    expect((await fetch(base + '/report')).status).toBe(404);
    expect((await fetch(base + '/report', { method: 'PUT', body: '{}' })).status).toBe(404);
    expect((await post('{}', '/other')).status).toBe(404);
  });

  it('ignores query strings when routing', async () => {
    expect((await fetch(base + '/health?x=1')).status).toBe(200);
  });

  it('rejects oversized bodies with 413 and writes nothing', async () => {
    const before = readdirSync(logDir).length;
    const big = JSON.stringify({ session: 'big', seq: 1, pad: 'x'.repeat(MAX_BODY_BYTES + 10) });
    const status = await new Promise<number | string>((resolveStatus) => {
      const req = request(base + '/report', { method: 'POST', headers: { 'Content-Type': 'text/plain' } }, (res) => {
        res.resume();
        resolveStatus(res.statusCode ?? 0);
      });
      req.on('error', (e: NodeJS.ErrnoException) => resolveStatus(e.code ?? 'error'));
      req.end(big);
    });
    expect(status).toBe(413);
    expect(readdirSync(logDir).length).toBe(before);
  });

  it('a probe payload built by ReportQueue is accepted as-is', async () => {
    const { ReportQueue } = await import('../src/report');
    const q = new ReportQueue('ip-queue-abcd');
    q.push({ t: 12.5, type: 'down', code: 13, name: 'Enter', repeat: false, kind: 'press', dt: 1, delay: 0.5 });
    const payload = q.build({ userAgent: 'x' }, { diagonals: 'not tested' }, { keys: {} }, Date.now());
    expect(validatePayload(JSON.parse(JSON.stringify(payload)))).toBeNull();
    expect((await post(JSON.stringify(payload))).status).toBe(200);
    expect(readJsonl('ip-queue-abcd')[0]?.['newEvents']).toEqual(payload.newEvents);
  });
});

describe('log server CLI', () => {
  it('starts on PORT/HOST/LOG_DIR and prints the listening address', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probe-cli-'));
    const child = spawn(process.execPath, [join(ROOT, 'server', 'log-server.mjs')], {
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', LOG_DIR: join(dir, 'l') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const out = await new Promise<string>((resolveOut, reject) => {
        let buf = '';
        const timer = setTimeout(() => reject(new Error('no output: ' + buf)), 10_000);
        child.stdout.on('data', (d: Buffer) => {
          buf += d.toString();
          if (buf.includes('listening')) {
            clearTimeout(timer);
            resolveOut(buf);
          }
        });
        child.on('exit', (code) => reject(new Error('exited ' + code + ': ' + buf)));
      });
      expect(out).toContain('input-probe log server listening on http://127.0.0.1:0');
      expect(readdirSync(dir)).toEqual(['l']);
    } finally {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
