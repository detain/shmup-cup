/**
 * Image files in and out: PNG and JPEG decoding (the tool's two dependencies, `pngjs` and
 * `jpeg-js`, both pure JavaScript) and a deterministic PNG encoder of its own.
 *
 * **The encoder** writes only `IHDR`, `PLTE` + `tRNS` (indexed images) or nothing extra
 * (RGBA), one `IDAT` and `IEND` — no `tIME`, `tEXt`, gamma or any other ancillary chunk —
 * and compresses with the tool's own pure-JavaScript DEFLATE (`deflate.mjs`), so the same
 * pixels give the same bytes on every machine and every Node version (the repo's atlas
 * encoder `scripts/assets/png.mjs` uses `node:zlib` and is only stable per zlib build). An image of at most 256 distinct RGBA values is written
 * **indexed** (colour type 3, bit depth 8, filter None on every row, as the PNG spec advises
 * for palette images): smaller in git and opened by Aseprite in indexed mode with the exact
 * palette, ready for hand cleanup. The palette order is fixed — transparent first, then
 * every other entry by its packed RGBA value. More colours fall back to 8-bit RGBA with the
 * usual per-row minimum-sum filter choice.
 *
 * @module
 */
import jpeg from 'jpeg-js';
import pngjs from 'pngjs';
import { zlibDeflate } from './deflate.mjs';
import { createImage } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */

/** The 8-byte PNG signature. */
export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/** CRC-32 (IEEE, reflected 0xEDB88320) table. */
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
 * CRC-32 of a byte range.
 *
 * @param {Uint8Array} bytes - Input.
 * @returns {number} The unsigned CRC.
 */
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * One PNG chunk: length, type, data, CRC over type + data.
 *
 * @param {string} type - Four ASCII letters.
 * @param {Uint8Array} data - Chunk data.
 * @returns {Uint8Array} The chunk bytes.
 */
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * The Paeth predictor of the PNG spec.
 *
 * @param {number} a - Left.
 * @param {number} b - Up.
 * @param {number} c - Up-left.
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
 * Filters RGBA rows, choosing per row the filter with the smallest sum of absolute
 * (signed) filtered bytes; ties keep the lower filter number.
 *
 * @param {Uint8Array} raw - Rows of `stride` bytes.
 * @param {number} height - Row count.
 * @param {number} stride - Bytes per row.
 * @returns {Uint8Array} Filter byte + filtered row, per row.
 */
function filterRows(raw, height, stride) {
  const out = new Uint8Array(height * (stride + 1));
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = row - stride;
    let best = -1;
    let bestSum = Infinity;
    for (let filter = 0; filter <= 4; filter++) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const x = raw[row + i];
        const a = i >= 4 ? raw[row + i - 4] : 0;
        const b = y > 0 ? raw[prev + i] : 0;
        const c = y > 0 && i >= 4 ? raw[prev + i - 4] : 0;
        let v;
        if (filter === 0) v = x;
        else if (filter === 1) v = x - a;
        else if (filter === 2) v = x - b;
        else if (filter === 3) v = x - ((a + b) >> 1);
        else v = x - paeth(a, b, c);
        v &= 0xff;
        candidate[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = filter;
        out[y * (stride + 1)] = filter;
        out.set(candidate, y * (stride + 1) + 1);
      }
    }
    if (best < 0) throw new Error('unreachable: no filter chosen');
  }
  return out;
}

/**
 * The palette an image would be written with, or `null` when it has more than 256
 * distinct RGBA values. Every pixel with alpha 0 counts as `0x00000000`.
 *
 * @param {Image} image - The image.
 * @returns {number[] | null} Packed `0xRRGGBBAA` entries (unsigned), transparent first,
 *   then translucent, then opaque, each group in ascending order.
 */
export function pngPalette(image) {
  const seen = new Set();
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const v =
      d[i + 3] === 0 ? 0 : ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
    seen.add(v);
    if (seen.size > 256) return null;
  }
  const entries = [...seen];
  /**
   * Sort group: 0 transparent, 1 translucent, 2 opaque.
   *
   * @param {number} v - Packed entry.
   * @returns {number} The group.
   */
  const group = (v) => ((v & 0xff) === 0 ? 0 : (v & 0xff) === 255 ? 2 : 1);
  entries.sort((a, b) => group(a) - group(b) || a - b);
  return entries;
}

/**
 * Encodes an image as a PNG, deterministically (see the module notes).
 *
 * @param {Image} image - The pixels.
 * @returns {Buffer} The PNG file.
 *
 * @example
 * writeFileSync('out.png', encodePng(image)); // same pixels → same bytes
 */
export function encodePng(image) {
  const { width, height, data } = image;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace
  const palette = pngPalette(image);
  /** @type {Uint8Array[]} */
  const parts = [PNG_SIGNATURE];
  if (palette !== null) {
    header[9] = 3; // indexed
    parts.push(chunk('IHDR', header));
    const index = new Map(palette.map((v, i) => [v, i]));
    const plte = new Uint8Array(palette.length * 3);
    let alphaCount = 0;
    palette.forEach((v, i) => {
      plte[i * 3] = v >>> 24;
      plte[i * 3 + 1] = (v >>> 16) & 255;
      plte[i * 3 + 2] = (v >>> 8) & 255;
      if ((v & 255) !== 255) alphaCount = i + 1;
    });
    parts.push(chunk('PLTE', plte));
    if (alphaCount > 0)
      parts.push(
        chunk(
          'tRNS',
          Uint8Array.from(palette.slice(0, alphaCount), (v) => v & 255),
        ),
      );
    const rows = new Uint8Array(height * (width + 1));
    for (let y = 0; y < height; y++) {
      rows[y * (width + 1)] = 0; // filter None
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        const v =
          data[p + 3] === 0
            ? 0
            : ((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3]) >>> 0;
        rows[y * (width + 1) + 1 + x] = /** @type {number} */ (index.get(v));
      }
    }
    parts.push(chunk('IDAT', zlibDeflate(rows)));
  } else {
    header[9] = 6; // RGBA
    parts.push(chunk('IHDR', header));
    parts.push(chunk('IDAT', zlibDeflate(filterRows(data, height, width * 4))));
  }
  parts.push(chunk('IEND', new Uint8Array(0)));
  return Buffer.concat(parts);
}

/**
 * The chunk types of a PNG file, in order.
 *
 * @param {Uint8Array} bytes - A PNG file.
 * @returns {string[]} e.g. `['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']`.
 * @throws {Error} When the signature is wrong or a chunk runs past the end.
 */
export function pngChunks(bytes) {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('not a PNG file');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /** @type {string[]} */
  const types = [];
  let at = 8;
  while (at < bytes.length) {
    if (at + 12 > bytes.length) throw new Error('truncated PNG chunk');
    const length = view.getUint32(at);
    types.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)));
    at += 12 + length;
  }
  if (at !== bytes.length) throw new Error('truncated PNG chunk');
  return types;
}

/**
 * The format of an image file, from its first bytes (never from its name).
 *
 * @param {Uint8Array} bytes - File contents.
 * @returns {'png' | 'jpeg' | null} The format, or `null` when it is neither.
 */
export function sniffFormat(bytes) {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  return null;
}

/**
 * Decodes a PNG or JPEG file into 8-bit RGBA (a JPEG is opaque; 16-bit PNGs are scaled
 * to 8 bits by `pngjs`).
 *
 * @param {Uint8Array} bytes - File contents.
 * @returns {{ image: Image, format: 'png' | 'jpeg' }} The pixels and the detected format.
 * @throws {Error} When the bytes are neither format, or the decoder rejects them.
 */
export function decodeImage(bytes) {
  const format = sniffFormat(bytes);
  if (format === 'png') {
    const png = pngjs.PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const image = createImage(png.width, png.height);
    image.data.set(png.data);
    return { image, format };
  }
  if (format === 'jpeg') {
    const raw = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: false,
    });
    const image = createImage(raw.width, raw.height);
    image.data.set(raw.data);
    return { image, format };
  }
  throw new Error('neither a PNG nor a JPEG file');
}
