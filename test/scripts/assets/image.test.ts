/**
 * `scripts/assets/image.mjs` — the RGBA raster helpers every pipeline stage builds on:
 * image creation, colour parsing, pixel access, blits, crops, flips, pixel maps and
 * equality. Error paths throw `RangeError` with the offending sizes in the message.
 */
import { describe, expect, it } from 'vitest';
import {
  blit,
  createImage,
  crop,
  flipHorizontal,
  flipVertical,
  getPixel,
  imageFromRows,
  imagesEqual,
  parseColor,
  setPixel,
  type Image,
} from '../../../scripts/assets/image.mjs';

/**
 * An image whose pixel (x, y) is `[x, y, x + y, 255]` — every pixel distinct.
 *
 * @param w - Width.
 * @param h - Height.
 * @returns The image.
 */
function ramp(w: number, h: number): Image {
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(image, x, y, [x, y, x + y, 255]);
  return image;
}

describe('scripts/assets/image — createImage', () => {
  it('creates a transparent width × height × 4 buffer', () => {
    const image = createImage(3, 2);
    expect(image.width).toBe(3);
    expect(image.height).toBe(2);
    expect(image.data).toBeInstanceOf(Uint8Array);
    expect(image.data).toHaveLength(24);
    expect(image.data.every((b) => b === 0)).toBe(true);
  });

  it.each([
    [0, 1],
    [1, 0],
    [-1, 4],
    [1.5, 2],
    [Number.NaN, 2],
    [2, Number.POSITIVE_INFINITY],
  ])('rejects %s×%s', (w, h) => {
    expect(() => createImage(w, h)).toThrow(RangeError);
    expect(() => createImage(w, h)).toThrow('image size must be positive integers');
  });
});

describe('scripts/assets/image — parseColor', () => {
  it.each([
    ['#fff', [255, 255, 255, 255]],
    ['#FFF', [255, 255, 255, 255]],
    ['#0f08', [0, 255, 0, 136]],
    ['#1b2a4a', [27, 42, 74, 255]],
    ['#1B2A4A', [27, 42, 74, 255]],
    ['#00ff0080', [0, 255, 0, 128]],
    ['#00000000', [0, 0, 0, 0]],
  ])('parses %s', (text, rgba) => {
    expect(parseColor(text)).toEqual(rgba);
  });

  it.each([
    ['empty', ''],
    ['no hash', 'ffffff'],
    ['two digits', '#ff'],
    ['five digits', '#fffff'],
    ['seven digits', '#fffffff'],
    ['nine digits', '#fffffffff'],
    ['a non-hex digit', '#ggg'],
    ['a colour name', 'red'],
    ['surrounding space', ' #fff'],
    ['a trailing newline', '#fff\n'],
    ['rgb() syntax', 'rgb(1,2,3)'],
  ])('returns null for %s', (_label, text) => {
    expect(parseColor(text)).toBeNull();
  });

  it('returns null for non-strings', () => {
    for (const value of [null, undefined, 0xffffff, ['#fff'], { r: 1 }]) {
      expect(parseColor(value as unknown as string)).toBeNull();
    }
  });
});

describe('scripts/assets/image — pixel access', () => {
  it('writes and reads back one pixel without touching its neighbours', () => {
    const image = createImage(3, 3);
    setPixel(image, 1, 1, [1, 2, 3, 4]);
    expect(getPixel(image, 1, 1)).toEqual([1, 2, 3, 4]);
    expect(Array.from(image.data).filter((b) => b !== 0)).toEqual([1, 2, 3, 4]);
    expect(image.data.slice(16, 20)).toEqual(Uint8Array.of(1, 2, 3, 4)); // row-major
  });

  it('ignores writes outside the image and reads transparent there', () => {
    const image = createImage(2, 2);
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [2, 0],
      [0, 2],
      [5, 5],
    ]) {
      setPixel(image, x, y, [9, 9, 9, 9]);
      expect(getPixel(image, x, y)).toEqual([0, 0, 0, 0]);
    }
    expect(image.data.every((b) => b === 0)).toBe(true);
  });

  it('returns a fresh array from getPixel (callers may keep it)', () => {
    const image = ramp(2, 2);
    const pixel = getPixel(image, 1, 0);
    pixel[0] = 200;
    expect(getPixel(image, 1, 0)).toEqual([1, 0, 1, 255]);
  });
});

describe('scripts/assets/image — blit and crop', () => {
  it('copies a sub-rectangle to the given position', () => {
    const target = createImage(4, 4);
    blit(target, ramp(3, 3), 1, 2, 1, 1, 2, 2);
    expect(getPixel(target, 1, 2)).toEqual([1, 1, 2, 255]);
    expect(getPixel(target, 2, 3)).toEqual([2, 2, 4, 255]);
    expect(getPixel(target, 0, 2)).toEqual([0, 0, 0, 0]);
    expect(getPixel(target, 3, 3)).toEqual([0, 0, 0, 0]);
  });

  it('defaults to the rest of the source from (sx, sy)', () => {
    const target = createImage(3, 3);
    blit(target, ramp(3, 3), 0, 0, 1, 2);
    expect(getPixel(target, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(getPixel(target, 1, 0)).toEqual([2, 2, 4, 255]);
    expect(getPixel(target, 0, 1)).toEqual([0, 0, 0, 0]);
  });

  it('replaces pixels (no blending), including with transparency', () => {
    const target = ramp(2, 1);
    blit(target, createImage(1, 1), 1, 0);
    expect(getPixel(target, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(target, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it.each([
    ['a negative destination', 4, 4, -1, 0, 0, 0, 2, 2],
    ['a destination overhang', 4, 4, 3, 0, 0, 0, 2, 2],
    ['a negative source', 4, 4, 0, 0, -1, 0, 2, 2],
    ['a source overhang', 4, 4, 0, 0, 2, 2, 2, 2],
    ['a rectangle taller than the target', 4, 1, 0, 0, 0, 0, 1, 2],
  ])('throws a RangeError for %s', (_label, tw, th, dx, dy, sx, sy, w, h) => {
    const target = createImage(tw, th);
    const before = Buffer.from(target.data);
    expect(() => blit(target, ramp(3, 3), dx, dy, sx, sy, w, h)).toThrow(RangeError);
    expect(Buffer.from(target.data)).toEqual(before); // nothing half-copied
  });

  it('crop returns an independent copy of the rectangle', () => {
    const source = ramp(4, 3);
    const piece = crop(source, 1, 1, 2, 2);
    expect([piece.width, piece.height]).toEqual([2, 2]);
    expect(getPixel(piece, 0, 0)).toEqual([1, 1, 2, 255]);
    expect(getPixel(piece, 1, 1)).toEqual([2, 2, 4, 255]);
    setPixel(piece, 0, 0, [0, 0, 0, 0]);
    expect(getPixel(source, 1, 1)).toEqual([1, 1, 2, 255]);
  });

  it('crop rejects empty rectangles and rectangles that leave the image', () => {
    const source = ramp(4, 3);
    expect(() => crop(source, 0, 0, 0, 1)).toThrow(RangeError);
    expect(() => crop(source, 3, 0, 2, 1)).toThrow(RangeError);
    expect(() => crop(source, 0, -1, 1, 1)).toThrow(RangeError);
  });
});

describe('scripts/assets/image — flips', () => {
  it('mirrors left ↔ right and top ↔ bottom without modifying the source', () => {
    const source = ramp(3, 2);
    const copy = Buffer.from(source.data);
    const h = flipHorizontal(source);
    const v = flipVertical(source);
    expect(Buffer.from(source.data)).toEqual(copy);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 3; x++) {
        expect(getPixel(h, x, y)).toEqual(getPixel(source, 2 - x, y));
        expect(getPixel(v, x, y)).toEqual(getPixel(source, x, 1 - y));
      }
    }
  });

  it('are involutions and commute', () => {
    const source = ramp(5, 4);
    expect(imagesEqual(flipHorizontal(flipHorizontal(source)), source)).toBe(true);
    expect(imagesEqual(flipVertical(flipVertical(source)), source)).toBe(true);
    expect(
      imagesEqual(flipHorizontal(flipVertical(source)), flipVertical(flipHorizontal(source))),
    ).toBe(true);
  });

  it('leave a 1×1 image unchanged', () => {
    const one = ramp(1, 1);
    expect(imagesEqual(flipHorizontal(one), one)).toBe(true);
    expect(imagesEqual(flipVertical(one), one)).toBe(true);
  });
});

describe('scripts/assets/image — imageFromRows', () => {
  it('draws one pixel per character; null and unknown characters stay transparent', () => {
    const image = imageFromRows(['ab?', '.a.'], {
      a: [255, 0, 0, 255],
      b: [0, 0, 255, 128],
      '.': null,
    });
    expect([image.width, image.height]).toEqual([3, 2]);
    expect(getPixel(image, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(image, 1, 0)).toEqual([0, 0, 255, 128]);
    expect(getPixel(image, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(image, 0, 1)).toEqual([0, 0, 0, 0]);
    expect(getPixel(image, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it('keeps straight alpha (colour channels are not premultiplied)', () => {
    const image = imageFromRows(['x'], { x: [200, 100, 50, 1] });
    expect(getPixel(image, 0, 0)).toEqual([200, 100, 50, 1]);
  });
});

describe('scripts/assets/image — imagesEqual', () => {
  it('compares size and bytes', () => {
    expect(imagesEqual(ramp(3, 2), ramp(3, 2))).toBe(true);
    expect(imagesEqual(createImage(2, 3), createImage(3, 2))).toBe(false);
    expect(imagesEqual(createImage(1, 4), createImage(2, 2))).toBe(false); // same byte count
    const changed = ramp(3, 2);
    changed.data[changed.data.length - 1] = 254;
    expect(imagesEqual(ramp(3, 2), changed)).toBe(false);
  });
});
