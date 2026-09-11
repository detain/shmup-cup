#!/usr/bin/env node
/**
 * Generates public/icon.png (512×423, the Samsung TV app-icon size) with no dependencies:
 * shapes are rasterized with 4×4 supersampling and encoded with a tiny PNG writer (node:zlib + CRC32).
 *
 * Design (original art): a navy rounded tile with a remote-style D-pad ring, four cyan arrows and a white
 * OK button.
 *
 * Usage: node scripts/make-icon.mjs [output.png]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, '..', 'public', 'icon.png'));

const W = 512;
const H = 423;
const SS = 4; // supersampling per axis
const CX = W / 2;
const CY = H / 2;

/** @typedef {[number, number, number, number]} RGBA */

/** @type {RGBA} */ const TRANSPARENT = [0, 0, 0, 0];
/** @type {RGBA} */ const NAVY = [13, 22, 51, 255];
/** @type {RGBA} */ const RING = [43, 63, 122, 255];
/** @type {RGBA} */ const CYAN = [79, 209, 255, 255];
/** @type {RGBA} */ const WHITE = [255, 255, 255, 255];
/** @type {RGBA} */ const ORANGE = [255, 179, 71, 255];

/** Signed distance to a rounded rectangle centered on the tile. */
function roundedRectDist(x, y, hw, hh, r) {
  const qx = Math.abs(x - CX) - (hw - r);
  const qy = Math.abs(y - CY) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Arrow triangle pointing away from the center in direction (dx, dy). */
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

/** Color of one sample point. */
function sample(x, y) {
  if (roundedRectDist(x, y, W / 2 - 4, H / 2 - 4, 64) > 0) return TRANSPARENT;
  const d = Math.hypot(x - CX, y - CY);
  if (d <= 46) return d <= 30 ? ORANGE : WHITE;
  if (inArrow(x, y, 1, 0) || inArrow(x, y, -1, 0) || inArrow(x, y, 0, 1) || inArrow(x, y, 0, -1)) return CYAN;
  if (d >= 168 && d <= 186) return RING;
  return NAVY;
}

/** Rasterizes the icon into straight-alpha RGBA. */
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

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encodes straight-alpha RGBA pixels as a PNG file. */
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
