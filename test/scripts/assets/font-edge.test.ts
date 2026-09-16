/**
 * `scripts/assets/font.mjs` edge cases: glyph-key rules (one code point, astral planes
 * included), advance overrides, issue collection, `loadFontSources()` on disk (duplicate
 * font names, broken JSON, unrelated files), the glyph sprite's pixels, and design rules
 * of the committed pixel font (distinct glyphs, descenders, mirror-image pairs).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ASCII_PRINTABLE,
  FONT_NAME_PATTERN,
  FONT_SOURCE_SUFFIX,
  buildFontSprite,
  loadFontSources,
  parseFontSource,
} from '../../../scripts/assets/font.mjs';
import { getPixel } from '../../../scripts/assets/image.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-font-edge-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A minimal valid font (2×2 cells). */
const TINY = {
  name: 'tiny',
  cellWidth: 2,
  cellHeight: 2,
  lineHeight: 3,
  advance: 3,
  glyphs: { A: ['##', '#.'] } as Record<string, unknown>,
};

/**
 * Writes files into a fresh directory under the temp root.
 *
 * @param name - Directory name.
 * @param files - Relative path → contents.
 * @returns The directory.
 */
function tree(name: string, files: Record<string, string>): string {
  const root = join(tmp, name);
  mkdirSync(root, { recursive: true });
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

/**
 * Parses a variant of {@link TINY}.
 *
 * @param patch - Fields to override.
 * @returns The parse result.
 */
const parse = (patch: Record<string, unknown>) => parseFontSource({ ...TINY, ...patch }, 't');

describe('scripts/assets/font — constants', () => {
  it('lists printable ASCII 32…126 and names fonts in kebab case', () => {
    expect(ASCII_PRINTABLE).toHaveLength(95);
    expect(ASCII_PRINTABLE[0]).toBe(32);
    expect(ASCII_PRINTABLE[94]).toBe(126);
    expect(FONT_SOURCE_SUFFIX).toBe('.font.json');
    for (const ok of ['pixel', 'pixel-6x8', 'a1']) expect(FONT_NAME_PATTERN.test(ok)).toBe(true);
    for (const bad of ['Pixel', 'pixel_6', 'pixel/6', '-pixel', 'pixel-', '']) {
      expect(FONT_NAME_PATTERN.test(bad), bad).toBe(false);
    }
  });
});

describe('scripts/assets/font — parseFontSource (edge)', () => {
  it('accepts astral-plane characters as one glyph (one code point, two UTF-16 units)', () => {
    const { font, issues } = parse({ glyphs: { '😀': ['##', '##'], A: ['#.', '.#'] } });
    expect(issues).toEqual([]);
    expect(font?.glyphs.map((g) => g.code)).toEqual([65, 0x1f600]);
  });

  it.each([
    ['an empty key', ''],
    ['two code points', 'é'],
    ['two characters', 'ab'],
  ])('rejects %s as a glyph key', (_label, key) => {
    const { font, issues } = parse({ glyphs: { [key]: ['##', '##'] } });
    expect(font).toBeNull();
    expect(issues).toEqual([
      { path: `t:glyphs[${JSON.stringify(key)}]`, message: 'glyph keys are exactly one character' },
    ]);
  });

  it('sorts glyphs by code point whatever the key order (integer-like keys included)', () => {
    const { font } = parse({
      glyphs: { '~': ['##', '##'], A: ['##', '##'], '1': ['##', '##'], ' ': ['..', '..'] },
    });
    expect(font?.glyphs.map((g) => g.code)).toEqual([32, 49, 65, 126]);
  });

  it('lets a glyph override the font advance (0 allowed), and requires a font advance', () => {
    const { font } = parse({
      advance: 0,
      glyphs: { A: ['##', '##'], B: { rows: ['##', '##'], advance: 5 } },
    });
    expect(font?.glyphs.map((g) => g.advance)).toEqual([0, 5]);
    const { issues } = parse({
      advance: undefined,
      glyphs: { A: { rows: ['##', '##'], advance: 1 } },
    });
    expect(issues.map((i) => i.path)).toEqual(['t:advance']);
  });

  it.each([
    ['a string', 'AB'],
    ['a number', 5],
    ['null', null],
    ['an object without rows', { advance: 1 }],
    ['rows that are not an array', { rows: '##' }],
  ])('rejects a glyph given as %s', (_label, value) => {
    const { issues } = parse({ glyphs: { A: value } });
    expect(issues).toEqual([
      { path: 't:glyphs["A"]', message: 'must be an array of rows or { rows, advance }' },
    ]);
  });

  it('reports both a wrong row count and each bad row', () => {
    const { issues } = parse({ glyphs: { A: ['#', 3, '##'] } });
    expect(issues.map((i) => i.path)).toEqual([
      't:glyphs["A"].rows',
      't:glyphs["A"].rows[0]',
      't:glyphs["A"].rows[1]',
    ]);
  });

  it.each([
    ['a zero line height', { lineHeight: 0 }, 't:lineHeight'],
    ['a fractional cell height', { cellHeight: 2.5 }, 't:cellHeight'],
    ['a string cell width', { cellWidth: '2' }, 't:cellWidth'],
    ['a non-string description', { description: ['x'] }, 't:description'],
    ['a missing name', { name: undefined }, 't:name'],
    ['glyphs as an array', { glyphs: [['##', '##']] }, 't:glyphs'],
  ])('reports %s', (_label, patch, path) => {
    const { font, issues } = parse(patch);
    expect(font).toBeNull();
    expect(issues.map((i) => i.path)).toContain(path);
  });

  it('keeps the description optional and copies the rows', () => {
    const rows = ['##', '#.'];
    const { font, issues } = parse({ description: 'note', glyphs: { A: rows } });
    expect(issues).toEqual([]);
    rows[0] = '..';
    expect(font?.glyphs[0].rows).toEqual(['##', '#.']);
    expect(font?.origin).toBe('t');
  });
});

describe('scripts/assets/font — buildFontSprite (edge)', () => {
  it('draws exactly the "#" cells in opaque white and leaves the rest transparent', () => {
    const { font } = parse({ glyphs: { A: ['#.', '.#'], B: ['..', '##'] } });
    if (font === null) throw new Error('fixture invalid');
    const { sprite, metrics } = buildFontSprite(font);
    expect(sprite.frames).toHaveLength(2);
    const expected = [
      ['#.', '.#'],
      ['..', '##'],
    ];
    sprite.frames.forEach((frame, i) => {
      expect([frame.width, frame.height]).toEqual([2, 2]);
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          expect(getPixel(frame, x, y)).toEqual(
            expected[i][y][x] === '#' ? [255, 255, 255, 255] : [0, 0, 0, 0],
          );
        }
      }
    });
    expect(Object.keys(metrics.glyphs)).toEqual(['65', '66']);
    expect(sprite).toMatchObject({ hitFlash: false, animations: {}, anchor: [0, 0], origin: 't' });
  });

  it('keys astral glyphs by their decimal code point', () => {
    const { font } = parse({ glyphs: { '★': ['##', '##'], '😀': ['##', '##'] } });
    if (font === null) throw new Error('fixture invalid');
    expect(buildFontSprite(font).metrics.glyphs).toEqual({
      '9733': { frame: 'font/tiny#0', advance: 3 },
      '128512': { frame: 'font/tiny#1', advance: 3 },
    });
  });
});

describe('scripts/assets/font — loadFontSources', () => {
  const font = (name: string): string => JSON.stringify({ ...TINY, name });

  it('reads *.font.json files in path order and ignores everything else', () => {
    const dir = tree('load', {
      'b.font.json': font('bravo'),
      'a/z.font.json': font('alpha'),
      'README.md': '# fonts',
      'other.json': '{ not even json',
      '.gitkeep': '',
    });
    const { fonts, issues } = loadFontSources(dir, 'fonts');
    expect(issues).toEqual([]);
    expect(fonts.map((f) => [f.name, f.origin])).toEqual([
      ['alpha', 'fonts/a/z.font.json'],
      ['bravo', 'fonts/b.font.json'],
    ]);
  });

  it('reports a font name defined twice (the second file) and keeps the first', () => {
    const dir = tree('dupe', { 'a.font.json': font('same'), 'b.font.json': font('same') });
    const { fonts, issues } = loadFontSources(dir, 'fonts');
    expect(fonts.map((f) => f.origin)).toEqual(['fonts/a.font.json']);
    expect(issues).toEqual([
      { path: 'fonts/b.font.json:name', message: 'font "same" is defined twice' },
    ]);
  });

  it('reports broken JSON and invalid fonts with the file path, and skips them', () => {
    const dir = tree('broken', {
      'a.font.json': '{ nope',
      'b.font.json': JSON.stringify({ ...TINY, name: 'Bad' }),
      'c.font.json': font('good'),
    });
    const { fonts, issues } = loadFontSources(dir, 'fonts');
    expect(fonts.map((f) => f.name)).toEqual(['good']);
    expect(issues.map((i) => i.path)).toEqual(['fonts/a.font.json:', 'fonts/b.font.json:name']);
    expect(issues[0].message).toMatch(/^invalid JSON: /);
  });

  it('returns nothing for a missing directory', () => {
    expect(loadFontSources(join(tmp, 'missing'), 'x')).toEqual({ fonts: [], issues: [] });
  });
});

describe('assets/source/fonts/pixel6x8.font.json — design rules', () => {
  const json = JSON.parse(
    readFileSync(join(repo, 'assets/source/fonts/pixel6x8.font.json'), 'utf8'),
  ) as unknown;
  const { font } = parseFontSource(json, 'pixel');
  const rows = (ch: string): string[] => {
    const glyph = font?.glyphs.find((g) => g.code === ch.codePointAt(0));
    if (glyph === undefined) throw new Error(`no glyph ${ch}`);
    return glyph.rows;
  };
  /** Mirrors the 5-px ink box left ↔ right (column 5 is the spacing column). */
  const mirror = (glyph: string[]): string[] =>
    glyph.map((row) => row.slice(0, 5).split('').reverse().join('') + row.slice(5));

  it('draws every glyph differently', () => {
    const seen = new Map<string, number>();
    for (const glyph of font?.glyphs ?? []) {
      const key = glyph.rows.join('/');
      expect(seen.get(key), String.fromCodePoint(glyph.code)).toBeUndefined();
      seen.set(key, glyph.code);
    }
    // 102 in M1-03; M3-03 added 9 Latin-1 characters and the 84-glyph katakana subset.
    expect(seen.size).toBe(195);
  });

  // M3-03: the katakana sit one row lower than the Latin letters — their body is rows 1–7, which
  // leaves row 0 free for the voicing marks (the classic 5×7 LCD katakana box). So the descender
  // rule is about the Latin and symbol glyphs only.
  it('uses the descender row only for , _ g j p q y (and ; if it ever needs it)', () => {
    const allowed = new Set([',', ';', '_', 'g', 'j', 'p', 'q', 'y']);
    const users = (font?.glyphs ?? [])
      .filter((g) => g.code < 0x3000 && g.rows[7].includes('#'))
      .map((g) => String.fromCodePoint(g.code));
    for (const ch of users) expect(allowed.has(ch), ch).toBe(true);
    for (const ch of ['g', 'j', 'p', 'q', 'y']) expect(users).toContain(ch);
  });

  it('keeps every katakana in its 5×7 box, rows 1–7 (M3-03)', () => {
    const kana = (font?.glyphs ?? []).filter((g) => g.code >= 0x3000);
    expect(kana.length).toBe(84);
    for (const glyph of kana) {
      const ch = String.fromCodePoint(glyph.code);
      for (const row of glyph.rows) expect(row.charAt(5), ch).toBe('.');
      expect(glyph.rows.join('').includes('#'), ch).toBe(true);
    }
  });

  it('keeps capitals and digits inside the 5×7 box (rows 0–6)', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(rows(ch)[7], ch).toBe('......');
      expect(rows(ch).join('').includes('#'), ch).toBe(true);
    }
  });

  it('draws mirror-image pairs as exact mirrors (arrows, brackets, slashes)', () => {
    for (const [a, b] of [
      ['←', '→'],
      ['(', ')'],
      ['[', ']'],
      ['<', '>'],
      ['/', '\\'],
      ['{', '}'],
    ]) {
      expect(rows(b), `${a} ${b}`).toEqual(mirror(rows(a)));
    }
    const up = rows('↑');
    expect(rows('↓').slice(0, 7)).toEqual(up.slice(0, 7).reverse());
    for (const ch of ['●', '✕', '★', 'A', 'O', 'X', '8']) {
      expect(mirror(rows(ch)), ch).toEqual(rows(ch));
    }
  });
});
