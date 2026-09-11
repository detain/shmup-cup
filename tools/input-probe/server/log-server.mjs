#!/usr/bin/env node
/**
 * Optional log receiver for the input probe — zero dependencies.
 *
 * The probe (built with VITE_REPORT_URL=http://<this-pc-ip>:8787) POSTs
 * `{session, seq, sentAt, env, verdicts, stats, newEvents, droppedEvents}` every 3 s as `text/plain` JSON
 * (a CORS "simple request", so no preflight). Each payload is appended as one line to
 * `<LOG_DIR>/<session>.jsonl` and a short summary is printed.
 *
 * Usage:
 *   node server/log-server.mjs              (or: npm run log-server)
 *   PORT=8787 HOST=0.0.0.0 LOG_DIR=./logs node server/log-server.mjs
 *
 * Endpoints:
 *   POST /report   append a payload
 *   GET  /         list sessions (plain text)
 *   GET  /health   "ok"
 *
 * On Windows, allow Node through the firewall (private network) when prompted, or the TV cannot reach it.
 *
 * Environment: PORT (default 8787), HOST (default 0.0.0.0 = all interfaces), LOG_DIR (default
 * `tools/input-probe/logs`). Each JSONL line is the payload plus `receivedAt` (ISO time) and `from` (the
 * sender's IP). Bodies above {@link MAX_BODY_BYTES} are rejected with 413; invalid JSON / payloads with 400.
 *
 * The exported functions are used by `test/logServer.test.ts` (and the end-to-end build test) to run the
 * server in-process on 127.0.0.1.
 *
 * @module server/log-server
 */

import { appendFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Maximum accepted request body (bytes). */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Makes a session id safe to use as a file name: keeps `[A-Za-z0-9._-]`, max 64 chars.
 *
 * @param {unknown} session - the payload's `session` field.
 * @returns {string | null} null when nothing usable remains (or `session` is not a string).
 *
 * @remarks
 * Other characters become `_` and leading dots are removed, so `../x` cannot escape LOG_DIR and no hidden
 * files are created.
 *
 * @example
 * sanitizeSession('ip-lx2k3a-7f3k'); // 'ip-lx2k3a-7f3k'
 * sanitizeSession('../../etc');      // '_.._etc'
 */
export function sanitizeSession(session) {
  if (typeof session !== 'string') return null;
  const s = session.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 64);
  return s.length > 0 ? s : null;
}

/**
 * Validates a parsed payload (deliberately lenient: only what the server itself relies on).
 *
 * @param {unknown} p - the parsed request body.
 * @returns {string | null} error message, or null when valid (a JSON object with a usable `session`, a
 *   numeric `seq` and, if present, an array `newEvents`).
 */
export function validatePayload(p) {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return 'payload must be a JSON object';
  const o = /** @type {Record<string, unknown>} */ (p);
  if (sanitizeSession(o.session) === null) return 'missing session';
  if (typeof o.seq !== 'number') return 'missing seq';
  if (o.newEvents !== undefined && !Array.isArray(o.newEvents)) return 'newEvents must be an array';
  return null;
}

/**
 * One-line-per-item console summary of a payload.
 *
 * @param {Record<string, any>} p - a valid payload
 * @returns {string} a header line (session, seq, event counts), two verdict lines, then the last 12 events
 *   (with a note when earlier ones were omitted).
 */
export function formatSummary(p) {
  const v = p.verdicts ?? {};
  const events = Array.isArray(p.newEvents) ? p.newEvents : [];
  const lines = [
    `[${p.session} #${p.seq}] ${events.length} new events` + (p.droppedEvents ? ` (${p.droppedEvents} dropped)` : ''),
    `  diagonals=${v.diagonals ?? '?'} · OK+arrow=${v.okWhileArrowHeld ?? '?'} · repeat=${v.repeatStyle ?? '?'}` +
      ` (delay ${fmt(v.repeatDelayMs)} / every ${fmt(v.repeatIntervalMs)} ms) · bounces=${v.bounces ?? '?'}`,
    `  maxHeld=${v.maxSimultaneous ?? '?'} · longest=${fmt(v.longestHoldMs)} ms · dispatch avg ${fmt(v.dispatchDelayAvgMs)} ms` +
      ` · frames ${fmt(v.frameMedianMs)} ms (${fmt(v.frameHz)} Hz) p95 ${fmt(v.frameP95Ms)} · hitches ${v.hitches ?? '?'}`,
  ];
  for (const e of events.slice(-12)) lines.push('    ' + formatEvent(e));
  if (events.length > 12) lines.splice(3, 0, `    … ${events.length - 12} earlier events in the JSONL file`);
  return lines.join('\n');
}

/**
 * Formats an optional number.
 *
 * @param {unknown} v - value from the payload.
 * @returns {string} the number as text, or `—` for anything else.
 */
function fmt(v) {
  return typeof v === 'number' ? String(v) : '—';
}

/**
 * Compact text for one probe event (a server-side mirror of `formatEvent` in `src/eventLog.ts`; kept
 * separate so the server stays dependency-free and never trusts the payload's shape).
 *
 * @param {any} e - one entry of `newEvents`.
 * @returns {string} e.g. `   8123.4 DOWN ArrowRight(39) repeat=0 press Δ95.2`.
 */
function formatEvent(e) {
  if (!e || typeof e !== 'object') return String(e);
  const t = typeof e.t === 'number' ? e.t.toFixed(1).padStart(9) : '        ?';
  if (e.type === 'down' || e.type === 'up') {
    return (
      `${t} ${e.type === 'down' ? 'DOWN' : 'UP  '} ${e.name ?? '?'}(${e.code ?? '?'})` +
      (e.type === 'down' ? ` repeat=${e.repeat ? 1 : 0} ${e.kind ?? ''}` : ` held=${typeof e.heldMs === 'number' ? e.heldMs.toFixed(0) : '?'}ms`) +
      (typeof e.dt === 'number' ? ` Δ${e.dt.toFixed(1)}` : '')
    );
  }
  return `${t} ${e.type === 'gamepad' ? 'GP' : '· '} ${e.text ?? ''}`;
}

/**
 * LAN IPv4 addresses of this machine (to put into VITE_REPORT_URL).
 *
 * @returns {string[]} non-internal IPv4 addresses of all interfaces (may include VPN / virtual adapters —
 *   pick the one on the monitors' subnet).
 */
export function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

/**
 * Creates (but does not start) the HTTP server.
 *
 * @param {{ logDir: string, log?: (msg: string) => void }} opts - `logDir`: where `<session>.jsonl` files
 *   go (created if missing); `log`: receives the per-payload summary (default `console.log`).
 * @returns {import('node:http').Server} the server; call `.listen(port, host)` to start it.
 *
 * @example
 * const server = createLogServer({ logDir: './logs' });
 * server.listen(8787, '0.0.0.0');
 */
export function createLogServer({ logDir, log = console.log }) {
  mkdirSync(logDir, { recursive: true });
  /** Permissive CORS headers on every response (the probe's POST needs none, but browsers testing GET do). */
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  /**
   * Sends a plain-text response.
   *
   * @param {import('node:http').ServerResponse} res - the response.
   * @param {number} status - HTTP status.
   * @param {string} text - body.
   * @returns {void}
   */
  const reply = (res, status, text) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(text);
  };

  return createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (req.method === 'OPTIONS') return reply(res, 204, '');
    if (req.method === 'GET' && url === '/health') return reply(res, 200, 'ok\n');
    if (req.method === 'GET' && url === '/') {
      const files = readdirSync(logDir).filter((f) => f.endsWith('.jsonl'));
      const rows = files.map((f) => {
        const st = statSync(join(logDir, f));
        return `${f}\t${st.size} bytes\t${st.mtime.toISOString()}`;
      });
      return reply(res, 200, `input-probe log server — ${files.length} session(s) in ${logDir}\n${rows.join('\n')}\n`);
    }
    if (req.method !== 'POST' || (url !== '/report' && url !== '/')) return reply(res, 404, 'not found\n');

    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        reply(res, 413, 'payload too large\n');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (e) {
        return reply(res, 400, 'invalid JSON: ' + e.message + '\n');
      }
      const err = validatePayload(payload);
      if (err) return reply(res, 400, err + '\n');
      const session = sanitizeSession(payload.session);
      const record = { receivedAt: new Date().toISOString(), from: req.socket.remoteAddress ?? null, ...payload };
      try {
        appendFileSync(join(logDir, session + '.jsonl'), JSON.stringify(record) + '\n');
      } catch (e) {
        return reply(res, 500, 'write failed: ' + e.message + '\n');
      }
      log(formatSummary(payload));
      reply(res, 200, 'ok\n');
    });
  });
}

// ------------------------------------------------------------------ CLI
/** True when run as a script (`node server/log-server.mjs`), false when imported (tests). */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '0.0.0.0';
  const logDir = resolve(process.env.LOG_DIR ?? join(here, '..', 'logs'));
  const server = createLogServer({ logDir });
  server.listen(port, host, () => {
    console.log(`input-probe log server listening on http://${host}:${port}  (logs → ${logDir})`);
    const ips = lanAddresses();
    if (ips.length) {
      console.log('Build the probe with one of:');
      for (const ip of ips) console.log(`  VITE_REPORT_URL=http://${ip}:${port}`);
    }
  });
}
