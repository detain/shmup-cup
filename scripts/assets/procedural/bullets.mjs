/**
 * Enemy bullets in the readability palette of `shmup_feat.md` §12: a **bright core**, a
 * saturated body and a **dark rim**, in pink, red and purple (never gold — items — or
 * orange — explosions). Shapes:
 *
 * - `bullets/round-<colour>` — 7×7, one frame.
 * - `bullets/oval-<colour>` — 9×9, 8 directional frames.
 * - `bullets/needle-<colour>` — 11×11, 8 directional frames (fast bullets).
 *
 * Directional frame `k` points `k · 22.5°` clockwise from +x (y down); the shapes are
 * symmetric, so 8 frames cover every heading: with a binary angle `a` (1024 units per
 * turn, `core/math`) the frame is `((a + 32) >> 6) & 7`.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { DIRECTIONS_8, color, makeSprite, mix } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Bullet colour families: body colour per name. */
export const BULLET_COLORS = /** @type {const} */ ({
  pink: '#ff5aa0',
  red: '#ff3a3a',
  purple: '#b84cff',
});

/**
 * Draws an ellipse bullet with rim / body / core bands.
 *
 * @remarks
 * The rim is the outer band of the ellipse **and** every pixel on the silhouette edge (a
 * 4-neighbour outside the shape): on thin shapes (needles, the diagonal ovals) the band
 * alone is narrower than a pixel across the heading and would leave the body colour
 * exposed on the long sides, losing the dark outline §12 asks for.
 *
 * @param {number} size - Frame side (odd).
 * @param {number} along - Semi-axis along the heading.
 * @param {number} across - Semi-axis across the heading.
 * @param {readonly [number, number]} direction - `[cos, sin]` of the heading.
 * @param {{ rim: Rgba, body: Rgba, core: Rgba }} palette - Band colours.
 * @param {number} rimFrom - Normalised radius where the rim starts (0…1).
 * @param {number} coreTo - Normalised radius where the core ends (0…1).
 * @returns {Image} The frame.
 */
function drawEllipse(size, along, across, direction, palette, rimFrom, coreTo) {
  const image = createImage(size, size);
  const centre = (size - 1) / 2;
  const [c, s] = direction;
  /**
   * Normalised elliptic radius of a pixel centre (> 1 = outside the bullet).
   *
   * @param {number} x - Column (may lie outside the frame).
   * @param {number} y - Row (may lie outside the frame).
   * @returns {number} The radius.
   */
  const radius = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return Infinity;
    const dx = x - centre;
    const dy = y - centre;
    const u = (dx * c + dy * s) / along;
    const v = (-dx * s + dy * c) / across;
    return Math.sqrt(u * u + v * v);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const e = radius(x, y);
      if (e > 1) continue;
      const edge =
        radius(x - 1, y) > 1 ||
        radius(x + 1, y) > 1 ||
        radius(x, y - 1) > 1 ||
        radius(x, y + 1) > 1;
      setPixel(
        image,
        x,
        y,
        edge || e > rimFrom ? palette.rim : e <= coreTo ? palette.core : palette.body,
      );
    }
  }
  return image;
}

/**
 * Generates every bullet sprite.
 *
 * @returns {SpriteDef[]} Round, oval and needle bullets in each colour.
 */
export function generate() {
  /** @type {SpriteDef[]} */
  const sprites = [];
  const black = color('#000000');
  const white = color('#ffffff');
  for (const [name, body] of Object.entries(BULLET_COLORS)) {
    const base = color(body);
    const palette = { rim: mix(base, black, 0.68), body: base, core: mix(base, white, 0.75) };
    sprites.push(
      makeSprite(
        `bullets/round-${name}`,
        [drawEllipse(7, 3.4, 3.4, DIRECTIONS_8[0], palette, 0.7, 0.36)],
        'bullets',
      ),
    );
    sprites.push(
      makeSprite(
        `bullets/oval-${name}`,
        DIRECTIONS_8.map((d) => drawEllipse(9, 4.3, 2.7, d, palette, 0.72, 0.4)),
        'bullets',
      ),
    );
    sprites.push(
      makeSprite(
        `bullets/needle-${name}`,
        DIRECTIONS_8.map((d) => drawEllipse(11, 5.4, 1.7, d, palette, 0.62, 0.42)),
        'bullets',
      ),
    );
  }
  return sprites;
}
