/**
 * Keying (art bible §8 steps 2–6): the border-sampled yellowish key, the flood fill that is
 * never global, holes, despill, cleanup, and the black / none / alpha keys.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createImage, hexOf, packRgb, putRgba } from '../lib/image.mjs';
import { DEFAULT_GREEN_TEST, keyRegion, passesGreenTest, sampleBorderKey } from '../lib/key.mjs';

/** The models' key, as sampled from the round-1 winners (bible §8). */
const KEY = 0x3cf102;

/**
 * Key settings with overrides.
 *
 * @param {Partial<import('../lib/key.mjs').KeySettings>} [o] - Overrides.
 * @returns {import('../lib/key.mjs').KeySettings} Settings.
 */
const settings = (o = {}) => ({
  mode: 'green',
  color: null,
  tolerance: 64,
  test: DEFAULT_GREEN_TEST,
  threshold: 8,
  holes: { auto: false, minArea: 64, seeds: [] },
  despill: 0,
  open: 0,
  minIsland: 0,
  ...o,
});

/**
 * A key-filled image with rectangles drawn on it.
 *
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {[number, number, number, number, number][]} rects - `[x, y, w, h, colour]`.
 * @param {number} [key] - Background.
 * @returns {import('../lib/image.mjs').Image} The image.
 */
function scene(w, h, rects, key = KEY) {
  const img = createImage(w, h);
  for (let i = 0; i < w * h; i++) putRgba(img, i, key, 255);
  for (const [x, y, rw, rh, c] of rects) {
    for (let j = y; j < y + rh; j++)
      for (let k = x; k < x + rw; k++) putRgba(img, j * w + k, c, 255);
  }
  return img;
}

/**
 * Alpha of a pixel.
 *
 * @param {import('../lib/image.mjs').Image} img - Image.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @returns {number} Alpha.
 */
const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

/**
 * Colour of a pixel.
 *
 * @param {import('../lib/image.mjs').Image} img - Image.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @returns {number} `0xRRGGBB`.
 */
const colourAt = (img, x, y) => {
  const p = (y * img.width + x) * 4;
  return packRgb(img.data[p], img.data[p + 1], img.data[p + 2]);
};

describe('the green test (bible §8)', () => {
  it('matches the measured key range and spares the game greens', () => {
    const t = DEFAULT_GREEN_TEST;
    for (const c of [KEY, 0x00ff00, 0x17c100, 0x5afb21]) {
      assert.ok(passesGreenTest((c >> 16) & 255, (c >> 8) & 255, c & 255, t), hexOf(c));
    }
    // MANTA canopy, zone A terrain, a dark cell green, a pale cell green.
    for (const c of [0x40d070, 0x8ad0a8, 0x206030, 0xa0f0b0]) {
      assert.ok(!passesGreenTest((c >> 16) & 255, (c >> 8) & 255, c & 255, t), hexOf(c));
    }
  });
});

describe('sampleBorderKey', () => {
  it('takes the per-channel median of the border pixels that pass the test', () => {
    const img = scene(10, 10, [
      [0, 0, 3, 1, 0x3ef305],
      [3, 3, 4, 4, 0x203040],
    ]);
    const sampled = sampleBorderKey(img, DEFAULT_GREEN_TEST);
    assert.equal(sampled?.key, KEY);
    assert.equal(sampled?.border, 36);
  });

  it('ignores the subject where it touches the border', () => {
    const img = scene(10, 10, [[0, 0, 10, 2, 0x203040]]);
    assert.equal(sampleBorderKey(img, DEFAULT_GREEN_TEST)?.key, KEY);
  });

  it('returns null when nothing on the border looks like key', () => {
    assert.equal(sampleBorderKey(scene(4, 4, [], 0x808080), DEFAULT_GREEN_TEST), null);
  });
});

describe('keyRegion — green', () => {
  it('keys the background by flood fill and keeps an enclosed key-green window (never global)', () => {
    // A box with a 1-px navy outline around a key-green "glass".
    const img = scene(12, 12, [
      [2, 2, 8, 8, 0x141428],
      [3, 3, 6, 6, 0x5a7090],
      [5, 5, 2, 2, KEY],
    ]);
    const out = keyRegion(img, settings());
    assert.equal(out.key, KEY);
    assert.equal(alphaAt(out.image, 0, 0), 0);
    assert.equal(alphaAt(out.image, 5, 5), 255);
    assert.equal(colourAt(out.image, 5, 5), KEY);
    assert.equal(out.holes, 0);
  });

  it('does not leak through a diagonal step of a 1-px outline (4-connected fill)', () => {
    const img = scene(8, 8, [], KEY);
    // A diagonal outline from (0,3) to (3,0) with the corner behind it closed.
    for (let k = 0; k < 4; k++) putRgba(img, (3 - k) * 8 + k, 0x141428, 255);
    putRgba(img, 0, 0x5a7090, 255);
    putRgba(img, 1, 0x5a7090, 255);
    putRgba(img, 8, 0x5a7090, 255);
    // (1,1) is key-green behind the outline, touching the outside only diagonally at (2,2).
    const out = keyRegion(img, settings());
    assert.equal(alphaAt(out.image, 2, 2), 0);
    assert.equal(alphaAt(out.image, 1, 1), 255, 'not keyed across the diagonal step');
  });

  it('keys enclosed holes with holes.auto, above the minimum area only', () => {
    const img = scene(30, 20, [
      [2, 2, 26, 16, 0x141428],
      [4, 4, 8, 8, KEY],
      [16, 4, 2, 2, KEY],
    ]);
    const out = keyRegion(img, settings({ holes: { auto: true, minArea: 16, seeds: [] } }));
    assert.equal(alphaAt(out.image, 6, 6), 0, 'the 8×8 hole is keyed');
    assert.equal(alphaAt(out.image, 16, 4), 255, 'the 2×2 window is below the minimum area');
    assert.equal(out.holes, 64);
  });

  it('keys a hole from an explicit seed, and warns about a seed on the subject', () => {
    const img = scene(20, 12, [
      [2, 2, 16, 8, 0x141428],
      [4, 4, 3, 3, KEY],
      [12, 4, 3, 3, KEY],
    ]);
    const out = keyRegion(
      img,
      settings({
        holes: {
          auto: false,
          minArea: 64,
          seeds: [
            [13, 5],
            [3, 3],
          ],
        },
      }),
    );
    assert.equal(alphaAt(out.image, 13, 5), 0);
    assert.equal(alphaAt(out.image, 5, 5), 255);
    assert.equal(out.holes, 9);
    assert.match(out.warnings.join('\n'), /seed \[3, 3\] is not a key pixel/);
  });

  it('despills a green fringe near the key and leaves the inside alone', () => {
    const fringe = 0x2c8a12; // a dark outline blended into the key: fails the key test
    const img = scene(16, 16, [
      [3, 3, 10, 10, fringe],
      [4, 4, 8, 8, 0x5a7090],
      [7, 7, 2, 2, 0x30a020],
    ]);
    const out = keyRegion(img, settings({ despill: 2 }));
    const c = colourAt(out.image, 3, 3);
    assert.equal(c, 0x2c2c12, 'G clamped to max(R, B)');
    assert.equal(colourAt(out.image, 7, 7), 0x30a020, 'a green 4 px inside is not touched');
    assert.ok(out.despilled >= 36);
  });

  it('removes small islands and thin spurs (minIsland, open)', () => {
    const img = scene(20, 12, [
      [2, 2, 8, 8, 0x5a7090],
      [16, 8, 2, 2, 0xf08020],
      [10, 5, 4, 1, 0x5a7090],
    ]);
    const islands = keyRegion(img, settings({ minIsland: 5 }));
    assert.equal(alphaAt(islands.image, 16, 8), 0);
    assert.equal(islands.removed, 4);
    assert.equal(alphaAt(islands.image, 12, 5), 255, 'the spur is attached to the body');
    const opened = keyRegion(img, settings({ open: 1 }));
    assert.equal(alphaAt(opened.image, 12, 5), 0, 'a 1-px spur does not survive an opening');
    assert.equal(alphaAt(opened.image, 5, 5), 255);
  });

  it('uses an explicit key colour and tolerance', () => {
    const img = scene(6, 6, [[2, 2, 2, 2, 0x203040]], 0x00ff00);
    const near = keyRegion(img, settings({ color: 0x00ff00, tolerance: 10 }));
    assert.equal(near.key, 0x00ff00);
    assert.equal(alphaAt(near.image, 0, 0), 0);
    const far = keyRegion(img, settings({ color: KEY, tolerance: 10 }));
    assert.equal(
      alphaAt(far.image, 0, 0),
      255,
      'the background is not within tolerance of the key',
    );
  });

  it('throws when no key colour is on the border', () => {
    assert.throws(() => keyRegion(scene(4, 4, [], 0x808080), settings()), /no key colour/);
  });

  it('warns when the subject covers most of the border', () => {
    const img = scene(10, 10, [[0, 0, 10, 9, 0x203040]]);
    assert.match(keyRegion(img, settings()).warnings.join('\n'), /touch the border/);
  });
});

describe('keyRegion — black, none, alpha', () => {
  it('black key: alpha is the brightness, the colour is un-premultiplied', () => {
    const img = scene(
      3,
      1,
      [
        [0, 0, 1, 1, 0x402060],
        [1, 0, 1, 1, 0x050505],
        [2, 0, 1, 1, 0xffffff],
      ],
      0,
    );
    const out = keyRegion(img, settings({ mode: 'black' }));
    assert.equal(alphaAt(out.image, 0, 0), 0x60);
    assert.equal(colourAt(out.image, 0, 0), packRgb(170, 85, 255));
    assert.equal(alphaAt(out.image, 1, 0), 0, 'below the threshold');
    assert.equal(alphaAt(out.image, 2, 0), 255);
  });

  it('none: everything opaque; alpha: the source alpha, with cleanup', () => {
    const img = scene(4, 4, [], 0x123456);
    img.data[3] = 0;
    assert.equal(alphaAt(keyRegion(img, settings({ mode: 'none' })).image, 0, 0), 255);
    img.data[7] = 100;
    const out = keyRegion(img, settings({ mode: 'alpha' }));
    assert.equal(alphaAt(out.image, 0, 0), 0);
    assert.equal(alphaAt(out.image, 1, 0), 100);
    assert.equal(alphaAt(out.image, 2, 2), 255);
  });
});
