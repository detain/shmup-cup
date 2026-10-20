#!/usr/bin/env node
/**
 * Draws the ingest tool's **synthetic** test fixtures — no art-round image is ever a fixture.
 * Each picture imitates one thing the art bible's §8 measured on the real generated images:
 *
 * | File | Imitates |
 * |---|---|
 * | `sources/drone-sheet.png` | a PNG **sheet** (2 × 2 cells) on the models' yellowish key (median `#3cf102`, ±6 noise), with a candidate sidecar `drone-sheet.json` in `gen-candidate.mjs`'s format |
 * | `sources/gyre.jpg` | a **JPEG** subject with **enclosed holes** (key seen between the spokes of a ring) |
 * | `sources/fringe.png` | a hull with a **green fringe** along its outline, and a key-green window fully inside it (the green capsule's glass: must survive) |
 * | `sources/far.png` | an opaque far backdrop, too bright for the lighting budget, with a band painted in the fixture stage's palette-cycle ramp and a near miss of it |
 * | `sources/glow.png` | a black-keyed additive glow |
 * | `sprites/enemies/drone.edit.png` | a hand-edit layer over the drone's ingested strip: one painted glint, one erased pixel |
 *
 * Integer maths and a seeded LCG only, so every run draws the same bytes (a test compares a
 * fresh run with the committed files).
 *
 * The R3-03.V4a tile fixtures (`makeTileFixtures`) join the sheet family: two 12-px tile
 * sheets, one flat-topped block per frame for the clip-to-mask mode and one already-runnable
 * set of column heights for the mask-from-art mode (the designed masks they are matched
 * against are the committed `tiles/fixture.tileset.json`).
 *
 *   node test/fixtures/make-fixtures.mjs [<output dir>]   (default: this folder)
 *
 * @module
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { encodePng } from '../../lib/codec.mjs';
import { createImage } from '../../lib/image.mjs';

/** @typedef {import('../../lib/image.mjs').Image} Image */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A seeded LCG (Numerical Recipes constants), exact in 32-bit integer maths.
 *
 * @param {number} seed - Start state.
 * @returns {() => number} Next value 0 … 2³² − 1.
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

/**
 * Fills an image with the models' yellowish key, with a little per-pixel noise.
 *
 * @param {Image} image - Target.
 * @param {number} seed - Noise seed.
 */
function fillKey(image, seed) {
  const next = lcg(seed);
  const d = image.data;
  for (let p = 0; p < d.length; p += 4) {
    const n = next();
    d[p] = 60 + ((n >>> 8) % 13) - 6;
    d[p + 1] = 241 + ((n >>> 16) % 13) - 6;
    d[p + 2] = 2 + ((n >>> 24) % 3);
    d[p + 3] = 255;
  }
}

/**
 * Sets one pixel (ignored outside the image).
 *
 * @param {Image} image - Target.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @param {number} c - `0xRRGGBB`.
 * @param {number} [a] - Alpha (default 255).
 */
function put(image, x, y, c, a = 255) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const p = (y * image.width + x) * 4;
  image.data[p] = (c >> 16) & 255;
  image.data[p + 1] = (c >> 8) & 255;
  image.data[p + 2] = c & 255;
  image.data[p + 3] = a;
}

/**
 * Fills a rectangle.
 *
 * @param {Image} image - Target.
 * @param {number} x - Left.
 * @param {number} y - Top.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {number} c - `0xRRGGBB`.
 */
function rect(image, x, y, w, h, c) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(image, i, j, c);
}

/**
 * The drone sheet: four 64×48 cells, an outlined steel body whose red eye moves per frame.
 *
 * @returns {Image} 128×96.
 */
function droneSheet() {
  const image = createImage(128, 96);
  fillKey(image, 0x5eed01);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * 64;
    const oy = Math.floor(k / 2) * 48;
    // Ellipse body (radii 24 × 16 around the cell centre), 4-px navy outline ring.
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = x - 32;
        const dy = y - 24;
        const outer = dx * dx * 256 + dy * dy * 576; // inside ⇔ < 24² · 16² = 147456
        if (outer >= 147456) continue;
        const innerDx = Math.abs(dx) + 4;
        const innerDy = Math.abs(dy) + 4;
        const ring = innerDx * innerDx * 256 + innerDy * innerDy * 576 >= 147456;
        let c = y < 20 ? 0x5a7090 : 0x3a4a68;
        if (y >= 12 && y < 16) c = 0xa8c0d8;
        put(image, ox + x, oy + y, ring ? 0x141428 : c);
      }
    }
    rect(image, ox + 16 + 8 * k, oy + 20, 8, 8, 0xff3050); // the eye, 8 px further each frame
    rect(image, ox + 3, oy + 20, 4, 8, 0xf08020); // a detached glow island (cleanup removes it)
  }
  return image;
}

/**
 * The gyre: a ring with four spokes and a hub; the key shows between the spokes.
 *
 * @returns {Image} 96×96.
 */
function gyre() {
  const image = createImage(96, 96);
  fillKey(image, 0x5eed02);
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const dx = x - 48;
      const dy = y - 48;
      const r2 = dx * dx + dy * dy;
      let c = -1;
      if (r2 < 40 * 40 && r2 >= 24 * 24) c = r2 >= 37 * 37 || r2 < 27 * 27 ? 0x1b1a2e : 0x4a6a8a;
      else if (r2 < 24 * 24 && (Math.abs(dx) < 4 || Math.abs(dy) < 4)) c = 0x4a6a8a;
      if (r2 < 9 * 9) c = r2 >= 6 * 6 ? 0x1b1a2e : 0xc0d0e0;
      if (c >= 0) put(image, x, y, c);
    }
  }
  return image;
}

/**
 * The fringed hull: an outlined rounded box, a 2-px dark-green fringe blended into the key
 * around it, and a key-green window enclosed by the hull.
 *
 * @returns {Image} 80×48.
 */
function fringe() {
  const image = createImage(80, 48);
  fillKey(image, 0x5eed03);
  // Fringe ring first (outline blended with key), then the hull over it.
  for (let y = 6; y < 42; y++) {
    for (let x = 6; x < 74; x++) {
      const edge = Math.min(x - 6, 73 - x, y - 6, 41 - y);
      if (edge < 2) put(image, x, y, edge === 0 ? 0x2c8a12 : 0x1e5a10);
    }
  }
  rect(image, 8, 8, 64, 32, 0x140c20);
  rect(image, 10, 10, 60, 28, 0x6a5a8a);
  rect(image, 10, 10, 60, 6, 0x9a8ab8);
  rect(image, 44, 20, 12, 8, 0x3cf102); // the enclosed "glass": key-green, but not background
  return image;
}

/**
 * The far layer: dusk bands too bright for the far-layer budget, a band in the fixture
 * stage's cycle ramp, and one band a hair off the ramp's first colour.
 *
 * @returns {Image} 192×108, opaque.
 */
function far() {
  const image = createImage(192, 108);
  const bands = [0xa0b8e0, 0x90a8d8, 0x7890c0, 0x6078a8, 0x486090];
  for (let y = 0; y < 108; y++) {
    for (let x = 0; x < 192; x++) {
      let c = bands[Math.min(4, Math.floor(y / 18))];
      if (y >= 90)
        c = [0x203850, 0x28486a, 0x305a84][Math.floor(x / 64)]; // the cycle ramp, exactly
      else if (y >= 84) c = 0x213951; // a near miss of the ramp's first colour
      put(image, x, y, c);
    }
  }
  rect(image, 150, 12, 3, 3, 0xffffff); // a star
  return image;
}

/**
 * The glow: a cyan radial falloff on black (additive art, bible §3.6).
 *
 * @returns {Image} 48×48, opaque (black is the key).
 */
function glow() {
  const image = createImage(48, 48);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const dx = x - 24;
      const dy = y - 24;
      const r2 = dx * dx + dy * dy;
      const v = r2 >= 400 ? 0 : Math.floor(((400 - r2) * 255) / 400);
      put(image, x, y, ((v >> 2) << 16) | (v << 8) | v);
    }
  }
  return image;
}

/**
 * The drone's hand-edit layer: transparent but for a white glint on frame 0 and one erased
 * pixel on frame 3 (the erase colour `#ff00ff`).
 *
 * @returns {Image} 64×12, the drone strip's size.
 */
function droneEdit() {
  const image = createImage(64, 12);
  put(image, 6, 3, 0xffffff);
  put(image, 48 + 8, 6, 0xff00ff);
  return image;
}

/**
 * Fills one column of a 12-px tile frame with a run anchored at the bottom or the top edge.
 *
 * @param {Image} image - Target sheet.
 * @param {number} x - Column.
 * @param {number} n - Run height (0 … 12).
 * @param {number} c - `0xRRGGBB`.
 * @param {boolean} fromTop - Measure the run from the top edge (a ceiling tile).
 */
function column(image, x, n, c, fromTop = false) {
  for (let k = 0; k < n; k++) put(image, x, fromTop ? k : 11 - k, c);
}

/**
 * The cliff sheet (V4a, clip-to-mask): seven 12×12 frames, every one a flat-topped opaque
 * block — taller than most designed masks — so the clip does the shaping. Frame 5 is the
 * `empty` deco and frame 6 no tile of the fixture tileset names; both must keep their art.
 *
 * @returns {Image} 84×12.
 */
function cliffSheet() {
  const image = createImage(84, 12);
  for (let f = 0; f < 7; f++) rect(image, f * 12, 0, 12, 12, f < 5 ? 0x5a7090 : f === 5 ? 0xa8c0d8 : 0xf08020);
  return image;
}

/**
 * The stack sheet (V4a, mask-from-art): six 12×12 frames whose columns are one run from the
 * anchor edge the fixture tileset gives them — frame 3 hangs from the ceiling — and whose
 * heights deliberately differ from the designed masks (that is the point of the mode), while
 * frame 0 matches it exactly. Frame 5 is again the `empty` deco, unmeasured.
 *
 * @returns {Image} 72×12.
 */
function stackSheet() {
  const image = createImage(72, 12);
  for (let c = 0; c < 12; c++) column(image, c, 12, 0x5a7090); // 0 block: all 12, as designed
  const ramp = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12];
  for (let c = 0; c < 12; c++) column(image, 12 + c, ramp[c], 0x4a6a8a); // 1 slope-up-ish
  for (let c = 0; c < 12; c++) column(image, 24 + c, 9, 0x3a4a68); // 2 flat shelf
  for (let c = 0; c < 12; c++) column(image, 36 + c, 6, 0x141428, true); // 3 overhang, ceiling
  const spike = [3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4];
  for (let c = 0; c < 12; c++) column(image, 48 + c, spike[c], 0x6a5a8a); // 4 hazard
  rect(image, 60, 0, 12, 12, 0xa8c0d8); // 5 deco, full block (empty: never measured)
  return image;
}

/** The synthetic candidate sidecar of the drone sheet (gen-candidate.mjs's shape). */
const DRONE_SIDECAR = {
  id: 'enemy/drone',
  slot: 'a',
  prompt:
    'SYNTHETIC FIXTURE — drawn by art-prompts/ingest/test/fixtures/make-fixtures.mjs, never generated',
  negative: '',
  model: 'flux2',
  seed: 4242,
  width: 128,
  height: 96,
  steps: 40,
  guidance: 3.5,
  generatedAt: '2026-10-16T00:00:00.000Z',
  label: 'drone sheet (synthetic test fixture)',
  source: 'images/20-enemies/fixture.json#drone-v1',
  file: 'art-prompts/ingest/test/fixtures/sources/drone-sheet.png',
  format: 'png',
  servedModel: 'black-forest-labs/FLUX.2-dev',
  mode: 'generate',
};

/**
 * Writes every fixture source into a folder.
 *
 * @param {string} out - The fixtures folder (it gets `sources/` and `sprites/`).
 * @returns {string[]} The files written, relative to `out`.
 */
export function makeFixtures(out) {
  /** @type {[string, Uint8Array | string][]} */
  const files = [
    ['sources/drone-sheet.png', encodePng(droneSheet())],
    ['sources/drone-sheet.json', `${JSON.stringify(DRONE_SIDECAR, null, 2)}\n`],
    [
      'sources/gyre.jpg',
      jpeg.encode({ data: Buffer.from(gyre().data), width: 96, height: 96 }, 92).data,
    ],
    ['sources/fringe.png', encodePng(fringe())],
    ['sources/far.png', encodePng(far())],
    ['sources/glow.png', encodePng(glow())],
    ['sprites/enemies/drone.edit.png', encodePng(droneEdit())],
  ];
  for (const [rel, bytes] of files) {
    const file = join(out, ...rel.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  return files.map(([rel]) => rel);
}

/**
 * Draws the two R3-03.V4a tile sheets (the `tiles/fixture.tileset.json`, the recipes and the
 * committed outputs are hand-written JSON, like every other recipe, not drawn here).
 *
 * @param {string} out - The fixtures folder (it gets `tiles/`).
 * @returns {string[]} The files written, relative to `out`.
 */
export function makeTileFixtures(out) {
  /** @type {[string, Uint8Array][]} */
  const files = [
    ['tiles/cliff-sheet.png', encodePng(cliffSheet())],
    ['tiles/stack-sheet.png', encodePng(stackSheet())],
  ];
  for (const [rel, bytes] of files) {
    const file = join(out, ...rel.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  return files.map(([rel]) => rel);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? HERE);
  for (const rel of [...makeFixtures(out), ...makeTileFixtures(out)]) console.log(`wrote ${rel}`);
}
