/**
 * The scale modes of plan M2-08 (shmup_feat.md §3): `integer` (the largest whole multiple,
 * letterboxed), `fit` (the largest scale keeping 16:9, not a whole number) and `stretch` (the whole
 * display).
 */
import { SCALE_MODES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { computeIntegerViewport, computeViewport, moduleInfo } from '../../src/viewport/index.js';

describe('render-pixi/viewport scale modes', () => {
  it('is implemented', () => {
    expect(moduleInfo.status).toBe('implemented');
    expect(SCALE_MODES).toEqual(['integer', 'fit', 'stretch']);
  });

  it('integer mode is computeIntegerViewport', () => {
    expect(computeViewport('integer', 1280, 720, 384, 216)).toEqual(
      computeIntegerViewport(1280, 720, 384, 216),
    );
    expect(computeViewport('integer', 1000, 600, 384, 216)).toEqual({
      mode: 'integer',
      scale: 2,
      scaleX: 2,
      scaleY: 2,
      x: 116,
      y: 84,
      width: 768,
      height: 432,
    });
  });

  it('fit fills the limiting axis with a fractional scale, centred', () => {
    const vp = computeViewport('fit', 1280, 720, 384, 216);
    expect(vp).toMatchObject({ mode: 'fit', x: 0, y: 0, width: 1280, height: 720 });
    expect(vp.scale).toBeCloseTo(1280 / 384, 10);
    expect([vp.scaleX, vp.scaleY]).toEqual([1280 / 384, 720 / 216]);
    const wide = computeViewport('fit', 1000, 600, 384, 216);
    expect(wide).toMatchObject({ width: 1000, height: 563, x: 0, y: 18 });
    const tall = computeViewport('fit', 600, 1000, 384, 216);
    expect(tall).toMatchObject({ width: 600, height: 338, x: 0, y: 331 });
    // Smaller than the frame: it shrinks (no crop).
    expect(computeViewport('fit', 192, 108, 384, 216)).toMatchObject({
      scale: 0.5,
      width: 192,
      height: 108,
      x: 0,
      y: 0,
    });
  });

  it('stretch covers the display, each axis on its own', () => {
    const vp = computeViewport('stretch', 1000, 1000, 384, 216);
    expect(vp).toMatchObject({ mode: 'stretch', x: 0, y: 0, width: 1000, height: 1000 });
    expect(vp.scaleX).toBeCloseTo(1000 / 384, 10);
    expect(vp.scaleY).toBeCloseTo(1000 / 216, 10);
    expect(vp.scale).toBe(vp.scaleX);
  });

  it('survives an empty or broken display size in every mode', () => {
    for (const mode of SCALE_MODES) {
      for (const [w, h] of [
        [0, 0],
        [-5, 10],
        [Number.NaN, 100],
      ]) {
        const vp = computeViewport(mode, w, h, 384, 216);
        for (const value of [vp.scale, vp.scaleX, vp.scaleY, vp.x, vp.y, vp.width, vp.height]) {
          expect(Number.isFinite(value)).toBe(true);
        }
        expect(vp.width).toBeGreaterThan(0);
      }
    }
  });
});
