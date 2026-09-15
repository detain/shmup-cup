/**
 * Edge cases of the hi-score tables per difficulty × ship × mode (plan M2-15, shmup_feat.md §15)
 * beyond `save-hiscore-modes.test.ts`: every key parsing back to its parts, malformed keys, the
 * co-op / practice rows of an older save moving into their own tables (merged and cut to ten, the
 * table count cap, rows that stay where they are, keys too long to grow a suffix), and naming a
 * row (`SaveStore.renameScore`): by identity among equal rows, its other fields kept, earlier
 * snapshots untouched, the name reaching the storage on the next flush.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PRESETS, POWER_UP_MODES } from '../../src/config/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import {
  DEFAULT_HI_SCORE_NAME,
  HI_SCORE_MODES,
  HI_SCORE_TABLE_SIZE,
  MAX_HI_SCORE_TABLES,
  SAVE_STORAGE_KEY,
  createHiScoreEntry,
  createSaveStore,
  hiScoreModeKey,
  loadSave,
  parseHiScoreModeKey,
  parseSave,
  type HiScoreEntry,
  type SaveStore,
} from '../../src/save/index.js';

/**
 * Reads a version-1 document the way a stored save is read: its migration to version 2 (M2-16)
 * moves the older co-op / practice rows, the sanitiser then checks everything.
 *
 * @param doc - The document.
 * @returns The save as read.
 */
function readV1(doc: Readonly<Record<string, unknown>>): ReturnType<typeof parseSave>['data'] {
  return parseSave(JSON.stringify(doc)).data;
}

describe('core/save hi-score mode keys — edge cases (M2-15)', () => {
  it('parses every key hiScoreModeKey makes back into the same parts', () => {
    for (const powerUpMode of POWER_UP_MODES) {
      for (const difficulty of DIFFICULTY_PRESETS) {
        for (const mode of HI_SCORE_MODES) {
          const key = hiScoreModeKey({ powerUpMode, difficulty }, mode);
          expect(parseHiScoreModeKey(key), key).toEqual({ powerUpMode, difficulty, mode });
          // Every key is a valid table key: lower-case kebab of at most 32 characters.
          expect(key).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
          expect(key.length).toBeLessThanOrEqual(32);
        }
      }
    }
  });

  it('refuses empty parts and unknown or repeated modes', () => {
    for (const bad of [
      '',
      '-',
      '--',
      'meter--2p',
      'meter-normal-',
      '-normal-2p',
      'meter-normal-2P',
      'meter-normal-1p',
      'meter-normal-2p-2p',
      'meter-normal-coop',
    ]) {
      expect(parseHiScoreModeKey(bad), JSON.stringify(bad)).toBeNull();
    }
    // Unknown power-up models and difficulties parse (the key's shape is all it checks).
    expect(parseHiScoreModeKey('laser-insane-practice')).toEqual({
      powerUpMode: 'laser',
      difficulty: 'insane',
      mode: 'practice',
    });
  });
});

describe('core/save moving older co-op / practice rows — edge cases (M2-15)', () => {
  it('merges the moved rows into an existing table, sorted, cut to ten', () => {
    const own = Array.from({ length: 8 }, (_, i) => ({
      name: 'OWN' + String(i),
      score: 1000 + i * 100,
      mode: '2p',
    }));
    const moved = Array.from({ length: 5 }, (_, i) => ({
      name: 'OLD' + String(i),
      score: 1050 + i * 100,
      mode: '2p',
    }));
    const data = readV1({
      version: 1,
      hiScores: {
        'meter-hard': [{ name: 'ONE', score: 10, mode: '1p' }, ...moved],
        'meter-hard-2p': own,
      },
    });
    const table = data.hiScores['meter-hard-2p'];
    expect(table).toHaveLength(HI_SCORE_TABLE_SIZE);
    const scores = table.map((row) => row.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).toBe(1700);
    expect(scores).toEqual([1700, 1600, 1500, 1450, 1400, 1350, 1300, 1250, 1200, 1150]);
    expect(data.hiScores['meter-hard'].map((row) => row.name)).toEqual(['ONE']);
  });

  it('a table left empty by the move is dropped; a tie keeps the moved (older) row first', () => {
    const data = readV1({
      version: 1,
      hiScores: {
        'direct-easy': [{ name: 'MOV', score: 500, mode: '2p' }],
        'direct-easy-2p': [{ name: 'NEW', score: 500, mode: '2p' }],
      },
    });
    expect(Object.keys(data.hiScores)).toEqual(['direct-easy-2p']);
    expect(data.hiScores['direct-easy-2p'].map((row) => row.name)).toEqual(['MOV', 'NEW']);
  });

  it('leaves rows where they are when the table is not a one-player table or the mode is not one to move', () => {
    const data = readV1({
      version: 1,
      hiScores: {
        // A co-op table holding a practice row, and a practice table holding a co-op row.
        'meter-normal-2p': [{ name: 'PRA', score: 30, mode: 'practice' }],
        'meter-normal-practice': [{ name: 'TWO', score: 40, mode: '2p' }],
        // A key that does not parse (an unknown third part).
        'meter-normal-boss': [{ name: 'BOS', score: 50, mode: '2p' }],
        // One-player rows with other modes (none, 1p, anything else).
        'meter-easy': [
          { name: 'NON', score: 60 },
          { name: 'ONE', score: 70, mode: '1p' },
          { name: 'ODD', score: 80, mode: 'boss' },
          { name: 'NUM', score: 90, mode: 2 },
        ],
      },
    });
    expect(Object.keys(data.hiScores)).toEqual([
      'meter-easy',
      'meter-normal-2p',
      'meter-normal-boss',
      'meter-normal-practice',
    ]);
    expect(data.hiScores['meter-easy'].map((row) => row.name)).toEqual([
      'NUM',
      'ODD',
      'ONE',
      'NON',
    ]);
    expect(data.hiScores['meter-normal-2p'][0].mode).toBe('practice');
    expect(data.hiScores['meter-normal-practice'][0].mode).toBe('2p');
  });

  it('does not grow a key past 32 characters: such rows stay in their table', () => {
    const long30 = 'abcdefghijklmn-opqrstuvwxyz012'; // 30 characters, two parts
    const long29 = 'abcdefghijklmn-opqrstuvwxyz01'; // 29 characters
    expect(long30).toHaveLength(30);
    expect(long29).toHaveLength(29);
    const data = readV1({
      version: 1,
      hiScores: {
        [long30]: [
          { name: 'TWO', score: 20, mode: '2p' },
          { name: 'PRA', score: 10, mode: 'practice' },
        ],
        [long29]: [{ name: 'TWO', score: 20, mode: '2p' }],
      },
    });
    // 30 + '-2p' = 33 > 32: stays; 29 + '-2p' = 32: moves.
    expect(data.hiScores[long30].map((row) => row.name)).toEqual(['TWO', 'PRA']);
    expect(data.hiScores[long29 + '-2p'].map((row) => row.name)).toEqual(['TWO']);
    expect(data.hiScores[long29]).toBeUndefined();
    for (const key of Object.keys(data.hiScores)) expect(key.length).toBeLessThanOrEqual(32);
  });

  it('keeps at most MAX_HI_SCORE_TABLES tables after the move, in key order', () => {
    const hiScores: Record<string, unknown> = {};
    for (let i = 0; i < MAX_HI_SCORE_TABLES; i++) {
      const key = 'm' + String(i).padStart(2, '0') + '-normal';
      hiScores[key] = [
        { name: 'ONE', score: 100, mode: '1p' },
        { name: 'TWO', score: 200, mode: '2p' },
      ];
    }
    const data = readV1({ version: 1, hiScores });
    const keys = Object.keys(data.hiScores);
    expect(keys).toHaveLength(MAX_HI_SCORE_TABLES);
    expect(keys).toEqual([...keys].sort());
    // The first half of the one-player tables and their co-op tables.
    expect(keys.slice(0, 4)).toEqual([
      'm00-normal',
      'm00-normal-2p',
      'm01-normal',
      'm01-normal-2p',
    ]);
    const half = String(MAX_HI_SCORE_TABLES / 2 - 1).padStart(2, '0');
    expect(keys[keys.length - 1]).toBe('m' + half + '-normal-2p');
  });

  it('skips tables that are not arrays and rows that are not objects while moving', () => {
    const data = readV1({
      version: 1,
      hiScores: {
        'meter-normal': [null, 'row', 7, { name: 'TWO', score: 3, mode: '2p' }],
        'meter-hard': { name: 'X', score: 9, mode: '2p' },
        'meter-easy': 'nope',
      },
    });
    expect(Object.keys(data.hiScores)).toEqual(['meter-normal-2p']);
    expect(data.hiScores['meter-normal-2p'][0]).toMatchObject({ name: 'TWO', score: 3 });
  });
});

/**
 * Records a row and returns the object the table now holds for it.
 *
 * @param store - The store.
 * @param key - The table.
 * @param entry - The row.
 * @returns The table's row.
 */
function recorded(store: SaveStore, key: string, entry: HiScoreEntry): HiScoreEntry {
  const rank = store.recordScore(key, entry);
  expect(rank).toBeGreaterThanOrEqual(0);
  return store.hiScores(key)[rank];
}

describe('core/save renameScore — edge cases (M2-15)', () => {
  it('names the very row it is given among rows with the same score', () => {
    const store = createSaveStore(null);
    const key = 'meter-normal';
    const r1 = store.recordScore(key, createHiScoreEntry(700));
    const first = store.hiScores(key)[r1];
    const r2 = store.recordScore(key, createHiScoreEntry(700));
    const second = store.hiScores(key)[r2];
    expect([r1, r2]).toEqual([0, 1]); // the tie goes below the older row
    expect(first).not.toBe(second);
    expect(first).toEqual(second); // equal fields, different rows
    expect(store.renameScore(key, second, 'TWO')).toBe(1);
    expect(store.renameScore(key, first, 'ONE')).toBe(0);
    expect(store.hiScores(key).map((row) => row.name)).toEqual(['ONE', 'TWO']);
  });

  it('keeps the row`s score, zone, mode and difficulty; leaves older snapshots alone', () => {
    const store = createSaveStore(null);
    const key = 'direct-hard-practice';
    store.recordScore(key, createHiScoreEntry(9000, { name: 'TOP' }));
    const rank = store.recordScore(
      key,
      createHiScoreEntry(4200, { reached: 'zone-c', mode: 'practice', difficulty: 'hard' }),
    );
    const row = store.hiScores(key)[rank];
    const before = store.data;
    const beforeTable = store.hiScores(key);
    expect(store.renameScore(key, row, 'ACE')).toBe(1);
    const named = store.hiScores(key)[1];
    expect(named).toEqual({
      name: 'ACE',
      score: 4200,
      reached: 'zone-c',
      mode: 'practice',
      difficulty: 'hard',
    });
    expect(Object.isFrozen(named)).toBe(true);
    expect(Object.isFrozen(store.hiScores(key))).toBe(true);
    // The document read before the rename still holds the unnamed row.
    expect(before.hiScores[key][1].name).toBe(DEFAULT_HI_SCORE_NAME);
    expect(beforeTable[1]).toBe(row);
    expect(store.hiScores(key)[0].name).toBe('TOP');
  });

  it('does not rename a row after it was renamed once (the old object left the table)', () => {
    const store = createSaveStore(null);
    const key = 'meter-easy';
    const row = recorded(store, key, createHiScoreEntry(55));
    expect(store.renameScore(key, row, 'AAA')).toBe(0);
    expect(store.renameScore(key, row, 'BBB')).toBe(-1);
    expect(store.hiScores(key)[0].name).toBe('AAA');
    // The renamed row can be renamed in turn.
    expect(store.renameScore(key, store.hiScores(key)[0], 'CCC')).toBe(0);
    expect(store.hiScores(key)[0].name).toBe('CCC');
  });

  it('finds no row that another score has pushed out of the table', () => {
    const store = createSaveStore(null);
    const key = 'meter-normal';
    for (let i = 0; i < HI_SCORE_TABLE_SIZE - 1; i++) {
      store.recordScore(key, createHiScoreEntry(10_000 + i));
    }
    const tenth = recorded(store, key, createHiScoreEntry(100));
    expect(store.hiScores(key).indexOf(tenth)).toBe(HI_SCORE_TABLE_SIZE - 1);
    expect(store.recordScore(key, createHiScoreEntry(200))).toBe(HI_SCORE_TABLE_SIZE - 1);
    expect(store.renameScore(key, tenth, 'OUT')).toBe(-1);
    expect(store.hiScores(key).some((row) => row.name === 'OUT')).toBe(false);
  });

  it('writes the name on the next flush, and the save reads it back', async () => {
    const storage = createMemoryStorage();
    const store = createSaveStore(storage, await loadSave(storage));
    const key = 'meter-normal-2p';
    const row = recorded(store, key, createHiScoreEntry(3210, { mode: '2p' }));
    expect(await store.flush()).toBe(true);
    expect(await store.flush()).toBe(false); // nothing changed
    expect(store.renameScore(key, row, 'NEW')).toBe(0);
    expect(await store.flush()).toBe(true);
    const text = await storage.get(SAVE_STORAGE_KEY);
    expect(text).not.toBeNull();
    const loaded = await loadSave(storage);
    expect(loaded.status).toBe('ok');
    expect(loaded.data.hiScores[key][0]).toMatchObject({ name: 'NEW', score: 3210, mode: '2p' });
  });
});
