/**
 * The language half of the UI string table (plan M3-03): the font's charset (`UI_GLYPHS`,
 * `isUiTextDrawable`), the languages the game offers (`UI_LANGUAGES`, `uiLanguageLabel`,
 * `uiLanguageIds`), the table a language resolves to (`pickUiStrings`) and the ids no translation
 * may change (`FIXED_UI_TEXT_IDS`, `isFixedUiTextId`).
 *
 * The fixed-id rule has **two** gates — `core/data` refuses the file at load, and `resolveUiText`
 * ignores the entry at resolve — so a table that reached memory some other way (a hand-built
 * `ContentDb`, a future loader, a test fixture) still cannot repaint the HUD. This file pins the
 * resolve-side gate; `test/data/data-strings-language.test.ts` pins the load-side one and
 * `test/integration/localization.test.ts` proves both hold together over the shipped content.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_UI_TEXT,
  FIXED_UI_TEXT_IDS,
  MAX_UI_TEXT_LENGTH,
  UI_GLYPHS,
  UI_LANGUAGES,
  UI_TEXT_IDS,
  isFixedUiTextId,
  isUiTextDrawable,
  pickUiStrings,
  resolveUiText,
  uiLanguageIds,
  uiLanguageLabel,
  type UiStringTableLike,
} from '../../src/ui/index.js';

/**
 * A `ContentDb.uiStrings` entry.
 *
 * @param language - Its language id.
 * @param strings - Its entries (empty by default).
 * @returns The table.
 */
function table(language: string, strings: Record<string, string> = {}): UiStringTableLike {
  return { language, strings };
}

describe('core/ui UI_GLYPHS — the font’s charset (M3-03)', () => {
  it('is one flat string of unique, single-unit code points', () => {
    const chars = UI_GLYPHS.split('');
    expect(new Set(chars).size).toBe(chars.length);
    // Every glyph is one UTF-16 unit: `isUiTextDrawable` walks with `charAt`, so an astral
    // character would be split into unpaired surrogates and could never match.
    for (const ch of chars) expect([...ch].length, ch).toBe(1);
    expect(chars.length).toBe(195);
  });

  it('holds printable ASCII, the UI symbols, the Spanish letters and the katakana subset', () => {
    for (let code = 0x20; code <= 0x7e; code++) {
      expect(UI_GLYPHS, String.fromCharCode(code)).toContain(String.fromCharCode(code));
    }
    for (const ch of '←↑→↓●★✕') expect(UI_GLYPHS, ch).toContain(ch);
    for (const ch of '¡¿ÁÉÍÓÚÑÜ') expect(UI_GLYPHS, ch).toContain(ch);
    for (const ch of 'アガパンー・、。ャ') expect(UI_GLYPHS, ch).toContain(ch);
    // Nothing else of the CJK planes ships: no hiragana, no kanji, no full-width forms.
    for (const ch of 'あ漢字１ヴ') expect(UI_GLYPHS, ch).not.toContain(ch);
    // Lower case Latin-1 is not there either — every label the UI draws is upper case.
    for (const ch of 'áéíóúñü') expect(UI_GLYPHS, ch).not.toContain(ch);
  });

  it('draws the empty string, every declared glyph, and nothing outside the set', () => {
    expect(isUiTextDrawable('')).toBe(true);
    expect(isUiTextDrawable(UI_GLYPHS)).toBe(true);
    for (const ch of UI_GLYPHS.split('')) expect(isUiTextDrawable(ch), ch).toBe(true);
    const NUL = String.fromCharCode(0);
    const NBSP = String.fromCharCode(0xa0);
    for (const text of ['Д', 'あ', '漢', '\n', '\t', NUL, `A${NBSP}B`, '😀', 'ヴ']) {
      expect(isUiTextDrawable(text), JSON.stringify(text)).toBe(false);
    }
    // One bad character anywhere in a long, otherwise fine label is enough.
    expect(isUiTextDrawable('ZONE A CLEAR')).toBe(true);
    expect(isUiTextDrawable(`ZONE A CLEAR${NBSP}`)).toBe(false);
  });

  it('draws every label of the built-in table and every language’s own name', () => {
    for (const id of UI_TEXT_IDS) expect(isUiTextDrawable(DEFAULT_UI_TEXT[id]), id).toBe(true);
    for (const language of UI_LANGUAGES) {
      expect(isUiTextDrawable(language.label), language.id).toBe(true);
      expect(language.label.length, language.id).toBeLessThanOrEqual(MAX_UI_TEXT_LENGTH);
    }
  });
});

describe('core/ui the languages on offer (M3-03)', () => {
  it('names en, es and ja, each in its own script, frozen', () => {
    expect(UI_LANGUAGES.map((language) => language.id)).toEqual(['en', 'es', 'ja']);
    expect(UI_LANGUAGES.map((language) => language.label)).toEqual([
      'ENGLISH',
      'ESPAÑOL',
      'ニホンゴ',
    ]);
    expect(Object.isFrozen(UI_LANGUAGES)).toBe(true);
    for (const language of UI_LANGUAGES) expect(Object.isFrozen(language)).toBe(true);
    expect(UI_LANGUAGES[0].id).toBe(DEFAULT_LANGUAGE);
  });

  it('labels an unnamed language by its upper-cased id', () => {
    expect(uiLanguageLabel('ja')).toBe('ニホンゴ');
    expect(uiLanguageLabel('fr')).toBe('FR');
    expect(uiLanguageLabel('pt-br')).toBe('PT-BR');
    expect(uiLanguageLabel('')).toBe('');
  });

  it('offers English first, then the content’s tables in UI_LANGUAGES order', () => {
    expect(uiLanguageIds([])).toEqual(['en']);
    expect(uiLanguageIds([table('ja'), table('es'), table('en')])).toEqual(['en', 'es', 'ja']);
    // English is built in: a content table for it adds nothing and never moves it.
    expect(uiLanguageIds([table('es')])).toEqual(['en', 'es']);
  });

  it('puts languages the game does not name last, alphabetically, and never repeats one', () => {
    expect(uiLanguageIds([table('pt-br'), table('ja'), table('fr'), table('de')])).toEqual([
      'en',
      'ja',
      'de',
      'fr',
      'pt-br',
    ]);
    expect(uiLanguageIds([table('es'), table('es'), table('en'), table('en')])).toEqual([
      'en',
      'es',
    ]);
  });

  it('returns a fresh array every call — the Options screen keeps its own copy', () => {
    const tables = [table('es')];
    const a = uiLanguageIds(tables);
    const b = uiLanguageIds(tables);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.push('zz');
    expect(uiLanguageIds(tables)).toEqual(['en', 'es']);
  });

  it('picks a language’s table, falls back to English, then to nothing', () => {
    const es = table('es', { pressOk: 'PULSA OK' });
    const en = table('en', { pressOk: 'PRESS OK' });
    expect(pickUiStrings([en, es], 'es')).toBe(es.strings);
    expect(pickUiStrings([en, es], 'ja')).toBe(en.strings);
    // No English table either: `resolveUiText(null)` then uses the built-in one as it is.
    expect(pickUiStrings([es], 'ja')).toBeNull();
    expect(pickUiStrings([], 'en')).toBeNull();
    expect(resolveUiText(pickUiStrings([], 'ja'))).toBe(DEFAULT_UI_TEXT);
    // The first table of a language wins (the loader refuses a second one anyway).
    const first = table('es', { pressOk: 'A' });
    expect(pickUiStrings([first, table('es', { pressOk: 'B' })], 'es')).toBe(first.strings);
  });
});

describe('core/ui the fixed ids (M3-03)', () => {
  it('lists real ids only, frozen, and answers isFixedUiTextId', () => {
    expect(Object.isFrozen(FIXED_UI_TEXT_IDS)).toBe(true);
    expect(new Set(FIXED_UI_TEXT_IDS).size).toBe(FIXED_UI_TEXT_IDS.length);
    for (const id of FIXED_UI_TEXT_IDS) {
      expect(UI_TEXT_IDS, id).toContain(id);
      expect(isFixedUiTextId(id), id).toBe(true);
    }
    expect(isFixedUiTextId('pressOk')).toBe(false);
    expect(isFixedUiTextId('nope')).toBe(false);
    // The two the HUD and the auto-order screen really cannot survive losing.
    expect(FIXED_UI_TEXT_IDS).toContain('gameTitle');
    expect(FIXED_UI_TEXT_IDS).toContain('orderCodes');
  });

  it('keeps every fixed id English however hard a table tries (the resolve-side gate)', () => {
    for (const id of FIXED_UI_TEXT_IDS) {
      const text = resolveUiText({ [id]: 'XX' });
      expect(text[id], id).toBe(DEFAULT_UI_TEXT[id]);
      // Nothing else moved either: a refused entry is not a refused table.
      expect(text, id).toBe(DEFAULT_UI_TEXT);
    }
    const mixed = resolveUiText({ gameTitle: 'OTRO JUEGO', pressOk: 'PULSA OK' });
    expect(mixed.gameTitle).toBe(DEFAULT_UI_TEXT.gameTitle);
    expect(mixed.pressOk).toBe('PULSA OK');
  });

  it('falls back entry by entry for missing, empty, non-string and inherited values', () => {
    const odd = resolveUiText({
      pressOk: '',
      back: 42 as unknown as string,
      start: null as unknown as string,
      done: undefined as unknown as string,
      none: 'NINGUNO',
      unknownId: 'IGNORED',
    });
    expect(odd.pressOk).toBe(DEFAULT_UI_TEXT.pressOk);
    expect(odd.back).toBe(DEFAULT_UI_TEXT.back);
    expect(odd.start).toBe(DEFAULT_UI_TEXT.start);
    expect(odd.done).toBe(DEFAULT_UI_TEXT.done);
    expect(odd.none).toBe('NINGUNO');
    expect(odd.unknownId).toBeUndefined();
    expect(Object.keys(odd)).toEqual([...UI_TEXT_IDS]);
    expect(Object.isFrozen(odd)).toBe(true);
    // An inherited entry is not the table's own: the prototype chain may not translate anything.
    const inherited = Object.create({ pressOk: 'HERENCIA' }) as Record<string, string>;
    expect(resolveUiText(inherited)).toBe(DEFAULT_UI_TEXT);
  });

  it('never lets a table’s key reach the result unless it is a known id', () => {
    const hostile = JSON.parse(
      '{"__proto__":{"pressOk":"X"},"constructor":"Y","toString":"Z","pressOk":"PULSA OK"}',
    ) as Record<string, string>;
    const text = resolveUiText(hostile);
    expect(text.pressOk).toBe('PULSA OK');
    expect(Object.keys(text)).toEqual([...UI_TEXT_IDS]);
    expect(({} as Record<string, unknown>).pressOk).toBeUndefined();
    // `toString` is still the prototype's, not the table's `"Z"`.
    expect(typeof text.toString).toBe('function');
  });
});
