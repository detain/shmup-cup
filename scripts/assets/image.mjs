/**
 * Raster helpers shared by the asset pipeline: an RGBA image type, colour parsing,
 * pixel access, blitting and flips.
 *
 * Images are plain objects `{ width, height, data }` where `data` is a `Uint8Array` of
 * `width * height * 4` bytes, row-major, **straight (non-premultiplied) alpha** — the
 * layout PNG stores and pngjs decodes to.
 *
 * @module
 */

/**
 * An RGBA raster image.
 *
 * @typedef {object} Image
 * @property {number} width - Width in pixels (≥ 1).
 * @property {number} height - Height in pixels (≥ 1).
 * @property {Uint8Array} data - `width * height * 4` bytes, row-major RGBA, straight alpha.
 */

/**
 * One colour as four 0…255 channels.
 *
 * @typedef {[number, number, number, number]} Rgba
 */

/**
 * Creates a transparent image.
 *
 * @param {number} width - Width in pixels (integer ≥ 1).
 * @param {number} height - Height in pixels (integer ≥ 1).
 * @returns {Image} A fully transparent image.
 * @throws {RangeError} When a dimension is not a positive integer.
 */
export function createImage(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`image size must be positive integers, got ${width}×${height}`);
  }
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/**
 * Parses `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` (case-insensitive).
 *
 * @param {string} text - The colour text.
 * @returns {Rgba | null} The channels, or `null` when the text is not a colour.
 */
export function parseColor(text) {
  if (typeof text !== 'string') return null;
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
  if (match === null) return null;
  let hex = match[1];
  if (hex.length <= 4) {
    hex = hex
      .split('')
      .map((digit) => digit + digit)
      .join('');
  }
  if (hex.length === 6) hex += 'ff';
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
    parseInt(hex.slice(6, 8), 16),
  ];
}

/**
 * Writes one pixel; coordinates outside the image are ignored (generators may draw
 * shapes that overhang the frame).
 *
 * @param {Image} image - Target image.
 * @param {number} x - Column (integer).
 * @param {number} y - Row (integer).
 * @param {Rgba} rgba - The colour.
 */
export function setPixel(image, x, y, rgba) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  image.data[i] = rgba[0];
  image.data[i + 1] = rgba[1];
  image.data[i + 2] = rgba[2];
  image.data[i + 3] = rgba[3];
}

/**
 * Reads one pixel.
 *
 * @param {Image} image - Source image.
 * @param {number} x - Column (integer, inside the image).
 * @param {number} y - Row (integer, inside the image).
 * @returns {Rgba} The colour (`[0, 0, 0, 0]` outside the image).
 */
export function getPixel(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [0, 0, 0, 0];
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

/**
 * Copies a rectangle of `source` into `target` (plain copy, no blending).
 *
 * @param {Image} target - Destination image.
 * @param {Image} source - Source image.
 * @param {number} dx - Destination column of the rectangle's top-left pixel.
 * @param {number} dy - Destination row of the rectangle's top-left pixel.
 * @param {number} [sx] - Source column (default 0).
 * @param {number} [sy] - Source row (default 0).
 * @param {number} [w] - Rectangle width (default: the rest of the source row).
 * @param {number} [h] - Rectangle height (default: the rest of the source column).
 * @throws {RangeError} When the rectangle does not fit either image.
 */
export function blit(target, source, dx, dy, sx = 0, sy = 0, w, h) {
  const width = w ?? source.width - sx;
  const height = h ?? source.height - sy;
  if (
    sx < 0 ||
    sy < 0 ||
    sx + width > source.width ||
    sy + height > source.height ||
    dx < 0 ||
    dy < 0 ||
    dx + width > target.width ||
    dy + height > target.height
  ) {
    throw new RangeError(
      `blit ${width}×${height} from (${sx},${sy}) to (${dx},${dy}) is out of bounds`,
    );
  }
  for (let row = 0; row < height; row++) {
    const from = ((sy + row) * source.width + sx) * 4;
    const to = ((dy + row) * target.width + dx) * 4;
    target.data.set(source.data.subarray(from, from + width * 4), to);
  }
}

/**
 * Copies a rectangle out of an image.
 *
 * @param {Image} source - Source image.
 * @param {number} x - Left column.
 * @param {number} y - Top row.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @returns {Image} The cropped copy.
 * @throws {RangeError} When the rectangle is empty or leaves the image.
 */
export function crop(source, x, y, w, h) {
  const out = createImage(w, h);
  blit(out, source, 0, 0, x, y, w, h);
  return out;
}

/**
 * Mirrors an image left ↔ right.
 *
 * @param {Image} image - Source image (not modified).
 * @returns {Image} The mirrored copy.
 */
export function flipHorizontal(image) {
  const out = createImage(image.width, image.height);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      setPixel(out, image.width - 1 - x, y, getPixel(image, x, y));
    }
  }
  return out;
}

/**
 * Mirrors an image top ↔ bottom.
 *
 * @param {Image} image - Source image (not modified).
 * @returns {Image} The mirrored copy.
 */
export function flipVertical(image) {
  const out = createImage(image.width, image.height);
  for (let y = 0; y < image.height; y++) {
    blit(out, image, 0, image.height - 1 - y, 0, y, image.width, 1);
  }
  return out;
}

/**
 * Draws a character pixel map (the `rows` format of `*.sprite.json`) into a new image.
 *
 * @param {readonly string[]} rows - Equal-length rows; one character per pixel.
 * @param {Readonly<Record<string, Rgba | null>>} palette - Character → colour
 *   (`null` = transparent). Characters missing from the palette are transparent.
 * @returns {Image} The image (`rows[0].length × rows.length`).
 */
export function imageFromRows(rows, palette) {
  const image = createImage(rows[0].length, rows.length);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const color = palette[rows[y].charAt(x)];
      if (color !== undefined && color !== null) setPixel(image, x, y, color);
    }
  }
  return image;
}

/**
 * Whether two images have the same size and the same bytes.
 *
 * @param {Image} a - First image.
 * @param {Image} b - Second image.
 * @returns {boolean} `true` when identical.
 */
export function imagesEqual(a, b) {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}
