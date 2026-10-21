/**
 * The colour-blind bullet palette variants (`scripts/assets/procedural/palettes.mjs`).
 * Split out of `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, type Image, type Rgba } from '../../../scripts/assets/image.mjs';
import * as bullets from '../../../scripts/assets/procedural/bullets.mjs';
import * as lasers from '../../../scripts/assets/procedural/lasers.mjs';
import * as palettes from '../../../scripts/assets/procedural/palettes.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { byName, opaque, eachOpaque, luma, hue } from './procedural-helpers.js';

describe('scripts/assets/procedural/palettes — colour-blind variants (M2-02)', () => {
  const sprites = palettes.generate();
  const standard = [...bullets.generate(), ...lasers.generate()];

  it('draws every bullet, beam and bend again per palette, frame for frame', () => {
    const names = Object.keys(palettes.BULLET_PALETTES);
    expect(names).toEqual(['deuteranopia', 'protanopia', 'tritanopia']);
    expect(sprites).toHaveLength(names.length * standard.length);
    for (const palette of names) {
      for (const plain of standard) {
        const variant = byName(sprites, `${plain.name}@${palette}`);
        expect(variant.origin).toBe('procedural:palettes');
        expect(variant.frames).toHaveLength(plain.frames.length);
        variant.frames.forEach((frame, k) => {
          expect([frame.width, frame.height]).toEqual([
            plain.frames[k].width,
            plain.frames[k].height,
          ]);
          // The same silhouette: only colours (and the cores' marks) change.
          for (let y = 0; y < frame.height; y++) {
            for (let x = 0; x < frame.width; x++) {
              expect(opaque(frame, x, y)).toBe(opaque(plain.frames[k], x, y));
            }
          }
        });
      }
    }
  });

  it('keeps every palette’s colours away from the gold items and orange explosions', () => {
    for (const colours of Object.values(palettes.BULLET_PALETTES)) {
      for (const body of Object.values(colours)) {
        const rgba = color(body);
        const h = hue(rgba);
        // Near-white needs no hue; everything else stays out of 20°–70° (orange … gold).
        const grey = Math.max(...rgba.slice(0, 3)) - Math.min(...rgba.slice(0, 3)) < 40;
        expect(grey || h < 20 || h > 70, `${body} hue ${h}`).toBe(true);
      }
    }
  });

  it('shape-codes the cores: pink solid, red a dark centre (ring), purple one bright dot', () => {
    for (const palette of Object.keys(palettes.BULLET_PALETTES)) {
      for (const shape of ['round', 'oval', 'needle']) {
        const at = (colour: string): Image =>
          byName(sprites, `bullets/${shape}-${colour}@${palette}`).frames[0];
        const centre = (frame: Image): Rgba =>
          getPixel(frame, (frame.width - 1) / 2, (frame.height - 1) / 2);
        const brightest = (frame: Image): { value: number; count: number } => {
          let value = -1;
          let count = 0;
          eachOpaque(frame, (_x, _y, rgba) => {
            if (luma(rgba) > value) {
              value = luma(rgba);
              count = 0;
            }
            if (luma(rgba) === value) count++;
          });
          return { value, count };
        };
        const pink = at('pink');
        expect(luma(centre(pink))).toBe(brightest(pink).value);
        expect(brightest(pink).count, `${shape} pink`).toBeGreaterThan(1);
        const red = at('red');
        let darkest = Infinity;
        eachOpaque(red, (_x, _y, rgba) => {
          darkest = Math.min(darkest, luma(rgba));
        });
        expect(luma(centre(red)), `${shape} red`).toBe(darkest);
        const purple = at('purple');
        expect(luma(centre(purple))).toBe(brightest(purple).value);
        expect(brightest(purple).count, `${shape} purple`).toBe(1);
      }
    }
  });
});
