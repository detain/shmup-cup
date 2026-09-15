/**
 * # live-reload — dev-only reload-on-change for the TV
 *
 * **Responsibility.** Shortens the TV iteration loop (Samsung's HMR-over-WebSocket approach cuts
 * ~70 s → ~25 s): a development build made by `pnpm --filter @shmup/tizen tizen:watch`
 * (`scripts/tizen-watch.mjs` — a Node dev server on the desktop, never run in CI) carries the
 * server's WebSocket URL (`__SHMUP_LIVE_RELOAD__`), connects to it from the TV and reloads when
 * the server announces a new build:
 *
 * - The server serves the rebuilt `dist/` over HTTP and sends
 *   `{"type":"reload","url":"http://<desktop>:<port>/index.html"}` after every build. A page
 *   already served by it reloads in place; the installed widget (loaded from `file://`) navigates
 *   to that URL instead — so the TV runs the new build without repackaging or reinstalling the
 *   `.wgt` (package and install the watch's first build once).
 * - The connection is retried with a growing delay ({@link LIVE_RELOAD_RETRY_MS}, doubling up to
 *   {@link LIVE_RELOAD_MAX_RETRY_MS}) while the server is down; nothing is shown to the player.
 * - Release builds never contain it: `main.ts` calls {@link connectLiveReload} only under
 *   `__SHMUP_DEV__` with a non-empty URL, so the release bundle folds the branch away.
 *
 * Browser APIs are injected ({@link LiveReloadHost}: the WebSocket constructor, the location and
 * the timers) so the tests drive it with fakes.
 *
 * **Implements.**
 * - shmup_feat.md §24 — [P1] live reload to real TV
 * - shmup_tech.md §2.6 — HMR-to-TV over WebSocket
 *
 * **Public API.** {@link connectLiveReload}, {@link LiveReloadOptions}, {@link LiveReloadHost},
 * {@link LiveReloadConnection}, {@link LiveReloadMessage}, {@link parseLiveReloadMessage},
 * {@link reloadTarget}, {@link WebSocketLike}, {@link LIVE_RELOAD_RETRY_MS},
 * {@link LIVE_RELOAD_MAX_RETRY_MS}.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'live-reload',
  status: 'implemented',
  specRefs: ['shmup_feat.md §24', 'shmup_tech.md §2.6'],
});

/** First reconnect delay after the connection closed, in ms. */
export const LIVE_RELOAD_RETRY_MS = 1000;

/** Longest reconnect delay, in ms. */
export const LIVE_RELOAD_MAX_RETRY_MS = 10000;

/** Connection settings baked into dev builds. */
export interface LiveReloadOptions {
  /** The dev server's WebSocket, e.g. `ws://192.168.1.20:5175` (`__SHMUP_LIVE_RELOAD__`). */
  readonly url: string;
}

/** A message from the dev server. */
export interface LiveReloadMessage {
  /** `'reload'` — a new build is ready; `'hello'` — sent on connect (ignored). */
  readonly type: 'reload' | 'hello';
  /** The page serving the new build (`http://…/index.html`), or `null`: reload in place. */
  readonly url: string | null;
}

/** The parts of a `WebSocket` used here. */
export interface WebSocketLike {
  /** Called with each message (only `data` is read). */
  onmessage: ((event: MessageEvent) => void) | null;
  /** Called when the connection closes (or never opened). */
  onclose: ((event: CloseEvent) => void) | null;
  /** Called on an error (a close follows). */
  onerror: ((event: Event) => void) | null;
  /** Closes the connection. */
  close(): void;
}

/** The browser services the connection uses (a `Window` satisfies it). */
export interface LiveReloadHost {
  /** The `WebSocket` constructor. */
  readonly WebSocket: new (url: string) => WebSocketLike;
  /** The page's location. */
  readonly location: {
    /** The current URL. */
    readonly href: string;
    /** Reloads the page. */
    reload(): void;
    /**
     * Navigates to another page, replacing this one in the history.
     *
     * @param url - The page.
     */
    replace(url: string): void;
  };
  /**
   * Schedules a callback.
   *
   * @param callback - The callback.
   * @param ms - Delay.
   * @returns A handle.
   */
  setTimeout(callback: () => void, ms: number): number;
  /**
   * Cancels a scheduled callback.
   *
   * @param handle - The handle.
   */
  clearTimeout(handle: number): void;
}

/** A running live-reload connection. */
export interface LiveReloadConnection {
  /** Connection attempts so far (the first included). */
  readonly attempts: number;
  /** Whether {@link LiveReloadConnection.stop} ran. */
  readonly stopped: boolean;
  /** Closes the connection and stops reconnecting (idempotent). */
  stop(): void;
}

/**
 * Parses a dev-server message.
 *
 * @param data - The WebSocket message data (a JSON string; the bare text `reload` works too).
 * @returns The message, or `null` for anything else.
 *
 * @example
 * ```ts
 * parseLiveReloadMessage('{"type":"reload","url":"http://192.168.1.20:5175/index.html"}');
 * // → { type: 'reload', url: 'http://192.168.1.20:5175/index.html' }
 * ```
 */
export function parseLiveReloadMessage(data: unknown): LiveReloadMessage | null {
  if (typeof data !== 'string') return null;
  if (data === 'reload') return { type: 'reload', url: null };
  let json: unknown;
  try {
    json = JSON.parse(data) as unknown;
  } catch (_error) {
    return null;
  }
  if (json === null || typeof json !== 'object') return null;
  const { type, url } = json as { type?: unknown; url?: unknown };
  if (type !== 'reload' && type !== 'hello') return null;
  const page = typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
  return { type, url: page };
}

/**
 * The origin (`scheme://host:port`) of an http(s) URL, or `null`.
 *
 * @param url - The URL.
 * @returns The origin.
 */
function originOf(url: string): string | null {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return match === null ? null : match[1].toLowerCase();
}

/**
 * Where a reload goes: `null` to reload in place (no URL, or this page is already served by the
 * dev server), else the dev server's page to navigate to.
 *
 * @param current - `location.href`.
 * @param message - The reload message.
 * @returns The page to open, or `null`.
 */
export function reloadTarget(current: string, message: LiveReloadMessage): string | null {
  if (message.url === null) return null;
  return originOf(current) === originOf(message.url) ? null : message.url;
}

/**
 * Connects to the dev server and reloads on each new build (see the module docs).
 *
 * @remarks
 * Dev builds only (`main.ts`). A failing `WebSocket` constructor (a bad URL) counts as a closed
 * connection and is retried like one.
 *
 * @param options - The server URL.
 * @param host - The browser services (normally `window`).
 * @returns The connection.
 *
 * @example
 * ```ts
 * if (__SHMUP_DEV__ && __SHMUP_LIVE_RELOAD__ !== '') {
 *   connectLiveReload({ url: __SHMUP_LIVE_RELOAD__ }, window);
 * }
 * ```
 */
export function connectLiveReload(
  options: LiveReloadOptions,
  host: LiveReloadHost,
): LiveReloadConnection {
  const state = { attempts: 0, stopped: false, delay: LIVE_RELOAD_RETRY_MS, timer: -1 };
  let socket: WebSocketLike | null = null;

  /** Schedules the next attempt with the current delay, then doubles it. */
  const retry = (): void => {
    if (state.stopped || state.timer >= 0) return;
    state.timer = host.setTimeout(() => {
      state.timer = -1;
      open();
    }, state.delay);
    state.delay = Math.min(state.delay * 2, LIVE_RELOAD_MAX_RETRY_MS);
  };

  /**
   * Handles one message.
   *
   * @param data - The message data.
   */
  const onMessage = (data: unknown): void => {
    const message = parseLiveReloadMessage(data);
    if (message === null) return;
    // Connected: the next outage retries quickly again.
    state.delay = LIVE_RELOAD_RETRY_MS;
    if (message.type !== 'reload') return;
    const target = reloadTarget(host.location.href, message);
    if (target === null) host.location.reload();
    else host.location.replace(target);
  };

  /** Opens a connection. */
  const open = (): void => {
    if (state.stopped) return;
    state.attempts++;
    let next: WebSocketLike;
    try {
      next = new host.WebSocket(options.url);
    } catch (_error) {
      retry();
      return;
    }
    socket = next;
    next.onmessage = (event) => onMessage(event.data);
    next.onerror = () => {};
    next.onclose = () => {
      if (socket === next) socket = null;
      retry();
    };
  };

  open();
  return {
    get attempts() {
      return state.attempts;
    },
    get stopped() {
      return state.stopped;
    },
    stop() {
      if (state.stopped) return;
      state.stopped = true;
      if (state.timer >= 0) host.clearTimeout(state.timer);
      state.timer = -1;
      const current = socket;
      socket = null;
      if (current !== null) {
        current.onclose = null;
        current.onmessage = null;
        current.close();
      }
    },
  };
}
