/**
 * The TV's dev live reload (plan M2-17, `live-reload`) with a fake WebSocket, location and timers:
 * the dev server's messages, a reload in place for a page it serves, the installed widget
 * navigating to the served build, reconnecting with a growing delay, and stop.
 */
import { describe, expect, it } from 'vitest';
import {
  LIVE_RELOAD_MAX_RETRY_MS,
  LIVE_RELOAD_RETRY_MS,
  connectLiveReload,
  moduleInfo,
  parseLiveReloadMessage,
  reloadTarget,
  type LiveReloadHost,
  type WebSocketLike,
} from '../../src/live-reload/index.js';

/** A fake socket the test drives. */
class FakeSocket implements WebSocketLike {
  static opened: FakeSocket[] = [];
  onmessage: WebSocketLike['onmessage'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }
  close(): void {
    this.closed = true;
  }
  /** Delivers a message. */
  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
  /** The server went away. */
  drop(): void {
    this.onerror?.({} as Event);
    this.onclose?.({} as CloseEvent);
  }
}

/**
 * A fake host at a page URL.
 *
 * @param href - `location.href`.
 * @returns The host and what it recorded.
 */
function fakeHost(href: string) {
  FakeSocket.opened = [];
  const timers: Array<{ callback: () => void; ms: number; cleared: boolean }> = [];
  const log: string[] = [];
  const host: LiveReloadHost = {
    WebSocket: FakeSocket,
    location: {
      href,
      reload: () => log.push('reload'),
      replace: (url) => log.push(`replace ${url}`),
    },
    setTimeout: (callback, ms) => {
      timers.push({ callback, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeout: (handle) => {
      const timer = timers[handle];
      if (timer !== undefined) timer.cleared = true;
    },
  };
  /** Runs the newest pending timer. */
  const fire = (): void => {
    const timer = [...timers].reverse().find((t) => !t.cleared);
    if (timer === undefined) throw new Error('no timer');
    timer.cleared = true;
    timer.callback();
  };
  return { host, timers, log, fire };
}

const PAGE = 'http://192.168.1.20:5175/index.html';

describe('tizen/live-reload', () => {
  it('is implemented', () => {
    expect(moduleInfo.name).toBe('live-reload');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('parses the dev server messages and ignores anything else', () => {
    expect(parseLiveReloadMessage(JSON.stringify({ type: 'reload', url: PAGE }))).toEqual({
      type: 'reload',
      url: PAGE,
    });
    expect(parseLiveReloadMessage('reload')).toEqual({ type: 'reload', url: null });
    expect(parseLiveReloadMessage('{"type":"hello"}')).toEqual({ type: 'hello', url: null });
    expect(parseLiveReloadMessage('{"type":"reload","url":"javascript:alert(1)"}')).toEqual({
      type: 'reload',
      url: null,
    });
    for (const other of ['', '{', '[]', 'null', '{"type":"boom"}', 42, null, new ArrayBuffer(1)]) {
      expect(parseLiveReloadMessage(other)).toBeNull();
    }
  });

  it('reloads a page the dev server serves in place, and sends the installed widget to it', () => {
    const message = { type: 'reload' as const, url: PAGE };
    expect(reloadTarget('http://192.168.1.20:5175/index.html?x=1', message)).toBeNull();
    expect(reloadTarget('HTTP://192.168.1.20:5175/', message)).toBeNull();
    expect(reloadTarget('file:///opt/usr/apps/ShmpCupGam/res/wgt/index.html', message)).toBe(PAGE);
    expect(reloadTarget('http://192.168.1.20:5176/index.html', message)).toBe(PAGE);
    expect(reloadTarget('file:///index.html', { type: 'reload', url: null })).toBeNull();
  });

  it('connects to the URL and reloads on each build', () => {
    const { host, log } = fakeHost('file:///opt/usr/apps/x/index.html');
    const connection = connectLiveReload({ url: 'ws://192.168.1.20:5175' }, host);
    expect(connection.attempts).toBe(1);
    const socket = FakeSocket.opened[0];
    expect(socket?.url).toBe('ws://192.168.1.20:5175');
    socket?.receive('{"type":"hello"}');
    expect(log).toEqual([]);
    socket?.receive(JSON.stringify({ type: 'reload', url: PAGE }));
    expect(log).toEqual([`replace ${PAGE}`]);
    socket?.receive('reload');
    expect(log).toEqual([`replace ${PAGE}`, 'reload']);
  });

  it('reconnects with a doubling delay while the server is down, and resets it once connected', () => {
    const { host, timers, fire } = fakeHost(PAGE);
    const connection = connectLiveReload({ url: 'ws://host:5175' }, host);
    FakeSocket.opened[0]?.drop();
    expect(timers.map((t) => t.ms)).toEqual([LIVE_RELOAD_RETRY_MS]);
    fire();
    expect(connection.attempts).toBe(2);
    FakeSocket.opened[1]?.drop();
    fire();
    FakeSocket.opened[2]?.drop();
    fire();
    FakeSocket.opened[3]?.drop();
    fire();
    FakeSocket.opened[4]?.drop();
    fire();
    FakeSocket.opened[5]?.drop();
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
    expect(LIVE_RELOAD_MAX_RETRY_MS).toBe(10000);
    fire();
    // Connected again: a message resets the delay.
    FakeSocket.opened[6]?.receive('{"type":"hello"}');
    FakeSocket.opened[6]?.drop();
    expect(timers[timers.length - 1]?.ms).toBe(LIVE_RELOAD_RETRY_MS);
  });

  it('retries when the WebSocket constructor throws (a bad URL)', () => {
    const { host, timers } = fakeHost(PAGE);
    const throwing = {
      ...host,
      WebSocket: class {
        constructor() {
          throw new SyntaxError('bad url');
        }
      } as unknown as LiveReloadHost['WebSocket'],
    };
    const connection = connectLiveReload({ url: 'nonsense' }, throwing);
    expect(connection.attempts).toBe(1);
    expect(timers).toHaveLength(1);
  });

  it('stops: closes the socket, cancels the retry and ignores later messages', () => {
    const first = fakeHost(PAGE);
    const connection = connectLiveReload({ url: 'ws://host:5175' }, first.host);
    const socket = FakeSocket.opened[0];
    connection.stop();
    connection.stop();
    expect(connection.stopped).toBe(true);
    expect(socket?.closed).toBe(true);
    socket?.receive('reload');
    expect(first.log).toEqual([]);

    const second = fakeHost(PAGE);
    const retrying = connectLiveReload({ url: 'ws://host:5175' }, second.host);
    FakeSocket.opened[0]?.drop();
    retrying.stop();
    expect(second.timers[0]?.cleared).toBe(true);
    expect(retrying.attempts).toBe(1);
  });
});
