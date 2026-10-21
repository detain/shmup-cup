/**
 * The item capsules (`scripts/assets/procedural/items.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as items from '../../../scripts/assets/procedural/items.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { opaque, eachOpaque, onEdge, hue } from './procedural-helpers.js';

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
});
