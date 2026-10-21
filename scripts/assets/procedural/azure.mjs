/**
 * AZURE VERGE's v2 stand-in art (R5-01.S2, design `docs/v2-run/designs/zone-a.md` §14 and §10,
 * art bible v2 §5). These are the **new** sprite names of the zone-A remaster — the stand-ins
 * the zone lane names once the content is rewritten; every existing sprite stays as it is
 * (interim ×1.5 until a real-art drop, R5-D6).
 *
 * All of it is drawn only on the `(options.artScale ?? 1) !== 1` path and marked `native`
 * (decision RR-1a): the scale-1 build returns no sprites at all, so the v1 atlas stays byte for
 * byte and these names are simply absent there. Sizes and frame counts follow the design's §14
 * table; `bg/azure-horizon` and `bg/azure-clouds` are seamless bands repeating along x at a
 * half-`FRAME_W` period (bible
 * §5.10); `tiles/terrain-azure` is one grid sprite of 26 `options.tileSize` tiles — the whole
 * `terrain-a` list first, in its order and its palette, then the six variant tiles of §10
 * (R5-D3 — the old `tiles/terrain-a` stays the escape/bonus/range set and is untouched).
 *
 * The hittable sprites (the five enemies and the captain's shell) carry `hitFlash`, so the
 * pipeline derives their white `@flash` siblings (decision D30); the bands, the decor and the
 * tileset do not. Colours stay in zone A's existing rock family (`terrain-a`'s palette — the
 * design's "azure palette") with a crystal accent, every one of them at Chebyshev distance
 * ≥ 3 from every reserved palette-cycle ramp (the bible §4.4 margin, asserted by
 * `test/scripts/assets/procedural-zone-a.test.ts`). Geometry uses only `+ - * /` and
 * `Math.sqrt`, texture noise only `hash2` seeded from the sprite name.
 *
 * **Public API.** {@link generate}, {@link AZURE_SPRITES}, {@link AZURE_TILE_NAMES}.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, fillEllipse, makeSprite, mix, seedOf, withAlpha } from './common.mjs';
import { renderTerrainTiles, TERRAIN_TILES, TILE_SIZE } from './terrain.mjs';
import { FRAME_W } from '../v2kit.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * Zone A's rock family — `tiles/terrain-a`'s palette, reused as the design's "azure palette"
 * (zone-a.md §10) so the new art sits on the old terrain without touching `terrain.mjs`.
 */
const SURFACE = color('#8ad0a8');
const SUB = color('#4a9a7a');
const ROCK = [color('#2a5a58'), color('#1e4448'), color('#336a64')];
const DARK = color('#12303a');
const CRYSTAL = color('#7fe8d0');
const CORE = color('#d8fff4');
const SHELL = color('#35686e');
const SHELL_HI = color('#5a9aa0');
const SHELL_LO = color('#1c4048');
const SEAM = color('#c8ecdc');

/** Tile width of both `bg/azure-*` bands: half the frame, derived from `FRAME_W` (zone-a.md
 * §14 asks a band spanning a full frame; an atlas frame cannot exceed the 512-page scenario of
 * `test/scripts/assets/pipeline-edge.test.ts`, and every shipped band in this repo is a
 * seamless repeating tile — `bg/azure-verge`'s 128 among them — so these two are, too, at a
 * period that fills the frame exactly twice). */
export const BAND_TILE_W = FRAME_W / 2;

/** Height of the `bg/azure-horizon` band (zone-a.md §14). */
export const HORIZON_H = 120;

/** Height of the `bg/azure-clouds` band (zone-a.md §14). */
export const CLOUDS_H = 96;

/** The six variant tiles after `terrain-a`'s twenty, in list order (zone-a.md §10). */
export const AZURE_VARIANT_TILES = /** @type {const} */ ([
  'solid-a2',
  'solid-a3',
  'floor-2',
  'ceiling-2',
  'vein',
  'vein-crack',
]);

/** The tile names of `tiles/terrain-azure`: `terrain-a`'s list verbatim, then the variants. */
export const AZURE_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...AZURE_VARIANT_TILES]);

/** The sprite names this generator draws, in its documented order (zone-a.md §14). */
export const AZURE_SPRITES = /** @type {const} */ ([
  'enemies/azure-skiff',
  'enemies/azure-gale',
  'enemies/azure-gnat',
  'enemies/azure-warden',
  'enemies/azure-matron',
  'bosses/azure-captain-shell',
  'bg/azure-horizon',
  'bg/azure-clouds',
  'decor/azure-crystal-a',
  'decor/azure-crystal-b',
  'decor/azure-arch',
  'tiles/terrain-azure',
]);

/**
 * Paints a filled rectangle, clamped to the image.
 *
 * @param {Image} img - The image.
 * @param {number} x0 - First column.
 * @param {number} y0 - First row.
 * @param {number} x1 - Last column (inclusive).
 * @param {number} y1 - Last row (inclusive).
 * @param {readonly [number, number, number, number]} rgba - The colour.
 */
function rect(img, x0, y0, x1, y1, rgba) {
  for (let y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(img.width - 1, x1); x++) {
      setPixel(img, x, y, rgba);
    }
  }
}

/**
 * Paints one pixel, skipping coordinates outside the image.
 *
 * @param {Image} img - The image.
 * @param {number} x - The column.
 * @param {number} y - The row.
 * @param {readonly [number, number, number, number]} rgba - The colour.
 */
function px(img, x, y, rgba) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  setPixel(img, x, y, rgba);
}

/**
 * A hash of (`a`, `b`) into `0 … n − 1` under a seed.
 *
 * @param {number} a - First input.
 * @param {number} b - Second input.
 * @param {number} seed - The generator seed.
 * @param {number} n - The modulus (> 0).
 * @returns {number} The bucket.
 */
function pick(a, b, seed, n) {
  return hash2(a, b, seed) % n;
}

// --------------------------------------------------------------------------- enemies ----

/**
 * `enemies/azure-skiff` (16×12, 4 frames): the small sine-drifting skiff — a flat hull with a
 * canopy, an exhaust plume at the back and a fin that beats one row per frame.
 *
 * @param {number} k - The frame (0 … 3).
 * @returns {Image} The frame.
 */
function skiff(k) {
  const img = createImage(16, 12);
  const beat = k === 0 || k === 3 ? 0 : 1;
  rect(img, 2, 5, 13, 8, SHELL); // hull
  rect(img, 2, 5, 13, 5, SHELL_HI); // lit spine
  rect(img, 2, 8, 13, 8, SHELL_LO); // shaded belly
  rect(img, 8, 3, 10, 4, CRYSTAL); // canopy
  px(img, 9, 3, CORE);
  rect(img, 0, 1 + beat, 1, 4 + beat, SHELL_HI); // fin, beating with the drift
  rect(img, 0, 6, 1, 7, DARK); // exhaust nozzle
  rect(img, 0, k % 2 === 0 ? 6 : 7, 0, k % 2 === 0 ? 6 : 7, CORE); // plume flicker
  rect(img, 14, 6, 15, 7, SUB); // nose sensor
  return img;
}

/**
 * `enemies/azure-gale` (24×18, 4 frames): the swept-wing gale with a bow fan — the fan's blade
 * turns a quarter each frame and the wing tips flap.
 *
 * @param {number} k - The frame (0 … 3).
 * @returns {Image} The frame.
 */
function gale(k) {
  const img = createImage(24, 18);
  const tip = [2, 3, 4, 3][k]; // upper wing-tip row, mid row 4
  rect(img, 3, 9, 21, 11, SHELL); // fuselage
  rect(img, 3, 9, 21, 9, SHELL_HI);
  rect(img, 3, 11, 21, 11, SHELL_LO);
  rect(img, 16, 8, 19, 12, SUB); // engine cowl
  rect(img, 6, tip, 17, 5, ROCK[2]); // upper swept wing
  rect(img, 6, 13, 17, 14 + (7 - tip - 3), ROCK[2]); // lower wing, mirroring the flap
  rect(img, 17, tip, 18, tip, CRYSTAL); // wing-tip light
  const fx = 21; // bow fan: ring plus a blade at a quarter turn per frame
  fillEllipse(img, fx, 5, 2, 4, (_u, _v, e) => (e > 0.72 ? null : ROCK[0]));
  px(img, fx + [2, 0, -2, 0][k], 5 + [0, -3, 0, 3][k], CRYSTAL);
  px(img, fx, 5, CORE);
  rect(img, 0, 9, 1, 10, DARK); // tail
  return img;
}

/**
 * `enemies/azure-gnat` (12×9, 2 frames): the tiny rammer dart — stinger dim while it winds
 * up, blazing on the charge frame.
 *
 * @param {number} k - The frame (0 or 1).
 * @returns {Image} The frame.
 */
function gnat(k) {
  const img = createImage(12, 9);
  rect(img, 1, 4, 8, 4, SHELL); // shaft
  rect(img, 1, 3, 2, 5, SHELL_HI); // tail fins
  if (k === 1) rect(img, 1, 2, 1, 6, SHELL_HI); // fins spread
  rect(img, 9, 3, 11, 5, k === 0 ? CRYSTAL : CORE); // stinger head
  px(img, 11, 4, k === 0 ? CORE : SEAM);
  px(img, 5, 3, ROCK[2]);
  px(img, 6, 5, ROCK[2]);
  return img;
}

/**
 * `enemies/azure-warden` (21×15, 2 frames, no idle animation — like `picket`): the floor
 * turret; frame 1 is its fire — the muzzle burst and a recoiled barrel.
 *
 * @param {number} k - The frame (0 or 1).
 * @returns {Image} The frame.
 */
function warden(k) {
  const img = createImage(21, 15);
  rect(img, 3, 12, 17, 14, DARK); // floor base (bottom rows full for the ground anchor)
  rect(img, 2, 13, 18, 14, ROCK[1]);
  rect(img, 4, 9, 16, 12, ROCK[0]); // body
  rect(img, 5, 9, 15, 9, SUB); // lit shoulder
  const bx = k === 0 ? 0 : 1; // barrel recoils by one
  rect(img, 6 + bx, 5, 14 + bx, 6, SHELL);
  rect(img, 6 + bx, 5, 14 + bx, 5, SHELL_HI);
  rect(img, 14 + bx, 3, 16 + bx, 8, SHELL_LO); // mount
  px(img, 10, 7, CRYSTAL); // eye
  if (k === 1) {
    rect(img, 3, 5, 5, 6, CORE); // muzzle burst
    px(img, 2, 5, CRYSTAL);
    px(img, 2, 6, CRYSTAL);
  }
  return img;
}

/**
 * `enemies/azure-matron` (36×24, 4 frames): the heavy hatch spawner — a plated dome whose
 * brood vents sweep a glow pulse and whose core eyes brighten with it.
 *
 * @param {number} k - The frame (0 … 3).
 * @returns {Image} The frame.
 */
function matron(k) {
  const img = createImage(36, 24);
  rect(img, 3, 4, 32, 6, SHELL_HI); // dome
  rect(img, 2, 7, 33, 14, SHELL);
  rect(img, 2, 14, 33, 15, SHELL_LO);
  for (let i = 0; i < 4; i++) rect(img, 6 + i * 7, 8, 6 + i * 7, 13, ROCK[2]); // plate ribs
  rect(img, 10, 10, 13, 11, CRYSTAL); // core eyes
  rect(img, 22, 10, 25, 11, CRYSTAL);
  if (k === 1 || k === 2) {
    px(img, 11, 10, CORE);
    px(img, 23, 10, CORE);
  }
  for (let v = 0; v < 5; v++) {
    // brood vents along the underside; the lit pair travels right one per frame
    const lit = v === k % 5 || v === (k + 1) % 5;
    rect(img, 4 + v * 6, 16, 7 + v * 6, 17, lit ? CRYSTAL : DARK);
  }
  for (let leg = 0; leg < 4; leg++) {
    const lx = 4 + leg * 8;
    rect(img, lx, 18, lx + 1, 20, ROCK[0]); // jointed legs
    rect(img, lx + (leg % 2), 21, lx + 2 + (leg % 2), 23, ROCK[1]);
  }
  return img;
}

/**
 * `bosses/azure-captain-shell` (45×36, 2 frames — `anim 2/20`): the marshal's shell, a plated
 * carapace with maw-pod tubes top and bottom (those are `bosses/maw-pod`, reused as they are).
 * Frame 1 is the damaged look — cracked plating and a dimmed core.
 *
 * @param {number} k - The frame (0 or 1).
 * @returns {Image} The frame.
 */
function captainShell(k) {
  const img = createImage(45, 36);
  const seed = seedOf('bosses/azure-captain-shell');
  fillEllipse(img, 22, 17, 21, 16, (_u, _v, e) => {
    if (e > 0.94) return DARK;
    if (e > 0.78) return ROCK[0];
    if (e > 0.55) return SHELL;
    return SHELL_LO;
  });
  rect(img, 6, 4, 38, 5, SUB); // lit brow
  rect(img, 4, 29, 40, 30, DARK); // shaded jaw
  for (let r = 0; r < 5; r++) rect(img, 8 + r * 6, 7, 9 + r * 6, 27, ROCK[2]); // plate ridges
  rect(img, 12, 0, 17, 2, ROCK[0]); // crest spikes
  rect(img, 26, 0, 31, 2, ROCK[0]);
  const eye = k === 0 ? CRYSTAL : mix(CRYSTAL, ROCK[0], 0.45);
  fillEllipse(img, 22, 17, 6, 5, (_u, _v, e) => (e > 0.86 ? ROCK[1] : eye));
  if (k === 0) fillEllipse(img, 22, 17, 3, 2, (_u, _v, e) => (e > 0.8 ? eye : CORE));
  for (let v = 0; v < 3; v++) {
    rect(img, 5 + v * 14, 20, 7 + v * 14, 22, k === 0 ? DARK : ROCK[1]); // jaw vents
  }
  if (k === 1) {
    // damage: two cracks through the upper plates, scoured dark
    for (let x = 9; x <= 20; x++) px(img, x, 6 + Math.floor((x - 9) / 4), DARK);
    for (let y = 8; y <= 16; y++) px(img, 31 - Math.floor((y - 8) / 3), y, DARK);
    px(img, 10, 4, ROCK[0]);
    px(img, 34, 12, ROCK[0]);
  } else {
    for (let s = 0; s < 6; s++) {
      px(img, 7 + pick(s, 0, seed, 30), 8 + pick(s, 1, seed, 18), ROCK[2]); // dry barnacle specks
    }
  }
  return img;
}

// ----------------------------------------------------------------------------- bands ----

/**
 * The `bg/azure-horizon` column profile: a plain line with three mesas per tile, each mesa's
 * shoulder ramping at most one row per column, the whole pattern periodic over the tile width,
 * so the band is seamless across its repeat.
 *
 * @returns {Int32Array} The first opaque row of every column.
 */
function horizonProfile() {
  const seed = seedOf('bg/azure-horizon');
  const plain = (x) => {
    // coarse lattice every 40 columns, linearly interpolated, periodic over the tile width
    const j = Math.floor(x / 40);
    const t = x % 40;
    const v0 = 90 + (pick(j, 5, seed, 5) - 2);
    const v1 = 90 + (pick(j + 1, 5, seed, 5) - 2);
    return Math.round(v0 + ((v1 - v0) * t) / 40);
  };
  const top = new Int32Array(BAND_TILE_W);
  for (let x = 0; x < BAND_TILE_W; x++) top[x] = plain(x);
  for (let m = 0; m < 3; m++) {
    const start = pick(m, 11, seed, BAND_TILE_W);
    const len = 70 + pick(m, 12, seed, 60);
    const rise = 16 + pick(m, 13, seed, 30);
    const ramp = Math.min(30, Math.max(1, Math.floor((len - 1) / 2)));
    for (let d = 0; d < len; d++) {
      const x = (start + d) % BAND_TILE_W;
      const dip = Math.min(rise, Math.floor((rise * Math.min(d, len - 1 - d)) / ramp));
      top[x] = Math.min(top[x], plain(x) - dip);
    }
  }
  return top;
}

/**
 * `bg/azure-horizon` (`BAND_TILE_W`×120, 1 frame, not hittable): the mid band of zone A — the
 * silhouette of the Verge's mesa plateau over plain rock, lit on its crest line, repeating
 * seamlessly along x.
 *
 * @returns {Image} The band.
 */
function horizon() {
  const img = createImage(BAND_TILE_W, HORIZON_H);
  const seed = seedOf('bg/azure-horizon');
  const top = horizonProfile();
  for (let x = 0; x < BAND_TILE_W; x++) {
    const t = top[x];
    for (let y = t; y < HORIZON_H; y++) {
      const d = y - t;
      let c = ROCK[1];
      if (d === 0) c = SURFACE;
      else if (d < 3) c = SUB;
      else if (d % 11 === 8) c = ROCK[2];
      else if (d % 11 === 5 && pick(x, y, seed, 7) === 0) c = ROCK[0];
      else if (t < 84 && d < 5 && pick(x, 3, seed, 53) === 0 && x % 3 === 0) c = CRYSTAL;
      setPixel(img, x, y, c);
    }
  }
  return img;
}

/**
 * The paint of a cloud streak — banded alpha haze (the bible §3.6 haze band on a backdrop the
 * stage does not cycle), brighter on its upper edge.
 *
 * @param {number} hi - The brighter body colour.
 * @returns {(u: number, v: number, e: number, x: number, y: number) => (readonly [number, number, number, number] | null)}
 *   The `fillEllipse` paint.
 */
function cloudPaint(hi) {
  return (_u, v, e) => {
    if (e > 0.82) return null;
    if (e > 0.6) return withAlpha(SEAM, 32);
    if (v < -0.2) return withAlpha(hi, 128);
    if (e > 0.34) return withAlpha(SEAM, 64);
    return withAlpha(SEAM, 96);
  };
}

/**
 * `bg/azure-clouds` (`BAND_TILE_W`×96, 2 frames, not hittable): the seam-light drift band —
 * six streaks laid at their positions and their tile-width wraps so the pattern is periodic,
 * the second frame travelling it 24 px to the right.
 *
 * @param {number} k - The frame (0 or 1).
 * @returns {Image} The frame.
 */
function clouds(k) {
  const img = createImage(BAND_TILE_W, CLOUDS_H);
  const seed = seedOf('bg/azure-clouds');
  const shift = k * 24;
  for (let s = 0; s < 6; s++) {
    const cx = (pick(s, 21, seed, BAND_TILE_W) + shift) % BAND_TILE_W;
    const cy = 14 + pick(s, 22, seed, 68);
    const rx = 40 + pick(s, 23, seed, 70);
    const ry = 3 + pick(s, 24, seed, 6);
    const hi = pick(s, 25, seed, 2) === 0 ? CORE : SEAM;
    for (const off of [-BAND_TILE_W, 0, BAND_TILE_W]) {
      fillEllipse(img, cx + off, cy, rx, ry, cloudPaint(hi));
    }
  }
  return img;
}

// ---------------------------------------------------------------------------- decor ----

/**
 * One prism of a crystal cluster: a tapering facet column lit on its edge.
 *
 * @param {Image} img - The image.
 * @param {number} base - Bottom row (inclusive).
 * @param {number} x0 - Left column of the foot.
 * @param {number} x1 - Right column of the foot.
 * @param {number} h - Height in rows.
 * @param {number} lean - Columns the tip shifts right over the height.
 */
function prism(img, base, x0, x1, h, lean) {
  const topX0 = x0 + lean;
  for (let d = 0; d < h; d++) {
    const y = base - d;
    const f = h <= 1 ? 1 : d / (h - 1);
    const a = Math.round(x0 + (topX0 - x0) * f);
    const b = Math.round(x1 + (topX0 + (x1 - x0) - 1 - x0) * f);
    const shrink = d === h - 1 ? 1 : 0;
    for (let x = a + shrink; x <= b - shrink; x++) {
      px(img, x, y, x === a + shrink ? SUB : ROCK[2]);
    }
    px(img, a + shrink, y, f > 0.6 ? CRYSTAL : SUB);
  }
  px(img, Math.round((topX0 + x1) / 2), base - h + 1, CORE);
}

/**
 * `decor/azure-crystal-a` (24×36, 1 frame): a three-blade crystal cluster on a rock foot — the
 * back-layer sparkle of the Verge (zone-a.md §9).
 *
 * @returns {Image} The decor.
 */
function crystalA() {
  const img = createImage(24, 36);
  prism(img, 31, 4, 9, 26, 2);
  prism(img, 31, 10, 18, 31, -1);
  prism(img, 31, 18, 22, 14, 1);
  rect(img, 2, 32, 21, 35, ROCK[0]); // foot
  rect(img, 2, 32, 21, 32, ROCK[2]);
  rect(img, 3, 35, 20, 35, DARK);
  return img;
}

/**
 * `decor/azure-crystal-b` (36×48, 1 frame): the big cluster — five blades with a leaning
 * shard, the spire-base garnish of the remaster (zone-a.md §9).
 *
 * @returns {Image} The decor.
 */
function crystalB() {
  const img = createImage(36, 48);
  prism(img, 43, 3, 8, 30, 2);
  prism(img, 43, 9, 20, 42, 1);
  prism(img, 43, 21, 28, 36, -2);
  prism(img, 43, 29, 33, 22, 1);
  for (let d = 0; d < 16; d++) {
    // a thin leaning shard against the main blade
    px(img, 8 + Math.floor(d / 2), 43 - d, d % 4 === 0 ? CRYSTAL : ROCK[2]);
  }
  rect(img, 1, 44, 34, 47, ROCK[0]); // foot
  rect(img, 1, 44, 34, 44, ROCK[2]);
  rect(img, 2, 47, 33, 47, DARK);
  return img;
}

/**
 * `decor/azure-arch` (96×48, 1 frame): the drowned verge arch — two pillars, a lintel with a
 * key-stone gap and hash-scoured broken corners, a front-layer silhouette (zone-a.md §9).
 *
 * @returns {Image} The decor.
 */
function arch() {
  const img = createImage(96, 48);
  const seed = seedOf('decor/azure-arch');
  rect(img, 0, 14, 15, 47, ROCK[0]); // pillars
  rect(img, 80, 10, 95, 47, ROCK[0]);
  rect(img, 0, 14, 15, 15, SUB); // lit caps
  rect(img, 80, 10, 95, 11, SUB);
  rect(img, 4, 2, 91, 9, ROCK[0]); // lintel
  rect(img, 4, 2, 91, 2, SUB);
  rect(img, 4, 9, 91, 9, DARK); // under-shadow line
  rect(img, 30, 9, 36, 9, ROCK[0]); // a key-stone hangs lower mid-span
  rect(img, 30, 5, 36, 8, ROCK[2]);
  for (let x = 0; x < 96; x++) {
    // scoured top edges and pillar feet (deterministic erosion)
    if (pick(x, 31, seed, 5) === 0) rect(img, x, 2, x, 3, DARK);
    if (pick(x, 32, seed, 4) === 0) px(img, x, 13, DARK);
    if (pick(x, 33, seed, 6) === 0) px(img, x, 47, DARK);
  }
  for (let y = 14; y < 47; y += 6) rect(img, 6, y, 9, y, ROCK[1]); // pillar seams
  for (let y = 10; y < 47; y += 6) rect(img, 86, y, 89, y, ROCK[1]);
  return img;
}

// ---------------------------------------------------------------------------- tiles ----

/**
 * `solid-a2`: the flat-stone fill variant — banded strata with hash speckles, fully opaque.
 *
 * @param {number} s - The tile side.
 * @returns {Image} The tile.
 */
function solidA2(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-azure/solid-a2');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let c = ROCK[0];
      if (y % 4 === 1) c = ROCK[1];
      else if (pick(x, y, seed, 5) === 0) c = ROCK[2];
      setPixel(img, x, y, c);
    }
  }
  rect(img, 0, s - 1, s - 1, s - 1, DARK);
  return img;
}

/**
 * `solid-a3`: the veined-stone fill variant — a crystal vein crossing the block corner to
 * corner with rock shoulders, fully opaque.
 *
 * @param {number} s - The tile side.
 * @returns {Image} The tile.
 */
function solidA3(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-azure/solid-a3');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(x, y, seed, 7) === 0 ? ROCK[2] : ROCK[1]);
    }
  }
  for (let x = 0; x < s; x++) {
    const y = s - 1 - Math.floor((x * (s - 1)) / s);
    px(img, x, y, CRYSTAL);
    px(img, x, y - 1, SUB);
    if (x % 3 === 1) px(img, x, y + 1, ROCK[0]);
  }
  return img;
}

/**
 * `floor-2`: the speckled sand-crust surface variant — terrain-a's floor structure (lit crust,
 * solid body under it) with a sandy speckle instead of the plain rock banding.
 *
 * @param {number} s - The tile side.
 * @returns {Image} The tile.
 */
function floor2(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-azure/floor-2');
  rect(img, 0, 0, s - 1, 0, SURFACE);
  rect(img, 0, 1, s - 1, 1, SUB);
  for (let y = 2; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const r = pick(x, y, seed, 7);
      setPixel(img, x, y, r === 0 ? ROCK[2] : r === 1 ? ROCK[1] : ROCK[0]);
    }
  }
  rect(img, 0, s - 1, s - 1, s - 1, DARK);
  return img;
}

/**
 * `ceiling-2`: the root-fringe ceiling variant — a solid crust under the attach row with root
 * strands hanging at hash-chosen lengths. Every column is opaque from the crust down to its
 * strand's end (contiguous, so its column-height mask is the fringe silhouette itself), and
 * the tips catch the light like the floor crust's rim.
 *
 * @param {number} s - The tile side.
 * @returns {Image} The tile.
 */
function ceiling2(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-azure/ceiling-2');
  rect(img, 0, 0, s - 1, 1, ROCK[1]); // attach band (darker, it is buried)
  const lengths = [];
  for (let x = 0; x < s; x++) {
    const len = 2 + pick(x, 41, seed, s - 2); // crust + strand
    lengths.push(len);
    for (let y = 2; y < len; y++) px(img, x, y, y === 2 ? ROCK[0] : ROCK[1]);
    px(img, x, len - 1, len > 6 ? SUB : SURFACE); // lit root tip
  }
  for (let x = 0; x < s; x += 3) {
    if (pick(x, 42, seed, 3) === 0 && lengths[x] > 5) px(img, x, 4, CRYSTAL); // dew on a root
  }
  return img;
}

/**
 * The crystal-vein destructible (terrain-a's brick role on the spire pedestals): a vein eye
 * set in solid rock. Shared by `vein` and `vein-crack`.
 *
 * @param {number} s - The tile side.
 * @param {boolean} broken - The cracked stage (`vein-crack`): dimmed crystal, dark fissures.
 * @returns {Image} The tile.
 */
function veinTile(s, broken) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-azure/vein');
  const eye = broken ? mix(CRYSTAL, ROCK[0], 0.55) : CRYSTAL;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.abs(x - (s - 1) / 2) + Math.abs(y - (s - 1) / 2);
      let c = ROCK[0];
      if (pick(x, y, seed, 6) === 0) c = ROCK[2];
      if (d <= 3) c = eye;
      else if (d <= 5) c = broken ? ROCK[2] : SUB;
      setPixel(img, x, y, c);
    }
  }
  if (broken) {
    for (let y = 0; y < s; y++) px(img, 1 + (y % 3), y, DARK);
    for (let x = 0; x < s; x++)
      px(img, x, x > s / 2 ? s - 2 - ((x - Math.floor(s / 2)) % 3) : 2, DARK);
    px(img, Math.floor(s / 2), Math.floor(s / 2), ROCK[1]);
  } else {
    px(img, Math.floor(s / 2), Math.floor(s / 2), CORE);
  }
  return img;
}

/**
 * The twenty-six frames of `tiles/terrain-azure`: `terrain-a`'s whole tile list first, in its
 * order and its palette (the design's "azure palette" is that palette — §10), then the six
 * variant tiles. Fully-opaque frames except `ceiling-2`'s root fringe.
 *
 * @param {number} size - The tile side (`options.tileSize`).
 * @returns {Image[]} The frames, in list order.
 */
function azureTiles(size) {
  return [
    ...renderTerrainTiles(size, 'tiles/terrain-a'),
    solidA2(size),
    solidA3(size),
    floor2(size),
    ceiling2(size),
    veinTile(size, false),
    veinTile(size, true),
  ];
}

// -------------------------------------------------------------------------- generate ----

/**
 * Draws zone A's v2 stand-ins (zone-a.md §14).
 *
 * @param {{ tileSize?: number, artScale?: number }} [options] - The build's tile side and art
 *   scale (the pipeline passes both; `tileSize` defaults to the v2 `TILE_SIZE`).
 * @returns {SpriteDef[]} The twelve sprites at their bible sizes, all `native` — **`[]` at art
 *   scale 1** (RR-1a: the v1 build never sees them; their `@flash` siblings come from the
 *   pipeline's flash pass like every hittable sprite's).
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  if (artScale === 1) return [];
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  const tiles = azureTiles(size);
  return [
    makeSprite('enemies/azure-skiff', [skiff(0), skiff(1), skiff(2), skiff(3)], 'azure', {
      ...hit,
      animations: { drift: [0, 1, 2, 3] },
    }),
    makeSprite('enemies/azure-gale', [gale(0), gale(1), gale(2), gale(3)], 'azure', {
      ...hit,
      animations: { flap: [0, 1, 2, 3] },
    }),
    makeSprite('enemies/azure-gnat', [gnat(0), gnat(1)], 'azure', {
      ...hit,
      animations: { blink: [0, 1] },
    }),
    makeSprite('enemies/azure-warden', [warden(0), warden(1)], 'azure', hit),
    makeSprite('enemies/azure-matron', [matron(0), matron(1), matron(2), matron(3)], 'azure', {
      ...hit,
      animations: { pulse: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/azure-captain-shell', [captainShell(0), captainShell(1)], 'azure', {
      ...hit,
      animations: { turn: [0, 1] },
    }),
    makeSprite('bg/azure-horizon', [horizon()], 'azure', { anchor: [0, 0], ...native }),
    makeSprite('bg/azure-clouds', [clouds(0), clouds(1)], 'azure', {
      anchor: [0, 0],
      ...native,
      animations: { drift: [0, 1] },
    }),
    makeSprite('decor/azure-crystal-a', [crystalA()], 'azure', { anchor: [0, 0], ...native }),
    makeSprite('decor/azure-crystal-b', [crystalB()], 'azure', { anchor: [0, 0], ...native }),
    makeSprite('decor/azure-arch', [arch()], 'azure', { anchor: [0, 0], ...native }),
    makeSprite('tiles/terrain-azure', tiles, 'azure', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(AZURE_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ];
}
