/**
 * `scripts/assets/interim.mjs` — the interim art stage's scaler (plan_resolution.md R2-01,
 * decisions W4-4 / W4-5): nearest-neighbour sizes `⌈s·w⌉ × ⌈s·h⌉` for odd and even sizes, the
 * sampling `⌊d / s⌋` (= `⌊2d / 3⌋` at 3/2), anchors `⌈s·a⌉`, every channel kept, scale 1 the
 * identity, the font's cell, line and advances scaled with its glyphs, and bad scales refused.
 */
import { describe, expect, it } from 'vitest';
import { buildFontSprite, parseFontSource } from '../../../scripts/assets/font.mjs';
import {
  createImage,
  getPixel,
  imagesEqual,
  setPixel,
  type Image,
} from '../../../scripts/assets/image.mjs';
import {
  parseArtScale,
  scaleAnchor,
  scaleFont,
  scaleImage,
  scaleLength,
  scaleSprite,
} from '../../../scripts/assets/interim.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

/**
 * An image whose every pixel has its own colour: red = column, green = row, blue = 7, alpha a
 * per-pixel value (so a sampled pixel tells exactly which source pixel it came from).
 *
 * @param w - Width.
 * @param h - Height.
 * @returns The image.
 */
function coordinates(w: number, h: number): Image {
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) setPixel(image, x, y, [x, y, 7, 255 - ((x * 13 + y * 7) % 200)]);
  }
  return image;
}

describe('scripts/assets/interim — parseArtScale', () => {
  it('reads a scale as its exact fraction in lowest terms', () => {
    expect(parseArtScale(1)).toEqual({ num: 1, den: 1 });
    expect(parseArtScale(1.5)).toEqual({ num: 3, den: 2 });
    expect(parseArtScale(3 / 2)).toEqual({ num: 3, den: 2 });
    expect(parseArtScale(2)).toEqual({ num: 2, den: 1 });
    expect(parseArtScale(4 / 3)).toEqual({ num: 4, den: 3 });
    expect(parseArtScale(0.5)).toEqual({ num: 1, den: 2 });
  });

  it('refuses a non-positive, non-finite or non-fraction scale with a RangeError', () => {
    for (const bad of [0, -1, -1.5, Number.NaN, Number.POSITIVE_INFINITY, Math.SQRT2]) {
      expect(() => parseArtScale(bad), String(bad)).toThrow(RangeError);
    }
    expect(() => parseArtScale('1.5' as unknown as number)).toThrow(RangeError);
    for (const bad of [0, -1.5]) {
      expect(() => scaleImage(createImage(2, 2), bad), String(bad)).toThrow(RangeError);
      expect(() => scaleLength(4, bad), String(bad)).toThrow(RangeError);
    }
  });
});

describe('scripts/assets/interim — scaleLength / scaleAnchor', () => {
  it('rounds up: ⌈1.5 · n⌉', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16].map((n) => scaleLength(n, 1.5))).toEqual([
      0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 24,
    ]);
    expect(scaleLength(-3, 1.5)).toBe(-4); // ⌈−4.5⌉
    expect(scaleLength(7, 1)).toBe(7);
    expect(scaleLength(5, 2)).toBe(10);
    expect(() => scaleLength(2.5, 1.5)).toThrow(RangeError);
  });

  it('scales an explicit anchor and keeps the default (null) for the pipeline', () => {
    expect(scaleAnchor([8, 3], 1.5)).toEqual([12, 5]);
    expect(scaleAnchor([0, 0], 1.5)).toEqual([0, 0]);
    expect(scaleAnchor([5, 1], 1)).toEqual([5, 1]);
    expect(scaleAnchor(null, 1.5)).toBeNull();
  });
});

describe('scripts/assets/interim — scaleImage', () => {
  it('sizes odd and even images ⌈1.5 · w⌉ × ⌈1.5 · h⌉', () => {
    for (const [w, h, sw, sh] of [
      [1, 1, 2, 2],
      [2, 3, 3, 5],
      [6, 8, 9, 12],
      [5, 7, 8, 11],
      [16, 9, 24, 14],
    ]) {
      const out = scaleImage(createImage(w, h), 1.5);
      expect([out.width, out.height], `${w}×${h}`).toEqual([sw, sh]);
    }
  });

  it('samples source pixel ⌊2d / 3⌋ on both axes, every channel (alpha included) kept', () => {
    for (const [w, h] of [
      [5, 7],
      [6, 8],
      [1, 3],
    ]) {
      const source = coordinates(w, h);
      const out = scaleImage(source, 1.5);
      for (let y = 0; y < out.height; y++) {
        for (let x = 0; x < out.width; x++) {
          const sx = Math.floor((2 * x) / 3);
          const sy = Math.floor((2 * y) / 3);
          expect(getPixel(out, x, y), `${w}×${h} at ${x},${y}`).toEqual(getPixel(source, sx, sy));
        }
      }
    }
  });

  it('keeps transparent pixels transparent and partial alpha exact', () => {
    const image = createImage(2, 1);
    setPixel(image, 1, 0, [10, 20, 30, 77]);
    const out = scaleImage(image, 1.5);
    expect([0, 1, 2].map((x) => getPixel(out, x, 0))).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [10, 20, 30, 77],
    ]);
  });

  it('is the identity at scale 1, and never modifies its input', () => {
    const source = coordinates(5, 4);
    const copy = { ...source, data: source.data.slice() };
    const same = scaleImage(source, 1);
    expect(same).not.toBe(source);
    expect(imagesEqual(same, source)).toBe(true);
    scaleImage(source, 1.5);
    expect(imagesEqual(source, copy)).toBe(true);
  });

  it('doubles every pixel at scale 2', () => {
    const source = coordinates(3, 2);
    const out = scaleImage(source, 2);
    expect([out.width, out.height]).toEqual([6, 4]);
    expect(getPixel(out, 5, 3)).toEqual(getPixel(source, 2, 1));
    expect(getPixel(out, 2, 1)).toEqual(getPixel(source, 1, 0));
  });
});

describe('scripts/assets/interim — scaleSprite', () => {
  it('scales frames and the explicit anchor; keeps name, animations and metadata', () => {
    const sprite: SpriteDef = {
      name: 'ships/test',
      anchor: [3, 1],
      hitFlash: true,
      frames: [coordinates(5, 3), coordinates(5, 3)],
      animations: { idle: [0, 1] },
      origin: 'procedural:test',
    };
    const out = scaleSprite(sprite, 1.5);
    expect(out).toMatchObject({
      name: 'ships/test',
      anchor: [5, 2],
      hitFlash: true,
      animations: { idle: [0, 1] },
      origin: 'procedural:test',
    });
    expect(out.frames.map((f) => [f.width, f.height])).toEqual([
      [8, 5],
      [8, 5],
    ]);
    expect(sprite.frames[0].width).toBe(5);
    expect(scaleSprite({ ...sprite, anchor: null }, 1.5).anchor).toBeNull();
  });
});

describe('scripts/assets/interim — scaleFont (W4-4)', () => {
  it('scales the cell, the line height, every advance and every glyph frame', () => {
    const { font, issues } = parseFontSource(
      {
        name: 'tiny',
        cellWidth: 6,
        cellHeight: 8,
        lineHeight: 10,
        advance: 6,
        glyphs: {
          A: ['.###..', '#...#.', '#...#.', '#####.', '#...#.', '#...#.', '#...#.', '......'],
          i: {
            rows: ['..#...', '......', '.##...', '..#...', '..#...', '..#...', '.###..', '......'],
            advance: 3,
          },
        },
      },
      'tiny.font.json',
    );
    expect(issues).toEqual([]);
    if (font === null) return;
    const built = buildFontSprite(font);
    const scaled = scaleFont(built, 1.5);
    expect(scaled.metrics).toEqual({
      sprite: 'font/tiny',
      lineHeight: 15,
      cellWidth: 9,
      cellHeight: 12,
      glyphs: {
        '65': { frame: 'font/tiny#0', advance: 9 },
        '105': { frame: 'font/tiny#1', advance: 5 },
      },
    });
    expect(scaled.sprite.name).toBe('font/tiny');
    expect(scaled.sprite.anchor).toEqual([0, 0]);
    expect(scaled.sprite.frames.map((f) => [f.width, f.height])).toEqual([
      [9, 12],
      [9, 12],
    ]);
    expect(imagesEqual(scaled.sprite.frames[0], scaleImage(built.sprite.frames[0], 1.5))).toBe(
      true,
    );
    // The input is untouched, and scale 1 gives the font back unchanged.
    expect(built.metrics.cellWidth).toBe(6);
    const same = scaleFont(built, 1);
    expect(same.metrics).toEqual(built.metrics);
    same.sprite.frames.forEach((f, i) => expect(imagesEqual(f, built.sprite.frames[i])).toBe(true));
  });
});
