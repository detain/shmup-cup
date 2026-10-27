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
 * with the matching glyph. Per the owner's art-budget ruling of 2026-10-26 (the ENRICH pass) both
 * sets animate at full size: the flavored pills run the four-stage glint cycle at either scale
 * (the v2 marks rescaled ×1.5) and the crates shimmer over six blink stages with corner and lid
 * spark pulses (their v2 glyphs and pips rescaled ×1.5). GEN-6's item asks carry the real
 * designs (the lane report's art-ask list); the interim art is now budget-free and complete.
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
 * (SPEED). The v2 path draws them rescaled ×1.5 with {@link scalePixels} — the owner's
 * art-budget ruling of 2026-10-26 (ENRICH): a mark at the pill's own scale, bold enough to read
 * on a TV at ×3 (it was a (3,2)-shifted v1 mark before, interim at art-scale 1's size).
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
 * Rescales v1 `[x, y]` pixels to the v2 canvas: every pixel becomes a 2×2 stamp at its
 * ⌊1.5·p⌋ grid position (the art bible's ×1.5 with nearest-neighbour growth — the w15-C
 * ENRICH pass; stamps of neighbouring pixels merge, so strokes stay solid).
 *
 * @param {number[][]} pixels - Pixels in v1 coordinates.
 * @returns {number[][]} The v2 pixels.
 */
function scalePixels(pixels) {
  const out = [];
  for (const [x, y] of pixels) {
    const sx = Math.floor(1.5 * x);
    const sy = Math.floor(1.5 * y);
    out.push([sx, sy], [sx + 1, sy], [sx, sy + 1], [sx + 1, sy + 1]);
  }
  return out;
}

/**
 * Paints a white mark over an image (see {@link FLAVOR_MARKS}).
 *
 * @param {Image} image - The frame to mark in place.
 * @param {number[][]} pixels - `[x, y]` pixels (v2 marks pre-rescaled by {@link scalePixels}).
 */
function paintMark(image, pixels) {
  const white = color('#ffffff');
  for (const [x, y] of pixels) setPixel(image, x, y, white);
}

/** Colours of a drop crate (w15-C V2): rim and body (dim / lit) — a wooden ammunition box. */
const CRATE_COLORS = {
  weapon: { rim: '#40100a', body: ['#8a2414', '#b03820'] },
  mega: { rim: '#4a3408', body: ['#b07818', '#d8a030'] },
  speed: { rim: '#0a3a10', body: ['#20842c', '#38ac44'] },
};

/**
 * The white glyphs of the crates' faces (w15-C V2), as v1 `[x, y]` pixels on the 12×12 box:
 * `W` (weapons), `!` (the `!` slot) and `›` (the speed arrow). The v2 path draws them rescaled
 * ×1.5 with {@link scalePixels} — the owner's art-budget ruling of 2026-10-26 (ENRICH), the
 * glyph at the crate's own scale (it was a (3,4)-shifted v1 glyph before).
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
 * The crate blink's spark pulses (w15-C ENRICH, the owner's art-budget ruling of 2026-10-26):
 * white glint pips inside the corner braces and on the lid seam, alternating through the six
 * stages so a crate shimmers as it falls. v1 coordinates; the v2 path scales them with
 * {@link scalePixels} like the glyphs.
 */
const CRATE_SPARKS = {
  /** The four inside-corner pips (stages 1–2). */
  corner: [
    [2, 2],
    [9, 2],
    [2, 9],
    [9, 9],
  ],
  /** Two pips on the lid seam (stages 4–5). */
  lid: [
    [3, 3],
    [8, 3],
  ],
};

/**
 * The six blink stages of every item sprite the ENRICH pass grew (w15-C): 0 dim, 1 dim + corner
 * spark, 2 lit + corner spark, 3 lit, 4 lit + lid spark, 5 dim + lid spark. The pills' cycle is
 * the first four (their spark is the pill glint), the crates run all six.
 */
const BLINK_STAGES = [0, 1, 2, 3, 4, 5];

/**
 * Whether blink stage `stage` draws its frame lit (frames 2–4 of the six; the pills' four-frame
 * cycle lights 2–3 — the same rule cut at stage 4).
 *
 * @param {number} stage - The blink stage (0–5).
 * @returns {boolean} The bright half of the cycle.
 */
function stageBright(stage) {
  return stage >= 2 && stage <= 4;
}

/**
 * Which spark a crate's blink stage shows: 1 the corner pips (stages 1–2), 2 the lid pips
 * (stages 4–5), 0 none.
 *
 * @param {number} stage - The blink stage (0–5).
 * @returns {0 | 1 | 2} The spark.
 */
function crateSpark(stage) {
  if (stage === 1 || stage === 2) return 1;
  return stage === 4 || stage === 5 ? 2 : 0;
}

/**
 * Draws one drop-crate frame (w15-C V2): a square box (12×12, the v2 path 18×18 native), rim
 * outline, a lid seam across the upper third, rim-coloured corner braces and a white glyph on the
 * face. It blinks over the six stages of {@link BLINK_STAGES} (the ENRICH pass — four before
 * 2026-10-26), the corner and lid sparks travelling the cycle while the glyph always shows.
 *
 * @param {number} stage - The blink stage (0–5).
 * @param {'weapon' | 'mega' | 'speed'} tone - The crate's colours.
 * @param {boolean} v2 - Draw at 18×18 instead of 12×12.
 * @returns {Image} 12×12 frame (18×18 at `v2`).
 */
function crate(stage, tone, v2 = false) {
  const w = v2 ? 18 : 12;
  const h = v2 ? 18 : 12;
  const c = CRATE_COLORS[tone];
  const rim = color(c.rim);
  const body = color(c.body[stageBright(stage) ? 1 : 0]);
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
  const spark = crateSpark(stage);
  const glyphs = v2 ? scalePixels(CRATE_GLYPHS[tone]) : CRATE_GLYPHS[tone];
  if (spark !== 0) {
    const pips = v2
      ? scalePixels(spark === 1 ? CRATE_SPARKS.corner : CRATE_SPARKS.lid)
      : spark === 1
        ? CRATE_SPARKS.corner
        : CRATE_SPARKS.lid;
    for (const [x, y] of pips) setPixel(image, x, y, white);
  }
  for (const [x, y] of glyphs) setPixel(image, x, y, white);
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
  // The ENRICH blink (owner art-budget ruling 2026-10-26): the flavored pills run the full
  // four-stage glint cycle at BOTH scales (v1's base pills keep their two frames — the flavor
  // is drawn for `ItemKind.Capsule`, whose frame index cycles %4) and the crates shimmer over
  // six stages.
  const flavorBlink = { blink: [0, 1, 2, 3] };
  const crateBlink = { blink: [0, 1, 2, 3, 4, 5] };
  /**
   * The four frames of one pill (or the two v1 ones).
   *
   * @param {(bright: boolean, v2: boolean, spark: boolean) => Image} frame - Draws one frame.
   * @returns {Image[]} The sprite's frames.
   */
  const pill = (frame) =>
    v2
      ? V2_STAGES.map((stage) => frame(stage >= 2, true, stage === 1 || stage === 2))
      : [frame(false, false, false), frame(true, false, true)];
  /**
   * One flavoured capsule (w15-C V1): the tinted pill with its white mark over the full glint
   * cycle at both scales; the v2 mark is the v1 one rescaled ×1.5 (the ENRICH pass).
   *
   * @param {'red' | 'blue' | 'gold' | 'green'} tint - The pill's colours.
   * @param {'weapon' | 'option' | 'power' | 'speed'} mark - The mark (see {@link FLAVOR_MARKS}).
   * @returns {Image[]} The sprite's four frames.
   */
  const marked = (tint, mark) => {
    const pixels = v2 ? scalePixels(FLAVOR_MARKS[mark]) : FLAVOR_MARKS[mark];
    return V2_STAGES.map((stage) => {
      const image = capsule(stage >= 2, tint, v2, stage === 1 || stage === 2);
      paintMark(image, pixels);
      return image;
    });
  };
  /**
   * One drop crate (w15-C V2): the box blinks over the six ENRICH stages, corner and lid
   * sparks alternating; the v2 glyph and pips are the v1 ones rescaled ×1.5.
   *
   * @param {'weapon' | 'mega' | 'speed'} tone - The crate's colours.
   * @returns {Image[]} The sprite's six frames.
   */
  const crateFrames = (tone) => BLINK_STAGES.map((stage) => crate(stage, tone, v2));
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
      animations: flavorBlink,
      native: v2,
    }),
    makeSprite('items/capsule-option', marked('blue', 'option'), 'items', {
      animations: flavorBlink,
      native: v2,
    }),
    makeSprite('items/capsule-power', marked('gold', 'power'), 'items', {
      animations: flavorBlink,
      native: v2,
    }),
    makeSprite('items/capsule-speed', marked('green', 'speed'), 'items', {
      animations: flavorBlink,
      native: v2,
    }),
    makeSprite('items/crate-weapon', crateFrames('weapon'), 'items', {
      animations: crateBlink,
      native: v2,
    }),
    makeSprite('items/crate-mega', crateFrames('mega'), 'items', {
      animations: crateBlink,
      native: v2,
    }),
    makeSprite('items/crate-speed', crateFrames('speed'), 'items', {
      animations: crateBlink,
      native: v2,
    }),
  ];
}
