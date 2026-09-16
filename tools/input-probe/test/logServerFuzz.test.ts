/**
 * The log server against arbitrary junk (plan M3-02f).
 *
 * The receiver listens on `0.0.0.0`, authenticates nobody and runs for the length of the owner's
 * capture on their LAN. An uncaught throw inside the `req.on('end')` handler ends the Node process,
 * so one malformed POST — a stale build, a port scanner, a hand-rolled `curl` — would take the rest
 * of that session's windows with it. That happened once already: `formatRenderSample` read
 * `s.context` with no shape check while `validatePayload` only requires `samples` to be an array,
 * so `samples: [null]` killed it.
 *
 * This file therefore throws generated junk at both the formatters and the live server, and asserts
 * the one property that matters: **nothing takes the receiver down, and a valid payload still works
 * afterwards.**
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  RENDER_PROFILE_KIND,
  createLogServer,
  formatRenderSummary,
  formatSummary,
  sanitizeSession,
  validatePayload,
} from '../server/log-server.mjs';

/**
 * A deterministic PRNG (mulberry32), so a failing fuzz case can be reproduced from its seed.
 *
 * @param seed - The seed.
 * @returns A function returning the next number in [0, 1).
 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Values a generated payload may put anywhere a real one has a number, a string or an object. */
const ATOMS: unknown[] = [
  null,
  true,
  false,
  0,
  -1,
  1e308,
  -1e308,
  0.1,
  '',
  '?',
  'render-profile',
  '../../etc/passwd',
  '\u0000\u001b[31m',
  '\u{1f600}'.repeat(8),
  'x'.repeat(300),
  [],
  {},
  [null],
  [[[[]]]],
  { toString: 1 },
  { ['__proto__']: { polluted: true } },
];

/**
 * A random JSON value, at most `depth` levels deep.
 *
 * @param random - The PRNG.
 * @param depth - Remaining nesting allowance.
 * @returns The value.
 */
function junk(random: () => number, depth = 3): unknown {
  const roll = random();
  if (depth <= 0 || roll < 0.5) return ATOMS[Math.floor(random() * ATOMS.length)];
  if (roll < 0.75) {
    const out: unknown[] = [];
    const n = Math.floor(random() * 4);
    for (let i = 0; i < n; i++) out.push(junk(random, depth - 1));
    return out;
  }
  const out: Record<string, unknown> = {};
  const keys = [
    'seq',
    'context',
    'marks',
    'hist',
    'samples',
    'checklist',
    'env',
    '__proto__',
    'done',
    'id',
  ];
  const n = Math.floor(random() * 5);
  for (let i = 0; i < n; i++) out[keys[Math.floor(random() * keys.length)]] = junk(random, depth - 1);
  return out;
}

/**
 * A payload that is valid enough to be stored (a usable `session` and a numeric `seq`) but whose
 * every other field is junk — the case that reaches the formatters.
 *
 * @param random - The PRNG.
 * @param session - The session id to use.
 * @returns The payload.
 */
function junkPayload(random: () => number, session: string): Record<string, unknown> {
  return {
    kind: random() < 0.5 ? RENDER_PROFILE_KIND : junk(random),
    session,
    seq: Math.floor(random() * 1000),
    sentAt: junk(random),
    env: junk(random),
    checklist: random() < 0.5 ? [junk(random), junk(random)] : junk(random),
    samples: [junk(random), junk(random), junk(random)],
    newEvents: random() < 0.3 ? [junk(random)] : undefined,
    droppedSamples: junk(random),
    verdicts: junk(random),
    stats: junk(random),
  };
}

describe('log-server formatters against generated junk', () => {
  it('never throws on any payload that passes validatePayload', () => {
    const random = rng(20260916);
    for (let i = 0; i < 400; i++) {
      const payload = junkPayload(random, 'rp-fuzz-' + i);
      // Round-tripped through JSON, because that is the only way a payload can reach the server.
      const parsed = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
      expect(validatePayload(parsed)).toBeNull();
      expect(() => formatSummary(parsed)).not.toThrow();
      expect(typeof formatSummary(parsed)).toBe('string');
      expect(() => formatRenderSummary(parsed)).not.toThrow();
    }
  });

  it('never throws on the shapes that killed it: a null window, a null context, a junk checklist', () => {
    const base = { kind: RENDER_PROFILE_KIND, session: 'rp-x', seq: 1 };
    for (const samples of [
      [null],
      [undefined],
      [0],
      ['window'],
      [[]],
      [{ context: null }],
      [{ context: [] }],
      [{ context: 7 }],
      [{ marks: 'M1' }],
      [{ frameMs: 'x', tickMs: [1], renderMs: [1, 2], drawCalls: [1, 2, 3, 4] }],
      [{ tickFrames: {} }],
      [{ sendInFlightFrames: 'many' }],
      // `{"toString": 1}` is valid JSON and has no primitive form: interpolating it raises
      // `TypeError: Cannot convert object to primitive value`.
      [{ context: { scene: { toString: 1 } } }],
      [{ seq: { toString: 1 } }],
      [{ marks: [{ toString: 1 }] }],
    ]) {
      expect(() => formatRenderSummary({ ...base, samples })).not.toThrow();
    }
    for (const checklist of [
      null,
      3,
      'M1',
      [null],
      [3],
      [{ done: 1 }],
      [{ id: {} }],
      [{ id: { toString: 1 }, done: true }],
      [{ label: { toString: 1 }, done: false }],
    ]) {
      expect(() => formatRenderSummary({ ...base, samples: [], checklist })).not.toThrow();
    }
    // A payload with no render fields at all still prints a header rather than throwing.
    expect(formatRenderSummary({ ...base })).toContain('rp-x');
  });

  it('refuses what it cannot file, and never lets a session id escape the log directory', () => {
    const random = rng(7);
    for (let i = 0; i < 200; i++) {
      const value = junk(random);
      const parsed = JSON.parse(JSON.stringify({ v: value })) as { v: unknown };
      expect(() => validatePayload(parsed.v)).not.toThrow();
      const session = sanitizeSession((parsed.v as { session?: unknown } | null)?.session);
      if (session !== null) {
        expect(session).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
        expect(session.startsWith('.')).toBe(false);
      }
    }
    expect(validatePayload({ session: 'ok', seq: 1, samples: 'not an array' })).toBe(
      'samples must be an array',
    );
    expect(validatePayload({ session: 'ok', seq: 1, newEvents: {} })).toBe(
      'newEvents must be an array',
    );
    expect(validatePayload([])).toBe('payload must be a JSON object');
    expect(validatePayload({ seq: 1 })).toBe('missing session');
    expect(validatePayload({ session: 'ok' })).toBe('missing seq');
  });

  it('prints a probe payload whose verdicts and events are not what it expects', () => {
    for (const verdicts of [null, 3, 'yes', [], { diagonals: { toString: 1 } }]) {
      expect(() => formatSummary({ session: 'ip-x', seq: 1, verdicts, newEvents: [] })).not.toThrow();
    }
    for (const event of [null, 3, 'down', [], { type: 'down', name: { toString: 1 } }, { type: 'info', text: { toString: 1 } }]) {
      expect(() => formatSummary({ session: 'ip-x', seq: 1, newEvents: [event] })).not.toThrow();
    }
  });
});

describe('log server survives arbitrary junk on the wire', () => {
  let server: Server;
  let base: string;
  let logDir: string;
  const logged: string[] = [];

  beforeAll(async () => {
    logDir = join(mkdtempSync(join(tmpdir(), 'probe-fuzz-')), 'logs');
    server = createLogServer({ logDir, log: (m: string) => void logged.push(m) });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(logDir, { recursive: true, force: true });
  });

  /**
   * POSTs a raw body.
   *
   * @param body - What to send.
   * @param path - The route (default `/report`).
   * @returns The response.
   */
  const post = (body: string, path = '/report'): Promise<Response> =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
    });

  it('answers every generated payload and stays up', async () => {
    const random = rng(4242);
    for (let i = 0; i < 120; i++) {
      const res = await post(JSON.stringify(junkPayload(random, 'rp-fuzz-wire')));
      expect(res.status).toBe(200);
      await res.text();
    }
    // Every junk payload was filed under the one session, and the file is still valid JSONL.
    const lines = readFileSync(join(logDir, 'rp-fuzz-wire.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(120);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  }, 60_000);

  it('rejects malformed bodies with 400 instead of dying', async () => {
    for (const body of [
      '',
      'not json',
      '{',
      '[]',
      'null',
      '"a string"',
      '123',
      '{"session":"","seq":1}',
      '{"session":"...","seq":1}',
      '{"session":"ok"}',
      '{"session":"ok","seq":"1"}',
      '{"session":"ok","seq":1,"samples":{}}',
      // Deeper than any JSON parser will walk: the parse error is caught like any other.
      '['.repeat(5000) + ']'.repeat(5000),
    ]) {
      const res = await post(body);
      expect([400, 413], body.slice(0, 20)).toContain(res.status);
      await res.text();
    }
    const health = await fetch(base + '/health');
    expect(await health.text()).toBe('ok\n');
  });

  it('cannot be persuaded to pollute Object.prototype through a payload key', async () => {
    const res = await post(
      '{"session":"rp-proto","seq":1,"__proto__":{"polluted":true},"samples":[]}',
    );
    expect(res.status).toBe(200);
    await res.text();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(readdirSync(logDir)).toContain('rp-proto.jsonl');
  });

  it('still takes a real capture after all of that', async () => {
    const payload = {
      kind: RENDER_PROFILE_KIND,
      session: 'rp-after-fuzz',
      seq: 1,
      sentAt: 1_700_000_000_000,
      env: { buildId: '9524c84', device: 'LS43AM702U' },
      checklist: [{ id: 'M1', label: 'Baseline', done: true, manual: false }],
      samples: [
        {
          seq: 1,
          startMs: 0,
          durationMs: 3000,
          frames: 180,
          fps: 60,
          sendInFlightFrames: 0,
          frameMs: [16, 16.7, 17, 20],
          tickMs: [0.1, 0.2, 0.3, 0.4],
          renderMs: [0.9, 1.2, 2.1, 4],
          drawCalls: [12, 12, 12, 12],
          rebuilds: 179,
          renderTargetKb: 0,
          tickFrames: [0, 180, 0, 0],
          context: { scene: 'game', stage: 'zone-a', zone: 'A', crtFilter: 'off', webGLVersion: 1 },
          marks: ['M2'],
        },
      ],
      droppedSamples: 0,
    };
    const res = await post(JSON.stringify(payload));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok\n');
    expect(logged[logged.length - 1]).toContain('render-profile · 1 window(s)');
    expect(logged[logged.length - 1]).toContain('RENDER 0.90/1.20/2.10/4.00');
  });
});
