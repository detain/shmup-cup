/**
 * Seeded random numbers for the procedural placeholder generators.
 *
 * sfc32 — the same step function as `@shmup/core`'s `rng` module — seeded through a
 * splitmix32 variant of its own (Murmur3 finaliser constants, no warm-up rounds), so a
 * seed gives a different sequence here than in core; nothing needs them to match.
 * Implemented with 32-bit integer operations only, so every engine produces the same
 * sequence and `pnpm assets` stays byte-identical between runs and machines.
 * Every generator owns its own seed: adding a generator never changes another one's art.
 *
 * @module
 */

/**
 * A seeded random number generator.
 *
 * @typedef {object} AssetRng
 * @property {() => number} nextU32 - Next unsigned 32-bit integer.
 * @property {() => number} nextFloat - Next float in `[0, 1)` (`nextU32() / 2^32`).
 * @property {(min: number, max: number) => number} rangeInt - Integer in `[min, max]`.
 * @property {(probability: number) => boolean} chance - `true` with the given probability.
 */

/**
 * One splitmix32 step (seed expansion).
 *
 * @param {number} state - Current 32-bit state.
 * @returns {[number, number]} `[nextState, output]`.
 */
function splitmix32(state) {
  const next = (state + 0x9e3779b9) | 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  return [next, z >>> 0];
}

/**
 * Creates a generator from a 32-bit seed.
 *
 * @param {number} seed - Any integer (taken modulo 2^32).
 * @returns {AssetRng} The generator.
 */
export function createAssetRng(seed) {
  let s = seed | 0;
  /** @type {number[]} */
  const words = [];
  for (let i = 0; i < 4; i++) {
    const [next, out] = splitmix32(s);
    s = next;
    words.push(out);
  }
  let [a, b, c, d] = words;
  /**
   * sfc32 step.
   *
   * @returns {number} Unsigned 32-bit output.
   */
  const nextU32 = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  /**
   * Uniform float.
   *
   * @returns {number} Float in `[0, 1)`.
   */
  const nextFloat = () => nextU32() / 4294967296;
  return {
    nextU32,
    nextFloat,
    rangeInt: (min, max) => min + Math.floor(nextFloat() * (max - min + 1)),
    chance: (probability) => nextFloat() < probability,
  };
}

/**
 * Stateless integer hash of a coordinate pair — for textures that must tile seamlessly
 * (the value depends only on `(x, y, seed)`, not on drawing order).
 *
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @param {number} seed - Pattern seed.
 * @returns {number} Unsigned 32-bit hash.
 */
export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
