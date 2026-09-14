/**
 * Zone F, **CELL VAULT** (plan M2-13) — placeholder art of the organic-cells zone (decision D24):
 *
 * - `bg/vault-membrane` ({@link MEMBRANE_TILE_W}×{@link MEMBRANE_TILE_H}, the far band): a wall of
 *   living cells — a seeded cell pattern (the nearest and second-nearest of scattered nuclei,
 *   wrapped round both tile edges, so the band repeats seamlessly across and down) painted **only**
 *   in the four colours of {@link VAULT_RAMP}: the stage's palette cycle makes it pulse.
 * - `bg/vault-folds` ({@link FOLDS_TILE_W}×{@link FOLDS_TILE_H}, a mid band): soft fleshy folds
 *   rising from the bottom — a lumpy profile summed from rounded bumps whose periods divide the
 *   tile width — with a pale rim and pores.
 * - Enemies (flying ones face left; hit-flash siblings): `enemies/lymph-mote` (a pale drifting
 *   mote, its nucleus wandering, 2 frames), `enemies/chaser-cell` (an amoeba-like cell that chases
 *   the ship, its membrane wobbling, 2 frames), `enemies/mitosis-cell` (a big cell about to divide,
 *   its waist pinching, 2 frames), `enemies/vault-claw` (the hooked claw of a grabbing tentacle),
 *   `enemies/polyp-turret` (a fleshy polyp on a floor with a pore that spits), `enemies/spore-sac`
 *   (a bumpy pod that hovers and puffs fans of spores, pulsing, 2 frames).
 * - MANTLE REGENT (MR-06), the squid: `bosses/regent-mantle` (the long mantle trailing to the
 *   right), `bosses/regent-fin` (its tail fin, rippling, 2 frames), `bosses/regent-eye` (the great
 *   eye — the weak point, its pupil dilating, 2 frames), `bosses/regent-root` (a tentacle's root —
 *   break it and the tentacle falls), `bosses/regent-segment` (a round tentacle segment with a
 *   sucker), `bosses/regent-tip` (the barbed tentacle tip).
 *
 * Olive, teal and bone tones — low in saturation, never pink, red or purple like the bullets
 * (shmup_feat.md §12, §18). Geometry uses only `+ - * /` and `Math.sqrt`, randomness `hash2` and the
 * seeded asset RNG (seeded from the sprite names), so the pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link VAULT_SPRITES}, {@link VAULT_RAMP} (the colours zone F's
 * palette cycle must name), {@link MEMBRANE_TILE_W} / {@link MEMBRANE_TILE_H}, {@link FOLDS_TILE_W}
 * / {@link FOLDS_TILE_H} (the bands' tile sizes, their parallax `spacing`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { createAssetRng, hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf, withAlpha } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/vault-membrane` tile (its parallax `spacing`). */
export const MEMBRANE_TILE_W = 128;

/** Height of the `bg/vault-membrane` tile (two bands, one under the other, join seamlessly). */
export const MEMBRANE_TILE_H = 64;

/** Width of the `bg/vault-folds` tile (its parallax `spacing`). */
export const FOLDS_TILE_W = 128;

/** Height of the `bg/vault-folds` tile. */
export const FOLDS_TILE_H = 48;

/**
 * The cell wall's four colours, dark → light — the exact colours zone F's palette cycle names
 * (`content/stages/zone-f.stage.json`).
 */
export const VAULT_RAMP = Object.freeze(['#18261e', '#203428', '#2a4434', '#385a44']);

/** The sprites this generator draws, in order. */
export const VAULT_SPRITES = Object.freeze([
  'bg/vault-membrane',
  'bg/vault-folds',
  'enemies/lymph-mote',
  'enemies/chaser-cell',
  'enemies/mitosis-cell',
  'enemies/vault-claw',
  'enemies/polyp-turret',
  'enemies/spore-sac',
  'bosses/regent-mantle',
  'bosses/regent-fin',
  'bosses/regent-eye',
  'bosses/regent-root',
  'bosses/regent-segment',
  'bosses/regent-tip',
]);

/**
 * Generates zone F's art.
 *
 * @returns {SpriteDef[]} The sprites of {@link VAULT_SPRITES}, in that order.
 */
export function generate() {
  const flash = { hitFlash: true };
  return [
    makeSprite('bg/vault-membrane', [membrane()], 'vault', { anchor: [0, 0] }),
    makeSprite('bg/vault-folds', [folds()], 'vault', { anchor: [0, 0] }),
    makeSprite('enemies/lymph-mote', [moteFrame(0), moteFrame(1)], 'vault', {
      hitFlash: true,
      animations: { drift: [0, 1] },
    }),
    makeSprite('enemies/chaser-cell', [chaserFrame(0), chaserFrame(1)], 'vault', {
      hitFlash: true,
      animations: { wobble: [0, 1] },
    }),
    makeSprite('enemies/mitosis-cell', [mitosisFrame(0), mitosisFrame(1)], 'vault', {
      hitFlash: true,
      animations: { pinch: [0, 1] },
    }),
    makeSprite('enemies/vault-claw', [clawFrame()], 'vault', flash),
    makeSprite('enemies/polyp-turret', [polypFrame()], 'vault', flash),
    makeSprite('enemies/spore-sac', [sacFrame(0), sacFrame(1)], 'vault', {
      hitFlash: true,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('bosses/regent-mantle', [mantleFrame()], 'vault', flash),
    makeSprite('bosses/regent-fin', [finFrame(0), finFrame(1)], 'vault', {
      animations: { ripple: [0, 1] },
    }),
    makeSprite('bosses/regent-eye', [eyeFrame(2.2), eyeFrame(3.4)], 'vault', {
      hitFlash: true,
      animations: { dilate: [0, 1] },
    }),
    makeSprite('bosses/regent-root', [rootFrame()], 'vault', flash),
    makeSprite('bosses/regent-segment', [segmentFrame()], 'vault', flash),
    makeSprite('bosses/regent-tip', [tipFrame()], 'vault', flash),
  ];
}

/**
 * The shortest distance along a wrapped axis.
 *
 * @param {number} d - Signed difference.
 * @param {number} size - The axis length.
 * @returns {number} `|d|` folded into `[0, size / 2]`.
 */
function wrapped(d, size) {
  const a = Math.abs(d) % size;
  return a > size / 2 ? size - a : a;
}

/**
 * The cell wall: 22 seeded nuclei; every pixel takes the distances to its nearest (`d1`) and second
 * nearest (`d2`) nucleus, both wrapped round the tile edges — near the boundary between two cells
 * (`d2 − d1` small) it is the light wall, deeper inside a cell darker. Every pixel is opaque and one
 * of the {@link VAULT_RAMP} colours.
 *
 * @returns {Image} The tile.
 */
function membrane() {
  const w = MEMBRANE_TILE_W;
  const h = MEMBRANE_TILE_H;
  const rng = createAssetRng(seedOf('bg/vault-membrane'));
  const ramp = VAULT_RAMP.map(color);
  /** @type {{ x: number, y: number }[]} */
  const nuclei = [];
  for (let i = 0; i < 22; i++)
    nuclei.push({ x: rng.rangeInt(0, w - 1), y: rng.rangeInt(0, h - 1) });
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d1 = Number.POSITIVE_INFINITY;
      let d2 = Number.POSITIVE_INFINITY;
      for (const n of nuclei) {
        const dx = wrapped(x - n.x, w);
        const dy = wrapped(y - n.y, h);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
      const edge = d2 - d1;
      const k = edge < 1.5 ? 3 : edge < 3.5 ? 2 : d1 < 3 ? 2 : d1 < 9 ? 1 : 0;
      setPixel(image, x, y, ramp[k]);
    }
  }
  return image;
}

/**
 * A rounded bump of a whole-pixel period: 1 at its crest (`x` = 0), 0 at half the period — a
 * parabola, so the folds read soft.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function bump(x, period) {
  const t = ((((x % period) + period) % period) / period) * 2 - 1;
  return t * t;
}

/**
 * The folds band: two ranges of fleshy lumps (periods 64 / 32 and 128 / 16 px — they divide the
 * tile width), the far one darker, the near one with a pale rim and a few dark pores.
 *
 * @returns {Image} The tile.
 */
function folds() {
  const w = FOLDS_TILE_W;
  const h = FOLDS_TILE_H;
  const far = color('#1e2e26');
  const near = color('#2c4034');
  const rim = color('#6a8a70');
  const pore = color('#141e18');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const farTop = Math.round(6 + 16 * bump(x + 8, 64) + 5 * bump(x, 32));
    const nearTop = Math.round(18 + 14 * bump(x + 40, 128) + 4 * bump(x + 5, 16));
    for (let y = farTop; y < h; y++) setPixel(image, x, y, far);
    for (let y = nearTop; y < h; y++) setPixel(image, x, y, y - nearTop < 1 ? rim : near);
  }
  const seed = seedOf('bg/vault-folds');
  for (let i = 0; i < 14; i++) {
    const px = hash2(i, 0, seed) % w;
    const py = 34 + (hash2(i, 1, seed) % (h - 36));
    setPixel(image, px, py, pore);
    setPixel(image, (px + 1) % w, py, pore);
  }
  return image;
}

/**
 * A lymph mote: a pale translucent blob with a darker nucleus that wanders between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function moteFrame(frame) {
  const size = 8;
  const rim = color('#8ab8a0');
  const body = withAlpha(color('#c8e8d0'), 210);
  const nucleus = color('#3a5a48');
  const image = createImage(size, size);
  fillEllipse(image, 3.5, 3.5, 3.4, 3.1, (_u, _v, e) => (e > 0.8 ? rim : body));
  fillEllipse(image, 3 + frame, 3 + frame * 0.5, 1.2, 1.2, () => nucleus);
  return image;
}

/**
 * A chaser cell: an olive amoeba with a pale membrane and a dark nucleus; its outline bulges one
 * way, then the other.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function chaserFrame(frame) {
  const size = 12;
  const rim = color('#b0d0a8');
  const body = color('#5a8468');
  const lit = color('#7aa484');
  const nucleus = color('#1c2c22');
  const image = createImage(size, size);
  const rx = frame === 0 ? 5.6 : 4.8;
  const ry = frame === 0 ? 4.8 : 5.6;
  fillEllipse(image, 5.5, 5.5, rx, ry, (u, v, e) => {
    if (e > 0.82) return rim;
    return u + v < -0.5 ? lit : body;
  });
  fillEllipse(image, 4.5, 5, 1.8, 1.6, () => nucleus);
  return image;
}

/**
 * A mitosis cell: a big pale-green cell with two nuclei; in frame 1 its waist pinches in — the cell
 * is dividing (shot, it splits into chasing cells).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function mitosisFrame(frame) {
  const w = 18;
  const h = 14;
  const rim = color('#b8d8b0');
  const body = color('#4e7a5e');
  const lit = color('#6e9a7a');
  const nucleus = color('#1c2c22');
  const image = createImage(w, h);
  const pinch = frame === 0 ? 0.15 : 0.35;
  fillEllipse(image, 8.5, 6.5, 8.5, 6.5, (u, v, e) => {
    // The waist: the ellipse narrows towards its middle column.
    const waist = 1 - pinch * (1 - u * u) * 2;
    if (Math.abs(v) > waist) return null;
    if (e > 0.86 || Math.abs(v) > waist - 0.18) return rim;
    return v < -0.3 ? lit : body;
  });
  fillEllipse(image, 4.5, 6.5, 1.6, 1.6, () => nucleus);
  fillEllipse(image, 12.5, 6.5, 1.6, 1.6, () => nucleus);
  return image;
}

/**
 * The vault claw: a bony hook pointing left and down with a dark cleft — the head of a grabbing
 * tentacle (its chain is the engine's link sprite).
 *
 * @returns {Image} The frame.
 */
function clawFrame() {
  const size = 10;
  const bone = color('#c8c09c');
  const shade = color('#8a8466');
  const tip = color('#3a3628');
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 4.5, 3.6, 3.4, (u, v) => (u + v < -0.4 ? bone : shade));
  drawLine(image, 3, 6, 1, 9, bone, 2);
  drawLine(image, 7, 7, 8, 9, shade, 2);
  setPixel(image, 1, 9, tip);
  setPixel(image, 8, 9, tip);
  setPixel(image, 5, 5, tip);
  return image;
}

/**
 * A polyp turret: an olive fleshy dome standing on a floor with a dark pore at its top that spits
 * (the renderer flips it on a ceiling).
 *
 * @returns {Image} The frame.
 */
function polypFrame() {
  const w = 14;
  const h = 11;
  const rim = color('#1a2a20');
  const flesh = color('#56785e');
  const lit = color('#7e9e80');
  const pore = color('#0e1612');
  const image = createImage(w, h);
  fillEllipse(image, 6.5, 10, 6.5, 8, (u, v, e) => {
    if (e > 0.88) return rim;
    return u + v < -0.8 ? lit : flesh;
  });
  fillEllipse(image, 6.5, 3.6, 1.8, 1.3, () => pore);
  return image;
}

/**
 * A spore sac: a round bumpy pod with pale nodules (it hovers and puffs spores); it swells a pixel
 * between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function sacFrame(frame) {
  const size = 16;
  const rim = color('#1c2a22');
  const skin = color('#4a6a54');
  const lit = color('#6a8c72');
  const nodule = color('#b8d0a0');
  const image = createImage(size, size);
  const r = 6.2 + frame * 0.9;
  fillEllipse(image, 7.5, 7.5, r, r, (u, v, e) => {
    if (e > 0.88) return rim;
    return u + v < -0.6 ? lit : skin;
  });
  const seed = seedOf('enemies/spore-sac');
  for (let i = 0; i < 6; i++) {
    const nx = 4 + (hash2(i, 0, seed) % 8);
    const ny = 4 + (hash2(i, 1, seed) % 8);
    setPixel(image, nx, ny, nodule);
  }
  return image;
}

/**
 * MANTLE REGENT's mantle: a long olive-slate body, rounded at the head end (left, where the eye
 * sits) and tapering to a point on the right, pale spots along it and a darker back.
 *
 * @returns {Image} The frame.
 */
function mantleFrame() {
  const w = 60;
  const h = 36;
  const rim = color('#101a16');
  const skin = color('#3c5a4c');
  const back = color('#2c4238');
  const lit = color('#5e806a');
  const spot = color('#a8c4a0');
  const image = createImage(w, h);
  fillEllipse(image, 29.5, 17.5, 29.5, 17, (u, v, e) => {
    // Taper towards the right end: cut rows away as u grows.
    const taper = u > 0 ? 1 - u * u * 0.8 : 1;
    if (Math.abs(v) > taper) return null;
    if (e > 0.94 || Math.abs(v) > taper - 0.08) return rim;
    if (v > 0.35) return back;
    return v < -0.4 ? lit : skin;
  });
  const seed = seedOf('bosses/regent-mantle');
  for (let i = 0; i < 12; i++) {
    const sx = 8 + (hash2(i, 0, seed) % 40);
    const sy = 10 + (hash2(i, 1, seed) % 12);
    fillEllipse(image, sx, sy, 1.2, 1, () => spot);
  }
  return image;
}

/**
 * MANTLE REGENT's tail fin: a translucent pale fan behind the mantle's point, rippling a pixel
 * between the frames (decoration — never hit).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function finFrame(frame) {
  const w = 20;
  const h = 30;
  const membrane = color('#7a9a84');
  const ray = color('#b8d0b0');
  const image = createImage(w, h);
  for (let y = 1; y < h - 1; y++) {
    const t = (y - 14.5) / 13.5;
    const reach = Math.round(3 + 15 * (1 - t * t));
    const shift = (y + frame) % 4 < 2 ? 0 : 1;
    for (let x = 0; x < reach + shift && x < w; x++) {
      setPixel(image, x, y, y % 5 === 0 ? ray : withAlpha(membrane, 160));
    }
  }
  return image;
}

/**
 * MANTLE REGENT's eye — the weak point: a pale sclera with an amber iris and a dark pupil whose
 * radius is `pupil` px (it dilates between the frames).
 *
 * @param {number} pupil - Pupil radius in pixels.
 * @returns {Image} The frame.
 */
function eyeFrame(pupil) {
  const size = 16;
  const lid = color('#1a2620');
  const sclera = color('#d8e0c8');
  const iris = color('#c8a048');
  const dark = color('#140e08');
  const image = createImage(size, size);
  fillEllipse(image, 7.5, 7.5, 7.5, 7.5, (_u, _v, e) => (e > 0.86 ? lid : sclera));
  fillEllipse(image, 7, 7.5, 4.6, 4.6, (_u, _v, e) => (e > 0.8 ? mix(iris, dark, 0.4) : iris));
  fillEllipse(image, 7, 7.5, pupil, pupil + 0.8, () => dark);
  setPixel(image, 5, 5, sclera);
  return image;
}

/**
 * A tentacle root: a thick round olive joint with a pale ring — the part that breaks.
 *
 * @returns {Image} The frame.
 */
function rootFrame() {
  const size = 12;
  const rim = color('#101a16');
  const flesh = color('#4a6c58');
  const ring = color('#9ab898');
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.5, 5.5, (u, v, e) => {
    if (e > 0.88) return rim;
    if (e > 0.62) return ring;
    return u + v < -0.3 ? mix(flesh, ring, 0.3) : flesh;
  });
  return image;
}

/**
 * A tentacle segment: a round slate-olive bead with a pale sucker (armour — shots clink).
 *
 * @returns {Image} The frame.
 */
function segmentFrame() {
  const size = 10;
  const rim = color('#101a16');
  const skin = color('#3e5a4a');
  const lit = color('#5e7e68');
  const sucker = color('#c0d4b0');
  const image = createImage(size, size);
  fillEllipse(image, 4.5, 4.5, 4.5, 4.5, (u, v, e) => {
    if (e > 0.86) return rim;
    return u + v < -0.5 ? lit : skin;
  });
  fillEllipse(image, 4.5, 5.5, 1.5, 1.3, (_u, _v, e) => (e > 0.6 ? sucker : rim));
  return image;
}

/**
 * A tentacle tip: a round bead ending in a pale barbed hook pointing left (a gun: it lashes out
 * needles).
 *
 * @returns {Image} The frame.
 */
function tipFrame() {
  const size = 10;
  const rim = color('#101a16');
  const skin = color('#3e5a4a');
  const barb = color('#d0c8a0');
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 4.5, 3.6, 3.6, (_u, _v, e) => (e > 0.8 ? rim : skin));
  drawLine(image, 2.5, 4.5, 0, 3, barb, 2);
  drawLine(image, 0, 3, 1, 1, barb);
  drawLine(image, 3, 6, 1, 8, barb);
  return image;
}
