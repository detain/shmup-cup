/**
 * Stand-in zone art for the R3-04 memory round (decision W5-14). Part 1 (R3-04.M1a) draws
 * the seeded palette, the far layer, the keyed parallax bands and the tile set; part 2
 * (R3-04.M1b, below) draws the enemies, the boss with its parts, and packs a whole stand-in
 * set through the real pipeline with {@link standinAtlas}.
 *
 * The generators the shipped atlas uses draw v1's interim art (`procedural/`); real v2 art
 * arrives with R3. Between them, R3-04 must measure what a full v2 zone costs — PNG-8 bytes
 * per atlas page and TV memory — so this file draws *detailed stand-ins*: art made by the
 * same kind of seeded noise and silhouette maths as the interim generators, but dressed at
 * the art bible's v2 sizes and honouring its colour rules, so the measurement is of a zone
 * the bible would accept, not of a flat placeholder.
 *
 * `standinZone(zoneId, { seed })` returns one zone's part-1 content:
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
 * Every surface stays inside bible §4.3's per-layer cap of 32 colours; part 2's enemies stay
 * inside {@link ENEMY_WINDOW} (16 colours) and the boss, its parts and states inside
 * {@link BOSS_WINDOW} (24), the §4.3 caps for those roles.
 *
 * `standinAtlas(zones, { seed })` (part 2) turns the stand-ins of the given zones into
 * `*.sprite.json` pixel maps of a **temporary source tree**: the shipped `assets/source/` is
 * copied in (the pipeline reads sprites, fonts and the groups file from one root, and every
 * name a groups file lists must be a sprite there), each stand-in layer, tile, enemy, the
 * boss and its parts are written under `sprites/standin/zone-<x>/…` with `"native": true`
 * (the pixels are drawn at the v2 size — the interim stage must not scale them) and, for the
 * enemies and boss art, `"hitFlash": true` (the pipeline then adds the `@flash` silhouettes
 * exactly as it does for the shipped sprites), and the tree's `atlas-groups.json` gains one
 * `standin-zone-<x>` group per zone, listing that zone's stand-in base names — the shipped
 * groups stay unchanged, so the stand-in pages stay pure (the stand-in never joins a shipped
 * zone's pages, and the interim zone art never joins the stand-in's) and `common` stays
 * today's `common`. {@link buildAtlas} then packs it for real — groups, packer, PNG-8
 * encoder — and the temp tree is removed. Nothing is ever written into `assets/source/`.
 *
 * **The entropy is tuned to RR-7's band, and the gates hold it there (decision RR-7,
 * measured by R3-04.M1b).** `NOISE_CELL`, `HAZE_CELL`, `FAR_STREAK_ROWS`,
 * `DETAIL_DENSITY`, `RIBBON_DENSITY`, `BAND_STEP`, `BAND_WINDOW_DENSITY` and
 * `TILE_TEXTURE_LEVELS` (with part 2's `SPRITE_DETAIL_DENSITY`) land every stand-in
 * group page at 339–446 KB scaled to a 2048×1024 PNG-8 page — inside RR-7's 0.3–0.6 MB
 * band — and the band test of `test/scripts/assets/standin.test.ts` is the gate that
 * holds them there. What remains uncalibrated is the comparison against **real AI
 * art** — R3-04.M1c's pending job; the per-knob lines below point here.
 *
 * This module is **never loaded by the shipped pipeline**. Nothing under
 * `scripts/assets/` imports it — the pipeline only folds the file into its directory
 * code-hash; its only importer is its own test, and R3-04.M4a's bench will import
 * `standinAtlas` as a consumer. Adding the file makes `pnpm assets` rebuild once and
 * changes no atlas byte (wave-04 rule: the scale-1 digest pin never moves). Because the
 * pipeline never loads it, it may import `scripts/frame.mjs` for the frame constants —
 * the one root-script exception `terrain.mjs`'s docblock explains the shipped generators
 * must not take.
 *
 * Determinism (M1's rule, the same as every generator here): exact integer maths and the
 * seeded `rng.mjs` only — no `Math.random`, no trig functions, no `**` — so the pixels are
 * identical on every engine and every run. Layers wrap seamlessly in x: every noise cell
 * span and silhouette period divides {@link FRAME_W}.
 *
 * @module
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FRAME_H, FRAME_W, PLAYFIELD_H, TILE_SIZE } from '../frame.mjs';
import { ATLAS_GROUPS_FILE, DEFAULT_SOURCE_DIR, buildAtlas } from './pipeline.mjs';
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
export const BAND_MIN_COUNT = 4;
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
 * **RR-7 entropy knob** — tuned to the band; see the module docblock.
 */
export const NOISE_CELL = 8;

/**
 * Width (px) of the large wash noise cells that soften the far gradient and the band
 * terraces. **RR-7 entropy knob** — see the module docblock.
 */
export const HAZE_CELL = 16;

/**
 * Rows the far layer's cloud streaks merge per noise cell — streaks are wide and flat, not
 * round blobs. **RR-7 entropy knob** — see the module docblock.
 */
export const FAR_STREAK_ROWS = 3;

/**
 * Speckle probability (per thousand pixels): a speckled pixel steps one level brighter or
 * darker. **RR-7 entropy knob** — the dominant PNG-8 cost of noise, tuned to the band; see
 * the module docblock. At its measured 1000 the `% 1000 < DETAIL_DENSITY` test is always
 * true (every pixel steps ±1), so the knob has no headroom above 1000 — it retunes down,
 * and tuning up means changing the test.
 */
export const DETAIL_DENSITY = 1000;

/**
 * Cloud coverage of the far layer (per thousand): the streak noise must rise above this
 * quantile of its `0…15` range before a pixel steps two levels up. **RR-7 entropy knob** —
 * see the module docblock.
 */
export const RIBBON_DENSITY = 230;

/**
 * Depth (px) per colour terrace of a band below its skyline. **RR-7 entropy knob** — see
 * the module docblock.
 */
export const BAND_STEP = 3;

/** Skyline rows drawn with the band window's brightest colour (rim light). */
export const BAND_RIM_DEPTH = 2;

/**
 * Keyed-window probability (per thousand pixels deeper than 8 px): a hole the far layer
 * shows through. **RR-7 entropy knob** — see the module docblock.
 */
export const BAND_WINDOW_DENSITY = 35;

/**
 * Texture levels a tile body mixes below its cap row. **RR-7 entropy knob** — see the
 * module docblock.
 */
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
 * @returns {@link BAND_MIN_COUNT}–{@link BAND_MAX_COUNT} (4–5) {@link StandinSurface}s.
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
    const amp1 = Math.round((height * rng.rangeInt(140, 420)) / 1000);
    const amp2 = Math.round((height * rng.rangeInt(60, 220)) / 1000);
    const base = rng.rangeInt(Math.floor(height / 8), Math.floor(height / 2));
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

/* ------------------------------------------------------------------------ *
 * Part 2 (R3-04.M1b): the enemy and boss sprites, and the real-pipeline pack.
 * ------------------------------------------------------------------------ */

/**
 * The enemy roster of one stand-in zone (§5.6's roles at bible v2 sizes; the shapes are the
 * archetypes the interim `procedural/enemies` draws, dressed with wings, pods and lights).
 * `width`/`height` are the base pixel edges; the zone seed jitters each by `0…4` px (even).
 *
 * @typedef {object} StandinEnemyKind
 * @property {string} name - Kebab name, sprite `standin/zone-<id>/<name>`.
 * @property {number} width - Base edge across.
 * @property {number} height - Base edge down.
 */

/**
 * The boss part sprites of one stand-in zone (the multi-part boss's weak points, §5.7):
 * `frames` static per part, sizes fixed by the recipe.
 *
 * @typedef {object} StandinBossPart
 * @property {string} name - Kebab name, sprite `standin/zone-<id>/<name>`.
 * @property {number} width - Pixel edge across.
 * @property {number} height - Pixel edge down.
 * @property {number} frames - Frame count (a turret's headings, a pod's pulse).
 */

/** Fewest frames one stand-in enemy gets. */
export const ENEMY_FRAME_MIN = 4;
/** Most frames one stand-in enemy gets. */
export const ENEMY_FRAME_MAX = 6;

/** Width (px) of the stand-in boss (§5.7's big multi-part hull at v2 size). */
export const BOSS_WIDTH = 420;

/**
 * Height (px) of the stand-in boss: 60 % of the playfield — `Math.round(0.6 * PLAYFIELD_H)`,
 * never a literal (the frame scan; the value is 202 at 640×360).
 */
export const BOSS_HEIGHT = Math.round(0.6 * PLAYFIELD_H);

/** The boss's states (frames): phase-1 armour, cracked plating, exposed core. */
export const BOSS_STATES = 3;

/**
 * The stand-in zone's enemies (§5.6 roles; {@link ENEMY_FRAME_MIN}–{@link ENEMY_FRAME_MAX}
 * frames each). The `turret` carries the role's name at §5.6's Large class (30–60 px),
 * not the small 18–21 px turret row — the size is the byte model's.
 */
export const STANDIN_ENEMY_KINDS = Object.freeze([
  { name: 'grunt', width: 28, height: 22 },
  { name: 'dart', width: 26, height: 16 },
  { name: 'orb', width: 22, height: 22 },
  { name: 'tank', width: 44, height: 32 },
  { name: 'turret', width: 30, height: 28 },
  { name: 'bomber', width: 40, height: 30 },
  { name: 'weaver', width: 28, height: 18 },
  { name: 'skimmer', width: 34, height: 20 },
  { name: 'pod', width: 22, height: 26 },
  { name: 'hauler', width: 48, height: 32 },
]);

/**
 * The stand-in boss's parts (weak points a multi-part boss tree hangs on its hull). One
 * deviation noted by review: the sizes shortcut bible §5.7's part table (e.g. the 44×44
 * turret over its 24×24/16-heading row) — a deliberate byte-model shorthand of the
 * placeholder generator; real art replaces these at R3/R5, and §5.7 governs that art.
 */
export const STANDIN_BOSS_PARTS = Object.freeze([
  { name: 'boss-turret', width: 44, height: 44, frames: 4 },
  { name: 'boss-pod', width: 26, height: 26, frames: 3 },
  { name: 'boss-cannon', width: 30, height: 18, frames: 2 },
]);

/** An enemy's colour window: the eight brightest mids and the accents (16, §4.3's cap). */
export const ENEMY_WINDOW = Object.freeze(
  range(MID_FIRST + 8, 8).concat(range(ACCENT_FIRST, ACCENT_COUNT)),
);

/** The boss's colour window: bright rocks, bright mids, accents (24, §4.3's cap). */
export const BOSS_WINDOW = Object.freeze(
  range(ROCK_FIRST + 8, 8).concat(range(MID_FIRST + 8, 8), range(ACCENT_FIRST, ACCENT_COUNT)),
);

/**
 * Speckle probability (per thousand pixels) on the stand-in sprites — the same §5.10/§5.12
 * surface noise the part-1 layers carry, so the enemy and boss art costs PNG-8 bytes like
 * detailed art, not like flat fills. **RR-7 entropy knob** like the ones above — tuned to
 * the band; see the module docblock. At its measured 1000 the `% 1000` test is always true
 * (every pixel steps ±1), so the knob has no headroom above 1000 — it retunes down, and
 * tuning up means changing the test.
 */
export const SPRITE_DETAIL_DENSITY = 1000;

/** Characters for palette slots: slot `i` draws with `SPRITE_CHAR_POOL[i]` (94 printable keys fit). */
export const SPRITE_CHAR_POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Transparent pixel's character in a stand-in pixel map. */
const TRANS_CHAR = '.';

/** Frame wing offsets (doubled px): a four-frame flap cycle (no trig, a table). */
const FLAP = Object.freeze([-2, 0, 2, 0]);

/** Frame ribbon heights (doubled px ×2): an eight-step wave the weaver swims. */
const WAVE8 = Object.freeze([0, 1, 2, 3, 4, 3, 2, 1]);

/**
 * The sprite name of one stand-in part: `standin/zone-<zoneId>/<segments…>`.
 *
 * @param zoneId - Zone letter.
 * @param segments - Path segments below the zone.
 * @returns The sprite name.
 */
export function standinSpriteName(zoneId, ...segments) {
  return `standin/zone-${zoneId}/${segments.join('/')}`;
}

/**
 * The atlas group of one stand-in zone: `standin-zone-<zoneId>` — never `zone-<id>`, the
 * shipped group its directory segment alone would fall into.
 *
 * @param zoneId - Zone letter.
 * @returns The group name.
 */
export function standinGroupName(zoneId) {
  return `standin-zone-${zoneId}`;
}

/**
 * Axis-aligned box in doubled coordinates (centred frame, even half-edges).
 *
 * @param dx - Doubled column from the centre.
 * @param dy - Doubled row from the centre.
 * @param cx - Centre column (doubled).
 * @param cy - Centre row (doubled).
 * @param hw - Half-width (doubled px, even).
 * @param hh - Half-height (doubled px, even).
 * @returns `true` inside.
 */
function inBox(dx, dy, cx, cy, hw, hh) {
  return Math.abs(dx - cx) <= hw && Math.abs(dy - cy) <= hh;
}

/**
 * Diamond in doubled coordinates (even half-diagonals).
 *
 * @param dx - Doubled column.
 * @param dy - Doubled row.
 * @param cx - Centre column.
 * @param cy - Centre row.
 * @param rx - Half-diagonal across (doubled px).
 * @param ry - Half-diagonal down (doubled px).
 * @returns `true` inside.
 */
function inDiamond(dx, dy, cx, cy, rx, ry) {
  return Math.abs(dx - cx) * ry + Math.abs(dy - cy) * rx <= rx * ry;
}

/**
 * Ellipse in doubled coordinates (even half-axes); exact integer maths only.
 *
 * @param dx - Doubled column.
 * @param dy - Doubled row.
 * @param cx - Centre column.
 * @param cy - Centre row.
 * @param rx - Semi-axis across (doubled px).
 * @param ry - Semi-axis down (doubled px).
 * @returns `true` inside.
 */
function inEllipse(dx, dy, cx, cy, rx, ry) {
  const a = (dx - cx) * ry;
  const b = (dy - cy) * rx;
  return a * a + b * b <= rx * rx * ry * ry;
}

/** Sprite roles part 2 paints (0 is empty). */
const ROLE = Object.freeze({ HULL: 1, WING: 2, DARK: 3, ACCENT: 4, PLATE: 5 });

/**
 * The role of one enemy pixel: each archetype is a union of ellipse/diamond/box primitives
 * with a lighted part; wings ride the {@link FLAP} cycle. Faces point left (the side-scroller
 * convention the interim enemies share).
 *
 * @param kind - The archetype's kebab name.
 * @param dx - Doubled column from the frame centre.
 * @param dy - Doubled row from the frame centre.
 * @param x - Pixel column (for the hashed seams).
 * @param y - Pixel row.
 * @param f - Frame index.
 * @param w - Frame width (px).
 * @param h - Frame height (px).
 * @returns A {@link ROLE} value.
 */
function enemyRole(kind, dx, dy, x, y, f, w, h) {
  const bob = FLAP[f % 4];
  if (kind === 'grunt') {
    if (inDiamond(dx, dy, -6, 0, 8, 6)) return ROLE.ACCENT;
    if (inEllipse(dx, dy, 0, 0, w - 6, h - 4)) return ROLE.HULL;
    if (inBox(dx, dy, 0, bob, w - 6, 6) && Math.abs(dx) >= 14) return ROLE.WING;
    return 0;
  }
  if (kind === 'dart') {
    if (inDiamond(dx, dy, -(w - 5), 0, 8, 6)) return ROLE.ACCENT;
    if (inBox(dx, dy, w - 4, 0, 4, 6)) return ROLE.DARK;
    if (inDiamond(dx, dy, 0, 0, w - 2, h - 1)) return ROLE.HULL;
    if (inBox(dx, dy, 8, bob, 10, 3)) return ROLE.WING;
    return 0;
  }
  if (kind === 'orb') {
    if (inEllipse(dx, dy, 0, 0, 8, 8)) return ROLE.DARK;
    if (inEllipse(dx, dy, 0, 0, w - 4, h - 4) && !inEllipse(dx, dy, 0, 0, w - 10, h - 10)) {
      return ROLE.ACCENT;
    }
    if (inEllipse(dx, dy, 0, 0, w - 2, h - 2)) return ROLE.HULL;
    return 0;
  }
  if (kind === 'tank') {
    if (inBox(dx, dy, 24, -20 + bob, 4, 2)) return ROLE.ACCENT;
    if (inBox(dx, dy, 0, h - 8, w - 6, 5)) return x % 5 === 0 ? ROLE.HULL : ROLE.DARK;
    if (inEllipse(dx, dy, 2, -10, w - 22, 10)) return ROLE.HULL;
    if (inBox(dx, dy, -(w - 12), -8, 12, 3)) return ROLE.WING;
    if (inBox(dx, dy, 2, 4, w - 8, h - 16)) return ROLE.HULL;
    return 0;
  }
  if (kind === 'turret') {
    if (f % 2 === 0 && inDiamond(dx, dy, 0, -4, 8, 8)) return ROLE.ACCENT;
    if (inEllipse(dx, dy, 0, -4, w - 10, 14)) return ROLE.HULL;
    if (inBox(dx, dy, -16, -10, 12, 4)) return ROLE.WING;
    if (inBox(dx, dy, 0, h - 8, w - 6, 6)) return x % 6 === 0 ? ROLE.HULL : ROLE.DARK;
    return 0;
  }
  if (kind === 'bomber') {
    if (inEllipse(dx, dy, -16, 14, 10, 8) || inEllipse(dx, dy, 16, 14, 10, 8)) return ROLE.HULL;
    if (Math.abs(dy - 8) <= 3 && Math.abs(dx) <= 20 && (x % 4 === 0 || (x >> 2) % 3 === f % 3)) {
      return (x + (f % 3) * 6) % 8 < 2 ? ROLE.ACCENT : ROLE.DARK;
    }
    if (inEllipse(dx, dy, 0, 0, w - 4, h - 6)) return ROLE.HULL;
    if (inBox(dx, dy, w - 8, -10, 6, 10)) return ROLE.WING;
    return 0;
  }
  if (kind === 'weaver') {
    const yoff = (WAVE8[(Math.floor(x / 2) + f) % 8] - 2) * 2;
    if (inDiamond(dx, dy, -(w - 8), yoff, 8, 6)) return ROLE.ACCENT;
    if (inEllipse(dx, dy, 0, yoff, 12, 8)) return ROLE.HULL;
    if (Math.abs(dy - yoff) <= 3 && Math.abs(dx) >= 12) return ROLE.WING;
    return 0;
  }
  if (kind === 'skimmer') {
    if (inEllipse(dx, dy, -8, 0, 8, 6)) return ROLE.ACCENT;
    if (inBox(dx, dy, w - 6, 0, 6, 8)) return ROLE.DARK;
    if (inDiamond(dx, dy, 0, 0, w - 2, h - 2)) return ROLE.HULL;
    if (inBox(dx, dy, 6, bob - 2, 10, 3)) return ROLE.WING;
    return 0;
  }
  if (kind === 'pod') {
    if (f % 3 === 0 && inDiamond(dx, dy, 0, -6, 6, 10)) return ROLE.ACCENT;
    if (inBox(dx, dy, 0, h - 6, 10, 4)) return ROLE.DARK;
    if (Math.abs(dy) % 10 <= 1 && Math.abs(dx) < w - 4) return ROLE.DARK;
    if (inEllipse(dx, dy, 0, 0, w - 2, h - 4)) return ROLE.HULL;
    return 0;
  }
  // hauler
  if (f % 2 === 1 && inBox(dx, dy, -30, -24, 4, 4)) return ROLE.ACCENT;
  if (inBox(dx, dy, 0, 0, w - 4, h - 6) && x % 8 === 0) return ROLE.DARK;
  if (inBox(dx, dy, -28, -10, 10, 12)) return ROLE.PLATE;
  if (inBox(dx, dy, 8, 0, w - 10, h - 8)) return ROLE.HULL;
  if (inBox(dx, dy, w - 6, 0, 4, 10)) return ROLE.DARK;
  return 0;
}

/**
 * The {@link ENEMY_WINDOW} level of one enemy pixel: a top-lit gradient on the hull and
 * wings, hashed speckle (the same §5.10 surface noise, the {@link SPRITE_DETAIL_DENSITY}
 * quantile), the light roles riding the accent tail, and a rimmed top edge.
 *
 * @param role - The pixel's {@link ROLE}.
 * @param x - Pixel column.
 * @param y - Pixel row.
 * @param f - Frame index.
 * @param h - Frame height (px).
 * @param seed - The kind's texture seed.
 * @param aboveEmpty - `true` when the pixel above is transparent (a rim-lit row).
 * @param belowEmpty - `true` when the pixel below is transparent (a shadowed foot).
 * @returns An {@link ENEMY_WINDOW} index.
 */
function enemyLevel(role, x, y, f, h, seed, aboveEmpty, belowEmpty) {
  const noise = hash2(x, y, seed);
  if (role === ROLE.ACCENT) return 8 + ((f + (x >> 2) + (y >> 1) + (noise % 2)) % 8);
  let level;
  if (role === ROLE.DARK) level = noise % 3;
  else if (role === ROLE.WING) level = (noise >>> 3) % 3;
  else level = 2 + Math.floor((y * 4) / h) + (noise % 3) - 1;
  if ((noise >>> 7) % 1000 < SPRITE_DETAIL_DENSITY) level += (noise & 1) === 0 ? 1 : -1;
  if (belowEmpty) level = 0;
  else if (aboveEmpty && role !== ROLE.DARK) level = 6;
  return clamp(level, 0, 7);
}

/**
 * The role of one boss pixel in state `s`: a big bevelled hull — box bands unioned with an
 * ellipse, like the interim capital ships — armour plates, vents, seam grilles, a left eye
 * cluster and a growing core; damage cracks spread with the state.
 *
 * @param dx - Doubled column from the centre.
 * @param dy - Doubled row from the centre.
 * @param x - Pixel column.
 * @param y - Pixel row.
 * @param s - State index.
 * @param seed - The boss's texture seed.
 * @returns A {@link ROLE} value.
 */
function bossRole(dx, dy, x, y, s, seed) {
  const hw = BOSS_WIDTH - 2;
  const hh = BOSS_HEIGHT - 2;
  const hull =
    inBox(dx, dy, 0, 0, hw - 8, hh - 24) ||
    inBox(dx, dy, 0, 0, hw - 28, hh - 8) ||
    inEllipse(dx, dy, 0, 0, hw - 4, hh - 6);
  if (!hull) return 0;
  const core = 44 + s * 44;
  if (inEllipse(dx, dy, 0, 0, core, core - 12)) return ROLE.ACCENT;
  if (inDiamond(dx, dy, -180, -30, 14, 8)) return ROLE.ACCENT;
  if (inDiamond(dx, dy, -150, 10, 10, 6)) return ROLE.ACCENT;
  if (s > 0 && hash2(x, y, seed + s * 101) % 1000 < s * 90) return ROLE.DARK;
  if (dy > hh - 44 && dy < hh - 20 && x % 10 < 6) return ROLE.DARK;
  if (inEllipse(dx, dy, 0, 0, core + 14, core + 2) && (x * 3 + y * 5) % 9 < 4) return ROLE.PLATE;
  if (x % 26 < 1 || y % 30 < 1) return ROLE.DARK;
  if (Math.abs(dy + 30) <= 20 && x % 78 < 40) return ROLE.PLATE;
  if (Math.abs(dy - 40) <= 24 && x % 6 < 3) return ROLE.PLATE;
  return ROLE.HULL;
}

/**
 * The {@link BOSS_WINDOW} level of one boss pixel: rock gradient on the hull, mid families
 * on the plates, the accent tail for core and eyes with a hashed pulse, speckle throughout,
 * rim and foot edges like the enemies.
 *
 * @param role - The pixel's {@link ROLE}.
 * @param x - Pixel column.
 * @param y - Pixel row.
 * @param s - State index.
 * @param seed - The boss's texture seed.
 * @param aboveEmpty - `true` when the pixel above is transparent.
 * @param belowEmpty - `true` when the pixel below is transparent.
 * @returns A {@link BOSS_WINDOW} index.
 */
function bossLevel(role, x, y, s, seed, aboveEmpty, belowEmpty) {
  const noise = hash2(x, y, seed);
  let level;
  if (role === ROLE.ACCENT) level = 16 + (noise % 8);
  else if (role === ROLE.DARK) level = 1 + (noise % 3);
  else if (role === ROLE.PLATE) level = 8 + ((noise >>> 2) % 6) + ((x + y) % 6 < 2 ? 2 : 0);
  else {
    level = 3 + Math.floor((y * 5) / BOSS_HEIGHT) + (noise % 4);
    if ((x + noise) % 9 < 2) level -= 2;
  }
  if (noise % 1000 < SPRITE_DETAIL_DENSITY) level += (noise >> 5) & 1 ? 1 : -1;
  if (belowEmpty) level = 0;
  else if (aboveEmpty && role !== ROLE.DARK && level < 16) level += 2;
  return clamp(level, 0, 23);
}

/**
 * The role of one boss-part pixel: the turret's barrel steps through four headings frame by
 * frame, the pod pulses a ring, the cannon flashes its muzzle alternate frames.
 *
 * @param part - The part's kebab name.
 * @param dx - Doubled column from the centre.
 * @param dy - Doubled row from the centre.
 * @param x - Pixel column.
 * @param y - Pixel row.
 * @param f - Frame index.
 * @returns A {@link ROLE} value.
 */
function partRole(part, dx, dy, x, y, f) {
  if (part === 'boss-turret') {
    if (inEllipse(dx, dy, 0, 0, 28, 28)) {
      if (inEllipse(dx, dy, 0, 0, 12, 12)) return ROLE.DARK;
      if (x % 7 < 2 && Math.abs(dx) + Math.abs(dy) < 24) return ROLE.PLATE;
      return ROLE.HULL;
    }
    if (f % 4 === 0 && inBox(dx, dy, 0, -18, 6, 16)) return ROLE.WING;
    if (f % 4 === 1 && inBox(dx, dy, 18, 0, 16, 6)) return ROLE.WING;
    if (f % 4 === 2 && inBox(dx, dy, 0, 18, 6, 16)) return ROLE.WING;
    if (f % 4 === 3 && inBox(dx, dy, -18, 0, 16, 6)) return ROLE.WING;
    return 0;
  }
  if (part === 'boss-pod') {
    if (f % 3 === 0 && inDiamond(dx, dy, 0, 0, 8, 8)) return ROLE.ACCENT;
    if (inEllipse(dx, dy, 0, 0, 12, 12) && !inEllipse(dx, dy, 0, 0, 8, 8)) return ROLE.PLATE;
    if (inEllipse(dx, dy, 0, 0, 20, 20)) return ROLE.HULL;
    return 0;
  }
  // boss-cannon
  if (f === 1 && inBox(dx, dy, -16, 0, 8, 6)) return ROLE.ACCENT;
  if (inBox(dx, dy, 2, 0, 22, 10)) return x % 6 < 2 ? ROLE.PLATE : ROLE.HULL;
  if (inBox(dx, dy, 14, -6, 8, 2)) return ROLE.DARK;
  return 0;
}

/**
 * The {@link BOSS_WINDOW} level of one boss-part pixel (parts share the boss's window and cap).
 *
 * @param role - The pixel's {@link ROLE}.
 * @param x - Pixel column.
 * @param y - Pixel row.
 * @param f - Frame index.
 * @param seed - The part's texture seed.
 * @param aboveEmpty - `true` when the pixel above is transparent.
 * @param belowEmpty - `true` when the pixel below is transparent.
 * @returns A {@link BOSS_WINDOW} index.
 */
function partLevel(role, x, y, f, seed, aboveEmpty, belowEmpty) {
  const noise = hash2(x, y, seed);
  let level;
  if (role === ROLE.ACCENT) level = 20 + (f % 4);
  else if (role === ROLE.DARK) level = 1;
  else if (role === ROLE.PLATE) level = 9 + (noise % 3);
  else if (role === ROLE.WING) level = 8 + (noise % 2);
  else level = 4 + Math.floor((y * 3) / 22) + (noise % 2);
  if (noise % 1000 < SPRITE_DETAIL_DENSITY) level += (noise & 1) === 0 ? 1 : -1;
  if (belowEmpty) level = 0;
  else if (aboveEmpty && level < 16) level += 2;
  return clamp(level, 0, 23);
}

/**
 * Draws a sprite's frames: a role pass, then the level pass over its neighbours, mapped
 * through the colour window to palette slots ({@link KEY} where empty). The pixel data the
 * sprite JSON files carry.
 *
 * @param width - Frame width (px).
 * @param height - Frame height (px).
 * @param frameCount - Frames to draw.
 * @param window - The sprite's palette window (level → palette slot).
 * @param roleAt - `(f, dx, dy, x, y) => role`, the silhouette test in doubled coords.
 * @param levelAt - `(role, x, y, f, aboveEmpty, belowEmpty) => level`, the colouring.
 * @returns {Uint8Array} Row-major palette indices (`frames * width * height`), {@link KEY} empty.
 */
function paintFrames(width, height, frameCount, window, roleAt, levelAt) {
  const size = width * height;
  const indices = new Uint8Array(size * frameCount).fill(KEY);
  for (let f = 0; f < frameCount; f++) {
    const roles = new Uint8Array(size);
    for (let y = 0; y < height; y++) {
      const dy = 2 * y - (height - 1);
      for (let x = 0; x < width; x++) {
        roles[y * width + x] = roleAt(f, 2 * x - (width - 1), dy, x, y);
      }
    }
    const grid = indices.subarray(f * size);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const role = roles[y * width + x];
        if (role === 0) continue;
        const above = y > 0 ? roles[y * width + x - width] : 0;
        const below = y + 1 < height ? roles[y * width + x + width] : 0;
        grid[y * width + x] = window[levelAt(role, x, y, f, above === 0, below === 0)];
      }
    }
  }
  return indices;
}

/**
 * The `rows` strings of one frame: every palette slot its own {@link SPRITE_CHAR_POOL}
 * character, {@link KEY} the transparent dot.
 *
 * @param indices - Row-major palette indices of the frame.
 * @param width - Frame width (px).
 * @param height - Frame height (px).
 * @returns The pixel-map rows.
 */
function rowsOf(indices, width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x];
      row += v === KEY ? TRANS_CHAR : SPRITE_CHAR_POOL[v];
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Writes one stand-in sprite as a `*.sprite.json` pixel map below `sprites/` (the name is
 * its path, so `standin/zone-a/boss` lands at `standin/zone-a/boss.sprite.json`):
 * `"native": true` (the pixels are drawn at the v2 size; a non-native map would be scaled
 * ×1.5 by the interim stage), and `"hitFlash": true` for the enemies and boss art, which is
 * what makes the pipeline build the `@flash` silhouettes. No `p2` map: the stand-ins are
 * never player ships, so `wantsP2Variant` leaves them alone.
 *
 * @param spritesDir - The temp tree's `sprites/` directory.
 * @param name - The sprite name.
 * @param description - One-line note carried in the file.
 * @param palette - The zone palette (slot → `#rrggbb`).
 * @param indices - Row-major palette indices, {@link KEY} empty.
 * @param width - Frame width (px).
 * @param height - Frame height (px).
 * @param frameCount - Frames in `indices`.
 * @param hitFlash - Whether the pipeline adds the `@flash` sibling.
 * @returns {void}
 */
function writeStandinSprite(
  spritesDir,
  name,
  description,
  palette,
  indices,
  width,
  height,
  frameCount,
  hitFlash,
) {
  const size = width * height;
  const used = new Set();
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== KEY) used.add(indices[i]);
  }
  const paletteObj = /** @type {Record<string, string | null>} */ ({ '.': null });
  const slots = [...used].sort((a, b) => a - b);
  for (const slot of slots) paletteObj[SPRITE_CHAR_POOL[slot]] = palette[slot];
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    frames.push({ rows: rowsOf(indices.subarray(f * size, (f + 1) * size), width, height) });
  }
  const doc = /** @type {Record<string, unknown>} */ ({
    name,
    description,
    palette: paletteObj,
    hitFlash,
    native: true,
    frames,
  });
  const parts = name.split('/');
  const dir = join(spritesDir, ...parts.slice(0, -1));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${parts[parts.length - 1]}.sprite.json`), JSON.stringify(doc) + '\n');
}

/**
 * Draws and writes one zone's whole sprite set — the 40 tiles, the ten enemies, the boss
 * and its parts — into the temp tree below `sprites/`, and lists the base names (the
 * stand-in group's content, tiles first). The zone's part-1 layers are written by
 * {@link writeStandinLayers}.
 *
 * @param spritesDir - The temp tree's `sprites/` directory.
 * @param zone - The drawn {@link StandinZone}.
 * @returns {string[]} Every stand-in base name written, in write order.
 */
function writeStandinSprites(spritesDir, zone) {
  const rng = createAssetRng((zone.seed ^ seedOf(`standin/sprites/zone-${zone.zoneId}`)) >>> 0);
  const names = [];
  const size = zone.tiles.size;
  for (let ti = 0; ti < zone.tiles.names.length; ti++) {
    const name = standinSpriteName(zone.zoneId, 'tiles', zone.tiles.names[ti]);
    const grid = zone.tiles.indices.subarray(ti * size * size, (ti + 1) * size * size);
    writeStandinSprite(
      spritesDir,
      name,
      `R3-04 stand-in tile ${zone.tiles.names[ti]}`,
      zone.palette,
      grid,
      size,
      size,
      1,
      false,
    );
    names.push(name);
  }
  for (const kind of STANDIN_ENEMY_KINDS) {
    const width = kind.width + 2 * rng.rangeInt(0, 2);
    const height = kind.height + 2 * rng.rangeInt(0, 2);
    const frames = rng.rangeInt(ENEMY_FRAME_MIN, ENEMY_FRAME_MAX);
    const seed = rng.nextU32();
    const indices = paintFrames(
      width,
      height,
      frames,
      ENEMY_WINDOW,
      (f, dx, dy, x, y) => enemyRole(kind.name, dx, dy, x, y, f, width, height),
      (role, x, y, f, above, below) => enemyLevel(role, x, y, f, height, seed, above, below),
    );
    const name = standinSpriteName(zone.zoneId, kind.name);
    writeStandinSprite(
      spritesDir,
      name,
      `R3-04 stand-in enemy ${kind.name}`,
      zone.palette,
      indices,
      width,
      height,
      frames,
      true,
    );
    names.push(name);
  }
  const bossSeed = rng.nextU32();
  const bossIndices = paintFrames(
    BOSS_WIDTH,
    BOSS_HEIGHT,
    BOSS_STATES,
    BOSS_WINDOW,
    (s, dx, dy, x, y) => bossRole(dx, dy, x, y, s, bossSeed),
    (role, x, y, s, above, below) => bossLevel(role, x, y, s, bossSeed, above, below),
  );
  const bossName = standinSpriteName(zone.zoneId, 'boss');
  writeStandinSprite(
    spritesDir,
    bossName,
    'R3-04 stand-in boss (three states)',
    zone.palette,
    bossIndices,
    BOSS_WIDTH,
    BOSS_HEIGHT,
    BOSS_STATES,
    true,
  );
  names.push(bossName);
  for (const part of STANDIN_BOSS_PARTS) {
    const seed = rng.nextU32();
    const indices = paintFrames(
      part.width,
      part.height,
      part.frames,
      BOSS_WINDOW,
      (f, dx, dy, x, y) => partRole(part.name, dx, dy, x, y, f),
      (role, x, y, f, above, below) => partLevel(role, x, y, f, seed, above, below),
    );
    const name = standinSpriteName(zone.zoneId, part.name);
    writeStandinSprite(
      spritesDir,
      name,
      `R3-04 stand-in boss part ${part.name}`,
      zone.palette,
      indices,
      part.width,
      part.height,
      part.frames,
      true,
    );
    names.push(name);
  }
  return names;
}

/**
 * Draws and writes one zone's part-1 backdrop layers — the far (opaque) and the keyed bands
 * — as pixel maps too, so the stand-in atlas measures the whole zone (§5.10's stack), not
 * only its sprites. The `KEY` sentinel becomes the `null` palette entry (binary alpha, the
 * green key's pre-atlas form; M1a's mapping note).
 *
 * @param spritesDir - The temp tree's `sprites/` directory.
 * @param zone - The drawn {@link StandinZone}.
 * @returns {string[]} The layer base names, far first.
 */
function writeStandinLayers(spritesDir, zone) {
  const names = [];
  const far = zone.far;
  const farName = standinSpriteName(zone.zoneId, 'far');
  writeStandinSprite(
    spritesDir,
    farName,
    'R3-04 stand-in far layer',
    zone.palette,
    far.indices,
    far.width,
    far.height,
    1,
    false,
  );
  names.push(farName);
  zone.bands.forEach((band, b) => {
    const name = standinSpriteName(zone.zoneId, `band-${b + 1}`);
    writeStandinSprite(
      spritesDir,
      name,
      `R3-04 stand-in keyed band ${b + 1}`,
      zone.palette,
      band.indices,
      band.width,
      band.height,
      1,
      false,
    );
    names.push(name);
  });
  return names;
}

/**
 * Packs the stand-in art of the given zones through the real pipeline (decision W5-14, the
 * R3-04 measurement's data source): a temp source tree gets (1) a copy of all of
 * `assets/source/`, (2) every stand-in layer, tile, enemy, the boss and its parts as
 * `sprites/standin/zone-<x>/…` pixel maps, (3) the shipped `atlas-groups.json` plus one
 * `standin-zone-<x>` group per zone listing its stand-in names, and then (4) the real
 * {@link buildAtlas} — groups, packer and PNG-8 encoder — before the tree is removed. The
 * shipped `assets/source/` is never written to.
 *
 * Every `standin-zone-<x>` group's pages are PNG-8 (their colours are the ≤ 56-slot zone
 * palette plus the flash white, far under the 256-entry indexed ceiling), which is what
 * makes the group's byte measurement comparable to a shipped zone page.
 *
 * @param {string[]} [zones] - Zone letters to include (default all nine {@link ZONE_IDS}).
 * @param {{ seed?: number }} [options] - Forwarded to {@link standinZone} for every zone.
 * @returns {ReturnType<typeof buildAtlas>} Exactly what `buildAtlas({ sourceDir })` returns
 *   for the temp tree.
 * @throws {RangeError} When a zone id is not one of the campaign's.
 */
export function standinAtlas(zones = ZONE_IDS, options = {}) {
  for (const zoneId of zones) {
    if (!ZONE_IDS.includes(zoneId)) throw new RangeError(`unknown stand-in zone ${zoneId}`);
  }
  const tmp = mkdtempSync(join(tmpdir(), 'shmup-standin-'));
  try {
    cpSync(DEFAULT_SOURCE_DIR, tmp, { recursive: true });
    const spritesDir = join(tmp, 'sprites');
    const groupsPath = join(tmp, ATLAS_GROUPS_FILE);
    const groupsDoc = /** @type {{ groups: Record<string, string[]> }} */ (
      JSON.parse(readFileSync(groupsPath, 'utf8'))
    );
    for (const zoneId of zones) {
      const zone = standinZone(zoneId, options);
      const names = writeStandinLayers(spritesDir, zone).concat(
        writeStandinSprites(spritesDir, zone),
      );
      groupsDoc.groups[standinGroupName(zoneId)] = names;
    }
    writeFileSync(groupsPath, JSON.stringify(groupsDoc, null, 2) + '\n');
    return buildAtlas({ sourceDir: tmp });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
