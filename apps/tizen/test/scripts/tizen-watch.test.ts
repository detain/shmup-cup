/**
 * The TV live-reload dev server (plan M2-17, `scripts/tizen-watch.mjs` — never run in CI; here only
 * its parts): the RFC 6455 handshake and text frames, a real server on a free port serving a
 * folder over HTTP (traversal refused) and pushing reload messages to a real WebSocket client
 * (Node's global `WebSocket`), the LAN address pick, and the Vite define that bakes the server's
 * URL into dev builds only.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  contentTypeOf,
  createLiveReloadServer,
  encodeTextFrame,
  lanAddress,
  readFrameOpcode,
  reloadMessage,
  resolveStaticFile,
  websocketAccept,
} from '../../scripts/tizen-watch.mjs';
import { parseLiveReloadMessage } from '../../src/live-reload/index.js';
import { liveReloadDefine } from '../../vite.config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('tizen-watch WebSocket frames', () => {
  it('answers the handshake per RFC 6455 (its own example)', () => {
    expect(websocketAccept('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });

  it('encodes short, 16-bit and 64-bit length text frames', () => {
    expect([...encodeTextFrame('hi')]).toEqual([0x81, 2, 0x68, 0x69]);
    const medium = encodeTextFrame('x'.repeat(300));
    expect([medium[0], medium[1], medium.readUInt16BE(2)]).toEqual([0x81, 126, 300]);
    expect(medium.length).toBe(304);
    const large = encodeTextFrame('y'.repeat(70000));
    expect([large[0], large[1], Number(large.readBigUInt64BE(2))]).toEqual([0x81, 127, 70000]);
    expect(readFrameOpcode(new Uint8Array([0x88, 0x80]))).toBe(8);
    expect(readFrameOpcode(new Uint8Array(0))).toBe(-1);
  });

  it('sends the reload message the app parses', () => {
    const page = 'http://10.0.0.5:5175/index.html';
    expect(parseLiveReloadMessage(reloadMessage(page))).toEqual({ type: 'reload', url: page });
  });
});

describe('tizen-watch static files', () => {
  it('maps request paths into the folder and refuses traversal', () => {
    const root = join(tmpdir(), 'dist');
    expect(resolveStaticFile(root, '/')).toBe(join(root, 'index.html'));
    expect(resolveStaticFile(root, '/assets/atlas/main.png?v=2')).toBe(
      join(root, 'assets', 'atlas', 'main.png'),
    );
    for (const bad of [
      '/..%2f..%2fetc%2fpasswd',
      '/%2e%2e/secret',
      '/a%5cb',
      '/%00',
      '/%E0%A4%A',
    ]) {
      expect(resolveStaticFile(root, bad), bad).toBeNull();
    }
    expect(contentTypeOf('app.js')).toMatch(/javascript/);
    expect(contentTypeOf('index.HTML')).toMatch(/html/);
    expect(contentTypeOf('main.png')).toBe('image/png');
    expect(contentTypeOf('x.bin')).toBe('application/octet-stream');
  });

  it('picks the first external IPv4 address', () => {
    expect(
      lanAddress({
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
        eth0: [
          { address: 'fe80::1', family: 'IPv6', internal: false } as never,
          { address: '192.168.1.20', family: 'IPv4', internal: false } as never,
        ],
      }),
    ).toBe('192.168.1.20');
    expect(lanAddress({})).toBe('127.0.0.1');
  });
});

describe('tizen-watch server', () => {
  it('serves the build over HTTP and pushes reloads to WebSocket clients', async () => {
    const root = mkdtempSync(join(tmpdir(), 'shmup-watch-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<canvas id="game"></canvas>');
    writeFileSync(join(root, 'app.js'), 'void 0;');
    const live = createLiveReloadServer({ root });
    await new Promise<void>((done) => live.server.listen(0, '127.0.0.1', () => done()));
    const { port } = live.server.address() as AddressInfo;
    try {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toMatch(/text\/html/);
      expect(page.headers.get('cache-control')).toBe('no-store');
      expect(await page.text()).toContain('canvas');
      expect((await fetch(`http://127.0.0.1:${port}/app.js`)).headers.get('content-type')).toMatch(
        /javascript/,
      );
      expect((await fetch(`http://127.0.0.1:${port}/missing.js`)).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${port}/assets`)).status).toBe(404);

      const messages: string[] = [];
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      socket.onmessage = (event) => {
        messages.push(String(event.data));
      };
      await vi.waitFor(() => expect(messages).toEqual(['{"type":"hello"}']));
      expect(live.clients()).toBe(1);
      const url = `http://127.0.0.1:${port}/index.html`;
      expect(live.notify(reloadMessage(url))).toBe(1);
      await vi.waitFor(() => expect(messages).toHaveLength(2));
      expect(parseLiveReloadMessage(messages[1])).toEqual({ type: 'reload', url });
      socket.close();
      await vi.waitFor(() => expect(live.clients()).toBe(0));
      expect(live.notify(reloadMessage(url))).toBe(0);
    } finally {
      await live.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('tizen vite config liveReloadDefine', () => {
  /**
   * Runs the plugin's `config` hook.
   *
   * @param mode - The Vite mode.
   * @returns The define it adds.
   */
  const define = (mode: string): unknown => {
    const plugin = liveReloadDefine() as Plugin & {
      config: (config: object, env: { command: string; mode: string }) => { define: object };
    };
    return plugin.config({}, { command: 'build', mode }).define;
  };

  it('bakes the dev server URL into dev builds only', () => {
    vi.stubEnv('SHMUP_LIVE_RELOAD_URL', 'ws://10.0.0.5:5175');
    expect(define('development')).toEqual({ __SHMUP_LIVE_RELOAD__: '"ws://10.0.0.5:5175"' });
    expect(define('production')).toEqual({ __SHMUP_LIVE_RELOAD__: '""' });
    expect(define('game-mode')).toEqual({ __SHMUP_LIVE_RELOAD__: '""' });
    vi.stubEnv('SHMUP_LIVE_RELOAD_URL', undefined);
    expect(define('development')).toEqual({ __SHMUP_LIVE_RELOAD__: '""' });
  });
});
