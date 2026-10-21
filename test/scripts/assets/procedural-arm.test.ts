/**
 * The Direct-mode Arm sprite (`scripts/assets/procedural/arm.mjs`, split out of `direct.mjs`
 * by plan R4-P.P1). Split out of `procedural.test.ts` by plan R4-P.P2. R4-01.A5 adds the
 * native v2 path — the art bible §5's 39×27 barrier, every radius ×1.5.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { imagesEqual } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import * as arm from '../../../scripts/assets/procedural/arm.mjs';
import { byName, eachOpaque, key } from './procedural-helpers.js';

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

  describe('the native v2 path (R4-01.A5)', () => {
    const v2 = arm.generate({ artScale: 1.5 });
    const shield2 = byName(v2, 'shields/arm');
    // The v1 tier colours, unchanged: ring and glow per tier (the palette scan stays honest).
    const TIERS = [
      ['#58f070', '#1c6a30'],
      ['#e8f0ff', '#5a6a88'],
      ['#ffd840', '#7a5a10'],
    ];

    it('draws nine native 39×27 tier × wear frames (bible §5)', () => {
      expect(v2.map((s) => s.name)).toEqual(['shields/arm']);
      expect(shield2.origin).toBe('procedural:arm');
      expect(shield2.native).toBe(true);
      expect(shield2.anchor).toBeNull();
      expect(shield2.frames).toHaveLength(9);
      for (const frame of shield2.frames) expect([frame.width, frame.height]).toEqual([39, 27]);
      expect(shield2.animations).toEqual({
        arm: [0, 1, 2],
        superArm: [3, 4, 5],
        hyperArm: [6, 7, 8],
      });
    });

    it('draws the v1 tier palette with binary alpha, and wears like the v1 barrier', () => {
      for (let tier = 0; tier < 3; tier++) {
        const colours = new Set<string>();
        for (const d of [0, 1, 2]) {
          eachOpaque(shield2.frames[tier * 3 + d], (_x, _y, rgba) => {
            expect(rgba[3]).toBe(255);
            colours.add(key(rgba));
          });
        }
        expect([...colours].sort(), `tier ${tier}`).toEqual(
          TIERS[tier].map((hex) => key(color(hex))).sort(),
        );
      }
      // The fresh ring fills the widest band; wear shrinks the ring of every tier (M2-05 rule).
      for (const start of [0, 3, 6]) {
        const counts = [0, 1, 2].map((d) => {
          let n = 0;
          eachOpaque(shield2.frames[start + d], () => void n++);
          return n;
        });
        expect(counts[1], `tier ${start / 3}`).toBeLessThan(counts[0]);
        expect(counts[2], `tier ${start / 3}`).toBeLessThan(counts[1]);
      }
      // A barrier, not a disc: the ship's spot at the centre stays clear.
      let centre = 0;
      eachOpaque(shield2.frames[0], (x, y) => {
        if (Math.abs(x - 19) <= 4 && Math.abs(y - 13) <= 4) centre++;
      });
      expect(centre).toBe(0);
    });

    it('leaves art scale 1 byte-identical to the unmarked call, native unmarked', () => {
      const one = arm.generate({ artScale: 1 });
      expect(one.map((s) => s.name)).toEqual(sprites.map((s) => s.name));
      one.forEach((sprite, k) => {
        expect(sprite.native, sprite.name).toBeUndefined();
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, sprites[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });

    it('is deterministic: two v2 runs draw the same pixels', () => {
      const again = arm.generate({ artScale: 1.5 });
      again.forEach((sprite, k) => {
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, v2[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });

    it('ships the nine frames core indexes at the default scale', () => {
      const two = buildAtlas({ artScale: 1.5 });
      expect(two.manifest.sprites['shields/arm'].frames).toHaveLength(9);
      expect([
        two.manifest.frames['shields/arm#0'].w,
        two.manifest.frames['shields/arm#0'].h,
      ]).toEqual([39, 27]);
      const one = buildAtlas({ artScale: 1 });
      expect(one.manifest.sprites['shields/arm'].frames).toHaveLength(9);
      expect([
        one.manifest.frames['shields/arm#0'].w,
        one.manifest.frames['shields/arm#0'].h,
      ]).toEqual([26, 18]);
    });
  });
});
