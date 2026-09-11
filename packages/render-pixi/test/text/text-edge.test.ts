/**
 * Edge cases of bitmap text: glyph tables built from odd manifests (non-numeric / negative
 * keys, glyphs whose frame is missing, the dense / sparse boundary at code 128, no `?`
 * glyph), UTF-16 surrogate pairs, empty and newline-only text, alignment rounding, early stops
 * when the sink fills up, and `drawNumber` / `measureNumber` agreeing on every width.
 */
import { TextAlign } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAtlas, type AtlasManifest, type Atlas } from '../../src/atlas/index.js';
import {
  createBitmapFont,
  createTextMetrics,
  drawNumber,
  drawText,
  measureNumber,
  type BitmapFont,
  type GlyphSink,
} from '../../src/text/index.js';
import { pageImages, testManifest } from '../helpers.js';

/**
 * Builds an atlas whose `pixel` font glyph table is replaced / extended.
 *
 * @param edit - Receives a mutable copy of the glyph table.
 * @param extraFonts - Additional fonts to add to the manifest.
 * @returns The atlas (warnings silenced).
 */
function atlasWith(
  edit: (glyphs: { [code: string]: { frame: string; advance: number } }) => void = () => {},
  extraFonts: AtlasManifest['fonts'] = {},
): Atlas {
  const manifest = testManifest();
  const pixel = manifest.fonts.pixel;
  const glyphs = { ...pixel.glyphs };
  edit(glyphs);
  const edited: AtlasManifest = {
    ...manifest,
    fonts: { ...extraFonts, pixel: { ...pixel, glyphs } },
  };
  return createAtlas(edited, pageImages(edited), { onWarning: () => {} });
}

/**
 * A glyph sink that records quads (optionally with a capacity).
 *
 * @param capacity - Quads accepted before it reports full.
 */
function recorder(capacity = Infinity) {
  const quads: Array<{ frame: number; x: number; y: number; flags: number }> = [];
  const sink: GlyphSink = {
    frame(frame, x, y, flags) {
      if (quads.length >= capacity) return false;
      quads.push({ frame, x, y, flags });
      return true;
    },
  };
  return { sink, quads };
}

/** @returns The standard test font (digits, A, B, ?, -, space, ★; 6 px advance, 8 px lines). */
const standardFont = (): BitmapFont => createBitmapFont(atlasWith());

describe('render-pixi/text glyph tables (edge)', () => {
  it('skips glyph keys that are not non-negative integers', () => {
    const font = createBitmapFont(
      atlasWith((glyphs) => {
        glyphs['abc'] = { frame: 'font/pixel#0', advance: 9 };
        glyphs['-5'] = { frame: 'font/pixel#0', advance: 9 };
        glyphs['66.5'] = { frame: 'font/pixel#0', advance: 9 };
      }),
    );
    expect(font.glyphFrame(-5)).toBe(-1);
    expect(font.advance(-5)).toBe(6); // the "?" fallback advance
    expect(font.glyphFrame(66)).not.toBe(-1);
    expect(font.advance(66)).toBe(6);
  });

  it('treats an ASCII glyph whose frame is not in the atlas as missing ("?" drawn)', () => {
    const font = createBitmapFont(
      atlasWith((glyphs) => {
        glyphs['67'] = { frame: 'font/pixel#999', advance: 11 };
      }),
    );
    expect(font.glyphFrame(67)).toBe(-1);
    expect(font.advance(67)).toBe(6);
    const { sink, quads } = recorder();
    expect(drawText(sink, font, 'C', 0, 0, 0xffffff, TextAlign.Left)).toBe(1);
    expect(quads[0]?.frame).toBe(font.glyphFrame(63));
  });

  it('splits the table at code 128: 127 is dense, 128 and above go through the sparse map', () => {
    const font = createBitmapFont(
      atlasWith((glyphs) => {
        glyphs['127'] = { frame: 'font/pixel#13', advance: 3 };
        glyphs['128'] = { frame: 'font/pixel#14', advance: 4 };
      }),
    );
    expect([font.advance(127), font.advance(128)]).toEqual([3, 4]);
    expect(font.glyphFrame(127)).toBe(font.glyphFrame(65));
    expect(font.glyphFrame(128)).toBe(font.glyphFrame(66));
    expect(font.glyphFrame(129)).toBe(-1);
  });

  it('without a "?" glyph, unknown characters draw nothing and advance one cell', () => {
    const font = createBitmapFont(
      atlasWith((glyphs) => {
        delete glyphs['63'];
      }),
    );
    expect(font.advance(67)).toBe(font.cellWidth);
    const { sink, quads } = recorder();
    expect(drawText(sink, font, 'ACA', 10, 0, 0xffffff, TextAlign.Left)).toBe(2);
    expect(quads.map((q) => q.x)).toEqual([10, 10 + 6 + font.cellWidth]);
  });

  it('uses per-glyph advances (proportional glyphs) for measure and layout', () => {
    const font = createBitmapFont(
      atlasWith((glyphs) => {
        glyphs['65'] = { ...glyphs['65'], advance: 4 };
        glyphs['32'] = { ...glyphs['32'], advance: 2 };
      }),
    );
    expect(font.measure('A A')).toBe(10);
    const { sink, quads } = recorder();
    drawText(sink, font, 'A AB', 0, 0, 0xffffff, TextAlign.Left);
    expect(quads.map((q) => q.x)).toEqual([0, 6, 10]);
  });
});

describe('render-pixi/text measuring (edge)', () => {
  it('handles leading, trailing and consecutive newlines', () => {
    const font = standardFont();
    expect(font.measure('\n')).toBe(0);
    expect(font.measure('\n\nAB')).toBe(12);
    expect(font.measure('ABA\n')).toBe(18);
    expect(font.measure('A\n\nB')).toBe(6);
  });

  it('measureLine stops at the next newline and returns 0 past the end', () => {
    const font = standardFont();
    expect(font.measureLine('AB\nAAA', 0)).toBe(12);
    expect(font.measureLine('AB\nAAA', 2)).toBe(0);
    expect(font.measureLine('AB', 5)).toBe(0);
  });

  it('counts a surrogate pair as two unknown code units', () => {
    const font = standardFont();
    const emoji = '\u{1F680}';
    expect(emoji.length).toBe(2);
    expect(font.measure(emoji)).toBe(12);
    const { sink, quads } = recorder();
    expect(drawText(sink, font, emoji, 0, 0, 0xffffff, TextAlign.Left)).toBe(2);
    expect(quads.map((q) => q.frame)).toEqual([font.glyphFrame(63), font.glyphFrame(63)]);
  });

  it('TextMetrics picks fonts by name and reports the first font’s line height', () => {
    const a = atlasWith(undefined, {
      tall: { sprite: 'font/pixel', lineHeight: 20, cellWidth: 6, cellHeight: 6, glyphs: {} },
    });
    const pixel = createBitmapFont(a, 'pixel');
    const tall = createBitmapFont(a, 'tall');
    const metrics = createTextMetrics([tall, pixel]);
    expect(metrics.lineHeight).toBe(20);
    expect(metrics.measure('AB', 'pixel')).toBe(12);
    // The tall font has no glyphs and no "?": every character advances one cell.
    expect(metrics.measure('ABC', 'tall')).toBe(18);
    expect(() => metrics.measure('A', 'PIXEL')).toThrow(/unknown font "PIXEL"/);
  });
});

describe('render-pixi/text drawText (edge)', () => {
  it('emits nothing for empty, space-only and newline-only text', () => {
    const font = standardFont();
    for (const text of ['', '   ', '\n\n']) {
      const { sink, quads } = recorder();
      expect(drawText(sink, font, text, 0, 0, 0xffffff, TextAlign.Center)).toBe(0);
      expect(quads).toEqual([]);
    }
  });

  it('rounds the alignment point and the top edge; glyph flags are always 0', () => {
    const font = standardFont();
    const { sink, quads } = recorder();
    // Three glyphs = 18 px centred on 100.4 → left edge round(91.4) = 91.
    drawText(sink, font, 'ABA', 100.4, 3.5, 0xffffff, TextAlign.Center);
    expect(quads.map((q) => [q.x, q.y, q.flags])).toEqual([
      [91, 4, 0],
      [97, 4, 0],
      [103, 4, 0],
    ]);
  });

  it('steps one lineHeight per newline, also for empty lines, and re-aligns each line', () => {
    const font = standardFont();
    const { sink, quads } = recorder();
    drawText(sink, font, 'AB\n\nA', 50, 10, 0xffffff, TextAlign.Right);
    expect(quads.map((q) => [q.x, q.y])).toEqual([
      [38, 10],
      [44, 10],
      [44, 26],
    ]);
  });

  it('treats unknown alignment codes as left', () => {
    const font = standardFont();
    const { sink, quads } = recorder();
    drawText(sink, font, 'A', 30, 0, 0xffffff, 7);
    expect(quads[0]?.x).toBe(30);
  });

  it('returns the glyphs emitted so far when the sink fills on a later line', () => {
    const font = standardFont();
    const { sink, quads } = recorder(3);
    expect(drawText(sink, font, 'AB\nBA', 0, 0, 0xffffff, TextAlign.Left)).toBe(3);
    expect(quads.map((q) => q.y)).toEqual([0, 0, 8]);
  });
});

describe('render-pixi/text drawNumber (edge)', () => {
  it('draws a minus only from -1 down (fractions above -1 draw a plain 0)', () => {
    const font = standardFont();
    const minus = font.glyphFrame(45);
    for (const [value, hasMinus] of [
      [-0.99, false],
      [-0, false],
      [-1, true],
      [-1.5, true],
    ] as const) {
      const { sink, quads } = recorder();
      drawNumber(sink, font, value, 0, 0, 0, 0xffffff, TextAlign.Left);
      expect(quads[0]?.frame === minus).toBe(hasMinus);
    }
  });

  it('ignores negative padding and centres by the measured width', () => {
    const font = standardFont();
    const { sink, quads } = recorder();
    expect(drawNumber(sink, font, 42, 100, 2.4, -3, 0xffffff, TextAlign.Center)).toBe(2);
    expect(quads.map((q) => [q.x, q.y])).toEqual([
      [94, 2],
      [100, 2],
    ]);
  });

  it('stops at the minus sign when the sink is already full', () => {
    const font = standardFont();
    const { sink, quads } = recorder(0);
    expect(drawNumber(sink, font, -12, 0, 0, 0, 0xffffff, TextAlign.Left)).toBe(0);
    expect(quads).toEqual([]);
  });

  it('without a "-" glyph still leaves room for the sign (advance) but draws no quad for it', () => {
    const font = createBitmapFont(
      atlasWith((glyphs) => {
        delete glyphs['45'];
      }),
    );
    const { sink, quads } = recorder();
    expect(drawNumber(sink, font, -7, 0, 0, 0, 0xffffff, TextAlign.Left)).toBe(1);
    expect(quads[0]?.x).toBe(font.advance(45));
    expect(measureNumber(font, -7, 0)).toBe(font.advance(45) + 6);
  });

  it('agrees with measureNumber for every drawn width (right alignment ends exactly at x)', () => {
    const font = createBitmapFont(
      atlasWith((glyphs) => {
        glyphs['49'] = { ...glyphs['49'], advance: 3 };
        glyphs['45'] = { ...glyphs['45'], advance: 4 };
      }),
    );
    for (const value of [0, 1, 11, -1, -101, 1234567, -9007199254740991, 1e30, Number.NaN]) {
      for (const minDigits of [0, 3, 12, 25]) {
        const { sink, quads } = recorder();
        drawNumber(sink, font, value, 200, 0, minDigits, 0xffffff, TextAlign.Right);
        const last = quads[quads.length - 1];
        const lastAdvance = last === undefined ? 0 : font.advance(frameCode(font, last.frame));
        expect((last?.x ?? 200) + lastAdvance).toBe(200);
        expect(200 - (quads[0]?.x ?? 200)).toBe(measureNumber(font, value, minDigits));
      }
    }
  });
});

/**
 * Code point of a digit or minus glyph frame (inverse lookup for the width checks).
 *
 * @param font - The font.
 * @param frame - A glyph frame.
 * @returns The code (`-` or a digit).
 */
function frameCode(font: BitmapFont, frame: number): number {
  for (const code of [45, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57]) {
    if (font.glyphFrame(code) === frame) return code;
  }
  throw new Error(`frame ${frame} is not a digit or minus`);
}
