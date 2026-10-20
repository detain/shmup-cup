/**
 * Enemy bullets in the readability palette of `shmup_feat.md` §12: a **bright core**, a
 * saturated body and a **dark rim**, in pink, red and purple (never gold — items — or
 * orange — explosions). Shapes at the v1 sizes (art scale 1, byte for byte):
 *
 * - `bullets/round-<colour>` — 7×7, one frame.
 * - `bullets/oval-<colour>` — 9×9, 8 directional frames.
 * - `bullets/needle-<colour>` — 11×11, 8 directional frames (fast bullets).
 *
 * From R3-03.V1 the generator has a second, **native v2 path** (`artScale !== 1`): the art
 * bible v2 §5.4 sizes — round **11×11**, oval **13×13**, needle **17×17**, the frame rule and
 * the band geometry unchanged (the oval is the only frame the interim ×3/2 upscale did not
 * already hit: it upscaled 9×9 to 14×14). Those frames are marked `native` so the pipeline's
 * interim stage never scales them again.
 *
 * Directional frame `k` points `k · 22.5°` clockwise from +x (y down); the shapes are
 * symmetric, so 8 frames cover every heading: with a binary angle `a` (1024 units per
 * turn, `core/math`) the frame is `((a + 32) >> 6) & 7`.
 *
 * {@link bulletSprites} draws the set in any colours, with optional **shape coding** of the
 * core (plan M2-02): `palettes.mjs` uses it for the colour-blind variants
 * (`bullets/<shape>-<colour>@<palette>`). The `ring` / `dot` marks grow with the core on the
 * v2 path: one pixel at v1, a five-pixel plus at the v2 core size.
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
 * The three shapes' geometry at both art scales (`bulletSprites`): `size` the frame side (odd,
 * centred), `along` / `across` the ellipse semi-axes in pixels, `rimFrom` / `coreTo` the band
 * edges as normalised radii. The v1 rows are the plan M2-02 pixel map; the v2 rows are the art
 * bible v2 §5.4 — `⌈1.5⌉` of the v1 geometry throughout, with the bible's 13-px oval frame
 * (the interim upscale of the 9×9 landed on 14).
 *
 * @type {Readonly<Record<'round' | 'oval' | 'needle',
 *   Readonly<Record<'v1' | 'v2', {
 *     size: number, along: number, across: number, rimFrom: number, coreTo: number,
 *   }>>>}
 */
const BULLET_SHAPES = {
  round: {
    v1: { size: 7, along: 3.4, across: 3.4, rimFrom: 0.7, coreTo: 0.36 },
    v2: { size: 11, along: 5.1, across: 5.1, rimFrom: 0.7, coreTo: 0.36 },
  },
  oval: {
    v1: { size: 9, along: 4.3, across: 2.7, rimFrom: 0.72, coreTo: 0.4 },
    v2: { size: 13, along: 6.45, across: 4.05, rimFrom: 0.72, coreTo: 0.4 },
  },
  needle: {
    v1: { size: 11, along: 5.4, across: 1.7, rimFrom: 0.62, coreTo: 0.42 },
    v2: { size: 17, along: 8.1, across: 2.55, rimFrom: 0.62, coreTo: 0.42 },
  },
};

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
 * @param {number} [markRadius] - Radius of the `ring` / `dot` mark in pixels (default 0: the
 *   centre pixel alone, v1; the v2 path passes 1 — the plus of centre and four neighbours, the
 *   mark at the v2 core size, R3-03.V1).
 * @returns {Image} The frame.
 */
function drawEllipse(
  size,
  along,
  across,
  direction,
  palette,
  rimFrom,
  coreTo,
  mark = 'solid',
  markRadius = 0,
) {
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
  if (mark !== 'solid') {
    const ink = mark === 'ring' ? palette.rim : palette.core;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - centre;
        const dy = y - centre;
        if (dx * dx + dy * dy <= markRadius * markRadius) setPixel(image, x, y, ink);
      }
    }
  }
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
 * @param {number} [artScale] - The build's art scale (default 1): 1 draws the v1 pixel map,
 *   every other scale the art bible v2 §5.4 sizes, marked `native` (R3-03.V1).
 * @returns {SpriteDef[]} Round, oval and needle bullets in each colour.
 */
export function bulletSprites(colours, suffix = '', marks, generator = 'bullets', artScale = 1) {
  const v2 = artScale !== 1;
  /** @type {SpriteDef[]} */
  const sprites = [];
  const black = color('#000000');
  const white = color('#ffffff');
  for (const name of /** @type {(keyof typeof BULLET_COLORS)[]} */ (Object.keys(BULLET_COLORS))) {
    const base = color(colours[name]);
    const palette = { rim: mix(base, black, 0.68), body: base, core: mix(base, white, 0.75) };
    const mark = marks?.[name] ?? 'solid';
    const markRadius = v2 ? 1 : 0;
    for (const shape of /** @type {(keyof typeof BULLET_SHAPES)[]} */ (
      Object.keys(BULLET_SHAPES)
    )) {
      const g = BULLET_SHAPES[shape][v2 ? 'v2' : 'v1'];
      const directions = shape === 'round' ? [DIRECTIONS_8[0]] : DIRECTIONS_8;
      sprites.push(
        makeSprite(
          `bullets/${shape}-${name}${suffix}`,
          directions.map((d) =>
            drawEllipse(
              g.size,
              g.along,
              g.across,
              d,
              palette,
              g.rimFrom,
              g.coreTo,
              mark,
              markRadius,
            ),
          ),
          generator,
          v2 ? { native: true } : {},
        ),
      );
    }
  }
  return sprites;
}

/**
 * Generates every bullet sprite.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale of the
 *   build (default 1: the v1 pixel map; every other scale draws the art bible v2 sizes native,
 *   like the laser beams in `lasers.mjs` — R3-03.V1).
 * @returns {SpriteDef[]} Round, oval and needle bullets in each colour.
 */
export function generate(options = {}) {
  return bulletSprites(BULLET_COLORS, '', undefined, 'bullets', options.artScale ?? 1);
}
