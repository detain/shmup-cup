/**
 * Tests of the hi-score tables per difficulty × ship × mode (plan M2-15, shmup_feat.md §15): the
 * mode keys (`-2p`, `-practice`), parsing them, inserting and sorting rows into ten-row tables,
 * naming a recorded row (the name entry), and the co-op rows of older saves moving into their own
 * table when read.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HI_SCORE_NAME,
  HI_SCORE_MODES,
  HI_SCORE_TABLE_SIZE,
  createHiScoreEntry,
  createSaveStore,
  hiScoreModeKey,
  insertHiScore,
  parseHiScoreModeKey,
  parseSave,
  sanitizeSave,
  type HiScoreEntry,
} from '../../src/save/index.js';

describe('core/save hi-score tables per mode (M2-15)', () => {
  it('keys a table by ship (power-up model), difficulty and mode', () => {
    expect(HI_SCORE_MODES).toEqual(['1p', '2p', 'practice']);
    const meter = { powerUpMode: 'meter', difficulty: 'normal' } as const;
    expect(hiScoreModeKey(meter)).toBe('meter-normal');
    expect(hiScoreModeKey(meter, '1p')).toBe('meter-normal');
    expect(hiScoreModeKey(meter, '2p')).toBe('meter-normal-2p');
    expect(hiScoreModeKey({ powerUpMode: 'direct', difficulty: 'arcade' }, 'practice')).toBe(
      'direct-arcade-practice',
    );
    const keys = new Set<string>();
    for (const powerUpMode of ['meter', 'direct'] as const) {
      for (const difficulty of ['easy', 'normal', 'hard', 'arcade'] as const) {
        for (const mode of HI_SCORE_MODES)
          keys.add(hiScoreModeKey({ powerUpMode, difficulty }, mode));
      }
    }
    expect(keys.size).toBe(24); // within MAX_HI_SCORE_TABLES
  });

  it('parses a mode key back into its parts; refuses other shapes', () => {
    expect(parseHiScoreModeKey('meter-normal')).toEqual({
      powerUpMode: 'meter',
      difficulty: 'normal',
      mode: '1p',
    });
    expect(parseHiScoreModeKey('direct-hard-2p')).toEqual({
      powerUpMode: 'direct',
      difficulty: 'hard',
      mode: '2p',
    });
    expect(parseHiScoreModeKey('meter-easy-practice')?.mode).toBe('practice');
    for (const bad of ['meter', 'meter-normal-1p', 'meter-normal-boss', 'a-b-c-d', '-x', 'x-']) {
      expect(parseHiScoreModeKey(bad), bad).toBeNull();
    }
  });

  it('inserts rows best first, ties below the older row, ten at most', () => {
    let table: readonly HiScoreEntry[] = [];
    const scores = [500, 900, 100, 900, 700, 300, 800, 200, 600, 400, 1000, 50];
    const ranks: number[] = [];
    for (const score of scores) {
      const result = insertHiScore(table, createHiScoreEntry(score, { name: String(score) }));
      ranks.push(result.rank);
      table = result.table;
    }
    expect(table.map((row) => row.score)).toEqual([
      1000, 900, 900, 800, 700, 600, 500, 400, 300, 200,
    ]);
    expect(table).toHaveLength(HI_SCORE_TABLE_SIZE);
    // The second 900 went below the first.
    expect(table[1].name).toBe('900');
    expect(table[2].name).toBe('900');
    expect(ranks.slice(-2)).toEqual([0, -1]); // 1000 is the best, 50 does not enter
  });

  it('names a recorded row by identity, even after another row moved it', () => {
    const store = createSaveStore(null);
    const key = 'meter-normal-2p';
    const r1 = store.recordScore(key, createHiScoreEntry(3000, { mode: '2p' }));
    const row1 = store.hiScores(key)[r1];
    const r2 = store.recordScore(key, createHiScoreEntry(5000, { mode: '2p' }));
    const row2 = store.hiScores(key)[r2];
    expect([r1, r2]).toEqual([0, 0]);
    expect(row1.name).toBe(DEFAULT_HI_SCORE_NAME);
    // Player 1's row is now second: it is still found.
    expect(store.renameScore(key, row1, 'P1')).toBe(1);
    expect(store.renameScore(key, row2, 'TOPGUNNER')).toBe(0);
    expect(store.hiScores(key).map((row) => [row.name, row.score])).toEqual([
      ['TOPGUNNE', 5000], // cut to 8 characters
      ['P1', 3000],
    ]);
    // A blank name is the default; a row not in the table is not found.
    const row = store.hiScores(key)[1];
    expect(store.renameScore(key, row, '')).toBe(1);
    expect(store.hiScores(key)[1].name).toBe(DEFAULT_HI_SCORE_NAME);
    expect(store.renameScore(key, row, 'X')).toBe(-1); // the renamed row is a new object
    expect(store.renameScore('meter-hard', createHiScoreEntry(10), 'X')).toBe(-1);
    // Other tables are untouched.
    expect(store.hiScores('meter-normal')).toEqual([]);
  });

  it('moves co-op and practice rows of a one-player table into their own tables (v1 → v2)', () => {
    const doc = {
      version: 1,
      hiScores: {
        'meter-normal': [
          { name: 'ONE', score: 4000, mode: '1p', difficulty: 'normal' },
          { name: 'TWO', score: 6000, mode: '2p', difficulty: 'normal' },
          { name: 'PRA', score: 900, mode: 'practice', difficulty: 'normal' },
          { name: 'TWB', score: 1000, mode: '2p', difficulty: 'normal' },
        ],
        'meter-normal-2p': [{ name: 'NEW', score: 2000, mode: '2p', difficulty: 'normal' }],
        // A row in the table of its own mode stays there.
        'direct-hard-practice': [{ name: 'D', score: 50, mode: 'practice' }],
      },
    };
    // The version-1 → 2 migration (M2-16) moves them; a version-2 document is taken as it is.
    const data = parseSave(JSON.stringify(doc)).data;
    expect(sanitizeSave({ ...doc, version: 2 }).hiScores['meter-normal']).toHaveLength(4);
    expect(Object.keys(data.hiScores)).toEqual([
      'direct-hard-practice',
      'meter-normal',
      'meter-normal-2p',
      'meter-normal-practice',
    ]);
    expect(data.hiScores['meter-normal'].map((row) => row.name)).toEqual(['ONE']);
    expect(data.hiScores['meter-normal-2p'].map((row) => row.name)).toEqual(['TWO', 'NEW', 'TWB']);
    expect(data.hiScores['meter-normal-practice'].map((row) => row.name)).toEqual(['PRA']);
    // Reading the moved document again changes nothing (the move is idempotent).
    const again = parseSave(JSON.stringify(data));
    expect(again.status).toBe('ok');
    expect(again.data.hiScores).toEqual(data.hiScores);
  });
});
