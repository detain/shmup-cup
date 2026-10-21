/**
 * The Direct-mode colour items (`scripts/assets/procedural/direct-items.mjs`, split out of
 * `direct.mjs` by plan R4-P.P1). Split out of `procedural.test.ts` by plan R4-P.P2.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as directItems from '../../../scripts/assets/procedural/direct-items.mjs';

describe('scripts/assets/procedural/direct-items', () => {
  const sprites = directItems.generate();

  it('generates the six colour items in the plan order (M2-05)', () => {
    expect(sprites.map((s) => s.name)).toEqual([
      'items/direct-red',
      'items/direct-green',
      'items/direct-blue',
      'items/direct-orange',
      'items/direct-yellow',
      'items/direct-octagon',
    ]);
  });

  it('draws every item as a 10×10 two-frame blink', () => {
    for (const sprite of sprites) {
      expect(sprite.origin).toBe('procedural:direct-items');
      expect(sprite.frames).toHaveLength(2);
      for (const frame of sprite.frames) expect([frame.width, frame.height]).toEqual([10, 10]);
      expect(sprite.animations).toEqual({ blink: [0, 1] });
    }
  });
});
