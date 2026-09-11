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
 * Decoding is only needed for *real art* sources that override code-defined frames
 * (`assets/source/sprites/**\/*.png`); it goes through `pngjs`, which handles every
 * colour type, bit depth and interlacing mode.
 *
 * **Public API.** {@link encodePng}, {@link decodePng}, {@link crc32},
 * {@link PNG_SIGNATURE}.
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

/**
 * Encodes an RGBA image as a PNG file.
 *
 * @param {Image} image - The pixels (straight alpha).
 * @returns {Buffer} The PNG bytes; deterministic for the same pixels and zlib version.
 * @throws {RangeError} When `image.data` does not hold `width * height * 4` bytes.
 *
 * @example
 * writeFileSync('out.png', encodePng(createImage(8, 8)));
 */
export function encodePng(image) {
  if (image.data.length !== image.width * image.height * 4) {
    throw new RangeError(
      `image data holds ${image.data.length} bytes, expected ${image.width * image.height * 4}`,
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  header[10] = 0; // compression: deflate
  header[11] = 0; // filter method: adaptive
  header[12] = 0; // interlace: none
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
