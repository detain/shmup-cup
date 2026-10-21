/**
 * The R3-06 decor sprites, drawn at the final v2 pixel size (`native`, plan R2-01/W4-5): the
 * animated parallax bands `decor/cloud-band` (two frames) and `decor/ridge-band` (two frames)
 * for a stage's `parallax` list with `frames` / `frameTicks`, the plain far band
 * `decor/circuit-band`, the fore band `decor/frond-band` (translucent fronds, the only `fore`
 * layer of the decor-range stage), the back prop `decor/pillar`, and the three additive glow
 * sprites `fx/glow-ember` (an enemy's halo), `fx/glow-vent` (a boss part's exhaust) and
 * `fx/glow-lantern` (a decor entry's lamp). Band strips are 256 px wide (double v1's 128-px star
 * tile — a deliberate tiling width, so the wrap maths stays whole at every internal column) and
 * tile at the `spacing: 256` the stage names. Every solid colour is pushed at least
 * three channels away from all eight reserved palette-cycle ramps by `v2kit.offRamp`, so the
 * strips sit in a stage's frame-cycled picture without tripping
 * `test/integration/palette-cycle-scan.test.ts`. The generator yields nothing at the interim
 * scale (the default) — the v2-only art appears once a build asks for `artScale: 1`.
 *
 * Determinism: shapes come from integer maths only (no `Math.sin` family — the exact-rounding
 * rule of § Engine foundations), seeded per sprite name through `seedOf`, so the packed atlas is
 * byte-identical on every machine whatever order the pipeline walks the generators in.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { createAssetRng } from '../rng.mjs';
import { color, makeSprite, seedOf } from './common.mjs';
import { offRamp } from '../v2kit.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Band strip width in final v2 pixels — the `spacing` every band names. */
const BAND_W = 256;

/**
 * Generates the decor sprites.
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's options; the sprites
 *   are drawn at the art's final v2 size, so the interim build (`artScale` 1 or absent — W4-5)
 *   gets none of them and `native` output arrives with the v2 art round.
 * @returns {SpriteDef[]} The eight decor and glow sprites at the v2 scale, none at the interim.
 */
export function generate(options = {}) {
  if ((options.artScale ?? 1) === 1) return [];

  /** @type {SpriteDef[]} */
  const sprites = [];
  sprites.push(cloudBand());
  sprites.push(ridgeBand());
  sprites.push(circuitBand());
  sprites.push(frondBand());
  sprites.push(pillar());
  sprites.push(glow('fx/glow-ember', 24, 12, color(offRamp('#e0b45c')), color(offRamp('#b4842c'))));
  sprites.push(glow('fx/glow-vent', 32, 16, color(offRamp('#d06a50')), color(offRamp('#8a4030'))));
  sprites.push(
    glow('fx/glow-lantern', 32, 14, color(offRamp('#4cd0b4')), color(offRamp('#2c7a68')), 40),
  );
  return sprites;
}

/**
 * The animated far cloud strip: a lumpy ridge of three tones whose puffs shift two pixels
 * between the two frames (`frames: 2` on the stage band).
 *
 * @returns {SpriteDef} The sprite.
 */
function cloudBand() {
  const name = 'decor/cloud-band';
  const rng = createAssetRng(seedOf(name));
  const h = 64;
  const body = color(offRamp('#6a52a8'));
  const lit = color(offRamp('#7d63bd'));
  const dark = color(offRamp('#493a75'));
  const frames = [];
  for (let f = 0; f < 2; f++) {
    const image = createImage(BAND_W, h);
    for (let x = 0; x < BAND_W; x++) {
      // A blocky lumpy top edge: an 8-px puff whose height comes from its index's squares,
      // the second frame lifting every odd puff two pixels (the wobble the cycle shows).
      const puff = Math.floor(x / 8);
      let top = 10 + (puff % 5) + ((puff * puff) % 7);
      if (f === 1 && puff % 2 === 1) top -= 2;
      for (let y = top; y < h; y++) {
        const tone = y < top + 2 ? lit : y > h - 3 ? dark : body;
        setPixel(image, x, y, tone);
      }
      // A few lit pixels sink into the body so the ridge reads as cloud, not a flat board.
      if (x % 8 === (f === 1 ? 4 : 0)) setPixel(image, x, top + 4 + (rng.rangeInt(0, 1) | 0), lit);
    }
    frames.push(image);
  }
  return makeSprite(name, frames, 'decor', { anchor: [0, 0], native: true });
}

/**
 * The animated mid ridge strip: two offset mountain silhouettes with a lit crest line; the
 * second frame slides the phase 32 px so a distant lightning-flash cycle reads as a drift.
 *
 * @returns {SpriteDef} The sprite.
 */
function ridgeBand() {
  const name = 'decor/ridge-band';
  const h = 96;
  const body = color(offRamp('#55683f'));
  const lit = color(offRamp('#6e8452'));
  const dark = color(offRamp('#39472b'));
  const frames = [];
  for (let f = 0; f < 2; f++) {
    const image = createImage(BAND_W, h);
    const phase = f * 32;
    for (let x = 0; x < BAND_W; x++) {
      // Triangle-wave peaks by hand: |x mod 64 − 32|, a taller secondary ridge every 128 px.
      const t = x + phase;
      const near = Math.abs((t % 64) - 32);
      const far = Math.abs(((t + 32) % 128) - 64);
      const top = Math.min(30 + near, 10 + far);
      for (let y = top; y < h; y++) {
        const tone = y === top ? lit : y > h - 4 ? dark : body;
        setPixel(image, x, y, tone);
      }
    }
    frames.push(image);
  }
  return makeSprite(name, frames, 'decor', { anchor: [0, 0], native: true });
}

/**
 * The plain far circuit strip: a thin tech line with node pixels — a `frames: 1` band proving a
 * static strip still paints beside the animated ones.
 *
 * @returns {SpriteDef} The sprite.
 */
function circuitBand() {
  const name = 'decor/circuit-band';
  const rng = createAssetRng(seedOf(name));
  const h = 48;
  const line = color(offRamp('#4c6a9c'));
  const node = color(offRamp('#7a9ed0'));
  const image = createImage(BAND_W, h);
  for (let x = 0; x < BAND_W; x++) {
    setPixel(image, x, 22, line);
    setPixel(image, x, 23, line);
    if (x % 8 === 0) {
      const up = 2 + (x % 16 === 0 ? 2 : 0);
      for (let y = 22 - up; y < 22; y++) setPixel(image, x, y, line);
    }
    if (x % 32 === 12) {
      setPixel(image, x, 22, node);
      setPixel(image, x, 23, node);
    }
  }
  for (let i = 0; i < 26; i++) {
    setPixel(image, rng.rangeInt(0, BAND_W - 1), rng.rangeInt(6, 40), node);
  }
  return makeSprite(name, [image], 'decor', { anchor: [0, 0], native: true });
}

/**
 * The fore frond strip: dark leaves hanging from the top of the frame, drawn over the whole
 * world by the stage's single `fore` band (opaque stems, lit leaflet edges).
 *
 * @returns {SpriteDef} The sprite.
 */
function frondBand() {
  const name = 'decor/frond-band';
  const h = 120;
  const body = color(offRamp('#2e6148'));
  const lit = color(offRamp('#3d7a5a'));
  const image = createImage(BAND_W, h);
  for (let frond = 0; frond < 8; frond++) {
    const cx = 16 + frond * 32;
    // The stem: a straight hang from row 0 down, three pixels wide.
    for (let y = 0; y < h; y++) {
      for (let dx = -1; dx <= 1; dx++) setPixel(image, cx + dx, y, body);
    }
    // Leaflets: every 14 rows a lens of ±(10 − k) pixels leaning outward, alpha by its edge.
    for (let k = 0; k < 7; k++) {
      const y0 = 10 + k * 14;
      const half = 10 - (k % 3);
      const lean = frond % 2 === 0 ? 1 : -1;
      for (let dy = 0; dy < 8; dy++) {
        const w = Math.max(0, half - Math.abs(dy - 3));
        for (let dx = -w; dx <= w; dx++) {
          const x = cx + dx + lean * (4 + Math.floor(k / 2));
          const edge = Math.abs(dx) === w || dy === 0;
          setPixel(image, x, y0 + dy, edge ? lit : body);
        }
      }
    }
  }
  return makeSprite(name, [image], 'decor', { anchor: [0, 0], native: true });
}

/**
 * The back prop pillar: a 24×96 stone column with a lit capital and a shaded right edge.
 *
 * @returns {SpriteDef} The sprite.
 */
function pillar() {
  const name = 'decor/pillar';
  const rng = createAssetRng(seedOf(name));
  const w = 24;
  const h = 96;
  const body = color(offRamp('#6b6470'));
  const lit = color(offRamp('#8b8592'));
  const dark = color(offRamp('#4a4551'));
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    const cap = y < 8 || y >= 88; // the capital and the foot stand two pixels wider
    const x0 = cap ? 2 : 4;
    const x1 = cap ? 21 : 19;
    for (let x = x0; x <= x1; x++) {
      let tone = body;
      if (x === x0 || y < 2) tone = lit;
      if (x === x1 || y === h - 1) tone = dark;
      setPixel(image, x, y, tone);
    }
    if (!cap && y % 16 === 8) {
      setPixel(image, 8 + (y % 8), y, dark); // flute ticks break up the shaft
    }
  }
  for (let i = 0; i < 8; i++) {
    setPixel(image, rng.rangeInt(6, 17), rng.rangeInt(12, 84), dark); // weather specks
  }
  return makeSprite(name, [image], 'decor', { anchor: [0, 0], native: true });
}

/**
 * A radial additive glow: a bright core, a body ring and a faint halo, all centre-anchored.
 *
 * @param {string} name - Sprite name.
 * @param {number} width - Frame width (px).
 * @param {number} radius - Halo radius (px).
 * @param {import('../image.mjs').Rgba} core - The core colour.
 * @param {import('../image.mjs').Rgba} edge - The halo colour.
 * @param {number} [height] - Frame height (defaults to the width).
 * @returns {SpriteDef} The glow sprite.
 */
function glow(name, width, radius, core, edge, height = width) {
  const image = createImage(width, height);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const r2 = radius * radius;
      if (d2 > r2) continue;
      if (d2 * 9 < r2 * 2) {
        setPixel(image, x, y, core);
      } else if (d2 * 3 < r2 * 2) {
        setPixel(image, x, y, [edge[0], edge[1], edge[2], 204]);
      } else {
        setPixel(image, x, y, [edge[0], edge[1], edge[2], 110]);
      }
    }
  }
  return makeSprite(name, [image], 'decor', { anchor: [cx, cy], native: true });
}
