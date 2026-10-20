/**
 * The zone I and ending placeholder art of plan M2-14 (`scripts/assets/procedural/abyss.mjs` and
 * `ending.mjs`, split out of `procedural-zones-hi.test.ts` by R5-P.P5c): the ARK's turret with its
 * sixteen heading frames, the ending pieces with their shapes, and the ending sprite list matching
 * exactly the core's ending UI sprites. The tests that examine more than one zone (the three
 * generators' order, registration, determinism and hit flashes, the two palette-cycled walls, the
 * two more tilesets, the zone H and I roster hurtboxes) stayed with the earlier zone in
 * `procedural-zone-h.test.ts`.
 *
 * @module
 */
import { UI_SPRITES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { getPixel, type Image } from '../../../scripts/assets/image.mjs';
import * as abyss from '../../../scripts/assets/procedural/abyss.mjs';
import * as ending from '../../../scripts/assets/procedural/ending.mjs';
import { byName } from './procedural-zone-helpers.js';

describe('scripts/assets/procedural — zones H and I, the ending scenes (M2-14)', () => {
  const i = abyss.generate();
  const e = ending.generate();

  it("gives the ARK's turret sixteen heading frames and the ending pieces their shapes", () => {
    const turret = byName(i, 'bosses/ark-turret');
    expect(turret.frames).toHaveLength(16);
    const blast = byName(e, 'ui/ending-blast');
    expect(blast.frames).toHaveLength(4);
    const opaque = (image: Image): number => {
      let n = 0;
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) if (getPixel(image, x, y)[3] > 0) n++;
      return n;
    };
    // The blast grows from a small flash to a wide ring.
    expect(opaque(blast.frames[0])).toBeLessThan(opaque(blast.frames[1]));
    const sun = byName(e, 'ui/ending-sun').frames[0];
    expect(getPixel(sun, 32, sun.height - 1)[3]).toBe(255); // the half disc sits on its bottom row
    expect(getPixel(sun, 4, 4)[3]).toBe(0); // a transparent sky round it
    const surface = byName(e, 'ui/ending-surface').frames[0];
    expect(surface.width).toBe(64);
    // Its waves repeat every 32 px, so copies side by side join without a seam.
    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < surface.height; y++) {
        expect(getPixel(surface, x, y)).toEqual(getPixel(surface, x + 32, y));
      }
    }
  });

  it("names exactly the core's ending UI sprites", () => {
    expect([...ending.ENDING_SPRITES].sort()).toEqual(
      UI_SPRITES.filter((name) => name.startsWith('ui/ending-')).sort(),
    );
  });
});
