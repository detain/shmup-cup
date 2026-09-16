#!/usr/bin/env node
/**
 * Optional log receiver for the input probe **and for the game's render telemetry** — zero dependencies.
 *
 * Two senders, one receiver (plan M3-02f). The probe (built with VITE_REPORT_URL=http://<this-pc-ip>:8787)
 * POSTs `{session, seq, sentAt, env, verdicts, stats, newEvents, droppedEvents}` every 3 s; the game's
 * dev build (built with the same VITE_REPORT_URL) POSTs `{kind:'render-profile', session, seq, sentAt,
 * env, checklist, samples, droppedSamples}` every 3 s. Both go out as `text/plain` JSON (a CORS "simple
 * request", so no preflight), and both are appended as one line to `<LOG_DIR>/<session>.jsonl`, with a
 * short summary printed. The session id says which is which: `ip-…` for the probe, `rp-…` for a render
 * profile, so the two never share a file.
 *
 * The server stays **payload-agnostic** apart from the summary it prints: {@link validatePayload} only
 * checks what the server itself relies on, and {@link formatSummary} picks a per-kind formatter.
 *
 * Usage:
 *   node server/log-server.mjs              (or: npm run log-server)
 *   PORT=8787 HOST=0.0.0.0 LOG_DIR=./logs node server/log-server.mjs
 *
 * Endpoints:
 *   POST /report   append a payload (either kind)
 *   GET  /         list sessions (plain text)
 *   GET  /health   "ok"
 *
 * On Windows, allow Node through the firewall (private network) when prompted, or the TV cannot reach it.
 *
 * Environment: PORT (default 8787), HOST (default 0.0.0.0 = all interfaces), LOG_DIR (default
 * `tools/input-probe/logs`). Each JSONL line is the payload plus `receivedAt` (ISO time) and `from` (the
 * sender's IP). Bodies above {@link MAX_BODY_BYTES} are rejected with 413; invalid JSON / payloads with 400.
 *
 * Analyzers: `results/analyze.mjs` for an `ip-…` session, `results/analyze-render.mjs` for an `rp-…` one.
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
 *   numeric `seq` and, if present, an array `newEvents` — the probe — or `samples` — a render profile).
 */
export function validatePayload(p) {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return 'payload must be a JSON object';
  const o = /** @type {Record<string, unknown>} */ (p);
  if (sanitizeSession(o.session) === null) return 'missing session';
  if (typeof o.seq !== 'number') return 'missing seq';
  if (o.newEvents !== undefined && !Array.isArray(o.newEvents)) return 'newEvents must be an array';
  if (o.samples !== undefined && !Array.isArray(o.samples)) return 'samples must be an array';
  return null;
}

/** `kind` of a render-telemetry payload (plan M3-02f); the probe's payloads carry no `kind`. */
export const RENDER_PROFILE_KIND = 'render-profile';

/**
 * One-line-per-item console summary of a payload — the probe's by default, a render profile's when the
 * payload's `kind` is {@link RENDER_PROFILE_KIND}.
 *
 * @param {Record<string, any>} p - a valid payload
 * @returns {string} for the probe: a header line (session, seq, event counts), two verdict lines, then the
 *   last 12 events (with a note when earlier ones were omitted); for a render profile see
 *   {@link formatRenderSummary}.
 */
export function formatSummary(p) {
  if (p.kind === RENDER_PROFILE_KIND) return formatRenderSummary(p);
  const v = p.verdicts !== null && typeof p.verdicts === 'object' ? p.verdicts : {};
  const events = Array.isArray(p.newEvents) ? p.newEvents : [];
  const lines = [
    `[${str(p.session)} #${str(p.seq)}] ${events.length} new events` + (p.droppedEvents ? ` (${str(p.droppedEvents)} dropped)` : ''),
    `  diagonals=${str(v.diagonals ?? '?')} · OK+arrow=${str(v.okWhileArrowHeld ?? '?')} · repeat=${str(v.repeatStyle ?? '?')}` +
      ` (delay ${fmt(v.repeatDelayMs)} / every ${fmt(v.repeatIntervalMs)} ms) · bounces=${str(v.bounces ?? '?')}`,
    `  maxHeld=${str(v.maxSimultaneous ?? '?')} · longest=${fmt(v.longestHoldMs)} ms · dispatch avg ${fmt(v.dispatchDelayAvgMs)} ms` +
      ` · frames ${fmt(v.frameMedianMs)} ms (${fmt(v.frameHz)} Hz) p95 ${fmt(v.frameP95Ms)} · hitches ${str(v.hitches ?? '?')}`,
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
 * Text for any value a payload may carry, without ever throwing.
 *
 * @param {unknown} v - the value.
 * @returns {string} its text, or `?` when it has none (`{"toString": 1}` is valid JSON, and
 *   interpolating it raises `TypeError: Cannot convert object to primitive value`).
 *
 * @remarks
 * Every formatter reads a payload nobody authenticated, so each interpolation of a *nested* value
 * goes through this. The `req.on('end')` handler catches a throwing formatter as a last resort, but
 * then the summary line — the only thing the owner sees while capturing — is lost for that POST.
 */
function str(v) {
  try {
    return String(v);
  } catch {
    return '?';
  }
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
      `${t} ${e.type === 'down' ? 'DOWN' : 'UP  '} ${str(e.name ?? '?')}(${str(e.code ?? '?')})` +
      (e.type === 'down' ? ` repeat=${e.repeat ? 1 : 0} ${str(e.kind ?? '')}` : ` held=${typeof e.heldMs === 'number' ? e.heldMs.toFixed(0) : '?'}ms`) +
      (typeof e.dt === 'number' ? ` Δ${e.dt.toFixed(1)}` : '')
    );
  }
  return `${t} ${e.type === 'gamepad' ? 'GP' : '· '} ${str(e.text ?? '')}`;
}

/**
 * Formats a min / median / p95 / max distribution from a render sample.
 *
 * @param {unknown} d - a `[min, median, p95, max]` tuple from a `samples[].*` field.
 * @param {number} [digits] - decimals (default 2).
 * @returns {string} e.g. `0.9/1.2/2.1/4.0`, or `—` when the field is missing or malformed.
 */
function fmtDist(d, digits = 2) {
  if (!Array.isArray(d) || d.length < 4) return '—';
  return d.map((v) => (typeof v === 'number' ? v.toFixed(digits) : '?')).join('/');
}

/**
 * One line per render sample: where it was taken and the window's distributions.
 *
 * Never trusts the payload's shape, exactly like {@link formatEvent}: `validatePayload` only checks that
 * `samples` **is an array**, so a malformed entry (`samples: [null]` from a hand-rolled POST — the server
 * listens on the LAN and authenticates nobody) must print as junk rather than throw inside the request
 * handler and take the receiver, and the rest of the capture, down with it.
 *
 * @param {unknown} s - one entry of a render payload's `samples`.
 * @returns {string} e.g.
 *   `    #7 game/azure-verge crt=off gl=1 · 59.9 fps/3.0 s · RENDER 0.9/1.2/2.1/4.0 · DRAW 12 · REB 178/180 · RT 0 KB`.
 */
function formatRenderSample(s) {
  if (!s || typeof s !== 'object') return '    ' + String(s);
  const c = (s.context !== null && typeof s.context === 'object' ? s.context : null) ?? {};
  const where = `${str(c.scene ?? '?')}/${str(c.zone ?? c.stage ?? '-')}`;
  const secs = typeof s.durationMs === 'number' ? (s.durationMs / 1000).toFixed(1) : '?';
  const marks = Array.isArray(s.marks) && s.marks.length > 0 ? ` · marks ${s.marks.map(str).join(',')}` : '';
  const perturbed = s.sendInFlightFrames ? ` · ⚠ ${str(s.sendInFlightFrames)} frames with a send in flight` : '';
  return (
    `    #${str(s.seq ?? '?')} ${where} crt=${str(c.crtFilter ?? '?')} aspect=${str(c.aspect ?? '?')} gl=${str(c.webGLVersion ?? '?')}` +
    ` · ${fmt1(s.fps)} fps/${secs} s (${str(s.frames ?? '?')} frames)` +
    ` · TICK ${fmtDist(s.tickMs)} · RENDER ${fmtDist(s.renderMs)} · FRAME ${fmtDist(s.frameMs, 1)}` +
    ` · DRAW ${fmtDist(s.drawCalls, 0)} · REB ${str(s.rebuilds ?? '?')}/${str(s.frames ?? '?')} · RT ${str(s.renderTargetKb ?? '?')} KB` +
    ` · TPF ${Array.isArray(s.tickFrames) ? s.tickFrames.map(str).join('/') : '—'}` +
    marks +
    perturbed
  );
}

/**
 * Formats an optional number with one decimal.
 *
 * @param {unknown} v - value from the payload.
 * @returns {string} the number, or `—`.
 */
function fmt1(v) {
  return typeof v === 'number' ? v.toFixed(1) : '—';
}

/**
 * Console summary of a render-telemetry payload (plan M3-02f): a header line, the guided-capture
 * checklist's progress and one line per sampling window in the batch (at most the last 8).
 *
 * @param {Record<string, any>} p - a valid payload whose `kind` is {@link RENDER_PROFILE_KIND}.
 * @returns {string} the summary, one item per line.
 */
export function formatRenderSummary(p) {
  const samples = Array.isArray(p.samples) ? p.samples : [];
  const checklist = (Array.isArray(p.checklist) ? p.checklist : []).filter(
    (i) => i !== null && typeof i === 'object',
  );
  const done = checklist.filter((i) => i.done);
  const env = p.env !== null && typeof p.env === 'object' ? p.env : {};
  const lines = [
    `[${str(p.session)} #${str(p.seq)}] render-profile · ${samples.length} window(s)` +
      (p.droppedSamples ? ` (${str(p.droppedSamples)} dropped)` : '') +
      (env.buildId ? ` · build ${str(env.buildId)}` : ''),
    `  checklist ${done.length}/${checklist.length}` +
      (done.length > 0 ? ': ' + done.map((i) => str(i.id)).join(' ') : '') +
      (checklist.length > done.length
        ? ' — next: ' + str(checklist.find((i) => !i.done)?.label ?? '?')
        : ' — done'),
  ];
  for (const s of samples.slice(-8)) lines.push(formatRenderSample(s));
  if (samples.length > 8) lines.splice(2, 0, `    … ${samples.length - 8} earlier windows in the JSONL file`);
  return lines.join('\n');
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
      // The payload is on disk; a formatter that cannot make sense of it must not take the receiver
      // down mid-capture (an uncaught throw in this handler ends the process).
      try {
        log(formatSummary(payload));
      } catch (e) {
        log(`[${session}] (payload stored; could not be summarized: ${e && e.message ? e.message : String(e)})`);
      }
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
    console.log('Receives both the input probe (ip-… sessions) and the game\'s render telemetry (rp-…).');
    const ips = lanAddresses();
    if (ips.length) {
      console.log('Build the probe — or the game\'s Tizen dev bundle — with one of:');
      for (const ip of ips) console.log(`  VITE_REPORT_URL=http://${ip}:${port}`);
    }
  });
}
