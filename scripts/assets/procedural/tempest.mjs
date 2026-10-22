/**
 * Zone E, **TEMPEST RIDGE** (plan M2-12) — placeholder art of the storm-over-mountains zone
 * (decision D24):
 *
 * - `bg/storm-clouds` ({@link CLOUDS_TILE_W}×{@link CLOUDS_TILE_H}, the far band): a heavy deck of
 *   storm clouds painted **only** in the colours of {@link STORM_RAMP} (v1) / {@link STORM_RAMP_V2}
 *   (the frozen v2 ramp, R5-P.P7) (so the stage's palette cycle makes it roil), open sky between
 *   the billows; the billows wrap round the tile edge, so the band repeats seamlessly.
 * - `bg/storm-ridge` ({@link RIDGE_TILE_W}×{@link RIDGE_TILE_H}, a mid band): jagged mountain
 *   silhouettes with snow on their crests — saw-tooth profiles whose periods divide the tile width.
 * - `bg/storm-rain` ({@link RAIN_TILE_W}×{@link RAIN_TILE_H}, the near weather band): translucent
 *   slanting rain streaks, placed on a wrapped grid so the tile repeats seamlessly both ways.
 * - Enemies (flying ones face left — the renderer flips one that flies right; hit-flash
 *   siblings): `enemies/hail-drifter` (a hailstone with frost spikes, 2 frames),
 *   `enemies/gale-kite` (a delta-wing glider, its tail streamer flapping, 2 frames),
 *   `enemies/squall-jumper` (a swept-wing jet that attacks from behind, its jet flickering, 2
 *   frames), `enemies/crag-turret` (a granite dome with a pale barrel eye), `enemies/thunderhead`
 *   (a small storm cloud with lightning flickering inside, 3 frames), `enemies/steed-foal` (SQUALL
 *   STEED's homing mini, a little seahorse, 2 frames).
 * - SQUALL STEED (SS-05), the seahorse: `bosses/steed-body` (the plated trunk), `bosses/steed-head`
 *   (the head with its crown and eye), `bosses/steed-snout` (the tube snout — a gun),
 *   `bosses/steed-chest` (the glowing hatch — the weak point, 2 frames), `bosses/steed-lid-top` /
 *   `-bottom` (the chest's lids, mirrors), `bosses/steed-tail` (the curled tail),
 *   `bosses/steed-fin` (the dorsal fin, rippling, 2 frames).
 *
 * Slate blues and greys with pale yellow lightning — low in saturation next to the pink / red /
 * purple bullets and the capsules (shmup_feat.md §12, §18). Geometry uses only `+ - * /` and
 * `Math.sqrt`, randomness the seeded asset RNG and `hash2` (seeded from the sprite names), so the
 * pixels are identical on every engine.
 *
 * **Since R5-05.S2 this generator also draws zone E's v2 stand-ins** (design
 * `docs/v2-run/designs/zone-e.md` §14 and §10): the two new enemies, the storm eye's three parts,
 * the SQUALL STEED's three new parts, the three `bg/storm-*` bands of §9 and the first v2 tileset
 * sprite of the storm — `tiles/terrain-ridge-v2` — {@link TEMPEST_V2_SPRITES}. They appear **only
 * on the `(options.artScale ?? 1) !== 1` path** and every one is `native` (decision RR-1a), so the
 * scale-1 build returns exactly the seventeen v1 sprites above, byte for byte, and the v2 names
 * are simply absent there. The bands are seamless tiles at a half-`FRAME_W` period like zone A's
 * (`bg/azure-horizon`) and zone C's (`bg/dune-sky`); `bg/storm-flash` is flat-painted in exactly
 * the frozen STORM palette-cycle ramp ({@link STORM_RAMP_V2} — R5-P.P7 wrote it into
 * `content/stages/zone-e.stage.json`'s `cycles`; the art the §9 stack will cycle), every other
 * new colour at Chebyshev distance ≥ 3 from every reserved ramp (bible §4.4, asserted by
 * `test/scripts/assets/procedural-zone-e.test.ts`).
 *
 * **Public API.** {@link generate}, {@link TEMPEST_SPRITES}, {@link STORM_RAMP} (the colours zone
 * E's v1 palette cycle named), {@link STORM_RAMP_V2} (the frozen v2 ramp zone E's cycles name since
 * R5-P.P7), {@link CLOUDS_TILE_W} / {@link CLOUDS_TILE_H},
 * {@link RIDGE_TILE_W} / {@link RIDGE_TILE_H}, {@link RAIN_TILE_W} / {@link RAIN_TILE_H} (the
 * bands' tile sizes, their parallax `spacing`) and — since R5-05.S2 — {@link TEMPEST_V2_SPRITES},
 * {@link RIDGE_V2_TILES}, {@link RIDGE_V2_TILE_NAMES}, {@link BAND_TILE_W}, {@link SKY_H},
 * {@link FLASH_H}, {@link GUST_H}.
 *
 * @module
 */
import { createImage, flipVertical, getPixel, setPixel } from '../image.mjs';
import { scaleImage } from '../interim.mjs';
import { createAssetRng, hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf, withAlpha } from './common.mjs';
import { renderTerrainTiles, TERRAIN_PALETTES, TERRAIN_TILES, TILE_SIZE } from './terrain.mjs';
// The frame constants come from the scripts' pinned mirror (`scripts/frame.mjs`) directly, not
// from `v2kit.mjs` as the other zone generators read them: the kit imports this module for the
// storm ramps, and a re-export read during this module's own evaluation could see the kit's
// frame bindings still in their temporal dead zone when the graph enters through the kit. The
// leaf module has no imports, so reading it here can never cycle.
import { FRAME_H, FRAME_W } from '../../frame.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/storm-clouds` tile (its parallax `spacing`). */
export const CLOUDS_TILE_W = 128;

/** Height of the `bg/storm-clouds` tile. */
export const CLOUDS_TILE_H = 56;

/** Width of the `bg/storm-ridge` tile (its parallax `spacing`). */
export const RIDGE_TILE_W = 128;

/** Height of the `bg/storm-ridge` tile. */
export const RIDGE_TILE_H = 48;

/** Width of the `bg/storm-rain` tile (its parallax `spacing`). */
export const RAIN_TILE_W = 64;

/** Height of the `bg/storm-rain` tile. */
export const RAIN_TILE_H = 64;

/**
 * Tile width of the three `bg/storm-sky` / `-flash` / `-gust` bands: half the frame, derived from
 * `FRAME_W` — the {@link ../procedural/azure.mjs|zone-A} precedent (design §14 asks full-frame
 * bands; an atlas frame cannot exceed the 512-page scenario of
 * `test/scripts/assets/pipeline-edge.test.ts`, and every shipped band here is a seamless
 * repeating tile, so these are, at a period that fills the frame exactly twice).
 */
export const BAND_TILE_W = FRAME_W / 2;

/** Height of the `bg/storm-sky` band (zone-e.md §14: a full-frame sky). */
export const SKY_H = FRAME_H;

/** Height of the `bg/storm-flash` band (zone-e.md §14). */
export const FLASH_H = 60;

/** Height of the `bg/storm-gust` band (zone-e.md §14). */
export const GUST_H = 48;

/**
 * The storm clouds' four colours, dark → light — the exact colours zone E's palette cycle names
 * (`content/stages/zone-e.stage.json`).
 */
export const STORM_RAMP = Object.freeze(['#1c2230', '#262e40', '#323c52', '#46526a']);

/**
 * Zone E's frozen v2 ramp (design `docs/v2-run/designs/zone-e.md` §9): the four colours
 * `content/stages/zone-e.stage.json` names for its far and mid cycles now, dark → light — drawn by
 * `bg/storm-clouds` only at an art scale ≠ 1 (RR-1: the scale-1 build keeps {@link STORM_RAMP}
 * byte for byte).
 */
export const STORM_RAMP_V2 = Object.freeze(['#10182a', '#1d2c46', '#2f4166', '#475d84']);

/** The sprites this generator draws, in order. */
export const TEMPEST_SPRITES = Object.freeze([
  'bg/storm-clouds',
  'bg/storm-ridge',
  'bg/storm-rain',
  'enemies/hail-drifter',
  'enemies/gale-kite',
  'enemies/squall-jumper',
  'enemies/crag-turret',
  'enemies/thunderhead',
  'enemies/steed-foal',
  'bosses/steed-body',
  'bosses/steed-head',
  'bosses/steed-snout',
  'bosses/steed-chest',
  'bosses/steed-lid-top',
  'bosses/steed-lid-bottom',
  'bosses/steed-tail',
  'bosses/steed-fin',
]);

/**
 * The v2 stand-in names {@link generate} adds at an art scale ≠ 1, in its output order (design
 * `docs/v2-run/designs/zone-e.md` §14).
 */
export const TEMPEST_V2_SPRITES = Object.freeze([
  'enemies/ice-slab',
  'enemies/lightbird',
  'bosses/storm-eye-core',
  'bosses/storm-eye-cloud',
  'bosses/storm-eye-ring',
  'bosses/steed-mane',
  'bosses/steed-crest',
  'bosses/steed-flank',
  'bg/storm-sky',
  'bg/storm-flash',
  'bg/storm-gust',
  'tiles/terrain-ridge-v2',
]);

/** The sixteen §10 variant tiles after `terrain-ridge`'s twenty, in list order. */
export const RIDGE_V2_TILES = /** @type {const} */ ([
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
  'decor-scree',
  'decor-ice-patch',
  'decor-pine',
]);

/** The tile names of `tiles/terrain-ridge-v2`: `terrain-ridge`'s list verbatim, then the variants. */
export const RIDGE_V2_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...RIDGE_V2_TILES]);

/**
 * Generates zone E's art: the seventeen v1 sprites always, plus the twelve v2 stand-ins of
 * design §14 when the build runs at an art scale ≠ 1 (decision RR-1a).
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's art scale and tile
 *   side (the pipeline passes both; `artScale` 1 or absent draws the v1 set only, byte for
 *   byte, and `tileSize` defaults to the v2 {@link TILE_SIZE}).
 * @returns {SpriteDef[]} {@link TEMPEST_SPRITES} in that order at art scale 1; the v1 set
 *   followed by {@link TEMPEST_V2_SPRITES} in theirs at any other scale (the new names all
 *   `native`, their `@flash` siblings derived by the pipeline's flash pass).
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  const v2 = artScale !== 1;
  const flash = { hitFlash: true };
  const lid = lidFrame();
  const sprites = [
    makeSprite(
      'bg/storm-clouds',
      [v2 ? scaleImage(clouds(STORM_RAMP_V2), artScale) : clouds()],
      'tempest',
      {
        anchor: [0, 0],
        native: v2,
      },
    ),
    makeSprite('bg/storm-ridge', [ridge()], 'tempest', { anchor: [0, 0] }),
    makeSprite('bg/storm-rain', [rain()], 'tempest', { anchor: [0, 0] }),
    makeSprite('enemies/hail-drifter', [hailFrame(0), hailFrame(1)], 'tempest', {
      hitFlash: true,
      animations: { spin: [0, 1] },
    }),
    makeSprite('enemies/gale-kite', [kiteFrame(-1), kiteFrame(1)], 'tempest', {
      hitFlash: true,
      animations: { flap: [0, 1] },
    }),
    makeSprite('enemies/squall-jumper', [jumperFrame(1), jumperFrame(2)], 'tempest', {
      hitFlash: true,
      animations: { burn: [0, 1] },
    }),
    makeSprite('enemies/crag-turret', [turretFrame()], 'tempest', flash),
    makeSprite('enemies/thunderhead', [0, 1, 2].map(thunderFrame), 'tempest', {
      hitFlash: true,
      animations: { flicker: [0, 1, 2] },
    }),
    makeSprite('enemies/steed-foal', [foalFrame(0), foalFrame(1)], 'tempest', {
      hitFlash: true,
      animations: { swim: [0, 1] },
    }),
    makeSprite('bosses/steed-body', [bodyFrame()], 'tempest', flash),
    makeSprite('bosses/steed-head', [headFrame()], 'tempest', flash),
    makeSprite('bosses/steed-snout', [snoutFrame()], 'tempest', flash),
    makeSprite('bosses/steed-chest', [chestFrame('#f0d870'), chestFrame('#a8e0f0')], 'tempest', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('bosses/steed-lid-top', [lid], 'tempest', flash),
    makeSprite('bosses/steed-lid-bottom', [flipVertical(lid)], 'tempest', flash),
    makeSprite('bosses/steed-tail', [tailFrame()], 'tempest'),
    makeSprite('bosses/steed-fin', [finFrame(0), finFrame(1)], 'tempest', {
      animations: { ripple: [0, 1] },
    }),
  ];
  if (!v2) return sprites;
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  return sprites.concat([
    makeSprite('enemies/ice-slab', [0, 1, 2, 3].map(iceSlabFrame), 'tempest', {
      ...hit,
      animations: { tumble: [0, 1, 2, 3] },
    }),
    makeSprite('enemies/lightbird', [0, 1, 2, 3].map(lightbirdFrame), 'tempest', {
      ...hit,
      animations: { flap: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/storm-eye-core', [0, 1, 2, 3].map(eyeCoreFrame), 'tempest', {
      ...hit,
      animations: { pulse: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/storm-eye-cloud', [eyeCloudFrame(0), eyeCloudFrame(1)], 'tempest', {
      ...hit,
      animations: { puff: [0, 1] },
    }),
    makeSprite('bosses/storm-eye-ring', [0, 1, 2, 3].map(eyeRingFrame), 'tempest', {
      ...native,
      animations: { swirl: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/steed-mane', [0, 1, 2, 3].map(maneFrame), 'tempest', {
      ...native,
      animations: { drift: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/steed-crest', [crestFrame(0), crestFrame(1)], 'tempest', {
      ...hit,
      animations: { turn: [0, 1] },
    }),
    makeSprite('bosses/steed-flank', [flankFrame()], 'tempest', native),
    makeSprite('bg/storm-sky', [skyBand()], 'tempest', { anchor: [0, 0], ...native }),
    makeSprite('bg/storm-flash', [flashBand()], 'tempest', { anchor: [0, 0], ...native }),
    makeSprite('bg/storm-gust', [gustBand()], 'tempest', { anchor: [0, 0], ...native }),
    makeSprite('tiles/terrain-ridge-v2', ridgeTilesV2(size), 'tempest', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(RIDGE_V2_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ]);
}

/**
 * The cloud deck: seeded billows (wrapped round the tile's width) whose density picks one of the
 * `rampHex` colours (v1's {@link STORM_RAMP}, the frozen v2 {@link STORM_RAMP_V2}) — denser is
 * lighter, the billows' lit tops — and leaves thin places open to the sky. Every painted pixel is
 * opaque and a ramp colour.
 *
 * @param {readonly string[]} [rampHex] - The ramp to paint, default {@link STORM_RAMP}.
 * @returns {Image} The tile.
 */
function clouds(rampHex = STORM_RAMP) {
  const w = CLOUDS_TILE_W;
  const h = CLOUDS_TILE_H;
  const rng = createAssetRng(seedOf('bg/storm-clouds'));
  const ramp = rampHex.map(color);
  /** @type {{ x: number, y: number, r: number }[]} */
  const billows = [];
  for (let i = 0; i < 18; i++) {
    billows.push({
      x: rng.rangeInt(0, w - 1),
      y: rng.rangeInt(8, h - 14),
      r: rng.rangeInt(10, 20),
    });
  }
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let density = 0;
      let lit = 0;
      for (const billow of billows) {
        let dx = Math.abs(x - billow.x);
        if (dx > w / 2) dx = w - dx;
        const dy = y - billow.y;
        const d = (dx * dx + dy * dy) / (billow.r * billow.r);
        if (d < 1) {
          density += 1 - d;
          // The upper half of a billow catches the light.
          if (dy < 0) lit += (1 - d) * (-dy / billow.r);
        }
      }
      // The deck thins out towards its bottom rows.
      const fade = (h - 1 - y) / 12;
      density *= fade < 1 ? fade : 1;
      if (density < 0.35) continue;
      let k = density > 1.4 ? 2 : density > 0.8 ? 1 : 0;
      if (lit > 0.45) k = 3;
      setPixel(image, x, y, ramp[k]);
    }
  }
  return image;
}

/**
 * The ridge band: two ranges of saw-tooth peaks (periods 64 / 32 and 128 / 16 px — they divide the
 * tile width), the far one darker, the near one with snow on its crests.
 *
 * @returns {Image} The tile.
 */
function ridge() {
  const w = RIDGE_TILE_W;
  const h = RIDGE_TILE_H;
  const far = color('#242a38');
  const near = color('#303848');
  const snow = color('#a8b4c4');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const farTop = Math.round(4 + 18 * saw(x + 10, 64) + 6 * saw(x, 32));
    const nearTop = Math.round(16 + 16 * saw(x + 40, 128) + 5 * saw(x + 3, 16));
    for (let y = farTop; y < h; y++) setPixel(image, x, y, far);
    for (let y = nearTop; y < h; y++) setPixel(image, x, y, y - nearTop < 2 ? snow : near);
  }
  return image;
}

/**
 * A saw-tooth "mountain" wave of a whole-pixel period: 0 at the peaks, 1 in the valleys, rising
 * steeply and falling gently.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function saw(x, period) {
  const t = (x % period) / period;
  return t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
}

/**
 * The rain band: short slanting streaks (two pixels down for one to the left) on a wrapped grid of
 * seeded starts, translucent pale blue.
 *
 * @returns {Image} The tile.
 */
function rain() {
  const w = RAIN_TILE_W;
  const h = RAIN_TILE_H;
  const seed = seedOf('bg/storm-rain');
  const drop = color('#9ab0cc');
  const image = createImage(w, h);
  for (let i = 0; i < 26; i++) {
    const sx = hash2(i, 0, seed) % w;
    const sy = hash2(i, 1, seed) % h;
    const length = 5 + (hash2(i, 2, seed) % 5);
    const alpha = 70 + (hash2(i, 3, seed) % 60);
    for (let k = 0; k < length; k++) {
      const x = (((sx - Math.floor(k / 2)) % w) + w) % w;
      const y = (sy + k) % h;
      setPixel(image, x, y, withAlpha(drop, alpha));
    }
  }
  return image;
}

/**
 * A hailstone: a pale icy ball with four frost spikes; the spikes turn 45° and the highlight moves
 * between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function hailFrame(frame) {
  const size = 10;
  const c = 4.5;
  const rim = color('#5a6a80');
  const ice = color('#b8c8dc');
  const shine = color('#f0f8ff');
  const spike = color('#8aa0ba');
  const image = createImage(size, size);
  const dirs =
    frame === 0
      ? [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]
      : [
          [0.7, -0.7],
          [0.7, 0.7],
          [-0.7, 0.7],
          [-0.7, -0.7],
        ];
  for (const [dx, dy] of dirs)
    drawLine(image, c + dx * 2.5, c + dy * 2.5, c + dx * 4.5, c + dy * 4.5, spike);
  fillEllipse(image, c, c, 3.2, 3.2, (u, v, e) => {
    if (e > 0.8) return rim;
    if (u + v < -0.6 - frame * 0.2) return shine;
    return ice;
  });
  return image;
}

/**
 * The gale kite: a pale delta wing pointing left with a dark spine, its tail streamer up (`tail`
 * −1) or down (+1).
 *
 * @param {number} tail - −1 or 1.
 * @returns {Image} The frame.
 */
function kiteFrame(tail) {
  const w = 16;
  const h = 10;
  const wing = color('#8a9ab0');
  const lit = color('#c0ccda');
  const spine = color('#2a3240');
  const streamer = color('#d8c060');
  const image = createImage(w, h);
  for (let x = 1; x < 12; x++) {
    const half = (x * 4.2) / 11;
    for (let y = Math.round(4.5 - half); y <= Math.round(4.5 + half); y++) {
      setPixel(image, x, y, y < 4.5 ? lit : wing);
    }
  }
  drawLine(image, 1, 4.5, 11, 4.5, spine);
  drawLine(image, 11, 4.5, 15, 4.5 + 2.5 * tail, streamer);
  return image;
}

/**
 * The squall jumper: a slate swept-wing jet pointing left with a canopy and a jet flame of
 * `flame` px behind its tail (x 14 on; the fuselage and the wings cover everything left of it, so
 * the flame must differ there for the two frames to flicker).
 *
 * @param {number} flame - Flame length in pixels (1 or 2).
 * @returns {Image} The frame.
 */
function jumperFrame(flame) {
  const w = 16;
  const h = 9;
  const hull = color('#6a7890');
  const lit = color('#9aa8bc');
  const wing = color('#4e5a6e');
  const canopy = color('#a8e0f0');
  const jet = color('#f0d870');
  const image = createImage(w, h);
  drawLine(image, 14, 4, 13 + flame, 4, jet);
  // Swept wings: triangles from the middle of the fuselage back to the tail.
  for (let x = 6; x <= 12; x++) {
    const half = Math.round(((x - 6) * 4) / 6);
    for (let y = 4 - half; y <= 4 + half; y++) setPixel(image, x, y, wing);
  }
  fillEllipse(image, 6.5, 4, 6.5, 2, (_u, v) => (v < -0.3 ? lit : hull));
  setPixel(image, 4, 3, canopy);
  setPixel(image, 5, 3, canopy);
  return image;
}

/**
 * The crag turret: a granite dome on a floor with a pale eye and a short barrel.
 *
 * @returns {Image} The frame.
 */
function turretFrame() {
  const w = 14;
  const h = 11;
  const rim = color('#1c222c');
  const stone = color('#4a5260');
  const lit = color('#6c7686');
  const eye = color('#c8e8f8');
  const image = createImage(w, h);
  drawLine(image, 6.5, 5, 6.5, 0, rim, 2);
  fillEllipse(image, 6.5, 10, 6.5, 7, (u, v, e) => {
    if (e > 0.86) return rim;
    return u + v < -0.9 ? lit : stone;
  });
  fillEllipse(image, 6.5, 6.5, 1.8, 1.8, () => eye);
  return image;
}

/**
 * A thunderhead: a small dark storm cloud (three billows) with a jagged bolt of lightning inside —
 * bright in frame 0, dim in frame 1, gone in frame 2.
 *
 * @param {number} frame - 0, 1 or 2.
 * @returns {Image} The frame.
 */
function thunderFrame(frame) {
  const w = 22;
  const h = 14;
  const dark = color('#2a3040');
  const mid = color('#3e4860');
  const lit = color('#5a6680');
  const bolt = frame === 0 ? color('#f8f0a0') : color('#a09860');
  const image = createImage(w, h);
  const paint = (/** @type {number} */ _u, /** @type {number} */ v) => (v < -0.4 ? lit : mid);
  fillEllipse(image, 6, 8, 6, 5, paint);
  fillEllipse(image, 12, 6, 7, 6, paint);
  fillEllipse(image, 17, 8.5, 4.5, 4.5, paint);
  for (let x = 1; x < w - 1; x++) setPixel(image, x, 12, dark);
  if (frame < 2) {
    drawLine(image, 12, 3, 10, 7, bolt);
    drawLine(image, 10, 7, 13, 8, bolt);
    drawLine(image, 13, 8, 11, 12, bolt);
  }
  return image;
}

/**
 * A steed foal: a little slate seahorse facing left, its tail curling one way or the other.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function foalFrame(frame) {
  const w = 8;
  const h = 10;
  const body = color('#6a7a90');
  const lit = color('#a0b0c4');
  const eye = color('#f0d870');
  const image = createImage(w, h);
  fillEllipse(image, 4, 2.5, 2.5, 2.2, (_u, v) => (v < -0.3 ? lit : body));
  drawLine(image, 2, 2.5, 0, 3, body);
  fillEllipse(image, 4.5, 5.5, 2, 2.2, () => body);
  drawLine(image, 5, 7, 4 + frame * 2, 9, body);
  setPixel(image, 3, 2, eye);
  return image;
}

/**
 * SQUALL STEED's trunk: a tall curved body of slate plates (lighter belly rings on the left, a
 * dark back on the right), narrowing towards the tail.
 *
 * @returns {Image} The frame.
 */
function bodyFrame() {
  const w = 30;
  const h = 54;
  const rim = color('#141a24');
  const plate = color('#3c4658');
  const back = color('#2c3444');
  const belly = color('#8a98ac');
  const ring = color('#5e6a80');
  const image = createImage(w, h);
  fillEllipse(image, 15, 24, 14.5, 26, (u, v, e, _x, y) => {
    // Narrow towards the tail: cut the lower flanks.
    if (v > 0.3 && Math.abs(u) > 1.25 - v) return null;
    if (e > 0.9) return rim;
    if (u < -0.35) return y % 5 === 0 ? ring : belly;
    return u > 0.45 ? back : plate;
  });
  for (let y = 8; y < h - 8; y += 7) drawLine(image, 9, y, 22, y + 1, rim);
  return image;
}

/**
 * SQUALL STEED's head: a slate head facing left with a crown of three pale spikes, a glowing eye
 * and a lit brow.
 *
 * @returns {Image} The frame.
 */
function headFrame() {
  const w = 26;
  const h = 20;
  const rim = color('#141a24');
  const skin = color('#46526a');
  const lit = color('#6e7c94');
  const crown = color('#c0ccda');
  const eye = color('#f0d870');
  const image = createImage(w, h);
  for (let k = 0; k < 3; k++) drawLine(image, 10 + k * 5, 6, 12 + k * 5, 0, crown, 2);
  fillEllipse(image, 13, 12, 11.5, 7.5, (u, v, e) => {
    if (e > 0.88) return rim;
    return v < -0.35 ? lit : skin;
  });
  fillEllipse(image, 9, 10, 1.8, 1.8, () => eye);
  return image;
}

/**
 * SQUALL STEED's snout: a tube pointing left with a dark mouth at its tip.
 *
 * @returns {Image} The frame.
 */
function snoutFrame() {
  const w = 16;
  const h = 9;
  const rim = color('#141a24');
  const tube = color('#56627a');
  const lit = color('#7e8ca4');
  const mouth = color('#0c1018');
  const image = createImage(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w; x++) {
      const edge = y === 1 || y === h - 2;
      setPixel(image, x, y, edge ? rim : y < 4 ? lit : tube);
    }
  }
  for (let y = 2; y <= 6; y++) setPixel(image, 0, y, rim);
  for (let y = 3; y <= 5; y++) setPixel(image, 1, y, mouth);
  return image;
}

/**
 * SQUALL STEED's chest hatch: a glowing oval (`tone` at its heart) in a dark socket.
 *
 * @param {string} tone - The heart's colour.
 * @returns {Image} The frame.
 */
function chestFrame(tone) {
  const w = 16;
  const h = 22;
  const socket = color('#10141c');
  const glow = mix(color('#5a7aa0'), color(tone), 0.5);
  const heart = color(tone);
  const image = createImage(w, h);
  fillEllipse(image, 7.5, 10.5, 7.5, 10.5, (_u, _v, e) => {
    if (e > 0.86) return socket;
    return e > 0.45 ? glow : heart;
  });
  return image;
}

/**
 * The upper chest lid: a curved slate plate; the lower lid is its vertical mirror.
 *
 * @returns {Image} The frame.
 */
function lidFrame() {
  const w = 12;
  const h = 7;
  const rim = color('#141a24');
  const plate = color('#5e6a80');
  const lit = color('#8a98ac');
  const image = createImage(w, h);
  fillEllipse(image, 6, 6, 6, 6, (_u, v, e) => {
    if (e > 0.85) return rim;
    return v < -0.55 ? lit : plate;
  });
  return image;
}

/**
 * SQUALL STEED's tail: a thick tapering curl of slate rings (decoration — never hit).
 *
 * @returns {Image} The frame.
 */
function tailFrame() {
  const w = 22;
  const h = 26;
  const tone = color('#3c4658');
  const ring = color('#5e6a80');
  const image = createImage(w, h);
  // A spiral: dots along a curve whose radius shrinks as it turns.
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    // A square-root spiral from rational points on the unit circle (no trigonometry).
    const q = t * 4;
    const k = Math.floor(q);
    const f = q - k;
    const corners = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    const ax = corners[k][0] + (corners[k + 1][0] - corners[k][0]) * f;
    const ay = corners[k][1] + (corners[k + 1][1] - corners[k][1]) * f;
    const len = Math.sqrt(ax * ax + ay * ay);
    const r = 9 * (1 - t * 0.75);
    const x = 11 + (ax / len) * r;
    const y = 14 + (ay / len) * r - (1 - t) * 4;
    const width = 4 - t * 2.5;
    fillEllipse(image, x, y, width, width, () => (i % 6 === 0 ? ring : tone));
  }
  return image;
}

/**
 * SQUALL STEED's dorsal fin: a translucent pale fan of rays on its back, rippling a pixel between
 * the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function finFrame(frame) {
  const w = 12;
  const h = 30;
  const membrane = color('#8a9ab0');
  const ray = color('#c0ccda');
  const image = createImage(w, h);
  for (let y = 2; y < h - 2; y++) {
    const reach = Math.round(2 + 8 * Math.sqrt(1 - ((y - 15) / 13) * ((y - 15) / 13)));
    const shift = (y + frame) % 4 < 2 ? 0 : 1;
    for (let x = 0; x < reach + shift && x < w; x++) {
      setPixel(image, x, y, y % 4 === 0 ? ray : withAlpha(membrane, 170));
    }
  }
  return image;
}

// ─────────────────────────────────── v2 stand-ins (R5-05.S2, zone-e.md §14 / §10 / §9) ──────

/**
 * Zone E's v2 storm family — `tiles/terrain-ridge`'s palette (the design's storm-grey granite
 * with the frost rim) read from `terrain.mjs` so the new terrain sits on the old with one source
 * of truth, plus the v1 `tempest.mjs` slate, cloud and ice colours for the creatures and the
 * brick literals of the base set's `brick` tile for the crack variants.
 */
const PAL = TERRAIN_PALETTES['tiles/terrain-ridge'];
const SUR = color(PAL.surface);
const SUBS = color(PAL.subsurface);
const RK = PAL.rock.map(color);
const BASE_DARK = color('#232a36');
const RIM = color('#141a24');
const SLATE = color('#4e5a6e');
const SLATE_LIT = color('#6e7c94');
const SLATE_HI = color('#8a98ac');
const SLATE_TOP = color('#9aa8bc');
const CLOUD_DK = color('#26304a');
const CLOUD_MID = color('#3e4860');
const CLOUD_LIT = color('#5a6680');
const ICE = color('#b8c8dc');
const ICE_SHINE = color('#f0f8ff');
const ICE_EDGE = color('#8aa0ba');
const ICE_CANOPY = color('#a8e0f0');
const ICE_FLOE = color('#c8e8f8');
const ICE_SHADE = color('#7fb4cc');
const BOLT = color('#f8f0a0');
const BOLT_DIM = color('#a09860');
const BOLT_WARM = color('#f0d870');
const STREAMER = color('#d8c060');
const PINE_DK = color('#2c3a30');
const PINE = color('#3c4a38');
const PINE_LIT = color('#5c6e4e');
const TRUNK = color('#5c4a30');
const BRICK_MORTAR = color('#5a3424');
const BRICK_CRACK = color('#7e4a32');

/** The jagged top and bottom edge rows of `enemies/ice-slab`'s slab silhouette, per column. */
const SLAB_TOP = [6, 5, 4, 4, 3, 3, 3, 4, 4, 5, 5, 4, 3, 3, 4, 4, 5, 6, 6, 7, 7];
const SLAB_BOT = [
  13, 14, 15, 16, 16, 17, 17, 18, 18, 17, 16, 17, 18, 18, 17, 16, 16, 15, 14, 13, 12,
];

/** The eight compass offsets of `bosses/storm-eye-ring`'s studs (no trigonometry). */
const RING_DIRS = [
  [20, 0],
  [14, 14],
  [0, 20],
  [-14, 14],
  [-20, 0],
  [-14, -14],
  [0, -20],
  [14, -14],
];

/** The inward comet direction of each stud (a quarter-step of its offset). */
const RING_IN = [
  [-5, 0],
  [-4, -4],
  [0, -5],
  [4, -4],
  [5, 0],
  [4, 4],
  [0, 5],
  [-4, 4],
];

/** The dusk-to-storm steps of `bg/storm-sky`, top of the frame to its foot (design §9). */
const SKY_STEPS = [
  color('#0b1420'),
  color('#14202e'),
  color('#232e44'),
  color('#2f3a52'),
  color('#475068'),
  color('#5d6a84'),
  color('#7d8ea8'),
];

/** The storm's horizon glow (§9's highlight colour, off the cycled ramp). */
const SKY_GLOW = color('#5d779f');

/** The glow decal's fixed core and halo (`bg/storm-sky`, the v1 twin-suns drawing style). */
const SKY_CORE = mix(SKY_GLOW, SKY_STEPS[4], 0.7);
const SKY_HALO = mix(SKY_GLOW, SKY_STEPS[4], 0.28);

/** The four ramp colours of {@link STORM_RAMP_V2} as paint — `bg/storm-flash` is flat in these. */
const RAMP = STORM_RAMP_V2.map(color);

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
 * `enemies/ice-slab` (21×21, 4 frames, hittable): the ceiling floe of the design's rock.fall — a
 * jagged slab on a stable silhouette (the {@link SLAB_TOP} / {@link SLAB_BOT} edges), its facet
 * cracks sliding and its frost sparkles moving from frame to frame as it tumbles.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function iceSlabFrame(k) {
  const img = createImage(21, 21);
  const seed = seedOf('enemies/ice-slab');
  for (let x = 0; x < 21; x++) {
    for (let y = SLAB_TOP[x]; y <= SLAB_BOT[x]; y++) {
      let c = ICE;
      if (y === SLAB_TOP[x] || y === SLAB_TOP[x] + 1) c = ICE_SHINE;
      else if (y === SLAB_BOT[x]) c = ICE_SHADE;
      else if (pick(x, y, seed, 6) === 0) c = ICE_FLOE;
      px(img, x, y, c);
    }
  }
  const slide = (k % 4) * ((k % 3) + 1);
  drawLine(img, 4 + slide, 7, 12 - Math.floor(slide / 2), 12, ICE_EDGE);
  drawLine(img, 9, 8 + (slide % 3), 17, 11 - (slide % 2), ICE_SHADE);
  px(img, 5 + ((k * 3) % 9), 10 + (k % 4), ICE_SHINE);
  px(img, 15 - ((k * 4) % 7), 12 - (k % 3), ICE_SHINE);
  return img;
}

/**
 * `enemies/lightbird` (24×12, 4 frames, hittable): the ramming gull of the design — a slim slate
 * hull facing left with an icy canopy visor, one swept ice wing in four beat phases, a lit head
 * wedge and twin straw-coloured tail streamers.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function lightbirdFrame(k) {
  const img = createImage(24, 12);
  const tipY = [1, 4, 9, 6][k];
  for (let x = 3; x <= 18; x++) {
    const h = x < 9 ? 1 + Math.floor((x - 3) / 3) : Math.max(1, 2 - Math.floor((18 - x) / 2));
    for (let y = 5 - h; y <= 5 + h; y++) px(img, x, y, y < 5 ? SLATE_LIT : SLATE);
  }
  for (let x = 0; x <= 2; x++) {
    for (let y = 5 - x; y <= 5 + x; y++) px(img, x, y, y < 5 ? SLATE_TOP : SLATE);
  }
  for (let d = 0; d <= 7; d++) {
    const wx = 8 - d;
    const wy = Math.round(5 + ((tipY - 5) * (d + 1)) / 8);
    px(img, wx, wy, ICE_FLOE);
    px(img, wx, wy + (tipY < 5 ? 1 : -1), ICE_EDGE);
  }
  px(img, 1, 4, ICE_CANOPY);
  for (let t = 0; t < 2; t++) {
    for (let d = 0; d <= 4; d++) px(img, 19 + d, 5 - t * 2 + (d > 2 ? 1 : 0), STREAMER);
  }
  return img;
}

/**
 * `bosses/storm-eye-core` (24×24, 4 frames, hittable): the STORM EYE's pulsing heart — a bright
 * ice orb inside a three-billow dark cloud with a heavy underside; the orb breathes 5 → 6 → 7 → 6
 * px and frames 1 and 2 strike a bolt out of each flank.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function eyeCoreFrame(k) {
  const img = createImage(24, 24);
  const paint = (_u, v, e) => (e > 0.88 ? RIM : v < -0.4 ? CLOUD_LIT : CLOUD_MID);
  fillEllipse(img, 6.5, 13, 6, 5, paint);
  fillEllipse(img, 12, 9, 7, 6, paint);
  fillEllipse(img, 18, 13.5, 5.5, 5, paint);
  for (let x = 1; x < 23; x++) px(img, x, 18, CLOUD_DK);
  for (let x = 3; x < 21; x++) px(img, x, 19, RIM);
  const r = [5, 6, 7, 6][k];
  fillEllipse(img, 12, 12, r, r, (_u, _v, e) => {
    if (e > 0.75) return ICE_EDGE;
    if (e > 0.5) return ICE_CANOPY;
    if (e > 0.25) return ICE_FLOE;
    return ICE_SHINE;
  });
  if (k === 1 || k === 2) {
    const sgn = k === 1 ? 1 : -1;
    drawLine(img, 12 + sgn * (r + 1), 12, 12 + sgn * (r + 3), 15, BOLT);
    drawLine(img, 12 - sgn * (r + 1), 11, 12 - sgn * (r + 3), 8, BOLT_DIM);
  }
  return img;
}

/**
 * `bosses/storm-eye-cloud` (27×18, 2 frames, hittable): one billowing shield of the STORM EYE —
 * three puffs on a dark flattened underside, lit slate (`frame` 0) or pale (1), a lone bolt spark
 * at the right flank in frame 1.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function eyeCloudFrame(k) {
  const img = createImage(27, 18);
  const lit = k === 0 ? CLOUD_LIT : SLATE_HI;
  const paint = (_u, v, e) => (e > 0.88 ? RIM : v < -0.35 ? lit : CLOUD_MID);
  fillEllipse(img, 6, 9, 5.5, 5, paint);
  fillEllipse(img, 13, 6.5, 6.5, 5.5, paint);
  fillEllipse(img, 20.5, 9, 5, 5, paint);
  for (let x = 1; x < 26; x++) px(img, x, 14, CLOUD_DK);
  for (let x = 4; x < 22; x++) px(img, x, 15, k === 0 ? RIM : CLOUD_DK);
  if (k === 1) px(img, 24, 7, BOLT_DIM);
  return img;
}

/**
 * `bosses/storm-eye-ring` (45×45, 4 frames, decoration): the electrified halo that wheels round
 * the eye — a speckled granite annulus at radii 13 … 15 and a slate outer band at 19 … 20, eight
 * studs on the compass points with inward comet tails; the stud fire rotates a quarter-step per
 * frame (the swirl), pure integer offsets, no trigonometry.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function eyeRingFrame(k) {
  const img = createImage(45, 45);
  const seed = seedOf('bosses/storm-eye-ring');
  const c = 22;
  for (let y = 0; y < 45; y++) {
    for (let x = 0; x < 45; x++) {
      const dx = x - c;
      const dy = y - c;
      const r2 = dx * dx + dy * dy;
      if (r2 >= 169 && r2 <= 225) px(img, x, y, pick(x, y, seed, 7) === 0 ? RK[2] : RK[0]);
      else if (r2 >= 361 && r2 <= 400) px(img, x, y, pick(x, y, seed + 3, 7) === 0 ? SLATE : RK[1]);
    }
  }
  for (let d = 0; d < 8; d++) {
    const [ox, oy] = RING_DIRS[d];
    const tone = [BOLT, BOLT_WARM, BOLT_DIM, SLATE_TOP][(d + k) % 4];
    for (let j = 1; j <= 3; j++) {
      px(img, c + ox + RING_IN[d][0] * j, c + oy + RING_IN[d][1] * j, tone);
    }
    px(img, c + ox, c + oy, tone);
  }
  return img;
}

/**
 * `bosses/steed-mane` (27×24, 4 frames, decoration): the SQUALL STEED's streamer mane — five
 * filaments drifting on a triangle-wave sway (a third of a period per frame), slate bodies,
 * lit rows every fifth, an icy tip each.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function maneFrame(k) {
  const img = createImage(27, 24);
  for (let s = 0; s < 5; s++) {
    const base = 3 + s * 5;
    const sway = 2 * triangle(s * 7 + k * 6, 24) - 1;
    for (let y = 0; y < 24; y++) {
      const bend = Math.round((sway * y) / 12);
      px(img, base + bend, y, y % 5 === 0 ? SLATE_TOP : SLATE);
      px(img, base + bend + 1, y, y % 5 === 1 ? SLATE_HI : CLOUD_MID);
      px(img, base + bend, 23, ICE_FLOE);
    }
  }
  return img;
}

/**
 * `bosses/steed-crest` (30×18, 2 frames, armour — never hittable): the steed's swept crest plate
 * — a granite dome with a frost ridge, three pale crown spikes and three rivets; frame 1 the
 * damaged look (scoured ridge, a crack across the plate, dimmed rivets).
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function crestFrame(k) {
  const img = createImage(30, 18);
  const seed = seedOf('bosses/steed-crest');
  for (let s = 0; s < 3; s++) {
    drawLine(img, 7 + s * 8, 6, 11 + s * 8, 0, k === 0 ? SUR : SUBS, 2);
  }
  fillEllipse(img, 15, 11, 14, 6.5, (u, v, e, x, y) => {
    if (e > 0.9) return RIM;
    if (v < -0.55 && Math.abs(u) < 0.75) return k === 0 ? SUR : SUBS;
    if (k === 1 && (x + y) % 7 === 3 && e < 0.8) return RIM;
    if (u > 0.5) return RK[1];
    return pick(x, y, seed, 8) === 0 ? RK[2] : RK[0];
  });
  for (let s = 0; s < 3; s++) px(img, 10 + s * 5, 11, k === 0 ? BOLT_WARM : BOLT_DIM);
  return img;
}

/**
 * `bosses/steed-flank` (15×27, 1 frame, decoration): the steed's flank plate — a tall granite
 * slab with a lit leading edge, frost rims top and bottom, and four gill vents whose dark slits
 * stand under pale upper edges.
 *
 * @returns {Image} The frame.
 */
function flankFrame() {
  const img = createImage(15, 27);
  const seed = seedOf('bosses/steed-flank');
  for (let y = 0; y < 27; y++) {
    for (let x = 1; x <= 13; x++) {
      let c = x === 1 ? SLATE_TOP : x === 13 ? RK[1] : pick(x, y, seed, 6) === 0 ? RK[2] : RK[0];
      if (y < 2 || y > 24) c = SUR;
      px(img, x, y, c);
    }
  }
  for (let s = 0; s < 4; s++) {
    drawLine(img, 2, 5 + s * 6, 12, 7 + s * 6, CLOUD_DK);
    drawLine(img, 2, 4 + s * 6, 12, 6 + s * 6, SUBS);
  }
  return img;
}

/**
 * `bg/storm-sky` (`BAND_TILE_W`×{@link SKY_H}, 1 frame): the opaque storm sky of §9 — seven
 * dusk-to-slate gradient steps, each boundary row band softly dithered into its neighbour (flat
 * runs elsewhere, so the band compresses), the horizon glow fixed low in it and four thin cloud
 * dashes drawn with the period wrapped, so the band repeats seamlessly.
 *
 * @returns {Image} The band.
 */
function skyBand() {
  const img = createImage(BAND_TILE_W, SKY_H);
  const seed = seedOf('bg/storm-sky');
  const steps = SKY_STEPS.length;
  for (let y = 0; y < SKY_H; y++) {
    const b = Math.floor((y * steps) / SKY_H);
    const lo = Math.floor((b * SKY_H) / steps);
    const hi = Math.floor(((b + 1) * SKY_H) / steps);
    const d = Math.min(y - lo + 1, hi - y);
    const blend = d <= 2 ? (pick(y, 7, seed, 2) === 0 ? 1 : 2) : 0;
    for (let x = 0; x < BAND_TILE_W; x++) {
      let s = b;
      if (blend > 0 && pick(x, y, seed, 6) === 0) {
        s = blend === 1 ? Math.max(0, b - 1) : Math.min(steps - 1, b + 1);
      }
      setPixel(img, x, y, SKY_STEPS[s]);
    }
  }
  fillEllipse(img, 150, SKY_H - 150, 110, 36, (_u, _v, e) => (e > 0.62 ? SKY_HALO : SKY_CORE));
  for (let s = 0; s < 4; s++) {
    const cy = 40 + pick(s, 11, seed, Math.round(SKY_H / 4));
    const cx = pick(s, 12, seed, BAND_TILE_W);
    const len = 26 + pick(s, 13, seed, 40);
    const pale = mix(CLOUD_LIT, SKY_STEPS[Math.floor((cy * SKY_STEPS.length) / SKY_H)], 0.5);
    for (let k = 0; k < len; k++) {
      pxw(img, cx + k, cy, pale);
      pxw(img, cx + k, cy + 1, mix(pale, SKY_STEPS[3], 0.5));
    }
  }
  return img;
}

/**
 * `bg/storm-flash` (`BAND_TILE_W`×{@link FLASH_H}, 1 frame): the flat-painted lightning shelf that
 * rides the ridge line — painted in **exactly** the four {@link STORM_RAMP_V2} colours with binary
 * alpha (R5-P.P7 froze the ramp into the stage; zone-e.md §9's rule-1 contract: flat so the cycle
 * finds only exact ramp colours in it). A triangle-wave crest (periods that divide the tile
 * width, so it is seamless) with banded colour steps below.
 *
 * @returns {Image} The band.
 */
function flashBand() {
  const img = createImage(BAND_TILE_W, FLASH_H);
  const seed = seedOf('bg/storm-flash');
  for (let x = 0; x < BAND_TILE_W; x++) {
    const crest =
      6 + Math.round(9 * triangle(x, 32) + 7 * triangle(x, 80) + 5 * triangle(x + 20, 40));
    for (let y = crest; y < FLASH_H; y++) {
      const d = y - crest;
      let c = RAMP[0];
      if (d < 2) c = RAMP[3];
      else if (d < 5) c = RAMP[2];
      else {
        const h = pick(x, Math.floor(y / 2), seed, 8);
        if (h === 0) c = RAMP[1];
        else if (y % 3 === 0 && h === 1) c = RAMP[2];
      }
      setPixel(img, x, y, c);
    }
  }
  return img;
}

/**
 * `bg/storm-gust` (`BAND_TILE_W`×{@link GUST_H}, 1 frame): the near wind band of §9 — forty-two
 * short horizontal gust streaks that climb one row every three columns, slate, icy and (every
 * ninth) a lit spark head, placed on wrapped starts so the tile repeats seamlessly in both
 * directions. Sparse binary alpha: the storm shows through.
 *
 * @returns {Image} The band.
 */
function gustBand() {
  const img = createImage(BAND_TILE_W, GUST_H);
  const seed = seedOf('bg/storm-gust');
  for (let i = 0; i < 42; i++) {
    const sx = hash2(i, 0, seed) % BAND_TILE_W;
    const sy = hash2(i, 1, seed) % GUST_H;
    const len = 7 + (hash2(i, 2, seed) % 12);
    let tone = SLATE_HI;
    if (i % 9 === 0) tone = ICE_SHINE;
    else if (i % 3 === 0) tone = ICE_EDGE;
    for (let k = 0; k < len; k++) {
      pxw(img, sx + k, (sy + Math.floor(k / 3)) % GUST_H, tone);
    }
  }
  return img;
}

/**
 * `solid-2`: the banded strata fill — storm rock with a lighter course every fourth row and hash
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
  rect(img, 0, s - 1, s - 1, s - 1, BASE_DARK);
  return img;
}

/**
 * `solid-3`: the veined fill — rock with a diagonal frost-lit quartz vein and its shaded flank.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function veinTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-ridge-v2/solid-3');
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
  const seed = seedOf('tiles/terrain-ridge-v2/floor-2');
  rect(img, 0, 0, s - 1, 0, SUR);
  rect(img, 0, 1, s - 1, 1, SUBS);
  for (let y = 2; y < s - 1; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(x, y, seed, 5) === 0 ? RK[1] : RK[0]);
    }
  }
  rect(img, 0, s - 1, s - 1, s - 1, BASE_DARK);
  return img;
}

/**
 * `floor-3`: the frost-scoured crust — the plain top with a flecked second crust row where the
 * hoar catches the light.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function floor3Tile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-ridge-v2/floor-3');
  rect(img, 0, 0, s - 1, 0, SUR);
  rect(img, 0, 1, s - 1, 1, SUBS);
  for (let x = 0; x < s; x++) {
    if (pick(x, 3, seed, 4) === 0) px(img, x, 2, ICE_FLOE);
  }
  for (let y = 2; y < s - 1; y++) {
    for (let x = 0; x < s; x++) {
      if (y === 2 && getPixel(img, x, y)[0] === ICE_FLOE[0]) continue;
      setPixel(img, x, y, pick(x, y, seed, 6) === 0 ? RK[2] : RK[0]);
    }
  }
  rect(img, 0, s - 1, s - 1, s - 1, BASE_DARK);
  return img;
}

/**
 * `ceiling-2`: the icicle fringe — an attach band on the top rows with per-column rime strands,
 * each contiguous from the ceiling and lit at its tip (design §10's ceiling variant).
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function ceil2Tile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-ridge-v2/ceiling-2');
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
 * The stepped end-cap of a floor run: each column solid from a height that steps three times
 * across the tile (design §10's outer corner), `SUR` on the cap, `SUBS` under it and on the
 * exposed side column, dark {@link BASE_DARK} on the base row; mirrored by `flip`, hung from the
 * top edge by `ceiling`.
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
        dark ? BASE_DARK : cap ? SUR : sub ? SUBS : pick(x, y, seed, 5) === 0 ? RK[2] : RK[0],
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
          ? BASE_DARK
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
 * @returns {Image} The tile.
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
 * `decor-scree`: three frost-capped granite pebbles on the tile foot — non-colliding decoration
 * on a transparent field.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function decorScreeTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-ridge-v2/decor-scree');
  for (let i = 0; i < 3; i++) {
    const cx = 2 + pick(i, 1, seed, s - 6) + i * 2;
    const cy = s - 3 - pick(i, 2, seed, 2);
    const r = 1 + pick(i, 3, seed, 2);
    fillEllipse(img, cx, cy, r + 0.5, r + 0.5, (u, v, e, x, y) => {
      if (e > 0.85) return RIM;
      return v < -0.4 ? SUBS : pick(x, y, seed, 2) === 0 ? RK[0] : RK[2];
    });
  }
  return img;
}

/**
 * `decor-ice-patch`: a hoar patch on the ground, lit along its top edge with one spark —
 * non-colliding decoration on a transparent field.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function decorIceTile(s) {
  const img = createImage(s, s);
  fillEllipse(img, 6, s - 4, 5.2, 2.6, (u, v, e) => {
    if (e > 0.9) return ICE_EDGE;
    return v < -0.3 ? ICE_FLOE : ICE_CANOPY;
  });
  px(img, 4, s - 5, ICE_SHINE);
  return img;
}

/**
 * `decor-pine`: a small storm pine — six tapering rime-green tiers with a lit left edge on a
 * short trunk — non-colliding decoration on a transparent field.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function decorPineTile(s) {
  const img = createImage(s, s);
  for (let d = 0; d <= 6; d++) {
    const y = s - 3 - d;
    const half = Math.floor(d / 2);
    for (let x = 6 - half; x <= 6 + half; x++) {
      px(img, x, y, x === 6 - half ? PINE_LIT : d % 3 === 0 ? PINE : PINE_DK);
    }
  }
  rect(img, 6, s - 2, 7, s - 1, TRUNK);
  return img;
}

/**
 * The thirty-six frames of `tiles/terrain-ridge-v2`: `terrain-ridge`'s whole twenty-tile list
 * first in its order (the base list is off-limits, the §10 classes are added after it), then the
 * five fill/floor/ceiling classes, the four corners, the crack pair and the three non-colliding
 * decor tiles (design §10's enumeration; the frame order is the list this function appends and
 * {@link RIDGE_V2_TILE_NAMES} names).
 *
 * @param {number} size - The tile side (`options.tileSize`).
 * @returns {Image[]} The frames, in list order.
 */
function ridgeTilesV2(size) {
  const base = renderTerrainTiles(size, 'tiles/terrain-ridge');
  const s = size;
  return [
    ...base,
    strataTile(s, seedOf('tiles/terrain-ridge-v2/solid-2')),
    veinTile(s),
    floor2Tile(s),
    floor3Tile(s),
    ceil2Tile(s),
    cornerOuterTile(s, false, seedOf('tiles/terrain-ridge-v2/corner-outer-left'), false),
    cornerOuterTile(s, true, seedOf('tiles/terrain-ridge-v2/corner-outer-right'), false),
    cornerInnerTile(s, false, seedOf('tiles/terrain-ridge-v2/corner-inner-left'), false),
    cornerInnerTile(s, true, seedOf('tiles/terrain-ridge-v2/corner-inner-right'), false),
    cornerOuterTile(s, false, seedOf('tiles/terrain-ridge-v2/ceil-corner-outer'), true),
    cornerInnerTile(s, false, seedOf('tiles/terrain-ridge-v2/ceil-corner-inner'), true),
    crackTile(base[17], s, 1, seedOf('tiles/terrain-ridge-v2/brick-crack')),
    crackTile(base[17], s, 2, seedOf('tiles/terrain-ridge-v2/brick-crack-2')),
    decorScreeTile(s),
    decorIceTile(s),
    decorPineTile(s),
  ];
}
