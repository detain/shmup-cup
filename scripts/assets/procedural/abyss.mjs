/**
 * Zone I, **ABYSSAL THRONE** (plan M2-14) — placeholder art of the deep (decision D24):
 *
 * - `bg/abyss-murk` ({@link MURK_TILE_W}×{@link MURK_TILE_H}, the far band): black-blue deep water,
 *   darker towards the bottom in soft bands, with scattered bioluminescent specks painted in the
 *   four {@link ABYSS_RAMP} colours (a position hash picks which), so the stage's palette cycle makes
 *   them twinkle; every period divides the tile, so it repeats seamlessly across and down.
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
 * **Public API.** {@link generate}, {@link ABYSS_SPRITES}, {@link ABYSS_RAMP} (the colours zone I's
 * palette cycle must name), {@link MURK_TILE_W} / {@link MURK_TILE_H}, {@link SPIRES_TILE_W} /
 * {@link SPIRES_TILE_H} (the bands' tile sizes, their parallax `spacing`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { DIRECTIONS_8, color, drawLine, fillEllipse, makeSprite, mix, seedOf } from './common.mjs';

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
 * @returns {SpriteDef[]} The sprites of {@link ABYSS_SPRITES}, in that order.
 */
export function generate() {
  const flash = { hitFlash: true };
  return [
    makeSprite('bg/abyss-murk', [murk()], 'abyss', { anchor: [0, 0] }),
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
}

/**
 * The murk: four soft horizontal bands of deep blue (16 px each, darker downwards — the tile
 * repeats down, so the bands repeat too) and specks: one per 16×16 cell where a hash says so, a
 * single pixel or a plus, in a {@link ABYSS_RAMP} colour picked by another hash — the only ramp
 * pixels of the tile.
 *
 * @returns {Image} The tile.
 */
function murk() {
  const w = MURK_TILE_W;
  const h = MURK_TILE_H;
  const seed = seedOf('bg/abyss-murk');
  const ramp = ABYSS_RAMP.map(color);
  const bands = [color('#081620'), color('#07131c'), color('#061018'), color('#050d14')];
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
