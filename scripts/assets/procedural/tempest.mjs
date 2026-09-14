/**
 * Zone E, **TEMPEST RIDGE** (plan M2-12) — placeholder art of the storm-over-mountains zone
 * (decision D24):
 *
 * - `bg/storm-clouds` ({@link CLOUDS_TILE_W}×{@link CLOUDS_TILE_H}, the far band): a heavy deck of
 *   storm clouds painted **only** in the four colours of {@link STORM_RAMP} (so the stage's palette
 *   cycle makes it roil), open sky between the billows; the billows wrap round the tile edge, so
 *   the band repeats seamlessly.
 * - `bg/storm-ridge` ({@link RIDGE_TILE_W}×{@link RIDGE_TILE_H}, a mid band): jagged mountain
 *   silhouettes with snow on their crests — saw-tooth profiles whose periods divide the tile width.
 * - `bg/storm-rain` ({@link RAIN_TILE_W}×{@link RAIN_TILE_H}, the near weather band): translucent
 *   slanting rain streaks, placed on a wrapped grid so the tile repeats seamlessly both ways.
 * - Enemies (flying ones face left — the renderer flips one that flies right; hit-flash
 *   siblings): `enemies/hail-drifter` (a hailstone with frost spikes, 2 frames),
 *   `enemies/gale-kite` (a delta-wing glider, its tail streamer flapping, 2 frames),
 *   `enemies/squall-jumper` (a swept-wing jet that attacks from behind, its jet flickering, 2
 *   frames), `enemies/crag-turret` (a granite dome with a pale barrel eye), `enemies/thunderhead`
 *   (a small storm cloud with lightning flickering inside, 3 frames), `enemies/steed-foal` (SQUALL
 *   STEED's homing mini, a little seahorse, 2 frames).
 * - SQUALL STEED (SS-05), the seahorse: `bosses/steed-body` (the plated trunk), `bosses/steed-head`
 *   (the head with its crown and eye), `bosses/steed-snout` (the tube snout — a gun),
 *   `bosses/steed-chest` (the glowing hatch — the weak point, 2 frames), `bosses/steed-lid-top` /
 *   `-bottom` (the chest's lids, mirrors), `bosses/steed-tail` (the curled tail),
 *   `bosses/steed-fin` (the dorsal fin, rippling, 2 frames).
 *
 * Slate blues and greys with pale yellow lightning — low in saturation next to the pink / red /
 * purple bullets and the capsules (shmup_feat.md §12, §18). Geometry uses only `+ - * /` and
 * `Math.sqrt`, randomness the seeded asset RNG and `hash2` (seeded from the sprite names), so the
 * pixels are identical on every engine.
 *
 * **Public API.** {@link generate}, {@link TEMPEST_SPRITES}, {@link STORM_RAMP} (the colours zone
 * E's palette cycle must name), {@link CLOUDS_TILE_W} / {@link CLOUDS_TILE_H},
 * {@link RIDGE_TILE_W} / {@link RIDGE_TILE_H}, {@link RAIN_TILE_W} / {@link RAIN_TILE_H} (the
 * bands' tile sizes, their parallax `spacing`).
 *
 * @module
 */
import { createImage, flipVertical, setPixel } from '../image.mjs';
import { createAssetRng, hash2 } from '../rng.mjs';
import { color, drawLine, fillEllipse, makeSprite, mix, seedOf, withAlpha } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Width of the `bg/storm-clouds` tile (its parallax `spacing`). */
export const CLOUDS_TILE_W = 128;

/** Height of the `bg/storm-clouds` tile. */
export const CLOUDS_TILE_H = 56;

/** Width of the `bg/storm-ridge` tile (its parallax `spacing`). */
export const RIDGE_TILE_W = 128;

/** Height of the `bg/storm-ridge` tile. */
export const RIDGE_TILE_H = 48;

/** Width of the `bg/storm-rain` tile (its parallax `spacing`). */
export const RAIN_TILE_W = 64;

/** Height of the `bg/storm-rain` tile. */
export const RAIN_TILE_H = 64;

/**
 * The storm clouds' four colours, dark → light — the exact colours zone E's palette cycle names
 * (`content/stages/zone-e.stage.json`).
 */
export const STORM_RAMP = Object.freeze(['#1c2230', '#262e40', '#323c52', '#46526a']);

/** The sprites this generator draws, in order. */
export const TEMPEST_SPRITES = Object.freeze([
  'bg/storm-clouds',
  'bg/storm-ridge',
  'bg/storm-rain',
  'enemies/hail-drifter',
  'enemies/gale-kite',
  'enemies/squall-jumper',
  'enemies/crag-turret',
  'enemies/thunderhead',
  'enemies/steed-foal',
  'bosses/steed-body',
  'bosses/steed-head',
  'bosses/steed-snout',
  'bosses/steed-chest',
  'bosses/steed-lid-top',
  'bosses/steed-lid-bottom',
  'bosses/steed-tail',
  'bosses/steed-fin',
]);

/**
 * Generates zone E's art.
 *
 * @returns {SpriteDef[]} The sprites of {@link TEMPEST_SPRITES}, in that order.
 */
export function generate() {
  const flash = { hitFlash: true };
  const lid = lidFrame();
  return [
    makeSprite('bg/storm-clouds', [clouds()], 'tempest', { anchor: [0, 0] }),
    makeSprite('bg/storm-ridge', [ridge()], 'tempest', { anchor: [0, 0] }),
    makeSprite('bg/storm-rain', [rain()], 'tempest', { anchor: [0, 0] }),
    makeSprite('enemies/hail-drifter', [hailFrame(0), hailFrame(1)], 'tempest', {
      hitFlash: true,
      animations: { spin: [0, 1] },
    }),
    makeSprite('enemies/gale-kite', [kiteFrame(-1), kiteFrame(1)], 'tempest', {
      hitFlash: true,
      animations: { flap: [0, 1] },
    }),
    makeSprite('enemies/squall-jumper', [jumperFrame(1), jumperFrame(2)], 'tempest', {
      hitFlash: true,
      animations: { burn: [0, 1] },
    }),
    makeSprite('enemies/crag-turret', [turretFrame()], 'tempest', flash),
    makeSprite('enemies/thunderhead', [0, 1, 2].map(thunderFrame), 'tempest', {
      hitFlash: true,
      animations: { flicker: [0, 1, 2] },
    }),
    makeSprite('enemies/steed-foal', [foalFrame(0), foalFrame(1)], 'tempest', {
      hitFlash: true,
      animations: { swim: [0, 1] },
    }),
    makeSprite('bosses/steed-body', [bodyFrame()], 'tempest', flash),
    makeSprite('bosses/steed-head', [headFrame()], 'tempest', flash),
    makeSprite('bosses/steed-snout', [snoutFrame()], 'tempest', flash),
    makeSprite('bosses/steed-chest', [chestFrame('#f0d870'), chestFrame('#a8e0f0')], 'tempest', {
      hitFlash: true,
      animations: { glow: [0, 1] },
    }),
    makeSprite('bosses/steed-lid-top', [lid], 'tempest', flash),
    makeSprite('bosses/steed-lid-bottom', [flipVertical(lid)], 'tempest', flash),
    makeSprite('bosses/steed-tail', [tailFrame()], 'tempest'),
    makeSprite('bosses/steed-fin', [finFrame(0), finFrame(1)], 'tempest', {
      animations: { ripple: [0, 1] },
    }),
  ];
}

/**
 * The cloud deck: seeded billows (wrapped round the tile's width) whose density picks one of the
 * {@link STORM_RAMP} colours — denser is lighter, the billows' lit tops — and leaves thin places
 * open to the sky. Every painted pixel is opaque and a ramp colour.
 *
 * @returns {Image} The tile.
 */
function clouds() {
  const w = CLOUDS_TILE_W;
  const h = CLOUDS_TILE_H;
  const rng = createAssetRng(seedOf('bg/storm-clouds'));
  const ramp = STORM_RAMP.map(color);
  /** @type {{ x: number, y: number, r: number }[]} */
  const billows = [];
  for (let i = 0; i < 18; i++) {
    billows.push({
      x: rng.rangeInt(0, w - 1),
      y: rng.rangeInt(8, h - 14),
      r: rng.rangeInt(10, 20),
    });
  }
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let density = 0;
      let lit = 0;
      for (const billow of billows) {
        let dx = Math.abs(x - billow.x);
        if (dx > w / 2) dx = w - dx;
        const dy = y - billow.y;
        const d = (dx * dx + dy * dy) / (billow.r * billow.r);
        if (d < 1) {
          density += 1 - d;
          // The upper half of a billow catches the light.
          if (dy < 0) lit += (1 - d) * (-dy / billow.r);
        }
      }
      // The deck thins out towards its bottom rows.
      const fade = (h - 1 - y) / 12;
      density *= fade < 1 ? fade : 1;
      if (density < 0.35) continue;
      let k = density > 1.4 ? 2 : density > 0.8 ? 1 : 0;
      if (lit > 0.45) k = 3;
      setPixel(image, x, y, ramp[k]);
    }
  }
  return image;
}

/**
 * The ridge band: two ranges of saw-tooth peaks (periods 64 / 32 and 128 / 16 px — they divide the
 * tile width), the far one darker, the near one with snow on its crests.
 *
 * @returns {Image} The tile.
 */
function ridge() {
  const w = RIDGE_TILE_W;
  const h = RIDGE_TILE_H;
  const far = color('#242a38');
  const near = color('#303848');
  const snow = color('#a8b4c4');
  const image = createImage(w, h);
  for (let x = 0; x < w; x++) {
    const farTop = Math.round(4 + 18 * saw(x + 10, 64) + 6 * saw(x, 32));
    const nearTop = Math.round(16 + 16 * saw(x + 40, 128) + 5 * saw(x + 3, 16));
    for (let y = farTop; y < h; y++) setPixel(image, x, y, far);
    for (let y = nearTop; y < h; y++) setPixel(image, x, y, y - nearTop < 2 ? snow : near);
  }
  return image;
}

/**
 * A saw-tooth "mountain" wave of a whole-pixel period: 0 at the peaks, 1 in the valleys, rising
 * steeply and falling gently.
 *
 * @param {number} x - Column.
 * @param {number} period - Period in pixels.
 * @returns {number} 0 … 1.
 */
function saw(x, period) {
  const t = (x % period) / period;
  return t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
}

/**
 * The rain band: short slanting streaks (two pixels down for one to the left) on a wrapped grid of
 * seeded starts, translucent pale blue.
 *
 * @returns {Image} The tile.
 */
function rain() {
  const w = RAIN_TILE_W;
  const h = RAIN_TILE_H;
  const seed = seedOf('bg/storm-rain');
  const drop = color('#9ab0cc');
  const image = createImage(w, h);
  for (let i = 0; i < 26; i++) {
    const sx = hash2(i, 0, seed) % w;
    const sy = hash2(i, 1, seed) % h;
    const length = 5 + (hash2(i, 2, seed) % 5);
    const alpha = 70 + (hash2(i, 3, seed) % 60);
    for (let k = 0; k < length; k++) {
      const x = (((sx - Math.floor(k / 2)) % w) + w) % w;
      const y = (sy + k) % h;
      setPixel(image, x, y, withAlpha(drop, alpha));
    }
  }
  return image;
}

/**
 * A hailstone: a pale icy ball with four frost spikes; the spikes turn 45° and the highlight moves
 * between the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function hailFrame(frame) {
  const size = 10;
  const c = 4.5;
  const rim = color('#5a6a80');
  const ice = color('#b8c8dc');
  const shine = color('#f0f8ff');
  const spike = color('#8aa0ba');
  const image = createImage(size, size);
  const dirs =
    frame === 0
      ? [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]
      : [
          [0.7, -0.7],
          [0.7, 0.7],
          [-0.7, 0.7],
          [-0.7, -0.7],
        ];
  for (const [dx, dy] of dirs)
    drawLine(image, c + dx * 2.5, c + dy * 2.5, c + dx * 4.5, c + dy * 4.5, spike);
  fillEllipse(image, c, c, 3.2, 3.2, (u, v, e) => {
    if (e > 0.8) return rim;
    if (u + v < -0.6 - frame * 0.2) return shine;
    return ice;
  });
  return image;
}

/**
 * The gale kite: a pale delta wing pointing left with a dark spine, its tail streamer up (`tail`
 * −1) or down (+1).
 *
 * @param {number} tail - −1 or 1.
 * @returns {Image} The frame.
 */
function kiteFrame(tail) {
  const w = 16;
  const h = 10;
  const wing = color('#8a9ab0');
  const lit = color('#c0ccda');
  const spine = color('#2a3240');
  const streamer = color('#d8c060');
  const image = createImage(w, h);
  for (let x = 1; x < 12; x++) {
    const half = (x * 4.2) / 11;
    for (let y = Math.round(4.5 - half); y <= Math.round(4.5 + half); y++) {
      setPixel(image, x, y, y < 4.5 ? lit : wing);
    }
  }
  drawLine(image, 1, 4.5, 11, 4.5, spine);
  drawLine(image, 11, 4.5, 15, 4.5 + 2.5 * tail, streamer);
  return image;
}

/**
 * The squall jumper: a slate swept-wing jet pointing left with a canopy and a jet flame of
 * `flame` px behind its tail (x 14 on; the fuselage and the wings cover everything left of it, so
 * the flame must differ there for the two frames to flicker).
 *
 * @param {number} flame - Flame length in pixels (1 or 2).
 * @returns {Image} The frame.
 */
function jumperFrame(flame) {
  const w = 16;
  const h = 9;
  const hull = color('#6a7890');
  const lit = color('#9aa8bc');
  const wing = color('#4e5a6e');
  const canopy = color('#a8e0f0');
  const jet = color('#f0d870');
  const image = createImage(w, h);
  drawLine(image, 14, 4, 13 + flame, 4, jet);
  // Swept wings: triangles from the middle of the fuselage back to the tail.
  for (let x = 6; x <= 12; x++) {
    const half = Math.round(((x - 6) * 4) / 6);
    for (let y = 4 - half; y <= 4 + half; y++) setPixel(image, x, y, wing);
  }
  fillEllipse(image, 6.5, 4, 6.5, 2, (_u, v) => (v < -0.3 ? lit : hull));
  setPixel(image, 4, 3, canopy);
  setPixel(image, 5, 3, canopy);
  return image;
}

/**
 * The crag turret: a granite dome on a floor with a pale eye and a short barrel.
 *
 * @returns {Image} The frame.
 */
function turretFrame() {
  const w = 14;
  const h = 11;
  const rim = color('#1c222c');
  const stone = color('#4a5260');
  const lit = color('#6c7686');
  const eye = color('#c8e8f8');
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
 * A thunderhead: a small dark storm cloud (three billows) with a jagged bolt of lightning inside —
 * bright in frame 0, dim in frame 1, gone in frame 2.
 *
 * @param {number} frame - 0, 1 or 2.
 * @returns {Image} The frame.
 */
function thunderFrame(frame) {
  const w = 22;
  const h = 14;
  const dark = color('#2a3040');
  const mid = color('#3e4860');
  const lit = color('#5a6680');
  const bolt = frame === 0 ? color('#f8f0a0') : color('#a09860');
  const image = createImage(w, h);
  const paint = (/** @type {number} */ _u, /** @type {number} */ v) => (v < -0.4 ? lit : mid);
  fillEllipse(image, 6, 8, 6, 5, paint);
  fillEllipse(image, 12, 6, 7, 6, paint);
  fillEllipse(image, 17, 8.5, 4.5, 4.5, paint);
  for (let x = 1; x < w - 1; x++) setPixel(image, x, 12, dark);
  if (frame < 2) {
    drawLine(image, 12, 3, 10, 7, bolt);
    drawLine(image, 10, 7, 13, 8, bolt);
    drawLine(image, 13, 8, 11, 12, bolt);
  }
  return image;
}

/**
 * A steed foal: a little slate seahorse facing left, its tail curling one way or the other.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function foalFrame(frame) {
  const w = 8;
  const h = 10;
  const body = color('#6a7a90');
  const lit = color('#a0b0c4');
  const eye = color('#f0d870');
  const image = createImage(w, h);
  fillEllipse(image, 4, 2.5, 2.5, 2.2, (_u, v) => (v < -0.3 ? lit : body));
  drawLine(image, 2, 2.5, 0, 3, body);
  fillEllipse(image, 4.5, 5.5, 2, 2.2, () => body);
  drawLine(image, 5, 7, 4 + frame * 2, 9, body);
  setPixel(image, 3, 2, eye);
  return image;
}

/**
 * SQUALL STEED's trunk: a tall curved body of slate plates (lighter belly rings on the left, a
 * dark back on the right), narrowing towards the tail.
 *
 * @returns {Image} The frame.
 */
function bodyFrame() {
  const w = 30;
  const h = 54;
  const rim = color('#141a24');
  const plate = color('#3c4658');
  const back = color('#2c3444');
  const belly = color('#8a98ac');
  const ring = color('#5e6a80');
  const image = createImage(w, h);
  fillEllipse(image, 15, 24, 14.5, 26, (u, v, e, _x, y) => {
    // Narrow towards the tail: cut the lower flanks.
    if (v > 0.3 && Math.abs(u) > 1.25 - v) return null;
    if (e > 0.9) return rim;
    if (u < -0.35) return y % 5 === 0 ? ring : belly;
    return u > 0.45 ? back : plate;
  });
  for (let y = 8; y < h - 8; y += 7) drawLine(image, 9, y, 22, y + 1, rim);
  return image;
}

/**
 * SQUALL STEED's head: a slate head facing left with a crown of three pale spikes, a glowing eye
 * and a lit brow.
 *
 * @returns {Image} The frame.
 */
function headFrame() {
  const w = 26;
  const h = 20;
  const rim = color('#141a24');
  const skin = color('#46526a');
  const lit = color('#6e7c94');
  const crown = color('#c0ccda');
  const eye = color('#f0d870');
  const image = createImage(w, h);
  for (let k = 0; k < 3; k++) drawLine(image, 10 + k * 5, 6, 12 + k * 5, 0, crown, 2);
  fillEllipse(image, 13, 12, 11.5, 7.5, (u, v, e) => {
    if (e > 0.88) return rim;
    return v < -0.35 ? lit : skin;
  });
  fillEllipse(image, 9, 10, 1.8, 1.8, () => eye);
  return image;
}

/**
 * SQUALL STEED's snout: a tube pointing left with a dark mouth at its tip.
 *
 * @returns {Image} The frame.
 */
function snoutFrame() {
  const w = 16;
  const h = 9;
  const rim = color('#141a24');
  const tube = color('#56627a');
  const lit = color('#7e8ca4');
  const mouth = color('#0c1018');
  const image = createImage(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w; x++) {
      const edge = y === 1 || y === h - 2;
      setPixel(image, x, y, edge ? rim : y < 4 ? lit : tube);
    }
  }
  for (let y = 2; y <= 6; y++) setPixel(image, 0, y, rim);
  for (let y = 3; y <= 5; y++) setPixel(image, 1, y, mouth);
  return image;
}

/**
 * SQUALL STEED's chest hatch: a glowing oval (`tone` at its heart) in a dark socket.
 *
 * @param {string} tone - The heart's colour.
 * @returns {Image} The frame.
 */
function chestFrame(tone) {
  const w = 16;
  const h = 22;
  const socket = color('#10141c');
  const glow = mix(color('#5a7aa0'), color(tone), 0.5);
  const heart = color(tone);
  const image = createImage(w, h);
  fillEllipse(image, 7.5, 10.5, 7.5, 10.5, (_u, _v, e) => {
    if (e > 0.86) return socket;
    return e > 0.45 ? glow : heart;
  });
  return image;
}

/**
 * The upper chest lid: a curved slate plate; the lower lid is its vertical mirror.
 *
 * @returns {Image} The frame.
 */
function lidFrame() {
  const w = 12;
  const h = 7;
  const rim = color('#141a24');
  const plate = color('#5e6a80');
  const lit = color('#8a98ac');
  const image = createImage(w, h);
  fillEllipse(image, 6, 6, 6, 6, (_u, v, e) => {
    if (e > 0.85) return rim;
    return v < -0.55 ? lit : plate;
  });
  return image;
}

/**
 * SQUALL STEED's tail: a thick tapering curl of slate rings (decoration — never hit).
 *
 * @returns {Image} The frame.
 */
function tailFrame() {
  const w = 22;
  const h = 26;
  const tone = color('#3c4658');
  const ring = color('#5e6a80');
  const image = createImage(w, h);
  // A spiral: dots along a curve whose radius shrinks as it turns.
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    // A square-root spiral from rational points on the unit circle (no trigonometry).
    const q = t * 4;
    const k = Math.floor(q);
    const f = q - k;
    const corners = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    const ax = corners[k][0] + (corners[k + 1][0] - corners[k][0]) * f;
    const ay = corners[k][1] + (corners[k + 1][1] - corners[k][1]) * f;
    const len = Math.sqrt(ax * ax + ay * ay);
    const r = 9 * (1 - t * 0.75);
    const x = 11 + (ax / len) * r;
    const y = 14 + (ay / len) * r - (1 - t) * 4;
    const width = 4 - t * 2.5;
    fillEllipse(image, x, y, width, width, () => (i % 6 === 0 ? ring : tone));
  }
  return image;
}

/**
 * SQUALL STEED's dorsal fin: a translucent pale fan of rays on its back, rippling a pixel between
 * the frames.
 *
 * @param {number} frame - 0 or 1.
 * @returns {Image} The frame.
 */
function finFrame(frame) {
  const w = 12;
  const h = 30;
  const membrane = color('#8a9ab0');
  const ray = color('#c0ccda');
  const image = createImage(w, h);
  for (let y = 2; y < h - 2; y++) {
    const reach = Math.round(2 + 8 * Math.sqrt(1 - ((y - 15) / 13) * ((y - 15) / 13)));
    const shift = (y + frame) % 4 < 2 ? 0 : 1;
    for (let x = 0; x < reach + shift && x < w; x++) {
      setPixel(image, x, y, y % 4 === 0 ? ray : withAlpha(membrane, 170));
    }
  }
  return image;
}
