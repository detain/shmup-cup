/**
 * Zone D, **MAGMA DEEP** (plan M2-12) — placeholder art of the volcano → underground zone
 * (decision D24):
 *
 * - `bg/magma-peaks` ({@link PEAKS_TILE_W}×{@link PEAKS_TILE_H}, the far band): distant volcano
 *   cones in dark ash with glowing craters and faint smoke plumes; the cones wrap round the tile
 *   edge, so the band repeats seamlessly.
 * - `bg/magma-lava` ({@link LAVA_TILE_W}×{@link LAVA_TILE_H}, a mid band seen from the caves): a
 *   lake of lava painted **only** in the four colours of {@link MAGMA_RAMP} (so the stage's palette
 *   cycle rolls it — `bg/sea-swell`'s recipe), plus dark crust floes outside the ramp.
 * - Enemies (flying ones face left; hit-flash siblings): `enemies/ember-wisp` (a flickering ember,
 *   2 frames), `enemies/cinder-bat` (an ash bat, wings beating, 2 frames), `enemies/magma-cone` (an
 *   erupting cone on the floor, its crater bubbling, 2 frames), `enemies/magma-bomb` (the lava bomb
 *   it throws, 2 frames), `enemies/cinder-rock` (a cracked rock hanging from a cave roof),
 *   `enemies/slag-crawler` (an armoured slag beetle walking on a floor — the renderer flips it on a
 *   ceiling —, legs alternating, 2 frames), `enemies/basalt-turret` (a basalt dome with a glowing
 *   barrel eye).
 * - CINDER BASTION (CB-04), the core battleship with rotating shield arms: `bosses/bastion-hull`
 *   (the iron hull with its glowing vents), `bosses/bastion-core` (the magma core — the weak point,
 *   2 frames), `bosses/bastion-emitter` (a lane-laser emitter, 2 frames), `bosses/bastion-arm` (a
 *   round shield segment of the rotating arms).
 *
 * Kept low in saturation next to the bullets and capsules where it can be (shmup_feat.md §12,
 * §18): the lava glows orange and yellow, never pink, red-violet or purple like the bullets.
 * Geometry uses only `+ - * /` and `Math.sqrt`, randomness `hash2` seeded from the sprite names,
 * so the pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link MAGMA_SPRITES}, {@link MAGMA_RAMP} (the colours zone D's
 * palette cycle must name), {@link PEAKS_TILE_W} / {@link PEAKS_TILE_H}, {@link LAVA_TILE_W} /
 * {@link LAVA_TILE_H} (the bands' tile sizes, their parallax `spacing`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf, withAlpha } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/magma-peaks` tile (its parallax `spacing`). */
export const PEAKS_TILE_W = 128;

/** Height of the `bg/magma-peaks` tile. */
export const PEAKS_TILE_H = 56;

/** Width of the `bg/magma-lava` tile (its parallax `spacing`). */
export const LAVA_TILE_W = 128;

/** Height of the `bg/magma-lava` tile. */
export const LAVA_TILE_H = 40;

/**
 * The lava lake's four colours, dark → bright — the exact colours zone D's palette cycle names
 * (`content/stages/zone-d.stage.json`).
 */
export const MAGMA_RAMP = Object.freeze(['#5a1808', '#8a2c0a', '#c04a10', '#e87a1c']);

/** The sprites this generator draws, in order. */
export const MAGMA_SPRITES = Object.freeze([
  'bg/magma-peaks',
  'bg/magma-lava',
  'enemies/ember-wisp',
  'enemies/cinder-bat',
  'enemies/magma-cone',
  'enemies/magma-bomb',
  'enemies/cinder-rock',
  'enemies/slag-crawler',
  'enemies/basalt-turret',
  'bosses/bastion-hull',
  'bosses/bastion-core',
  'bosses/bastion-emitter',
  'bosses/bastion-arm',
]);

/**
 * Generates zone D's art.
 *
 * @returns {SpriteDef[]} The sprites of {@link MAGMA_SPRITES}, in that order.
 */
export function generate() {
  const flash = { hitFlash: true };
  return [
    makeSprite('bg/magma-peaks', [peaks()], 'magma', { anchor: [0, 0] }),
    makeSprite('bg/magma-lava', [lava()], 'magma', { anchor: [0, 0] }),
    makeSprite('enemies/ember-wisp', [wispFrame(0), wispFrame(1)], 'magma', {
      hitFlash: true,
      animations: { flicker: [0, 1] },
    }),
    makeSprite('enemies/cinder-bat', [batFrame(-1), batFrame(1)], 'magma', {
      hitFlash: true,
      animations: { fly: [0, 1] },
    }),
    makeSprite('enemies/magma-cone', [coneFrame(false), coneFrame(true)], 'magma', {
      hitFlash: true,
      animations: { bubble: [0, 1] },
    }),
    makeSprite('enemies/magma-bomb', [bombFrame('#f0a030'), bombFrame('#f8d860')], 'magma', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('enemies/cinder-rock', [rockFrame()], 'magma', flash),
    makeSprite('enemies/slag-crawler', [crawlerFrame(0), crawlerFrame(1)], 'magma', {
      hitFlash: true,
      animations: { walk: [0, 1] },
    }),
    makeSprite('enemies/basalt-turret', [turretFrame()], 'magma', flash),
    makeSprite('bosses/bastion-hull', [hullFrame()], 'magma', flash),
    makeSprite('bosses/bastion-core', [coreFrame('#f8a040'), coreFrame('#f8e070')], 'magma', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('bosses/bastion-emitter', [emitterFrame(0), emitterFrame(1)], 'magma', {
      hitFlash: true,
      animations: { charge: [0, 1] },
    }),
    makeSprite('bosses/bastion-arm', [armFrame()], 'magma', flash),
  ];
}

/**
 * A triangle wave of a whole-pixel period: 0 at `x` = 0, 1 at half the period.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function triangle(x, period) {
  const t = (((x % period) + period) % period) / period;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

/**
 * The peaks band: two volcano cones (their slopes wrap round the tile edge) in dark ash with a
 * lighter ridge line, glowing craters and translucent smoke plumes rising from them.
 *
 * @returns {Image} The tile.
 */
function peaks() {
  const w = PEAKS_TILE_W;
  const h = PEAKS_TILE_H;
  const ash = color('#2e2226');
  const ridge = color('#4a3634');
  const glow = color('#e0602a');
  const hot = color('#f8b048');
  const smoke = color('#5a4a4e');
  const cones = [
    { x: 34, top: 14, slope: 0.9 },
    { x: 96, top: 26, slope: 1.1 },
  ];
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    let top = h;
    for (const cone of cones) {
      let dx = Math.abs(x - cone.x);
      if (dx > w / 2) dx = w - dx;
      // A flat crater 4 px wide, then the slope.
      const y = cone.top + (dx < 2 ? 0 : (dx - 2) * cone.slope);
      if (y < top) top = y;
    }
    const start = Math.round(top);
    for (let y = start; y < h; y++) setPixel(image, x, y, y === start ? ridge : ash);
  }
  const seed = seedOf('bg/magma-peaks');
  for (const cone of cones) {
    for (let dx = -2; dx <= 2; dx++) {
      setPixel(image, cone.x + dx, cone.top, Math.abs(dx) < 2 ? hot : glow);
      setPixel(image, cone.x + dx, cone.top + 1, glow);
    }
    // The plume: a column of translucent puffs drifting right as it rises.
    for (let k = 0; k < 5; k++) {
      const cy = cone.top - 3 - k * 3;
      if (cy < 1) break;
      const cx = cone.x + k * 1.5 + (hash2(k, cone.x, seed) % 2);
      fillEllipse(image, cx, cy, 2 + k * 0.6, 1.6 + k * 0.3, () => withAlpha(smoke, 150 - k * 22));
    }
  }
  return image;
}

/**
 * The lava band: 3-px bands stepping through {@link MAGMA_RAMP}, bent by two triangle waves (64 and
 * 32 px — they divide the tile width, so it repeats seamlessly), with dark crust floes (outside the
 * ramp, so the palette cycle leaves them alone).
 *
 * @returns {Image} The tile.
 */
function lava() {
  const ramp = MAGMA_RAMP.map(color);
  const crust = color('#2a1a18');
  const image = createImage(LAVA_TILE_W, LAVA_TILE_H);
  for (let x = 0; x < LAVA_TILE_W; x++) {
    const swell = Math.round(3 * triangle(x, 64) + 2 * triangle(x + 11, 32));
    for (let y = 0; y < LAVA_TILE_H; y++) {
      setPixel(image, x, y, ramp[Math.floor((y + swell) / 3) % ramp.length]);
    }
  }
  const seed = seedOf('bg/magma-lava');
  for (let i = 0; i < 7; i++) {
    const cx = 8 + (hash2(i, 0, seed) % (LAVA_TILE_W - 16));
    const cy = 6 + (hash2(i, 1, seed) % (LAVA_TILE_H - 12));
    const rx = 3 + (hash2(i, 2, seed) % 5);
    fillEllipse(image, cx, cy, rx + 0.5, 1.5, () => crust);
  }
  return image;
}

/**
 * An ember wisp: a round glowing ember with a flame trailing to the right (it flies left); the
 * flame's tip flickers between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function wispFrame(frame) {
  const w = 12;
  const h = 10;
  const edge = color('#a02c10');
  const flame = color('#e8641c');
  const heart = color('#f8c860');
  const image = createImage(w, h);
  drawLine(image, 5, 4.5, 10, 3 + frame * 2, withAlpha(flame, 200), 2);
  drawLine(image, 6, 4.5, 11, 5 - frame, withAlpha(edge, 160));
  fillEllipse(image, 4, 4.5, 3.6, 3.6, (u, v, e) => (e > 0.75 ? edge : e > 0.4 ? flame : heart));
  return image;
}

/**
 * The cinder bat: an ash-grey body with ember eyes on the left and ragged wings up (`wing` −1) or
 * down (+1).
 *
 * @param {number} wing - −1 or 1.
 * @returns {Image} The frame.
 */
function batFrame(wing) {
  const w = 16;
  const h = 10;
  const body = color('#3a2c2c');
  const membrane = color('#6a4a44');
  const eye = color('#f09030');
  const image = createImage(w, h);
  drawLine(image, 8, 5, 3, 5 + 4 * wing, membrane, 2);
  drawLine(image, 8, 5, 13, 5 + 4 * wing, membrane, 2);
  fillEllipse(image, 8, 5, 4, 2.5, () => body);
  fillEllipse(image, 4, 4.5, 2, 1.8, () => body);
  setPixel(image, 3, 4, eye);
  setPixel(image, 3, 5, eye);
  return image;
}

/**
 * The magma cone: a small ash cone standing on a floor with a glowing crater; frame 1 lifts a lava
 * bubble over it.
 *
 * @param {boolean} bubble - Frame 1.
 * @returns {Image} The frame.
 */
function coneFrame(bubble) {
  const w = 22;
  const h = 12;
  const ash = color('#4a3632');
  const lit = color('#6a4c44');
  const glow = color('#e0602a');
  const hot = color('#f8c050');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const dx = Math.abs(x - 10.5);
    const top = Math.round(3 + (dx < 3 ? 0 : (dx - 3) * 1.1));
    for (let y = top; y < h; y++) setPixel(image, x, y, x < 10 && y - top < 2 ? lit : ash);
  }
  for (let x = 8; x <= 13; x++) setPixel(image, x, 3, x > 9 && x < 12 ? hot : glow);
  drawLine(image, 7, 6, 5, 11, glow);
  if (bubble) fillEllipse(image, 10.5, 1.5, 2, 1.5, () => hot);
  return image;
}

/**
 * A lava bomb: a small glowing blob (`tone` in its middle) with a dark crust rim.
 *
 * @param {string} tone - The middle colour.
 * @returns {Image} The frame.
 */
function bombFrame(tone) {
  const image = createImage(6, 6);
  const crust = color('#5a2010');
  const hot = color(tone);
  const glow = color('#e0602a');
  fillEllipse(image, 2.5, 2.5, 2.8, 2.8, (_u, _v, e) => (e > 0.8 ? crust : e > 0.45 ? glow : hot));
  return image;
}

/**
 * A cinder rock: a lumpy dark rock (seeded speckles, a lit top) with glowing cracks.
 *
 * @returns {Image} The frame.
 */
function rockFrame() {
  const size = 12;
  const seed = seedOf('enemies/cinder-rock');
  const rim = color('#1a1212');
  const rock = color('#3e3030');
  const lit = color('#5c4844');
  const crack = color('#d0501c');
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.8, 5.2, (u, v, e, x, y) => {
    if (e > 0.85 + (hash2(x, y, seed) % 3) * 0.04) return rim;
    if (v < -0.5) return lit;
    return rock;
  });
  drawLine(image, 3, 4, 6, 7, crack);
  drawLine(image, 6, 7, 8, 6, crack);
  return image;
}

/**
 * The slag crawler: a squat beetle of cooled slag standing on a floor — a domed shell with a
 * glowing seam, a head on the left, three legs a side that alternate between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function crawlerFrame(frame) {
  const w = 16;
  const h = 10;
  const leg = color('#1e1614');
  const shell = color('#4a3a36');
  const seam = color('#e0682a');
  const eye = color('#f8c050');
  const image = createImage(w, h);
  for (let k = 0; k < 3; k++) {
    const x = 5 + k * 3.5;
    const step = (k + frame) % 2 === 0 ? -1 : 1;
    drawLine(image, x, 6, x + step, 9, leg);
  }
  fillEllipse(image, 9, 6, 6.5, 5, (u, v) => {
    if (v > 0.2) return null;
    return Math.abs(v + 0.45) < 0.12 ? seam : shell;
  });
  fillEllipse(image, 2.5, 5, 2.2, 1.8, () => shell);
  setPixel(image, 1, 4, eye);
  return image;
}

/**
 * The basalt turret: a dark hexagonal dome on a floor with a glowing eye and a short barrel.
 *
 * @returns {Image} The frame.
 */
function turretFrame() {
  const w = 14;
  const h = 11;
  const rim = color('#1a1414');
  const stone = color('#3a3234');
  const lit = color('#58484a');
  const eye = color('#f09030');
  const image = createImage(w, h);
  drawLine(image, 6.5, 5, 6.5, 0, rim, 2);
  fillEllipse(image, 6.5, 10, 6.5, 7, (u, v, e) => {
    if (e > 0.86) return rim;
    return u + v < -0.9 ? lit : stone;
  });
  fillEllipse(image, 6.5, 6.5, 1.8, 1.8, () => eye);
  return image;
}

/**
 * CINDER BASTION's hull: a long iron body (dark rim, riveted plates in seeded tones, a lit top
 * edge) with three glowing vents along its side and a stack at the back.
 *
 * @returns {Image} The frame.
 */
function hullFrame() {
  const w = 56;
  const h = 40;
  const seed = seedOf('bosses/bastion-hull');
  const rim = color('#140e0e');
  const plate = color('#3c3434');
  const plate2 = color('#463c3a');
  const lit = color('#6a5a56');
  const vent = color('#e0602a');
  const hot = color('#f8b048');
  const image = createImage(w, h);
  // The body: a rounded box, the bow (left) tapered.
  for (let y = 2; y < h - 2; y++) {
    const v = Math.abs(y - (h - 1) / 2) / ((h - 4) / 2);
    const inset = Math.round(10 * v * v);
    for (let x = inset; x < w - 2; x++) {
      const edge = x === inset || y === 2 || y === h - 3 || x === w - 3;
      if (edge) setPixel(image, x, y, rim);
      else if (y < 6) setPixel(image, x, y, lit);
      else
        setPixel(
          image,
          x,
          y,
          hash2(Math.floor(x / 8), Math.floor(y / 6), seed) % 2 ? plate : plate2,
        );
    }
  }
  // Plate seams and rivets.
  for (let x = 16; x < w - 4; x += 10) drawLine(image, x, 6, x, h - 5, rim);
  // Vents along the waterline.
  for (let k = 0; k < 3; k++) {
    const vx = 20 + k * 11;
    for (let x = vx; x < vx + 6; x++) {
      setPixel(image, x, 25, vent);
      setPixel(image, x, 26, hot);
      setPixel(image, x, 27, vent);
    }
  }
  // The stack at the stern.
  fillEllipse(image, 46, 3, 4, 3, (_u, v) => (v < -0.3 ? vent : rim));
  return image;
}

/**
 * CINDER BASTION's core: a glowing magma sphere (`tone` at its heart) in a dark iron ring.
 *
 * @param {string} tone - The heart's colour.
 * @returns {Image} The frame.
 */
function coreFrame(tone) {
  const size = 16;
  const ring = color('#1e1414');
  const iron = color('#5a4a46');
  const magma = color('#e0602a');
  const heart = color(tone);
  const image = createImage(size, size);
  fillEllipse(image, 7.5, 7.5, 7.5, 7.5, (_u, _v, e) => {
    if (e > 0.9) return ring;
    if (e > 0.72) return iron;
    if (e > 0.4) return magma;
    return heart;
  });
  return image;
}

/**
 * A lane-laser emitter: an iron barrel pointing left with a charging muzzle (brighter in frame 1).
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function emitterFrame(frame) {
  const w = 18;
  const h = 10;
  const rim = color('#140e0e');
  const iron = color('#4a403e');
  const lit = color('#6e605c');
  const muzzle = mix(color('#c04a10'), color('#f8d860'), frame === 0 ? 0.2 : 1);
  const image = createImage(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const edge = y === 1 || y === h - 2 || x === w - 2;
      setPixel(image, x, y, edge ? rim : y < 4 ? lit : iron);
    }
  }
  for (let y = 3; y <= 6; y++) {
    setPixel(image, 0, y, muzzle);
    setPixel(image, 1, y, muzzle);
  }
  return image;
}

/**
 * A shield-arm segment: an iron disc with a hot orange rim and a dark boss in the middle.
 *
 * @returns {Image} The frame.
 */
function armFrame() {
  const size = 12;
  const rim = color('#c04a10');
  const iron = color('#4e4442');
  const lit = color('#766662');
  const boss = color('#1e1616');
  const image = createImage(size, size);
  fillEllipse(image, 5.5, 5.5, 5.5, 5.5, (u, v, e) => {
    if (e > 0.82) return rim;
    if (e < 0.3) return boss;
    return u + v < -0.5 ? lit : iron;
  });
  return image;
}
