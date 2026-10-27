/**
 * `scripts/assets/resample.mjs` (v20x-A2, the store/icon key-art pipeline): the fractional-box
 * area downscale, the contain fit with a one-colour pad, the deterministic median-cut palette and
 * the nearest-entry quantiser. Acceptance: downscales average exactly (whole blocks, half-pixel
 * edges, `Math.round` half up), the module never enlarges, an image of at most the cap colours
 * quantises losslessly, a larger one lands inside the cap and survives an indexed-PNG round trip,
 * and every operation re-renders byte-identically (fixed accumulation orders and tie-breaks).
 */
import { describe, expect, it } from 'vitest';
import { createImage, setPixel, type Image, type Rgba } from '../../../scripts/assets/image.mjs';
import { decodePng, encodePng } from '../../../scripts/assets/png.mjs';
import {
  downscaleArea,
  fitContain,
  medianCutPalette,
  quantize,
} from '../../../scripts/assets/resample.mjs';

const RED: Rgba = [0xff, 0, 0, 0xff];
const GREEN: Rgba = [0, 0xff, 0, 0xff];
const BLUE: Rgba = [0, 0, 0xff, 0xff];
const BLACK: Rgba = [0, 0, 0, 0xff];
const WHITE: Rgba = [0xff, 0xff, 0xff, 0xff];

/**
 * A `width × height` image where every pixel is `f(x, y)` (an RGBA quad).
 *
 * @param width - Columns.
 * @param height - Rows.
 * @param f - The pixel at (x, y).
 * @returns The image.
 */
function paint(width: number, height: number, f: (x: number, y: number) => Rgba): Image {
  const image = createImage(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) setPixel(image, x, y, f(x, y));
  return image;
}

/**
 * The distinct RGBA colours of an image, as `r,g,b,a` texts, sorted.
 *
 * @param image - The image.
 * @returns One text per colour.
 */
function colourSet(image: Image): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < image.data.length; i += 4) {
    seen.add(`${image.data[i]},${image.data[i + 1]},${image.data[i + 2]},${image.data[i + 3]}`);
  }
  return [...seen].sort();
}

describe('scripts/assets/resample — downscaleArea', () => {
  it('copies an image of the same size', () => {
    const source = paint(4, 3, (x, y) => ((x + y) % 2 === 0 ? RED : BLUE));
    const out = downscaleArea(source, 4, 3);
    expect(Buffer.from(out.data).equals(Buffer.from(source.data))).toBe(true);
  });

  it('averages whole blocks exactly', () => {
    // Four quadrants of two colours: each 2×2 output pixel is one quadrant's mean.
    const source = paint(4, 4, (x, y) => (x < 2 ? (y < 2 ? RED : GREEN) : y < 2 ? BLACK : WHITE));
    const out = downscaleArea(source, 2, 2);
    const at = (x: number, y: number): Rgba => [
      out.data[(y * 2 + x) * 4],
      out.data[(y * 2 + x) * 4 + 1],
      out.data[(y * 2 + x) * 4 + 2],
      out.data[(y * 2 + x) * 4 + 3],
    ];
    expect(at(0, 0)).toEqual(RED);
    expect(at(0, 1)).toEqual(GREEN);
    expect(at(1, 0)).toEqual(BLACK);
    expect(at(1, 1)).toEqual(WHITE);
  });

  it('rounds half up on an exact half', () => {
    // 10 and 11 over equal weights: 10.5 → 11 (Math.round, the documented half-up tie).
    const source = paint(2, 1, (x) => [x === 0 ? 10 : 11, 0, 0, 0xff]);
    const out = downscaleArea(source, 1, 1);
    expect(out.data[0]).toBe(11);
    expect(out.data[3]).toBe(0xff);
  });

  it('refuses to enlarge and to take a non-integer target', () => {
    const source = createImage(4, 4);
    expect(() => downscaleArea(source, 5, 4)).toThrow(RangeError);
    expect(() => downscaleArea(source, 2.5, 2)).toThrow(RangeError);
    expect(() => downscaleArea(source, 4, 0)).toThrow(RangeError);
  });

  it('re-renders the same bytes on an awkward ratio', () => {
    const source = paint(64, 64, (x, y) => [
      (x * 7 + y * 13) % 256,
      (x * 31 + y * 17) % 256,
      (x * 53 + y * 5) % 256,
      0xff,
    ]);
    const a = downscaleArea(source, 37, 23);
    const b = downscaleArea(source, 37, 23);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect([a.width, a.height]).toEqual([37, 23]);
  });
});

describe('scripts/assets/resample — fitContain', () => {
  it('fills the box when the aspect already matches', () => {
    const source = paint(8, 8, () => RED);
    const out = fitContain(source, 4, 4, BLUE);
    expect([out.width, out.height]).toEqual([4, 4]);
    expect(colourSet(out)).toEqual(['255,0,0,255']);
  });

  it('pads the shorter axis and centres the picture', () => {
    const source = paint(8, 8, () => RED);
    const out = fitContain(source, 6, 4, BLUE); // scale 1/2 → 4×4, one blue column each side
    expect([out.width, out.height]).toEqual([6, 4]);
    const pixel = (x: number, y: number): string => {
      const i = (y * 6 + x) * 4;
      return `${out.data[i]},${out.data[i + 1]},${out.data[i + 2]},${out.data[i + 3]}`;
    };
    expect(pixel(0, 0)).toBe('0,0,255,255');
    expect(pixel(1, 2)).toBe('255,0,0,255');
    expect(pixel(5, 3)).toBe('0,0,255,255');
  });

  it('refuses a box larger than the source on both axes', () => {
    expect(() => fitContain(createImage(4, 4), 8, 6, BLUE)).toThrow(RangeError);
  });
});

describe('scripts/assets/resample — medianCutPalette and quantize', () => {
  it('is lossless below the cap', () => {
    const source = paint(4, 4, (x, y) => (x < 2 ? (y < 2 ? RED : GREEN) : y < 2 ? BLUE : BLACK));
    const palette = medianCutPalette(source, 8);
    expect(palette.length).toBe(4);
    const out = quantize(source, palette);
    expect(Buffer.from(out.data).equals(Buffer.from(source.data))).toBe(true);
  });

  it('sorts the palette by packed key', () => {
    const source = paint(2, 2, (x, y) => ((x + y) % 2 === 0 ? WHITE : BLACK));
    const palette = medianCutPalette(source, 8);
    const packed = palette.map((c) => ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0);
    expect(packed).toEqual([...packed].sort((a, b) => a - b));
  });

  it('maps to the nearest entry with the documented tie', () => {
    const greys = paint(3, 1, (x) => {
      const v = x === 0 ? 127 : x === 1 ? 128 : 0;
      return [v, v, v, 0xff];
    });
    const out = quantize(greys, [BLACK, WHITE]);
    expect(out.data[0]).toBe(0); // 127 → black
    expect(out.data[4]).toBe(0xff); // 128 → white (127² < 128²)
  });

  it('brings a wide-gamut image inside the cap and through an indexed PNG', () => {
    // 24×24 pixels, far more than 256 distinct colours.
    const source = paint(24, 24, (x, y) => [
      (x * 2654435761 + y * 40503) & 0xff,
      (x * 2246822519 + y * 3266489917) & 0xff,
      (x * 668265263 + y * 2246822519) & 0xff,
      0xff,
    ]);
    expect(colourSet(source).length).toBeGreaterThan(256);
    const palette = medianCutPalette(source, 256);
    expect(palette.length).toBeLessThanOrEqual(256);
    const out = quantize(source, palette);
    expect(colourSet(out).length).toBeLessThanOrEqual(256);
    // The palette colours are exactly the quantised image's colours: lossless after quantising.
    const png = encodePng(out, { indexed: 'auto' });
    expect(Buffer.from(decodePng(png).data).equals(Buffer.from(out.data))).toBe(true);
    // A second run of the whole chain lands on the same bytes (no hidden order).
    const again = quantize(source, medianCutPalette(source, 256));
    expect(Buffer.from(again.data).equals(Buffer.from(out.data))).toBe(true);
  });

  it('refuses a cap or palette outside the indexed range', () => {
    expect(() => medianCutPalette(createImage(2, 2), 0)).toThrow(RangeError);
    expect(() => quantize(createImage(2, 2), [])).toThrow(RangeError);
  });
});
