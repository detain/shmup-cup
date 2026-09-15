/**
 * Registry of the procedural placeholder generators (decision D24, "art as code").
 *
 * Each generator module exports `generate(): SpriteDef[]`; every sprite it draws is
 * seeded from its own name, so the output never depends on generator order and adding
 * a generator changes no existing pixels. Real art replaces any of these frames by
 * dropping a PNG with the same sprite name into `assets/source/sprites/`.
 *
 * **Public API.** {@link PROCEDURAL_GENERATORS}, {@link generateProceduralSprites}. To add a
 * generator: write `procedural/<id>.mjs` exporting `generate()`, register it here, and test
 * its shapes in `test/scripts/assets/procedural.test.ts` (a zone generator gets its own file —
 * `procedural-zones.test.ts` for `brine` / `dune` of M2-11, `procedural-zones-de.test.ts` for
 * `magma` / `tempest` of M2-12, `procedural-zones-fg.test.ts` for `vault` / `prism` of M2-13,
 * `procedural-zones-hi.test.ts` for `citadel` / `abyss` and the ending scenes' `ending` of M2-14).
 *
 * @module
 */
import * as abyss from './abyss.mjs';
import * as backdrops from './backdrops.mjs';
import * as bosses from './bosses.mjs';
import * as brine from './brine.mjs';
import * as bullets from './bullets.mjs';
import * as citadel from './citadel.mjs';
import * as dimension from './dimension.mjs';
import * as direct from './direct.mjs';
import * as dune from './dune.mjs';
import * as ending from './ending.mjs';
import * as explosions from './explosions.mjs';
import * as hud from './hud.mjs';
import * as items from './items.mjs';
import * as lasers from './lasers.mjs';
import * as magma from './magma.mjs';
import * as palettes from './palettes.mjs';
import * as particles from './particles.mjs';
import * as prism from './prism.mjs';
import * as rasterBands from './raster-bands.mjs';
import * as shields from './shields.mjs';
import * as starfield from './starfield.mjs';
import * as tempest from './tempest.mjs';
import * as terrain from './terrain.mjs';
import * as ui from './ui.mjs';
import * as vault from './vault.mjs';
import * as weapons from './weapons.mjs';

/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * The generators, by id (the module's file name).
 *
 * @type {readonly { id: string, generate: () => SpriteDef[] }[]}
 */
export const PROCEDURAL_GENERATORS = [
  { id: 'abyss', generate: abyss.generate },
  { id: 'backdrops', generate: backdrops.generate },
  { id: 'bosses', generate: bosses.generate },
  { id: 'brine', generate: brine.generate },
  { id: 'bullets', generate: bullets.generate },
  { id: 'citadel', generate: citadel.generate },
  { id: 'dimension', generate: dimension.generate },
  { id: 'direct', generate: direct.generate },
  { id: 'dune', generate: dune.generate },
  { id: 'ending', generate: ending.generate },
  { id: 'explosions', generate: explosions.generate },
  { id: 'hud', generate: hud.generate },
  { id: 'items', generate: items.generate },
  { id: 'lasers', generate: lasers.generate },
  { id: 'magma', generate: magma.generate },
  { id: 'palettes', generate: palettes.generate },
  { id: 'particles', generate: particles.generate },
  { id: 'prism', generate: prism.generate },
  { id: 'raster-bands', generate: rasterBands.generate },
  { id: 'shields', generate: shields.generate },
  { id: 'starfield', generate: starfield.generate },
  { id: 'tempest', generate: tempest.generate },
  { id: 'terrain', generate: terrain.generate },
  { id: 'ui', generate: ui.generate },
  { id: 'vault', generate: vault.generate },
  { id: 'weapons', generate: weapons.generate },
];

/**
 * Runs every generator.
 *
 * @returns {SpriteDef[]} All procedural sprites, in generator order.
 */
export function generateProceduralSprites() {
  return PROCEDURAL_GENERATORS.flatMap((generator) => generator.generate());
}
