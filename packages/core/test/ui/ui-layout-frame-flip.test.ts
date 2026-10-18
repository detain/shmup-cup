/**
 * The UI lays out at R2-01's post-flip metrics — the 640×360 frame with 12-px HUD bars and tiles,
 * the interim 9×12 font (line 15) and `ART_SCALE` 3/2 — before the flip lands (plan_resolution.md
 * R2-01, lane U2): this file mocks `core/config`'s frame constants with those values, so every
 * module the walks load lays itself out as the flipped build will, and walks every scene in en, es
 * and ja like `ui-layout-frame.test.ts` (`../helpers/layout-walks.ts`). After the flip the mock
 * equals the real constants and the two files check the same layout.
 */
import { describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from '../../src/config/index.js';
import { FRAME_H, FRAME_W, GLYPH_W } from '../../src/config/index.js';
import { shippedDb, unexplained, walkLayouts } from '../helpers/layout-walks.js';

vi.mock('../../src/config/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof ConfigModule>();
  const frameW = 640;
  const frameH = 360;
  const bar = 12;
  return {
    ...real,
    FRAME_W: frameW,
    FRAME_H: frameH,
    FRAME_CX: frameW / 2,
    FRAME_CY: frameH / 2,
    HUD_BAR_HEIGHT: bar,
    PLAYFIELD_Y: bar,
    PLAYFIELD_W: frameW,
    PLAYFIELD_H: frameH - 2 * bar,
    PLAYFIELD_CY: (frameH - 2 * bar) / 2,
    HUD_BOTTOM_Y: frameH - bar,
    TILE_SIZE: 12,
    GLYPH_W: 9,
    GLYPH_H: 12,
    LINE_H: 15,
    ART_SCALE: 3 / 2,
    DEFAULT_GAME_CONFIG: Object.freeze({
      ...real.DEFAULT_GAME_CONFIG,
      internalWidth: frameW,
      internalHeight: frameH,
    }),
  };
});

describe('core/ui layout at the post-flip metrics: 640×360, 9×12, ART_SCALE 3/2 (R2-01)', () => {
  it('walks the mocked metrics', () => {
    expect([FRAME_W, FRAME_H, GLYPH_W]).toEqual([640, 360, 9]);
  });

  const db = shippedDb();

  it.each(['en', 'es', 'ja'])('lays out every scene in %s', (language) => {
    const report = walkLayouts(db, language);
    // Everything but the fingerprint-pinned problems listed in the helper — and each of those.
    const left = unexplained(report, language, false);
    expect(left.problems).toEqual([]);
    expect(left.unused).toEqual([]);
  });
});
