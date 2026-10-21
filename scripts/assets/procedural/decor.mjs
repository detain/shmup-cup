/**
 * Pre-registered stub for the decor generator (plan R4-P.P1 registers it so no later R4 /
 * R3-06 subtask edits the registry, wave-07 rule 6). Plan R3-06.L6 fills this module with the
 * zone decoration sprites; until then it generates nothing.
 *
 * @module
 */
/** @typedef {import('../sprite-source.mjs').SpriteDef} SpriteDef */

/**
 * Generates the decor sprites (none yet — this module is a registered stub, filled by R3-06.L6).
 *
 * @param {import('./index.mjs').GeneratorOptions} [options] - The build's options; a later v2
 *   branch may read `options.artScale`.
 * @returns {SpriteDef[]} Nothing until R3-06.L6 fills the module.
 */
export function generate(options = {}) {
  void options; // the step that fills this stub reads `options.artScale`
  return [];
}
