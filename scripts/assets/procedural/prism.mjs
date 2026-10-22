/**
 * Zone G, **PRISM LABYRINTH** (plan M2-13) — placeholder art of the crystal zone (decision D24):
 *
 * - `bg/prism-facets` ({@link FACETS_TILE_W}×{@link FACETS_TILE_H}, the far band): a wall of
 *   crystal facets — a grid of triangles (16-px cells, each cut along a seeded diagonal) whose
 *   faces take one of the {@link PRISM_RAMP} (v1) / {@link PRISM_RAMP_V2} (the frozen v2 ramp,
 *   R5-P.P7) colours by a position hash, so the stage's palette cycle makes the facets glint in
 *   turn; the grid divides the tile, so it repeats seamlessly across and down.
 * - `bg/prism-spires` ({@link SPIRES_TILE_W}×{@link SPIRES_TILE_H}, a mid band): crystal spires
 *   rising from the bottom — sharp triangular profiles whose periods divide the tile width — with
 *   pale lit edges.
 * - Enemies (flying ones face left; hit-flash siblings): `enemies/glint-mote` (a four-pointed
 *   sparkle turning 45°, 2 frames), `enemies/prism-cube` (a crystal cube of the cube rush, its lit
 *   face changing, 2 frames), `enemies/facet-turret` (a crystal dome on a floor with a bright eye),
 *   `enemies/halo-crystal` (an octahedral crystal in a ring, spinning, 2 frames),
 *   `enemies/prism-lens` (a lens that fans needles out, a glint crossing it, 2 frames),
 *   `enemies/geode` (a round rock split open on crystals — shot, it shatters into shards),
 *   `enemies/geode-shard` (one of its shards).
 * - FACET MONARCH (FM-07), the crystal core: `bosses/facet-body` (the hexagonal crystal housing —
 *   decoration: the boss's armoured hull is a part without a sprite, behind the core),
 *   `bosses/facet-core` (the glowing core — the weak point, 2 frames), `bosses/facet-crystal`
 *   (a long crystal facet in front of the core), `bosses/facet-segment` (a round crystal bead of a
 *   tentacle arm), `bosses/facet-tip` (the pointed crystal claw at an arm's end).
 *
 * Since R5-07.S2 the generator draws the eleven **v2 stand-ins** of design
 * `docs/v2-run/designs/zone-g.md` §14 — `enemies/prism-shard` and `enemies/prism-glint`, the four
 * new FACET MONARCH parts (crown, plating, emitter, wing), the §9 band stack
 * (`bg/prism-deep`, `bg/prism-ridge`, `bg/prism-veil`), the decor glow
 * `fx/glow-prism-vent` and the tileset `tiles/terrain-prism-v2` (`terrain-prism`'s twenty tiles
 * verbatim, then the four §10 additions `crystal`, `crystal-hot`, `facet-glow`, `shard-floor`) —
 * only at an art scale ≠ 1 (decision RR-1a); the scale-1 build is the v1 set byte for byte. Every
 * new colour keeps Chebyshev distance ≥ 3 from every shipped palette-cycle ramp (the zone-B
 * brine route: no EXEMPT row in `test/integration/palette-cycle-scan.test.ts`).
 *
 * Deep blues, teal and ice white — low in saturation next to the pink / red / purple bullets and the
 * capsules (shmup_feat.md §12, §18). Geometry uses only `+ - * /` and `Math.sqrt`, randomness
 * `hash2` (seeded from the sprite names), so the pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link PRISM_SPRITES}, {@link PRISM_RAMP} (the colours zone G's
 * v1 palette cycle named), {@link PRISM_RAMP_V2} (the frozen v2 ramp zone G's cycles name since
 * R5-P.P7), {@link FACETS_TILE_W} / {@link FACETS_TILE_H}, {@link SPIRES_TILE_W} /
 * {@link SPIRES_TILE_H} (the bands' tile sizes, their parallax `spacing`); for the v2 pass,
 * {@link PRISM_V2_SPRITES}, {@link PRISM_V2_TILES}, {@link PRISM_V2_TILE_NAMES},
 * {@link BAND_TILE_W}, {@link DEEP_H}, {@link RIDGE_H}, {@link VEIL_H}.
 *
 * @module
 */
import { createImage, getPixel, setPixel } from '../image.mjs';
import { scaleImage } from '../interim.mjs';
import { hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf } from './common.mjs';
import { renderTerrainTiles, TERRAIN_PALETTES, TERRAIN_TILES, TILE_SIZE } from './terrain.mjs';
import { FRAME_W } from '../../frame.mjs';
import { offRamp } from '../v2kit.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/prism-facets` tile (its parallax `spacing`). */
export const FACETS_TILE_W = 128;

/** Height of the `bg/prism-facets` tile (two bands, one under the other, join seamlessly). */
export const FACETS_TILE_H = 64;

/** Width of the `bg/prism-spires` tile (its parallax `spacing`). */
export const SPIRES_TILE_W = 128;

/** Height of the `bg/prism-spires` tile. */
export const SPIRES_TILE_H = 56;

/** Side of one facet cell of `bg/prism-facets`, in pixels (it divides both tile sides). */
const FACET_CELL = 16;

/**
 * The facets' four colours, dark → light — the exact colours zone G's palette cycle names
 * (`content/stages/zone-g.stage.json`).
 */
export const PRISM_RAMP = Object.freeze(['#0c1424', '#121c32', '#182842', '#203656']);

/**
 * Zone G's frozen v2 ramp (design `docs/v2-run/designs/zone-g.md` §9): the six colours
 * `content/stages/zone-g.stage.json` and `content/stages/glimmer-cache.stage.json` name now, deep
 * blue → ice — drawn by `bg/prism-facets` only at an art scale ≠ 1 (RR-1: the scale-1 build keeps
 * {@link PRISM_RAMP} byte for byte).
 */
export const PRISM_RAMP_V2 = Object.freeze([
  '#0e1a2e',
  '#1a2b52',
  '#24407e',
  '#3560ad',
  '#5c8ed1',
  '#9dbfe8',
]);

/** The sprites this generator draws, in order. */
export const PRISM_SPRITES = Object.freeze([
  'bg/prism-facets',
  'bg/prism-spires',
  'enemies/glint-mote',
  'enemies/prism-cube',
  'enemies/facet-turret',
  'enemies/halo-crystal',
  'enemies/prism-lens',
  'enemies/geode',
  'enemies/geode-shard',
  'bosses/facet-body',
  'bosses/facet-core',
  'bosses/facet-crystal',
  'bosses/facet-segment',
  'bosses/facet-tip',
]);

/** The v2 stand-in names {@link generate} adds at an art scale ≠ 1, in its output order (§14). */
export const PRISM_V2_SPRITES = Object.freeze([
  'enemies/prism-shard',
  'enemies/prism-glint',
  'bosses/facet-crown',
  'bosses/facet-plating',
  'bosses/facet-emitter',
  'bosses/facet-wing',
  'bg/prism-deep',
  'bg/prism-ridge',
  'bg/prism-veil',
  'fx/glow-prism-vent',
  'tiles/terrain-prism-v2',
]);

/** The four §10 variant tiles after `terrain-prism`'s twenty, in list order (ids 21–24). */
export const PRISM_V2_TILES = /** @type {const} */ ([
  'crystal',
  'crystal-hot',
  'facet-glow',
  'shard-floor',
]);

/** The tile names of `tiles/terrain-prism-v2`: `terrain-prism`'s list verbatim, then the variants. */
export const PRISM_V2_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...PRISM_V2_TILES]);

/**
 * Tile width of the three §9 bands `bg/prism-deep`, `bg/prism-ridge` and `bg/prism-veil`: half the
 * frame, derived from `FRAME_W` — the zone-C precedent (design §14 asks full-frame bands, an atlas
 * frame cannot exceed the 512-page scenario of `test/scripts/assets/pipeline-edge.test.ts`, and
 * every band here is a seamless repeating tile, so these repeat at a period that fills the frame
 * exactly twice).
 */
export const BAND_TILE_W = FRAME_W / 2;

/**
 * Height of the `bg/prism-deep` band (zone-g.md §14: 480 = 40 tile rows, inside the same
 * 510-px page bound that capped zone D's deep band).
 */
export const DEEP_H = 40 * TILE_SIZE;

/** Height of the `bg/prism-ridge` band (zone-g.md §14: 168 = 14 tile rows). */
export const RIDGE_H = 14 * TILE_SIZE;

/** Height of the `bg/prism-veil` band (zone-g.md §14: 48 = 4 tile rows). */
export const VEIL_H = 4 * TILE_SIZE;

/**
 * Generates zone G's art.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's art scale and tile side
 *   (the pipeline passes both; `artScale` 1 or absent draws the v1 set — the cycled facet band on
 *   the v1 ramp — byte for byte, `tileSize` defaults to the v2 {@link TILE_SIZE}).
 * @returns {SpriteDef[]} {@link PRISM_SPRITES} in that order at art scale 1; the v1 set followed by
 *   {@link PRISM_V2_SPRITES} in theirs at any other scale (the new names all `native`, their
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
      'bg/prism-facets',
      [v2 ? scaleImage(facets(PRISM_RAMP_V2), artScale) : facets()],
      'prism',
      {
        anchor: [0, 0],
        native: v2,
      },
    ),
    makeSprite('bg/prism-spires', [spires()], 'prism', { anchor: [0, 0] }),
    makeSprite('enemies/glint-mote', [glintFrame(0), glintFrame(1)], 'prism', {
      hitFlash: true,
      animations: { twinkle: [0, 1] },
    }),
    makeSprite('enemies/prism-cube', [cubeFrame(0), cubeFrame(1)], 'prism', {
      hitFlash: true,
      animations: { spin: [0, 1] },
    }),
    makeSprite('enemies/facet-turret', [turretFrame()], 'prism', flash),
    makeSprite('enemies/halo-crystal', [haloFrame(0), haloFrame(1)], 'prism', {
      hitFlash: true,
      animations: { spin: [0, 1] },
    }),
    makeSprite('enemies/prism-lens', [lensFrame(0), lensFrame(1)], 'prism', {
      hitFlash: true,
      animations: { glint: [0, 1] },
    }),
    makeSprite('enemies/geode', [geodeFrame()], 'prism', flash),
    makeSprite('enemies/geode-shard', [shardFrame()], 'prism', flash),
    makeSprite('bosses/facet-body', [bodyFrame()], 'prism'),
    makeSprite('bosses/facet-core', [coreFrame('#9ae8f0'), coreFrame('#f0f8ff')], 'prism', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('bosses/facet-crystal', [crystalFrame()], 'prism', flash),
    makeSprite('bosses/facet-segment', [segmentFrame()], 'prism', flash),
    makeSprite('bosses/facet-tip', [tipFrame()], 'prism', flash),
  ];
  if (!v2) return sprites;
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  return sprites.concat([
    makeSprite('enemies/prism-shard', [shardV2(0), shardV2(1), shardV2(2)], 'prism', {
      ...hit,
      animations: { spin: [0, 1, 2] },
    }),
    makeSprite('enemies/prism-glint', [0, 1, 2, 3].map(glintV2), 'prism', {
      ...hit,
      animations: { pulse: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/facet-crown', [crownFrame(0), crownFrame(1)], 'prism', {
      ...hit,
      animations: { gleam: [0, 1] },
    }),
    makeSprite('bosses/facet-plating', [plateFrame()], 'prism', hit),
    makeSprite('bosses/facet-emitter', [0, 1, 2, 3].map(emitterFrame), 'prism', {
      ...hit,
      animations: { charge: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/facet-wing', [wingFrame()], 'prism', hit),
    makeSprite('bg/prism-deep', [deepBand()], 'prism', { anchor: [0, 0], ...native }),
    makeSprite('bg/prism-ridge', [ridgeBand()], 'prism', { anchor: [0, 0], ...native }),
    makeSprite('bg/prism-veil', [veilBand(0), veilBand(1)], 'prism', {
      anchor: [0, 0],
      ...native,
      animations: { drift: [0, 1] },
    }),
    makeSprite('fx/glow-prism-vent', [ventGlow(0), ventGlow(1)], 'prism', {
      anchor: [18, 12],
      ...native,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('tiles/terrain-prism-v2', prismTilesV2(size), 'prism', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(PRISM_V2_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ]);
}

/**
 * The facet wall: every {@link FACET_CELL}-px cell is cut along one diagonal (a hash of the cell
 * picks which) into two triangles; each triangle's colour is a `rampHex` colour picked by
 * another hash (v1's {@link PRISM_RAMP} in full, the frozen v2 {@link PRISM_RAMP_V2} as far as the
 * pick reaches), and a 1-px lighter seam runs along the cut. Every pixel is opaque and one of the
 * ramp's colours.
 *
 * @param {readonly string[]} [rampHex] - The ramp to paint, default {@link PRISM_RAMP}.
 * @returns {Image} The tile.
 */
function facets(rampHex = PRISM_RAMP) {
  const w = FACETS_TILE_W;
  const h = FACETS_TILE_H;
  const seed = seedOf('bg/prism-facets');
  const ramp = rampHex.map(color);
  const cols = w / FACET_CELL;
  const rows = h / FACET_CELL;
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / FACET_CELL);
      const cy = Math.floor(y / FACET_CELL);
      const lx = x - cx * FACET_CELL;
      const ly = y - cy * FACET_CELL;
      const flip = hash2(cx % cols, cy % rows, seed) & 1;
      // Which side of the cell's diagonal the pixel is on, and how far from it.
      const across = flip === 0 ? lx - ly : lx + ly - (FACET_CELL - 1);
      const half = across >= 0 ? 1 : 0;
      const k = hash2(cx * 2 + half, cy, seed ^ 0x5bd1) % 3;
      setPixel(image, x, y, ramp[across === 0 ? 3 : k]);
    }
  }
  return image;
}

/**
 * A sharp spire wave of a whole-pixel period: 0 at its tip, 1 at the foot between two spires.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function spike(x, period) {
  const t = (((x % period) + period) % period) / period;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

/**
 * The spires band: two ranges of crystal spires (periods 32 / 16 and 64 px — they divide the tile
 * width), the far range darker, the near one with a pale lit left edge on every spire.
 *
 * @returns {Image} The tile.
 */
function spires() {
  const w = SPIRES_TILE_W;
  const h = SPIRES_TILE_H;
  const far = color('#18243c');
  const near = color('#22365a');
  const edge = color('#8ab4d8');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const farTop = Math.round(10 + 22 * spike(x + 6, 32) + 6 * spike(x, 16));
    const nearTop = Math.round(14 + 34 * spike(x + 20, 64));
    for (let y = farTop; y < h; y++) setPixel(image, x, y, far);
    const rising = (x + 20) % 64 >= 32;
    for (let y = nearTop; y < h; y++) {
      setPixel(image, x, y, !rising && y - nearTop < 2 ? edge : near);
    }
  }
  return image;
}

/**
 * A glint mote: a four-pointed ice-white sparkle with a pale-blue heart; frame 1 turns its points
 * 45°.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function glintFrame(frame) {
  const size = 8;
  const ray = color('#a8d0f0');
  const heart = color('#f0f8ff');
  const image = createImage(size, size);
  if (frame === 0) {
    drawLine(image, 3.5, 0, 3.5, 7, ray);
    drawLine(image, 0, 3.5, 7, 3.5, ray);
  } else {
    drawLine(image, 1, 1, 6, 6, ray);
    drawLine(image, 1, 6, 6, 1, ray);
  }
  fillEllipse(image, 3.5, 3.5, 1.6, 1.6, () => heart);
  return image;
}

/**
 * A prism cube: a small crystal cube drawn in three shades (top, left, right face); the lit face
 * swaps between the frames as it tumbles.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function cubeFrame(frame) {
  const size = 8;
  const light = color('#b8dcf4');
  const mid = color('#5a8ab8');
  const dark = color('#2a4870');
  const rim = color('#0e1628');
  const image = createImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const face = y < 3 ? 0 : x < 4 ? 1 : 2;
      const shades = frame === 0 ? [light, mid, dark] : [mid, dark, light];
      setPixel(image, x, y, edge ? rim : shades[face]);
    }
  }
  return image;
}

/**
 * A facet turret: a crystal dome on a floor, cut into facets, with a bright ice eye (the renderer
 * flips it on a ceiling).
 *
 * @returns {Image} The frame.
 */
function turretFrame() {
  const w = 14;
  const h = 11;
  const rim = color('#0e1628');
  const face = color('#34547e');
  const lit = color('#6a92c0');
  const eye = color('#e0f4ff');
  const image = createImage(w, h);
  fillEllipse(image, 6.5, 10, 6.5, 8, (u, v, e) => {
    if (e > 0.88) return rim;
    // Three facets: left lit, middle, right darker.
    return u < -0.3 ? lit : u < 0.3 ? face : mix(face, rim, 0.3);
  });
  fillEllipse(image, 6.5, 5, 1.7, 1.7, () => eye);
  return image;
}

/**
 * A halo crystal: a pale octahedron (a diamond outline) inside a thin ring; the ring's lit arc and
 * the diamond's lit half swap sides as it spins.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function haloFrame(frame) {
  const size = 14;
  const ring = color('#6a92c0');
  const lit = color('#c8e4f8');
  const dark = color('#3a5a88');
  const image = createImage(size, size);
  fillEllipse(image, 6.5, 6.5, 6.5, 6.5, (u, _v, e) => {
    if (e < 0.84) return null;
    return u < 0 === (frame === 0) ? lit : ring;
  });
  for (let y = 2; y <= 11; y++) {
    const half = 4 - Math.abs(y - 6.5) * 0.9;
    for (let x = Math.round(6.5 - half); x <= Math.round(6.5 + half); x++) {
      setPixel(image, x, y, x < 6.5 === (frame === 0) ? lit : dark);
    }
  }
  return image;
}

/**
 * A prism lens: a pale-blue vesica (a lens shape) with a dark rim and a white glint that crosses
 * it between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function lensFrame(frame) {
  const w = 16;
  const h = 12;
  const rim = color('#0e1628');
  const glass = color('#4a78a8');
  const lit = color('#8ab8e0');
  const glint = color('#f0f8ff');
  const image = createImage(w, h);
  fillEllipse(image, 7.5, 5.5, 7.5, 5.5, (u, v, e) => {
    // A vesica: the ellipse pinched to points at its left and right ends.
    if (Math.abs(v) > 1 - u * u * 0.9) return null;
    if (e > 0.9) return rim;
    return v < -0.2 ? lit : glass;
  });
  const gx = frame === 0 ? 5 : 10;
  drawLine(image, gx, 3, gx - 1, 8, glint);
  return image;
}

/**
 * A geode: a round grey-brown rock split open at the front on a cluster of pale crystals.
 *
 * @returns {Image} The frame.
 */
function geodeFrame() {
  const size = 16;
  const rim = color('#141820');
  const rock = color('#4a4e5a');
  const lit = color('#6a6e7a');
  const crystal = color('#a8d0f0');
  const deep = color('#3a6a9a');
  const image = createImage(size, size);
  fillEllipse(image, 7.5, 7.5, 7.5, 7.5, (u, v, e) => {
    if (e > 0.88) return rim;
    // The open face on the left: crystals.
    if (u < -0.1 && e < 0.7) return (Math.floor((u + v) * 6) & 1) === 0 ? crystal : deep;
    return u + v < -0.6 ? lit : rock;
  });
  return image;
}

/**
 * A geode shard: a small pale crystal splinter pointing left.
 *
 * @returns {Image} The frame.
 */
function shardFrame() {
  const size = 6;
  const lit = color('#c8e4f8');
  const dark = color('#4a78a8');
  const image = createImage(size, size);
  for (let x = 0; x < size; x++) {
    const half = (x * 2.4) / (size - 1);
    for (let y = Math.round(2.5 - half); y <= Math.round(2.5 + half); y++) {
      setPixel(image, x, y, y < 2.5 ? lit : dark);
    }
  }
  return image;
}

/**
 * FACET MONARCH's body: a tall hexagonal crystal housing in deep blue with lit facets on its upper
 * left, darker ones on the lower right, and a dark socket on its left face where the core sits.
 *
 * @returns {Image} The frame.
 */
function bodyFrame() {
  const w = 48;
  const h = 56;
  const rim = color('#0a1020');
  const face = color('#263e62');
  const lit = color('#4a6e9a');
  const dark = color('#18284a');
  const seam = color('#6a92c0');
  const socket = color('#060a14');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    // A hexagon: full width in the middle rows, cut at 45° towards the top and bottom.
    const fromEdge = y < 14 ? 14 - y : y > h - 15 ? y - (h - 15) : 0;
    for (let x = fromEdge; x < w - fromEdge; x++) {
      const edge = x === fromEdge || x === w - fromEdge - 1 || y === 0 || y === h - 1;
      const upper = y < h / 2;
      const left = x < w / 2;
      let c = upper && left ? lit : !upper && !left ? dark : face;
      if (x === Math.round(w / 2) || y === Math.round(h / 2)) c = seam;
      setPixel(image, x, y, edge ? rim : c);
    }
  }
  fillEllipse(image, 12, 27.5, 9, 10, () => socket);
  return image;
}

/**
 * FACET MONARCH's core — the weak point: a glowing faceted gem, `tone` at its heart, in a dark rim.
 *
 * @param {string} tone - The heart's colour.
 * @returns {Image} The frame.
 */
function coreFrame(tone) {
  const size = 16;
  const rim = color('#0a1020');
  const glow = mix(color('#3a78b0'), color(tone), 0.5);
  const heart = color(tone);
  const image = createImage(size, size);
  fillEllipse(image, 7.5, 7.5, 7.5, 7.5, (u, v, e) => {
    if (e > 0.88) return rim;
    // Four facets meeting at the heart.
    if (e < 0.35) return heart;
    return u > 0 === v > 0 ? glow : mix(glow, heart, 0.35);
  });
  return image;
}

/**
 * A long crystal facet standing in front of the core: an elongated pale-blue hexagonal prism
 * (pointed at both ends) with a lit left face — the shields that must break first.
 *
 * @returns {Image} The frame.
 */
function crystalFrame() {
  const w = 10;
  const h = 20;
  const rim = color('#0a1020');
  const lit = color('#b8dcf4');
  const face = color('#6a9ac8');
  const dark = color('#3a628e');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    const fromEnd = y < 4 ? 4 - y : y > h - 5 ? y - (h - 5) : 0;
    for (let x = fromEnd; x < w - fromEnd; x++) {
      const edge = x === fromEnd || x === w - fromEnd - 1 || y === 0 || y === h - 1;
      setPixel(image, x, y, edge ? rim : x < 4 ? lit : x < 7 ? face : dark);
    }
  }
  return image;
}

/**
 * An arm segment: a round deep-blue crystal bead with a lit upper facet (armour — shots clink).
 *
 * @returns {Image} The frame.
 */
function segmentFrame() {
  const size = 10;
  const rim = color('#0a1020');
  const face = color('#2e4c78');
  const lit = color('#6a92c0');
  const image = createImage(size, size);
  fillEllipse(image, 4.5, 4.5, 4.5, 4.5, (u, v, e) => {
    if (e > 0.86) return rim;
    return u + v < -0.3 ? lit : face;
  });
  return image;
}

/**
 * An arm's tip: a round crystal bead with a sharp ice-white claw pointing left (a gun: it fires
 * needles).
 *
 * @returns {Image} The frame.
 */
function tipFrame() {
  const size = 10;
  const rim = color('#0a1020');
  const face = color('#2e4c78');
  const claw = color('#d8ecff');
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 4.5, 3.6, 3.6, (_u, _v, e) => (e > 0.8 ? rim : face));
  for (let x = 0; x <= 3; x++) {
    const half = (x * 1.5) / 3;
    for (let y = Math.round(4.5 - half); y <= Math.round(4.5 + half); y++)
      setPixel(image, x, y, claw);
  }
  return image;
}

// ---------------------------------------------------------------------------
// The R5-07.S2 v2 stand-ins (design `docs/v2-run/designs/zone-g.md` §14 and §10), drawn at the
// final v2 pixel size and only on the `artScale !== 1` path. Flat colours are at Chebyshev
// distance ≥ 3 from every shipped palette-cycle ramp (the zone-B brine route: the scan's EXEMPT
// list stays untouched — §9's "paint exactly" belongs to the R5-D6 real art, whose manifest note
// carries it). The PRISM v2 ramp itself appears only through `bg/prism-facets`, the ramp's own
// CYCLE_ART sprite.
// ---------------------------------------------------------------------------

/** The zone's own terrain palette — the one `terrain.mjs` paints `tiles/terrain-prism` with. */
const PAL = TERRAIN_PALETTES['tiles/terrain-prism'];
const SUR = color(PAL.surface);
const SUBS = color(PAL.subsurface);
const RK = PAL.rock.map(color);

const RIM = color('#0a1020');
const FACE = color('#34547e');
const MID = color('#3a5a88');
const LIT = color('#6a92c0');
const HI = color('#b8dcf4');
const ICE = color('#f0f8ff');
const SHADE = color('#2a4870');
const GEM = color('#9ae8f0');
const CHARGE = color('#3a78b0');
const PLATE = color('#2e4c78');
const PLATE2 = color('#263e62');
const SHADOW = color('#18284a');
const SEAMC = color('#c8e4f8');
const EDGE = color('#8ab4d8');
const VEIN = color('#4a6e9a');
const FAR = color('#16223a');
const NEAR = color('#22365a');
const HOTC = color('#8aeaf4');
const SLIVER = color('#4a78a8');

/** The deep band's strata steps, dark blue depth down-light to the colder stone (§9's read). */
const DEEP_STEPS = [
  color('#0b1626'),
  color('#101e34'),
  color('#142438'),
  color('#182c46'),
  color('#1e3454'),
  color('#244064'),
  color('#2c4c76'),
  color('#365c8c'),
];
const DIKE = color('#0d1220');

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
 * `enemies/prism-shard` (15×15, 3 frames, hittable): the geode's flying splinter (§6) — a tapered
 * crystal sliver pointing left with a lit leading edge; the three frames tumble it (tip high,
 * level, low), the body brightening towards its base.
 *
 * @param {number} k - The frame, 0 … 2.
 * @returns {Image} The frame.
 */
function shardV2(k) {
  const img = createImage(15, 15);
  const seed = seedOf('enemies/prism-shard');
  const tipY = [7, 10, 4][k];
  for (let x = 0; x < 15; x++) {
    const t = x / 14;
    const sy = tipY + (7.5 - tipY) * t;
    const hw = 0.45 + 3.6 * t * t * t;
    const y0 = Math.max(0, Math.round(sy - hw));
    const y1 = Math.min(14, Math.round(sy + hw));
    for (let y = y0; y <= y1; y++) {
      const rel = y - sy;
      let c = rel < -0.4 ? HI : rel > 1 ? SHADE : FACE;
      if (x > 11 && y === Math.round(sy)) c = LIT;
      if (pick(x, y, seed, 9) === 0) c = MID;
      setPixel(img, x, y, c);
    }
    if (x > 1) px(img, x, y0, ICE);
    if (x > 5) px(img, x, y1, SHADOW);
  }
  const t = 1;
  const sy = 7.5;
  const hw = 0.45 + 3.6 * t * t * t;
  rect(img, 14, Math.round(sy - hw), 14, Math.round(sy + hw), RIM);
  return img;
}

/**
 * `enemies/prism-glint` (18×14, 4 frames, hittable): the capsule drifter of §6 — a faceted
 * octahedral crystal on ice-white rays; the four frames pulse the rays out and draw them back,
 * the heart flashing when they are widest.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function glintV2(k) {
  const img = createImage(18, 14);
  const seed = seedOf('enemies/prism-glint');
  const ray = [6, 7, 5, 8][k];
  const vr = Math.round(ray * 0.7);
  drawLine(img, 9 - ray, 7, 9 + ray, 7, LIT);
  drawLine(img, 9, 7 - vr, 9, 7 + vr, LIT);
  px(img, 9 - ray, 7, k >= 2 ? ICE : HI);
  px(img, 9 + ray, 7, k >= 2 ? ICE : HI);
  px(img, 9, 7 - vr, HI);
  px(img, 9, 7 + vr, HI);
  fillEllipse(img, 8.5, 6.5, 5, 3.8, (u, v, e, x, y) => {
    if (e > 0.86) return RIM;
    if (u + v < -0.5) return LIT;
    if (u - v > 0.8) return SHADOW;
    return pick(x, y, seed, 6) === 0 ? MID : FACE;
  });
  px(img, 8, 6, k === 3 ? ICE : GEM);
  px(img, 9, 6, k === 3 ? GEM : HI);
  return img;
}

/**
 * `bosses/facet-crown` (30×15, 2 frames, hittable): the MONARCH's crown (§8 part 14) — five
 * crystal spires of alternating height on a plated band with a lit rim; the second frame shifts
 * the spire phase by half a cell (the crown re-forming) and moves its gem row.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function crownFrame(k) {
  const img = createImage(30, 15);
  const seed = seedOf('bosses/facet-crown');
  rect(img, 0, 11, 29, 13, PLATE2);
  rect(img, 0, 14, 29, 14, RIM);
  for (let x = 0; x < 30; x++) px(img, x, 11, LIT);
  for (let x = 2; x < 28; x += 4) px(img, x + (k === 1 ? 1 : 0), 12, k === 1 ? GEM : VEIN);
  const off = k === 1 ? 3 : 0;
  for (let x = 0; x < 30; x++) {
    const h = 1 + Math.round(9 * spike(x + off, 6));
    const top = 10 - h;
    const rising = spike(x + off + 1, 6) > spike(x + off, 6);
    for (let y = top; y <= 10; y++) {
      const d = y - top;
      let c = d < 2 && rising ? EDGE : d < h - 1 ? MID : PLATE;
      if (pick(x, y, seed, 8) === 0) c = FACE;
      setPixel(img, x, y, c);
    }
    px(img, x, top, h > 7 ? ICE : HI);
  }
  return img;
}

/**
 * `bosses/facet-plating` (24×36, 1 frame, hittable): the MONARCH's shoulder armour (§8 parts
 * 15–16, one name mirrored by the content) — a tall faceted plate, cut at 45° towards its ends,
 * lit on its left face, in shadow on the right, with a lit diagonal seam and seeded bolt pits.
 *
 * @returns {Image} The frame.
 */
function plateFrame() {
  const img = createImage(24, 36);
  const seed = seedOf('bosses/facet-plating');
  for (let y = 0; y < 36; y++) {
    const cut = y < 8 ? 8 - y : y > 27 ? y - 27 : 0;
    for (let x = cut; x < 24 - cut; x++) {
      if (x === cut || x === 24 - cut - 1 || y === 0 || y === 35) {
        setPixel(img, x, y, RIM);
        continue;
      }
      const col = x < 7 ? LIT : x < 16 ? PLATE : SHADOW;
      let c = col;
      if (x + y === 20 || x + y === 34) c = SEAMC;
      if (pick(Math.floor(x / 2), Math.floor(y / 3), seed, 9) === 0) c = mix(col, RIM, 0.35);
      setPixel(img, x, y, c);
    }
    if (pick(5, y, seed, 5) === 0) px(img, 8, y, VEIN);
    if (pick(6, y, seed, 5) === 0) px(img, 17, y, PLATE2);
  }
  return img;
}

/**
 * `bosses/facet-emitter` (15×15, 4 frames, hittable): the MONARCH's shoulder guns (§8 parts
 * 17–18, mirrored): a faceted crystal housing on a dark muzzle boss, low left; the four frames
 * charge the muzzle from deep blue through the vent teal to ice white.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function emitterFrame(k) {
  const img = createImage(15, 15);
  const seed = seedOf('bosses/facet-emitter');
  const tone = [CHARGE, mix(CHARGE, GEM, 0.5), GEM, ICE][k];
  fillEllipse(img, 8, 7, 6, 6, (u, v, e, x, y) => {
    if (e > 0.84) return RIM;
    if (u + v < -0.5) return LIT;
    if (u - v > 0.8) return SHADOW;
    return pick(x, y, seed, 5) === 0 ? MID : FACE;
  });
  rect(img, 0, 5, 3, 9, PLATE2);
  px(img, 0, 5, RIM);
  px(img, 0, 9, RIM);
  px(img, 1, 7, tone);
  px(img, 2, 7, tone);
  px(img, 3, 7, mix(CHARGE, tone, 0.4));
  if (k >= 2) px(img, 0, 7, ICE);
  px(img, 8, 1, HI);
  return img;
}

/**
 * `bosses/facet-wing` (33×21, 1 frame, hittable): the MONARCH's wing fan (§8 parts 19–20, one
 * name mirrored): five crystal blades fanning left off a plated mount on its right edge, each with
 * a lit leading edge and a pale tip; the mount's core shows through.
 *
 * @returns {Image} The frame.
 */
function wingFrame() {
  const img = createImage(33, 21);
  const seed = seedOf('bosses/facet-wing');
  rect(img, 28, 6, 32, 14, PLATE2);
  for (let y = 6; y <= 14; y++) px(img, 28, y, RIM);
  rect(img, 29, 7, 32, 13, FACE);
  px(img, 30, 8, SEAMC);
  px(img, 31, 12, VEIN);
  px(img, 30, 10, GEM);
  const blades = [
    [-7, -0.24, 27],
    [-3.5, -0.12, 29],
    [0, 0, 30],
    [3.5, 0.12, 29],
    [7, 0.24, 26],
  ];
  for (const [by, slope, len] of blades) {
    for (let m = 0; m < len; m++) {
      const x = 28 - m;
      const y = Math.round(10 + by + slope * m);
      px(img, x, y, pick(x, y, seed, 4) === 0 ? MID : FACE);
      px(img, x, y - 1, EDGE);
      if (m % 6 === 3) px(img, x, y + 1, SHADOW);
      if (m === len - 1) px(img, x, y, HI);
    }
  }
  for (let m = 3; m < 15; m += 2) {
    const x = 28 - m;
    px(img, x, Math.round(3 - 0.24 * m) + 1, mix(FACE, RIM, 0.25));
    px(img, x, Math.round(17 + 0.24 * m) - 1, mix(FACE, RIM, 0.25));
  }
  return img;
}

/**
 * `bg/prism-deep` (`BAND_TILE_W`×{@link DEEP_H}, 1 frame, fully opaque): the far depth of §9 —
 * eight horizontal strata of cold blues whose boundaries wobble on triangle periods that divide
 * the tile, three darker crystal dikes and sparse pale veins; blocky, so the page compresses, and
 * nothing in it reads as a hazard.
 *
 * @returns {Image} The band.
 */
function deepBand() {
  const img = createImage(BAND_TILE_W, DEEP_H);
  const seed = seedOf('bg/prism-deep');
  const steps = DEEP_STEPS.length;
  const wob = (x) => Math.round(4 * spike(x, 160) + 3 * spike(x + 50, 80) + 2 * spike(x + 13, 40));
  for (let x = 0; x < BAND_TILE_W; x++) {
    const w = wob(x);
    const dike = x === 43 || x === 44 || x === 118 || x === 119 || x === 271 || x === 272;
    for (let y = 0; y < DEEP_H; y++) {
      let s = Math.floor((y * steps) / DEEP_H);
      const b = Math.floor(((s + 1) * DEEP_H) / steps) + w;
      if (y === b || y === b + 1) s += 1;
      else if (y === b - 1 || y === b - 2) s -= 1;
      const q = pick(Math.floor(x / 4), Math.floor(y / 3), seed, 26);
      if (q === 0) s = Math.min(steps - 1, s + 1);
      else if (q === 13) s = Math.max(0, s - 1);
      setPixel(img, x, y, dike && y % 40 > 1 ? DIKE : DEEP_STEPS[s]);
    }
  }
  for (let i = 0; i < 9; i++) {
    const cy = 14 + pick(i, 1, seed, DEEP_H - 28);
    const cx = pick(i, 2, seed, BAND_TILE_W);
    const len = 8 + pick(i, 3, seed, 14);
    const mid = Math.floor(len / 2);
    for (let m = 0; m < len; m++) {
      pxw(img, cx + m, cy, m === mid ? LIT : VEIN);
      pxw(img, cx + m, cy + 1, VEIN);
    }
  }
  return img;
}

/**
 * `bg/prism-ridge` (`BAND_TILE_W`×{@link RIDGE_H}, 1 frame, green key): the floor-attached crystal
 * ridge of §9 — a seamless silhouette of spiky crystal hills rising from a solid base (every
 * column filled down to the last row, its top stepped by at most 3 px), lit on the rising flank
 * and pale on the falling one, with seeded facet glints; binary alpha.
 *
 * @returns {Image} The band.
 */
function ridgeBand() {
  const img = createImage(BAND_TILE_W, RIDGE_H);
  const seed = seedOf('bg/prism-ridge');
  const prof = (x) =>
    60 +
    Math.round(
      60 * spike(x, 160) +
        20 * spike(x + 40, 80) +
        6 * spike(x, 32) +
        4 * spike(x + 16, 40) +
        8 * spike(x + 8, 20),
    );
  const topAt = (x) => RIDGE_H - prof(((x % BAND_TILE_W) + BAND_TILE_W) % BAND_TILE_W);
  for (let x = 0; x < BAND_TILE_W; x++) {
    const t0 = topAt(x);
    const flank = topAt(x - 1) - t0;
    for (let y = t0; y < RIDGE_H; y++) {
      const d = y - t0;
      const c =
        d < 3 ? MID : pick(Math.floor(x / 5), Math.floor(y / 5), seed, 6) === 0 ? FAR : NEAR;
      setPixel(img, x, y, c);
    }
    if (flank >= 2) {
      px(img, x, t0, EDGE);
      px(img, x, t0 + 1, EDGE);
    }
    if (flank <= -2) {
      px(img, x, t0, HI);
      px(img, x, t0 + 1, LIT);
    }
    if (pick(x, 3, seed, 23) === 0) px(img, x, t0 + 6 + pick(x, 4, seed, RIDGE_H - t0 - 8), GEM);
  }
  return img;
}

/**
 * `bg/prism-veil` (`BAND_TILE_W`×{@link VEIL_H}, 2 frames, green key): the fore shimmer of §9 —
 * sparse refracting streaks and single motes drifting on seeded lines, some lit to ice; the two
 * frames slide at different speeds. Surface only: well below the density that could hide a bullet
 * lane, every feature wrapped so the band repeats seamlessly, binary alpha.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function veilBand(k) {
  const img = createImage(BAND_TILE_W, VEIL_H);
  const seed = seedOf('bg/prism-veil');
  for (let i = 0; i < 10; i++) {
    const y = 4 + pick(i, 1, seed, VEIL_H - 8);
    const x0 = pick(i, 2, seed, BAND_TILE_W) + k * (3 + pick(i, 5, seed, 4));
    const len = 5 + pick(i, 3, seed, 12);
    const mid = Math.floor(len / 2);
    const lit = pick(i, 4, seed, 3) === 0;
    for (let m = 0; m < len; m++) {
      pxw(img, x0 + m, y, lit && m === mid ? ICE : LIT);
      if (m % 3 === 0) pxw(img, x0 + m, y + 1, mix(LIT, MID, 0.5));
    }
  }
  for (let j = 0; j < 8; j++) {
    const x = pick(j, 6, seed, BAND_TILE_W) + k * (5 + pick(j, 8, seed, 3));
    const y = 2 + pick(j, 7, seed, VEIL_H - 4);
    pxw(img, x, y, pick(j, 9, seed, 5) === 0 ? HI : MID);
  }
  return img;
}

/**
 * `fx/glow-prism-vent` (36×24, 2 frames): the additive gas-vent glow of §9's decor note (the
 * geysers' feet and heads, the heart-ring facets), the `decor.mjs` glow recipe — a bright core, a
 * body ring and a faint halo on a 3:2 ellipse; the second frame is the pulse, one step smaller.
 * Soft alpha is the bible §5.8 glow accent (the `fx/glow-magma-vent` precedent's 204 and 110
 * tiers); the tones pass `offRamp`, clear of every ramp.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function ventGlow(k) {
  const img = createImage(36, 24);
  const cx = 18;
  const cy = 12;
  const core = color(offRamp('#9ae8f0'));
  const edge = color(offRamp('#3a6a9a'));
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
 * The twenty-four frames of `tiles/terrain-prism-v2`: `terrain-prism`'s whole twenty-tile list
 * first in its order (the base list is off-limits — design §16; P13's prefix law), then the four
 * §10 additions: `crystal` (solid, the hp-5 slide-pinch column), `crystal-hot` (solid, the hp-3
 * geyser-base crystal — the `crystal` tile with gas fire scoured through it), `facet-glow` (the
 * empty decor of gas facets) and `shard-floor` (solid, the hp-8 heart-ring footing). The frame
 * order is the list this function returns and {@link PRISM_V2_TILE_NAMES} names.
 *
 * @param {number} size - The tile side (`options.tileSize`).
 * @returns {Image[]} The frames, in list order.
 */
function prismTilesV2(size) {
  const base = renderTerrainTiles(size, 'tiles/terrain-prism');
  const s = size;
  const crystal = crystalTile(s);
  return [...base, crystal, crystalHotTile(s, crystal), facetGlowTile(s), shardFloorTile(s)];
}

/**
 * `crystal`: the solid crystal column (§10 id 21, mask all-12) — faceted blue stone with two lit
 * vertical growth columns and their ice seams, the lower right in shadow; fully opaque.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function crystalTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-prism-v2/crystal');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let c = pick(Math.floor(x / 3), Math.floor(y / 4), seed, 3) === 0 ? MID : FACE;
      if (x === 2 || x === 9) c = LIT;
      if (x === 3) c = HI;
      if (x >= 10 && y > 6) c = SHADOW;
      setPixel(img, x, y, c);
    }
  }
  rect(img, 0, 0, s - 1, 0, PLATE2);
  px(img, 6, 4, ICE);
  px(img, 7, 5, GEM);
  return img;
}

/**
 * `crystal-hot`: the geyser-base crystal (§10 id 22, mask all-12) — the `crystal` tile's own
 * pixels kept, hot gas embers scoured through its body and a charge seam run across it; fully
 * opaque, most of its pixels identical to its base (the §10 family reads).
 *
 * @param {number} s - Tile side.
 * @param {Image} crystal - The `crystal` frame.
 * @returns {Image} The tile.
 */
function crystalHotTile(s, crystal) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-prism-v2/crystal-hot');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) setPixel(img, x, y, getPixel(crystal, x, y));
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const q = pick(x, y, seed, 7);
      if (q === 0) setPixel(img, x, y, HOTC);
      else if (q === 1) setPixel(img, x, y, GEM);
    }
  }
  drawLine(img, 0, s - 1, s - 1, 2, CHARGE);
  return img;
}

/**
 * `facet-glow`: the empty decor tile (§10 id 23, mask all-0) — three small gas facets drifting on
 * seeded spots, binary alpha on a transparent field.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function facetGlowTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-prism-v2/facet-glow');
  fillEllipse(img, 3, 4, 1.4, 1.4, () => LIT);
  fillEllipse(img, 8, 7, 1.4, 1.4, () => GEM);
  fillEllipse(img, 5, 10, 1.4, 1.4, () => (pick(1, 1, seed, 3) === 0 ? HI : MID));
  return img;
}

/**
 * `shard-floor`: the heart-ring footing (§10 id 24, mask all-12) — the zone's own surface over
 * broken rock, with pale shard slivers set into it at seeded spots; fully opaque.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function shardFloorTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-prism-v2/shard-floor');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let c;
      if (y === 0) c = SUR;
      else if (y === 1) c = SUBS;
      else
        c =
          pick(Math.floor(x / 3), Math.floor(y / 3), seed, 4) === 0
            ? RK[2]
            : x + y < s
              ? RK[0]
              : RK[1];
      setPixel(img, x, y, c);
    }
  }
  for (let d = 0; d < 4; d++) {
    const bx = 1 + pick(d, 1, seed, s - 4);
    const by = 4 + pick(d, 2, seed, s - 6);
    px(img, bx, by, HI);
    px(img, bx + 1, by + 1, SLIVER);
    px(img, bx + 2, by, SLIVER);
  }
  return img;
}
