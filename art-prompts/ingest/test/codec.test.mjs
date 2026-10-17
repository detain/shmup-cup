/**
 * The codecs: the deterministic PNG encoder (indexed and RGBA, no ancillary chunks), the
 * pure-JavaScript DEFLATE behind it (round trips through `node:zlib`), and decoding.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';
import pngjs from 'pngjs';
import { decodeImage, encodePng, pngChunks, pngPalette, sniffFormat } from '../lib/codec.mjs';
import { codeLengths, zlibDeflate } from '../lib/deflate.mjs';
import { createImage, putRgba } from '../lib/image.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures');

/**
 * An image filled by a function of the pixel index.
 *
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {(i: number) => [number, number]} f - Pixel index → `[0xRRGGBB, alpha]`.
 * @returns {import('../lib/image.mjs').Image} The image.
 */
function image(w, h, f) {
  const out = createImage(w, h);
  for (let i = 0; i < w * h; i++) putRgba(out, i, ...f(i));
  return out;
}

describe('deflate', () => {
  /** Inputs that exercise literals, short and maximal matches and the 32 KiB window. */
  const inputs = () => {
    let s = 7;
    const noise = Uint8Array.from({ length: 50_000 }, () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s >>> 24;
    });
    return [
      new Uint8Array(0),
      Uint8Array.of(42),
      Uint8Array.of(1, 2, 3, 1, 2, 3, 1, 2, 3),
      new Uint8Array(100_000).fill(9),
      Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7919) % 251),
      Uint8Array.from({ length: 80_000 }, (_, i) => ((i >> 6) * 13 + (i % 40)) & 255),
      noise,
    ];
  };

  it('round-trips through node:zlib for every kind of input', () => {
    for (const data of inputs()) {
      const z = zlibDeflate(data);
      assert.deepEqual(new Uint8Array(inflateSync(z)), data, `length ${data.length}`);
    }
  });

  it('is a pure function of its input', () => {
    for (const data of inputs()) assert.deepEqual(zlibDeflate(data), zlibDeflate(data));
  });

  it('compresses about as well as zlib at level 9', () => {
    for (const data of inputs()) {
      const ours = zlibDeflate(data).length;
      const zlib = deflateSync(data, { level: 9 }).length;
      assert.ok(ours <= zlib * 1.1 + 16, `${data.length} bytes: ${ours} vs zlib ${zlib}`);
    }
  });

  it('limits code lengths and completes a one-symbol code', () => {
    const fib = [1, 1];
    while (fib.length < 30) fib.push(fib[fib.length - 1] + fib[fib.length - 2]);
    const lengths = codeLengths(fib, 15);
    assert.ok(Math.max(...lengths) <= 15);
    const kraft = lengths.reduce((sum, l) => sum + (l > 0 ? 2 ** -l : 0), 0);
    assert.ok(kraft <= 1 + 1e-12);
    assert.deepEqual(
      codeLengths([0, 0, 5, 0], 15).filter((l) => l > 0),
      [1, 1],
    );
  });
});

describe('PNG encoder', () => {
  it('writes ≤ 256 colours indexed: IHDR, PLTE, tRNS, IDAT, IEND — nothing else', () => {
    const img = image(8, 4, (i) =>
      i % 3 === 0 ? [0, 0] : [i % 2 === 0 ? 0x112233 : 0xffeedd, 255],
    );
    const png = encodePng(img);
    assert.deepEqual(pngChunks(png), ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
    assert.equal(png[25], 3); // colour type: indexed
    const back = pngjs.PNG.sync.read(png);
    assert.deepEqual(new Uint8Array(back.data), img.data);
  });

  it('omits tRNS for an opaque image and orders the palette by colour', () => {
    const img = image(3, 1, (i) => [[0x00ff00, 0x0000ff, 0xff0000][i], 255]);
    assert.deepEqual(pngChunks(encodePng(img)), ['IHDR', 'PLTE', 'IDAT', 'IEND']);
    assert.deepEqual(pngPalette(img), [0x0000ffff, 0x00ff00ff, 0xff0000ff]);
  });

  it('normalises every fully transparent pixel to one palette entry', () => {
    const img = image(4, 1, (i) => [i * 0x111111, 0]);
    img.data[0] = 9; // colour under alpha 0 is dropped
    assert.deepEqual(pngPalette(img), [0]);
    const back = pngjs.PNG.sync.read(encodePng(img));
    assert.deepEqual([...back.data], new Array(16).fill(0));
  });

  it('falls back to RGBA beyond 256 colours, still exact', () => {
    const img = image(32, 16, (i) => [i * 97, 255]);
    const png = encodePng(img);
    assert.deepEqual(pngChunks(png), ['IHDR', 'IDAT', 'IEND']);
    assert.equal(png[25], 6);
    assert.deepEqual(new Uint8Array(pngjs.PNG.sync.read(png).data), img.data);
  });

  it('gives the same bytes for the same pixels', () => {
    const a = image(16, 16, (i) => [(i * 31) & 0xffffff, i % 5 === 0 ? 0 : 255]);
    const b = image(16, 16, (i) => [(i * 31) & 0xffffff, i % 5 === 0 ? 0 : 255]);
    assert.deepEqual(encodePng(a), encodePng(b));
  });
});

describe('decoding', () => {
  it('sniffs the format from the bytes, not the name', () => {
    assert.equal(sniffFormat(readFileSync(join(FIXTURES, 'sources', 'gyre.jpg'))), 'jpeg');
    assert.equal(sniffFormat(readFileSync(join(FIXTURES, 'sources', 'drone-sheet.png'))), 'png');
    assert.equal(sniffFormat(Uint8Array.of(1, 2, 3)), null);
  });

  it('decodes the JPEG fixture to opaque RGBA', () => {
    const { image: img, format } = decodeImage(readFileSync(join(FIXTURES, 'sources', 'gyre.jpg')));
    assert.equal(format, 'jpeg');
    assert.equal(img.width, 96);
    assert.equal(img.height, 96);
    for (let p = 3; p < img.data.length; p += 4) assert.equal(img.data[p], 255);
  });

  it('rejects files that are neither PNG nor JPEG', () => {
    assert.throws(
      () => decodeImage(new TextEncoder().encode('GIF89a')),
      /neither a PNG nor a JPEG/,
    );
  });
});
