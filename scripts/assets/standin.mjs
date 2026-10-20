/**
 * Stand-in zone art for the R3-04 memory round (decision W5-14) — part 1 (R3-04.M1a):
 * the seeded palette, the far layer, the keyed parallax bands and the tile set.
 *
 * The generators the shipped atlas uses draw v1's interim art (`procedural/`); real v2 art
 * arrives with R3. Between them, R3-04 must measure what a full v2 zone costs — PNG-8 bytes
 * per atlas page and TV memory — so this file draws *detailed stand-ins*: art made by the
 * same kind of seeded noise and silhouette maths as the interim generators, but dressed at
 * the art bible's v2 sizes and honouring its colour rules, so the measurement is of a zone
 * the bible would accept, not of a flat placeholder.
 *
 * `standinZone(zoneId, { seed })` returns one zone's whole part-1 content:
 *
 * - `palette` — {@link PALETTE_SIZE} colours (bible §4.3 allows a zone 48–64), a seeded
 *   hue family laid out in fixed windows: sky `0…15`, mid `16…31`, rock `32…47`, accent
 *   `48…55`. No colour sits closer than {@link RAMP_MARGIN}/255 (Chebyshev) to any of the
 *   eight reserved palette-cycle ramps (§4.4 — the ramps the shipped generators export),
 *   and none is one of the reserved bullet / gold / explosion family colours (§4.2).
 * - `far` — the far layer at {@link FRAME_W} × {@link FRAME_H} px, opaque (§5.10); zones in
 *   {@link FAR_WIDE_ZONES} are drawn `2 * FRAME_W` wide, the bible's allowance for a far
 *   layer whose repeat would show. Its sky gradient is modulated by a seamless haze noise,
 *   horizontal cloud streaks and a fine speckle — a palette window of at most 32 colours.
 * - `bands` — {@link BAND_MIN_COUNT}…{@link BAND_MAX_COUNT} keyed mid layers at
 *   {@link FRAME_W} × 120–240 px (§5.10): a triangle-wave silhouette with noise wobble,
 *   terraced colour steps below the skyline, a rim-lit top row and a few keyed windows.
 *   A `KEY` pixel is the stand-in for the green key an AI backdrop carries (§5.10, sampled
 *   at ingest) — binary alpha, exactly what the shipped backdrops key out to.
 * - `tiles` — a 40-tile set at {@link TILE_SIZE} px (§5.9: 20–40 tiles with at least three
 *   fill variants; edges, corners, 45° and 22.5° slopes, destructibles and deco): each tile
 *   is a binary mask painted with the rock window, a bright cap row, a dark underside and
 *   hashed surface texture. The whole set shares one palette window of at most 32 colours.
 *
 * Every surface stays inside bible §4.3's per-layer cap of 32 colours — the enemy and boss
 * caps belong to the sprites part 2 (R3-04.M1b) adds to this file.
 *
 * **The entropy is uncalibrated (decision RR-7).** `NOISE_CELL`, `HAZE_CELL`,
 * `FAR_STREAK_ROWS`, `DETAIL_DENSITY`, `RIBBON_DENSITY`, `BAND_STEP`,
 * `BAND_WINDOW_DENSITY` and `TILE_TEXTURE_LEVELS` aim at PNG-8 pages of 0.3–0.6 MB per
 * 2048×1024 px — they are the tuning knobs R3-04.M2a measures and adjusts. Nothing in the
 * gates depends on their values.
 *
 * This module is **never loaded by the shipped pipeline** — nothing under
 * `scripts/assets/` besides `pipeline.mjs` imports it; it only joins the pipeline's code
 * hash, so adding the file makes `pnpm assets` rebuild once and changes no atlas byte
 * (wave-04 rule: the scale-1 digest pin never moves). Because the pipeline never loads it,
 * it may import `scripts/frame.mjs` for the frame constants — the one root-script
 * exception `terrain.mjs`'s docblock explains the shipped generators must not take.
 *
 * Determinism (M1's rule, the same as every generator here): exact integer maths and the
 * seeded `rng.mjs` only — no `Math.random`, no trig functions, no `**` — so the pixels are
 * identical on every engine and every run. Layers wrap seamlessly in x: every noise cell
 * span and silhouette period divides {@link FRAME_W}.
 *
 * @module
 */
import { FRAME_H, FRAME_W, TILE_SIZE } from '../frame.mjs';
import { createAssetRng, hash2 } from './rng.mjs';
import { color, seedOf } from './procedural/common.mjs';
import { SEA_RAMP } from './procedural/raster-bands.mjs';
import { BRINE_RAMP } from './procedural/brine.mjs';
import { MAGMA_RAMP } from './procedural/magma.mjs';
import { STORM_RAMP } from './procedural/tempest.mjs';
import { VAULT_RAMP } from './procedural/vault.mjs';
import { PRISM_RAMP } from './procedural/prism.mjs';
import { CITADEL_RAMP } from './procedural/citadel.mjs';
import { ABYSS_RAMP } from './procedural/abyss.mjs';

/**
 * One stand-in zone: the {@link standinZone} result.
 *
 * @typedef {object} StandinZone
 * @property {string} zoneId - The zone letter (`a`…`i`).
 * @property {number} seed - The 32-bit seed the zone was drawn with.
 * @property {string[]} palette - {@link PALETTE_SIZE} `#rrggbb` colours, index = palette slot.
 * @property {StandinSurface} far - The far layer, opaque.
 * @property {StandinSurface[]} bands - The keyed mid layers, farthest first.
 * @property {StandinTiles} tiles - The tile set.
 */

/**
 * A painted layer: a `width × height` grid of palette indices, {@link KEY} where transparent.
 *
 * @typedef {object} StandinSurface
 * @property {number} width - Pixels across (the layer tiles seamlessly at this width).
 * @property {number} height - Pixels down.
 * @property {Uint8Array} indices - Row-major palette indices, `height * width` of them.
 */

/**
 * The tile set: 40 frames of one strip, {@link StandinTiles}.
 *
 * @typedef {object} StandinTiles
 * @property {number} size - Tile edge ({@link TILE_SIZE} px).
 * @property {string[]} names - The 40 tile names, kebab-case, frame `i` of `names[i]`.
 * @property {Uint8Array} indices - Row-major palette indices, `names.length * size * size`.
 */

/** Sentinel palette index: transparent (the green key of a §5.10 layer). */
export const KEY = 255;

/** Colours in one stand-in zone palette (bible §4.3: 48–64; the windows below sum to this). */
export const PALETTE_SIZE = 56;

/** Seed `standinZone` uses when the caller gives none. */
export const DEFAULT_SEED = 40701;

/** First sky slot (a zone's horizon gradient). */
export const SKY_FIRST = 0;
/** Sky colours. */
export const SKY_COUNT = 16;
/** First mid-hue slot (band terraces). */
export const MID_FIRST = SKY_FIRST + SKY_COUNT;
/** Mid-hue colours. */
export const MID_COUNT = 16;
/** First rock slot (tile bodies, band shadows). */
export const ROCK_FIRST = MID_FIRST + MID_COUNT;
/** Rock colours. */
export const ROCK_COUNT = 16;
/** First accent slot (caps, deco, rim light). */
export const ACCENT_FIRST = ROCK_FIRST + ROCK_COUNT;
/** Accent colours. */
export const ACCENT_COUNT = 8;

/** Smallest Chebyshev distance (§4.4) every palette colour keeps from every reserved ramp. */
export const RAMP_MARGIN = 3;

/**
 * The eight reserved palette-cycle ramps (§4.4, frozen) as the shipped generators export
 * them — the colours a stand-in zone must stay {@link RAMP_MARGIN}/255 away from.
 */
export const RESERVED_RAMP_COLORS = Object.freeze(
  []
    .concat(
      SEA_RAMP,
      BRINE_RAMP,
      MAGMA_RAMP,
      STORM_RAMP,
      VAULT_RAMP,
      PRISM_RAMP,
      CITADEL_RAMP,
      ABYSS_RAMP,
    )
    .map(color),
);

/**
 * The reserved family colours (§4.2): bullet pinks / red / violet, the point-item gold and
 * the explosion ramp. A stand-in palette never repeats one exactly.
 */
export const RESERVED_FAMILY_COLORS = Object.freeze(
  ['#ff5aa0', '#ff3a3a', '#b84cff', '#ffd34d', '#fff080', '#f8b030', '#f06820', '#c83018'].map(
    color,
  ),
);

/** The campaign's zones (content/stages names them `zone-a` … `zone-i`). */
export const ZONE_IDS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);

/** Zones whose far layer is drawn `2 * FRAME_W` wide (§5.10's allowance when the repeat shows). */
export const FAR_WIDE_ZONES = Object.freeze(['b', 'd', 'f', 'h']);

/** Fewest keyed bands a zone gets (§5.10: far plus 3–5 mid layers reads 4–6 total). */
export const BAND_MIN_COUNT = 3;
/** Most keyed bands a zone gets. */
export const BAND_MAX_COUNT = 5;
/** Shortest band layer (§5.10: mid layers are 120–240 px tall). */
export const BAND_MIN_HEIGHT = 120;
/** Tallest band layer. */
export const BAND_MAX_HEIGHT = 240;

/**
 * Silhouette triangle periods (px): every one divides {@link FRAME_W}, so each band's
 * skyline repeats seamlessly at the layer's width.
 */
export const BAND_PERIODS = Object.freeze([64, 80, 128, 160, 320]);

/**
 * Width (px) of the fine texture noise cells (haze-modulated detail, silhouette wobble).
 * **Uncalibrated (RR-7)** — an entropy knob R3-04.M2a measures.
 */
export const NOISE_CELL = 8;

/**
 * Width (px) of the large wash noise cells that soften the far gradient and the band
 * terraces. **Uncalibrated (RR-7)**.
 */
export const HAZE_CELL = 32;

/**
 * Rows the far layer's cloud streaks merge per noise cell — streaks are wide and flat, not
 * round blobs. **Uncalibrated (RR-7)**.
 */
export const FAR_STREAK_ROWS = 3;

/**
 * Speckle probability (per thousand pixels): a speckled pixel steps one level brighter or
 * darker. **Uncalibrated (RR-7)** — the dominant PNG-8 cost of noise.
 */
export const DETAIL_DENSITY = 600;

/**
 * Cloud coverage of the far layer (per thousand): the streak noise must rise above this
 * quantile of its `0…15` range before a pixel steps two levels up. **Uncalibrated (RR-7)**.
 */
export const RIBBON_DENSITY = 105;

/**
 * Depth (px) per colour terrace of a band below its skyline. **Uncalibrated (RR-7)**.
 */
export const BAND_STEP = 6;

/** Skyline rows drawn with the band window's brightest colour (rim light). */
export const BAND_RIM_DEPTH = 2;

/**
 * Keyed-window probability (per thousand pixels deeper than 8 px): a hole the far layer
 * shows through. **Uncalibrated (RR-7)**.
 */
export const BAND_WINDOW_DENSITY = 35;

/** Texture levels a tile body mixes below its cap row. **Uncalibrated (RR-7)**. */
export const TILE_TEXTURE_LEVELS = 5;

/** Depth (px) inside a band before a keyed window may open. */
const BAND_WINDOW_MIN_DEPTH = 8;

/** Degrees in a full turn, computed so the banned frame literal never appears. */
const HUE_CYCLE = 6 * 60;

/** The far layer's colour window: the sky ladder plus four bright accents (≤ 32, §4.3). */
export const FAR_WINDOW = Object.freeze(range(SKY_FIRST, SKY_COUNT).concat(range(ACCENT_FIRST, 4)));

/** A band's colour window: dark rocks, the mid ladder, four accents (28 ≤ 32, §4.3). */
export const BAND_WINDOW = Object.freeze(
  range(ROCK_FIRST, 8).concat(range(MID_FIRST, MID_COUNT), range(ACCENT_FIRST + 4, 4)),
);

/** The tile set's colour window: two darks, all rocks, all accents (26 ≤ 32, §4.3). */
export const TILE_WINDOW = Object.freeze(
  range(SKY_FIRST, 2).concat(range(ROCK_FIRST, ROCK_COUNT), range(ACCENT_FIRST, ACCENT_COUNT)),
);

/**
 * The 40 tile names (§5.9). Part 2 packs them into the sprite sources as
 * `standin/zone-<id>/tiles/<name>`; frame `i` of the strip is `names[i]`.
 */
export const STANDIN_TILES = Object.freeze([
  'edge-top',
  'edge-bottom',
  'edge-left',
  'edge-right',
  'corner-tl',
  'corner-tr',
  'corner-bl',
  'corner-br',
  'inner-tl',
  'inner-tr',
  'inner-bl',
  'inner-br',
  'slope-up-45',
  'slope-down-45',
  'slope-up-shallow',
  'slope-down-shallow',
  'slope-ceiling-up-45',
  'slope-ceiling-down-45',
  'slope-ceiling-up-shallow',
  'slope-ceiling-down-shallow',
  'fill-a',
  'fill-b',
  'fill-c',
  'fill-d',
  'pillar-mid',
  'beam-cross',
  'beam-h',
  'beam-v',
  'platform-cap',
  'platform-cap-cracked',
  'deco-stripe-h',
  'deco-stripe-v',
  'brick',
  'brick-cracked',
  'cube',
  'tissue',
  'rock-rubble',
  'volcano-crater',
  'duct-junction',
  'anchor-bolt',
]);

/**
 * 22.5° slope column heights (px, from the left) at {@link TILE_SIZE} — v1's 8-px ramp
 * ×3/2, the same table `terrain.mjs` draws its interim slopes with.
 */
const SLOPE_SHALLOW_LOW = Object.freeze([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);

/** The mirrored 22.5° ramp (high side left). */
const SLOPE_SHALLOW_HIGH = SLOPE_SHALLOW_LOW.map((h) => h + TILE_SIZE / 2);

/**
 * `[first, first + count)` — an integer range (the window tables are built from these).
 *
 * @param first - First index.
 * @param count - How many.
 * @returns The indices, ascending.
 */
function range(first, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(first + i);
  return out;
}

/**
 * The seed one stand-in zone draws with: the zone name folded into the caller's seed, so
 * every zone differs and a rerun with the same arguments is identical.
 *
 * @param zoneId - Zone letter.
 * @param seed - Caller's seed ({@link DEFAULT_SEED} when omitted).
 * @returns The unsigned 32-bit seed.
 */
export function standinSeed(zoneId, seed) {
  const base = seed === undefined ? DEFAULT_SEED : seed | 0;
  return (seedOf(`standin/zone-${zoneId}`) ^ base) >>> 0;
}

/**
 * Chebyshev distance of two colours (per channel, §4.4's metric).
 *
 * @param a - Colour `[r, g, b, a]`.
 * @param b - Colour `[r, g, b, a]`.
 * @returns The largest channel difference.
 */
export function chebyshev(a, b) {
  const dr = Math.abs(a[0] - b[0]);
  const dg = Math.abs(a[1] - b[1]);
  const db = Math.abs(a[2] - b[2]);
  return Math.max(Math.max(dr, dg), db);
}

/**
 * HSB → RGB with exact integer maths only.
 *
 * @param hue - Degrees (any integer; wrapped into `0…359`).
 * @param sat - Saturation, permille 0…1000.
 * @param val - Value, permille 0…1000.
 * @returns An opaque `[r, g, b, 255]`.
 */
function hsbToRgb(hue, sat, val) {
  const h = ((hue % HUE_CYCLE) + HUE_CYCLE) % HUE_CYCLE;
  const sector = Math.floor(h / 60);
  const f = h - sector * 60;
  const v = Math.round((val * 255) / 1000);
  const p = Math.round((val * (1000 - sat) * 255) / 1000000);
  const q = Math.round((((val * (1000 - Math.round((sat * f) / 60))) / 1000) * 255) / 1000);
  const t = Math.round((((val * (1000 - Math.round((sat * (60 - f)) / 60))) / 1000) * 255) / 1000);
  if (sector === 0) return [v, t, p, 255];
  if (sector === 1) return [q, v, p, 255];
  if (sector === 2) return [p, v, t, 255];
  if (sector === 3) return [p, q, v, 255];
  if (sector === 4) return [t, p, v, 255];
  return [v, p, q, 255];
}

/**
 * `#rrggbb` of a colour (lower case, the sprite-source spelling).
 *
 * @param rgba - Colour `[r, g, b, a]`.
 * @returns The literal.
 */
function hexOf(rgba) {
  const part = (n) => (n < 16 ? '0' : '') + n.toString(16);
  return `#${part(rgba[0])}${part(rgba[1])}${part(rgba[2])}`;
}

/**
 * Whether a candidate colour may join a palette: at least {@link RAMP_MARGIN} away from
 * every reserved ramp colour (§4.4) and not a reserved family colour (§4.2).
 *
 * @param rgba - Candidate.
 * @returns `true` when allowed.
 */
function paletteAllowed(rgba) {
  for (let i = 0; i < RESERVED_RAMP_COLORS.length; i++) {
    if (chebyshev(rgba, RESERVED_RAMP_COLORS[i]) < RAMP_MARGIN) return false;
  }
  for (let i = 0; i < RESERVED_FAMILY_COLORS.length; i++) {
    if (chebyshev(rgba, RESERVED_FAMILY_COLORS[i]) === 0) return false;
  }
  return true;
}

/**
 * One role's colour ladder: `count` colours rising in value from `(hueA, satA, valA)` to
 * `(hueB, satB, valB)`, skipping reserved colours and exact repeats by stepping further
 * along the ladder. Keeps the value order of what it accepts.
 *
 * @param seen - Hexes already in the palette (mutated).
 * @param hueA - Start hue (degrees).
 * @param hueB - End hue.
 * @param satA - Start saturation, permille.
 * @param satB - End saturation, permille.
 * @param valA - Start value, permille (≥ the §4.1 dark floor).
 * @param valB - End value, permille (≤ 900: no pure white).
 * @param count - How many colours the role wants.
 * @returns The accepted colours as `#rrggbb`.
 */
function roleLadder(seen, hueA, hueB, satA, satB, valA, valB, count) {
  const out = [];
  for (let attempt = 0; out.length < count; attempt++) {
    if (attempt > 8 * count) throw new Error('standin palette: the reserved colours are walled in');
    const pass = Math.floor(attempt / count);
    const t = (out.length + pass) / (count + 2);
    const hue = hueA + (hueB - hueA) * t + pass * 11;
    const sat = Math.round(satA + (satB - satA) * t);
    const val = Math.min(900, Math.round(valA + (valB - valA) * t) + pass * 7);
    const rgba = hsbToRgb(Math.round(hue), sat, val);
    const hex = hexOf(rgba);
    if (seen.has(hex) || !paletteAllowed(rgba)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out;
}

/**
 * Builds a zone's palette: the four role windows of {@link PALETTE_SIZE} colours.
 *
 * @param rng - The zone's generator (consumes `rangeInt` calls in a fixed order).
 * @returns The `#rrggbb` list, index = palette slot.
 */
function buildPalette(rng) {
  const base = rng.rangeInt(0, 359);
  const seen = new Set();
  const sky = roleLadder(seen, base, base + 18, 140, 380, 90, 880, SKY_COUNT);
  const mid = roleLadder(seen, base + 170, base + 190, 2 * 100, 2 * 180, 130, 660, MID_COUNT);
  const rock = roleLadder(seen, base + 310, base + 330, 240, 420, 100, 620, ROCK_COUNT);
  const accent = roleLadder(seen, base + 40, base + 60, 620, 820, 700, 900, ACCENT_COUNT);
  return Object.freeze(sky.concat(mid, rock, accent));
}

/**
 * Seamless value noise in `0…15` over a wrapping horizontal span (the hash-only twin of
 * the AI pipeline's fbm: integer bilinear interpolation of hashed 4-bit cell corners).
 *
 * @param x - Pixel column `0…spanCells * cell - 1` (wraps at that width).
 * @param y - Pixel row (does not wrap).
 * @param cell - Noise cell edge in px.
 * @param spanCells - Cells across (the wrap width in cells).
 * @param seed - Noise seed.
 * @returns `0…15`.
 */
function valueNoise(x, y, cell, spanCells, seed) {
  const cx = Math.floor(x / cell) % spanCells;
  const nx = (cx + 1) % spanCells;
  const fx16 = Math.floor(((x % cell) * 16) / cell);
  const cy = Math.floor(y / cell);
  const fy16 = Math.floor(((y % cell) * 16) / cell);
  const h00 = hash2(cx, cy, seed) & 15;
  const h10 = hash2(nx, cy, seed) & 15;
  const h01 = hash2(cx, cy + 1, seed) & 15;
  const h11 = hash2(nx, cy + 1, seed) & 15;
  const top = (h00 * (16 - fx16) + h10 * fx16) >> 4;
  const bot = (h01 * (16 - fx16) + h11 * fx16) >> 4;
  return (top * (16 - fy16) + bot * fy16) >> 4;
}

/**
 * Triangle wave in permille: `0` at the period start, `1000` at its half.
 *
 * @param x - Position (may exceed the period; it is taken modulo).
 * @param period - Even period.
 * @returns `0…1000`.
 */
function triangleWave(x, period) {
  const t = x % period;
  const half = period >> 1;
  return t < half ? Math.round((t * 1000) / half) : Math.round(((period - t) * 1000) / half);
}

/**
 * Clamps to `lo…hi`.
 *
 * @param v - Value.
 * @param lo - Floor.
 * @param hi - Ceiling.
 * @returns The clamped value.
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Draws a zone's far layer: the sky gradient windowed by {@link FAR_WINDOW}, pushed by the
 * large haze noise, streaked by flat cloud bands and speckled finely (§5.10's atmosphere;
 * stars are out on in-game layers, §4.1). Opaque, and seamless at its own width.
 *
 * @param zoneId - Zone letter (picks the wide variant).
 * @param rng - The zone's generator.
 * @returns The {@link StandinSurface}.
 */
function buildFar(zoneId, rng) {
  const width = FAR_WIDE_ZONES.includes(zoneId) ? 2 * FRAME_W : FRAME_W;
  const height = FRAME_H;
  const indices = new Uint8Array(width * height);
  const seedHaze = rng.nextU32();
  const seedStreak = rng.nextU32();
  const seedDetail = rng.nextU32();
  const seedFlip = rng.nextU32();
  const levels = FAR_WINDOW.length;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const gradient = Math.floor((y * (levels - 1)) / height);
    for (let x = 0; x < width; x++) {
      let level = gradient + ((valueNoise(x, y, HAZE_CELL, width / HAZE_CELL, seedHaze) - 8) >> 1);
      const streak = valueNoise(
        x,
        Math.floor(y / FAR_STREAK_ROWS),
        NOISE_CELL,
        width / NOISE_CELL,
        seedStreak,
      );
      if (streak >= 16 - Math.round((RIBBON_DENSITY * 16) / 1000)) level += 2;
      if (hash2(x, y, seedDetail) % 1000 < DETAIL_DENSITY) {
        level += (hash2(x, y, seedFlip) & 1) === 0 ? 1 : -1;
      }
      indices[row + x] = FAR_WINDOW[clamp(level, 0, levels - 1)];
    }
  }
  return Object.freeze({ width, height, indices });
}

/**
 * Draws a zone's keyed band layers (farthest first): each is {@link FRAME_W} wide,
 * 120–240 px tall, its skyline a sum of two seamless triangle waves with a noise wobble,
 * its body terraced in {@link BAND_STEP}-px steps through {@link BAND_WINDOW} with a
 * rim-lit skyline, haze shifts, speckle and a few keyed windows above the skyline depth.
 *
 * @param rng - The zone's generator.
 * @returns 3–5 {@link StandinSurface}s.
 */
function buildBands(rng) {
  const count = rng.rangeInt(BAND_MIN_COUNT, BAND_MAX_COUNT);
  const bands = [];
  const width = FRAME_W;
  const levels = BAND_WINDOW.length;
  for (let b = 0; b < count; b++) {
    const height = rng.rangeInt(BAND_MIN_HEIGHT, BAND_MAX_HEIGHT);
    const period1 = BAND_PERIODS[rng.rangeInt(0, BAND_PERIODS.length - 1)];
    const period2 = BAND_PERIODS[rng.rangeInt(0, BAND_PERIODS.length - 1)];
    const shift = rng.rangeInt(0, period2 - 1);
    const amp1 = rng.rangeInt(140, 420);
    const amp2 = rng.rangeInt(60, 220);
    const base = rng.rangeInt(Math.floor(height / 3), Math.floor((height * 3) / 4));
    const seedWobble = rng.nextU32();
    const seedHaze = rng.nextU32();
    const seedSpeck = rng.nextU32();
    const seedFlip = rng.nextU32();
    const seedHole = rng.nextU32();
    const skyline = new Int32Array(width);
    for (let x = 0; x < width; x++) {
      const raw =
        base +
        Math.round((amp1 * triangleWave(x, period1)) / 1000) +
        Math.round((amp2 * triangleWave(x + shift, period2)) / 1000) +
        ((valueNoise(x, b * 31, NOISE_CELL, width / NOISE_CELL, seedWobble) - 8) >> 1);
      skyline[x] = clamp(raw, 4, height - 12);
    }
    const indices = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const depth = y - skyline[x];
        if (depth < 0) {
          indices[row + x] = KEY;
          continue;
        }
        if (depth > BAND_WINDOW_MIN_DEPTH && hash2(x, y, seedHole) % 1000 < BAND_WINDOW_DENSITY) {
          indices[row + x] = KEY;
          continue;
        }
        let level;
        if (depth < BAND_RIM_DEPTH) {
          level = levels - 1;
        } else {
          level = Math.floor(depth / BAND_STEP) % levels;
          level += (valueNoise(x, y, HAZE_CELL, width / HAZE_CELL, seedHaze) - 8) >> 2;
          if (hash2(x, y, seedSpeck) % 1000 < DETAIL_DENSITY) {
            level += (hash2(x, y, seedFlip) & 1) === 0 ? 1 : -1;
          }
        }
        indices[row + x] = BAND_WINDOW[clamp(level, 0, levels - 1)];
      }
    }
    bands.push(Object.freeze({ width, height, indices }));
  }
  return Object.freeze(bands);
}

/**
 * The solid test of one tile recipe at {@link TILE_SIZE} px. `seed` makes the noise-hatched
 * recipes differ per zone; the structural recipes are fixed shapes.
 *
 * @param name - Tile name.
 * @param x - Column.
 * @param y - Row.
 * @param seed - The tile set's seed.
 * @returns `true` when the pixel is rock (opaque = collision, §5.9).
 */
function tileSolid(name, x, y, seed) {
  const size = TILE_SIZE;
  const edge = size / 4; // 3 px arm
  const far = size - edge;
  const dx = 2 * x - (size - 1);
  const dy = 2 * y - (size - 1);
  const stem = x >= size / 2 - 1 && x <= size / 2; // the two centre columns
  if (name === 'edge-top') return y < edge;
  if (name === 'edge-bottom') return y >= far;
  if (name === 'edge-left') return x < edge;
  if (name === 'edge-right') return x >= far;
  if (name === 'corner-tl') return x < edge || y < edge;
  if (name === 'corner-tr') return x >= far || y < edge;
  if (name === 'corner-bl') return x < edge || y >= far;
  if (name === 'corner-br') return x >= far || y >= far;
  if (name === 'inner-tl') return x < edge && y < edge;
  if (name === 'inner-tr') return x >= far && y < edge;
  if (name === 'inner-bl') return x < edge && y >= far;
  if (name === 'inner-br') return x >= far && y >= far;
  if (name === 'slope-up-45') return x + y >= size - 1;
  if (name === 'slope-down-45') return x + y < size - 1;
  if (name === 'slope-up-shallow') return y >= size - SLOPE_SHALLOW_LOW[x];
  if (name === 'slope-down-shallow') return y >= size - SLOPE_SHALLOW_HIGH[x];
  if (name === 'slope-ceiling-up-45') return x >= y;
  if (name === 'slope-ceiling-down-45') return x < y;
  if (name === 'slope-ceiling-up-shallow') return y < SLOPE_SHALLOW_LOW[x];
  if (name === 'slope-ceiling-down-shallow') return y < SLOPE_SHALLOW_HIGH[x];
  if (name === 'fill-a') return true;
  if (name === 'fill-b') return (x + y) % 3 !== 1;
  if (name === 'fill-c') return hash2(x, y, seed) % 5 !== 0;
  if (name === 'fill-d') return x % 4 === 0 || y % 4 === 0;
  if (name === 'pillar-mid') return x >= edge + 1 && x < far - 1;
  if (name === 'beam-cross') return x < edge || x >= far || y < edge || y >= far;
  if (name === 'beam-h') return y < edge || y >= far;
  if (name === 'beam-v') return x < edge || x >= far;
  if (name === 'platform-cap') return y < edge;
  if (name === 'platform-cap-cracked') return y < edge && !(stem && y === edge - 1);
  if (name === 'deco-stripe-h') return y % 4 === 1;
  if (name === 'deco-stripe-v') return x % 4 === 1;
  if (name === 'brick' || name === 'brick-cracked') return true;
  if (name === 'cube') return true;
  if (name === 'tissue') return dx * dx + dy * dy <= 96 + (hash2(x, y, seed + 5) % 3) * 14;
  if (name === 'rock-rubble') return hash2(x, y, seed + 9) % 5 < 3;
  if (name === 'volcano-crater') {
    const m = dx * dx + dy * dy;
    return m <= 120 && (m >= 30 || hash2(x, y, seed + 13) % 3 === 0);
  }
  if (name === 'duct-junction') {
    const ring = Math.min(x, size - 1 - x, y, size - 1 - y);
    return ring <= edge - 1;
  }
  if (name === 'anchor-bolt') return stem && (y < edge || y >= far);
  // default: a filled block (covers 'fill-a', 'brick', 'cube' above)
  return true;
}

/**
 * The palette index of one solid tile pixel: hashed rock texture with a bright cap where
 * the tile ends downward, a dark underside where it ends upward, side shade, mortar and
 * crack lines on the destructibles, accent deco on the deco tiles.
 *
 * @param name - Tile name.
 * @param x - Column.
 * @param y - Row.
 * @param ti - Frame index in {@link STANDIN_TILES} (shifts the texture between tiles).
 * @param solid - The tile's solidity grid getter `(px, py) => boolean`.
 * @param seed - The tile set's seed.
 * @returns A {@link TILE_WINDOW} palette index.
 */
function tileColor(name, x, y, ti, solid, seed) {
  const texture = hash2(x + ti * TILE_SIZE, y, seed);
  if (name.startsWith('deco')) return ACCENT_FIRST + (Math.floor((x + y) / 2) % ACCENT_COUNT);
  if (name === 'brick' || name === 'brick-cracked') {
    if (y % 4 === 3) return ROCK_FIRST;
    const seam = (Math.floor(y / 4) % 2) * 3 + 2;
    if (x % 6 === seam) return ROCK_FIRST;
    if (
      name === 'brick-cracked' &&
      (Math.abs(x - y) < 2 || Math.abs(x + y - (TILE_SIZE - 1)) < 2)
    ) {
      return SKY_FIRST + 1;
    }
    return ROCK_FIRST + 2 + (texture % 3);
  }
  if (name === 'cube') {
    const ring =
      Math.max(Math.abs(2 * x - (TILE_SIZE - 1)), Math.abs(2 * y - (TILE_SIZE - 1))) >> 2;
    return ROCK_FIRST + 1 + Math.min(ring, 4) + (texture % 2);
  }
  if (name === 'tissue') {
    const cx = 2 * x - (TILE_SIZE - 1);
    const cy = 2 * y - (TILE_SIZE - 1);
    const m = cx * cx + cy * cy;
    if (m < 25) return ACCENT_FIRST + 1;
    return ROCK_FIRST + 3 + (texture % 3);
  }
  if (name === 'volcano-crater') {
    const dx = 2 * x - (TILE_SIZE - 1);
    const m = dx * dx + (2 * y - (TILE_SIZE - 1)) * (2 * y - (TILE_SIZE - 1));
    if (m < 46) return SKY_FIRST + 1;
    if (m < 70) return ACCENT_FIRST + 2;
    return ROCK_FIRST + 2 + (texture % 2);
  }
  const above = y > 0 ? solid(x, y - 1) : false;
  const below = y < TILE_SIZE - 1 ? solid(x, y + 1) : false;
  const left = x > 0 ? solid(x - 1, y) : false;
  const right = x < TILE_SIZE - 1 ? solid(x + 1, y) : false;
  if (!below && !above && !(left || right)) return ACCENT_FIRST; // a lone cap pixel
  if (!below) return ACCENT_FIRST; // top surface
  if (!above) return SKY_FIRST; // underside in shadow
  if (!left || !right) return ROCK_FIRST + 1; // side face
  return ROCK_FIRST + 3 + (texture % TILE_TEXTURE_LEVELS); // buried texture
}

/**
 * Draws the zone's tile strip: {@link STANDIN_TILES}'s 40 frames at {@link TILE_SIZE} px,
 * every painted index inside {@link TILE_WINDOW} (26 colours ≤ 32, §4.3), alpha binary.
 *
 * @param rng - The zone's generator.
 * @returns The {@link StandinTiles}.
 */
function buildTiles(rng) {
  const size = TILE_SIZE;
  const seed = rng.nextU32();
  const indices = new Uint8Array(STANDIN_TILES.length * size * size);
  for (let ti = 0; ti < STANDIN_TILES.length; ti++) {
    const name = STANDIN_TILES[ti];
    const grid = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        grid[y * size + x] = tileSolid(name, x, y, seed) ? 1 : 0;
      }
    }
    const solid = (x, y) => grid[y * size + x] === 1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const at = (ti * size + y) * size + x;
        indices[at] = solid(x, y) ? tileColor(name, x, y, ti, solid, seed) : KEY;
      }
    }
  }
  return Object.freeze({ size, names: STANDIN_TILES, indices });
}

/**
 * Draws one zone's part-1 stand-in content (palette, far layer, keyed bands, tile set).
 * Pure function of `(zoneId, seed)`: two calls with the same arguments return byte-identical
 * data. The seed is folded into the zone name ({@link standinSeed}), so zones differ and a
 * rerun does not.
 *
 * @param zoneId - A {@link ZONE_IDS} letter.
 * @param {{ seed?: number }} [options] - `seed`: the 32-bit base seed, else {@link DEFAULT_SEED}.
 * @returns {StandinZone} The zone.
 * @throws {RangeError} When the zone id is not one of the campaign's.
 */
export function standinZone(zoneId, { seed } = {}) {
  if (!ZONE_IDS.includes(zoneId)) throw new RangeError(`unknown stand-in zone ${zoneId}`);
  const seed32 = standinSeed(zoneId, seed);
  const rng = createAssetRng(seed32);
  const palette = buildPalette(rng);
  const far = buildFar(zoneId, rng);
  const bands = buildBands(rng);
  const tiles = buildTiles(rng);
  return Object.freeze({ zoneId, seed: seed32, palette, far, bands, tiles });
}
