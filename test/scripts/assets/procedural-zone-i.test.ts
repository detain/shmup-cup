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
import { byName, bytes } from './procedural-zone-helpers.js';

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

  it("draws the v2 ending path native at the bible's sizes, the v1 path untouched", () => {
    const v2 = ending.generate({ artScale: 3 / 2 });
    expect(v2.map((s) => s.name)).toEqual([...ending.ENDING_SPRITES]);
    for (const s of v2) expect(s.native, s.name).toBe(true);
    // Art bible v2 §5.11: ⌈1.5·⌉ of every v1 size, the blast 24² → 36² over its four frames.
    expect(v2.map((s) => [s.name, s.frames[0].width, s.frames[0].height, s.frames.length])).toEqual(
      [
        ['ui/ending-citadel', 192, 108, 1],
        ['ui/ending-ark', 168, 54, 1],
        ['ui/ending-blast', 36, 36, 4],
        ['ui/ending-bubble', 9, 9, 1],
        ['ui/ending-sun', 96, 48, 1],
        ['ui/ending-surface', 96, 12, 1],
      ],
    );
    // Deterministic: two runs byte for byte.
    expect(bytes(v2)).toEqual(bytes(ending.generate({ artScale: 3 / 2 })));
    // Every frame draws something.
    for (const s of v2)
      for (const frame of s.frames) {
        let lit = 0;
        for (let i = 3; i < frame.data.length; i += 4) if (frame.data[i] > 0) lit++;
        expect(lit, s.name).toBeGreaterThan(0);
      }
    // The blast still grows; the sun sits on its bottom row under a transparent sky corner.
    const blast = byName(v2, 'ui/ending-blast');
    expect(blast.frames[0].data.join()).not.toEqual(blast.frames[1].data.join());
    const sun = byName(v2, 'ui/ending-sun').frames[0];
    expect(getPixel(sun, 48, sun.height - 1)[3]).toBe(255);
    expect(getPixel(sun, 0, 0)[3]).toBe(0);
    // The surface tiles: its 48-px period divides the 96-px width.
    const surface = byName(v2, 'ui/ending-surface').frames[0];
    for (let x = 0; x < 48; x++)
      for (let y = 0; y < surface.height; y++)
        expect(getPixel(surface, x, y)).toEqual(getPixel(surface, x + 48, y));
    // Scale 1 keeps drawing the v1 art, unmarked and byte-identical.
    const one = ending.generate({ artScale: 1 });
    for (const s of one) expect(s.native).toBeUndefined();
    expect(bytes(one)).toEqual(bytes(e));
    expect(bytes(ending.generate())).toEqual(bytes(e));
  });
});
