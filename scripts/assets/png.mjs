/**
 * PNG encoding (zero dependencies) and decoding (dev dependency `pngjs`).
 *
 * The encoder writes 8-bit RGBA, non-interlaced PNGs: signature, `IHDR`, one `IDAT`
 * (`zlib.deflateSync`, level 9) and `IEND`, with CRC-32 from a precomputed table. Each
 * row picks the filter (None/Sub/Up/Average/Paeth) with the smallest sum of absolute
 * filtered bytes — the usual heuristic, and deterministic. No ancillary chunks (no
 * timestamps, no gamma), so the same pixels always give the same bytes on the same
 * zlib version.
 *
 * **Indexed PNG-8 (R1-05, opt-in).** With `{ indexed: 'auto' }` an image of at most 256
 * distinct RGBA values is written as colour type 3 instead: `PLTE` + `tRNS` + 8-bit
 * indices, filter None on every row (the PNG spec's advice for palette images). It is
 * lossless — the palette holds the exact RGBA values, and the RGB of a fully transparent
 * pixel is kept, never normalised — and deterministic: the palette is ordered by
 * (alpha < 255 first, so `tRNS` stays short; then the packed `0xRRGGBBAA` value
 * ascending), independent of where the colours sit in the image. An image with more
 * colours falls back to RGBA. Only the atlas pipeline opts in (decision W3-3): the
 * documentation pictures and store icons keep their RGBA bytes (`docs:images --check`,
 * `store:assets --check`).
 *
 * Decoding is only needed for *real art* sources that override code-defined frames
 * (`assets/source/sprites/**\/*.png`); it goes through `pngjs`, which handles every
 * colour type, bit depth and interlacing mode.
 *
 * **Public API.** {@link encodePng}, {@link indexedPalette}, {@link decodePng},
 * {@link crc32}, {@link PNG_SIGNATURE}, {@link MAX_PALETTE_SIZE}; typedef
 * {@link EncodePngOptions}.
 *
 * @module
 */
import { deflateSync } from 'node:zlib';
import pngjs from 'pngjs';
import { createImage } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */

/** The 8-byte PNG file signature. */
export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/** CRC-32 (IEEE 802.3, reflected, polynomial 0xEDB88320) lookup table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC-32 of a byte sequence, as used by PNG chunks (and zip/gzip).
 *
 * @param {Uint8Array} bytes - Input bytes.
 * @param {number} [crc] - Running CRC to continue from (default: a fresh CRC).
 * @returns {number} The unsigned 32-bit CRC.
 *
 * @example
 * crc32(new TextEncoder().encode('123456789')); // → 0xcbf43926
 */
export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/**
 * Builds one PNG chunk: length, type, data, CRC(type + data).
 *
 * @param {string} type - Four-letter chunk type.
 * @param {Uint8Array} data - Chunk payload.
 * @returns {Buffer} The encoded chunk.
 */
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Paeth predictor (PNG spec §9.4).
 *
 * @param {number} a - Left byte.
 * @param {number} b - Byte above.
 * @param {number} c - Byte above-left.
 * @returns {number} The predicted byte.
 */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Filters every scanline with the cheapest of the five PNG filters.
 *
 * @param {Image} image - Source pixels.
 * @returns {Uint8Array} Filtered scanlines, each prefixed with its filter-type byte.
 */
function filterScanlines(image) {
  const stride = image.width * 4;
  const out = new Uint8Array((stride + 1) * image.height);
  const candidate = new Uint8Array(stride);
  const best = new Uint8Array(stride);
  const zero = new Uint8Array(stride);
  for (let y = 0; y < image.height; y++) {
    const row = image.data.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? image.data.subarray((y - 1) * stride, y * stride) : zero;
    let bestType = 0;
    let bestCost = Infinity;
    for (let type = 0; type <= 4; type++) {
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? row[i - 4] : 0;
        const upLeft = i >= 4 ? up[i - 4] : 0;
        let predictor = 0;
        if (type === 1) predictor = left;
        else if (type === 2) predictor = up[i];
        else if (type === 3) predictor = (left + up[i]) >>> 1;
        else if (type === 4) predictor = paeth(left, up[i], upLeft);
        const value = (row[i] - predictor) & 0xff;
        candidate[i] = value;
        cost += value < 128 ? value : 256 - value;
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestType = type;
        best.set(candidate);
      }
    }
    out[y * (stride + 1)] = bestType;
    out.set(best, y * (stride + 1) + 1);
  }
  return out;
}

/** Most colours an indexed (colour type 3, 8-bit) PNG can hold. */
export const MAX_PALETTE_SIZE = 256;

/**
 * Options of {@link encodePng}.
 *
 * @typedef {object} EncodePngOptions
 * @property {'never' | 'auto'} [indexed] - `'never'` (the default) always writes 8-bit
 *   RGBA; `'auto'` writes an indexed PNG-8 (`PLTE` + `tRNS`) when the image has at most
 *   {@link MAX_PALETTE_SIZE} distinct RGBA values, else RGBA. Both are lossless.
 */

/**
 * Packs the pixel at byte offset `i` of RGBA data into an unsigned `0xRRGGBBAA` value.
 *
 * @param {Uint8Array} data - RGBA bytes.
 * @param {number} i - Byte offset of the pixel.
 * @returns {number} The packed value (unsigned 32-bit).
 */
const packRgba = (data, i) =>
  ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;

/**
 * Sort key of a palette entry: entries with alpha < 255 come first.
 *
 * @param {number} value - Packed `0xRRGGBBAA` entry.
 * @returns {number} 0 for a translucent or transparent entry, 1 for an opaque one.
 */
const opaqueKey = (value) => ((value & 0xff) === 0xff ? 1 : 0);

/**
 * The palette an indexed PNG of `image` would use, or `null` when the image has more
 * than `max` distinct RGBA values.
 *
 * @remarks
 * Exact values: two pixels share an entry only when all four channels are equal, so a
 * fully transparent pixel keeps its RGB (lossless). Order: every entry with alpha < 255
 * first (the `tRNS` chunk then covers only those), then the opaque ones; each part by the
 * packed `0xRRGGBBAA` value, ascending — deterministic and independent of the layout.
 * The scan stops at the first colour past `max`, so a many-coloured page costs little.
 *
 * @param {Image} image - The pixels.
 * @param {number} [max] - Largest palette accepted (default {@link MAX_PALETTE_SIZE}).
 * @returns {number[] | null} Packed `0xRRGGBBAA` entries (unsigned), or `null`.
 *
 * @example
 * indexedPalette(createImage(4, 4)); // → [0] (one entry: transparent black)
 */
export function indexedPalette(image, max = MAX_PALETTE_SIZE) {
  const { data } = image;
  /** @type {Set<number>} */
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4) {
    seen.add(packRgba(data, i));
    if (seen.size > max) return null;
  }
  return [...seen].sort((a, b) => opaqueKey(a) - opaqueKey(b) || a - b);
}

/**
 * Checks the image's buffer and builds its `IHDR` payload (8-bit samples, deflate,
 * adaptive filtering, no interlace).
 *
 * @param {Image} image - The pixels.
 * @param {number} colourType - PNG colour type (6 truecolour with alpha, 3 indexed).
 * @returns {Buffer} The 13-byte `IHDR` payload.
 * @throws {RangeError} When `image.data` does not hold `width * height * 4` bytes.
 */
function headerOf(image, colourType) {
  if (image.data.length !== image.width * image.height * 4) {
    throw new RangeError(
      `image data holds ${image.data.length} bytes, expected ${image.width * image.height * 4}`,
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; // bit depth
  header[9] = colourType;
  header[10] = 0; // compression: deflate
  header[11] = 0; // filter method: adaptive
  header[12] = 0; // interlace: none
  return header;
}

/**
 * Encodes an image as an indexed PNG-8 with the given palette.
 *
 * @param {Image} image - The pixels; every value must be in `palette`.
 * @param {number[]} palette - Packed `0xRRGGBBAA` entries from {@link indexedPalette}.
 * @returns {Buffer} The PNG bytes: `IHDR`, `PLTE`, `tRNS` (only when an entry has alpha
 *   < 255), one `IDAT` (filter None on every row), `IEND`.
 */
function encodeIndexed(image, palette) {
  const { width, height, data } = image;
  /** @type {Map<number, number>} */
  const index = new Map();
  const plte = new Uint8Array(palette.length * 3);
  let translucent = 0;
  palette.forEach((value, i) => {
    index.set(value, i);
    plte[i * 3] = value >>> 24;
    plte[i * 3 + 1] = (value >>> 16) & 0xff;
    plte[i * 3 + 2] = (value >>> 8) & 0xff;
    if ((value & 0xff) !== 0xff) translucent = i + 1;
  });
  const rows = new Uint8Array((width + 1) * height); // each row: filter byte 0, indices
  for (let y = 0; y < height; y++) {
    const to = y * (width + 1) + 1;
    const from = y * width * 4;
    for (let x = 0; x < width; x++) {
      rows[to + x] = /** @type {number} */ (index.get(packRgba(data, from + x * 4)));
    }
  }
  const parts = [
    Buffer.from(PNG_SIGNATURE),
    chunk('IHDR', headerOf(image, 3)),
    chunk('PLTE', plte),
  ];
  if (translucent > 0) {
    const alpha = new Uint8Array(translucent);
    for (let i = 0; i < translucent; i++) alpha[i] = palette[i] & 0xff;
    parts.push(chunk('tRNS', alpha));
  }
  parts.push(chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', new Uint8Array(0)));
  return Buffer.concat(parts);
}

/**
 * Encodes an RGBA image as a PNG file.
 *
 * @param {Image} image - The pixels (straight alpha).
 * @param {EncodePngOptions} [options] - `indexed: 'auto'` writes PNG-8 when the image has
 *   at most 256 colours (default `'never'`: always RGBA, byte-identical to the encoder
 *   before R1-05).
 * @returns {Buffer} The PNG bytes; deterministic for the same pixels, options and zlib
 *   version.
 * @throws {RangeError} When `image.data` does not hold `width * height * 4` bytes, or
 *   `options.indexed` is neither `'never'` nor `'auto'`.
 *
 * @example
 * writeFileSync('out.png', encodePng(createImage(8, 8)));
 * writeFileSync('page.png', encodePng(page, { indexed: 'auto' })); // PNG-8 when it fits
 */
export function encodePng(image, options = {}) {
  const indexed = options.indexed ?? 'never';
  if (indexed !== 'never' && indexed !== 'auto') {
    throw new RangeError(`indexed must be 'never' or 'auto', not ${JSON.stringify(indexed)}`);
  }
  const header = headerOf(image, 6); // colour type 6: truecolour with alpha
  if (indexed === 'auto') {
    const palette = indexedPalette(image);
    if (palette !== null) return encodeIndexed(image, palette);
  }
  const compressed = deflateSync(filterScanlines(image), { level: 9 });
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/**
 * Decodes any PNG (every colour type, bit depth, interlacing) to 8-bit RGBA via `pngjs`.
 *
 * @param {Uint8Array} bytes - The PNG file contents.
 * @returns {Image} The pixels, straight alpha.
 * @throws {Error} When the bytes are not a valid PNG (pngjs' message).
 */
export function decodePng(bytes) {
  const png = pngjs.PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
  const image = createImage(png.width, png.height);
  // pngjs expands every colour type to RGBA and rescales 16-bit samples to 8 bits.
  const data = /** @type {Uint8Array} */ (png.data);
  if (data.length !== image.data.length) {
    throw new Error(`unexpected PNG sample layout (${data.length} samples)`);
  }
  image.data.set(data);
  return image;
}
