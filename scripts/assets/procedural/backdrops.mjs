/**
 * Zone backdrops — parallax bands that give a zone its look (plan M1-18).
 *
 * `bg/azure-verge`: AZURE VERGE's (zone A) far band — the rim of a blue planet seen from orbit,
 * a {@link AZURE_TILE_W}×{@link AZURE_TILE_H} tile anchored top-left that repeats seamlessly
 * along x (every pixel column has the same rows; the cloud streaks wrap modulo the tile width).
 * From the top: a thin haze that thickens towards the horizon (translucent), one lit rim row,
 * then the planet body — an opaque gradient from dark azure to deep navy with lighter cloud
 * streaks. Kept dark and low in saturation so the pink / red / purple enemy bullets and the gold
 * capsules stay readable over it (shmup_feat.md §12, §18), and never pure black (VA panels).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { createAssetRng } from '../rng.mjs';
import { color, makeSprite, mix, seedOf, withAlpha } from './common.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/azure-verge` tile (its parallax `spacing`). */
export const AZURE_TILE_W = 128;

/** Height of the `bg/azure-verge` tile. */
export const AZURE_TILE_H = 48;

/** Row of the lit planet rim in the `bg/azure-verge` tile (haze above, planet below). */
export const AZURE_RIM_ROW = 10;

/**
 * Generates the zone backdrops.
 *
 * @returns {SpriteDef[]} `bg/azure-verge` (one frame, anchor top-left).
 */
export function generate() {
  const name = 'bg/azure-verge';
  const w = AZURE_TILE_W;
  const h = AZURE_TILE_H;
  const rng = createAssetRng(seedOf(name));
  const image = createImage(w, h);
  const haze = color('#3a78c8');
  const rim = color('#5a9ee0');
  const top = color('#173466');
  const bottom = color('#0c1a3c');
  const cloud = color('#2e5a94');

  // Haze: alpha grows towards the rim (rows 0 … RIM − 1), 0 on the first row.
  for (let y = 0; y < AZURE_RIM_ROW; y++) {
    const alpha = Math.round((y * 72) / AZURE_RIM_ROW);
    if (alpha === 0) continue;
    for (let x = 0; x < w; x++) setPixel(image, x, y, withAlpha(haze, alpha));
  }
  // The lit rim, then the planet body (opaque gradient).
  for (let x = 0; x < w; x++) setPixel(image, x, AZURE_RIM_ROW, withAlpha(rim, 200));
  /** @type {import('../image.mjs').Rgba[]} */
  const body = [];
  for (let y = AZURE_RIM_ROW + 1; y < h; y++) {
    const t = (y - AZURE_RIM_ROW - 1) / (h - AZURE_RIM_ROW - 2);
    body[y] = mix(top, bottom, t);
    for (let x = 0; x < w; x++) setPixel(image, x, y, body[y]);
  }
  // Cloud streaks: horizontal runs that wrap around the tile edge, paler near the rim.
  for (let i = 0; i < 26; i++) {
    const y = rng.rangeInt(AZURE_RIM_ROW + 2, h - 3);
    const start = rng.rangeInt(0, w - 1);
    const length = rng.rangeInt(8, 30);
    const strength = 0.55 - ((y - AZURE_RIM_ROW) / (h - AZURE_RIM_ROW)) * 0.35;
    const tone = mix(body[y], cloud, strength);
    for (let k = 0; k < length; k++) setPixel(image, (start + k) % w, y, tone);
  }
  return [makeSprite(name, [image], 'backdrops', { anchor: [0, 0] })];
}
