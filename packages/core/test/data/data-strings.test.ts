/**
 * `core/data` kind `strings` (plan M2-16): a language's UI string table — the schema (language id,
 * texts 1–48 characters), unknown ids and characters the bitmap font lacks reported entry by entry
 * (the rest kept), one table per language, and `ContentDb.uiStrings`.
 */
import { describe, expect, it } from 'vitest';
import { CONTENT_KINDS, EMPTY_CONTENT_DB, loadContent } from '../../src/data/index.js';

/**
 * A strings file.
 *
 * @param language - Its language.
 * @param strings - Its entries.
 * @param path - Its path.
 * @returns The content file.
 */
function file(
  language: unknown,
  strings: unknown,
  path = `strings/${String(language)}.strings.json`,
) {
  return { path, data: { formatVersion: 1, kind: 'strings', language, strings } };
}

describe('core/data strings (M2-16)', () => {
  it('is a core kind and loads a table per language', () => {
    expect(CONTENT_KINDS).toContain('strings');
    expect(EMPTY_CONTENT_DB.uiStrings).toEqual([]);
    const { db, issues } = loadContent([
      file('fr', { pressOk: 'APPUYEZ SUR OK', 'sfx.PlayerShot': 'TIR' }),
      file('pt-br', { pressOk: 'APERTE OK' }),
    ]);
    expect(issues).toEqual([]);
    expect(db.uiStrings).toEqual([
      { language: 'fr', strings: { pressOk: 'APPUYEZ SUR OK', 'sfx.PlayerShot': 'TIR' } },
      { language: 'pt-br', strings: { pressOk: 'APERTE OK' } },
    ]);
    expect(Object.isFrozen(db.uiStrings[0].strings)).toBe(true);
  });

  it('reports unknown ids and glyphs the font lacks, keeping the good entries', () => {
    const { db, issues } = loadContent([
      file('de', { pressOk: 'OK DRÜCKEN', hi: 'REKORD', bogusId: 'X', 'sfx.Nope': 'Y' }),
    ]);
    expect(issues).toEqual([
      {
        path: 'strings/de.strings.json:strings.pressOk',
        message: 'uses a character the bitmap font does not have',
      },
      {
        path: 'strings/de.strings.json:strings.bogusId',
        message: 'unknown UI string id "bogusId"',
      },
      {
        path: 'strings/de.strings.json:strings.sfx.Nope',
        message: 'unknown UI string id "sfx.Nope"',
      },
    ]);
    expect(db.uiStrings[0].strings).toEqual({ hi: 'REKORD' });
  });

  it('refuses a bad language, empty or long texts, and a second table of a language', () => {
    const bad = loadContent([file('FR', { pressOk: 'X' })]);
    expect(bad.issues.map((i) => i.path)).toEqual(['strings/FR.strings.json:language']);
    const lengths = loadContent([file('fr', { pressOk: '', hi: 'X'.repeat(49) })]);
    expect(lengths.issues.map((i) => i.path)).toEqual([
      'strings/fr.strings.json:strings.pressOk',
      'strings/fr.strings.json:strings.hi',
    ]);
    const twice = loadContent([
      file('fr', { hi: 'A' }, 'strings/a.strings.json'),
      file('fr', { hi: 'B' }, 'strings/b.strings.json'),
    ]);
    expect(twice.issues).toEqual([
      {
        path: 'strings/b.strings.json:language',
        message: 'UI strings for "fr" are already defined',
      },
    ]);
    expect(twice.db.uiStrings).toHaveLength(1);
  });
});
