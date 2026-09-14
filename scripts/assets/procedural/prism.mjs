/**
 * Zone G, **PRISM LABYRINTH** (plan M2-13) — placeholder art of the crystal zone (decision D24):
 *
 * - `bg/prism-facets` ({@link FACETS_TILE_W}×{@link FACETS_TILE_H}, the far band): a wall of
 *   crystal facets — a grid of triangles (16-px cells, each cut along a seeded diagonal) whose
 *   faces take one of the four {@link PRISM_RAMP} colours by a position hash, so the stage's palette
 *   cycle makes the facets glint in turn; the grid divides the tile, so it repeats seamlessly
 *   across and down.
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
 * Deep blues, teal and ice white — low in saturation next to the pink / red / purple bullets and the
 * capsules (shmup_feat.md §12, §18). Geometry uses only `+ - * /` and `Math.sqrt`, randomness
 * `hash2` (seeded from the sprite names), so the pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link PRISM_SPRITES}, {@link PRISM_RAMP} (the colours zone G's
 * palette cycle must name), {@link FACETS_TILE_W} / {@link FACETS_TILE_H}, {@link SPIRES_TILE_W} /
 * {@link SPIRES_TILE_H} (the bands' tile sizes, their parallax `spacing`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf } from './common.mjs';

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

/**
 * Generates zone G's art.
 *
 * @returns {SpriteDef[]} The sprites of {@link PRISM_SPRITES}, in that order.
 */
export function generate() {
  const flash = { hitFlash: true };
  return [
    makeSprite('bg/prism-facets', [facets()], 'prism', { anchor: [0, 0] }),
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
}

/**
 * The facet wall: every {@link FACET_CELL}-px cell is cut along one diagonal (a hash of the cell
 * picks which) into two triangles; each triangle's colour is a {@link PRISM_RAMP} colour picked by
 * another hash, and a 1-px lighter seam runs along the cut. Every pixel is opaque and one of the
 * ramp's colours.
 *
 * @returns {Image} The tile.
 */
function facets() {
  const w = FACETS_TILE_W;
  const h = FACETS_TILE_H;
  const seed = seedOf('bg/prism-facets');
  const ramp = PRISM_RAMP.map(color);
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
