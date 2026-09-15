/**
 * `SaveStore.replace` (plan M2-17 — the debug tools' save import): the whole document is swapped,
 * sanitised again, and written by the next flush.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG,
  createHiScoreEntry,
  createMemoryStorage,
  createSaveStore,
  hiScoreModeKey,
  loadSave,
  parseSave,
  type SaveData,
} from '../../src/index.js';

describe('core/save SaveStore.replace', () => {
  it('replaces the document and writes it at the next flush', async () => {
    const storage = createMemoryStorage();
    const store = createSaveStore(storage);
    const other = createSaveStore(null);
    const key = hiScoreModeKey(DEFAULT_GAME_CONFIG);
    other.recordScore(key, createHiScoreEntry(777));
    store.replace(other.data);
    expect(store.bestScore(key)).toBe(777);
    expect(store.dirty).toBe(true);
    expect(await store.flush()).toBe(true);
    expect((await loadSave(storage)).data).toEqual(other.data);
  });

  it('sanitises what it is handed', () => {
    const store = createSaveStore(null);
    const broken = {
      ...parseSave(null).data,
      options: { audio: { master: 99, music: -1, sfx: 'x' } },
      hiScores: { 'NOT A KEY': [] },
      stats: { gamesStarted: -3 },
    } as unknown as SaveData;
    store.replace(broken);
    // Volumes are levels 0 … 10 (core/config): clamped, and a non-number takes the default.
    expect(store.data.options.audio.master).toBe(10);
    expect(store.data.options.audio.music).toBe(0);
    expect(store.data.options.audio.sfx).toBe(createSaveStore(null).data.options.audio.sfx);
    expect(store.data.hiScores).toEqual({});
    expect(store.data.stats.gamesStarted).toBe(0);
    expect(Object.isFrozen(store.data)).toBe(true);
  });
});
