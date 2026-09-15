/**
 * Edge cases of the save format's version 2 (plan M2-16 acceptance "v1 → v2 migration", "profile
 * overrides persisted"): a version-0 document migrating through both steps; version-1 documents
 * with missing, foreign or pre-filled groups (the new controls and game groups always start unset);
 * the co-op / practice rows moved out of the one-player tables ahead of a table's own rows (a tie
 * keeps the moved, older row above; a full table keeps the best ten), left in place when the
 * target key would be too long or the table is not a one-player one; a version-2 document whose
 * rows are no longer moved on read; and the rebinding written in a canonical order, whatever order
 * it was built in, so an unchanged save writes the same text.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_OPTIONS, resolveBindingOverrides } from '../../src/config/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import {
  HI_SCORE_TABLE_SIZE,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  createSaveStore,
  loadSave,
  migrateSave,
  parseSave,
  serializeSave,
} from '../../src/save/index.js';

/**
 * A hi-score row as older builds wrote it.
 *
 * @param name - Initials.
 * @param score - Score.
 * @param mode - `1p`, `2p` or `practice`.
 * @returns The row.
 */
function row(name: string, score: number, mode = '1p'): Record<string, unknown> {
  return { name, score, reached: 'zone-a', mode, difficulty: 'normal' };
}

/**
 * Parses a version-1 document.
 *
 * @param doc - The document (its `version` is set to 1).
 * @returns The parsed save.
 */
function v1(doc: Record<string, unknown>): ReturnType<typeof parseSave> {
  return parseSave(JSON.stringify({ ...doc, version: 1 }));
}

describe('core/save version 2 (edge): migrations', () => {
  it('migrates a version-0 document through both steps', () => {
    const parsed = parseSave(
      JSON.stringify({
        hiScores: [{ name: 'OLD', score: 900 }],
        options: { masterVolume: 0.5, musicVolume: 1, sfxVolume: 0, profile: 'tizen-remote-safe' },
        unlocks: ['x'],
      }),
    );
    expect([parsed.status, parsed.fromVersion, parsed.data.version]).toEqual(['migrated', 0, 2]);
    expect(parsed.data.options.audio).toEqual({ master: 5, music: 10, sfx: 0 });
    expect(parsed.data.options.input).toEqual({
      ...DEFAULT_USER_OPTIONS.input,
      profileId: 'tizen-remote-safe',
    });
    expect(parsed.data.options.game).toEqual(DEFAULT_USER_OPTIONS.game);
    expect(parsed.data.hiScores['meter-normal']?.map((r) => r.name)).toEqual(['OLD']);
  });

  it('gives a version-1 document the new groups unset, whatever it carried', () => {
    const parsed = v1({
      options: {
        input: { profileId: 'keyboard-default', autofire: 'hold', bindings: { p: { game: {} } } },
        game: { lives: 5, oneButton: true },
      },
    });
    expect(parsed.data.options.input).toEqual({
      ...DEFAULT_USER_OPTIONS.input,
      profileId: 'keyboard-default',
    });
    expect(parsed.data.options.game).toEqual(DEFAULT_USER_OPTIONS.game);
  });

  it('reads a version-1 document without options, hi-scores or stats as defaults', () => {
    for (const doc of [{}, { options: 'x', hiScores: [row('A', 1)], stats: 3 }]) {
      const parsed = v1(doc);
      expect(parsed.status).toBe('migrated');
      expect(parsed.data.options).toEqual(DEFAULT_USER_OPTIONS);
      expect(parsed.data.hiScores).toEqual({});
      expect(parsed.data.stats).toEqual({ gamesStarted: 0, gameOvers: 0, stagesCleared: 0 });
    }
    // A bad profile id carried over reads as none.
    expect(v1({ options: { input: { profileId: 'Bad Id' } } }).data.options.input.profileId).toBe(
      null,
    );
  });

  it('the version-1 step leaves the document it is given untouched', () => {
    const doc = {
      version: 1,
      options: { input: { profileId: 'x' } },
      hiScores: { 'meter-normal': [row('DUO', 5, '2p')] },
    };
    const snapshot = JSON.stringify(doc);
    const migrated = migrateSave(doc);
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(migrated.fromVersion).toBe(1);
    expect(migrated.data.version).toBe(SAVE_VERSION);
  });
});

describe('core/save version 2 (edge): moving the older co-op and practice rows', () => {
  it('puts a moved row above a table’s own row of the same score (the older row wins a tie)', () => {
    const { data } = v1({
      hiScores: {
        'meter-normal': [row('OLD', 5000, '2p'), row('ONE', 7000)],
        'meter-normal-2p': [row('NEW', 5000, '2p'), row('TOP', 9000, '2p')],
      },
    });
    expect(data.hiScores['meter-normal-2p']?.map((r) => r.name)).toEqual(['TOP', 'OLD', 'NEW']);
    expect(data.hiScores['meter-normal']?.map((r) => r.name)).toEqual(['ONE']);
  });

  it('keeps the best ten when the moved rows overfill a table', () => {
    const own: Record<string, unknown>[] = [];
    for (let i = 0; i < HI_SCORE_TABLE_SIZE; i++) own.push(row(`N${i}`, 1000, 'practice'));
    const { data } = v1({
      hiScores: {
        'direct-hard': [row('OLD', 1000, 'practice'), row('LOW', 10, 'practice')],
        'direct-hard-practice': own,
      },
    });
    const names = data.hiScores['direct-hard-practice']?.map((r) => r.name) ?? [];
    expect(names).toHaveLength(HI_SCORE_TABLE_SIZE);
    expect(names[0]).toBe('OLD');
    expect(names).not.toContain('LOW');
    expect(names).not.toContain(`N${HI_SCORE_TABLE_SIZE - 1}`);
    // The one-player table emptied by the move is dropped.
    expect(data.hiScores['direct-hard']).toBeUndefined();
  });

  it('leaves a row where it is when its table key would be too long', () => {
    const short = 'm'.repeat(18) + '-' + 'd'.repeat(9); // 28 characters: "-2p" fits in 32
    const long = 'm'.repeat(20) + '-' + 'd'.repeat(10); // 31 characters: neither suffix fits
    const { data } = v1({
      hiScores: {
        [short]: [row('A2P', 30, '2p'), row('APR', 20, 'practice')],
        [long]: [row('B2P', 30, '2p'), row('BPR', 20, 'practice')],
      },
    });
    expect(data.hiScores[short + '-2p']?.map((r) => r.name)).toEqual(['A2P']);
    expect(data.hiScores[short]?.map((r) => r.name)).toEqual(['APR']);
    expect(data.hiScores[long]?.map((r) => r.name)).toEqual(['B2P', 'BPR']);
  });

  it('moves rows out of one-player tables only', () => {
    const { data } = v1({
      hiScores: {
        'meter-easy-2p': [row('P2P', 40, 'practice')],
        'meter-easy-practice': [row('PR2', 30, '2p')],
        'odd-key-shape-here': [row('ODD', 20, '2p')],
      },
    });
    expect(data.hiScores['meter-easy-2p']?.map((r) => r.name)).toEqual(['P2P']);
    expect(data.hiScores['meter-easy-practice']?.map((r) => r.name)).toEqual(['PR2']);
    expect(data.hiScores['odd-key-shape-here']?.map((r) => r.name)).toEqual(['ODD']);
    expect(data.hiScores['meter-easy-2p-practice']).toBeUndefined();
  });

  it('drops tables that are not lists and rows that are not usable, after the move', () => {
    const { data } = v1({
      hiScores: {
        'meter-hard': [row('BAD', -1, '2p'), 'x', row('OK', 1, '2p')],
        'meter-arcade': 'nope',
      },
    });
    expect(Object.keys(data.hiScores)).toEqual(['meter-hard-2p']);
    expect(data.hiScores['meter-hard-2p']?.map((r) => r.name)).toEqual(['OK']);
  });

  it('a version-2 document is read as written: its rows are never moved again', () => {
    const parsed = parseSave(
      JSON.stringify({
        version: 2,
        hiScores: { 'meter-normal': [row('DUO', 64000, '2p'), row('ACE', 1000)] },
      }),
    );
    expect(parsed.status).toBe('ok');
    expect(parsed.data.hiScores['meter-normal']?.map((r) => r.name)).toEqual(['DUO', 'ACE']);
    expect(parsed.data.hiScores['meter-normal-2p']).toBeUndefined();
  });

  it('refuses a document newer than version 2 (defaults, the storage untouched)', async () => {
    const text = JSON.stringify({ version: SAVE_VERSION + 1, options: { game: { lives: 2 } } });
    const parsed = parseSave(text);
    expect(parsed.status).toBe('unreadable');
    expect(parsed.data.options).toEqual(DEFAULT_USER_OPTIONS);
    const storage = createMemoryStorage({ [SAVE_STORAGE_KEY]: text });
    const store = createSaveStore(storage, await loadSave(storage));
    expect(store.data.version).toBe(SAVE_VERSION);
  });
});

describe('core/save version 2 (edge): writing the rebinding', () => {
  it('writes the rebinding in one order whatever order it was built in', () => {
    const a = createSaveStore(null);
    a.setOptions({
      ...a.options,
      input: {
        ...a.options.input,
        bindings: {
          'tizen-remote-safe': { menu: { Back: ['key:10009', 'key:428'] }, game: { Speed: [] } },
          'keyboard-default': {
            menu: { Confirm: ['code:KeyJ'], Up: ['code:KeyI'] },
            game: { Sub: ['code:KeyK'], Shot: ['code:KeyJ'] },
          },
        },
      },
    });
    const b = createSaveStore(null);
    b.setOptions({
      ...b.options,
      input: {
        ...b.options.input,
        bindings: resolveBindingOverrides({
          'keyboard-default': {
            game: { Shot: ['code:KeyJ'], Sub: ['code:KeyK'] },
            menu: { Up: ['code:KeyI'], Confirm: ['code:KeyJ'] },
          },
          'tizen-remote-safe': { game: { Speed: [] }, menu: { Back: ['key:10009', 'key:428'] } },
        }),
      },
    });
    const text = serializeSave(a.data);
    expect(text).toBe(serializeSave(b.data));
    const bindings = (
      JSON.parse(text) as {
        options: { input: { bindings: Record<string, Record<string, Record<string, unknown>>> } };
      }
    ).options.input.bindings;
    expect(Object.keys(bindings)).toEqual(['keyboard-default', 'tizen-remote-safe']);
    expect(Object.keys(bindings['keyboard-default'])).toEqual(['game', 'menu']);
    expect(Object.keys(bindings['keyboard-default'].game)).toEqual(['Shot', 'Sub']);
    expect(Object.keys(bindings['keyboard-default'].menu)).toEqual(['Up', 'Confirm']);
    // An unbound action is written as an empty list and read back as one.
    expect(bindings['tizen-remote-safe'].game).toEqual({ Speed: [] });
    expect(parseSave(text).data.options.input.bindings['tizen-remote-safe']?.game).toEqual({
      Speed: [],
    });
  });

  it('a rebinding reaches the storage on the next flush and loads back applied', async () => {
    const storage = createMemoryStorage();
    const store = createSaveStore(storage, await loadSave(storage));
    const bindings = resolveBindingOverrides({
      'gamepad-standard': { game: { Shot: ['button:1'], Sub: ['button:0'] } },
    });
    store.setOptions({
      ...store.options,
      input: { ...store.options.input, socd: 'lastWins', releaseDebounce: 0, bindings },
    });
    expect(await store.flush()).toBe(true);
    expect(await store.flush()).toBe(false);
    const again = await loadSave(storage);
    expect(again.status).toBe('ok');
    expect(again.data.options.input).toEqual({
      ...DEFAULT_USER_OPTIONS.input,
      socd: 'lastWins',
      releaseDebounce: 0,
      bindings,
    });
  });
});
