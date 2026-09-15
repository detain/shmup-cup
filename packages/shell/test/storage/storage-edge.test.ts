/**
 * Edge cases of the hosts' Web Storage adapter (plan M2-17, `storage` module): a read that throws
 * switches to memory, a full storage without `removeItem` gets one attempt, a retry after dropping
 * the disposable keys that still fails (or fails differently), the corrupt-save copy never deleted
 * to make room for itself, the legacy quota codes, a custom prefix, a backend whose enumeration
 * throws, the exact limits, frozen issues and usage — and the save import when the write fails.
 */
import {
  SAVE_CORRUPT_KEY,
  SAVE_STORAGE_KEY,
  createSaveStore,
  type PlatformStorage,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  STORAGE_VALUE_MAX_BYTES,
  createWebStorage,
  exportSaveText,
  importSaveText,
  isQuotaExceededError,
  storageBytes,
  type WebStorageLike,
} from '../../src/storage/index.js';

/**
 * A browser-like quota error.
 *
 * @param fields - The error's `name` / `code`.
 * @returns The error.
 */
function quotaError(fields: { name?: string; code?: number } = {}): Error {
  const error = new Error('The quota has been exceeded.');
  error.name = fields.name ?? 'QuotaExceededError';
  if (fields.code !== undefined) Object.assign(error, { code: fields.code });
  return error;
}

/**
 * A scripted backend: `setItem` answers from a queue of outcomes (`'ok'` or an error), then 'ok'.
 *
 * @param outcomes - What the next `setItem` calls do.
 * @param options - Leave out `removeItem`, or make `key()` throw.
 * @returns The backend, its entries and the log of calls.
 */
function scripted(
  outcomes: Array<'ok' | Error>,
  options: { removeItem?: boolean; keyThrows?: boolean } = {},
) {
  const entries = new Map<string, string>();
  const log: string[] = [];
  const backend: WebStorageLike & { length: number } = {
    get length() {
      return entries.size;
    },
    key: (index) => {
      if (options.keyThrows === true) throw new Error('SecurityError');
      return [...entries.keys()][index] ?? null;
    },
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      log.push(`set ${key}`);
      const outcome = outcomes.shift() ?? 'ok';
      if (outcome !== 'ok') throw outcome;
      entries.set(key, value);
    },
  };
  if (options.removeItem !== false) {
    backend.removeItem = (key) => {
      log.push(`remove ${key}`);
      entries.delete(key);
    };
  }
  return { backend, entries, log };
}

describe('shell/storage createWebStorage edges', () => {
  it('recognises the legacy quota codes and nothing else', () => {
    expect(isQuotaExceededError(quotaError({ name: 'Error', code: 1014 }))).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ name: 'SecurityError', code: 18 })).toBe(false);
    expect(isQuotaExceededError('QuotaExceededError')).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
    expect(isQuotaExceededError(22)).toBe(false);
  });

  it('switches to memory for good when a read throws', async () => {
    const entries = new Map<string, string>([['shmup-cup:save.v1', 'old']]);
    let denied = false;
    const writes: string[] = [];
    const web = createWebStorage({
      getItem: (key) => {
        if (denied) throw new Error('SecurityError');
        return entries.get(key) ?? null;
      },
      setItem: (key, value) => {
        writes.push(key);
        entries.set(key, value);
      },
    });
    expect(await web.get('save.v1')).toBe('old');
    denied = true;
    expect(await web.get('save.v1')).toBeNull();
    denied = false;
    await web.set('save.v1', 'new');
    expect(writes).toEqual([]);
    expect(await web.get('save.v1')).toBe('new');
    expect(web.usage().persistent).toBe(false);
    // A read failure is not a write issue.
    expect(web.issues).toEqual([]);
  });

  it('tries a full storage once when it cannot delete anything', async () => {
    const { backend, log } = scripted([quotaError(), quotaError()], { removeItem: false });
    const web = createWebStorage(backend);
    await web.set('save.v1', '{}');
    expect(log).toEqual(['set shmup-cup:save.v1']);
    expect(web.issues.map((issue) => issue.kind)).toEqual(['quota-exceeded']);
    expect(await web.get('save.v1')).toBe('{}');
  });

  it('tries once more after dropping the corrupt copy, and reports a second refusal', async () => {
    // The next three writes fail with a full storage.
    const { backend, entries, log } = scripted([quotaError(), quotaError(), quotaError()]);
    entries.set(`shmup-cup:${SAVE_CORRUPT_KEY}`, 'junk');
    const web = createWebStorage(backend);
    await web.set(SAVE_STORAGE_KEY, '{"v":2}');
    expect(log).toEqual([
      `set shmup-cup:${SAVE_STORAGE_KEY}`,
      `remove shmup-cup:${SAVE_CORRUPT_KEY}`,
      `set shmup-cup:${SAVE_STORAGE_KEY}`,
    ]);
    expect(entries.has(`shmup-cup:${SAVE_CORRUPT_KEY}`)).toBe(false);
    expect(web.issues.map((issue) => issue.kind)).toEqual(['quota-exceeded']);
    expect(await web.get(SAVE_STORAGE_KEY)).toBe('{"v":2}');
    // Nothing left to drop the second time: one attempt only.
    await web.set(SAVE_STORAGE_KEY, '{"v":3}');
    expect(log).toHaveLength(4);
    expect(web.issues.map((issue) => issue.kind)).toEqual(['quota-exceeded', 'quota-exceeded']);
    expect(await web.get(SAVE_STORAGE_KEY)).toBe('{"v":3}');
  });

  it('switches to memory when the retry fails with another error', async () => {
    const { backend, entries } = scripted([quotaError(), new Error('SecurityError')]);
    entries.set(`shmup-cup:${SAVE_CORRUPT_KEY}`, 'junk');
    const web = createWebStorage(backend);
    await web.set(SAVE_STORAGE_KEY, '{}');
    expect(web.issues.map((issue) => issue.kind)).toEqual(['unavailable']);
    expect(web.usage().persistent).toBe(false);
    expect(await web.get(SAVE_STORAGE_KEY)).toBe('{}');
  });

  it('never deletes the corrupt-save copy to make room for itself', async () => {
    const { backend, entries, log } = scripted([quotaError()]);
    entries.set(`shmup-cup:${SAVE_CORRUPT_KEY}`, 'older junk');
    const web = createWebStorage(backend);
    await web.set(SAVE_CORRUPT_KEY, 'new junk');
    expect(log).toEqual([`set shmup-cup:${SAVE_CORRUPT_KEY}`]);
    expect(entries.get(`shmup-cup:${SAVE_CORRUPT_KEY}`)).toBe('older junk');
    expect(web.issues).toEqual([
      {
        kind: 'quota-exceeded',
        key: SAVE_CORRUPT_KEY,
        bytes: storageBytes(`shmup-cup:${SAVE_CORRUPT_KEY}`, 'new junk'),
      },
    ]);
  });

  it('retries after a legacy quota code (Safari 22 / Firefox 1014) too', async () => {
    const { backend, entries } = scripted([quotaError({ name: 'Error', code: 1014 })]);
    entries.set(`shmup-cup:${SAVE_CORRUPT_KEY}`, 'junk');
    const web = createWebStorage(backend);
    await web.set(SAVE_STORAGE_KEY, '{}');
    expect(entries.get(`shmup-cup:${SAVE_STORAGE_KEY}`)).toBe('{}');
    expect(web.issues).toEqual([]);
  });

  it('keeps to its own prefix, for keys, usage and the dropped copy', async () => {
    const { backend, entries } = scripted([]);
    entries.set('shmup-cup:save.v1', 'another build');
    const web = createWebStorage(backend, { prefix: 'dev:' });
    await web.set('save.v1', '12');
    expect(entries.get('dev:save.v1')).toBe('12');
    expect(entries.get('shmup-cup:save.v1')).toBe('another build');
    expect(web.usage()).toMatchObject({ keys: 1, bytes: storageBytes('dev:save.v1', '12') });
  });

  it('measures what it saw when enumerating the backend throws', async () => {
    const { backend } = scripted([], { keyThrows: true });
    const web = createWebStorage(backend);
    await web.set('a', '1');
    await web.set('b', '22');
    expect(web.usage()).toMatchObject({
      keys: 2,
      bytes: storageBytes('shmup-cup:a', '1') + storageBytes('shmup-cup:b', '22'),
    });
  });

  it('accepts a value of exactly the limits', async () => {
    const { backend, entries } = scripted([]);
    const key = 'shmup-cup:k';
    const fits = 'x'.repeat(50 - key.length);
    const web = createWebStorage(backend, { valueMaxBytes: 100, quotaBytes: 100 });
    await web.set('k', fits);
    expect(storageBytes(key, fits)).toBe(100);
    expect(entries.get(key)).toBe(fits);
    await web.set('k', `${fits}x`);
    expect(web.issues.map((issue) => issue.kind)).toEqual(['over-budget']);
    expect(STORAGE_VALUE_MAX_BYTES).toBe(256 * 1024);
  });

  it('freezes its issues and usage', async () => {
    const { backend } = scripted([]);
    const web = createWebStorage(backend, { valueMaxBytes: 10 });
    await web.set('k', 'far too long');
    expect(Object.isFrozen(web.issues[0])).toBe(true);
    expect(Object.isFrozen(web.usage())).toBe(true);
  });

  it('reads back every write while the backend stays in use, stored or kept in memory', async () => {
    const { backend, entries } = scripted([quotaError(), 'ok'], { removeItem: false });
    const web = createWebStorage(backend, { valueMaxBytes: 70 });
    await web.set('a', 'refused by the browser');
    await web.set('b', 'stored');
    await web.set('c', 'x'.repeat(40)); // 102 bytes: over the 70-byte budget
    for (const [key, value] of [
      ['a', 'refused by the browser'],
      ['b', 'stored'],
      ['c', 'x'.repeat(40)],
    ]) {
      expect(await web.get(key), key).toBe(value);
    }
    expect([...entries.keys()]).toEqual(['shmup-cup:b']);
    expect(web.issues.map((issue) => `${issue.kind} ${issue.key}`)).toEqual([
      'quota-exceeded a',
      'over-budget c',
    ]);
    // Usage counts what the backend holds, not the values kept in memory.
    expect(web.usage()).toMatchObject({ keys: 1, persistent: true });
  });
});

describe('shell/storage save import edges', () => {
  it('imports but reports an unwritten save when the storage refuses the write', async () => {
    const refusing: PlatformStorage = {
      get: () => Promise.resolve(null),
      set: () => Promise.reject(new Error('disk full')),
    };
    const store = createSaveStore(refusing);
    const text = exportSaveText(createSaveStore(null));
    const result = await importSaveText(store, `\n  ${text}\n`);
    expect(result).toEqual({ ok: true, status: 'ok', reason: '', written: false });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('exports canonical JSON that imports back to the same document', async () => {
    const source = createSaveStore(null);
    const text = exportSaveText(source);
    expect(JSON.parse(text)).toEqual(source.data);
    const target = createSaveStore(null);
    expect((await importSaveText(target, text)).ok).toBe(true);
    expect(exportSaveText(target)).toBe(text);
  });
});
