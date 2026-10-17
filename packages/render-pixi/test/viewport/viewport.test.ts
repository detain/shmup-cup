import { FRAME_H, FRAME_W } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { computeIntegerViewport, moduleInfo } from '../../src/viewport/index.js';

describe('render-pixi/viewport computeIntegerViewport', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('viewport');
  });

  it('scales 384x216 by exactly 5 on 1080p (Tizen UHD web apps) with no letterbox', () => {
    expect(computeIntegerViewport(1920, 1080, 384, 216)).toMatchObject({
      scale: 5,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('scales by 3 with a centred letterbox on 720p (Tizen FHD web apps)', () => {
    expect(computeIntegerViewport(1280, 720, 384, 216)).toMatchObject({
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

describe('render-pixi/viewport the frame constants (plan R1-02, §2.7)', () => {
  it('fills 1080p and 4K with the default frame at an integer scale, with no letterbox', () => {
    // ×5 / ×10 at 384×216; ×3 / ×6 at 640×360 (R2-01).
    for (const [w, h] of [
      [1920, 1080],
      [3840, 2160],
    ]) {
      const vp = computeIntegerViewport(w, h, FRAME_W, FRAME_H);
      expect(vp.scale).toBe(Math.floor(w / FRAME_W));
      expect(vp).toMatchObject({ x: 0, y: 0, width: w, height: h });
    }
  });

  it('scales the default frame by floor(1280 / FRAME_W) on 720p, centred', () => {
    // ×3 with a 64 / 36 letterbox at 384×216; ×2 filling the screen at 640×360.
    const vp = computeIntegerViewport(1280, 720, FRAME_W, FRAME_H);
    const scale = Math.floor(1280 / FRAME_W);
    expect(vp).toMatchObject({
      scale,
      width: FRAME_W * scale,
      height: FRAME_H * scale,
      x: (1280 - FRAME_W * scale) / 2,
      y: (720 - FRAME_H * scale) / 2,
    });
  });
});

describe('render-pixi/viewport the v2 frame, 640×360 (plan §2.7)', () => {
  it('scales by exactly 3 on 1080p and 6 on 4K, with no letterbox', () => {
    expect(computeIntegerViewport(1920, 1080, 640, 360)).toMatchObject({
      scale: 3,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(computeIntegerViewport(3840, 2160, 640, 360)).toMatchObject({
      scale: 6,
      x: 0,
      y: 0,
      width: 3840,
      height: 2160,
    });
  });

  it('scales by exactly 2 on 720p and 4 on 1440p, filling the screen', () => {
    expect(computeIntegerViewport(1280, 720, 640, 360)).toMatchObject({
      scale: 2,
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
    expect(computeIntegerViewport(2560, 1440, 640, 360)).toMatchObject({
      scale: 4,
      x: 0,
      y: 0,
      width: 2560,
      height: 1440,
    });
  });

  it('never goes below 1 on a display smaller than the frame (a centred crop)', () => {
    expect(computeIntegerViewport(384, 216, 640, 360)).toMatchObject({
      scale: 1,
      x: -128,
      y: -72,
      width: 640,
      height: 360,
    });
  });
});
