/**
 * The placeholder 8×8 terrain tileset `tiles/terrain-a`: solid rock, flat floor /
 * ceiling / wall edges, and slopes at 45° and 22.5° (two tiles per 22.5° slope) for
 * floors and ceilings in both directions.
 *
 * Frame `i` is tile {@link TERRAIN_TILES}`[i]`; the manifest also lists every tile as a
 * one-frame animation named after it (`floor → [1]`), so tileset content can refer to
 * tiles by name. Surfaces (the pixels facing open space) are a light rim; the interior is
 * a rock texture that depends only on the pixel's position inside the tile, so adjacent
 * solid tiles join seamlessly.
 *
 * Solid pixels per column for the floor slopes (heights from the tile bottom):
 * `slope-up` 1…8 (45°); `slope-up-low` 0,1,1,2,2,3,3,4 and `slope-up-high`
 * 4,5,5,6,6,7,7,8 (22.5°: equal pairs, so low → high → the next row's low keeps the
 * rhythm); `-down` variants are mirrored left ↔ right, `ceil-` variants top ↔ bottom.
 *
 * @module
 */
import { createImage, flipHorizontal, flipVertical, getPixel, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, makeSprite, seedOf } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Tile names in frame order. */
export const TERRAIN_TILES = /** @type {const} */ ([
  'solid',
  'floor',
  'ceiling',
  'wall-left',
  'wall-right',
  'slope-up',
  'slope-down',
  'slope-up-low',
  'slope-up-high',
  'slope-down-high',
  'slope-down-low',
  'ceil-slope-up',
  'ceil-slope-down',
  'ceil-slope-up-low',
  'ceil-slope-up-high',
  'ceil-slope-down-high',
  'ceil-slope-down-low',
]);

/** Tile side in pixels. */
export const TILE_SIZE = 8;

const SURFACE = color('#8ad0a8');
const SUBSURFACE = color('#4a9a7a');
const ROCK = [color('#2a5a58'), color('#1e4448'), color('#336a64')];

/**
 * Renders a floor-type tile: solid where `height(x) ≥ 8 - y` (heights in pixels from the
 * bottom), open space above.
 *
 * @param {(x: number) => number} height - Solid height of column `x` (0…8).
 * @param {boolean} openAbove - Whether the space above the tile is open (surface rim at
 *   the top of full-height columns).
 * @returns {Image} The tile.
 */
function floorTile(height, openAbove) {
  const seed = seedOf('tiles/terrain-a');
  const image = createImage(TILE_SIZE, TILE_SIZE);
  /**
   * Whether a pixel is solid; above the tile counts as open when `openAbove`.
   *
   * @param {number} x - Column.
   * @param {number} y - Row (may be negative).
   * @returns {boolean} Solid?
   */
  const solid = (x, y) => (y < 0 ? !openAbove : TILE_SIZE - y <= height(x));
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x, y - 1)) setPixel(image, x, y, SURFACE);
      else if (!solid(x, y - 2)) setPixel(image, x, y, SUBSURFACE);
      else {
        const h = hash2(x, y, seed);
        setPixel(image, x, y, ROCK[h % 7 === 0 ? 2 : h % 3 === 0 ? 1 : 0]);
      }
    }
  }
  return image;
}

/**
 * Transposes a square image (x ↔ y) — turns a floor into a left wall.
 *
 * @param {Image} image - Square source.
 * @returns {Image} The transposed copy.
 */
function transpose(image) {
  const out = createImage(image.height, image.width);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) setPixel(out, y, x, getPixel(image, x, y));
  }
  return out;
}

/**
 * Generates the tileset.
 *
 * @returns {SpriteDef[]} `tiles/terrain-a` (anchor top-left).
 */
export function generate() {
  const full = () => TILE_SIZE;
  const solid = floorTile(full, false);
  const floor = floorTile(full, true);
  const slopeUp = floorTile((x) => x + 1, true);
  const upLow = floorTile((x) => (x + 1) / 2, true);
  const upHigh = floorTile((x) => 4 + (x + 1) / 2, true);
  const wallLeft = transpose(floor);
  /** @type {Record<(typeof TERRAIN_TILES)[number], Image>} */
  const tiles = {
    solid,
    floor,
    ceiling: flipVertical(floor),
    'wall-left': wallLeft,
    'wall-right': flipHorizontal(wallLeft),
    'slope-up': slopeUp,
    'slope-down': flipHorizontal(slopeUp),
    'slope-up-low': upLow,
    'slope-up-high': upHigh,
    'slope-down-high': flipHorizontal(upHigh),
    'slope-down-low': flipHorizontal(upLow),
    'ceil-slope-up': flipVertical(slopeUp),
    'ceil-slope-down': flipVertical(flipHorizontal(slopeUp)),
    'ceil-slope-up-low': flipVertical(upLow),
    'ceil-slope-up-high': flipVertical(upHigh),
    'ceil-slope-down-high': flipVertical(flipHorizontal(upHigh)),
    'ceil-slope-down-low': flipVertical(flipHorizontal(upLow)),
  };
  /** @type {Record<string, number[]>} */
  const animations = {};
  TERRAIN_TILES.forEach((name, i) => {
    animations[name] = [i];
  });
  return [
    makeSprite(
      'tiles/terrain-a',
      TERRAIN_TILES.map((name) => tiles[name]),
      'terrain',
      { anchor: [0, 0], animations },
    ),
  ];
}
