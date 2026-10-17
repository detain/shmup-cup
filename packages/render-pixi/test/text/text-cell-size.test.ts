/**
 * Bitmap text at a 9 × 12 cell (plan_resolution.md R1-04, §2.7's "≈ 9×12 / 15" v2 font): the
 * layout reads every metric from the font — advance 9, line height 15, cell 9 × 12 — so measuring,
 * pen positions, alignment, new lines, the unknown-glyph fallback, numbers and `TextMetrics` all
 * follow it with no code change. The font is a fixture of this test's manifest (a `pixel9x12`
 * next to the test atlas's 6-px `pixel`), not shipped art.
 */
import { TextAlign } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas, type AtlasFrameInfo } from '../../src/atlas/index.js';
import {
  createBitmapFont,
  createTextMetrics,
  drawNumber,
  drawText,
  measureNumber,
  type GlyphSink,
} from '../../src/text/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** The fixture font's name. */
const FONT = 'pixel9x12';

/** Cell width = advance of the fixture font. */
const ADVANCE = 9;

/** Cell height of the fixture font. */
const CELL_H = 12;

/** Line height of the fixture font. */
const LINE = 15;

/** Its glyphs: digits, `A`, `B`, `-` and space (no `?`, so unknown glyphs advance one cell). */
const CODES = [32, 45, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 65, 66];

/**
 * The test atlas plus the 9 × 12 fixture font on a page of its own.
 *
 * @param withQuestion - Also give the font a `?` glyph that advances 7 px.
 * @returns The atlas (warnings silenced).
 */
function atlas(withQuestion = false): Atlas {
  const base = testManifest();
  const page = base.pages.length;
  const codes = withQuestion ? [...CODES, 63] : CODES;
  const names: string[] = [];
  const frames: Record<string, AtlasFrameInfo> = { ...base.frames };
  const glyphs: Record<string, { frame: string; advance: number }> = {};
  codes.forEach((code, i) => {
    const name = `font/${FONT}#${i}`;
    names.push(name);
    frames[name] = { p: page, x: i * ADVANCE, y: 0, w: ADVANCE, h: CELL_H, ax: 0, ay: 0 };
    glyphs[String(code)] = { frame: name, advance: code === 63 ? 7 : ADVANCE };
  });
  const manifest = {
    ...base,
    pages: [...base.pages, { file: `main-${page}.png`, w: codes.length * ADVANCE, h: CELL_H }],
    frames,
    sprites: { ...base.sprites, [`font/${FONT}`]: { frames: names, flash: null } },
    fonts: {
      ...base.fonts,
      [FONT]: {
        sprite: `font/${FONT}`,
        lineHeight: LINE,
        cellWidth: ADVANCE,
        cellHeight: CELL_H,
        glyphs,
      },
    },
  };
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** A glyph sink that records every quad's frame and position. */
function recorder() {
  const quads: { frame: number; x: number; y: number }[] = [];
  const sink: GlyphSink = {
    frame(frame, x, y) {
      quads.push({ frame, x, y });
      return true;
    },
  };
  return { sink, quads };
}

describe('render-pixi/text at a 9 × 12 cell (R1-04)', () => {
  it('reads the metrics from the font', () => {
    const font = createBitmapFont(atlas(), FONT);
    expect([font.cellWidth, font.cellHeight, font.lineHeight]).toEqual([ADVANCE, CELL_H, LINE]);
    expect(font.advance(65)).toBe(ADVANCE);
    // No `?`: an unknown character advances one cell.
    expect(font.advance(67)).toBe(ADVANCE);
    expect(createBitmapFont(atlas(true), FONT).advance(67)).toBe(7);
  });

  it('measures lines in 9-px steps', () => {
    const font = createBitmapFont(atlas(), FONT);
    expect(font.measure('AB')).toBe(2 * ADVANCE);
    expect(font.measure('A B')).toBe(3 * ADVANCE);
    expect(font.measure('A\nBBB\nB')).toBe(3 * ADVANCE);
    expect(measureNumber(font, -12, 4)).toBe(5 * ADVANCE);
    const metrics = createTextMetrics([font, createBitmapFont(atlas())]);
    expect(metrics.lineHeight).toBe(LINE);
    expect(metrics.measure('AB\nA', FONT)).toBe(2 * ADVANCE);
    expect(metrics.measure('AB', 'pixel')).toBe(12); // the 6-px test font is unaffected
  });

  it('lays out text on the 9-px pitch and 15-px lines, aligned per line', () => {
    const a = atlas();
    const font = createBitmapFont(a, FONT);
    const { sink, quads } = recorder();
    expect(drawText(sink, font, 'AB 1\nB', 10, 20, 0xffffff, TextAlign.Left)).toBe(4);
    expect(quads.map((q) => [q.x, q.y])).toEqual([
      [10, 20],
      [10 + ADVANCE, 20],
      [10 + 3 * ADVANCE, 20],
      [10, 20 + LINE],
    ]);
    expect(quads[0].frame).toBe(a.frameId(`font/${FONT}#12`)); // 'A'
    const centred = recorder();
    drawText(centred.sink, font, 'AB\nBBBB', 100, 0, 0xffffff, TextAlign.Center);
    expect(centred.quads.map((q) => [q.x, q.y])).toEqual([
      [100 - ADVANCE, 0],
      [100, 0],
      [100 - 2 * ADVANCE, LINE],
      [100 - ADVANCE, LINE],
      [100, LINE],
      [100 + ADVANCE, LINE],
    ]);
    const right = recorder();
    drawText(right.sink, font, 'AB', 100, 5, 0xffffff, TextAlign.Right);
    expect(right.quads.map((q) => q.x)).toEqual([100 - 2 * ADVANCE, 100 - ADVANCE]);
  });

  it('draws numbers digit by digit on the same pitch', () => {
    const font = createBitmapFont(atlas(), FONT);
    const { sink, quads } = recorder();
    expect(drawNumber(sink, font, -305, 0, 7, 4, 0xffffff, TextAlign.Left)).toBe(5);
    expect(quads.map((q) => q.x)).toEqual([0, 1, 2, 3, 4].map((i) => i * ADVANCE));
    expect(quads.every((q) => q.y === 7)).toBe(true);
  });
});
