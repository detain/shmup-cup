/**
 * The web build inside the Electron desktop app (plan M2-17): the preload's `window.shmupElectron`
 * bridge is recognised (and a look-alike is not), the platform becomes `'electron'` with file
 * saves through the bridge and an `exit` that quits, and the API the real preload exposes
 * (`apps/electron/src/preload/preload.cts`, compiled and run in a VM) is the one this build
 * expects.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createMemoryStorage, loadSave, type PlatformAudio, type PlatformInput } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  createBridgeStorage,
  createWebPlatform,
  getElectronBridge,
  type ElectronBridge,
} from '../../src/platform/index.js';

/**
 * A bridge over an in-memory store (optionally failing).
 *
 * @param options - Failing reads / writes.
 * @returns The bridge and its call log.
 */
function fakeBridge(options: { failGet?: boolean; failSet?: boolean } = {}) {
  const store = createMemoryStorage();
  const calls: string[] = [];
  let quits = 0;
  const bridge: ElectronBridge = {
    platform: 'electron',
    quit: () => {
      quits++;
    },
    storage: {
      get: (key) => {
        calls.push(`get ${key}`);
        return options.failGet === true ? Promise.reject(new Error('EIO')) : store.get(key);
      },
      set: (key, value) => {
        calls.push(`set ${key}`);
        return options.failSet === true
          ? Promise.reject(new Error('StorageQuotaError'))
          : store.set(key, value);
      },
    },
  };
  return { bridge, calls, store, quits: () => quits };
}

const input: PlatformInput = { poll: () => ({}) as ReturnType<PlatformInput['poll']> };
const audio: PlatformAudio = { unlock: () => Promise.resolve() };
const visibility = { visibilityState: 'visible', addEventListener: () => undefined };

describe('web/platform in the Electron desktop app', () => {
  it('recognises the preload bridge and rejects anything else', () => {
    const { bridge } = fakeBridge();
    expect(getElectronBridge({ shmupElectron: bridge } as unknown as Window)).toBe(bridge);
    for (const other of [
      undefined,
      null,
      'electron',
      { platform: 'electron', quit: () => undefined },
      { platform: 'web', quit: () => undefined, storage: bridge.storage },
      { platform: 'electron', quit: 1, storage: bridge.storage },
      { platform: 'electron', quit: () => undefined, storage: { get: () => null } },
    ]) {
      expect(getElectronBridge({ shmupElectron: other } as unknown as Window)).toBeNull();
    }
    expect(getElectronBridge({} as Window)).toBeNull();
  });

  it("becomes the 'electron' platform: file saves through the bridge, EXIT quits", async () => {
    const fake = fakeBridge();
    const platform = createWebPlatform({
      input,
      audio,
      storage: null,
      visibility,
      displaySize: () => ({ width: 1152, height: 648 }),
      gamepad: true,
      webgl2: false,
      electron: fake.bridge,
    });
    expect(platform.id).toBe('electron');
    await platform.storage.set('save.v1', '{"version":2}');
    expect(await platform.storage.get('save.v1')).toBe('{"version":2}');
    expect(fake.calls).toEqual(['set save.v1', 'get save.v1']);
    expect(platform.exit).not.toBeNull();
    platform.exit?.();
    expect(fake.quits()).toBe(1);
  });

  it('stays the plain web platform without a bridge', () => {
    const platform = createWebPlatform({
      input,
      audio,
      storage: null,
      visibility,
      displaySize: () => ({ width: 1, height: 1 }),
      gamepad: false,
      webgl2: false,
      electron: null,
    });
    expect(platform.id).toBe('web');
    expect(platform.exit).toBeNull();
  });

  it('reads from memory when the bridge fails (the save loads as empty), and rejects failed writes', async () => {
    const reading = fakeBridge({ failGet: true });
    const storage = createBridgeStorage(reading.bridge);
    expect(await storage.get('save.v1')).toBeNull();
    await storage.set('save.v1', '{"n":1}');
    // The value written this session survives a failing read.
    expect(await storage.get('save.v1')).toBe('{"n":1}');
    const loaded = await loadSave(createBridgeStorage(fakeBridge({ failGet: true }).bridge));
    expect(loaded.status).toBe('empty');

    const writing = fakeBridge({ failSet: true });
    await expect(createBridgeStorage(writing.bridge).set('save.v1', '{}')).rejects.toThrow(
      'StorageQuotaError',
    );
  });

  it('accepts the API the real Electron preload exposes', async () => {
    const source = readFileSync(
      new URL('../../../electron/src/preload/preload.cts', import.meta.url),
      'utf8',
    );
    const compiled = ts.transpileModule(source, {
      fileName: 'preload.cts',
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const files = new Map<string, string>();
    let exposed: unknown = null;
    const electron = {
      contextBridge: {
        exposeInMainWorld: (_key: string, api: unknown) => {
          exposed = api;
        },
      },
      ipcRenderer: {
        send: () => undefined,
        invoke: (channel: string, key: string, value?: string) => {
          if (channel === 'shmup:storage-set') files.set(key, value ?? '');
          return Promise.resolve(
            channel === 'shmup:storage-get' ? (files.get(key) ?? null) : undefined,
          );
        },
      },
    };
    const module = { exports: {} };
    runInNewContext(compiled, { require: () => electron, module, exports: module.exports });
    const bridge = getElectronBridge({ shmupElectron: exposed } as unknown as Window);
    expect(bridge).not.toBeNull();
    const storage = createBridgeStorage(bridge as ElectronBridge);
    await storage.set('save.v1', '{"v":1}');
    expect(files.get('save.v1')).toBe('{"v":1}');
    expect(await storage.get('save.v1')).toBe('{"v":1}');
  });
});
