/**
 * Pre-registered stub for the thruster generator (plan R4-P.P1 registers it so no later R4 /
 * R3-06 subtask edits the registry, wave-07 rule 6). The R4 step that draws the ship's thruster
 * frames fills this module; until then it generates nothing.
 *
 * @module
 */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * Generates the thruster sprites (none yet — this module is a registered stub).
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's options; a later v2
 *   branch may read `options.artScale`.
 * @returns {SpriteDef[]} Nothing until the R4 step fills the module.
 */
export function generate(options = {}) {
  void options; // the R4 step that fills this stub reads `options.artScale`
  return [];
}
