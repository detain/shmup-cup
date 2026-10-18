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
import { FRAME_H, FRAME_W } from '../../src/config/index.js';
import { UI_LANGUAGES } from '../../src/ui/index.js';
import { shippedDb, unexplained, walkLayouts } from '../helpers/layout-walks.js';

/** Every scene id of the flow (`core/scenes` `SceneId`). */
const SCENE_IDS = [
  'boot',
  'title',
  'game',
  'pause',
  'stageClear',
  'gameOver',
  'confirm',
  'difficulty',
  'shipSelect',
  'weaponSelect',
  'autoOrder',
  'continue',
  'map',
  'options',
  'nameEntry',
  'hiScore',
  'ending',
  'credits',
  'demo',
  'story',
  'practice',
  'soundTest',
  'controls',
  'display',
  'gameOptions',
  'extras',
  'rebind',
  'inputTest',
  'extra',
  'replays',
  'replay',
];

describe('core/ui layout at the current frame and font (R2-01)', () => {
  const db = shippedDb();

  it('ships the three languages the walks cover', () => {
    expect(UI_LANGUAGES.map((language) => language.id)).toEqual(['en', 'es', 'ja']);
  });

  it.each(['en', 'es', 'ja'])('lays out every scene in %s', (language) => {
    const report = walkLayouts(db, language);
    // Everything but the fingerprint-pinned problems listed in the helper — and each of those.
    const left = unexplained(report, language, FRAME_W === 384 && FRAME_H === 216);
    expect(left.problems).toEqual([]);
    expect(left.unused).toEqual([]);
    const expected = report.demos ? SCENE_IDS : SCENE_IDS.filter((id) => id !== 'demo');
    expect(report.seen.filter((id) => id !== '')).toEqual([...expected].sort());
  });
});
