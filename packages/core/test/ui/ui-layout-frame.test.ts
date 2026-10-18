/**
 * The UI lays out in the frame (plan_resolution.md R2-01, lane U): every scene of the flow, walked
 * on the shipped content in each shipped language — English, Spanish (the longest words) and
 * Japanese —, draws every text inside the frame, no two texts on top of each other, and every text
 * of a panel inside that panel (`../helpers/layout-walks.ts`), at the current frame and font
 * (640×360 with the 9×12 font and `ART_SCALE` 3/2 since R2-01's flip). Every scene shows, but the
 * demo play while the shipped demos do not decode at this frame (`expectedScenes`). A failure
 * names the scene, the text, its box and what it leaves or overlaps: fix the panel or the text,
 * never the test.
 */
import { describe, expect, it } from 'vitest';
import { FRAME_CX, GLYPH_H, GLYPH_W } from '../../src/config/index.js';
import { createDrawList } from '../../src/presentation/index.js';
import { UI_LANGUAGES, drawPanel } from '../../src/ui/index.js';
import { expectedScenes, frameProblems, shippedDb, walkLayouts } from '../helpers/layout-walks.js';

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
    expect(report.problems.map((problem) => problem.message)).toEqual([]);
    expect(report.seen.filter((id) => id !== '')).toEqual(expectedScenes(report));
  });
});
