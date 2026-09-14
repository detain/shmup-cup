/**
 * Zone H, **IRON CITADEL** (plan M2-14) — placeholder art of the enemy fortress (decision D24):
 *
 * - `bg/citadel-wall` ({@link WALL_TILE_W}×{@link WALL_TILE_H}, the far band): the fortress's inner
 *   wall — riveted steel panels on a 32×16 grid with seams, and a running light in every panel
 *   painted in one of the four {@link CITADEL_RAMP} colours (a position hash picks which), so the
 *   stage's palette cycle makes the lights chase along the wall; the grid divides the tile, so it
 *   repeats seamlessly across and down.
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
 * Gunmetal greys with amber hazard trim — low in saturation next to the pink / red / purple bullets
 * and the capsules (shmup_feat.md §12, §18). Geometry uses only `+ - * /` and `Math.sqrt`,
 * randomness `hash2` (seeded from the sprite names), so the pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link CITADEL_SPRITES}, {@link CITADEL_RAMP} (the colours
 * zone H's palette cycle must name), {@link WALL_TILE_W} / {@link WALL_TILE_H},
 * {@link PIPES_TILE_W} / {@link PIPES_TILE_H} (the bands' tile sizes, their parallax `spacing`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf } from './common.mjs';

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

/**
 * Generates zone H's art.
 *
 * @returns {SpriteDef[]} The sprites of {@link CITADEL_SPRITES}, in that order.
 */
export function generate() {
  const flash = { hitFlash: true };
  return [
    makeSprite('bg/citadel-wall', [wall()], 'citadel', { anchor: [0, 0] }),
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
}

/**
 * The fortress wall: panels on a {@link PANEL_W}×{@link PANEL_H} grid, each a steel tone picked by
 * a hash with a lit top seam and a dark bottom seam, two rivets, and a 3×2 running light whose
 * colour is one of {@link CITADEL_RAMP} (a hash of the panel) — the only ramp pixels of the tile.
 *
 * @returns {Image} The tile.
 */
function wall() {
  const w = WALL_TILE_W;
  const h = WALL_TILE_H;
  const seed = seedOf('bg/citadel-wall');
  const ramp = CITADEL_RAMP.map(color);
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
