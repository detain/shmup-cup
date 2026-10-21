/**
 * The HUD sprites (`scripts/assets/procedural/hud.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { METER_LABEL_FRAMES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as hud from '../../../scripts/assets/procedural/hud.mjs';
import { byName, opaque, key, eachOpaque, opaqueCount } from './procedural-helpers.js';

describe('scripts/assets/procedural/hud', () => {
  const sprites = hud.generate();

  it('draws three 40×8 meter-slot states with rounded corners, anchored top-left', () => {
    const slot = byName(sprites, 'hud/meter-slot');
    expect(slot.anchor).toEqual([0, 0]);
    expect(slot.animations).toEqual({ normal: [0], highlighted: [1], disabled: [2] });
    expect(slot.frames).toHaveLength(3);
    const borders = new Set<string>();
    for (const frame of slot.frames) {
      expect([frame.width, frame.height]).toEqual([40, 8]);
      for (const [x, y] of [
        [0, 0],
        [39, 0],
        [0, 7],
        [39, 7],
      ]) {
        expect(opaque(frame, x, y)).toBe(false);
      }
      expect(opaqueCount(frame)).toBe(40 * 8 - 4);
      borders.add(key(getPixel(frame, 1, 0)));
      expect(getPixel(frame, 1, 0)).not.toEqual(getPixel(frame, 1, 1)); // border ≠ fill
    }
    expect(borders.size).toBe(3);
  });

  it('draws the meter labels in white, centred and all different (slots, then Types B–D, then Extra Edit)', () => {
    const labels = byName(sprites, 'hud/meter-labels');
    // The seven slot labels, then the Types B–D weapon names (M2-03) — the engine's frame table.
    expect(hud.METER_LABELS.slice(0, 7)).toEqual([
      'SPEED',
      'MISSILE',
      'DOUBLE',
      'LASER',
      'OPTION',
      '?',
      '!',
    ]);
    expect([...hud.METER_LABELS]).toEqual([...METER_LABEL_FRAMES]);
    const n = hud.METER_LABELS.length;
    expect(n).toBe(23); // + the seven Extra Edit weapons (M3-01)
    expect(labels.frames).toHaveLength(n);
    expect(new Set(labels.frames.map((f) => Buffer.from(f.data).toString('hex'))).size).toBe(n);
    labels.frames.forEach((frame, i) => {
      expect([frame.width, frame.height]).toEqual([36, 5]);
      let minX = frame.width;
      let maxX = -1;
      eachOpaque(frame, (x, _y, rgba) => {
        expect(rgba).toEqual([255, 255, 255, 255]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      });
      const text = hud.METER_LABELS[i];
      const inkWidth = text.length * 4 - 1;
      expect(maxX - minX + 1, text).toBeLessThanOrEqual(inkWidth);
      const pen = Math.floor((36 - inkWidth) / 2);
      expect(minX).toBeGreaterThanOrEqual(pen);
      expect(maxX).toBeLessThan(pen + inkWidth);
      // Centred: the empty margins differ by at most one pixel (plus glyph side bearings).
      expect(Math.abs(pen - (36 - pen - inkWidth))).toBeLessThanOrEqual(1);
    });
  });
});
