/**
 * Placeholder art of the Direct mode's colour items (plan M2-05, `shmup_feat.md` §9), split out
 * of `direct.mjs` by plan R4-P.P1:
 *
 * - `items/direct-red`, `-green`, `-blue`, `-orange`, `-yellow` (10×10, 2 frames): the colour
 *   items, glossy orbs with a highlight (frame 1 the bright half of the blink);
 *   `items/direct-octagon` (10×10, 2 frames): the red octagon that switches the main-shot family.
 *
 * From R4-02.B2 the v2 path (`artScale !== 1`) draws the art bible §5's **15×15** plates native,
 * glinting over four frames (`blink: [0, 1, 2, 3]`, the count `core/powerups` indexes through
 * `ITEM_KINDS`): the spark — the orb's widened highlight, the octagon's mark catching its left
 * edge — appears on the dark state (frame 1), the plate lights with it (frame 2) and the lit
 * state alone fades (frame 3). Every radius and thickness is the v1 one ×1.5 in v1's colours;
 * at art scale 1 the v1 items, byte for byte.
 *
 * Only exactly rounded maths (square roots, `+ − × ÷`).
 *
 * @module
 */
import { createImage, setPixel } from '../image.mjs';
import { color, makeSprite } from './common.mjs';

/** @typedef {import('../image.mjs').Image} Image */
/** @typedef {import('./index.mjs').GeneratorOptions} GeneratorOptions */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/** The colour items: dark, body, light. */
const ITEM_COLORS = {
  red: ['#5a0c0c', '#e02828', '#ff9090'],
  green: ['#0c4014', '#28c040', '#98ff98'],
  blue: ['#0c1a5a', '#2860e8', '#90b8ff'],
  orange: ['#5a2c08', '#f08020', '#ffd090'],
  yellow: ['#5a4808', '#f0d020', '#fff8a0'],
  octagon: ['#5a0c0c', '#d82020', '#ffb0b0'],
};

/**
 * Draws one colour item frame: a glossy orb, or for the octagon an eight-sided plate with a white
 * centre mark.
 *
 * @param {keyof typeof ITEM_COLORS} name - The item.
 * @param {boolean} bright - The lit half of the blink (the v2 cycle's frames 2–3).
 * @param {boolean} [v2] - Draw the art bible §5's native 15×15 plate: every radius ×1.5, the orb
 *   highlight at (5,5), the octagon's mark the 3×6 block at columns 5–10, rows 6–8.
 * @param {boolean} [spark] - Whether the glint's spark is drawn — the v1 blink lights it exactly
 *   on the bright frame, the v2 cycle carries it on frames 1–2 (the orb widens its highlight to
 *   columns 6–7, the octagon's mark catches the rim column 4).
 * @returns {Image} 10×10 frame (15×15 at `v2`).
 */
function itemFrame(name, bright, v2 = false, spark = bright) {
  const size = v2 ? 15 : 10;
  const image = createImage(size, size);
  const [dark, body, light] = ITEM_COLORS[name].map((c) => color(c));
  const white = color('#ffffff');
  const c = size / 2;
  const outer = v2 ? 6.75 : 4.5;
  const corner = v2 ? 9.75 : 6.5;
  const edge = v2 ? 5.25 : 3.5;
  const worn = v2 ? 8.25 : 5.5;
  const rOut = v2 ? 6.9 : 4.6;
  const rIn = v2 ? 5.4 : 3.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const inside =
        name === 'octagon'
          ? Math.abs(dx) <= outer && Math.abs(dy) <= outer && Math.abs(dx) + Math.abs(dy) <= corner
          : dx * dx + dy * dy <= rOut * rOut;
      if (!inside) continue;
      const rim =
        name === 'octagon'
          ? Math.abs(dx) > edge || Math.abs(dy) > edge || Math.abs(dx) + Math.abs(dy) > worn
          : dx * dx + dy * dy > rIn * rIn;
      setPixel(image, x, y, rim ? dark : bright ? light : body);
    }
  }
  if (name === 'octagon') {
    if (v2) {
      for (let x = spark ? 4 : 5; x <= 10; x++) {
        for (let y = 6; y <= 8; y++) setPixel(image, x, y, white);
      }
    } else {
      for (let i = 3; i <= 6; i++) {
        setPixel(image, i, 4, white);
        setPixel(image, i, 5, white);
      }
    }
  } else if (v2) {
    setPixel(image, 5, 5, white);
    if (spark) {
      setPixel(image, 6, 5, white);
      setPixel(image, 7, 5, white);
    }
  } else {
    setPixel(image, 3, 3, white);
    if (spark) setPixel(image, 4, 3, white);
  }
  return image;
}

/** The v2 glint cycle's stages: 0 dark, 1 dark + spark, 2 lit + spark, 3 lit plain. */
const V2_STAGES = [0, 1, 2, 3];

/**
 * Generates the Direct-mode colour items.
 *
 * @param {GeneratorOptions} [options] - `artScale`, the art scale the six items are drawn at
 *   (default 1).
 * @returns {SpriteDef[]} The six items (see the module docs).
 * @throws {RangeError} When `options.artScale` is not a valid art scale (`interim.mjs`
 *   `parseArtScale`).
 */
export function generate(options = {}) {
  const v2 = (options.artScale ?? 1) !== 1;
  return ['red', 'green', 'blue', 'orange', 'yellow', 'octagon'].map((name) =>
    makeSprite(
      `items/direct-${name}`,
      v2
        ? V2_STAGES.map((stage) =>
            itemFrame(
              /** @type {keyof typeof ITEM_COLORS} */ (name),
              stage >= 2,
              true,
              stage === 1 || stage === 2,
            ),
          )
        : [
            itemFrame(/** @type {keyof typeof ITEM_COLORS} */ (name), false),
            itemFrame(/** @type {keyof typeof ITEM_COLORS} */ (name), true),
          ],
      'direct-items',
      {
        animations: v2 ? { blink: [0, 1, 2, 3] } : { blink: [0, 1] },
        native: v2,
      },
    ),
  );
}
