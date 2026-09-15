/**
 * Runs the sandboxed preload (src/preload/preload.cts) the way Electron does — as a
 * CommonJS script whose only import is `electron` — with a fake `electron` module, and
 * checks the API it exposes to the renderer.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS, type ShmupElectronApi } from '../../src/shared/ipc.js';

const source = readFileSync(new URL('../../src/preload/preload.cts', import.meta.url), 'utf8');

/** Compiles the preload like tsconfig.build.json does (.cts → CommonJS .cjs). */
const compiled = ts.transpileModule(source, {
  fileName: 'preload.cts',
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

/**
 * Executes the compiled preload in a sandbox that only provides `require('electron')`.
 *
 * @returns What was exposed and sent.
 */
function runPreload() {
  const exposed = new Map<string, unknown>();
  const sent: unknown[][] = [];
  const invoked: unknown[][] = [];
  const required: string[] = [];
  const electron = {
    contextBridge: {
      exposeInMainWorld: (key: string, api: unknown) => {
        exposed.set(key, api);
      },
    },
    ipcRenderer: {
      send: (...args: unknown[]) => {
        sent.push(args);
      },
      invoke: (...args: unknown[]) => {
        invoked.push(args);
        return Promise.resolve(args[0] === IPC_CHANNELS.storageGet ? 'stored' : undefined);
      },
    },
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    require: (id: string) => {
      required.push(id);
      if (id !== 'electron') throw new Error(`sandboxed preload cannot require ${id}`);
      return electron;
    },
    module,
    exports: module.exports,
  });
  return { exposed, sent, invoked, required };
}

describe('electron/preload runtime behaviour', () => {
  it('compiles to CommonJS that only requires electron', () => {
    const { required } = runPreload();
    expect(required).toEqual(['electron']);
    expect(compiled).not.toMatch(/^\s*import\s/m);
  });

  it('exposes exactly window.shmupElectron = { platform, quit, storage: { get, set } }', () => {
    const { exposed } = runPreload();
    expect([...exposed.keys()]).toEqual(['shmupElectron']);
    const api = exposed.get('shmupElectron') as ShmupElectronApi;
    expect(Object.keys(api).sort()).toEqual(['platform', 'quit', 'storage']);
    expect(Object.keys(api.storage).sort()).toEqual(['get', 'set']);
    expect(api.platform).toBe('electron');
  });

  it('storage.get / storage.set invoke the storage channels with the key (and value) only (M2-17)', async () => {
    const { exposed, invoked } = runPreload();
    const api = exposed.get('shmupElectron') as ShmupElectronApi;
    expect(await api.storage.get('save.v1')).toBe('stored');
    await expect(api.storage.set('save.v1', '{}')).resolves.toBeUndefined();
    expect(invoked).toEqual([
      [IPC_CHANNELS.storageGet, 'save.v1'],
      [IPC_CHANNELS.storageSet, 'save.v1', '{}'],
    ]);
  });

  it('quit() sends the quit channel the main process listens on, with no payload', () => {
    const { exposed, sent } = runPreload();
    const api = exposed.get('shmupElectron') as ShmupElectronApi;
    expect(sent).toEqual([]);
    api.quit();
    expect(sent).toEqual([[IPC_CHANNELS.quit]]);
  });
});
