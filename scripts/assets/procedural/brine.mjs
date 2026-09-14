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
 * **Public API.** {@link generate}, {@link BRINE_SPRITES}, {@link BRINE_RAMP} (the colours zone B's
 * palette cycle must name), {@link NEBULA_TILE_W} / {@link NEBULA_TILE_H}, {@link BRINE_SEA_W} /
 * {@link BRINE_SEA_H} (the bands' tile sizes, their parallax `spacing`).
 *
 * @module
 */
import { createImage, flipVertical, setPixel } from '../image.mjs';
import { createAssetRng, hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf, withAlpha } from './common.mjs';

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

/** The sprites this generator draws, in order. */
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
 * Generates zone B's art.
 *
 * @returns {SpriteDef[]} The sprites of {@link BRINE_SPRITES}, in that order.
 */
export function generate() {
  const flash = { hitFlash: true };
  const jawTop = jawFrame();
  return [
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
    return withAlpha(mix(film, iris, t > 1 ? 1 : t < 0 ? 0 : t), 200);
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
