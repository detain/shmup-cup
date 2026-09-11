/**
 * `scripts/assets/png.mjs` — the zero-dependency PNG encoder and the pngjs-backed decoder.
 *
 * Acceptance (M1-03): a PNG round trip (encode → pngjs decode) returns the source pixels
 * exactly; output is deterministic and carries no ancillary chunks (no timestamps).
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createImage } from '../../../scripts/assets/image.mjs';
import { PNG_SIGNATURE, crc32, decodePng, encodePng } from '../../../scripts/assets/png.mjs';
import { createAssetRng } from '../../../scripts/assets/rng.mjs';

/** The untyped pngjs module (no @types dependency), loaded through `require`. */
const PNG = (
  createRequire(import.meta.url)('pngjs') as {
    PNG: {
      new (options: { width: number; height: number }): { data: Buffer };
      sync: {
        read(buffer: Buffer): { width: number; height: number; data: Buffer };
        write(png: { data: Buffer }, options?: { colorType?: number }): Buffer;
      };
    };
  }
).PNG;

/**
 * An image filled with seeded random bytes (every filter type gets exercised).
 *
 * @param width - Width.
 * @param height - Height.
 * @param seed - RNG seed.
 * @returns The image.
 */
function noise(width: number, height: number, seed: number) {
  const image = createImage(width, height);
  const rng = createAssetRng(seed);
  for (let i = 0; i < image.data.length; i++) image.data[i] = rng.rangeInt(0, 255);
  return image;
}

/**
 * Lists the chunk types of a PNG file.
 *
 * @param png - File bytes.
 * @returns Chunk type names in order.
 */
function chunkTypes(png: Buffer): string[] {
  const types: string[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    types.push(png.toString('latin1', offset + 4, offset + 8));
    const crc = png.readUInt32BE(offset + 8 + length);
    expect(crc32(png.subarray(offset + 4, offset + 8 + length))).toBe(crc);
    offset += 12 + length;
  }
  return types;
}

describe('scripts/assets/png — crc32', () => {
  it('matches the standard CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('continues a running CRC', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(crc32(bytes.subarray(4), crc32(bytes.subarray(0, 4)))).toBe(0xcbf43926);
  });
});

describe('scripts/assets/png — encodePng', () => {
  it.each([
    [1, 1],
    [7, 5],
    [64, 3],
    [3, 64],
    [128, 96],
  ])('round-trips a %i×%i noise image through pngjs byte for byte', (w, h) => {
    const image = noise(w, h, w * 1000 + h);
    const png = encodePng(image);
    const decoded = PNG.sync.read(png);
    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(Buffer.compare(decoded.data, Buffer.from(image.data))).toBe(0);
  });

  it('round-trips smooth and transparent content (Sub/Up/Paeth rows)', () => {
    const image = createImage(40, 30);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        const i = (y * 40 + x) * 4;
        image.data.set([x * 6, y * 8, (x + y) * 3, x < 20 ? 255 : (x * 7) & 255], i);
      }
    }
    expect(Buffer.from(decodePng(encodePng(image)).data)).toEqual(Buffer.from(image.data));
  });

  it('writes signature, IHDR (8-bit RGBA, no interlace), one IDAT and IEND only', () => {
    const png = encodePng(noise(9, 4, 1));
    expect(Buffer.from(png.subarray(0, 8))).toEqual(Buffer.from(PNG_SIGNATURE));
    expect(chunkTypes(png)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(png.readUInt32BE(16)).toBe(9);
    expect(png.readUInt32BE(20)).toBe(4);
    expect([...png.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  });

  it('is deterministic', () => {
    const image = noise(33, 17, 99);
    expect(Buffer.compare(encodePng(image), encodePng(image))).toBe(0);
  });

  it('rejects a data buffer of the wrong length', () => {
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8Array(15) })).toThrow(RangeError);
  });
});

describe('scripts/assets/png — decodePng', () => {
  it('decodes our own output', () => {
    const image = noise(12, 12, 5);
    expect(decodePng(encodePng(image))).toEqual(image);
  });

  it('expands a greyscale PNG written by pngjs to RGBA', () => {
    const source = new PNG({ width: 2, height: 1 });
    source.data.set([10, 10, 10, 255, 200, 200, 200, 255]);
    const grey = PNG.sync.write(source, { colorType: 0 });
    const image = decodePng(grey);
    expect([...image.data]).toEqual([10, 10, 10, 255, 200, 200, 200, 255]);
  });

  it('throws for bytes that are not a PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
