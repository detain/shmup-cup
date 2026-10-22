/**
 * Zone H, **IRON CITADEL** (plan M2-14) — placeholder art of the enemy fortress (decision D24):
 *
 * - `bg/citadel-wall` ({@link WALL_TILE_W}×{@link WALL_TILE_H}, the far band): the fortress's inner
 *   wall — riveted steel panels on a 32×16 grid with seams, and a running light in every panel
 *   painted in one of the {@link CITADEL_RAMP} (v1) / {@link CITADEL_RAMP_V2} (the frozen v2 ramp,
 *   R5-P.P7) colours (a position hash picks which), so the stage's palette cycle makes the lights
 *   chase along the wall; the grid divides the tile, so it repeats seamlessly across and down.
 * - `bg/citadel-pipes` ({@link PIPES_TILE_W}×{@link PIPES_TILE_H}, a mid band): conduits — three
 *   horizontal pipes with flanges every 32 px and struts down to a girder at the bottom.
 * - Enemies (flying ones face left; hit-flash siblings): `enemies/bolt-drone` (a small steel
 *   diamond drone with a red eye, its rotors flickering, 2 frames), `enemies/hatch-bay` (a floor
 *   hatch — shut and open, 2 frames; flipped by the renderer on a ceiling), `enemies/hatch-mite` (the
 *   beetle drone a hatch releases, 2 frames), `enemies/laser-emitter` (an emitter dome with a lens
 *   facing left that glows, 2 frames), `enemies/sentinel-walker` (a two-legged sentry, its legs in
 *   step, 2 frames), `enemies/rail-turret` (a low turret with a long rail barrel).
 * - IRON SOVEREIGN (IS-08), the citadel's master: `bosses/sovereign-hull` (the fortress hull —
 *   armour), `bosses/sovereign-core` (the red core, pulsing, 2 frames), `bosses/sovereign-plate`
 *   (a tall shield plate in front of the core), `bosses/sovereign-pod` (a round armoured pod of the
 *   turning shield wheel), `bosses/sovereign-emitter` (a lane-laser emitter), `bosses/sovereign-hatch`
 *   (a drone hatch, shut and open, 2 frames).
 *
 * - At an art scale ≠ 1 (R5-08.S2, design `docs/v2-run/designs/zone-h.md` §13, all `native`):
 *   `enemies/gate-sentry` (the gate turret, its eye slot pulsing, 2 frames), `enemies/iron-banner`
 *   (the parade's drifting standard with the Sovereign's sigil, 2 frames), `bg/citadel-banner`
 *   (the hall's tapestry band — {@link BAND_TILE_W}×{@link BANNER_H}, seamless) and
 *   `tiles/terrain-citadel-v2` (the terrain sprite `tiles/terrain-citadel`'s twenty frames
 *   verbatim, then the four §9 variants {@link CITADEL_V2_TILES}). The parade's echoes and the
 *   rebuilt Sovereign draw **no new sprites** — they reuse the existing ones (§7); the v1 set is
 *   byte for byte untouched at scale 1 (RR-1).
 *
 * Gunmetal greys with amber hazard trim — low in saturation next to the pink / red / purple bullets
 * and the capsules (shmup_feat.md §12, §18); the v2 cloth deepens the blue into the greys. Every
 * new colour stands at Chebyshev distance ≥ 3 from every shipped palette cycle (bible §4.4) — the
 * wall and the v2 tiles are the only cycled art, painted on the ramps themselves. Geometry uses
 * only `+ - * /`, randomness `hash2` (seeded from the sprite names), so the pixels are identical
 * on every engine. The band sizes derive from `scripts/frame.mjs` directly (the `v2kit.mjs` ↔
 * generator import cycle turns a frame import through v2kit into a temporal-dead-zone crash — the
 * storm and magma lesson).
 *
 * **Public API.** {@link generate}, {@link CITADEL_SPRITES}, {@link CITADEL_RAMP} (the colours
 * zone H's v1 palette cycle named), {@link CITADEL_RAMP_V2} (the frozen v2 ramp zone H's cycle
 * names since R5-P.P7), {@link WALL_TILE_W} / {@link WALL_TILE_H},
 * {@link PIPES_TILE_W} / {@link PIPES_TILE_H} (the bands' tile sizes, their parallax `spacing`)
 * — and, since R5-08.S2, {@link CITADEL_V2_SPRITES}, {@link CITADEL_V2_TILES},
 * {@link CITADEL_V2_TILE_NAMES}, {@link BAND_TILE_W} and {@link BANNER_H}.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { scaleImage } from '../interim.mjs';
import { hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf } from './common.mjs';
import { renderTerrainTiles, TERRAIN_TILES, TILE_SIZE } from './terrain.mjs';
import { FRAME_W } from '../../frame.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/citadel-wall` tile (its parallax `spacing`). */
export const WALL_TILE_W = 128;

/** Height of the `bg/citadel-wall` tile (bands stacked under each other join seamlessly). */
export const WALL_TILE_H = 64;

/** Width of the `bg/citadel-pipes` tile (its parallax `spacing`). */
export const PIPES_TILE_W = 128;

/** Height of the `bg/citadel-pipes` tile. */
export const PIPES_TILE_H = 48;

/** Width of one wall panel (it divides {@link WALL_TILE_W}). */
const PANEL_W = 32;

/** Height of one wall panel (it divides {@link WALL_TILE_H}). */
const PANEL_H = 16;

/**
 * The running lights' four colours, dim → bright amber — the exact colours zone H's palette cycle
 * names (`content/stages/zone-h.stage.json`); no other pixel of the wall uses them.
 */
export const CITADEL_RAMP = Object.freeze(['#402a10', '#6a4418', '#a86a20', '#e8a030']);

/**
 * Zone H's frozen v2 ramp (design `docs/v2-run/designs/zone-h.md` §9): the six colours
 * `content/stages/zone-h.stage.json` names now, dim rust → bright amber — drawn by
 * `bg/citadel-wall`'s running lights only at an art scale ≠ 1 (RR-1: the scale-1 build keeps
 * {@link CITADEL_RAMP} byte for byte).
 */
export const CITADEL_RAMP_V2 = Object.freeze([
  '#2e1a06',
  '#4a2c10',
  '#7a4c18',
  '#b87824',
  '#e8a838',
  '#f8d878',
]);

/** The sprites this generator draws, in order. */
export const CITADEL_SPRITES = Object.freeze([
  'bg/citadel-wall',
  'bg/citadel-pipes',
  'enemies/bolt-drone',
  'enemies/hatch-bay',
  'enemies/hatch-mite',
  'enemies/laser-emitter',
  'enemies/sentinel-walker',
  'enemies/rail-turret',
  'bosses/sovereign-hull',
  'bosses/sovereign-core',
  'bosses/sovereign-plate',
  'bosses/sovereign-pod',
  'bosses/sovereign-emitter',
  'bosses/sovereign-hatch',
]);

/** The v2 stand-in names {@link generate} adds at an art scale ≠ 1, in its output order (§13). */
export const CITADEL_V2_SPRITES = Object.freeze([
  'enemies/gate-sentry',
  'enemies/iron-banner',
  'bg/citadel-banner',
  'tiles/terrain-citadel-v2',
]);

/** The four §9 variant tiles after `terrain-citadel`'s twenty, in list order (frame ids 20–23). */
export const CITADEL_V2_TILES = /** @type {const} */ ([
  'plate',
  'rivet-plate',
  'grate',
  'gate-door',
]);

/**
 * The tile names of `tiles/terrain-citadel-v2`: `terrain-citadel`'s list verbatim (frames 0–19,
 * the §13 never-rename law — the tileset JSON S5a authors must list its tiles in this order),
 * then the variants.
 */
export const CITADEL_V2_TILE_NAMES = /** @type {const} */ ([...TERRAIN_TILES, ...CITADEL_V2_TILES]);

/**
 * Tile width of the `bg/citadel-banner` band: half the frame, derived from `FRAME_W` — the
 * template law. The design §13's 24×144 text cannot tile a frame-wide band seamlessly; every
 * shipped band repeats at a period that fills the frame exactly twice (the zone-C / zone-D
 * precedent, disclosed deviation).
 */
export const BAND_TILE_W = FRAME_W / 2;

/** Height of the `bg/citadel-banner` band (design §13: 144 px = 12 tile rows). */
export const BANNER_H = 12 * TILE_SIZE;

/** Dark outline of every machine. */
const RIM = '#101218';

/** Steel body tone. */
const STEEL = '#5a606e';

/** Lit steel. */
const STEEL_LIT = '#9aa2b4';

/** Shadowed steel. */
const STEEL_DARK = '#3a3e4a';

/** Amber hazard trim. */
const AMBER = '#e0a040';

/** The Sovereign's banner cloth (v2): a dark blue steel-slate, its lit weave kept in {@link STEEL_LIT}. */
const CLOTH = '#2a3444';

/** The banner cloth's fold shade (v2). */
const CLOTH_SHADE = '#1e2634';

/**
 * Generates zone H's art: the fourteen v1 sprites always, plus the four v2 stand-ins of design
 * §13 when the build runs at an art scale ≠ 1 (decision RR-1a).
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's art scale and tile
 *   side (the pipeline passes both; `artScale` 1 or absent draws the v1 set — the cycled wall
 *   band on the v1 ramp — byte for byte, `tileSize` defaults to the v2 {@link TILE_SIZE}).
 * @returns {SpriteDef[]} The sprites of {@link CITADEL_SPRITES}, in that order, at art scale 1;
 *   the v1 set followed by {@link CITADEL_V2_SPRITES} in theirs at any other scale (the new
 *   names all `native`, their `@flash` siblings derived by the pipeline's flash pass).
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  const v2 = artScale !== 1;
  const flash = { hitFlash: true };
  const sprites = [
    makeSprite(
      'bg/citadel-wall',
      [v2 ? scaleImage(wall(CITADEL_RAMP_V2), artScale) : wall()],
      'citadel',
      {
        anchor: [0, 0],
        native: v2,
      },
    ),
    makeSprite('bg/citadel-pipes', [pipes()], 'citadel', { anchor: [0, 0] }),
    makeSprite('enemies/bolt-drone', [droneFrame(0), droneFrame(1)], 'citadel', {
      hitFlash: true,
      animations: { spin: [0, 1] },
    }),
    makeSprite('enemies/hatch-bay', [hatchBayFrame(false), hatchBayFrame(true)], 'citadel', {
      hitFlash: true,
      animations: { open: [0, 1] },
    }),
    makeSprite('enemies/hatch-mite', [miteFrame(0), miteFrame(1)], 'citadel', {
      hitFlash: true,
      animations: { crawl: [0, 1] },
    }),
    makeSprite('enemies/laser-emitter', [emitterFrame(0), emitterFrame(1)], 'citadel', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('enemies/sentinel-walker', [walkerFrame(0), walkerFrame(1)], 'citadel', {
      hitFlash: true,
      animations: { walk: [0, 1] },
    }),
    makeSprite('enemies/rail-turret', [railTurretFrame()], 'citadel', flash),
    makeSprite('bosses/sovereign-hull', [hullFrame()], 'citadel', flash),
    makeSprite('bosses/sovereign-core', [coreFrame('#f05030'), coreFrame('#ffc070')], 'citadel', {
      hitFlash: true,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('bosses/sovereign-plate', [plateFrame()], 'citadel', flash),
    makeSprite('bosses/sovereign-pod', [podFrame()], 'citadel', flash),
    makeSprite('bosses/sovereign-emitter', [bossEmitterFrame()], 'citadel', flash),
    makeSprite('bosses/sovereign-hatch', [bossHatchFrame(false), bossHatchFrame(true)], 'citadel', {
      hitFlash: true,
      animations: { open: [0, 1] },
    }),
  ];
  if (!v2) return sprites;
  const size = options.tileSize ?? TILE_SIZE;
  const native = { native: true };
  const hit = { hitFlash: true, ...native };
  return sprites.concat([
    makeSprite('enemies/gate-sentry', [gateSentryFrame(false), gateSentryFrame(true)], 'citadel', {
      ...hit,
      animations: { charge: [0, 1] },
    }),
    makeSprite('enemies/iron-banner', [ironBannerFrame(false), ironBannerFrame(true)], 'citadel', {
      ...hit,
      animations: { wave: [0, 1] },
    }),
    makeSprite('bg/citadel-banner', [bannerBand()], 'citadel', { anchor: [0, 0], ...native }),
    makeSprite('tiles/terrain-citadel-v2', citadelTilesV2(size), 'citadel', {
      anchor: [0, 0],
      ...native,
      animations: Object.fromEntries(CITADEL_V2_TILE_NAMES.map((n, i) => [n, [i]])),
    }),
  ]);
}

/**
 * The fortress wall: panels on a {@link PANEL_W}×{@link PANEL_H} grid, each a steel tone picked by
 * a hash with a lit top seam and a dark bottom seam, two rivets, and a 3×2 running light whose
 * colour is one of `rampHex` (v1's {@link CITADEL_RAMP}, the frozen v2 {@link CITADEL_RAMP_V2}) —
 * the only ramp pixels of the tile.
 *
 * @param {readonly string[]} [rampHex] - The ramp the lights use, default {@link CITADEL_RAMP}.
 * @returns {Image} The tile.
 */
function wall(rampHex = CITADEL_RAMP) {
  const w = WALL_TILE_W;
  const h = WALL_TILE_H;
  const seed = seedOf('bg/citadel-wall');
  const ramp = rampHex.map(color);
  const tones = [color('#22262e'), color('#262a34'), color('#1e2229')];
  const seamLit = color('#3a404c');
  const seamDark = color('#14161c');
  const rivet = color('#4a505c');
  const cols = w / PANEL_W;
  const rows = h / PANEL_H;
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = Math.floor(x / PANEL_W);
      const py = Math.floor(y / PANEL_H);
      const lx = x - px * PANEL_W;
      const ly = y - py * PANEL_H;
      const tone = tones[hash2(px % cols, py % rows, seed) % tones.length];
      let c = tone;
      if (ly === 0) c = seamLit;
      else if (ly === PANEL_H - 1 || lx === PANEL_W - 1) c = seamDark;
      else if ((lx === 3 || lx === PANEL_W - 4) && ly === 3) c = rivet;
      setPixel(image, x, y, c);
    }
  }
  // The running lights: one per panel, at a hashed column, four ramp colours round the wall.
  for (let py = 0; py < rows; py++) {
    for (let px = 0; px < cols; px++) {
      const k = (px + py * 2) % ramp.length;
      const lx = px * PANEL_W + 8 + (hash2(px, py, seed ^ 0x2f1) % 16);
      const ly = py * PANEL_H + 9;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 3; dx++) setPixel(image, lx + dx, ly + dy, ramp[k]);
      }
    }
  }
  return image;
}

/**
 * The conduits band: three horizontal pipes (lit top line, dark bottom line) with flanges every
 * 32 px, struts from the lowest pipe down to a girder with diagonal braces at the bottom — every
 * period divides the tile width.
 *
 * @returns {Image} The tile.
 */
function pipes() {
  const w = PIPES_TILE_W;
  const h = PIPES_TILE_H;
  const pipe = color('#2e333e');
  const lit = color('#4c5462');
  const dark = color('#191c23');
  const flange = color('#5a6270');
  const girder = color('#23272f');
  const brace = color('#30353f');
  const image = createImage(w, h);
  const lines = [
    [6, 4],
    [14, 3],
    [22, 5],
  ];
  for (const [top, thick] of lines) {
    for (let x = 0; x < w; x++) {
      for (let t = 0; t < thick; t++) {
        const c = t === 0 ? lit : t === thick - 1 ? dark : pipe;
        setPixel(image, x, top + t, x % 32 < 2 ? flange : c);
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 36; y < h; y++) setPixel(image, x, y, y === 36 ? lit : girder);
    if (x % 16 === 4) for (let y = 27; y < 36; y++) setPixel(image, x, y, flange);
  }
  for (let x = 0; x < w; x += 16) drawLine(image, x, 46, x + 15, 38, brace);
  return image;
}

/**
 * A bolt drone: a steel diamond with a red eye; its two rotors flicker between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function droneFrame(frame) {
  const size = 9;
  const rim = color(RIM);
  const body = color(STEEL);
  const lit = color(STEEL_LIT);
  const eye = color('#f04028');
  const rotor = color(frame === 0 ? '#c8ccd4' : '#6a707c');
  const image = createImage(size, size);
  for (let y = 0; y < size; y++) {
    const half = 4 - Math.abs(y - 4);
    for (let x = 4 - half; x <= 4 + half; x++) {
      const edge = x === 4 - half || x === 4 + half;
      setPixel(image, x, y, edge ? rim : y < 4 ? lit : body);
    }
  }
  setPixel(image, 3, 4, eye);
  setPixel(image, 2, 4, eye);
  drawLine(image, 5, 0, 8, 0, rotor);
  drawLine(image, 5, 8, 8, 8, rotor);
  return image;
}

/**
 * A floor hatch: a steel frame with amber hazard stripes; shut (frame 0) the doors meet in the
 * middle, open (frame 1) a dark shaft shows between them.
 *
 * @param {boolean} open - The open frame.
 * @returns {Image} The frame.
 */
function hatchBayFrame(open) {
  const w = 16;
  const h = 8;
  const rim = color(RIM);
  const frame = color(STEEL_DARK);
  const door = color(STEEL);
  const amber = color(AMBER);
  const shaft = color('#08090c');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || x === w - 1 || y === h - 1;
      let c = frame;
      if (y >= 1 && y <= 3) {
        const gap = open ? x >= 4 && x <= 11 : false;
        c = gap ? shaft : door;
        if (!gap && y === 1) c = (x + y) % 4 < 2 ? amber : door;
      }
      setPixel(image, x, y, edge ? rim : c);
    }
  }
  return image;
}

/**
 * A hatch mite: a small beetle drone — a steel shell with a red eye facing left and legs that
 * swap between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function miteFrame(frame) {
  const w = 9;
  const h = 7;
  const rim = color(RIM);
  const shell = color('#6a7080');
  const lit = color(STEEL_LIT);
  const eye = color('#f04028');
  const leg = color('#2a2e38');
  const image = createImage(w, h);
  fillEllipse(image, 4, 3, 4, 2.6, (u, v, e) => (e > 0.85 ? rim : v < -0.2 ? lit : shell));
  setPixel(image, 1, 3, eye);
  const off = frame === 0 ? 0 : 1;
  for (const x of [2, 4, 6]) setPixel(image, x + off, 6, leg);
  return image;
}

/**
 * A laser emitter: a squat steel dome on a base plate with a round lens on its left face; the
 * lens glows brighter in frame 1 (flipped by the renderer on a ceiling).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function emitterFrame(frame) {
  const size = 12;
  const rim = color(RIM);
  const body = color(STEEL);
  const lit = color(STEEL_LIT);
  const base = color(STEEL_DARK);
  const lens = color(frame === 0 ? '#d05838' : '#ffd8a0');
  const image = createImage(size, size);
  fillEllipse(image, 6, 8, 5.5, 6, (u, v, e) => (e > 0.86 ? rim : v < -0.4 && u < 0 ? lit : body));
  for (let x = 0; x < size; x++) {
    for (let y = 9; y < size; y++) setPixel(image, x, y, y === 9 ? lit : base);
  }
  fillEllipse(image, 2.5, 5.5, 2, 2, () => lens);
  return image;
}

/**
 * A sentinel walker: a boxy sentry on two legs with a visor on its left; the legs are in step
 * (frame 0) or crossed (frame 1).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function walkerFrame(frame) {
  const w = 12;
  const h = 14;
  const rim = color(RIM);
  const body = color(STEEL);
  const lit = color(STEEL_LIT);
  const visor = color('#f06030');
  const leg = color(STEEL_DARK);
  const image = createImage(w, h);
  for (let y = 0; y < 8; y++) {
    for (let x = 1; x < 11; x++) {
      const edge = x === 1 || x === 10 || y === 0 || y === 7;
      setPixel(image, x, y, edge ? rim : y < 3 ? lit : body);
    }
  }
  drawLine(image, 2, 3, 4, 3, visor);
  if (frame === 0) {
    drawLine(image, 3, 8, 2, 13, leg);
    drawLine(image, 8, 8, 9, 13, leg);
  } else {
    drawLine(image, 3, 8, 5, 13, leg);
    drawLine(image, 8, 8, 6, 13, leg);
  }
  return image;
}

/**
 * A rail turret: a low armoured base with amber trim and a long rail barrel pointing up-left
 * (flipped by the renderer on a ceiling).
 *
 * @returns {Image} The frame.
 */
function railTurretFrame() {
  const w = 14;
  const h = 10;
  const rim = color(RIM);
  const body = color(STEEL);
  const lit = color(STEEL_LIT);
  const amber = color(AMBER);
  const rail = color('#c8ccd4');
  const image = createImage(w, h);
  fillEllipse(image, 7, 9, 6, 5, (u, v, e) => (e > 0.85 ? rim : v < -0.5 ? lit : body));
  for (let x = 1; x < 13; x++) setPixel(image, x, 9, amber);
  drawLine(image, 6, 5, 1, 1, rail, 2);
  return image;
}

/**
 * IRON SOVEREIGN's hull: a tall stepped fortress block in gunmetal — lit upper-left faces, dark
 * lower-right ones, amber hazard bands top and bottom, rows of dark ports and a socket on its left
 * face where the core sits.
 *
 * @returns {Image} The frame.
 */
function hullFrame() {
  const w = 64;
  const h = 88;
  const rim = color(RIM);
  const face = color('#4a505c');
  const lit = color('#6e7686');
  const dark = color('#30343e');
  const amber = color(AMBER);
  const port = color('#0e1014');
  const socket = color('#06070a');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    // Stepped: narrower towers at the top and bottom, the full block in the middle.
    const inset = y < 16 ? 16 : y < 26 ? 8 : y > h - 17 ? 16 : y > h - 27 ? 8 : 0;
    for (let x = inset; x < w; x++) {
      const edge = x === inset || x === w - 1 || y === 0 || y === h - 1;
      let c = x < 32 && y < h / 2 ? lit : x >= 32 && y >= h / 2 ? dark : face;
      if (y === 26 || y === h - 27) c = amber;
      if ((y === 36 || y === h - 37) && x > inset + 10 && x % 6 < 3) c = port;
      setPixel(image, x, y, edge ? rim : c);
    }
  }
  fillEllipse(image, 11, h / 2 - 0.5, 10, 12, () => socket);
  return image;
}

/**
 * IRON SOVEREIGN's core — the weak point: a red eye of fire, `tone` at its heart, ringed in steel.
 *
 * @param {string} tone - The heart's colour.
 * @returns {Image} The frame.
 */
function coreFrame(tone) {
  const size = 18;
  const rim = color(RIM);
  const ring = color('#6e7686');
  const fire = color('#c83020');
  const heart = color(tone);
  const image = createImage(size, size);
  fillEllipse(image, 8.5, 8.5, 8.5, 8.5, (_u, _v, e) => {
    if (e > 0.92) return rim;
    if (e > 0.72) return ring;
    return e < 0.35 ? heart : mix(fire, heart, 0.5 - e * 0.5);
  });
  return image;
}

/**
 * A shield plate: a tall slab of armour with a lit left edge, bolts down its face and amber
 * hazard corners — the plates stand in front of the core and must break first.
 *
 * @returns {Image} The frame.
 */
function plateFrame() {
  const w = 8;
  const h = 28;
  const rim = color(RIM);
  const face = color(STEEL);
  const lit = color(STEEL_LIT);
  const bolt = color(STEEL_DARK);
  const amber = color(AMBER);
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      let c = x < 3 ? lit : face;
      if (x === 4 && y % 6 === 3) c = bolt;
      if ((y < 3 || y > h - 4) && (x + y) % 3 === 0) c = amber;
      setPixel(image, x, y, edge ? rim : c);
    }
  }
  return image;
}

/**
 * A shield-wheel pod: a round armoured ball with a lit upper-left face and an amber band (round art
 * — turned parts are never rotated, M2-09).
 *
 * @returns {Image} The frame.
 */
function podFrame() {
  const size = 12;
  const rim = color(RIM);
  const face = color(STEEL);
  const lit = color(STEEL_LIT);
  const amber = color(AMBER);
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.5, 5.5, (u, v, e) => {
    if (e > 0.86) return rim;
    if (Math.abs(v) < 0.14) return amber;
    return u + v < -0.4 ? lit : face;
  });
  return image;
}

/**
 * The boss's lane emitter: a squat block with a long glowing lens slot on its left end.
 *
 * @returns {Image} The frame.
 */
function bossEmitterFrame() {
  const w = 16;
  const h = 10;
  const rim = color(RIM);
  const face = color(STEEL);
  const lit = color(STEEL_LIT);
  const lens = color('#ff9060');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      setPixel(image, x, y, edge ? rim : y < 3 ? lit : face);
    }
  }
  for (let y = 3; y <= 6; y++) for (let x = 1; x <= 3; x++) setPixel(image, x, y, lens);
  return image;
}

/**
 * The boss's drone hatch: a heavy steel door with amber stripes, shut (frame 0) or slid open on a
 * dark bay (frame 1).
 *
 * @param {boolean} open - The open frame.
 * @returns {Image} The frame.
 */
function bossHatchFrame(open) {
  const w = 14;
  const h = 12;
  const rim = color(RIM);
  const door = color(STEEL);
  const amber = color(AMBER);
  const bay = color('#0a0b0e');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      const gap = open && y >= 3 && y <= 8;
      let c = gap ? bay : door;
      if (!gap && (x + y) % 5 === 0) c = amber;
      setPixel(image, x, y, edge ? rim : c);
    }
  }
  return image;
}

/* ------------------------------------------------------------------ *
 *  v2 stand-ins (R5-08.S2, design §13) — drawn only at an art scale ≠ 1. *
 * ------------------------------------------------------------------ */

/**
 * A deterministic pick: one of `n` choices from two coordinates and a seed.
 *
 * @param {number} a - First coordinate or index.
 * @param {number} b - Second coordinate or index.
 * @param {number} seed - The sprite's seed (`seedOf`).
 * @param {number} n - The number of choices.
 * @returns {number} 0 … `n` − 1.
 */
function pick(a, b, seed, n) {
  return hash2(a, b, seed) % n;
}

/**
 * `enemies/gate-sentry` (20×16, 2 frames, hittable): the gate turret of §13 — a steel base block
 * with a lit lip, an amber hazard band and a rimmed foot, under a dark crenellated head whose eye
 * slot burns red ringed in amber; frame 1 swaps the two, the charge pulse the parade marches to
 * (§7's gates read it through the Sovereign's wheel).
 *
 * @param {boolean} pulse - The swapped (charging) frame.
 * @returns {Image} The frame.
 */
function gateSentryFrame(pulse) {
  const w = 20;
  const h = 16;
  const rim = color(RIM);
  const head = color(STEEL_DARK);
  const base = color(STEEL);
  const lit = color(STEEL_LIT);
  const amber = color(AMBER);
  const burn = color(pulse ? AMBER : '#f04028');
  const ring = color(pulse ? '#f04028' : AMBER);
  const image = createImage(w, h);
  for (let y = 9; y < h; y++) {
    for (let x = 1; x <= w - 2; x++) {
      const edge = y === h - 1 || x === 1 || x === w - 2;
      setPixel(image, x, y, edge ? rim : y === 9 ? lit : base);
    }
  }
  for (let y = 12; y <= 13; y++) {
    for (let x = 2; x <= w - 3; x++) {
      if (x % 4 < 2) setPixel(image, x, y, amber);
    }
  }
  for (let x = 3; x <= 16; x++) {
    const top = (x - 3) % 4 === 3 ? 3 : 0;
    for (let y = top; y <= 8; y++) {
      const edge = y === 8 || x === 3 || x === 16;
      setPixel(image, x, y, edge ? rim : y === top ? lit : head);
    }
  }
  for (let y = 4; y <= 7; y++) {
    for (let x = 8; x <= 11; x++) {
      const band = x === 8 || x === 11 || y === 4 || y === 7;
      setPixel(image, x, y, band ? ring : burn);
    }
  }
  setPixel(image, 5, 5, lit);
  setPixel(image, 14, 5, lit);
  setPixel(image, 5, 6, rim);
  setPixel(image, 14, 6, rim);
  return image;
}

/**
 * `enemies/iron-banner` (16×16, 2 frames, hittable): the parade's drifting standard — a riveted
 * pole flying a dark cloth banner marked with the Sovereign's sigil (an amber diamond with a lit
 * heart), its woven folds shifting and its pennant edge lifting between the frames. A sigil, no
 * gun: the banners carry no weapon (§13).
 *
 * @param {boolean} wave - The shifted frame.
 * @returns {Image} The frame.
 */
function ironBannerFrame(wave) {
  const w = 16;
  const h = 16;
  const rim = color(RIM);
  const pole = color(STEEL_DARK);
  const face = color(STEEL);
  const lit = color(STEEL_LIT);
  const cloth = color(CLOTH);
  const shade = color(CLOTH_SHADE);
  const amber = color(AMBER);
  const image = createImage(w, h);
  const shift = wave ? 3 : 0;
  for (let x = 2; x < w; x++) {
    const flap = wave && (x - 2) % 4 === 3 ? 1 : 0;
    const bottom = h - 3 - Math.floor((x - 2) / 4) - flap;
    for (let y = 3; y <= bottom; y++) {
      const edge = x === w - 1 || y === bottom;
      const fold = (x + shift) % 6 === 0;
      const weave = (x + Math.floor(y / 2)) % 8 === 1;
      setPixel(image, x, y, edge ? rim : fold || weave ? shade : cloth);
    }
  }
  for (let y = 6; y <= 11; y++) {
    for (let x = 6; x <= 10; x++) {
      const d = Math.abs(x - 8) + Math.abs(y - 8);
      if (d <= 3) setPixel(image, x, y, d === 3 ? amber : d === 2 ? shade : lit);
    }
  }
  for (let y = 1; y < h; y++) {
    setPixel(image, 0, y, rim);
    setPixel(image, 1, y, y % 3 === 0 ? lit : pole);
  }
  setPixel(image, 0, 0, amber);
  setPixel(image, 1, 0, rim);
  for (let x = 2; x <= 14; x++) setPixel(image, x, 2, x % 4 === 0 ? lit : face);
  return image;
}

/**
 * `bg/citadel-banner` ({@link BAND_TILE_W}×{@link BANNER_H}, 1 frame, anchor `[0, 0]`): the throne
 * hall's tapestry strip — rimmed steel trim above and below a woven cloth field, the Sovereign's
 * diamonds at an 80-px period and a fringe every 8 px; every period divides the tile, so the band
 * seams clean across the frame. Fully opaque (a background is never transparent).
 *
 * @returns {Image} The tile.
 */
function bannerBand() {
  const w = BAND_TILE_W;
  const h = BANNER_H;
  const rim = color(RIM);
  const dark = color(STEEL_DARK);
  const lit = color(STEEL_LIT);
  const cloth = color(CLOTH);
  const shade = color(CLOTH_SHADE);
  const amber = color(AMBER);
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c;
      if (y < 3) c = rim;
      else if (y === 3 || y === h - 3) c = x % 4 === 0 ? lit : amber;
      else if (y === 4 || y === h - 4) c = dark;
      else if (y > 4 && y < h - 4 && y >= h - 8 && x % 8 < 3) c = (x + y) % 2 === 0 ? amber : dark;
      else {
        const fold = (x + Math.floor(y / 3) * 2) % 20 === 0;
        const weave = (x + Math.floor(y / 2)) % 8 === 2;
        c = fold || weave ? shade : cloth;
      }
      setPixel(image, x, y, c);
    }
  }
  for (let cx = 40; cx < w; cx += 80) {
    for (let y = 53; y <= 89; y++) {
      for (let x = cx - 18; x <= cx + 18; x++) {
        const d = Math.abs(x - cx) + Math.abs(y - 71);
        if (d > 18) continue;
        setPixel(image, x, y, d >= 15 ? amber : d >= 12 ? shade : d <= 2 ? lit : cloth);
      }
    }
  }
  return image;
}

/**
 * The `tiles/terrain-citadel-v2` strip: `tiles/terrain-citadel`'s twenty frames verbatim at
 * `size`, then the four §9 variants in {@link CITADEL_V2_TILES} order (frame ids 20–23).
 *
 * @param {number} size - The tile side (12).
 * @returns {Image[]} The twenty-four frames, in {@link CITADEL_V2_TILE_NAMES} order.
 */
function citadelTilesV2(size) {
  const base = renderTerrainTiles(size, 'tiles/terrain-citadel');
  return [...base, plateTile(size), rivetPlateTile(size), grateTile(size), gateDoorTile(size)];
}

/**
 * `plate` (id 20): the plain armour plate — a full steel face with a lit top lip, a dark bottom
 * seam, hashed pitting and a rim frame; fully opaque, so its §9 mask is all-12 (solid).
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function plateTile(s) {
  const img = createImage(s, s);
  const seed = seedOf('tiles/terrain-citadel-v2/plate');
  const rim = color(RIM);
  const face = color(STEEL);
  const lit = color(STEEL_LIT);
  const dark = color(STEEL_DARK);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const edge = x === 0 || y === 0 || x === s - 1 || y === s - 1;
      let c = edge ? rim : y <= 1 ? lit : y === s - 2 ? dark : face;
      if (
        !edge &&
        y > 1 &&
        y < s - 2 &&
        pick(Math.floor(x / 2), Math.floor(y / 2), seed, 6) === 0
      ) {
        c = dark;
      }
      setPixel(img, x, y, c);
    }
  }
  return img;
}

/**
 * `rivet-plate` (id 21): the bolted plate — the plain plate's body with lit rivets (each shadowed
 * down-right) in a quincunx and a seam across its middle; fully opaque (mask all-12, solid).
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function rivetPlateTile(s) {
  const img = plateTile(s);
  const rim = color(RIM);
  const lit = color(STEEL_LIT);
  const dark = color(STEEL_DARK);
  const half = Math.floor(s / 2);
  const spots = [
    [2, 2],
    [s - 4, 2],
    [half - 1, half - 1],
    [2, s - 4],
    [s - 4, s - 4],
  ];
  for (const [rx, ry] of spots) {
    setPixel(img, rx, ry, lit);
    setPixel(img, rx + 1, ry, dark);
    setPixel(img, rx, ry + 1, dark);
    setPixel(img, rx + 1, ry + 1, rim);
  }
  for (let x = 2; x < s - 2; x++) setPixel(img, x, half, dark);
  return img;
}

/**
 * `grate` (id 22): the open grating — a steel frame with lit top edge and two vertical bars,
 * transparent slots between; its §9 mask is all-0 (no collision, decor). The opaque pixels stay
 * above 8 and below the tile's area minus 8 (the pipeline's binary-decor rule, `magma`'s vent).
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function grateTile(s) {
  const img = createImage(s, s);
  const bar = color(STEEL_DARK);
  const lit = color(STEEL_LIT);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const frame = y === 0 || y === s - 1 || x === 0 || x === s - 1;
      const vbar = x === Math.floor(s / 3) || x === Math.floor((2 * s) / 3);
      if (frame || vbar) setPixel(img, x, y, y === 0 ? lit : bar);
    }
  }
  return img;
}

/**
 * `gate-door` (id 23): the sealed gate — lit steel bars on a dark ground with rimmed grooves,
 * cross-braced by a face-steel band and corner rivets; fully opaque (mask all-12). §9 makes it
 * the destructible variant, hp 8 — the gate the checkpoint 3 fight blows out of the march.
 *
 * @param {number} s - Tile side.
 * @returns {Image} The tile.
 */
function gateDoorTile(s) {
  const img = createImage(s, s);
  const rim = color(RIM);
  const dark = color(STEEL_DARK);
  const face = color(STEEL);
  const lit = color(STEEL_LIT);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let c = x % 4 < 2 ? lit : x % 4 === 2 ? rim : dark;
      if (y === 5 || y === 6) c = y === 5 ? face : dark;
      setPixel(img, x, y, c);
    }
  }
  const rivets = [
    [1, 1],
    [s - 3, 1],
    [1, s - 3],
    [s - 3, s - 3],
  ];
  for (const [rx, ry] of rivets) setPixel(img, rx, ry, rim);
  return img;
}
