/**
 * Edge cases of the TV's dev live reload (plan M2-17, `live-reload`) with a fake WebSocket, location
 * and timers: repeated close events schedule one retry, a message with a URL on the page's own
 * origin reloads in place, `hello` never navigates, non-text frames are ignored, and stop cancels a
 * retry whose socket never opened.
 */
import { describe, expect, it } from 'vitest';
import {
  LIVE_RELOAD_RETRY_MS,
  connectLiveReload,
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
  closed = 0;
  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }
  close(): void {
    this.closed++;
  }
  /**
   * Delivers a message.
   *
   * @param data - The message data.
   */
  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
  /** Fires the close event. */
  fireClose(): void {
    this.onclose?.({} as CloseEvent);
  }
}

/**
 * A fake host at a page URL.
 *
 * @param href - `location.href`.
 * @param WebSocket - The socket constructor (default {@link FakeSocket}).
 * @returns The host and what it recorded.
 */
function fakeHost(href: string, WebSocket: LiveReloadHost['WebSocket'] = FakeSocket) {
  FakeSocket.opened = [];
  const timers: Array<{ callback: () => void; ms: number; cleared: boolean }> = [];
  const log: string[] = [];
  const host: LiveReloadHost = {
    WebSocket,
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
  return { host, timers, log };
}

const SERVED = 'http://192.168.1.20:5175/index.html';

describe('tizen/live-reload edges', () => {
  it('parses only http(s) page URLs and string data', () => {
    expect(parseLiveReloadMessage('{"type":"reload","url":"https://h:1/i.html"}')).toEqual({
      type: 'reload',
      url: 'https://h:1/i.html',
    });
    for (const url of ['ftp://h/i.html', 'file:///i.html', '//h/i.html', 42, null, {}]) {
      expect(parseLiveReloadMessage(JSON.stringify({ type: 'reload', url }))).toEqual({
        type: 'reload',
        url: null,
      });
    }
    expect(parseLiveReloadMessage(' reload')).toBeNull();
    expect(parseLiveReloadMessage('"reload"')).toBeNull();
    expect(parseLiveReloadMessage('{"type":"RELOAD"}')).toBeNull();
  });

  it('compares origins with their port and scheme', () => {
    const message = { type: 'reload' as const, url: SERVED };
    expect(reloadTarget('https://192.168.1.20:5175/index.html', message)).toBe(SERVED);
    expect(reloadTarget('http://192.168.1.20/index.html', message)).toBe(SERVED);
    expect(reloadTarget('http://192.168.1.20:5175', message)).toBeNull();
    expect(reloadTarget('', message)).toBe(SERVED);
  });

  it('schedules one retry for repeated close events of one socket', () => {
    const { host, timers } = fakeHost(SERVED);
    connectLiveReload({ url: 'ws://h:5175' }, host);
    const socket = FakeSocket.opened[0];
    socket?.fireClose();
    socket?.fireClose();
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(LIVE_RELOAD_RETRY_MS);
  });

  it('reloads in place for a URL on its own origin and never navigates on hello', () => {
    const { host, log } = fakeHost(SERVED);
    connectLiveReload({ url: 'ws://192.168.1.20:5175' }, host);
    const socket = FakeSocket.opened[0];
    socket?.receive(JSON.stringify({ type: 'hello', url: 'http://elsewhere:1/index.html' }));
    expect(log).toEqual([]);
    socket?.receive(JSON.stringify({ type: 'reload', url: SERVED }));
    expect(log).toEqual(['reload']);
  });

  it('ignores binary frames and junk without resetting anything', () => {
    const { host, log, timers } = fakeHost(SERVED);
    connectLiveReload({ url: 'ws://h:5175' }, host);
    const socket = FakeSocket.opened[0];
    socket?.fireClose();
    timers[0]?.callback();
    // The second attempt connected but only sends junk: the delay keeps growing.
    const second = FakeSocket.opened[1];
    second?.receive(new ArrayBuffer(4));
    second?.receive('not json');
    second?.fireClose();
    expect(timers.map((timer) => timer.ms)).toEqual([
      LIVE_RELOAD_RETRY_MS,
      LIVE_RELOAD_RETRY_MS * 2,
    ]);
    expect(log).toEqual([]);
  });

  it('stops a connection whose socket never opened: the retry is cancelled, nothing is closed', () => {
    const throwing = class {
      constructor() {
        throw new SyntaxError('bad url');
      }
    } as unknown as LiveReloadHost['WebSocket'];
    const { host, timers } = fakeHost(SERVED, throwing);
    const connection = connectLiveReload({ url: '::' }, host);
    expect(timers).toHaveLength(1);
    connection.stop();
    expect(timers[0]?.cleared).toBe(true);
    expect(connection.stopped).toBe(true);
    // A late timer callback (already queued) opens nothing.
    timers[0]?.callback();
    expect(connection.attempts).toBe(1);
  });

  it('closes the live socket once on stop and ignores its later close event', () => {
    const { host, timers } = fakeHost(SERVED);
    const connection = connectLiveReload({ url: 'ws://h:5175' }, host);
    const socket = FakeSocket.opened[0];
    connection.stop();
    connection.stop();
    expect(socket?.closed).toBe(1);
    expect(socket?.onclose).toBeNull();
    expect(socket?.onmessage).toBeNull();
    expect(timers).toEqual([]);
  });
});
