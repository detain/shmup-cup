/**
 * Property-style checks of the `fit` and `stretch` scale modes (plan M2-08) over many display
 * sizes, next to `viewport-modes.test.ts`: `fit` always fits, fills one axis exactly, keeps the
 * 16:9 shape to a pixel, is centred on whole pixels and never shows less than `integer`; `stretch`
 * covers the display; exact multiples make `fit` equal `integer`; an unknown mode falls back to
 * `integer`; infinite sizes stay finite where they can.
 */
import { SCALE_MODES, type ScaleMode } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { computeIntegerViewport, computeViewport } from '../../src/viewport/index.js';

const BASE_W = 384;
const BASE_H = 216;

describe('render-pixi/viewport scale modes (invariants)', () => {
  it('fit fits, fills one axis, keeps the shape and is centred for every display size', () => {
    // Collect violations and assert once (thousands of sizes — see viewport-edge.test.ts).
    const failures: string[] = [];
    const check = (ok: boolean, what: string, context: string): void => {
      if (!ok) failures.push(`${context}: ${what}`);
    };
    for (let w = 200; w <= 4000; w += 41) {
      for (let h = 120; h <= 2300; h += 31) {
        const vp = computeViewport('fit', w, h, BASE_W, BASE_H);
        const context = `${w}x${h} → ${JSON.stringify(vp)}`;
        check(vp.mode === 'fit', 'mode', context);
        check(Number.isInteger(vp.width) && Number.isInteger(vp.height), 'whole pixels', context);
        check(vp.width <= w && vp.height <= h, 'fits the display', context);
        check(vp.width === w || vp.height === h, 'fills one axis', context);
        // 16:9 to within the rounding of the shorter side.
        check(
          Math.abs(vp.width * BASE_H - vp.height * BASE_W) <= BASE_W,
          'keeps the shape',
          context,
        );
        check(
          vp.scaleX === vp.width / BASE_W && vp.scaleY === vp.height / BASE_H,
          'scales',
          context,
        );
        check(Number.isInteger(vp.x) && Number.isInteger(vp.y), 'whole-pixel offset', context);
        check(Math.abs(w - vp.width - 2 * vp.x) <= 1, 'centred horizontally', context);
        check(Math.abs(h - vp.height - 2 * vp.y) <= 1, 'centred vertically', context);
        const integer = computeIntegerViewport(w, h, BASE_W, BASE_H);
        if (integer.width <= w && integer.height <= h) {
          check(vp.width >= integer.width, 'at least as large as integer', context);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('stretch covers every display exactly, each axis scaled on its own', () => {
    const failures: string[] = [];
    for (let w = 1; w <= 4000; w += 97) {
      for (let h = 1; h <= 2300; h += 89) {
        const vp = computeViewport('stretch', w, h, BASE_W, BASE_H);
        const ok =
          vp.x === 0 &&
          vp.y === 0 &&
          vp.width === w &&
          vp.height === h &&
          vp.scaleX === w / BASE_W &&
          vp.scaleY === h / BASE_H &&
          vp.scale === Math.min(vp.scaleX, vp.scaleY);
        if (!ok) failures.push(`${w}x${h} → ${JSON.stringify(vp)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('fit equals integer on exact multiples of the frame', () => {
    for (let k = 1; k <= 10; k++) {
      const fit = computeViewport('fit', BASE_W * k, BASE_H * k, BASE_W, BASE_H);
      const integer = computeViewport('integer', BASE_W * k, BASE_H * k, BASE_W, BASE_H);
      expect({ ...fit, mode: 'integer' }).toEqual(integer);
    }
  });

  it('falls back to integer for an unknown mode', () => {
    const vp = computeViewport('zoom' as ScaleMode, 1280, 720, BASE_W, BASE_H);
    expect(vp).toEqual(computeIntegerViewport(1280, 720, BASE_W, BASE_H));
  });

  it('rounds a fractional display size to whole pixels in fit', () => {
    const vp = computeViewport('fit', 1280.7, 720.2, BASE_W, BASE_H);
    expect([vp.width, vp.height]).toEqual([1280, 720]);
    expect([vp.x, vp.y]).toEqual([0, 0]);
  });

  it('keeps every mode finite for a one-pixel display', () => {
    for (const mode of SCALE_MODES) {
      const vp = computeViewport(mode, 1, 1, BASE_W, BASE_H);
      for (const value of [vp.scale, vp.scaleX, vp.scaleY, vp.x, vp.y, vp.width, vp.height]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(vp.width).toBeGreaterThanOrEqual(1);
      expect(vp.height).toBeGreaterThanOrEqual(1);
    }
  });
});
