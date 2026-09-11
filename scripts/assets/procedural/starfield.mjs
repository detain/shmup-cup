/**
 * Parallax star layers: `bg/stars-far`, `bg/stars-mid`, `bg/stars-near` — 128×128
 * transparent tiles, drawn over the lifted navy clear colour (never pure black: VA
 * panels, `shmup_feat.md` §18). Far = many dim single pixels; mid = fewer, brighter,
 * some 2-px; near = a few bright crosses. Stars keep a 2-px margin so crosses never wrap,
 * and the tiles repeat seamlessly.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { createAssetRng } from '../rng.mjs';
import { color, makeSprite, seedOf } from './common.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Tile side in pixels. */
export const STAR_TILE_SIZE = 128;

/**
 * Generates the three star layers.
 *
 * @returns {SpriteDef[]} Far, mid and near layers (one frame each, anchor top-left).
 */
export function generate() {
  const size = STAR_TILE_SIZE;
  /** @type {SpriteDef[]} */
  const sprites = [];

  {
    const name = 'bg/stars-far';
    const rng = createAssetRng(seedOf(name));
    const tones = ['#34448a', '#44549c', '#56568e'].map(color);
    const image = createImage(size, size);
    for (let i = 0; i < 70; i++) {
      setPixel(
        image,
        rng.rangeInt(2, size - 3),
        rng.rangeInt(2, size - 3),
        tones[rng.rangeInt(0, 2)],
      );
    }
    sprites.push(makeSprite(name, [image], 'starfield', { anchor: [0, 0] }));
  }

  {
    const name = 'bg/stars-mid';
    const rng = createAssetRng(seedOf(name));
    const tones = ['#8898d0', '#a8b0e0'].map(color);
    const image = createImage(size, size);
    for (let i = 0; i < 32; i++) {
      const x = rng.rangeInt(2, size - 4);
      const y = rng.rangeInt(2, size - 3);
      const tone = tones[rng.rangeInt(0, 1)];
      setPixel(image, x, y, tone);
      if (rng.chance(0.3)) setPixel(image, x + 1, y, tone);
    }
    sprites.push(makeSprite(name, [image], 'starfield', { anchor: [0, 0] }));
  }

  {
    const name = 'bg/stars-near';
    const rng = createAssetRng(seedOf(name));
    const core = color('#ffffff');
    const arm = color('#a0b0ff');
    const image = createImage(size, size);
    for (let i = 0; i < 12; i++) {
      const x = rng.rangeInt(3, size - 4);
      const y = rng.rangeInt(3, size - 4);
      setPixel(image, x, y, core);
      setPixel(image, x - 1, y, arm);
      setPixel(image, x + 1, y, arm);
      setPixel(image, x, y - 1, arm);
      setPixel(image, x, y + 1, arm);
    }
    sprites.push(makeSprite(name, [image], 'starfield', { anchor: [0, 0] }));
  }
  return sprites;
}
