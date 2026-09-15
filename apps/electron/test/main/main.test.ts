/**
 * Tests the Electron main process (src/main/main.ts) against a mocked `electron` module,
 * so it runs in plain Node without the Electron binary (CI sets
 * ELECTRON_SKIP_BINARY_DOWNLOAD=1). Each test imports a fresh copy because main.ts does
 * its work at import time and reads its environment variables then. The user-data folder is a
 * temporary directory, so the file saves and the window settings (M2-17) are real files. The fake
 * window emits only what its tests trigger — like Linux, never `moved` (M2-17 review: the position
 * is saved from `move`, once it settles, and on `close`).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/ipc.js';
import { WINDOW_MOVE_SAVE_MS } from '../../src/main/window-state.js';

type Handler = (request: { url: string }) => Response | Promise<Response>;
type IpcListener = (event: unknown, ...args: unknown[]) => unknown;
type Listener = (...args: unknown[]) => void;

const electron = vi.hoisted(() => {
  const state = {
    privileged: [] as unknown[],
    handlers: new Map<string, Handler>(),
    ipc: new Map<string, IpcListener>(),
    invokeHandlers: new Map<string, IpcListener>(),
    appEvents: new Map<string, Listener>(),
    windows: [] as Array<{
      options: { fullscreen?: boolean; width?: number; height?: number; x?: number; y?: number };
      url: string | null;
      shown: boolean;
      fullScreen: boolean;
      minimized: boolean;
      contentSize: [number, number] | null;
      position: [number, number];
      once: Map<string, Listener>;
      events: Map<string, Listener>;
      contents: Map<string, Listener>;
      openHandler: (() => unknown) | null;
    }>,
    quits: 0,
    fetched: [] as string[],
    userData: '',
  };
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  class BrowserWindow {
    static getAllWindows(): unknown[] {
      return state.windows;
    }
    private readonly record: (typeof state.windows)[number];
    readonly webContents: {
      on: (event: string, listener: Listener) => void;
      setWindowOpenHandler: (handler: () => unknown) => void;
    };
    constructor(options: (typeof state.windows)[number]['options']) {
      const record: (typeof state.windows)[number] = {
        options,
        url: null,
        shown: false,
        fullScreen: options.fullscreen === true,
        minimized: false,
        contentSize: null,
        position: [options.x ?? 100, options.y ?? 100],
        once: new Map(),
        events: new Map(),
        contents: new Map(),
        openHandler: null,
      };
      this.record = record;
      this.webContents = {
        on: (event, listener) => {
          record.contents.set(event, listener);
        },
        setWindowOpenHandler: (handler) => {
          record.openHandler = handler;
        },
      };
      state.windows.push(record);
    }
    once(event: string, listener: Listener): void {
      this.record.once.set(event, listener);
    }
    on(event: string, listener: Listener): void {
      this.record.events.set(event, listener);
    }
    show(): void {
      this.record.shown = true;
    }
    loadURL(url: string): Promise<void> {
      this.record.url = url;
      return Promise.resolve();
    }
    isFullScreen(): boolean {
      return this.record.fullScreen;
    }
    isMinimized(): boolean {
      return this.record.minimized;
    }
    isDestroyed(): boolean {
      return false;
    }
    setFullScreen(on: boolean): void {
      this.record.fullScreen = on;
      this.record.events.get(on ? 'enter-full-screen' : 'leave-full-screen')?.();
    }
    getBounds() {
      return { x: this.record.position[0], y: this.record.position[1], width: 1, height: 1 };
    }
    getPosition(): [number, number] {
      return this.record.position;
    }
    setContentSize(width: number, height: number): void {
      this.record.contentSize = [width, height];
    }
  }
  const module = {
    app: {
      whenReady: () => Promise.resolve(),
      quit: () => {
        state.quits++;
      },
      on: (event: string, listener: Listener) => {
        state.appEvents.set(event, listener);
      },
      getPath: (name: string) => {
        if (name !== 'userData') throw new Error(`unexpected path ${name}`);
        return state.userData;
      },
    },
    BrowserWindow,
    ipcMain: {
      on: (channel: string, listener: IpcListener) => {
        state.ipc.set(channel, listener);
      },
      removeListener: () => undefined,
      handle: (channel: string, listener: IpcListener) => {
        state.invokeHandlers.set(channel, listener);
      },
      removeHandler: () => undefined,
    },
    net: {
      fetch: (url: string) => {
        state.fetched.push(url);
        return Promise.resolve(new Response('file body'));
      },
    },
    protocol: {
      registerSchemesAsPrivileged: (schemes: unknown[]) => {
        state.privileged.push(...schemes);
      },
      handle: (scheme: string, handler: Handler) => {
        state.handlers.set(scheme, handler);
      },
    },
    screen: {
      getAllDisplays: () => [{ workArea }],
      getPrimaryDisplay: () => ({ workArea }),
      getDisplayMatching: () => ({ workArea }),
    },
  };
  return { state, module };
});

vi.mock('electron', () => ({ ...electron.module, default: electron.module }));

/** The game page's IPC event. */
const GAME_EVENT = { senderFrame: { url: 'app://game/index.html' } };

/** Imports a fresh main.ts and waits until its `app.whenReady()` chain opened the window. */
async function startMain(): Promise<void> {
  vi.resetModules();
  await import('../../src/main/main.js');
  await vi.waitFor(() => {
    if (electron.state.windows.length === 0) throw new Error('no window yet');
  });
}

/**
 * Reads the stored window settings.
 *
 * @returns The parsed `window.json`.
 */
function storedWindow(): unknown {
  return JSON.parse(readFileSync(join(electron.state.userData, 'saves', 'window.json'), 'utf8'));
}

/**
 * Presses a key in the game window (its `before-input-event`).
 *
 * @param input - The key.
 * @returns Whether the default was prevented (a shortcut).
 */
function press(input: Record<string, unknown>): boolean {
  let prevented = false;
  const event = { preventDefault: () => (prevented = true) };
  electron.state.windows[0]?.contents.get('before-input-event')?.(event, {
    type: 'keyDown',
    alt: false,
    control: false,
    meta: false,
    ...input,
  });
  return prevented;
}

beforeEach(() => {
  const s = electron.state;
  s.privileged.length = 0;
  s.handlers.clear();
  s.ipc.clear();
  s.invokeHandlers.clear();
  s.appEvents.clear();
  s.windows.length = 0;
  s.quits = 0;
  s.fetched.length = 0;
  s.userData = mkdtempSync(join(tmpdir(), 'shmup-electron-'));
  vi.stubEnv('SHMUP_DEV_URL', undefined);
  vi.stubEnv('SHMUP_RENDERER_DIR', undefined);
  vi.stubEnv('SHMUP_FULLSCREEN', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(electron.state.userData, { recursive: true, force: true });
});

describe('electron/main/main', () => {
  it('registers app:// as a privileged, fetch-capable standard scheme before the app is ready', async () => {
    await startMain();
    expect(electron.state.privileged).toEqual([
      {
        scheme: 'app',
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
      },
    ]);
  });

  it('opens one hidden, secure game window on app://game/index.html and shows it when ready', async () => {
    await startMain();
    expect(electron.state.windows).toHaveLength(1);
    const win = electron.state.windows[0];
    expect(win?.url).toBe('app://game/index.html');
    expect(win?.options).toMatchObject({
      show: false,
      fullscreen: false,
      width: 1152,
      height: 648,
      useContentSize: true,
      center: true,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    const preload = (win?.options as { webPreferences: { preload: string } }).webPreferences
      .preload;
    expect(preload.endsWith(join('preload', 'preload.cjs'))).toBe(true);
    expect(win?.shown).toBe(false);
    win?.once.get('ready-to-show')?.();
    expect(win?.shown).toBe(true);
  });

  it('loads the Vite dev server instead when SHMUP_DEV_URL is set, and honours SHMUP_FULLSCREEN=1', async () => {
    vi.stubEnv('SHMUP_DEV_URL', 'http://localhost:5173');
    vi.stubEnv('SHMUP_FULLSCREEN', '1');
    await startMain();
    const win = electron.state.windows[0];
    expect(win?.url).toBe('http://localhost:5173');
    expect(win?.options).toMatchObject({ fullscreen: true });
  });

  it('serves files from the renderer directory through app:// and 404s everything else', async () => {
    const rendererDir = resolve('/srv/shmup/renderer');
    vi.stubEnv('SHMUP_RENDERER_DIR', rendererDir);
    await startMain();
    const handler = electron.state.handlers.get('app');
    expect(handler).toBeDefined();

    const ok = await handler?.({ url: 'app://game/assets/app.js' });
    expect(await ok?.text()).toBe('file body');
    expect(electron.state.fetched).toEqual([
      pathToFileURL(join(rendererDir, 'assets', 'app.js')).toString(),
    ]);

    for (const url of ['app://game/..%2f..%2fetc%2fpasswd', 'app://other/index.html']) {
      const response = await handler?.({ url });
      expect(response?.status).toBe(404);
    }
    expect(electron.state.fetched).toHaveLength(1);
  });

  it('quits on the game page quit request and when every window is closed', async () => {
    await startMain();
    electron.state.ipc.get(IPC_CHANNELS.quit)?.({ senderFrame: { url: 'https://evil.test/' } });
    expect(electron.state.quits).toBe(0);
    electron.state.ipc.get(IPC_CHANNELS.quit)?.(GAME_EVENT);
    expect(electron.state.quits).toBe(1);
    electron.state.appEvents.get('window-all-closed')?.();
    expect(electron.state.quits).toBe(2);
  });

  it('re-creates the window on activate only when none is open (macOS dock click)', async () => {
    await startMain();
    const activate = electron.state.appEvents.get('activate');
    activate?.();
    expect(electron.state.windows).toHaveLength(1);
    electron.state.windows.length = 0;
    activate?.();
    expect(electron.state.windows).toHaveLength(1);
  });

  it('stores the renderer saves as JSON files in <userData>/saves through the storage IPC (M2-17)', async () => {
    await startMain();
    const set = electron.state.invokeHandlers.get(IPC_CHANNELS.storageSet);
    const get = electron.state.invokeHandlers.get(IPC_CHANNELS.storageGet);
    await set?.(GAME_EVENT, 'save.v1', '{"version":2}');
    expect(readFileSync(join(electron.state.userData, 'saves', 'save.v1.json'), 'utf8')).toBe(
      '{"version":2}',
    );
    expect(await get?.(GAME_EVENT, 'save.v1')).toBe('{"version":2}');
    expect(() => get?.({ senderFrame: { url: 'https://evil.test/' } }, 'save.v1')).toThrow(
      /untrusted/,
    );
  });

  it('restores the remembered window settings (scale, position, fullscreen)', async () => {
    const saves = join(electron.state.userData, 'saves');
    mkdirSync(saves, { recursive: true });
    writeFileSync(
      join(saves, 'window.json'),
      '{"version":1,"fullscreen":true,"scale":4,"x":200,"y":120}',
    );
    await startMain();
    expect(electron.state.windows[0]?.options).toMatchObject({
      fullscreen: true,
      width: 1536,
      height: 864,
      x: 200,
      y: 120,
    });
    expect(electron.state.windows[0]?.options).not.toHaveProperty('center');
  });

  it('lowers a remembered scale that no longer fits and forgets an off-screen position', async () => {
    const saves = join(electron.state.userData, 'saves');
    mkdirSync(saves, { recursive: true });
    writeFileSync(join(saves, 'window.json'), '{"version":1,"scale":9,"x":5000,"y":0}');
    await startMain();
    // 1920×1040 work area: ×4 = 1536×864 is the largest that fits.
    expect(electron.state.windows[0]?.options).toMatchObject({ width: 1536, center: true });
  });

  it('toggles fullscreen with F11 / Alt+Enter and steps the scale with Ctrl+= / Ctrl+- / Ctrl+0, remembering both', async () => {
    await startMain();
    const win = electron.state.windows[0];
    expect(press({ key: 'z' })).toBe(false);
    expect(press({ key: '=', control: true })).toBe(true);
    expect(win?.contentSize).toEqual([1536, 864]);
    await vi.waitFor(() => expect(storedWindow()).toMatchObject({ scale: 4 }));
    // ×5 would not fit the 1040-px-high work area: nothing changes.
    expect(press({ key: '=', control: true })).toBe(true);
    expect(win?.contentSize).toEqual([1536, 864]);
    expect(press({ key: '-', control: true })).toBe(true);
    expect(win?.contentSize).toEqual([1152, 648]);
    expect(press({ key: '-', control: true })).toBe(true);
    expect(press({ key: '0', control: true })).toBe(true);
    expect(win?.contentSize).toEqual([1152, 648]);
    expect(press({ key: 'F11' })).toBe(true);
    expect(win?.fullScreen).toBe(true);
    await vi.waitFor(() => expect(storedWindow()).toMatchObject({ fullscreen: true, scale: 3 }));
    // No scale changes in fullscreen.
    expect(press({ key: '=', control: true })).toBe(true);
    expect(win?.contentSize).toEqual([1152, 648]);
    expect(press({ key: 'Enter', alt: true })).toBe(true);
    expect(win?.fullScreen).toBe(false);
    await vi.waitFor(() => expect(storedWindow()).toMatchObject({ fullscreen: false }));
  });

  it('remembers the position once a move settles, from `move` alone (Linux emits no `moved`)', async () => {
    await startMain();
    const win = electron.state.windows[0];
    if (win === undefined) throw new Error('no window');
    expect(win.events.has('moved')).toBe(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // A drag: many `move` events; nothing is written until the window stands still.
      for (let x = 110; x <= 300; x += 10) {
        win.position = [x, 200];
        win.events.get('move')?.();
        vi.advanceTimersByTime(WINDOW_MOVE_SAVE_MS - 1);
      }
      expect(existsSync(join(electron.state.userData, 'saves', 'window.json'))).toBe(false);
      vi.advanceTimersByTime(1);
      await vi.waitFor(() => expect(storedWindow()).toMatchObject({ x: 300, y: 200 }));
      // Not while fullscreen or minimised (Windows parks a minimised window at -32000).
      win.fullScreen = true;
      win.position = [0, 0];
      win.events.get('move')?.();
      vi.advanceTimersByTime(WINDOW_MOVE_SAVE_MS);
      win.fullScreen = false;
      win.minimized = true;
      win.position = [-32000, -32000];
      win.events.get('move')?.();
      vi.advanceTimersByTime(WINDOW_MOVE_SAVE_MS);
      // The next write (a scale step) still carries the last real position: neither was taken.
      win.minimized = false;
      expect(press({ key: '-', control: true })).toBe(true);
      await vi.waitFor(() => expect(storedWindow()).toMatchObject({ scale: 2 }));
      expect(storedWindow()).toMatchObject({ x: 300, y: 200 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves the position when the window closes, and quits only once it is written', async () => {
    await startMain();
    const win = electron.state.windows[0];
    if (win === undefined) throw new Error('no window');
    const willQuit = electron.state.appEvents.get('will-quit');
    // Nothing pending: quitting goes ahead.
    let prevented = false;
    willQuit?.({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(false);
    // Closed right after a move, before it settled.
    win.position = [640, 300];
    win.events.get('move')?.();
    win.events.get('close')?.({ preventDefault: () => undefined });
    electron.state.appEvents.get('window-all-closed')?.();
    expect(electron.state.quits).toBe(1);
    willQuit?.({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    await vi.waitFor(() => expect(electron.state.quits).toBe(2));
    expect(storedWindow()).toMatchObject({ x: 640, y: 300 });
  });

  it('keeps the window on the game: no navigation away, no pop-ups', async () => {
    await startMain();
    const contents = electron.state.windows[0]?.contents;
    let prevented = false;
    contents?.get('will-navigate')?.(
      { preventDefault: () => (prevented = true) },
      'https://x.test/',
    );
    expect(prevented).toBe(true);
    prevented = false;
    contents?.get('will-navigate')?.(
      { preventDefault: () => (prevented = true) },
      'app://game/index.html?scene=flight',
    );
    expect(prevented).toBe(false);
    expect(electron.state.windows[0]?.openHandler?.()).toEqual({ action: 'deny' });
  });
});
