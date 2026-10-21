/**
 * v2kit: the shared v2 drawing kit (R4-P.P4) — the helpers every R4 generator composes
 * instead of re-typing them. Read-only: the kit draws nothing itself, it has no
 * `generate()`, and it ships no pixels; the atlas is byte-identical with and without it.
 *
 * It lives in `scripts/assets/`, **outside** `scripts/assets/procedural/`, on purpose: a
 * `.mjs` inside `procedural/` is a generator the registry test counts and every
 * subdirectory scan reads as one (R4-P.P2's registry, wave rule 6), and the kit is not a
 * generator. It is still hashed into the pipeline's `CODE_HASH` (all of
 * `scripts/assets/**`) and scanned for engine maths like every other file here.
 *
 * What it holds, per the art bible v2 (§3.4 outline, §3.5 light, §4.4 ramps):
 *
 * - {@link outline} — the 1-px dark outline: the outermost ring of opaque pixels, inside
 *   the frame, so the frame size, the anchor and the hitbox never move;
 *   {@link outlineColour} picks its colour (the palette's darkest, never `#000000`);
 * - {@link topLeftLight} and {@link bottomRightShade} — the top-left light's lit (above /
 *   left) and shaded (below / right) edge rings, exact pixel stamps;
 * - {@link offRamp} — the palette-cycle margin: a colour that sits within
 *   {@link RAMP_MIN_DISTANCE} of any reserved ramp colour is moved just outside it
 *   (decision W5-12's rule, mirrored from `test/integration/palette-cycle-scan.test.ts`);
 *   the eight reserved ramps are read **lazily inside the function** — never through a
 *   top-level array — so a generator that defines a ramp may import the kit without a
 *   module-cycle TDZ error (the kit imports the zone generators, who may import the kit);
 * - the frame sizes, re-exported from [`../frame.mjs`](../frame.mjs) — the scripts' pinned
 *   mirror of core's constants (owner decision O8), hashed into `CODE_HASH` since the same
 *   subtask, so a generator built on them invalidates the cache when the mirror moves.
 *
 * Every function is deterministic exact integer maths (no engine-dependent `Math`), so a
 * sprite drawn through the kit is byte-identical on every machine, like all procedural art.
 *
 * @module
 */

import { ABYSS_RAMP } from './procedural/abyss.mjs';
import { BRINE_RAMP } from './procedural/brine.mjs';
import { CITADEL_RAMP } from './procedural/citadel.mjs';
import { MAGMA_RAMP } from './procedural/magma.mjs';
import { PRISM_RAMP } from './procedural/prism.mjs';
import { SEA_RAMP } from './procedural/raster-bands.mjs';
import { STORM_RAMP } from './procedural/tempest.mjs';
import { VAULT_RAMP } from './procedural/vault.mjs';
import { createImage, getPixel, parseColor, setPixel } from './image.mjs';

/**
 * The least Chebyshev distance (max over the three colour channels) a non-cycle colour may
 * sit at from every reserved palette-cycle ramp colour — twice the cycle shader's 1.5/255
 * match tolerance (art bible v2 §4.4, decision W5-12; the same number the shipped scan of
 * `test/integration/palette-cycle-scan.test.ts` enforces).
 *
 * @type {number}
 */
export const RAMP_MIN_DISTANCE = 3;

/**
 * The palette's outline colour: the darkest colour that is not pure black, by the integer
 * BT.601 luma `>> 8` pipeline already uses for its `@flash` checks (art bible v2 §3.4 —
 * "the darkest colour of the sprite's palette, never `#000000`").
 *
 * @param {readonly string[]} colours - The sprite's palette colours, `#rgb` … `#rrggbbaa`.
 * @returns {string} The input string of the darkest non-black colour (unparsed, so the
 *   caller's own spelling comes back).
 * @throws {RangeError} When the list is empty or holds a colour `parseColor` cannot read.
 */
export function outlineColour(colours) {
  /** @type {string | null} */
  let darkest = null;
  let darkestLuma = Infinity;
  for (const colour of colours) {
    const rgba = parseColor(colour);
    if (rgba === null) throw new RangeError(`not a colour: ${colour}`);
    const luma = (rgba[0] * 77 + rgba[1] * 150 + rgba[2] * 29) >> 8;
    const black = rgba[0] === 0 && rgba[1] === 0 && rgba[2] === 0;
    if (!black && luma < darkestLuma) {
      darkest = colour;
      darkestLuma = luma;
    }
  }
  if (darkest === null) throw new RangeError('outlineColour needs a non-black colour');
  return darkest;
}

/**
 * Copies an image (the stamp helpers build their result from a copy, never in place).
 *
 * @param {import('./image.mjs').Image} image - The source.
 * @returns {import('./image.mjs').Image} A new image with the same pixels.
 */
function copyImage(image) {
  const out = createImage(image.width, image.height);
  out.data.set(image.data);
  return out;
}

/**
 * Stamps a colour onto every opaque pixel of `image` whose edge-test passes, returning a
 * new image (the input is never modified).
 *
 * @param {import('./image.mjs').Image} image - The sprite.
 * @param {string | null} colour - The stamp colour (`parseColor` form), or `null` to copy
 *   the image unchanged — so a caller can pass an optional palette entry straight through.
 * @param {(image: import('./image.mjs').Image, x: number, y: number) => boolean} onEdge -
 *   The test whether the pixel at `(x, y)` sits on the stamped ring.
 * @returns {import('./image.mjs').Image} The stamped copy.
 * @throws {RangeError} When `colour` is not `null` and not a colour.
 */
function stamp(image, colour, onEdge) {
  if (colour === null || colour === undefined) return copyImage(image);
  const rgba = parseColor(colour);
  if (rgba === null) throw new RangeError(`not a colour: ${colour}`);
  const out = copyImage(image);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (getPixel(image, x, y)[3] === 0) continue;
      if (onEdge(image, x, y)) setPixel(out, x, y, rgba);
    }
  }
  return out;
}

/**
 * Whether the opaque pixel at `(x, y)` touches transparency (or the frame edge) on any of
 * its four side neighbours — the art bible §3.4 outline ring: sides only, never a corner.
 *
 * @param {import('./image.mjs').Image} image - The sprite.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @returns {boolean} True on the outermost ring.
 */
function touchesTransparentSide(image, x, y) {
  return (
    getPixel(image, x, y - 1)[3] === 0 ||
    getPixel(image, x, y + 1)[3] === 0 ||
    getPixel(image, x - 1, y)[3] === 0 ||
    getPixel(image, x + 1, y)[3] === 0
  );
}

/**
 * The 1-px outline (art bible v2 §3.4): a new image in which every opaque pixel that has a
 * transparent 4-neighbour — the outermost ring of opaque pixels, **inside** the frame, so
 * the frame size, the anchor and the hitbox never move — takes `colour`. Inner pixels, the
 * transparent pixels and the image size are untouched.
 *
 * @param {import('./image.mjs').Image} image - The sprite.
 * @param {string | null} colour - The outline colour (`parseColor` form; pick it with
 *   {@link outlineColour}), or `null` for an unchanged copy.
 * @returns {import('./image.mjs').Image} The outlined copy.
 * @throws {RangeError} When `colour` is not `null` and not a colour.
 */
export function outline(image, colour) {
  return stamp(image, colour, touchesTransparentSide);
}

/**
 * The lit ring of the top-left light (art bible v2 §3.5): a new image in which every
 * opaque pixel with a transparent neighbour **above or left** takes `colour` — the light
 * comes from the top-left, so highlights sit on the top and left faces. Where both sides
 * are lit (a top-left corner pixel) the light applies all the same; a pixel already
 * stamped by {@link bottomRightShade} is overwritten when this runs after it, so compose
 * light before shade, or shade before light, deliberately.
 *
 * @param {import('./image.mjs').Image} image - The sprite.
 * @param {string | null} colour - The light colour, or `null` for an unchanged copy.
 * @returns {import('./image.mjs').Image} The stamped copy.
 * @throws {RangeError} When `colour` is not `null` and not a colour.
 */
export function topLeftLight(image, colour) {
  return stamp(
    image,
    colour,
    (img, x, y) => getPixel(img, x, y - 1)[3] === 0 || getPixel(img, x - 1, y)[3] === 0,
  );
}

/**
 * The shaded ring of the top-left light (art bible v2 §3.5): a new image in which every
 * opaque pixel with a transparent neighbour **below or right** takes `colour`.
 *
 * @param {import('./image.mjs').Image} image - The sprite.
 * @param {string | null} colour - The shade colour, or `null` for an unchanged copy.
 * @returns {import('./image.mjs').Image} The stamped copy.
 * @throws {RangeError} When `colour` is not `null` and not a colour.
 */
export function bottomRightShade(image, colour) {
  return stamp(
    image,
    colour,
    (img, x, y) => getPixel(img, x, y + 1)[3] === 0 || getPixel(img, x + 1, y)[3] === 0,
  );
}

/**
 * The Chebyshev distance of two colours (max over the RGB channels — what the cycle shader
 * compares; alpha is ignored).
 *
 * @param {import('./image.mjs').Rgba} a - Colour one.
 * @param {import('./image.mjs').Rgba} b - Colour b.
 * @returns {number} The distance in 8-bit steps.
 */
function chebyshev(a, b) {
  const dr = Math.abs(a[0] - b[0]);
  const dg = Math.abs(a[1] - b[1]);
  const db = Math.abs(a[2] - b[2]);
  return dr > dg ? (dr > db ? dr : db) : dg > db ? dg : db;
}

/**
 * Formats three in-range channels as the exact lower-case `#rrggbb` colour text.
 *
 * @param {number} r - Red channel (0…255).
 * @param {number} g - Green channel (0…255).
 * @param {number} b - Blue channel (0…255).
 * @returns {string} The colour text.
 */
function toHex(r, g, b) {
  const pair = (/** @type {number} */ n) => n.toString(16).padStart(2, '0');
  return '#' + pair(r) + pair(g) + pair(b);
}

/**
 * Keeps a colour out of the palette-cycle crossfire: the art bible v2 §4.4 reserved ramps
 * (`SEA` / `BRINE` / `MAGMA` / `STORM` / `VAULT` / `PRISM` / `CITADEL` / `ABYSS`) are
 * recoloured every cycle step, so any other colour must sit at least
 * {@link RAMP_MIN_DISTANCE}/255 (Chebyshev) away from every ramp colour. A colour that
 * already does comes back unchanged; one that does not is moved to the nearest colour that
 * does, by a deterministic search (integer offsets ordered by their absolute sum, then
 * lexicographically, so the answer is always the same on every machine).
 *
 * The reserved ramp list is assembled **inside this function, lazily** — wave 10 appends
 * its ramps here and keeps that shape (no top-level array may touch the imported
 * constants: a generator that defines a ramp imports the kit, and the cycle would read the
 * constant before its module finished initialising — a TDZ error).
 *
 * @param {string} colour - The colour, `#rgb` … `#rrggbbaa` (case-insensitive).
 * @returns {string} The exact lower-case `#rrggbb` form of the kept or moved colour
 *   (the alpha channel is dropped — sprites cycle on straight RGB).
 * @throws {RangeError} When `colour` is not a colour, or nothing within 6/255 of it clears
 *   every ramp (a defensive cap; no shipped ramp allows it to trip).
 */
export function offRamp(colour) {
  const rgba = parseColor(colour);
  if (rgba === null) throw new RangeError(`not a colour: ${colour}`);
  /** @type {import('./image.mjs').Rgba[]} */
  const reserved = [];
  for (const ramp of [
    ABYSS_RAMP,
    BRINE_RAMP,
    CITADEL_RAMP,
    MAGMA_RAMP,
    PRISM_RAMP,
    SEA_RAMP,
    STORM_RAMP,
    VAULT_RAMP,
  ]) {
    for (const rampColour of ramp) {
      const parsed = parseColor(rampColour);
      if (parsed !== null) reserved.push(parsed);
    }
  }
  const clears = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => {
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return false;
    const c = /** @type {import('./image.mjs').Rgba} */ ([r, g, b, 255]);
    for (const rampColour of reserved)
      if (chebyshev(c, rampColour) < RAMP_MIN_DISTANCE) return false;
    return true;
  };
  const base = [rgba[0], rgba[1], rgba[2]];
  // Offsets by |dx|+|dy|+|dz|, lexicographic inside a ring — deterministic everywhere.
  for (let sum = 0; sum <= 18; sum++) {
    for (let dx = -6; dx <= 6; dx++) {
      const ax = Math.abs(dx);
      if (ax > sum) continue;
      for (let dy = -6; dy <= 6; dy++) {
        const ay = Math.abs(dy);
        if (ax + ay > sum) continue;
        const dzAbs = sum - ax - ay;
        for (const dz of dzAbs === 0 ? [0] : [-dzAbs, dzAbs]) {
          if (Math.abs(dz) > 6) continue;
          if (clears(base[0] + dx, base[1] + dy, base[2] + dz)) {
            return toHex(base[0] + dx, base[1] + dy, base[2] + dz);
          }
        }
      }
    }
  }
  throw new RangeError(`offRamp: nothing within 6/255 of ${colour} clears the reserved ramps`);
}

// The frame sizes, straight from the scripts' pinned mirror of core's constants (owner
// decision O8) — generators import them from the kit, never as literals. `CODE_HASH` hashes
// `scripts/frame.mjs` itself (R4-P.P3), so a moved mirror rebuilds every kit-drawn sprite.
export {
  FRAME_W,
  FRAME_H,
  FRAME_CX,
  FRAME_CY,
  HUD_BAR_HEIGHT,
  PLAYFIELD_Y,
  PLAYFIELD_W,
  PLAYFIELD_H,
  PLAYFIELD_CY,
  HUD_BOTTOM_Y,
  TILE_SIZE,
  GLYPH_W,
  GLYPH_H,
  LINE_H,
  WORLD_SCALE,
} from '../frame.mjs';
