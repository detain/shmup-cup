/**
 * Edge cases of the desktop build's file saves (plan M2-17, `main/saves.ts` `FileStore`) beyond
 * the main suite: every failing step of a write (the temporary file, the backup copy) keeps the old
 * text and drops the temporary file; the per-key queue keeps going after a failure and never
 * blocks other keys; the usage counts backups but not temporary or foreign files; an unreadable
 * folder or file is tolerated by the quota check; the exact limits are accepted; the errors carry
 * their details; invalid calls never touch the file system.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_SUFFIX,
  SAVES_DIRECTORY,
  StorageKeyError,
  StorageQuotaError,
  TEMP_SUFFIX,
  createFileStore,
  nodeFileStoreFs,
  type FileStoreFs,
} from '../../src/main/saves.js';
import { STORAGE_VALUE_MAX_BYTES } from '../../src/shared/ipc.js';

let root = '';
let dir = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'shmup-saves-edge-'));
  dir = join(root, SAVES_DIRECTORY);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * The real file system with one operation replaced.
 *
 * @param overrides - The replaced operations.
 * @returns The file system.
 */
function fsWith(overrides: Partial<FileStoreFs>): FileStoreFs {
  return { ...nodeFileStoreFs, ...overrides };
}

/**
 * A promise with its resolve function.
 *
 * @returns The promise and `resolve`.
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('electron/main/saves FileStore — failing writes', () => {
  it('keeps the old text and drops the temporary file when writing the temporary file fails', async () => {
    let fail = false;
    const store = createFileStore(dir, {
      fs: fsWith({
        writeFileSynced: async (path, data) => {
          if (fail) {
            // A disk that filled up half way: a partial temporary file is left behind.
            writeFileSync(path, data.slice(0, 2));
            throw new Error('ENOSPC');
          }
          await nodeFileStoreFs.writeFileSynced(path, data);
        },
      }),
    });
    await store.set('save.v1', '{"n":1}');
    fail = true;
    await expect(store.set('save.v1', '{"n":2}')).rejects.toThrow('ENOSPC');
    expect(readFileSync(join(dir, 'save.v1.json'), 'utf8')).toBe('{"n":1}');
    expect(existsSync(join(dir, `save.v1.json${TEMP_SUFFIX}`))).toBe(false);
    expect(existsSync(join(dir, `save.v1.json${BACKUP_SUFFIX}`))).toBe(false);
    expect(await store.get('save.v1')).toBe('{"n":1}');
  });

  it('keeps the old text when copying the backup fails, and the next write succeeds', async () => {
    let fail = false;
    const store = createFileStore(dir, {
      fs: fsWith({
        copyFile: (from, to) =>
          fail ? Promise.reject(new Error('EACCES')) : nodeFileStoreFs.copyFile(from, to),
      }),
    });
    await store.set('save.v1', '{"n":1}');
    fail = true;
    await expect(store.set('save.v1', '{"n":2}')).rejects.toThrow('EACCES');
    expect(readFileSync(join(dir, 'save.v1.json'), 'utf8')).toBe('{"n":1}');
    expect(existsSync(join(dir, `save.v1.json${TEMP_SUFFIX}`))).toBe(false);
    fail = false;
    await store.set('save.v1', '{"n":3}');
    expect(await store.get('save.v1')).toBe('{"n":3}');
    expect(readFileSync(join(dir, `save.v1.json${BACKUP_SUFFIX}`), 'utf8')).toBe('{"n":1}');
  });

  it('still rejects with the write error when removing the temporary file fails too', async () => {
    const store = createFileStore(dir, {
      fs: fsWith({
        rename: () => Promise.reject(new Error('EIO')),
        unlink: () => Promise.reject(new Error('EPERM')),
      }),
    });
    await expect(store.set('k', '{}')).rejects.toThrow('EIO');
  });

  it('rejects when the folder cannot be created (a file is in the way)', async () => {
    writeFileSync(dir, 'not a folder');
    const store = createFileStore(dir);
    await expect(store.set('save.v1', '{}')).rejects.toBeInstanceOf(Error);
    // Reading such a folder is simply "nothing stored".
    expect(await store.get('save.v1')).toBeNull();
  });
});

describe('electron/main/saves FileStore — ordering', () => {
  it('keeps serving a key after a failed write, in order', async () => {
    let failNext = false;
    const store = createFileStore(dir, {
      fs: fsWith({
        rename: (from, to) => {
          if (failNext) {
            failNext = false;
            return Promise.reject(new Error('EIO'));
          }
          return nodeFileStoreFs.rename(from, to);
        },
      }),
    });
    await store.set('save.v1', '{"n":1}');
    failNext = true;
    const failing = store.set('save.v1', '{"n":2}');
    const after = store.set('save.v1', '{"n":3}');
    const read = store.get('save.v1');
    await expect(failing).rejects.toThrow('EIO');
    await expect(after).resolves.toBeUndefined();
    expect(await read).toBe('{"n":3}');
  });

  it('never makes one key wait for another', async () => {
    const gate = deferred();
    const store = createFileStore(dir, {
      fs: fsWith({
        writeFileSynced: async (path, data) => {
          if (path.includes('slow.json')) await gate.promise;
          await nodeFileStoreFs.writeFileSynced(path, data);
        },
      }),
    });
    let slowDone = false;
    const slow = store.set('slow', '{"s":1}').then(() => {
      slowDone = true;
    });
    await store.set('fast', '{"f":1}');
    expect(await store.get('fast')).toBe('{"f":1}');
    expect(slowDone).toBe(false);
    // A read of the slow key waits for its write.
    const read = store.get('slow');
    gate.resolve();
    await slow;
    expect(await read).toBe('{"s":1}');
  });
});

describe('electron/main/saves FileStore — reading', () => {
  it('returns a backup that is not JSON when the file itself is missing', async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `save.v1.json${BACKUP_SUFFIX}`), 'half a save');
    expect(await createFileStore(dir).get('save.v1')).toBe('half a save');
  });

  it('ignores a temporary file a crashed write left behind, and the next write replaces it', async () => {
    const store = createFileStore(dir);
    await store.set('save.v1', '{"n":1}');
    writeFileSync(join(dir, `save.v1.json${TEMP_SUFFIX}`), '{"n":"crashed"');
    expect(await store.get('save.v1')).toBe('{"n":1}');
    await store.set('save.v1', '{"n":2}');
    expect(existsSync(join(dir, `save.v1.json${TEMP_SUFFIX}`))).toBe(false);
    expect(await store.get('save.v1')).toBe('{"n":2}');
  });

  it('backs up an existing empty file too', async () => {
    const store = createFileStore(dir);
    await store.set('k', '');
    await store.set('k', '{"n":1}');
    expect(readFileSync(join(dir, `k.json${BACKUP_SUFFIX}`), 'utf8')).toBe('');
    // A corrupt file with an empty (not JSON) backup: the corrupt text is returned as it is.
    writeFileSync(join(dir, 'k.json'), '{"n":');
    expect(await store.get('k')).toBe('{"n":');
  });

  it('never touches the file system for an invalid key or value', async () => {
    const calls: string[] = [];
    /**
     * Records a call.
     *
     * @param name - The operation.
     * @returns A rejected promise (nothing should get this far).
     */
    const record = (name: string): Promise<never> => {
      calls.push(name);
      return Promise.reject(new Error(`unexpected ${name}`));
    };
    const recording: FileStoreFs = {
      readFile: () => record('readFile'),
      writeFileSynced: () => record('writeFileSynced'),
      rename: () => record('rename'),
      copyFile: () => record('copyFile'),
      mkdir: () => record('mkdir'),
      readdir: () => record('readdir'),
      size: () => record('size'),
      unlink: () => record('unlink'),
    };
    const store = createFileStore(dir, { fs: recording, valueMaxBytes: 8 });
    await expect(store.get('../x')).rejects.toBeInstanceOf(StorageKeyError);
    await expect(store.set('a/b', '{}')).rejects.toBeInstanceOf(StorageKeyError);
    await expect(store.set('k', null as unknown as string)).rejects.toBeInstanceOf(StorageKeyError);
    await expect(store.set('k', 'x'.repeat(9))).rejects.toBeInstanceOf(StorageQuotaError);
    expect(calls).toEqual([]);
  });
});

describe('electron/main/saves FileStore — quota and usage', () => {
  it('accepts a value of exactly the limit and a folder of exactly the quota', async () => {
    const store = createFileStore(dir, { quotaBytes: 100, valueMaxBytes: 60 });
    await store.set('a', 'x'.repeat(60));
    // 60 + 40 = 100: exactly the quota.
    await store.set('b', 'y'.repeat(40));
    expect(await store.usage()).toEqual({ bytes: 100, keys: 2, quotaBytes: 100 });
    await expect(store.set('c', 'z')).rejects.toBeInstanceOf(StorageQuotaError);
  });

  it('counts backups but not temporary or foreign files, and a key per main file', async () => {
    const store = createFileStore(dir);
    await store.set('save.v1', '1234');
    await store.set('save.v1', '12345678'); // file 8 + backup 4
    writeFileSync(join(dir, `window.json${TEMP_SUFFIX}`), 'x'.repeat(1000));
    writeFileSync(join(dir, 'notes.txt'), 'x'.repeat(1000));
    // A lone backup (its file gone) still takes space but is not a key.
    writeFileSync(join(dir, `old.json${BACKUP_SUFFIX}`), 'x'.repeat(10));
    expect(await store.usage()).toMatchObject({ bytes: 22, keys: 1 });
  });

  it('measures zero when the folder cannot be listed, and skips files it cannot size', async () => {
    const unlisted = createFileStore(dir, {
      fs: fsWith({ readdir: () => Promise.reject(new Error('EACCES')) }),
    });
    await unlisted.set('k', '{"n":1}');
    expect(await unlisted.get('k')).toBe('{"n":1}');
    expect(await unlisted.usage()).toMatchObject({ bytes: 0, keys: 0 });

    const unsized = createFileStore(dir, {
      fs: fsWith({
        size: (path) =>
          path.endsWith('k.json') ? Promise.reject(new Error('EIO')) : nodeFileStoreFs.size(path),
      }),
    });
    await unsized.set('other', '12');
    expect(await unsized.usage()).toMatchObject({ bytes: 2, keys: 1 });
  });

  it('does not count the rewritten key against itself, only its future backup', async () => {
    // a 30 + b 30 = 60. Rewriting a with 30 more: b 30 + a 30 + a's backup 30 = 90 ≤ 90.
    const store = createFileStore(dir, { quotaBytes: 90 });
    await store.set('a', 'x'.repeat(30));
    await store.set('b', 'x'.repeat(30));
    await store.set('a', 'y'.repeat(30));
    expect(await store.usage()).toMatchObject({ bytes: 90, keys: 2 });
    // Once a's backup exists, the next rewrite replaces it: still 90.
    await store.set('a', 'z'.repeat(30));
    expect(await store.get('a')).toBe('z'.repeat(30));
  });

  it('uses the 1 MiB IPC limit by default', async () => {
    const store = createFileStore(dir);
    const refused = await store
      .set('big', 'x'.repeat(STORAGE_VALUE_MAX_BYTES + 1))
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(StorageQuotaError);
    expect(refused).toMatchObject({
      name: 'StorageQuotaError',
      key: 'big',
      bytes: STORAGE_VALUE_MAX_BYTES + 1,
      limit: STORAGE_VALUE_MAX_BYTES,
    });
    expect((refused as Error).message).toContain('"big"');
    expect(existsSync(dir)).toBe(false);
  });

  it('names its errors', () => {
    expect(new StorageKeyError('bad').name).toBe('StorageKeyError');
    const quota = new StorageQuotaError('save.v1', 12, 10);
    expect(quota.name).toBe('StorageQuotaError');
    expect(quota.message).toBe('storage quota: "save.v1" needs 12 bytes, over the 10-byte limit');
    expect(quota).toBeInstanceOf(Error);
  });
});

describe('electron/main/saves nodeFileStoreFs', () => {
  it('is frozen and wraps node:fs (size, readdir, unlink, mkdir of an existing folder)', async () => {
    expect(Object.isFrozen(nodeFileStoreFs)).toBe(true);
    await nodeFileStoreFs.mkdir(join(dir, 'deep', 'er'));
    await nodeFileStoreFs.mkdir(join(dir, 'deep', 'er'));
    const file = join(dir, 'deep', 'f.json');
    await nodeFileStoreFs.writeFileSynced(file, 'héllo');
    expect(await nodeFileStoreFs.readFile(file)).toBe('héllo');
    expect(await nodeFileStoreFs.size(file)).toBe(6);
    expect((await nodeFileStoreFs.readdir(join(dir, 'deep'))).sort()).toEqual(['er', 'f.json']);
    await nodeFileStoreFs.unlink(file);
    await expect(nodeFileStoreFs.unlink(file)).rejects.toThrow();
    await expect(nodeFileStoreFs.readFile(file)).rejects.toThrow();
    await expect(nodeFileStoreFs.size(file)).rejects.toThrow();
  });
});
