/**
 * `core/config` — the frame constants of plan_resolution.md R1-01 (§7: every frame-dependent
 * number derives from a few compile-time constants): their 640×360 values since R2-01's flip, the
 * relations the derived values keep, the font metrics pinned to the native font file the
 * default-scale atlas is built from (R4-03.C1 — its cell is `GLYPH_W` / `GLYPH_H` / `LINE_H`) and
 * to the v1 file's × `ART_SCALE` relation (its source at scale 1 — R2-01, W4-3), and
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
  WORLD_SCALE,
  WORLD_TOP_PAD,
  resolveGameConfig,
} from '../../src/config/index.js';

const here = dirname(fileURLToPath(import.meta.url));

/** The fonts directory (`scripts/assets/font.mjs` reads it). */
const FONTS_DIR = join(here, '..', '..', '..', '..', 'assets', 'source', 'fonts');

/** The v1 bitmap font: the scale-1 atlas's source, kept for the v1 build (R4-03.C1). */
const FONT_FILE = join(FONTS_DIR, 'pixel6x8.font.json');

/** The native v2 bitmap font: the file the default-scale atlas is built from (R4-03.C1). */
const FONT_FILE_NATIVE = join(FONTS_DIR, 'pixel9x12.font.json');

/** The font file's metrics. */
interface FontMetrics {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly lineHeight: number;
  readonly advance: number;
  readonly glyphs: Record<string, readonly string[]>;
}

const FONT = JSON.parse(readFileSync(FONT_FILE, 'utf8')) as FontMetrics;
const FONT_NATIVE = JSON.parse(readFileSync(FONT_FILE_NATIVE, 'utf8')) as FontMetrics;

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

  it('keeps WORLD_SCALE a positive rational with a whole double (R2-02.P0: 1; the port: 3/2)', () => {
    expect(WORLD_SCALE).toBeGreaterThan(0);
    // Like ART_SCALE: a rational with a small denominator (1, 3/2, 2 …) — some multiple up to
    // 12 of it is whole. WORLD_SCALE * 2 is whole so 3/2 can arrive without a re-pin here.
    expect(Number.isInteger(WORLD_SCALE * 2)).toBe(true);
    let denominator = 1;
    while (denominator < 12 && !Number.isInteger(WORLD_SCALE * denominator)) denominator += 1;
    expect(Number.isInteger(WORLD_SCALE * denominator)).toBe(true);
  });

  it('keeps WORLD_TOP_PAD a whole number ≥ 0 (R2-02.P0: 0; the port: 36)', () => {
    expect(Number.isInteger(WORLD_TOP_PAD)).toBe(true);
    expect(WORLD_TOP_PAD).toBeGreaterThanOrEqual(0);
  });

  it.runIf(WORLD_SCALE !== 1)(
    'ports the playfield: PLAYFIELD_H is 200·WORLD_SCALE + WORLD_TOP_PAD (§2.6)',
    () => {
      // v1's playfield was 200 px of world: the scaled world plus the top pad fills the frame's.
      expect(PLAYFIELD_H).toBe(200 * WORLD_SCALE + WORLD_TOP_PAD);
    },
  );

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

  it('mirrors the native bitmap font file (assets/source/fonts/pixel9x12.font.json — R4-03.C1)', () => {
    // Since R4-03.C1 the default-scale atlas builds its font from the native file: the metrics
    // are the file's own cells, not a scaled relation (decision RR-2: 9×12 stays).
    expect(GLYPH_W).toBe(FONT_NATIVE.cellWidth);
    expect(GLYPH_H).toBe(FONT_NATIVE.cellHeight);
    expect(LINE_H).toBe(FONT_NATIVE.lineHeight);
    // Text is laid out on a GLYPH_W pitch: the advance is the cell width.
    expect(GLYPH_W).toBe(FONT_NATIVE.advance);
    // Every glyph of the file is drawn in a cellWidth × cellHeight cell.
    const glyphs = Object.keys(FONT_NATIVE.glyphs);
    expect(glyphs.length).toBeGreaterThan(0);
    for (const glyph of glyphs) {
      const rows = FONT_NATIVE.glyphs[glyph];
      expect(rows.length, glyph).toBe(FONT_NATIVE.cellHeight);
      for (const row of rows) expect(row.length, glyph).toBe(FONT_NATIVE.cellWidth);
    }
  });

  it('keeps the v1 font file at GLYPH_* / ART_SCALE (its scale-1 source — R2-01, W4-3)', () => {
    // The v1 file still ships (the v1 build and the e2e mirror read it): its cells are the
    // constants ÷ ART_SCALE, and C2 … C4b never touch it (wave rule 1).
    expect(GLYPH_W).toBe(FONT.cellWidth * ART_SCALE);
    expect(GLYPH_H).toBe(FONT.cellHeight * ART_SCALE);
    expect(LINE_H).toBe(FONT.lineHeight * ART_SCALE);
    expect(GLYPH_W).toBe(FONT.advance * ART_SCALE);
    // Both files declare the same charset: the code-point sets agree.
    expect(new Set(Object.keys(FONT.glyphs))).toEqual(new Set(Object.keys(FONT_NATIVE.glyphs)));
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
