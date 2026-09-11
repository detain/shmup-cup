/**
 * # text — bitmap-font text rendering
 *
 * **Responsibility.** Text in the pixel font the asset pipeline packs into the atlas
 * (`fonts.pixel`: 6×8 cells, ASCII 32–126 plus `← ↑ → ↓ ● ✕ ★`): glyph lookup by code point,
 * metrics for layout code (implements the core's `TextMetrics`), and layout that emits one
 * atlas quad per visible glyph into a {@link GlyphSink} — normally the renderer's ordered quad
 * pool of {@link DEFAULT_GLYPH_CAPACITY} glyph sprites. Layout never allocates: text is read with
 * `charCodeAt`, numbers are split into digits in a preallocated buffer (HUD scores update
 * without building strings). Positions are integers, so glyphs stay crisp at any scale.
 *
 * Layout rules: `\n` starts a new line (`lineHeight` below); alignment applies per line;
 * spaces advance without drawing; a character the font lacks draws `?` (or advances one cell
 * when the font has no `?` either).
 *
 * **Implements.**
 * - shmup_feat.md §17 — bitmap font, readable digits
 * - shmup_feat.md §21 — localisation (P2: larger glyph sets later)
 * - shmup_tech.md §4.10 — bitmap-font text renderer (no DOM text)
 *
 * **Public API.** {@link createBitmapFont}, {@link BitmapFont}, {@link createTextMetrics},
 * {@link GlyphSink}, {@link drawText}, {@link drawNumber}, {@link measureNumber},
 * {@link DEFAULT_GLYPH_CAPACITY}, {@link DEFAULT_FONT}.
 *
 * @module
 */
import { TextAlign, defineModule, type TextMetrics } from '@shmup/core';
import type { Atlas, FrameId } from '../atlas/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'text',
  status: 'implemented',
  specRefs: ['shmup_feat.md §17', 'shmup_feat.md §21', 'shmup_tech.md §4.10'],
});

/** Glyph sprites preallocated per text-drawing layer (HUD, UI). */
export const DEFAULT_GLYPH_CAPACITY = 1024;

/** Name of the default font in the atlas manifest. */
export const DEFAULT_FONT = 'pixel';

/** Code units below this use a dense lookup table; others go through a map. */
const DENSE_CODES = 128;

/** Code point of `?` — drawn for characters the font lacks. */
const QUESTION = 63;

/** Code point of `-` (negative numbers). */
const MINUS = 45;

/** Code point of `0`. */
const DIGIT_ZERO = 48;

/** Code point of `\n`. */
const NEWLINE = 10;

/** Code point of a space. */
const SPACE = 32;

/** A bitmap font resolved against an atlas. */
export interface BitmapFont {
  /** Font name in the manifest (`'pixel'`). */
  readonly name: string;
  /** Line advance in pixels. */
  readonly lineHeight: number;
  /** Glyph cell width. */
  readonly cellWidth: number;
  /** Glyph cell height. */
  readonly cellHeight: number;
  /**
   * Frame of a glyph.
   *
   * @param code - UTF-16 code unit (`text.charCodeAt(i)`).
   * @returns The frame id, or -1 when the font has no glyph for it.
   */
  glyphFrame(code: number): FrameId;
  /**
   * Pen advance of a character, including the `?` fallback for unknown characters.
   *
   * @param code - UTF-16 code unit.
   * @returns Advance in pixels.
   */
  advance(code: number): number;
  /**
   * Width of one line of `text`, from `start` to the next `\n` or the end.
   *
   * @param text - Text.
   * @param start - Index where the line starts.
   * @returns Width in pixels (sum of advances).
   */
  measureLine(text: string, start: number): number;
  /**
   * Width of the widest line of `text`.
   *
   * @param text - Text (lines split at `\n`).
   * @returns Width in pixels.
   */
  measure(text: string): number;
}

/**
 * Resolves a manifest font against an atlas (load time).
 *
 * @param atlas - The atlas holding the glyph frames.
 * @param name - Font name (default {@link DEFAULT_FONT}).
 * @returns The font.
 * @throws {RangeError} When the manifest has no such font.
 *
 * @example
 * ```ts
 * const font = createBitmapFont(atlas);
 * font.measure('SHMUP CUP'); // → 54 (9 glyphs × 6 px)
 * ```
 */
export function createBitmapFont(atlas: Atlas, name: string = DEFAULT_FONT): BitmapFont {
  if (!Object.prototype.hasOwnProperty.call(atlas.manifest.fonts, name)) {
    throw new RangeError(`atlas has no font "${name}"`);
  }
  const info = atlas.manifest.fonts[name];
  const denseFrame = new Int32Array(DENSE_CODES).fill(-1);
  const denseAdvance = new Uint8Array(DENSE_CODES);
  const sparseFrame = new Map<number, FrameId>();
  const sparseAdvance = new Map<number, number>();
  for (const key of Object.keys(info.glyphs)) {
    const code = Number(key);
    const glyph = info.glyphs[key];
    if (!Number.isInteger(code) || code < 0 || glyph === undefined) continue;
    const frame = atlas.frameId(glyph.frame);
    if (code < DENSE_CODES) {
      denseFrame[code] = frame;
      denseAdvance[code] = glyph.advance;
    } else {
      sparseFrame.set(code, frame);
      sparseAdvance.set(code, glyph.advance);
    }
  }
  const fallbackAdvance = denseFrame[QUESTION] !== -1 ? denseAdvance[QUESTION] : info.cellWidth;

  /**
   * Frame of a glyph, or -1.
   *
   * @param code - Code unit.
   * @returns Frame id.
   */
  const glyphFrame = (code: number): FrameId =>
    code >= 0 && code < DENSE_CODES ? denseFrame[code] : (sparseFrame.get(code) ?? -1);

  /**
   * Advance of a character (fallback for unknown ones).
   *
   * @param code - Code unit.
   * @returns Pixels.
   */
  const advance = (code: number): number => {
    if (code >= 0 && code < DENSE_CODES) {
      return denseFrame[code] !== -1 ? denseAdvance[code] : fallbackAdvance;
    }
    return sparseAdvance.get(code) ?? fallbackAdvance;
  };

  /**
   * Width of the line starting at `start`.
   *
   * @param text - Text.
   * @param start - Line start.
   * @returns Pixels.
   */
  const measureLine = (text: string, start: number): number => {
    let width = 0;
    for (let i = start; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === NEWLINE) break;
      width += advance(code);
    }
    return width;
  };

  return {
    name,
    lineHeight: info.lineHeight,
    cellWidth: info.cellWidth,
    cellHeight: info.cellHeight,
    glyphFrame,
    advance,
    measureLine,
    measure(text) {
      let widest = 0;
      let start = 0;
      while (start <= text.length) {
        const width = measureLine(text, start);
        if (width > widest) widest = width;
        const next = text.indexOf('\n', start);
        if (next < 0) break;
        start = next + 1;
      }
      return widest;
    },
  };
}

/**
 * Implements the core's `TextMetrics` over a set of bitmap fonts.
 *
 * @param fonts - Available fonts; the first is the default (its `lineHeight` is reported).
 * @returns The metrics.
 * @throws {RangeError} When `fonts` is empty.
 *
 * @example
 * ```ts
 * const metrics = createTextMetrics([createBitmapFont(atlas)]);
 * const x = (384 - metrics.measure('GAME OVER', 'pixel')) / 2;
 * ```
 */
export function createTextMetrics(fonts: readonly BitmapFont[]): TextMetrics {
  const first = fonts[0];
  if (first === undefined) throw new RangeError('createTextMetrics needs at least one font');
  return {
    lineHeight: first.lineHeight,
    measure(text, fontId) {
      for (const font of fonts) if (font.name === fontId) return font.measure(text);
      throw new RangeError(`unknown font "${fontId}"`);
    },
  };
}

/** Receives one quad per glyph (the renderer's `QuadPool` implements it). */
export interface GlyphSink {
  /**
   * Draws a glyph frame with its top-left (glyph anchors are 0,0) at `(x, y)`.
   *
   * @param frameId - Glyph frame.
   * @param x - Screen x.
   * @param y - Screen y.
   * @param flags - Always 0 for glyphs.
   * @param tint - Tint 0xRRGGBB.
   * @param alpha - Opacity 0…255.
   * @returns `false` when the sink is full (layout stops).
   */
  frame(
    frameId: FrameId,
    x: number,
    y: number,
    flags: number,
    tint: number,
    alpha: number,
  ): boolean;
}

/**
 * Left edge of a line of width `width` aligned at `x`.
 *
 * @param x - Alignment point.
 * @param width - Line width.
 * @param align - `TextAlign` code.
 * @returns Integer left edge.
 */
function alignLeft(x: number, width: number, align: number): number {
  if (align === TextAlign.Center) return Math.round(x - width / 2);
  if (align === TextAlign.Right) return Math.round(x - width);
  return Math.round(x);
}

/**
 * Lays out text and emits one quad per visible glyph. Never allocates.
 *
 * @param sink - Where glyphs go (normally a `QuadPool`).
 * @param font - The font.
 * @param text - Text (`\n` = new line).
 * @param x - Alignment point of every line (see `align`).
 * @param y - Top of the first line.
 * @param color - Tint 0xRRGGBB.
 * @param align - `TextAlign` code (per line).
 * @param alpha - Opacity 0…255 (default 255).
 * @returns Glyphs emitted (stops early when the sink is full).
 *
 * @example
 * ```ts
 * drawText(pool, font, 'SHMUP CUP', 192, 40, 0xf8d030, TextAlign.Center);
 * ```
 */
export function drawText(
  sink: GlyphSink,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  color: number,
  align: number,
  alpha = 255,
): number {
  let emitted = 0;
  let lineY = Math.round(y);
  let penX = alignLeft(x, font.measureLine(text, 0), align);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === NEWLINE) {
      lineY += font.lineHeight;
      penX = alignLeft(x, font.measureLine(text, i + 1), align);
      continue;
    }
    if (code !== SPACE) {
      let frame = font.glyphFrame(code);
      if (frame < 0) frame = font.glyphFrame(QUESTION);
      if (frame >= 0) {
        if (!sink.frame(frame, penX, lineY, 0, color, alpha)) return emitted;
        emitted++;
      }
    }
    penX += font.advance(code);
  }
  return emitted;
}

/** Most digits a number is drawn with. */
const MAX_DIGITS = 20;

/** Digit scratch buffer (most significant last) — shared, never reallocated. */
const digitBuffer = new Uint8Array(MAX_DIGITS);

/**
 * The value a number command actually draws: NaN and ±Infinity become 0 and magnitudes are
 * capped at `Number.MAX_SAFE_INTEGER` (digit extraction is exact up to there).
 *
 * @param value - Requested value.
 * @returns The value to draw (sign kept).
 */
function drawable(value: number): number {
  if (!(value > -Infinity && value < Infinity)) return 0;
  if (value > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  if (value < -Number.MAX_SAFE_INTEGER) return -Number.MAX_SAFE_INTEGER;
  return value;
}

/**
 * Splits `|trunc(value)|` into {@link digitBuffer} (least significant first), zero-padded
 * to `minDigits` (at most {@link MAX_DIGITS}).
 *
 * @param value - A {@link drawable} value.
 * @param minDigits - Minimum digit count.
 * @returns Digit count (≥ 1).
 */
function splitDigits(value: number, minDigits: number): number {
  let rest = Math.floor(Math.abs(value));
  let count = 0;
  while (rest >= 1 && count < MAX_DIGITS) {
    digitBuffer[count++] = rest % 10;
    rest = Math.floor(rest / 10);
  }
  const pad = minDigits > MAX_DIGITS ? MAX_DIGITS : minDigits;
  while (count < pad || count === 0) digitBuffer[count++] = 0;
  return count;
}

/**
 * Width of a number as {@link drawNumber} draws it.
 *
 * @param font - The font.
 * @param value - Value (integer part is drawn).
 * @param minDigits - Zero-pad to at least this many digits.
 * @returns Width in pixels.
 */
export function measureNumber(font: BitmapFont, value: number, minDigits: number): number {
  const shown = drawable(value);
  const count = splitDigits(shown, minDigits);
  let width = shown <= -1 ? font.advance(MINUS) : 0;
  for (let i = 0; i < count; i++) width += font.advance(DIGIT_ZERO + digitBuffer[i]);
  return width;
}

/**
 * Draws a number digit by digit — no string is built. The integer part is drawn (NaN and
 * ±Infinity draw as 0, magnitudes are capped at `Number.MAX_SAFE_INTEGER`); values ≤ −1 get a
 * leading `-`; zero padding stops at 20 digits.
 *
 * @param sink - Where glyphs go.
 * @param font - The font.
 * @param value - Value to draw.
 * @param x - Alignment point (see `align`).
 * @param y - Top edge.
 * @param minDigits - Zero-pad to at least this many digits (0 = none).
 * @param color - Tint 0xRRGGBB.
 * @param align - `TextAlign` code.
 * @param alpha - Opacity 0…255 (default 255).
 * @returns Glyphs emitted.
 *
 * @example
 * ```ts
 * drawNumber(pool, font, 12300, 20, 0, 8, 0xffffff, TextAlign.Left); // "00012300"
 * ```
 */
export function drawNumber(
  sink: GlyphSink,
  font: BitmapFont,
  value: number,
  x: number,
  y: number,
  minDigits: number,
  color: number,
  align: number,
  alpha = 255,
): number {
  const width = measureNumber(font, value, minDigits);
  const shown = drawable(value);
  const count = splitDigits(shown, minDigits);
  let penX = alignLeft(x, width, align);
  const top = Math.round(y);
  let emitted = 0;
  if (shown <= -1) {
    const minus = font.glyphFrame(MINUS);
    if (minus >= 0) {
      if (!sink.frame(minus, penX, top, 0, color, alpha)) return emitted;
      emitted++;
    }
    penX += font.advance(MINUS);
  }
  for (let i = count - 1; i >= 0; i--) {
    const code = DIGIT_ZERO + digitBuffer[i];
    const frame = font.glyphFrame(code);
    if (frame >= 0) {
      if (!sink.frame(frame, penX, top, 0, color, alpha)) return emitted;
      emitted++;
    }
    penX += font.advance(code);
  }
  return emitted;
}
