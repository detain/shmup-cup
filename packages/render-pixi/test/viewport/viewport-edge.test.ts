/**
 * Property-style checks of computeIntegerViewport over many display sizes, plus the
 * degenerate cases.
 */
import { describe, expect, it } from 'vitest';
import { computeIntegerViewport } from '../../src/viewport/index.js';

const BASE_W = 384;
const BASE_H = 216;

describe('render-pixi/viewport invariants', () => {
  it('always picks the largest integer scale that fits, centred, for every display size', () => {
    for (let w = 384; w <= 4000; w += 37) {
      for (let h = 216; h <= 2300; h += 29) {
        const vp = computeIntegerViewport(w, h, BASE_W, BASE_H);
        const context = `${w}x${h}`;
        expect(Number.isInteger(vp.scale), context).toBe(true);
        expect(vp.width, context).toBe(BASE_W * vp.scale);
        expect(vp.height, context).toBe(BASE_H * vp.scale);
        // Fits…
        expect(vp.width, context).toBeLessThanOrEqual(w);
        expect(vp.height, context).toBeLessThanOrEqual(h);
        // …and one step larger would not.
        const next = vp.scale + 1;
        expect(BASE_W * next > w || BASE_H * next > h, context).toBe(true);
        // Centred on whole pixels.
        expect(Number.isInteger(vp.x) && Number.isInteger(vp.y), context).toBe(true);
        expect(Math.abs(w - vp.width - 2 * vp.x), context).toBeLessThanOrEqual(1);
        expect(Math.abs(h - vp.height - 2 * vp.y), context).toBeLessThanOrEqual(1);
      }
    }
  });

  it('drops to the next scale one pixel below an exact fit', () => {
    expect(computeIntegerViewport(1920, 1080, BASE_W, BASE_H).scale).toBe(5);
    expect(computeIntegerViewport(1919, 1080, BASE_W, BASE_H).scale).toBe(4);
    expect(computeIntegerViewport(1920, 1079, BASE_W, BASE_H).scale).toBe(4);
  });

  it('floors an odd border (the extra pixel goes right/bottom)', () => {
    const vp = computeIntegerViewport(1921, 1081, BASE_W, BASE_H);
    expect(vp).toEqual({ scale: 5, x: 0, y: 0, width: 1920, height: 1080 });
    expect(computeIntegerViewport(1923, 1083, BASE_W, BASE_H)).toMatchObject({ x: 1, y: 1 });
  });

  it('crops a display smaller than one frame symmetrically (scale 1, negative offsets)', () => {
    expect(computeIntegerViewport(192, 108, BASE_W, BASE_H)).toEqual({
      scale: 1,
      x: -96,
      y: -54,
      width: 384,
      height: 216,
    });
  });

  it('survives a zero-sized display (hidden window) without NaN', () => {
    const vp = computeIntegerViewport(0, 0, BASE_W, BASE_H);
    expect(vp.scale).toBe(1);
    for (const value of Object.values(vp)) expect(Number.isFinite(value)).toBe(true);
  });

  it('handles portrait and ultra-wide displays by the limiting axis', () => {
    expect(computeIntegerViewport(1080, 1920, BASE_W, BASE_H)).toMatchObject({ scale: 2, y: 744 });
    expect(computeIntegerViewport(5120, 1440, BASE_W, BASE_H)).toMatchObject({ scale: 6, x: 1408 });
  });

  it('works for other base resolutions', () => {
    expect(computeIntegerViewport(1920, 1080, 320, 180)).toMatchObject({ scale: 6, x: 0, y: 0 });
    expect(computeIntegerViewport(1920, 1080, 256, 224)).toMatchObject({ scale: 4, x: 448, y: 92 });
  });
});
