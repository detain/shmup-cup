/**
 * `core/config` — the frame constants of plan_resolution.md R1-01 (§7: every frame-dependent
 * number derives from a few compile-time constants): their values until R2-01 flips them, the
 * relations the derived values keep, the font metrics pinned to the font file the atlas is built
 * from, and `DEFAULT_GAME_CONFIG` recording the frame.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../../src/index.js';
import {
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
};

describe('core/config frame constants (R1-01)', () => {
  it('holds the v1 frame until R2-01: 384×216, 8-px HUD bars and tiles, the 6×8 font', () => {
    expect(CONSTANTS).toEqual({
      FRAME_W: 384,
      FRAME_H: 216,
      FRAME_CX: 192,
      FRAME_CY: 108,
      HUD_BAR_HEIGHT: 8,
      PLAYFIELD_Y: 8,
      PLAYFIELD_W: 384,
      PLAYFIELD_H: 200,
      PLAYFIELD_CY: 100,
      HUD_BOTTOM_Y: 208,
      TILE_SIZE: 8,
      GLYPH_W: 6,
      GLYPH_H: 8,
      LINE_H: 10,
    });
  });

  it('keeps every constant a positive whole number (hot paths pass them as whole pixels)', () => {
    for (const [name, value] of Object.entries(CONSTANTS)) {
      expect(Number.isInteger(value) && value > 0, name).toBe(true);
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

  it('mirrors the metrics of the bitmap font file (assets/source/fonts/pixel6x8.font.json)', () => {
    expect(FONT.cellWidth).toBe(GLYPH_W);
    expect(FONT.cellHeight).toBe(GLYPH_H);
    expect(FONT.lineHeight).toBe(LINE_H);
    // Text is laid out on a GLYPH_W pitch: the advance is the cell width.
    expect(FONT.advance).toBe(GLYPH_W);
    // Every glyph is drawn in a GLYPH_W × GLYPH_H cell.
    const glyphs = Object.keys(FONT.glyphs);
    expect(glyphs.length).toBeGreaterThan(0);
    for (const glyph of glyphs) {
      const rows = FONT.glyphs[glyph];
      expect(rows.length, glyph).toBe(GLYPH_H);
      for (const row of rows) expect(row.length, glyph).toBe(GLYPH_W);
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
