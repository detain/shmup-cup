/**
 * The CJK / kanji arithmetic, recomputed from the artifacts (plan M3-03).
 *
 * The figures in `docs/dev/asset-pipeline.md` ("Katakana and the CJK budget") are the ones a
 * future maintainer will act on when somebody asks for a Japanese build with kanji, or for
 * Chinese or Korean. They were **wrong once** — the first version of that section was out by
 * 5–20×, in the direction that told the reader a CJK language is impossible when in fact one
 * extra atlas page would hold it — so they are worth a test rather than a careful reader.
 *
 * This file recomputes every one of them from the atlas **the pipeline builds in memory** — the
 * same `buildAtlas()` the Tizen and webOS build tests use, and the same bytes `pnpm assets` would
 * write — plus the shared budgets, then checks that the **six places that repeat them** still say
 * the same thing, and that the retracted claims have not crept back in.
 *
 * It deliberately does *not* read `assets/generated/`: that folder is gitignored and CI's `test`
 * job never runs `pnpm assets`, so a disk-reading version passed locally off a stale artifact and
 * failed on every clean checkout. `buildAtlas()` is deterministic (~0.6 s) and always present.
 *
 * **Since R1-05 the shipped atlas is split into zone pages** (`common` + one group per campaign
 * zone, `assets/source/atlas-groups.json`). The arithmetic is about *how much art* there is, so
 * it is measured on the same art packed as **one page** — `buildAtlas({ ungrouped: true })`, the
 * layout M3-03 measured, byte for byte (also the TV bench's model). The occupied area is the
 * same in both. The shipped split is held to a **budget**, not a page count: every page within
 * the packer's limit, every group's PNG bytes under its R3-04.M2b cap, and every page's bytes
 * summed under {@link ATLAS_PNG_BYTES_CAP} — the stand-in projection of the packed detailed art.
 *
 * **Since R2-01 the shipped atlas is the interim ×1.5 upscale** of the same sources (decision
 * W4-6): the M3-03 figures describe the v1 art, so they are measured on `artScale: 1` — the v1
 * atlas the six documents describe, byte for byte at either frame — while the live budget holds
 * the shipped atlas, whatever its scale. R2-03 decides whether the documents quote the v2 atlas.
 *
 * Otherwise nothing here is a budget: the assertions are on the *documentation* agreeing with the
 * *build*. If the art legitimately grows, this test fails and the six documents are updated with
 * it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_GLYPHS } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  APP_JS_GZIP_BUDGET,
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
} from '../../apps/tizen/scripts/check-bundle.mjs';
import { INTERIM_ART_SCALE } from '../../scripts/assets/interim.mjs';
import { buildAtlas, COMMON_GROUP } from '../../scripts/assets/pipeline.mjs';
import {
  ATLAS_COMMON_PNG_CAP,
  ATLAS_PNG_BYTES_CAP,
  ATLAS_ZONE_PNG_CAP,
} from '../scripts/assets/atlas-budget.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The atlas as the pipeline builds it — byte for byte what `pnpm assets` writes (zone-split). */
const shipped = buildAtlas();

/**
 * The v1 art on one page (no groups, art scale 1 — R2-01, W4-6): the atlas the M3-03 arithmetic
 * is measured against, at either frame.
 */
const built = buildAtlas({ ungrouped: true, artScale: 1 });
const atlas = built.manifest;

/**
 * The shipped art on one page: the split's check compares the same art at the same scale (the v1
 * build itself while the shipped scale is 1, before R2-01's flip).
 */
const shippedOnePage = INTERIM_ART_SCALE === 1 ? built : buildAtlas({ ungrouped: true });

/**
 * Pixels every frame of an atlas occupies, summed — the "occupied area" the docs quote.
 *
 * @param manifest - The atlas manifest.
 * @param manifest.frames - Its frames.
 * @returns The area in pixels.
 */
const occupied = (manifest: { frames: Record<string, { w: number; h: number }> }): number =>
  Object.keys(manifest.frames).reduce((sum, name) => {
    const frame = manifest.frames[name];
    return sum + frame.w * frame.h;
  }, 0);

/** Pixels every frame of the atlas occupies, summed — the "occupied area" the docs quote. */
const OCCUPIED_PIXELS = occupied(atlas);

/** Size of the encoded one-page atlas PNG, in bytes. */
const PNG_BYTES = built.pages[0].png.length;

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

/**
 * The six places the figures appear (round 1's fix touched all of them). The two research
 * documents live under `docs/old/` since they were moved out of the repository root.
 */
const SOURCES = [
  'docs/dev/asset-pipeline.md',
  'packages/core/src/ui/strings.ts',
  'docs/old/shmup_plan.md',
  'docs/old/shmup_progress.md',
  'CHANGELOG.md',
  'docs/dev/options-rebinding-and-accessibility.md',
];

describe('integration: the shipped atlas stays inside its budget (R1-05)', () => {
  it('keeps every page inside the packer’s limit, each group under its cap and the total under the budget', () => {
    expect(shipped.manifest.pages.length).toBeGreaterThanOrEqual(1);
    expect(ATLAS_PAGE_MAX_SIZE).toBe(2048);
    const byGroup = new Map<string, number>();
    for (const [p, page] of shipped.manifest.pages.entries()) {
      expect(page.w, page.file).toBeLessThanOrEqual(ATLAS_PAGE_MAX_SIZE);
      expect(page.h, page.file).toBeLessThanOrEqual(ATLAS_PAGE_MAX_SIZE);
      const group = page.group ?? '';
      byGroup.set(group, (byGroup.get(group) ?? 0) + shipped.pages[p].png.length);
    }
    for (const [group, bytes] of byGroup) {
      const cap = group === COMMON_GROUP ? ATLAS_COMMON_PNG_CAP : ATLAS_ZONE_PNG_CAP;
      expect(bytes, group).toBeLessThanOrEqual(cap);
    }
    const bytes = shipped.pages.reduce((sum, page) => sum + page.png.length, 0);
    expect(bytes).toBeLessThan(ATLAS_PNG_BYTES_CAP);
    expect(ATLAS_PNG_BYTES_CAP).toBeLessThan(DIST_BUDGET);
  });

  it('holds the same art as the one-page atlas: the split moves frames, never adds any', () => {
    expect(occupied(shipped.manifest)).toBe(occupied(shippedOnePage.manifest));
    expect(Object.keys(shipped.manifest.frames).sort()).toEqual(
      Object.keys(shippedOnePage.manifest.frames).sort(),
    );
    // …and the same frames as the v1 art the figures below are measured on (only sizes scale) —
    // except `native` art, which is drawn per scale by its generator or comes from a v2 source
    // (R4-P.P3, decisions RR-1a/RR-1b): the laser beams' extra band frames (`lasers.mjs`), a
    // v2-only name and a v2 redraw's frame changes are all native, so every frame the two
    // builds disagree on belongs to a native sprite; non-native frames are the same set.
    const nativeNames = new Set(
      shipped.sprites.filter((s) => s.native === true).map((s) => s.name),
    );
    const frameSprite = (frame: string): string => {
      const at = frame.lastIndexOf('#');
      return at < 0 ? frame : frame.slice(0, at);
    };
    const nonNativeFrames = (manifest: typeof atlas): string[] =>
      Object.keys(manifest.frames)
        .filter((frame) => !nativeNames.has(frameSprite(frame)))
        .sort();
    expect(nonNativeFrames(shipped.manifest)).toEqual(nonNativeFrames(atlas));
  });
});

describe('integration: the atlas the CJK arithmetic is measured against (M3-03)', () => {
  it('is one 1024² page inside the packer’s limit when packed without groups', () => {
    expect(atlas.pages).toHaveLength(1);
    expect([atlas.pages[0].w, atlas.pages[0].h]).toEqual([1024, 1024]);
    expect(atlas.pages[0].w).toBeLessThanOrEqual(ATLAS_PAGE_MAX_SIZE);
  });

  it('occupies 487,176 pixels — 46 % of its page — and encodes to 140.6 KB', () => {
    // Re-pinned by W15-A (2026-10-26): the six shots.mjs sprites and the five new meter-label
    // frames (480,273 px / 137.6 KB before). Re-pinned again by w15-C the same day: the four
    // flavored pills and three drop crates of `items.mjs` (+7 sprites, +4,128 px; ENRICH holds
    // the counts — the new frames ride the v2 side, the ungrouped v1 page gains only the 7).
    expect(OCCUPIED_PIXELS).toBe(487_176);
    const page = atlas.pages[0].w * atlas.pages[0].h;
    expect(page).toBe(1_048_576);
    expect(Math.round((OCCUPIED_PIXELS / page) * 100)).toBe(46);
    expect((PNG_BYTES / 1000).toFixed(1)).toBe('140.6');
  });
});

describe('integration: what a real kanji set would cost (M3-03)', () => {
  it('is 993,600 pixels — 2.0× the atlas, 0.95 of its page, under a quarter of a 2048² one', () => {
    expect(JIS_PIXELS).toBe(993_600);
    // 2.1 → 2.0 with the w15-C re-pin above (the atlas grew, the kanji set did not).
    expect((JIS_PIXELS / OCCUPIED_PIXELS).toFixed(1)).toBe('2.0');
    expect((JIS_PIXELS / (atlas.pages[0].w * atlas.pages[0].h)).toFixed(2)).toBe('0.95');
    const bigPage = ATLAS_PAGE_MAX_SIZE * ATLAS_PAGE_MAX_SIZE;
    expect(bigPage).toBe(4_194_304);
    expect(JIS_PIXELS / bigPage).toBeLessThan(0.25);
    // …so it is *one* extra page, not five. That is the number round 1 got wrong.
    expect(Math.ceil(JIS_PIXELS / bigPage)).toBe(1);
  });

  it('is a download-and-boot cost, not a DIST_BUDGET overrun', () => {
    // One more page of that size, encoded at this atlas's own bytes-per-pixel, against the v2
    // 16 MiB budget: nowhere near it. The reason the subset is katakana is the decode, not the
    // budget.
    const bytesPerPixel = PNG_BYTES / OCCUPIED_PIXELS;
    const extraPageBytes = JIS_PIXELS * bytesPerPixel;
    expect(extraPageBytes).toBeLessThan(DIST_BUDGET / 4);
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
    expect(pipeline).toContain('480,273');
    expect(pipeline).toContain('993,600');
    expect(pipeline).toContain('1,048,576');
    expect(pipeline).toContain('4,194,304');
    expect(pipeline).toContain('6900 × 12 × 12');
    expect(pipeline).toContain('46 %');
    expect(pipeline).toContain('137.6');
    // `core/ui` and the plan repeat the two that matter most: the area and the ratio.
    expect(read('packages/core/src/ui/strings.ts')).toContain('480,273');
    const plan = read('docs/old/shmup_plan.md');
    expect(plan).toContain('993,600');
    expect(plan).toContain('480,273');
    expect(read('docs/old/shmup_progress.md')).toContain('480,273');
  });

  it('says a kanji language is feasible, and says why it is not shipped', () => {
    const pipeline = read('docs/dev/asset-pipeline.md');
    expect(pipeline).toMatch(/feasible/i);
    expect(pipeline).toMatch(/one extra (atlas )?page/i);
    // The reason, in every document that gives one: the per-player download and boot decode.
    for (const path of [
      'docs/dev/asset-pipeline.md',
      'packages/core/src/ui/strings.ts',
      'docs/old/shmup_plan.md',
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
