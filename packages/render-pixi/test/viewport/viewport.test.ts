import { describe, expect, it } from 'vitest';
import { computeIntegerViewport, moduleInfo } from '../../src/viewport/index.js';

describe('render-pixi/viewport computeIntegerViewport', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('viewport');
  });

  it('scales 384x216 by exactly 5 on 1080p (Tizen UHD web apps) with no letterbox', () => {
    expect(computeIntegerViewport(1920, 1080, 384, 216)).toEqual({
      scale: 5,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('scales by 3 with a centred letterbox on 720p (Tizen FHD web apps)', () => {
    expect(computeIntegerViewport(1280, 720, 384, 216)).toEqual({
      scale: 3,
      x: 64,
      y: 36,
      width: 1152,
      height: 648,
    });
  });

  it('scales by 10 on 4K and never below 1', () => {
    expect(computeIntegerViewport(3840, 2160, 384, 216).scale).toBe(10);
    const tiny = computeIntegerViewport(200, 100, 384, 216);
    expect(tiny.scale).toBe(1);
    expect(tiny.width).toBe(384);
  });

  it('picks the limiting axis for odd window shapes', () => {
    const vp = computeIntegerViewport(2000, 700, 384, 216);
    expect(vp.scale).toBe(3);
    expect(vp.x).toBe(Math.floor((2000 - 1152) / 2));
  });
});
