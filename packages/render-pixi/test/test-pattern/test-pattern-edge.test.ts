/**
 * Edge cases of the pixel-art helper and the calibration pattern.
 */
import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_SHIP,
  createTestPattern,
  pixelArtToRects,
} from '../../src/test-pattern/index.js';

describe('render-pixi/test-pattern pixelArtToRects edge cases', () => {
  it('returns nothing for empty or fully transparent art', () => {
    expect(pixelArtToRects([], { a: 1 })).toEqual([]);
    expect(pixelArtToRects(['', '....'], { a: 1 })).toEqual([]);
    expect(pixelArtToRects(['abc'], {})).toEqual([]);
  });

  it('splits runs at colour changes and gaps, and restarts runs on every row', () => {
    expect(pixelArtToRects(['aa.aab', 'a'], { a: 1, b: 2 })).toEqual([
      { x: 0, y: 0, width: 2, height: 1, color: 1 },
      { x: 3, y: 0, width: 2, height: 1, color: 1 },
      { x: 5, y: 0, width: 1, height: 1, color: 2 },
      { x: 0, y: 1, width: 1, height: 1, color: 1 },
    ]);
  });

  it('keeps different characters with the same colour as separate runs', () => {
    expect(pixelArtToRects(['ab'], { a: 7, b: 7 })).toHaveLength(2);
  });

  it('accepts ragged rows and zero colour (black) as opaque', () => {
    expect(pixelArtToRects(['k', 'kkk'], { k: 0 })).toEqual([
      { x: 0, y: 0, width: 1, height: 1, color: 0 },
      { x: 0, y: 1, width: 3, height: 1, color: 0 },
    ]);
  });

  it('offsets every rectangle by the origin', () => {
    const rects = pixelArtToRects(['a', '.a'], { a: 1 }, -5, 100);
    expect(rects.map((r) => [r.x, r.y])).toEqual([
      [-5, 100],
      [-4, 101],
    ]);
  });

  it('never produces overlapping rectangles (every opaque pixel covered once)', () => {
    const art = ['abba..ab', '..aaaa..', 'bbbbbbbb', 'a.b.a.b.'];
    const rects = pixelArtToRects(art, { a: 1, b: 2 });
    const seen = new Set<string>();
    for (const r of rects) {
      for (let x = r.x; x < r.x + r.width; x++) {
        const id = `${x},${r.y}`;
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
        expect(art[r.y]?.charAt(x)).not.toBe('.');
      }
    }
    expect(seen.size).toBe(art.join('').replace(/\./g, '').length);
  });
});

describe('render-pixi/test-pattern PLACEHOLDER_SHIP', () => {
  it('is a 16x9 original sprite using only the four mapped colour keys', () => {
    expect(PLACEHOLDER_SHIP).toHaveLength(9);
    for (const row of PLACEHOLDER_SHIP) {
      expect(row).toHaveLength(16);
      expect(row).toMatch(/^[.htcb]+$/);
    }
  });

  it('faces right: the nose (rightmost pixel) is on the centre row, thrusters on the left', () => {
    const lastOpaque = PLACEHOLDER_SHIP.map((row) => row.replace(/\.+$/, '').length);
    expect(Math.max(...lastOpaque)).toBe(lastOpaque[4]);
    expect(PLACEHOLDER_SHIP[4]?.startsWith('t')).toBe(true);
  });
});

describe('render-pixi/test-pattern createTestPattern', () => {
  it('builds static graphics plus a moving marker', () => {
    const pattern = createTestPattern(384, 216);
    const [statics, marker] = pattern.root.children;
    expect(statics).toBeInstanceOf(Graphics);
    expect(marker).toBeInstanceOf(Graphics);
    expect(marker?.y).toBe(216 - 24);
  });

  it('sweeps the marker from x=8 across the frame and wraps around', () => {
    const pattern = createTestPattern(384, 216);
    const marker = pattern.root.children[1];
    const travel = 384 - 16;
    pattern.update(0);
    expect(marker?.x).toBe(8);
    pattern.update(travel - 1);
    expect(marker?.x).toBe(8 + travel - 1);
    pattern.update(travel);
    expect(marker?.x).toBe(8);
    pattern.update(travel * 1000 + 5);
    expect(marker?.x).toBe(13);
  });

  it('keeps the marker inside the frame for every tick', () => {
    const pattern = createTestPattern(384, 216);
    const marker = pattern.root.children[1];
    for (let tick = 0; tick < 1000; tick++) {
      pattern.update(tick);
      expect(marker?.x).toBeGreaterThanOrEqual(1);
      expect(marker?.x).toBeLessThanOrEqual(384 - 2);
    }
  });

  it('can be built for other frame sizes', () => {
    const pattern = createTestPattern(320, 180);
    pattern.update(320 - 16);
    expect(pattern.root.children[1]?.x).toBe(8);
  });
});
