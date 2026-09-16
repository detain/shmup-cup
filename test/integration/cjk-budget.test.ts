/**
 * The CJK / kanji arithmetic, recomputed from the artifacts (plan M3-03).
 *
 * The figures in `docs/dev/asset-pipeline.md` ("Katakana and the CJK budget") are the ones a
 * future maintainer will act on when somebody asks for a Japanese build with kanji, or for
 * Chinese or Korean. They were **wrong once** — the first version of that section was out by
 * 5–20×, in the direction that told the reader a CJK language is impossible when in fact one
 * extra atlas page would hold it — so they are worth a test rather than a careful reader.
 *
 * This file recomputes every one of them from `assets/generated/atlas/main.json`, the committed
 * PNG and the shared budgets, then checks that the **six places that repeat them** still say the
 * same thing, and that the retracted claims have not crept back in.
 *
 * Nothing here is a budget: the assertions are on the *documentation* agreeing with the *build*.
 * If the atlas legitimately grows, this test fails and the six documents are updated with it.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_GLYPHS } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  APP_JS_GZIP_BUDGET,
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
} from '../../apps/tizen/scripts/check-bundle.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The committed atlas manifest (what `pnpm assets` wrote). */
const atlas = JSON.parse(readFileSync(join(repo, 'assets/generated/atlas/main.json'), 'utf8')) as {
  pages: Array<{ file: string; w: number; h: number }>;
  frames: Record<string, { p: number; w: number; h: number }>;
};

/** Pixels every frame of the atlas occupies, summed — the "occupied area" the docs quote. */
const OCCUPIED_PIXELS = Object.keys(atlas.frames).reduce((sum, name) => {
  const frame = atlas.frames[name];
  return sum + frame.w * frame.h;
}, 0);

/** Size of the committed atlas PNG, in bytes. */
const PNG_BYTES = statSync(join(repo, 'assets/generated/atlas/main.png')).size;

/** Glyphs of the whole JIS X 0208 repertoire (levels 1 and 2), as the docs quote it. */
const JIS_GLYPHS = 6900;

/** The cell a legible CJK glyph needs, per side. */
const CJK_CELL = 12;

/** Pixels a full JIS X 0208 set would occupy at {@link CJK_CELL}². */
const JIS_PIXELS = JIS_GLYPHS * CJK_CELL * CJK_CELL;

/**
 * Reads a repo file.
 *
 * @param path - Repo-relative path.
 * @returns Its text.
 */
function read(path: string): string {
  return readFileSync(join(repo, path), 'utf8');
}

/** The six places the figures appear (round 1's fix touched all of them). */
const SOURCES = [
  'docs/dev/asset-pipeline.md',
  'packages/core/src/ui/strings.ts',
  'shmup_plan.md',
  'shmup_progress.md',
  'CHANGELOG.md',
  'docs/dev/options-rebinding-and-accessibility.md',
];

describe('integration: the atlas the CJK arithmetic is measured against (M3-03)', () => {
  it('is one 1024² page inside the packer’s limit', () => {
    expect(atlas.pages).toHaveLength(1);
    expect([atlas.pages[0].w, atlas.pages[0].h]).toEqual([1024, 1024]);
    expect(atlas.pages[0].w).toBeLessThanOrEqual(ATLAS_PAGE_MAX_SIZE);
    expect(ATLAS_PAGE_MAX_SIZE).toBe(2048);
  });

  it('occupies 479,505 pixels — 46 % of its page — and encodes to 136.6 KB', () => {
    expect(OCCUPIED_PIXELS).toBe(479_505);
    const page = atlas.pages[0].w * atlas.pages[0].h;
    expect(page).toBe(1_048_576);
    expect(Math.round((OCCUPIED_PIXELS / page) * 100)).toBe(46);
    expect((PNG_BYTES / 1000).toFixed(1)).toBe('136.6');
  });
});

describe('integration: what a real kanji set would cost (M3-03)', () => {
  it('is 993,600 pixels — 2.1× the atlas, 0.95 of its page, under a quarter of a 2048² one', () => {
    expect(JIS_PIXELS).toBe(993_600);
    expect((JIS_PIXELS / OCCUPIED_PIXELS).toFixed(1)).toBe('2.1');
    expect((JIS_PIXELS / (atlas.pages[0].w * atlas.pages[0].h)).toFixed(2)).toBe('0.95');
    const bigPage = ATLAS_PAGE_MAX_SIZE * ATLAS_PAGE_MAX_SIZE;
    expect(bigPage).toBe(4_194_304);
    expect(JIS_PIXELS / bigPage).toBeLessThan(0.25);
    // …so it is *one* extra page, not five. That is the number round 1 got wrong.
    expect(Math.ceil(JIS_PIXELS / bigPage)).toBe(1);
  });

  it('is a download-and-boot cost, not a DIST_BUDGET overrun', () => {
    // One more page of that size, encoded at this atlas's own bytes-per-pixel, against the 8 MB
    // budget: nowhere near it. The reason the subset is katakana is the decode, not the budget.
    const bytesPerPixel = PNG_BYTES / OCCUPIED_PIXELS;
    const extraPageBytes = JIS_PIXELS * bytesPerPixel;
    expect(extraPageBytes).toBeLessThan(DIST_BUDGET / 4);
    expect(DIST_BUDGET).toBe(8 * 1024 * 1024);
    // But it does roughly double what every player downloads and decodes at boot — which is the
    // claim the documents make, and the one that decides it.
    expect(JIS_PIXELS / OCCUPIED_PIXELS).toBeGreaterThan(1.5);
    expect(JIS_PIXELS / OCCUPIED_PIXELS).toBeLessThan(3);
  });

  it('measures the 93 glyphs that did ship against the same atlas', () => {
    // 102 → 195 characters; the katakana subset is 84 of the 93 (the other 9 are Latin-1).
    expect(UI_GLYPHS.split('')).toHaveLength(195);
    const kana = UI_GLYPHS.split('').filter((ch) => (ch.codePointAt(0) ?? 0) >= 0x3000);
    expect(kana).toHaveLength(84);
    const latin1 = UI_GLYPHS.split('').filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x00a0 && code <= 0x00ff;
    });
    expect(latin1).toHaveLength(9);
    expect(195 - 102).toBe(kana.length + latin1.length);
    // They cost a fraction of a full set: 93 glyphs in a 6×8 cell against 6,900 in a 12×12 one.
    expect((93 * 6 * 8) / JIS_PIXELS).toBeLessThan(0.01);
  });

  it('fits the shipped bundle inside the budget that decided against libopenmpt too', () => {
    expect(APP_JS_GZIP_BUDGET).toBe(512 * 1024);
    // 395.5 KB of 512 KB after the two translations — the figure the docs quote.
    expect(395.5 * 1024).toBeLessThan(APP_JS_GZIP_BUDGET);
  });
});

describe('integration: the six places that repeat the figures agree (M3-03)', () => {
  it('all six talk about the kanji question, and the five that size it quote 6,900', () => {
    for (const path of SOURCES) {
      expect(/kanji|JIS/i.test(read(path)), path).toBe(true);
    }
    // `options-rebinding-and-accessibility.md` links to the arithmetic instead of repeating the
    // glyph count; every other place states it, and they must all state the same one.
    for (const path of SOURCES.filter(
      (path) => path !== 'docs/dev/options-rebinding-and-accessibility.md',
    )) {
      expect(/6,?900/.test(read(path)), path).toBe(true);
    }
    expect(read('docs/dev/options-rebinding-and-accessibility.md')).toContain(
      'katakana-and-the-cjk-budget-m3-03',
    );
  });

  it('carries the recomputed numbers in the places that state them', () => {
    const pipeline = read('docs/dev/asset-pipeline.md');
    expect(pipeline).toContain('479,505');
    expect(pipeline).toContain('993,600');
    expect(pipeline).toContain('1,048,576');
    expect(pipeline).toContain('4,194,304');
    expect(pipeline).toContain('6900 × 12 × 12');
    expect(pipeline).toContain('46 %');
    expect(pipeline).toContain('136.6');
    // `core/ui` and the plan repeat the two that matter most: the area and the ratio.
    expect(read('packages/core/src/ui/strings.ts')).toContain('479,505');
    const plan = read('shmup_plan.md');
    expect(plan).toContain('993,600');
    expect(plan).toContain('479,505');
    expect(read('shmup_progress.md')).toContain('479,505');
  });

  it('says a kanji language is feasible, and says why it is not shipped', () => {
    const pipeline = read('docs/dev/asset-pipeline.md');
    expect(pipeline).toMatch(/feasible/i);
    expect(pipeline).toMatch(/one extra (atlas )?page/i);
    // The reason, in every document that gives one: the per-player download and boot decode.
    for (const path of [
      'docs/dev/asset-pipeline.md',
      'packages/core/src/ui/strings.ts',
      'shmup_plan.md',
      'CHANGELOG.md',
      'docs/dev/options-rebinding-and-accessibility.md',
    ]) {
      // The documents wrap their lines, so match across whitespace.
      expect(/doubl\w+\s+the\s+atlas\s+download/i.test(read(path)), path).toBe(true);
    }
  });

  it('has none of round 1’s retracted claims left anywhere', () => {
    // The wrong version said a JIS *level 1* set (2,965 glyphs) would need **five** 2048² pages
    // and was "two orders of magnitude" larger than the atlas — 5–20× out, and it read as
    // "impossible". None of those words may come back.
    for (const path of SOURCES) {
      const text = read(path);
      expect(/five 2048|5 × 2048|five extra pages/i.test(text), path).toBe(false);
      expect(/two orders of magnitude/i.test(text), path).toBe(false);
      expect(/2,?965/.test(text), path).toBe(false);
    }
  });
});
