/**
 * The log server's TV render-bench support (plan R0-02 acceptance: "the log server stores and summarises a
 * `render-bench` session"): the `render-bench` formatter, the payload check that lets its `results` through,
 * and a whole session POSTed over HTTP, stored as `rb-….jsonl` and readable by `results/analyze-bench.mjs` —
 * since plan R1-05 (B4) ending with the decode scenario's payload (`fixtures/bench-decode.jsonl`).
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readBenchSession } from '../results/analyze-bench.mjs';
import {
  RENDER_BENCH_KIND,
  createLogServer,
  formatBenchSummary,
  formatSummary,
  validatePayload,
} from '../server/log-server.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bench-session.jsonl');
const DECODE_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bench-decode.jsonl');

/**
 * A fixture's payloads, as the bench POSTed them (the server's `receivedAt` / `from` removed).
 *
 * @param file - The fixture.
 * @returns The payloads.
 */
function payloadsOf(file: string): Record<string, unknown>[] {
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const { receivedAt: _r, from: _f, ...payload } = JSON.parse(line) as Record<string, unknown>;
      return payload;
    });
}

/** The fixture session's payloads. */
const PAYLOADS = payloadsOf(FIXTURE);

/** The decode scenario's payload (plan R1-05 B4). */
const DECODE_PAYLOAD = payloadsOf(DECODE_FIXTURE)[0] as Record<string, unknown>;

describe('formatBenchSummary', () => {
  it('prints a header and one line per record', () => {
    const lines = formatBenchSummary(PAYLOADS[6] as Record<string, unknown>).split('\n');
    expect(lines[0]).toBe(
      '[rb-mgabc12-k3f0 #7] render-bench · 1 result(s) · build abc1234 · tizen 1920x1080 · scenario 7/18',
    );
    expect(lines[1]).toBe(
      '    640x360-busy gl=1 ×3 · RENDER p50/p95 2.00/3.00 · SYNCED 3.75/5.00 · FRAME p95 31.5 · 2TICK 2.3%' +
        ' · DRAW 12 · RT 0 KB · TEX 8192 KB in 1 page(s) · HEAP +20 KB (830+350 frames)',
    );
    expect(lines).toHaveLength(2);
  });

  it('says when the run is complete', () => {
    expect(formatBenchSummary(PAYLOADS[17] as Record<string, unknown>).split('\n')[0]).toMatch(
      / · scenario 18\/18 · run complete$/,
    );
  });

  it('is picked by formatSummary for the render-bench kind', () => {
    expect(RENDER_BENCH_KIND).toBe('render-bench');
    expect(formatSummary(PAYLOADS[0] as Record<string, unknown>)).toContain('render-bench · 1 result(s)');
  });

  it('prints one line per page of the decode scenario’s payload (plan R1-05 B4)', () => {
    const lines = formatBenchSummary(DECODE_PAYLOAD).split('\n');
    expect(lines[0]).toBe(
      '[rb-mgabc12-k3f0 #21] render-bench · 0 result(s) · build abc1234 · tizen 1920x1080 · decode 4 page(s) × 8' +
        ' · run complete',
    );
    expect(lines[1]).toBe(
      '    decode rgba-2048 2048x2048 rgba 2442 KB · FETCH 24.0 · DECODE 400.0 · UPLOAD 130.0 · TOTAL 554.0' +
        ' · BITMAP 380.0/20.0',
    );
    expect(lines[4]).toBe(
      '    decode zone-a 256x128 png8 2 KB · FETCH 0.6 · DECODE 2.2 · UPLOAD 0.7 · TOTAL 3.5 · BITMAP —/—' +
        ' · bitmap: createImageBitmap timed out after 30000 ms',
    );
    expect(lines).toHaveLength(5);
    const stopped = formatBenchSummary({ session: 's', seq: 1, decode: { pages: [null, {}], error: 'Error: x' } });
    expect(stopped.split('\n')).toEqual([
      '[s #1] render-bench · 0 result(s) · decode 2 page(s) × ?',
      '    decode null',
      '    decode ? ?x? ? ? KB · FETCH — · DECODE — · UPLOAD — · TOTAL — · BITMAP —/—',
      '    decode stopped: Error: x',
    ]);
  });

  it('never throws on a malformed payload', () => {
    const bad = { toString: 1 } as unknown;
    expect(formatBenchSummary({ session: 's', seq: 1 })).toBe('[s #1] render-bench · 0 result(s)');
    const text = formatBenchSummary({ session: 's', seq: 1, results: [null, 3, bad, {}], env: 'nope' });
    expect(text.split('\n')).toHaveLength(5);
    expect(text).toContain('    ? gl=? ×? · RENDER p50/p95 — · SYNCED — · FRAME p95 — · 2TICK —');
    expect(formatBenchSummary({ session: 's', seq: 1, results: [{ heapMeasured: false }] })).toContain(
      'HEAP n/a',
    );
  });
});

describe('validatePayload (render-bench)', () => {
  it('accepts a bench payload and rejects results that are not an array', () => {
    expect(validatePayload(PAYLOADS[0])).toBeNull();
    expect(validatePayload({ kind: RENDER_BENCH_KIND, session: 'rb-x', seq: 1, results: 'x' })).toBe(
      'results must be an array',
    );
  });
});

describe('log server (HTTP) with a TV render-bench session', () => {
  let server: Server;
  let base: string;
  let logDir: string;
  const logged: string[] = [];

  beforeAll(async () => {
    logDir = mkdtempSync(join(tmpdir(), 'probe-bench-logs-'));
    server = createLogServer({ logDir, log: (m: string) => void logged.push(m) });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(logDir, { recursive: true, force: true });
  });

  it('stores every payload of a run in rb-….jsonl and summarises each one', async () => {
    for (const payload of PAYLOADS) {
      const res = await fetch(base + '/report', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
    }
    const file = join(logDir, 'rb-mgabc12-k3f0.jsonl');
    const rows = readFileSync(file, 'utf8').trim().split('\n');
    expect(rows).toHaveLength(PAYLOADS.length);
    expect(JSON.parse(rows[0] as string)).toMatchObject({
      kind: RENDER_BENCH_KIND,
      session: 'rb-mgabc12-k3f0',
      seq: 1,
      from: '127.0.0.1',
    });
    expect(logged.filter((line) => line.startsWith('[rb-mgabc12-k3f0 #'))).toHaveLength(PAYLOADS.length);
    // …and the analyzer reads the stored session: the 18 scenarios, the Red re-run winning.
    const { records, decode } = readBenchSession(file);
    expect(records).toHaveLength(18);
    expect(records.find((r) => r.scenario === '640x360-busy')?.twoTickShare).toBe(0.02);
    expect(decode).toBeNull();
  });

  it('stores the decode scenario’s payload as it came, for the analyzer (plan R1-05 B4)', async () => {
    const res = await fetch(base + '/report', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(DECODE_PAYLOAD),
    });
    expect(res.status).toBe(200);
    const file = join(logDir, 'rb-mgabc12-k3f0.jsonl');
    const { decode } = readBenchSession(file);
    expect(decode).toEqual(DECODE_PAYLOAD['decode']);
    expect(logged[logged.length - 1]).toContain('decode 4 page(s) × 8');
  });
});
