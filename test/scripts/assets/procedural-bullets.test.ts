/**
 * The bullet generator shapes (`scripts/assets/procedural/bullets.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, type Rgba } from '../../../scripts/assets/image.mjs';
import * as bullets from '../../../scripts/assets/procedural/bullets.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { key, eachOpaque, onEdge, luma, hue, rotateCw } from './procedural-helpers.js';

describe('scripts/assets/procedural/bullets', () => {
  const sprites = bullets.generate();

  it('draws round (7×7, 1 frame), oval (9×9) and needle (11×11, 8 directions) in each colour', () => {
    expect(sprites.map((s) => s.name).sort()).toEqual(
      ['round', 'oval', 'needle']
        .flatMap((shape) => Object.keys(bullets.BULLET_COLORS).map((c) => `bullets/${shape}-${c}`))
        .sort(),
    );
    for (const sprite of sprites) {
      const size = sprite.name.includes('round') ? 7 : sprite.name.includes('oval') ? 9 : 11;
      expect(sprite.frames).toHaveLength(sprite.name.includes('round') ? 1 : 8);
      for (const frame of sprite.frames) expect([frame.width, frame.height]).toEqual([size, size]);
      expect(sprite.anchor).toBeNull(); // centred by the pipeline
    }
  });

  it('uses exactly three bands per colour: dark rim < saturated body < bright core', () => {
    for (const sprite of sprites) {
      const colours = new Map<string, readonly number[]>();
      for (const frame of sprite.frames) {
        eachOpaque(frame, (_x, _y, rgba) => {
          expect(rgba[3], sprite.name).toBe(255);
          colours.set(key(rgba), rgba);
        });
      }
      const bands = [...colours.values()].sort((a, b) => luma(a) - luma(b));
      expect(bands, sprite.name).toHaveLength(3);
      const colourName = sprite.name.slice(sprite.name.lastIndexOf('-') + 1);
      const body = color(bullets.BULLET_COLORS[colourName as keyof typeof bullets.BULLET_COLORS]);
      expect(bands[1]).toEqual(body);
      expect(luma(bands[0])).toBeLessThan(luma(body) / 2); // high contrast rim
      expect(luma(bands[2])).toBeGreaterThan(luma(body));
    }
  });

  it('outlines every frame with the dark rim (regression: thin shapes exposed the body)', () => {
    for (const sprite of sprites) {
      sprite.frames.forEach((frame, k) => {
        let darkest: Rgba | null = null;
        eachOpaque(frame, (_x, _y, rgba) => {
          if (darkest === null || luma(rgba) < luma(darkest)) darkest = rgba;
        });
        eachOpaque(frame, (x, y, rgba) => {
          if (onEdge(frame, x, y)) {
            expect(key(rgba), `${sprite.name}#${k} edge pixel ${x},${y}`).toBe(key(darkest ?? []));
          }
        });
      });
    }
  });

  it('keeps a bright core inside every frame', () => {
    for (const sprite of sprites) {
      sprite.frames.forEach((frame, k) => {
        let brightest = -1;
        eachOpaque(frame, (_x, _y, rgba) => {
          brightest = Math.max(brightest, luma(rgba));
        });
        let cores = 0;
        eachOpaque(frame, (x, y, rgba) => {
          if (luma(rgba) === brightest) {
            cores++;
            expect(onEdge(frame, x, y), `${sprite.name}#${k} core on the edge`).toBe(false);
          }
        });
        expect(cores, `${sprite.name}#${k}`).toBeGreaterThan(0);
      });
    }
  });

  it('stays pink / red / purple — never the gold of items or the orange of explosions', () => {
    for (const body of Object.values(bullets.BULLET_COLORS)) {
      const h = hue(color(body));
      expect(h < 20 || h > 250, `${body} hue ${h}`).toBe(true);
    }
  });

  it('is centred and point-symmetric in every frame', () => {
    for (const sprite of sprites) {
      for (const frame of sprite.frames) {
        const n = frame.width;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            expect(getPixel(frame, x, y)).toEqual(getPixel(frame, n - 1 - x, n - 1 - y));
          }
        }
      }
    }
  });

  it('makes directional frame k + 4 the exact 90° rotation of frame k', () => {
    for (const sprite of sprites.filter((s) => s.frames.length === 8)) {
      for (let k = 0; k < 4; k++) {
        expect(Buffer.from(sprite.frames[k + 4].data), `${sprite.name} ${k}`).toEqual(
          Buffer.from(rotateCw(sprite.frames[k])),
        );
      }
    }
  });

  it('documents a frame formula that picks the nearest heading: ((a + 32) >> 6) & 7', () => {
    // Binary angles: 1024 units per turn; frame k points k·64 units; shapes are symmetric
    // under a half turn, so headings repeat every 512 units.
    for (let a = 0; a < 1024; a++) {
      const frame = ((a + 32) >> 6) & 7;
      const heading = frame * 64;
      let diff = Math.abs((a % 512) - heading);
      diff = Math.min(diff, 512 - diff);
      expect(diff, `angle ${a}`).toBeLessThanOrEqual(32);
    }
  });
});
