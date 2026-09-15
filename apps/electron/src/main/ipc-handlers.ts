/**
 * # main/ipc-handlers — the main process's side of the IPC contract
 *
 * **Responsibility.** Answers the preload's IPC (`shared/ipc` `IPC_CHANNELS`, M2-17): `shmup:quit`
 * quits, `shmup:storage-get` / `shmup:storage-set` read and write the save files through the
 * `FileStore` (`main/saves.ts`). Every message is checked before it reaches the store:
 *
 * - the **sender** must be the game's own page — `app://game/…`, or the dev server's origin
 *   (`SHMUP_DEV_URL`) during development ({@link isTrustedRendererUrl}); anything else (a page the
 *   window was somehow navigated to) is refused;
 * - the **key** must pass `isStorageKey` and a **value** must be a string of at most
 *   `STORAGE_VALUE_MAX_BYTES` UTF-8 bytes.
 *
 * A refused `invoke` rejects in the renderer (Electron forwards the thrown error); the store's own
 * errors (quota, disk) are forwarded the same way. `ipcMain` arrives as {@link IpcMainLike}, so the
 * contract tests wire the compiled preload to these handlers without Electron.
 *
 * **Implements.** shmup_feat.md §23 Electron-specific (file saves, quit), §21 Saves.
 *
 * **Public API.** {@link registerIpcHandlers}, {@link IpcHandlerOptions}, {@link IpcMainLike},
 * {@link IpcEventLike}, {@link isTrustedRendererUrl}, {@link IpcRefusedError}.
 *
 * @module
 */
import {
  IPC_CHANNELS,
  STORAGE_VALUE_MAX_BYTES,
  isStorageKey,
  type ShmupElectronStorage,
} from '../shared/ipc.js';
import { APP_HOST, APP_SCHEME } from './app-protocol.js';

/** An IPC message the main process refuses (untrusted sender, bad arguments). */
export class IpcRefusedError extends Error {
  /**
   * Creates the error.
   *
   * @param message - Why.
   */
  constructor(message: string) {
    super(message);
    this.name = 'IpcRefusedError';
  }
}

/** The part of an IPC event checked here (Electron's `IpcMainEvent` / `IpcMainInvokeEvent`). */
export interface IpcEventLike {
  /** The frame that sent the message (`null` once it navigated away or was destroyed). */
  readonly senderFrame?: {
    /** The frame's URL. */
    readonly url: string;
  } | null;
}

/** The parts of Electron's `ipcMain` used here. */
export interface IpcMainLike {
  /**
   * Handles an `invoke` channel.
   *
   * @param channel - The channel.
   * @param listener - Returns (or resolves with) the answer; a throw rejects the invoke.
   */
  handle(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => unknown): void;
  /**
   * Removes an `invoke` handler.
   *
   * @param channel - The channel.
   */
  removeHandler(channel: string): void;
  /**
   * Listens on a `send` channel.
   *
   * @param channel - The channel.
   * @param listener - Called per message.
   */
  on(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => void): void;
  /**
   * Stops listening.
   *
   * @param channel - The channel.
   * @param listener - The listener passed to `on`.
   */
  removeListener(
    channel: string,
    listener: (event: IpcEventLike, ...args: unknown[]) => void,
  ): void;
}

/** What the handlers need. */
export interface IpcHandlerOptions {
  /** The save files. */
  readonly store: ShmupElectronStorage;
  /** Quits the app. */
  readonly quit: () => void;
  /** The Vite dev server's URL when the window loads it (`SHMUP_DEV_URL`), else `null`. */
  readonly devUrl: string | null;
}

/**
 * The origin (`scheme://host[:port]`) of a URL, lower-cased, or `null` when it has none.
 *
 * @param url - The URL.
 * @returns The origin.
 */
function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch (_error) {
    return null;
  }
}

/**
 * Whether a sender's URL is the game's page: the bundled renderer (`app://game/…`) or, during
 * development, a page of the dev server's origin.
 *
 * @param url - The sender frame's URL.
 * @param devUrl - `SHMUP_DEV_URL`, or `null`.
 * @returns `true` for the game's page.
 *
 * @example
 * ```ts
 * isTrustedRendererUrl('app://game/index.html', null);            // → true
 * isTrustedRendererUrl('https://example.com/', null);             // → false
 * isTrustedRendererUrl('http://localhost:5173/', 'http://localhost:5173'); // → true
 * ```
 */
export function isTrustedRendererUrl(url: string, devUrl: string | null): boolean {
  const origin = originOf(url);
  if (origin === null) return false;
  if (origin === `${APP_SCHEME}://${APP_HOST}`) return true;
  const dev = devUrl === null ? null : originOf(devUrl);
  return dev !== null && dev === origin && /^https?:/.test(origin);
}

/**
 * Registers the handlers of every channel on `ipcMain`.
 *
 * @remarks
 * `shmup:storage-get` / `shmup:storage-set` are `invoke` handlers: an untrusted sender, a bad key
 * or a value that is not a string of at most `STORAGE_VALUE_MAX_BYTES` UTF-8 bytes throws an
 * {@link IpcRefusedError} (the renderer's `invoke` rejects — the store is never reached); otherwise
 * the handler returns the store's promise, so its `StorageKeyError` / `StorageQuotaError` / disk
 * errors reject the renderer's call too. `shmup:quit` is a `send` channel with no answer: a quit
 * from an untrusted sender is dropped silently. Register once per `ipcMain` — Electron throws for
 * a second `handle` on the same channel; call the returned function first.
 *
 * @param ipc - `ipcMain` (or a fake).
 * @param options - The store, the quit callback, the dev server URL.
 * @returns A function that removes them.
 *
 * @example
 * ```ts
 * registerIpcHandlers(ipcMain, { store: createFileStore(dir), quit: () => app.quit(), devUrl });
 * ```
 */
export function registerIpcHandlers(ipc: IpcMainLike, options: IpcHandlerOptions): () => void {
  /**
   * Refuses a message from anything but the game's page.
   *
   * @param event - The IPC event.
   * @throws {IpcRefusedError} For an untrusted sender.
   */
  const checkSender = (event: IpcEventLike): void => {
    const url = event.senderFrame?.url ?? '';
    if (!isTrustedRendererUrl(url, options.devUrl)) {
      throw new IpcRefusedError(`IPC from an untrusted page refused (${url || 'unknown'})`);
    }
  };
  /**
   * Checks a storage key argument.
   *
   * @param key - The argument.
   * @returns The key.
   * @throws {IpcRefusedError} For an invalid key.
   */
  const checkKey = (key: unknown): string => {
    if (!isStorageKey(key)) throw new IpcRefusedError(`invalid storage key ${JSON.stringify(key)}`);
    return key;
  };

  ipc.handle(IPC_CHANNELS.storageGet, (event, key) => {
    checkSender(event);
    return options.store.get(checkKey(key));
  });
  ipc.handle(IPC_CHANNELS.storageSet, (event, key, value) => {
    checkSender(event);
    const checked = checkKey(key);
    if (typeof value !== 'string') throw new IpcRefusedError('a storage value must be a string');
    if (Buffer.byteLength(value, 'utf8') > STORAGE_VALUE_MAX_BYTES) {
      throw new IpcRefusedError(`storage value over ${STORAGE_VALUE_MAX_BYTES} bytes`);
    }
    return options.store.set(checked, value);
  });
  /**
   * The quit listener.
   *
   * @param event - The IPC event.
   */
  const onQuit = (event: IpcEventLike): void => {
    try {
      checkSender(event);
    } catch (_error) {
      return;
    }
    options.quit();
  };
  ipc.on(IPC_CHANNELS.quit, onQuit);
  return () => {
    ipc.removeHandler(IPC_CHANNELS.storageGet);
    ipc.removeHandler(IPC_CHANNELS.storageSet);
    ipc.removeListener(IPC_CHANNELS.quit, onQuit);
  };
}
