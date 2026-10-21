/**
 * The Direct-mode colour items (`scripts/assets/procedural/direct-items.mjs`, split out of
 * `direct.mjs` by plan R4-P.P1). Split out of `procedural.test.ts` by plan R4-P.P2. R4-02.B2
 * adds the native v2 path: the art bible §5's 15×15 plates, four glint frames each.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { DIRECT_ITEM_KINDS, DIRECT_ITEMS, ITEM_KINDS } from '@shmup/core';
import { getPixel, imagesEqual } from '../../../scripts/assets/image.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import * as directItems from '../../../scripts/assets/procedural/direct-items.mjs';
import { eachOpaque, key, onEdge, opaque } from './procedural-helpers.js';

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

  describe('the native v2 path (R4-02.B2)', () => {
    const v2 = directItems.generate({ artScale: 1.5 });
    const WHITE = color('#ffffff');

    /** v1's triples (`direct-items.mjs` `ITEM_COLORS`) — the v2 path may use nothing else. */
    const TRIPLES = {
      red: ['#5a0c0c', '#e02828', '#ff9090'],
      green: ['#0c4014', '#28c040', '#98ff98'],
      blue: ['#0c1a5a', '#2860e8', '#90b8ff'],
      orange: ['#5a2c08', '#f08020', '#ffd090'],
      yellow: ['#5a4808', '#f0d020', '#fff8a0'],
      octagon: ['#5a0c0c', '#d82020', '#ffb0b0'],
    } as const;

    it('draws the six items native at 15×15 over the glint cycle (bible §5)', () => {
      expect(v2.map((s) => s.name)).toEqual(sprites.map((s) => s.name));
      for (const sprite of v2) {
        const name = sprite.name.slice('items/direct-'.length);
        const [dark, body, light] = TRIPLES[name as keyof typeof TRIPLES];
        const octagon = name === 'octagon';
        expect(
          sprite.frames.map((f) => [f.width, f.height]),
          sprite.name,
        ).toEqual(Array(4).fill([15, 15]));
        expect(sprite.animations, sprite.name).toEqual({ blink: [0, 1, 2, 3] });
        expect(sprite.native, sprite.name).toBe(true);
        expect(sprite.anchor, sprite.name).toBeNull();
        for (let stage = 0; stage < 4; stage++) {
          const frame = sprite.frames[stage];
          const lit = stage >= 2;
          const sparked = stage === 1 || stage === 2;
          // The body under the highlight swaps dark → light with the glint's middle frames.
          expect(getPixel(frame, 3, 8), `${sprite.name} f${stage} body`).toEqual(
            color(lit ? light : body),
          );
          // The rim: every outline pixel dark; v1's colours only.
          const allowed = new Set([dark, body, light].map((hex) => key(color(hex))));
          allowed.add(key(WHITE));
          eachOpaque(frame, (x, y, rgba) => {
            if (onEdge(frame, x, y))
              expect(rgba, `${sprite.name} f${stage} rim`).toEqual(color(dark));
            expect(allowed, key(rgba)).toContain(key(rgba));
          });
          if (octagon) {
            // The 3×6 white mark; the spark catches the column to its left (on the body).
            for (let x = 5; x <= 10; x++) {
              for (let y = 6; y <= 8; y++)
                expect(getPixel(frame, x, y), `${sprite.name} f${stage} mark`).toEqual(WHITE);
            }
            for (let y = 6; y <= 8; y++)
              expect(getPixel(frame, 4, y), `${sprite.name} f${stage} spark`).toEqual(
                sparked ? WHITE : color(lit ? light : body),
              );
          } else {
            // The v1 highlight ×1.5 at (5,5), always; the spark widens it to columns 6–7.
            expect(getPixel(frame, 5, 5), `${sprite.name} f${stage} hl`).toEqual(WHITE);
            for (const x of [6, 7])
              expect(getPixel(frame, x, 5), `${sprite.name} f${stage} spark`).toEqual(
                sparked ? WHITE : color(lit ? light : body),
              );
          }
          // One silhouette for the whole cycle.
          for (let y = 0; y < 15; y++) {
            for (let x = 0; x < 15; x++)
              expect(opaque(frame, x, y), `${sprite.name} f${stage}`).toBe(
                opaque(sprite.frames[0], x, y),
              );
          }
        }
        expect(sprite.frames[0], `${sprite.name} differs across the cycle`).not.toEqual(
          sprite.frames[2],
        );
      }
    });

    it('pins every colour-item kind to its ITEM_KINDS frame count (four)', () => {
      DIRECT_ITEMS.forEach((item: string, i: number) => {
        const spec = ITEM_KINDS[DIRECT_ITEM_KINDS[i]];
        expect(spec.sprite).toBe('items/direct-' + item);
        expect(spec.frames).toBe(4);
        const sprite = v2.find((s) => s.name === spec.sprite);
        expect(sprite, spec.sprite).toBeDefined();
        expect(sprite.frames).toHaveLength(spec.frames);
      });
    });

    it('leaves art scale 1 byte-identical to the unmarked call, native unmarked', () => {
      const one = directItems.generate({ artScale: 1 });
      one.forEach((sprite, k) => {
        expect(sprite.native, sprite.name).toBeUndefined();
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, sprites[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });

    it('is deterministic: two v2 runs draw the same pixels', () => {
      const again = directItems.generate({ artScale: 1.5 });
      again.forEach((sprite, k) => {
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, v2[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });
  });
});
