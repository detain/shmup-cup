/**
 * The seamless starfield tiles (`scripts/assets/procedural/starfield.mjs`). Split out
 * of `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as starfield from '../../../scripts/assets/procedural/starfield.mjs';
import { byName, opaque, key, eachOpaque, opaqueCount, luma } from './procedural-helpers.js';

describe('scripts/assets/procedural/starfield', () => {
  const sprites = starfield.generate();

  it('draws three 128×128 top-left-anchored layers, far the densest and dimmest', () => {
    expect(sprites.map((s) => s.name)).toEqual(['bg/stars-far', 'bg/stars-mid', 'bg/stars-near']);
    const averages = sprites.map((sprite) => {
      expect(sprite.anchor).toEqual([0, 0]);
      expect(sprite.frames).toHaveLength(1);
      const [frame] = sprite.frames;
      expect([frame.width, frame.height]).toEqual([
        starfield.STAR_TILE_SIZE,
        starfield.STAR_TILE_SIZE,
      ]);
      let total = 0;
      eachOpaque(frame, (_x, _y, rgba) => {
        total += luma(rgba);
      });
      return total / opaqueCount(frame);
    });
    expect(averages[0]).toBeLessThan(averages[1]);
    expect(averages[1]).toBeLessThan(averages[2]);
    const [far, mid] = sprites.map((s) => opaqueCount(s.frames[0]));
    expect(far).toBeGreaterThan(mid);
  });

  it('keeps a 2-px empty margin so the tiles repeat seamlessly (nothing wraps)', () => {
    for (const sprite of sprites) {
      const [frame] = sprite.frames;
      eachOpaque(frame, (x, y) => {
        expect(x, sprite.name).toBeGreaterThanOrEqual(2);
        expect(y, sprite.name).toBeGreaterThanOrEqual(2);
        expect(x, sprite.name).toBeLessThanOrEqual(frame.width - 3);
        expect(y, sprite.name).toBeLessThanOrEqual(frame.height - 3);
      });
    }
  });

  it('draws near stars as crosses (white core, four arms) and never on a black ground', () => {
    const [near] = byName(sprites, 'bg/stars-near').frames;
    let cores = 0;
    eachOpaque(near, (x, y, rgba) => {
      if (key(rgba) !== '255,255,255,255') return;
      cores++;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        expect(opaque(near, x + dx, y + dy)).toBe(true);
      }
    });
    expect(cores).toBeGreaterThan(5);
    for (const sprite of sprites) {
      eachOpaque(sprite.frames[0], (_x, _y, rgba) => {
        expect(luma(rgba)).toBeGreaterThan(40);
      });
    }
  });
});
