/**
 * Tests of the save format's version 2 (plan M2-16 acceptance "v1 → v2 migration"): the version-1
 * fixture `fixtures/save-v1.json` (an M2-15 save: every option group of its day, a co-op and a
 * practice row still in a one-player table) migrating to version 2 — the options carried over,
 * the new controls and game options unset, the older rows moved into their own tables, the stats
 * kept — and the rewrite in the new layout on the next flush; the new option groups round-tripping
 * and read defensively.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_OPTIONS } from '../../src/config/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import {
  SAVE_MIGRATIONS,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  createSaveStore,
  loadSave,
  parseSave,
  serializeSave,
} from '../../src/save/index.js';

/** The version-1 fixture's text. */
const V1 = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'save-v1.json'),
  'utf8',
);

describe('core/save version 2 (M2-16)', () => {
  it('is version 2 with a step from version 1', () => {
    expect(SAVE_VERSION).toBe(2);
    expect([SAVE_MIGRATIONS[1].from, SAVE_MIGRATIONS[1].to]).toEqual([1, 2]);
  });

  it('migrates the version-1 fixture: options kept, new groups unset, stats kept', async () => {
    const storage = createMemoryStorage({ [SAVE_STORAGE_KEY]: V1 });
    const loaded = await loadSave(storage);
    expect([loaded.status, loaded.fromVersion, loaded.data.version]).toEqual(['migrated', 1, 2]);
    expect(loaded.data.options).toEqual({
      audio: { master: 7, music: 4, sfx: 9 },
      input: { ...DEFAULT_USER_OPTIONS.input, profileId: 'tizen-remote-diagonal' },
      game: DEFAULT_USER_OPTIONS.game,
      display: {
        bulletPalette: 'deuteranopia',
        scaleMode: 'fit',
        screenShake: false,
        reduceFlashing: true,
        showHitbox: true,
        bossHpBar: true,
      },
      // M3-01: the assists and feel resolve to their defaults (no migration needed).
      play: DEFAULT_USER_OPTIONS.play,
    });
    expect(loaded.data.stats).toEqual({ gamesStarted: 12, gameOvers: 9, stagesCleared: 17 });
  });

  it('moves the co-op and practice rows of a one-player table into their own tables', () => {
    const { data } = parseSave(V1);
    expect(Object.keys(data.hiScores)).toEqual([
      'direct-hard',
      'meter-normal',
      'meter-normal-2p',
      'meter-normal-practice',
    ]);
    expect(data.hiScores['meter-normal'].map((row) => row.name)).toEqual(['ACE', 'BOB']);
    expect(data.hiScores['meter-normal-2p']).toEqual([
      { name: 'DUO', score: 64000, reached: 'zone-b', mode: '2p', difficulty: 'normal' },
    ]);
    expect(data.hiScores['meter-normal-practice'].map((row) => row.name)).toEqual(['PRC']);
    expect(data.hiScores['direct-hard'].map((row) => row.name)).toEqual(['MNT']);
  });

  it('writes the migrated save in the version-2 layout on the next flush, then leaves it', async () => {
    const storage = createMemoryStorage({ [SAVE_STORAGE_KEY]: V1 });
    const store = createSaveStore(storage, await loadSave(storage));
    expect(store.dirty).toBe(true);
    expect(await store.flush()).toBe(true);
    const text = await storage.get(SAVE_STORAGE_KEY);
    expect(text).toBe(serializeSave(store.data));
    const doc = JSON.parse(text ?? '{}') as { version: number; options: Record<string, unknown> };
    expect(doc.version).toBe(2);
    // M3-01 added `play` (the assists and feel) after the display options.
    expect(Object.keys(doc.options)).toEqual(['audio', 'input', 'game', 'display', 'play']);
    const again = await loadSave(storage);
    expect(again.status).toBe('ok');
    expect(again.data).toEqual(store.data);
    const reread = createSaveStore(storage, again);
    expect(await reread.flush()).toBe(false);
  });

  it('round-trips the controls and game options, dropping what is unusable', () => {
    const store = createSaveStore(null);
    store.setOptions({
      ...store.options,
      input: {
        profileId: 'keyboard-default',
        autofire: 'hold',
        autofireInterval: 3,
        socd: 'neutral',
        releaseDebounce: 0,
        bindings: {
          'keyboard-default': {
            game: { Shot: ['code:KeyJ', 'code:KeyJ', 'bogus', 'code:Space'], Sub: [] },
            menu: { Confirm: ['code:KeyK'] },
          },
          'gamepad-standard': { game: { Shot: ['button:2'] } },
        },
      },
      game: {
        difficulty: 'arcade',
        lives: 1,
        deathPenalty: 'arcade',
        autoPowerUp: false,
        pickupMagnet: true,
        oneButton: false,
      },
    });
    const parsed = parseSave(serializeSave(store.data));
    expect(parsed.status).toBe('ok');
    expect(parsed.data).toEqual(store.data);
    expect(parsed.data.options.input.bindings).toEqual({
      'gamepad-standard': { game: { Shot: ['button:2'] } },
      'keyboard-default': {
        game: { Shot: ['code:KeyJ', 'code:Space'], Sub: [] },
        menu: { Confirm: ['code:KeyK'] },
      },
    });
    expect(parsed.data.options.game).toMatchObject({ difficulty: 'arcade', lives: 1 });
  });

  it('reads malformed controls and game options as unset', () => {
    const { data } = parseSave(
      JSON.stringify({
        version: 2,
        options: {
          input: {
            autofire: 'sometimes',
            autofireInterval: 0,
            socd: 'firstWins',
            releaseDebounce: 11,
            bindings: {
              'Bad Id': { game: { Shot: ['code:KeyZ'] } },
              'keyboard-default': { game: { Fire: ['code:KeyZ'], Shot: 'code:KeyZ' }, menu: 5 },
            },
          },
          game: {
            difficulty: 'insane',
            lives: 6,
            deathPenalty: 'none',
            autoPowerUp: 1,
            oneButton: 'y',
          },
        },
      }),
    );
    expect(data.options.input).toEqual(DEFAULT_USER_OPTIONS.input);
    expect(data.options.game).toEqual(DEFAULT_USER_OPTIONS.game);
  });
});
