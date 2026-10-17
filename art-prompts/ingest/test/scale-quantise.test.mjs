/**
 * The downscale (exact area filter, pixel snap, binary / translucent / additive alpha, never
 * up) and the colour reduction (median cut, the reserved ramps kept ≥ 3/255 away, nearest
 * mapping, ordered dither only).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chebyshev, createImage, packRgb, putRgba } from '../lib/image.mjs';
import { clearReserved, histogram, mapToPalette, medianCut, pushClear } from '../lib/quantise.mjs';
import { downscale } from '../lib/scale.mjs';

/**
 * Scale settings with overrides.
 *
 * @param {Partial<import('../lib/scale.mjs').ScaleSettings>} [o] - Overrides.
 * @returns {import('../lib/scale.mjs').ScaleSettings} Settings.
 */
const scaleSettings = (o = {}) => ({
  fit: 'stretch',
  align: 'center',
  alpha: 'binary',
  coverage: 0.5,
  snap: true,
  threshold: 8,
  ...o,
});

/**
 * An image from rows of `[0xRRGGBB, alpha]` pixels.
 *
 * @param {[number, number][][]} rows - Pixels.
 * @returns {import('../lib/image.mjs').Image} The image.
 */
function fromRows(rows) {
  const img = createImage(rows[0].length, rows.length);
  rows.forEach((row, y) => row.forEach(([c, a], x) => putRgba(img, y * img.width + x, c, a)));
  return img;
}

/**
 * Pixel `[colour, alpha]`.
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

const O = 0x141428; // outline
const H = 0xe0e8f0; // highlight
const T = 0; // transparent colour

describe('downscale', () => {
  it('snaps a 2×2 box to a real source colour instead of the muddy average', () => {
    const img = fromRows([
      [
        [O, 255],
        [H, 255],
      ],
      [
        [O, 255],
        [O, 255],
      ],
    ]);
    const { image, factorX } = downscale(img, 1, 1, scaleSettings());
    assert.equal(factorX, 2);
    assert.deepEqual(px(image, 0, 0), [O, 255]);
    const mud = downscale(img, 1, 1, scaleSettings({ snap: false })).image;
    assert.notEqual(px(mud, 0, 0)[0], O);
  });

  it('is opaque at half coverage and transparent below it', () => {
    const half = fromRows([
      [
        [O, 255],
        [O, 255],
      ],
      [
        [T, 0],
        [T, 0],
      ],
    ]);
    assert.equal(px(downscale(half, 1, 1, scaleSettings()).image, 0, 0)[1], 255);
    const quarter = fromRows([
      [
        [O, 255],
        [T, 0],
      ],
      [
        [T, 0],
        [T, 0],
      ],
    ]);
    assert.equal(px(downscale(quarter, 1, 1, scaleSettings()).image, 0, 0)[1], 0);
    assert.equal(
      px(downscale(quarter, 1, 1, scaleSettings({ coverage: 0.25 })).image, 0, 0)[1],
      255,
    );
  });

  it('weights fractional boxes by area (5 → 2 is a factor of 2.5)', () => {
    // Columns: 3 subject then 2 transparent. Box 0 = cols 0–2.5 (all subject), box 1 = cols
    // 2.5–5 (0.5 of 2.5 subject → 20 %, transparent).
    const row = [
      [O, 255],
      [O, 255],
      [O, 255],
      [T, 0],
      [T, 0],
    ];
    const img = fromRows([row, row, row, row, row]);
    const { image } = downscale(img, 2, 2, scaleSettings());
    assert.equal(px(image, 0, 0)[1], 255);
    assert.equal(px(image, 1, 0)[1], 0);
  });

  it('contain: scales uniformly and aligns, leaving transparent margins', () => {
    const img = fromRows(
      Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => [O, 255])),
    );
    const { image } = downscale(img, 4, 4, scaleSettings({ fit: 'contain', align: 'bottom' }));
    assert.equal(px(image, 0, 0)[1], 0);
    assert.equal(px(image, 0, 1)[1], 0);
    assert.deepEqual(px(image, 0, 3), [O, 255]);
    const centred = downscale(img, 4, 4, scaleSettings({ fit: 'contain' })).image;
    assert.equal(px(centred, 0, 0)[1], 0);
    assert.equal(px(centred, 0, 1)[1], 255);
  });

  it('translucent: averages alpha and colour without snapping', () => {
    const img = fromRows([
      [
        [0xff0000, 255],
        [0xff0000, 51],
      ],
    ]);
    const { image } = downscale(img, 1, 1, scaleSettings({ alpha: 'translucent' }));
    assert.deepEqual(px(image, 0, 0), [0xff0000, 153]);
  });

  it('additive: the premultiplied average, opaque from the threshold up', () => {
    const img = fromRows([
      [
        [0x404040, 255],
        [0x000000, 0],
      ],
    ]);
    assert.deepEqual(
      px(downscale(img, 1, 1, scaleSettings({ alpha: 'additive' })).image, 0, 0),
      [0x202020, 255],
    );
    const dim = fromRows([
      [
        [0x0c0c0c, 255],
        [0x000000, 0],
      ],
    ]);
    assert.equal(px(downscale(dim, 1, 1, scaleSettings({ alpha: 'additive' })).image, 0, 0)[1], 0);
  });

  it('never scales up (bible §3.1)', () => {
    assert.throws(() => downscale(createImage(4, 4), 8, 4, scaleSettings()), /never scales up/);
  });
});

describe('quantise', () => {
  it('keeps the exact colours when there are few enough', () => {
    const img = fromRows([
      [
        [0x102030, 255],
        [0x405060, 255],
        [0x102030, 255],
        [0xffffff, 0],
      ],
    ]);
    const hist = histogram([img]);
    assert.deepEqual(hist, [
      [0x102030, 2],
      [0x405060, 1],
    ]);
    assert.deepEqual(medianCut(hist, 4), [0x102030, 0x405060]);
  });

  it('median cut stays within the cap and does not depend on pixel order', () => {
    const colours = Array.from({ length: 300 }, (_, i) =>
      packRgb((i * 37) & 255, (i * 91) & 255, (i * 13) & 255),
    );
    const a = createImage(300, 1);
    const b = createImage(300, 1);
    colours.forEach((c, i) => {
      putRgba(a, i, c, 255);
      putRgba(b, 299 - i, c, 255);
    });
    const pa = medianCut(histogram([a]), 16);
    assert.ok(pa.length <= 16 && pa.length > 8);
    assert.deepEqual(pa, medianCut(histogram([b]), 16));
  });

  it('pushes a colour at least 3/255 (Chebyshev) from every reserved colour', () => {
    const reserved = [0x203850, 0x28486a];
    const pushed = pushClear(0x213951, reserved);
    assert.ok(pushed !== null);
    for (const r of reserved) assert.ok(chebyshev(/** @type {number} */ (pushed), r) >= 3);
    assert.equal(pushClear(0x808080, reserved), 0x808080);
  });

  it('keeps allowed ramp colours exact and moves the rest', () => {
    const { palette, moves } = clearReserved(
      [0x203850, 0x213951, 0x808080],
      [0x203850],
      new Set([0x203850]),
    );
    assert.ok(palette.includes(0x203850));
    assert.ok(!palette.includes(0x213951));
    assert.equal(moves.length, 1);
    assert.match(moves[0], /#213951 → #[0-9a-f]{6} \(too close to reserved #203850\)/);
  });

  it('maps to the nearest palette colour and keeps alpha', () => {
    const img = fromRows([
      [
        [0x101010, 255],
        [0xf0f0f0, 128],
        [0x7f7f7f, 0],
      ],
    ]);
    mapToPalette(img, [0x000000, 0xffffff], { size: 0, strength: 24 });
    assert.deepEqual(px(img, 0, 0), [0x000000, 255]);
    assert.deepEqual(px(img, 1, 0), [0xffffff, 128]);
    assert.equal(px(img, 2, 0)[1], 0);
  });

  it('ordered dither gives a fixed Bayer pattern of palette colours only', () => {
    const img = fromRows(
      Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [0x808080, 255])),
    );
    mapToPalette(img, [0x606060, 0xa0a0a0], { size: 4, strength: 64 });
    const seen = new Set();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) seen.add(px(img, x, y)[0]);
    assert.deepEqual(
      [...seen].sort((a, b) => a - b),
      [0x606060, 0xa0a0a0],
    );
    // Bayer cell 0 pulls 0x80 down by 30 (→ 0x60), cell 8 lifts it by 2 (→ nearer 0xa0).
    assert.equal(px(img, 0, 0)[0], 0x606060);
    assert.equal(px(img, 1, 0)[0], 0xa0a0a0);
  });
});
