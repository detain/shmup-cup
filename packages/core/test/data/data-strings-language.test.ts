/**
 * The `strings` loader's language gates (plan M3-03), and the cross-module invariant behind them.
 *
 * **The invariant.** `core/config` `LANGUAGE_ID_PATTERN` decides which `options.display.language`
 * a save may keep; the `strings` file schema decides which `content/strings/<id>.strings.json`
 * loads. If the two ever disagree, a language the content ships could be offered in the LANGUAGE
 * row and then thrown away by the next save — or worse, a save could name a language no file can
 * ever provide. They are two regexes in two modules, so nothing but a test keeps them equal: this
 * file drives the same id list through both and asserts they answer the same, character for
 * character, then checks the pattern's own source text as a second line of defence.
 *
 * **The load-side fixed-id gate.** `FIXED_UI_TEXT_IDS` is enforced twice — here (the file is
 * refused, entry by entry) and in `resolveUiText` (`test/ui/ui-strings-language.test.ts`). A
 * maintainer who deletes one gate must see a red test.
 */
import { describe, expect, it } from 'vitest';
import { LANGUAGE_ID_PATTERN, resolveUserOptions } from '../../src/config/index.js';
import { loadContent } from '../../src/data/index.js';
import { DEFAULT_UI_TEXT, FIXED_UI_TEXT_IDS, MAX_UI_TEXT_LENGTH } from '../../src/ui/index.js';

/**
 * A `strings` content file.
 *
 * @param language - Its `language` field (any value — the schema is what is under test).
 * @param strings - Its entries.
 * @returns The content file.
 */
function file(language: unknown, strings: Record<string, unknown> = { pressOk: 'OK' }) {
  return {
    path: `strings/${String(language)}.strings.json`,
    data: { formatVersion: 1, kind: 'strings', language, strings },
  };
}

/** Ids of every shape the two patterns could ever disagree about. */
const CANDIDATE_IDS = [
  'en',
  'es',
  'ja',
  'de',
  'zz',
  'pt-br',
  'zh-tw',
  'e',
  'eng',
  'EN',
  'En',
  'pt-BR',
  'pt_br',
  'pt-b',
  'pt-bra',
  'p1',
  '12',
  'en-',
  '-en',
  'en--br',
  'en-br-mx',
  '',
  'en ',
  ' en',
  'en.br',
  'ñn',
];

describe('core/data — the language id, shared with core/config (M3-03)', () => {
  it('accepts exactly the ids a save may keep — the two patterns agree id for id', () => {
    for (const id of CANDIDATE_IDS) {
      const { db, issues } = loadContent([file(id)]);
      const loads = issues.length === 0;
      const saves = LANGUAGE_ID_PATTERN.test(id);
      expect(loads, `content "${id}"`).toBe(saves);
      if (!loads) continue;
      expect(db.uiStrings.map((entry) => entry.language)).toEqual([id]);
      // …and a save naming exactly that id really survives `resolveUserOptions`.
      const options = resolveUserOptions({ display: { language: id } });
      expect(options.display.language, `save "${id}"`).toBe(id);
    }
  });

  it('states the same pattern in both modules, source and flags', () => {
    // A belt-and-braces check beside the behavioural one above: the schema's literal is private,
    // so read it out of the module source the way a reviewer would.
    expect(LANGUAGE_ID_PATTERN.source).toBe('^[a-z]{2}(?:-[a-z]{2})?$');
    expect(LANGUAGE_ID_PATTERN.flags).toBe('');
    expect(LANGUAGE_ID_PATTERN.global).toBe(false); // a `g` flag would make `.test` stateful
  });

  it('reports a bad language id once, and loads no table for the file', () => {
    const { db, issues } = loadContent([file('english')]);
    expect(db.uiStrings).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toContain('strings/english.strings.json');
  });
});

describe('core/data — the fixed-id gate at load (M3-03)', () => {
  it('refuses a redrawn fixed id, every one of them, naming the text it must keep', () => {
    for (const id of FIXED_UI_TEXT_IDS) {
      const { db, issues } = loadContent([file('es', { [id]: 'XX', pressOk: 'PULSA OK' })]);
      expect(
        issues.map((issue) => issue.message),
        id,
      ).toEqual([`"${id}" is the same in every language: it must stay "${DEFAULT_UI_TEXT[id]}"`]);
      expect(issues[0].path, id).toBe(`strings/es.strings.json:strings.${id}`);
      // The rest of the table is kept: one bad entry never costs a language its translation.
      expect(db.uiStrings[0].strings, id).toEqual({ pressOk: 'PULSA OK' });
    }
  });

  it('accepts a fixed id that repeats its English text — a full table may list them all', () => {
    const all: Record<string, string> = {};
    for (const id of FIXED_UI_TEXT_IDS) all[id] = DEFAULT_UI_TEXT[id];
    const { db, issues } = loadContent([file('es', { ...all, pressOk: 'PULSA OK' })]);
    expect(issues).toEqual([]);
    expect(Object.keys(db.uiStrings[0].strings)).toHaveLength(FIXED_UI_TEXT_IDS.length + 1);
  });

  it('reports the entries of one file independently, in file order', () => {
    const { db, issues } = loadContent([
      file('es', {
        pressOk: 'PULSA OK',
        gameTitle: 'OTRO JUEGO',
        back: 'ATRÁS',
        hi: 'MAX',
        bogusId: 'X',
        start: 'ДАВАЙ',
      }),
    ]);
    expect(issues.map((issue) => issue.path)).toEqual([
      'strings/es.strings.json:strings.gameTitle',
      'strings/es.strings.json:strings.hi',
      'strings/es.strings.json:strings.bogusId',
      'strings/es.strings.json:strings.start',
    ]);
    expect(db.uiStrings[0].strings).toEqual({ pressOk: 'PULSA OK', back: 'ATRÁS' });
  });
});

describe('core/data — the strings schema’s own limits (M3-03)', () => {
  it('refuses an empty text, one over the length limit, and a non-string', () => {
    const long = 'A'.repeat(MAX_UI_TEXT_LENGTH + 1);
    for (const value of ['', long, 1, null, ['A'], { a: 1 }]) {
      const { db, issues } = loadContent([file('es', { pressOk: value })]);
      expect(issues.length, JSON.stringify(value)).toBeGreaterThan(0);
      expect(db.uiStrings, JSON.stringify(value)).toEqual([]);
    }
    const { issues } = loadContent([file('es', { pressOk: 'A'.repeat(MAX_UI_TEXT_LENGTH) })]);
    expect(issues).toEqual([]);
  });

  it('refuses a key that is not id-shaped before it ever asks whether the id is known', () => {
    // The schema's key pattern is `^[A-Za-z][A-Za-z0-9.]*$`: the loader's "unknown UI string id"
    // message only ever has to talk about plausible ids.
    for (const key of ['0bad', '-bad', 'bad key', 'bad-key', 'sfx.Player Shot', '']) {
      const { issues } = loadContent([file('es', { [key]: 'X' })]);
      expect(issues.length, key).toBeGreaterThan(0);
      expect(issues[0].message, key).not.toContain('unknown UI string id');
    }
    // `sfx.<Cue>` keys are id-shaped, so they reach the known-id check and are reported there.
    const { issues } = loadContent([file('es', { 'sfx.NoSuchCue': 'X' })]);
    expect(issues.map((issue) => issue.message)).toEqual(['unknown UI string id "sfx.NoSuchCue"']);
  });

  it('keeps only the first table of a language, and reports the second', () => {
    const { db, issues } = loadContent([
      { ...file('es', { pressOk: 'PULSA OK' }), path: 'strings/a.strings.json' },
      { ...file('es', { pressOk: 'OTRO' }), path: 'strings/b.strings.json' },
    ]);
    expect(issues).toEqual([
      {
        path: 'strings/b.strings.json:language',
        message: 'UI strings for "es" are already defined',
      },
    ]);
    expect(db.uiStrings).toHaveLength(1);
    expect(db.uiStrings[0].strings.pressOk).toBe('PULSA OK');
  });

  it('loads an empty table without complaint — every id then falls back to English', () => {
    const { db, issues } = loadContent([file('es', {})]);
    expect(issues).toEqual([]);
    expect(db.uiStrings).toEqual([{ language: 'es', strings: {} }]);
  });
});
