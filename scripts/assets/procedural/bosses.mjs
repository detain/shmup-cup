/**
 * Boss parts for the advanced bosses of plan M2-09 (placeholder art, decision D24):
 *
 * - `bosses/turret` (16×16, 16 heading frames): a round armoured base with a barrel pointing at
 *   `frame × 22.5°` (clockwise from +x) — a turned part's heading frames (`turn: 16`), so a raid
 *   battleship's turrets visibly aim.
 * - `bosses/orb` (12×12, 2 frames): a round armour orb with a pulsing highlight — round art for
 *   rotating arms and rings of pods (turned parts are drawn unrotated).
 * - `bosses/raid-hull` (96×40): one riveted hull section of a battleship larger than the screen;
 *   sections side by side make its body.
 * - `bosses/captain-shell` (28×20, 2 frames): a mid-boss's rounded carapace with a glowing eye
 *   slit (the eye blinks).
 *
 * Every sprite has a hit-flash sibling. Geometry uses only `+ - * /` and `Math.sqrt` (the
 * headings come from {@link DIRECTIONS_8}), rivets from the seeded `hash2`, so the pixels are
 * identical on every engine.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { DIRECTIONS_8, color, mix, makeSprite, seedOf } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * The 16 headings `k × 22.5°` (k = 0…15), clockwise on screen from +x.
 *
 * @type {readonly (readonly [number, number])[]}
 */
const DIRECTIONS_16 = [...DIRECTIONS_8, ...DIRECTIONS_8.map(([c, s]) => [-c, -s])];

/**
 * Draws the turret's frames: base disc (rim, body, lit rim on the upper left), then the barrel
 * — a 3-px line of length 7 from the centre along the frame's heading with a bright muzzle.
 *
 * @returns {Image[]} Sixteen frames.
 */
function turretFrames() {
  const size = 16;
  const c = (size - 1) / 2;
  const rim = color('#1a2030');
  const body = color('#5a6078');
  const lit = color('#9aa4c0');
  const barrel = color('#c8d0e0');
  const muzzle = color('#f8d030');
  return DIRECTIONS_16.map(([dx, dy]) => {
    const image = createImage(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x - c;
        const v = y - c;
        const d = Math.sqrt(u * u + v * v);
        if (d > 6) continue;
        if (d > 5) setPixel(image, x, y, rim);
        else setPixel(image, x, y, u + v < -3 ? lit : body);
      }
    }
    for (let t = 0; t <= 7; t += 0.5) {
      const px = c + dx * t;
      const py = c + dy * t;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox * ox + oy * oy > 1) continue;
          const x = Math.round(px + ox);
          const y = Math.round(py + oy);
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          setPixel(image, x, y, t >= 6.5 ? muzzle : barrel);
        }
      }
    }
    return image;
  });
}

/**
 * Draws the armour orb's two frames: a shaded sphere (dark rim, teal body, highlight dot that
 * grows in frame 1).
 *
 * @returns {Image[]} Two frames.
 */
function orbFrames() {
  const size = 12;
  const c = (size - 1) / 2;
  const rim = color('#102830');
  const dark = color('#1f6a70');
  const light = color('#5ad0c8');
  const shine = color('#e8fff8');
  return [1.2, 2].map((spot) => {
    const image = createImage(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x - c;
        const v = y - c;
        const d = Math.sqrt(u * u + v * v);
        if (d > 5.6) continue;
        if (d > 4.7) {
          setPixel(image, x, y, rim);
          continue;
        }
        const hx = u + 1.6;
        const hy = v + 1.6;
        const h = Math.sqrt(hx * hx + hy * hy);
        setPixel(image, x, y, h < spot ? shine : mix(light, dark, Math.min(1, h / 7)));
      }
    }
    return image;
  });
}

/**
 * Draws one raid hull section: a steel block with a dark outline, horizontal panel seams, a lit
 * top edge, seeded rivets and a row of lit windows.
 *
 * @returns {Image} The frame.
 */
function hullFrame() {
  const w = 96;
  const h = 40;
  const seed = seedOf('bosses/raid-hull');
  const outline = color('#0e1220');
  const steel = color('#46506a');
  const shade = color('#343c52');
  const top = color('#8a96b4');
  const seam = color('#262c3e');
  const rivet = color('#a8b2cc');
  const window = color('#f8d030');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        setPixel(image, x, y, outline);
      } else if (y <= 2) {
        setPixel(image, x, y, top);
      } else if (y === 13 || y === 27 || x % 24 === 0) {
        setPixel(image, x, y, seam);
      } else if (y > 30) {
        setPixel(image, x, y, shade);
      } else if (y >= 18 && y <= 21 && x % 8 >= 2 && x % 8 <= 4) {
        setPixel(image, x, y, window);
      } else {
        const r = hash2(x, y, seed) / 4294967296;
        setPixel(image, x, y, (y === 6 || y === 34) && x % 6 === 3 && r < 0.9 ? rivet : steel);
      }
    }
  }
  return image;
}

/**
 * Draws the captain's carapace: a rounded shell (ellipse), darker rim, ridge lines and an eye slit
 * — lit red in frame 0, dim in frame 1.
 *
 * @returns {Image[]} Two frames.
 */
function shellFrames() {
  const w = 28;
  const h = 20;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const a = w / 2 - 0.5;
  const b = h / 2 - 0.5;
  const rim = color('#3a1408');
  const shell = color('#c8581c');
  const ridge = color('#8a3410');
  const top = color('#f89850');
  return [color('#ff3030'), color('#801818')].map((eye) => {
    const image = createImage(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x - cx) / a;
        const v = (y - cy) / b;
        const e = Math.sqrt(u * u + v * v);
        if (e > 1) continue;
        if (e > 0.86) setPixel(image, x, y, rim);
        else if (y >= 8 && y <= 10 && x >= 4 && x <= 11) setPixel(image, x, y, eye);
        else if ((x - 2) % 7 === 0) setPixel(image, x, y, ridge);
        else setPixel(image, x, y, v < -0.45 ? top : shell);
      }
    }
    return image;
  });
}

/**
 * Generates the advanced boss parts.
 *
 * @returns {SpriteDef[]} `bosses/turret`, `bosses/orb`, `bosses/raid-hull`, `bosses/captain-shell`.
 */
export function generate() {
  return [
    makeSprite('bosses/turret', turretFrames(), 'bosses', { hitFlash: true }),
    makeSprite('bosses/orb', orbFrames(), 'bosses', {
      hitFlash: true,
      animations: { pulse: [0, 1] },
    }),
    makeSprite('bosses/raid-hull', [hullFrame()], 'bosses', { hitFlash: true }),
    makeSprite('bosses/captain-shell', shellFrames(), 'bosses', {
      hitFlash: true,
      animations: { blink: [0, 1] },
    }),
  ];
}
