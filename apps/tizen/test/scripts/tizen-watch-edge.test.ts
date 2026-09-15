/**
 * Edge cases of the TV live-reload dev server (plan M2-17, `scripts/tizen-watch.mjs` — never run in
 * CI; here only its parts): frame lengths at the 7-bit / 16-bit / 64-bit boundaries and in UTF-8
 * bytes, a folder's `index.html`, every content type, the LAN pick on Node's numeric families, and
 * a real server on a free port: a bad upgrade is refused, a raw `..` request cannot leave the
 * folder, several clients all get the reload, a client's close frame ends its socket, and `close`
 * drops every client.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PORT,
  WEBSOCKET_GUID,
  contentTypeOf,
  createLiveReloadServer,
  encodeTextFrame,
  lanAddress,
  readFrameOpcode,
  reloadMessage,
  resolveStaticFile,
  websocketAccept,
} from '../../scripts/tizen-watch.mjs';

describe('tizen-watch frames and files (edges)', () => {
  it('names its port and the RFC 6455 GUID', () => {
    expect(DEFAULT_PORT).toBe(5175);
    expect(WEBSOCKET_GUID).toBe('258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
    expect(websocketAccept('x')).toBe(websocketAccept('x'));
    expect(websocketAccept('x')).not.toBe(websocketAccept('y'));
  });

  it('switches the length encoding at 126 and 65,536 bytes, counting UTF-8 bytes', () => {
    const at = (length: number) => encodeTextFrame('a'.repeat(length));
    expect([...at(125).subarray(0, 2)]).toEqual([0x81, 125]);
    expect(at(125).length).toBe(127);
    expect([at(126)[1], at(126).readUInt16BE(2)]).toEqual([126, 126]);
    expect([at(65535)[1], at(65535).readUInt16BE(2)]).toEqual([126, 65535]);
    expect([at(65536)[1], Number(at(65536).readBigUInt64BE(2))]).toEqual([127, 65536]);
    expect(at(65536).length).toBe(65546);
    // 'é' is two bytes: 63 of them make a 126-byte payload.
    const accented = encodeTextFrame('é'.repeat(63));
    expect([accented[1], accented.readUInt16BE(2)]).toEqual([126, 126]);
    expect(encodeTextFrame('')).toEqual(Buffer.from([0x81, 0]));
  });

  it('reads the opcode from the low four bits of the first byte', () => {
    expect(readFrameOpcode(new Uint8Array([0x81]))).toBe(1);
    expect(readFrameOpcode(new Uint8Array([0x89, 0]))).toBe(9);
    expect(readFrameOpcode(new Uint8Array([0x08]))).toBe(8);
    expect(readFrameOpcode(new Uint8Array([0xf2]))).toBe(2);
  });

  it('serves a folder index, drops the fragment and refuses an absolute or empty escape', () => {
    const root = join(tmpdir(), 'dist');
    expect(resolveStaticFile(root, '/assets/')).toBe(join(root, 'assets', 'index.html'));
    expect(resolveStaticFile(root, '')).toBe(join(root, 'index.html'));
    expect(resolveStaticFile(root, '/app.js#top')).toBe(join(root, 'app.js'));
    expect(resolveStaticFile(root, '/a%20b.png')).toBe(join(root, 'a b.png'));
    expect(resolveStaticFile(root, '/../dist-other/x')).toBeNull();
    expect(resolveStaticFile(root, '/assets/../../x')).toBeNull();
    // A `..` that stays inside the folder is fine.
    expect(resolveStaticFile(root, '/assets/../app.js')).toBe(join(root, 'app.js'));
  });

  it('types every file a TV build holds', () => {
    expect(contentTypeOf('content.json')).toBe('application/json');
    expect(contentTypeOf('config.xml')).toBe('application/xml');
    expect(contentTypeOf('theme.ogg')).toBe('audio/ogg');
    expect(contentTypeOf('boom.WAV')).toBe('audio/wav');
    expect(contentTypeOf('Makefile')).toBe('application/octet-stream');
  });

  it("takes the first external IPv4 address by interface name, Node's numeric family included", () => {
    expect(
      lanAddress({
        wlan0: [{ address: '10.0.0.9', family: 4, internal: false } as never],
        eth0: [{ address: '10.0.0.5', family: 4, internal: false } as never],
      }),
    ).toBe('10.0.0.5');
    expect(
      lanAddress({
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
        eth0: [{ address: 'fe80::2', family: 'IPv6', internal: false } as never],
      }),
    ).toBe('127.0.0.1');
    expect(lanAddress({ eth0: undefined })).toBe('127.0.0.1');
    expect(typeof lanAddress()).toBe('string');
  });
});

describe('tizen-watch server (edges)', () => {
  let root = '';
  let live: ReturnType<typeof createLiveReloadServer>;
  let port = 0;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'shmup-watch-edge-'));
    const dist = join(root, 'dist');
    mkdirSync(dist);
    writeFileSync(join(dist, 'index.html'), '<canvas id="game"></canvas>');
    writeFileSync(join(root, 'secret.txt'), 'not served');
    live = createLiveReloadServer({ root: dist });
    await new Promise<void>((done) => live.server.listen(0, '127.0.0.1', () => done()));
    port = (live.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await live.close();
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Sends a raw HTTP request (the path is not normalised the way `fetch` does).
   *
   * @param path - The request path.
   * @param headers - Extra headers.
   * @returns The status and the body.
   */
  function raw(path: string, headers: Record<string, string> = {}) {
    return new Promise<{ status: number; body: string }>((done, fail) => {
      const req = request({ host: '127.0.0.1', port, path, headers }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => done({ status: response.statusCode ?? 0, body }));
      });
      req.on('error', fail);
      req.end();
    });
  }

  it('never serves a file outside the folder, even for a raw `..` path', async () => {
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt']) {
      const response = await raw(path);
      expect(response.status, path).toBe(404);
      expect(response.body).not.toContain('not served');
    }
    expect((await raw('/')).status).toBe(200);
  });

  it('answers an upgrade without a key (or not to websocket) with 400', async () => {
    /**
     * Sends a raw upgrade request and reads the first line of the answer.
     *
     * @param lines - The request's header lines.
     * @returns The status line.
     */
    const upgrade = (lines: string[]) =>
      new Promise<string>((done, fail) => {
        const socket = connect(port, '127.0.0.1', () => {
          socket.write(`GET / HTTP/1.1\r\nHost: x\r\n${lines.join('\r\n')}\r\n\r\n`);
        });
        let text = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
          text += chunk;
        });
        socket.on('end', () => done(text.split('\r\n')[0] ?? ''));
        socket.on('error', fail);
      });
    expect(await upgrade(['Connection: Upgrade', 'Upgrade: websocket'])).toBe(
      'HTTP/1.1 400 Bad Request',
    );
    expect(await upgrade(['Connection: Upgrade', 'Upgrade: h2c', 'Sec-WebSocket-Key: abc'])).toBe(
      'HTTP/1.1 400 Bad Request',
    );
    expect(live.clients()).toBe(0);
  });

  it('pushes each reload to every client, and drops a client that sends a close frame', async () => {
    const received: string[][] = [[], []];
    const sockets = received.map((messages) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      socket.onmessage = (event) => {
        messages.push(String(event.data));
      };
      return socket;
    });
    await vi.waitFor(() => expect(live.clients()).toBe(2));
    await vi.waitFor(() => expect(received.map((m) => m.length)).toEqual([1, 1]));
    const message = reloadMessage(`http://127.0.0.1:${port}/index.html`);
    expect(live.notify(message)).toBe(2);
    await vi.waitFor(() => expect(received.map((m) => m[1])).toEqual([message, message]));
    // The first client says goodbye with a close frame: the server ends its socket.
    sockets[0]?.close();
    await vi.waitFor(() => expect(live.clients()).toBe(1));
    expect(live.notify(message)).toBe(1);
    await vi.waitFor(() => expect(received[1]).toHaveLength(3));
    expect(received[0]).toHaveLength(2);
    sockets[1]?.close();
  });

  it('drops every client on close', async () => {
    let closed = false;
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.onclose = () => {
      closed = true;
    };
    await vi.waitFor(() => expect(live.clients()).toBe(1));
    await live.close();
    expect(live.clients()).toBe(0);
    await vi.waitFor(() => expect(closed).toBe(true));
    // Closing again (afterEach) must not throw: restart a server for it.
    live = createLiveReloadServer({ root });
    await new Promise<void>((done) => live.server.listen(0, '127.0.0.1', () => done()));
  });
});
