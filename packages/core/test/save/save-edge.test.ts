/**
 * Edge cases of `core/save` (plan M1-17): the version-0 migration read field by field, migration
 * chains that fail, every kind of unusable text (empty, whitespace, `null`, a throwing migration),
 * hostile keys (`__proto__`, `constructor`), the sanitiser's limits (key length, table count,
 * counters, `-0`), the canonical serialisation (a reloaded save with several tables is not
 * "dirty"), storages that answer oddly or throw, hi-score insertion at the table's edges and the
 * store's write-on-change bookkeeping when overlapping writes fail.
 *
 * Regression tests (review / test findings fixed in the same commit):
 * - a save whose hi-score tables were recorded in non-alphabetical order was rewritten after
 *   every reload although nothing changed (the serialisation followed the insertion order, the
 *   sanitiser sorted the keys);
 * - two overlapping flushes that both failed left the store believing the first text was stored,
 *   so a later flush of that same document was skipped;
 * - `-0` leaked out of the defensive parsing (volume levels, statistics counters).
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { createMemoryStorage, type PlatformStorage } from '../../src/platform/index.js';
import {
  DEFAULT_HI_SCORE_NAME,
  HI_SCORE_NAME_MAX,
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
  parseSave,
  sanitizeSave,
  serializeSave,
  writeSave,
  type HiScoreEntry,
  type SaveData,
  type SaveMigration,
} from '../../src/save/index.js';
import { MAX_SCORE } from '../../src/scoring/index.js';

/** A pending storage write the test settles by hand. */
interface PendingWrite {
  /** Stored key. */
  readonly key: string;
  /** Stored text. */
  readonly value: string;
  /** Lets the write succeed. */
  resolve(): void;
  /** Lets the write fail. */
  reject(): void;
}

/**
 * A storage whose writes stay pending until the test settles them (to overlap flushes).
 *
 * @returns The storage, its pending writes and what it holds.
 */
function manualStorage() {
  const stored = new Map<string, string>();
  const pending: PendingWrite[] = [];
  const storage: PlatformStorage = {
    get: (key) => Promise.resolve(stored.get(key) ?? null),
    set: (key, value) =>
      new Promise<void>((resolve, reject) => {
        pending.push({
          key,
          value,
          resolve: () => {
            stored.set(key, value);
            resolve();
          },
          reject: () => reject(new Error('quota')),
        });
      }),
  };
  return { storage, pending, stored };
}

/**
 * The scores of a table.
 *
 * @param rows - The rows.
 * @returns Their scores.
 */
const scores = (rows: readonly HiScoreEntry[]): number[] => rows.map((row) => row.score);

/**
 * A full table of descending scores 100, 90 … 10.
 *
 * @returns The rows.
 */
function fullTable(): readonly HiScoreEntry[] {
  const rows: HiScoreEntry[] = [];
  for (let i = HI_SCORE_TABLE_SIZE; i >= 1; i--) rows.push(createHiScoreEntry(i * 10));
  return Object.freeze(rows);
}

describe('core/save version-0 migration (edge)', () => {
  const migrateV0 = (doc: Readonly<Record<string, unknown>>) => SAVE_MIGRATIONS[0].migrate(doc);

  it('turns float volumes into rounded, clamped levels; unusable ones take the default', () => {
    const data = sanitizeSave(
      migrateV0({
        options: { masterVolume: 0.55, musicVolume: 1.7, sfxVolume: -0.3, profile: 'Bad Id' },
      }),
    );
    expect(data.options.audio).toEqual({ master: 6, music: 10, sfx: 0 });
    expect(data.options.input.profileId).toBeNull();
    const defaults = sanitizeSave(
      migrateV0({ options: { masterVolume: '0.5', musicVolume: null, sfxVolume: Infinity } }),
    );
    expect(defaults.options.audio).toEqual({ master: 10, music: 10, sfx: 10 });
  });

  it('reads a document without options or hi-scores as the defaults', () => {
    for (const doc of [{}, { options: 'x', hiScores: 'y' }, { options: [], hiScores: {} }]) {
      const migrated = migrateV0(doc);
      expect(migrated.version, JSON.stringify(doc)).toBe(1);
      expect(migrated.hiScores).toEqual({});
      expect(sanitizeSave(migrated)).toEqual(createDefaultSave());
    }
  });

  it('files every row under meter-normal as a 1p Normal game, whatever the row claimed', () => {
    const migrated = migrateV0({
      hiScores: [{ name: 'ZED', score: 10, mode: 'boss-rush', difficulty: 'hard' }, 7, null],
    });
    expect(migrated.hiScores).toEqual({
      'meter-normal': [{ name: 'ZED', score: 10, mode: '1p', difficulty: 'normal' }],
    });
  });

  it('migrates an explicit version 0 like a missing one and drops the unlocks', () => {
    const parsed = parseSave(
      JSON.stringify({ version: 0, options: { musicVolume: 0.3 }, unlocks: ['all'] }),
    );
    expect([parsed.status, parsed.fromVersion]).toEqual(['migrated', 0]);
    expect(parsed.data.options.audio.music).toBe(3);
    expect(Object.keys(parsed.data)).toEqual(['version', 'options', 'hiScores', 'stats']);
  });

  it('never throws, whatever the version-0 document holds', () => {
    const odd: Array<Record<string, unknown>> = [
      { hiScores: [[], 'x', { score: {} }], options: { masterVolume: {} } },
      { hiScores: null, options: null },
      { options: { profile: 42 } },
    ];
    for (const doc of odd) expect(() => sanitizeSave(migrateV0(doc))).not.toThrow();
  });
});

describe('core/save migrateSave (edge)', () => {
  it('returns a current document unchanged, running no step', () => {
    const doc = { version: SAVE_VERSION, anything: true };
    const throwing: SaveMigration[] = [
      {
        from: 0,
        to: 1,
        migrate: () => {
          throw new Error('must not run');
        },
      },
    ];
    const result = migrateSave(doc, throwing);
    expect(result.data).toBe(doc);
    expect(result.fromVersion).toBe(SAVE_VERSION);
  });

  it('refuses a step whose from / to do not match its place', () => {
    const identity = (d: Readonly<Record<string, unknown>>) => ({ ...d });
    expect(() => migrateSave({}, [{ from: 1, to: 2, migrate: identity }])).toThrow(
      /no save migration from version 0/,
    );
    expect(() => migrateSave({}, [{ from: 0, to: 2, migrate: identity }])).toThrow(RangeError);
  });

  it('refuses versions that are not non-negative integers', () => {
    for (const version of [null, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, '0', true, {}]) {
      expect(() => migrateSave({ version }), JSON.stringify(version)).toThrow(RangeError);
    }
  });

  it('parseSave reports a throwing or missing migration as unreadable, with the reason', () => {
    const failing: SaveMigration[] = [
      {
        from: 0,
        to: 1,
        migrate: () => {
          throw new Error('step exploded');
        },
      },
    ];
    expect(parseSave('{}', failing)).toMatchObject({
      status: 'unreadable',
      fromVersion: null,
      reason: 'step exploded',
      data: createDefaultSave(),
    });
    const nonError: SaveMigration[] = [
      {
        from: 0,
        to: 1,
        migrate: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'plain text';
        },
      },
    ];
    expect(parseSave('{}', nonError).reason).toBe('plain text');
    expect(parseSave('{}', []).status).toBe('unreadable');
    expect(parseSave('{"version":null}').status).toBe('unreadable');
  });

  it('parseSave sanitises whatever a custom migration returns', () => {
    const garbage: SaveMigration[] = [
      { from: 0, to: 1, migrate: () => ({ options: 5, hiScores: [1, 2], stats: 'x' }) },
    ];
    expect(parseSave('{}', garbage)).toEqual({
      data: createDefaultSave(),
      status: 'migrated',
      fromVersion: 0,
      reason: '',
    });
  });
});

describe('core/save parseSave (edge)', () => {
  it('calls empty, blank or truncated text corrupt', () => {
    for (const text of ['', '   ', '\n', '{', '{"version":1}x', '﻿{}', 'undefined']) {
      const parsed = parseSave(text);
      expect(parsed.status, JSON.stringify(text)).toBe('corrupt');
      expect(parsed.reason, JSON.stringify(text)).not.toBe('');
      expect(parsed.data).toEqual(createDefaultSave());
    }
  });

  it('never lets __proto__ keys reach a prototype', () => {
    const text =
      '{"version":1,"__proto__":{"polluted":1},' +
      '"options":{"__proto__":{"audio":{"music":0}}},' +
      '"hiScores":{"__proto__":[{"score":5}],"meter-normal":[{"score":7,"__proto__":{"x":1}}]}}';
    const parsed = parseSave(text);
    expect(parsed.status).toBe('ok');
    expect(parsed.data.options.audio.music).toBe(10);
    expect(Object.keys(parsed.data.hiScores)).toEqual(['meter-normal']);
    expect(scores(parsed.data.hiScores['meter-normal'])).toEqual([7]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(parsed.data.hiScores)).toBe(Object.prototype);
  });

  it('keeps a table whose key shadows an Object.prototype member as a plain table', () => {
    const parsed = parseSave('{"version":1,"hiScores":{"constructor":[{"score":9}]}}');
    expect(scores(parsed.data.hiScores.constructor as unknown as HiScoreEntry[])).toEqual([9]);
    const store = createSaveStore(null, { ...parsed, text: null });
    expect(store.bestScore('constructor')).toBe(9);
    expect(createSaveStore(null).hiScores('constructor')).toEqual([]);
    expect(createSaveStore(null).bestScore('hasownproperty')).toBe(0);
  });
});

describe('core/save sanitising (edge)', () => {
  it('takes mode keys of up to 32 characters in lower-case kebab only', () => {
    const k32 = `a-${'b'.repeat(30)}`;
    const k33 = `a-${'b'.repeat(31)}`;
    const tables: Record<string, unknown> = {};
    for (const key of [k32, k33, 'meter--normal', '-meter', 'meter-', 'métér', 'a_b', 'x9-1']) {
      tables[key] = [{ score: 1 }];
    }
    expect(Object.keys(sanitizeSave({ hiScores: tables }).hiScores)).toEqual([k32, 'x9-1']);
  });

  it('counts only usable tables toward the table limit', () => {
    const tables: Record<string, unknown> = {};
    // Sorted first: bad keys and empty tables that must not use up the 32 slots.
    for (let i = 0; i < 10; i++) tables[`a${i}-empty`] = [];
    for (let i = 0; i < 10; i++) tables[`AAA${i}`] = [{ score: 1 }];
    for (let i = 0; i < MAX_HI_SCORE_TABLES; i++) {
      tables[`mode-${String(i).padStart(2, '0')}`] = [{ score: i + 1 }];
    }
    const kept = Object.keys(sanitizeSave({ hiScores: tables }).hiScores);
    expect(kept).toHaveLength(MAX_HI_SCORE_TABLES);
    expect(kept.every((key) => key.startsWith('mode-'))).toBe(true);
  });

  it('reads rows field by field: floors scores, cuts texts, keeps zero scores', () => {
    const long = 'x'.repeat(40);
    const data = sanitizeSave({
      hiScores: {
        'meter-normal': [
          { name: '', score: 0.9, reached: long, mode: 5, difficulty: long },
          { name: 'EIGHTCHR', score: '100' },
          { name: 'NINECHARS', score: 250.999, reached: 'zone-a' },
          { score: MAX_SCORE * 10 },
          { score: -0 },
        ],
      },
    });
    expect(data.hiScores['meter-normal']).toEqual([
      { name: DEFAULT_HI_SCORE_NAME, score: MAX_SCORE, reached: '', mode: '', difficulty: '' },
      { name: 'NINECHAR', score: 250, reached: 'zone-a', mode: '', difficulty: '' },
      {
        name: DEFAULT_HI_SCORE_NAME,
        score: 0,
        reached: 'x'.repeat(32),
        mode: '',
        difficulty: 'x'.repeat(32),
      },
      { name: DEFAULT_HI_SCORE_NAME, score: 0, reached: '', mode: '', difficulty: '' },
    ]);
    expect(HI_SCORE_NAME_MAX).toBe(8);
  });

  it('sorts a table best first and keeps equal scores in their stored order', () => {
    const rows = ['A', 'B', 'C', 'D'].map((name, i) => ({ name, score: i % 2 === 0 ? 5 : 9 }));
    const kept = sanitizeSave({ hiScores: { 'meter-normal': rows } }).hiScores['meter-normal'];
    expect(kept.map((row) => row.name)).toEqual(['B', 'D', 'A', 'C']);
    expect(Object.isFrozen(kept)).toBe(true);
    expect(kept.every((row) => Object.isFrozen(row))).toBe(true);
  });

  it('reads counters as whole numbers ≥ 0 and never as -0', () => {
    const data = sanitizeSave({
      stats: { gamesStarted: -0, gameOvers: '3', stagesCleared: 0x7fffffff },
    });
    expect(Object.is(data.stats.gamesStarted, 0)).toBe(true);
    expect(data.stats).toEqual({ gamesStarted: 0, gameOvers: 0, stagesCleared: 0x7fffffff });
    expect(sanitizeSave({ stats: [1, 2, 3] }).stats).toEqual(createDefaultSave().stats);
  });

  it('never returns a -0 volume level', () => {
    for (const level of [-0, -0.4, -0.49]) {
      const audio = sanitizeSave({ options: { audio: { master: level } } }).options.audio;
      expect(Object.is(audio.master, 0), String(level)).toBe(true);
    }
    const v0 = parseSave('{"options":{"masterVolume":-0.01}}').data.options.audio;
    expect(Object.is(v0.master, 0)).toBe(true);
  });

  it('returns a frozen document at the current version whatever version it was given', () => {
    const data = sanitizeSave({ version: 99 });
    expect(data.version).toBe(SAVE_VERSION);
    expect(Object.isFrozen(data) && Object.isFrozen(data.hiScores)).toBe(true);
    expect(Object.isFrozen(data.stats) && Object.isFrozen(data.options)).toBe(true);
  });
});

describe('core/save serialisation (edge)', () => {
  it('writes the fields in a fixed order and drops anything else', () => {
    const data = {
      ...createDefaultSave(),
      extra: 'dropped',
      options: {
        audio: { sfx: 3, music: 2, master: 1, extra: 4 },
        input: { profileId: 'keyboard-default', extra: 5 },
        display: { crt: true },
      },
      stats: { stagesCleared: 3, gameOvers: 2, gamesStarted: 1, extra: 6 },
    } as unknown as SaveData;
    expect(serializeSave(data)).toBe(
      '{"version":1,"options":{"audio":{"master":1,"music":2,"sfx":3},' +
        '"input":{"profileId":"keyboard-default"},"display":{}},"hiScores":{},' +
        '"stats":{"gamesStarted":1,"gameOvers":2,"stagesCleared":3}}',
    );
  });

  it('writes tables in key order and rows field by field, whatever order they were built in', () => {
    const row = { difficulty: 'normal', mode: '1p', reached: '', score: 5, name: 'ZED', x: 1 };
    const data = {
      ...createDefaultSave(),
      hiScores: { 'meter-normal': [row], 'direct-easy': [row] },
    } as unknown as SaveData;
    const text = serializeSave(data);
    expect(text).toContain(
      '"hiScores":{"direct-easy":[{"name":"ZED","score":5,"reached":"","mode":"1p","difficulty":"normal"}],"meter-normal":',
    );
    expect(text).not.toContain('"x"');
  });

  it('is a fixed point: parse(serialize(d)) serialises to the same text', () => {
    const store = createSaveStore(null);
    store.recordScore('meter-normal', createHiScoreEntry(300, { reached: 'zone-a' }));
    store.recordScore('direct-easy', createHiScoreEntry(200));
    store.recordScore('boss-rush', createHiScoreEntry(100));
    store.count('gamesStarted');
    const text = serializeSave(store.data);
    const parsed = parseSave(text);
    expect(parsed.status).toBe('ok');
    expect(serializeSave(parsed.data)).toBe(text);
  });

  it('a reloaded save with several tables is not rewritten when nothing changed', async () => {
    const storage = createMemoryStorage();
    const first = createSaveStore(storage, await loadSave(storage));
    // Recorded in non-alphabetical order: the sanitiser sorts the keys when the save is read.
    first.recordScore('meter-normal', createHiScoreEntry(500));
    first.recordScore('meter-hard', createHiScoreEntry(400));
    first.recordScore('direct-easy', createHiScoreEntry(300));
    expect(await first.flush()).toBe(true);

    const second = createSaveStore(storage, await loadSave(storage));
    expect(second.dirty).toBe(false);
    expect(await second.flush()).toBe(false);
    expect(second.writes).toBe(0);
  });
});

describe('core/save loadSave (edge)', () => {
  it('treats a non-string answer from the storage as nothing stored', async () => {
    for (const value of [undefined, 42, { version: 1 }]) {
      const storage: PlatformStorage = {
        get: () => Promise.resolve(value as unknown as string | null),
        set: () => Promise.resolve(),
      };
      expect(await loadSave(storage), JSON.stringify(value)).toMatchObject({
        status: 'empty',
        text: null,
      });
    }
  });

  it('survives a storage that throws synchronously on read and on the corrupt copy', async () => {
    const throwing: PlatformStorage = {
      get: () => {
        throw new Error('sync read');
      },
      set: () => Promise.resolve(),
    };
    expect((await loadSave(throwing)).status).toBe('empty');
    const copyThrows: PlatformStorage = {
      get: () => Promise.resolve('{bad'),
      set: () => {
        throw new Error('sync write');
      },
    };
    expect(await loadSave(copyThrows)).toMatchObject({ status: 'corrupt', text: '{bad' });
  });

  it('copies only unusable saves aside, under save.corrupt', async () => {
    const writes: string[] = [];
    const make = (text: string): PlatformStorage => ({
      get: (key) => Promise.resolve(key === SAVE_STORAGE_KEY ? text : null),
      set: (key) => {
        writes.push(key);
        return Promise.resolve();
      },
    });
    await loadSave(make(serializeSave(createDefaultSave()))); // ok
    await loadSave(make('{"options":{"musicVolume":0.1}}')); // migrated
    await loadSave(make('{"version":1,"options":{"audio":{"music":99}}}')); // ok, sanitised
    expect(writes).toEqual([]);
    await loadSave(make('[1]')); // corrupt
    await loadSave(make('{"version":7}')); // unreadable
    expect(writes).toEqual([SAVE_CORRUPT_KEY, SAVE_CORRUPT_KEY]);
  });

  it('keeps the stored text with every status', async () => {
    const text = '{"version":1,"stats":{"gameOvers":4}}';
    const loaded = await loadSave(createMemoryStorage({ [SAVE_STORAGE_KEY]: text }));
    expect(loaded).toMatchObject({ status: 'ok', text, fromVersion: 1 });
    expect(loaded.data.stats.gameOvers).toBe(4);
  });
});

describe('core/save writeSave (edge)', () => {
  it('writes the serialised document and passes a storage failure on', async () => {
    const storage = createMemoryStorage();
    const data = sanitizeSave({ stats: { gameOvers: 2 } });
    await writeSave(storage, data);
    expect(await storage.get(SAVE_STORAGE_KEY)).toBe(serializeSave(data));
    const failing: PlatformStorage = {
      get: () => Promise.resolve(null),
      set: () => Promise.reject(new Error('quota')),
    };
    await expect(writeSave(failing, data)).rejects.toThrow('quota');
  });
});

describe('core/save hi-score rows and insertion (edge)', () => {
  it('normalises a row: score floored and capped, texts cut, empty name → ---', () => {
    expect(createHiScoreEntry(99.9, { name: '', reached: 'r'.repeat(40) })).toEqual({
      name: DEFAULT_HI_SCORE_NAME,
      score: 99,
      reached: 'r'.repeat(32),
      mode: '',
      difficulty: '',
    });
    expect(createHiScoreEntry(MAX_SCORE + 1).score).toBe(MAX_SCORE);
    expect(createHiScoreEntry(-0).score).toBe(0);
    expect(createHiScoreEntry(Number.NaN).score).toBe(0);
    expect(createHiScoreEntry(1, { name: 'ABCDEFGHIJ' }).name).toBe('ABCDEFGH');
    expect(Object.isFrozen(createHiScoreEntry(1))).toBe(true);
  });

  it('enters an empty table at rank 0 and a short table at its end', () => {
    expect(insertHiScore([], createHiScoreEntry(1))).toMatchObject({ rank: 0 });
    const short = [createHiScoreEntry(30), createHiScoreEntry(20)];
    const result = insertHiScore(short, createHiScoreEntry(5));
    expect(result.rank).toBe(2);
    expect(scores(result.table)).toEqual([30, 20, 5]);
    expect(Object.isFrozen(result.table)).toBe(true);
    expect(short).toHaveLength(2);
  });

  it('in a full table: a tie with the best goes second; beating the 10th drops it', () => {
    const table = fullTable();
    const tieTop = insertHiScore(table, createHiScoreEntry(100, { name: 'NEW' }));
    expect(tieTop.rank).toBe(1);
    expect(tieTop.table[1].name).toBe('NEW');
    expect(tieTop.table).toHaveLength(HI_SCORE_TABLE_SIZE);
    expect(tieTop.table[HI_SCORE_TABLE_SIZE - 1].score).toBe(20);
    const last = insertHiScore(table, createHiScoreEntry(11));
    expect(last.rank).toBe(HI_SCORE_TABLE_SIZE - 1);
    expect(scores(last.table).slice(-2)).toEqual([20, 11]);
    expect(insertHiScore(table, createHiScoreEntry(10.9))).toEqual({ table, rank: -1 }); // floored
  });

  it('normalises the row it inserts', () => {
    const raw = { name: 'LONGNAME99', score: 77.7, reached: '', mode: '1p', difficulty: '' };
    const { table } = insertHiScore([], raw);
    expect(table[0]).toEqual({ ...raw, name: 'LONGNAME', score: 77 });
    expect(table[0]).not.toBe(raw);
  });

  it('names the table after any difficulty', () => {
    expect(hiScoreModeKey(resolveGameConfig({ difficulty: 'hard' }))).toBe('meter-hard');
  });
});

describe('core/save SaveStore (edge)', () => {
  it('a store made from a migrated, corrupt or empty load is dirty; an ok load is not', async () => {
    const ok = serializeSave(createDefaultSave());
    for (const [text, dirty] of [
      [ok, false],
      ['{"options":{}}', true],
      ['{oops', true],
      [null, true],
    ] as const) {
      const storage = createMemoryStorage(text === null ? {} : { [SAVE_STORAGE_KEY]: text });
      const store = createSaveStore(storage, await loadSave(storage));
      expect(store.dirty, String(text)).toBe(dirty);
    }
  });

  it('an ok load that needed sanitising is rewritten at the next flush', async () => {
    const storage = createMemoryStorage({
      [SAVE_STORAGE_KEY]: '{"version":1,"options":{"audio":{"music":99}}}',
    });
    const store = createSaveStore(storage, await loadSave(storage));
    expect(store.dirty).toBe(true);
    expect(await store.flush()).toBe(true);
    expect(await storage.get(SAVE_STORAGE_KEY)).toBe(serializeSave(store.data));
  });

  it('setOptions sanitises and replaces the document without touching the old one', () => {
    const store = createSaveStore(null);
    const before = store.data;
    store.setOptions({
      audio: { master: 99, music: 4.4, sfx: -2 },
      input: { profileId: 'NOT OK' },
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
        bossHpBar: false,
      },
    });
    expect(store.options).toEqual({
      audio: { master: 10, music: 4, sfx: 0 },
      input: { profileId: null },
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
        bossHpBar: false,
      },
    });
    expect(before.options.audio.master).toBe(10);
    expect(store.data).not.toBe(before);
    expect(Object.isFrozen(store.data)).toBe(true);
  });

  it('a score that does not enter leaves the document as it was', () => {
    const store = createSaveStore(null);
    for (const row of fullTable()) store.recordScore('meter-normal', row);
    const before = store.data;
    expect(store.recordScore('meter-normal', createHiScoreEntry(10))).toBe(-1);
    expect(store.recordScore('meter-normal', createHiScoreEntry(0))).toBe(-1);
    expect(store.data).toBe(before);
  });

  it('refuses a new table beyond the limit and over-long keys, but keeps filling known ones', () => {
    const store = createSaveStore(null);
    for (let i = 0; i < MAX_HI_SCORE_TABLES; i++) {
      expect(store.recordScore(`mode-${i}`, createHiScoreEntry(10))).toBe(0);
    }
    expect(store.recordScore('one-too-many', createHiScoreEntry(10))).toBe(-1);
    expect(store.recordScore('mode-0', createHiScoreEntry(20))).toBe(0);
    expect(store.recordScore(`a-${'b'.repeat(31)}`, createHiScoreEntry(10))).toBe(-1);
    expect(store.recordScore('', createHiScoreEntry(10))).toBe(-1);
    expect(Object.keys(store.data.hiScores)).toHaveLength(MAX_HI_SCORE_TABLES);
  });

  it('stops a counter at 2³¹−1', () => {
    const parsed = parseSave(`{"version":1,"stats":{"gameOvers":${0x7fffffff - 1}}}`);
    const store = createSaveStore(null, { ...parsed, text: null });
    store.count('gameOvers');
    expect(store.data.stats.gameOvers).toBe(0x7fffffff);
    const at = store.data;
    store.count('gameOvers');
    expect(store.data).toBe(at);
    store.count('gamesStarted');
    expect(store.data.stats).toEqual({
      gamesStarted: 1,
      gameOvers: 0x7fffffff,
      stagesCleared: 0,
    });
  });

  it('two overlapping writes: the later one decides what counts as stored', async () => {
    // A fails, B succeeds → B is stored; nothing to write afterwards.
    {
      const { storage, pending, stored } = manualStorage();
      const store = createSaveStore(storage);
      const a = store.flush();
      store.count('gamesStarted');
      const b = store.flush();
      pending[0].reject();
      pending[1].resolve();
      expect([await a, await b]).toEqual([false, true]);
      expect(stored.get(SAVE_STORAGE_KEY)).toBe(serializeSave(store.data));
      expect(await store.flush()).toBe(false);
      expect(store.writes).toBe(1);
    }
    // A succeeds, B fails → the next flush writes B again.
    {
      const { storage, pending, stored } = manualStorage();
      const store = createSaveStore(storage);
      const a = store.flush();
      store.count('gamesStarted');
      const b = store.flush();
      pending[0].resolve();
      pending[1].reject();
      expect([await a, await b]).toEqual([true, false]);
      const retry = store.flush();
      expect(pending).toHaveLength(3);
      pending[2].resolve();
      expect(await retry).toBe(true);
      expect(stored.get(SAVE_STORAGE_KEY)).toBe(serializeSave(store.data));
    }
  });

  it('two overlapping writes that both fail: the next flush writes again, whatever the document', async () => {
    const { storage, pending, stored } = manualStorage();
    const store = createSaveStore(storage);
    store.setOptions({ ...store.options, audio: { master: 10, music: 9, sfx: 10 } });
    const a = store.flush();
    store.setOptions({ ...store.options, audio: { master: 10, music: 8, sfx: 10 } });
    const b = store.flush();
    pending[0].reject();
    pending[1].reject();
    expect([await a, await b]).toEqual([false, false]);
    // Back to the options of the first (failed) write: they are not stored, so they are written.
    store.setOptions({ ...store.options, audio: { master: 10, music: 9, sfx: 10 } });
    expect(store.dirty).toBe(true);
    const retry = store.flush();
    expect(pending).toHaveLength(3);
    pending[2].resolve();
    expect(await retry).toBe(true);
    expect(stored.get(SAVE_STORAGE_KEY)).toBe(serializeSave(store.data));
  });

  it('a memory-only store is dirty but never writes', async () => {
    const store = createSaveStore(null);
    expect(store.storage).toBeNull();
    expect(store.dirty).toBe(true);
    expect(await store.flush()).toBe(false);
    expect(store.writes).toBe(0);
  });
});
