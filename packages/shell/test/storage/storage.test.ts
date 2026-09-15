/**
 * The hosts' Web Storage adapter with quota checks (plan M2-17, `storage` module) against a fake
 * `localStorage` that counts bytes like a browser and can refuse writes: the budget, the quota
 * error's retry after dropping the disposable keys, unavailable storage, the usage — and the debug
 * save export / import.
 */
import {
  SAVE_CORRUPT_KEY,
  SAVE_STORAGE_KEY,
  createHiScoreEntry,
  createMemoryStorage,
  createSaveStore,
  hiScoreModeKey,
  DEFAULT_GAME_CONFIG,
  loadSave,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DISPOSABLE_STORAGE_KEYS,
  STORAGE_PREFIX,
  STORAGE_QUOTA_BYTES,
  createWebStorage,
  exportSaveText,
  importSaveText,
  isQuotaExceededError,
  moduleInfo,
  storageBytes,
  type StorageIssue,
  type WebStorageLike,
} from '../../src/storage/index.js';

/** A browser-like quota error. */
function quotaError(): Error {
  const error = new Error('The quota has been exceeded.');
  error.name = 'QuotaExceededError';
  return error;
}

/**
 * A fake `localStorage` with a byte limit (two bytes a character, like browsers).
 *
 * @param limit - Bytes it holds before refusing writes.
 * @returns The storage and its entries.
 */
function fakeLocalStorage(limit = Number.POSITIVE_INFINITY) {
  const entries = new Map<string, string>();
  const state = { denied: false, writes: 0 };
  const used = (): number => {
    let bytes = 0;
    for (const [key, value] of entries) bytes += (key.length + value.length) * 2;
    return bytes;
  };
  const storage: WebStorageLike & { readonly length: number } = {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => {
      if (state.denied) throw new Error('SecurityError');
      return entries.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (state.denied) throw new Error('SecurityError');
      const old = entries.get(key);
      const next = used() - (old === undefined ? 0 : (key.length + old.length) * 2);
      if (next + (key.length + value.length) * 2 > limit) throw quotaError();
      entries.set(key, value);
      state.writes++;
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
  return { storage, entries, state };
}

describe('shell/storage createWebStorage', () => {
  it('describes itself and counts bytes like a browser', () => {
    expect(moduleInfo.name).toBe('storage');
    expect(storageBytes('shmup-cup:save.v1', '{}')).toBe(38);
    expect(STORAGE_PREFIX).toBe('shmup-cup:');
    expect(DISPOSABLE_STORAGE_KEYS).toEqual([SAVE_CORRUPT_KEY]);
    expect(isQuotaExceededError(quotaError())).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaExceededError(new Error('QuotaExceededError'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });

  it('stores under the prefix and reports its usage', async () => {
    const { storage, entries } = fakeLocalStorage();
    entries.set('other-app:x', 'y'.repeat(1000));
    const web = createWebStorage(storage);
    await web.set('save.v1', '{"v":1}');
    expect(entries.get('shmup-cup:save.v1')).toBe('{"v":1}');
    expect(await web.get('save.v1')).toBe('{"v":1}');
    expect(await web.get('missing')).toBeNull();
    expect(web.usage()).toEqual({
      bytes: storageBytes('shmup-cup:save.v1', '{"v":1}'),
      keys: 1,
      quotaBytes: STORAGE_QUOTA_BYTES,
      persistent: true,
    });
    expect(web.issues).toEqual([]);
  });

  it('keeps a value over the per-value limit in memory, reported, and the backend untouched', async () => {
    const { storage, entries } = fakeLocalStorage();
    const issues: StorageIssue[] = [];
    const web = createWebStorage(storage, { valueMaxBytes: 100, onIssue: (i) => issues.push(i) });
    await web.set('save.v1', 'small');
    await web.set('save.v1', 'x'.repeat(100));
    expect(entries.get('shmup-cup:save.v1')).toBe('small');
    expect(await web.get('save.v1')).toBe('x'.repeat(100));
    expect(issues).toEqual([
      {
        kind: 'over-budget',
        key: 'save.v1',
        bytes: storageBytes('shmup-cup:save.v1', 'x'.repeat(100)),
      },
    ]);
    // A value that fits again goes back to the backend and leaves memory.
    await web.set('save.v1', 'fits');
    expect(entries.get('shmup-cup:save.v1')).toBe('fits');
    expect(await web.get('save.v1')).toBe('fits');
  });

  it('checks the budget of all app keys, counting keys earlier sessions wrote', async () => {
    const { storage, entries } = fakeLocalStorage();
    entries.set('shmup-cup:old', 'z'.repeat(400)); // 826 bytes from an earlier session
    const web = createWebStorage(storage, { quotaBytes: 1000 });
    await web.set('save.v1', 'a'.repeat(50)); // 826 + 134 = 960 ≤ 1000
    expect(entries.has('shmup-cup:save.v1')).toBe(true);
    await web.set('save.v1', 'a'.repeat(70)); // 826 + 174 = 1000: still fits (it replaces 134)
    await web.set('save.v1', 'a'.repeat(80)); // 826 + 194 > 1000: memory
    expect(entries.get('shmup-cup:save.v1')).toBe('a'.repeat(70));
    expect(web.issues.map((issue) => issue.kind)).toEqual(['over-budget']);
    expect(web.usage().bytes).toBe(1000);
  });

  it('drops the corrupt-save copy and retries once when the browser storage is full', async () => {
    const { storage, entries } = fakeLocalStorage(400);
    const web = createWebStorage(storage);
    await web.set(SAVE_CORRUPT_KEY, 'c'.repeat(120));
    expect(entries.has(`shmup-cup:${SAVE_CORRUPT_KEY}`)).toBe(true);
    await web.set(SAVE_STORAGE_KEY, 's'.repeat(80));
    expect(entries.get(`shmup-cup:${SAVE_STORAGE_KEY}`)).toBe('s'.repeat(80));
    expect(entries.has(`shmup-cup:${SAVE_CORRUPT_KEY}`)).toBe(false);
    expect(web.issues).toEqual([]);
  });

  it('keeps a value the full storage still refuses in memory, and keeps using the backend', async () => {
    const { storage, entries } = fakeLocalStorage(200);
    const web = createWebStorage(storage);
    await web.set('save.v1', 'x'.repeat(200));
    expect(entries.has('shmup-cup:save.v1')).toBe(false);
    expect(await web.get('save.v1')).toBe('x'.repeat(200));
    expect(web.issues.map((issue) => issue.kind)).toEqual(['quota-exceeded']);
    // The next, smaller write reaches the backend again.
    await web.set('save.v1', 'ok');
    expect(entries.get('shmup-cup:save.v1')).toBe('ok');
    expect(await web.get('save.v1')).toBe('ok');
    expect(web.usage().persistent).toBe(true);
  });

  it('switches to memory for good when storage is unavailable, and never rejects', async () => {
    const { storage, state } = fakeLocalStorage();
    const web = createWebStorage(storage);
    await web.set('a', '1');
    state.denied = true;
    await expect(web.set('b', '2')).resolves.toBeUndefined();
    expect(web.issues.map((issue) => issue.kind)).toEqual(['unavailable']);
    state.denied = false;
    await web.set('c', '3');
    expect(state.writes).toBe(1);
    expect(await web.get('b')).toBe('2');
    expect(await web.get('c')).toBe('3');
    expect(web.usage().persistent).toBe(false);
    // A null backend is memory from the start.
    const memory = createWebStorage(null);
    await memory.set('k', 'v');
    expect(await memory.get('k')).toBe('v');
    expect(memory.usage()).toMatchObject({ persistent: false, keys: 0 });
  });

  it('measures what it saw when the backend cannot enumerate its keys', async () => {
    const entries = new Map<string, string>();
    const web = createWebStorage({
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value);
      },
    });
    await web.set('a', '12');
    expect(web.usage()).toMatchObject({ bytes: storageBytes('shmup-cup:a', '12'), keys: 1 });
  });
});

describe('shell/storage save export / import', () => {
  it('exports the save as readable JSON and imports it into another store', async () => {
    const source = createSaveStore(null);
    source.recordScore(hiScoreModeKey(DEFAULT_GAME_CONFIG), createHiScoreEntry(12300));
    const text = exportSaveText(source);
    expect(text).toContain('\n  "version": 2');
    expect(text).toContain('12300');

    const storage = createMemoryStorage();
    const target = createSaveStore(storage);
    const result = await importSaveText(target, text);
    expect(result).toEqual({ ok: true, status: 'ok', reason: '', written: true });
    expect(target.bestScore(hiScoreModeKey(DEFAULT_GAME_CONFIG))).toBe(12300);
    expect((await loadSave(storage)).data).toEqual(source.data);
  });

  it('migrates an older save on import', async () => {
    const target = createSaveStore(createMemoryStorage());
    const result = await importSaveText(target, '{"version":1,"options":{}}');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('migrated');
    expect(target.data.version).toBe(2);
  });

  it('refuses empty, corrupt and unreadable texts and changes nothing', async () => {
    const target = createSaveStore(createMemoryStorage());
    target.recordScore(hiScoreModeKey(DEFAULT_GAME_CONFIG), createHiScoreEntry(500));
    const before = target.data;
    for (const [text, status] of [
      ['   ', 'empty'],
      ['{oops', 'corrupt'],
      ['[1]', 'corrupt'],
      ['{"version":99}', 'unreadable'],
    ] as const) {
      const result = await importSaveText(target, text);
      expect(result.ok, text).toBe(false);
      expect(result.status, text).toBe(status);
      expect(result.reason, text).not.toBe('');
      expect(result.written).toBe(false);
    }
    expect(target.data).toBe(before);
  });
});
