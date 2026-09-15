/**
 * The desktop build's file saves (plan M2-17, `main/saves.ts` `FileStore`) against a real
 * temporary folder: one JSON file per key, atomic writes (temporary file + rename, never a
 * half-written file), the previous text kept as a backup and used when the file is missing or
 * corrupt, serialised writes, key validation and the quota.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_SUFFIX,
  FILE_STORE_QUOTA_BYTES,
  StorageKeyError,
  StorageQuotaError,
  TEMP_SUFFIX,
  createFileStore,
  nodeFileStoreFs,
  storageFileName,
  type FileStoreFs,
} from '../../src/main/saves.js';

let root = '';
let dir = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'shmup-saves-'));
  dir = join(root, 'userData', 'saves');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const SAVE = '{"version":2,"options":{}}';

describe('electron/main/saves FileStore', () => {
  it('reads null before anything is written, without creating the folder', async () => {
    const store = createFileStore(dir);
    expect(store.directory).toBe(dir);
    expect(await store.get('save.v1')).toBeNull();
    expect(existsSync(dir)).toBe(false);
    expect(await store.usage()).toEqual({ bytes: 0, keys: 0, quotaBytes: FILE_STORE_QUOTA_BYTES });
  });

  it('writes one JSON file per key in a folder it creates, and reads it back', async () => {
    const store = createFileStore(dir);
    await store.set('save.v1', SAVE);
    await store.set('window', '{"scale":4}');
    expect(readFileSync(join(dir, 'save.v1.json'), 'utf8')).toBe(SAVE);
    expect(await store.get('save.v1')).toBe(SAVE);
    expect(await store.get('window')).toBe('{"scale":4}');
    expect(readdirSync(dir).sort()).toEqual(['save.v1.json', 'window.json']);
    // A new store over the same folder (the next launch) reads the same text.
    expect(await createFileStore(dir).get('save.v1')).toBe(SAVE);
  });

  it('keeps the previous text as the backup and leaves no temporary file', async () => {
    const store = createFileStore(dir);
    await store.set('save.v1', '{"n":1}');
    expect(existsSync(join(dir, `save.v1.json${BACKUP_SUFFIX}`))).toBe(false);
    await store.set('save.v1', '{"n":2}');
    await store.set('save.v1', '{"n":3}');
    expect(readFileSync(join(dir, 'save.v1.json'), 'utf8')).toBe('{"n":3}');
    expect(readFileSync(join(dir, `save.v1.json${BACKUP_SUFFIX}`), 'utf8')).toBe('{"n":2}');
    expect(readdirSync(dir).some((name) => name.endsWith(TEMP_SUFFIX))).toBe(false);
  });

  it('falls back to the backup when the file is corrupt (not JSON) or missing', async () => {
    const store = createFileStore(dir);
    await store.set('save.v1', '{"n":1}');
    await store.set('save.v1', '{"n":2}');
    writeFileSync(join(dir, 'save.v1.json'), '{"n":2, trunc');
    expect(await store.get('save.v1')).toBe('{"n":1}');
    rmSync(join(dir, 'save.v1.json'));
    expect(await store.get('save.v1')).toBe('{"n":1}');
  });

  it('returns a corrupt file as it is when the backup is no better (the core parser decides)', async () => {
    const store = createFileStore(dir);
    await store.set('save.v1', '{"n":1}');
    writeFileSync(join(dir, 'save.v1.json'), 'garbage');
    expect(await store.get('save.v1')).toBe('garbage');
    writeFileSync(join(dir, `save.v1.json${BACKUP_SUFFIX}`), 'also garbage');
    expect(await store.get('save.v1')).toBe('garbage');
  });

  it('never leaves a half-written file: a failed rename keeps the old text and drops the temp file', async () => {
    let failRename = false;
    const fs: FileStoreFs = {
      ...nodeFileStoreFs,
      rename: (from, to) =>
        failRename ? Promise.reject(new Error('EIO')) : nodeFileStoreFs.rename(from, to),
    };
    const store = createFileStore(dir, { fs });
    await store.set('save.v1', '{"n":1}');
    failRename = true;
    await expect(store.set('save.v1', '{"n":2}')).rejects.toThrow('EIO');
    expect(readFileSync(join(dir, 'save.v1.json'), 'utf8')).toBe('{"n":1}');
    expect(existsSync(join(dir, `save.v1.json${TEMP_SUFFIX}`))).toBe(false);
    expect(await store.get('save.v1')).toBe('{"n":1}');
    // The store keeps working after a failure.
    failRename = false;
    await store.set('save.v1', '{"n":3}');
    expect(await store.get('save.v1')).toBe('{"n":3}');
  });

  it('flushes the data before the rename (writeFileSynced), then renames the temp file', async () => {
    const calls: string[] = [];
    const fs: FileStoreFs = {
      ...nodeFileStoreFs,
      writeFileSynced: async (path, data) => {
        calls.push(`write ${path.slice(dir.length + 1)}`);
        await nodeFileStoreFs.writeFileSynced(path, data);
      },
      copyFile: async (from, to) => {
        calls.push(`copy ${from.slice(dir.length + 1)} ${to.slice(dir.length + 1)}`);
        await nodeFileStoreFs.copyFile(from, to);
      },
      rename: async (from, to) => {
        calls.push(`rename ${from.slice(dir.length + 1)} ${to.slice(dir.length + 1)}`);
        await nodeFileStoreFs.rename(from, to);
      },
    };
    const store = createFileStore(dir, { fs });
    await store.set('k', '1');
    await store.set('k', '2');
    expect(calls).toEqual([
      'write k.json.tmp',
      'rename k.json.tmp k.json',
      'write k.json.tmp',
      'copy k.json k.json.bak',
      'rename k.json.tmp k.json',
    ]);
  });

  it('runs the writes to one key in order (the last write wins) and reads after pending writes', async () => {
    const store = createFileStore(dir);
    const writes = [1, 2, 3, 4, 5].map((n) => store.set('save.v1', `{"n":${n}}`));
    const read = store.get('save.v1');
    await Promise.all(writes);
    expect(await read).toBe('{"n":5}');
    expect(readFileSync(join(dir, `save.v1.json${BACKUP_SUFFIX}`), 'utf8')).toBe('{"n":4}');
  });

  it('refuses keys that are not one plain file name', async () => {
    const store = createFileStore(dir);
    for (const key of ['', '../evil', 'a/b', 'a\\b', '.hidden', 'x.', 'a b', 'x'.repeat(65)]) {
      await expect(store.get(key), key).rejects.toBeInstanceOf(StorageKeyError);
      await expect(store.set(key, '{}'), key).rejects.toBeInstanceOf(StorageKeyError);
    }
    expect(() => storageFileName('../x')).toThrow(StorageKeyError);
    expect(storageFileName('save.v1')).toBe('save.v1.json');
    await expect(store.set('k', 42 as unknown as string)).rejects.toBeInstanceOf(StorageKeyError);
    expect(existsSync(dir)).toBe(false);
  });

  it('refuses a value over its limit and a write that would take the folder over its quota', async () => {
    const store = createFileStore(dir, { quotaBytes: 100, valueMaxBytes: 60 });
    await expect(store.set('big', 'x'.repeat(61))).rejects.toBeInstanceOf(StorageQuotaError);
    await store.set('a', 'x'.repeat(40));
    // 40 (a) + 50 (b) = 90 ≤ 100.
    await store.set('b', 'x'.repeat(50));
    // Rewriting b with 55: a 40 + b 55 + b's backup 50 = 145 > 100.
    const refused = await store.set('b', 'x'.repeat(55)).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(StorageQuotaError);
    expect((refused as StorageQuotaError).bytes).toBe(145);
    expect((refused as StorageQuotaError).limit).toBe(100);
    expect(await store.get('b')).toBe('x'.repeat(50));
    expect(await store.usage()).toEqual({ bytes: 90, keys: 2, quotaBytes: 100 });
  });

  it('counts UTF-8 bytes for the value limit', async () => {
    const store = createFileStore(dir, { valueMaxBytes: 8 });
    await store.set('k', '"éé"'); // 6 bytes
    await expect(store.set('k', '"éééé"')).rejects.toBeInstanceOf(StorageQuotaError); // 10 bytes
  });
});
