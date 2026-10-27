/**
 * Zone-map planets — nine unique procedural worlds, one per campaign letter (w15, the owner's
 * map-identity pass: the zones felt like the same space, so the map now shows each zone its own
 * planet behind its letter).
 *
 * `map/planet-a` … `map/planet-i` (the v2 native path only; decision RR-1a — the names are absent
 * at scale 1 and {@link generate} answers nothing there, exactly like the title backdrop, so the
 * scale-1 atlas and its digest pin never move). Each sprite is one native frame of the map node
 * class — `scaleLength(18, artScale)` (the width of `MAP_NODE_W`, a 27-px frame at 3/2) carrying a
 * 25-px sphere with a one-pixel margin — anchored at its centre, which is how `MapScene.drawUi`
 * places it on the node.
 *
 * Nine recipes, nine identities. Every planet shares the same scaffold — a four-band posterized
 * sphere lit from the top-left, then its own feature pass, then the art bible's 1-px outline
 * (§3.4, darkest palette colour) and the top-left light ring (§3.5) — and differs in palette and
 * silhouette, taken from the zone's own generator family:
 *
 * - **A azure** — an ocean world: blue sea, teal-green continents, a polar ice cap, white cloud
 *   dashes (the `backdrops.mjs` family).
 * - **B brine** — a foam gas world: teal strata and bright bubble rings (the zone-B generator).
 * - **C dune** — a striped desert: amber strata under dark rock caps, pocked with lit-rimmed
 *   craters.
 * - **D magma** — a volcanic world: dark basalt, branching ember cracks, glowing calderas, an ash
 *   cap (the hottest palette on the map).
 * - **E tempest** — a storm world: slate bands, dark squall ridges, pale cloud puffs and yellow
 *   lightning bolts.
 * - **F cell** — a living world: green cells ringed by dark membranes, each with a pale nucleus.
 * - **G prism** — a crystal world: a faceted blue mosaic (hashed cells, brighter toward the light)
 *   with white glint crosses.
 * - **H citadel** — a forge world: gunmetal terraces, a dark equator trench, red alert lights and
 *   a ring of rivets.
 * - **I abyss** — the deep: the darkest body on the map, a diagonal trench and sparse bio-lume
 *   dots with teal halos.
 *
 * Every colour is nudged off the reserved palette-cycle ramps by the kit's `offRamp` (the whole
 * shipped atlas is scanned by `test/integration/palette-cycle-scan.test.ts`), every pixel is fully
 * opaque or transparent, and all maths is exact (seeded `hash2` / sfc32 noise, the eight committed
 * direction vectors — no trigonometry), so the atlas is byte-identical on every machine.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { scaleLength } from '../interim.mjs';
import { createAssetRng, hash2 } from '../rng.mjs';
import { color, DIRECTIONS_8, drawLine, fillEllipse, makeSprite, seedOf } from './common.mjs';
import { offRamp, outline, outlineColour, topLeftLight } from '../v2kit.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */
/** @typedef {import('../image.mjs').Rgba} Rgba */

/**
 * The nine sprite names, one per campaign letter, at the index `core/ui`'s `MAP_PLANET_SPRITES`
 * and the map scene's planet slots use (a–i → 0–8).
 */
export const PLANET_SPRITES = Object.freeze([
  'map/planet-a',
  'map/planet-b',
  'map/planet-c',
  'map/planet-d',
  'map/planet-e',
  'map/planet-f',
  'map/planet-g',
  'map/planet-h',
  'map/planet-i',
]);

/** The v1 map node's widest metric (px): the planet class sizes from it through `scaleLength`. */
const NODE_CLASS_PX = 18;

/**
 * A planet palette in `offRamp`-nudged form: each key to its hex string and parsed `Rgba` (the
 * raw table below is the v2 identity colour only — nothing draws with an unnudged colour).
 *
 * @param {Record<string, string>} table - Role → raw hex colour.
 * @returns {Record<string, { hex: string, rgba: Rgba }>} The same roles, nudged off the ramps.
 */
function prep(table) {
  const out = {};
  for (const key of Object.keys(table)) {
    const hex = offRamp(table[key]);
    out[key] = { hex, rgba: color(hex) };
  }
  return out;
}

/**
 * A planet's drawing state: the image, the disc (centre `c`, radius `r`), the seeded rng, the
 * per-pixel hash seed and the lit band index `light(u, v)` (0 shadowed … 3 lit) the sphere ramp
 * and the mosaic pick both use.
 *
 * @param {string} name - The sprite name (the seed).
 * @param {number} grid - The frame size in pixels.
 * @returns {{image: import('../image.mjs').Image, c: number, r: number, rng: ReturnType<typeof createAssetRng>, seed: number, light: (u: number, v: number) => number}} The state.
 */
function makeCtx(name, grid) {
  const seed = seedOf(name);
  const rng = createAssetRng(seed);
  const c = grid >> 1;
  return {
    image: createImage(grid, grid),
    c,
    r: c - 1,
    rng,
    seed,
    light: (u, v) => Math.round(((2 - u - v) / 4) * 3),
  };
}

/**
 * Paints one pixel when it lies inside the planet's disc (strokes must never leak past the
 * sphere's outline — {@link clipDisc} is the final guard for whole-line paints).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @param {Rgba} rgba - The colour.
 */
function disc(ctx, x, y, rgba) {
  const dx = x - ctx.c;
  const dy = y - ctx.c;
  if (dx * dx + dy * dy > ctx.r * ctx.r) return;
  setPixel(ctx.image, x, y, rgba);
}

/**
 * Paints a pixel at a disc-relative offset from the centre.
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {number} x - Column offset from the centre.
 * @param {number} y - Row offset from the centre.
 * @param {Rgba} rgba - The colour.
 */
function at(ctx, x, y, rgba) {
  disc(ctx, ctx.c + x, ctx.c + y, rgba);
}

/**
 * A seeded centre inside the usable disc (features keep clear of a margin around the rim).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {number} margin - The exclusion ring width in pixels.
 * @returns {{x: number, y: number}} The offsets from the centre.
 */
function spot(ctx, margin) {
  const limit = ctx.r - margin;
  for (let tries = 0; tries < 64; tries++) {
    const x = ctx.rng.rangeInt(-limit, limit);
    const y = ctx.rng.rangeInt(-limit, limit);
    if (x * x + y * y <= limit * limit) return { x, y };
  }
  return { x: 0, y: 0 };
}

/**
 * Draws the four-band lit sphere: tone `light()` of the planet's ramp, every disc pixel.
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {readonly Rgba[]} ramp - Four tones, shadow to light.
 */
function sphere(ctx, ramp) {
  fillEllipse(
    ctx.image,
    ctx.c,
    ctx.c,
    ctx.r,
    ctx.r,
    (u, v) => ramp[Math.round(((2 - u - v) / 4) * 3)],
  );
}

/**
 * Erases every opaque pixel outside the disc (the guard for {@link drawLine} strokes and any
 * overshoot, run before the outline so the ring sees a clean sphere).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 */
function clipDisc(ctx) {
  const { image, c, r } = ctx;
  for (let y = 0; y < image.height; y++) {
    const dy = y - c;
    for (let x = 0; x < image.width; x++) {
      const dx = x - c;
      if (dx * dx + dy * dy > r * r) setPixel(image, x, y, [0, 0, 0, 0]);
    }
  }
}

/**
 * Finishes a planet the bible way: clip to the sphere, the darkest palette colour outlines it,
 * the lightest stamps its top-left ring (deliberate order — light wins the corners where both
 * would touch).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The planet's nudged palette.
 * @param {string} rimKey - The palette key of the lit-ring colour.
 * @returns {import('../image.mjs').Image} The finished frame.
 */
function finish(ctx, p, rimKey) {
  clipDisc(ctx);
  const hexes = Object.keys(p).map((key) => p[key].hex);
  return topLeftLight(outline(ctx.image, outlineColour(hexes)), p[rimKey].hex);
}

/**
 * Paints wobbled strata rows across the disc — the bands of the gas and desert worlds.
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {readonly Rgba[]} tones - The strata to cycle through.
 * @param {number} period - Strata thickness in rows.
 */
function strata(ctx, tones, period) {
  for (let y = 0; y < ctx.image.height; y++) {
    for (let x = 0; x < ctx.image.width; x++) {
      const wob = (hash2(x, y, ctx.seed) % 3) - 1;
      const idx = (Math.floor((y + wob) / period) + 40) % tones.length;
      disc(ctx, x, y, tones[idx]);
    }
  }
}

// ------------------------------------------------------------------------------ the nine recipes

/**
 * A — azure: an ocean world (blue sea, green continents, ice cap, cloud dashes).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function azure(ctx, p) {
  sphere(ctx, [p.t0.rgba, p.t1.rgba, p.t2.rgba, p.t3.rgba]);
  for (let blob = 0; blob < 3; blob++) {
    const s = spot(ctx, 4);
    const rx = 3 + (ctx.rng.nextU32() % 3);
    const ry = 2 + (ctx.rng.nextU32() % 3);
    fillEllipse(ctx.image, ctx.c + s.x, ctx.c + s.y, rx, ry, (_u, _v, e, x, y) => {
      const dx = x - ctx.c;
      const dy = y - ctx.c;
      if (dx * dx + dy * dy > ctx.r * ctx.r) return null;
      if (e > 0.74) return p.coast.rgba;
      return hash2(x, y, ctx.seed) % 3 === 0 ? p.landLit.rgba : p.land.rgba;
    });
  }
  fillEllipse(ctx.image, ctx.c, ctx.c, ctx.r, ctx.r, (_u, v, e) => {
    if (v < -0.58 && e < 0.97) return p.ice.rgba;
    return null;
  });
  for (let cloud = 0; cloud < 3; cloud++) {
    const s = spot(ctx, 5);
    const len = 2 + (ctx.rng.nextU32() % 3);
    drawLine(ctx.image, ctx.c + s.x - len, ctx.c + s.y, ctx.c + s.x + len, ctx.c + s.y, p.ice.rgba);
  }
  return finish(ctx, p, 'rim');
}

/**
 * B — brine: a foam gas world (teal strata, bright bubble rings).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function brine(ctx, p) {
  sphere(ctx, [p.t0.rgba, p.t1.rgba, p.t2.rgba, p.t3.rgba]);
  strata(ctx, [p.t1.rgba, p.t3.rgba, p.t0.rgba, p.t2.rgba], 4);
  for (let bubble = 0; bubble < 4; bubble++) {
    const s = spot(ctx, 4);
    const r = 2 + (ctx.rng.nextU32() % 3);
    fillEllipse(ctx.image, ctx.c + s.x, ctx.c + s.y, r, r, (_u, _v, e, x, y) => {
      const dx = x - ctx.c;
      const dy = y - ctx.c;
      if (dx * dx + dy * dy > ctx.r * ctx.r) return null;
      return e > 0.62 ? p.foam.rgba : p.blob.rgba;
    });
  }
  return finish(ctx, p, 'rim');
}

/**
 * C — dune: a striped desert world (amber strata, rock caps, lit-rimmed craters).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function dune(ctx, p) {
  sphere(ctx, [p.t0.rgba, p.t1.rgba, p.t2.rgba, p.t3.rgba]);
  strata(ctx, [p.rock.rgba, p.t1.rgba, p.sand.rgba, p.t2.rgba], 3);
  fillEllipse(ctx.image, ctx.c, ctx.c, ctx.r, ctx.r, (_u, v, _e, x, y) => {
    if (v <= 0.72 && v >= -0.72) return null;
    const dx = x - ctx.c;
    const dy = y - ctx.c;
    if (dx * dx + dy * dy > ctx.r * ctx.r) return null;
    return p.t0.rgba;
  });
  for (let crater = 0; crater < 3; crater++) {
    const s = spot(ctx, 5);
    const r = 2 + (ctx.rng.nextU32() % 2);
    fillEllipse(ctx.image, ctx.c + s.x, ctx.c + s.y, r, r, (_u, _v, e, x, y) => {
      const dx = x - ctx.c;
      const dy = y - ctx.c;
      if (dx * dx + dy * dy > ctx.r * ctx.r) return null;
      if (e > 0.55 && x - (ctx.c + s.x) + (y - (ctx.c + s.y)) > 0) return p.lit.rgba;
      return p.pit.rgba;
    });
  }
  return finish(ctx, p, 'rim');
}

/**
 * D — magma: a volcanic world (basalt, ember cracks, glowing pools, ash cap).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function magma(ctx, p) {
  sphere(ctx, [p.t0.rgba, p.t1.rgba, p.t2.rgba, p.t3.rgba]);
  fillEllipse(ctx.image, ctx.c, ctx.c, ctx.r, ctx.r, (_u, v, e) => {
    if (v < -0.58 && e < 0.97) return p.ash.rgba;
    return null;
  });
  for (let crack = 0; crack < 5; crack++) {
    const k = (crack + (ctx.rng.nextU32() & 3)) & 7;
    const dir = DIRECTIONS_8[k];
    let x = 0;
    let y = 0;
    for (let step = 1; step <= 5; step++) {
      x = Math.round(x + dir[0] * 2.6);
      y = Math.round(y + dir[1] * 2.6);
      at(ctx, x, y, step <= 2 ? p.hot.rgba : p.crack.rgba);
      const bend = (ctx.rng.nextU32() & 1) === 0 ? -1 : 1;
      const side = DIRECTIONS_8[(k + bend + 8) & 7];
      at(ctx, x + Math.round(side[0] * 2), y + Math.round(side[1] * 2), p.crack.rgba);
    }
  }
  for (let pool = 0; pool < 2; pool++) {
    const s = spot(ctx, 5);
    fillEllipse(ctx.image, ctx.c + s.x, ctx.c + s.y, 2, 2, (_u, _v, e, x, y) => {
      const dx = x - ctx.c;
      const dy = y - ctx.c;
      if (dx * dx + dy * dy > ctx.r * ctx.r) return null;
      return e > 0.6 ? p.crack.rgba : p.glow.rgba;
    });
  }
  return finish(ctx, p, 'rim');
}

/**
 * E — tempest: a storm world (slate bands, squall ridges, cloud puffs, lightning).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function tempest(ctx, p) {
  sphere(ctx, [p.t0.rgba, p.t1.rgba, p.t2.rgba, p.t3.rgba]);
  for (const row of [ctx.c - 4, ctx.c + 3]) {
    for (let x = 0; x < ctx.image.width; x++) {
      const wob = (hash2(x, row, ctx.seed) % 3) - 1;
      disc(ctx, x, row + wob, p.squall.rgba);
      if ((hash2(x, row + 7, ctx.seed) & 3) === 0) disc(ctx, x, row + wob + 2, p.squall.rgba);
    }
  }
  for (let puff = 0; puff < 3; puff++) {
    const s = spot(ctx, 5);
    const r = 2 + (ctx.rng.nextU32() % 2);
    fillEllipse(
      ctx.image,
      ctx.c + s.x - 2,
      ctx.c + s.y - 3,
      r,
      r > 2 ? r - 1 : 1,
      (_u, _v, e, x, y) => {
        const dx = x - ctx.c;
        const dy = y - ctx.c;
        if (dx * dx + dy * dy > ctx.r * ctx.r) return null;
        return hash2(x, y, ctx.seed) % 4 === 0 ? p.cloudLit.rgba : p.cloud.rgba;
      },
    );
  }
  for (let bolt = 0; bolt < 2; bolt++) {
    let x = ctx.rng.rangeInt(-5, 5);
    let y = ctx.rng.rangeInt(-6, -3);
    for (let link = 0; link < 4; link++) {
      const nextX = x + ctx.rng.rangeInt(-1, 1);
      const nextY = y + 2;
      if (nextX * nextX + nextY * nextY > (ctx.r - 3) * (ctx.r - 3)) break;
      at(ctx, x, y, p.bolt.rgba);
      x = nextX;
      y = nextY;
    }
  }
  return finish(ctx, p, 'rim');
}

/**
 * F — cell: a living world (membrane-ringed cells, pale nuclei).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function cell(ctx, p) {
  sphere(ctx, [p.t0.rgba, p.t1.rgba, p.t2.rgba, p.t3.rgba]);
  const fills = [p.f1.rgba, p.f2.rgba, p.f3.rgba];
  for (let n = 0; n < 6; n++) {
    const s = spot(ctx, 4);
    const r = 3 + (ctx.rng.nextU32() % 4);
    fillEllipse(ctx.image, ctx.c + s.x, ctx.c + s.y, r, r, (_u, _v, e, x, y) => {
      const dx = x - ctx.c;
      const dy = y - ctx.c;
      if (dx * dx + dy * dy > ctx.r * ctx.r) return null;
      if (e > 0.8) return p.membrane.rgba;
      if (e < 0.16 && r >= 4) return p.nucleus.rgba;
      return fills[n % 3];
    });
  }
  return finish(ctx, p, 'rim');
}

/**
 * G — prism: a crystal world (hashed faceted mosaic, white glint crosses).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function prism(ctx, p) {
  const facets = [p.t0.rgba, p.t1.rgba, p.t2.rgba, p.t3.rgba, p.hi.rgba, p.hi2.rgba];
  fillEllipse(ctx.image, ctx.c, ctx.c, ctx.r, ctx.r, (u, v, _e, x, y) => {
    const band = ctx.light(u, v);
    const h = hash2(x >> 2, y >> 2, ctx.seed);
    return facets[Math.min(5, (h % 3) + band)];
  });
  for (let glint = 0; glint < 2; glint++) {
    const s = spot(ctx, 6);
    const ox = s.x - 3;
    const oy = s.y - 3;
    at(ctx, ox, oy, p.glint.rgba);
    at(ctx, ox - 1, oy, p.glint.rgba);
    at(ctx, ox + 1, oy, p.glint.rgba);
    at(ctx, ox, oy - 1, p.glint.rgba);
    at(ctx, ox, oy + 1, p.glint.rgba);
  }
  return finish(ctx, p, 'rim');
}

/**
 * H — citadel: a forge world (gunmetal terraces, equator trench, alert lights, rivets).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function citadel(ctx, p) {
  fillEllipse(ctx.image, ctx.c, ctx.c, ctx.r, ctx.r, (u, v, e, x, y) => {
    if (v < -0.62) return p.smoke.rgba;
    if (v > -0.06 && v < 0.06) return p.trench.rgba;
    if (((x >> 1) & 1) === 0) return e > 0.55 ? p.t1.rgba : p.t2.rgba;
    if (hash2(x, y, ctx.seed) % 6 === 0) return p.t0.rgba;
    return u + v < -0.4 ? p.t3.rgba : p.t2.rgba;
  });
  for (let k = 0; k < 4; k++) {
    at(ctx, -7 + k * 5, 0, p.alert.rgba);
    at(ctx, -7 + k * 5, 1, p.alert.rgba);
  }
  at(ctx, 3, 0, p.alertHot.rgba);
  const rad = ctx.r - 3;
  for (let k = 0; k < 8; k++) {
    const dir = DIRECTIONS_8[k];
    at(ctx, Math.round(dir[0] * rad), Math.round(dir[1] * rad), p.rivet.rgba);
  }
  return finish(ctx, p, 'rim');
}

/**
 * I — abyss: the deep world (darkest body, diagonal trench, bio-lume dots).
 *
 * @param {ReturnType<typeof makeCtx>} ctx - The planet state.
 * @param {Record<string, { hex: string, rgba: Rgba }>} p - The nudged palette.
 * @returns {import('../image.mjs').Image} The frame.
 */
function abyss(ctx, p) {
  const ramp = [p.t0.rgba, p.t0.rgba, p.t1.rgba, p.t2.rgba];
  fillEllipse(ctx.image, ctx.c, ctx.c, ctx.r, ctx.r, (u, v) => {
    if (v - 0.1 * u - 0.05 > -0.14 && v - 0.1 * u - 0.05 < 0.14) return p.trench.rgba;
    return ramp[ctx.light(u, v)];
  });
  const s = spot(ctx, 5);
  fillEllipse(ctx.image, ctx.c + s.x, ctx.c + s.y + 2, 3, 2, (_u, _v, e, x, y) => {
    const dx = x - ctx.c;
    const dy = y - ctx.c;
    if (dx * dx + dy * dy > ctx.r * ctx.r) return null;
    return e > 0.66 ? p.trench.rgba : p.pool.rgba;
  });
  for (let dot = 0; dot < 7; dot++) {
    const d = spot(ctx, 3);
    disc(ctx, ctx.c + d.x, ctx.c + d.y, p.halo.rgba);
    disc(ctx, ctx.c + d.x - 1, ctx.c + d.y, p.halo.rgba);
    disc(ctx, ctx.c + d.x + 1, ctx.c + d.y, p.halo.rgba);
    disc(ctx, ctx.c + d.x, ctx.c + d.y - 1, p.halo.rgba);
    disc(ctx, ctx.c + d.x, ctx.c + d.y + 1, p.halo.rgba);
    disc(ctx, ctx.c + d.x, ctx.c + d.y, p.lume.rgba);
  }
  return finish(ctx, p, 'rim');
}

/**
 * The nine recipes by campaign letter.
 *
 * @type {Record<string, (ctx: ReturnType<typeof makeCtx>, p: Record<string, { hex: string, rgba: Rgba }>) => import('../image.mjs').Image>}
 */
const RECIPES = {
  a: azure,
  b: brine,
  c: dune,
  d: magma,
  e: tempest,
  f: cell,
  g: prism,
  h: citadel,
  i: abyss,
};

/**
 * The nine identity palettes: four sphere tones (`t0` shadow … `t3` lit) plus the feature roles,
 * each planet's colours from its own zone generator's family (the lit-ring colour is `rim`).
 */
const PALETTES = {
  a: {
    t0: '#0c1a3c',
    t1: '#173466',
    t2: '#2e5a94',
    t3: '#5a9ee0',
    land: '#2a5a58',
    landLit: '#4a9a7a',
    coast: '#8ad0a8',
    ice: '#d8fff4',
    rim: '#5a9ee0',
  },
  b: {
    t0: '#0a2430',
    t1: '#0e3e50',
    t2: '#1e5a6a',
    t3: '#2a8aa8',
    blob: '#58c8b0',
    foam: '#c8fff0',
    rim: '#60e0c0',
  },
  c: {
    t0: '#2a1c10',
    t1: '#6f5234',
    t2: '#a07840',
    t3: '#d8a860',
    rock: '#4a3024',
    sand: '#c8a060',
    pit: '#140c06',
    lit: '#e8cc9e',
    rim: '#e0b870',
  },
  d: {
    t0: '#1a1212',
    t1: '#2a1408',
    t2: '#3a221a',
    t3: '#5a3a28',
    crack: '#a02c10',
    hot: '#d0501c',
    glow: '#f8b048',
    ash: '#4a3632',
    rim: '#f8c860',
  },
  e: {
    t0: '#14202e',
    t1: '#26304a',
    t2: '#3c4658',
    t3: '#5d779f',
    squall: '#0b1420',
    cloud: '#8aa0ba',
    cloudLit: '#b8c8dc',
    bolt: '#f8f0a0',
    rim: '#9ab0cc',
  },
  f: {
    t0: '#14241a',
    t1: '#1c2a22',
    t2: '#2c402c',
    t3: '#4e7a5e',
    membrane: '#07100a',
    f1: '#3a5a48',
    f2: '#5a8468',
    f3: '#6e9a7a',
    nucleus: '#e8f0c8',
    rim: '#8ab8a0',
  },
  g: {
    t0: '#0e1a2e',
    t1: '#1a2b52',
    t2: '#24407e',
    t3: '#3560ad',
    hi: '#5c8ed1',
    hi2: '#9dbfe8',
    glint: '#e0f4ff',
    rim: '#9dbfe8',
  },
  h: {
    t0: '#0e1014',
    t1: '#1e2229',
    t2: '#3a404c',
    t3: '#5a6270',
    trench: '#06070a',
    smoke: '#2e333e',
    alert: '#c83020',
    alertHot: '#ff9060',
    rivet: '#c8ccd4',
    rim: '#6a7080',
  },
  i: {
    t0: '#0e1822',
    t1: '#12303a',
    t2: '#1e4a52',
    t3: '#2a6a72',
    trench: '#060d15',
    pool: '#3a7868',
    halo: '#5a92a2',
    lume: '#a8f0e0',
    rim: '#66d2a8',
  },
};

/**
 * Generates the nine zone planets.
 *
 * @param {{ artScale?: number }} [options] - The build's art scale; anything other than 1 draws
 *   the v2 native {@link PLANET_SPRITES} at the map node's class size, 1 (the default) draws
 *   nothing — decision RR-1a keeps the names out of the scale-1 atlas (the map then shows plain
 *   panels; `UiSprites.planets` resolves them to -1).
 * @returns {SpriteDef[]} The nine planets at the v2 scale, none at scale 1.
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  if (artScale === 1) return [];
  const grid = scaleLength(NODE_CLASS_PX, artScale);
  return PLANET_SPRITES.map((name) => {
    const letter = name.slice(name.length - 1);
    const p = prep(PALETTES[letter]);
    const ctx = makeCtx(name, grid);
    const frame = RECIPES[letter](ctx, p);
    return makeSprite(name, [frame], 'planets', {
      anchor: [grid >> 1, grid >> 1],
      native: true,
    });
  });
}
