/**
 * Tests for bitmap text: glyph lookup (dense ASCII + sparse symbols), metrics (TextMetrics),
 * layout of text and numbers into a recording glyph sink (alignment per line, new lines,
 * spaces, unknown characters, zero padding, negatives), and the real pipeline font.
 */
import { TextAlign, UI_GLYPHS } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import {
  DEFAULT_FONT,
  DEFAULT_GLYPH_CAPACITY,
  createBitmapFont,
  createTextMetrics,
  drawNumber,
  drawText,
  measureNumber,
  moduleInfo,
  type GlyphSink,
} from '../../src/text/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** @returns The small test atlas (font: digits, A, B, ?, -, space, ★). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/** A glyph sink that records every quad (optionally with a capacity). */
function recorder(capacity = Infinity) {
  const quads: Array<{ frame: number; x: number; y: number; tint: number; alpha: number }> = [];
  const sink: GlyphSink = {
    frame(frame, x, y, _flags, tint, alpha) {
      if (quads.length >= capacity) return false;
      quads.push({ frame, x, y, tint, alpha });
      return true;
    },
  };
  return { sink, quads };
}

describe('render-pixi/text createBitmapFont', () => {
  it('describes itself as implemented and names its defaults', () => {
    expect(moduleInfo.name).toBe('text');
    expect(moduleInfo.status).toBe('implemented');
    expect(DEFAULT_GLYPH_CAPACITY).toBe(1024);
    expect(DEFAULT_FONT).toBe('pixel');
  });

  it('maps code units to glyph frames (ASCII dense, symbols sparse) and knows the metrics', () => {
    const a = atlas();
    const font = createBitmapFont(a);
    expect([font.name, font.lineHeight, font.cellWidth, font.cellHeight]).toEqual([
      'pixel',
      8,
      6,
      6,
    ]);
    expect(font.glyphFrame(65)).toBe(a.frameId('font/pixel#13'));
    expect(font.glyphFrame(0x2605)).toBe(a.frameId('font/pixel#15'));
    expect(font.glyphFrame(67)).toBe(-1);
    expect(font.glyphFrame(0x2190)).toBe(-1);
    expect(font.advance(67)).toBe(6);
  });

  it('measures lines and the widest of several lines', () => {
    const font = createBitmapFont(atlas());
    expect(font.measure('')).toBe(0);
    expect(font.measure('AB')).toBe(12);
    expect(font.measure('A\nBBB\nB')).toBe(18);
    expect(font.measureLine('A\nBBB', 2)).toBe(18);
    expect(font.measure('A B')).toBe(18);
  });

  it('throws for a font the atlas does not have', () => {
    expect(() => createBitmapFont(atlas(), 'serif')).toThrow(RangeError);
  });

  it('implements TextMetrics for layout code', () => {
    const metrics = createTextMetrics([createBitmapFont(atlas())]);
    expect(metrics.lineHeight).toBe(8);
    expect(metrics.measure('AB\nA', 'pixel')).toBe(12);
    expect(() => metrics.measure('A', 'other')).toThrow(RangeError);
    expect(() => createTextMetrics([])).toThrow(RangeError);
  });
});

describe('render-pixi/text drawText', () => {
  it('emits one quad per visible glyph at integer pen positions; spaces only advance', () => {
    const a = atlas();
    const font = createBitmapFont(a);
    const { sink, quads } = recorder();
    expect(drawText(sink, font, 'A B', 10.4, 20.6, 0xff0000, TextAlign.Left)).toBe(2);
    expect(quads).toEqual([
      { frame: font.glyphFrame(65), x: 10, y: 21, tint: 0xff0000, alpha: 255 },
      { frame: font.glyphFrame(66), x: 22, y: 21, tint: 0xff0000, alpha: 255 },
    ]);
  });

  it('aligns every line on its own (centre and right) and steps lines by lineHeight', () => {
    const font = createBitmapFont(atlas());
    const centre = recorder();
    drawText(centre.sink, font, 'AB\nA', 100, 0, 0xffffff, TextAlign.Center);
    expect(centre.quads.map((q) => [q.x, q.y])).toEqual([
      [94, 0],
      [100, 0],
      [97, 8],
    ]);
    const right = recorder();
    drawText(right.sink, font, 'AB\nA', 100, 0, 0xffffff, TextAlign.Right, 64);
    expect(right.quads.map((q) => [q.x, q.y, q.alpha])).toEqual([
      [88, 0, 64],
      [94, 0, 64],
      [94, 8, 64],
    ]);
  });

  it('draws "?" for characters the font lacks and stops when the sink is full', () => {
    const font = createBitmapFont(atlas());
    const { sink, quads } = recorder(2);
    expect(drawText(sink, font, 'CAB', 0, 0, 0xffffff, TextAlign.Left)).toBe(2);
    expect(quads.map((q) => q.frame)).toEqual([font.glyphFrame(63), font.glyphFrame(65)]);
  });
});

describe('render-pixi/text drawNumber', () => {
  it('draws digits without building a string, zero-padded to minDigits', () => {
    const font = createBitmapFont(atlas());
    const { sink, quads } = recorder();
    expect(drawNumber(sink, font, 1230, 4, 2, 6, 0xffffff, TextAlign.Left)).toBe(6);
    expect(quads.map((q) => q.frame)).toEqual(
      [0, 0, 1, 2, 3, 0].map((d) => font.glyphFrame(48 + d)),
    );
    expect(quads.map((q) => q.x)).toEqual([4, 10, 16, 22, 28, 34]);
  });

  it('draws 0 for zero, NaN and infinities, truncates fractions and signs negatives', () => {
    const font = createBitmapFont(atlas());
    for (const value of [0, Number.NaN, Infinity, -Infinity, 0.9]) {
      const { sink, quads } = recorder();
      drawNumber(sink, font, value, 0, 0, 0, 0xffffff, TextAlign.Left);
      expect(quads.map((q) => q.frame)).toEqual([font.glyphFrame(48)]);
    }
    const negative = recorder();
    drawNumber(negative.sink, font, -42.7, 0, 0, 3, 0xffffff, TextAlign.Left);
    expect(negative.quads.map((q) => q.frame)).toEqual(
      [45, 48, 52, 50].map((code) => font.glyphFrame(code)),
    );
  });

  it('aligns by the measured width', () => {
    const font = createBitmapFont(atlas());
    expect(measureNumber(font, 50000, 8)).toBe(48);
    expect(measureNumber(font, -7, 0)).toBe(12);
    const { sink, quads } = recorder();
    drawNumber(sink, font, 99, 100, 0, 0, 0xffffff, TextAlign.Right);
    expect(quads.map((q) => q.x)).toEqual([88, 94]);
  });

  it('caps magnitudes at MAX_SAFE_INTEGER, padding at 20 digits, and stops when the sink is full', () => {
    const font = createBitmapFont(atlas());
    const big = recorder();
    drawNumber(big.sink, font, 1e30, 0, 0, 40, 0xffffff, TextAlign.Left);
    expect(big.quads.map((q) => q.frame)).toEqual(
      '00009007199254740991'.split('').map((d) => font.glyphFrame(d.charCodeAt(0))),
    );
    const small = recorder();
    drawNumber(small.sink, font, -1e30, 0, 0, 0, 0xffffff, TextAlign.Left);
    expect(small.quads).toHaveLength(17);
    const full = recorder(1);
    expect(drawNumber(full.sink, font, -5, 0, 0, 0, 0xffffff, TextAlign.Left)).toBe(1);
  });
});

describe('render-pixi/text with the real pipeline font', () => {
  it('covers ASCII 32–126 and the arrow / symbol glyphs; "SHMUP CUP" is 54 px wide', () => {
    const { manifest } = buildAtlas();
    const real = createAtlas(manifest, pageImages(manifest));
    const font = createBitmapFont(real);
    for (let code = 33; code <= 126; code++) expect(font.glyphFrame(code)).toBeGreaterThan(-1);
    for (const symbol of '←↑→↓●✕★')
      expect(font.glyphFrame(symbol.charCodeAt(0))).toBeGreaterThan(-1);
    expect(font.measure('SHMUP CUP')).toBe(54);
    expect(font.lineHeight).toBe(10);
  });

  // M3-03: the localization's end-to-end gate. `core/ui` `UI_GLYPHS` is what the `strings` loader
  // accepts; if a character of it did not reach the atlas, the renderer would silently draw a `?`
  // and a whole language would look broken on the TV with nothing failing anywhere else.
  it('draws every character core declares (UI_GLYPHS) — no silent "?" fallback', () => {
    const { manifest } = buildAtlas();
    const font = createBitmapFont(createAtlas(manifest, pageImages(manifest)));
    const question = font.glyphFrame('?'.charCodeAt(0));
    expect(question).toBeGreaterThan(-1);
    for (const character of UI_GLYPHS) {
      const code = character.charCodeAt(0);
      const frame = font.glyphFrame(code);
      expect(frame, `U+${code.toString(16).toUpperCase()} ${character}`).toBeGreaterThan(-1);
      // Only `?` itself may be the `?` frame: anything else falling back would look identical.
      if (character !== '?') {
        expect(frame, `U+${code.toString(16).toUpperCase()} ${character}`).not.toBe(question);
      }
    }
    // A character outside the charset has no frame at all, so the loop above has teeth.
    expect(font.glyphFrame('Д'.charCodeAt(0))).toBe(-1);
  });

  it('lays katakana and accented capitals out on the same 6-px grid as ASCII (M3-03)', () => {
    const { manifest } = buildAtlas();
    const font = createBitmapFont(createAtlas(manifest, pageImages(manifest)));
    // Every glyph keeps advance 6, whatever its block — a translated menu row is as wide as its
    // character count, which is what `content/strings/README.md` promises translators.
    expect(font.measure('ステージ')).toBe(24);
    expect(font.measure('ESPAÑOL')).toBe(42);
    expect(font.measure('ガギグゲゴ')).toBe(30);
  });
});
