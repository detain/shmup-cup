/**
 * The whole localization chain, end to end (plan M3-03).
 *
 * `content/strings/<id>.strings.json` → `core/data` → `core/ui` `UI_GLYPHS` →
 * `assets/source/fonts/pixel6x8.font.json` → the **built atlas** → the save's
 * `options.display.language` → the scene flow's table → the DISPLAY page's LANGUAGE row and back
 * into the save. Every link in it is owned by a different module, and the seams are what a future
 * maintainer breaks without noticing:
 *
 *  - a language id the content ships that the **save** would throw away (two regexes, two modules);
 *  - a glyph the loader accepts that the **atlas** has no frame for (three files, one charset);
 *  - a `FIXED_UI_TEXT_IDS` entry that reaches the HUD because **one of the two gates** was removed;
 *  - a language the DISPLAY row offers that the save cannot store, or stores and cannot read back.
 *
 * `test/integration/content.test.ts` checks the shipped tables' *coverage*; this file checks that
 * the pieces around them still fit together.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_UI_TEXT,
  FIXED_UI_TEXT_IDS,
  LANGUAGE_ID_PATTERN,
  UI_GLYPHS,
  UI_LANGUAGES,
  UI_TEXT_IDS,
  createGame,
  createHeadlessPlatform,
  createSaveStore,
  isUiTextDrawable,
  loadContent,
  parseSave,
  pickUiStrings,
  resolveUiText,
  resolveUserOptions,
  serializeSave,
  uiLanguageIds,
  uiLanguageLabel,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shippedFiles = readContentFiles(join(repo, 'content'));
const { db, issues } = loadContent(shippedFiles);
const { manifest } = buildAtlas();

describe('integration: a shipped language survives the save (M3-03)', () => {
  it('loads the content without issues and offers exactly the named languages', () => {
    expect(issues).toEqual([]);
    expect(uiLanguageIds(db.uiStrings)).toEqual(UI_LANGUAGES.map((language) => language.id));
  });

  it('keeps every content language through resolveUserOptions and a save round trip', () => {
    for (const language of uiLanguageIds(db.uiStrings)) {
      // The two patterns that must agree: the file schema let the table load, so the save must
      // keep the id. A mismatch would offer a language the next launch silently drops.
      expect(LANGUAGE_ID_PATTERN.test(language), language).toBe(true);
      const options = resolveUserOptions({ display: { language } });
      expect(options.display.language, language).toBe(language);
      const store = createSaveStore(null);
      store.setOptions({ ...store.options, display: { ...store.options.display, language } });
      const read = parseSave(serializeSave(store.data));
      expect(read.status, language).toBe('ok');
      expect(read.data.options.display.language, language).toBe(language);
    }
  });

  it('falls back to English for a language the content no longer carries, never to blank', () => {
    // A save written by a build that shipped one more language, read by one that does not.
    const options = resolveUserOptions({ display: { language: 'fr' } });
    expect(options.display.language).toBe('fr'); // the save keeps what it was given…
    const text = resolveUiText(pickUiStrings(db.uiStrings, 'fr'));
    // …and the resolver falls back to the English table, so every id still has words.
    for (const id of UI_TEXT_IDS) expect(text[id].length, id).toBeGreaterThan(0);
    expect(text.titleOptions).toBe(DEFAULT_UI_TEXT.titleOptions);
    // A save naming something the pattern refuses is repaired to English at read time.
    expect(resolveUserOptions({ display: { language: 'francais' } }).display.language).toBe(
      DEFAULT_LANGUAGE,
    );
  });
});

describe('integration: every accepted glyph really reaches the atlas (M3-03)', () => {
  it('gives the built font a frame and an advance for every UI_GLYPHS character', () => {
    const font = manifest.fonts.pixel;
    expect(font).toBeDefined();
    const frames = new Set(Object.keys(manifest.frames));
    for (const ch of UI_GLYPHS.split('')) {
      const code = String(ch.codePointAt(0) ?? 0);
      const glyph = font.glyphs[code] as { frame: string; advance: number } | undefined;
      expect(glyph, `${ch} (U+${Number(code).toString(16).toUpperCase()})`).toBeDefined();
      expect(frames.has(glyph?.frame ?? ''), ch).toBe(true);
      expect(glyph?.advance, ch).toBe(font.cellWidth);
    }
  });

  it('carries no glyph the charset does not declare — nothing unused is packed', () => {
    const declared = new Set(UI_GLYPHS.split('').map((ch) => String(ch.codePointAt(0) ?? 0)));
    expect(Object.keys(manifest.fonts.pixel.glyphs).sort()).toEqual([...declared].sort());
  });

  it('can draw every text of every shipped table, character for character', () => {
    const font = manifest.fonts.pixel;
    for (const tableSpec of db.uiStrings) {
      for (const id of Object.keys(tableSpec.strings)) {
        const text = tableSpec.strings[id];
        expect(isUiTextDrawable(text), `${tableSpec.language}.${id}: ${text}`).toBe(true);
        for (const ch of text.split('')) {
          const code = String(ch.codePointAt(0) ?? 0);
          expect(font.glyphs[code], `${tableSpec.language}.${id}: ${ch}`).toBeDefined();
        }
      }
    }
  });
});

describe('integration: the fixed ids are gated twice (M3-03)', () => {
  it('refuses the file at load — the first gate', () => {
    const bad = FIXED_UI_TEXT_IDS.map((id) => [id, 'XX'] as const);
    const { db: loaded, issues: reported } = loadContent([
      {
        path: 'strings/zz.strings.json',
        data: {
          formatVersion: 1,
          kind: 'strings',
          language: 'zz',
          strings: Object.assign({ pressOk: 'PULSA OK' }, fromBad(bad)),
        },
      },
    ]);
    expect(reported).toHaveLength(FIXED_UI_TEXT_IDS.length);
    expect(loaded.uiStrings[0].strings).toEqual({ pressOk: 'PULSA OK' });
  });

  it('ignores the entry at resolve — the second gate, for a table that came from elsewhere', () => {
    // A `ContentDb` a test, a future loader or a hand-built fixture put together: it never went
    // through `collectUiStrings`, so only the resolver stands between it and the HUD.
    const hostile: Record<string, string> = { pressOk: 'PULSA OK' };
    for (const id of FIXED_UI_TEXT_IDS) hostile[id] = 'XX';
    const text = resolveUiText(hostile);
    for (const id of FIXED_UI_TEXT_IDS) expect(text[id], id).toBe(DEFAULT_UI_TEXT[id]);
    expect(text.pressOk).toBe('PULSA OK');
  });

  it('keeps the HUD’s fixed codes English in a running game, whatever the save chose', () => {
    const platform = createHeadlessPlatform();
    for (const language of uiLanguageIds(db.uiStrings)) {
      const save = createSaveStore(null);
      save.setOptions({ ...save.options, display: { ...save.options.display, language } });
      const flow = createGame(platform, {}, db, { scenes: 'title', save }).scenes;
      expect(flow, language).not.toBeNull();
      expect(flow?.language, language).toBe(language);
      for (const id of FIXED_UI_TEXT_IDS) {
        expect(flow?.text[id], `${language}.${id}`).toBe(DEFAULT_UI_TEXT[id]);
      }
    }
  });
});

describe('integration: the DISPLAY page’s LANGUAGE row (M3-03)', () => {
  it('offers the loaded languages with their own names, and starts on the save’s choice', () => {
    const platform = createHeadlessPlatform();
    const languages = uiLanguageIds(db.uiStrings);
    for (const language of languages) {
      const save = createSaveStore(null);
      save.setOptions({ ...save.options, display: { ...save.options.display, language } });
      const flow = createGame(platform, {}, db, { scenes: 'title', save }).scenes;
      expect(flow?.languages, language).toEqual(languages);
      // The row draws each language's own name — the same whichever language is shown, so a
      // player who cannot read the current one can still find theirs.
      for (const id of flow?.languages ?? []) {
        const label = uiLanguageLabel(id);
        expect(label, id).toBe(
          UI_LANGUAGES.find((entry) => entry.id === id)?.label ?? id.toUpperCase(),
        );
        // Every offered name must be drawable, or the row would show a gap in that language.
        expect(isUiTextDrawable(label), label).toBe(true);
      }
    }
  });

  it('says so in the hint: the choice applies from the next launch, not live', () => {
    // The scenes build their menus and the HUD when the flow is constructed, so a live swap would
    // leave half the screens on the old table. The row's hint is the contract with the player.
    const hint = DEFAULT_UI_TEXT.languageHint;
    expect(hint).toContain('LANGUAGE');
    expect(hint).toContain('NEXT LAUNCH');
    for (const table of db.uiStrings) {
      const text = table.strings.languageHint;
      if (text === undefined) continue;
      expect(isUiTextDrawable(text), table.language).toBe(true);
    }
  });
});

/**
 * Builds an object from entries (`Object.fromEntries` is banned repo-wide — Chromium 69).
 *
 * @param pairs - The entries.
 * @returns The object.
 */
function fromBad(pairs: ReadonlyArray<readonly [string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of pairs) out[key] = value;
  return out;
}
