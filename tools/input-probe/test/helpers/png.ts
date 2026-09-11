/**
 * Tiny PNG reader for tests: validates the signature and chunk CRCs and inflates the image data.
 */

import { inflateSync } from 'node:zlib';

/** One PNG chunk. */
export interface PngChunk {
  type: string;
  data: Buffer;
  crcOk: boolean;
}

/** Decoded PNG header plus raw (still filtered) scanlines. */
export interface DecodedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  chunks: PngChunk[];
  /** Inflated IDAT stream: per row one filter byte followed by the row's pixel bytes. */
  raw: Buffer;
}

const SIGNATURE = '89504e470d0a1a0a';

let table: Uint32Array | null = null;

/** Standard CRC-32 (IEEE), as used by PNG. */
export function crc32(buf: Buffer): number {
  if (table === null) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (table[(c ^ (buf[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Parses a PNG file. Throws on a bad signature. */
export function decodePng(file: Buffer): DecodedPng {
  if (file.subarray(0, 8).toString('hex') !== SIGNATURE) throw new Error('not a PNG');
  const chunks: PngChunk[] = [];
  let off = 8;
  while (off < file.length) {
    const len = file.readUInt32BE(off);
    const type = file.subarray(off + 4, off + 8).toString('ascii');
    const data = file.subarray(off + 8, off + 8 + len);
    const crc = file.readUInt32BE(off + 8 + len);
    chunks.push({ type, data, crcOk: crc32(file.subarray(off + 4, off + 8 + len)) === crc });
    off += 12 + len;
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('no IHDR');
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return {
    width: ihdr.data.readUInt32BE(0),
    height: ihdr.data.readUInt32BE(4),
    bitDepth: ihdr.data[8] as number,
    colorType: ihdr.data[9] as number,
    chunks,
    raw: inflateSync(idat),
  };
}

/** RGBA of one pixel from an 8-bit RGBA image whose rows all use filter 0 (None). */
export function pixelAt(png: DecodedPng, x: number, y: number): [number, number, number, number] {
  const stride = png.width * 4 + 1;
  const i = y * stride + 1 + x * 4;
  return [png.raw[i] as number, png.raw[i + 1] as number, png.raw[i + 2] as number, png.raw[i + 3] as number];
}
