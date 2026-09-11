/**
 * Tests the Electron main process (src/main/main.ts) against a mocked `electron` module,
 * so it runs in plain Node without the Electron binary (CI sets
 * ELECTRON_SKIP_BINARY_DOWNLOAD=1). Each test imports a fresh copy because main.ts does
 * its work at import time and reads its environment variables then.
 */
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/ipc.js';

type Handler = (request: { url: string }) => Response | Promise<Response>;

const electron = vi.hoisted(() => {
  const state = {
    privileged: [] as unknown[],
    handlers: new Map<string, Handler>(),
    ipc: new Map<string, () => void>(),
    appEvents: new Map<string, () => void>(),
    windows: [] as Array<{
      options: unknown;
      url: string | null;
      shown: boolean;
      once: Map<string, () => void>;
    }>,
    quits: 0,
    fetched: [] as string[],
  };
  class BrowserWindow {
    static getAllWindows(): unknown[] {
      return state.windows;
    }
    private readonly record: (typeof state.windows)[number];
    constructor(options: unknown) {
      this.record = { options, url: null, shown: false, once: new Map() };
      state.windows.push(this.record);
    }
    once(event: string, listener: () => void): void {
      this.record.once.set(event, listener);
    }
    show(): void {
      this.record.shown = true;
    }
    loadURL(url: string): Promise<void> {
      this.record.url = url;
      return Promise.resolve();
    }
  }
  const module = {
    app: {
      whenReady: () => Promise.resolve(),
      quit: () => {
        state.quits++;
      },
      on: (event: string, listener: () => void) => {
        state.appEvents.set(event, listener);
      },
    },
    BrowserWindow,
    ipcMain: {
      on: (channel: string, listener: () => void) => {
        state.ipc.set(channel, listener);
      },
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
  };
  return { state, module };
});

vi.mock('electron', () => ({ ...electron.module, default: electron.module }));

/** Imports a fresh main.ts and waits for its `app.whenReady()` chain. */
async function startMain(): Promise<void> {
  vi.resetModules();
  await import('../../src/main/main.js');
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 0));
}

beforeEach(() => {
  const s = electron.state;
  s.privileged.length = 0;
  s.handlers.clear();
  s.ipc.clear();
  s.appEvents.clear();
  s.windows.length = 0;
  s.quits = 0;
  s.fetched.length = 0;
  vi.stubEnv('SHMUP_DEV_URL', undefined);
  vi.stubEnv('SHMUP_RENDERER_DIR', undefined);
  vi.stubEnv('SHMUP_FULLSCREEN', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it('quits on the renderer quit request and when every window is closed', async () => {
    await startMain();
    electron.state.ipc.get(IPC_CHANNELS.quit)?.();
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
});
