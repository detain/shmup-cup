/**
 * The art of the pseudo-3D **high-speed dimension** stage and the P2 bosses of plan M3-02
 * (placeholder art, decision D24), and since R5-10.T3 the stage's v2 stand-in art and its new
 * layers (the painted parallax bands, the back-corridor decor shards and the additive glows of
 * R3-06 — plan R5-10 "the dimension gets the new layers").
 *
 * **At art scale 1** the generator draws exactly the v1 set (RR-1: the scale-1 atlas keeps v1's
 * bytes). **At any other art scale** it draws every sprite `native` — the six v1 names at their
 * final v2 sizes (`⌈3/2 ·` the v1 side, all exact halves here) with far more detail, plus five
 * new names the dimension stage and the extras roster art fields use:
 *
 * - `bg/dimension-floor` (48×48, one frame, anchor top-left): the tile the Mode-7 floor repeats —
 *   a neon grid of one lit cell on a dark violet field, with a brighter node where the lines
 *   cross. It is sampled by the Mode-7 shader with `fract`, so it has to wrap seamlessly on both
 *   axes: the lines sit on the tile's first row and column only.
 * - `bg/dimension-sky` (192×72, anchor top-left): the stage's far band — a dark violet gradient
 *   with a lit horizon line, so the Mode-7 floor meets something at the top.
 * - `enemies/dim-pylon` (24×60, 2 frames): the wall segments of the dimension's corridor, a lit
 *   pillar that pulses.
 * - `bosses/bloom-maw` (42×42, 2 frames, `whenOpen`): the suction boss's mouth, shut and gaping.
 * - `bosses/talon-claw` (27×21, 2 frames): the grabber's claw, open and closed.
 * - `bosses/strider-leg` (15×39, 2 frames): the invincible walker's leg, planted and mid-stride.
 * - `bg/dimension-rift` (320×84, 2 frames): the mid band — the skyline of the rift monoliths the
 *   dimension's violet light never reached, standing on the horizon the floor meets.
 * - `bg/dimension-strands` (320×48, 2 frames): the fore band — energised tether strands whipping
 *   past the camera along the corridor's ceiling, their lamps blinking between the frames.
 * - `decor/dimension-shard-a` (20×34) / `decor/dimension-shard-b` (16×46): the floating crystal
 *   slivers of the corridor's margins, drawn on the back decor layer above the floor.
 * - `fx/glow-rift` (32×32, centre anchor): the stage's additive violet halo — the pylons', the
 *   maw's and the shards' glow (R3-06.L4).
 *
 * Every hittable sprite has a hit-flash sibling except the backgrounds; the two pylon and maw
 * parts, the claw and the leg keep their v1 `hitFlash`. Geometry uses only `+ - * /` and
 * `Math.sqrt` (the generators may not call `Math.sin` / `Math.cos`), so the pixels are identical
 * on every engine; every v2 solid goes through the kit's {@link offRamp}.
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { hash2 } from '../rng.mjs';
import { color, makeSprite, mix, withAlpha, seedOf, SOFT_ALPHA } from './common.mjs';
import { offRamp, FRAME_W } from '../v2kit.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** Edge of the `bg/dimension-floor` tile in pixels (one cell of the grid). */
export const DIMENSION_TILE = 32;

/** Width of the `bg/dimension-sky` band (its parallax `spacing`). */
export const DIMENSION_SKY_W = 128;

/** Height of the `bg/dimension-sky` band. */
export const DIMENSION_SKY_H = 48;

/** Width of both v2 band sprites: half the frame, so a whole number of tiles fills it. */
export const BAND_TILE_W = FRAME_W / 2;

/** Height of the `bg/dimension-rift` band (R5-10.T3: it meets the ported horizon 168 at y 84). */
export const DIMENSION_RIFT_H = 84;

/** Height of the `bg/dimension-strands` fore band. */
export const DIMENSION_STRAND_H = 48;

/**
 * The exact v2 side of a v1 one: the world scale is 3/2 and every v1 dimension sprite has an
 * even side, so this is never rounded (`DIMENSION_TILE * 3 / 2` is the 48 the runtime test reads).
 *
 * @param {number} v1 - The v1 pixel size.
 * @returns {number} The v2 native size.
 */
function v2(v1) {
  return (v1 * 3) / 2;
}

/**
 * A seeded integer in `[0, n)` at one coordinate pair (the generators' only randomness, as in
 * the zone kit — `hash2` over the sprite's own seed).
 *
 * @param {number} a - First integer.
 * @param {number} b - Second integer.
 * @param {number} seed - The sprite's seed (`seedOf(name)`).
 * @param {number} n - The exclusive bound.
 * @returns {number} The draw.
 */
function pick(a, b, seed, n) {
  return hash2(a, b, seed) % n;
}

/**
 * The dimension palette, all v2 colours moved off the reserved palette-cycle ramps (the kit's
 * {@link offRamp}): a deep violet field, a lit line, a bright node and a darker sub-line.
 */
const V2 = {
  field: color(offRamp('#1a0e34')),
  deep: color(offRamp('#0e0822')),
  sub: color(offRamp('#4a2c8e')),
  line: color(offRamp('#7440d8')),
  node: color(offRamp('#d0a4ff')),
  lit: color(offRamp('#b488f0')),
  skyTop: color(offRamp('#1e1040')),
  skyBottom: color(offRamp('#40207a')),
  horizon: color(offRamp('#b080ff')),
  star: color(offRamp('#e8d8ff')),
  shell: color(offRamp('#46327e')),
  edge: color(offRamp('#8a68e0')),
  dim: color(offRamp('#9462ec')),
  bright: color(offRamp('#ecd0ff')),
  stone: color(offRamp('#2c1c54')),
  stoneLit: color(offRamp('#503a8c')),
  stoneTop: color(offRamp('#684cae')),
  dark: color(offRamp('#120a26')),
  iron: color(offRamp('#6a6a7a')),
  ironEdge: color(offRamp('#b8b8d0')),
  hot: color(offRamp('#ff9858')),
  plate: color(offRamp('#565670')),
  joint: color(offRamp('#d86040')),
  strand: color(offRamp('#7c4ce0')),
  strandLit: color(offRamp('#c8a0ff')),
  shard: color(offRamp('#30205c')),
  shardEdge: color(offRamp('#a070f8')),
  shardCore: color(offRamp('#dcc0ff')),
  petal: color(offRamp('#4c8240')),
  petalDark: color(offRamp('#34602c')),
  rim: color(offRamp('#96da72')),
  throat: color(offRamp('#30143c')),
  mawGlow: color(offRamp('#d8ffa4')),
  glowCore: color(offRamp('#c8a0ff')),
  glowEdge: color(offRamp('#6c3cc8')),
};

// --------------------------------------------------------------------------- v1 art ----

/**
 * The Mode-7 floor tile (v1, art scale 1): a dark field with a lit line down its first column
 * and along its first row, and a brighter node where they meet.
 *
 * @returns {SpriteDef} `bg/dimension-floor`.
 */
function floorTile() {
  const n = DIMENSION_TILE;
  const image = createImage(n, n);
  const field = color('#180d30');
  const deep = color('#0d0720');
  const line = color('#6a3cd0');
  const node = color('#c89cff');
  for (let y = 0; y < n; y++) {
    // A gentle gradient across the cell, so neighbouring cells still read as separate.
    const tone = mix(field, deep, y / (n - 1));
    for (let x = 0; x < n; x++) setPixel(image, x, y, tone);
  }
  for (let i = 0; i < n; i++) {
    setPixel(image, i, 0, line);
    setPixel(image, 0, i, line);
  }
  setPixel(image, 0, 0, node);
  setPixel(image, 1, 0, node);
  setPixel(image, 0, 1, node);
  return makeSprite('bg/dimension-floor', [image], 'dimension', { anchor: [0, 0] });
}

/**
 * The dimension's far band (v1): a violet gradient under a lit horizon line.
 *
 * @returns {SpriteDef} `bg/dimension-sky`.
 */
function skyBand() {
  const w = DIMENSION_SKY_W;
  const h = DIMENSION_SKY_H;
  const image = createImage(w, h);
  const top = color('#1b0d38');
  const bottom = color('#3a1a6e');
  const horizon = color('#a06cff');
  for (let y = 0; y < h; y++) {
    const tone = mix(top, bottom, y / (h - 1));
    for (let x = 0; x < w; x++) setPixel(image, x, y, tone);
  }
  for (let x = 0; x < w; x++) {
    setPixel(image, x, h - 1, horizon);
    setPixel(image, x, h - 2, withAlpha(horizon, 120));
  }
  return makeSprite('bg/dimension-sky', [image], 'dimension', { anchor: [0, 0] });
}

/**
 * The corridor pylon (v1): a tall lit pillar with a core band that brightens on the second frame.
 *
 * @returns {SpriteDef} `enemies/dim-pylon`.
 */
function pylon() {
  const w = 16;
  const h = 40;
  const shell = color('#3c2a70');
  const edge = color('#7a5ad0');
  const dim = color('#8c5ce0');
  const lit = color('#e0c0ff');
  const frames = [dim, lit].map((core) => {
    const image = createImage(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 2; x < w - 2; x++) {
        setPixel(image, x, y, x === 2 || x === w - 3 ? edge : shell);
      }
    }
    for (let y = 4; y < h - 4; y += 6) {
      for (let x = 5; x < w - 5; x++) setPixel(image, x, y, core);
    }
    return image;
  });
  return makeSprite('enemies/dim-pylon', frames, 'dimension', {
    hitFlash: true,
    animations: { pulse: [0, 1] },
  });
}

/**
 * The suction boss's maw (v1): a ring of petals round a dark throat, shut on frame 0 and gaping
 * on frame 1 (the `whenOpen` core sits behind it).
 *
 * @returns {SpriteDef} `bosses/bloom-maw`.
 */
function bloomMaw() {
  const n = 28;
  const centre = (n - 1) / 2;
  const petal = color('#4a7a3a');
  const rim = color('#8cd06a');
  const throat = color('#2a1030');
  const glow = color('#d0ff9a');
  const frames = [6, 11].map((gape) => {
    const image = createImage(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x - centre;
        const dy = y - centre;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 13.5) continue;
        if (d < gape) {
          setPixel(image, x, y, d < gape - 2 ? throat : glow);
          continue;
        }
        setPixel(image, x, y, d > 12 ? rim : petal);
      }
    }
    return image;
  });
  return makeSprite('bosses/bloom-maw', frames, 'dimension', { hitFlash: true });
}

/**
 * The grabber's claw (v1): two hooked jaws, apart on frame 0 and closed on frame 1.
 *
 * @returns {SpriteDef} `bosses/talon-claw`.
 */
function talonClaw() {
  const w = 18;
  const h = 14;
  const iron = color('#6a6a7a');
  const edge = color('#b0b0c8');
  const hot = color('#ff8c50');
  const frames = [4, 1].map((gap) => {
    const image = createImage(w, h);
    const mid = (h - 1) / 2;
    for (let x = 0; x < w; x++) {
      // The jaws taper towards the tip and meet at the gap.
      const reach = Math.round((gap * (w - 1 - x)) / (w - 1)) + 1;
      for (let d = reach; d <= reach + 2; d++) {
        const top = Math.round(mid - d);
        const bottom = Math.round(mid + d);
        if (top >= 0) setPixel(image, x, top, d === reach ? edge : iron);
        if (bottom < h) setPixel(image, x, bottom, d === reach ? edge : iron);
      }
    }
    for (let x = w - 4; x < w; x++) setPixel(image, x, Math.round(mid), hot);
    return image;
  });
  return makeSprite('bosses/talon-claw', frames, 'dimension', { hitFlash: true });
}

/**
 * The walker's leg (v1): a segmented armour strut, planted on frame 0 and lifted on frame 1.
 *
 * @returns {SpriteDef} `bosses/strider-leg`.
 */
function striderLeg() {
  const w = 10;
  const h = 26;
  const iron = color('#4a4a58');
  const edge = color('#8a8aa0');
  const joint = color('#d05a3a');
  const frames = [0, 3].map((lift) => {
    const image = createImage(w, h);
    for (let y = 0; y < h - lift; y++) {
      for (let x = 2; x < w - 2; x++) {
        setPixel(image, x, y + lift, x === 2 || x === w - 3 ? edge : iron);
      }
    }
    for (let y = 6 + lift; y < h; y += 8) {
      for (let x = 1; x < w - 1; x++) setPixel(image, x, y, joint);
    }
    return image;
  });
  return makeSprite('bosses/strider-leg', frames, 'dimension', {
    hitFlash: true,
    animations: { stride: [0, 1] },
  });
}

// --------------------------------------------------------------------------- v2 art ----

/**
 * The v2 Mode-7 floor tile (48×48, one frame): the same seamless neon grid with `fract` wrap —
 * the lit line is two pixels thick on the tile's first row and column, the cell's middle carries
 * a dim sub-line, a node glows at the crossing and the cell interior reads as one violet slab
 * with a gradient and four corner studs. Fully opaque: the mode7 alignment e2e test needs every
 * ground row to change against the sky behind it.
 *
 * @returns {SpriteDef} `bg/dimension-floor` at the v2 size.
 */
function floorTileV2() {
  const n = v2(DIMENSION_TILE);
  const half = n / 2;
  const image = createImage(n, n);
  for (let y = 0; y < n; y++) {
    const tone = mix(V2.field, V2.deep, y / (n - 1));
    for (let x = 0; x < n; x++) setPixel(image, x, y, tone);
  }
  for (let i = 0; i < n; i++) {
    setPixel(image, i, half, V2.sub);
    setPixel(image, half, i, V2.sub);
    setPixel(image, i, 0, V2.line);
    setPixel(image, i, 1, V2.line);
    setPixel(image, 0, i, V2.line);
    setPixel(image, 1, i, V2.line);
  }
  for (const [sx, sy] of [
    [half + 2, half + 2],
    [half - 3, half + 2],
    [half + 2, half - 3],
    [half - 3, half - 3],
  ]) {
    setPixel(image, sx, sy, V2.sub);
  }
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) setPixel(image, x, y, V2.node);
  }
  setPixel(image, 3, 0, V2.lit);
  setPixel(image, 0, 3, V2.lit);
  setPixel(image, 3, 1, V2.lit);
  setPixel(image, 1, 3, V2.lit);
  return makeSprite('bg/dimension-floor', [image], 'dimension', { anchor: [0, 0], native: true });
}

/**
 * The v2 far band (192×72): the violet gradient, a field of seeded stars, streaks of rift haze
 * and the lit horizon line with its `SOFT_ALPHA` glow rows — the band the floor meets at 168.
 *
 * @returns {SpriteDef} `bg/dimension-sky` at the v2 size.
 */
function skyBandV2() {
  const w = v2(DIMENSION_SKY_W);
  const h = v2(DIMENSION_SKY_H);
  const image = createImage(w, h);
  const seed = seedOf('bg/dimension-sky');
  for (let y = 0; y < h; y++) {
    const tone = mix(V2.skyTop, V2.skyBottom, y / (h - 1));
    for (let x = 0; x < w; x++) setPixel(image, x, y, tone);
  }
  for (let x = 0; x < w; x++) {
    // Drifting haze: every so often a brighter column reaches up from the horizon.
    if (pick(x, 7, seed, 3) === 0) {
      for (let y = h - 10; y < h - 2; y++) {
        setPixel(image, x, y, withAlpha(V2.lit, SOFT_ALPHA));
      }
    }
  }
  for (let s = 0; s < 24; s++) {
    const x = pick(s, 1, seed, w);
    const y = pick(s, 2, seed, h - 14);
    const bright = pick(s, 3, seed, 3) === 0;
    setPixel(image, x, y, bright ? V2.star : withAlpha(V2.star, SOFT_ALPHA));
    if (bright) setPixel(image, (x + 1) % w, y, withAlpha(V2.star, SOFT_ALPHA));
  }
  for (let x = 0; x < w; x++) {
    setPixel(image, x, h - 1, V2.horizon);
    setPixel(image, x, h - 2, withAlpha(V2.horizon, SOFT_ALPHA));
  }
  return makeSprite('bg/dimension-sky', [image], 'dimension', { anchor: [0, 0], native: true });
}

/**
 * The v2 corridor pylon (24×60, 2 frames): an armoured pillar — lit casing edges, twin glowing
 * conduits that brighten on the second frame, six rib bands, a cap and a foot.
 *
 * @returns {SpriteDef} `enemies/dim-pylon` at the v2 size.
 */
function pylonV2() {
  const w = v2(16);
  const h = v2(40);
  const seed = seedOf('enemies/dim-pylon');
  const frames = [V2.dim, V2.bright].map((core) => {
    const image = createImage(w, h);
    for (let y = 3; y < h - 3; y++) {
      for (let x = 3; x < w - 3; x++) {
        setPixel(image, x, y, x === 3 || x === w - 4 ? V2.edge : V2.shell);
      }
    }
    for (let x = 1; x < w - 1; x++) {
      setPixel(image, x, 0, V2.edge);
      setPixel(image, x, 1, V2.shell);
      setPixel(image, x, 2, core);
      setPixel(image, x, h - 1, V2.edge);
      setPixel(image, x, h - 3, core);
      setPixel(image, x, h - 2, V2.shell);
    }
    for (let y = 6; y < h - 5; y += 9) {
      for (let x = 2; x < w - 2; x++) setPixel(image, x, y, V2.stoneLit);
    }
    for (let y = 8; y < h - 6; y += 12) {
      const x = 9 + pick(y, 5, seed, 6);
      setPixel(image, x, y, V2.bright);
    }
    for (let y = 4; y < h - 4; y++) {
      if ((y % 9) % 3 !== 0) setPixel(image, 9, y, core);
      if ((y % 9) % 3 !== 0) setPixel(image, w - 10, y, core);
    }
    for (let y = 4; y < h - 4; y++) {
      if (y % 9 === 4) {
        setPixel(image, 9, y, V2.edge);
        setPixel(image, w - 10, y, V2.edge);
      }
    }
    return image;
  });
  return makeSprite('enemies/dim-pylon', frames, 'dimension', {
    hitFlash: true,
    animations: { pulse: [0, 1] },
    native: true,
  });
}

/**
 * The v2 maw (42×42, 2 frames): a ring of petals round a glowing throat, shut on frame 0 and
 * gaping on frame 1. The petal field is the octant of the Chebyshev centre, so alternate octants
 * read as separate petals with a dark seam between them.
 *
 * @returns {SpriteDef} `bosses/bloom-maw` at the v2 size.
 */
function bloomMawV2() {
  const n = v2(28);
  const centre = (n - 1) / 2;
  const outer = v2(13.5);
  const seed = seedOf('bosses/bloom-maw');
  const frames = [v2(6), v2(11)].map((gape) => {
    const image = createImage(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x - centre;
        const dy = y - centre;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > outer) continue;
        if (d < gape) {
          setPixel(image, x, y, d < gape - v2(2) ? V2.throat : V2.mawGlow);
          continue;
        }
        const octant = (Math.abs(dx) > Math.abs(dy) ? 0 : 4) + (dx < 0 ? 0 : 2) + (dy < 0 ? 0 : 1);
        const petalSide = octant % 2 === 0 ? V2.petal : V2.petalDark;
        if (d > outer - 3) {
          setPixel(image, x, y, V2.rim);
        } else if (d > outer - 5 && (octant + pick(x, y, seed, 2)) % 3 === 0) {
          setPixel(image, x, y, V2.rim);
        } else {
          setPixel(image, x, y, petalSide);
        }
      }
    }
    return image;
  });
  return makeSprite('bosses/bloom-maw', frames, 'dimension', { hitFlash: true, native: true });
}

/**
 * The v2 claw (27×21, 2 frames): two hooked jaws three pixels thick, apart on frame 0 and shut
 * on frame 1, with an armoured wrist and the hot glow along the tips.
 *
 * @returns {SpriteDef} `bosses/talon-claw` at the v2 size.
 */
function talonClawV2() {
  const w = v2(18);
  const h = v2(14);
  const frames = [6, 2].map((gap) => {
    const image = createImage(w, h);
    const mid = (h - 1) / 2;
    for (let x = 0; x < w; x++) {
      // The jaws taper towards the tip and meet at the gap.
      const reach = Math.round((gap * (w - 1 - x)) / (w - 1)) + 1;
      for (let d = reach; d <= reach + 4; d++) {
        const top = Math.round(mid - d);
        const bottom = Math.round(mid + d);
        if (top >= 0) setPixel(image, x, top, d === reach ? V2.ironEdge : V2.iron);
        if (bottom < h) setPixel(image, x, bottom, d === reach ? V2.ironEdge : V2.iron);
      }
    }
    for (let y = Math.round(mid) - 3; y <= Math.round(mid) + 3; y++) {
      for (let x = 0; x < 5; x++) setPixel(image, x, y, x === 0 ? V2.ironEdge : V2.plate);
    }
    for (let x = w - 6; x < w; x++) {
      setPixel(image, x, Math.round(mid), V2.hot);
      if (x % 2 === 0) {
        setPixel(image, x, Math.round(mid) - 1, V2.hot);
        setPixel(image, x, Math.round(mid) + 1, V2.hot);
      }
    }
    return image;
  });
  return makeSprite('bosses/talon-claw', frames, 'dimension', { hitFlash: true, native: true });
}

/**
 * The v2 leg (15×39, 2 frames): a segmented armour strut with lit edges, a piston at the top,
 * two hot joints and a wide clawed foot — planted on frame 0, lifted four rows on frame 1.
 *
 * @returns {SpriteDef} `bosses/strider-leg` at the v2 size.
 */
function striderLegV2() {
  const w = v2(10);
  const h = v2(26);
  const seed = seedOf('bosses/strider-leg');
  const frames = [0, 4].map((lift) => {
    const image = createImage(w, h);
    const foot = h - 1;
    for (let x = 5; x < w - 5; x++) {
      setPixel(image, x, lift, V2.ironEdge);
    }
    for (let y = lift; y < h - 3; y++) {
      for (let x = 3; x < w - 3; x++) {
        setPixel(image, x, y, x === 3 || x === w - 4 ? V2.edge : V2.iron);
      }
      if (y % 4 === 0 && pick(11, y, seed, 4) === 0) setPixel(image, 4, y, V2.ironEdge);
    }
    for (let y = v2(6) + lift; y < h - 3; y += v2(8)) {
      for (let x = 2; x < w - 2; x++) setPixel(image, x, y, V2.joint);
      if (y + 1 < h - 3) {
        for (let x = 2; x < w - 2; x++) setPixel(image, x, y + 1, V2.plate);
      }
    }
    for (let x = 1; x < w - 1; x++) {
      setPixel(image, x, foot, V2.iron);
      setPixel(image, x, foot - 1, x === 1 || x === w - 2 ? V2.edge : V2.ironEdge);
    }
    setPixel(image, 0, foot, V2.edge);
    setPixel(image, w - 1, foot, V2.edge);
    return image;
  });
  return makeSprite('bosses/strider-leg', frames, 'dimension', {
    hitFlash: true,
    animations: { stride: [0, 1] },
    native: true,
  });
}

/**
 * The silhouette profile of the rift skyline: a coarse lattice every 40 columns interpolated
 * linearly, periodic over the tile width (the same seamless recipe as the zone-A horizon), with
 * three monoliths pressed up out of it.
 *
 * @returns {Int32Array} One top row per column of the band.
 */
function riftProfile() {
  const seed = seedOf('bg/dimension-rift');
  const plain = (x) => {
    const j = Math.floor(x / 40) % 8;
    const t = x % 40;
    const v0 = 24 + (pick(j, 5, seed, 6) - 3);
    const v1 = 24 + (pick((j + 1) % 8, 5, seed, 6) - 3);
    return Math.round(v0 + ((v1 - v0) * t) / 40);
  };
  const top = new Int32Array(BAND_TILE_W);
  for (let x = 0; x < BAND_TILE_W; x++) top[x] = plain(x);
  for (let m = 0; m < 3; m++) {
    const start = pick(m, 11, seed, BAND_TILE_W);
    const len = 26 + pick(m, 12, seed, 30);
    const rise = 8 + pick(m, 13, seed, 12);
    for (let d = 0; d < len; d++) {
      const x = (start + d) % BAND_TILE_W;
      top[x] = Math.max(2, Math.min(top[x], plain(x) - rise));
    }
  }
  return top;
}

/**
 * `bg/dimension-rift` (320×84, 2 frames): the mid band — the violet-lit skyline of the rift the
 * dimension stands on. Its bottom row sits exactly on the ported horizon (band y 84 + height 84
 * = 168), the monoliths' faces carry columns of lit windows that blink between the two frames
 * over the band's own slow `frameTicks` clock.
 *
 * @param {number} k - The frame (0 dark, 1 lit).
 * @returns {Image} The band frame.
 */
function rift(k) {
  const image = createImage(BAND_TILE_W, DIMENSION_RIFT_H);
  const seed = seedOf('bg/dimension-rift');
  const top = riftProfile();
  for (let x = 0; x < BAND_TILE_W; x++) {
    const t = top[x];
    const monolith = t < 18;
    for (let y = t; y < DIMENSION_RIFT_H; y++) {
      const d = y - t;
      let c = monolith ? V2.stone : V2.stoneLit;
      if (d === 0) c = monolith ? V2.stoneTop : V2.edge;
      else if (d === 1 && monolith) c = V2.stoneLit;
      else if (d % 13 === 9 && pick(x, 3, seed, 9) === 0) c = V2.stoneTop;
      else if (!monolith && d % 11 === 5 && pick(x, y, seed, 6) === 0) c = V2.stone;
      if (monolith && d > 2 && x % 5 === 2 && d % 7 === 3) {
        c = k === 0 ? withAlpha(V2.lit, SOFT_ALPHA) : V2.node;
      }
      if (monolith && d > 2 && x % 5 === 3 && d % 7 === 6 && k === 1) {
        c = withAlpha(V2.lit, SOFT_ALPHA);
      }
      if (y === DIMENSION_RIFT_H - 1) c = V2.dark;
      setPixel(image, x, y, c);
    }
  }
  return image;
}

/**
 * The sag of one strand at a column: a coarse lattice every 64 columns interpolated linearly,
 * periodic over the tile width, so the strand wraps seamlessly.
 *
 * @param {number} row - The strand index.
 * @param {number} seed - The sprite's seed.
 * @param {number} x - The column.
 * @returns {number} The row the strand passes at.
 */
function strandRow(row, seed, x) {
  const base = 8 + row * 13;
  const j = Math.floor(x / 64) % 5;
  const t = x % 64;
  const v0 = base + pick(j, row, seed, 7);
  const v1 = base + pick((j + 1) % 5, row, seed, 7);
  return Math.round(v0 + ((v1 - v0) * t) / 64);
}

/**
 * `bg/dimension-strands` (320×48, 2 frames): the fore band — three energised tether strands
 * whipping past the camera along the corridor's ceiling, lit with hanging lamps that blink
 * between the frames. Everything below the strands is transparent: it hangs into the playfield's
 * top rows from `y` 0 and never covers the ship's own lane.
 *
 * @param {number} k - The frame (0 or 1 — the lamps alternate).
 * @returns {Image} The band frame.
 */
function strands(k) {
  const image = createImage(BAND_TILE_W, DIMENSION_STRAND_H);
  const seed = seedOf('bg/dimension-strands');
  for (const row of [0, 1, 2]) {
    for (let x = 0; x < BAND_TILE_W; x++) {
      const y = strandRow(row, seed, x);
      setPixel(image, x, y, V2.strand);
      if (x % 2 === 0) setPixel(image, x, y + 1, withAlpha(V2.strand, SOFT_ALPHA));
      if (x % 16 === (k === 0 ? 0 : 8)) {
        setPixel(image, x, y + 2, V2.strandLit);
        setPixel(image, x, y + 3, withAlpha(V2.strandLit, SOFT_ALPHA));
      }
    }
  }
  return image;
}

/**
 * `decor/dimension-shard-a` (20×34, one frame): a floating crystal sliver — a lens with a lit
 * spine and `SOFT_ALPHA` facets, drawn on the back decor layer above the Mode-7 floor.
 *
 * @returns {SpriteDef} The shard.
 */
function shardA() {
  const w = 20;
  const h = 34;
  const image = createImage(w, h);
  const cx = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    // A lens silhouette: half-width from the geometric mean of the two distances to the tips.
    const bulge = Math.round(Math.sqrt(y * (h - 1 - y)) / 3);
    const rx = Math.min(cx - 1, 1 + bulge);
    for (let x = cx - rx; x <= cx + rx; x++) {
      const edge = x === cx - rx || x === cx + rx;
      if (x === cx) setPixel(image, x, y, V2.shardCore);
      else if (edge) setPixel(image, x, y, V2.shardEdge);
      else setPixel(image, x, y, x < cx ? V2.shardEdge : V2.shard);
    }
  }
  for (let y = 3; y < h - 2; y += 5) {
    setPixel(image, cx, y, V2.bright);
  }
  return makeSprite('decor/dimension-shard-a', [image], 'dimension', {
    anchor: [0, 0],
    native: true,
  });
}

/**
 * `decor/dimension-shard-b` (16×46, one frame): the tall sliver of the pair — a thin blade with
 * a lit spine, its body dark so the corridor keeps its depth.
 *
 * @returns {SpriteDef} The shard.
 */
function shardB() {
  const w = 16;
  const h = 46;
  const image = createImage(w, h);
  const cx = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    const bulge = Math.round(Math.sqrt(y * (h - 1 - y)) / 4);
    const rx = Math.min(cx - 1, 1 + bulge);
    for (let x = cx - rx; x <= cx + rx; x++) {
      const edge = x === cx - rx || x === cx + rx;
      if (x === cx) setPixel(image, x, y, V2.shardCore);
      else if (edge) setPixel(image, x, y, V2.shardEdge);
      else setPixel(image, x, y, V2.shard);
    }
  }
  return makeSprite('decor/dimension-shard-b', [image], 'dimension', {
    anchor: [0, 0],
    native: true,
  });
}

/**
 * `fx/glow-rift` (32×32, centre anchor): the stage's additive violet halo — the radial used by
 * the pylons, the maw and the decor shards (R3-06.L4: the content's `glow` fields name it).
 *
 * @returns {SpriteDef} The glow.
 */
function glowRift() {
  const n = 32;
  const radius = 14;
  const image = createImage(n, n);
  const cx = Math.floor(n / 2);
  const cy = Math.floor(n / 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const r2 = radius * radius;
      if (d2 > r2) continue;
      if (d2 * 9 < r2 * 2) setPixel(image, x, y, V2.glowCore);
      else if (d2 * 3 < r2 * 2) setPixel(image, x, y, withAlpha(V2.glowEdge, SOFT_ALPHA));
    }
  }
  return makeSprite('fx/glow-rift', [image], 'dimension', { anchor: [cx, cy], native: true });
}

// ---------------------------------------------------------------------------- generate ----

/**
 * Generates the dimension stage's art and the M3-02 boss parts.
 *
 * @param {{ tileSize?: number, artScale?: number }} [options] - The build's tile side and art
 *   scale (the pipeline passes both; `tileSize` is unused — the dimension draws no tiles).
 * @returns {SpriteDef[]} At art scale 1 the six v1 sprites (RR-1a: the v1 build never sees the
 *   v2 art); at any other scale the ten v2 sprites at their bible sizes, all `native`.
 */
export function generate(options = {}) {
  const artScale = options.artScale ?? 1;
  if (artScale === 1) {
    return [floorTile(), skyBand(), pylon(), bloomMaw(), talonClaw(), striderLeg()];
  }
  return [
    floorTileV2(),
    skyBandV2(),
    pylonV2(),
    bloomMawV2(),
    talonClawV2(),
    striderLegV2(),
    makeSprite('bg/dimension-rift', [rift(0), rift(1)], 'dimension', {
      anchor: [0, 0],
      native: true,
      animations: { blink: [0, 1] },
    }),
    makeSprite('bg/dimension-strands', [strands(0), strands(1)], 'dimension', {
      anchor: [0, 0],
      native: true,
      animations: { blink: [0, 1] },
    }),
    shardA(),
    shardB(),
    glowRift(),
  ];
}
