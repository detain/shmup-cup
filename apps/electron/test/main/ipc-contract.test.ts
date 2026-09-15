/**
 * The IPC contract of the desktop build (plan M2-17), end to end without Electron: the compiled
 * sandboxed preload (`src/preload/preload.cts`, run in a VM the way Electron runs it) exposes
 * `window.shmupElectron`; its `ipcRenderer` fake forwards every `send` / `invoke` to a fake
 * `ipcMain` on which the real handlers (`main/ipc-handlers.ts`) are registered over a real
 * `FileStore` in a temporary folder. Checked: the storage round trip through the bridge, the
 * handlers' argument and sender checks (rejections reach the renderer), the quota error, quit,
 * and that every channel the preload uses has a handler.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IpcRefusedError,
  isTrustedRendererUrl,
  registerIpcHandlers,
  type IpcEventLike,
  type IpcMainLike,
} from '../../src/main/ipc-handlers.js';
import { StorageQuotaError, createFileStore } from '../../src/main/saves.js';
import {
  IPC_CHANNELS,
  STORAGE_KEY_MAX_LENGTH,
  STORAGE_VALUE_MAX_BYTES,
  isStorageKey,
  type ShmupElectronApi,
} from '../../src/shared/ipc.js';

const source = readFileSync(new URL('../../src/preload/preload.cts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'preload.cts',
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

type Listener = (event: IpcEventLike, ...args: unknown[]) => unknown;

/** A fake `ipcMain`: the handlers and listeners registered on it. */
class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, Listener>();
  readonly listeners = new Map<string, Listener[]>();
  handle(channel: string, listener: Listener): void {
    if (this.handlers.has(channel)) throw new Error(`second handler for ${channel}`);
    this.handlers.set(channel, listener);
  }
  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }
  on(channel: string, listener: Listener): void {
    this.listeners.set(channel, [...(this.listeners.get(channel) ?? []), listener]);
  }
  removeListener(channel: string, listener: Listener): void {
    this.listeners.set(
      channel,
      (this.listeners.get(channel) ?? []).filter((entry) => entry !== listener),
    );
  }
}

/**
 * Runs the compiled preload with an `ipcRenderer` wired to `ipc`, as a page at `pageUrl`.
 *
 * @param ipc - The fake main side.
 * @param pageUrl - The renderer page's URL (the sender frame).
 * @returns The API the preload exposed, and the channels it used.
 */
function runPreload(ipc: FakeIpcMain, pageUrl: string) {
  const used: string[] = [];
  const event: IpcEventLike = { senderFrame: { url: pageUrl } };
  let exposed: ShmupElectronApi | null = null;
  const electron = {
    contextBridge: {
      exposeInMainWorld: (_key: string, api: ShmupElectronApi) => {
        exposed = api;
      },
    },
    ipcRenderer: {
      send: (channel: string, ...args: unknown[]) => {
        used.push(channel);
        for (const listener of ipc.listeners.get(channel) ?? []) listener(event, ...args);
      },
      invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
        used.push(channel);
        const handler = ipc.handlers.get(channel);
        if (handler === undefined) {
          return Promise.reject(new Error(`No handler registered for '${channel}'`));
        }
        // Like Electron: a throwing handler rejects the invoke.
        try {
          return Promise.resolve(handler(event, ...args));
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
    },
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    require: (id: string) => {
      if (id !== 'electron') throw new Error(`sandboxed preload cannot require ${id}`);
      return electron;
    },
    module,
    exports: module.exports,
  });
  if (exposed === null) throw new Error('the preload exposed nothing');
  return { api: exposed as ShmupElectronApi, used };
}

let dir = '';
let quits = 0;
let ipc: FakeIpcMain;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-ipc-'));
  quits = 0;
  ipc = new FakeIpcMain();
  registerIpcHandlers(ipc, {
    store: createFileStore(dir, { quotaBytes: 4096 }),
    quit: () => {
      quits++;
    },
    devUrl: null,
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('electron IPC contract (preload ↔ main handlers)', () => {
  it('round-trips the save through window.shmupElectron.storage into a JSON file', async () => {
    const { api, used } = runPreload(ipc, 'app://game/index.html');
    expect(api.platform).toBe('electron');
    expect(await api.storage.get('save.v1')).toBeNull();
    await expect(api.storage.set('save.v1', '{"version":2}')).resolves.toBeUndefined();
    expect(await api.storage.get('save.v1')).toBe('{"version":2}');
    expect(readFileSync(join(dir, 'save.v1.json'), 'utf8')).toBe('{"version":2}');
    expect(used).toEqual([
      IPC_CHANNELS.storageGet,
      IPC_CHANNELS.storageSet,
      IPC_CHANNELS.storageGet,
    ]);
  });

  it('has a handler for every channel the preload uses, and only those', () => {
    expect([...ipc.handlers.keys()].sort()).toEqual(
      [IPC_CHANNELS.storageGet, IPC_CHANNELS.storageSet].sort(),
    );
    expect([...ipc.listeners.keys()]).toEqual([IPC_CHANNELS.quit]);
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(source, channel).toContain(`'${channel}'`);
    }
  });

  it('rejects invalid keys and values in the renderer, and writes nothing', async () => {
    const { api } = runPreload(ipc, 'app://game/index.html');
    await expect(api.storage.get('../secret')).rejects.toBeInstanceOf(IpcRefusedError);
    await expect(api.storage.set('a/b', '{}')).rejects.toBeInstanceOf(IpcRefusedError);
    await expect(api.storage.set('k', 7 as unknown as string)).rejects.toThrow(/string/);
    await expect(
      api.storage.set('k', 'x'.repeat(STORAGE_VALUE_MAX_BYTES + 1)),
    ).rejects.toBeInstanceOf(IpcRefusedError);
    await expect(api.storage.get('k')).resolves.toBeNull();
  });

  it('forwards the store quota error to the renderer', async () => {
    const { api } = runPreload(ipc, 'app://game/index.html');
    await expect(api.storage.set('big', 'x'.repeat(5000))).rejects.toBeInstanceOf(
      StorageQuotaError,
    );
  });

  it('refuses every message from a page that is not the game, and quits only for the game', async () => {
    const stranger = runPreload(ipc, 'https://example.com/');
    await expect(stranger.api.storage.get('save.v1')).rejects.toBeInstanceOf(IpcRefusedError);
    await expect(stranger.api.storage.set('save.v1', '{}')).rejects.toBeInstanceOf(IpcRefusedError);
    stranger.api.quit();
    expect(quits).toBe(0);
    runPreload(ipc, 'app://game/index.html').api.quit();
    expect(quits).toBe(1);
  });

  it('trusts the dev server only by its exact origin, and app://game only on its host', () => {
    expect(isTrustedRendererUrl('app://game/index.html', null)).toBe(true);
    expect(isTrustedRendererUrl('app://game/', null)).toBe(true);
    expect(isTrustedRendererUrl('app://evil/index.html', null)).toBe(false);
    expect(isTrustedRendererUrl('file:///index.html', null)).toBe(false);
    expect(isTrustedRendererUrl('', null)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5173/', null)).toBe(false);
    expect(
      isTrustedRendererUrl('http://localhost:5173/?scene=flight', 'http://localhost:5173'),
    ).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
    expect(isTrustedRendererUrl('http://evil.test/', 'http://localhost:5173')).toBe(false);
  });

  it('removes its handlers when unregistered', () => {
    const fresh = new FakeIpcMain();
    const unregister = registerIpcHandlers(fresh, {
      store: createFileStore(dir),
      quit: () => undefined,
      devUrl: null,
    });
    unregister();
    expect(fresh.handlers.size).toBe(0);
    expect(fresh.listeners.get(IPC_CHANNELS.quit)).toEqual([]);
  });

  it('agrees on the storage key rules', () => {
    expect(isStorageKey('save.v1')).toBe(true);
    expect(isStorageKey('save.corrupt')).toBe(true);
    expect(isStorageKey('window')).toBe(true);
    expect(isStorageKey('x'.repeat(STORAGE_KEY_MAX_LENGTH))).toBe(true);
    expect(isStorageKey('x'.repeat(STORAGE_KEY_MAX_LENGTH + 1))).toBe(false);
    for (const bad of ['', '.x', 'x.', '../x', 'a/b', 'a b', 'ä', 1, null, undefined]) {
      expect(isStorageKey(bad), String(bad)).toBe(false);
    }
  });
});
