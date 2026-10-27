/**
 * The W15-A main weapon types' player shots `shots/flak`, `shots/rail`, `shots/drone`,
 * `shots/chain`, `shots/beacon` and the Sky Marker's beam column `shots/beacon-beam`: interim
 * pixel art drawn by the same kit as every other procedural sprite, so the atlas is byte-identical
 * on every machine (deterministic maths only — square roots and rounded line painters, no
 * `Math.sin` / `Math.random`).
 *
 * `shots/flak` — one 5×5 pellet of the Flak Cone (rim / body / core, like a round bullet).
 * `shots/rail` — the Rail Lance: frame 0 the bolt (a flat cyan lance the renderer tiles along the
 * shot's `length` at {@link LASER_SEGMENT_LENGTH}), frame 1 the two-tick muzzle flash at the head.
 * `shots/drone` — the Seeker Drone: eight 7×7 darts, frame `k` facing `k · 45°` clockwise on screen
 * from +x (the {@link DIRECTIONS_8} order the `turn` heading frames use).
 * `shots/chain` — the Chain Arc: frame 0 the bolt's zigzag spark, frame 1 a forked arc's hook.
 * `shots/beacon` — the Sky Marker: a 6×10 thrown stake, frame 0 with its lamp dark and frame 1
 * lit (the stuck marker blinks on `(age >> 2) % 2`).
 * `shots/beacon-beam` — the beam column: two 8×56 frames, frame 0 the burning core and frame 1 the
 * fade. It is the only `native` sprite here: at the build's art scale it draws at
 * `scaleLength(8) × scaleLength(56)` — 12×84 at 3/2, exactly `PLAYFIELD_H / 4`, the height core
 * `weapons` `STRIKE_BEAM_SEGMENTS` stacks four of (the column must cover the playfield, so its
 * art height tracks the frame, not an upscale of the v1 blob).
 *
 * Every other sprite is ordinary interim art: a build at an art scale ≠ 1 upscales it (the R4-P.P3
 * rule) until a real-art round replaces it.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { scaleLength } from '../interim.mjs';
import {
  DIRECTIONS_8,
  color,
  drawLine,
  fillEllipse,
  makeSprite,
  mix,
  withAlpha,
} from './common.mjs';

/** @typedef {import('../image.mjs').Rgba} Rgba */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

const black = color('#101018');
const white = color('#ffffff');

/**
 * A rim / body / core shading of one base colour (the bullet kit's recipe).
 *
 * @param {Rgba} base - Body colour.
 * @param {number} [coreTo] - How much white the core mixes in (default 0.75).
 * @returns {{ rim: Rgba, body: Rgba, core: Rgba }} The three-tone palette.
 */
function shade(base, coreTo = 0.75) {
  return { rim: mix(base, black, 0.68), body: base, core: mix(base, white, coreTo) };
}

/**
 * A round bullet-like pellet of the given palette (rim ring, body ring, core dot).
 *
 * @param {number} size - Frame side (odd).
 * @param {{ rim: Rgba, body: Rgba, core: Rgba }} palette - Shading.
 * @param {number} [edge] - Silhouette radius (default `(size − 1) / 2`).
 * @returns {import('../image.mjs').Image} The `size` × `size` frame.
 */
function ball(size, palette, edge = (size - 1) / 2) {
  const image = createImage(size, size);
  const c = (size - 1) / 2;
  fillEllipse(image, c, c, edge, edge, (_u, _v, e) =>
    e > 0.74 ? palette.rim : e > 0.4 ? palette.body : palette.core,
  );
  return image;
}

/** The Flak Cone's pellet (5×5, one frame). */
const FLAK_PALETTE = shade(color('#ffb040'));

/**
 * One Rail Lance frame pair (16×11 both, centred): frame 0 the bolt (a cyan lance the renderer
 * tiles along the shot's `length` at `LASER_SEGMENT_LENGTH`, its tip bright) and frame 1 the
 * two-tick muzzle flash star at the head.
 *
 * @returns {import('../image.mjs').Image[]} Two frames.
 */
function railFrames() {
  const p = shade(color('#70e0ff'), 0.85);
  const bolt = createImage(16, 11);
  drawLine(bolt, 1, 5, 13, 5, p.rim, 3);
  drawLine(bolt, 2, 5, 13, 5, p.body, 1);
  drawLine(bolt, 3, 5, 12, 5, p.core, 1);
  setPixel(bolt, 14, 5, p.core);
  setPixel(bolt, 15, 5, white);
  const flare = createImage(16, 11);
  drawLine(flare, 2, 5, 12, 5, p.core, 3);
  drawLine(flare, 7, 0, 7, 10, p.core, 3);
  fillEllipse(flare, 7, 5, 2.4, 2.4, (_u, _v, e) => (e > 0.8 ? p.body : white));
  return [bolt, flare];
}

/**
 * The Seeker Drone's eight facing frames: frame `k` points `k · 45°` clockwise on screen from +x
 * (the heading-octant order `core/weapons` writes into `frame`). A dart: a lime body line from its
 * tail to the tip, a bright nose and two swept fins at the tail.
 *
 * @returns {import('../image.mjs').Image[]} Eight 7×7 frames.
 */
function droneFrames() {
  const p = shade(color('#9fe860'));
  /** @type {import('../image.mjs').Image[]} */
  const frames = [];
  for (const [dc, ds] of DIRECTIONS_8) {
    const image = createImage(7, 7);
    const c = 3;
    const tx = c - Math.round(dc * 2);
    const ty = c - Math.round(ds * 2);
    const hx = c + Math.round(dc * 3);
    const hy = c + Math.round(ds * 3);
    // Fins: two pixels perpendicular to the body at the tail.
    const px = Math.round(ds * 2);
    const py = Math.round(dc * 2);
    setPixel(image, Math.min(6, Math.max(0, tx + px)), Math.min(6, Math.max(0, ty + py)), p.rim);
    setPixel(image, Math.min(6, Math.max(0, tx - px)), Math.min(6, Math.max(0, ty - py)), p.rim);
    drawLine(image, tx, ty, c + Math.round(dc * 2), c + Math.round(ds * 2), p.body, 3);
    drawLine(image, tx, ty, c + Math.round(dc * 2), c + Math.round(ds * 2), p.core, 1);
    setPixel(image, hx, hy, p.core);
    frames.push(image);
  }
  return frames;
}

/**
 * The Chain Arc's two frames: the bolt's zigzag spark and a forked arc's hook (9×5 both).
 *
 * @returns {import('../image.mjs').Image[]} Two frames.
 */
function chainFrames() {
  const p = shade(color('#c890ff'));
  const bolt = createImage(9, 5);
  drawLine(bolt, 0, 3, 2, 1, p.body, 2);
  drawLine(bolt, 2, 1, 4, 3, p.body, 2);
  drawLine(bolt, 4, 3, 6, 1, p.body, 2);
  drawLine(bolt, 6, 1, 8, 2, p.core, 2);
  setPixel(bolt, 8, 2, white);
  const hook = createImage(9, 5);
  drawLine(hook, 1, 4, 4, 2, p.body, 2);
  drawLine(hook, 4, 2, 7, 2, p.body, 2);
  drawLine(hook, 7, 2, 8, 0, p.core, 2);
  setPixel(hook, 8, 0, white);
  return [bolt, hook];
}

/**
 * The Sky Marker's two blink frames: a 6×10 thrown stake, lamp dark then lit (a lit frame gets a
 * bright head and two side sparks).
 *
 * @returns {import('../image.mjs').Image[]} Two frames.
 */
function beaconFrames() {
  const steel = shade(color('#9aa8c0'), 0.4);
  const lamp = shade(color('#ffe060'), 0.9);
  /** @type {import('../image.mjs').Image[]} */
  const frames = [];
  for (let lit = 0; lit < 2; lit++) {
    const image = createImage(6, 10);
    // The stake's body (rows 4…9) and its two fins.
    for (let y = 4; y < 10; y++) {
      setPixel(image, 2, y, steel.rim);
      setPixel(image, 3, y, y % 2 === 0 ? steel.body : steel.rim);
    }
    setPixel(image, 1, 8, steel.rim);
    setPixel(image, 4, 8, steel.rim);
    // The lamp head (rows 0…3).
    fillEllipse(image, 2.5, 2, 2.2, 2.2, (_u, _v, e) =>
      e > 0.8 ? steel.rim : lit ? lamp.core : lamp.body,
    );
    if (lit) {
      setPixel(image, 0, 2, lamp.rim);
      setPixel(image, 5, 2, lamp.rim);
    }
    frames.push(image);
  }
  return frames;
}

/**
 * The beam column's two frames (`shots/beacon-beam`): the burning core and the fade, drawn at the
 * build's art scale — 8×56 at scale 1, 12×84 at 3/2 (native, exactly a quarter playfield height).
 *
 * @param {number} artScale - The build's art scale.
 * @returns {import('../image.mjs').Image[]} Two frames.
 */
function beamFrames(artScale) {
  const p = shade(color('#ffe8a0'), 0.9);
  const width = scaleLength(8, artScale);
  const height = scaleLength(56, artScale);
  const c = (width - 1) / 2;
  const core = createImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.abs(x - c);
      setPixel(core, x, y, d < 1 ? white : d < 2 ? p.core : d < 3 ? p.body : p.rim);
    }
  }
  const fade = createImage(width, height);
  const dim = withAlpha(mix(p.body, black, 0.35), 140);
  const thin = withAlpha(p.core, 190);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.abs(x - c);
      setPixel(fade, x, y, d < 1 ? thin : d < 2 ? dim : withAlpha(p.rim, 90));
    }
  }
  return [core, fade];
}

/**
 * Generates the W15-A weapons' sprites.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - `artScale`, the art scale to draw
 *   the beam column at (default 1 — only the beam is scale-aware; the rest is v1 interim art).
 * @returns {SpriteDef[]} Six sprites: `shots/flak` (1 frame), `shots/rail` (2), `shots/drone` (8),
 *   `shots/chain` (2), `shots/beacon` (2) and `shots/beacon-beam` (2, `native` at a non-unit scale).
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`, reached through `scaleLength`).
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  const v2 = artScale !== 1;
  return [
    makeSprite('shots/flak', [ball(5, FLAK_PALETTE)], 'shots'),
    makeSprite('shots/rail', railFrames(), 'shots'),
    makeSprite('shots/drone', droneFrames(), 'shots'),
    makeSprite('shots/chain', chainFrames(), 'shots'),
    makeSprite('shots/beacon', beaconFrames(), 'shots'),
    makeSprite('shots/beacon-beam', beamFrames(artScale), 'shots', { native: v2 }),
  ];
}
