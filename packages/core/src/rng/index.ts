/**
 * # rng — seeded pseudo-random number generators
 *
 * **Responsibility.** Deterministic PRNG streams for the simulation. A session owns two
 * independent streams: **gameplay** (spawns, spray patterns, drops — reproduced from the
 * replay seed) and **cosmetic** (particles, shake — may be consumed freely without
 * desynchronising replays). The core never calls `Math.random()` (lint-enforced).
 *
 * The generator is **sfc32** ("small fast counter", 128 bits of state, period ≥ 2^32,
 * passes PractRand) seeded by four **splitmix32** words derived from one 32-bit seed.
 * Every operation uses only `|0`, `>>>`, `^`, `+` and `Math.imul`, all exactly specified
 * by ECMAScript, so a replay produces identical numbers on Chromium 69, desktop Chrome,
 * Electron and Node.
 *
 * Drawing never allocates: the state lives in four closure variables and
 * {@link Rng.getStateInto} writes into a caller-owned `Uint32Array`.
 *
 * **Implements.**
 * - shmup_feat.md §22 Determinism — seeded PRNG (sfc32), two streams
 * - shmup_feat.md §12 — random spray from the seeded RNG; §11 — "seeded & readable" rushes
 *
 * **Public API (implemented now).** {@link Rng}, {@link RngState}, {@link RngStreams},
 * {@link RNG_STATE_WORDS}, {@link createRng}, {@link createRngStreams}.
 *
 * **Planned API (later steps).** `hashRngState()` for the golden-replay state hash
 * (M1-19) and a weighted-pick helper if drop tables ever need one (M1's drops are fixed per
 * enemy, so none has so far).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'rng',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §12'],
});

/** Serialisable generator state (save states, replay checkpoints). */
export type RngState = readonly [number, number, number, number];

/** Number of 32-bit words in an {@link RngState} — the size {@link Rng.getStateInto} needs. */
export const RNG_STATE_WORDS = 4;

/** 2^32, the divisor that turns a `nextU32()` draw into a float in [0, 1). */
const TWO_POW_32 = 4294967296;

/** The golden-ratio constant splitmix32 and the cosmetic-stream derivation use. */
const GOLDEN_GAMMA = 0x9e3779b9;

/** A deterministic 32-bit PRNG stream (sfc32). */
export interface Rng {
  /**
   * How many times the stream was advanced since it was created.
   *
   * @remarks
   * Diagnostic only (the debug overlay shows it to spot accidental draws in cosmetic
   * code). It is **not** part of {@link RngState} and {@link Rng.setState} leaves it
   * alone.
   */
  readonly callCount: number;
  /**
   * Advances the stream.
   *
   * @returns The next unsigned 32-bit integer.
   */
  nextU32(): number;
  /**
   * Advances the stream.
   *
   * @returns The next float in [0, 1), in steps of 2^-32.
   */
  nextFloat(): number;
  /**
   * Draws a uniformly distributed integer.
   *
   * @param min - Inclusive lower bound.
   * @param max - Inclusive upper bound (must be ≥ `min`).
   * @returns An integer in [min, max].
   *
   * @remarks
   * Always advances the stream exactly once, even for an empty-looking range, so call
   * sites stay in sync with a replay no matter what the bounds are.
   */
  rangeInt(min: number, max: number): number;
  /**
   * Captures the internal state.
   *
   * @returns A fresh 4-word snapshot that {@link Rng.setState} can restore. Allocates —
   *   use {@link Rng.getStateInto} on per-tick paths.
   */
  getState(): RngState;
  /**
   * Captures the internal state without allocating.
   *
   * @param out - Destination of at least {@link RNG_STATE_WORDS} words; words 0…3 are
   *   overwritten.
   * @throws {RangeError} If `out` is shorter than {@link RNG_STATE_WORDS}.
   */
  getStateInto(out: Uint32Array): void;
  /**
   * Restores a snapshot taken with {@link Rng.getState} or {@link Rng.getStateInto}.
   *
   * @param state - The four state words, in order. {@link Rng.callCount} is unchanged.
   */
  setState(state: RngState | Uint32Array): void;
}

/** The two streams owned by a session. */
export interface RngStreams {
  /** Affects the simulation; seeded from `GameConfig.seed`. */
  readonly gameplay: Rng;
  /** Presentation-only randomness; derived from the same seed but independent. */
  readonly cosmetic: Rng;
}

/**
 * splitmix32 — the mixing function that expands one seed into the four sfc32 words.
 *
 * @param x - Any 32-bit value.
 * @returns A well-mixed unsigned 32-bit value.
 */
function splitmix32(x: number): number {
  let t = (x ^ (x >>> 16)) >>> 0;
  t = Math.imul(t, 0x21f0aaad);
  t = (t ^ (t >>> 15)) >>> 0;
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

/**
 * Creates a deterministic sfc32 stream.
 *
 * @param seed - 32-bit seed (any number; only the low 32 bits are used).
 * @returns A generator whose output depends only on `seed`.
 *
 * @remarks
 * The four state words are `splitmix32(seed + k·0x9e3779b9)` for `k = 1 … 4`, then the
 * stream is advanced 12 times to wash out weak seeds (the usual sfc32 warm-up).
 * {@link Rng.callCount} starts at 0 after the warm-up.
 *
 * @example
 * ```ts
 * const rng = createRng(config.seed);
 * const lane = rng.rangeInt(0, 3);
 * ```
 */
export function createRng(seed: number): Rng {
  let s = seed | 0;
  /**
   * Next seeding word.
   *
   * @returns The next splitmix32 output of the seeding sequence.
   */
  const seedWord = (): number => {
    s = (s + GOLDEN_GAMMA) | 0;
    return splitmix32(s);
  };
  let a = seedWord();
  let b = seedWord();
  let c = seedWord();
  let d = seedWord();
  let calls = 0;

  /**
   * One sfc32 step.
   *
   * @returns The next unsigned 32-bit output.
   */
  const step = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };

  for (let i = 0; i < 12; i += 1) step();

  const rng: Rng = {
    get callCount(): number {
      return calls;
    },
    nextU32(): number {
      calls += 1;
      return step();
    },
    nextFloat(): number {
      calls += 1;
      return step() / TWO_POW_32;
    },
    rangeInt(min: number, max: number): number {
      calls += 1;
      return min + Math.floor((step() / TWO_POW_32) * (max - min + 1));
    },
    getState(): RngState {
      return [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    },
    getStateInto(out: Uint32Array): void {
      if (out.length < RNG_STATE_WORDS) {
        throw new RangeError(`Rng.getStateInto needs ${RNG_STATE_WORDS} words`);
      }
      out[0] = a >>> 0;
      out[1] = b >>> 0;
      out[2] = c >>> 0;
      out[3] = d >>> 0;
    },
    setState(state: RngState | Uint32Array): void {
      a = state[0] | 0;
      b = state[1] | 0;
      c = state[2] | 0;
      d = state[3] | 0;
    },
  };
  return rng;
}

/**
 * Creates the gameplay and cosmetic streams of one session.
 *
 * @param seed - The session seed (`GameConfig.seed`), recorded in replay headers.
 * @returns Two independent generators.
 *
 * @remarks
 * `gameplay` is seeded with `seed` itself, `cosmetic` with `splitmix32(seed ^ 0x9e3779b9)`,
 * so cosmetic draws can never shift the gameplay sequence. Only the gameplay stream may
 * influence simulation state.
 */
export function createRngStreams(seed: number): RngStreams {
  return {
    gameplay: createRng(seed),
    cosmetic: createRng(splitmix32((seed ^ GOLDEN_GAMMA) | 0)),
  };
}
