/**
 * Enemy laser beams `lasers/beam-<colour>` in the bullet readability palette of `shmup_feat.md`
 * §12 (the same colours as `bullets.mjs`): 8 frames of 4×8 px, frame `k` a horizontal band
 * `k + 1` px tall centred in the frame — a dark rim row at the top and bottom (3 px and up), a
 * saturated body row inside each (5 px and up) and a bright core. Every column is identical, so
 * the renderer stretches a frame to any laser length; it picks the frame of the beam's drawn
 * width, so growing and fading beams never scale across (`render-pixi` `createLaserBinding`,
 * plan M1-09).
 *
 * The bending lasers' segments `lasers/bend-<colour>` (plan M2-02): one 7×7 round blob (rim /
 * body / core, like a round bullet) the renderer draws at every node of a bending laser's body.
 * {@link laserSprites} draws both in any colours — `palettes.mjs` uses it for the colour-blind
 * variants.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { BULLET_COLORS } from './bullets.mjs';
import { color, makeSprite, mix } from './common.mjs';

/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Beam strip width in pixels (any width works — every column is the same). */
export const BEAM_WIDTH = 4;

/** Frame height = the widest band (frames: bands 1 … BEAM_HEIGHT px tall). */
export const BEAM_HEIGHT = 8;

/**
 * The rows of a band `height` px tall, top to bottom.
 *
 * @param {number} height - Band height (1 … BEAM_HEIGHT).
 * @param {{ rim: Rgba, body: Rgba, core: Rgba }} palette - Band colours.
 * @returns {Rgba[]} One colour per row.
 */
export function bandRows(height, palette) {
  /** @type {Rgba[]} */
  const rows = [];
  for (let y = 0; y < height; y++) {
    const edge = Math.min(y, height - 1 - y);
    rows.push(
      height >= 3 && edge === 0
        ? palette.rim
        : height >= 5 && edge === 1
          ? palette.body
          : palette.core,
    );
  }
  return rows;
}

/** Side of a bending laser segment (odd: centred on its node). */
export const BEND_SIZE = 7;

/**
 * Draws one bending laser segment: a round blob, dark rim outside radius 2.6, bright core inside
 * radius 1.3.
 *
 * @param {{ rim: Rgba, body: Rgba, core: Rgba }} palette - Band colours.
 * @returns {import('../image.mjs').Image} The 7×7 frame.
 */
function bendBlob(palette) {
  const image = createImage(BEND_SIZE, BEND_SIZE);
  const c = (BEND_SIZE - 1) / 2;
  for (let y = 0; y < BEND_SIZE; y++) {
    for (let x = 0; x < BEND_SIZE; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 3.4) continue;
      setPixel(image, x, y, r > 2.6 ? palette.rim : r > 1.3 ? palette.body : palette.core);
    }
  }
  return image;
}

/**
 * Draws the beams and the bending laser segments in the given colours.
 *
 * @param {Readonly<Record<keyof typeof BULLET_COLORS, string>>} colours - Body colour per family.
 * @param {string} [suffix] - Appended to every sprite name (`@tritanopia`; default none).
 * @param {string} [generator] - Generator id of the sprites' `origin` (default `lasers`).
 * @returns {SpriteDef[]} One 8-frame beam and one segment per colour.
 */
export function laserSprites(colours, suffix = '', generator = 'lasers') {
  /** @type {SpriteDef[]} */
  const sprites = [];
  const black = color('#000000');
  const white = color('#ffffff');
  for (const name of /** @type {(keyof typeof BULLET_COLORS)[]} */ (Object.keys(BULLET_COLORS))) {
    const base = color(colours[name]);
    const palette = { rim: mix(base, black, 0.68), body: base, core: mix(base, white, 0.75) };
    const frames = [];
    for (let height = 1; height <= BEAM_HEIGHT; height++) {
      const image = createImage(BEAM_WIDTH, BEAM_HEIGHT);
      const rows = bandRows(height, palette);
      const top = Math.floor((BEAM_HEIGHT - height) / 2);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < BEAM_WIDTH; x++) setPixel(image, x, top + y, rows[y]);
      }
      frames.push(image);
    }
    sprites.push(makeSprite(`lasers/beam-${name}${suffix}`, frames, generator));
    sprites.push(makeSprite(`lasers/bend-${name}${suffix}`, [bendBlob(palette)], generator));
  }
  return sprites;
}

/**
 * Generates the beam strips and the bending laser segments.
 *
 * @returns {SpriteDef[]} One 8-frame beam and one segment per bullet colour.
 */
export function generate() {
  return laserSprites(BULLET_COLORS);
}
