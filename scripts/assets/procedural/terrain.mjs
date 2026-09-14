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
 * Plan M2-07 appended three full blocks for destructible terrain (the tileset gives them `hp`):
 * `brick` (a cracked brick you can shoot through), `cube` (the crystal a cube rush stacks into
 * walls) and `tissue` (organic wall that grows back). They are opaque on every pixel, like
 * `solid`, and look different from rock so players can tell what breaks.
 *
 * Plan M2-11 added two recoloured sets with the same tiles, frames and shapes for the zones'
 * own terrain ({@link TERRAIN_PALETTES}): `tiles/terrain-reef` (BRINE NEBULA's pale coral over
 * deep blue-grey stone) and `tiles/terrain-dune` (DUNE EXPANSE's sand). Only the rock colours
 * differ (the rock texture's hash is seeded per set); the destructible blocks look the same in
 * every set, so a brick reads as a brick in every zone.
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
  'brick',
  'cube',
  'tissue',
]);

/** Tile side in pixels. */
export const TILE_SIZE = 8;

/**
 * The rock colours of one tileset: the outermost solid pixel facing open space (the light rim),
 * the pixel just below it, and the interior tones picked per pixel by a position hash (index 0
 * most common).
 *
 * @typedef {object} TerrainPalette
 * @property {string} surface - Rim colour.
 * @property {string} subsurface - Colour under the rim.
 * @property {readonly [string, string, string]} rock - Interior tones.
 */

/**
 * The generated tilesets by sprite name and their rock colours: zone A's `tiles/terrain-a` (M1-03)
 * and the zone sets of M2-11. Kept low in saturation next to the pink / red / purple bullets and
 * the capsules (shmup_feat.md §12, §18).
 *
 * @type {Readonly<Record<string, TerrainPalette>>}
 */
export const TERRAIN_PALETTES = Object.freeze({
  'tiles/terrain-a': {
    surface: '#8ad0a8',
    subsurface: '#4a9a7a',
    rock: ['#2a5a58', '#1e4448', '#336a64'],
  },
  'tiles/terrain-reef': {
    surface: '#f0c890',
    subsurface: '#c08858',
    rock: ['#3a4a6a', '#2c3a58', '#485a7c'],
  },
  'tiles/terrain-dune': {
    surface: '#ecd08c',
    subsurface: '#c49a5c',
    rock: ['#8a6232', '#7a542a', '#9a6e3a'],
  },
});

/**
 * Renders a floor-type tile: solid where `height(x) ≥ 8 - y` (heights in pixels from the
 * bottom), open space above.
 *
 * @param {(x: number) => number} height - Solid height of column `x` (0…8).
 * @param {boolean} openAbove - Whether the space above the tile is open (surface rim at
 *   the top of full-height columns).
 * @param {string} name - The tileset's sprite name (seeds the rock texture).
 * @returns {Image} The tile.
 */
function floorTile(height, openAbove, name) {
  const palette = TERRAIN_PALETTES[name];
  const surface = color(palette.surface);
  const subsurface = color(palette.subsurface);
  const rock = palette.rock.map(color);
  const seed = seedOf(name);
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
      if (!solid(x, y - 1)) setPixel(image, x, y, surface);
      else if (!solid(x, y - 2)) setPixel(image, x, y, subsurface);
      else {
        const h = hash2(x, y, seed);
        setPixel(image, x, y, rock[h % 7 === 0 ? 2 : h % 3 === 0 ? 1 : 0]);
      }
    }
  }
  return image;
}

/** Brick face, mortar and crack colours of the `brick` tile (M2-07). */
const BRICK = [color('#b0704a'), color('#5a3424'), color('#7e4a32')];

/** Crystal face, edge light and core of the `cube` tile (M2-07). */
const CUBE = [color('#8a48e8'), color('#c8a0ff'), color('#4a2090')];

/** Tissue flesh, highlight and dark cell nuclei of the `tissue` tile (M2-07). */
const TISSUE = [color('#c8587a'), color('#f090b0'), color('#6a1a3a')];

/**
 * The `brick` tile: two courses of bricks with mortar lines and a diagonal crack.
 *
 * @returns {Image} The tile (every pixel opaque).
 */
function brickTile() {
  const image = createImage(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const course = y < 4 ? 0 : 1;
      const joint = course === 0 ? x === 3 : x === 7;
      const mortar = y === 3 || y === 7 || joint;
      const crack = x + y === 7 && !mortar;
      setPixel(image, x, y, mortar ? BRICK[1] : crack ? BRICK[2] : BRICK[0]);
    }
  }
  return image;
}

/**
 * The `cube` tile: a bevelled crystal block (light top-left edge, dark bottom-right, a core).
 *
 * @returns {Image} The tile (every pixel opaque).
 */
function cubeTile() {
  const image = createImage(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const light = x === 0 || y === 0;
      const dark = x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
      const core = (x === 3 || x === 4) && (y === 3 || y === 4);
      setPixel(image, x, y, light ? CUBE[1] : dark || core ? CUBE[2] : CUBE[0]);
    }
  }
  return image;
}

/**
 * The `tissue` tile: flesh with a position-hashed highlight and dark nuclei.
 *
 * @returns {Image} The tile (every pixel opaque).
 */
function tissueTile() {
  const seed = seedOf('tiles/terrain-a/tissue');
  const image = createImage(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const h = hash2(x, y, seed);
      setPixel(image, x, y, h % 9 === 0 ? TISSUE[2] : h % 4 === 0 ? TISSUE[1] : TISSUE[0]);
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
 * Generates the tilesets.
 *
 * @returns {SpriteDef[]} `tiles/terrain-a`, then the M2-11 sets `tiles/terrain-reef` and
 *   `tiles/terrain-dune` (anchor top-left, frame `i` = {@link TERRAIN_TILES}`[i]`).
 */
export function generate() {
  return Object.keys(TERRAIN_PALETTES).map(tileset);
}

/**
 * Draws one tileset in its palette.
 *
 * @param {string} name - Its sprite name (a {@link TERRAIN_PALETTES} key).
 * @returns {SpriteDef} The tileset sprite.
 */
function tileset(name) {
  const full = () => TILE_SIZE;
  const solid = floorTile(full, false, name);
  const floor = floorTile(full, true, name);
  const slopeUp = floorTile((x) => x + 1, true, name);
  const upLow = floorTile((x) => (x + 1) / 2, true, name);
  const upHigh = floorTile((x) => 4 + (x + 1) / 2, true, name);
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
    brick: brickTile(),
    cube: cubeTile(),
    tissue: tissueTile(),
  };
  /** @type {Record<string, number[]>} */
  const animations = {};
  TERRAIN_TILES.forEach((tile, i) => {
    animations[tile] = [i];
  });
  return makeSprite(
    name,
    TERRAIN_TILES.map((tile) => tiles[tile]),
    'terrain',
    { anchor: [0, 0], animations },
  );
}
