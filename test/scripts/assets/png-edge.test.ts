/**
 * `scripts/assets/png.mjs` edge cases: the encoder's per-row filter choice (each of the
 * five PNG filters wins where it should, and every choice round-trips), CRC coverage, and
 * the decoder on the PNG flavours real art arrives in — indexed colour with `tRNS`, low
 * bit-depth greyscale, 16-bit samples, Adam7 interlacing — plus corrupt input and byte
 * views with an offset. The decoder inputs are hand-assembled here, independent of both
 * our encoder and pngjs' writer.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createImage, type Image } from '../../../scripts/assets/image.mjs';
import { PNG_SIGNATURE, crc32, decodePng, encodePng } from '../../../scripts/assets/png.mjs';
import { createAssetRng } from '../../../scripts/assets/rng.mjs';

/**
 * Builds one PNG chunk.
 *
 * @param type - Chunk type.
 * @param data - Payload.
 * @returns The chunk bytes.
 */
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** The Adam7 passes: start column, start row, column step, row step. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

/**
 * Assembles a PNG from sample rows (filter type 0 everywhere).
 *
 * @param options - Header fields and the image as rows of samples.
 * @param options.width - Width in pixels.
 * @param options.height - Height in pixels.
 * @param options.colorType - PNG colour type (0, 2, 3, 4, 6).
 * @param options.bitDepth - Bits per sample.
 * @param options.channels - Samples per pixel for this colour type.
 * @param options.sample - Sample value of channel `c` of pixel (x, y).
 * @param options.interlace - Adam7 interlacing.
 * @param options.extra - Chunks to insert before IDAT (PLTE, tRNS).
 * @returns The PNG file bytes.
 */
function assemble(options: {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  channels: number;
  sample: (x: number, y: number, c: number) => number;
  interlace?: boolean;
  extra?: Buffer[];
}): Buffer {
  const { width, height, colorType, bitDepth, channels, sample } = options;
  /**
   * Packs one scanline of the given pixel columns.
   *
   * @param y - Row.
   * @param xs - Columns in order.
   * @returns Filter byte 0 + packed samples.
   */
  const scanline = (y: number, xs: number[]): number[] => {
    const bits: number[] = [];
    for (const x of xs) {
      for (let c = 0; c < channels; c++) {
        const value = sample(x, y, c);
        for (let b = bitDepth - 1; b >= 0; b--) bits.push((value >> b) & 1);
      }
    }
    while (bits.length % 8 !== 0) bits.push(0);
    const bytes: number[] = [0];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
      bytes.push(byte);
    }
    return bytes;
  };
  const raw: number[] = [];
  const columns = (from: number, step: number): number[] => {
    const xs: number[] = [];
    for (let x = from; x < width; x += step) xs.push(x);
    return xs;
  };
  if (options.interlace === true) {
    for (const [x0, y0, dx, dy] of ADAM7) {
      const xs = columns(x0, dx);
      if (xs.length === 0) continue;
      for (let y = y0; y < height; y += dy) raw.push(...scanline(y, xs));
    }
  } else {
    for (let y = 0; y < height; y++) raw.push(...scanline(y, columns(0, 1)));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colorType;
  header[12] = options.interlace === true ? 1 : 0;
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    chunk('IHDR', header),
    ...(options.extra ?? []),
    chunk('IDAT', deflateSync(Uint8Array.from(raw))),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/**
 * The filter-type byte of every scanline of one of our PNGs.
 *
 * @param png - PNG produced by `encodePng` (single IDAT).
 * @param image - The encoded image (for the stride).
 * @returns Filter types, one per row.
 */
function filterTypes(png: Buffer, image: Image): number[] {
  const idatLength = png.readUInt32BE(33);
  expect(png.toString('latin1', 37, 41)).toBe('IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  const stride = image.width * 4 + 1;
  expect(raw.length).toBe(stride * image.height);
  return Array.from({ length: image.height }, (_, y) => raw[y * stride]);
}

/**
 * PNG Paeth predictor (reference).
 *
 * @param a - Left.
 * @param b - Up.
 * @param c - Up-left.
 * @returns Prediction.
 */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * A 16×6 image: random row 0, then one row per rule where a specific filter predicts
 * every byte exactly.
 *
 * @returns The image and the filter each row should get.
 */
function filterFixture(): { image: Image; expected: number[] } {
  const w = 16;
  const rows = 6;
  const image = createImage(w, rows);
  const rng = createAssetRng(77);
  const stride = w * 4;
  const d = image.data;
  for (let i = 0; i < stride; i++) d[i] = rng.rangeInt(0, 255); // row 0: noise
  const rule = (y: number, predict: (left: number, up: number, upLeft: number) => number): void => {
    for (let i = 0; i < stride; i++) {
      const at = y * stride + i;
      const left = i >= 4 ? d[at - 4] : rng.rangeInt(0, 255);
      const up = d[at - stride];
      const upLeft = i >= 4 ? d[at - stride - 4] : 0;
      d[at] = i >= 4 ? predict(left, up, upLeft) & 0xff : left;
    }
  };
  rule(1, (_l, up) => up); // Up
  rule(2, (l, up) => (l + up) >>> 1); // Average
  rule(3, (l, up, ul) => paeth(l, up, ul)); // Paeth
  rule(4, (l) => l); // Sub (repeats the first pixel)
  // Row 5 stays all zero: None (ties go to the lowest filter type).
  return { image, expected: [-1, 2, 3, 4, 1, 0] };
}

describe('scripts/assets/png — filter selection (edge)', () => {
  it('picks the filter that predicts a row exactly, and every row round-trips', () => {
    const { image, expected } = filterFixture();
    const png = encodePng(image);
    const types = filterTypes(png, image);
    expected.forEach((type, y) => {
      if (type >= 0) expect(types[y], `row ${y}`).toBe(type);
    });
    expect(decodePng(png)).toEqual(image);
  });

  it('only ever writes filter types 0–4 and round-trips seeded noise of odd widths', () => {
    for (const [w, h, seed] of [
      [1, 9, 1],
      [2, 2, 2],
      [13, 7, 3],
      [31, 5, 4],
    ]) {
      const image = createImage(w, h);
      const rng = createAssetRng(seed);
      // Mix of flat, gradient and noisy regions.
      for (let i = 0; i < image.data.length; i++) {
        image.data[i] = i % 3 === 0 ? rng.rangeInt(0, 255) : (i * 7) & 0xff;
      }
      const png = encodePng(image);
      for (const type of filterTypes(png, image)) expect(type >= 0 && type <= 4).toBe(true);
      expect(decodePng(png)).toEqual(image);
    }
  });

  it('keeps fully transparent pixels exactly (straight alpha, RGB preserved)', () => {
    const image = createImage(3, 1);
    image.data.set([10, 20, 30, 0, 255, 255, 255, 0, 1, 2, 3, 1]);
    expect(Array.from(decodePng(encodePng(image)).data)).toEqual(Array.from(image.data));
  });

  it('writes the image size into IHDR as big-endian 32-bit values', () => {
    const png = encodePng(createImage(300, 2));
    expect(png.readUInt32BE(8)).toBe(13); // IHDR length
    expect(png.readUInt32BE(16)).toBe(300);
    expect(png.readUInt32BE(20)).toBe(2);
    expect(png.subarray(png.length - 12)).toEqual(chunk('IEND', new Uint8Array(0)));
  });

  it('never mutates the image it encodes', () => {
    const { image } = filterFixture();
    const before = Buffer.from(image.data);
    encodePng(image);
    expect(Buffer.from(image.data)).toEqual(before);
  });
});

describe('scripts/assets/png — crc32 (edge)', () => {
  it('matches known CRC-32 values', () => {
    expect(crc32(Uint8Array.of(0))).toBe(0xd202ef8d);
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(
      0x414fa339,
    );
  });

  it('is incremental over any split point', () => {
    const bytes = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
    const whole = crc32(bytes);
    for (let split = 0; split <= bytes.length; split++) {
      expect(crc32(bytes.subarray(split), crc32(bytes.subarray(0, split)))).toBe(whole);
    }
  });
});

describe('scripts/assets/png — decodePng on real-art flavours', () => {
  it('expands an indexed PNG with a tRNS chunk (Aseprite exports) to RGBA', () => {
    const palette = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const png = assemble({
      width: 3,
      height: 1,
      colorType: 3,
      bitDepth: 8,
      channels: 1,
      sample: (x) => x,
      extra: [chunk('PLTE', palette), chunk('tRNS', Uint8Array.of(0, 128))],
    });
    expect(Array.from(decodePng(png).data)).toEqual([255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255]);
  });

  it('expands a 2-bit indexed PNG (sub-byte samples, row padding)', () => {
    const palette = Buffer.from([0, 0, 0, 10, 10, 10, 20, 20, 20, 30, 30, 30]);
    const png = assemble({
      width: 5,
      height: 2,
      colorType: 3,
      bitDepth: 2,
      channels: 1,
      sample: (x, y) => (x + y) % 4,
      extra: [chunk('PLTE', palette)],
    });
    const image = decodePng(png);
    expect([image.width, image.height]).toEqual([5, 2]);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 5; x++) {
        const v = ((x + y) % 4) * 10;
        expect(Array.from(image.data.subarray((y * 5 + x) * 4, (y * 5 + x) * 4 + 4))).toEqual([
          v,
          v,
          v,
          255,
        ]);
      }
    }
  });

  it('rescales 1-bit greyscale to 0 / 255', () => {
    const png = assemble({
      width: 9,
      height: 1,
      colorType: 0,
      bitDepth: 1,
      channels: 1,
      sample: (x) => x % 2,
    });
    const grey = Array.from({ length: 9 }, (_, x) => decodePng(png).data[x * 4]);
    expect(grey).toEqual([0, 255, 0, 255, 0, 255, 0, 255, 0]);
  });

  it('rescales 16-bit RGBA samples to 8 bits', () => {
    const png = assemble({
      width: 2,
      height: 1,
      colorType: 6,
      bitDepth: 16,
      channels: 4,
      sample: (x, _y, c) =>
        [
          [0x0000, 0xffff, 0x8080, 0xffff],
          [0x1111, 0x2222, 0x3333, 0x0000],
        ][x][c],
    });
    expect(Array.from(decodePng(png).data)).toEqual([0, 255, 128, 255, 17, 34, 51, 0]);
  });

  it('decodes greyscale + alpha and RGB without alpha', () => {
    const ga = assemble({
      width: 1,
      height: 1,
      colorType: 4,
      bitDepth: 8,
      channels: 2,
      sample: (_x, _y, c) => [90, 40][c],
    });
    expect(Array.from(decodePng(ga).data)).toEqual([90, 90, 90, 40]);
    const rgb = assemble({
      width: 1,
      height: 1,
      colorType: 2,
      bitDepth: 8,
      channels: 3,
      sample: (_x, _y, c) => [1, 2, 3][c],
    });
    expect(Array.from(decodePng(rgb).data)).toEqual([1, 2, 3, 255]);
  });

  it('de-interlaces an Adam7 PNG to the same pixels as the plain one', () => {
    const base = {
      width: 11,
      height: 9,
      colorType: 6,
      bitDepth: 8,
      channels: 4,
      sample: (x: number, y: number, c: number) => (x * 23 + y * 7 + c * 61) & 0xff,
    };
    const plain = decodePng(assemble(base));
    const interlaced = decodePng(assemble({ ...base, interlace: true }));
    expect(interlaced).toEqual(plain);
    expect(plain.data[(4 * 11 + 3) * 4 + 1]).toBe((3 * 23 + 4 * 7 + 61) & 0xff);
  });

  it('decodes from a byte view that does not start at offset 0', () => {
    const png = encodePng(createImage(2, 2));
    const padded = new Uint8Array(png.length + 10);
    padded.set(png, 7);
    const view = padded.subarray(7, 7 + png.length);
    expect(decodePng(view)).toEqual(createImage(2, 2));
  });

  it('rejects a corrupted chunk (CRC mismatch) and a truncated file', () => {
    const png = encodePng(createImage(4, 4));
    const corrupt = Buffer.from(png);
    corrupt[45] ^= 0xff; // inside the IDAT payload
    expect(() => decodePng(corrupt)).toThrow();
    expect(() => decodePng(png.subarray(0, 30))).toThrow();
    expect(() => decodePng(new Uint8Array(0))).toThrow();
  });
});
