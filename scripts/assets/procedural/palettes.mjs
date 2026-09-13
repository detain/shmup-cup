/**
 * Colour-blind bullet palettes (plan M2-02, `shmup_feat.md` §12 readability and §21
 * accessibility): every enemy bullet, laser beam and bending laser segment is drawn again for each
 * palette of {@link BULLET_PALETTES} as `<sprite>@<palette>` — `bullets/oval-red@deuteranopia`,
 * `lasers/beam-pink@tritanopia` … The renderer swaps the whole set when the player picks a
 * palette (render-pixi `palette`: a sprite without a variant keeps its standard frames).
 *
 * Each palette recolours the three colour families to hues that stay apart for that kind of
 * colour blindness and away from the gold items and orange explosions (light magenta, sky blue and
 * near-white for red–green blindness; crimson, teal and near-white for blue–yellow blindness),
 * and adds **shape coding** to the bullets' cores so the families differ without colour: pink
 * keeps the solid bright core, red gets a dark centre pixel (a ring), purple a single bright dot.
 * The palette names match `@shmup/core` `BULLET_PALETTES` (the `standard` palette is the plain
 * sprites); `pnpm content:check` checks every variant of every engine bullet sprite exists.
 *
 * @module
 */
import { bulletSprites } from './bullets.mjs';
import { laserSprites } from './lasers.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */
/** @typedef {import('./bullets.mjs').CoreMark} CoreMark */

/**
 * Body colours of the three bullet colour families per colour-blind palette.
 *
 * @type {Readonly<Record<string, Readonly<{ pink: string, red: string, purple: string }>>>}
 */
export const BULLET_PALETTES = Object.freeze({
  deuteranopia: Object.freeze({ pink: '#ff8ad8', red: '#3ab0ff', purple: '#e4e4ff' }),
  protanopia: Object.freeze({ pink: '#ff9ce4', red: '#44c4ff', purple: '#eeeeff' }),
  tritanopia: Object.freeze({ pink: '#ff4870', red: '#22d8cc', purple: '#f2f2f2' }),
});

/**
 * Shape coding of the cores per colour family (the same in every colour-blind palette).
 *
 * @type {Readonly<{ pink: CoreMark, red: CoreMark, purple: CoreMark }>}
 */
export const CORE_MARKS = Object.freeze({ pink: 'solid', red: 'ring', purple: 'dot' });

/**
 * Generates every colour-blind variant.
 *
 * @returns {SpriteDef[]} For each palette: the nine bullets (shape-coded), the three beams and
 *   the three bending laser segments, named `<sprite>@<palette>`.
 */
export function generate() {
  /** @type {SpriteDef[]} */
  const sprites = [];
  for (const [palette, colours] of Object.entries(BULLET_PALETTES)) {
    sprites.push(...bulletSprites(colours, `@${palette}`, CORE_MARKS, 'palettes'));
    sprites.push(...laserSprites(colours, `@${palette}`, 'palettes'));
  }
  return sprites;
}
