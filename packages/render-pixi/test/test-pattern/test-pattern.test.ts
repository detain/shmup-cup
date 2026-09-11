import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_SHIP,
  createTestPattern,
  moduleInfo,
  pixelArtToRects,
} from '../../src/test-pattern/index.js';

describe('render-pixi/test-pattern', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('test-pattern');
  });

  it('merges horizontal runs and skips transparent pixels', () => {
    const rects = pixelArtToRects(['aab.', '.bb.'], { a: 1, b: 2 }, 10, 20);
    expect(rects).toEqual([
      { x: 10, y: 20, width: 2, height: 1, color: 1 },
      { x: 12, y: 20, width: 1, height: 1, color: 2 },
      { x: 11, y: 21, width: 2, height: 1, color: 2 },
    ]);
  });

  it('covers every opaque pixel of the placeholder ship exactly once', () => {
    const colors = { h: 1, t: 2, c: 3, b: 4 };
    const rects = pixelArtToRects(PLACEHOLDER_SHIP, colors);
    const covered = rects.reduce((sum, r) => sum + r.width * r.height, 0);
    const opaque = PLACEHOLDER_SHIP.join('').replace(/\./g, '').length;
    expect(covered).toBe(opaque);
    for (const row of PLACEHOLDER_SHIP) expect(row).toHaveLength(PLACEHOLDER_SHIP[0].length);
  });

  it('builds a Pixi scene whose marker advances one pixel per tick', () => {
    const pattern = createTestPattern(384, 216);
    expect(pattern.root.children.length).toBe(2);
    const marker = pattern.root.children[1];
    pattern.update(0);
    const x0 = marker.x;
    pattern.update(1);
    expect(marker.x - x0).toBe(1);
  });
});
