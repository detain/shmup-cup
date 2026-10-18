/**
 * The placeholder terrain tilesets (8×8 tiles today, any even tile size since R1-04) —
 * `tiles/terrain-a` and, since M2-11 … M2-14, its
 * recoloured zone sets `tiles/terrain-reef`, `-dune`, `-magma`, `-ridge`, `-vault`, `-prism`,
 * `-citadel` and `-abyss`: solid rock, flat floor / ceiling / wall edges, and slopes at 45° and
 * 22.5° (two tiles per 22.5° slope) for floors and ceilings in both directions.
 *
 * Frame `i` is tile {@link TERRAIN_TILES}`[i]`; the manifest also lists every tile as a
 * one-frame animation named after it (`floor → [1]`), so tileset content can refer to
 * tiles by name. Surfaces (the pixels facing open space) are a light rim; the interior is
 * a rock texture that depends only on the pixel's position inside the tile, so adjacent
 * solid tiles join seamlessly.
 *
 * Solid pixels per column for the floor slopes (heights from the tile bottom, at 8 px):
 * `slope-up` 1…8 (45°); `slope-up-low` 0,1,1,2,2,3,3,4 and `slope-up-high`
 * 4,5,5,6,6,7,7,8 (22.5°: equal pairs, so low → high → the next row's low keeps the
 * rhythm); `-down` variants are mirrored left ↔ right, `ceil-` variants top ↔ bottom. Every
 * slope is a {@link lineMask} between half-tile heights — the very masks `core/data`'s heightfield
 * generator asks a tileset for — so the art and the collision masks cannot drift apart.
 *
 * **Tile size (R1-04, plan_resolution.md §2.7).** {@link generate} draws the atlas at
 * {@link TILE_SIZE}; {@link renderTerrainTiles} draws the same tiles at any even size (12 for v2),
 * the shapes scaled with it (45° = `1 … 12`, 22.5° = `0,1,1,2,2,3,3,4,4,5,5,6` / `6 … 12`; the
 * brick courses, the crystal's core and the rims follow the size). {@link resampleMask} moves a
 * tileset's column-height masks from one tile size to another, so a rescaled tileset matches the
 * tiles drawn at the new size (R1-03's content rescale tool uses it); {@link lineMaskEnds} tells
 * the masks it moves exactly from those it can only approximate.
 *
 * Plan M2-07 appended three full blocks for destructible terrain (the tileset gives them `hp`):
 * `brick` (a cracked brick you can shoot through), `cube` (the crystal a cube rush stacks into
 * walls) and `tissue` (organic wall that grows back). They are opaque on every pixel, like
 * `solid`, and look different from rock so players can tell what breaks.
 *
 * Plan M2-11 added two recoloured sets with the same tiles, frames and shapes for the zones'
 * own terrain ({@link TERRAIN_PALETTES}): `tiles/terrain-reef` (BRINE NEBULA's pale coral over
 * deep blue-grey stone) and `tiles/terrain-dune` (DUNE EXPANSE's sand); plan M2-12 two more:
 * `tiles/terrain-magma` (MAGMA DEEP's dark basalt with an ember-orange rim) and
 * `tiles/terrain-ridge` (TEMPEST RIDGE's storm-grey granite with a pale frost rim); plan M2-13 two
 * more: `tiles/terrain-vault` (CELL VAULT's dark olive flesh with a pale-green rim) and
 * `tiles/terrain-prism` (PRISM LABYRINTH's deep-blue crystal with an ice-blue rim); plan M2-14
 * the last two: `tiles/terrain-citadel` (IRON CITADEL's steel plating with an amber hazard rim)
 * and `tiles/terrain-abyss` (ABYSSAL THRONE's black-teal rock with a faint glowing rim). Only the
 * rock colours differ (the rock texture's hash is seeded per set); the destructible blocks look
 * the same in every set, so a brick reads as a brick in every zone. A new zone set is one more
 * {@link TERRAIN_PALETTES} entry (plus a `content/tilesets/` file naming the sprite).
 *
 * **Public API.** {@link generate}, {@link TERRAIN_TILES}, {@link TILE_SIZE},
 * {@link TERRAIN_PALETTES} (and the `TerrainPalette` typedef); R1-04 {@link renderTerrainTiles},
 * {@link lineMask}, {@link lineMaskEnds}, {@link resampleMask}.
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

/**
 * Tile side in pixels of the generated atlas: `@shmup/core` `TILE_SIZE` (8; R2-01: 12), pinned to
 * it by `test/scripts/assets/terrain-size.test.ts`. A constant of its own rather than an import of
 * `scripts/frame.mjs`: the asset pipeline's input hash covers `scripts/assets/**` only, so a
 * change here re-draws the atlas.
 */
export const TILE_SIZE = 8;

/** Smallest tile side {@link renderTerrainTiles} draws (two brick courses, a 2 × 2 core). */
const MIN_DRAWN_TILE_SIZE = 4;

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
 * and the zone sets of M2-11 … M2-14. Kept low in saturation next to the pink / red / purple
 * bullets and the capsules (shmup_feat.md §12, §18).
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
  'tiles/terrain-magma': {
    surface: '#e0703a',
    subsurface: '#8a3a24',
    rock: ['#3a2a2a', '#2c2020', '#4a3432'],
  },
  'tiles/terrain-ridge': {
    surface: '#c8d4e0',
    subsurface: '#7c8898',
    rock: ['#4a5260', '#3c4452', '#58606e'],
  },
  'tiles/terrain-vault': {
    surface: '#a8c498',
    subsurface: '#5a7858',
    rock: ['#2e3a2c', '#243024', '#384634'],
  },
  'tiles/terrain-prism': {
    surface: '#b8e0f8',
    subsurface: '#6a9ac8',
    rock: ['#2c4468', '#263c5e', '#344e76'],
  },
  'tiles/terrain-citadel': {
    surface: '#e0a040',
    subsurface: '#8a8e98',
    rock: ['#4a4e58', '#3c404a', '#565a66'],
  },
  'tiles/terrain-abyss': {
    surface: '#6ad0c8',
    subsurface: '#2a6a70',
    rock: ['#1a2a34', '#14222c', '#22343e'],
  },
});

/**
 * Column heights of a straight tile edge from height `h0` at the tile's left edge to `h1` at its
 * right edge: column `x` is as high as the line's higher end over the column, floored —
 * `h0 + ⌊s·(x + 1)⌋` rising, `h1 + ⌊−s·(size − x)⌋` falling (`s = (h1 − h0) / size`).
 *
 * @remarks
 * The same formula as `core/data`'s heightfield generator (`columnHeights` in
 * `packages/core/src/data/tilemap.ts`), which looks tiles up by exactly these masks, and the one
 * every slope of {@link renderTerrainTiles} is drawn with: at 8 px, `lineMask(0, 8, 8)` is the 45°
 * `1 … 8` and `lineMask(0, 4, 8)` the 22.5° `0,1,1,2,2,3,3,4`.
 *
 * @param {number} h0 - Height in pixels at the left edge (0 … `size`).
 * @param {number} h1 - Height in pixels at the right edge (0 … `size`).
 * @param {number} size - Tile side in pixels (> 0).
 * @returns {number[]} `size` column heights, each in 0 … `size` (whole numbers for whole ends).
 * @example
 * ```js
 * lineMask(6, 12, 12); // [6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12] — v2's 22.5° high half
 * ```
 */
export function lineMask(h0, h1, size) {
  const slope = (h1 - h0) / size;
  const heights = [];
  for (let x = 0; x < size; x++) {
    heights.push(
      slope >= 0 ? h0 + Math.floor(slope * (x + 1)) : h1 + Math.floor(-slope * (size - x)),
    );
  }
  return heights;
}

/**
 * The ends of a mask that is a straight edge between half-tile heights: the `[h0, h1]`, each
 * 0, `size / 2` or `size`, whose {@link lineMask} equals `mask` — every shape the heightfield
 * generator places and {@link renderTerrainTiles} draws (flat, 45° and both 22.5° halves, either
 * direction; a full or an empty mask too).
 *
 * @param {readonly number[]} mask - Column heights.
 * @param {number} size - Tile side the mask is for.
 * @returns {[number, number] | null} The ends, or `null` for any other mask (a hand-drawn shape,
 *   a length other than `size`, an odd `size`).
 */
export function lineMaskEnds(mask, size) {
  if (mask.length !== size || size % 2 !== 0) return null;
  const ends = [0, size / 2, size];
  for (const h0 of ends) {
    for (const h1 of ends) {
      const line = lineMask(h0, h1, size);
      if (line.every((h, x) => h === mask[x])) return [h0, h1];
    }
  }
  return null;
}

/**
 * Moves a tile's column-height mask (a tileset's `mask`, heights from its anchor edge) from
 * `from`-px tiles to `to`-px tiles — the mask half of rescaling a tileset (R1-03's content rescale
 * tool), so that it still equals the opaque pixels of its tile drawn at the new size.
 *
 * @remarks
 * The contract:
 * - **Straight edges move exactly.** A mask with {@link lineMaskEnds} `[h0, h1]` becomes
 *   `lineMask(h0 · to / from, h1 · to / from, to)`: the same edge at the new size — the mask of
 *   that tile in {@link renderTerrainTiles}`(to)` and the mask `core/data`'s heightfield generator
 *   asks for at `to`. Every shipped tileset mask is one (8 → 12: `1 … 8` → `1 … 12`,
 *   `0,1,1,2,2,3,3,4` → `0,1,1,2,2,3,3,4,4,5,5,6`, a full 8 → a full 12). This needs an even `to`
 *   (the half-tile height must be a whole pixel).
 * - **Anything else is resampled nearest-neighbour:** column `x` of the result takes column
 *   `⌊x · from / to⌋` (the column a nearest-neighbour image upscale samples), its height scaled to
 *   `round(h · to / from)`. That is an approximation: a hand-drawn tile's art must be redrawn or
 *   checked against its new mask (`test/integration/stage-terrain.test.ts` compares masks with
 *   the opaque pixels of every shipped tile). Use {@link lineMaskEnds} to list such masks.
 * - The result is a new array of `to` whole numbers in 0 … `to`; `from === to` returns a copy.
 *   Pure and deterministic (no floating-point maths beyond exact divisions and rounding).
 *
 * @param {readonly number[]} mask - The mask: `from` whole numbers in 0 … `from`.
 * @param {number} from - Its tile side in pixels (a whole number > 0).
 * @param {number} to - The new tile side in pixels (a whole number > 0).
 * @returns {number[]} The mask at `to`.
 * @throws {RangeError} When a size is not a whole number > 0, or `mask` does not have `from`
 *   whole-number entries in 0 … `from`.
 * @example
 * ```js
 * resampleMask([0, 1, 1, 2, 2, 3, 3, 4], 8, 12); // [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]
 * ```
 */
export function resampleMask(mask, from, to) {
  for (const size of [from, to]) {
    if (!Number.isInteger(size) || size <= 0) {
      throw new RangeError(`tile size must be a whole number > 0, got ${String(size)}`);
    }
  }
  if (mask.length !== from) {
    throw new RangeError(`mask has ${mask.length} entries, expected ${from}`);
  }
  for (const h of mask) {
    if (!Number.isInteger(h) || h < 0 || h > from) {
      throw new RangeError(`mask height ${String(h)} is not a whole number in 0 … ${from}`);
    }
  }
  const ends = to % 2 === 0 ? lineMaskEnds(mask, from) : null;
  if (ends !== null) return lineMask((ends[0] * to) / from, (ends[1] * to) / from, to);
  const heights = [];
  for (let x = 0; x < to; x++) {
    heights.push(Math.min(to, Math.round((mask[Math.floor((x * from) / to)] * to) / from)));
  }
  return heights;
}

/**
 * Renders a floor-type tile: solid where `height(x) ≥ size - y` (heights in pixels from the
 * bottom), open space above.
 *
 * @param {(x: number) => number} height - Solid height of column `x` (0…size).
 * @param {boolean} openAbove - Whether the space above the tile is open (surface rim at
 *   the top of full-height columns).
 * @param {string} name - The tileset's sprite name (seeds the rock texture).
 * @param {number} size - Tile side in pixels.
 * @returns {Image} The tile.
 */
function floorTile(height, openAbove, name, size) {
  const palette = TERRAIN_PALETTES[name];
  const surface = color(palette.surface);
  const subsurface = color(palette.subsurface);
  const rock = palette.rock.map(color);
  const seed = seedOf(name);
  const image = createImage(size, size);
  /**
   * Whether a pixel is solid; above the tile counts as open when `openAbove`.
   *
   * @param {number} x - Column.
   * @param {number} y - Row (may be negative).
   * @returns {boolean} Solid?
   */
  const solid = (x, y) => (y < 0 ? !openAbove : size - y <= height(x));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
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
 * @param {number} size - Tile side in pixels (even).
 * @returns {Image} The tile (every pixel opaque).
 */
function brickTile(size) {
  const half = size / 2;
  const image = createImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const course = y < half ? 0 : 1;
      const joint = course === 0 ? x === half - 1 : x === size - 1;
      const mortar = y === half - 1 || y === size - 1 || joint;
      const crack = x + y === size - 1 && !mortar;
      setPixel(image, x, y, mortar ? BRICK[1] : crack ? BRICK[2] : BRICK[0]);
    }
  }
  return image;
}

/**
 * The `cube` tile: a bevelled crystal block (light top-left edge, dark bottom-right, a 2 × 2 core
 * in the middle).
 *
 * @param {number} size - Tile side in pixels (even).
 * @returns {Image} The tile (every pixel opaque).
 */
function cubeTile(size) {
  const half = size / 2;
  const image = createImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const light = x === 0 || y === 0;
      const dark = x === size - 1 || y === size - 1;
      const core = (x === half - 1 || x === half) && (y === half - 1 || y === half);
      setPixel(image, x, y, light ? CUBE[1] : dark || core ? CUBE[2] : CUBE[0]);
    }
  }
  return image;
}

/**
 * The `tissue` tile: flesh with a position-hashed highlight and dark nuclei.
 *
 * @param {number} size - Tile side in pixels.
 * @returns {Image} The tile (every pixel opaque).
 */
function tissueTile(size) {
  const seed = seedOf('tiles/terrain-a/tissue');
  const image = createImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
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
 * Generates the tilesets at {@link TILE_SIZE} (or at the tile size the pipeline asks for).
 *
 * @remarks
 * The tilesets are `native` (plan_resolution.md R2-01, W4-5): they are drawn at their tile size
 * here, so the pipeline's interim ×1.5 stage never upscales them. The pipeline passes `tileSize`
 * for a build at another art scale than the default (`TILE_SIZE · artScale / INTERIM_ART_SCALE` —
 * `scripts/assets/pipeline.mjs` `collectSprites`): 8-px tiles for the v1 art, 12-px for v2.
 *
 * @param {{ tileSize?: number }} [options] - `tileSize`: the tile side to draw (default
 *   {@link TILE_SIZE}; an even whole number ≥ 4, see {@link renderTerrainTiles}).
 * @returns {SpriteDef[]} `tiles/terrain-a`, then the zone sets of M2-11 … M2-14 in
 *   {@link TERRAIN_PALETTES} order (anchor top-left, frame `i` = {@link TERRAIN_TILES}`[i]`).
 * @throws {RangeError} When `tileSize` is not an even whole number ≥ 4.
 */
export function generate(options = {}) {
  const size = options.tileSize ?? TILE_SIZE;
  return Object.keys(TERRAIN_PALETTES).map((name) => tileset(name, size));
}

/**
 * Draws one tileset in its palette.
 *
 * @param {string} name - Its sprite name (a {@link TERRAIN_PALETTES} key).
 * @param {number} size - The tile side in pixels.
 * @returns {SpriteDef} The tileset sprite (native: never upscaled by the pipeline).
 */
function tileset(name, size) {
  /** @type {Record<string, number[]>} */
  const animations = {};
  TERRAIN_TILES.forEach((tile, i) => {
    animations[tile] = [i];
  });
  return makeSprite(name, renderTerrainTiles(size, name), 'terrain', {
    anchor: [0, 0],
    animations,
    native: true,
  });
}

/**
 * Draws the tiles of one tileset at any even tile size (R1-04): the frames {@link generate} puts
 * in the atlas at {@link TILE_SIZE}, in {@link TERRAIN_TILES} order. Every slope is a
 * {@link lineMask} between half-tile heights, so the opaque pixels of a tile drawn at `size` are
 * its shipped 8-px mask moved by {@link resampleMask}`(mask, 8, size)`.
 *
 * @param {number} size - Tile side in pixels: an even whole number ≥ 4 (8 today, 12 for v2).
 * @param {string} name - The tileset's sprite name (a {@link TERRAIN_PALETTES} key: its colours
 *   and the seed of its rock texture).
 * @returns {Image[]} One `size × size` image per tile.
 * @throws {RangeError} When `size` is not an even whole number ≥ 4 or `name` has no palette.
 * @example
 * ```js
 * const frames = renderTerrainTiles(12, 'tiles/terrain-a'); // v2-sized test tiles
 * ```
 */
export function renderTerrainTiles(size, name) {
  if (!Number.isInteger(size) || size < MIN_DRAWN_TILE_SIZE || size % 2 !== 0) {
    throw new RangeError(
      `tile size must be an even whole number >= ${MIN_DRAWN_TILE_SIZE}, got ${String(size)}`,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(TERRAIN_PALETTES, name)) {
    throw new RangeError(`no terrain palette named "${name}"`);
  }
  const half = size / 2;
  /**
   * The height function of a straight edge between two heights.
   *
   * @param {number} h0 - Height at the left edge.
   * @param {number} h1 - Height at the right edge.
   * @returns {(x: number) => number} Column `x`'s height.
   */
  const edge = (h0, h1) => {
    const heights = lineMask(h0, h1, size);
    return (x) => heights[x];
  };
  const full = () => size;
  const solid = floorTile(full, false, name, size);
  const floor = floorTile(full, true, name, size);
  const slopeUp = floorTile(edge(0, size), true, name, size);
  const upLow = floorTile(edge(0, half), true, name, size);
  const upHigh = floorTile(edge(half, size), true, name, size);
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
    brick: brickTile(size),
    cube: cubeTile(size),
    tissue: tissueTile(size),
  };
  return TERRAIN_TILES.map((tile) => tiles[tile]);
}
