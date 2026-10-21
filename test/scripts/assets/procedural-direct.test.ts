/**
 * The Direct-mode shot sprites (`scripts/assets/procedural/direct.mjs`; the colour items
 * and the Arm moved to `direct-items.mjs` and `arm.mjs` in plan R4-P.P1). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as direct from '../../../scripts/assets/procedural/direct.mjs';
import { byName } from './procedural-helpers.js';

describe('scripts/assets/procedural/direct', () => {
  const sprites = direct.generate();

  it('generates the eight Direct-mode shot sprites', () => {
    expect(sprites.map((s) => s.name)).toEqual([
      'shots/direct-missile',
      'shots/disc',
      'shots/beam',
      'shots/wave',
      'shots/sub-bomb',
      'shots/sub-laser',
      'shots/sub-laser-wide',
      'shots/sub-disc',
    ]);
  });

  it('draws the shots at their sizes and frame counts (M2-05)', () => {
    const expected: Record<string, readonly [string, number]> = {
      'shots/direct-missile': ['12×6', 2],
      'shots/disc': ['20×20', 4],
      'shots/beam': ['26×8', 4],
      'shots/wave': ['16×34', 4],
      'shots/sub-bomb': ['6×6', 1],
      'shots/sub-laser': ['9×9', 8],
      'shots/sub-laser-wide': ['11×11', 8],
      'shots/sub-disc': ['12×12', 2],
    };
    for (const [name, [size, frames]] of Object.entries(expected)) {
      const sprite = byName(sprites, name);
      const [first] = sprite.frames;
      expect(`${first.width}×${first.height}`, name).toBe(size);
      expect(sprite.frames.length, name).toBe(frames);
    }
  });

  it('tags every shot with the direct generator (R4-P.P1)', () => {
    for (const sprite of sprites) expect(sprite.origin).toBe('procedural:direct');
  });
});
