/**
 * Zone F, **CELL VAULT** (plan M2-13) — placeholder art of the organic-cells zone (decision D24):
 *
 * - `bg/vault-membrane` ({@link MEMBRANE_TILE_W}×{@link MEMBRANE_TILE_H}, the far band): a wall of
 *   living cells — a seeded cell pattern (the nearest and second-nearest of scattered nuclei,
 *   wrapped round both tile edges, so the band repeats seamlessly across and down) painted **only**
 *   in colours of {@link VAULT_RAMP} (v1) / {@link VAULT_RAMP_V2} (the frozen v2 ramp, R5-P.P7):
 *   the stage's palette cycle makes it pulse.
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
 * Since R5-06.S2 the generator also draws the v2 stand-ins of design
 * `docs/v2-run/designs/zone-f.md` §14 at an art scale ≠ 1 (decision RR-1a, the zone-B and zone-D
 * precedent): `enemies/tissue-cyst` (the wall cyst that hatches chaser cells, 4 frames),
 * `enemies/viral-dart` (the darting runner, its tail fin flicking, 4 frames),
 * `bosses/regent-plate` (MANTLE REGENT's mantle-attached armour) and `bosses/regent-blister` (its
 * vulnerable blister, swelling, 4 frames) — all hittable; the three §9 bands `bg/vault-substrate`
 * (the opaque far depth — painted so that it carries **no** ramp colour, design §14),
 * `bg/vault-ribcage` (the mid rib arches under a ceiling membrane) and `bg/vault-haze` (a sparse
 * fore veil, 2 frames); the additive decor glow `fx/glow-vault-node` (2 frames); and
 * `tiles/terrain-vault-v2` — `terrain-vault`'s twenty tiles verbatim in their list order before
 * the three §10 variants `tissue-live`, `calcified` and `nodule`. The bands are seamless tiles at a
 * half-`FRAME_W` period like zones B–D's; every new colour sits at Chebyshev distance ≥ 3 from
 * every reserved palette-cycle ramp (bible §4.4, asserted by
 * `test/scripts/assets/procedural-zone-f.test.ts`) — no new band rides a cycle, so the scan's rule
 * 2 is untouched; the glow tones pass through `offRamp`.
 *
 * Olive, teal and bone tones — low in saturation, never pink, red or purple like the bullets
 * (shmup_feat.md §12, §18). Geometry uses only `+ - * /` and `Math.sqrt`, randomness `hash2` and the
 * seeded asset RNG (seeded from the sprite names), so the pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link VAULT_SPRITES}, {@link VAULT_RAMP} (the colours zone F's
 * v1 palette cycle named), {@link VAULT_RAMP_V2} (the frozen v2 ramp zone F's cycle names since
 * R5-P.P7), {@link MEMBRANE_TILE_W} / {@link MEMBRANE_TILE_H}, {@link FOLDS_TILE_W}
 * / {@link FOLDS_TILE_H} (the bands' tile sizes, their parallax `spacing`) — and, since R5-06.S2,
 * {@link VAULT_V2_SPRITES}, {@link VAULT_V2_TILE_NAMES}, {@link BAND_TILE_W}, {@link SUBSTRATE_H},
 * {@link RIBCAGE_H}, {@link HAZE_H}.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { scaleImage } from '../interim.mjs';
import { createAssetRng, hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf, withAlpha } from './common.mjs';
import { renderTerrainTiles, TERRAIN_PALETTES, TERRAIN_TILES, TILE_SIZE } from './terrain.mjs';
import { FRAME_W } from '../../frame.mjs';
import { offRamp } from '../v2kit.mjs';

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

/**
 * Zone F's frozen v2 ramp (design `docs/v2-run/designs/zone-f.md` §9): the six colours
 * `content/stages/zone-f.stage.json` names now (v1's four, a darker base and a brighter cell added),
 * dark → light — drawn by `bg/vault-membrane` only at an art scale ≠ 1 (RR-1: the scale-1 build
 * keeps {@link VAULT_RAMP} byte for byte).
 */
export const VAULT_RAMP_V2 = Object.freeze([
  '#101e18',
  '#18261e',
  '#203428',
  '#2a4434',
  '#385a44',
  '#4c7856',
]);

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

/** The v2 stand-in names {@link generate} adds at an art scale ≠ 1, in its output order (§14). */
export const VAULT_V2_SPRITES = Object.freeze([
  'enemies/tissue-cyst',
  'enemies/viral-dart',
  'bosses/regent-plate',
  'bosses/regent-blister',
  'bg/vault-substrate',
  'bg/vault-ribcage',
  'bg/vault-haze',
  'fx/glow-vault-node',
  'tiles/terrain-vault-v2',
]);

/** The three §10 variant tiles after `terrain-vault`'s twenty, in list order (ids 21–23). */
export const VAULT_V2_TILES = /** @type {const} */ (['tissue-live', 'calcified', 'nodule']);

/** The tile names of `tiles/terrain-vault-v2`: `terrain-vault`'s list verbatim, then the variants. */
export const VAULT_V2_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...VAULT_V2_TILES]);

/**
 * Tile width of the three §9 bands `bg/vault-substrate`, `bg/vault-ribcage` and `bg/vault-haze`:
 * half the frame, derived from `FRAME_W` — the zone-B/C/D precedent (design §14 asks full-frame
 * bands, an atlas frame cannot exceed the 512-page scenario of
 * `test/scripts/assets/pipeline-edge.test.ts`, and every band here is a seamless repeating tile,
 * so these are, at a period that fills the frame exactly twice).
 */
export const BAND_TILE_W = FRAME_W / 2;

/** Height of the `bg/vault-substrate` band (zone-f.md §14: 432 = 36 tile rows). */
export const SUBSTRATE_H = 36 * TILE_SIZE;

/** Height of the `bg/vault-ribcage` band (zone-f.md §14: 168 = 14 tile rows). */
export const RIBCAGE_H = 14 * TILE_SIZE;

/** Height of the `bg/vault-haze` band (zone-f.md §14: 48 = 4 tile rows). */
export const HAZE_H = 4 * TILE_SIZE;

/**
 * Generates zone F's art: the fourteen v1 sprites always, plus the nine v2 stand-ins of design
 * §14 when the build runs at an art scale ≠ 1 (decision RR-1a).
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's art scale and tile
 *   side (the pipeline passes both; `artScale` 1 or absent draws the v1 set — the cycled membrane
 *   band on the v1 ramp — byte for byte, `tileSize` defaults to the v2 {@link TILE_SIZE}).
 * @returns {SpriteDef[]} {@link VAULT_SPRITES} in that order at art scale 1; the v1 set followed
 *   by {@link VAULT_V2_SPRITES} in theirs at any other scale (the new names all `native`, their
 *   `@flash` siblings derived by the pipeline's flash pass).
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  const v2 = artScale !== 1;
  const flash = { hitFlash: true };
  const sprites = [
    makeSprite(
      'bg/vault-membrane',
      [v2 ? scaleImage(membrane(VAULT_RAMP_V2), artScale) : membrane()],
      'vault',
      {
        anchor: [0, 0],
        native: v2,
      },
    ),
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
  if (!v2) return sprites;
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  return sprites.concat([
    makeSprite('enemies/tissue-cyst', [0, 1, 2, 3].map(cystFrame), 'vault', {
      ...hit,
      animations: { idle: [0, 1], hatch: [2, 3] },
    }),
    makeSprite('enemies/viral-dart', [0, 1, 2, 3].map(dartFrame), 'vault', {
      ...hit,
      animations: { flap: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/regent-plate', [plateFrame()], 'vault', hit),
    makeSprite('bosses/regent-blister', [0, 1, 2, 3].map(blisterFrame), 'vault', {
      ...hit,
      animations: { pulse: [0, 1, 2, 3] },
    }),
    makeSprite('bg/vault-substrate', [substrateBand()], 'vault', { anchor: [0, 0], ...native }),
    makeSprite('bg/vault-ribcage', [ribcageBand()], 'vault', { anchor: [0, 0], ...native }),
    makeSprite('bg/vault-haze', [hazeFrame(0), hazeFrame(1)], 'vault', {
      anchor: [0, 0],
      ...native,
      animations: { drift: [0, 1] },
    }),
    makeSprite('fx/glow-vault-node', [glowNode(0), glowNode(1)], 'vault', {
      anchor: [12, 8],
      ...native,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('tiles/terrain-vault-v2', vaultTilesV2(size), 'vault', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(VAULT_V2_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ]);
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
 * of the `rampHex` colours (v1's {@link VAULT_RAMP} in full, the frozen v2 {@link VAULT_RAMP_V2}
 * as far as the ladder reaches).
 *
 * @param {readonly string[]} [rampHex] - The ramp to paint, default {@link VAULT_RAMP}.
 * @returns {Image} The tile.
 */
function membrane(rampHex = VAULT_RAMP) {
  const w = MEMBRANE_TILE_W;
  const h = MEMBRANE_TILE_H;
  const rng = createAssetRng(seedOf('bg/vault-membrane'));
  const ramp = rampHex.map(color);
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

// ---------------------------------------------------------------------------
// R5-06.S2 — the v2 stand-ins of design docs/v2-run/designs/zone-f.md §14.
// Every colour below sits at Chebyshev distance >= 3 from every reserved
// palette-cycle ramp (bible §4.4); none of these sprites rides a cycle, and
// `bg/vault-substrate` carries no ramp colour at all (design §14). The glow
// tones go through `offRamp` (v2kit), called lazily inside its function — no
// module-level constant may touch the kit (the TDZ law, v2kit §docblock).
// ---------------------------------------------------------------------------

/** The zone F terrain palette (the rock the calcified tile and the studs are drawn in). */
const PAL = TERRAIN_PALETTES['tiles/terrain-vault'];

/** The cyst's body and the live tissue. */
const FLESH = color('#4e7050');
/** The cyst's lit membrane. */
const FLESH_LIT = color('#9cc490');
/** The darkest outline in the v2 set — the cyst rim, tile seams, the dart's needle. */
const FLESH_DARK = color('#16241a');
/** The dark nuclei inside flesh. */
const VESSEL = color('#24362c');
/** The dart's body, the blister's skin (a shipped v1 tone, clean of every ramp). */
const DART_BODY = color('#7fa878');
const BLISTER = color('#56785e');
/** The dart's belly, the hatching glow, the haze lit — the pale bone-green family. */
const BONE_LIT = color('#b8d8b0');
const BONE_PALE = color('#c8e0c8');
const PUS = color('#d8e8b8');
const PUS_CORE = color('#e8f0c8');
/** MANTLE REGENT's armour. */
const PLATE = color('#4e6c5a');
const PLATE_LIT = color('#8ab494');
/** The dart's eye. */
const EYE = color('#ffffff');
/** The dart's needle tip and flame tone (bone family, clean of every ramp). */
const HI_DART = color('#d8e0a0');
/** The `bg/vault-substrate` depth steps, dark to light (design §9's far layer, no ramp colours). */
const SS = [color('#131c16'), color('#1e2a1e'), color('#243426'), color('#2c402c')];
/** Substrate veins and pits. */
const SUB_VEIN = color('#364a32');
const SUB_VEIN_LIT = color('#5c7850');
const SUB_PIT = color('#0e140e');
/** The `bg/vault-ribcage` cartilage family (shipped v1 tones, clean of every ramp). */
const RIB_DARK = color('#1c2c22');
const RIB_MID = color('#2c4238');
const RIB_LIT = color('#56785e');
const RIB_MEM = color('#4a6a54');
/** The `bg/vault-haze` veil. */
const HAZE_PALE = color('#a8d0a8');
const HAZE_SHADE = color('#6a9468');

/**
 * A triangle wave of a whole-pixel period: 0 at `x` = 0, 1 at half the period.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function triangle(x, period) {
  const t = (((x % period) + period) % period) / period;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

/**
 * Paints a filled rectangle, clipped to the image.
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
 * Paints one pixel with the column wrapped into the image (for the seamless bands).
 *
 * @param {Image} img - The image.
 * @param {number} x - The column (any integer).
 * @param {number} y - The row.
 * @param {readonly [number, number, number, number]} rgba - The colour.
 */
function pxw(img, x, y, rgba) {
  if (y < 0 || y >= img.height) return;
  setPixel(img, ((x % img.width) + img.width) % img.width, y, rgba);
}

/**
 * A deterministic small integer: `hash2` of two coordinates and a seed, modulo `n`.
 *
 * @param {number} a - First input.
 * @param {number} b - Second input.
 * @param {number} seed - The sprite's seed.
 * @param {number} n - The modulus.
 * @returns {number} 0 … n − 1.
 */
function pick(a, b, seed, n) {
  return hash2(a, b, seed) % n;
}

/**
 * `enemies/tissue-cyst` (24×18, 4 frames, hittable): the wall cyst of §6 — a flesh dome with a
 * dark rim, seeded nuclei inside and a pale lit shoulder; frames 0–1 breathe (the lower rim
 * settling a pixel), frames 2–3 hatch: a fissure splits the dome and the pus under it lights up
 * as chaser cells push through.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function cystFrame(k) {
  const img = createImage(24, 18);
  const seed = seedOf('enemies/tissue-cyst');
  const sag = k % 2 === 1;
  fillEllipse(img, 11.5, 8.5, 11.5, sag ? 8 : 8.5, (u, v, e) => {
    if (e > 0.88) return FLESH_DARK;
    if (u + v < -0.75) return FLESH_LIT;
    return e > 0.6 ? mix(FLESH, FLESH_LIT, 0.35) : FLESH;
  });
  for (let i = 0; i < 3; i++) {
    px(img, 5 + pick(i, 1, seed, 14), 5 + pick(i, 2, seed, 8), VESSEL);
  }
  if (k >= 2) {
    for (let y = 3; y <= 14; y++) {
      px(img, 11 + (y % 3 === 1 ? 1 : 0), y, FLESH_DARK);
      if (k === 3) px(img, 12, y, y % 4 === 2 ? PUS_CORE : PUS);
      else px(img, 12, y, y % 5 === 2 ? PUS : FLESH);
    }
    px(img, 9, 8, PUS);
    px(img, 15, 10, PUS);
  }
  return img;
}

/**
 * `enemies/viral-dart` (18×12, 4 frames, hittable): the fast runner of §6 facing left — a slim
 * dart body with a needle, a lit eye and a tail fin that flicks up, level and down through the
 * four frames while the spine stripe runs.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function dartFrame(k) {
  const img = createImage(18, 12);
  const wing = [-1, 0, 1, 0][k];
  fillEllipse(img, 7.5, 6, 7, 3.2, (u, v, e) => {
    if (e > 0.82) return FLESH_DARK;
    return v < -0.3 ? DART_BODY : BONE_PALE;
  });
  drawLine(img, 3, 6, 0, 6, FLESH_DARK, 2);
  px(img, 0, 6, HI_DART);
  px(img, 1, 6, DART_BODY);
  px(img, 4, 5, EYE);
  px(img, 5, 5, FLESH_DARK);
  const raised = [[9], [8], [7, 10], [10]][k];
  for (let x = 7; x <= 10; x++) px(img, x, raised.includes(x) ? 5 : 6, VESSEL);
  drawLine(img, 14, 6, 17, 6 + wing, RIB_MEM, 2);
  px(img, 17, 6 + wing, DART_BODY);
  return img;
}

/**
 * `bosses/regent-plate` (30×24, 1 frame, hittable): the mantle-attached armour of §7 — a broad
 * steel-green plate: dark rim, lit crown, four rivets and a central ridge over the flesh line,
 * shaded toward its lower edge.
 *
 * @returns {Image} The frame.
 */
function plateFrame() {
  const img = createImage(30, 24);
  fillEllipse(img, 14.5, 11.5, 14.5, 11.5, (u, v, e) => {
    if (e > 0.9) return FLESH_DARK;
    if (v < -0.55) return e > 0.62 ? mix(PLATE_LIT, FLESH_DARK, 0.3) : PLATE_LIT;
    if (v > 0.6) return mix(PLATE, FLESH_DARK, 0.4);
    return PLATE;
  });
  drawLine(img, 8, 11, 21, 11, mix(PLATE, FLESH_DARK, 0.5));
  drawLine(img, 8, 12, 21, 12, PLATE_LIT);
  for (const [x, y] of [
    [6, 6],
    [23, 6],
    [6, 17],
    [23, 17],
  ]) {
    px(img, x, y, FLESH_DARK);
    px(img, x + 1, y, mix(PLATE, PLATE_LIT, 0.5));
  }
  return img;
}

/**
 * `bosses/regent-blister` (15×12, 4 frames, hittable): the vulnerable blister of §7 — a skin dome
 * on the rim colour with a lit shoulder, its pus core swelling through the four frames (the
 * pulse the shot pattern telegraphs).
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function blisterFrame(k) {
  const img = createImage(15, 12);
  fillEllipse(img, 7, 5.5, 7, 5.5, (u, v, e) => {
    if (e > 0.86) return FLESH_DARK;
    return u + v < -0.6 ? BONE_LIT : BLISTER;
  });
  const r = 1 + k;
  fillEllipse(img, 7.5, 6, r, Math.max(1, Math.floor(r * 0.75)), () => PUS);
  if (k >= 1) px(img, 7, 6, PUS_CORE);
  return img;
}

/**
 * `bg/vault-substrate` (`BAND_TILE_W`×{@link SUBSTRATE_H}, 1 frame, fully opaque): the far depth
 * of §9 — four tissue strata whose boundaries wobble on triangle periods that divide the tile,
 * seeded mottling, a few dark pits and wrapped lit veins; blocky so the page compresses. It
 * carries **no** ramp colour (design §14): every tone sits at Chebyshev distance ≥ 3 from the six
 * of {@link VAULT_RAMP_V2} and from every other reserved ramp.
 *
 * @returns {Image} The band.
 */
function substrateBand() {
  const img = createImage(BAND_TILE_W, SUBSTRATE_H);
  const seed = seedOf('bg/vault-substrate');
  const steps = SS.length;
  const wob = (x) =>
    Math.round(5 * triangle(x, 160) + 3 * triangle(x + 50, 80) + 2 * triangle(x + 13, 40));
  for (let x = 0; x < BAND_TILE_W; x++) {
    const w = wob(x);
    for (let y = 0; y < SUBSTRATE_H; y++) {
      let s = Math.floor((y * steps) / SUBSTRATE_H);
      const b = Math.floor(((s + 1) * SUBSTRATE_H) / steps) + w;
      if (y === b || y === b + 1) s += 1;
      else if (y === b - 1 || y === b - 2) s -= 1;
      const q = pick(Math.floor(x / 4), Math.floor(y / 3), seed, 22);
      if (q === 0) s = Math.min(steps - 1, s + 1);
      else if (q === 11) s = Math.max(0, s - 1);
      setPixel(img, x, y, q === 7 && s > 0 && s < 3 ? SUB_PIT : SS[s]);
    }
  }
  for (let i = 0; i < 10; i++) {
    const cy = 16 + pick(i, 1, seed, SUBSTRATE_H - 32);
    const cx = pick(i, 2, seed, BAND_TILE_W);
    const len = 10 + pick(i, 3, seed, 18);
    const mid = Math.floor(len / 2);
    for (let m = 0; m < len; m++) {
      pxw(img, cx + m, cy, m === mid ? SUB_VEIN_LIT : SUB_VEIN);
      if (m % 3 === 0) pxw(img, cx + m, cy + 1, SUB_VEIN);
    }
  }
  return img;
}

/**
 * `bg/vault-ribcage` (`BAND_TILE_W`×{@link RIBCAGE_H}, 1 frame, green key): the mid layer of §9 —
 * a ceiling membrane across the top of the vault and eight rib arches hanging from it, each
 * tapering to a lit tip at a seeded length. Ribs are painted with the column wrapped, so the one
 * at the tile edge is seamless and the eight at a period of 40 fill the band exactly.
 *
 * @returns {Image} The band.
 */
function ribcageBand() {
  const img = createImage(BAND_TILE_W, RIBCAGE_H);
  const seed = seedOf('bg/vault-ribcage');
  for (let x = 0; x < BAND_TILE_W; x++) {
    if (x % 8 === 4) continue; // pores in the membrane (period divides the tile)
    setPixel(img, x, 0, RIB_DARK);
    setPixel(img, x, 1, RIB_MEM);
    setPixel(img, x, 2, RIB_MEM);
    setPixel(img, x, 3, RIB_DARK);
    setPixel(img, x, 4, RIB_MID);
    setPixel(img, x, 5, RIB_MID);
  }
  for (let i = 0; i < 8; i++) {
    const cx = i * 40;
    const tip = 60 + pick(i, 1, seed, 50);
    for (let y = 6; y <= tip; y++) {
      const w = Math.max(1, Math.floor((tip - y) / 14)) + 1;
      for (let o = -w; o <= w; o++) {
        let c = RIB_MID;
        if (o === -w) c = RIB_LIT;
        else if (o === w) c = RIB_DARK;
        else if (y % 11 === 9 && Math.abs(o) <= w - 2) c = RIB_DARK;
        if (y >= tip - 1 && Math.abs(o) <= 1) c = RIB_LIT;
        pxw(img, cx + o, y, c);
      }
    }
  }
  return img;
}

/**
 * `bg/vault-haze` (`BAND_TILE_W`×{@link HAZE_H}, 2 frames, green key): the fore veil of §9 —
 * sparse tissue haze drifting on seeded lines, a few motes about it; every feature stays clear of
 * the tile edges so the band repeats seamlessly, and the veil sits far below the density that
 * could hide a bullet lane (design §14). Binary alpha.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function hazeFrame(k) {
  const img = createImage(BAND_TILE_W, HAZE_H);
  const seed = seedOf('bg/vault-haze');
  for (let i = 0; i < 9; i++) {
    const y = 4 + pick(i, 1, seed, HAZE_H - 8);
    const x0 = 14 + pick(i, 2, seed, BAND_TILE_W - 34) + k * (2 + pick(i, 5, seed, 3));
    const len = 6 + pick(i, 3, seed, 14);
    const mid = Math.floor(len / 2);
    const lit = pick(i, 4, seed, 3) === 0;
    for (let m = 0; m < len; m++) {
      if (x0 + m > BAND_TILE_W - 14) break;
      px(img, x0 + m, y, lit && m === mid ? HAZE_PALE : HAZE_SHADE);
      if (m % 4 === 0) px(img, x0 + m, y + 1, mix(HAZE_SHADE, RIB_MEM, 0.5));
    }
  }
  for (let j = 0; j < 7; j++) {
    const x = 16 + pick(j, 6, seed, BAND_TILE_W - 32) + k * (3 + pick(j, 8, seed, 3));
    if (x > BAND_TILE_W - 14) continue;
    const y = 2 + pick(j, 7, seed, HAZE_H - 4);
    px(img, x, y, pick(j, 9, seed, 4) === 0 ? HAZE_PALE : RIB_MEM);
  }
  return img;
}

/**
 * `fx/glow-vault-node` (24×16, 2 frames): the additive node glow of §9's decor note — the
 * `decor/glow` recipe on a 3:2 ellipse: a bright core, a body ring and a faint halo; the second
 * frame is the pulse, one step smaller. Soft alpha is the bible §5.8 glow accent (the
 * `decor/glow` precedent's own 204 and 110 tiers); the tones pass `offRamp`, clear of every ramp.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function glowNode(k) {
  const img = createImage(24, 16);
  const cx = 12;
  const cy = 8;
  const core = color(offRamp('#d8e8b8'));
  const edge = color(offRamp('#8cb47c'));
  const r = k === 0 ? 22 : 18;
  const r2 = r * r;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 24; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx * 9 + dy * dy * 16;
      if (d2 > r2) continue;
      if (d2 * 9 < r2 * 2) {
        setPixel(img, x, y, core);
      } else if (d2 * 3 < r2 * 2) {
        setPixel(img, x, y, [edge[0], edge[1], edge[2], 204]);
      } else {
        setPixel(img, x, y, [edge[0], edge[1], edge[2], 110]);
      }
    }
  }
  return img;
}

/**
 * The twenty-three frames of `tiles/terrain-vault-v2`: `terrain-vault`'s whole twenty-tile list
 * first in its order (the base list is off-limits — design §16; P13's prefix law), then the three
 * §10 additions: `tissue-live` (solid, the regenerating chase wall), `calcified` (solid, the bone
 * garden pillar) and `nodule` (the empty wall-studding decor). The frame order is the list this
 * function returns and {@link VAULT_V2_TILE_NAMES} names.
 *
 * @param {number} size - The tile side (`options.tileSize`).
 * @returns {Image[]} The frames, in list order.
 */
function vaultTilesV2(size) {
  const base = renderTerrainTiles(size, 'tiles/terrain-vault');
  const s = size;
  return [...base, tissueLiveTile(s), calcifiedTile(s), noduleTile(s)];
}

/**
 * `tissue-live`: the regenerating wall (§10, mask all-12) — the living tissue in the cyst's flesh
 * with seeded nuclei, a lit top edge, two pale regen veins running across it and a dark base and
 * right edge; fully opaque.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function tissueLiveTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-vault-v2/tissue-live');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(
        img,
        x,
        y,
        pick(Math.floor(x / 3), Math.floor(y / 3), seed, 5) === 0 ? VESSEL : FLESH,
      );
    }
  }
  for (let x = 0; x < s; x++) {
    for (const vy of [2, 7]) {
      if (vy < s && (x + vy) % 4 < 2) px(img, x, vy, FLESH_LIT);
    }
    px(img, x, 0, FLESH_LIT);
  }
  rect(img, 0, s - 1, s - 1, s - 1, FLESH_DARK);
  rect(img, s - 1, 0, s - 1, s - 1, FLESH_DARK);
  return img;
}

/**
 * `calcified`: the garden pillar (§10, mask all-12) — the zone's own rock in 3-px blocks under a
 * two-row bone crust with a dark seam, one calcite crack from the base and a pale fleck or two;
 * fully opaque.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function calcifiedTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-vault-v2/calcified');
  const rock = PAL.rock.map(color);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, rock[pick(Math.floor(x / 3), Math.floor(y / 3), seed, rock.length)]);
    }
  }
  rect(img, 0, 0, s - 1, 0, BONE_PALE);
  rect(img, 0, 1, s - 1, 1, BONE_LIT);
  rect(img, 0, 2, s - 1, 2, FLESH_DARK);
  drawLine(img, Math.floor(s / 2), s - 1, Math.floor(s / 2) + 1, Math.floor(s / 2), FLESH_DARK);
  px(img, 2, Math.floor(s / 2) + 2, BONE_LIT);
  return img;
}

/**
 * `nodule`: the empty decor tile (§10, mask all-0) — a pale-capped blister stud low-centre with
 * a smaller one above it and a dark footing, all on a transparent field.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function noduleTile(s) {
  const img = createImage(s, s);
  fillEllipse(
    img,
    Math.floor(s / 2),
    Math.floor(s * 0.68),
    Math.floor(s / 3),
    Math.floor(s / 4),
    (u, v, e) => {
      if (e > 0.85) return FLESH_DARK;
      return v < -0.4 ? BONE_LIT : BLISTER;
    },
  );
  fillEllipse(img, Math.floor(s / 4), Math.floor(s * 0.42), 2, 2, (_u, _v, e) =>
    e > 0.8 ? FLESH_DARK : BLISTER,
  );
  px(img, Math.floor(s / 2), s - 1, FLESH_DARK);
  px(img, Math.floor(s / 2) - 1, s - 1, FLESH_DARK);
  return img;
}
