/**
 * The replay library (plan M3-01, `core/replay` `createReplayLibrary`) over the hosts' Web Storage
 * adapter (M2-17, `storage` module): every replay the library accepts is stored persistently (never
 * refused as over the 256 KiB a value and kept only in memory), and a library full to its caps
 * still leaves room in the app's 1 MiB budget for a save and a corrupt-save copy as large as a
 * value can be.
 */
import {
  EMPTY_CONTENT_DB,
  MAX_KEPT_REPLAY_TEXT,
  MAX_REPLAY_TEXT,
  RUN_REPLAY_FORMAT_VERSION,
  ReplayStoreResult,
  SAVE_CORRUPT_KEY,
  SAVE_STORAGE_KEY,
  SegmentRecorder,
  createReplayHeader,
  createReplayLibrary,
  createWorld,
  replayStorageKey,
  resolveGameConfig,
  runReplayText,
  type RunReplay,
} from '@shmup/core';
import { INPUT_PROFILE_STORAGE_KEY } from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import {
  STORAGE_PREFIX,
  STORAGE_QUOTA_BYTES,
  STORAGE_VALUE_MAX_BYTES,
  createWebStorage,
  storageBytes,
  type WebStorageLike,
} from '../../src/storage/index.js';

/**
 * A plain `localStorage` stand-in (no limit of its own: the adapter's budget is under test).
 *
 * @returns The backend and its entries.
 */
function backendOf(): { backend: WebStorageLike; entries: Map<string, string> } {
  const entries = new Map<string, string>();
  const backend: WebStorageLike & { readonly length: number } = {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
  return { backend, entries };
}

/**
 * A valid run replay whose text is exactly a length (one zero-tick segment, its start padded).
 *
 * @param length - The text's length.
 * @returns The run.
 */
function runOfLength(length: number): RunReplay {
  const config = resolveGameConfig({ seed: 3 });
  const recorder = new SegmentRecorder(1);
  recorder.begin(createReplayHeader(config, { buildId: 'test' }), null);
  const segment = recorder.finish(createWorld(config, EMPTY_CONTENT_DB), 0)!;
  const runWith = (pad: string): RunReplay => ({
    formatVersion: RUN_REPLAY_FORMAT_VERSION,
    buildId: 'test',
    mode: 'arcade',
    label: 'KESTREL ARCADE',
    score: 1,
    reached: 'I',
    assists: 0,
    ticks: 0,
    segments: [{ ...segment, start: { pad } }],
  });
  const bare = runReplayText(runWith('')).length;
  const run = runWith('x'.repeat(length - bare));
  expect(runReplayText(run)).toHaveLength(length);
  return run;
}

describe('shell/storage with the replay library (M3-01)', () => {
  it('stores the longest replay the library accepts persistently', async () => {
    const key = STORAGE_PREFIX + replayStorageKey(0);
    expect(storageBytes(key, 'x'.repeat(MAX_REPLAY_TEXT))).toBeLessThanOrEqual(
      STORAGE_VALUE_MAX_BYTES,
    );
    const { backend, entries } = backendOf();
    const web = createWebStorage(backend);
    const library = createReplayLibrary(web);
    expect(library.storeLast(runOfLength(MAX_REPLAY_TEXT))).toBe(ReplayStoreResult.Ok);
    await Promise.resolve();
    expect(web.issues).toEqual([]);
    expect(entries.get(key)).toHaveLength(MAX_REPLAY_TEXT);
    // A new session reads it back.
    const again = createReplayLibrary(createWebStorage(backend));
    await again.load();
    expect(again.summaries[0]?.label).toBe('KESTREL ARCADE');
  });

  it('leaves room for a save and a corrupt copy as large as a value can be when every slot is full', async () => {
    const { backend, entries } = backendOf();
    const web = createWebStorage(backend);
    const library = createReplayLibrary(web);
    // The kept slots up to their shared budget, then the last game at its own cap.
    for (const [i, length] of [43_334, 43_333, 43_333].entries()) {
      expect(library.storeLast(runOfLength(length))).toBe(ReplayStoreResult.Ok);
      expect(library.keep(0)).toBe(i + 1);
    }
    expect(library.storeLast(runOfLength(MAX_REPLAY_TEXT))).toBe(ReplayStoreResult.Ok);
    expect(library.keep(0)).toBe(-1); // the kept budget is spent
    await Promise.resolve();
    expect(web.issues).toEqual([]);
    expect(web.usage()).toMatchObject({
      keys: 4,
      bytes:
        storageBytes(STORAGE_PREFIX + replayStorageKey(0), 'x'.repeat(MAX_REPLAY_TEXT)) +
        storageBytes(STORAGE_PREFIX + 'replay.1', '') * 3 +
        MAX_KEPT_REPLAY_TEXT * 2,
    });
    // The save and its corrupt copy at the per-value limit, and the input profile, still fit.
    const largest = (key: string): string =>
      'x'.repeat(STORAGE_VALUE_MAX_BYTES / 2 - (STORAGE_PREFIX + key).length);
    await web.set(SAVE_STORAGE_KEY, largest(SAVE_STORAGE_KEY));
    await web.set(SAVE_CORRUPT_KEY, largest(SAVE_CORRUPT_KEY));
    await web.set(INPUT_PROFILE_STORAGE_KEY, 'tizen-remote-diagonal');
    expect(web.issues).toEqual([]);
    expect(entries.get(STORAGE_PREFIX + SAVE_STORAGE_KEY)).toBe(largest(SAVE_STORAGE_KEY));
    expect(web.usage().bytes).toBeLessThanOrEqual(STORAGE_QUOTA_BYTES);
  });
});
