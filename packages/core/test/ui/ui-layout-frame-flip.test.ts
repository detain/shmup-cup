/**
 * The UI lays out at R2-01's post-flip metrics — the 640×360 frame with 12-px HUD bars and tiles,
 * the interim 9×12 font (line 15) and `ART_SCALE` 3/2 — before the flip lands (plan_resolution.md
 * R2-01, lane U2): this file mocks `core/config`'s frame constants with those values
 * (`../helpers/frame-metrics.ts`), so every module the walks load lays itself out as the flipped
 * build will, and walks every scene in en, es and ja like `ui-layout-frame.test.ts`
 * (`../helpers/layout-walks.ts`) — all but the demo play, whose shipped recordings are refused at
 * 640×360. After the flip the mock equals the real constants and the two files check the same
 * layout.
 */
import { describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from '../../src/config/index.js';
import { FRAME_H, FRAME_W, GLYPH_W } from '../../src/config/index.js';
import { SCENE_IDS, shippedDb, unexplained, walkLayouts } from '../helpers/layout-walks.js';

vi.mock('../../src/config/index.js', async (importOriginal) => {
  const { POST_FLIP_METRICS, mockedConfig } = await import('../helpers/frame-metrics.js');
  return mockedConfig(await importOriginal<typeof ConfigModule>(), POST_FLIP_METRICS);
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
    // Every scene but the demo play: the shipped demos, recorded at 384×216, are refused here.
    expect(report.demos).toBe(false);
    expect(report.seen.filter((id) => id !== '')).toEqual(SCENE_IDS.filter((id) => id !== 'demo'));
  });
});
