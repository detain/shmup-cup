/**
 * RGBA images and the colour helpers every ingest stage shares.
 *
 * An {@link Image} is the same shape the repo's asset pipeline uses
 * (`scripts/assets/image.mjs`): `width`, `height` and a row-major RGBA `Uint8Array`.
 * Colours inside the tool are packed 24-bit integers `0xRRGGBB` (alpha travels separately)
 * so palettes can be sorted, compared and used as map keys exactly.
 *
 * @module
 */

/**
 * An RGBA image, 8 bits per channel, rows top to bottom.
 *
 * @typedef {object} Image
 * @property {number} width - Width in pixels.
 * @property {number} height - Height in pixels.
 * @property {Uint8Array} data - `width * height * 4` bytes, RGBA.
 */

/**
 * A new transparent image.
 *
 * @param {number} width - Width (≥ 1).
 * @param {number} height - Height (≥ 1).
 * @returns {Image} All pixels `0, 0, 0, 0`.
 */
export function createImage(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`image size must be positive integers, got ${width}×${height}`);
  }
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/**
 * Copies a rectangle out of an image (the rectangle must lie inside it).
 *
 * @param {Image} image - Source.
 * @param {number} x - Left.
 * @param {number} y - Top.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @returns {Image} The copy.
 * @throws {RangeError} When the rectangle leaves the image.
 */
export function cropImage(image, x, y, w, h) {
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > image.width || y + h > image.height) {
    throw new RangeError(
      `crop ${x},${y} ${w}×${h} leaves the ${image.width}×${image.height} image`,
    );
  }
  const out = createImage(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * image.width + x) * 4;
    out.data.set(image.data.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
}

/**
 * Packs RGB channels into a 24-bit colour.
 *
 * @param {number} r - Red 0–255.
 * @param {number} g - Green 0–255.
 * @param {number} b - Blue 0–255.
 * @returns {number} `0xRRGGBB`.
 */
export const packRgb = (r, g, b) => (r << 16) | (g << 8) | b;

/**
 * Formats a 24-bit colour as `#rrggbb`.
 *
 * @param {number} c - `0xRRGGBB`.
 * @returns {string} Lower-case hex.
 */
export const hexOf = (c) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Parses `#rgb` or `#rrggbb` (case-insensitive) into a 24-bit colour.
 *
 * @param {unknown} text - The candidate.
 * @returns {number | null} `0xRRGGBB`, or `null` when it is not such a string.
 */
export function parseHex(text) {
  if (typeof text !== 'string') return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short !== null) {
    return packRgb(
      parseInt(short[1] + short[1], 16),
      parseInt(short[2] + short[2], 16),
      parseInt(short[3] + short[3], 16),
    );
  }
  if (/^#[0-9a-f]{6}$/i.test(text)) return parseInt(text.slice(1), 16);
  return null;
}

/**
 * Rec. 709 luma of a 24-bit colour on the 0–255 scale (the art bible's §4.1 measure).
 *
 * @param {number} c - `0xRRGGBB`.
 * @returns {number} `0.2126 R + 0.7152 G + 0.0722 B`.
 */
export const lumaOf = (c) =>
  0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

/**
 * Squared RGB distance of two 24-bit colours.
 *
 * @param {number} a - `0xRRGGBB`.
 * @param {number} b - `0xRRGGBB`.
 * @returns {number} `dr² + dg² + db²`.
 */
export function dist2(a, b) {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
  const db = (a & 255) - (b & 255);
  return dr * dr + dg * dg + db * db;
}

/**
 * Chebyshev distance (largest per-channel difference) of two 24-bit colours — the
 * palette-cycle shader's own measure (it matches within 1.5/255 in every channel).
 *
 * @param {number} a - `0xRRGGBB`.
 * @param {number} b - `0xRRGGBB`.
 * @returns {number} `max(|dr|, |dg|, |db|)`.
 */
export function chebyshev(a, b) {
  return Math.max(
    Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)),
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)),
    Math.abs((a & 255) - (b & 255)),
  );
}

/**
 * The 24-bit colour of pixel `i` (index into `width * height`).
 *
 * @param {Image} image - The image.
 * @param {number} i - Pixel index.
 * @returns {number} `0xRRGGBB` (alpha ignored).
 */
export function rgbAt(image, i) {
  const d = image.data;
  return packRgb(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
}

/**
 * Writes pixel `i`.
 *
 * @param {Image} image - The image.
 * @param {number} i - Pixel index.
 * @param {number} c - `0xRRGGBB`.
 * @param {number} a - Alpha 0–255.
 */
export function putRgba(image, i, c, a) {
  const d = image.data;
  d[i * 4] = (c >> 16) & 255;
  d[i * 4 + 1] = (c >> 8) & 255;
  d[i * 4 + 2] = c & 255;
  d[i * 4 + 3] = a;
}

/**
 * Whether two images have the same size and the same bytes.
 *
 * @param {Image} a - First.
 * @param {Image} b - Second.
 * @returns {boolean} `true` when pixel-identical.
 */
export function imagesEqual(a, b) {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}
