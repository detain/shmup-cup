/**
 * Enemy laser beams `lasers/beam-<colour>` in the bullet readability palette of `shmup_feat.md`
 * §12 (the same colours as `bullets.mjs`): 8 frames of 4×8 px, frame `k` a horizontal band
 * `k + 1` px tall centred in the frame — a dark rim row at the top and bottom (3 px and up), a
 * saturated body row inside each (5 px and up) and a bright core. Every column is identical, so
 * the renderer stretches a frame to any laser length; it picks the frame of the beam's drawn
 * width, so growing and fading beams never scale across (`render-pixi` `createLaserBinding`,
 * plan M1-09).
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

/**
 * Generates the beam strips.
 *
 * @returns {SpriteDef[]} One 8-frame beam per bullet colour.
 */
export function generate() {
  /** @type {SpriteDef[]} */
  const sprites = [];
  const black = color('#000000');
  const white = color('#ffffff');
  for (const [name, body] of Object.entries(BULLET_COLORS)) {
    const base = color(body);
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
    sprites.push(makeSprite(`lasers/beam-${name}`, frames, 'lasers'));
  }
  return sprites;
}
