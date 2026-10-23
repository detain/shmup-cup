/**
 * The escape sequence's v2 stand-in art (R5-10.T2, decision R5-D3 / Q-13): the new backdrop
 * layers of `content/stages/escape.stage.json` — the painted parallax bands, the back-corridor
 * decor flares and the additive ember glow of R3-06 (plan R5-10 "the escape sequence gets the
 * new layers"). The escape keeps `terrain-a` (the owner's ruling); these are its own names.
 *
 * The generator draws **nothing at art scale 1** (decision RR-1a: the v1 build never sees the
 * v2 art — the escape stage's v1 look stays the plain star bands) and every sprite `native`
 * at any other scale, so the interim ×1.5 upscale is skipped and the bytes are the ones below:
 *
 * - `bg/escape-skyline` (`BAND_TILE_W`×`SKYLINE_H`, 2 frames): the far band — the broken
 *   skyline of the collapsing throne, dark towers with lit window columns over a rising fire
 *   glow. It stands on the bottom of the playfield (content y + height = the floor edge).
 * - `bg/escape-girders` (`BAND_TILE_W`×`GIRDERS_H`, 2 frames): the mid band — sheared girders
 *   and hanging cables across the corridor's top, their hazard lamps blinking between the
 *   frames.
 * - `bg/escape-streaks` (`BAND_TILE_W`×`STREAKS_H`, 2 frames): the fore band — ember streaks
 *   whipping past the camera along the escape's speed line.
 * - `decor/escape-flare-a` (18×30) / `decor/escape-flare-b` (12×42): the vent flares of the
 *   corridor's ceiling and floor, drawn on the back decor layer.
 * - `fx/glow-escape-flare` (32×32, centre anchor): the stage's additive ember halo — the flares'
 *   glow (R3-06.L4: the content's `glow` fields name it).
 *
 * Both bands repeat on a `BAND_TILE_W` = half-`FRAME_W` period, so a whole number of tiles
 * fills the frame (the azure/dimension family's law). Geometry uses only `+ - * /` and
 * `Math.sqrt`, texture noise only `hash2` seeded from the sprite's own name (every sprite is
 * byte-identical on every machine, `test/scripts/assets/procedural-escape.test.ts` runs the
 * double-run); every solid colour goes through the kit's {@link offRamp}, keeping the bible
 * §4.4 margin from every reserved palette-cycle ramp.
 *
 * **Public API.** {@link generate}, {@link ESCAPE_SPRITES}, {@link BAND_TILE_W},
 * {@link SKYLINE_H}, {@link GIRDERS_H}, {@link STREAKS_H}.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, makeSprite, mix, seedOf, withAlpha, SOFT_ALPHA } from './common.mjs';
import { offRamp, FRAME_W, FRAME_H } from '../v2kit.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of every band: half the frame, so a whole number of tiles fills it. */
export const BAND_TILE_W = FRAME_W / 2;

/** Height of the `bg/escape-skyline` far band: a quarter of the frame. */
export const SKYLINE_H = FRAME_H / 4;

/** Height of the `bg/escape-girders` mid band: a sixth of the frame. */
export const GIRDERS_H = FRAME_H / 6;

/** Height of the `bg/escape-streaks` fore band: a twelfth of the frame. */
export const STREAKS_H = FRAME_H / 12;

/** The names this generator draws at the v2 scale, in `generate()` order. */
export const ESCAPE_SPRITES = /** @type {const} */ ([
  'bg/escape-skyline',
  'bg/escape-girders',
  'bg/escape-streaks',
  'decor/escape-flare-a',
  'decor/escape-flare-b',
  'fx/glow-escape-flare',
]);

/**
 * The escape palette: a near-black violet night under burning towers, all v2 colours moved
 * off the reserved palette-cycle ramps (the kit's {@link offRamp}).
 */
const V2 = {
  tower: color(offRamp('#171120')),
  towerLit: color(offRamp('#2a1f3a')),
  towerTop: color(offRamp('#3c2c52')),
  seam: color(offRamp('#0d0916')),
  window: color(offRamp('#ff9c40')),
  windowDim: color(offRamp('#b0621e')),
  ember: color(offRamp('#c44a20')),
  emberHot: color(offRamp('#ffd08a')),
  fire: color(offRamp('#ff7a30')),
  steel: color(offRamp('#3a3444')),
  steelEdge: color(offRamp('#6e6480')),
  cable: color(offRamp('#241f2e')),
  hazard: color(offRamp('#ffd23e')),
  hazardDim: color(offRamp('#8a5a14')),
  streak: color(offRamp('#ffb464')),
  streakCore: color(offRamp('#ffe6c0')),
  streakDim: color(offRamp('#c2621c')),
  flare: color(offRamp('#ffc27a')),
  flareCore: color(offRamp('#fff0d4')),
  flareEdge: color(offRamp('#d96a26')),
  glowCore: color(offRamp('#ffc27a')),
  glowEdge: color(offRamp('#8a3a10')),
};

/**
 * A seeded integer in `[0, n)` at one coordinate pair (the generators' only randomness, as in
 * the zone kit — `hash2` over the sprite's own seed).
 *
 * @param {number} a - First integer.
 * @param {number} b - Second integer.
 * @param {number} seed - The sprite's seed (`seedOf(name)`).
 * @param {number} n - The exclusive bound.
 * @returns {number} The draw.
 */
function pick(a, b, seed, n) {
  return hash2(a, b, seed) % n;
}

/**
 * The skyline profile: a coarse lattice every 64 columns interpolated linearly, periodic over
 * the band width (the same seamless recipe as the dimension's rift), with three collapsed
 * towers pressed up out of it.
 *
 * @returns {Int32Array} One top row per column of the band.
 */
function skylineProfile() {
  const seed = seedOf('bg/escape-skyline');
  const plain = (x) => {
    const j = Math.floor(x / 64) % 5;
    const t = x % 64;
    const v0 = 26 + (pick(j, 5, seed, 8) - 4);
    const v1 = 26 + (pick((j + 1) % 5, 5, seed, 8) - 4);
    return Math.round(v0 + ((v1 - v0) * t) / 64);
  };
  const top = new Int32Array(BAND_TILE_W);
  for (let x = 0; x < BAND_TILE_W; x++) top[x] = plain(x);
  for (let m = 0; m < 3; m++) {
    const start = pick(m, 11, seed, BAND_TILE_W);
    const len = 24 + pick(m, 12, seed, 28);
    const rise = 8 + pick(m, 13, seed, 12);
    for (let d = 0; d < len; d++) {
      const x = (start + d) % BAND_TILE_W;
      top[x] = Math.max(2, Math.min(top[x], plain(x) - rise));
    }
  }
  return top;
}

/**
 * One frame of `bg/escape-skyline`: the dark towers with their lit window columns over the
 * rising fire glow. Frame 1 blinks every third window of the towers.
 *
 * @param {number} k - The frame (0 or 1).
 * @returns {Image} The band frame.
 */
function skyline(k) {
  const image = createImage(BAND_TILE_W, SKYLINE_H);
  const seed = seedOf('bg/escape-skyline');
  const top = skylineProfile();
  const glowRows = 10;
  for (let x = 0; x < BAND_TILE_W; x++) {
    const t = top[x];
    const tower = t <= 18;
    for (let y = t; y < SKYLINE_H; y++) {
      const d = y - t;
      let c = tower ? V2.tower : V2.towerLit;
      if (d === 0) c = tower ? V2.towerTop : V2.steelEdge;
      else if (d === 1 && tower) c = V2.towerLit;
      else if (d % 17 === 13 && pick(x, 3, seed, 9) === 0) c = V2.towerTop;
      else if (!tower && d % 11 === 5 && pick(x, y, seed, 6) === 0) c = V2.tower;
      // The window columns of the towers; the `k` frame darkens every third lamp.
      if (tower && d > 2 && x % 5 === 2 && d % 7 === 3) {
        const blink = (Math.floor(d / 7) + Math.floor(x / 5)) % 3 === k;
        c = blink ? V2.window : withAlpha(V2.window, SOFT_ALPHA);
      } else if (tower && d > 2 && x % 5 === 3 && d % 7 === 6) {
        c = k === 0 ? V2.windowDim : withAlpha(V2.windowDim, SOFT_ALPHA);
      }
      // The fire glow rising off the bottom rows of the whole band.
      if (y >= SKYLINE_H - glowRows) {
        const e = y - (SKYLINE_H - glowRows);
        c = e >= glowRows - 2 ? V2.ember : mix(c, V2.fire, e / glowRows);
      }
      setPixel(image, x, y, c);
    }
    // The dark seam every eighth column, so the towers read as separate bodies.
    if (x % 8 === 0 && top[x] < SKYLINE_H - glowRows) {
      setPixel(image, x, top[x], V2.seam);
    }
  }
  return image;
}

/**
 * The sag of one girder chord at a column: a coarse lattice every 80 columns interpolated
 * linearly, periodic over the band width, so the band wraps seamlessly.
 *
 * @param {number} row - The chord index.
 * @param {number} seed - The sprite's seed.
 * @param {number} x - The column.
 * @returns {number} The row the chord passes at.
 */
function chordRow(row, seed, x) {
  const base = 6 + row * 16;
  const j = Math.floor(x / 80) % 4;
  const t = x % 80;
  const v0 = base + pick(j, row, seed, 7);
  const v1 = base + pick((j + 1) % 4, row, seed, 7);
  return Math.round(v0 + ((v1 - v0) * t) / 80);
}

/**
 * One frame of `bg/escape-girders`: three sheared chord lines with their diagonal bracing, a
 * hanging cable every so often and the hazard lamps at the cable feet blinking between the
 * frames. Everything under the chords is transparent: the band hangs into the corridor's top.
 *
 * @param {number} k - The frame (0 or 1 — the lamps alternate).
 * @returns {Image} The band frame.
 */
function girders(k) {
  const image = createImage(BAND_TILE_W, GIRDERS_H);
  const seed = seedOf('bg/escape-girders');
  for (const row of [0, 1, 2]) {
    for (let x = 0; x < BAND_TILE_W; x++) {
      const y = chordRow(row, seed, x);
      setPixel(image, x, y, V2.steel);
      setPixel(image, x, y + 1, row === 0 ? V2.steelEdge : V2.cable);
      // The diagonal braces between the chord's lattice nodes.
      if (x % 80 < 72 && (x + y) % 6 === 0) setPixel(image, x, y + 2, V2.steelEdge);
      // The hanging cables and their lamps.
      if (x % 40 === (k === 0 ? 0 : 20)) {
        const drop = 3 + pick(x, row, seed, 6);
        for (let d = 2; d <= drop; d++) setPixel(image, x, y + d, V2.cable);
        setPixel(image, x, y + drop + 1, k === 0 ? V2.hazard : V2.hazardDim);
        if (drop >= 6) setPixel(image, x, y + drop + 2, withAlpha(V2.hazard, SOFT_ALPHA));
      }
    }
  }
  return image;
}

/**
 * One frame of `bg/escape-streaks`: sparse horizontal ember streaks — a bright head, a body of
 * full-alpha dashes and a soft tail — placed by the band's own seed. Frame 1 is frame 0
 * drifted right by a quarter of the period, the high-speed band's own motion.
 *
 * @param {number} k - The frame (0 or 1).
 * @returns {Image} The band frame.
 */
function streaks(k) {
  const image = createImage(BAND_TILE_W, STREAKS_H);
  const seed = seedOf('bg/escape-streaks');
  for (let s = 0; s < 42; s++) {
    const y = 2 + pick(s, 2, seed, STREAKS_H - 4);
    const x0 = pick(s, 1, seed, BAND_TILE_W);
    const len = 10 + pick(s, 3, seed, 26);
    for (let d = 0; d < len; d++) {
      const x = (x0 + d + k * (BAND_TILE_W / 4)) % BAND_TILE_W;
      if (d === len - 1) setPixel(image, x, y, V2.streakCore);
      else if (d >= len - 4) setPixel(image, x, y, V2.streak);
      else if (d % 3 !== 2) setPixel(image, x, y, withAlpha(V2.streakDim, SOFT_ALPHA));
    }
  }
  return image;
}

/**
 * `decor/escape-flare-a` (18×30, one frame): a ceiling vent flare — a lance of fire with a
 * white-hot core, a full-alpha body and soft edges, hanging downward from its vent.
 *
 * @returns {SpriteDef} The flare.
 */
function flareA() {
  const w = 18;
  const h = 30;
  const image = createImage(w, h);
  const seed = seedOf('decor/escape-flare-a');
  const cx = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    // A lance silhouette: widest at the vent, tapering to the tip, licking with seeded kinks.
    const half = Math.max(1, Math.round(((h - y) * (cx - 1)) / h) + (pick(7, y, seed, 3) - 1));
    for (let x = cx - half; x <= cx + half; x++) {
      const edge = x === cx - half || x === cx + half;
      const dx = x - cx;
      if (dx === 0 && y % 3 !== 2) setPixel(image, x, y, V2.flareCore);
      else if (edge) setPixel(image, x, y, withAlpha(V2.flareEdge, SOFT_ALPHA));
      else setPixel(image, x, y, dx < 0 ? V2.flare : V2.flareEdge);
    }
  }
  return makeSprite('decor/escape-flare-a', [image], 'escape', {
    anchor: [0, 0],
    native: true,
  });
}

/**
 * `decor/escape-flare-b` (12×42, one frame): the floor vent flare — a thin, tall jet of the
 * same fire rising from the corridor floor, core lit, edges soft.
 *
 * @returns {SpriteDef} The flare.
 */
function flareB() {
  const w = 12;
  const h = 42;
  const image = createImage(w, h);
  const seed = seedOf('decor/escape-flare-b');
  const cx = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    // Widest at the floor (row h-1), tapering upward to the tip.
    const half = Math.max(1, Math.round((y * (cx - 1)) / h) + (pick(11, y, seed, 3) - 1));
    for (let x = cx - half; x <= cx + half; x++) {
      const edge = x === cx - half || x === cx + half;
      const dx = x - cx;
      if (dx === 0 && y % 4 !== 1) setPixel(image, x, y, V2.flareCore);
      else if (edge) setPixel(image, x, y, withAlpha(V2.flareEdge, SOFT_ALPHA));
      else setPixel(image, x, y, dx > 0 ? V2.flare : V2.flareEdge);
    }
  }
  return makeSprite('decor/escape-flare-b', [image], 'escape', {
    anchor: [0, 0],
    native: true,
  });
}

/**
 * `fx/glow-escape-flare` (32×32, centre anchor): the stage's additive ember halo — the radial the
 * decor flares' `glow` fields name (R3-06.L4). The same three-band radial as the dimension's
 * rift glow, in the escape's fire colours.
 *
 * @returns {SpriteDef} The glow.
 */
function glowEmber() {
  const n = 32;
  const radius = 14;
  const image = createImage(n, n);
  const cx = Math.floor(n / 2);
  const cy = Math.floor(n / 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const r2 = radius * radius;
      if (d2 > r2) continue;
      if (d2 * 9 < r2 * 2) setPixel(image, x, y, V2.glowCore);
      else if (d2 * 3 < r2 * 2) setPixel(image, x, y, withAlpha(V2.glowEdge, SOFT_ALPHA));
    }
  }
  return makeSprite('fx/glow-escape-flare', [image], 'escape', { anchor: [cx, cy], native: true });
}

// ---------------------------------------------------------------------------- generate ----

/**
 * Generates the escape sequence's stand-in layers.
 *
 * @param {{ tileSize?: number, artScale?: number }} [options] - The build's tile side and art
 *   scale (the pipeline passes both; `tileSize` is unused — the escape draws no tiles).
 * @returns {SpriteDef[]} At art scale 1 **nothing at all** (RR-1a: the v1 build never sees the
 *   v2 art); at any other scale the six sprites above, all `native`.
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  if (artScale === 1) return [];
  return [
    makeSprite('bg/escape-skyline', [skyline(0), skyline(1)], 'escape', {
      anchor: [0, 0],
      native: true,
      animations: { blink: [0, 1] },
    }),
    makeSprite('bg/escape-girders', [girders(0), girders(1)], 'escape', {
      anchor: [0, 0],
      native: true,
      animations: { blink: [0, 1] },
    }),
    makeSprite('bg/escape-streaks', [streaks(0), streaks(1)], 'escape', {
      anchor: [0, 0],
      native: true,
      animations: { rush: [0, 1] },
    }),
    flareA(),
    flareB(),
    glowEmber(),
  ];
}
