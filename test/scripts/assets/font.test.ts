/**
 * `scripts/assets/font.mjs` and the committed `assets/source/fonts/pixel6x8.font.json`.
 *
 * Acceptance (M1-03): the original 6×8 pixel font covers ASCII 32–126 plus
 * `← ↑ → ↓ ● ✕ ★`; glyph frames go into the atlas, metrics into the manifest.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ASCII_PRINTABLE,
  buildFontSprite,
  parseFontSource,
} from '../../../scripts/assets/font.mjs';
import { getPixel } from '../../../scripts/assets/image.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FONT_FILE = 'assets/source/fonts/pixel6x8.font.json';
const pixelJson = JSON.parse(readFileSync(join(repo, FONT_FILE), 'utf8')) as Record<
  string,
  unknown
>;

/** The extra glyphs the HUD and menus need. */
const SPECIALS = ['←', '↑', '→', '↓', '●', '✕', '★'].map((ch) => ch.codePointAt(0) ?? 0);

/** A minimal valid font. */
const TINY = {
  name: 'tiny',
  cellWidth: 2,
  cellHeight: 2,
  lineHeight: 3,
  advance: 3,
  glyphs: { B: ['#.', '.#'], A: { rows: ['##', '##'], advance: 1 } },
};

describe('assets/source/fonts/pixel6x8.font.json', () => {
  const { font, issues } = parseFontSource(pixelJson, FONT_FILE);

  it('is valid', () => {
    expect(issues).toEqual([]);
    expect(font?.name).toBe('pixel');
  });

  it('covers ASCII 32–126 and the arrows, dot, cross and star — nothing else', () => {
    expect(font?.glyphs.map((g) => g.code)).toEqual(
      [...ASCII_PRINTABLE, ...SPECIALS].sort((a, b) => a - b),
    );
  });

  it('uses 6×8 cells, advance 6 and a 10-px line', () => {
    expect(font).toMatchObject({ cellWidth: 6, cellHeight: 8, lineHeight: 10 });
    for (const glyph of font?.glyphs ?? []) {
      expect(glyph.rows).toHaveLength(8);
      expect(glyph.advance).toBe(6);
    }
  });

  it('keeps the spacing column empty and every glyph but space inked', () => {
    for (const glyph of font?.glyphs ?? []) {
      for (const row of glyph.rows)
        expect(row.charAt(5), String.fromCodePoint(glyph.code)).toBe('.');
      const inked = glyph.rows.join('').includes('#');
      expect(inked, String.fromCodePoint(glyph.code)).toBe(glyph.code !== 32);
    }
  });

  it('draws every digit differently, and 0 differently from O (readable score digits)', () => {
    const rows = (ch: string) =>
      font?.glyphs.find((g) => g.code === ch.charCodeAt(0))?.rows.join('');
    const digits = '0123456789'.split('').map(rows);
    expect(new Set(digits).size).toBe(10);
    expect(rows('0')).not.toBe(rows('O'));
  });
});

describe('scripts/assets/font — buildFontSprite', () => {
  it('makes one white frame per glyph in code-point order and points the metrics at them', () => {
    const { font } = parseFontSource(TINY, 't');
    expect(font).not.toBeNull();
    if (font === null) return;
    const { sprite, metrics } = buildFontSprite(font);
    expect(sprite.name).toBe('font/tiny');
    expect(sprite.anchor).toEqual([0, 0]);
    expect(sprite.frames).toHaveLength(2);
    expect(getPixel(sprite.frames[0], 0, 0)).toEqual([255, 255, 255, 255]); // 'A' first
    expect(getPixel(sprite.frames[1], 1, 0)).toEqual([0, 0, 0, 0]);
    expect(metrics).toEqual({
      sprite: 'font/tiny',
      lineHeight: 3,
      cellWidth: 2,
      cellHeight: 2,
      glyphs: {
        '65': { frame: 'font/tiny#0', advance: 1 },
        '66': { frame: 'font/tiny#1', advance: 3 },
      },
    });
  });
});

describe('scripts/assets/font — parseFontSource failures', () => {
  it.each([
    ['not an object', 5, 't:'],
    ['an unknown field', { ...TINY, size: 1 }, 't:size'],
    ['a bad name', { ...TINY, name: 'Tiny Font' }, 't:name'],
    ['a zero cell width', { ...TINY, cellWidth: 0 }, 't:cellWidth'],
    ['a negative advance', { ...TINY, advance: -1 }, 't:advance'],
    ['no glyphs', { ...TINY, glyphs: {} }, 't:glyphs'],
    ['a multi-character key', { ...TINY, glyphs: { AB: ['##', '##'] } }, 't:glyphs["AB"]'],
    ['a wrong row count', { ...TINY, glyphs: { A: ['##'] } }, 't:glyphs["A"].rows'],
    ['a wrong row width', { ...TINY, glyphs: { A: ['###', '##'] } }, 't:glyphs["A"].rows[0]'],
    ['a foreign character', { ...TINY, glyphs: { A: ['#x', '##'] } }, 't:glyphs["A"].rows[0]'],
    [
      'a bad glyph advance',
      { ...TINY, glyphs: { A: { rows: ['##', '##'], advance: 1.5 } } },
      't:glyphs["A"].advance',
    ],
    [
      'an unknown glyph field',
      { ...TINY, glyphs: { A: { rows: ['##', '##'], w: 1 } } },
      't:glyphs["A"].w',
    ],
  ])('reports %s', (_label, json, path) => {
    const { font, issues } = parseFontSource(json, 't');
    expect(font).toBeNull();
    expect(issues.map((i) => i.path)).toContain(path);
  });
});
