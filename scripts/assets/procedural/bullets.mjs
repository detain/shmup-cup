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
 * {@link bulletSprites} draws the set in any colours, with optional **shape coding** of the
 * core (plan M2-02): `palettes.mjs` uses it for the colour-blind variants
 * (`bullets/<shape>-<colour>@<palette>`).
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
 * How a colour family's core is marked (shape coding, M2-02): `solid` — the bright core disc
 * (the standard look); `ring` — the core with a dark centre pixel; `dot` — no core band, one
 * bright centre pixel.
 *
 * @typedef {'solid' | 'ring' | 'dot'} CoreMark
 */

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
 * @param {CoreMark} [mark] - Shape coding of the core (default `solid`).
 * @returns {Image} The frame.
 */
function drawEllipse(size, along, across, direction, palette, rimFrom, coreTo, mark = 'solid') {
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
      const core = mark === 'dot' ? palette.body : palette.core;
      setPixel(image, x, y, edge || e > rimFrom ? palette.rim : e <= coreTo ? core : palette.body);
    }
  }
  if (mark === 'ring') setPixel(image, centre, centre, palette.rim);
  else if (mark === 'dot') setPixel(image, centre, centre, palette.core);
  return image;
}

/**
 * Draws the nine bullet sprites in the given colours.
 *
 * @param {Readonly<Record<keyof typeof BULLET_COLORS, string>>} colours - Body colour per family.
 * @param {string} [suffix] - Appended to every sprite name (`@deuteranopia`; default none).
 * @param {Readonly<Record<keyof typeof BULLET_COLORS, CoreMark>>} [marks] - Core shape coding per
 *   family (default: all `solid`).
 * @param {string} [generator] - Generator id of the sprites' `origin` (default `bullets`).
 * @returns {SpriteDef[]} Round, oval and needle bullets in each colour.
 */
export function bulletSprites(colours, suffix = '', marks, generator = 'bullets') {
  /** @type {SpriteDef[]} */
  const sprites = [];
  const black = color('#000000');
  const white = color('#ffffff');
  for (const name of /** @type {(keyof typeof BULLET_COLORS)[]} */ (Object.keys(BULLET_COLORS))) {
    const base = color(colours[name]);
    const palette = { rim: mix(base, black, 0.68), body: base, core: mix(base, white, 0.75) };
    const mark = marks?.[name] ?? 'solid';
    sprites.push(
      makeSprite(
        `bullets/round-${name}${suffix}`,
        [drawEllipse(7, 3.4, 3.4, DIRECTIONS_8[0], palette, 0.7, 0.36, mark)],
        generator,
      ),
    );
    sprites.push(
      makeSprite(
        `bullets/oval-${name}${suffix}`,
        DIRECTIONS_8.map((d) => drawEllipse(9, 4.3, 2.7, d, palette, 0.72, 0.4, mark)),
        generator,
      ),
    );
    sprites.push(
      makeSprite(
        `bullets/needle-${name}${suffix}`,
        DIRECTIONS_8.map((d) => drawEllipse(11, 5.4, 1.7, d, palette, 0.62, 0.42, mark)),
        generator,
      ),
    );
  }
  return sprites;
}

/**
 * Generates every bullet sprite.
 *
 * @returns {SpriteDef[]} Round, oval and needle bullets in each colour.
 */
export function generate() {
  return bulletSprites(BULLET_COLORS);
}
