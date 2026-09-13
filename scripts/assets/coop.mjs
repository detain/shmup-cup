/**
 * Player 2's palette swap (plan M2-06, `shmup_feat.md` §5 "co-op ships in different colors" and
 * §18 "palette swap … co-op ships"): for every player ship (`ships/*`) and the HUD's stock icon
 * (`hud/life`) the pipeline adds a sibling sprite `<name>@p2` whose frames are the source frames
 * with the **red and blue channels swapped** — the KESTREL's blue hull stripe turns red-orange, its
 * cyan canopy gold and its orange engine glow blue, the greys stay (warmer). Exact integer work,
 * so the atlas stays byte-identical on every machine.
 *
 * The core interns `<ship sprite>@p2` for every ship (`@shmup/core` `P2_SPRITE_SUFFIX`,
 * `PlayerShipSpec.spriteP2Id`) and the HUD `hud/life@p2`; `pnpm content:check` checks they exist.
 * A real-art PNG override of a ship gets its variant the same way (derived from the override's
 * pixels).
 *
 * **Public API.** {@link makeP2Sprite}, {@link swapRedBlue}, {@link wantsP2Variant},
 * {@link P2_SUFFIX}, {@link P2_VARIANT_PREFIXES}, {@link P2_VARIANT_SPRITES}.
 *
 * @module
 */
import { createImage } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./sprite-source.mjs').SpriteDef} SpriteDef */

/** Suffix of player 2's palette-swap sprite (the core's `P2_SPRITE_SUFFIX`). */
export const P2_SUFFIX = '@p2';

/** Name prefixes of the sprites that get a player 2 variant: every player ship. */
export const P2_VARIANT_PREFIXES = Object.freeze(['ships/']);

/** Single sprites that get a player 2 variant: the HUD's stock icon. */
export const P2_VARIANT_SPRITES = Object.freeze(['hud/life']);

/**
 * Whether a sprite gets a `<name>@p2` sibling.
 *
 * @param {string} name - Sprite name.
 * @returns {boolean} `true` for a player ship or the stock icon (never for a generated `@` name).
 */
export function wantsP2Variant(name) {
  if (name.includes('@')) return false;
  if (P2_VARIANT_SPRITES.includes(name)) return true;
  return P2_VARIANT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Swaps a frame's red and blue channels.
 *
 * @param {Image} frame - Source pixels.
 * @returns {Image} Same size; every pixel's R and B exchanged, G and alpha unchanged.
 */
export function swapRedBlue(frame) {
  const out = createImage(frame.width, frame.height);
  const src = frame.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    dst[i] = src[i + 2];
    dst[i + 1] = src[i + 1];
    dst[i + 2] = src[i];
    dst[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Builds the `<name>@p2` sprite of a ship (or the stock icon).
 *
 * @param {SpriteDef} sprite - The source sprite.
 * @returns {SpriteDef} The palette swap: same anchor, frame count and sizes, same animations,
 *   `hitFlash: false`.
 *
 * @example
 * makeP2Sprite(kestrel).name; // → 'ships/kestrel@p2'
 */
export function makeP2Sprite(sprite) {
  return {
    name: sprite.name + P2_SUFFIX,
    anchor: sprite.anchor,
    hitFlash: false,
    frames: sprite.frames.map(swapRedBlue),
    animations: { ...sprite.animations },
    origin: `p2:${sprite.name}`,
  };
}
