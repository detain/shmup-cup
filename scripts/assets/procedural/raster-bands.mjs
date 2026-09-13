/**
 * Raster-effect backdrops — parallax bands drawn for the layer effects of plan M2-08 (the
 * `raster-range` dev stage uses them; later zones can too).
 *
 * - `bg/sea-swell` — a {@link SEA_TILE_W}×{@link SEA_TILE_H} band of sea swell painted **only** in
 *   the four colours of {@link SEA_RAMP}: rows of 3-px bands whose index steps with the row and
 *   bumps with a 32-px swell profile, so a stage palette cycle over the ramp makes the swell roll
 *   and a `wave` raster effect makes it wobble. The ramp is dark → light, low in saturation next to
 *   the pink / red enemy bullets (shmup_feat.md §12, §18).
 * - `bg/checker-floor` — a {@link FLOOR_TILE_W}×{@link FLOOR_TILE_H} checker floor in strips that
 *   grow taller ({@link FLOOR_BANDS}) and wider-checkered ({@link FLOOR_SQUARES}) towards the
 *   bottom: with a `lines` raster effect over the same strips (`bands`, each strip scrolled at its
 *   own speed, wrapped every {@link FLOOR_TILE_W} px) it reads as a pseudo-3D floor running to the
 *   horizon.
 *
 * Both repeat seamlessly along x (their width is a whole number of pattern periods) and are opaque,
 * anchored top-left. Pure integer maths: the pixels are the same on every engine.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/sea-swell` tile (its parallax `spacing`). */
export const SEA_TILE_W = 128;

/** Height of the `bg/sea-swell` tile. */
export const SEA_TILE_H = 40;

/**
 * The sea's four colours, dark → light — the exact colours a stage's palette cycle names
 * (`content/stages/raster-range.stage.json`).
 */
export const SEA_RAMP = Object.freeze(['#183c78', '#24569c', '#3474bc', '#5096d8']);

/** Swell profile: ramp steps added per 4-px column cell (a 32-px period). */
const SWELL = [0, 0, 1, 2, 2, 2, 1, 0];

/** Width of the `bg/checker-floor` tile (its parallax `spacing` and the raster `wrap`). */
export const FLOOR_TILE_W = 64;

/** Height of the `bg/checker-floor` tile. */
export const FLOOR_TILE_H = 48;

/** Heights of the floor's strips, top (the horizon) → bottom; they sum to {@link FLOOR_TILE_H}. */
export const FLOOR_BANDS = Object.freeze([2, 2, 3, 3, 4, 5, 6, 7, 8, 8]);

/**
 * Checker square width of each strip (nearer strips wider — perspective); every one divides half
 * the tile width, so the pattern repeats seamlessly every {@link FLOOR_TILE_W} px.
 */
export const FLOOR_SQUARES = Object.freeze([4, 4, 8, 8, 8, 16, 16, 16, 32, 32]);

/** The floor's two checker tones and its horizon line. */
export const FLOOR_COLORS = Object.freeze({
  light: '#6a4ab0',
  dark: '#3a2a6a',
  horizon: '#9a7ad8',
});

/**
 * Generates the raster-effect backdrops.
 *
 * @returns {SpriteDef[]} `bg/sea-swell` and `bg/checker-floor` (one frame each, anchor top-left).
 */
export function generate() {
  return [seaSwell(), checkerFloor()];
}

/**
 * The sea swell band.
 *
 * @returns {SpriteDef} `bg/sea-swell`.
 */
function seaSwell() {
  const ramp = SEA_RAMP.map(color);
  const image = createImage(SEA_TILE_W, SEA_TILE_H);
  for (let y = 0; y < SEA_TILE_H; y++) {
    for (let x = 0; x < SEA_TILE_W; x++) {
      const index = (Math.floor(y / 3) + SWELL[Math.floor(x / 4) % SWELL.length]) % ramp.length;
      setPixel(image, x, y, ramp[index]);
    }
  }
  return makeSprite('bg/sea-swell', [image], 'raster-bands', { anchor: [0, 0] });
}

/**
 * The checker floor band.
 *
 * @returns {SpriteDef} `bg/checker-floor`.
 */
function checkerFloor() {
  const light = color(FLOOR_COLORS.light);
  const dark = color(FLOOR_COLORS.dark);
  const horizon = color(FLOOR_COLORS.horizon);
  const image = createImage(FLOOR_TILE_W, FLOOR_TILE_H);
  let y = 0;
  for (let band = 0; band < FLOOR_BANDS.length; band++) {
    for (let row = 0; row < FLOOR_BANDS[band]; row++, y++) {
      for (let x = 0; x < FLOOR_TILE_W; x++) {
        const tone = (Math.floor(x / FLOOR_SQUARES[band]) + band) % 2 === 0 ? light : dark;
        setPixel(image, x, y, y === 0 ? horizon : tone);
      }
    }
  }
  return makeSprite('bg/checker-floor', [image], 'raster-bands', { anchor: [0, 0] });
}
