/**
 * The font pipeline at a 9 × 12 cell (plan_resolution.md R1-04, §2.7's "≈ 9×12 / 15"): a test
 * font made here by a ×1.5 nearest-neighbour upscale of the shipped `pixel6x8` — same code points
 * (`@shmup/core` `UI_GLYPHS`), 9 × 12 cells, advance 9, a 15-px line — parses, becomes 9 × 12
 * frames whose pixels are the upscale, packs into an atlas next to the shipped font, and the
 * renderer lays text out with its metrics. Nothing is added to `assets/source/` (the atlas and
 * its sprite ids stay as they are): the font lives in a temporary copy of the sources.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPH_H, GLYPH_W, LINE_H, TextAlign, UI_GLYPHS } from '@shmup/core';
import {
  createAtlas,
  createBitmapFont,
  drawText,
  type AtlasPageImage,
  type GlyphSink,
} from '@shmup/render-pixi';
import { afterAll, describe, expect, it } from 'vitest';
import { buildFontSprite, parseFontSource } from '../../../scripts/assets/font.mjs';
import { getPixel } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';

/** The committed asset sources. */
const SOURCES = fileURLToPath(new URL('../../../assets/source', import.meta.url));

/** The shipped font file, as JSON. */
interface FontJson {
  readonly name: string;
  readonly description?: string;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly lineHeight: number;
  readonly advance: number;
  readonly glyphs: Record<string, readonly string[] | { rows: readonly string[]; advance: number }>;
}

const SHIPPED = JSON.parse(
  readFileSync(join(SOURCES, 'fonts', 'pixel6x8.font.json'), 'utf8'),
) as FontJson;

/** The upscale factor, as a fraction (×3 / 2). */
const NUM = 3;
const DEN = 2;

/**
 * Upscales glyph rows nearest-neighbour by ×1.5: destination pixel (x, y) takes source pixel
 * (⌊x · 2 / 3⌋, ⌊y · 2 / 3⌋).
 *
 * @param rows - Source rows (`#` / `.`).
 * @returns The upscaled rows.
 */
function upscaleRows(rows: readonly string[]): string[] {
  const width = (rows[0].length * NUM) / DEN;
  const height = (rows.length * NUM) / DEN;
  const out: string[] = [];
  for (let y = 0; y < height; y++) {
    const source = rows[Math.floor((y * DEN) / NUM)];
    let row = '';
    for (let x = 0; x < width; x++) row += source.charAt(Math.floor((x * DEN) / NUM));
    out.push(row);
  }
  return out;
}

/** Every glyph of the shipped font, upscaled (a per-glyph advance scaled with it). */
const GLYPHS_9X12: FontJson['glyphs'] = {};
for (const [ch, glyph] of Object.entries(SHIPPED.glyphs)) {
  GLYPHS_9X12[ch] =
    'rows' in glyph
      ? { rows: upscaleRows(glyph.rows), advance: (glyph.advance * NUM) / DEN }
      : upscaleRows(glyph);
}

/** The 9 × 12 test font: the shipped font upscaled, its metrics ×1.5. */
const FONT_9X12: FontJson = {
  name: 'pixel9x12',
  description: 'R1-04 test font: pixel6x8 upscaled x1.5 nearest-neighbour.',
  cellWidth: (SHIPPED.cellWidth * NUM) / DEN,
  cellHeight: (SHIPPED.cellHeight * NUM) / DEN,
  lineHeight: (SHIPPED.lineHeight * NUM) / DEN,
  advance: (SHIPPED.advance * NUM) / DEN,
  glyphs: GLYPHS_9X12,
};

const tmp = mkdtempSync(join(tmpdir(), 'shmup-font-cell-size-'));
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('a 9 × 12 test font (R1-04)', () => {
  const { font, issues } = parseFontSource(FONT_9X12, 'fonts/pixel9x12.font.json');

  it('upscales the shipped 6 × 8 font, whose metrics core mirrors', () => {
    expect([SHIPPED.cellWidth, SHIPPED.cellHeight, SHIPPED.lineHeight]).toEqual([
      GLYPH_W,
      GLYPH_H,
      LINE_H,
    ]);
    expect([FONT_9X12.cellWidth, FONT_9X12.cellHeight, FONT_9X12.lineHeight]).toEqual([9, 12, 15]);
    expect(FONT_9X12.advance).toBe(9);
  });

  it('parses, with exactly the code points core declares (UI_GLYPHS)', () => {
    expect(issues).toEqual([]);
    const declared = [...new Set(UI_GLYPHS.split('').map((ch) => ch.codePointAt(0) ?? 0))].sort(
      (a, b) => a - b,
    );
    expect(font?.glyphs.map((g) => g.code)).toEqual(declared);
    for (const glyph of font?.glyphs ?? []) {
      expect(glyph.rows).toHaveLength(12);
      expect(glyph.rows.every((row) => row.length === 9)).toBe(true);
      expect(glyph.advance).toBe(9);
      // The spacing column stays empty: source column 5 lands on column 8 alone.
      for (const row of glyph.rows)
        expect(row.charAt(8), String.fromCodePoint(glyph.code)).toBe('.');
    }
  });

  it('becomes 9 × 12 frames whose pixels are the upscale, with the metrics in the manifest', () => {
    expect(font).not.toBeNull();
    if (font === null) return;
    const { sprite, metrics } = buildFontSprite(font);
    expect(sprite.name).toBe('font/pixel9x12');
    expect(metrics).toMatchObject({ lineHeight: 15, cellWidth: 9, cellHeight: 12 });
    const a = font.glyphs.findIndex((g) => g.code === 65);
    const frame = sprite.frames[a];
    expect([frame.width, frame.height]).toEqual([9, 12]);
    const rows = upscaleRows(SHIPPED.glyphs.A as readonly string[]);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 9; x++) {
        expect(getPixel(frame, x, y)[3] > 0, `A ${x},${y}`).toBe(rows[y].charAt(x) === '#');
      }
    }
    expect(metrics.glyphs['65']).toEqual({ frame: `font/pixel9x12#${a}`, advance: 9 });
  });

  it('packs into an atlas next to the shipped font; the renderer uses its metrics', () => {
    const sourceDir = join(tmp, 'source');
    cpSync(SOURCES, sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'fonts', 'pixel9x12.font.json'), JSON.stringify(FONT_9X12));
    const { manifest } = buildAtlas({ sourceDir });
    expect(manifest.fonts.pixel).toMatchObject({ cellWidth: 6, cellHeight: 8, lineHeight: 10 });
    expect(manifest.fonts.pixel9x12).toMatchObject({
      cellWidth: 9,
      cellHeight: 12,
      lineHeight: 15,
    });
    for (const name of manifest.sprites['font/pixel9x12'].frames) {
      expect([manifest.frames[name].w, manifest.frames[name].h]).toEqual([9, 12]);
    }
    // Fake decoded pages (Pixi needs no pixels in Node — as the render-pixi tests do it).
    const images = manifest.pages.map(
      (page) =>
        ({
          width: page.w,
          height: page.h,
          naturalWidth: page.w,
          naturalHeight: page.h,
        }) as unknown as AtlasPageImage,
    );
    const atlas = createAtlas(manifest, images, { onWarning: () => {} });
    const text = createBitmapFont(atlas, 'pixel9x12');
    expect([text.cellWidth, text.cellHeight, text.lineHeight]).toEqual([9, 12, 15]);
    expect(text.measure('SHMUP CUP')).toBe(9 * 9);
    const quads: [number, number][] = [];
    const sink: GlyphSink = {
      frame(_frame, x, y) {
        quads.push([x, y]);
        return true;
      },
    };
    drawText(sink, text, 'AB\nC', 0, 0, 0xffffff, TextAlign.Left);
    expect(quads).toEqual([
      [0, 0],
      [9, 0],
      [0, 15],
    ]);
    // The shipped font beside it keeps its 6 × 8 cell.
    expect(createBitmapFont(atlas).measure('SHMUP CUP')).toBe(9 * GLYPH_W);
  });
});
