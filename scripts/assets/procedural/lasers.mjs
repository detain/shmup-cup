/**
 * Enemy laser beams `lasers/beam-<colour>` in the bullet readability palette of `shmup_feat.md`
 * §12 (the same colours as `bullets.mjs`): 8 frames of 4×8 px, frame `k` a horizontal band
 * `k + 1` px tall centred in the frame — a dark rim row at the top and bottom (3 px and up), a
 * saturated body row inside each (5 px and up) and a bright core. Every column is identical, so
 * the renderer stretches a frame to any laser length; it picks the frame of the beam's drawn
 * width, so growing and fading beams never scale across (`render-pixi` `createLaserBinding`,
 * plan M1-09).
 *
 * **A frame's number is its thickness** (R2-01, W4-5): the renderer draws a beam `w` px wide as
 * frame `w − 1` unscaled, so the beams are never upscaled by the pipeline's interim stage —
 * ×1.5 would make frame `k` `⌈1.5(k+1)⌉` px tall. They are `native`, drawn at the build's art
 * scale instead (`options.artScale`): at 3/2, 12 frames of 6×12 (the art bible's v2 beam, §5.4),
 * one per width R2-02's ×1.5 port asks for (the shipped 6 and 8 become 9 and 12); at 1, the v1
 * strip above, byte for byte.
 *
 * The bending lasers' segments `lasers/bend-<colour>` (plan M2-02): one round blob (rim / body /
 * core, like a round bullet) the renderer draws at every node of a bending laser's body. At art
 * scale 1 it is the v1 7×7 blob; from R3-03.V1 the v2 path draws the art bible §5.4's **11×11**
 * node native, its band radii ×1.5, marked `native` like the beams.
 * {@link laserSprites} draws both in any colours — `palettes.mjs` uses it for the colour-blind
 * variants.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { scaleLength } from '../interim.mjs';
import { BULLET_COLORS } from './bullets.mjs';
import { color, makeSprite, mix } from './common.mjs';

/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Beam strip width in pixels at art scale 1 (any width works — every column is the same). */
export const BEAM_WIDTH = 4;

/**
 * Frame height = the widest band at art scale 1 (frames: bands 1 … BEAM_HEIGHT px tall); at art
 * scale `s` the strip is `⌈s·BEAM_WIDTH⌉ × ⌈s·BEAM_HEIGHT⌉` with as many frames as it is tall.
 */
export const BEAM_HEIGHT = 8;

/**
 * The rows of a band `height` px tall, top to bottom.
 *
 * @param {number} height - Band height (1 … the strip's height: BEAM_HEIGHT at art scale 1).
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

/** Side of a bending laser segment (odd: centred on its node), v1. */
export const BEND_SIZE = 7;

/** Side of a bending laser segment on the native v2 path (art bible v2 §5.4, R3-03.V1). */
export const BEND_SIZE_V2 = 11;

/**
 * Draws one bending laser segment: a round blob with a dark rim outside `rimFrom`, a bright
 * core inside `coreTo` and nothing outside `edge` (all in pixels from the centre).
 *
 * @param {{ rim: Rgba, body: Rgba, core: Rgba }} palette - Band colours.
 * @param {number} size - Frame side (odd).
 * @param {number} edge - Radius of the silhouette.
 * @param {number} rimFrom - Radius where the rim starts.
 * @param {number} coreTo - Radius where the core ends.
 * @returns {import('../image.mjs').Image} The `size` × `size` frame.
 */
function bendBlob(palette, size, edge, rimFrom, coreTo) {
  const image = createImage(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > edge) continue;
      setPixel(image, x, y, r > rimFrom ? palette.rim : r > coreTo ? palette.body : palette.core);
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
 * @param {number} [artScale] - The build's art scale (default 1): the beams are
 *   `⌈s·BEAM_WIDTH⌉ × ⌈s·BEAM_HEIGHT⌉` with one frame per band height, and from R3-03.V1 every
 *   non-unit scale also draws the bend node native at the bible's 11 px (§5.4).
 * @returns {SpriteDef[]} One beam (8 frames at art scale 1, 12 at 3/2) and one segment per colour.
 * @throws {RangeError} When `artScale` is not a valid art scale (`interim.mjs` `parseArtScale`).
 */
export function laserSprites(colours, suffix = '', generator = 'lasers', artScale = 1) {
  const v2 = artScale !== 1;
  /** @type {SpriteDef[]} */
  const sprites = [];
  const black = color('#000000');
  const white = color('#ffffff');
  const width = scaleLength(BEAM_WIDTH, artScale);
  const tallest = scaleLength(BEAM_HEIGHT, artScale);
  for (const name of /** @type {(keyof typeof BULLET_COLORS)[]} */ (Object.keys(BULLET_COLORS))) {
    const base = color(colours[name]);
    const palette = { rim: mix(base, black, 0.68), body: base, core: mix(base, white, 0.75) };
    const frames = [];
    for (let height = 1; height <= tallest; height++) {
      const image = createImage(width, tallest);
      const rows = bandRows(height, palette);
      const top = Math.floor((tallest - height) / 2);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) setPixel(image, x, top + y, rows[y]);
      }
      frames.push(image);
    }
    sprites.push(makeSprite(`lasers/beam-${name}${suffix}`, frames, generator, { native: true }));
    // The bend node: the v1 blob at scale 1, the bible's native 11×11 (radii ×1.5) at 3/2.
    sprites.push(
      makeSprite(
        `lasers/bend-${name}${suffix}`,
        [
          v2
            ? bendBlob(palette, BEND_SIZE_V2, 5.1, 3.9, 1.95)
            : bendBlob(palette, BEND_SIZE, 3.4, 2.6, 1.3),
        ],
        generator,
        { native: v2 },
      ),
    );
  }
  return sprites;
}

/**
 * Generates the beam strips and the bending laser segments.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale to draw
 *   the beams and bend nodes at (default 1).
 * @returns {SpriteDef[]} One beam and one segment per bullet colour.
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  return laserSprites(BULLET_COLORS, '', 'lasers', options.artScale ?? 1);
}
