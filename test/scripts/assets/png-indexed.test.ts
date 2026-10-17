/**
 * `scripts/assets/png.mjs` — the opt-in indexed PNG-8 path (R1-05, decision W3-3).
 *
 * Acceptance: `encodePng(image, { indexed: 'auto' })` writes colour type 3 (`PLTE` +
 * `tRNS`, 8-bit indices, filter None on every row) for an image of at most 256 distinct
 * RGBA values and RGBA otherwise; either way the round trip through pngjs returns the
 * source pixels exactly (partial alpha, and the RGB of fully transparent pixels kept).
 * The palette order is (alpha < 255 first, then the packed value ascending), so `tRNS`
 * is as short as it can be and the bytes do not depend on where the colours sit. The
 * default (`'never'`) is the RGBA encoder every other caller keeps.
 */
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createImage, type Image } from '../../../scripts/assets/image.mjs';
import {
  MAX_PALETTE_SIZE,
  crc32,
  decodePng,
  encodePng,
  indexedPalette,
} from '../../../scripts/assets/png.mjs';
import { createAssetRng } from '../../../scripts/assets/rng.mjs';

/** The untyped pngjs module (no @types dependency), loaded through `require`. */
const PNG = (
  createRequire(import.meta.url)('pngjs') as {
    PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } };
  }
).PNG;

/** One parsed PNG chunk. */
interface Chunk {
  /** Four-letter type. */
  readonly type: string;
  /** Payload. */
  readonly data: Buffer;
}

/**
 * Splits a PNG file into its chunks, checking every CRC.
 *
 * @param png - File bytes.
 * @returns The chunks in file order.
 */
function chunks(png: Buffer): Chunk[] {
  const out: Chunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    expect(crc32(png.subarray(offset + 4, offset + 8 + length)), type).toBe(
      png.readUInt32BE(offset + 8 + length),
    );
    out.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  expect(offset).toBe(png.length);
  return out;
}

/**
 * Finds one chunk by type.
 *
 * @param png - File bytes.
 * @param type - Chunk type.
 * @returns Its payload, or `undefined` when absent.
 */
const chunkData = (png: Buffer, type: string): Buffer | undefined =>
  chunks(png).find((c) => c.type === type)?.data;

/**
 * An image whose pixels cycle through `colours` distinct RGBA values, laid out by a seeded
 * shuffle so neighbouring pixels differ.
 *
 * @param width - Width.
 * @param height - Height.
 * @param colours - Distinct values wanted (≤ width × height).
 * @param seed - Layout seed.
 * @returns The image.
 */
function paletted(width: number, height: number, colours: number, seed: number): Image {
  const image = createImage(width, height);
  const rng = createAssetRng(seed);
  for (let p = 0; p < width * height; p++) {
    const c = p < colours ? p : rng.rangeInt(0, colours - 1);
    // Distinct for every c: R = c's low byte, G = its high bits, a few alpha levels.
    image.data.set(
      [c & 0xff, (c >> 8) * 40 + 7, (c * 37) & 0xff, [255, 255, 128, 0][c % 4]],
      p * 4,
    );
  }
  // Shuffle the pixels (Fisher–Yates on whole pixels) so the layout is not sorted.
  for (let p = width * height - 1; p > 0; p--) {
    const q = rng.rangeInt(0, p);
    const a = image.data.slice(p * 4, p * 4 + 4);
    image.data.copyWithin(p * 4, q * 4, q * 4 + 4);
    image.data.set(a, q * 4);
  }
  return image;
}

/**
 * Counts the distinct RGBA values of an image.
 *
 * @param image - The pixels.
 * @returns The count.
 */
function distinct(image: Image): number {
  const seen = new Set<number>();
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    seen.add(((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0);
  }
  return seen.size;
}

/**
 * The raw (inflated) scanlines of a one-IDAT PNG.
 *
 * @param png - File bytes.
 * @returns The inflated IDAT payload.
 */
const scanlines = (png: Buffer): Buffer => inflateSync(chunkData(png, 'IDAT') as Buffer);

describe('scripts/assets/png — indexed PNG-8 round trip', () => {
  it.each([
    [1, 5, 3],
    [2, 7, 4],
    [16, 16, 16],
    [256, 32, 24],
  ])('writes %i colour(s) as PNG-8 and decodes them exactly', (colours, w, h) => {
    const image = paletted(w, h, colours, colours);
    expect(distinct(image)).toBe(colours);
    const png = encodePng(image, { indexed: 'auto' });
    expect(png[25], 'IHDR colour type').toBe(3);
    expect(png[24], 'IHDR bit depth').toBe(8);
    const back = PNG.sync.read(png);
    expect([back.width, back.height]).toEqual([w, h]);
    expect(Buffer.compare(back.data, Buffer.from(image.data))).toBe(0);
    expect(decodePng(png)).toEqual(image);
    expect((chunkData(png, 'PLTE') as Buffer).length).toBe(colours * 3);
  });

  it('falls back to RGBA at 257 colours, still byte-exact', () => {
    const image = paletted(32, 16, MAX_PALETTE_SIZE + 1, 9);
    expect(distinct(image)).toBe(257);
    expect(indexedPalette(image)).toBeNull();
    const png = encodePng(image, { indexed: 'auto' });
    expect(png[25]).toBe(6);
    expect(chunks(png).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(Buffer.compare(png, encodePng(image))).toBe(0);
    expect(decodePng(png)).toEqual(image);
  });

  it('keeps partial alpha and the RGB of fully transparent pixels (pixel-exact)', () => {
    const image = createImage(5, 1);
    image.data.set([
      ...[10, 20, 30, 0],
      ...[0, 0, 0, 0],
      ...[255, 255, 255, 0],
      ...[1, 2, 3, 1],
      ...[200, 100, 50, 254],
    ]);
    const png = encodePng(image, { indexed: 'auto' });
    expect(png[25]).toBe(3);
    expect(Array.from(decodePng(png).data)).toEqual(Array.from(image.data));
    // Five entries, every one translucent: tRNS covers them all, in packed-value order
    // (0x00000000, 0x01020301, 0x0a141e00, 0xc86432fe, 0xffffff00).
    expect(Array.from(chunkData(png, 'tRNS') as Buffer)).toEqual([0, 1, 0, 254, 0]);
  });
});

describe('scripts/assets/png — indexed PNG-8 layout', () => {
  it('writes IHDR, PLTE, tRNS, one IDAT and IEND, and no ancillary chunks', () => {
    const png = encodePng(paletted(9, 4, 6, 1), { indexed: 'auto' });
    expect(chunks(png).map((c) => c.type)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
    expect([...png.subarray(24, 29)]).toEqual([8, 3, 0, 0, 0]);
  });

  it('omits tRNS when every colour is opaque', () => {
    const image = createImage(3, 2);
    for (let p = 0; p < 6; p++) image.data.set([p * 40, 9, 200 - p, 255], p * 4);
    const png = encodePng(image, { indexed: 'auto' });
    expect(chunks(png).map((c) => c.type)).toEqual(['IHDR', 'PLTE', 'IDAT', 'IEND']);
    expect(decodePng(png)).toEqual(image);
  });

  it('keeps tRNS as long as the translucent entries only (they come first)', () => {
    const image = createImage(6, 1);
    image.data.set([
      ...[9, 9, 9, 255],
      ...[1, 1, 1, 255],
      ...[5, 5, 5, 128],
      ...[0, 0, 0, 0],
      ...[7, 7, 7, 255],
      ...[3, 3, 3, 64],
    ]);
    const png = encodePng(image, { indexed: 'auto' });
    expect(Array.from(chunkData(png, 'tRNS') as Buffer)).toEqual([0, 64, 128]);
    const plte = Array.from(chunkData(png, 'PLTE') as Buffer);
    // alpha < 255 first (0x00000000, 0x03030340, 0x05050580), then opaque ascending.
    expect(plte).toEqual([0, 0, 0, 3, 3, 3, 5, 5, 5, 1, 1, 1, 7, 7, 7, 9, 9, 9]);
    expect(indexedPalette(image)).toEqual([
      0x00000000, 0x03030340, 0x05050580, 0x010101ff, 0x070707ff, 0x090909ff,
    ]);
  });

  it('uses filter None on every row: width + 1 bytes per scanline, first byte 0', () => {
    const image = paletted(13, 7, 40, 3);
    const raw = scanlines(encodePng(image, { indexed: 'auto' }));
    expect(raw.length).toBe((13 + 1) * 7);
    for (let y = 0; y < 7; y++) expect(raw[y * 14], `row ${y}`).toBe(0);
  });

  it('writes the same palette whatever the layout of the colours', () => {
    const a = paletted(16, 8, 30, 1);
    const b = paletted(16, 8, 30, 2); // same colours, other layout
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(false);
    const pa = encodePng(a, { indexed: 'auto' });
    const pb = encodePng(b, { indexed: 'auto' });
    expect(chunkData(pa, 'PLTE')).toEqual(chunkData(pb, 'PLTE'));
    expect(chunkData(pa, 'tRNS')).toEqual(chunkData(pb, 'tRNS'));
  });

  it('is deterministic and never mutates the image', () => {
    const image = paletted(33, 17, 100, 99);
    const before = Buffer.from(image.data);
    const once = encodePng(image, { indexed: 'auto' });
    expect(Buffer.compare(once, encodePng(image, { indexed: 'auto' }))).toBe(0);
    expect(Buffer.from(image.data)).toEqual(before);
  });

  it('is smaller than RGBA for flat palette art', () => {
    const image = createImage(128, 128);
    for (let p = 0; p < 128 * 128; p++) {
      const band = ((p >> 7) >> 4) + ((p & 127) >> 4); // 8×8 blocks of 16 colours
      image.data.set([band * 15, 255 - band * 15, (band * 77) & 0xff, 255], p * 4);
    }
    const indexed = encodePng(image, { indexed: 'auto' });
    expect(indexed[25]).toBe(3);
    expect(indexed.length).toBeLessThan(encodePng(image).length);
  });
});

describe('scripts/assets/png — the default stays RGBA', () => {
  it("writes RGBA for a palette-sized image unless asked ('never' = the default)", () => {
    const image = paletted(12, 12, 8, 4);
    const plain = encodePng(image);
    expect(plain[25]).toBe(6);
    expect(chunks(plain).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(Buffer.compare(plain, encodePng(image, { indexed: 'never' }))).toBe(0);
    expect(Buffer.compare(plain, encodePng(image, {}))).toBe(0);
    expect(decodePng(plain)).toEqual(image);
  });

  it('rejects an unknown indexed mode and a wrong buffer length in either mode', () => {
    const image = createImage(2, 2);
    expect(() => encodePng(image, { indexed: 'always' as 'auto' })).toThrow(RangeError);
    const bad = { width: 2, height: 2, data: new Uint8Array(15) };
    expect(() => encodePng(bad, { indexed: 'auto' })).toThrow(RangeError);
    expect(() => encodePng(bad, { indexed: 'never' })).toThrow(RangeError);
  });
});

describe('scripts/assets/png — indexedPalette', () => {
  it('returns one entry for a blank image and null past the limit', () => {
    expect(indexedPalette(createImage(4, 4))).toEqual([0]);
    const image = paletted(8, 8, 20, 5);
    expect(indexedPalette(image)).toHaveLength(20);
    expect(indexedPalette(image, 20)).toHaveLength(20);
    expect(indexedPalette(image, 19)).toBeNull();
  });

  it('returns unsigned packed 0xRRGGBBAA values', () => {
    const image = createImage(1, 1);
    image.data.set([0xff, 0x80, 0x01, 0xff]);
    expect(indexedPalette(image)).toEqual([0xff8001ff]);
  });
});
