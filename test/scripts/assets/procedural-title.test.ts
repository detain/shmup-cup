/**
 * R4-05.E2: the title backdrop generator (`scripts/assets/procedural/title.mjs`).
 *
 * `ui/title-backdrop` is v2-only (decision RR-1a): the generator returns nothing at scale 1, so
 * the scale-1 digest pin in `interim-pipeline.test.ts` cannot see the name, and at the default
 * scale it returns one **native** sprite — the full frame as two half-frames (`⌊FRAME_W / 2⌋`
 * columns + the rest, each `FRAME_H` tall — the pipeline's page-limit cases build real sources at
 * 512², so no frame may outsize 510²) — drawn
 * opaque so the title's strings always sit on painted sky. The colours obey the art bible's
 * backdrop budget (§ 4.1: dark — every channel at least 16 and the value at most 64; never
 * neutral; low saturation — (max − min) · 255 / max at most 140), which keeps the logo, the menu
 * and the gold `HI` line readable, and the KESTREL hull colour (`#c8d0e0`, which `boot.spec.ts`
 * and `scenes.spec.ts` fail the title on) out. Test files hold literal sizes by convention
 * (`docs/dev/conventions.md` § Frame numbers: the scans do not read `test/`).
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import { FRAME_H, FRAME_W } from '../../../scripts/frame.mjs';
import { generate } from '../../../scripts/assets/procedural/title.mjs';
import { bytes, byName, opaqueColours } from './procedural-zone-helpers.js';

/** The v2 build's sprites. */
const v2 = generate({ artScale: 3 / 2 });

describe('scripts/assets/procedural/title.mjs — the v2 title backdrop (R4-05.E2)', () => {
  it('draws nothing at scale 1 (RR-1a: no v1 stand-in)', () => {
    expect(generate()).toEqual([]);
    expect(generate({ artScale: 1 })).toEqual([]);
  });

  it('draws native full-frame halves, opaque', () => {
    expect(v2.map((s) => s.name)).toEqual(['ui/title-backdrop']);
    const sprite = byName(v2, 'ui/title-backdrop');
    expect(sprite.native).toBe(true);
    expect(sprite.anchor).toEqual([0, 0]); // the scene places frame 0 at the frame's top-left corner
    // The frame-sized image rides the atlas as two halves (no frame may outsize the 510² pages
    // the pipeline's page-limit cases build).
    expect(sprite.frames.length).toBe(2);
    const left = FRAME_W >> 1;
    expect(sprite.frames.map((f) => [f.width, f.height])).toEqual([
      [left, FRAME_H],
      [FRAME_W - left, FRAME_H],
    ]);
    let transparent = 0;
    for (const frame of sprite.frames) {
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          if (getPixel(frame, x, y)[3] !== 255) transparent++;
        }
      }
    }
    expect(transparent).toBe(0);
  });

  it('keeps every colour inside the bible § 4.1 backdrop budget', () => {
    const colours = [...new Set(v2[0].frames.flatMap((f) => [...opaqueColours(f)]))];
    expect(colours.length).toBeGreaterThan(8);
    for (const hex of colours) {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const min = Math.min(...rgb);
      const max = Math.max(...rgb);
      expect(min, hex).toBeGreaterThanOrEqual(16); // never near-black (VA panels)
      expect(max, hex).toBeLessThanOrEqual(64); // dark enough to sit under bright text
      expect(((max - min) * 255) / max, hex).toBeLessThanOrEqual(140); // low saturation
      expect(min === max, hex).toBe(false); // never neutral
    }
    expect(colours).not.toContain('#c8d0e0'); // the hull colour the browser specs check for
  });

  it('is deterministic: two runs are byte-identical', () => {
    expect(bytes(generate({ artScale: 3 / 2 }))).toEqual(bytes(v2));
  });
});
