/**
 * The shared helpers of the procedural generator suites (sizes, pixels, colours and
 * rotations), factored out of `procedural.test.ts` by plan R4-P.P2.
 *
 * @module
 */
import { getPixel, type Image, type Rgba } from '../../../scripts/assets/image.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

/**
 * Finds a generated sprite by name.
 *
 * @param sprites - Generator output.
 * @param name - Sprite name.
 * @returns The sprite (the test fails when it is missing).
 */
export function byName(sprites: readonly SpriteDef[], name: string): SpriteDef {
  const sprite = sprites.find((s) => s.name === name);
  if (sprite === undefined) throw new Error(`no sprite ${name}`);
  return sprite;
}

/** Whether a pixel is visible (inside the frame and alpha > 0). */
export const opaque = (frame: Image, x: number, y: number): boolean => getPixel(frame, x, y)[3] > 0;

/** A colour as a comparable string. */
export const key = (rgba: readonly number[]): string => rgba.join(',');

/**
 * Visits every visible pixel.
 *
 * @param frame - The frame.
 * @param visit - Called with the column, row and colour.
 */
export function eachOpaque(frame: Image, visit: (x: number, y: number, rgba: Rgba) => void): void {
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const rgba = getPixel(frame, x, y);
      if (rgba[3] > 0) visit(x, y, rgba);
    }
  }
}

/**
 * Counts visible pixels.
 *
 * @param frame - The frame.
 * @returns How many pixels have alpha > 0.
 */
export function opaqueCount(frame: Image): number {
  let count = 0;
  eachOpaque(frame, () => {
    count++;
  });
  return count;
}

/**
 * Whether a visible pixel lies on the silhouette edge (a 4-neighbour is transparent or
 * outside the frame).
 *
 * @param frame - The frame.
 * @param x - Column.
 * @param y - Row.
 * @returns `true` on the edge.
 */
export function onEdge(frame: Image, x: number, y: number): boolean {
  return (
    !opaque(frame, x - 1, y) ||
    !opaque(frame, x + 1, y) ||
    !opaque(frame, x, y - 1) ||
    !opaque(frame, x, y + 1)
  );
}

/**
 * Relative luminance proxy (Rec. 601 weights) of a colour.
 *
 * @param rgba - Colour.
 * @returns 0…255.
 */
export const luma = (rgba: readonly number[]): number =>
  0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2];

/**
 * Hue of a colour in degrees.
 *
 * @param rgba - Colour.
 * @returns 0…360 (0 for greys).
 */
export function hue(rgba: readonly number[]): number {
  const [r, g, b] = rgba.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Rotates a square frame 90° clockwise (reference implementation for the tests).
 *
 * @param frame - Square frame.
 * @returns The rotated bytes.
 */
export function rotateCw(frame: Image): Uint8Array {
  const n = frame.width;
  const out = new Uint8Array(frame.data.length);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const from = (y * n + x) * 4;
      out.set(frame.data.subarray(from, from + 4), (x * n + (n - 1 - y)) * 4);
    }
  }
  return out;
}

/**
 * Column heights of a tile: solid pixels per column.
 *
 * @param tile - 8×8 tile.
 * @returns Eight counts.
 */
export function columnHeights(tile: Image): number[] {
  return Array.from({ length: tile.width }, (_, x) => {
    let count = 0;
    for (let y = 0; y < tile.height; y++) if (opaque(tile, x, y)) count++;
    return count;
  });
}
