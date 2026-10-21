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

describe('scripts/assets/procedural/hud — the v2 art (R4-03.C5)', () => {
  const sprites = hud.generate({ artScale: 3 / 2 });

  it('draws three 60×12 native meter slots filling the 12-px bar with a bevel', () => {
    const slot = byName(sprites, 'hud/meter-slot');
    expect(slot.native).toBe(true);
    expect(slot.anchor).toEqual([0, 0]);
    expect(slot.animations).toEqual({ normal: [0], highlighted: [1], disabled: [2] });
    expect(slot.frames).toHaveLength(3);
    const borders = new Set<string>();
    for (const frame of slot.frames) {
      expect([frame.width, frame.height]).toEqual([60, 12]);
      for (const [x, y] of [
        [0, 0],
        [59, 0],
        [0, 11],
        [59, 11],
      ]) {
        expect(opaque(frame, x, y)).toBe(false);
      }
      expect(opaqueCount(frame)).toBe(60 * 12 - 4);
      // The ring, the lit top/left edge, the shaded bottom/right edge and the fill: four
      // different pixels walking in from the left middle row and the top border.
      const ring = key(getPixel(frame, 0, 5));
      const light = key(getPixel(frame, 30, 1));
      const fill = key(getPixel(frame, 30, 5));
      const shade = key(getPixel(frame, 58, 5));
      const bottom = key(getPixel(frame, 30, 10));
      expect(new Set([ring, light, fill, shade, bottom]).size).toBe(4); // ring = bottom border
      expect(ring).toBe(key(getPixel(frame, 30, 11)));
      expect(light).toBe(key(getPixel(frame, 1, 5)));
      expect(bottom).not.toBe(fill);
      borders.add(key(getPixel(frame, 1, 0)));
    }
    expect(borders.size).toBe(3);
  });

  it('draws the v2 labels 54×8, white, centred, rows 1 to 5, all different', () => {
    const labels = byName(sprites, 'hud/meter-labels');
    expect(labels.native).toBe(true);
    expect(labels.frames).toHaveLength(23);
    expect(new Set(labels.frames.map((f) => Buffer.from(f.data).toString('hex'))).size).toBe(23);
    labels.frames.forEach((frame, i) => {
      expect([frame.width, frame.height]).toEqual([54, 8]);
      let minX = frame.width;
      let maxX = -1;
      let minY = frame.height;
      let maxY = -1;
      eachOpaque(frame, (x, y, rgba) => {
        expect(rgba).toEqual([255, 255, 255, 255]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
      // The 4×5 script: ink rows 1 … 5 of the taller frame, never row 0 or the last two.
      expect([minY, maxY], hud.METER_LABELS[i]).toEqual([1, 5]);
      const text = hud.METER_LABELS[i];
      const inkWidth = text.length * 5 - 1;
      expect(maxX - minX + 1, text).toBeLessThanOrEqual(inkWidth);
      const pen = Math.floor((54 - inkWidth) / 2);
      expect(minX).toBeGreaterThanOrEqual(pen);
      expect(maxX).toBeLessThan(pen + inkWidth);
      expect(Math.abs(pen - (54 - pen - inkWidth))).toBeLessThanOrEqual(1);
    });
  });

  it('leaves the no-options call drawing the v1 sprites', () => {
    const v1 = hud.generate();
    expect(byName(v1, 'hud/meter-slot').native).not.toBe(true);
    expect([
      byName(v1, 'hud/meter-slot').frames[0].width,
      byName(v1, 'hud/meter-slot').frames[0].height,
    ]).toEqual([40, 8]);
    expect(byName(v1, 'hud/meter-labels').frames[0].width).toBe(36);
  });
});
