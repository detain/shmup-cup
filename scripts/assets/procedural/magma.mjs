/**
 * Zone D, **MAGMA DEEP** (plan M2-12) — placeholder art of the volcano → underground zone
 * (decision D24):
 *
 * - `bg/magma-peaks` ({@link PEAKS_TILE_W}×{@link PEAKS_TILE_H}, the far band): distant volcano
 *   cones in dark ash with glowing craters and faint smoke plumes; the cones wrap round the tile
 *   edge, so the band repeats seamlessly.
 * - `bg/magma-lava` ({@link LAVA_TILE_W}×{@link LAVA_TILE_H}, a mid band seen from the caves): a
 *   lake of lava painted **only** in the colours of {@link MAGMA_RAMP} (v1) /
 *   {@link MAGMA_RAMP_V2} (the frozen v2 ramp, R5-P.P7) (so the stage's palette cycle rolls it —
 *   `bg/sea-swell`'s recipe), plus dark crust floes outside the ramp.
 * - Enemies (flying ones face left; hit-flash siblings): `enemies/ember-wisp` (a flickering ember,
 *   2 frames), `enemies/cinder-bat` (an ash bat, wings beating, 2 frames), `enemies/magma-cone` (an
 *   erupting cone on the floor, its crater bubbling, 2 frames), `enemies/magma-bomb` (the lava bomb
 *   it throws, 2 frames), `enemies/cinder-rock` (a cracked rock hanging from a cave roof),
 *   `enemies/slag-crawler` (an armoured slag beetle walking on a floor — the renderer flips it on a
 *   ceiling —, legs alternating, 2 frames), `enemies/basalt-turret` (a basalt dome with a glowing
 *   barrel eye).
 * - CINDER BASTION (CB-04), the core battleship with rotating shield arms: `bosses/bastion-hull`
 *   (the iron hull with its glowing vents), `bosses/bastion-core` (the magma core — the weak point,
 *   2 frames), `bosses/bastion-emitter` (a lane-laser emitter, 2 frames), `bosses/bastion-arm` (a
 *   round shield segment of the rotating arms).
 *
 * Kept low in saturation next to the bullets and capsules where it can be (shmup_feat.md §12,
 * §18): the lava glows orange and yellow, never pink, red-violet or purple like the bullets.
 * Geometry uses only `+ - * /` and `Math.sqrt`, randomness `hash2` seeded from the sprite names,
 * so the pixels are identical on every engine.
 *
 * **Since R5-04.S2 this generator also draws zone D's v2 stand-ins** (design
 * `docs/v2-run/designs/zone-d.md` §14 and §10): the two new enemies, the three new CINDER BASTION
 * parts, the two new §9 bands and its opaque far cave piece, the vent glow accent and the v2
 * tileset sprite `tiles/terrain-magma-v2` — {@link MAGMA_V2_SPRITES}. They appear **only on the
 * `(options.artScale ?? 1) !== 1` path** and every one is `native` (decision RR-1a), so the
 * scale-1 build returns exactly the thirteen v1 sprites above, byte for byte, and the v2 names are
 * simply absent there. The bands are seamless tiles at a half-`FRAME_W` period like zone C's
 * (`bg/dune-sky`); `bg/magma-chimney`'s stalactite tips are painted in **exactly** the frozen
 * {@link MAGMA_RAMP_V2} colours (R5-P.P7 wrote them into `content/stages/zone-d.stage.json`'s
 * `cycles` — the art §9's mid layer will cycle), every other new colour at Chebyshev distance
 * ≥ 3 from every reserved ramp (bible §4.4, asserted by
 * `test/scripts/assets/procedural-zone-d.test.ts`).
 *
 * **Public API.** {@link generate}, {@link MAGMA_SPRITES}, {@link MAGMA_RAMP} (the colours zone D's
 * v1 palette cycle named), {@link MAGMA_RAMP_V2} (the frozen v2 ramp zone D's cycle names since
 * R5-P.P7), {@link PEAKS_TILE_W} / {@link PEAKS_TILE_H}, {@link LAVA_TILE_W} / {@link LAVA_TILE_H}
 * (the bands' tile sizes, their parallax `spacing`) — and, since R5-04.S2,
 * {@link MAGMA_V2_SPRITES}, {@link MAGMA_V2_TILE_NAMES}, {@link BAND_TILE_W}, {@link DEEP_H},
 * {@link CHIMNEY_H}, {@link DRIFT_H}.
 *
 * @module
 */
import { createImage, getPixel, setPixel } from '../image.mjs';
import { scaleImage } from '../interim.mjs';
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
import { FRAME_W } from '../../frame.mjs';
import { offRamp } from '../v2kit.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/magma-peaks` tile (its parallax `spacing`). */
export const PEAKS_TILE_W = 128;

/** Height of the `bg/magma-peaks` tile. */
export const PEAKS_TILE_H = 56;

/** Width of the `bg/magma-lava` tile (its parallax `spacing`). */
export const LAVA_TILE_W = 128;

/** Height of the `bg/magma-lava` tile. */
export const LAVA_TILE_H = 40;

/**
 * The lava lake's four colours, dark → bright — the exact colours zone D's palette cycle names
 * (`content/stages/zone-d.stage.json`).
 */
export const MAGMA_RAMP = Object.freeze(['#5a1808', '#8a2c0a', '#c04a10', '#e87a1c']);

/**
 * Zone D's frozen v2 ramp (R5-P.P7, decision D24's v2 lava — `plan_resolution.md` §6, design
 * `docs/v2-run/designs/zone-d.md` §9): the six colours `content/stages/zone-d.stage.json` names
 * now, dark ember → bright — drawn by `bg/magma-lava` only at an art scale ≠ 1 (RR-1: the scale-1
 * build keeps {@link MAGMA_RAMP} byte for byte).
 */
export const MAGMA_RAMP_V2 = Object.freeze([
  '#4a1206',
  '#7c1e08',
  '#b0330c',
  '#d95f14',
  '#ef8a26',
  '#f7bd4d',
]);

/** The sprites this generator draws, in order. */
export const MAGMA_SPRITES = Object.freeze([
  'bg/magma-peaks',
  'bg/magma-lava',
  'enemies/ember-wisp',
  'enemies/cinder-bat',
  'enemies/magma-cone',
  'enemies/magma-bomb',
  'enemies/cinder-rock',
  'enemies/slag-crawler',
  'enemies/basalt-turret',
  'bosses/bastion-hull',
  'bosses/bastion-core',
  'bosses/bastion-emitter',
  'bosses/bastion-arm',
]);

/** The v2 stand-in names {@link generate} adds at an art scale ≠ 1, in its output order (§14). */
export const MAGMA_V2_SPRITES = Object.freeze([
  'enemies/slag-mine',
  'enemies/magma-geode',
  'bosses/bastion-prow',
  'bosses/bastion-tower',
  'bosses/bastion-pod',
  'bg/magma-deep',
  'bg/magma-chimney',
  'bg/cinder-drift',
  'fx/glow-magma-vent',
  'tiles/terrain-magma-v2',
]);

/** The four §10 variant tiles after `terrain-magma`'s twenty, in list order (ids 21–24). */
export const MAGMA_V2_TILES = /** @type {const} */ (['obsidian', 'brick-hot', 'lava-drip', 'vent']);

/** The tile names of `tiles/terrain-magma-v2`: `terrain-magma`'s list verbatim, then the variants. */
export const MAGMA_V2_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...MAGMA_V2_TILES]);

/**
 * Tile width of the three §9 bands `bg/magma-deep`, `bg/magma-chimney` and `bg/cinder-drift`:
 * half the frame, derived from `FRAME_W` — the zone-C precedent (`bg/dune-sky`; design §14 asks
 * full-frame bands, an atlas frame cannot exceed the 512-page scenario of
 * `test/scripts/assets/pipeline-edge.test.ts`, and every shipped band here is a seamless
 * repeating tile, so these are, at a period that fills the frame exactly twice).
 */
export const BAND_TILE_W = FRAME_W / 2;

/**
 * Height of the `bg/magma-deep` band: 42 tile rows. Design §14 asks 576, which exceeds the same
 * 512-page scenario's bound (a frame dimension may not pass 510 px); the vertical slack §9's own
 * arithmetic computes (360 + 151) still fits at 504 with the repeat margin — disclosed deviation.
 */
export const DEEP_H = 42 * TILE_SIZE;

/** Height of the `bg/magma-chimney` band (zone-d.md §14: 168 = 14 tile rows). */
export const CHIMNEY_H = 14 * TILE_SIZE;

/** Height of the `bg/cinder-drift` band (zone-d.md §14: 48 = 4 tile rows). */
export const DRIFT_H = 4 * TILE_SIZE;

/**
 * Generates zone D's art: the thirteen v1 sprites always, plus the ten v2 stand-ins of design
 * §14 when the build runs at an art scale ≠ 1 (decision RR-1a).
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's art scale and tile
 *   side (the pipeline passes both; `artScale` 1 or absent draws the v1 set — the cycled lava
 *   band on the v1 ramp — byte for byte, `tileSize` defaults to the v2 {@link TILE_SIZE}).
 * @returns {SpriteDef[]} {@link MAGMA_SPRITES} in that order at art scale 1; the v1 set followed
 *   by {@link MAGMA_V2_SPRITES} in theirs at any other scale (the new names all `native`, their
 *   `@flash` siblings derived by the pipeline's flash pass).
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  const v2 = artScale !== 1;
  const flash = { hitFlash: true };
  const sprites = [
    makeSprite('bg/magma-peaks', [peaks()], 'magma', { anchor: [0, 0] }),
    makeSprite(
      'bg/magma-lava',
      [v2 ? scaleImage(lava(MAGMA_RAMP_V2), artScale) : lava()],
      'magma',
      {
        anchor: [0, 0],
        native: v2,
      },
    ),
    makeSprite('enemies/ember-wisp', [wispFrame(0), wispFrame(1)], 'magma', {
      hitFlash: true,
      animations: { flicker: [0, 1] },
    }),
    makeSprite('enemies/cinder-bat', [batFrame(-1), batFrame(1)], 'magma', {
      hitFlash: true,
      animations: { fly: [0, 1] },
    }),
    makeSprite('enemies/magma-cone', [coneFrame(false), coneFrame(true)], 'magma', {
      hitFlash: true,
      animations: { bubble: [0, 1] },
    }),
    makeSprite('enemies/magma-bomb', [bombFrame('#f0a030'), bombFrame('#f8d860')], 'magma', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('enemies/cinder-rock', [rockFrame()], 'magma', flash),
    makeSprite('enemies/slag-crawler', [crawlerFrame(0), crawlerFrame(1)], 'magma', {
      hitFlash: true,
      animations: { walk: [0, 1] },
    }),
    makeSprite('enemies/basalt-turret', [turretFrame()], 'magma', flash),
    makeSprite('bosses/bastion-hull', [hullFrame()], 'magma', flash),
    makeSprite('bosses/bastion-core', [coreFrame('#f8a040'), coreFrame('#f8e070')], 'magma', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('bosses/bastion-emitter', [emitterFrame(0), emitterFrame(1)], 'magma', {
      hitFlash: true,
      animations: { charge: [0, 1] },
    }),
    makeSprite('bosses/bastion-arm', [armFrame()], 'magma', flash),
  ];
  if (!v2) return sprites;
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  return sprites.concat([
    makeSprite('enemies/slag-mine', [0, 1, 2, 3].map(mineFrame), 'magma', {
      ...hit,
      animations: { pulse: [0, 1, 2, 3] },
    }),
    makeSprite('enemies/magma-geode', [0, 1, 2, 3].map(geodeFrame), 'magma', {
      ...hit,
      animations: { idle: [0, 1], hatch: [2, 3] },
    }),
    makeSprite('bosses/bastion-prow', [prowFrame()], 'magma', hit),
    makeSprite('bosses/bastion-tower', [towerFrame(0), towerFrame(1)], 'magma', {
      ...hit,
      animations: { turn: [0, 1] },
    }),
    makeSprite('bosses/bastion-pod', [0, 1, 2, 3].map(podFrame), 'magma', {
      ...hit,
      animations: { pulse: [0, 1, 2, 3] },
    }),
    makeSprite('bg/magma-deep', [deepBand()], 'magma', { anchor: [0, 0], ...native }),
    makeSprite('bg/magma-chimney', [chimneyBand()], 'magma', { anchor: [0, 0], ...native }),
    makeSprite('bg/cinder-drift', [driftBand(0), driftBand(1)], 'magma', {
      anchor: [0, 0],
      ...native,
      animations: { drift: [0, 1] },
    }),
    makeSprite('fx/glow-magma-vent', [ventGlow(0), ventGlow(1)], 'magma', {
      anchor: [18, 12],
      ...native,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('tiles/terrain-magma-v2', magmaTilesV2(size), 'magma', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(MAGMA_V2_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ]);
}

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
 * The peaks band: two volcano cones (their slopes wrap round the tile edge) in dark ash with a
 * lighter ridge line, glowing craters and translucent smoke plumes rising from them.
 *
 * @returns {Image} The tile.
 */
function peaks() {
  const w = PEAKS_TILE_W;
  const h = PEAKS_TILE_H;
  const ash = color('#2e2226');
  const ridge = color('#4a3634');
  const glow = color('#e0602a');
  const hot = color('#f8b048');
  const smoke = color('#5a4a4e');
  const cones = [
    { x: 34, top: 14, slope: 0.9 },
    { x: 96, top: 26, slope: 1.1 },
  ];
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    let top = h;
    for (const cone of cones) {
      let dx = Math.abs(x - cone.x);
      if (dx > w / 2) dx = w - dx;
      // A flat crater 4 px wide, then the slope.
      const y = cone.top + (dx < 2 ? 0 : (dx - 2) * cone.slope);
      if (y < top) top = y;
    }
    const start = Math.round(top);
    for (let y = start; y < h; y++) setPixel(image, x, y, y === start ? ridge : ash);
  }
  const seed = seedOf('bg/magma-peaks');
  for (const cone of cones) {
    for (let dx = -2; dx <= 2; dx++) {
      setPixel(image, cone.x + dx, cone.top, Math.abs(dx) < 2 ? hot : glow);
      setPixel(image, cone.x + dx, cone.top + 1, glow);
    }
    // The plume: a column of translucent puffs drifting right as it rises.
    for (let k = 0; k < 5; k++) {
      const cy = cone.top - 3 - k * 3;
      if (cy < 1) break;
      const cx = cone.x + k * 1.5 + (hash2(k, cone.x, seed) % 2);
      fillEllipse(image, cx, cy, 2 + k * 0.6, 1.6 + k * 0.3, () => withAlpha(smoke, 150 - k * 22));
    }
  }
  return image;
}

/**
 * The lava band: 3-px bands stepping through `rampHex` (v1's {@link MAGMA_RAMP}, the frozen v2
 * {@link MAGMA_RAMP_V2} on the v2 path), bent by two triangle waves (64 and 32 px — they divide
 * the tile width, so it repeats seamlessly), with dark crust floes (outside either ramp, so the
 * palette cycle leaves them alone).
 *
 * @param {readonly string[]} [rampHex] - The ramp to paint, default {@link MAGMA_RAMP}.
 * @returns {Image} The tile.
 */
function lava(rampHex = MAGMA_RAMP) {
  const ramp = rampHex.map(color);
  const crust = color('#2a1a18');
  const image = createImage(LAVA_TILE_W, LAVA_TILE_H);
  for (let x = 0; x < LAVA_TILE_W; x++) {
    const swell = Math.round(3 * triangle(x, 64) + 2 * triangle(x + 11, 32));
    for (let y = 0; y < LAVA_TILE_H; y++) {
      setPixel(image, x, y, ramp[Math.floor((y + swell) / 3) % ramp.length]);
    }
  }
  const seed = seedOf('bg/magma-lava');
  for (let i = 0; i < 7; i++) {
    const cx = 8 + (hash2(i, 0, seed) % (LAVA_TILE_W - 16));
    const cy = 6 + (hash2(i, 1, seed) % (LAVA_TILE_H - 12));
    const rx = 3 + (hash2(i, 2, seed) % 5);
    fillEllipse(image, cx, cy, rx + 0.5, 1.5, () => crust);
  }
  return image;
}

/**
 * An ember wisp: a round glowing ember with a flame trailing to the right (it flies left); the
 * flame's tip flickers between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function wispFrame(frame) {
  const w = 12;
  const h = 10;
  const edge = color('#a02c10');
  const flame = color('#e8641c');
  const heart = color('#f8c860');
  const image = createImage(w, h);
  drawLine(image, 5, 4.5, 10, 3 + frame * 2, withAlpha(flame, SOFT_ALPHA), 2);
  drawLine(image, 6, 4.5, 11, 5 - frame, withAlpha(edge, 160));
  fillEllipse(image, 4, 4.5, 3.6, 3.6, (u, v, e) => (e > 0.75 ? edge : e > 0.4 ? flame : heart));
  return image;
}

/**
 * The cinder bat: an ash-grey body with ember eyes on the left and ragged wings up (`wing` −1) or
 * down (+1).
 *
 * @param {number} wing - −1 or 1.
 * @returns {Image} The frame.
 */
function batFrame(wing) {
  const w = 16;
  const h = 10;
  const body = color('#3a2c2c');
  const membrane = color('#6a4a44');
  const eye = color('#f09030');
  const image = createImage(w, h);
  drawLine(image, 8, 5, 3, 5 + 4 * wing, membrane, 2);
  drawLine(image, 8, 5, 13, 5 + 4 * wing, membrane, 2);
  fillEllipse(image, 8, 5, 4, 2.5, () => body);
  fillEllipse(image, 4, 4.5, 2, 1.8, () => body);
  setPixel(image, 3, 4, eye);
  setPixel(image, 3, 5, eye);
  return image;
}

/**
 * The magma cone: a small ash cone standing on a floor with a glowing crater; frame 1 lifts a lava
 * bubble over it.
 *
 * @param {boolean} bubble - Frame 1.
 * @returns {Image} The frame.
 */
function coneFrame(bubble) {
  const w = 22;
  const h = 12;
  const ash = color('#4a3632');
  const lit = color('#6a4c44');
  const glow = color('#e0602a');
  const hot = color('#f8c050');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const dx = Math.abs(x - 10.5);
    const top = Math.round(3 + (dx < 3 ? 0 : (dx - 3) * 1.1));
    for (let y = top; y < h; y++) setPixel(image, x, y, x < 10 && y - top < 2 ? lit : ash);
  }
  for (let x = 8; x <= 13; x++) setPixel(image, x, 3, x > 9 && x < 12 ? hot : glow);
  drawLine(image, 7, 6, 5, 11, glow);
  if (bubble) fillEllipse(image, 10.5, 1.5, 2, 1.5, () => hot);
  return image;
}

/**
 * A lava bomb: a small glowing blob (`tone` in its middle) with a dark crust rim.
 *
 * @param {string} tone - The middle colour.
 * @returns {Image} The frame.
 */
function bombFrame(tone) {
  const image = createImage(6, 6);
  const crust = color('#5a2010');
  const hot = color(tone);
  const glow = color('#e0602a');
  fillEllipse(image, 2.5, 2.5, 2.8, 2.8, (_u, _v, e) => (e > 0.8 ? crust : e > 0.45 ? glow : hot));
  return image;
}

/**
 * A cinder rock: a lumpy dark rock (seeded speckles, a lit top) with glowing cracks.
 *
 * @returns {Image} The frame.
 */
function rockFrame() {
  const size = 12;
  const seed = seedOf('enemies/cinder-rock');
  const rim = color('#1a1212');
  const rock = color('#3e3030');
  const lit = color('#5c4844');
  const crack = color('#d0501c');
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.8, 5.2, (u, v, e, x, y) => {
    if (e > 0.85 + (hash2(x, y, seed) % 3) * 0.04) return rim;
    if (v < -0.5) return lit;
    return rock;
  });
  drawLine(image, 3, 4, 6, 7, crack);
  drawLine(image, 6, 7, 8, 6, crack);
  return image;
}

/**
 * The slag crawler: a squat beetle of cooled slag standing on a floor — a domed shell with a
 * glowing seam, a head on the left, three legs a side that alternate between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function crawlerFrame(frame) {
  const w = 16;
  const h = 10;
  const leg = color('#1e1614');
  const shell = color('#4a3a36');
  const seam = color('#e0682a');
  const eye = color('#f8c050');
  const image = createImage(w, h);
  for (let k = 0; k < 3; k++) {
    const x = 5 + k * 3.5;
    const step = (k + frame) % 2 === 0 ? -1 : 1;
    drawLine(image, x, 6, x + step, 9, leg);
  }
  fillEllipse(image, 9, 6, 6.5, 5, (u, v) => {
    if (v > 0.2) return null;
    return Math.abs(v + 0.45) < 0.12 ? seam : shell;
  });
  fillEllipse(image, 2.5, 5, 2.2, 1.8, () => shell);
  setPixel(image, 1, 4, eye);
  return image;
}

/**
 * The basalt turret: a dark hexagonal dome on a floor with a glowing eye and a short barrel.
 *
 * @returns {Image} The frame.
 */
function turretFrame() {
  const w = 14;
  const h = 11;
  const rim = color('#1a1414');
  const stone = color('#3a3234');
  const lit = color('#58484a');
  const eye = color('#f09030');
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
 * CINDER BASTION's hull: a long iron body (dark rim, riveted plates in seeded tones, a lit top
 * edge) with three glowing vents along its side and a stack at the back.
 *
 * @returns {Image} The frame.
 */
function hullFrame() {
  const w = 56;
  const h = 40;
  const seed = seedOf('bosses/bastion-hull');
  const rim = color('#140e0e');
  const plate = color('#3c3434');
  const plate2 = color('#463c3a');
  const lit = color('#6a5a56');
  const vent = color('#e0602a');
  const hot = color('#f8b048');
  const image = createImage(w, h);
  // The body: a rounded box, the bow (left) tapered.
  for (let y = 2; y < h - 2; y++) {
    const v = Math.abs(y - (h - 1) / 2) / ((h - 4) / 2);
    const inset = Math.round(10 * v * v);
    for (let x = inset; x < w - 2; x++) {
      const edge = x === inset || y === 2 || y === h - 3 || x === w - 3;
      if (edge) setPixel(image, x, y, rim);
      else if (y < 6) setPixel(image, x, y, lit);
      else
        setPixel(
          image,
          x,
          y,
          hash2(Math.floor(x / 8), Math.floor(y / 6), seed) % 2 ? plate : plate2,
        );
    }
  }
  // Plate seams and rivets.
  for (let x = 16; x < w - 4; x += 10) drawLine(image, x, 6, x, h - 5, rim);
  // Vents along the waterline.
  for (let k = 0; k < 3; k++) {
    const vx = 20 + k * 11;
    for (let x = vx; x < vx + 6; x++) {
      setPixel(image, x, 25, vent);
      setPixel(image, x, 26, hot);
      setPixel(image, x, 27, vent);
    }
  }
  // The stack at the stern.
  fillEllipse(image, 46, 3, 4, 3, (_u, v) => (v < -0.3 ? vent : rim));
  return image;
}

/**
 * CINDER BASTION's core: a glowing magma sphere (`tone` at its heart) in a dark iron ring.
 *
 * @param {string} tone - The heart's colour.
 * @returns {Image} The frame.
 */
function coreFrame(tone) {
  const size = 16;
  const ring = color('#1e1414');
  const iron = color('#5a4a46');
  const magma = color('#e0602a');
  const heart = color(tone);
  const image = createImage(size, size);
  fillEllipse(image, 7.5, 7.5, 7.5, 7.5, (_u, _v, e) => {
    if (e > 0.9) return ring;
    if (e > 0.72) return iron;
    if (e > 0.4) return magma;
    return heart;
  });
  return image;
}

/**
 * A lane-laser emitter: an iron barrel pointing left with a charging muzzle (brighter in frame 1).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function emitterFrame(frame) {
  const w = 18;
  const h = 10;
  const rim = color('#140e0e');
  const iron = color('#4a403e');
  const lit = color('#6e605c');
  const muzzle = mix(color('#c04a10'), color('#f8d860'), frame === 0 ? 0.2 : 1);
  const image = createImage(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const edge = y === 1 || y === h - 2 || x === w - 2;
      setPixel(image, x, y, edge ? rim : y < 4 ? lit : iron);
    }
  }
  for (let y = 3; y <= 6; y++) {
    setPixel(image, 0, y, muzzle);
    setPixel(image, 1, y, muzzle);
  }
  return image;
}

/**
 * A shield-arm segment: an iron disc with a hot orange rim and a dark boss in the middle.
 *
 * @returns {Image} The frame.
 */
function armFrame() {
  const size = 12;
  const rim = color('#c04a10');
  const iron = color('#4e4442');
  const lit = color('#766662');
  const boss = color('#1e1616');
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.5, 5.5, (u, v, e) => {
    if (e > 0.82) return rim;
    if (e < 0.3) return boss;
    return u + v < -0.5 ? lit : iron;
  });
  return image;
}

// ---------------------------------------------------------------------------
// The R5-04.S2 v2 stand-ins (design `docs/v2-run/designs/zone-d.md` §14 and §10), drawn at the
// final v2 pixel size and only on the `artScale !== 1` path. Flat colours are at Chebyshev
// distance ≥ 3 from every reserved palette-cycle ramp — except `bg/magma-chimney`'s glowing
// stalactite tips, which paint the frozen v2 ramp itself (design §9: "the chimney fringe … paints
// exactly these") so the §9 mid-layer cycle will roll them.
// ---------------------------------------------------------------------------

/** The zone's own terrain palette — the one `terrain.mjs` paints `tiles/terrain-magma` with. */
const PAL = TERRAIN_PALETTES['tiles/terrain-magma'];
const SUR = color(PAL.surface);
const SUBS = color(PAL.subsurface);
const RK = PAL.rock.map(color);

const DST = color('#1c1414');
const ASH = color('#524642');
const SPARK = color('#c86420');
const MOLTEN = color('#2a1408');
const EMBER = color('#7a3a1a');
const LAVA_C = color('#cc6a1c');
const LAVA_H = color('#f0b040');

const PIRIM = color('#140e0e');
const PPLATE = color('#3c3434');
const PPLATE2 = color('#463c3a');
const PLIT = color('#6a5a56');
const VENT = color('#e0602a');
const HOT = color('#f8b048');

/** The six frozen v2 ramp colours as paint — only the chimney tips may use these. */
const RAMP6 = MAGMA_RAMP_V2.map(color);

/** The deep band's strata steps, dark roof sediments down to the warmer deep stone (§9 slack). */
const DEEP_STEPS = [
  color('#160b0b'),
  color('#1e100e'),
  color('#251411'),
  color('#2c1914'),
  color('#331d17'),
  color('#3a221a'),
  color('#43271d'),
  color('#4c2d22'),
];
const DEEP_DIKE = color('#3d281f');
const DEEP_VEIN = color('#5a2a1e');
const DEEP_VEIN_LIT = color('#6b3320');

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
 * `enemies/slag-mine` (15×15, 4 frames, hittable): the drifting ground mine of §6 — a spiked slag
 * ball on dark stone with a fuse eye whose ember pulses through the four frames.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function mineFrame(k) {
  const img = createImage(15, 15);
  const seed = seedOf('enemies/slag-mine');
  const eye = [color('#f0a838'), color('#d97a24'), color('#b4501c'), color('#f0a838')][k];
  fillEllipse(img, 7, 7.5, 5, 4.4, (u, v, e, x, y) => {
    if (e > 0.82) return DST;
    return pick(x, y, seed, 5) === 0 ? RK[2] : RK[0];
  });
  rect(img, 3, 2, 4, 3, RK[1]);
  rect(img, 10, 2, 11, 3, RK[1]);
  rect(img, 3, 11, 4, 12, RK[1]);
  rect(img, 10, 11, 11, 12, RK[1]);
  rect(img, 0, 6, 1, 8, RK[1]);
  rect(img, 13, 6, 14, 8, RK[1]);
  px(img, 4, 2, RK[2]);
  px(img, 11, 2, RK[2]);
  px(img, 0, 6, RK[2]);
  px(img, 14, 6, RK[2]);
  px(img, 7, 2, RK[2]);
  px(img, 8, 2, RK[2]);
  const bright = k % 2 === 0 ? mix(eye, HOT, 0.5) : eye;
  px(img, 6, 5, bright);
  px(img, 7, 5, eye);
  px(img, 6, 6, eye);
  px(img, 7, 6, mix(eye, RK[0], 0.35));
  return img;
}

/**
 * `enemies/magma-geode` (24×18, 4 frames, hittable): the floor mound of §6 that hatches
 * cinder-bats — a crusted geode on a solid ground row; frames 0–1 idle (the seam dark, then
 * sparked), 2–3 hatch (the pocket cracks open onto glowing crystals, wider in the last).
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function geodeFrame(k) {
  const img = createImage(24, 18);
  const seed = seedOf('enemies/magma-geode');
  fillEllipse(img, 11.5, 13.5, 10.5, 9, (u, v, e, x, y) => {
    if (e > 0.9) return DST;
    if (v < -0.55) return RK[2];
    return pick(x, y, seed, 6) === 0 ? SUBS : RK[0];
  });
  rect(img, 1, 17, 22, 17, DST);
  if (k <= 1) {
    drawLine(img, 8, 12, 15, 7, DST, k === 0 ? 1 : 2);
    if (k === 1) {
      px(img, 11, 9, LAVA_C);
      px(img, 12, 10, SPARK);
    }
  } else {
    const wide = k === 2 ? 0 : 1;
    rect(img, 7 - wide, 8 - wide, 16 + wide, 13 + wide, DST);
    rect(img, 7 - wide, 7 - wide, 16 + wide, 7 - wide, SUBS);
    for (let d = 0; d <= 4 + wide; d++) {
      px(img, 8 + d, 12 - d, d === 4 + wide ? LAVA_H : color('#c8783c'));
      px(img, 15 - d, 9 + d, d === 2 ? color('#e8b844') : color('#c8783c'));
    }
    px(img, 11 + wide, 10, color('#e8b844'));
    px(img, 13, 8 + wide, LAVA_H);
    if (wide) {
      px(img, 6, 10, SPARK);
      px(img, 17, 9, SPARK);
    }
  }
  return img;
}

/**
 * `bosses/bastion-prow` (27×39, 1 frame, hittable): CINDER BASTION's armoured bow (§8 part 2) —
 * a tall riveted iron plate tapering to its point low left, three glowing vent slits along the
 * waterline and a lit deck edge.
 *
 * @returns {Image} The frame.
 */
function prowFrame() {
  const img = createImage(27, 39);
  const seed = seedOf('bosses/bastion-prow');
  for (let y = 0; y < 39; y++) {
    const t = Math.abs(y - 10);
    const x0 = Math.min(12, 1 + Math.floor((t * t) / 14) + Math.floor(t / 3));
    const x1 = 26 - Math.min(5, Math.floor(Math.abs(y - 4) / 6));
    for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === 0 || y === 38;
      if (edge) setPixel(img, x, y, PIRIM);
      else if (y < 3) setPixel(img, x, y, PLIT);
      else
        setPixel(img, x, y, pick(Math.floor(x / 3), Math.floor(y / 4), seed, 2) ? PPLATE : PPLATE2);
    }
    if (y % 4 === 2) px(img, x0 + 1, y, PLIT);
    if (y > 6 && y % 6 === 0) {
      px(img, x1 - 1, y, PIRIM);
    }
  }
  rect(img, 5, 0, 10, 1, PLIT);
  px(img, 5, 1, PIRIM);
  for (const vy of [16, 22, 28]) {
    rect(img, 6, vy, 10, vy, VENT);
    rect(img, 6, vy + 1, 10, vy + 1, HOT);
    rect(img, 7, vy + 2, 9, vy + 2, VENT);
  }
  return img;
}

/**
 * `bosses/bastion-tower` (36×27, 2 frames, hittable): the superstructure tower of §8 part 3 — a
 * plated block with two glowing smokestacks and an ember window slit; frame 1 is the damaged
 * look (§10's mid-fight state): a scoured hole in the forward plate and a broken stack lip.
 *
 * @param {number} k - 0 intact, 1 damaged.
 * @returns {Image} The frame.
 */
function towerFrame(k) {
  const img = createImage(36, 27);
  const seed = seedOf('bosses/bastion-tower');
  rect(img, 0, 24, 35, 26, PIRIM);
  rect(img, 0, 23, 35, 23, PLIT);
  rect(img, 6, 7, 29, 22, PPLATE);
  for (let x = 6; x <= 29; x++) {
    px(img, x, 7, PLIT);
    px(img, x, 22, PIRIM);
  }
  for (let y = 7; y <= 22; y++) {
    px(img, 6, y, PIRIM);
    px(img, 29, y, PIRIM);
    if (pick(3, y, seed, 3) === 0) px(img, 7, y, PLIT);
    if (pick(4, y, seed, 3) === 0) px(img, 28, y, PPLATE2);
  }
  for (const sx of [13, 20]) rect(img, sx, 9, sx, 22, PIRIM);
  rect(img, 8, 14, 17, 15, VENT);
  px(img, 10, 14, HOT);
  px(img, 14, 15, HOT);
  for (const bx of [21, 27]) {
    rect(img, bx, 0, bx + 3, 7, PPLATE2);
    px(img, bx, 1, PIRIM);
    px(img, bx + 3, 1, PIRIM);
    rect(img, bx + 1, 0, bx + 2, 0, HOT);
    rect(img, bx + 1, 1, bx + 2, 1, VENT);
  }
  if (k === 1) {
    rect(img, 7, 9, 11, 13, DST);
    px(img, 12, 9, PIRIM);
    px(img, 12, 13, PIRIM);
    px(img, 8, 14, SPARK);
    px(img, 10, 8, SPARK);
    px(img, 27, 0, PIRIM);
    px(img, 28, 0, PIRIM);
    px(img, 26, 1, PIRIM);
  }
  return img;
}

/**
 * `bosses/bastion-pod` (18×18, 4 frames, hittable): the pods of §8 parts 16–17 — the magma heart
 * the weak point, an iron ring around a glowing sphere whose four frames pulse brighter and dim
 * again (same recipe as the v1 core, one frame further).
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function podFrame(k) {
  const img = createImage(18, 18);
  const seed = seedOf('bosses/bastion-pod');
  const ring = color('#1e1414');
  const iron = color('#5a4a46');
  const heart = [color('#f8a040'), color('#f8d860'), color('#f8e070'), color('#f8c050')][k];
  const band = 0.4 + (k % 2) * 0.06;
  fillEllipse(img, 8.5, 8.5, 8.5, 8.5, (u, v, e, x, y) => {
    if (e > 0.9) return ring;
    if (e > 0.72) return pick(x, y, seed, 5) === 0 ? iron : VENT;
    if (e > band) return VENT;
    return heart;
  });
  return img;
}

/**
 * `bg/magma-deep` (`BAND_TILE_W`×{@link DEEP_H}, 1 frame, fully opaque): the far cave depth of
 * §9 — eight horizontal strata whose boundaries wobble on triangle periods that divide the tile,
 * a few darker dikes and sparse ember veins, all blocky so the page compresses (the band sits
 * behind the rock; nothing in it may read as a hazard).
 *
 * @returns {Image} The band.
 */
function deepBand() {
  const img = createImage(BAND_TILE_W, DEEP_H);
  const seed = seedOf('bg/magma-deep');
  const steps = DEEP_STEPS.length;
  const wob = (x) =>
    Math.round(4 * triangle(x, 160) + 3 * triangle(x + 50, 80) + 2 * triangle(x + 13, 40));
  for (let x = 0; x < BAND_TILE_W; x++) {
    const w = wob(x);
    const dike = x === 58 || x === 59 || x === 147 || x === 148 || x === 251 || x === 252;
    for (let y = 0; y < DEEP_H; y++) {
      let s = Math.floor((y * steps) / DEEP_H);
      const b = Math.floor(((s + 1) * DEEP_H) / steps) + w;
      if (y === b || y === b + 1) s += 1;
      else if (y === b - 1 || y === b - 2) s -= 1;
      const q = pick(Math.floor(x / 4), Math.floor(y / 3), seed, 26);
      if (q === 0) s = Math.min(steps - 1, s + 1);
      else if (q === 13) s = Math.max(0, s - 1);
      setPixel(img, x, y, dike && y % 40 > 1 ? DEEP_DIKE : DEEP_STEPS[s]);
    }
  }
  for (let i = 0; i < 9; i++) {
    const cy = 14 + pick(i, 1, seed, DEEP_H - 28);
    const cx = pick(i, 2, seed, BAND_TILE_W);
    const len = 8 + pick(i, 3, seed, 14);
    const mid = Math.floor(len / 2);
    for (let m = 0; m < len; m++) {
      pxw(img, cx + m, cy, m === mid ? DEEP_VEIN_LIT : DEEP_VEIN);
      pxw(img, cx + m, cy + 1, DEEP_VEIN);
    }
  }
  return img;
}

/**
 * `bg/magma-chimney` (`BAND_TILE_W`×{@link CHIMNEY_H}, 1 frame, green key): the hanging
 * stalactite fringe of §9 — a solid attach band at the ceiling edge, per-column strands down to a
 * seamless triangle-wave fringe line, and at the deep strands' tips the glowing tiers painted in
 * **exactly** the frozen v2 ramp colours (the cycle art of §9's rule-1 contract; binary alpha).
 *
 * @returns {Image} The band.
 */
function chimneyBand() {
  const img = createImage(BAND_TILE_W, CHIMNEY_H);
  const seed = seedOf('bg/magma-chimney');
  const fringe = (x) =>
    26 + Math.round(10 * triangle(x, 32) + 22 * triangle(x + 40, 80) + 40 * triangle(x, 160));
  for (let x = 0; x < BAND_TILE_W; x++) {
    const f = fringe(x);
    setPixel(img, x, 0, RK[1]);
    setPixel(img, x, 1, RK[0]);
    setPixel(img, x, 2, RK[0]);
    for (let y = 3; y <= f; y++) {
      let c = RK[1];
      if (pick(Math.floor(x / 2), Math.floor(y / 3), seed, 7) === 0) c = RK[2];
      if (y % 13 === 7) c = SUBS;
      setPixel(img, x, y, c);
    }
    px(img, x, f + 1, DST);
    if (f >= 40) {
      setPixel(img, x, f, RAMP6[5]);
      setPixel(img, x, f - 1, RAMP6[5]);
      setPixel(img, x, f - 2, RAMP6[4]);
      setPixel(img, x, f - 3, RAMP6[3]);
      if (f >= 70) {
        setPixel(img, x, f - 4, RAMP6[2]);
        if (f >= 90) setPixel(img, x, f - 5, RAMP6[1]);
      }
    }
  }
  return img;
}

/**
 * `bg/cinder-drift` (`BAND_TILE_W`×{@link DRIFT_H}, 2 frames, green key): the fore veil of §9 —
 * sparse ash streaks and single motes drifting on seeded lines, a few sparked to ember; the two
 * frames slide at different speeds. Surface only: the veil stays far below the density that
 * could hide a bullet lane, and every feature is wrapped, so the band repeats seamlessly.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function driftBand(k) {
  const img = createImage(BAND_TILE_W, DRIFT_H);
  const seed = seedOf('bg/cinder-drift');
  for (let i = 0; i < 10; i++) {
    const y = 4 + pick(i, 1, seed, DRIFT_H - 8);
    const x0 = pick(i, 2, seed, BAND_TILE_W) + k * (3 + pick(i, 5, seed, 4));
    const len = 5 + pick(i, 3, seed, 12);
    const mid = Math.floor(len / 2);
    const lit = pick(i, 4, seed, 3) === 0;
    for (let m = 0; m < len; m++) {
      pxw(img, x0 + m, y, lit && m === mid ? SPARK : ASH);
      if (m % 3 === 0) pxw(img, x0 + m, y + 1, mix(ASH, RK[1], 0.5));
    }
  }
  for (let j = 0; j < 8; j++) {
    const x = pick(j, 6, seed, BAND_TILE_W) + k * (5 + pick(j, 8, seed, 3));
    const y = 2 + pick(j, 7, seed, DRIFT_H - 4);
    pxw(img, x, y, pick(j, 9, seed, 5) === 0 ? SPARK : RK[2]);
  }
  return img;
}

/**
 * `fx/glow-magma-vent` (36×24, 2 frames): the additive vent glow of §9's decor note, the
 * `decor.mjs` glow recipe — a bright core, a body ring and a faint halo on a 3:2 ellipse; the
 * second frame is the pulse, one step smaller. Soft alpha is the bible §5.8 glow accent (the
 * `decor/glow` precedent's own 204 and 110 tiers); the tones pass `offRamp`, clear of every ramp.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function ventGlow(k) {
  const img = createImage(36, 24);
  const cx = 18;
  const cy = 12;
  const core = color(offRamp('#f0a838'));
  const edge = color(offRamp('#b4501c'));
  const r = (k === 0 ? 11 : 9) * 2;
  const r2 = r * r;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 36; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx * 4 + dy * dy * 9;
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
 * The twenty-four frames of `tiles/terrain-magma-v2`: `terrain-magma`'s whole twenty-tile list
 * first in its order (the base list is off-limits — design §16; P13's prefix law), then the four
 * §10 additions: `obsidian` (solid, the hp-6 punch-through column), `brick-hot` (solid, the
 * glowing plug — the v1 brick with hot seams scoured into it), `lava-drip` (the full-cell hazard
 * fringe) and `vent` (the empty decor vent). The frame order is the list this function returns
 * and {@link MAGMA_V2_TILE_NAMES} names.
 *
 * @param {number} size - The tile side (`options.tileSize`).
 * @returns {Image[]} The frames, in list order.
 */
function magmaTilesV2(size) {
  const base = renderTerrainTiles(size, 'tiles/terrain-magma');
  const s = size;
  return [...base, obsidianTile(s), brickHotTile(s, base[17]), lavaDripTile(s), ventTile(s)];
}

/**
 * `obsidian`: the solid glass tile — near-black body in 3-px blocks, one conchoidal highlight
 * across it, dark base and right edge, a single ember seam low left; fully opaque (mask all-12).
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function obsidianTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-magma-v2/obsidian');
  const body = color('#211a1e');
  const dark = color('#161116');
  const hi = color('#4e444e');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(Math.floor(x / 3), Math.floor(y / 3), seed, 3) === 0 ? dark : body);
    }
  }
  drawLine(img, 1, Math.floor(s / 3), s - 4, 0, hi);
  drawLine(img, Math.floor(s / 2), s - 2, s - 1, Math.floor(s / 2) + 1, dark);
  rect(img, 0, s - 1, s - 1, s - 1, dark);
  rect(img, s - 1, 0, s - 1, s - 1, dark);
  px(img, 2, s - 4, EMBER);
  px(img, 3, s - 4, EMBER);
  px(img, 2, s - 3, SUBS);
  return img;
}

/**
 * `brick-hot`: the glowing plug brick — the v1 brick's own pixels kept, hot embers scoured into
 * its mortar seams and one bright crack run across it; fully opaque (mask all-12). Derived from
 * `brick` the way the §10 family table reads (pair like brick / brick-crack).
 *
 * @param {number} s - Tile side.
 * @param {Image} brick - The base brick frame.
 * @returns {Image} The tile.
 */
function brickHotTile(s, brick) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-magma-v2/brick-hot');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) setPixel(img, x, y, getPixel(brick, x, y));
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const q = pick(x, y, seed, 7);
      if (q === 0) setPixel(img, x, y, SPARK);
      else if (q === 1) setPixel(img, x, y, EMBER);
    }
  }
  drawLine(img, 0, s - 2, s - 1, 1, LAVA_C);
  px(img, Math.floor(s / 2), Math.floor(s / 2) - 1, LAVA_H);
  return img;
}

/**
 * `lava-drip`: the ceiling hazard tile (§10, mask all-12 so the whole cell burns) — a crust band
 * on top and molten channels dripping through dark rock, brighter at each running tip.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function lavaDripTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-magma-v2/lava-drip');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(Math.floor(x / 3), y, seed, 5) === 0 ? RK[1] : MOLTEN);
    }
  }
  rect(img, 0, 0, s - 1, 0, RK[2]);
  rect(img, 0, 1, s - 1, 1, RK[0]);
  for (let c = 0; c < 3; c++) {
    const cx = 2 + c * Math.floor((s - 4) / 2);
    const len = Math.max(4, Math.floor(s / 2) + pick(c, 5, seed, Math.floor(s / 3)));
    for (let y = 1; y <= len; y++) {
      const hot = y >= len - 1;
      px(img, cx, y, hot ? LAVA_H : LAVA_C);
      px(img, cx + 1, y, hot ? LAVA_C : EMBER);
    }
    px(img, cx, len + 1, EMBER);
  }
  return img;
}

/**
 * `vent`: the empty decor tile (§10) — a dark crater mouth with a lit lip in the lower half and
 * a small ash plume drifting off it, all on a transparent field (mask all-0).
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function ventTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-magma-v2/vent');
  const mx = Math.floor(s / 2);
  rect(img, mx - 3, s - 4, mx + 2, s - 3, DST);
  rect(img, mx - 4, s - 5, mx + 3, s - 5, SUR);
  rect(img, mx - 4, s - 6, mx + 3, s - 6, RK[2]);
  px(img, mx - 2, s - 4, EMBER);
  px(img, mx, s - 4, SPARK);
  rect(img, mx - 4, s - 1, mx + 3, s - 1, RK[0]);
  px(img, mx - 5, s - 2, RK[0]);
  px(img, mx + 4, s - 2, RK[0]);
  for (let d = 0; d < 3; d++) {
    px(img, mx - 1 + pick(d, 1, seed, 3), s - 7 - d * 2, ASH);
    px(img, mx - 1 + pick(d, 1, seed, 3) + 1, s - 7 - d * 2, mix(ASH, RK[2], 0.5));
  }
  return img;
}
