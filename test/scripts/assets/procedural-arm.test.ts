/**
 * The Direct-mode Arm sprite (`scripts/assets/procedural/arm.mjs`, split out of `direct.mjs`
 * by plan R4-P.P1). Split out of `procedural.test.ts` by plan R4-P.P2.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as arm from '../../../scripts/assets/procedural/arm.mjs';
import { byName } from './procedural-helpers.js';

describe('scripts/assets/procedural/arm', () => {
  const sprites = arm.generate();

  it('makes shields/arm the nine-frame tier ladder (M2-05)', () => {
    expect(sprites.map((s) => s.name)).toEqual(['shields/arm']);
    const shield = byName(sprites, 'shields/arm');
    expect(shield.origin).toBe('procedural:arm');
    expect(shield.frames).toHaveLength(9);
    for (const frame of shield.frames) expect([frame.width, frame.height]).toEqual([26, 18]);
    expect(shield.animations).toEqual({ arm: [0, 1, 2], superArm: [3, 4, 5], hyperArm: [6, 7, 8] });
  });

  it('wears the barrier through the three frames of every tier', () => {
    // Frames come in fresh / worn / critical triples; each wears row shrinks the ring's height.
    const shield = byName(sprites, 'shields/arm');
    for (const start of [0, 3, 6]) {
      const heights = [0, 1, 2].map((d) => {
        const frame = shield.frames[start + d];
        let rows = 0;
        for (let y = 0; y < frame.height; y++) {
          for (let x = 0; x < frame.width; x++) {
            if (frame.data[(y * frame.width + x) * 4 + 3] > 0) {
              rows++;
              break;
            }
          }
        }
        return rows;
      });
      expect(heights[1], `tier ${start / 3}`).toBeLessThanOrEqual(heights[0]);
      expect(heights[2], `tier ${start / 3}`).toBeLessThan(heights[0]);
    }
  });
});
