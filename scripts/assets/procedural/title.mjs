/**
 * Title-screen art — the v2 backdrop the logo and the menus draw over (plan R4-05.E2).
 *
 * `ui/title-backdrop` (the v2 native path only; decision RR-1a — the name is absent at scale 1,
 * there is no v1 stand-in): the night sky of the v1 title redrawn at the full 640×360 frame and
 * shipped as two native half-frames the title scene draws side by side (no atlas frame may
 * outsize 510²; see {@link TITLE_SPRITES}). The
 * art bible's backdrop budget (§4.1: a backdrop pixel is dark, low-saturation and never neutral,
 * so the bright UI strings stay readable over it): a navy sky gradient with hashed stars (a few
 * brighter ones as small sparkles) and the limb of a distant planet across the bottom of the
 * frame — the same motif as zone A's `bg/azure-verge`, grown to the title's full width, with its
 * lit rim row and darker body below.
 *
 * Drawn from the bible's text and the v1 title scene (RR-4: no FLUX key-art winner was used,
 * not even for the look).
 *
 * @module
 */
import { createImage, getPixel, setPixel } from '../image.mjs';
import { scaleLength } from '../interim.mjs';
import { hash2 } from '../rng.mjs';
import { color, makeSprite, mix, seedOf } from './common.mjs';
import { FRAME_CX, FRAME_H, FRAME_W } from '../v2kit.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */
/** @typedef {import('../image.mjs').Rgba} Rgba */

/**
 * The sprite this generator draws (the name `core/ui`'s `UI_SPRITES` lists). The frame-sized
 * image cannot ride the atlas as one frame (the pipeline's page-limit cases build real sources at
 * 512², so no frame may exceed 510²): the backdrop ships as ⌈FRAME_W / 2⌉ × FRAME_H native
 * half-frames, which `TitleScene.drawUi` draws side by side from the top-left corner.
 */
export const TITLE_SPRITES = Object.freeze(['ui/title-backdrop']);

/**
 * Generates the title-screen art.
 *
 * @param {{ artScale?: number }} [options] - The build's art scale; anything other than 1 draws
 *   the v2 native {@link TITLE_SPRITES} at the frame's size, 1 (the default) draws nothing —
 *   decision RR-1a keeps the name out of the v1 atlas.
 * @returns {SpriteDef[]} The backdrop at the v2 scale, none at scale 1.
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  if (artScale === 1) return []; // RR-1a: no v1 stand-in for the backdrop
  return [
    makeSprite('ui/title-backdrop', halves(backdrop(artScale)), 'title', {
      anchor: [0, 0],
      native: true,
    }),
  ];
}

/**
 * Splits the full-frame backdrop into its atlas half-frames: frame 0 the left ⌊FRAME_W / 2⌋
 * columns, frame 1 the rest (`TitleScene.drawUi` places frame 1 at x = ⌊FRAME_W / 2⌋).
 *
 * @param {import('../image.mjs').Image} full - The 640×360 image.
 * @returns {import('../image.mjs').Image[]} The two halves.
 */
function halves(full) {
  const left = FRAME_W >> 1;
  const right = FRAME_W - left;
  const cut = (offset, width) => {
    const out = createImage(width, full.height);
    for (let y = 0; y < full.height; y++) {
      for (let x = 0; x < width; x++) setPixel(out, x, y, getPixel(full, offset + x, y));
    }
    return out;
  };
  return [cut(0, left), cut(left, right)];
}

/**
 * The full-frame night: sky gradient, stars, planet limb.
 *
 * @param {number} artScale - The build's art scale; sizes the limb's rise above the bottom edge
 *   (v1's 60 px → the frame-native 90 at 3/2). Everything else is the frame itself.
 * @returns {import('../image.mjs').Image} The opaque 640×360 backdrop.
 */
function backdrop(artScale) {
  const w = FRAME_W;
  const h = FRAME_H;
  const seed = seedOf('ui/title-backdrop');
  const image = createImage(w, h);
  const skyTop = color('#161c2e');
  const skyBottom = color('#202c40');
  const starDim = color('#242c38');
  const starLit = color('#2c3440');
  const starBig = color('#323a40');
  const rim = color('#304040');
  const limbTop = color('#1c2438');
  const limbBottom = color('#161c2e');
  const streak = color('#283240');

  // The limb: a circle of radius three quarters of the frame width, its centre far below the
  // bottom edge so only a cap of it (v1's 60 px at the art scale) rises into the frame.
  const rise = scaleLength(60, artScale);
  const r = (w * 3) >> 2;
  const cy = h + r - rise;
  const r2 = r * r;
  /** Topmost limb row per column (`h` where the limb does not reach the frame). */
  const limbRow = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    const dx = x - FRAME_CX;
    const d2 = r2 - dx * dx;
    limbRow[x] = d2 <= 0 ? h : Math.ceil(cy - Math.sqrt(d2));
  }

  // Sky gradient over the whole frame (opaque), then stars as a second pass so a sparkle's
  // neighbours are painted over finished sky, not reset by it, then the limb over them.
  for (let y = 0; y < h; y++) {
    const sky = mix(skyTop, skyBottom, y / (h - 1));
    for (let x = 0; x < w; x++) setPixel(image, x, y, sky);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = hash2(x, y, seed);
      if (v % 887 !== 0) continue;
      const lit = v % 2 === 0;
      setPixel(image, x, y, lit ? starLit : starDim);
      if (lit && (v >>> 9) % 3 === 0 && x + 1 < w && y + 1 < h) {
        setPixel(image, x + 1, y, starBig);
        setPixel(image, x, y + 1, starBig);
        setPixel(image, x + 1, y + 1, starLit);
      }
    }
  }

  // The limb: one lit rim row per column, then the body gradient with hash cloud streaks.
  for (let x = 0; x < w; x++) {
    const top = limbRow[x];
    if (top >= h) continue;
    const span = h - top;
    setPixel(image, x, top, rim);
    for (let y = top + 1; y < h; y++) {
      setPixel(image, x, y, mix(limbTop, limbBottom, (y - top) / (span - 1 || 1)));
    }
  }
  for (let i = 0; i < 24; i++) {
    const h1 = hash2(i, 7, seed);
    const y = h - rise + 2 + (h1 % (rise - 4));
    const len = 16 + (hash2(i, 11, seed) % 40);
    let x = h1 % w;
    for (let k = 0; k < len; k++, x++) {
      if (x >= w) break;
      if (y > limbRow[x]) setPixel(image, x, y, streak);
    }
  }
  return image;
}
