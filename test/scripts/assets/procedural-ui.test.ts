/**
 * The utility frames (`scripts/assets/procedural/ui.mjs`): `ui/pixel` and `ui/missing`
 * (the title logo is `procedural-logo.test.ts`). Split out of `procedural.test.ts` by R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as ui from '../../../scripts/assets/procedural/ui.mjs';
import { byName } from './procedural-helpers.js';

describe('scripts/assets/procedural/ui', () => {
  const sprites = ui.generate();

  it('makes ui/pixel one opaque white pixel anchored at its top-left', () => {
    const pixel = byName(sprites, 'ui/pixel');
    expect(pixel.anchor).toEqual([0, 0]);
    expect(pixel.frames).toHaveLength(1);
    expect(Array.from(pixel.frames[0].data)).toEqual([255, 255, 255, 255]);
  });

  it('makes ui/missing an opaque 8×8 magenta/black checker of 2×2 cells, centred', () => {
    const missing = byName(sprites, 'ui/missing');
    expect(missing.anchor).toBeNull();
    const [frame] = missing.frames;
    expect([frame.width, frame.height]).toEqual([8, 8]);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const magenta = ((x >> 1) + (y >> 1)) % 2 === 0;
        expect(getPixel(frame, x, y)).toEqual(magenta ? [255, 0, 255, 255] : [0, 0, 0, 255]);
      }
    }
  });
});
