/**
 * `core/config` — the frame constants of plan_resolution.md R1-01 (§7: every frame-dependent
 * number derives from a few compile-time constants): their 640×360 values since R2-01's flip, the
 * relations the derived values keep, the font metrics pinned to the font file the atlas is built
 * from (× `ART_SCALE`, the factor the atlas pipeline scales the font by — R2-01, W4-3), and
 * `DEFAULT_GAME_CONFIG` recording the frame.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../../src/index.js';
import {
  ART_SCALE,
  DEFAULT_GAME_CONFIG,
  FRAME_CX,
  FRAME_CY,
  FRAME_H,
  FRAME_W,
  GLYPH_H,
  GLYPH_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  LINE_H,
  PLAYFIELD_CY,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  TILE_SIZE,
  resolveGameConfig,
} from '../../src/config/index.js';

const here = dirname(fileURLToPath(import.meta.url));

/** The bitmap font every text command is drawn in (`scripts/assets/font.mjs` reads it). */
const FONT_FILE = join(
  here,
  '..',
  '..',
  '..',
  '..',
  'assets',
  'source',
  'fonts',
  'pixel6x8.font.json',
);

/** The font file's metrics. */
interface FontMetrics {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly lineHeight: number;
  readonly advance: number;
  readonly glyphs: Record<string, readonly string[]>;
}

const FONT = JSON.parse(readFileSync(FONT_FILE, 'utf8')) as FontMetrics;

/** Every frame constant by name. */
const CONSTANTS = {
  FRAME_W,
  FRAME_H,
  FRAME_CX,
  FRAME_CY,
  HUD_BAR_HEIGHT,
  PLAYFIELD_Y,
  PLAYFIELD_W,
  PLAYFIELD_H,
  PLAYFIELD_CY,
  HUD_BOTTOM_Y,
  TILE_SIZE,
  GLYPH_W,
  GLYPH_H,
  LINE_H,
  ART_SCALE,
};

/** The one frame constant that need not be whole (R2-01: 3/2). */
const FRACTIONAL = new Set(['ART_SCALE']);

describe('core/config frame constants (R1-01)', () => {
  it('holds the v2 frame since R2-01: 640×360, 12-px bars and tiles, 9×12 font, ×3/2 art', () => {
    expect(CONSTANTS).toEqual({
      FRAME_W: 640,
      FRAME_H: 360,
      FRAME_CX: 320,
      FRAME_CY: 180,
      HUD_BAR_HEIGHT: 12,
      PLAYFIELD_Y: 12,
      PLAYFIELD_W: 640,
      PLAYFIELD_H: 336,
      PLAYFIELD_CY: 168,
      HUD_BOTTOM_Y: 348,
      TILE_SIZE: 12,
      GLYPH_W: 9,
      GLYPH_H: 12,
      LINE_H: 15,
      ART_SCALE: 1.5,
    });
  });

  it('keeps every constant a positive whole number (hot paths pass them as whole pixels)', () => {
    for (const [name, value] of Object.entries(CONSTANTS)) {
      if (FRACTIONAL.has(name)) continue;
      expect(Number.isInteger(value) && value > 0, name).toBe(true);
    }
  });

  it('keeps ART_SCALE a positive rational whose products with the font metrics are whole', () => {
    expect(ART_SCALE).toBeGreaterThan(0);
    // A rational with a small denominator (1, 3/2, 2 …): some multiple up to 12 of it is whole.
    let denominator = 1;
    while (denominator < 12 && !Number.isInteger(ART_SCALE * denominator)) denominator += 1;
    expect(Number.isInteger(ART_SCALE * denominator)).toBe(true);
    for (const metric of [FONT.cellWidth, FONT.cellHeight, FONT.lineHeight, FONT.advance]) {
      expect(Number.isInteger(metric * ART_SCALE), String(metric)).toBe(true);
    }
  });

  it('derives the playfield, the centres and the bottom bar from the frame and the HUD bars', () => {
    expect(PLAYFIELD_W).toBe(FRAME_W);
    expect(PLAYFIELD_Y).toBe(HUD_BAR_HEIGHT);
    expect(PLAYFIELD_H).toBe(FRAME_H - 2 * HUD_BAR_HEIGHT);
    expect(HUD_BOTTOM_Y).toBe(PLAYFIELD_Y + PLAYFIELD_H);
    expect(HUD_BOTTOM_Y + HUD_BAR_HEIGHT).toBe(FRAME_H);
    expect(2 * FRAME_CX).toBe(FRAME_W);
    expect(2 * FRAME_CY).toBe(FRAME_H);
    expect(2 * PLAYFIELD_CY).toBe(PLAYFIELD_H);
  });

  it('fits the playfield to whole tile rows and a line of text into a HUD bar', () => {
    // A tilemap's rows fill the playfield exactly (25 rows of 8 px; 28 of 12 px at 640×360).
    expect(PLAYFIELD_H % TILE_SIZE).toBe(0);
    // The HUD bars draw one line of text each (the 1P / HI / 2P labels).
    expect(GLYPH_H).toBeLessThanOrEqual(HUD_BAR_HEIGHT);
    expect(LINE_H).toBeGreaterThanOrEqual(GLYPH_H);
  });

  it('mirrors the bitmap font file × ART_SCALE (assets/source/fonts/pixel6x8.font.json)', () => {
    // The atlas pipeline scales the font by ART_SCALE (R2-01's interim 9×12 is the 6×8 file × 3/2).
    expect(GLYPH_W).toBe(FONT.cellWidth * ART_SCALE);
    expect(GLYPH_H).toBe(FONT.cellHeight * ART_SCALE);
    expect(LINE_H).toBe(FONT.lineHeight * ART_SCALE);
    // Text is laid out on a GLYPH_W pitch: the advance is the cell width.
    expect(GLYPH_W).toBe(FONT.advance * ART_SCALE);
    // Every glyph of the file is drawn in a cellWidth × cellHeight cell.
    const glyphs = Object.keys(FONT.glyphs);
    expect(glyphs.length).toBeGreaterThan(0);
    for (const glyph of glyphs) {
      const rows = FONT.glyphs[glyph];
      expect(rows.length, glyph).toBe(FONT.cellHeight);
      for (const row of rows) expect(row.length, glyph).toBe(FONT.cellWidth);
    }
  });

  it('records the frame in DEFAULT_GAME_CONFIG (the replay header) and resolved configs', () => {
    expect(DEFAULT_GAME_CONFIG.internalWidth).toBe(FRAME_W);
    expect(DEFAULT_GAME_CONFIG.internalHeight).toBe(FRAME_H);
    const config = resolveGameConfig({ seed: 7 });
    expect([config.internalWidth, config.internalHeight]).toEqual([FRAME_W, FRAME_H]);
  });

  it('exports them from the package entry, TILE_SIZE under its old name', () => {
    for (const [name, value] of Object.entries(CONSTANTS)) {
      expect((core as Record<string, unknown>)[name], name).toBe(value);
    }
    expect(core.TILE_SIZE).toBe(TILE_SIZE);
  });
});
