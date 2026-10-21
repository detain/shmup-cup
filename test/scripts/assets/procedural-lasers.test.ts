/**
 * The laser beams and the bending laser segments (`scripts/assets/procedural/lasers.mjs`).
 * Split out of `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, type Rgba } from '../../../scripts/assets/image.mjs';
import * as bullets from '../../../scripts/assets/procedural/bullets.mjs';
import * as lasers from '../../../scripts/assets/procedural/lasers.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { luma } from './procedural-helpers.js';

describe('scripts/assets/procedural/lasers', () => {
  // The beams (the bending laser segments of M2-02 have their own block below).
  const sprites = lasers.generate().filter((s) => s.name.includes('/beam-'));

  it('draws one beam per bullet colour: 8 frames of 4×8, frame k a band k + 1 px tall', () => {
    expect(sprites.map((s) => s.name).sort()).toEqual(
      Object.keys(bullets.BULLET_COLORS)
        .map((c) => `lasers/beam-${c}`)
        .sort(),
    );
    for (const sprite of sprites) {
      expect(sprite.frames).toHaveLength(lasers.BEAM_HEIGHT);
      sprite.frames.forEach((frame, k) => {
        expect([frame.width, frame.height]).toEqual([lasers.BEAM_WIDTH, lasers.BEAM_HEIGHT]);
        let rows = 0;
        for (let y = 0; y < frame.height; y++) if (getPixel(frame, 0, y)[3] === 255) rows++;
        expect(rows, `${sprite.name}#${k}`).toBe(k + 1);
      });
    }
  });

  it('repeats every column (stretchable), centres the band and keeps it symmetric', () => {
    for (const sprite of sprites) {
      sprite.frames.forEach((frame, k) => {
        const top = Math.floor((lasers.BEAM_HEIGHT - (k + 1)) / 2);
        for (let y = 0; y < frame.height; y++) {
          for (let x = 1; x < frame.width; x++) {
            expect(getPixel(frame, x, y)).toEqual(getPixel(frame, 0, y));
          }
          const inBand = y >= top && y <= top + k;
          expect(getPixel(frame, 0, y)[3], `${sprite.name}#${k} row ${y}`).toBe(inBand ? 255 : 0);
          if (inBand) {
            expect(getPixel(frame, 0, y)).toEqual(getPixel(frame, 0, 2 * top + k - y));
          }
        }
      });
    }
  });

  it('bands rim < body < core (rim from 3 px, body from 5 px)', () => {
    const palette: { rim: Rgba; body: Rgba; core: Rgba } = {
      rim: [1, 0, 0, 255],
      body: [2, 0, 0, 255],
      core: [3, 0, 0, 255],
    };
    const names = (h: number): number[] => lasers.bandRows(h, palette).map((c) => c[0]);
    expect([1, 2, 3, 4, 5, 8].map(names)).toEqual([
      [3],
      [3, 3],
      [1, 3, 1],
      [1, 3, 3, 1],
      [1, 2, 3, 2, 1],
      [1, 2, 3, 3, 3, 3, 2, 1],
    ]);
    for (const sprite of sprites) {
      const frame = sprite.frames[lasers.BEAM_HEIGHT - 1];
      const colourName = sprite.name.slice(sprite.name.lastIndexOf('-') + 1);
      const body = color(bullets.BULLET_COLORS[colourName as keyof typeof bullets.BULLET_COLORS]);
      expect(getPixel(frame, 0, 1)).toEqual(body);
      expect(luma(getPixel(frame, 0, 0))).toBeLessThan(luma(body) / 2);
      expect(luma(getPixel(frame, 0, 3))).toBeGreaterThan(luma(body));
    }
  });
});

describe('scripts/assets/procedural/lasers — bending laser segments (M2-02)', () => {
  const bends = lasers.generate().filter((s) => s.name.includes('/bend-'));

  it('draws one centred 7×7 round segment per bullet colour: rim < body < core', () => {
    expect(bends.map((s) => s.name).sort()).toEqual(
      Object.keys(bullets.BULLET_COLORS)
        .map((c) => `lasers/bend-${c}`)
        .sort(),
    );
    for (const sprite of bends) {
      expect(sprite.frames).toHaveLength(1);
      const frame = sprite.frames[0];
      expect([frame.width, frame.height]).toEqual([lasers.BEND_SIZE, lasers.BEND_SIZE]);
      const colourName = sprite.name.slice(sprite.name.lastIndexOf('-') + 1);
      const body = color(bullets.BULLET_COLORS[colourName as keyof typeof bullets.BULLET_COLORS]);
      expect(getPixel(frame, 3, 1)).toEqual(body);
      expect(luma(getPixel(frame, 3, 0))).toBeLessThan(luma(body) / 2);
      expect(luma(getPixel(frame, 3, 3))).toBeGreaterThan(luma(body));
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          expect(getPixel(frame, x, y)).toEqual(getPixel(frame, 6 - x, 6 - y));
          expect(getPixel(frame, x, y)).toEqual(getPixel(frame, y, x));
        }
      }
    }
  });
});
