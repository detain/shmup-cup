/**
 * The power capsule `items/capsule` (12×8, 2 frames): an orange-red pill with a dark rim
 * and a highlight band; frame 1 is the bright half of its blink (`blink: [0, 1]`).
 *
 * The blue capsule `items/capsule-blue` (12×8, 2 frames, plan M2-04): the same pill in blue
 * with a white core — the rare pickup that clears the screen's enemies.
 *
 * The point item `items/point` (5×5, 2 frames at v1, plan M2-02): a small gold diamond with a dark
 * rim that cancelled bullets turn into; frame 1 is its twinkle (a white centre and tips).
 * From `R4-02.B3` the v2 path draws it native at the art bible §5's **7×7** over four twinkle
 * frames — the white spark travels the rim outward and back: the body, the cardinal tips, the
 * whole rim, the rim without the tips — v1's three colours only; at art scale 1 the v1 diamond.
 *
 * The bonus stages' items (plan M2-10): `items/capsule-bonus` (12×8, 2 frames) — the pill in gold,
 * worth 1,000 points — and `items/1up` (12×8, 2 frames) — the pill in green with a white `+`, an
 * extra life.
 *
 * From R4-02.B2 the four pills (capsule, capsule-blue, capsule-bonus, 1up) draw native on the
 * v2 path (`artScale !== 1`): the art bible §5's **18×12** pills glinting over four frames — the
 * spark appears on the dim body (frame 1), the pill lights with it (frame 2) and the flash alone
 * fades (frame 3) before the cycle restarts — `blink: [0, 1, 2, 3]`, the count `core/powerups`
 * indexes through `ITEM_KINDS`. v1's colours only; at art scale 1 the v1 pills, byte for byte.
 *
 * w15-C adds the variety art. The four flavoured capsules (`items/capsule-weapon` `-option`
 * `-power` `-speed`) are the red / blue / gold / green pill with a white `W` / `O` / `!` / `»`
 * mark — the icon `core/powerups` picks by the meter cursor's next stop, presentation only, the
 * pickup stays the plain capsule. The three drop crates (`items/crate-weapon`, `items/crate-mega`,
 * `items/crate-speed`) are square 12×12 (v2 18×18) ammunition boxes in the same three languages
 * with the matching glyph, and they blink on the pills' cycle. Both sets are interim marks:
 * GEN-6's item asks carry the real designs (the lane report's art-ask list).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('./index.mjs').GeneratorOptions} GeneratorOptions */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * Distance-like test for a rounded rectangle (pill).
 *
 * @param {number} x - Pixel column.
 * @param {number} y - Pixel row.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {number} inset - Shrinks the shape by this many pixels.
 * @returns {boolean} Whether the pixel centre lies inside.
 */
function insidePill(x, y, w, h, inset) {
  const r = h / 2 - inset;
  const cx = Math.min(Math.max(x + 0.5, r + inset), w - r - inset);
  const cy = h / 2;
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Colours of a capsule: rim, body (dim / lit), band (dim / lit). */
const CAPSULE_COLORS = {
  red: { rim: '#5a1408', body: ['#e04a18', '#ff7a30'], band: ['#f89850', '#ffd080'] },
  blue: { rim: '#08164a', body: ['#2458d8', '#4c8cff'], band: ['#78b0ff', '#e0f0ff'] },
  gold: { rim: '#5a3a04', body: ['#d8a018', '#ffd040'], band: ['#f8d878', '#fff4c0'] },
  green: { rim: '#0a3a10', body: ['#28a838', '#50e060'], band: ['#90f098', '#e0ffe0'] },
};

/**
 * Draws one capsule frame.
 *
 * @param {boolean} bright - The lit blink frame (the v2 cycle's frames 2–3).
 * @param {'red' | 'blue' | 'gold' | 'green'} [tint] - The capsule's colours (default the red
 *   power capsule).
 * @param {boolean} [v2] - Draw the art bible §5's native 18×12 pill: the v1 shape ×1.5, the band
 *   on rows 3–4, the spark the 3×2 white block at columns 5–7 of the band (the v1 glint's
 *   (3,2)–(4,2) ×1.5).
 * @param {boolean} [spark] - Whether the white spark is drawn — the v1 blink lights it exactly on
 *   the bright frame, the v2 cycle carries it on frames 1–2 and drops it before the fade.
 * @returns {Image} 12×8 frame (18×12 at `v2`).
 */
function capsule(bright, tint = 'red', v2 = false, spark = bright) {
  const w = v2 ? 18 : 12;
  const h = v2 ? 12 : 8;
  const colors = CAPSULE_COLORS[tint];
  const rim = color(colors.rim);
  const body = color(colors.body[bright ? 1 : 0]);
  const band = color(colors.band[bright ? 1 : 0]);
  const glint = color('#ffffff');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!insidePill(x, y, w, h, 0)) continue;
      if (!insidePill(x, y, w, h, 1)) setPixel(image, x, y, rim);
      else setPixel(image, x, y, (v2 ? y === 3 || y === 4 : y === 2) ? band : body);
    }
  }
  if (spark) {
    if (v2) {
      for (let x = 5; x <= 7; x++) {
        setPixel(image, x, 3, glint);
        setPixel(image, x, 4, glint);
      }
    } else {
      setPixel(image, 3, 2, glint);
      setPixel(image, 4, 2, glint);
    }
  }
  return image;
}

/**
 * Draws one 1UP frame: the green pill with a white `+` in its middle.
 *
 * @param {boolean} bright - The lit blink frame (the v2 cycle's frames 2–3).
 * @param {boolean} [v2] - Draw the native 18×12 pill: the `+` is the v1 one ×1.5 — the bar on
 *   rows 6–7, columns 6–12, the stem in columns 9–10, rows 3–8.
 * @param {boolean} [spark] - Whether the pill's white spark is drawn (see {@link capsule}).
 * @returns {Image} 12×8 frame (18×12 at `v2`).
 */
function oneUp(bright, v2 = false, spark = bright) {
  const image = capsule(bright, 'green', v2, spark);
  const white = color('#ffffff');
  if (v2) {
    for (let x = 6; x <= 12; x++) {
      setPixel(image, x, 6, white);
      setPixel(image, x, 7, white);
    }
    for (let y = 3; y <= 8; y++) {
      setPixel(image, 9, y, white);
      setPixel(image, 10, y, white);
    }
  } else {
    for (let d = -2; d <= 2; d++) {
      setPixel(image, 6 + d, 4, white);
      setPixel(image, 6, 4 + (d < 0 ? d : d > 1 ? 1 : d), white);
    }
  }
  return image;
}

/**
 * The white marks of the flavoured capsule pills (w15-C V1), as v1 `[x, y]` pixels on the 12×8
 * pill: `W` (a weapon stop), `O` (the OPTION stop), `!` (the `?` / `!` power stops) and `»`
 * (SPEED). The v2 path shifts the mark by (3, 2) into the wider pill rather than rescaling it —
 * interim art at its simplest, the real flavoured capsules are GEN-6 asks (the lane report).
 */
const FLAVOR_MARKS = {
  weapon: [
    [4, 1],
    [8, 1],
    [4, 2],
    [8, 2],
    [4, 3],
    [6, 3],
    [8, 3],
    [5, 4],
    [7, 4],
  ],
  option: [
    [5, 1],
    [6, 1],
    [7, 1],
    [8, 1],
    [5, 2],
    [8, 2],
    [5, 3],
    [8, 3],
    [5, 4],
    [8, 4],
    [5, 5],
    [6, 5],
    [7, 5],
    [8, 5],
  ],
  power: [
    [6, 1],
    [7, 1],
    [6, 2],
    [7, 2],
    [6, 3],
    [7, 3],
    [6, 5],
    [7, 5],
  ],
  speed: [
    [4, 1],
    [5, 2],
    [5, 3],
    [4, 4],
    [6, 1],
    [7, 2],
    [7, 3],
    [6, 4],
  ],
};

/**
 * Paints a white mark over an image (see {@link FLAVOR_MARKS} for the v1-to-v2 shift).
 *
 * @param {Image} image - The frame to mark in place.
 * @param {number[][]} pixels - `[x, y]` pixels in v1 coordinates.
 * @param {boolean} v2 - Shift by (3, 2) instead of drawing at the given pixels.
 */
function paintMark(image, pixels, v2) {
  const white = color('#ffffff');
  const ox = v2 ? 3 : 0;
  const oy = v2 ? 2 : 0;
  for (const [x, y] of pixels) setPixel(image, x + ox, y + oy, white);
}

/** Colours of a drop crate (w15-C V2): rim and body (dim / lit) — a wooden ammunition box. */
const CRATE_COLORS = {
  weapon: { rim: '#40100a', body: ['#8a2414', '#b03820'] },
  mega: { rim: '#4a3408', body: ['#b07818', '#d8a030'] },
  speed: { rim: '#0a3a10', body: ['#20842c', '#38ac44'] },
};

/**
 * The white glyphs of the crates' faces (w15-C V2), as v1 `[x, y]` pixels on the 12×12 box:
 * `W` (weapons), `!` (the `!` slot) and `›` (the speed arrow). The v2 path shifts them by (3, 4)
 * onto its larger face — interim art, GEN-6 will draw the real crates.
 */
const CRATE_GLYPHS = {
  weapon: [
    [3, 5],
    [7, 5],
    [3, 6],
    [7, 6],
    [3, 7],
    [5, 7],
    [7, 7],
    [4, 8],
    [6, 8],
  ],
  mega: [
    [5, 5],
    [6, 5],
    [5, 6],
    [6, 6],
    [5, 7],
    [6, 7],
    [5, 9],
    [6, 9],
  ],
  speed: [
    [4, 5],
    [5, 6],
    [6, 6],
    [5, 7],
    [4, 8],
    [6, 7],
  ],
};

/**
 * Draws one drop-crate frame (w15-C V2): a square box (12×12, the v2 path 18×18 native), rim
 * outline, a lid seam across the upper third, rim-coloured corner braces and a white glyph on the
 * face. It blinks like the pills (the `bright` half lights the body).
 *
 * @param {boolean} bright - The lit blink frame (the v2 cycle's frames 2–3).
 * @param {'weapon' | 'mega' | 'speed'} tone - The crate's colours.
 * @param {boolean} v2 - Draw at 18×18 instead of 12×12.
 * @param {boolean} glyph - Whether the white glyph is drawn (lit on every frame it shows: crates
 *   keep their glyph through the blink, only the body lights and dims).
 * @returns {Image} 12×12 frame (18×18 at `v2`).
 */
function crate(bright, tone, v2 = false, glyph = true) {
  const w = v2 ? 18 : 12;
  const h = v2 ? 18 : 12;
  const c = CRATE_COLORS[tone];
  const rim = color(c.rim);
  const body = color(c.body[bright ? 1 : 0]);
  const white = color('#ffffff');
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const lid = v2 ? y === 4 || y === 5 : y === 3;
      const corner =
        (x === 1 || x === w - 2) &&
        (y === 1 || y === h - 2 || (v2 && (y === 2 || y === h - 3))) &&
        !edge;
      setPixel(image, x, y, edge || lid || corner ? rim : body);
    }
  }
  if (glyph) {
    const ox = v2 ? 3 : 0;
    const oy = v2 ? 4 : 0;
    for (const [x, y] of CRATE_GLYPHS[tone]) setPixel(image, x + ox, y + oy, white);
  }
  return image;
}

/**
 * Draws one point item frame: a gold diamond (|dx| + |dy| ≤ 2), rim on its outline.
 *
 * @param {boolean} twinkle - The bright frame (white centre and tips).
 * @returns {Image} 5×5 frame.
 */
function point(twinkle) {
  const image = createImage(5, 5);
  const rim = color('#6a4808');
  const body = color('#ffc830');
  const white = color('#ffffff');
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const d = Math.abs(x - 2) + Math.abs(y - 2);
      if (d > 2) continue;
      const tip = d === 2 && (x === 2 || y === 2);
      setPixel(image, x, y, d === 0 ? white : d === 2 ? (twinkle && tip ? white : rim) : body);
    }
  }
  if (twinkle) setPixel(image, 2, 2, white);
  return image;
}

/**
 * Draws one v2 point item frame: the v1 diamond ×1.5 — a 7×7 gold diamond
 * (|dx| + |dy| ≤ 3), rim on its outline, the white centre on every frame. The four
 * frames are the twinkle cycle `core/bullets` indexes with `(age >> 3) & 3`: the
 * spark travels the rim — 0 the plain body, 1 the cardinal tips lit (v1's twinkle),
 * 2 the whole rim lit, 3 the rim lit without the tips as it fades.
 *
 * @param {number} stage - The glint cycle stage (`V2_STAGES`, 0–3).
 * @returns {Image} 7×7 frame.
 */
function pointV2(stage) {
  const image = createImage(7, 7);
  const rim = color('#6a4808');
  const body = color('#ffc830');
  const white = color('#ffffff');
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const d = Math.abs(x - 3) + Math.abs(y - 3);
      if (d > 3) continue;
      if (d === 0) {
        setPixel(image, x, y, white);
        continue;
      }
      if (d === 3) {
        const card = x === 3 || y === 3;
        const lit = stage === 2 || (stage === 1 && card) || (stage === 3 && !card);
        setPixel(image, x, y, lit ? white : rim);
        continue;
      }
      setPixel(image, x, y, body);
    }
  }
  return image;
}

/** The v2 glint cycle's stages: 0 dim, 1 dim + spark, 2 lit + spark, 3 lit plain. */
const V2_STAGES = [0, 1, 2, 3];

/**
 * Generates the item sprites.
 *
 * @param {GeneratorOptions} [options] - `artScale`, the art scale the pills and the point item
 *   are drawn at (default 1; from `R4-02.B3` the point's v2 art is native 7×7 over four frames).
 * @returns {SpriteDef[]} `items/capsule`, `items/point`, `items/capsule-blue`,
 *   `items/capsule-bonus` and `items/1up`; the w15-C flavoured capsules `items/capsule-weapon`,
 *   `-option`, `-power` and `-speed` (the pill with a `W` / `O` / `!` / `»` mark) and the drop
 *   crates `items/crate-weapon`, `items/crate-mega` and `items/crate-speed`.
 * @throws {RangeError} When `options.artScale` is not a valid art scale — thrown by the
 *   caller's `parseArtScale` (`scripts/assets/interim.mjs`) before `generate()` runs;
 *   `generate()` itself does not validate the scale.
 */
export function generate(options = {}) {
  const v2 = (options.artScale ?? 1) !== 1;
  const blink = v2 ? { blink: [0, 1, 2, 3] } : { blink: [0, 1] };
  /**
   * The four v2 frames of one pill (or the two v1 ones).
   *
   * @param {(bright: boolean, v2: boolean, spark: boolean) => Image} frame - Draws one frame.
   * @returns {Image[]} The sprite's frames.
   */
  const pill = (frame) =>
    v2
      ? V2_STAGES.map((stage) => frame(stage >= 2, true, stage === 1 || stage === 2))
      : [frame(false, false, false), frame(true, false, true)];
  /**
   * One flavoured capsule (w15-C V1): the tinted pill with its white mark.
   *
   * @param {'red' | 'blue' | 'gold' | 'green'} tint - The pill's colours.
   * @param {'weapon' | 'option' | 'power' | 'speed'} mark - The mark (see {@link FLAVOR_MARKS}).
   * @returns {Image[]} The sprite's frames.
   */
  const marked = (tint, mark) =>
    pill((b, n, s) => {
      const image = capsule(b, tint, n, s);
      paintMark(image, FLAVOR_MARKS[mark], n);
      return image;
    });
  /**
   * One drop crate (w15-C V2): the box blinks like the pills (the glyph always shows).
   *
   * @param {'weapon' | 'mega' | 'speed'} tone - The crate's colours.
   * @returns {Image[]} The sprite's frames.
   */
  const crateFrames = (tone) =>
    v2
      ? V2_STAGES.map((stage) => crate(stage >= 2, tone, true))
      : [crate(false, tone), crate(true, tone)];
  return [
    makeSprite(
      'items/capsule',
      pill((b, n, s) => capsule(b, 'red', n, s)),
      'items',
      {
        animations: blink,
        native: v2,
      },
    ),
    makeSprite(
      'items/point',
      v2 ? V2_STAGES.map((stage) => pointV2(stage)) : [point(false), point(true)],
      'items',
      {
        animations: v2 ? { twinkle: [0, 1, 2, 3] } : { twinkle: [0, 1] },
        native: v2,
      },
    ),
    makeSprite(
      'items/capsule-blue',
      pill((b, n, s) => capsule(b, 'blue', n, s)),
      'items',
      {
        animations: blink,
        native: v2,
      },
    ),
    makeSprite(
      'items/capsule-bonus',
      pill((b, n, s) => capsule(b, 'gold', n, s)),
      'items',
      {
        animations: blink,
        native: v2,
      },
    ),
    makeSprite(
      'items/1up',
      pill((b, n, s) => oneUp(b, n, s)),
      'items',
      {
        animations: blink,
        native: v2,
      },
    ),
    makeSprite('items/capsule-weapon', marked('red', 'weapon'), 'items', {
      animations: blink,
      native: v2,
    }),
    makeSprite('items/capsule-option', marked('blue', 'option'), 'items', {
      animations: blink,
      native: v2,
    }),
    makeSprite('items/capsule-power', marked('gold', 'power'), 'items', {
      animations: blink,
      native: v2,
    }),
    makeSprite('items/capsule-speed', marked('green', 'speed'), 'items', {
      animations: blink,
      native: v2,
    }),
    makeSprite('items/crate-weapon', crateFrames('weapon'), 'items', {
      animations: blink,
      native: v2,
    }),
    makeSprite('items/crate-mega', crateFrames('mega'), 'items', {
      animations: blink,
      native: v2,
    }),
    makeSprite('items/crate-speed', crateFrames('speed'), 'items', {
      animations: blink,
      native: v2,
    }),
  ];
}
