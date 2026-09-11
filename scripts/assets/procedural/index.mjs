/**
 * Registry of the procedural placeholder generators (decision D24, "art as code").
 *
 * Each generator module exports `generate(): SpriteDef[]`; every sprite it draws is
 * seeded from its own name, so the output never depends on generator order and adding
 * a generator changes no existing pixels. Real art replaces any of these frames by
 * dropping a PNG with the same sprite name into `assets/source/sprites/`.
 *
 * @module
 */
import * as bullets from './bullets.mjs';
import * as explosions from './explosions.mjs';
import * as hud from './hud.mjs';
import * as items from './items.mjs';
import * as particles from './particles.mjs';
import * as shields from './shields.mjs';
import * as starfield from './starfield.mjs';
import * as terrain from './terrain.mjs';
import * as ui from './ui.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * The generators, by id (the module's file name).
 *
 * @type {readonly { id: string, generate: () => SpriteDef[] }[]}
 */
export const PROCEDURAL_GENERATORS = [
  { id: 'bullets', generate: bullets.generate },
  { id: 'explosions', generate: explosions.generate },
  { id: 'hud', generate: hud.generate },
  { id: 'items', generate: items.generate },
  { id: 'particles', generate: particles.generate },
  { id: 'shields', generate: shields.generate },
  { id: 'starfield', generate: starfield.generate },
  { id: 'terrain', generate: terrain.generate },
  { id: 'ui', generate: ui.generate },
];

/**
 * Runs every generator.
 *
 * @returns {SpriteDef[]} All procedural sprites, in generator order.
 */
export function generateProceduralSprites() {
  return PROCEDURAL_GENERATORS.flatMap((generator) => generator.generate());
}
