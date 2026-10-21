/**
 * Tests of the save format's version 3 (v2's R2-01 — plan_resolution.md §3.4, owner decisions
 * W4-8 / W4-13 / W4-14; acceptance "a v1 save loads, keeps its options and archives its scores"):
 * the fixture `fixtures/save-v2-from-v1.json` — a version-2 document as v1.0.0 writes it, with
 * options from every Options page (scale mode, CRT, aspect, language, the controls and the
 * rebinding, the game options, the assists), three tables (one-player, co-op, practice with an
 * assisted row), stats and unlocks — migrating to version 3: the options, stats and unlocks
 * carried over as they are, the tables archived under `legacyScores` and v2's tables empty, so the
 * hi-score screen shows its default rows; the older fixtures migrating through to 3; a version-3
 * document round-tripping; a broken `legacyScores` sanitised; the store never writing to it; and
 * the one-version-older build's view of a newer document (W4-14).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/index.js';
import { createHeadlessPlatform, createMemoryStorage } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import {
  HI_SCORE_TABLE_SIZE,
  MAX_HI_SCORE_TABLES,
  SAVE_CORRUPT_KEY,
  SAVE_MIGRATIONS,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  createHiScoreEntry,
  createSaveStore,
  loadSave,
  migrateSave,
  parseSave,
  sanitizeSave,
  serializeSave,
  type HiScoreEntry,
} from '../../src/save/index.js';
import { frontEndContent } from '../helpers/front-end.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * A fixture's text.
 *
 * @param name - The file name under `fixtures/`.
 * @returns The text.
 */
function fixture(name: string): string {
  return readFileSync(join(here, 'fixtures', name), 'utf8');
}

/** The version-2 document v1.0.0 wrote. */
const V2 = fixture('save-v2-from-v1.json');

/** The fixture parsed (its own fields, nothing migrated). */
const V2_DOC = JSON.parse(V2) as {
  version: number;
  options: Record<string, unknown>;
  hiScores: Record<string, unknown[]>;
  stats: Record<string, number>;
  unlocks: Record<string, boolean>;
};

/** Every name of the fixture's rows. */
const V1_NAMES = Object.keys(V2_DOC.hiScores).flatMap((key) =>
  V2_DOC.hiScores[key].map((row) => (row as { name: string }).name),
);

/**
 * A hi-score row as a table holds it.
 *
 * @param name - Initials.
 * @param score - Score.
 * @returns The row.
 */
function row(name: string, score: number): Record<string, unknown> {
  return { name, score, reached: 'zone-a', mode: '1p', difficulty: 'normal' };
}

describe('core/save version 3 (R2-01)', () => {
  it('keeps the version-2 step in the chain, under the same storage key', () => {
    expect(SAVE_VERSION).toBe(4);
    expect(SAVE_MIGRATIONS).toHaveLength(SAVE_VERSION);
    expect([SAVE_MIGRATIONS[2].from, SAVE_MIGRATIONS[2].to]).toEqual([2, 3]);
    expect(SAVE_STORAGE_KEY).toBe('save.v1');
  });

  it('the fixture is a version-2 document in the layout v1.0.0 writes', () => {
    expect(V2_DOC.version).toBe(2);
    // The serialiser is v1.0.0's apart from `legacyScores` (absent here) and — since R6-04 — the
    // display group's two boot knobs, which a version-2 document never carried: take them out of
    // the new write and the fixture's own bytes stand.
    const asV1Wrote = serializeSave({ ...sanitizeSave(V2_DOC), version: 2 }).replace(
      '"output":"auto","renderer":"auto",',
      '',
    );
    expect(asV1Wrote).toBe(JSON.stringify(V2_DOC));
    // It holds the three table kinds, an assisted row and unlocks.
    expect(Object.keys(V2_DOC.hiScores)).toEqual([
      'direct-hard-practice',
      'meter-normal',
      'meter-normal-2p',
    ]);
    expect(V2).toContain('"assisted": true');
  });

  it('loads the v1 save migrated from version 2: options kept, tables archived, v2 tables empty', async () => {
    const storage = createMemoryStorage({ [SAVE_STORAGE_KEY]: V2 });
    const loaded = await loadSave(storage);
    // The chain runs on through R6-04's 3 → 4 step: the document lands at the current format.
    expect([loaded.status, loaded.fromVersion, loaded.data.version]).toEqual(['migrated', 2, 4]);
    // Every option of every page, as v1 stored it — plus the boot knobs at their defaults.
    expect(loaded.data.options).toEqual({
      ...V2_DOC.options,
      display: {
        ...(V2_DOC.options['display'] as Record<string, unknown>),
        output: 'auto',
        renderer: 'auto',
      },
    });
    expect(loaded.data.options.display).toMatchObject({
      scaleMode: 'fit',
      crtFilter: 'light',
      aspect: 'classic',
      language: 'ja',
    });
    expect(loaded.data.options.input.bindings['keyboard-default']?.game?.Shot).toEqual([
      'code:KeyJ',
    ]);
    // The scores of a different game are archived, not shown.
    expect(loaded.data.legacyScores).toEqual(V2_DOC.hiScores);
    expect(loaded.data.hiScores).toEqual({});
    expect(loaded.data.stats).toEqual(V2_DOC.stats);
    expect(loaded.data.unlocks).toEqual(V2_DOC.unlocks);
    expect(Object.isFrozen(loaded.data.legacyScores)).toBe(true);
    // Nothing is written until the store flushes, and no copy is put aside.
    expect(await storage.get(SAVE_STORAGE_KEY)).toBe(V2);
    expect(await storage.get(SAVE_CORRUPT_KEY)).toBeNull();
  });

  it('writes the migrated save at the current version on the next flush, then leaves it', async () => {
    const storage = createMemoryStorage({ [SAVE_STORAGE_KEY]: V2 });
    const store = createSaveStore(storage, await loadSave(storage));
    expect(store.dirty).toBe(true);
    expect(await store.flush()).toBe(true);
    const text = (await storage.get(SAVE_STORAGE_KEY)) ?? '';
    const doc = JSON.parse(text) as Record<string, unknown>;
    expect(doc.version).toBe(4);
    expect(Object.keys(doc)).toEqual([
      'version',
      'options',
      'hiScores',
      'legacyScores',
      'stats',
      'unlocks',
    ]);
    expect(doc.legacyScores).toEqual(V2_DOC.hiScores);
    expect(doc.hiScores).toEqual({});
    const again = await loadSave(storage);
    expect([again.status, again.fromVersion]).toEqual(['ok', 4]);
    expect(again.data).toEqual(store.data);
    expect(await createSaveStore(storage, again).flush()).toBe(false);
  });

  it('migrates the version-0 and version-1 fixtures through to the current version', () => {
    const v0 = parseSave(fixture('save-v0.json'));
    expect([v0.status, v0.fromVersion, v0.data.version]).toEqual(['migrated', 0, 4]);
    expect(v0.data.hiScores).toEqual({});
    expect(Object.keys(v0.data.legacyScores ?? {})).toEqual(['meter-normal']);
    const v1 = parseSave(fixture('save-v1.json'));
    expect([v1.status, v1.fromVersion, v1.data.version]).toEqual(['migrated', 1, 4]);
    expect(v1.data.hiScores).toEqual({});
    // The version-1 → 2 move happened first: the co-op and practice rows have their own tables.
    expect(Object.keys(v1.data.legacyScores ?? {})).toEqual([
      'direct-hard',
      'meter-normal',
      'meter-normal-2p',
      'meter-normal-practice',
    ]);
    expect(v1.data.options.display.scaleMode).toBe('fit');
    expect(v1.data.stats).toEqual({ gamesStarted: 12, gameOvers: 9, stagesCleared: 17 });
  });

  it('the version-2 step archives the tables as they are and leaves its input untouched', () => {
    const doc = {
      version: 2,
      options: { audio: { music: 1 } },
      hiScores: { 'meter-normal': [row('ONE', 10)], odd: 'kept for the sanitiser' },
      legacyScores: { 'meter-hard': [row('OLD', 5)] },
      stats: { gameOvers: 2 },
    };
    const snapshot = JSON.stringify(doc);
    const migrated = migrateSave(doc);
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(migrated.fromVersion).toBe(2);
    expect(migrated.data).toEqual({
      version: 4,
      // The chain's R6-04 step ran on too: the display group carries the boot knobs.
      options: { audio: { music: 1 }, display: { output: 'auto', renderer: 'auto' } },
      // A version-2 document has no legacyScores of its own: whatever it carried is replaced.
      legacyScores: doc.hiScores,
      hiScores: {},
      stats: { gameOvers: 2 },
    });
    // A version-2 document without tables archives nothing.
    expect(parseSave('{"version":2}').data.legacyScores).toBeUndefined();
    expect(parseSave('{"version":2,"hiScores":{}}').data.legacyScores).toBeUndefined();
  });

  it('round-trips a version-3 document: the same data, a fixed point of the text', () => {
    const data = sanitizeSave({
      version: 3,
      hiScores: { 'meter-hard': [row('NEW', 700)] },
      legacyScores: {
        'meter-normal': [row('OLD', 9000), { ...row('AST', 100), assisted: true }],
        'direct-easy-2p': [row('TWO', 50)],
      },
      stats: { gamesStarted: 4 },
    });
    expect(Object.keys(data.legacyScores ?? {})).toEqual(['direct-easy-2p', 'meter-normal']);
    const text = serializeSave(data);
    const parsed = parseSave(text);
    expect(parsed).toEqual({ data, status: 'ok', fromVersion: 4, reason: '' });
    expect(serializeSave(parsed.data)).toBe(text);
    expect(text).toContain('"legacyScores":{"direct-easy-2p":[');
    expect(text).toContain('"assisted":true');
    // A document without archived tables writes none.
    expect(serializeSave(sanitizeSave({ version: 3 }))).not.toContain('legacyScores');
  });

  it('sanitises a broken legacyScores by the hiScores rules, with a table count of its own', () => {
    for (const bad of ['x', 7, null, [row('ARR', 1)], {}, { 'meter-normal': 'no' }]) {
      const data = sanitizeSave({ version: 3, legacyScores: bad });
      expect(data.legacyScores, JSON.stringify(bad)).toBeUndefined();
      expect(Object.keys(data), JSON.stringify(bad)).not.toContain('legacyScores');
    }
    const long: Record<string, unknown>[] = [];
    for (let i = 0; i < HI_SCORE_TABLE_SIZE + 5; i++) long.push(row(`R${i}`, i * 10));
    const data = sanitizeSave({
      version: 3,
      legacyScores: {
        'meter-normal': long,
        'Bad Key': [row('BAD', 1)],
        'meter-hard': [{ score: -1 }, 'row', { name: 'A-VERY-LONG-NAME', score: 12.9 }],
        'meter-easy': [{ score: 'none' }],
      },
    });
    const legacy = data.legacyScores ?? {};
    expect(Object.keys(legacy)).toEqual(['meter-hard', 'meter-normal']);
    const scores = legacy['meter-normal'].map((r: HiScoreEntry) => r.score);
    expect(scores).toHaveLength(HI_SCORE_TABLE_SIZE);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).toBe((HI_SCORE_TABLE_SIZE + 4) * 10);
    expect(legacy['meter-hard']).toEqual([
      { name: 'A-VERY-L', score: 12, reached: '', mode: '', difficulty: '' },
    ]);
    // Each record keeps up to MAX_HI_SCORE_TABLES tables: the archive does not use up v2's.
    const full = (prefix: string): Record<string, unknown> => {
      const tables: Record<string, unknown> = {};
      for (let i = 0; i < MAX_HI_SCORE_TABLES + 3; i++) {
        tables[`${prefix}-${String(i).padStart(2, '0')}`] = [row('X', i + 1)];
      }
      return tables;
    };
    const both = sanitizeSave({ version: 3, hiScores: full('new'), legacyScores: full('old') });
    expect(Object.keys(both.hiScores)).toHaveLength(MAX_HI_SCORE_TABLES);
    expect(Object.keys(both.legacyScores ?? {})).toHaveLength(MAX_HI_SCORE_TABLES);
    // A prototype key never reaches a prototype.
    const proto = parseSave(
      '{"version":3,"legacyScores":{"__proto__":[{"score":5}],"meter-normal":[{"score":7}]}}',
    );
    expect(Object.keys(proto.data.legacyScores ?? {})).toEqual(['meter-normal']);
    expect(({} as Record<string, unknown>).score).toBeUndefined();
  });

  it('records and renames rows in v2`s tables only, never in the archive', async () => {
    const storage = createMemoryStorage({ [SAVE_STORAGE_KEY]: V2 });
    const store = createSaveStore(storage, await loadSave(storage));
    const legacy = store.data.legacyScores;
    expect(legacy).toBeDefined();
    // The archive's tables are not v2's: the store reads none of them.
    expect(store.hiScores('meter-normal')).toEqual([]);
    expect(store.bestScore('meter-normal')).toBe(0);
    // A small score enters the empty v2 table at the top (the archive's 91,000 does not count).
    const rank = store.recordScore('meter-normal', createHiScoreEntry(10, { mode: '1p' }));
    expect(rank).toBe(0);
    expect(store.hiScores('meter-normal').map((r) => r.score)).toEqual([10]);
    expect(store.data.legacyScores).toBe(legacy);
    // Renaming finds rows in v2's tables only.
    const archived = legacy?.['meter-normal']?.[0];
    expect(archived).toBeDefined();
    expect(store.renameScore('meter-normal', archived as HiScoreEntry, 'HAX')).toBe(-1);
    expect(store.renameScore('meter-normal', store.hiScores('meter-normal')[0], 'NEW')).toBe(0);
    expect(store.data.legacyScores).toBe(legacy);
    expect(store.data.legacyScores).toEqual(V2_DOC.hiScores);
    // The other changes of a store carry the archive along untouched.
    store.count('gameOvers');
    store.unlock('loop2');
    store.setOptions(store.options);
    expect(store.data.legacyScores).toBe(legacy);
    expect(await store.flush()).toBe(true);
    const reloaded = (await loadSave(storage)).data;
    expect(reloaded.legacyScores).toEqual(V2_DOC.hiScores);
    expect(reloaded.hiScores['meter-normal'].map((r) => [r.name, r.score])).toEqual([['NEW', 10]]);
  });

  it('the hi-score screen shows its default rows for a migrated v1 save', async () => {
    const storage = createMemoryStorage({ [SAVE_STORAGE_KEY]: V2 });
    const save = createSaveStore(storage, await loadSave(storage));
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 3, stage: 't-s' }, frontEndContent().db, {
      scenes: 'title',
      save,
    });
    const flow = game.scenes!;
    flow.hiScores.showAttract();
    flow.stack.reset(flow.hiScores);
    game.step();
    // Only the chosen ship and difficulty's table (the save's game options choose Hard), and it is
    // empty: no v1 table counts as scored, so none of them gets a page.
    expect(flow.hiScores.pages).toEqual(['meter-hard']);
    for (const key of [...flow.hiScores.pages, ...Object.keys(V2_DOC.hiScores)]) {
      expect(flow.save.hiScores(key), key).toEqual([]);
    }
    const ui = game.renderFrame().ui;
    const texts: string[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) texts.push(ui.strings[ui.ref[i]]);
    }
    expect(texts).toContain('HI-SCORES');
    // Ten default rows (the empty name), none of v1's names.
    expect(texts.filter((text) => text === '---')).toHaveLength(HI_SCORE_TABLE_SIZE);
    for (const name of V1_NAMES) {
      if (name !== '---') expect(texts, name).not.toContain(name);
    }
  });

  it('a build one version older (v1.x) reads a newer document as the defaults, kept under save.corrupt (W4-14)', async () => {
    // What v1.x (format 2) does with a version-3 save is what this build does with a version-4
    // one: `migrateSave` refuses a version newer than the build's, `loadSave` copies the text
    // aside.
    const newer = JSON.stringify({
      version: SAVE_VERSION + 1,
      options: { audio: { music: 1 } },
      hiScores: { 'meter-normal': [row('NXT', 5)] },
    });
    const storage = createMemoryStorage({ [SAVE_STORAGE_KEY]: newer });
    const loaded = await loadSave(storage);
    expect(loaded.status).toBe('unreadable');
    expect(loaded.reason).toMatch(/newer than this build/);
    expect(loaded.data).toEqual(parseSave(null).data);
    expect(await storage.get(SAVE_CORRUPT_KEY)).toBe(newer);
  });
});
