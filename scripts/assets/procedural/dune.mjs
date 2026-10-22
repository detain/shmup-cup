/**
 * Zone C, **DUNE EXPANSE** (plan M2-11) — placeholder art of the desert zone (decision D24):
 *
 * - `bg/dune-suns` ({@link SUNS_TILE_W}×{@link SUNS_TILE_H}, the far band): the twin suns — a big
 *   pale one and a small orange one — in a translucent glow; placed with a wide `spacing`, so they
 *   come by only now and then.
 * - `bg/dune-ridge` ({@link RIDGE_TILE_W}×{@link RIDGE_TILE_H}, a mid band): two layers of distant
 *   dune silhouettes, opaque below their ridge lines; the ridge profiles are sums of triangle waves
 *   whose periods divide the tile width, so the band repeats seamlessly.
 * - Enemies (flying ones face left; hit-flash siblings): `enemies/dune-worm` (an armoured sand-worm
 *   segment, 2 frames), `enemies/husk-crawler` (a desert beetle walking on a floor — the renderer
 *   flips it on a ceiling —, legs alternating, 2 frames), `enemies/sand-skimmer` (a low flier, wings
 *   beating, 2 frames), `enemies/dust-devil` (a spinning sand whirl, 3 frames),
 *   `enemies/sand-geyser` (a vent mound on the floor, puffing, 2 frames), `enemies/sand-clod` (the
 *   clod it throws), `enemies/widow-drone` (a spider drone, legs scuttling, 2 frames).
 * - SANDGRAVE WIDOW (SW-03), the arachnid: `bosses/widow-body` (the abdomen with its red hourglass),
 *   `bosses/widow-head` (four eyes glowing, 2 frames — the weak point), `bosses/widow-fang` (a bone
 *   fang), `bosses/widow-leg-top` / `-bottom` (jointed legs, decoration), `bosses/widow-spinneret`
 *   (a silk gland, 2 frames).
 *
 * Kept low in saturation next to the bullets and capsules (shmup_feat.md §12, §18); the only red is
 * the hourglass and the eyes. Geometry uses only `+ - * /` and `Math.sqrt`, randomness `hash2`
 * seeded from the sprite names, so the pixels are identical on every engine.
 *
 * **Since R5-03.S2 this generator also draws zone C's v2 stand-ins** (design
 * `docs/v2-run/designs/zone-c.md` §14 and §10): the two new enemies, the DUNE SCORPION's four
 * parts, the widow's egg-sac, the three `bg/dune-*` bands of §9 and the first v2 tileset sprite
 * `tiles/terrain-dune-v2` — {@link DUNE_V2_SPRITES}. They appear **only on the
 * `(options.artScale ?? 1) !== 1` path** and every one is `native` (decision RR-1a), so the
 * scale-1 build returns exactly the fifteen v1 sprites above, byte for byte, and the v2 names are
 * simply absent there. The bands are seamless tiles at a half-`FRAME_W` period like zone A's
 * (`bg/azure-horizon`); `bg/dune-blaze` is flat-painted in the frozen DUNE palette-cycle ramp
 * itself (R5-P.P7 wrote it into `content/stages/zone-c.stage.json`'s `cycles` — the art the §9
 * stack will cycle), every other new colour at Chebyshev distance ≥ 3 from every reserved ramp
 * (bible §4.4, asserted by `test/scripts/assets/procedural-zone-c.test.ts`).
 *
 * **Public API.** {@link generate}, {@link DUNE_SPRITES}, {@link SUNS_TILE_W} /
 * {@link SUNS_TILE_H}, {@link RIDGE_TILE_W} / {@link RIDGE_TILE_H} (the bands' tile sizes), and —
 * since R5-03.S2 — {@link DUNE_V2_SPRITES}, {@link DUNE_V2_TILE_NAMES}, {@link DUNE_RAMP_V2},
 * {@link BAND_TILE_W}, {@link SKY_H}, {@link BLAZE_H}, {@link GRASS_H}.
 *
 * @module
 */
import { createImage, flipVertical, getPixel, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import {
  SOFT_ALPHA,
  color,
  drawLine,
  fillEllipse,
  makeSprite,
  mix,
  seedOf,
  withAlpha,
} from './common.mjs';
import { renderTerrainTiles, TERRAIN_PALETTES, TERRAIN_TILES, TILE_SIZE } from './terrain.mjs';
import { FRAME_W, PLAYFIELD_H } from '../v2kit.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/dune-suns` tile. */
export const SUNS_TILE_W = 72;

/** Height of the `bg/dune-suns` tile. */
export const SUNS_TILE_H = 40;

/** Width of the `bg/dune-ridge` tile (its parallax `spacing`). */
export const RIDGE_TILE_W = 128;

/** Height of the `bg/dune-ridge` tile. */
export const RIDGE_TILE_H = 40;

/** The sprites this generator draws, in order. */
export const DUNE_SPRITES = Object.freeze([
  'bg/dune-suns',
  'bg/dune-ridge',
  'enemies/dune-worm',
  'enemies/husk-crawler',
  'enemies/sand-skimmer',
  'enemies/dust-devil',
  'enemies/sand-geyser',
  'enemies/sand-clod',
  'enemies/widow-drone',
  'bosses/widow-body',
  'bosses/widow-head',
  'bosses/widow-fang',
  'bosses/widow-leg-top',
  'bosses/widow-leg-bottom',
  'bosses/widow-spinneret',
]);

/**
 * The frozen DUNE palette-cycle ramp (R5-P.P7 paired it with `content/stages/zone-c.stage.json`'s
 * `cycles` colours — bible §4.4). `bg/dune-blaze` is painted in exactly these; the zone lane's
 * §9 stack cycles them over it.
 */
export const DUNE_RAMP_V2 = Object.freeze(['#6b4a2a', '#7d5630', '#8f6438', '#a17442']);

/**
 * Tile width of the three `bg/dune-sky` / `-blaze` / `-grass` bands: half the frame, derived from
 * `FRAME_W` — the {@link ../procedural/azure.mjs|zone-A} precedent (design §14 asks full-frame
 * bands; an atlas frame cannot exceed the 512-page scenario of
 * `test/scripts/assets/pipeline-edge.test.ts`, and every shipped band here is a seamless
 * repeating tile, so these are, at a period that fills the frame exactly twice).
 */
export const BAND_TILE_W = FRAME_W / 2;

/** Height of the `bg/dune-sky` band (zone-c.md §14: a full-frame sky plus the dune foot). */
export const SKY_H = PLAYFIELD_H + 84;

/** Height of the `bg/dune-blaze` band (zone-c.md §14). */
export const BLAZE_H = 60;

/** Height of the `bg/dune-grass` band (zone-c.md §14). */
export const GRASS_H = 96;

/** The v2 stand-in names {@link generate} adds at an art scale ≠ 1, in its output order (§14). */
export const DUNE_V2_SPRITES = Object.freeze([
  'enemies/spine-burrower',
  'enemies/dune-lance',
  'bosses/scorpion-shell',
  'bosses/scorpion-claw',
  'bosses/scorpion-tail',
  'bosses/widow-egg-sac',
  'bg/dune-sky',
  'bg/dune-blaze',
  'bg/dune-grass',
  'tiles/terrain-dune-v2',
]);

/** The ten §10 variant tiles after `terrain-dune`'s twenty, in list order. */
export const DUNE_V2_TILES = /** @type {const} */ ([
  'solid-2',
  'solid-3',
  'floor-2',
  'floor-3',
  'ceiling-2',
  'corner-outer-left',
  'corner-outer-right',
  'corner-inner-left',
  'corner-inner-right',
  'ceil-corner-outer',
  'ceil-corner-inner',
  'brick-crack',
  'brick-crack-2',
  'decor-tuft',
  'decor-bone',
  'decor-glass',
]);

/** The tile names of `tiles/terrain-dune-v2`: `terrain-dune`'s list verbatim, then the variants. */
export const DUNE_V2_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...DUNE_V2_TILES]);

/**
 * Generates zone C's art: the fifteen v1 sprites always, plus the ten v2 stand-ins of design
 * §14 when the build runs at an art scale ≠ 1 (decision RR-1a).
 *
 * @param {{ tileSize?: number, artScale?: number }} [options] - The build's art scale and tile
 *   side (the pipeline passes both; `artScale` 1 or absent draws the v1 set only, `tileSize`
 *   defaults to the v2 {@link TILE_SIZE}).
 * @returns {SpriteDef[]} {@link DUNE_SPRITES} in that order at art scale 1; the v1 set followed
 *   by {@link DUNE_V2_SPRITES} in theirs at any other scale (the new names all `native`, their
 *   `@flash` siblings derived by the pipeline's flash pass).
 */
export function generate(options = {}) {
  const flash = { hitFlash: true };
  const leg = legFrame();
  const sprites = [
    makeSprite('bg/dune-suns', [suns()], 'dune', { anchor: [0, 0] }),
    makeSprite('bg/dune-ridge', [ridge()], 'dune', { anchor: [0, 0] }),
    makeSprite('enemies/dune-worm', [wormFrame(0), wormFrame(1)], 'dune', {
      hitFlash: true,
      animations: { writhe: [0, 1] },
    }),
    makeSprite('enemies/husk-crawler', [crawlerFrame(0), crawlerFrame(1)], 'dune', {
      hitFlash: true,
      animations: { walk: [0, 1] },
    }),
    makeSprite('enemies/sand-skimmer', [skimmerFrame(-1), skimmerFrame(1)], 'dune', {
      hitFlash: true,
      animations: { fly: [0, 1] },
    }),
    makeSprite('enemies/dust-devil', [0, 1, 2].map(devilFrame), 'dune', {
      hitFlash: true,
      animations: { spin: [0, 1, 2] },
    }),
    makeSprite('enemies/sand-geyser', [geyserFrame(false), geyserFrame(true)], 'dune', {
      hitFlash: true,
      animations: { puff: [0, 1] },
    }),
    makeSprite('enemies/sand-clod', [clodFrame()], 'dune', flash),
    makeSprite('enemies/widow-drone', [droneFrame(0), droneFrame(1)], 'dune', {
      hitFlash: true,
      animations: { scuttle: [0, 1] },
    }),
    makeSprite('bosses/widow-body', [bodyFrame()], 'dune', flash),
    makeSprite('bosses/widow-head', [headFrame('#f06030'), headFrame('#a03018')], 'dune', {
      hitFlash: true,
      animations: { glare: [0, 1] },
    }),
    makeSprite('bosses/widow-fang', [fangFrame()], 'dune', flash),
    makeSprite('bosses/widow-leg-top', [leg], 'dune'),
    makeSprite('bosses/widow-leg-bottom', [flipVertical(leg)], 'dune'),
    makeSprite('bosses/widow-spinneret', [glandFrame(0), glandFrame(1)], 'dune', {
      hitFlash: true,
      animations: { pulse: [0, 1] },
    }),
  ];
  const artScale = options.artScale ?? 1;
  if (artScale === 1) return sprites;
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  return sprites.concat([
    makeSprite('enemies/spine-burrower', [0, 1, 2, 3].map(burrowerFrame), 'dune', {
      ...hit,
      animations: { idle: [0, 1], fire: [2, 3] },
    }),
    makeSprite('enemies/dune-lance', [0, 1, 2, 3].map(lanceFrame), 'dune', {
      ...hit,
      animations: { flap: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/scorpion-shell', [shellFrame(0), shellFrame(1)], 'dune', {
      ...hit,
      animations: { turn: [0, 1] },
    }),
    makeSprite('bosses/scorpion-claw', [clawFrame(0), clawFrame(1)], 'dune', {
      ...hit,
      animations: { snap: [0, 1] },
    }),
    makeSprite('bosses/scorpion-tail', [tailFrame()], 'dune', native),
    makeSprite('bosses/widow-egg-sac', [eggSacFrame()], 'dune', native),
    makeSprite('bg/dune-sky', [skyBand()], 'dune', { anchor: [0, 0], ...native }),
    makeSprite('bg/dune-blaze', [blazeBand()], 'dune', { anchor: [0, 0], ...native }),
    makeSprite('bg/dune-grass', [grassBand()], 'dune', { anchor: [0, 0], ...native }),
    makeSprite('tiles/terrain-dune-v2', duneTilesV2(size), 'dune', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(DUNE_V2_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ]);
}

/**
 * The twin suns: a big pale sun and a small orange one lower right, each in a translucent glow.
 *
 * @returns {Image} The tile.
 */
function suns() {
  const image = createImage(SUNS_TILE_W, SUNS_TILE_H);
  const glow = color('#f8c880');
  const big = color('#fce8b8');
  const small = color('#f89858');
  fillEllipse(image, 24, 18, 17, 17, (_u, _v, e) =>
    e > 0.6 ? withAlpha(glow, Math.round(90 * (1 - e) * 2.5)) : big,
  );
  fillEllipse(image, 54, 28, 9, 9, (_u, _v, e) =>
    e > 0.55 ? withAlpha(small, Math.round(80 * (1 - e) * 2.2)) : small,
  );
  return image;
}

/**
 * A triangle wave of a whole-pixel period: 0 at `x` = 0, 1 at half the period.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function triangle(x, period) {
  const t = (x % period) / period;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

/**
 * The ridge band: a far ridge (dark) and a near ridge (lighter), each opaque below its profile —
 * sums of triangle waves with periods 128, 64 and 32 (they divide the tile width).
 *
 * @returns {Image} The tile.
 */
function ridge() {
  const w = RIDGE_TILE_W;
  const h = RIDGE_TILE_H;
  const far = color('#4a3024');
  const near = color('#6a4430');
  const crest = color('#8a5e3c');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const farTop = Math.round(6 + 10 * triangle(x + 20, 128) + 4 * triangle(x, 32));
    const nearTop = Math.round(18 + 8 * triangle(x + 70, 64) + 3 * triangle(x + 9, 32));
    for (let y = farTop; y < h; y++) setPixel(image, x, y, far);
    for (let y = nearTop; y < h; y++) setPixel(image, x, y, y === nearTop ? crest : near);
  }
  return image;
}

/**
 * A sand-worm segment: an armoured ring (sand chitin, a dark band round its middle, a lit top,
 * spikes on the rim); frame 1 turns the band a pixel.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function wormFrame(frame) {
  const size = 16;
  const c = (size - 1) / 2;
  const rim = color('#3a2410');
  const chitin = color('#c08a4a');
  const lit = color('#e8c080');
  const band = color('#6a4020');
  const image = createImage(size, size);
  for (let k = 0; k < 8; k += 2) {
    const [dx, dy] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][k / 2];
    drawLine(image, c + dx * 5, c + dy * 5, c + dx * 7.5, c + dy * 7.5, rim);
  }
  fillEllipse(image, c, c, 6.4, 6.4, (u, v, e) => {
    if (e > 0.82) return rim;
    if (Math.abs(u * 0.4 + v - frame * 0.15) < 0.18) return band;
    return u + v < -0.7 ? lit : chitin;
  });
  return image;
}

/**
 * The husk crawler: a dark desert beetle standing on a floor — a domed shell with a lit ridge, a
 * small head on the left, three legs a side that alternate between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function crawlerFrame(frame) {
  const w = 16;
  const h = 10;
  const leg = color('#2a1c10');
  const shell = color('#4a3624');
  const ridgeTone = color('#b08a58');
  const eye = color('#f0c040');
  const image = createImage(w, h);
  for (let k = 0; k < 3; k++) {
    const x = 4 + k * 4;
    const step = (k + frame) % 2 === 0 ? -1 : 1;
    drawLine(image, x, 6, x + step, 9, leg);
  }
  fillEllipse(image, 8.5, 6, 6.5, 5, (u, v) => {
    if (v > 0.2) return null;
    return Math.abs(u) < 0.12 || v < -0.8 ? ridgeTone : shell;
  });
  fillEllipse(image, 2, 5, 2, 1.8, () => shell);
  setPixel(image, 1, 4, eye);
  return image;
}

/**
 * The sand skimmer: a small flier facing left — a dark body, sand-coloured wings up (`wing` −1)
 * or down (+1).
 *
 * @param {number} wing - −1 or 1.
 * @returns {Image} The frame.
 */
function skimmerFrame(wing) {
  const w = 14;
  const h = 8;
  const body = color('#5a3a20');
  const wingTone = color('#d8a860');
  const eye = color('#f0d070');
  const image = createImage(w, h);
  drawLine(image, 5, 4, 10, 4 + 3 * wing, wingTone, 2);
  fillEllipse(image, 6, 4, 6, 2, () => body);
  drawLine(image, 11, 4, 13, 3, body);
  setPixel(image, 1, 3, eye);
  return image;
}

/**
 * The dust devil: a funnel of sand, wide at the top, with bright streaks that climb a row further
 * in every frame (three frames loop the spin).
 *
 * @param {number} frame - 0, 1 or 2.
 * @returns {Image} The frame.
 */
function devilFrame(frame) {
  const w = 14;
  const h = 20;
  const dust = color('#a07840');
  const streak = color('#e0c088');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    const half = 1.5 + ((h - 1 - y) * 5) / (h - 1);
    const x0 = Math.round(6.5 - half);
    const x1 = Math.round(6.5 + half);
    for (let x = x0; x <= x1; x++) {
      const bright = (y + frame + Math.floor((x - x0) / 2)) % 3 === 0;
      setPixel(image, x, y, withAlpha(bright ? streak : dust, x === x0 || x === x1 ? 150 : 230));
    }
  }
  return image;
}

/**
 * The sand geyser: a mound with a dark vent on top; frame 1 adds a puff of sand over the vent.
 *
 * @param {boolean} puff - Frame 1.
 * @returns {Image} The frame.
 */
function geyserFrame(puff) {
  const w = 20;
  const h = 10;
  const mound = color('#9a6e3a');
  const lit = color('#c8a060');
  const vent = color('#3a2210');
  const cloud = color('#e8d0a0');
  const image = createImage(w, h);
  fillEllipse(image, 9.5, 10, 9.5, 7, (u, v) => (u + v < -0.9 ? lit : mound));
  fillEllipse(image, 9.5, 4, 2.5, 1.2, () => vent);
  if (puff) fillEllipse(image, 9.5, 1.5, 3.5, 1.5, () => withAlpha(cloud, SOFT_ALPHA));
  return image;
}

/**
 * A sand clod: a small lump with a lit corner.
 *
 * @returns {Image} The frame.
 */
function clodFrame() {
  const image = createImage(6, 6);
  const clod = color('#b08040');
  const lit = color('#e0b870');
  const rim = color('#4a3018');
  fillEllipse(image, 2.5, 2.5, 2.8, 2.8, (u, v, e) => (e > 0.8 ? rim : u + v < -0.6 ? lit : clod));
  return image;
}

/**
 * The spider drone: a dark round body with two red eyes on the left and four legs a side that
 * scuttle between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function droneFrame(frame) {
  const w = 12;
  const h = 9;
  const body = color('#2a2018');
  const leg = color('#8a7050');
  const eye = color('#f04030');
  const image = createImage(w, h);
  for (let k = 0; k < 4; k++) {
    const x = 3 + k * 2;
    const reach = (k + frame) % 2 === 0 ? 1 : 0;
    drawLine(image, x, 4, x + reach, 0, leg);
    drawLine(image, x, 4, x + 1 - reach, 8, leg);
  }
  fillEllipse(image, 6, 4, 4, 3, () => body);
  setPixel(image, 2, 3, eye);
  setPixel(image, 2, 5, eye);
  return image;
}

/**
 * The widow's abdomen: a big chitin oval (dark rim, lit top, seeded speckles) with the red
 * hourglass on its back.
 *
 * @returns {Image} The frame.
 */
function bodyFrame() {
  const w = 52;
  const h = 40;
  const seed = seedOf('bosses/widow-body');
  const rim = color('#1a1008');
  const chitin = color('#4a3422');
  const lit = color('#7a5a3a');
  const speck = color('#6a4c30');
  const hourglass = color('#c83020');
  const image = createImage(w, h);
  fillEllipse(image, 25.5, 19.5, 25.5, 19.5, (u, v, e, x, y) => {
    if (e > 0.9) return rim;
    // The hourglass: two triangles meeting at the middle of the back (a bow tie).
    const au = Math.abs(u - 0.1);
    if (au < 0.32 && Math.abs(v) < au * 1.4) return hourglass;
    if (v < -0.7) return lit;
    return hash2(x, y, seed) % 9 === 0 ? speck : chitin;
  });
  return image;
}

/**
 * The widow's head: a dark round head with four eyes (`eyeTone` — lit / dim) looking left.
 *
 * @param {string} eyeTone - The eyes' colour.
 * @returns {Image} The frame.
 */
function headFrame(eyeTone) {
  const w = 18;
  const h = 16;
  const rim = color('#140c06');
  const head = color('#3a2818');
  const lit = color('#6a4a2c');
  const eye = color(eyeTone);
  const image = createImage(w, h);
  fillEllipse(image, 8.5, 7.5, 8.5, 7.5, (u, v, e) => (e > 0.86 ? rim : u + v < -0.8 ? lit : head));
  for (const [x, y] of [
    [4, 5],
    [4, 10],
    [7, 4],
    [7, 11],
  ]) {
    setPixel(image, x, y, eye);
    setPixel(image, x + 1, y, eye);
  }
  return image;
}

/**
 * A fang: a curved bone tooth pointing left from a dark root.
 *
 * @returns {Image} The frame.
 */
function fangFrame() {
  const w = 10;
  const h = 12;
  const root = color('#2a1c10');
  const bone = color('#e0d8c0');
  const shade = color('#a89c80');
  const image = createImage(w, h);
  fillEllipse(image, 7, 6, 3, 5.5, () => root);
  drawLine(image, 7, 3, 2, 6, bone, 2);
  drawLine(image, 2, 6, 1, 9, shade, 1);
  drawLine(image, 7, 8, 4, 7, shade, 1);
  return image;
}

/**
 * An upper leg: two segments from the body (bottom right) up to a knee and down-left to a claw.
 * The lower leg is its vertical mirror.
 *
 * @returns {Image} The frame.
 */
function legFrame() {
  const w = 30;
  const h = 14;
  const leg = color('#2a1c10');
  const joint = color('#7a5a3a');
  const image = createImage(w, h);
  drawLine(image, 28, 13, 16, 2, leg, 2);
  drawLine(image, 16, 2, 2, 11, leg, 2);
  setPixel(image, 16, 2, joint);
  setPixel(image, 17, 2, joint);
  setPixel(image, 1, 12, joint);
  return image;
}

/**
 * A spinneret: a pale round silk gland with a glowing tip (brighter in frame 1).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function glandFrame(frame) {
  const size = 12;
  const rim = color('#3a3020');
  const gland = color('#c8bca0');
  const lit = color('#f0e8d8');
  const tip = mix(color('#c8bca0'), color('#ffffff'), frame === 0 ? 0.4 : 1);
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.5, 5.5, (u, v, e) => {
    if (e > 0.82) return rim;
    if (u < -0.45 && Math.abs(v) < 0.3) return tip;
    return u + v < -0.6 ? lit : gland;
  });
  return image;
}

// ─────────────────────────────────── v2 stand-ins (R5-03.S2, zone-c.md §14 / §10 / §9) ──────

/**
 * Zone C's v2 rock and chitin family — `tiles/terrain-dune`'s palette (the design's "dune
 * stone") read from `terrain.mjs` so the new art sits on the old terrain with one source of
 * truth, plus the v1 `dune.mjs` chitin family for the creatures and the brick literals of the
 * base set's `brick` tile for the crack variants.
 */
const PAL = TERRAIN_PALETTES['tiles/terrain-dune'];
const SUR = color(PAL.surface);
const SUBS = color(PAL.subsurface);
const RK = PAL.rock.map(color);
const DSAND = color('#4a2e18');
const GRIM = color('#5a4020');
const CHR = color('#c08a4a');
const CHR_LIT = color('#e8c080');
const CHR_DK = color('#6a4020');
const DEEP = color('#1a1008');
const SUN_CORE = color('#fce8b8');
const SUN_GLOW = color('#f8c880');
const SUN_SMALL = color('#f89858');
const CLOUD_PALE = color('#d8c0b0');
const OLIVE = color('#6a7a3a');
const OLIVE_HI = color('#8a9a50');
const OLIVE_DK = color('#4a5a28');
const BONE = color('#f0e8d8');
const BONE_SH = color('#a89c80');
const GLASS = color('#d8e8e0');
const GLASS_HI = color('#f0f8f0');
const GLASS_ED = color('#a8c8b8');
const BRICK_MORTAR = color('#5a3424');
const BRICK_CRACK = color('#7e4a32');

/** The dusk steps of `bg/dune-sky`, top of the frame to its foot (design §9's dusk gradient). */
const SKY_STEPS = [
  color('#1c1a38'),
  color('#332a55'),
  color('#55406e'),
  color('#7a5a80'),
  color('#a87a82'),
  color('#c99a7a'),
  color('#dcb888'),
  color('#e8cc9e'),
];

/** The four ramp colours of {@link DUNE_RAMP_V2} as paint. */
const RAMP = DUNE_RAMP_V2.map(color);

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
 * `enemies/spine-burrower` (21×21, 4 frames, hittable): the floor turret of the design — a low
 * sandstone mound on a full bottom row (the ground anchor) with a dark spine-barrel angled up
 * left. Frames 0–1 idle (the vent dark / lit), frames 2–3 fire (a sun-pale muzzle flash at the
 * tip, the second frame a wider burst).
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function burrowerFrame(k) {
  const img = createImage(21, 21);
  const seed = seedOf('enemies/spine-burrower');
  fillEllipse(img, 10, 15.5, 10.5, 6, (u, v, e, x, y) => {
    if (e > 0.88) return DEEP;
    if (v < -0.45 && Math.abs(u) < 0.75) return SUBS;
    return pick(x, y, seed, 6) === 0 ? RK[2] : RK[0];
  });
  rect(img, 0, 19, 20, 20, DEEP); // full bottom rows: the floor anchor
  rect(img, 0, 19, 20, 19, DSAND);
  for (let d = 0; d <= 11; d++) {
    const bx = 10 - Math.floor((d * 5) / 11);
    const by = 14 - d;
    px(img, bx, by, RK[1]);
    px(img, bx + 1, by, RK[0]);
    px(img, bx, by - 1, SUBS);
  }
  px(img, 4, 2, k < 2 ? DEEP : SUN_GLOW); // the muzzle
  if (k === 1) px(img, 9, 13, SUBS); // idle 1: a lit scale over the barrel base
  if (k >= 2) {
    px(img, 3, 1, SUN_CORE);
    px(img, 5, 1, SUN_CORE);
    px(img, 2, 2, SUN_GLOW);
    if (k === 3) {
      px(img, 4, 0, SUN_CORE);
      px(img, 1, 1, SUN_GLOW);
      px(img, 6, 0, SUN_GLOW);
    }
  }
  return img;
}

/**
 * `enemies/dune-lance` (30×15, 4 frames, hittable): the rear-attacker flier, facing left like
 * every flying sprite of the zone — a dark dart body with a lit head wedge, one swept sand
 * wing in four beat phases, twin tail streamers.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function lanceFrame(k) {
  const img = createImage(30, 15);
  const body = color('#5a3a20');
  const wing = color('#d8a860');
  const eye = color('#f0d070');
  const tipY = [1, 4, 10, 7][k]; // down on the third beat, level again on the fourth
  for (let x = 4; x <= 24; x++) {
    const h = x < 14 ? 3 - Math.floor((x - 4) / 5) : 1 + Math.floor((24 - x) / 6);
    for (let y = 6 - h; y <= 6 + h; y++) px(img, x, y, body);
  }
  for (let x = 0; x <= 4; x++) {
    const w = x; // the head wedge, left
    for (let y = 4 - w; y <= 8 + w; y++) px(img, x, y, y < 5 ? CHR_LIT : body);
  }
  for (let d = 0; d <= 5; d++) {
    const wx = 13 + d;
    const wy = Math.round(7 + ((tipY - 7) * (d + 1)) / 6);
    px(img, wx, wy, wing);
    px(img, wx, wy + (tipY < 7 ? -1 : 1), CHR_DK);
  }
  px(img, 1, 5, eye);
  for (let t = 0; t < 2; t++) {
    for (let d = 0; d <= 4; d++) px(img, 25 + d, 7 - t * 2 + (d > 2 ? 1 : 0), CHR_DK);
  }
  return img;
}

/**
 * `bosses/scorpion-shell` (45×36, 2 frames, hittable): the mid-boss's carapace — a chitin dome
 * with a dark rim, plate seams down the back and a lit top-left; frame 1 the damaged look
 * (bible §5.7: intact + damage states, the `@flash` derived).
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function shellFrame(k) {
  const img = createImage(45, 36);
  const seed = seedOf('bosses/scorpion-shell');
  fillEllipse(img, 22, 18, 22.5, 18, (u, v, e, x, y) => {
    if (e > 0.93) return DEEP;
    if (k === 1 && e > 0.8 && pick(x, y, seed, 3) === 0) return CHR_DK; // chipped rim
    if (u + v < -1.0) return CHR_LIT;
    if ((x + Math.floor(y / 3) * 3) % 9 === 4 && e < 0.78) return CHR_DK;
    if (k === 1 && (x - y * 2) % 13 === 5) return DEEP;
    return CHR;
  });
  if (k === 1) {
    for (let d = 0; d < 9; d++) px(img, 14 + d, 8 + Math.floor(d / 2), DEEP);
    px(img, 24, 12, DSAND);
  }
  return img;
}

/**
 * `bosses/scorpion-claw` (27×18, 2 frames, hittable): the scorpion's pedipalp facing left — a
 * tapered arm from the right edge and two jaws, open (frame 0) or snapped shut (frame 1), with
 * a lit back edge and tooth notches.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function clawFrame(k) {
  const img = createImage(27, 18);
  for (let x = 12; x <= 26; x++) {
    const h = x > 20 ? 3 : 2;
    for (let y = 8 - h; y <= 8 + h; y++) {
      px(img, x, y, y === 8 - h ? CHR_LIT : y === 8 + h ? CHR_DK : CHR);
    }
  }
  const gap = k === 0 ? 4 : 1;
  for (let d = 0; d <= 10; d++) {
    const x = 13 - d;
    px(img, x, Math.round(6 - (gap * d) / 10), CHR);
    px(img, x, Math.round(6 - (gap * d) / 10) - 1, CHR_LIT);
    px(img, x, Math.round(11 + (gap * d) / 10), CHR);
    px(img, x, Math.round(11 + (gap * d) / 10) + 1, CHR_DK);
  }
  px(img, 3, Math.round(6 - gap), DEEP);
  px(img, 3, Math.round(11 + gap), DEEP);
  px(img, 6, Math.round(6 - (gap * 7) / 10) - 1, DEEP); // a tooth
  return img;
}

/**
 * `bosses/scorpion-tail` (45×21, 1 frame, decoration): the jointed tail — six segments rising
 * from the shell side to the barbed stinger at the left tip, each segment lit on top.
 *
 * @returns {Image} The frame.
 */
function tailFrame() {
  const img = createImage(45, 21);
  for (let j = 0; j < 6; j++) {
    const cx = 8 + j * 7;
    const cy = 17 - Math.round(j * 2.4);
    const r = 3.5 - j * 0.15;
    fillEllipse(img, cx, cy, r, r, (u, v, e) => {
      if (e > 0.85) return DEEP;
      return v < -0.3 ? CHR_LIT : j % 2 === 0 ? CHR : CHR_DK;
    });
  }
  for (let d = 0; d <= 5; d++) px(img, 7 - d, 17 - d, DEEP); // the stinger shaft
  px(img, 2, 12, CHR_LIT);
  px(img, 1, 13, DEEP);
  return img;
}

/**
 * `bosses/widow-egg-sac` (36×27, 1 frame, decoration): the rebuilt widow's egg sac — a pale
 * silk gland like her spinneret's family, three rows of beads and a lit crown.
 *
 * @returns {Image} The frame.
 */
function eggSacFrame() {
  const img = createImage(36, 27);
  const seed = seedOf('bosses/widow-egg-sac');
  const gland = color('#c8bca0');
  const rim = color('#3a3020');
  const lit = color('#f0e8d8');
  fillEllipse(img, 18, 13.5, 17.5, 13, (u, v, e, x, y) => {
    if (e > 0.92) return rim;
    if (v < -0.5 && Math.abs(u) < 0.6) return lit;
    return pick(x, y, seed, 7) === 0 ? mix(gland, lit, 0.5) : gland;
  });
  for (let i = 0; i < 3; i++) {
    for (let x = 6 + i * 2; x <= 29 - i * 2; x += 5) {
      px(img, x, 9 + i * 5, mix(gland, rim, 0.5));
    }
  }
  return img;
}

/**
 * Lays a fixed sun into the sky: an opaque core with quantised mix rings into whatever
 * gradient step sits under it (`bg/dune-sky` has no alpha at all — the opaque far band of §9).
 *
 * @param {Image} img - The band.
 * @param {number} cx - Sun centre column.
 * @param {number} cy - Sun centre row.
 * @param {number} r - Core radius.
 * @param {readonly [number, number, number, number]} sun - The sun colour.
 */
function sunInto(img, cx, cy, r, sun) {
  for (let y = cy - r - 8; y <= cy + r + 8; y++) {
    for (let x = cx - r - 8; x <= cx + r + 8; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const local = getPixel(img, x, y);
      if (d <= r - 2) px(img, x, y, sun === SUN_SMALL ? SUN_SMALL : SUN_CORE);
      else if (d <= r) px(img, x, y, mix(sun, local, 0.65));
      else if (d <= r + 4) px(img, x, y, mix(sun, local, 0.32));
      else if (d <= r + 8) px(img, x, y, mix(sun, local, 0.12));
    }
  }
}

/**
 * `bg/dune-sky` (`BAND_TILE_W`×{@link SKY_H}, 1 frame): the opaque dusk sky of §9 — eight
 * gradient steps with sparse one-row dither, the twin suns fixed in it (the far band needs no
 * horizontal interest beyond a few thin cloud dashes, all drawn with the period wrapped).
 *
 * @returns {Image} The band.
 */
function skyBand() {
  const img = createImage(BAND_TILE_W, SKY_H);
  const seed = seedOf('bg/dune-sky');
  for (let y = 0; y < SKY_H; y++) {
    const b = Math.floor((y * SKY_STEPS.length) / SKY_H);
    for (let x = 0; x < BAND_TILE_W; x++) {
      const d = pick(x, y, seed, 17);
      const s = d === 0 ? Math.min(SKY_STEPS.length - 1, b + 1) : d === 9 ? Math.max(0, b - 1) : b;
      setPixel(img, x, y, SKY_STEPS[s]);
    }
  }
  sunInto(img, 96, 140, 26, SUN_GLOW);
  sunInto(img, 230, 186, 12, SUN_SMALL);
  for (let s = 0; s < 5; s++) {
    const cy = 52 + pick(s, 11, seed, Math.round(SKY_H / 3));
    const cx = pick(s, 12, seed, BAND_TILE_W);
    const len = 26 + pick(s, 13, seed, 40);
    const pale = mix(CLOUD_PALE, SKY_STEPS[Math.floor((cy * SKY_STEPS.length) / SKY_H)], 0.5);
    for (const off of [-BAND_TILE_W, 0, BAND_TILE_W]) {
      for (let k = 0; k < len; k++) {
        pxw(img, cx + k + off, cy, pale);
        pxw(img, cx + k + off, cy + 1, mix(pale, SKY_STEPS[4], 0.5));
      }
    }
  }
  return img;
}

/**
 * `bg/dune-blaze` (`BAND_TILE_W`×{@link BLAZE_H}, 1 frame): the flat-painted heat band that
 * rides the dune line — painted in **exactly** the four {@link DUNE_RAMP_V2} colours with binary
 * alpha (R5-P.P7 froze the ramp into the stage; zone-c.md §9's rule-1 contract: flat so the
 * cycle finds only exact ramp colours in it). A triangle-wave crest (periods that divide the
 * tile width, so it is seamless) with banded colour steps below.
 *
 * @returns {Image} The band.
 */
function blazeBand() {
  const img = createImage(BAND_TILE_W, BLAZE_H);
  const seed = seedOf('bg/dune-blaze');
  for (let x = 0; x < BAND_TILE_W; x++) {
    const crest =
      6 + Math.round(8 * triangle(x, 16) + 8 * triangle(x, 40) + 4 * triangle(x + 20, 80));
    for (let y = crest; y < BLAZE_H; y++) {
      const d = y - crest;
      let c = RAMP[0];
      if (d < 2) c = RAMP[3];
      else if (d < 5) c = RAMP[2];
      else {
        const h = pick(x, Math.floor(y / 2), seed, 6);
        if (h === 0) c = RAMP[1];
        else if (y % 3 === 0 && h === 1) c = RAMP[2];
      }
      setPixel(img, x, y, c);
    }
  }
  return img;
}

/**
 * `bg/dune-grass` (`BAND_TILE_W`×{@link GRASS_H}, 1 frame): the near band of §9, green-keyed —
 * transparent above a triangle-wave ground line, dark sandstone body with a lit rim below,
 * sparse wind ripples and dry-olive grass blades leaning on seeded angles (all periodic or
 * wrapped, so the band repeats seamlessly).
 *
 * @returns {Image} The band.
 */
function grassBand() {
  const img = createImage(BAND_TILE_W, GRASS_H);
  const seed = seedOf('bg/dune-grass');
  const ground = (x) =>
    62 + Math.round(10 * triangle(x, 32) + 6 * triangle(x, 80) + 4 * triangle(x, 16));
  for (let x = 0; x < BAND_TILE_W; x++) {
    const g = ground(x);
    for (let y = g; y < GRASS_H; y++) {
      let c = DSAND;
      if (y === g) c = GRIM;
      else if (y === g + 1) c = SUBS;
      else if (pick(x, y, seed, 7) === 0) c = RK[0];
      setPixel(img, x, y, c);
    }
    if (pick(x, 3, seed, 4) === 0) {
      pxw(img, x, g - 2, GRIM);
      pxw(img, x + 1, g - 2, GRIM);
    }
    if (pick(x, 4, seed, 6) === 0) pxw(img, x, g - 4, GRIM);
    if (x % 4 === 0) {
      const h = 6 + pick(x, 5, seed, 7);
      const lean = pick(x, 6, seed, 5) - 2;
      for (let d = 0; d <= h; d++) {
        pxw(img, x + Math.round((lean * d) / h), g - 1 - d, d === h ? OLIVE_HI : OLIVE);
      }
      const h2 = Math.max(3, h - 3);
      for (let d = 0; d <= h2; d++) {
        pxw(img, x + 2 - Math.round((lean * d) / h2), g - 1 - d, d === h2 ? OLIVE : OLIVE_DK);
      }
    }
  }
  return img;
}

/**
 * The stepped end-cap of a floor run: each column solid from a height that steps three times
 * across the tile (design §10's outer corner), `SUR` on the cap, `SUBS` under it and on the
 * exposed side column, dark `DSAND` on the base row; mirrored by `flip`, hung from the top edge
 * by `ceiling`.
 *
 * @param {number} s - Tile side (even, ≥ 8).
 * @param {boolean} flip - Mirror left ↔ right.
 * @param {number} seed - The tile's seed.
 * @param {boolean} ceiling - Hang it from the top edge instead (the §10 ceiling corner).
 * @returns {Image} The tile.
 */
function cornerOuterTile(s, flip, seed, ceiling) {
  const img = createImage(s, s);
  const step = Math.floor((s - 4) / 3);
  const side = flip ? s - 1 : 0;
  for (let x = 0; x < s; x++) {
    const q = Math.floor(((flip ? s - 1 - x : x) * 4) / s);
    const t = 2 + (3 - q) * step;
    const a = ceiling ? 0 : t;
    const b = ceiling ? s - 1 - t : s - 1;
    for (let y = a; y <= b; y++) {
      const cap = ceiling ? y === b : y === a;
      const sub = ceiling ? y === b - 1 : y === a + 1;
      const dark = ceiling ? y === 0 : y === s - 1;
      px(
        img,
        x,
        y,
        dark ? DSAND : cap ? SUR : sub ? SUBS : pick(x, y, seed, 5) === 0 ? RK[2] : RK[0],
      );
    }
    if (x === side) {
      for (let y = a + (ceiling ? 1 : 0); y <= b - (ceiling ? 0 : 1); y++) px(img, x, y, SUBS);
    }
  }
  return img;
}

/**
 * The concave wall-meets-surface corner (design §10's inner corner): one half of the tile is
 * solid to the frame edge, the other half only under a flat shoulder at mid-tile — `SUR` along
 * both faces, the wall's exposed flank in `SUBS`.
 *
 * @param {number} s - Tile side (even, ≥ 8).
 * @param {boolean} flip - Mirror left ↔ right.
 * @param {number} seed - The tile's seed.
 * @param {boolean} ceiling - Hang it from the top edge instead.
 * @returns {Image} The tile.
 */
function cornerInnerTile(s, flip, seed, ceiling) {
  const img = createImage(s, s);
  const half = Math.floor(s / 2);
  const shoulder = Math.floor(s / 2);
  const face = flip ? half : half - 1;
  for (let x = 0; x < s; x++) {
    const wall = flip ? x >= s - half : x < half;
    const a = !ceiling && !wall ? shoulder : 0;
    const b = wall ? s - 1 : ceiling ? shoulder - 1 : s - 1;
    const flankFrom = ceiling ? shoulder : 0;
    const flankTo = ceiling ? s - 1 : shoulder - 1;
    for (let y = a; y <= b; y++) {
      const flank = x === face && (ceiling ? y >= flankFrom : y <= flankTo);
      const cap = (ceiling || !wall) && (y === b || y === a);
      const sub = y === (ceiling ? b - 1 : a + 1) && !cap;
      const dark = ceiling ? y === 0 : y === s - 1;
      px(
        img,
        x,
        y,
        dark
          ? DSAND
          : cap && (ceiling || !wall)
            ? SUR
            : sub || flank
              ? SUBS
              : pick(x, y, seed, 5) === 0
                ? RK[2]
                : RK[0],
      );
    }
    if (x === face) {
      for (let y = flankFrom; y <= flankTo; y++) px(img, x, y, SUBS);
    }
  }
  return img;
}

/**
 * The damaged brick courses: the base `brick` tile (the {@link renderTerrainTiles} frame the
 * variant sits beside, so the mortar and face match) with hash-scoured fissures — level 1 a
 * second crack, level 2 a branch and a spalled corner.
 *
 * @param {Image} base - The brick frame.
 * @param {number} s - Tile side.
 * @param {number} level - 1 or 2.
 * @param {number} seed - The tile's seed.
 * @returns {Image} The variant tile.
 */
function crackTile(base, s, level, seed) {
  const img = createImage(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) setPixel(img, x, y, getPixel(base, x, y));
  }
  for (let y = 0; y < s; y++) {
    const x1 = (level === 2 ? 3 : 7) - y;
    if (x1 >= 0 && x1 < s && getPixel(img, x1, y)[0] !== BRICK_MORTAR[0]) {
      px(img, x1, y, BRICK_CRACK);
    }
    if (level === 2 && (x1 + 1) % s > 0) px(img, (x1 + 1) % s, y, BRICK_CRACK);
  }
  if (level === 2) {
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (pick(x, y, seed, 2) === 0) px(img, x, y, BRICK_MORTAR);
      }
    }
    px(img, 1, 1, SUR);
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (pick(x, y, seed + level, 11) === 0) px(img, x, y, BRICK_MORTAR);
    }
  }
  return img;
}

/**
 * The thirty-six frames of `tiles/terrain-dune-v2`: `terrain-dune`'s whole twenty-tile list
 * first in its order (my prompt's law — the base list is off-limits, the §10 classes are added
 * after it), then the ten §10 fill/floor/ceiling classes, the four corners, the crack pair and
 * the three non-colliding decor tiles (design §10's enumeration; the frame order is the list
 * this function appends and {@link DUNE_V2_TILE_NAMES} names).
 *
 * @param {number} size - The tile side (`options.tileSize`).
 * @returns {Image[]} The frames, in list order.
 */
function duneTilesV2(size) {
  const base = renderTerrainTiles(size, 'tiles/terrain-dune');
  const s = size;
  return [
    ...base,
    strataTile(s, seedOf('tiles/terrain-dune-v2/solid-2')),
    veinTile(s),
    floor2Tile(s),
    floor3Tile(s),
    ceil2Tile(s),
    cornerOuterTile(s, false, seedOf('tiles/terrain-dune-v2/corner-outer-left'), false),
    cornerOuterTile(s, true, seedOf('tiles/terrain-dune-v2/corner-outer-right'), false),
    cornerInnerTile(s, false, seedOf('tiles/terrain-dune-v2/corner-inner-left'), false),
    cornerInnerTile(s, true, seedOf('tiles/terrain-dune-v2/corner-inner-right'), false),
    cornerOuterTile(s, false, seedOf('tiles/terrain-dune-v2/ceil-corner-outer'), true),
    cornerInnerTile(s, false, seedOf('tiles/terrain-dune-v2/ceil-corner-inner'), true),
    crackTile(base[17], s, 1, seedOf('tiles/terrain-dune-v2/brick-crack')),
    crackTile(base[17], s, 2, seedOf('tiles/terrain-dune-v2/brick-crack-2')),
    decorTuftTile(s),
    decorBoneTile(s),
    decorGlassTile(s),
  ];
}

/**
 * `solid-2`: the banded strata fill — rock with a lighter course every fourth row and hash
 * speckles, fully opaque.
 *
 * @param {number} s - Tile side.
 * @param {number} seed - The tile's seed.
 * @returns {Image} The tile.
 */
function strataTile(s, seed) {
  const img = createImage(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let c = RK[0];
      if (y % 4 === 1) c = RK[1];
      else if (pick(x, y, seed, 5) === 0) c = RK[2];
      setPixel(img, x, y, c);
    }
  }
  rect(img, 0, s - 1, s - 1, s - 1, DSAND);
  return img;
}

/**
 * `solid-3`: the veined fill — rock with a diagonal sun-lit calcite vein and its shaded flank.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function veinTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-dune-v2/solid-3');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(x, y, seed, 7) === 0 ? RK[2] : RK[0]);
    }
  }
  for (let y = 0; y < s; y++) {
    const vx = (y * 2 + Math.floor(y / 2)) % s;
    px(img, vx, y, SUR);
    px(img, vx - 1, y, SUBS);
    px(img, vx + 1, y, SUBS);
  }
  return img;
}

/**
 * `floor-2`: a plain crust — `SUR`, `SUBS`, speckled rock body, dark base.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function floor2Tile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-dune-v2/floor-2');
  rect(img, 0, 0, s - 1, 0, SUR);
  rect(img, 0, 1, s - 1, 1, SUBS);
  for (let y = 2; y < s - 1; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(x, y, seed, 5) === 0 ? RK[1] : RK[0]);
    }
  }
  rect(img, 0, s - 1, s - 1, s - 1, DSAND);
  return img;
}

/**
 * `floor-3`: the wind-rippled crust — the plain top with a scoured second row and sparse lit
 * ripples across the body's upper edge.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function floor3Tile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-dune-v2/floor-3');
  rect(img, 0, 0, s - 1, 0, SUR);
  rect(img, 0, 1, s - 1, 1, SUBS);
  for (let x = 0; x < s; x++) {
    if (pick(x, 3, seed, 4) === 0) px(img, x, 2, SUR);
  }
  for (let y = 2; y < s - 1; y++) {
    for (let x = 0; x < s; x++) {
      if (y === 2 && getPixel(img, x, y)[0] === SUR[0]) continue;
      setPixel(img, x, y, pick(x, y, seed, 6) === 0 ? RK[2] : RK[0]);
    }
  }
  rect(img, 0, s - 1, s - 1, s - 1, DSAND);
  return img;
}

/**
 * `ceiling-2`: the calcite fringe — an attach band on the top rows with per-column stalactite
 * strands, each contiguous from the ceiling and lit at its tip (design §10's ceiling variant).
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function ceil2Tile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-dune-v2/ceiling-2');
  rect(img, 0, 0, s - 1, 1, RK[1]);
  for (let x = 0; x < s; x++) {
    const len = 2 + pick(x, 41, seed, s - 4);
    for (let y = 2; y <= len; y++) {
      px(img, x, y, y === len ? SUR : pick(x, y, seed, 6) === 0 ? RK[2] : RK[0]);
    }
  }
  return img;
}

/**
 * `decor-tuft`: a dry tuft on a sand foot — non-colliding decoration on a transparent field.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function decorTuftTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-dune-v2/decor-tuft');
  rect(img, 1, s - 2, s - 2, s - 1, DSAND);
  for (let b = 0; b < 3; b++) {
    const bx = 2 + b * 4 + pick(b, 5, seed, 2);
    const h = 4 + pick(b, 6, seed, 4);
    const lean = pick(b, 7, seed, 3) - 1;
    for (let d = 0; d <= h; d++) {
      px(img, bx + Math.round((lean * d) / h), s - 2 - d, d === h ? OLIVE_HI : OLIVE);
    }
  }
  return img;
}

/**
 * `decor-bone`: a sun-bleached bone picked out of the sand — non-colliding decoration on a
 * transparent field.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function decorBoneTile(s) {
  const img = createImage(s, s);
  for (let d = 0; d <= 6; d++) {
    px(img, 2 + d, s - 3 - d, BONE);
    px(img, 3 + d, s - 2 - d, BONE_SH);
  }
  px(img, 2, s - 3, BONE);
  px(img, 1, s - 4, BONE);
  px(img, 2, s - 5, BONE);
  px(img, 8, s - 9, BONE);
  px(img, 9, s - 10, BONE);
  px(img, 10, s - 9, BONE);
  px(img, 4, s - 5, BONE_SH);
  return img;
}

/**
 * `decor-glass`: three shards of desert glass (the fulgurite flats of the design text) —
 * non-colliding decoration on a transparent field.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function decorGlassTile(s) {
  const img = createImage(s, s);
  rect(img, 2, s - 5, 5, s - 2, GLASS);
  rect(img, 2, s - 5, 5, s - 5, GLASS_ED);
  px(img, 3, s - 3, GLASS_HI);
  rect(img, 7, 6, 9, 9, GLASS);
  px(img, 7, 6, GLASS_ED);
  px(img, 8, 6, GLASS_ED);
  px(img, 9, 7, GLASS_HI);
  rect(img, 3, 2, 4, 3, GLASS);
  px(img, 3, 2, GLASS_ED);
  return img;
}
