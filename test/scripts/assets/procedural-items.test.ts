/**
 * The item capsules (`scripts/assets/procedural/items.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2. R4-02.B2 adds the native v2 path of the four pills
 * (the art bible §5's 18×12, four glint frames — the point item is `R4-02.B3`'s).
 * @module
 */
import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, ItemKind } from '@shmup/core';
import { getPixel, imagesEqual } from '../../../scripts/assets/image.mjs';
import * as items from '../../../scripts/assets/procedural/items.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { opaque, eachOpaque, onEdge, hue, key } from './procedural-helpers.js';

describe('scripts/assets/procedural/items', () => {
  const [capsule, point, blue, bonus, oneUp] = items.generate();

  it('draws the bonus stages` gold bonus capsule and green 1UP in the capsule`s shape (M2-10)', () => {
    expect([bonus.name, oneUp.name]).toEqual(['items/capsule-bonus', 'items/1up']);
    for (const sprite of [bonus, oneUp]) {
      expect(sprite.animations).toEqual({ blink: [0, 1] });
      expect(sprite.frames).toHaveLength(2);
      for (let f = 0; f < 2; f++) {
        const a = sprite.frames[f];
        const b = capsule.frames[f];
        expect([a.width, a.height]).toEqual([b.width, b.height]);
        for (let y = 0; y < a.height; y++) {
          for (let x = 0; x < a.width; x++) expect(opaque(a, x, y)).toBe(opaque(b, x, y));
        }
      }
    }
    const gold = hue(getPixel(bonus.frames[0], 3, 5));
    expect(gold > 30 && gold < 60, `hue ${gold}`).toBe(true);
    const green = hue(getPixel(oneUp.frames[0], 2, 5));
    expect(green > 90 && green < 150, `hue ${green}`).toBe(true);
    // The 1UP's white plus in the middle.
    expect(getPixel(oneUp.frames[0], 6, 4)).toEqual([255, 255, 255, 255]);
    expect(getPixel(oneUp.frames[0], 4, 4)).toEqual([255, 255, 255, 255]);
  });

  it('draws the blue capsule as the capsule`s shape in blue (M2-04)', () => {
    expect(blue.name).toBe('items/capsule-blue');
    expect(blue.animations).toEqual({ blink: [0, 1] });
    expect(blue.frames).toHaveLength(2);
    for (let f = 0; f < 2; f++) {
      const a = blue.frames[f];
      const b = capsule.frames[f];
      expect([a.width, a.height]).toEqual([b.width, b.height]);
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) expect(opaque(a, x, y)).toBe(opaque(b, x, y));
      }
    }
    const h = hue(getPixel(blue.frames[0], 6, 5));
    expect(h > 190 && h < 250, `hue ${h}`).toBe(true);
  });

  it('draws the 5×5 two-frame gold point item diamond of cancelled bullets (M2-02)', () => {
    expect(point.name).toBe('items/point');
    expect(point.animations).toEqual({ twinkle: [0, 1] });
    expect(point.frames).toHaveLength(2);
    for (const frame of point.frames) {
      expect([frame.width, frame.height]).toEqual([5, 5]);
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(opaque(frame, x, y), `${x},${y}`).toBe(Math.abs(x - 2) + Math.abs(y - 2) <= 2);
        }
      }
      expect(getPixel(frame, 2, 2)).toEqual(color('#ffffff'));
    }
    // Gold, like the other items (never a bullet colour).
    const h = hue(getPixel(point.frames[0], 2, 1));
    expect(h > 30 && h < 60, `hue ${h}`).toBe(true);
    expect(getPixel(point.frames[1], 2, 0)).toEqual(color('#ffffff')); // the twinkle's tips
    expect(getPixel(point.frames[0], 2, 0)).not.toEqual(color('#ffffff'));
  });

  it('draws a 12×8 two-frame blinking capsule with a mirror-symmetric outline', () => {
    expect(capsule.name).toBe('items/capsule');
    expect(capsule.animations).toEqual({ blink: [0, 1] });
    expect(capsule.frames).toHaveLength(2);
    expect(Buffer.from(capsule.frames[0].data)).not.toEqual(Buffer.from(capsule.frames[1].data));
    for (const frame of capsule.frames) {
      expect([frame.width, frame.height]).toEqual([12, 8]);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 12; x++) {
          expect(opaque(frame, x, y)).toBe(opaque(frame, 11 - x, y));
          expect(opaque(frame, x, y)).toBe(opaque(frame, x, 7 - y));
        }
      }
    }
  });

  it('outlines both frames with the dark rim and keeps the silhouette identical', () => {
    const rim = color('#5a1408');
    for (const frame of capsule.frames) {
      eachOpaque(frame, (x, y, rgba) => {
        if (onEdge(frame, x, y)) expect(rgba).toEqual(rim);
      });
    }
    const [a, b] = capsule.frames;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 12; x++) expect(opaque(a, x, y)).toBe(opaque(b, x, y));
    }
  });

  describe('the native v2 path (R4-02.B2)', () => {
    const v2 = items.generate({ artScale: 1.5 });
    const [capsule2, point2, blue2, bonus2, oneUp2] = v2;
    const WHITE = color('#ffffff');

    /** v1's capsule tints (`items.mjs` `CAPSULE_COLORS`) — the v2 path may use nothing else. */
    const TINTS = {
      red: { rim: '#5a1408', body: ['#e04a18', '#ff7a30'], band: ['#f89850', '#ffd080'] },
      blue: { rim: '#08164a', body: ['#2458d8', '#4c8cff'], band: ['#78b0ff', '#e0f0ff'] },
      gold: { rim: '#5a3a04', body: ['#d8a018', '#ffd040'], band: ['#f8d878', '#fff4c0'] },
      green: { rim: '#0a3a10', body: ['#28a838', '#50e060'], band: ['#90f098', '#e0ffe0'] },
    } as const;

    /**
     * The v2 glint cycle of one pill: frames are dim, dim + spark, lit + spark, lit plain
     * (`items.mjs` `V2_STAGES`); the spark is the 3×2 white block at columns 5–7, rows 3–4.
     *
     * @param sprite - The generated sprite.
     * @param tint - Its colour set.
     */
    const expectCycle = (sprite: (typeof v2)[number], tint: keyof typeof TINTS): void => {
      const colors = TINTS[tint];
      expect(sprite.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([18, 12]));
      expect(sprite.animations).toEqual({ blink: [0, 1, 2, 3] });
      expect(sprite.native).toBe(true);
      expect(sprite.anchor).toBeNull();
      const lit = (stage: number): number => (stage >= 2 ? 1 : 0);
      const sparked = (stage: number): boolean => stage === 1 || stage === 2;
      // The spark block and its neighbours, the body, the band away from the spark, the rim.
      for (let stage = 0; stage < 4; stage++) {
        const frame = sprite.frames[stage];
        for (const x of [5, 6, 7]) {
          for (const y of [3, 4]) {
            expect(getPixel(frame, x, y), `f${stage} spark ${x},${y}`).toEqual(
              sparked(stage) ? WHITE : color(colors.band[lit(stage)]),
            );
          }
        }
        expect(getPixel(frame, 3, 6), `f${stage} body`).toEqual(color(colors.body[lit(stage)]));
        expect(getPixel(frame, 13, 3), `f${stage} band`).toEqual(color(colors.band[lit(stage)]));
        eachOpaque(frame, (x, y, rgba) => {
          if (onEdge(frame, x, y)) expect(rgba, `f${stage} rim`).toEqual(color(colors.rim));
        });
        // v1's colours only (the cycle-ramp scan stays honest).
        const allowed = new Set<string>(
          [colors.rim, colors.body[0], colors.body[1], colors.band[0], colors.band[1]].map((hex) =>
            key(color(hex)),
          ),
        );
        allowed.add(key(WHITE));
        eachOpaque(frame, (_x, _y, rgba) => expect(allowed, key(rgba)).toContain(key(rgba)));
        for (let y = 0; y < 12; y++) {
          for (let x = 0; x < 18; x++)
            expect(opaque(frame, x, y), `f${stage} silhouette`).toBe(
              opaque(sprite.frames[0], x, y),
            );
        }
      }
    };

    it('draws the four pills native at 18×12 over the glint cycle (bible §5)', () => {
      expect([capsule2.name, blue2.name, bonus2.name, oneUp2.name]).toEqual([
        'items/capsule',
        'items/capsule-blue',
        'items/capsule-bonus',
        'items/1up',
      ]);
      expectCycle(capsule2, 'red');
      expectCycle(blue2, 'blue');
      expectCycle(bonus2, 'gold');
      expectCycle(oneUp2, 'green');
    });

    it('pins every drawn pill kind to its ITEM_KINDS frame count (four)', () => {
      for (const [kind, sprite] of [
        [ItemKind.Capsule, capsule2],
        [ItemKind.BlueCapsule, blue2],
        [ItemKind.BonusCapsule, bonus2],
        [ItemKind.OneUp, oneUp2],
      ] as const) {
        const spec = ITEM_KINDS[kind];
        expect(spec.sprite, sprite.name).toBe(sprite.name);
        expect(spec.frames, sprite.name).toBe(4);
        expect(sprite.frames).toHaveLength(spec.frames);
      }
      // The stolen Option item kind shares the count — R4-01.A3 ships its four-frame art.
      expect(ITEM_KINDS[ItemKind.FreeOption]).toMatchObject({
        sprite: 'options/stolen',
        frames: 4,
      });
    });

    it('draws the 1UP plus as the v1 bar ×1.5 in white on every frame', () => {
      for (const [stage, frame] of oneUp2.frames.entries()) {
        for (let x = 6; x <= 12; x++) {
          expect(getPixel(frame, x, 6)).toEqual(WHITE);
          expect(getPixel(frame, x, 7)).toEqual(WHITE);
        }
        for (let y = 3; y <= 8; y++) {
          expect(getPixel(frame, 9, y)).toEqual(WHITE);
          expect(getPixel(frame, 10, y)).toEqual(WHITE);
        }
        // The plus is the v1 one ×1.5: the body beside it dims on frames 0–1, lights on 2–3.
        expect(getPixel(frame, 3, 8)).toEqual(color(stage >= 2 ? '#50e060' : '#28a838'));
      }
    });

    it('leaves the point item to R4-02.B3: v1 size and frames even on the v2 path', () => {
      expect(point2.name).toBe('items/point');
      expect(point2.native).toBeUndefined();
      expect(point2.frames.map((f) => [f.width, f.height])).toEqual(Array(2).fill([5, 5]));
      expect(point2.animations).toEqual({ twinkle: [0, 1] });
      const [, point1] = items.generate();
      point2.frames.forEach((frame, f) => {
        expect(imagesEqual(frame, point1.frames[f])).toBe(true);
      });
    });

    it('leaves art scale 1 byte-identical to the unmarked call, native unmarked', () => {
      const one = items.generate({ artScale: 1 });
      const v1 = items.generate();
      expect(one.map((s) => s.name)).toEqual(v1.map((s) => s.name));
      one.forEach((sprite, k) => {
        expect(sprite.native, sprite.name).toBeUndefined();
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, v1[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });

    it('is deterministic: two v2 runs draw the same pixels', () => {
      const again = items.generate({ artScale: 1.5 });
      again.forEach((sprite, k) => {
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, v2[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });
  });
});
