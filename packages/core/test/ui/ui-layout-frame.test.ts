/**
 * The UI lays out in the frame (plan_resolution.md R2-01, lane U2): every scene of the flow, walked
 * on the shipped content in each shipped language — English, Spanish (the longest words) and
 * Japanese —, draws every text inside the frame, no two texts on top of each other, and every text
 * of a panel inside that panel (`../helpers/layout-walks.ts`). This file walks the **current**
 * frame and font (384×216 with the 6×8 font and `ART_SCALE` 1 until R2-01's flip, 640×360 with
 * 9×12 and 3/2 after it); `ui-layout-frame-flip.test.ts` walks the post-flip metrics before the
 * flip lands. A failure names the scene, the text, its box and what it leaves or overlaps: fix the
 * panel or the text, never the test. The few problems the presentation fingerprint pins until the
 * flip are listed, exactly, in the helper's `KNOWN_LAYOUT_PROBLEMS` (lane U's post-flip pass fixes
 * them with its re-pin).
 */
import { describe, expect, it } from 'vitest';
import { FRAME_CX, FRAME_H, FRAME_W, GLYPH_H, GLYPH_W } from '../../src/config/index.js';
import { createDrawList } from '../../src/presentation/index.js';
import { UI_LANGUAGES, drawPanel } from '../../src/ui/index.js';
import {
  expectedScenes,
  frameProblems,
  shippedDb,
  unexplained,
  walkLayouts,
} from '../helpers/layout-walks.js';

/**
 * Whether the walks run at the v1 frame (384×216). The constants are widened to `number`: after
 * R2-01's flip their literal types (640, 360) never equal 384 / 216, which the compiler rejects.
 */
const V1_FRAME = (FRAME_W as number) === 384 && (FRAME_H as number) === 216;

describe('core/ui layout at the current frame and font (R2-01)', () => {
  const db = shippedDb();

  it('flags a UI text over a HUD text, but not over one a UI panel covers', () => {
    const ui = createDrawList(16, 4);
    const hud = createDrawList(16, 4);
    hud.setString(0, 'SCORE');
    hud.text(0, FRAME_CX, 0);
    ui.setString(0, 'PAUSE');
    ui.text(0, FRAME_CX + GLYPH_W, GLYPH_H >> 1);
    const found = frameProblems(ui, hud, 'pause');
    expect(found.map((p) => [p.kind, p.where, p.text, p.other])).toEqual([
      ['overlap', 'pause UI/HUD', 'PAUSE', 'SCORE'],
    ]);
    // An overlay's panel over the HUD text: it is covered (the UI is drawn over the HUD).
    const covered = createDrawList(16, 4);
    drawPanel(covered, FRAME_CX - 8 * GLYPH_W, 0, 16 * GLYPH_W, 4 * GLYPH_H);
    covered.setString(0, 'PAUSE');
    covered.text(0, FRAME_CX + GLYPH_W, GLYPH_H >> 1);
    expect(frameProblems(covered, hud, 'pause')).toEqual([]);
  });

  it('ships the three languages the walks cover', () => {
    expect(UI_LANGUAGES.map((language) => language.id)).toEqual(['en', 'es', 'ja']);
  });

  it.each(['en', 'es', 'ja'])('lays out every scene in %s', (language) => {
    const report = walkLayouts(db, language);
    // Everything but the fingerprint-pinned problems listed in the helper — and each of those.
    const left = unexplained(report, language, V1_FRAME);
    expect(left.problems).toEqual([]);
    expect(left.unused).toEqual([]);
    expect(report.seen.filter((id) => id !== '')).toEqual(expectedScenes(report));
  });
});
