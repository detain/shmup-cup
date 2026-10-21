/**
 * Player 2's palette map (plan M2-06, `shmup_feat.md` §5 "co-op ships in different colors" and
 * §18 "palette swap … co-op ships"): for every player ship (`ships/*`) and the HUD's stock icon
 * (`hud/life`) the pipeline adds a sibling sprite `<name>@p2` whose frames are the source frames
 * with **every colour of the sprite's own `p2` map exchanged for its target colour** — unlisted
 * colours and every pixel's alpha stay. The map replaced the red ↔ blue channel swap in
 * R3-03.V2a: a channel swap is unpredictable on full-colour real art, a map says exactly which
 * colour becomes which. The KESTREL's blue hull stripe turns red-orange, its cyan canopy gold
 * and its orange engine glow blue, exactly as the swap used to draw it — the atlas is
 * byte-identical. Exact integer work, so the atlas stays byte-identical on every machine.
 *
 * The core interns `<ship sprite>@p2` for every ship (`@shmup/core` `P2_SPRITE_SUFFIX`,
 * `PlayerShipSpec.spriteP2Id`) and the HUD `hud/life@p2`; `pnpm content:check` checks they
 * exist. A pixel-map sprite carries its map in `p2`; a real-art PNG override carries the same
 * map in its Aseprite sidecar's `meta.shmup.p2` (`sprite-source.mjs`) and the pipeline maps the
 * override's pixels the same way.
 *
 * **Public API.** {@link makeP2Sprite}, {@link wantsP2Variant}, {@link P2_SUFFIX},
 * {@link P2_VARIANT_PREFIXES}, {@link P2_VARIANT_SPRITES}.
 *
 * @module
 */
import { createImage, parseColor } from './image.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./image.mjs').Rgba} Rgba */
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
 * The packed RGB of a colour — the key map entries and frame pixels meet under.
 *
 * @param {Rgba} rgba - The colour.
 * @returns {number} `(r << 16) | (g << 8) | b`.
 */
const rgbKey = (rgba) => (rgba[0] << 16) | (rgba[1] << 8) | rgba[2];

/**
 * Exchanges a frame's mapped colours: every pixel whose RGB equals a table key takes the
 * table's value RGB, unlisted colours and every alpha stay.
 *
 * @param {Image} frame - Source pixels (not modified).
 * @param {ReadonlyMap<number, number>} table - Packed source RGB → packed target RGB.
 * @returns {Image} A new image of the same size.
 */
function mapFrame(frame, table) {
  const out = createImage(frame.width, frame.height);
  const src = frame.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    const mapped = table.get((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]);
    if (mapped === undefined) {
      dst[i] = src[i];
      dst[i + 1] = src[i + 1];
      dst[i + 2] = src[i + 2];
    } else {
      dst[i] = (mapped >> 16) & 0xff;
      dst[i + 1] = (mapped >> 8) & 0xff;
      dst[i + 2] = mapped & 0xff;
    }
    dst[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Builds the `<name>@p2` sprite of a ship (or the stock icon) through its palette map.
 *
 * @param {SpriteDef} sprite - The source sprite.
 * @param {Readonly<Record<string, string>>} map - The exact colours: every pixel whose RGB is
 *   a key (`"#rrggbb"`) takes the value's RGB (also `"#rrggbb"`, case and the `#rgb` short
 *   forms parse); unlisted colours stay, every alpha stays.
 * @returns {SpriteDef} The mapped sprite: same anchor, frame count and sizes, same animations,
 *   `hitFlash: false`, and — when the source is `native` — native too.
 * @throws {TypeError} When an entry of the map does not parse as a colour pair.
 *
 * @example
 * makeP2Sprite(kestrel, { '#3858f0': '#f05838' }).name; // → 'ships/kestrel@p2'
 */
export function makeP2Sprite(sprite, map) {
  /** @type {Map<number, number>} */
  const table = new Map();
  for (const [from, to] of Object.entries(map)) {
    const src = parseColor(from);
    const dst = parseColor(to);
    if (src === null || dst === null) {
      throw new TypeError(`player 2 map entry "${from}" → "${to}" is not a colour pair`);
    }
    table.set(rgbKey(src), rgbKey(dst));
  }
  return {
    name: sprite.name + P2_SUFFIX,
    anchor: sprite.anchor,
    hitFlash: false,
    frames: sprite.frames.map((frame) => mapFrame(frame, table)),
    animations: { ...sprite.animations },
    origin: `p2:${sprite.name}`,
    // The sibling of native art is native too (R4-01.A1a): its frames are mapped from pixels
    // already at the v2 size, so the interim stage must not treat it as a scaled v1 frame.
    ...(sprite.native === true ? { native: true } : {}),
  };
}
