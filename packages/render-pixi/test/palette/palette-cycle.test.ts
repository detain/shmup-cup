/**
 * Palette cycling helpers (plan M2-08): the ramp position at a tick and the "draw this colour as
 * that one" pairs written for the layer shader.
 */
import { describe, expect, it } from 'vitest';
import {
  colorCycleStep,
  moduleInfo,
  writeColorUnit,
  writeCycleColors,
} from '../../src/palette/index.js';

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

describe('render-pixi/palette cycling', () => {
  it('is implemented', () => {
    expect(moduleInfo.status).toBe('implemented');
  });

  it('steps every `ticks` ticks and wraps around the ramp', () => {
    expect([0, 5, 6, 11, 12, 23, 24, 25].map((t) => colorCycleStep(t, 6, 4))).toEqual([
      0, 0, 1, 1, 2, 3, 0, 0,
    ]);
    expect(colorCycleStep(-1, 6, 4)).toBe(3);
    expect(colorCycleStep(-6, 6, 4)).toBe(3);
    expect(colorCycleStep(-7, 6, 4)).toBe(2);
    expect(colorCycleStep(100, 0, 4)).toBe(0);
    expect(colorCycleStep(100, 6, 0)).toBe(0);
    expect(colorCycleStep(100, Number.NaN, 4)).toBe(0);
  });

  it('writes colours as 0 … 1 triples', () => {
    const out = new Float32Array(6);
    writeColorUnit(0xff8000, out, 1);
    expect([...out]).toEqual([0, 0, 0, 1, 128 / 255, 0].map((v) => Math.fround(v)));
  });

  it('pairs every ramp colour with the one `step` places on, from a start triple', () => {
    const ramp = [0x111111, 0x222222, 0x333333];
    const from = new Float32Array(24);
    const to = new Float32Array(24);
    expect(writeCycleColors(ramp, 1, from, to, 2)).toBe(5);
    expect([2, 3, 4].map((k) => rgbAt(from, k))).toEqual(ramp);
    expect([2, 3, 4].map((k) => rgbAt(to, k))).toEqual([0x222222, 0x333333, 0x111111]);
    // Any integer step, taken mod n.
    writeCycleColors(ramp, -1, from, to, 0);
    expect([0, 1, 2].map((k) => rgbAt(to, k))).toEqual([0x333333, 0x111111, 0x222222]);
    writeCycleColors(ramp, 7, from, to, 0);
    expect([0, 1, 2].map((k) => rgbAt(to, k))).toEqual([0x222222, 0x333333, 0x111111]);
  });

  it('stops at the arrays capacity and handles an empty ramp', () => {
    const from = new Float32Array(6);
    const to = new Float32Array(6);
    expect(writeCycleColors([1, 2, 3, 4], 0, from, to, 1)).toBe(2);
    expect(writeCycleColors([], 3, from, to, 0)).toBe(0);
  });
});
