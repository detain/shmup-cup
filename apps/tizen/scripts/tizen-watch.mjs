#!/usr/bin/env node
/**
 * `pnpm --filter @shmup/tizen tizen:watch` — the live-reload dev server for the TV (plan M2-17,
 * shmup_feat.md §24 "live reload to real TV", shmup_tech.md §2.6). Never run in CI.
 *
 * 1. Picks this desktop's LAN address (`SHMUP_LIVE_RELOAD_HOST` overrides it) and a port
 *    (`SHMUP_LIVE_RELOAD_PORT`, default {@link DEFAULT_PORT}).
 * 2. Builds the TV app in **development** mode and keeps watching (`vite build --watch`), with
 *    `SHMUP_LIVE_RELOAD_URL=ws://<host>:<port>` so the build's `live-reload` module connects back.
 * 3. Serves `dist/` over HTTP on that port, and a WebSocket on the same port.
 * 4. After every rebuild, tells every connected app
 *    `{"type":"reload","url":"http://<host>:<port>/index.html"}`:
 *    a page served from here reloads, the installed widget navigates here — the new build runs on
 *    the TV without packaging or installing again.
 *
 * Once per session: after the first build, package and install it
 * (`TIZEN_PROFILE=<profile> pnpm --filter @shmup/tizen tizen:package`, then `TV_IP=<ip> …
 * tizen:install` and `tizen:run` — in another terminal); from then on every saved change reloads
 * the TV. The TV must reach the desktop on the port (firewall).
 *
 * The WebSocket side is a minimal RFC 6455 server written with Node's `http` and `crypto` (text
 * frames out, close frames in) — no dependency.
 *
 * **Public API** (for the tests). {@link websocketAccept}, {@link encodeTextFrame},
 * {@link readFrameOpcode}, {@link reloadMessage}, {@link lanAddress}, {@link resolveStaticFile},
 * {@link contentTypeOf}, {@link createLiveReloadServer}, {@link DEFAULT_PORT},
 * {@link WEBSOCKET_GUID}.
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_DIR, DIST_DIR } from './tizen-env.mjs';

/** Default port of the dev server (HTTP + WebSocket). */
export const DEFAULT_PORT = 5175;

/** The GUID RFC 6455 appends to the client's key. */
export const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * The `Sec-WebSocket-Accept` value for a client key (RFC 6455 §4.2.2).
 *
 * @param {string} key - The request's `Sec-WebSocket-Key`.
 * @returns {string} base64(SHA-1(key + GUID)).
 *
 * @example
 * websocketAccept('dGhlIHNhbXBsZSBub25jZQ=='); // → 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='
 */
export function websocketAccept(key) {
  return createHash('sha1')
    .update(key + WEBSOCKET_GUID)
    .digest('base64');
}

/**
 * Encodes one unmasked server → client text frame (FIN, opcode 1).
 *
 * @param {string} text - The message.
 * @returns {Buffer} The frame.
 */
export function encodeTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;
  /** @type {Buffer} */
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 0x10000) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

/**
 * The opcode of a client frame's first byte (8 = close, 9 = ping, 1 = text …), or -1 for no data.
 *
 * @param {Uint8Array} data - Bytes received.
 * @returns {number} The opcode.
 */
export function readFrameOpcode(data) {
  return data.length === 0 ? -1 : data[0] & 0x0f;
}

/**
 * The reload message for a served page.
 *
 * @param {string} pageUrl - `http://<host>:<port>/index.html`.
 * @returns {string} The JSON message the app's `live-reload` module parses.
 */
export function reloadMessage(pageUrl) {
  return JSON.stringify({ type: 'reload', url: pageUrl });
}

/**
 * This machine's first external IPv4 address (what the TV can reach).
 *
 * @param {ReturnType<typeof networkInterfaces>} [interfaces] - Network interfaces (default: the
 *   machine's).
 * @returns {string} The address, or `127.0.0.1` when there is none.
 */
export function lanAddress(interfaces = networkInterfaces()) {
  for (const name of Object.keys(interfaces).sort()) {
    for (const entry of interfaces[name] ?? []) {
      const family = /** @type {string | number} */ (entry.family);
      if ((family === 'IPv4' || family === 4) && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

/** Content types of the files a TV build holds. */
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
});

/**
 * The content type of a served file.
 *
 * @param {string} file - File path.
 * @returns {string} The type (`application/octet-stream` for unknown extensions).
 */
export function contentTypeOf(file) {
  const ext = /** @type {keyof typeof CONTENT_TYPES} */ (extname(file).toLowerCase());
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Maps a request path to a file inside the served folder, refusing traversal.
 *
 * @param {string} root - The served folder.
 * @param {string} urlPath - The request URL's path (`/index.html`, `/assets/atlas/main.png`).
 * @returns {string | null} The file, or `null` for a path that leaves the folder or cannot be
 *   decoded. `/` maps to `index.html`; query strings are ignored.
 */
export function resolveStaticFile(root, urlPath) {
  let path = urlPath.split('?')[0].split('#')[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (path.includes('\0') || path.includes('\\')) return null;
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const base = normalize(root);
  const file = normalize(join(base, path));
  const rel = relative(base, file);
  if (rel === '' || isAbsolute(rel) || rel.split(sep)[0] === '..') return null;
  return file;
}

/**
 * @typedef {object} LiveReloadServer
 * @property {import('node:http').Server} server - The HTTP server (not yet listening).
 * @property {() => number} clients - Connected WebSocket clients.
 * @property {(message: string) => number} notify - Sends a text message to every client; returns
 *   how many got it.
 * @property {() => Promise<void>} close - Closes every client and the server.
 */

/**
 * Creates the dev server: static files from `root` over HTTP, a WebSocket for the reload
 * messages on the same port (call `server.listen(port, host)` to start it).
 *
 * @remarks
 * Files are read from disk per request with `cache-control: no-store` (a TV never keeps a stale
 * build); a path outside `root` or a missing file answers 404. Every WebSocket client is greeted
 * with `{"type":"hello"}`; a client's close frame ends its socket. Not for the open internet — it
 * serves a build folder on the LAN during development.
 *
 * @param {{ root: string }} options - The served folder.
 * @returns {LiveReloadServer} The server.
 *
 * @example
 * const live = createLiveReloadServer({ root: DIST_DIR });
 * live.server.listen(5175, '0.0.0.0');
 * live.notify(reloadMessage('http://192.168.1.20:5175/index.html')); // → clients told
 */
export function createLiveReloadServer(options) {
  /** @type {Set<import('node:stream').Duplex>} */
  const sockets = new Set();
  const server = createServer((request, response) => {
    const file = resolveStaticFile(options.root, request.url ?? '/');
    if (file === null || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': contentTypeOf(file), 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  });
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    const upgrade = String(request.headers.upgrade ?? '').toLowerCase();
    if (typeof key !== 'string' || upgrade !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${websocketAccept(key)}\r\n\r\n`,
    );
    sockets.add(socket);
    socket.write(encodeTextFrame(JSON.stringify({ type: 'hello' })));
    socket.on('data', (data) => {
      if (readFrameOpcode(data) === 8) socket.end();
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  });
  return {
    server,
    clients: () => sockets.size,
    notify(message) {
      const frame = encodeTextFrame(message);
      for (const socket of sockets) socket.write(frame);
      return sockets.size;
    },
    close() {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      return new Promise((done) => server.close(() => done()));
    },
  };
}

/**
 * Command-line entry: serve, build, watch and notify (see the module docs). Runs until Ctrl+C
 * (SIGINT / SIGTERM close the watcher and the server, then exit 0).
 *
 * @returns {Promise<void>} Resolves once Vite's watcher runs (the server was started before it);
 *   the process keeps running on the watcher.
 * @throws {Error} Rejects when Vite cannot start watching (the caller prints it and exits 1). A
 *   failed rebuild only logs `Build failed:` and the watcher waits for the next change.
 */
async function main() {
  const host = process.env.SHMUP_LIVE_RELOAD_HOST || lanAddress();
  const port = Number(process.env.SHMUP_LIVE_RELOAD_PORT || DEFAULT_PORT);
  const pageUrl = `http://${host}:${port}/index.html`;
  // Read by vite.config.ts `liveReloadDefine()` when the dev build is configured.
  process.env.SHMUP_LIVE_RELOAD_URL = `ws://${host}:${port}`;

  const live = createLiveReloadServer({ root: DIST_DIR });
  live.server.listen(port, '0.0.0.0', () => {
    console.log(`Live reload: serving ${DIST_DIR} on ${pageUrl} (WebSocket ws://${host}:${port})`);
  });

  const { build } = await import('vite');
  let first = true;
  const watcher = await build({
    root: APP_DIR,
    configFile: join(APP_DIR, 'vite.config.ts'),
    mode: 'development',
    build: { watch: {} },
  });
  if (!('on' in watcher)) throw new Error('vite build did not start watching');
  watcher.on('event', (event) => {
    if (event.code === 'ERROR') console.error('Build failed:', event.error.message);
    if (event.code !== 'END') return;
    const count = live.notify(reloadMessage(pageUrl));
    if (first) {
      first = false;
      console.log(
        'First build ready. Package and install it once (tizen:package, tizen:install, tizen:run);\n' +
          'every saved change then rebuilds and the TV reloads.',
      );
    } else {
      console.log(`Rebuilt — reload sent to ${count} app(s).`);
    }
  });
  /** Stops watching and serving (Ctrl+C). */
  const stop = () => {
    void watcher.close();
    void live.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

/**
 * Whether this file is the script Node was started with (not imported by a test).
 *
 * @returns {boolean} `true` when run from the command line.
 */
function isCommandLineEntry() {
  const entry = process.argv[1];
  if (entry === undefined || !existsSync(entry)) return false;
  return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
}

if (isCommandLineEntry()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
