/**
 * The title logo (`scripts/assets/procedural/logo.mjs`, split from `ui.mjs` in R4-P.P1).
 * Split out of `procedural.test.ts` by plan R4-P.P2; the describe keeps the old
 * `scripts/assets/procedural/ui` title so the census of the split matches.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as logoGen from '../../../scripts/assets/procedural/logo.mjs';
import { byName } from './procedural-helpers.js';

describe('scripts/assets/procedural/ui', () => {
  it('makes ui/logo "SHMUP CUP" in ×3 block letters with outline and shadow, centred (M1-16)', () => {
    // The logo is its own generator since R4-P.P1 (`logo.mjs`).
    const logo = byName(logoGen.generate(), 'ui/logo');
    expect(logoGen.LOGO_TEXT).toBe('SHMUP CUP');
    expect(logo.frames).toHaveLength(1);
    const [frame] = logo.frames;
    // 9 cells of 5 + 8 gaps of 1 = 53 letter pixels ×3, plus a 3-px margin on every side.
    expect([frame.width, frame.height]).toEqual([53 * 3 + 6, 7 * 3 + 6]);
    expect(logo.anchor).toEqual([Math.floor(frame.width / 2), Math.floor(frame.height / 2)]);
    // The S's top bar starts one cell in (".####"): first letter pixel at margin + 3.
    expect(getPixel(frame, 3 + 3, 3)[3]).toBe(255);
    expect(getPixel(frame, 5, 3)).toEqual([0x1b, 0x2a, 0x4a, 255]); // the outline left of it
    // Letters run from light yellow at the top to red at the bottom.
    const top = getPixel(frame, 3 + 4, 3 + 1);
    const bottom = getPixel(frame, 3 + 1, 3 + 20);
    expect(top[1]).toBeGreaterThan(bottom[1]);
    expect(bottom[0]).toBeGreaterThan(bottom[1]);
    // The corners stay transparent; the space between the words too.
    expect(getPixel(frame, 0, 0)[3]).toBe(0);
    expect(getPixel(frame, 3 + 30 * 3 + 1, 3 + 10)[3]).toBe(0);
  });
});
