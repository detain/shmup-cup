/**
 * Zone B, **BRINE NEBULA** (plan M2-11) — placeholder art of the bubble / aqua zone (decision D24):
 *
 * - `bg/brine-nebula` ({@link NEBULA_TILE_W}×{@link NEBULA_TILE_H}, the far band): translucent teal
 *   and violet gas clouds with a few bright specks; the clouds wrap round the tile edge, so the band
 *   repeats seamlessly.
 * - `bg/brine-sea` ({@link BRINE_SEA_W}×{@link BRINE_SEA_H}, a mid band): the drifting "sea" at the
 *   bottom of the nebula, painted **only** in the four colours of {@link BRINE_RAMP} (so the stage's
 *   palette cycle rolls it and its `wave` raster effect makes it wobble — `bg/sea-swell`'s recipe),
 *   plus pale bubble rings outside the ramp.
 * - Enemies (all facing left, hit-flash siblings): `enemies/froth` (a big iridescent splitting
 *   bubble, 2 frames), `enemies/froth-bead` (a small one), `enemies/brood-bubble` (a green bubble
 *   with a fish curled inside, 2 frames), `enemies/gill-dart` (the fish, tail beating, 2 frames),
 *   `enemies/reef-jelly` (a jellyfish, tentacles swaying, 2 frames), `enemies/urchin` (a spiny floor
 *   turret with a glowing eye — the renderer flips it on a ceiling), `enemies/maw-rocket` (a homing
 *   rocket with a flickering flame, 2 frames).
 * - GALVANIC MAW (GM-02), the mechanical fish: `bosses/maw-hull` (the body with its eye, gill
 *   slits and plating), `bosses/maw-jaw-top` / `-bottom` (the steel jaws), `bosses/maw-core` (the
 *   glowing gullet — the weak point, 2 frames), `bosses/maw-pod` (a rocket pod), `bosses/maw-fin`
 *   (the tail fin); and the mid-boss SPUME HERALD's `bosses/herald-shell` (a ridged shell with a
 *   glowing slit, 2 frames).
 *
 * Everything is kept low in saturation next to the pink / red / purple bullets and the capsules
 * (shmup_feat.md §12, §18). Geometry uses only `+ - * /` and `Math.sqrt`, randomness the seeded
 * asset RNG and `hash2` (seeded from the sprite names), so the pixels are identical on every
 * engine.
 *
 * **Since R5-02.S2 this generator also draws zone B's v2 stand-ins** (design
 * `docs/v2-run/designs/zone-b.md` §14 — the mirror of the zone-C landing, `dune.mjs`): the mine
 * and the skipper, the Herald's crown fin and the Maw's ridge spine, the deep-water far band and
 * the fore foam, the three coral fans, the swaying kelp and the glow vent of the §9 decor, and the
 * first v2 tileset sprite `tiles/terrain-reef-v2` — {@link BRINE_V2_SPRITES}. They appear **only
 * on the `(options.artScale ?? 1) !== 1` path** and every one is `native` (decision RR-1a), so the
 * scale-1 build returns exactly the sixteen v1 sprites above, byte for byte, and the v2 names are
 * simply absent there. The bands are seamless tiles at a half-`FRAME_W` period like zone A's and
 * zone C's (design §14 asks a full-frame deep band; the 512-page pack law of
 * `test/scripts/assets/pipeline-edge.test.ts` ships it at the repeating half-frame tile, the
 * disclosed precedent); `bg/brine-deep-v2` is fully opaque, `fore/brine-foam` is binary, and the
 * only translucent paint anywhere is the design-named glow of {@link SOFT_ALPHA} — the vent's halo
 * and the armed mine's lamp. Every lit colour of every new name sits at Chebyshev distance ≥ 3
 * from every reserved palette-cycle ramp (bible §4.4, asserted by
 * `test/scripts/assets/procedural-zone-b.test.ts`) — no flat-ramp band here rides a cycle, so no
 * exemption is needed.
 *
 * **Public API.** {@link generate}, {@link BRINE_SPRITES}, {@link BRINE_RAMP} (the colours zone B's
 * palette cycle must name), {@link NEBULA_TILE_W} / {@link NEBULA_TILE_H}, {@link BRINE_SEA_W} /
 * {@link BRINE_SEA_H} (the bands' tile sizes, their parallax `spacing`) and — since R5-02.S2 —
 * {@link BRINE_V2_SPRITES}, {@link BRINE_V2_TILES}, {@link BRINE_V2_TILE_NAMES},
 * {@link BAND_TILE_W}, {@link DEEP_H}, {@link FOAM_H}.
 *
 * @module
 */
import { createImage, flipVertical, setPixel } from '../image.mjs';
import { createAssetRng, hash2 } from '../rng.mjs';
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

// The frame constants come from the scripts' pinned mirror (`scripts/frame.mjs`, owner decision
// O8) directly, not through `../v2kit.mjs`: the kit imports this module for `BRINE_RAMP`, and it
// re-exports the mirror only in a statement at its own foot — read through the kit, this module's
// top-level `BAND_TILE_W = FRAME_W / 2` would run before the kit finishes evaluating whenever the
// pipeline enters the cycle at the kit (the edge suite did), and see `undefined`. The leaf mirror
// initializes first under every entry order, and the pipeline's `CODE_HASH` hashes `frame.mjs`
// itself (R4-P.P3), so a moved mirror still re-draws every sprite.
import { FRAME_H, FRAME_W } from '../../frame.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/brine-nebula` tile (its parallax `spacing`). */
export const NEBULA_TILE_W = 128;

/** Height of the `bg/brine-nebula` tile. */
export const NEBULA_TILE_H = 64;

/** Width of the `bg/brine-sea` tile (its parallax `spacing`). */
export const BRINE_SEA_W = 128;

/** Height of the `bg/brine-sea` tile. */
export const BRINE_SEA_H = 48;

/**
 * The brine sea's four colours, dark → light — the exact colours zone B's palette cycle names
 * (`content/stages/zone-b.stage.json`).
 */
export const BRINE_RAMP = Object.freeze(['#10323e', '#184658', '#225c6e', '#2e7486']);

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
 * The sprites this generator draws at art scale 1, in order.
 */
export const BRINE_SPRITES = Object.freeze([
  'bg/brine-nebula',
  'bg/brine-sea',
  'enemies/froth',
  'enemies/froth-bead',
  'enemies/brood-bubble',
  'enemies/gill-dart',
  'enemies/reef-jelly',
  'enemies/urchin',
  'enemies/maw-rocket',
  'bosses/maw-hull',
  'bosses/maw-jaw-top',
  'bosses/maw-jaw-bottom',
  'bosses/maw-core',
  'bosses/maw-pod',
  'bosses/maw-fin',
  'bosses/herald-shell',
]);

/**
 * Tile width of the v2 `bg/brine-deep-v2` and `fore/brine-foam` bands: half the frame, derived
 * from `FRAME_W` — the {@link ./dune.mjs|zone-C} precedent (design §14 asks a full-frame far
 * band; an atlas frame cannot exceed the 512-page scenario of
 * `test/scripts/assets/pipeline-edge.test.ts`, and every shipped band here is a seamless
 * repeating tile, so these are, at a period that fills the frame exactly twice).
 */
export const BAND_TILE_W = FRAME_W / 2;

/** Height of the `bg/brine-deep-v2` band (zone-b.md §14: the full frame of deep water). */
export const DEEP_H = FRAME_H;

/** Height of the `fore/brine-foam` band (zone-b.md §14). */
export const FOAM_H = 48;

/**
 * The v2 stand-in names {@link generate} adds at an art scale ≠ 1, in its output order (§14).
 */
export const BRINE_V2_SPRITES = Object.freeze([
  'enemies/brine-mine',
  'enemies/spume-skipper',
  'bosses/herald-fin',
  'bosses/maw-spine',
  'bg/brine-deep-v2',
  'fore/brine-foam',
  'decor/brine-fan-1',
  'decor/brine-fan-2',
  'decor/brine-fan-3',
  'decor/brine-kelp',
  'decor/brine-glow-vent',
  'tiles/terrain-reef-v2',
]);

/** The nine §14 variant tiles after `terrain-reef`'s twenty, in list order. */
export const BRINE_V2_TILES = /** @type {const} */ ([
  'coral-floor-a',
  'coral-floor-b',
  'coral-floor-c',
  'floor-edge',
  'ceil-edge',
  'coral-corner-outer',
  'coral-corner-inner',
  'vent-rock',
  'vent-rock-broken',
]);

/** The tile names of `tiles/terrain-reef-v2`: `terrain-reef`'s list verbatim, then the variants. */
export const BRINE_V2_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...BRINE_V2_TILES]);

/**
 * Generates zone B's art: the sixteen v1 sprites always, plus the twelve v2 stand-ins of design
 * §14 when the build runs at an art scale ≠ 1 (decision RR-1a).
 *
 * @param {{ tileSize?: number, artScale?: number }} [options] - The build's art scale and tile
 *   side (the pipeline passes both; `artScale` 1 or absent draws the v1 set only, `tileSize`
 *   defaults to the v2 {@link TILE_SIZE}).
 * @returns {SpriteDef[]} {@link BRINE_SPRITES} in that order at art scale 1; the v1 set followed
 *   by {@link BRINE_V2_SPRITES} in theirs at any other scale (the new names all `native`, their
 *   `@flash` siblings derived by the pipeline's flash pass).
 */
export function generate(options = {}) {
  const flash = { hitFlash: true };
  const jawTop = jawFrame();
  const sprites = [
    makeSprite('bg/brine-nebula', [nebula()], 'brine', { anchor: [0, 0] }),
    makeSprite('bg/brine-sea', [sea()], 'brine', { anchor: [0, 0] }),
    makeSprite('enemies/froth', [bubbleFrame(18, 0), bubbleFrame(18, 1)], 'brine', {
      hitFlash: true,
      animations: { shimmer: [0, 1] },
    }),
    makeSprite('enemies/froth-bead', [bubbleFrame(8, 0)], 'brine', flash),
    makeSprite('enemies/brood-bubble', [broodFrame(0), broodFrame(1)], 'brine', {
      hitFlash: true,
      animations: { stir: [0, 1] },
    }),
    makeSprite('enemies/gill-dart', [fishFrame(-1), fishFrame(1)], 'brine', {
      hitFlash: true,
      animations: { swim: [0, 1] },
    }),
    makeSprite('enemies/reef-jelly', [jellyFrame(0), jellyFrame(1)], 'brine', {
      hitFlash: true,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('enemies/urchin', [urchinFrame()], 'brine', flash),
    makeSprite('enemies/maw-rocket', [rocketFrame(2), rocketFrame(4)], 'brine', {
      hitFlash: true,
      animations: { burn: [0, 1] },
    }),
    makeSprite('bosses/maw-hull', [hullFrame()], 'brine', flash),
    makeSprite('bosses/maw-jaw-top', [jawTop], 'brine', flash),
    makeSprite('bosses/maw-jaw-bottom', [flipVertical(jawTop)], 'brine', flash),
    makeSprite('bosses/maw-core', [coreFrame('#f8a040'), coreFrame('#f8e070')], 'brine', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('bosses/maw-pod', [podFrame()], 'brine', flash),
    makeSprite('bosses/maw-fin', [finFrame()], 'brine'),
    makeSprite('bosses/herald-shell', [shellFrame('#40e0c8'), shellFrame('#1a7a70')], 'brine', {
      hitFlash: true,
      animations: { blink: [0, 1] },
    }),
  ];
  const artScale = options.artScale ?? 1;
  if (artScale === 1) return sprites;
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  return sprites.concat([
    makeSprite('enemies/brine-mine', [0, 1, 2, 3].map(mineFrame), 'brine', {
      ...hit,
      animations: { idle: [0, 1], armed: [2, 3] },
    }),
    makeSprite('enemies/spume-skipper', [0, 1, 2, 3].map(skipperFrame), 'brine', {
      ...hit,
      animations: { flap: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/herald-fin', [heraldFinFrame()], 'brine', hit),
    makeSprite('bosses/maw-spine', [spineFrame(0), spineFrame(1)], 'brine', {
      ...hit,
      animations: { flex: [0, 1] },
    }),
    makeSprite('bg/brine-deep-v2', [deepBand()], 'brine', { anchor: [0, 0], ...native }),
    makeSprite('fore/brine-foam', [foamBand(0), foamBand(1)], 'brine', {
      anchor: [0, 0],
      ...native,
      animations: { drift: [0, 1] },
    }),
    makeSprite('decor/brine-fan-1', [fanFrame(0)], 'brine', native),
    makeSprite('decor/brine-fan-2', [fanFrame(1)], 'brine', native),
    makeSprite('decor/brine-fan-3', [fanFrame(2)], 'brine', native),
    makeSprite('decor/brine-kelp', [0, 1, 2, 3].map(kelpFrame), 'brine', {
      ...native,
      animations: { sway: [0, 1, 2, 3] },
    }),
    makeSprite('decor/brine-glow-vent', [ventFrame(0), ventFrame(1)], 'brine', {
      ...native,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('tiles/terrain-reef-v2', reefTilesV2(size), 'brine', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(BRINE_V2_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ]);
}

/**
 * The nebula band: seeded soft cloud blobs whose density (wrapped round the tile's width) mixes
 * teal into violet and sets the alpha, and a few bright specks.
 *
 * @returns {Image} The tile.
 */
function nebula() {
  const w = NEBULA_TILE_W;
  const h = NEBULA_TILE_H;
  const rng = createAssetRng(seedOf('bg/brine-nebula'));
  const violet = color('#3a2c6e');
  const teal = color('#1e5a6a');
  const glow = color('#5a9aa8');
  /** @type {{ x: number, y: number, r: number }[]} */
  const blobs = [];
  for (let i = 0; i < 16; i++) {
    blobs.push({ x: rng.rangeInt(0, w - 1), y: rng.rangeInt(6, h - 7), r: rng.rangeInt(8, 22) });
  }
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let density = 0;
      for (const blob of blobs) {
        let dx = Math.abs(x - blob.x);
        if (dx > w / 2) dx = w - dx;
        const dy = y - blob.y;
        const d = (dx * dx + dy * dy) / (blob.r * blob.r);
        if (d < 1) density += 1 - d;
      }
      // Fade the band out towards its top and bottom rows.
      const edge = Math.min(y, h - 1 - y) / 10;
      density *= edge < 1 ? edge : 1;
      if (density < 0.08) continue;
      const t = density > 1.2 ? 1 : density / 1.2;
      const tone = t > 0.8 ? mix(teal, glow, (t - 0.8) * 5) : mix(violet, teal, t / 0.8);
      setPixel(image, x, y, withAlpha(tone, Math.round(40 + 110 * t)));
    }
  }
  for (let i = 0; i < 10; i++) {
    setPixel(image, rng.rangeInt(0, w - 1), rng.rangeInt(2, h - 3), color('#c8f0f0'));
  }
  return image;
}

/**
 * The brine sea band: 3-px bands stepping through {@link BRINE_RAMP}, bent into swells by two
 * triangle waves (32 and 16 px — they divide the tile width, so it repeats seamlessly), with pale
 * bubble rings (outside the ramp, so the palette cycle leaves them alone).
 *
 * @returns {Image} The tile.
 */
function sea() {
  const ramp = BRINE_RAMP.map(color);
  const ring = color('#8ad0d8');
  const image = createImage(BRINE_SEA_W, BRINE_SEA_H);
  for (let x = 0; x < BRINE_SEA_W; x++) {
    const swell = Math.round(4 * triangle(x, 32) + 2 * triangle(x + 5, 16));
    for (let y = 0; y < BRINE_SEA_H; y++) {
      setPixel(image, x, y, ramp[Math.floor((y + swell) / 3) % ramp.length]);
    }
  }
  const seed = seedOf('bg/brine-sea');
  for (let i = 0; i < 9; i++) {
    const cx = 6 + (hash2(i, 0, seed) % (BRINE_SEA_W - 12));
    const cy = 6 + (hash2(i, 1, seed) % (BRINE_SEA_H - 12));
    const r = 1 + (hash2(i, 2, seed) % 3);
    fillEllipse(image, cx, cy, r + 0.5, r + 0.5, (_u, _v, e) => (e > 0.55 ? ring : null));
  }
  return image;
}

/**
 * A splitting bubble: a dark rim, a teal film that turns violet towards the lower right (the
 * iridescence), a white highlight on the upper left that slides a pixel in frame 1.
 *
 * @param {number} size - Side in pixels.
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function bubbleFrame(size, frame) {
  const c = (size - 1) / 2;
  const r = size / 2 - 0.3;
  const rim = color('#0e3e50');
  const film = color('#2a8aa8');
  const iris = color('#7a6ac8');
  const edge = color('#8ae0f0');
  const shine = color('#ffffff');
  const image = createImage(size, size);
  const shift = frame * 0.12;
  fillEllipse(image, c, c, r, r, (u, v, e) => {
    if (e > 0.86) return rim;
    if (e > 0.72) return edge;
    const hx = u + 0.42 - shift;
    const hy = v + 0.42 - shift;
    if (hx * hx + hy * hy < 0.05) return shine;
    const t = (u + v + 1.4) / 2.8;
    return withAlpha(mix(film, iris, t > 1 ? 1 : t < 0 ? 0 : t), SOFT_ALPHA);
  });
  return image;
}

/**
 * The brood bubble: a green-tinted bubble with a dark fish curled inside (its orange eye), the
 * fish a pixel lower in frame 1.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function broodFrame(frame) {
  const size = 20;
  const c = (size - 1) / 2;
  const rim = color('#0c3a2c');
  const film = color('#2a7a5e');
  const edge = color('#7ad8b0');
  const fish = color('#1a2a34');
  const eye = color('#f8a040');
  const shine = color('#ffffff');
  const image = createImage(size, size);
  fillEllipse(image, c, c, 9.7, 9.7, (u, v, e) => {
    if (e > 0.88) return rim;
    if (e > 0.76) return edge;
    const hx = u + 0.45;
    const hy = v + 0.45;
    if (hx * hx + hy * hy < 0.04) return shine;
    return withAlpha(film, 190);
  });
  const fy = c + frame;
  fillEllipse(image, c + 0.5, fy, 5, 2.6, () => fish);
  drawLine(image, c + 5, fy, c + 7, fy - 2, fish);
  drawLine(image, c + 5, fy, c + 7, fy + 2, fish);
  setPixel(image, Math.round(c - 3), Math.round(fy - 1), eye);
  return image;
}

/**
 * The gill dart: an orange fish facing left — pale belly, dark outline, a white eye with a black
 * pupil — its forked tail up (`tail` −1) or down (+1).
 *
 * @param {number} tail - −1 or 1.
 * @returns {Image} The frame.
 */
function fishFrame(tail) {
  const w = 14;
  const h = 9;
  const outline = color('#4a1c0c');
  const body = color('#d86e30');
  const belly = color('#f4c070');
  const fin = color('#a04818');
  const image = createImage(w, h);
  fillEllipse(image, 5.5, 4, 5.5, 3.6, (_u, v, e) => (e > 0.8 ? outline : v > 0.25 ? belly : body));
  drawLine(image, 10, 4, 13, 4 + 2 * tail, fin);
  drawLine(image, 10, 4, 13, 4 - tail, fin);
  drawLine(image, 5, 1, 8, 0, fin);
  setPixel(image, 2, 3, color('#ffffff'));
  setPixel(image, 2, 4, color('#101010'));
  return image;
}

/**
 * The reef jelly: a sea-green bell (dark rim, glowing core) over four tentacles that sway a pixel
 * to either side between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function jellyFrame(frame) {
  const w = 14;
  const h = 16;
  const rim = color('#1e5a50');
  const bell = color('#58c8b0');
  const core = color('#c8fff0');
  const tentacle = color('#8ae0d0');
  const image = createImage(w, h);
  fillEllipse(image, 6.5, 5, 6.3, 5, (u, v, e) => {
    if (v > 0.55) return null;
    if (e > 0.82) return rim;
    return u * u + (v + 0.1) * (v + 0.1) < 0.12 ? core : bell;
  });
  for (let k = 0; k < 4; k++) {
    const x = 2 + k * 3;
    const sway = (k + frame) % 2 === 0 ? 1 : -1;
    drawLine(image, x, 8, x + sway, 11, tentacle);
    drawLine(image, x + sway, 11, x, 15, tentacle);
  }
  return image;
}

/**
 * The urchin: a dark dome on a flat base with pale spines all round its top and a glowing orange
 * eye (the gun) — drawn standing on a floor.
 *
 * @returns {Image} The frame.
 */
function urchinFrame() {
  const size = 12;
  const body = color('#3e4a60');
  const lit = color('#7080a0');
  const spine = color('#b8c0d8');
  const eye = color('#f07030');
  const image = createImage(size, size);
  const cx = 5.5;
  const cy = 7.5;
  // Spines: seven rays over the dome.
  const rays = [
    [-1, 0],
    [-0.87, -0.5],
    [-0.5, -0.87],
    [0, -1],
    [0.5, -0.87],
    [0.87, -0.5],
    [1, 0],
  ];
  for (const [dx, dy] of rays) drawLine(image, cx, cy, cx + dx * 5.5, cy + dy * 7, spine);
  fillEllipse(image, cx, cy, 4.2, 4.2, (u, v) => (v > 0.6 ? null : u + v < -0.6 ? lit : body));
  for (let x = 1; x < size - 1; x++) setPixel(image, x, size - 2, body);
  setPixel(image, 5, 7, eye);
  setPixel(image, 6, 7, eye);
  return image;
}

/**
 * The maw rocket: a grey rocket facing left (white nose, dark fins) with a flame of `flame` pixels
 * behind it.
 *
 * @param {number} flame - Flame length in pixels.
 * @returns {Image} The frame.
 */
function rocketFrame(flame) {
  const w = 12;
  const h = 7;
  const nose = color('#f0f0f0');
  const body = color('#8a94a8');
  const fin = color('#4a5060');
  const hot = color('#f8d030');
  const warm = color('#f88830');
  const image = createImage(w, h);
  for (let x = 1; x <= 7; x++) {
    for (let y = 2; y <= 4; y++) setPixel(image, x, y, x <= 1 ? nose : body);
  }
  setPixel(image, 0, 3, nose);
  drawLine(image, 6, 1, 7, 1, fin);
  drawLine(image, 6, 5, 7, 5, fin);
  for (let k = 0; k < flame; k++) {
    setPixel(image, 8 + k, 3, k < 2 ? hot : warm);
    if (k === 0) {
      setPixel(image, 8, 2, warm);
      setPixel(image, 8, 4, warm);
    }
  }
  return image;
}

/**
 * GALVANIC MAW's body (facing left, the mouth end open on the left): a plated steel-teal body
 * tapering to the tail on the right, a lit dorsal edge, riveted seams, three gill slits and a big
 * yellow eye above the mouth.
 *
 * @returns {Image} The frame.
 */
function hullFrame() {
  const w = 64;
  const h = 44;
  const seed = seedOf('bosses/maw-hull');
  const outline = color('#0c1a20');
  const plate = color('#3a6a78');
  const shade = color('#244450');
  const top = color('#7ab0bc');
  const seam = color('#1a323c');
  const rivet = color('#a8d0d8');
  const gill = color('#0a1418');
  const image = createImage(w, h);
  fillEllipse(image, 30, 21.5, 31.5, 21.5, (u, v, e, x, y) => {
    // The mouth notch on the left: the jaws and the gullet sit there.
    if (u < -0.72 && v > -0.28 && v < 0.28) return null;
    if (e > 0.92) return outline;
    if (v < -0.8) return top;
    if (x % 12 === 0 || y === 14 || y === 30) return seam;
    if ((y === 8 || y === 36) && x % 5 === 2 && hash2(x, y, seed) % 5 !== 0) return rivet;
    return v > 0.45 ? shade : plate;
  });
  for (let k = 0; k < 3; k++) drawLine(image, 18 + k * 4, 12, 16 + k * 4, 30, gill);
  fillEllipse(image, 15, 10, 4, 4, (_u, _v, e) => (e > 0.7 ? outline : color('#f8d030')));
  fillEllipse(image, 14, 10, 1.6, 1.6, () => color('#101010'));
  return image;
}

/**
 * The upper steel jaw: a toothed blade (dark outline, lit edge, a row of pale teeth along its
 * underside). The lower jaw is its vertical mirror.
 *
 * @returns {Image} The frame.
 */
function jawFrame() {
  const w = 26;
  const h = 10;
  const outline = color('#0c1a20');
  const steel = color('#5a8290');
  const lit = color('#a8d0d8');
  const tooth = color('#e8f0e0');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    // The blade thickens towards the hinge on the right.
    const depth = 3 + Math.floor((x * 4) / w);
    for (let y = 0; y < depth; y++) {
      const edge = y === 0 || y === depth - 1 || x === 0 || x === w - 1;
      setPixel(image, x, y + 1, edge ? outline : y === 1 ? lit : steel);
    }
    if (x % 3 === 1 && x < w - 3) {
      setPixel(image, x, depth + 1, tooth);
      if (x % 6 === 1) setPixel(image, x, depth + 2, tooth);
    }
  }
  return image;
}

/**
 * The gullet — the weak point: a dark round throat with a hot glowing centre (`glow`).
 *
 * @param {string} glow - The centre colour.
 * @returns {Image} The frame.
 */
function coreFrame(glow) {
  const size = 14;
  const c = (size - 1) / 2;
  const throat = color('#3a0c10');
  const hot = color('#c83a20');
  const centre = color(glow);
  const image = createImage(size, size);
  fillEllipse(image, c, c, 6.8, 6.8, (_u, _v, e) => (e > 0.8 ? throat : e > 0.45 ? hot : centre));
  return image;
}

/**
 * A rocket pod: a riveted box with a dark launch tube opening to the left.
 *
 * @returns {Image} The frame.
 */
function podFrame() {
  const w = 16;
  const h = 12;
  const outline = color('#0c1a20');
  const plate = color('#4a7684');
  const lit = color('#8ab8c4');
  const tube = color('#101418');
  const image = createImage(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const edge = y === 1 || y === h - 2 || x === 1 || x === w - 2;
      setPixel(image, x, y, edge ? outline : y === 2 ? lit : plate);
    }
  }
  for (let y = 4; y <= 7; y++) for (let x = 1; x <= 5; x++) setPixel(image, x, y, tube);
  return image;
}

/**
 * The tail fin: a forked, ribbed fin behind the body (decoration).
 *
 * @returns {Image} The frame.
 */
function finFrame() {
  const w = 18;
  const h = 26;
  const outline = color('#0c1a20');
  const fin = color('#2e5c68');
  const rib = color('#6aa0ac');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    const off = Math.abs(y - (h - 1) / 2);
    // Wide at the tips, narrow at the root on the left.
    const reach = Math.floor(4 + (off * 13) / ((h - 1) / 2));
    for (let x = 0; x <= reach && x < w; x++) {
      const edge = x === reach || x === 0 || y === 0 || y === h - 1;
      setPixel(image, x, y, edge ? outline : (y + x) % 5 === 0 ? rib : fin);
    }
  }
  return image;
}

/**
 * SPUME HERALD's shell: a ridged sand-coloured shell with a dark rim and a glowing slit (`slit`).
 *
 * @param {string} slit - The slit's colour (lit / dim).
 * @returns {Image} The frame.
 */
function shellFrame(slit) {
  const w = 30;
  const h = 22;
  const rim = color('#3a2818');
  const shell = color('#c0a070');
  const ridge = color('#8a6a48');
  const lit = color('#e8d0a0');
  const glow = color(slit);
  const image = createImage(w, h);
  fillEllipse(image, 14.5, 10.5, 14.5, 10.5, (u, v, e, x, y) => {
    if (e > 0.88) return rim;
    if (v > -0.12 && v < 0.12 && u < 0.1) return glow;
    // Ridges fanning out from the hinge on the right.
    const slope = ((y - 10.5) / (30 - x)) * 3;
    if (Math.abs(slope - Math.round(slope)) < 0.14) return ridge;
    return v < -0.5 ? lit : shell;
  });
  return image;
}

// ─────────────────────────── v2 stand-ins (R5-02.S2, zone-b.md §14) ──────────────────────────

/**
 * Zone B's v2 water, coral and steel family — `tiles/terrain-reef`'s palette (pale coral over
 * indigo rock) read from `terrain.mjs` so the new art sits on the old terrain with one source of
 * truth, plus the v2 literals of the deep band, the mine, the skipper, the herald's crown fin, the
 * Maw's ridge spine, the foam, the fans, the kelp and the glow vent. Every lit colour keeps
 * Chebyshev distance ≥ 3 from every reserved palette-cycle ramp (bible §4.4).
 */
const PAL = TERRAIN_PALETTES['tiles/terrain-reef'];
const SUR = color(PAL.surface);
const SUBS = color(PAL.subsurface);
const RK = PAL.rock.map(color);
const OUT = color('#1a2230');
const STEEL = color('#5c6e80');
const MINE_DK = color('#2e4450');
const RUST = color('#8a6a4a');
const LAMP_DIM = color('#d8a040');
const LAMP_LIT = color('#f0d060');
const SK_BODY = color('#3e6a82');
const SK_FIN = color('#7fb0c0');
const SK_BELLY = color('#c8dce4');
const HF_PLATE = color('#caa268');
const HF_LIT = color('#ead0a0');
const HF_RIM = color('#4a3826');
const SP_METAL = color('#708898');
const SP_GLOW = color('#60e0c0');
const STREAK = color('#4a7294');
const PLANK = color('#a8c8d8');
const REEF_DK = color('#0c1826');
const REEF_RIM = color('#1a2f4a');
const FOAM = color('#e8f4f0');
const FOAM_SH = color('#a8c8cc');
const FAN_A = color('#c06a5a');
const FAN_B = color('#d89070');
const FAN_C = color('#a85058');
const FAN_PALE = color('#f0c8b0');
const KELP = color('#3a7a58');
const KELP_HI = color('#5ca878');
const KELP_DK = color('#1e4a38');
const VT_ROCK = color('#3e3a4e');
const VT_DK = color('#1a1626');
const VT_GLOW = color('#f0a030');
const VT_HOT = color('#ffd060');
const CF_A = color('#6e4a6a');
const CF_B = color('#54385c');
const CRUST = color('#e8b078');

/** The depth steps of `bg/brine-deep-v2`, the lit surface row band down to the deep (§9's column). */
const DEEP_STEPS = [
  color('#3d607f'),
  color('#31506f'),
  color('#27405c'),
  color('#1d3148'),
  color('#15263a'),
  color('#0f1e30'),
];

/** The three fans' ray tips of §9's decor (design: a fanned coral, three seeded silhouettes). */
const FAN_TIPS = [
  [
    [2, 4],
    [8, 1],
    [15, 0],
    [22, 1],
    [28, 4],
  ],
  [
    [4, 6],
    [10, 2],
    [16, 1],
    [22, 3],
    [27, 7],
  ],
  [
    [3, 5],
    [9, 0],
    [15, 2],
    [20, 0],
    [26, 5],
  ],
];

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
 * `enemies/brine-mine` (16×16, 4 frames, hittable): the drifting sea mine of the design — a
 * spiked steel body (dark rim, rust along the lower right) on eight spokes, with the lamp on its
 * face dark (0), dim (1), lit (2) or lit in the armed {@link SOFT_ALPHA} halo (3).
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function mineFrame(k) {
  const img = createImage(16, 16);
  const c = 7.5;
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ]) {
    const s = dx === 0 || dy === 0 ? 1 : 0.75;
    drawLine(img, c + dx * 4.5 * s, c + dy * 4.5 * s, c + dx * 8 * s, c + dy * 8 * s, MINE_DK);
  }
  fillEllipse(img, c, c, 5.4, 5.4, (u, v, e) => {
    if (e > 0.82) return MINE_DK;
    if (u > 0.25 && v > 0.4) return RUST;
    return STEEL;
  });
  const lamp = k === 0 ? OUT : k === 1 ? LAMP_DIM : LAMP_LIT;
  rect(img, 7, 7, 8, 8, lamp);
  if (k === 3) {
    for (const [hx, hy] of [
      [5, 7],
      [5, 8],
      [10, 7],
      [10, 8],
      [7, 5],
      [8, 5],
      [7, 10],
      [8, 10],
      [5, 5],
      [10, 5],
      [5, 10],
      [10, 10],
    ]) {
      px(img, hx, hy, withAlpha(LAMP_LIT, SOFT_ALPHA));
    }
  }
  return img;
}

/**
 * `enemies/spume-skipper` (18×11, 4 frames, hittable): the foam-skimming chaser, facing left like
 * every flying sprite of the zone — a steel-blue body with a pale belly and lit head, one swept
 * fin in four beat phases (frames 0 and 3 up, 1 mid-up, 2 down), a short beak and twin tail
 * streamers.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function skipperFrame(k) {
  const img = createImage(18, 11);
  const tipY = [1, 4, 9, 6][k];
  fillEllipse(img, 9, 6, 5.6, 3.3, (u, v, e) => {
    if (e > 0.9) return OUT;
    if (v > 0.5) return SK_BELLY;
    if (u < -0.6) return SK_FIN;
    return SK_BODY;
  });
  for (let d = 0; d <= 5; d++) {
    const fy = Math.round(4 + ((tipY - 4) * (d + 1)) / 6);
    px(img, 8 + d, fy, SK_FIN);
    px(img, 9 + d, fy + (tipY < 4 ? 1 : -1), OUT);
  }
  px(img, 2, 5, SK_BELLY);
  px(img, 1, 6, SK_BELLY);
  px(img, 4, 5, OUT);
  for (let t = 0; t < 2; t++) {
    for (let d = 0; d <= 3; d++) px(img, 14 + d, 6 - t * 3 + (d > 1 ? 1 : 0), OUT);
  }
  return img;
}

/**
 * `bosses/herald-fin` (24×9, 1 frame, hittable): the SPUME HERALD's rebuilt crown plate — a
 * gold plate with a lit upper edge, a dark rim along the bottom and three short spikes, the two
 * gill slits picked out dark. Unreferenced by content until S5a arranges the herald.
 *
 * @returns {Image} The frame.
 */
function heraldFinFrame() {
  const img = createImage(24, 9);
  for (const bx of [4, 12, 20]) {
    px(img, bx, 0, HF_LIT);
    px(img, bx - 1, 1, HF_PLATE);
    px(img, bx, 1, HF_LIT);
    px(img, bx + 1, 1, HF_PLATE);
  }
  rect(img, 0, 2, 23, 6, HF_PLATE);
  rect(img, 0, 2, 23, 2, HF_LIT);
  rect(img, 0, 7, 23, 8, HF_RIM);
  for (const nx of [7, 16]) {
    px(img, nx, 4, HF_RIM);
    px(img, nx, 5, HF_RIM);
  }
  return img;
}

/**
 * `bosses/maw-spine` (18×18, 2 frames, hittable): a ridge spine of the rebuilt GALVANIC MAW — a
 * steel wedge rising from its base row to a glowing tip, its trailing edge dark; frame 1 the
 * chipped look (bible §5.7, hash-scoured notches, the `@flash` derived).
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function spineFrame(k) {
  const img = createImage(18, 18);
  const seed = seedOf('bosses/maw-spine');
  for (let y = 0; y < 18; y++) {
    const w = 1 + Math.floor((y * 11) / 17);
    const x0 = 2 + Math.floor(((17 - y) * 6) / 17);
    for (let x = x0; x < x0 + w; x++) {
      if (k === 1 && y > 5 && y < 14 && pick(x, y, seed, 4) === 0) continue;
      px(img, x, y, pick(x, y, seed, 6) === 0 ? MINE_DK : SP_METAL);
    }
    px(img, x0 + w - 1, y, MINE_DK);
  }
  px(img, 8, 0, SP_GLOW);
  px(img, 7, 1, SP_GLOW);
  return img;
}

/**
 * The reef silhouette's roof row at column `x` — a sum of triangle waves with periods 160, 80
 * and 32 (they all divide {@link BAND_TILE_W}, so the band repeats seamlessly).
 *
 * @param {number} x - Column.
 * @param {number} roof - The deepest row the waves leave free above the silhouette.
 * @returns {number} The first silhouette row.
 */
function reefTop(x, roof) {
  return roof - Math.round(8 * triangle(x, 160) + 5 * triangle(x + 40, 80) + 3 * triangle(x, 32));
}

/**
 * `bg/brine-deep-v2` (`BAND_TILE_W`×{@link DEEP_H}, 1 frame): the opaque far layer of §14 — the
 * water column in six depth steps (light surface down to the near-black deep, a period that
 * fills the frame exactly twice), three thin light-shaft streak rows and sparse plankton dots on
 * a 16-column lattice, closed at the foot by the reef silhouette with its coral nubs (every
 * period divides the tile width, so the band wraps without a seam).
 *
 * @returns {Image} The band.
 */
function deepBand() {
  const img = createImage(BAND_TILE_W, DEEP_H);
  const seed = seedOf('bg/brine-deep-v2');
  for (let y = 0; y < DEEP_H; y++) {
    const s = Math.min(DEEP_STEPS.length - 1, Math.floor((y * DEEP_STEPS.length) / DEEP_H));
    for (let x = 0; x < BAND_TILE_W; x++) setPixel(img, x, y, DEEP_STEPS[s]);
  }
  for (const [row, phase, lit] of [
    [84, 20, 18],
    [150, 41, 12],
    [212, 9, 22],
  ]) {
    for (let x = 0; x < BAND_TILE_W; x++) {
      if ((x + phase) % 64 < lit) setPixel(img, x, row, STREAK);
    }
  }
  for (let q = 0; q < 20; q++) {
    const col = 7 + q * 16;
    for (let m = 0; m < 3; m++) {
      const py = 18 + m * 92 + pick(q, m + 18, seed, 60);
      px(img, col, py, PLANK);
    }
  }
  const roof = DEEP_H - 34;
  for (let x = 0; x < BAND_TILE_W; x++) {
    const t = reefTop(x, roof);
    for (let y = t; y < DEEP_H; y++) setPixel(img, x, y, REEF_DK);
    setPixel(img, x, t, REEF_RIM);
  }
  for (let x = 8; x < BAND_TILE_W; x += 16) {
    const t = reefTop(x, roof);
    const h = 2 + pick(x, 23, seed, 4);
    for (let d = 1; d <= h; d++) pxw(img, x, t - d, REEF_DK);
    pxw(img, x, t - h, REEF_RIM);
  }
  return img;
}

/**
 * `fore/brine-foam` (`BAND_TILE_W`×{@link FOAM_H}, 2 frames): the foreground froth of §14 — eight
 * foam pieces on a 40-column lattice near the band's top edge (a lit body, a shaded underside),
 * drawn at all three wrapped positions so the drift repeats seamless; frame 1 drifts the whole
 * lattice eight pixels on.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function foamBand(k) {
  const img = createImage(BAND_TILE_W, FOAM_H);
  const seed = seedOf('fore/brine-foam');
  for (let s = 0; s < 8; s++) {
    const cx = s * 40 + 8 + pick(s, 21, seed, 20) + k * 8;
    const cy = 6 + pick(s, 22, seed, 8);
    const rx = 5 + pick(s, 23, seed, 7);
    for (const off of [-BAND_TILE_W, 0, BAND_TILE_W]) {
      fillEllipse(img, cx + off, cy, rx, 2.6, (u, v, e) => {
        if (e > 0.95) return null;
        if (v > 0.5) return FOAM_SH;
        return FOAM;
      });
    }
  }
  return img;
}

/**
 * `decor/brine-fan-{1,2,3}` (30×24, 1 frame): the fanned corals of §9's decor — five rays of a
 * seeded silhouette from a rock foot to their pale tips, binary alpha.
 *
 * @param {number} i - The fan, 0 … 2.
 * @returns {Image} The frame.
 */
function fanFrame(i) {
  const img = createImage(30, 24);
  const tone = [FAN_A, FAN_B, FAN_C][i];
  rect(img, 12, 20, 17, 21, FAN_C);
  rect(img, 12, 22, 17, 23, OUT);
  for (const [tx, ty] of FAN_TIPS[i]) {
    drawLine(img, 15, 21, tx, ty, tone, 2);
    px(img, tx, ty, FAN_PALE);
  }
  return img;
}

/**
 * `decor/brine-kelp` (12×48, 4 frames): the slow swaying frond of §14 — a two-column stalk rooted
 * at the bottom edge, its lean advancing through the four sway phases (`off` 0 → 1 → 3 → 2, the
 * loop), a pale lit tip and four side blades on seeded rows.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function kelpFrame(k) {
  const img = createImage(12, 48);
  const off = [0, 1, 3, 2][k];
  for (let y = 47; y >= 3; y--) {
    const x = 5 + Math.round((off * (47 - y)) / 44);
    px(img, x, y, y < 9 ? KELP_HI : KELP);
    px(img, x + 1, y, y < 9 ? KELP : KELP_DK);
  }
  px(img, 5 + off, 2, KELP_HI);
  px(img, 5 + off, 1, KELP_HI);
  for (let b = 0; b < 4; b++) {
    const by = 13 + b * 8;
    const side = b % 2 === 0 ? -1 : 1;
    const bx = 5 + Math.round((off * (47 - by)) / 44);
    for (let d = 1; d <= 3; d++) {
      px(img, bx + side * d + (side < 0 ? 0 : 1), by - d, d === 3 ? KELP_HI : KELP);
    }
  }
  return img;
}

/**
 * `decor/brine-glow-vent` (24×24, 2 frames): the black-smoker of §9's decor (design: additive
 * glow) — a rock collar with a dark rim and base around a black opening; the vent core lit
 * amber (0) or flared hot gold with a wider {@link SOFT_ALPHA} halo (1). The halo ring is the
 * only translucent paint outside the armed mine's lamp.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function ventFrame(k) {
  const img = createImage(24, 24);
  fillEllipse(img, 12, 16, 9.5, 6.5, (u, v, e) => {
    if (e > 0.88) return VT_DK;
    if (v > 0.45) return VT_DK;
    return VT_ROCK;
  });
  px(img, 6, 14, VT_DK);
  px(img, 17, 15, VT_DK);
  fillEllipse(img, 12, 11.5, 4.5, 2.8, () => VT_DK);
  rect(img, 9, 10, 14, 13, k === 1 ? VT_HOT : VT_GLOW);
  const soft = withAlpha(k === 1 ? VT_HOT : VT_GLOW, SOFT_ALPHA);
  for (const [hx, hy] of [
    [8, 10],
    [8, 11],
    [8, 12],
    [15, 10],
    [15, 11],
    [15, 12],
    [10, 9],
    [11, 9],
    [13, 9],
    [10, 14],
    [11, 14],
    [13, 14],
  ]) {
    px(img, hx, hy, soft);
  }
  if (k === 1) {
    px(img, 7, 11, soft);
    px(img, 16, 11, soft);
    px(img, 12, 8, soft);
    px(img, 12, 15, soft);
  }
  return img;
}

/**
 * The coral-crusted floor fill: a crust pair on top (the plain `SUR`/`SUBS` in variants a and b,
 * the pale `CRUST` crown over `SUR` in c) over a speckled coral-rock body, every pixel opaque
 * (the §14 fill classes sit under the game's floor like the base terrain).
 *
 * @param {number} s - Tile side.
 * @param {number} v - The variant, 0 … 2.
 * @returns {Image} The tile.
 */
function coralFloorTile(s, v) {
  const img = createImage(s, s);
  const seed = seedOf(`tiles/terrain-reef-v2/coral-floor-${'abc'[v]}`);
  rect(img, 0, 0, s - 1, 0, v === 2 ? CRUST : SUR);
  rect(img, 0, 1, s - 1, 1, v === 2 ? SUR : SUBS);
  const tint = v === 0 ? CF_A : v === 1 ? CF_B : RK[2];
  for (let y = 2; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let c = tint;
      if (pick(x, y, seed, 5) === 0) c = v === 2 ? RK[0] : RK[2];
      else if (v === 1 && (x + y) % 7 === 3) c = RK[1];
      setPixel(img, x, y, c);
    }
  }
  if (v === 2) {
    for (let x = 0; x < s; x++) if (x % 4 === 0) px(img, x, 2, CRUST);
  }
  return img;
}

/**
 * `floor-edge`: the lit crust over a banded body — `SUR`, `SUBS`, a course of `RK[1]`, speckled
 * rock and a dark base row, fully opaque.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function floorEdgeTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-reef-v2/floor-edge');
  rect(img, 0, 0, s - 1, 0, SUR);
  rect(img, 0, 1, s - 1, 1, SUBS);
  rect(img, 0, 2, s - 1, 2, RK[1]);
  for (let y = 3; y < s - 1; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(x, y, seed, 5) === 0 ? RK[2] : RK[0]);
    }
  }
  rect(img, 0, s - 1, s - 1, s - 1, RK[2]);
  return img;
}

/**
 * `ceil-edge`: the hung crust — an attach band on the top rows, a `SUBS` face under it and a
 * speckled body with pale coral nubs, fully opaque.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function ceilEdgeTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-reef-v2/ceil-edge');
  rect(img, 0, 0, s - 1, 1, RK[1]);
  rect(img, 0, 2, s - 1, 2, SUBS);
  for (let y = 3; y < s; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(x, y, seed, 5) === 0 ? RK[0] : RK[2]);
    }
  }
  for (let x = 0; x < s; x += 3) {
    px(img, x, 3, CRUST);
    px(img, x + 1, 3, CRUST);
  }
  return img;
}

/**
 * The stepped end-cap of a coral floor run (design §14's outer corner, the zone-C shape law):
 * each column solid from a height that steps three times across the tile, `SUR` on the cap,
 * `SUBS` under it and on the exposed side column, `MINE_DK` on the base row. Binary alpha.
 *
 * @param {number} s - Tile side (even, ≥ 8).
 * @param {boolean} flip - Mirror left ↔ right.
 * @param {number} seed - The tile's seed.
 * @returns {Image} The tile.
 */
function cornerOuterTile(s, flip, seed) {
  const img = createImage(s, s);
  const step = Math.floor((s - 4) / 3);
  const side = flip ? s - 1 : 0;
  for (let x = 0; x < s; x++) {
    const q = Math.floor(((flip ? s - 1 - x : x) * 4) / s);
    const t = 2 + (3 - q) * step;
    for (let y = t; y <= s - 1; y++) {
      px(
        img,
        x,
        y,
        y === s - 1
          ? MINE_DK
          : y === t
            ? SUR
            : y === t + 1
              ? SUBS
              : pick(x, y, seed, 5) === 0
                ? RK[2]
                : RK[0],
      );
    }
    if (x === side) {
      for (let y = t; y <= s - 1; y++) px(img, x, y, SUBS);
    }
  }
  return img;
}

/**
 * The concave wall-meets-crust corner (design §14's inner corner, the zone-C shape law): one half
 * of the tile solid to the bottom edge, the other half only under a flat shoulder at mid-tile —
 * `SUR` along both faces, the wall's exposed flank in `SUBS`. Binary alpha.
 *
 * @param {number} s - Tile side (even, ≥ 8).
 * @param {boolean} flip - Mirror left ↔ right.
 * @param {number} seed - The tile's seed.
 * @returns {Image} The tile.
 */
function cornerInnerTile(s, flip, seed) {
  const img = createImage(s, s);
  const half = Math.floor(s / 2);
  const shoulder = Math.floor(s / 2);
  const face = flip ? half : half - 1;
  for (let x = 0; x < s; x++) {
    const wall = flip ? x >= s - half : x < half;
    const a = wall ? 0 : shoulder;
    for (let y = a; y <= s - 1; y++) {
      const flank = x === face && y >= shoulder;
      const cap = y === a || (wall && y === a + 1 && !flank);
      px(
        img,
        x,
        y,
        y === s - 1
          ? MINE_DK
          : y === a
            ? SUR
            : cap || flank
              ? SUBS
              : pick(x, y, seed, 5) === 0
                ? RK[2]
                : RK[0],
      );
    }
  }
  return img;
}

/**
 * The vent rocks: a speckled rock tile scored by a dark hash fissure with embers glowing in it
 * (§14's hydrothermal decor); the broken variant the wider crack, a scoured corner and a
 * brighter flare. Fully opaque.
 *
 * @param {number} s - Tile side.
 * @param {boolean} broken - The damaged variant.
 * @returns {Image} The tile.
 */
function ventRockTile(s, broken) {
  const img = createImage(s, s);
  const seed = seedOf(
    broken ? 'tiles/terrain-reef-v2/vent-rock-broken' : 'tiles/terrain-reef-v2/vent-rock',
  );
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      setPixel(img, x, y, pick(x, y, seed, 5) === 0 ? RK[2] : RK[0]);
    }
  }
  for (let y = 1; y < (broken ? s - 1 : 8); y++) {
    const cx = (broken ? 3 : 3) + Math.floor(y / 2) - (y % 3 === 2 ? 1 : 0);
    px(img, cx, y, OUT);
    px(img, cx + 1, y, OUT);
    if (broken && y > 5) px(img, cx + 2, y, OUT);
  }
  px(img, broken ? 7 : 5, broken ? 8 : 6, VT_GLOW);
  px(img, broken ? 8 : 6, broken ? 8 : 6, VT_HOT);
  if (broken) {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) px(img, x, s - 1 - y, OUT);
  }
  return img;
}

/**
 * The twenty-nine frames of `tiles/terrain-reef-v2`: `terrain-reef`'s whole twenty-tile list
 * first in its order (the wave-11 law — terrain-a's order, the base list off-limits), then the
 * nine §14 variants: the three coral floors, the two edges, the two corners and the vent-rock
 * pair (the frame order is the list this function appends and {@link BRINE_V2_TILE_NAMES} names).
 *
 * @param {number} size - The tile side (`options.tileSize`).
 * @returns {Image[]} The frames, in list order.
 */
function reefTilesV2(size) {
  const base = renderTerrainTiles(size, 'tiles/terrain-reef');
  const s = size;
  return [
    ...base,
    coralFloorTile(s, 0),
    coralFloorTile(s, 1),
    coralFloorTile(s, 2),
    floorEdgeTile(s),
    ceilEdgeTile(s),
    cornerOuterTile(s, false, seedOf('tiles/terrain-reef-v2/coral-corner-outer')),
    cornerInnerTile(s, false, seedOf('tiles/terrain-reef-v2/coral-corner-inner')),
    ventRockTile(s, false),
    ventRockTile(s, true),
  ];
}
