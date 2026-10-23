/**
 * Zone I, **ABYSSAL THRONE** (plan M2-14) — placeholder art of the deep (decision D24):
 *
 * - `bg/abyss-murk` ({@link MURK_TILE_W}×{@link MURK_TILE_H}, the far band): black-blue deep water,
 *   darker towards the bottom in soft bands, with scattered bioluminescent specks painted in the
 *   {@link ABYSS_RAMP} (v1) / {@link ABYSS_RAMP_V2} (the frozen v2 ramp, R5-P.P7) colours (a
 *   position hash picks which), so the stage's palette cycle makes them twinkle; every period
 *   divides the tile, so it repeats seamlessly across and down.
 * - `bg/abyss-spires` ({@link SPIRES_TILE_W}×{@link SPIRES_TILE_H}, a mid band): silhouettes of
 *   rock spires and swaying weed rising from the bottom, their tips faintly lit.
 * - Enemies (flying ones face left; hit-flash siblings): `enemies/lumen-mote` (a glowing plankton
 *   mote, pulsing, 2 frames), `enemies/depth-mine` (a spiked sphere with a blinking light, 2
 *   frames), `enemies/trench-eel` (a segment of an eel bursting from the trench floor, 2 frames),
 *   `enemies/gulper` (a big-mouthed deep fish, its jaw working, 2 frames), `enemies/abyss-turret` (a
 *   barnacle turret on the trench rock), `enemies/ark-hook` (the harpoon drone the ARK casts, its
 *   fins beating, 2 frames).
 * - ABYSS ARK (AA-09), the whale-class battleship: `bosses/ark-bow`, `bosses/ark-hull`,
 *   `bosses/ark-stern` (its hull sections — decoration, the raid flies round them),
 *   `bosses/ark-turret` (a turret of its turret rows with 16 heading frames, like the M2-09
 *   raid turret), `bosses/ark-heart` (its heart — the core, 2 frames).
 * - THE HOLLOW KING (HK-10), the thing inside the ARK: `bosses/king-body` (the anglerfish's body —
 *   armour), `bosses/king-jaw-top` / `bosses/king-jaw-bottom` (its jaws), `bosses/king-maw` (the
 *   glowing throat — the core, open only with the mouth, 2 frames), `bosses/king-stalk` (a bead of
 *   the lure's stalk), `bosses/king-lure` (the lure's glowing bulb — a gun, 2 frames).
 *
 * Black-teal and cold cyan glows, the ARK in pale bone and rust — low in saturation next to the
 * pink / red / purple bullets and the capsules (shmup_feat.md §12, §18). Geometry uses only
 * `+ - * /` and `Math.sqrt`, randomness `hash2` (seeded from the sprite names), so the pixels are
 * identical on every engine.
 *
 * Since R5-09.S2 the generator draws the ten **v2 stand-ins** of design
 * `docs/v2-run/designs/zone-i.md` §14 — `enemies/abyss-crawler`, `enemies/stinger` and
 * `enemies/deep-tender`, the two new boss parts (`bosses/ark-pod`, `bosses/king-fin`), the §9 band
 * stack (`bg/abyss-deepwall`, `bg/abyss-vents`, `bg/abyss-flakes`), the decor glow
 * `fx/glow-abyss-vent` and the tileset `tiles/terrain-abyss-v2` (`terrain-abyss`'s twenty tiles
 * verbatim, then the two §10 additions `coral` and `abyss-glow`) — only at an art scale ≠ 1
 * (decision RR-1a); the scale-1 build is the v1 set byte for byte. Every new colour keeps
 * Chebyshev distance ≥ 3 from every shipped palette-cycle ramp (the zone-B brine route: no EXEMPT
 * row in `test/integration/palette-cycle-scan.test.ts`).
 *
 * **Public API.** {@link generate}, {@link ABYSS_SPRITES}, {@link ABYSS_RAMP} (the colours zone I's
 * v1 palette cycle named), {@link ABYSS_RAMP_V2} (the frozen v2 ramp zone I's cycle names since
 * R5-P.P7), {@link MURK_TILE_W} / {@link MURK_TILE_H}, {@link SPIRES_TILE_W} /
 * {@link SPIRES_TILE_H} (the bands' tile sizes, their parallax `spacing`); for the v2 pass,
 * {@link ABYSS_V2_SPRITES}, {@link ABYSS_V2_TILES}, {@link ABYSS_V2_TILE_NAMES},
 * {@link BAND_TILE_W}, {@link DEEP_H}, {@link VENTS_H}, {@link FLAKES_H}.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { scaleImage } from '../interim.mjs';
import { hash2 } from '../rng.mjs';
import { offRamp } from '../v2kit.mjs';
import { DIRECTIONS_8, color, drawLine, fillEllipse, makeSprite, mix, seedOf } from './common.mjs';
import { renderTerrainTiles, TERRAIN_PALETTES, TERRAIN_TILES, TILE_SIZE } from './terrain.mjs';
import { FRAME_W } from '../../frame.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/abyss-murk` tile (its parallax `spacing`). */
export const MURK_TILE_W = 128;

/** Height of the `bg/abyss-murk` tile (bands stacked under each other join seamlessly). */
export const MURK_TILE_H = 64;

/** Width of the `bg/abyss-spires` tile (its parallax `spacing`). */
export const SPIRES_TILE_W = 128;

/** Height of the `bg/abyss-spires` tile. */
export const SPIRES_TILE_H = 56;

/**
 * The specks' four colours, dim → bright cyan — the exact colours zone I's palette cycle names
 * (`content/stages/zone-i.stage.json`); no other pixel of the murk uses them.
 */
export const ABYSS_RAMP = Object.freeze(['#0e2a34', '#16485a', '#2a7a8a', '#6ad8e0']);

/**
 * Zone I's frozen v2 ramp (design `docs/v2-run/designs/zone-i.md` §9): the six colours
 * `content/stages/zone-i.stage.json` names now — v1's four plus the darker base and the mid glow
 * that feed it — dim → bright cyan; no other pixel of the murk uses them. Drawn by
 * `bg/abyss-murk` only at an art scale ≠ 1 (RR-1: the scale-1 build keeps {@link ABYSS_RAMP}
 * byte for byte).
 */
export const ABYSS_RAMP_V2 = Object.freeze([
  '#08141c',
  '#0e2a34',
  '#16485a',
  '#2a7a8a',
  '#48b8c8',
  '#6ad8e0',
]);

/** The sprites this generator draws, in order. */
export const ABYSS_SPRITES = Object.freeze([
  'bg/abyss-murk',
  'bg/abyss-spires',
  'enemies/lumen-mote',
  'enemies/depth-mine',
  'enemies/trench-eel',
  'enemies/gulper',
  'enemies/abyss-turret',
  'enemies/ark-hook',
  'bosses/ark-bow',
  'bosses/ark-hull',
  'bosses/ark-stern',
  'bosses/ark-turret',
  'bosses/ark-heart',
  'bosses/king-body',
  'bosses/king-jaw-top',
  'bosses/king-jaw-bottom',
  'bosses/king-maw',
  'bosses/king-stalk',
  'bosses/king-lure',
]);

/** The v2 stand-in names {@link generate} adds at an art scale ≠ 1, in its output order (§14). */
export const ABYSS_V2_SPRITES = Object.freeze([
  'enemies/abyss-crawler',
  'enemies/stinger',
  'enemies/deep-tender',
  'bosses/ark-pod',
  'bosses/king-fin',
  'bg/abyss-deepwall',
  'bg/abyss-vents',
  'bg/abyss-flakes',
  'fx/glow-abyss-vent',
  'tiles/terrain-abyss-v2',
]);

/** The two §10 variant tiles after `terrain-abyss`'s twenty, in list order (ids 21–22). */
export const ABYSS_V2_TILES = /** @type {const} */ (['coral', 'abyss-glow']);

/** The tile names of `tiles/terrain-abyss-v2`: `terrain-abyss`'s list verbatim, then the variants. */
export const ABYSS_V2_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...ABYSS_V2_TILES]);

/**
 * Tile width of the three §9 bands `bg/abyss-deepwall`, `bg/abyss-vents` and `bg/abyss-flakes`:
 * half the frame, derived from `FRAME_W` — the zone-C precedent (design §14 asks full-frame bands,
 * an atlas frame cannot exceed the 512-page scenario of `test/scripts/assets/pipeline-edge.test.ts`,
 * and every band here is a seamless repeating tile, so these repeat at a period that fills the
 * frame exactly twice).
 */
export const BAND_TILE_W = FRAME_W / 2;

/**
 * Height of the `bg/abyss-deepwall` band (zone-i.md §14: 480 = 40 tile rows, inside the same
 * 510-px page bound that capped zone D's and G's deep bands).
 */
export const DEEP_H = 40 * TILE_SIZE;

/** Height of the `bg/abyss-vents` band (zone-i.md §14: 168 = 14 tile rows). */
export const VENTS_H = 14 * TILE_SIZE;

/** Height of the `bg/abyss-flakes` band (zone-i.md §14: 48 = 4 tile rows). */
export const FLAKES_H = 4 * TILE_SIZE;

/** Dark outline of the deep's creatures. */
const RIM = '#05090c';

/** The ARK's bone-white plating. */
const BONE = '#b8b09a';

/** Shadowed bone. */
const BONE_DARK = '#7a7462';

/** Rust patches on the ARK. */
const RUST = '#7a4a30';

/**
 * Sixteen headings `k · 22.5°` clockwise from +x (the turret frames).
 *
 * @type {readonly (readonly [number, number])[]}
 */
const DIRECTIONS_16 = [...DIRECTIONS_8, ...DIRECTIONS_8.map(([c, s]) => [-c, -s])];

/**
 * Generates zone I's art.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's art scale and tile side
 *   (the pipeline passes both; `artScale` 1 or absent draws the v1 set — the cycled murk band on
 *   the v1 ramp — byte for byte, `tileSize` defaults to the v2 {@link TILE_SIZE}).
 * @returns {SpriteDef[]} {@link ABYSS_SPRITES} in that order at art scale 1; the v1 set followed by
 *   {@link ABYSS_V2_SPRITES} in theirs at any other scale (the new names all `native`, their
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
      'bg/abyss-murk',
      [v2 ? scaleImage(murk(ABYSS_RAMP_V2, true), artScale) : murk()],
      'abyss',
      {
        anchor: [0, 0],
        native: v2,
      },
    ),
    makeSprite('bg/abyss-spires', [spires()], 'abyss', { anchor: [0, 0] }),
    makeSprite('enemies/lumen-mote', [moteFrame(0), moteFrame(1)], 'abyss', {
      hitFlash: true,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('enemies/depth-mine', [mineFrame(false), mineFrame(true)], 'abyss', {
      hitFlash: true,
      animations: { blink: [0, 1] },
    }),
    makeSprite('enemies/trench-eel', [eelFrame(0), eelFrame(1)], 'abyss', {
      hitFlash: true,
      animations: { swim: [0, 1] },
    }),
    makeSprite('enemies/gulper', [gulperFrame(false), gulperFrame(true)], 'abyss', {
      hitFlash: true,
      animations: { gulp: [0, 1] },
    }),
    makeSprite('enemies/abyss-turret', [turretFrame()], 'abyss', flash),
    makeSprite('enemies/ark-hook', [hookFrame(0), hookFrame(1)], 'abyss', {
      hitFlash: true,
      animations: { beat: [0, 1] },
    }),
    makeSprite('bosses/ark-bow', [hullFrame('bow')], 'abyss'),
    makeSprite('bosses/ark-hull', [hullFrame('mid')], 'abyss'),
    makeSprite('bosses/ark-stern', [hullFrame('stern')], 'abyss'),
    makeSprite('bosses/ark-turret', arkTurretFrames(), 'abyss', flash),
    makeSprite('bosses/ark-heart', [heartFrame('#f06858'), heartFrame('#ffc0a0')], 'abyss', {
      hitFlash: true,
      animations: { beat: [0, 1] },
    }),
    makeSprite('bosses/king-body', [kingBodyFrame()], 'abyss', flash),
    makeSprite('bosses/king-jaw-top', [jawFrame(true)], 'abyss', flash),
    makeSprite('bosses/king-jaw-bottom', [jawFrame(false)], 'abyss', flash),
    makeSprite('bosses/king-maw', [mawFrame('#e0f070'), mawFrame('#ffffff')], 'abyss', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('bosses/king-stalk', [stalkFrame()], 'abyss', flash),
    makeSprite('bosses/king-lure', [lureFrame('#a0f0e8'), lureFrame('#f0fff8')], 'abyss', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
  ];
  if (!v2) return sprites;
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  return sprites.concat([
    makeSprite('enemies/abyss-crawler', [0, 1, 2, 3].map(crawlerFrame), 'abyss', {
      ...hit,
      animations: { walk: [0, 1, 2, 3] },
    }),
    makeSprite('enemies/stinger', [0, 1, 2, 3].map(stingerFrame), 'abyss', {
      ...hit,
      animations: { dart: [0, 1, 2, 3] },
    }),
    makeSprite('enemies/deep-tender', [0, 1, 2, 3].map(tenderFrame), 'abyss', {
      ...hit,
      animations: { pulse: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/ark-pod', [0, 1, 2, 3].map(podFrame), 'abyss', {
      ...hit,
      animations: { charge: [0, 1, 2, 3] },
    }),
    makeSprite('bosses/king-fin', [finFrame()], 'abyss', hit),
    makeSprite('bg/abyss-deepwall', [deepWall()], 'abyss', { anchor: [0, 0], ...native }),
    makeSprite('bg/abyss-vents', [ventsBand()], 'abyss', { anchor: [0, 0], ...native }),
    makeSprite('bg/abyss-flakes', [flakesBand(0), flakesBand(1)], 'abyss', {
      anchor: [0, 0],
      ...native,
      animations: { drift: [0, 1] },
    }),
    makeSprite('fx/glow-abyss-vent', [ventGlow(0), ventGlow(1)], 'abyss', {
      anchor: [18, 12],
      ...native,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('tiles/terrain-abyss-v2', abyssTilesV2(size), 'abyss', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(ABYSS_V2_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ]);
}

/**
 * The murk: four soft horizontal bands of deep blue (16 px each, darker downwards — the tile
 * repeats down, so the bands repeat too) and specks: one per 16×16 cell where a hash says so, a
 * single pixel or a plus, in a `rampHex` colour picked by another hash — the only ramp pixels of
 * the tile. On the v2 path the bands are nudged through the kit's `offRamp`: the frozen v2 ramp's
 * base `#08141c` sits 1/255 from v1's second band `#07131c`, and a cycled layer must be an exact
 * ramp colour or 3/255 from the whole ramp (rule 1 of `palette-cycle-scan.test.ts`).
 *
 * @param {readonly string[]} [rampHex] - The ramp the specks use, default {@link ABYSS_RAMP}.
 * @param {boolean} [v2] - Nudge the band colours off the reserved ramps (the frozen v2 ramp's
 *   default).
 * @returns {Image} The tile.
 */
function murk(rampHex = ABYSS_RAMP, v2 = false) {
  const w = MURK_TILE_W;
  const h = MURK_TILE_H;
  const seed = seedOf('bg/abyss-murk');
  const ramp = rampHex.map(color);
  const bandHex = ['#081620', '#07131c', '#061018', '#050d14'];
  const bands = (v2 ? bandHex.map((c) => offRamp(c)) : bandHex).map(color);
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // A 1-px dither where two bands meet, so the steps read as murk rather than stripes.
      const band = Math.floor(y / 16);
      const dither = y % 16 === 0 && (x + y) % 2 === 0 && band > 0 ? band - 1 : band;
      setPixel(image, x, y, bands[dither]);
    }
  }
  for (let cy = 0; cy < h / 16; cy++) {
    for (let cx = 0; cx < w / 16; cx++) {
      const hsh = hash2(cx, cy, seed);
      if (hsh % 3 === 0) continue;
      const x = cx * 16 + ((hsh >>> 3) % 14) + 1;
      const y = cy * 16 + ((hsh >>> 9) % 14) + 1;
      const c = ramp[(hsh >>> 15) % ramp.length];
      setPixel(image, x, y, c);
      if (((hsh >>> 20) & 3) === 0) {
        setPixel(image, x - 1, y, c);
        setPixel(image, x + 1, y, c);
        setPixel(image, x, y - 1, c);
        setPixel(image, x, y + 1, c);
      }
    }
  }
  return image;
}

/**
 * A soft wave of a whole-pixel period (a parabola arch): 1 at the crest, 0 at the troughs.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function arch(x, period) {
  const t = (((x % period) + period) % period) / period;
  const u = t * 2 - 1;
  return 1 - u * u;
}

/**
 * The spires band: a far range of rounded rock (periods 64 / 32) and near weed stalks every 16 px
 * swaying by a hash, their tips a faint teal — every period divides the tile width.
 *
 * @returns {Image} The tile.
 */
function spires() {
  const w = SPIRES_TILE_W;
  const h = SPIRES_TILE_H;
  const seed = seedOf('bg/abyss-spires');
  const rock = color('#0a1a22');
  const near = color('#0e222c');
  const tip = color('#1e5a64');
  const weed = color('#12303a');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const top = Math.round(h - 8 - 30 * arch(x, 64) - 8 * arch(x + 8, 32));
    for (let y = top; y < h; y++) setPixel(image, x, y, rock);
    const nearTop = Math.round(h - 4 - 14 * arch(x + 24, 32));
    for (let y = nearTop; y < h; y++) setPixel(image, x, y, y === nearTop ? tip : near);
  }
  for (let x = 4; x < w; x += 16) {
    const lean = (hash2(x, 0, seed) % 5) - 2;
    const top = 14 + (hash2(x, 1, seed) % 12);
    drawLine(image, x, h - 1, x + lean, top, weed);
    setPixel(image, x + lean, top, tip);
  }
  return image;
}

/**
 * A lumen mote: a glowing cyan plankton speck with a soft halo that grows in frame 1.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function moteFrame(frame) {
  const size = 8;
  const halo = color(frame === 0 ? '#1e6a78' : '#2a8a98');
  const glow = color('#6ad8e0');
  const heart = color('#e8ffff');
  const image = createImage(size, size);
  fillEllipse(image, 3.5, 3.5, frame === 0 ? 3 : 3.8, frame === 0 ? 3 : 3.8, (_u, _v, e) =>
    e < 0.45 ? heart : e < 0.7 ? glow : halo,
  );
  return image;
}

/**
 * A depth mine: a dark iron sphere with six spikes and a light on top that blinks red (frame 1).
 *
 * @param {boolean} lit - The light on.
 * @returns {Image} The frame.
 */
function mineFrame(lit) {
  const size = 12;
  const rim = color(RIM);
  const iron = color('#3a4248');
  const shine = color('#6a767e');
  const spike = color('#8a949a');
  const light = color(lit ? '#ff5040' : '#5a1810');
  const image = createImage(size, size);
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    drawLine(image, 5.5 + dx * 3, 5.5 + dy * 3, 5.5 + dx * 5.5, 5.5 + dy * 5.5, spike);
  }
  drawLine(image, 2, 2, 1, 1, spike);
  drawLine(image, 9, 9, 10, 10, spike);
  fillEllipse(image, 5.5, 5.5, 3.8, 3.8, (u, v, e) =>
    e > 0.85 ? rim : u + v < -0.5 ? shine : iron,
  );
  setPixel(image, 5, 3, light);
  setPixel(image, 6, 3, light);
  return image;
}

/**
 * A trench eel segment: a slick dark-green oval with a pale belly stripe and a fin that flips
 * between the frames (the head leads, the others follow its track).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function eelFrame(frame) {
  const w = 10;
  const h = 8;
  const rim = color(RIM);
  const skin = color('#244a3a');
  const belly = color('#7ab090');
  const fin = color('#3a7058');
  const image = createImage(w, h);
  fillEllipse(image, 4.5, 3.5, 4.5, 3, (_u, v, e) => (e > 0.85 ? rim : v > 0.35 ? belly : skin));
  if (frame === 0) drawLine(image, 3, 0, 6, 0, fin);
  else drawLine(image, 3, 7, 6, 7, fin);
  setPixel(image, 1, 3, color('#d8f0a0'));
  return image;
}

/**
 * A gulper: a black deep fish with a huge pale-rimmed mouth on its left that gapes (frame 1) and a
 * small glowing eye.
 *
 * @param {boolean} open - The gaping frame.
 * @returns {Image} The frame.
 */
function gulperFrame(open) {
  const w = 18;
  const h = 12;
  const rim = color(RIM);
  const skin = color('#1a2830');
  const lit = color('#2e4450');
  const lip = color('#8a9aa0');
  const throat = color('#3a0c10');
  const eye = color('#c0f0f0');
  const image = createImage(w, h);
  fillEllipse(image, 10, 5.5, 7.5, 5.5, (_u, v, e) => (e > 0.88 ? rim : v < -0.3 ? lit : skin));
  const gape = open ? 3 : 1;
  for (let x = 0; x <= 7; x++) {
    const half = gape * (1 - x / 8) + 0.5;
    for (let y = Math.round(5.5 - half); y <= Math.round(5.5 + half); y++) {
      setPixel(image, x, y, Math.abs(y - 5.5) >= half - 0.6 ? lip : throat);
    }
  }
  setPixel(image, 9, 3, eye);
  return image;
}

/**
 * An abyss turret: a barnacle cone of pale shell on the rock with a dark mouth and a glowing core
 * (flipped by the renderer on a ceiling).
 *
 * @returns {Image} The frame.
 */
function turretFrame() {
  const w = 14;
  const h = 10;
  const rim = color(RIM);
  const shell = color('#5a6a6a');
  const lit = color('#8a9a98');
  const mouth = color('#0a1418');
  const glow = color('#6ad8e0');
  const image = createImage(w, h);
  fillEllipse(image, 6.5, 10, 6.5, 9, (u, _v, e) => (e > 0.86 ? rim : u < -0.3 ? lit : shell));
  fillEllipse(image, 6.5, 4, 2.2, 2, () => mouth);
  setPixel(image, 6, 4, glow);
  setPixel(image, 7, 4, glow);
  return image;
}

/**
 * An ARK hook: a rusted harpoon head pointing left on a short shaft with two fins that beat
 * between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function hookFrame(frame) {
  const w = 12;
  const h = 7;
  const rim = color(RIM);
  const iron = color('#8a7a6a');
  const rust = color(RUST);
  const fin = color('#b8b09a');
  const image = createImage(w, h);
  drawLine(image, 4, 3, 11, 3, rust);
  for (let x = 0; x <= 4; x++) {
    const half = (x * 2.5) / 4;
    for (let y = Math.round(3 - half); y <= Math.round(3 + half); y++) {
      setPixel(image, x, y, x === 4 || Math.abs(y - 3) >= half - 0.5 ? rim : iron);
    }
  }
  const spread = frame === 0 ? 2 : 3;
  drawLine(image, 9, 3, 11, 3 - spread, fin);
  drawLine(image, 9, 3, 11, 3 + spread, fin);
  return image;
}

/**
 * One section of the ABYSS ARK's hull: a whale-bodied battleship plated in bone — the bow tapers
 * to a blunt ram on its left, the stern to a tail fluke on its right, the middle section is a full
 * block; seams every 16 px, rust patches from a hash, a row of dim portholes and a dark keel line.
 *
 * @param {'bow' | 'mid' | 'stern'} part - Which section.
 * @returns {Image} The frame.
 */
function hullFrame(part) {
  const w = 96;
  const h = 40;
  const seed = seedOf('bosses/ark-' + part);
  const rim = color(RIM);
  const bone = color(BONE);
  const dark = color(BONE_DARK);
  const rust = color(RUST);
  const seam = color('#8a846e');
  const port = color('#2a5a64');
  const keel = color('#3a3628');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    // The section's outline: half-height at each column (the whale's curve).
    let half = 18;
    if (part === 'bow') half = 8 + 10 * Math.sqrt(Math.min(1, x / 40));
    if (part === 'stern') half = x < 56 ? 18 - (x * 8) / 56 : 10 - ((x - 56) * 4) / 40;
    const top = Math.round(20 - half);
    const bottom = Math.round(19 + half);
    for (let y = top; y <= bottom; y++) {
      const edge = y === top || y === bottom || (part === 'bow' && x === 0);
      let c = y < 20 ? bone : dark;
      if (x % 16 === 15) c = seam;
      if (hash2(x >> 2, y >> 2, seed) % 11 === 0) c = rust;
      if (y === bottom - 2) c = keel;
      if (y === 14 && x % 12 >= 4 && x % 12 < 7 && y > top + 2) c = port;
      setPixel(image, x, y, edge ? rim : c);
    }
  }
  if (part === 'stern') {
    // The fluke: two lobes on the right end.
    drawLine(image, 84, 18, 95, 6, color(BONE_DARK), 2);
    drawLine(image, 84, 21, 95, 33, color(BONE_DARK), 2);
  }
  return image;
}

/**
 * The ARK's turret frames: a pale bone dome with a rusted rim, and a barrel along the frame's
 * heading (`k · 22.5°` clockwise from +x) with a cyan muzzle — sixteen frames, like the M2-09
 * raid turret, so a turned turret shows its heading without a rotated sprite.
 *
 * @returns {Image[]} Sixteen frames.
 */
function arkTurretFrames() {
  const size = 16;
  const c = (size - 1) / 2;
  const rim = color(RUST);
  const body = color(BONE_DARK);
  const lit = color(BONE);
  const barrel = color('#5a5448');
  const muzzle = color('#6ad8e0');
  return DIRECTIONS_16.map(([dx, dy]) => {
    const image = createImage(size, size);
    fillEllipse(image, c, c, 6, 6, (u, v, e) => (e > 0.83 ? rim : u + v < -0.5 ? lit : body));
    for (let t = 0; t <= 7; t += 0.5) {
      const x = Math.round(c + dx * t);
      const y = Math.round(c + dy * t);
      for (const [ox, oy] of [
        [0, 0],
        [1, 0],
        [0, 1],
      ]) {
        const px = x + ox;
        const py = y + oy;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        setPixel(image, px, py, t >= 6.5 ? muzzle : barrel);
      }
    }
    return image;
  });
}

/**
 * The ARK's heart — its core: a round red organ in a cage of bone ribs, `tone` at its centre.
 *
 * @param {string} tone - The centre's colour.
 * @returns {Image} The frame.
 */
function heartFrame(tone) {
  const size = 18;
  const rim = color(RIM);
  const rib = color(BONE);
  const flesh = color('#a02830');
  const heart = color(tone);
  const image = createImage(size, size);
  fillEllipse(image, 8.5, 8.5, 8.5, 8.5, (u, _v, e) => {
    if (e > 0.92) return rim;
    if (e > 0.7) return Math.floor((u + 1) * 4) % 2 === 0 ? rib : rim;
    return e < 0.3 ? heart : mix(flesh, heart, 0.4 - e * 0.4);
  });
  return image;
}

/**
 * THE HOLLOW KING's body: a hunched anglerfish in black-teal, lit along its back, a pale spine
 * ridge, a glowing eye high on its left and a dark cavity on its left face where the jaws and the
 * throat sit.
 *
 * @returns {Image} The frame.
 */
function kingBodyFrame() {
  const w = 56;
  const h = 48;
  const rim = color(RIM);
  const skin = color('#16262e');
  const lit = color('#26404a');
  const ridge = color('#6a8a88');
  const cavity = color('#040608');
  const eye = color('#e0f870');
  const image = createImage(w, h);
  fillEllipse(image, 30, 24, 26, 22, (u, v, e) => {
    if (e > 0.93) return rim;
    if (v < -0.82 && Math.floor((u + 1) * 10) % 2 === 0) return ridge;
    return v < -0.3 ? lit : skin;
  });
  fillEllipse(image, 10, 26, 10, 12, () => cavity);
  fillEllipse(image, 17, 12, 2.5, 2.5, () => eye);
  return image;
}

/**
 * One of THE HOLLOW KING's jaws: a long jaw pointing left lined with pale needle teeth on its
 * inner edge — the upper jaw's teeth point down, the lower one's up.
 *
 * @param {boolean} upper - The upper jaw.
 * @returns {Image} The frame.
 */
function jawFrame(upper) {
  const w = 36;
  const h = 12;
  const rim = color(RIM);
  const skin = color('#1e3038');
  const lit = color('#34505a');
  const tooth = color('#e0e8e0');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const thick = 3 + Math.round((x * 5) / (w - 1));
    const y0 = upper ? 0 : h - thick;
    for (let y = y0; y < y0 + thick; y++) {
      const edge = y === y0 || y === y0 + thick - 1 || x === 0;
      setPixel(image, x, y, edge ? rim : y < h / 2 ? lit : skin);
    }
    if (x % 4 === 1) {
      const inner = upper ? thick : h - thick - 1;
      const step = upper ? 1 : -1;
      setPixel(image, x, inner, tooth);
      setPixel(image, x, inner + step, tooth);
    }
  }
  return image;
}

/**
 * THE HOLLOW KING's throat — the core: a glowing yellow-green orb deep in the mouth, `tone` at its
 * heart.
 *
 * @param {string} tone - The heart's colour.
 * @returns {Image} The frame.
 */
function mawFrame(tone) {
  const size = 16;
  const rim = color('#1a2008');
  const glow = color('#a0c030');
  const heart = color(tone);
  const image = createImage(size, size);
  fillEllipse(image, 7.5, 7.5, 7.5, 7.5, (_u, _v, e) =>
    e > 0.9 ? rim : e < 0.4 ? heart : mix(glow, heart, 0.5 - e * 0.5),
  );
  return image;
}

/**
 * A bead of the lure's stalk: a small round dark-teal bead with a lit upper face (armour — round
 * art, the stalk curls without rotated sprites).
 *
 * @returns {Image} The frame.
 */
function stalkFrame() {
  const size = 8;
  const rim = color(RIM);
  const skin = color('#1e3a44');
  const lit = color('#3a6a74');
  const image = createImage(size, size);
  fillEllipse(image, 3.5, 3.5, 3.5, 3.5, (u, v, e) => (e > 0.84 ? rim : u + v < -0.3 ? lit : skin));
  return image;
}

/**
 * The lure's bulb: a glowing cyan orb with a white heart and a faint halo (a gun — it fires and
 * launches the minions).
 *
 * @param {string} tone - The heart's colour.
 * @returns {Image} The frame.
 */
function lureFrame(tone) {
  const size = 12;
  const halo = color('#1a5a64');
  const glow = color('#6ad8e0');
  const heart = color(tone);
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.5, 5.5, (_u, _v, e) => (e > 0.82 ? halo : e < 0.4 ? heart : glow));
  return image;
}

// ---------------------------------------------------------------------------
// The R5-09.S2 v2 stand-ins (design `docs/v2-run/designs/zone-i.md` §14 and §10), drawn at the
// final v2 pixel size and only on the `artScale !== 1` path. Flat colours are at Chebyshev
// distance ≥ 3 from every shipped palette-cycle ramp (the zone-B brine route: the scan's EXEMPT
// list stays untouched — §9's "paint exactly" belongs to the R5-D6 real art, whose manifest note
// carries it). The ABYSS v2 ramp itself appears only through `bg/abyss-murk`, the ramp's own
// CYCLE_ART sprite.
// ---------------------------------------------------------------------------

/** The zone's own terrain palette — the one `terrain.mjs` paints `tiles/terrain-abyss` with. */
const PAL = TERRAIN_PALETTES['tiles/terrain-abyss'];
const SUR = color(PAL.surface);
const SUBS = color(PAL.subsurface);
const RKF = PAL.rock.map(color);

const RIMC = color(RIM);
const BONEC = color(BONE);
const BONEDC = color(BONE_DARK);
const RUSTC = color(RUST);

const BODY = color('#16303c');
const BODY_HI = color('#345c70');
const BODY_LO = color('#0e1620');
const SHELL = color('#4a7e92');
const LEG = color('#121e2c');
const EYE = color('#c89a4a');
const LANT = color('#a8f0e0');
const LANT_HOT = color('#d8ece4');
const MEMB = color('#16283c');
const MEMB2 = color('#24384e');
const RAY = color('#b0c4cc');
const CAPS = color('#66d2a8');
const CAPS_DIM = color('#3a7868');

/** The muzzle charge ramp of the ARK pods and the tender's pod: deep, dim, hot, flushed. */
const CHARGE = [color('#2a4654'), color('#5a92a2'), color('#86d8c8'), color('#d8f4ec')];

/** The deepwall's seven strata, dark basalt blue downward (§9's far wall read). */
const STR = [
  color('#0b1723'),
  color('#10202e'),
  color('#15283a'),
  color('#1a3145'),
  color('#20394f'),
  color('#264258'),
  color('#2d4d66'),
];
const DIKE = color('#060d15');
const VEIN = color('#2f5666');
const VEINLIT = color('#3c6e7e');
const SMOKE = color('#121e2c');
const CHIM = color('#2c4456');
const CHIMLIT = color('#4a7288');
const FLAKE = color('#d8e4e8');
const FLAKE2 = color('#8aa4b0');
const CORALC = color('#b05064');
const CORAL_HI = color('#d88494');
const CORAL_DK = color('#64303c');

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
 * `enemies/abyss-crawler` (24×15, 4 frames, hittable): the shelf-lip and trench-floor walker of
 * §6 (`walker.floor`) — an armoured isopod facing left: a segmented dome lit along its top, four
 * legs a side, amber eye and short antennae at the head, a tail flap behind. The four frames are
 * the gait: legs lift in pairs while the body bobs a pixel.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function crawlerFrame(k) {
  const img = createImage(24, 15);
  const seed = seedOf('enemies/abyss-crawler');
  const bob = [0, -1, 0, 1][k];
  const bottom = 9 + bob;
  for (let x = 2; x < 22; x++) {
    const crest = arch(x - 2, 21);
    const top = Math.round(bottom - 1 - 6 * crest);
    for (let y = top; y <= bottom; y++) {
      let c = y <= top + 1 ? SHELL : y >= bottom - 1 ? BODY_LO : BODY;
      if ((x === 7 || x === 12 || x === 17) && y > top + 1 && y < bottom - 1) c = BODY_LO;
      if (pick(x, y, seed, 11) === 0) c = BODY_HI;
      px(img, x, y, c);
    }
    px(img, x, top - 1, RIMC);
  }
  rect(img, 0, 4 + bob, 2, bottom, BODY);
  px(img, 1, 4 + bob, RIMC);
  px(img, 1, 6 + bob, EYE);
  drawLine(img, 2, 3 + bob, 0, 1 + bob, BODY_LO);
  drawLine(img, 2, 4 + bob, 0, 4 + bob, BODY_LO);
  rect(img, 21, 5 + bob, 23, 7 + bob, BODY_LO);
  for (let i = 0; i < 4; i++) {
    const lift = [0, 1, 2, 1][(i - k + 4) % 4];
    const x = 4 + i * 5;
    drawLine(img, x, bottom, x - 1, 12 + lift, LEG);
    px(img, x - 1 + (lift === 1 ? 1 : 0), 13 + (lift === 2 ? 1 : 0), LEG);
  }
  return img;
}

/**
 * `enemies/stinger` (18×10, 4 frames, hittable): the ark-approach escort of §6 (`rocket.homing`)
 * — a lanternfish dart facing left: a slim lit-backed body, a forked tail, an angler filament
 * with a cold spark over the head. The four frames flick the tail and fin and flare the spark.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function stingerFrame(k) {
  const img = createImage(18, 10);
  const seed = seedOf('enemies/stinger');
  fillEllipse(img, 8, 5, 6.5, 2.6, (u, v, e, x, y) => {
    if (e > 0.88) return RIMC;
    if (u + v < -0.6) return BODY_HI;
    if (v > 0.7) return BODY_LO;
    return pick(x, y, seed, 7) === 0 ? BODY_HI : BODY;
  });
  px(img, 1, 5, BODY);
  px(img, 0, 5, LANT);
  const tw = [2, 3, 3, 2][k];
  drawLine(img, 14, 5, 17, 5 - tw, BODY_LO);
  drawLine(img, 14, 5, 17, 5 + (tw - 1), BODY_LO);
  drawLine(img, 12, 5, 17, 5, BODY);
  const fy = k % 2 === 0 ? 1 : 0;
  px(img, 7, 2 - fy, BODY_LO);
  px(img, 8, 1 - fy, BODY_LO);
  drawLine(img, 4, 3, 3, 1, BODY_LO);
  px(img, 3, 0, k >= 2 ? LANT_HOT : LANT);
  px(img, 3, 4, RIMC);
  return img;
}

/**
 * `enemies/deep-tender` (18×12, 4 frames, hittable): the glowing capsule carrier of §6
 * (`carrier.straight`, `drop: capsule`) — a plump `tender` sibling facing left with a glowing
 * brood pod under its belly. The four frames charge the pod from deep blue through vent green to
 * a hot flushed spark while the rear fin beats.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function tenderFrame(k) {
  const img = createImage(18, 12);
  const seed = seedOf('enemies/deep-tender');
  fillEllipse(img, 9, 5, 7, 4, (u, v, e, x, y) => {
    if (e > 0.88) return RIMC;
    if (u + v < -0.7) return SHELL;
    if (v > 0.6) return BODY_LO;
    return pick(x, y, seed, 6) === 0 ? BODY_HI : BODY;
  });
  const tone = CHARGE[k];
  rect(img, 6, 8, 12, 10, BODY_LO);
  rect(img, 7, 9, 11, 10, tone);
  px(img, 9, 9, k === 3 ? LANT_HOT : CAPS);
  px(img, 6, 9, CAPS_DIM);
  px(img, 12, 9, CAPS_DIM);
  px(img, 4, 4, RIMC);
  drawLine(img, 15, 4, 17, 2 + (k % 2) * 2, BODY_LO);
  drawLine(img, 15, 6, 17, 5 + (k % 2), BODY_LO);
  return img;
}

/**
 * `bosses/ark-pod` (27×15, 4 frames, hittable): the ARK's gun pods of §8 (parts 12–13, the
 * mirrored pair, `count` 2 launches from phase 2) — a bone-plated capsule with a left muzzle,
 * rust streaks and rivet rows. The four frames charge the muzzle from deep blue to a flushed
 * spark, halo pixels joining as it heats.
 *
 * @param {number} k - The frame, 0 … 3.
 * @returns {Image} The frame.
 */
function podFrame(k) {
  const img = createImage(27, 15);
  const seed = seedOf('bosses/ark-pod');
  rect(img, 2, 2, 24, 12, BONEC);
  rect(img, 2, 2, 24, 3, LANT);
  rect(img, 2, 11, 24, 12, BONEDC);
  for (let x = 2; x < 25; x++) {
    px(img, x, 1, RIMC);
    px(img, x, 13, RIMC);
  }
  rect(img, 0, 0, 1, 1, RIMC);
  rect(img, 0, 13, 1, 14, RIMC);
  rect(img, 25, 0, 26, 1, RIMC);
  rect(img, 25, 13, 26, 14, RIMC);
  drawLine(img, 2, 2, 0, 4, RIMC);
  drawLine(img, 2, 12, 0, 10, RIMC);
  drawLine(img, 24, 2, 26, 4, RIMC);
  drawLine(img, 24, 12, 26, 10, RIMC);
  rect(img, 0, 6, 3, 8, CHARGE[k]);
  px(img, 0, 7, k >= 2 ? LANT_HOT : CHARGE[k]);
  if (k >= 1) px(img, 4, 6, CHARGE[k - 1]);
  if (k >= 1) px(img, 4, 8, CHARGE[k - 1]);
  drawLine(img, 5, 7, 24, 7, BONEDC);
  for (let x = 8; x < 22; x += 6) px(img, x, 4, RIMC);
  for (let x = 10; x < 22; x += 6) px(img, x, 10, RIMC);
  for (let x = 14; x < 23; x++) {
    if (pick(x, 0, seed, 5) === 0) px(img, x, 5 + pick(x, 1, seed, 2), RUSTC);
    if (pick(x, 2, seed, 7) === 0) px(img, x, 9, mix(BONEC, RUSTC, 0.5));
  }
  return img;
}

/**
 * `bosses/king-fin` (33×21, 1 frame, hittable): the HOLLOW KING's fins of §8 (parts 10–11, the
 * mirrored pair) — a five-rayed pectoral fan of dark membrane facing left off its bone base at
 * the right edge, lit along the leading edge, seeded cold dots scattered in the web.
 *
 * @returns {Image} The frame.
 */
function finFrame() {
  const img = createImage(33, 21);
  const seed = seedOf('bosses/king-fin');
  const base = [
    [31, 3, 10, 1],
    [31, 7, 4, 2],
    [31, 10, 2, 2],
    [31, 13, 4, 2],
    [31, 17, 10, 20],
  ];
  const rayY = (i, x) => {
    const [, by, tx] = base[i];
    const t = (31 - x) / (31 - tx);
    const [, , , ty] = [0, 0, 0, [1, 4, 10, 15, 20][i]];
    return by + (ty - by) * Math.min(1, t);
  };
  for (let x = 4; x <= 30; x++) {
    for (let i = 0; i < 4; i++) {
      const y0 = Math.round(rayY(i, x));
      const y1 = Math.round(rayY(i + 1, x));
      for (let y = y0; y <= y1; y++) {
        if (y === y0 && i === 0) continue;
        let c = MEMB;
        if (y <= y0 + 1) c = MEMB2;
        if (y >= y1) c = mix(MEMB, RIMC, 0.4);
        if (y === y0 || y === y1) c = RAY;
        if (pick(x, y, seed, 47) === 0) c = CAPS_DIM;
        if (pick(x, y, seed + 1, 61) === 0) c = CAPS;
        px(img, x, y, c);
      }
    }
    for (let i = 0; i < 5; i++)
      px(img, x, Math.round(rayY(i, x)), i === 0 || i === 4 ? MEMB2 : RAY);
  }
  rect(img, 29, 2, 32, 18, BONEDC);
  for (let y = 2; y <= 18; y++) px(img, 29, y, RIMC);
  px(img, 31, 5, RIMC);
  px(img, 31, 10, EYE);
  px(img, 31, 15, RIMC);
  for (let i = 0; i < 5; i++) px(img, 30, [3, 7, 10, 13, 17][i], RAY);
  return img;
}

/**
 * `bg/abyss-deepwall` (`BAND_TILE_W`×{@link DEEP_H}, 1 frame, fully opaque): the far trench and
 * abyss wall of §9 — seven basalt strata whose boundaries wobble on `arch` periods that divide
 * the tile, six darker dike cracks, sparse pale veins wrapped over the seam and cold bioluminescent
 * specks; blocky, so the page compresses, and nothing in it reads as a hazard.
 *
 * @returns {Image} The band.
 */
function deepWall() {
  const img = createImage(BAND_TILE_W, DEEP_H);
  const seed = seedOf('bg/abyss-deepwall');
  const steps = STR.length;
  const wob = (x) => Math.round(5 * arch(x, 160) + 3 * arch(x + 40, 80) + 2 * arch(x + 13, 40));
  for (let x = 0; x < BAND_TILE_W; x++) {
    const w = wob(x) - 5;
    const dike = x === 37 || x === 38 || x === 150 || x === 151 || x === 242 || x === 243;
    for (let y = 0; y < DEEP_H; y++) {
      let s = Math.floor((y * steps) / DEEP_H);
      const b = Math.floor(((s + 1) * DEEP_H) / steps) + w;
      if (y === b || y === b + 1) s += 1;
      else if (y === b - 1 || y === b - 2) s -= 1;
      s = Math.max(0, Math.min(steps - 1, s));
      const q = pick(Math.floor(x / 4), Math.floor(y / 4), seed, 24);
      if (q === 0) s = Math.min(steps - 1, s + 1);
      else if (q === 11) s = Math.max(0, s - 1);
      setPixel(img, x, y, dike && y % 44 > 1 ? DIKE : STR[s]);
    }
  }
  for (let i = 0; i < 10; i++) {
    const cy = 20 + pick(i, 1, seed, DEEP_H - 40);
    const cx = pick(i, 2, seed, BAND_TILE_W);
    const len = 9 + pick(i, 3, seed, 12);
    const mid = Math.floor(len / 2);
    for (let m = 0; m < len; m++) {
      pxw(img, cx + m, cy, m === mid ? VEINLIT : VEIN);
      if (m % 2 === 0) pxw(img, cx + m, cy + 1, VEIN);
    }
  }
  for (let i = 0; i < 26; i++) {
    pxw(img, pick(i, 5, seed, BAND_TILE_W), pick(i, 6, seed, DEEP_H), CAPS_DIM);
  }
  return img;
}

/**
 * `bg/abyss-vents` (`BAND_TILE_W`×{@link VENTS_H}, 1 frame, green key): the black-smoker field of
 * §9 — a solid rock base along the abyssal plain with five chimneys, each lit down its left edge,
 * a dark mouth under a flared lip and a straight tapered smoke column rising from it. Every
 * column is one run solid to the base, binary alpha, and no feature touches the tile borders, so
 * copies side by side join without a seam.
 *
 * @returns {Image} The band.
 */
function ventsBand() {
  const img = createImage(BAND_TILE_W, VENTS_H);
  const seed = seedOf('bg/abyss-vents');
  const baseTop = VENTS_H - 16;
  for (let x = 0; x < BAND_TILE_W; x++) {
    for (let y = baseTop; y < VENTS_H; y++) {
      const c = y === baseTop ? CHIMLIT : pick(Math.floor(x / 3), y, seed, 5) === 0 ? SMOKE : CHIM;
      setPixel(img, x, y, c);
    }
  }
  const mouths = [30, 96, 161, 226, 291];
  for (let i = 0; i < mouths.length; i++) {
    const cx = mouths[i] + pick(i, 1, seed, 11) - 5;
    const topY = 10 + pick(i, 3, seed, 26);
    const hwB = 5 + pick(i, 4, seed, 3);
    const span = baseTop - 1 - topY;
    for (let y = topY; y < baseTop; y++) {
      const t = span === 0 ? 0 : (y - topY) / span;
      const hw = Math.round(2 + (hwB - 2) * t);
      for (let x = cx - hw; x <= cx + hw; x++) {
        const c = x === cx - hw ? CHIMLIT : x === cx + hw ? SMOKE : y === topY ? CHIMLIT : CHIM;
        px(img, x, y, c);
      }
    }
    rect(img, cx - 1, topY + 1, cx + 1, topY + 2, DIKE);
    for (let y = topY - 1; y >= 6; y--) {
      const d = topY - y;
      const hw = Math.max(1, 2 - Math.floor(d / 12));
      for (let x = cx - hw; x <= cx + hw; x++) {
        const c =
          x === cx - hw || x === cx + hw ? mix(SMOKE, RIMC, 0.3) : y % 5 === 2 ? CHIM : SMOKE;
        px(img, x, y, c);
      }
    }
  }
  return img;
}

/**
 * `bg/abyss-flakes` (`BAND_TILE_W`×{@link FLAKES_H}, 2 frames, green key): the marine snow of
 * §9 — sparse pale streaks and single motes drifting in front of the ship; the two frames slide
 * the drift. Surface only: well below the density that could hide a bullet lane, every feature
 * wrapped so the band repeats seamlessly, binary alpha.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function flakesBand(k) {
  const img = createImage(BAND_TILE_W, FLAKES_H);
  const seed = seedOf('bg/abyss-flakes');
  for (let i = 0; i < 14; i++) {
    const y0 = 2 + pick(i, 1, seed, FLAKES_H - 4);
    const x0 = pick(i, 2, seed, BAND_TILE_W) + k * (4 + pick(i, 5, seed, 5));
    const len = 2 + pick(i, 3, seed, 4);
    const lit = pick(i, 4, seed, 3) === 0;
    for (let m = 0; m < len; m++) {
      pxw(img, x0 + m, y0 + m, lit && m === 1 ? FLAKE : FLAKE2);
    }
  }
  for (let j = 0; j < 20; j++) {
    const x = pick(j, 6, seed, BAND_TILE_W) + k * (3 + pick(j, 8, seed, 3));
    const y = 1 + pick(j, 7, seed, FLAKES_H - 2);
    pxw(img, x, y, pick(j, 9, seed, 4) === 0 ? FLAKE : FLAKE2);
  }
  return img;
}

/**
 * `fx/glow-abyss-vent` (36×24, 2 frames): the additive vent glow of §9's decor note (the smoker
 * bases, the coral column caps, the buttress heads, the stinger shoals), the `decor.mjs` glow
 * recipe — a bright core, a body ring and a faint halo on a 3:2 ellipse; the second frame is the
 * pulse, one step smaller. Soft alpha is the bible §5.8 glow accent (the `fx/glow-magma-vent`
 * precedent's 204 and 110 tiers); the tones pass `offRamp`, clear of every ramp.
 *
 * @param {number} k - The frame, 0 or 1.
 * @returns {Image} The frame.
 */
function ventGlow(k) {
  const img = createImage(36, 24);
  const cx = 18;
  const cy = 12;
  const core = color(offRamp('#86e0c8'));
  const edge = color(offRamp('#2a6a72'));
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
 * The twenty-two frames of `tiles/terrain-abyss-v2`: `terrain-abyss`'s whole twenty-tile list
 * first in its order (the base list is off-limits — design §16; P13's prefix law), then the two
 * §10 additions: `coral` (solid, the mine drift's hp-6 punch pillars) and `abyss-glow` (the empty
 * decor of gas glimmers in the buttresses). The frame order is the list this function returns
 * and {@link ABYSS_V2_TILE_NAMES} names.
 *
 * @param {number} size - The tile side (`options.tileSize`).
 * @returns {Image[]} The frames, in list order.
 */
function abyssTilesV2(size) {
  const base = renderTerrainTiles(size, 'tiles/terrain-abyss');
  return [...base, coralTile(size), abyssGlowTile(size)];
}

/**
 * `coral`: the solid coral punch column (§10 id 21, mask all-12) — the abyss rock ground under
 * two branching coral stems, a pale-lit taller stem right of centre and a low mound at the right
 * edge; fully opaque.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function coralTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-abyss-v2/coral');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const q = pick(x, y, seed, 4);
      let c = q === 0 ? RKF[2] : pick(x, y, seed + 1, 2) === 0 ? RKF[1] : RKF[0];
      if (y >= s - 2 && q === 1) c = SUBS;
      if (y === 0 && q === 2) c = SUR;
      setPixel(img, x, y, c);
    }
  }
  rect(img, 4, 3, 5, 11, CORALC);
  rect(img, 4, 1, 5, 2, CORAL_HI);
  rect(img, 2, 5, 3, 5, CORAL_DK);
  rect(img, 8, 1, 8, 11, CORALC);
  rect(img, 8, 0, 8, 0, CORAL_HI);
  rect(img, 9, 4, 10, 4, CORALC);
  rect(img, 10, 2, 10, 3, CORAL_HI);
  rect(img, 9, 8, 11, 11, CORAL_DK);
  rect(img, 10, 8, 11, 8, CORALC);
  px(img, 5, 6, CORAL_HI);
  px(img, 8, 7, CORAL_DK);
  return img;
}

/**
 * `abyss-glow`: the empty decor tile (§10 id 22, mask all-0) — cold green gas glimmers: a few
 * single pixels and a pair of tiny plus sparks over transparent ground, keyed binary.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function abyssGlowTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-abyss-v2/abyss-glow');
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const q = pick(x, y, seed, 10);
      if (q === 0) px(img, x, y, CAPS);
      else if (q === 1) px(img, x, y, CAPS_DIM);
    }
  }
  px(img, 3, 4, CAPS);
  px(img, 2, 4, CAPS_DIM);
  px(img, 4, 4, CAPS_DIM);
  px(img, 3, 3, CAPS_DIM);
  px(img, 3, 5, CAPS_DIM);
  px(img, 8, 8, CAPS);
  px(img, 7, 8, CAPS_DIM);
  px(img, 9, 8, CAPS_DIM);
  px(img, 8, 7, CAPS_DIM);
  px(img, 8, 9, CAPS_DIM);
  return img;
}
