/**
 * The black-hole vortex sprite (`scripts/assets/procedural/blackhole.mjs`, split out of
 * `particles.mjs` by plan R4-P.P1). Split out of `procedural.test.ts` by plan R4-P.P2.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as blackhole from '../../../scripts/assets/procedural/blackhole.mjs';
import { byName } from './procedural-helpers.js';

describe('scripts/assets/procedural/blackhole', () => {
  const sprites = blackhole.generate();
  const hole = byName(sprites, 'fx/black-hole');

  it('makes fx/black-hole the four-frame vortex and burst (M3-02)', () => {
    expect(sprites.map((s) => s.name)).toEqual(['fx/black-hole']);
    expect(hole.origin).toBe('procedural:blackhole');
    expect(hole.frames).toHaveLength(4);
    for (const frame of hole.frames) expect([frame.width, frame.height]).toEqual([32, 32]);
    expect(hole.animations).toEqual({ swirl: [0, 1, 2], burst: [3] });
  });

  it('keeps the dark core opaque in every frame and the corners transparent', () => {
    for (const frame of hole.frames)
      expect(frame.data[(16 * frame.width + 16) * 4 + 3], 'core').toBeGreaterThan(0);
    const [first, last] = hole.frames;
    expect(first.data[3], 'corner').toBe(0);
    expect(last.data[(31 * last.width + 31) * 4 + 3], 'corner').toBe(0);
  });
});
