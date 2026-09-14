/**
 * Helpers shared by the procedural placeholder generators: colour maths, name-derived
 * seeds and a sprite constructor.
 *
 * Only exactly-rounded IEEE operations (`+ - * /`, `Math.sqrt`, `Math.floor/round`) are
 * used for geometry, so the generated pixels are identical on every engine — no
 * `Math.sin`/`Math.cos` (rotations use the exact 22.5° constants below).
 *
 * **Public API.** {@link DIRECTIONS_8}, {@link color}, {@link mix}, {@link withAlpha},
 * {@link seedOf}, {@link makeSprite}; the shape helpers of the zone generators (M2-11)
 * {@link fillEllipse} and {@link drawLine}.
 *
 * @module
 */
import { parseColor, setPixel } from '../image.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * `cos` / `sin` of the eight directions `k · 22.5°` (k = 0…7), clockwise on screen from
 * +x, computed from square roots only (`cos 22.5° = √(2 + √2) / 2`).
 *
 * @type {readonly (readonly [number, number])[]}
 */
export const DIRECTIONS_8 = (() => {
  const r2 = Math.sqrt(2);
  const c1 = Math.sqrt(2 + r2) / 2;
  const s1 = Math.sqrt(2 - r2) / 2;
  const h = r2 / 2;
  return [
    [1, 0],
    [c1, s1],
    [h, h],
    [s1, c1],
    [0, 1],
    [-s1, c1],
    [-h, h],
    [-c1, s1],
  ];
})();

/**
 * Parses a colour literal that is known to be valid.
 *
 * @param {string} text - `#rgb`, `#rrggbb` or `#rrggbbaa`.
 * @returns {Rgba} The channels.
 * @throws {TypeError} When the literal is malformed (a bug in a generator).
 */
export function color(text) {
  const rgba = parseColor(text);
  if (rgba === null) throw new TypeError(`bad colour literal ${text}`);
  return rgba;
}

/**
 * Linear mix of two colours.
 *
 * @param {Rgba} a - Colour at `t = 0`.
 * @param {Rgba} b - Colour at `t = 1`.
 * @param {number} t - Blend factor 0…1.
 * @returns {Rgba} The rounded mix.
 */
export function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}

/**
 * Same colour with another alpha.
 *
 * @param {Rgba} rgba - Source colour.
 * @param {number} alpha - New alpha 0…255.
 * @returns {Rgba} The colour.
 */
export function withAlpha(rgba, alpha) {
  return [rgba[0], rgba[1], rgba[2], alpha];
}

/**
 * 32-bit FNV-1a hash of a string — gives every generated sprite its own seed, derived
 * from its name, so generators are independent of each other and of run order.
 *
 * @param {string} text - Input (usually the sprite name).
 * @returns {number} Unsigned 32-bit hash.
 */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Builds a procedural sprite definition.
 *
 * @param {string} name - Sprite name.
 * @param {Image[]} frames - Frames (same size).
 * @param {string} generator - Generator module id (for `origin`).
 * @param {{ anchor?: [number, number] | null, hitFlash?: boolean,
 *   animations?: Record<string, number[]> }} [options] - Metadata.
 * @returns {SpriteDef} The sprite.
 */
export function makeSprite(name, frames, generator, options = {}) {
  return {
    name,
    anchor: options.anchor ?? null,
    hitFlash: options.hitFlash ?? false,
    frames,
    animations: options.animations ?? {},
    origin: `procedural:${generator}`,
  };
}

/**
 * Paints the pixels of an ellipse (M2-11 zone art): for every pixel whose centre lies inside the
 * ellipse of centre (`cx`, `cy`) and radii `rx` × `ry`, `paint` is asked for a colour.
 *
 * @param {Image} image - Target image.
 * @param {number} cx - Centre column (may be fractional).
 * @param {number} cy - Centre row (may be fractional).
 * @param {number} rx - Horizontal radius (> 0).
 * @param {number} ry - Vertical radius (> 0).
 * @param {(u: number, v: number, e: number, x: number, y: number) => Rgba | null} paint - Colour of
 *   the pixel at (`x`, `y`) — `u` / `v` are its offsets in radii (−1 … 1), `e` = √(u² + v²) its
 *   normalised distance from the centre (0 … 1); `null` leaves the pixel alone.
 */
export function fillEllipse(image, cx, cy, rx, ry, paint) {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(image.width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(image.height - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      const e = Math.sqrt(u * u + v * v);
      if (e > 1) continue;
      const rgba = paint(u, v, e, x, y);
      if (rgba !== null) setPixel(image, x, y, rgba);
    }
  }
}

/**
 * Draws a straight line of round dots (M2-11 zone art): legs, spikes, tentacles.
 *
 * @param {Image} image - Target image.
 * @param {number} x0 - Start column.
 * @param {number} y0 - Start row.
 * @param {number} x1 - End column.
 * @param {number} y1 - End row.
 * @param {Rgba} rgba - The colour.
 * @param {number} [width] - Dot diameter in pixels (1 or more, default 1).
 */
export function drawLine(image, x0, y0, x1, y1, rgba, width = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
  const r = (width - 1) / 2;
  for (let i = 0; i <= steps; i++) {
    const px = x0 + (dx * i) / steps;
    const py = y0 + (dy * i) / steps;
    for (let oy = -Math.ceil(r); oy <= Math.ceil(r); oy++) {
      for (let ox = -Math.ceil(r); ox <= Math.ceil(r); ox++) {
        if (ox * ox + oy * oy > r * r + 0.25) continue;
        setPixel(image, Math.round(px + ox), Math.round(py + oy), rgba);
      }
    }
  }
}
