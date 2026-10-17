/**
 * The last stages (outline ring, frame strip, hand-edit merge) and the report's
 * measurements (luma budget, near misses, the mixel warning).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeEdit, outlineFrame, stripOf } from '../lib/finish.mjs';
import { createImage, packRgb, putRgba } from '../lib/image.mjs';
import {
  colourCount,
  lightingWarnings,
  looksUpscaled,
  lumaStats,
  nearMisses,
} from '../lib/report.mjs';

/**
 * A `w × h` image with an opaque rectangle.
 *
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {[number, number, number, number]} box - `[x, y, w, h]` of the opaque part.
 * @param {number} c - Its colour.
 * @returns {import('../lib/image.mjs').Image} The image.
 */
function boxImage(w, h, [x0, y0, bw, bh], c) {
  const img = createImage(w, h);
  for (let y = y0; y < y0 + bh; y++)
    for (let x = x0; x < x0 + bw; x++) putRgba(img, y * w + x, c, 255);
  return img;
}

/**
 * Pixel colour and alpha.
 *
 * @param {import('../lib/image.mjs').Image} img - Image.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @returns {[number, number]} Colour and alpha.
 */
const px = (img, x, y) => {
  const p = (y * img.width + x) * 4;
  return [packRgb(img.data[p], img.data[p + 1], img.data[p + 2]), img.data[p + 3]];
};

describe('outlineFrame', () => {
  it('recolours the outermost opaque ring, inside the frame', () => {
    const img = boxImage(6, 6, [1, 1, 4, 4], 0x808080);
    assert.equal(outlineFrame(img, 0x141428, 'open'), 12);
    assert.deepEqual(px(img, 1, 1), [0x141428, 255]);
    assert.deepEqual(px(img, 2, 2), [0x808080, 255]);
    assert.deepEqual(px(img, 0, 0)[1], 0);
  });

  it('treats the frame edge as open space, unless edges are closed (tiles)', () => {
    const open = boxImage(4, 4, [0, 0, 4, 4], 0x808080);
    assert.equal(outlineFrame(open, 0x141428, 'open'), 12);
    const tile = boxImage(4, 4, [0, 0, 4, 4], 0x808080);
    putRgba(tile, 0, 0, 0); // one open pixel inside the tile
    assert.equal(outlineFrame(tile, 0x141428, 'closed'), 2);
    assert.deepEqual(px(tile, 3, 3), [0x808080, 255]);
  });
});

describe('stripOf and mergeEdit', () => {
  it('lays frames out left to right', () => {
    const strip = stripOf([
      boxImage(2, 2, [0, 0, 2, 2], 0x111111),
      boxImage(2, 2, [0, 0, 2, 2], 0x222222),
    ]);
    assert.equal(strip.width, 4);
    assert.deepEqual(px(strip, 1, 1), [0x111111, 255]);
    assert.deepEqual(px(strip, 2, 0), [0x222222, 255]);
  });

  it('paints opaque edit pixels, erases with the erase colour and ignores soft ones', () => {
    const strip = boxImage(4, 1, [0, 0, 4, 1], 0x808080);
    const edit = createImage(4, 1);
    putRgba(edit, 0, 0xffffff, 255);
    putRgba(edit, 1, 0xff00ff, 255);
    putRgba(edit, 2, 0x000000, 100);
    assert.deepEqual(mergeEdit(strip, edit, 0xff00ff), { painted: 1, erased: 1, partial: 1 });
    assert.deepEqual(px(strip, 0, 0), [0xffffff, 255]);
    assert.deepEqual(px(strip, 1, 0)[1], 0);
    assert.deepEqual(px(strip, 2, 0), [0x808080, 255]);
    assert.deepEqual(px(strip, 3, 0), [0x808080, 255]);
  });

  it('refuses an edit layer of another size', () => {
    assert.throws(
      () => mergeEdit(createImage(4, 1), createImage(3, 1), 0xff00ff),
      /edit layer is 3×1/,
    );
  });
});

describe('report measurements', () => {
  it('lumaStats: Rec. 709, nearest-rank median and 95th percentile over opaque pixels', () => {
    const img = createImage(20, 1);
    for (let i = 0; i < 20; i++) putRgba(img, i, i < 19 ? 0x404040 : 0xffffff, 255);
    const stats = lumaStats([img, createImage(2, 2)]);
    assert.deepEqual(stats, { pixels: 20, floor: 64, median: 64, p95: 64, brightShare: 0.05 });
  });

  it('lightingWarnings: the far and mid budgets of bible §4.1, none for near layers', () => {
    const bright = { pixels: 10, floor: 5, median: 90, p95: 200, brightShare: 0.2 };
    assert.equal(lightingWarnings(bright, 'far').length, 4);
    assert.equal(
      lightingWarnings({ ...bright, floor: 20, median: 70, p95: 150, brightShare: 0 }, 'mid')
        .length,
      0,
    );
    assert.equal(
      lightingWarnings({ ...bright, floor: 20, median: 70, p95: 150, brightShare: 0 }, 'far')
        .length,
      2,
    );
    assert.deepEqual(lightingWarnings(bright, 'near'), []);
  });

  it('nearMisses: counts pixels within 3/255 of a reserved colour unless allowed exactly', () => {
    const img = createImage(3, 1);
    putRgba(img, 0, 0x203850, 255);
    putRgba(img, 1, 0x213951, 255);
    putRgba(img, 2, 0x233b53, 255);
    assert.deepEqual(nearMisses([img], [0x203850], new Set([0x203850])), {
      pixels: 1,
      colours: ['#213951'],
    });
    assert.equal(nearMisses([img], [0x203850], new Set()).pixels, 2);
  });

  it('looksUpscaled: all-even runs both ways read as a ×2 upscale', () => {
    const native = createImage(8, 8);
    const doubled = createImage(16, 16);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const c = ((x * 3 + y * 5) % 7) * 0x202020;
        putRgba(native, y * 8 + x, c, 255);
        for (let k = 0; k < 4; k++)
          putRgba(doubled, (y * 2 + (k >> 1)) * 16 + x * 2 + (k & 1), c, 255);
      }
    }
    assert.equal(looksUpscaled([native]), false);
    assert.equal(looksUpscaled([doubled]), true);
    assert.equal(colourCount([doubled]), 7);
  });
});
