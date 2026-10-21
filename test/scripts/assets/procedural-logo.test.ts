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
import { bytes } from './procedural-zone-helpers.js';

/** The bible § 5.11's v2 cap. */
const MAX_W = 400;
const MAX_H = 80;

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

  it('draws the bible § 5.11 logo native at scale ≠ 1, the v1 art untouched (R4-05.E1)', () => {
    // The v2 path: the same 53×7 cells at ×6 + a 6-px margin — 330×54 (≈ 320 × 64, inside the
    // ≤ 400 × 80 cap), three flat bands, a 2-px navy ring and a hard 4-px offset shadow.
    const v2 = byName(logoGen.generate({ artScale: 3 / 2 }), 'ui/logo');
    expect(v2.native).toBe(true);
    const [frame] = v2.frames;
    expect([frame.width, frame.height]).toEqual([53 * 6 + 12, 7 * 6 + 12]);
    expect(frame.width).toBeLessThanOrEqual(MAX_W);
    expect(frame.height).toBeLessThanOrEqual(MAX_H);
    expect(v2.anchor).toEqual([Math.floor(frame.width / 2), Math.floor(frame.height / 2)]);
    // The S's first letter column starts at margin + 6 (row 0 is `.####`).
    const rgb = (x: number, y: number) => getPixel(frame, x, y).slice(0, 3);
    // Coordinates: letters start at the 6-px margin; the S's first glyph row is `.####` (cell
    // column 1 filled), its row 3 is `.###.` (column 1 filled), and column 0 is filled only on
    // rows 1 and 6. Row 6 of the frame is letter row 0 (lemon), 26 is row 3 (orange), 47 is
    // row 6 (red). (10, 6) lies 2 px left of the filled (12, 6) — inside the 2-px ring;
    // (16, 14) is the shadow of the (12, 10) letter pixel, beyond the ring's reach.
    expect(rgb(6 + 6, 6)).toEqual([0xf8, 0xf0, 0x70]); // lemon band (rows 0–13)
    expect(rgb(6 + 6, 26)).toEqual([0xf8, 0xa0, 0x30]); // orange band (rows 14–27)
    expect(rgb(6 + 6, 47)).toEqual([0xe0, 0x48, 0x28]); // red band — the boot/scenes spec colour
    expect(rgb(10, 6)).toEqual([0x1b, 0x2a, 0x4a]); // navy ring, 2 px wide
    expect(rgb(16, 14)).toEqual([0x0a, 0x0f, 0x26]); // hard offset shadow
    expect(getPixel(frame, 0, 0)[3]).toBe(0);
    // Exactly the five colours of the v1 palette (RR-4: the same lettering, not new art).
    const seen = new Set<string>();
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const [r, g, b, a] = getPixel(frame, x, y);
        if (a === 255) seen.add([r, g, b].join(','));
      }
    }
    expect([...seen].sort()).toEqual(
      ['10,15,38', '27,42,74', '224,72,40', '248,160,48', '248,240,112'].sort(),
    );
    // Scale 1 still draws the v1 logo, and two v2 runs are byte-identical.
    expect(bytes(logoGen.generate({ artScale: 3 / 2 }))).toEqual(
      bytes(logoGen.generate({ artScale: 3 / 2 })),
    );
    expect(bytes(logoGen.generate())).toEqual(bytes(logoGen.generate({ artScale: 1 })));
  });
});
