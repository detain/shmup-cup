/**
 * Edge cases of the main process's IPC handlers (plan M2-17, `main/ipc-handlers.ts`) against a
 * recording store: the sender check (a destroyed frame, look-alike hosts, the dev server only over
 * http(s) and by its exact origin), the argument checks run before the store is touched (UTF-8
 * bytes, the exact limit), the store's own answers and failures forwarded, and registering again
 * after unregistering.
 */
import { describe, expect, it } from 'vitest';
import {
  IpcRefusedError,
  isTrustedRendererUrl,
  registerIpcHandlers,
  type IpcEventLike,
  type IpcMainLike,
} from '../../src/main/ipc-handlers.js';
import {
  IPC_CHANNELS,
  STORAGE_VALUE_MAX_BYTES,
  type ShmupElectronStorage,
} from '../../src/shared/ipc.js';

type Listener = (event: IpcEventLike, ...args: unknown[]) => unknown;

/** A fake `ipcMain` that keeps one handler / listener per channel. */
class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, Listener>();
  readonly listeners = new Map<string, Listener>();
  handle(channel: string, listener: Listener): void {
    if (this.handlers.has(channel)) throw new Error(`second handler for ${channel}`);
    this.handlers.set(channel, listener);
  }
  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }
  on(channel: string, listener: Listener): void {
    this.listeners.set(channel, listener);
  }
  removeListener(channel: string, listener: Listener): void {
    if (this.listeners.get(channel) === listener) this.listeners.delete(channel);
  }
  /**
   * Calls an invoke handler like Electron (a throw becomes a rejection).
   *
   * @param channel - The channel.
   * @param event - The sender.
   * @param args - The arguments.
   * @returns The answer.
   */
  invoke(channel: string, event: IpcEventLike, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler === undefined) return Promise.reject(new Error(`no handler for ${channel}`));
    try {
      return Promise.resolve(handler(event, ...args));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

const GAME: IpcEventLike = { senderFrame: { url: 'app://game/index.html' } };

/**
 * Registers the handlers over a recording store.
 *
 * @param options - The dev server URL and a store to use instead of the recording one.
 * @returns The fake `ipcMain`, the store's call log, the quit count and the unregister function.
 */
function setup(options: { devUrl?: string | null; store?: ShmupElectronStorage } = {}) {
  const ipc = new FakeIpcMain();
  const calls: string[] = [];
  let quits = 0;
  const store: ShmupElectronStorage = options.store ?? {
    get: (key) => {
      calls.push(`get ${key}`);
      return Promise.resolve(`value of ${key}`);
    },
    set: (key, value) => {
      calls.push(`set ${key} ${value.length}`);
      return Promise.resolve();
    },
  };
  const unregister = registerIpcHandlers(ipc, {
    store,
    quit: () => {
      quits++;
    },
    devUrl: options.devUrl ?? null,
  });
  return { ipc, calls, quits: () => quits, unregister };
}

describe('electron/main/ipc-handlers sender check', () => {
  it('refuses a frame that is gone (destroyed or navigated away), naming it unknown', async () => {
    const { ipc, calls, quits } = setup();
    for (const event of [{}, { senderFrame: null }, { senderFrame: { url: '' } }]) {
      const refused = await ipc
        .invoke(IPC_CHANNELS.storageGet, event, 'save.v1')
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(IpcRefusedError);
      expect((refused as Error).message).toContain('(unknown)');
      expect((refused as Error).name).toBe('IpcRefusedError');
      ipc.listeners.get(IPC_CHANNELS.quit)?.(event);
    }
    expect(calls).toEqual([]);
    expect(quits()).toBe(0);
  });

  it('names the refused page in the error', async () => {
    const { ipc } = setup();
    await expect(
      ipc.invoke(IPC_CHANNELS.storageSet, { senderFrame: { url: 'https://evil.test/x' } }, 'k', ''),
    ).rejects.toThrow('https://evil.test/x');
  });

  it('trusts app://game only as that exact host, whatever the path or case', () => {
    expect(isTrustedRendererUrl('app://game/deep/page.html?x=1#y', null)).toBe(true);
    expect(isTrustedRendererUrl('APP://GAME/index.html', null)).toBe(true);
    for (const url of [
      'app://game.evil.test/index.html',
      'app://game:8080/index.html',
      'app://gamex/index.html',
      'app://user@evil/index.html',
      'app:game',
      'app:///index.html',
      'game/index.html',
      'not a url',
    ]) {
      expect(isTrustedRendererUrl(url, null), url).toBe(false);
    }
  });

  it('trusts the dev server over http(s) only, by its exact origin', () => {
    expect(isTrustedRendererUrl('https://localhost:5173/a', 'https://localhost:5173/')).toBe(true);
    expect(isTrustedRendererUrl('http://LOCALHOST:5173/', 'http://localhost:5173')).toBe(true);
    // Scheme, host and port must all match.
    expect(isTrustedRendererUrl('https://localhost:5173/', 'http://localhost:5173')).toBe(false);
    expect(isTrustedRendererUrl('http://localhost/', 'http://localhost:5173')).toBe(false);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', 'http://localhost:5173')).toBe(false);
    // A dev URL that is not http(s) never makes a page trusted.
    expect(isTrustedRendererUrl('file:///srv/index.html', 'file:///srv/index.html')).toBe(false);
    expect(isTrustedRendererUrl('data:text/html,x', 'data:text/html,x')).toBe(false);
    // An unparsable dev URL trusts nothing but the game.
    expect(isTrustedRendererUrl('http://localhost:5173/', 'localhost:5173')).toBe(false);
    expect(isTrustedRendererUrl('app://game/', 'nonsense')).toBe(true);
  });

  it('accepts storage and quit from the dev server page when SHMUP_DEV_URL is set', async () => {
    const { ipc, calls, quits } = setup({ devUrl: 'http://localhost:5173' });
    const dev = { senderFrame: { url: 'http://localhost:5173/?scene=flight' } };
    expect(await ipc.invoke(IPC_CHANNELS.storageGet, dev, 'save.v1')).toBe('value of save.v1');
    ipc.listeners.get(IPC_CHANNELS.quit)?.(dev);
    expect(quits()).toBe(1);
    expect(calls).toEqual(['get save.v1']);
  });
});

describe('electron/main/ipc-handlers argument checks', () => {
  it('checks the key and the value before the store sees anything', async () => {
    const { ipc, calls } = setup();
    for (const key of [undefined, null, 42, {}, '', '../x', 'x.', 'a b']) {
      await expect(ipc.invoke(IPC_CHANNELS.storageGet, GAME, key)).rejects.toBeInstanceOf(
        IpcRefusedError,
      );
      await expect(ipc.invoke(IPC_CHANNELS.storageSet, GAME, key, '{}')).rejects.toBeInstanceOf(
        IpcRefusedError,
      );
    }
    for (const value of [undefined, null, 1, {}, ['x']]) {
      await expect(ipc.invoke(IPC_CHANNELS.storageSet, GAME, 'k', value)).rejects.toThrow(
        /must be a string/,
      );
    }
    expect(calls).toEqual([]);
  });

  it('counts UTF-8 bytes: exactly the limit passes, one more byte is refused', async () => {
    const { ipc, calls } = setup();
    await ipc.invoke(IPC_CHANNELS.storageSet, GAME, 'k', 'x'.repeat(STORAGE_VALUE_MAX_BYTES));
    expect(calls).toEqual([`set k ${STORAGE_VALUE_MAX_BYTES}`]);
    // Two bytes a character: fewer characters than the limit, more bytes.
    const accented = 'é'.repeat(STORAGE_VALUE_MAX_BYTES / 2 + 1);
    expect(accented.length).toBeLessThan(STORAGE_VALUE_MAX_BYTES);
    await expect(ipc.invoke(IPC_CHANNELS.storageSet, GAME, 'k', accented)).rejects.toThrow(
      `over ${STORAGE_VALUE_MAX_BYTES} bytes`,
    );
    expect(calls).toHaveLength(1);
  });

  it('accepts the empty string as a value (the store decides)', async () => {
    const { ipc, calls } = setup();
    await expect(ipc.invoke(IPC_CHANNELS.storageSet, GAME, 'k', '')).resolves.toBeUndefined();
    expect(calls).toEqual(['set k 0']);
  });
});

describe('electron/main/ipc-handlers store answers', () => {
  it("forwards the store's answer and its failures unchanged", async () => {
    const disk = new Error('EIO: i/o error');
    const { ipc } = setup({
      store: {
        get: (key) => (key === 'missing' ? Promise.resolve(null) : Promise.reject(disk)),
        set: () => Promise.reject(disk),
      },
    });
    expect(await ipc.invoke(IPC_CHANNELS.storageGet, GAME, 'missing')).toBeNull();
    await expect(ipc.invoke(IPC_CHANNELS.storageGet, GAME, 'save.v1')).rejects.toBe(disk);
    await expect(ipc.invoke(IPC_CHANNELS.storageSet, GAME, 'save.v1', '{}')).rejects.toBe(disk);
  });

  it('can be registered again once unregistered (a re-created app), and unregistering stops quit', () => {
    const first = setup();
    expect(first.ipc.listeners.has(IPC_CHANNELS.quit)).toBe(true);
    first.unregister();
    // The listener removed is the very one registered (the fake removes only that object).
    expect(first.ipc.handlers.size).toBe(0);
    expect(first.ipc.listeners.size).toBe(0);
    expect(() =>
      registerIpcHandlers(first.ipc, {
        store: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
        quit: () => undefined,
        devUrl: null,
      }),
    ).not.toThrow();
    expect([...first.ipc.handlers.keys()].sort()).toEqual(
      [IPC_CHANNELS.storageGet, IPC_CHANNELS.storageSet].sort(),
    );
  });
});
