#!/usr/bin/env node
/**
 * Generates public/icon.png (512×423, the Samsung TV app-icon size) with no dependencies:
 * shapes are rasterized with 4×4 supersampling and encoded with a tiny PNG writer (node:zlib + CRC32).
 *
 * Design (original art): a navy rounded tile with a remote-style D-pad ring, four cyan arrows and a white
 * OK button with an orange centre.
 *
 * Usage: node scripts/make-icon.mjs [output.png]   (or: npm run icon)
 *
 * The output is deterministic: `test/assets.test.ts` regenerates the icon and compares it pixel-for-pixel
 * with the committed `public/icon.png`, so re-run this script and commit the PNG whenever the design changes.
 *
 * @module scripts/make-icon
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

/** Directory of this script. */
const here = dirname(fileURLToPath(import.meta.url));
/** Output file: the first CLI argument, default `../public/icon.png`. */
const out = resolve(process.argv[2] ?? resolve(here, '..', 'public', 'icon.png'));

/** Icon width (px). */
const W = 512;
/** Icon height (px). */
const H = 423;
/** Supersampling factor per axis (SS² samples per pixel). */
const SS = 4; // supersampling per axis
/** Tile centre x. */
const CX = W / 2;
/** Tile centre y. */
const CY = H / 2;

/** @typedef {[number, number, number, number]} RGBA - straight (non-premultiplied) 8-bit color. */

/** @type {RGBA} */ const TRANSPARENT = [0, 0, 0, 0];
/** @type {RGBA} */ const NAVY = [13, 22, 51, 255];
/** @type {RGBA} */ const RING = [43, 63, 122, 255];
/** @type {RGBA} */ const CYAN = [79, 209, 255, 255];
/** @type {RGBA} */ const WHITE = [255, 255, 255, 255];
/** @type {RGBA} */ const ORANGE = [255, 179, 71, 255];

/**
 * Signed distance to a rounded rectangle centered on the tile.
 *
 * @param {number} x - sample x.
 * @param {number} y - sample y.
 * @param {number} hw - half width.
 * @param {number} hh - half height.
 * @param {number} r - corner radius.
 * @returns {number} negative inside, positive outside (px).
 */
function roundedRectDist(x, y, hw, hh, r) {
  const qx = Math.abs(x - CX) - (hw - r);
  const qy = Math.abs(y - CY) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Point-in-triangle test (sign of the three edge cross products; edges count as inside).
 *
 * @param {number} px - point x.
 * @param {number} py - point y.
 * @param {number} ax - vertex A x.
 * @param {number} ay - vertex A y.
 * @param {number} bx - vertex B x.
 * @param {number} by - vertex B y.
 * @param {number} cx - vertex C x.
 * @param {number} cy - vertex C y.
 * @returns {boolean} whether the point lies inside or on the triangle.
 */
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * Arrow triangle pointing away from the center in direction (dx, dy): tip 150 px from the centre, base
 * 104 px, 68 px wide.
 *
 * @param {number} x - sample x.
 * @param {number} y - sample y.
 * @param {number} dx - unit direction x (-1, 0 or 1).
 * @param {number} dy - unit direction y (-1, 0 or 1).
 * @returns {boolean} whether the sample is inside that arrow.
 */
function inArrow(x, y, dx, dy) {
  const tip = 150;
  const base = 104;
  const half = 34;
  const px = -dy;
  const py = dx;
  return inTriangle(
    x,
    y,
    CX + dx * tip,
    CY + dy * tip,
    CX + dx * base + px * half,
    CY + dy * base + py * half,
    CX + dx * base - px * half,
    CY + dy * base - py * half,
  );
}

/**
 * Color of one sample point (painter's order: outside tile → OK button → arrows → ring → background).
 *
 * @param {number} x - sample x (sub-pixel).
 * @param {number} y - sample y (sub-pixel).
 * @returns {RGBA} the color at that point.
 */
function sample(x, y) {
  if (roundedRectDist(x, y, W / 2 - 4, H / 2 - 4, 64) > 0) return TRANSPARENT;
  const d = Math.hypot(x - CX, y - CY);
  if (d <= 46) return d <= 30 ? ORANGE : WHITE;
  if (inArrow(x, y, 1, 0) || inArrow(x, y, -1, 0) || inArrow(x, y, 0, 1) || inArrow(x, y, 0, -1)) return CYAN;
  if (d >= 168 && d <= 186) return RING;
  return NAVY;
}

/**
 * Rasterizes the icon into straight-alpha RGBA (alpha-weighted color average over SS×SS samples, so edges
 * against transparency do not darken).
 *
 * @returns {Buffer} W×H×4 bytes, row-major.
 */
function render() {
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (y * W + x) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round(a / (SS * SS));
    }
  }
  return px;
}

/** CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320) lookup table for PNG chunk checksums. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * Computes the CRC-32 of a buffer.
 *
 * @param {Uint8Array} buf - input bytes.
 * @returns {number} unsigned 32-bit checksum.
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Builds one PNG chunk: length, type, data, CRC over type + data.
 *
 * @param {string} type - four-letter chunk type, e.g. `'IHDR'`.
 * @param {Buffer} data - chunk payload.
 * @returns {Buffer} the encoded chunk.
 */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * Encodes straight-alpha RGBA pixels as a PNG file (8-bit RGBA, no filtering, zlib level 9).
 *
 * @param {number} width - image width (px).
 * @param {number} height - image height (px).
 * @param {Buffer} rgba - `width × height × 4` bytes, row-major.
 * @returns {Buffer} the complete PNG file.
 *
 * @remarks
 * Importing this module also runs the generator (it is a script first); tests execute the script into a
 * temporary path instead of importing it.
 */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(W, H, render()));
console.log('wrote ' + out + ' (' + W + '×' + H + ')');
