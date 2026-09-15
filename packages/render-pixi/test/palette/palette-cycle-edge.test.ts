/**
 * Edge cases of the palette-cycling helpers (plan M2-08), next to `palette-cycle.test.ts`: a
 * fractional ramp length or step length, a ramp shorter than one colour (regression: `colorCycleStep`
 * returned NaN for a count in (0, 1) — the `% floor(count)` of 0), NaN and infinite ticks, one-
 * colour ramps, a start past the arrays, arrays of different lengths, and no allocation per call.
 */
import { describe, expect, it } from 'vitest';
import { colorCycleStep, writeColorUnit, writeCycleColors } from '../../src/palette/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/**
 * Reads triple `k` of an array back as 0xRRGGBB.
 *
 * @param out - The array.
 * @param k - Triple index.
 * @returns The colour.
 */
const rgbAt = (out: Float32Array, k: number): number =>
  (Math.round(out[3 * k] * 255) << 16) |
  (Math.round(out[3 * k + 1] * 255) << 8) |
  Math.round(out[3 * k + 2] * 255);

describe('render-pixi/palette colorCycleStep (edges)', () => {
  it('always returns a step in 0 … count − 1, never NaN', () => {
    for (const count of [0.5, 0.999, 1e-9]) expect(colorCycleStep(17, 3, count)).toBe(0);
    for (const tick of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(colorCycleStep(tick, 3, 4)).toBe(0);
    }
    expect(colorCycleStep(17, 3, Number.POSITIVE_INFINITY)).toBe(5);
    expect(colorCycleStep(17, Number.POSITIVE_INFINITY, 4)).toBe(0);
    for (let tick = -50; tick <= 50; tick++) {
      const step = colorCycleStep(tick, 3, 5);
      expect(Number.isInteger(step) && step >= 0 && step < 5).toBe(true);
    }
  });

  it('floors a fractional ramp length and accepts a fractional step length', () => {
    expect(colorCycleStep(9, 3, 4.9)).toBe(3);
    expect(colorCycleStep(12, 3, 4.9)).toBe(0);
    expect(colorCycleStep(1, 0.5, 4)).toBe(2);
    expect(colorCycleStep(5, 2.5, 3)).toBe(2);
    expect(colorCycleStep(-1, 0.5, 4)).toBe(2);
  });

  it('keeps a one-colour ramp at step 0 and handles huge ticks', () => {
    expect(colorCycleStep(123456, 1, 1)).toBe(0);
    // 2^40 ticks at 8 per step on a 4-colour ramp: 2^37 steps ≡ 0.
    expect(colorCycleStep(2 ** 40, 8, 4)).toBe(0);
    expect(colorCycleStep(2 ** 40 + 8, 8, 4)).toBe(1);
  });
});

describe('render-pixi/palette writeCycleColors (edges)', () => {
  it('writes nothing from a start at or past the capacity', () => {
    const from = new Float32Array(6).fill(0.5);
    const to = new Float32Array(6).fill(0.5);
    expect(writeCycleColors([0xffffff, 0], 0, from, to, 2)).toBe(2);
    expect(writeCycleColors([0xffffff, 0], 0, from, to, 9)).toBe(9);
    expect([...from, ...to].every((v) => v === 0.5)).toBe(true);
  });

  it('stops at the shorter of the two arrays', () => {
    const from = new Float32Array(12);
    const to = new Float32Array(6);
    expect(writeCycleColors([1, 2, 3, 4], 1, from, to, 0)).toBe(2);
    expect([rgbAt(from, 0), rgbAt(from, 1), rgbAt(from, 2)]).toEqual([1, 2, 0]);
    expect([rgbAt(to, 0), rgbAt(to, 1)]).toEqual([2, 3]);
  });

  it('maps a one-colour ramp onto itself and floors a fractional step', () => {
    const from = new Float32Array(6);
    const to = new Float32Array(6);
    expect(writeCycleColors([0x123456], 5, from, to, 0)).toBe(1);
    expect([rgbAt(from, 0), rgbAt(to, 0)]).toEqual([0x123456, 0x123456]);
    writeCycleColors([0x111111, 0x222222, 0x333333], 1.7, from, to, 0);
    expect([rgbAt(to, 0), rgbAt(to, 1)]).toEqual([0x222222, 0x333333]);
    writeCycleColors([0x111111, 0x222222, 0x333333], -4, from, to, 0);
    expect([rgbAt(to, 0), rgbAt(to, 1)]).toEqual([0x333333, 0x111111]);
  });

  it('writes the channels of a colour exactly as bytes / 255 (the shader compares within 1.5 / 255)', () => {
    const out = new Float32Array(3);
    for (const color of [0x000000, 0xffffff, 0x183c78, 0x5096d8, 0x010203]) {
      writeColorUnit(color, out, 0);
      expect(rgbAt(out, 0)).toBe(color);
      for (let c = 0; c < 3; c++) {
        const byte = (color >> (16 - 8 * c)) & 0xff;
        expect(Math.abs(out[c] - byte / 255)).toBeLessThan(0.5 / 255 / 1000);
      }
    }
    // Bits above 24 are ignored.
    writeColorUnit(0x7f000000 | 0x0a0b0c, out, 0);
    expect(rgbAt(out, 0)).toBe(0x0a0b0c);
  });

  it('steps and writes a layer of cycles without allocating', () => {
    const from = new Float32Array(24);
    const to = new Float32Array(24);
    const a = [0x183c78, 0x24569c, 0x3474bc, 0x5096d8];
    const b = [0xff0000, 0xff8000, 0xffff00];
    const bytes = measureHeapGrowth(
      (tick) => {
        let count = writeCycleColors(a, colorCycleStep(tick, 8, a.length), from, to, 0);
        count = writeCycleColors(b, colorCycleStep(tick, 5, b.length), from, to, count);
        if (count !== 7) throw new Error('bad count');
      },
      10_000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
