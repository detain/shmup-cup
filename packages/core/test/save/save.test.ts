/**
 * Tests of `core/save` (plan M1-17 acceptance): the round trip through a storage, the version-0
 * fixture migrating to version 1, the corrupt-save fallback (defaults + a copy under
 * `save.corrupt`), unreadable versions, field-by-field sanitising, hi-score insertion and the
 * store writing only on a change.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_OPTIONS, resolveGameConfig } from '../../src/config/index.js';
import { createMemoryStorage, type PlatformStorage } from '../../src/platform/index.js';
import {
  DEFAULT_HI_SCORE_NAME,
  HI_SCORE_TABLE_SIZE,
  MAX_HI_SCORE_TABLES,
  SAVE_CORRUPT_KEY,
  SAVE_MIGRATIONS,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  createDefaultSave,
  createHiScoreEntry,
  createSaveStore,
  hiScoreModeKey,
  insertHiScore,
  loadSave,
  migrateSave,
  moduleInfo,
  parseSave,
  sanitizeSave,
  serializeSave,
  writeSave,
  type HiScoreEntry,
  type SaveData,
} from '../../src/save/index.js';
import { MAX_SCORE } from '../../src/scoring/index.js';

/** The version-0 fixture's text. */
const V0 = readFileSync(new URL('./fixtures/save-v0.json', import.meta.url), 'utf8');

/**
 * A storage that records every write and can be made to fail.
 *
 * @param initial - Stored values.
 */
function recordingStorage(initial: Record<string, string> = {}) {
  const inner = createMemoryStorage(initial);
  const writes: Array<[string, string]> = [];
  const state = { failGet: false, failSet: false, throwSet: false };
  const storage: PlatformStorage = {
    get: (key) => (state.failGet ? Promise.reject(new Error('denied')) : inner.get(key)),
    set: (key, value) => {
      if (state.throwSet) throw new Error('sync failure');
      if (state.failSet) return Promise.reject(new Error('quota'));
      writes.push([key, value]);
      return inner.set(key, value);
    },
  };
  return { storage, writes, state, inner };
}

/**
 * A table of scores (best first) with the default name.
 *
 * @param scores - The scores.
 * @returns The rows.
 */
function table(...scores: number[]): HiScoreEntry[] {
  return scores.map((score) => createHiScoreEntry(score));
}

describe('core/save module', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('save');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §21');
  });

  it('has one migration per older version, chained up to the current one', () => {
    expect(SAVE_VERSION).toBe(2);
    expect(SAVE_STORAGE_KEY).toBe('save.v1');
    expect(SAVE_MIGRATIONS).toHaveLength(SAVE_VERSION);
    SAVE_MIGRATIONS.forEach((step, n) => expect([step.from, step.to]).toEqual([n, n + 1]));
  });

  it('starts from defaults', () => {
    const data = createDefaultSave();
    expect(data).toEqual({
      version: 2,
      options: DEFAULT_USER_OPTIONS,
      hiScores: {},
      stats: { gamesStarted: 0, gameOvers: 0, stagesCleared: 0 },
    });
    expect(Object.isFrozen(data)).toBe(true);
  });
});

describe('core/save round trip', () => {
  it('writes and reads back the same document', async () => {
    const { storage } = recordingStorage();
    const store = createSaveStore(storage, await loadSave(storage));
    store.setOptions({
      audio: { master: 7, music: 3, sfx: 0 },
      // The controls and game options of M2-16 round-trip too.
      input: {
        profileId: 'tizen-remote-diagonal',
        autofire: 'toggle',
        autofireInterval: 6,
        socd: 'lastWins',
        releaseDebounce: 3,
        bindings: { 'tizen-remote-safe': { game: { PowerUp: ['key:427'], Special: ['key:13'] } } },
      },
      game: {
        difficulty: 'hard',
        lives: 5,
        deathPenalty: 'casual',
        autoPowerUp: true,
        pickupMagnet: false,
        oneButton: true,
      },
      // The display options of M2-08 round-trip too.
      display: {
        bulletPalette: 'protanopia',
        scaleMode: 'fit',
        screenShake: false,
        reduceFlashing: true,
        showHitbox: true,
        bossHpBar: false,
      },
    });
    store.recordScore('meter-normal', createHiScoreEntry(12300, { reached: 'zone-a', mode: '1p' }));
    store.count('gameOvers');
    expect(await store.flush()).toBe(true);

    const loaded = await loadSave(storage);
    expect(loaded.status).toBe('ok');
    expect(loaded.fromVersion).toBe(2);
    expect(loaded.data).toEqual(store.data);
    expect(loaded.data.options.input.bindings).toEqual({
      'tizen-remote-safe': { game: { PowerUp: ['key:427'], Special: ['key:13'] } },
    });
    expect(loaded.data.options.game.oneButton).toBe(true);
    expect(loaded.text).toBe(serializeSave(store.data));
    expect(loaded.data.hiScores['meter-normal']).toEqual([
      { name: '---', score: 12300, reached: 'zone-a', mode: '1p', difficulty: '' },
    ]);
    expect(loaded.data.options.display).toEqual({
      bulletPalette: 'protanopia',
      scaleMode: 'fit',
      screenShake: false,
      reduceFlashing: true,
      showHitbox: true,
      bossHpBar: false,
    });
  });

  it('reads a version-1 save written before the M2-08 display options with their defaults', () => {
    const parsed = parseSave(
      JSON.stringify({
        version: 1,
        options: { display: { bulletPalette: 'tritanopia' } },
        hiScores: {},
        stats: {},
      }),
    );
    // Version 1 is migrated to version 2 (M2-16).
    expect(parsed.status).toBe('migrated');
    expect(parsed.data.options.display).toEqual({
      bulletPalette: 'tritanopia',
      scaleMode: 'integer',
      screenShake: true,
      reduceFlashing: false,
      showHitbox: false,
      bossHpBar: false,
    });
  });

  it('serialises every field and parses its own output unchanged', () => {
    const data = sanitizeSave({
      version: 2,
      options: { audio: { master: 2, music: 4, sfx: 6 }, input: { profileId: 'x' } },
      hiScores: { 'meter-hard': [{ name: 'ZED', score: 5 }] },
      stats: { gamesStarted: 3, gameOvers: 2, stagesCleared: 1 },
    });
    const text = serializeSave(data);
    expect(JSON.parse(text)).toEqual({
      version: 2,
      options: {
        audio: { master: 2, music: 4, sfx: 6 },
        input: {
          profileId: 'x',
          autofire: null,
          autofireInterval: null,
          socd: null,
          releaseDebounce: null,
          bindings: {},
        },
        game: {
          difficulty: null,
          lives: null,
          deathPenalty: null,
          autoPowerUp: null,
          pickupMagnet: null,
          oneButton: false,
        },
        display: {
          bulletPalette: 'standard',
          scaleMode: 'integer',
          screenShake: true,
          reduceFlashing: false,
          showHitbox: false,
          bossHpBar: false,
        },
      },
      hiScores: {
        'meter-hard': [{ name: 'ZED', score: 5, reached: '', mode: '', difficulty: '' }],
      },
      stats: { gamesStarted: 3, gameOvers: 2, stagesCleared: 1 },
    });
    expect(parseSave(text)).toEqual({ data, status: 'ok', fromVersion: 2, reason: '' });
  });

  it('writeSave writes unconditionally under the save key', async () => {
    const { storage, writes } = recordingStorage();
    await writeSave(storage, createDefaultSave());
    await writeSave(storage, createDefaultSave());
    expect(writes.map(([key]) => key)).toEqual([SAVE_STORAGE_KEY, SAVE_STORAGE_KEY]);
  });
});

describe('core/save migrations', () => {
  it('migrates the version-0 fixture to the current version (through version 1)', async () => {
    const { storage, writes } = recordingStorage({ [SAVE_STORAGE_KEY]: V0 });
    const loaded = await loadSave(storage);
    expect(loaded.status).toBe('migrated');
    expect(loaded.fromVersion).toBe(0);
    expect(loaded.data.options).toEqual({
      audio: { master: 8, music: 5, sfx: 10 },
      input: { ...DEFAULT_USER_OPTIONS.input, profileId: 'tizen-remote-diagonal' },
      game: DEFAULT_USER_OPTIONS.game,
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
        bossHpBar: false,
      },
    });
    // The flat list became the meter-normal table: sorted, ties keep their order, bad rows dropped.
    const rows = loaded.data.hiScores['meter-normal'];
    expect(rows.map((r) => [r.name, r.score])).toEqual([
      ['BOB', 91000],
      ['ACE', 48200],
      ['CAT', 48200],
      [DEFAULT_HI_SCORE_NAME, 1200],
    ]);
    expect(rows.every((r) => r.mode === '1p' && r.difficulty === 'normal')).toBe(true);
    expect(Object.keys(loaded.data)).not.toContain('unlocks');
    expect(writes).toEqual([]); // nothing written until the store flushes
    // The first flush writes the document in the current layout.
    const store = createSaveStore(storage, loaded);
    expect(await store.flush()).toBe(true);
    expect((await loadSave(storage)).status).toBe('ok');
  });

  it('counts a document without a version as version 0', () => {
    const parsed = parseSave('{"options":{"musicVolume":0.2}}');
    expect([parsed.status, parsed.fromVersion, parsed.data.options.audio.music]).toEqual([
      'migrated',
      0,
      2,
    ]);
  });

  it('chains custom migrations and reports a missing step', () => {
    const steps = [
      { from: 0, to: 1, migrate: (d: Readonly<Record<string, unknown>>) => ({ ...d, a: 1 }) },
      { from: 1, to: 2, migrate: (d: Readonly<Record<string, unknown>>) => ({ ...d, b: 2 }) },
    ];
    expect(migrateSave({ version: 0 }, steps)).toEqual({
      data: { version: 0, a: 1, b: 2 },
      fromVersion: 0,
    });
    expect(() => migrateSave({ version: 0 }, [])).toThrow(RangeError);
    expect(() => migrateSave({ version: 0 }, steps.slice(0, 1))).toThrow(/version 1/);
    expect(() => migrateSave({ version: 3 })).toThrow(/newer/);
    expect(() => migrateSave({ version: -1 })).toThrow(RangeError);
    expect(() => migrateSave({ version: '1' })).toThrow(RangeError);
  });
});

describe('core/save corrupt and unreadable saves', () => {
  it('falls back to defaults and keeps a copy of corrupt JSON under save.corrupt', async () => {
    const { storage, inner } = recordingStorage({ [SAVE_STORAGE_KEY]: '{"version":1,' });
    const loaded = await loadSave(storage);
    expect(loaded.status).toBe('corrupt');
    expect(loaded.reason).not.toBe('');
    expect(loaded.data).toEqual(createDefaultSave());
    expect(await inner.get(SAVE_CORRUPT_KEY)).toBe('{"version":1,');
    expect(await inner.get(SAVE_STORAGE_KEY)).toBe('{"version":1,'); // replaced at the next flush
    const store = createSaveStore(storage, loaded);
    expect(store.dirty).toBe(true);
    expect(await store.flush()).toBe(true);
    expect((await loadSave(storage)).status).toBe('ok');
  });

  it('treats a non-object document as corrupt', () => {
    for (const text of ['[]', 'null', '42', '"save"']) {
      expect(parseSave(text).status, text).toBe('corrupt');
    }
  });

  it('keeps a newer or malformed version aside as unreadable', async () => {
    const newer = JSON.stringify({ version: 9, options: {} });
    const { storage, inner } = recordingStorage({ [SAVE_STORAGE_KEY]: newer });
    const loaded = await loadSave(storage);
    expect(loaded.status).toBe('unreadable');
    expect(loaded.data).toEqual(createDefaultSave());
    expect(await inner.get(SAVE_CORRUPT_KEY)).toBe(newer);
    expect(parseSave('{"version":1.5}').status).toBe('unreadable');
  });

  it('never rejects when the storage fails', async () => {
    const { storage, state } = recordingStorage({ [SAVE_STORAGE_KEY]: 'garbage' });
    state.failSet = true;
    expect((await loadSave(storage)).status).toBe('corrupt'); // the copy failed silently
    state.failGet = true;
    expect(await loadSave(storage)).toMatchObject({ status: 'empty', text: null });
  });

  it('reports an empty storage as a first launch', async () => {
    const loaded = await loadSave(createMemoryStorage());
    expect(loaded).toEqual({
      data: createDefaultSave(),
      status: 'empty',
      fromVersion: null,
      reason: '',
      text: null,
    });
  });
});

describe('core/save sanitising', () => {
  it('replaces unusable fields one by one and keeps the rest', () => {
    const data = sanitizeSave({
      version: 1,
      options: { audio: { master: 99, music: -3, sfx: 'loud' }, input: { profileId: 'Bad Id' } },
      hiScores: {
        'meter-normal': [
          { name: 'A-VERY-LONG-NAME', score: 1e12 },
          { name: 7, score: 10 },
          'row',
          { score: -5 },
          { score: Number.NaN },
        ],
        'Not A Key': [{ score: 1 }],
        'direct-easy': 'not a table',
        'meter-hard': [],
      },
      stats: { gamesStarted: 2.9, gameOvers: -1, stagesCleared: 1e20 },
      extra: true,
    });
    expect(data.options).toEqual({
      audio: { master: 10, music: 0, sfx: 10 },
      input: DEFAULT_USER_OPTIONS.input,
      game: DEFAULT_USER_OPTIONS.game,
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
        bossHpBar: false,
      },
    });
    expect(data.hiScores).toEqual({
      'meter-normal': [
        { name: 'A-VERY-L', score: MAX_SCORE, reached: '', mode: '', difficulty: '' },
        { name: DEFAULT_HI_SCORE_NAME, score: 10, reached: '', mode: '', difficulty: '' },
      ],
    });
    expect(data.stats).toEqual({ gamesStarted: 2, gameOvers: 0, stagesCleared: 0x7fffffff });
    expect(Object.keys(data)).toEqual(['version', 'options', 'hiScores', 'stats']);
  });

  it('cuts each table to ten rows, best first', () => {
    const rows = [];
    for (let i = 1; i <= 15; i++) rows.push({ name: `P${i}`, score: i * 100 });
    const data = sanitizeSave({ hiScores: { 'meter-normal': rows } });
    const kept = data.hiScores['meter-normal'];
    expect(kept).toHaveLength(HI_SCORE_TABLE_SIZE);
    expect(kept[0].score).toBe(1500);
    expect(kept[HI_SCORE_TABLE_SIZE - 1].score).toBe(600);
  });

  it(`keeps at most ${MAX_HI_SCORE_TABLES} tables, in key order`, () => {
    const tables: Record<string, unknown> = {};
    for (let i = 0; i < MAX_HI_SCORE_TABLES + 5; i++) {
      tables[`mode-${String(i).padStart(2, '0')}`] = [{ score: 1 }];
    }
    const kept = Object.keys(sanitizeSave({ hiScores: tables }).hiScores);
    expect(kept).toHaveLength(MAX_HI_SCORE_TABLES);
    expect(kept[0]).toBe('mode-00');
  });
});

describe('core/save hi-scores', () => {
  it('inserts by score, ties below the older rows, and drops what falls off', () => {
    let rows: readonly HiScoreEntry[] = table(900, 500, 500, 100);
    const tie = insertHiScore(rows, createHiScoreEntry(500, { name: 'NEW' }));
    expect(tie.rank).toBe(3);
    expect(tie.table.map((r) => r.name)).toEqual(['---', '---', '---', 'NEW', '---']);
    expect(insertHiScore(rows, createHiScoreEntry(1000)).rank).toBe(0);
    expect(insertHiScore(rows, createHiScoreEntry(50)).rank).toBe(4);
    rows = table(10, 9, 8, 7, 6, 5, 4, 3, 2, 1);
    const full = insertHiScore(rows, createHiScoreEntry(1));
    expect(full).toEqual({ table: rows, rank: -1 }); // a tie with the last row does not enter
    const top = insertHiScore(rows, createHiScoreEntry(11));
    expect(top.table.map((r) => r.score)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    expect(rows).toHaveLength(10); // unchanged
  });

  it('never records a score that is not positive', () => {
    for (const score of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(insertHiScore([], createHiScoreEntry(score)).rank, String(score)).toBe(-1);
    }
    expect(createHiScoreEntry(Number.POSITIVE_INFINITY).score).toBe(0);
  });

  it('names the table after the power-up mode and difficulty', () => {
    expect(hiScoreModeKey(resolveGameConfig())).toBe('meter-normal');
    expect(hiScoreModeKey({ powerUpMode: 'meter', difficulty: 'hard' })).toBe('meter-hard');
  });
});

describe('core/save SaveStore', () => {
  it('writes only when the document changed', async () => {
    const { storage, writes } = recordingStorage();
    const store = createSaveStore(storage, await loadSave(storage));
    expect(await store.flush()).toBe(true); // nothing stored yet: the defaults are written once
    expect(await store.flush()).toBe(false);
    store.setOptions(store.options); // same options: no change
    expect(await store.flush()).toBe(false);
    store.setOptions({ ...store.options, audio: { master: 10, music: 9, sfx: 10 } });
    expect(store.dirty).toBe(true);
    const [first, second] = await Promise.all([store.flush(), store.flush()]);
    expect([first, second]).toEqual([true, false]);
    expect(writes).toHaveLength(2);
    expect(store.writes).toBe(2);
  });

  it('counts a stored save that parsed as-is as written', async () => {
    const { storage, writes } = recordingStorage({
      [SAVE_STORAGE_KEY]: serializeSave(createDefaultSave()),
    });
    const store = createSaveStore(storage, await loadSave(storage));
    expect(store.dirty).toBe(false);
    expect(await store.flush()).toBe(false);
    expect(writes).toEqual([]);
  });

  it('retries after a failed write and never throws', async () => {
    const { storage, state, writes } = recordingStorage();
    const store = createSaveStore(storage);
    state.failSet = true;
    expect(await store.flush()).toBe(false);
    state.failSet = false;
    state.throwSet = true;
    expect(await store.flush()).toBe(false);
    state.throwSet = false;
    expect(await store.flush()).toBe(true);
    expect(writes).toHaveLength(1);
  });

  it('keeps everything in memory without a storage', async () => {
    const store = createSaveStore(null);
    expect(store.recordScore('meter-normal', createHiScoreEntry(10))).toBe(0);
    expect(store.bestScore('meter-normal')).toBe(10);
    expect(await store.flush()).toBe(false);
  });

  it('records scores per mode and rejects malformed mode keys', () => {
    const store = createSaveStore(null);
    expect(store.hiScores('meter-normal')).toEqual([]);
    expect(store.bestScore('meter-normal')).toBe(0);
    expect(store.recordScore('meter-normal', createHiScoreEntry(300))).toBe(0);
    expect(store.recordScore('meter-normal', createHiScoreEntry(200))).toBe(1);
    expect(store.recordScore('meter-hard', createHiScoreEntry(50))).toBe(0);
    expect(store.recordScore('Meter Normal', createHiScoreEntry(999))).toBe(-1);
    expect(store.recordScore('toString', createHiScoreEntry(1))).toBe(-1);
    expect(store.hiScores('toString')).toEqual([]);
    expect(store.bestScore('meter-normal')).toBe(300);
    expect(Object.keys(store.data.hiScores)).toEqual(['meter-normal', 'meter-hard']);
    const before: SaveData = store.data;
    store.count('stagesCleared');
    expect(store.data).not.toBe(before);
    expect(store.data.stats.stagesCleared).toBe(1);
    expect(Object.isFrozen(store.data)).toBe(true);
  });
});
