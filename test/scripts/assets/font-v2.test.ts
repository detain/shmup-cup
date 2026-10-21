/**
 * `assets/source/fonts/pixel9x12.font.json` — the native v2 font (R4-03).
 *
 * C1 committed the file as v1's glyphs nearest-neighbour-scaled into the 9×12 cell; C2 redraws
 * ASCII 32–126 by hand so the taller cell reads as designed pixel art, not as blocks: full
 * 8-row capitals and digits (rows 2–9, baseline row 9), x-height letters on rows 5–9, a two-row
 * descender band (rows 10–11) for `g j p q y , ;` (and `_` on row 10 alone), rows 0–1 kept as
 * the accent reserve the Latin and kana rounds (C3, C4) fill, and the 9th column kept as the
 * spacing column. Code points, the cell, the line and the advance are pinned in `font.test.ts`
 * (C1's describe for this file); pixels are deliberately not pinned here — that is the owner's
 * eyeball row — but every *shape law* the redraw had to satisfy is asserted, and two glyphs of
 * the same bitmap (a collapsed redraw) fail the suite.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFontSource } from '../../../scripts/assets/font.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FONT_FILE = 'assets/source/fonts/pixel9x12.font.json';
const { font, issues } = parseFontSource(
  JSON.parse(readFileSync(join(repo, FONT_FILE), 'utf8')) as Record<string, unknown>,
  FONT_FILE,
);

/** The code points C2 redraws: printable ASCII, including the space. */
const ASCII = [...Array.from({ length: 126 - 32 + 1 }, (_, i) => 32 + i)];

/** Glyphs allowed to rest above the baseline (marks, operators and the like). */
const NO_BASELINE = new Set(
  ['"', "'", '*', '+', '-', '=', '^', '_', '`', '~'].map((ch) => ch.codePointAt(0) ?? 0),
);

/** Glyphs allowed ink below the baseline; the seven with a 2-row tail, `_` row 10 only. */
const DESCENDER = new Set(
  ['g', 'j', 'p', 'q', 'y', ',', ';', '_'].map((ch) => ch.codePointAt(0) ?? 0),
);

/**
 * The rows of one code point.
 *
 * @param code - The code point.
 * @returns Its 12 cell rows.
 */
function rows(code: number): string[] {
  const glyph = font?.glyphs.find((g) => g.code === code);
  if (!glyph) throw new Error(`no glyph for U+${code.toString(16)}`);
  return glyph.rows;
}

describe('assets/source/fonts/pixel9x12.font.json — the v2 cell and its laws (R4-03.C2)', () => {
  it('parses clean as a native v2 font with the RR-2 metrics', () => {
    expect(issues).toEqual([]);
    expect(font?.name).toBe('pixel');
    expect(font?.native).toBe(true);
    expect(font).toMatchObject({ cellWidth: 9, cellHeight: 12, lineHeight: 15 });
    for (const glyph of font?.glyphs ?? []) {
      expect(glyph.rows).toHaveLength(12);
      expect(glyph.advance).toBe(9);
    }
  });

  it('keeps the spacing column of every glyph empty', () => {
    for (const glyph of font?.glyphs ?? []) {
      for (const row of glyph.rows) expect(row.charAt(8), String(glyph.code)).toBe('.');
    }
  });

  it('covers printable ASCII at the cell (space included, every glyph inked but it)', () => {
    const codes = new Set((font?.glyphs ?? []).map((g) => g.code));
    for (const code of ASCII) expect(codes.has(code), String.fromCodePoint(code)).toBe(true);
    for (const code of ASCII) {
      const inked = rows(code).some((row) => row.includes('#'));
      expect(inked, String.fromCodePoint(code)).toBe(code !== 32);
    }
  });

  it('holds ASCII to the body: rows 0–1 empty, ink below row 9 only in the descender band', () => {
    for (const code of ASCII) {
      if (code === 32) continue;
      const name = String.fromCodePoint(code);
      const r = rows(code);
      for (const row of r.slice(0, 2)) expect(row, `${name} accent reserve`).toBe('.........');
      const below = r.slice(10).some((row) => row.includes('#'));
      expect(below, `${name} descender`).toBe(DESCENDER.has(code));
      if (!DESCENDER.has(code)) continue;
      const deep = r[11].includes('#');
      expect(deep, `${name} row 11`).toBe(code !== 95); // '_' sits on row 10, not 11
    }
  });

  it('stands every other ASCII glyph on the baseline row 9', () => {
    for (const code of ASCII) {
      if (code === 32 || NO_BASELINE.has(code)) continue;
      expect(rows(code)[9].includes('#'), String.fromCodePoint(code)).toBe(true);
    }
  });

  it('draws every glyph of the file — ASCII or not — with its own bitmap', () => {
    const seen = new Map<string, string>();
    for (const glyph of font?.glyphs ?? []) {
      const key = glyph.rows.join('|');
      const name = `U+${glyph.code.toString(16).padStart(4, '0')}`;
      expect(seen.has(key), `${name} same as ${seen.get(key) ?? '?'}`).toBe(false);
      seen.set(key, name);
    }
  });
});

describe('assets/source/fonts/pixel9x12.font.json — the accented Latin and the symbols (R4-03.C3)', () => {
  /** The five acute vowels and the two tilde/diaeresis caps, by code point. */
  const ACCENTED: Array<[number, number]> = [
    [0xc1, 0x41], // Á over A
    [0xc9, 0x45], // É over E
    [0xcd, 0x49], // Í over I
    [0xd3, 0x4f], // Ó over O
    [0xda, 0x55], // Ú over U
    [0xd1, 0x4e], // Ñ over N
    [0xdc, 0x55], // Ü over U
  ];

  it('fills the accent reserve of every accented cap without touching its base body', () => {
    for (const [acc, base] of ACCENTED) {
      const r = rows(acc);
      expect(
        r.slice(0, 2).some((row) => row.includes('#'), `U+${acc.toString(16)}`),
        'accent band',
      ).toBe(true);
      const below = r.slice(2).join('|');
      const baseBelow = rows(base).slice(2).join('|');
      if (acc !== 0xdc) expect(below, `U+${acc.toString(16)} body = base body`).toBe(baseBelow);
    }
  });

  it('draws the inverted marks as the exact vertical mirrors of ! and ?', () => {
    for (const [inv, upright] of [
      [0xa1, 0x21],
      [0xbf, 0x3f],
    ]) {
      const r = rows(inv);
      for (const row of [...r.slice(0, 3), ...r.slice(10)])
        expect(row, `U+${inv.toString(16)} band`).toBe('.........');
      for (let i = 0; i < 7; i++)
        expect(r[3 + i], `U+${inv.toString(16)} row ${i}`).toBe(rows(upright)[9 - i]);
    }
  });

  it('keeps the arrows and marks inside the body band (rows 2–9)', () => {
    for (const code of [0x2190, 0x2191, 0x2192, 0x2193, 0x25cf, 0x2715, 0x2605]) {
      const r = rows(code);
      for (const row of [...r.slice(0, 2), ...r.slice(10)])
        expect(row, `U+${code.toString(16)} band`).toBe('.........');
      expect(r.slice(2, 10).some((row) => row.includes('#'))).toBe(true);
    }
  });
});

describe('assets/source/fonts/pixel9x12.font.json — katakana (R4-03.C4)', () => {
  /** The 46 base kana (no marks, no small forms) in the file's own order. */
  const BASE_KANA = [
    ...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン',
  ];

  it('carries all 46 base kana', () => {
    for (const ch of BASE_KANA) {
      const code = ch.codePointAt(0) ?? 0;
      expect(
        font?.glyphs.some((g) => g.code === code),
        `U+${code.toString(16)}`,
      ).toBe(true);
    }
  });

  it('keeps the base kana out of the mark reserve and below-baseline row 11', () => {
    for (const ch of BASE_KANA) {
      const r = rows(ch.codePointAt(0) ?? 0);
      for (const row of [...r.slice(0, 3), r[11]])
        expect(row, `U+${ch.codePointAt(0)?.toString(16)} band`).toBe('.........');
      expect(
        r.slice(3, 11).some((row) => row.includes('#')),
        ch,
      ).toBe(true);
      // a row-10 tail is a long diagonal or a leg — it must attach to ink above.
      if (r[10].includes('#'))
        expect(
          r.slice(3, 10).some((row) => row.includes('#')),
          ch,
        ).toBe(true);
    }
  });

  /** Voiced kana mapped to their base: the body is the base, plus dakuten dots. */
  const VOICED: Array<[string, string]> = [
    ['\u30ac', '\u30ab'],
    ['\u30ae', '\u30ad'],
    ['\u30b0', '\u30af'],
    ['\u30b2', '\u30b1'],
    ['\u30b4', '\u30b3'],
    ['\u30b6', '\u30b5'],
    ['\u30b8', '\u30b7'],
    ['\u30ba', '\u30b9'],
    ['\u30bc', '\u30bb'],
    ['\u30be', '\u30bd'],
    ['\u30c0', '\u30bf'],
    ['\u30c2', '\u30c1'],
    ['\u30c5', '\u30c4'],
    ['\u30c7', '\u30c6'],
    ['\u30c9', '\u30c8'],
    ['\u30d0', '\u30cf'],
    ['\u30d3', '\u30d2'],
    ['\u30d6', '\u30d5'],
    ['\u30d9', '\u30d8'],
    ['\u30dc', '\u30db'],
  ];

  /** Semi-voiced kana mapped to their base: the body is the base, plus a ring. */
  const SEMI_VOICED: Array<[string, string]> = [
    ['\u30d1', '\u30cf'],
    ['\u30d4', '\u30d2'],
    ['\u30d7', '\u30d5'],
    ['\u30da', '\u30d8'],
    ['\u30dd', '\u30db'],
  ];

  it('draws every voiced kana as its base body with a mark in the reserve', () => {
    for (const [kana, base] of [...VOICED, ...SEMI_VOICED]) {
      const r = rows(kana.codePointAt(0) ?? 0);
      const b = rows(base.codePointAt(0) ?? 0);
      expect(r.slice(3).join('|'), `${kana} body = ${base}`).toBe(b.slice(3).join('|'));
      expect(
        r.slice(0, 3).some((row) => row.includes('#')),
        `${kana} mark`,
      ).toBe(true);
    }
  });

  it('keeps small kana and kana punctuation off the mark reserve and row 11', () => {
    for (const ch of [
      ...'\u30a1\u30a3\u30a5\u30a7\u30a9\u30e3\u30e5\u30e7\u30c3',
      ...'\u30fc\u30fb\u3001\u3002',
    ]) {
      const r = rows(ch.codePointAt(0) ?? 0);
      for (const row of [...r.slice(0, 3), r[11]]) expect(row, `${ch} band`).toBe('.........');
      expect(
        r.slice(3, 11).some((row) => row.includes('#')),
        ch,
      ).toBe(true);
    }
  });
});
