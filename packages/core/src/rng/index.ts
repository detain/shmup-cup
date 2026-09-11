/**
 * # rng — seeded pseudo-random number generators
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Deterministic PRNG streams for the simulation. A session owns two independent
 * streams: **gameplay** (drives spawns, spray patterns, cube rush — reproduced from the
 * replay seed) and **cosmetic** (particles, shake — may be consumed freely without
 * desyncing replays). The core never calls `Math.random()` (lint-enforced).
 *
 * **Implements.**
 * - shmup_feat.md §22 Determinism — seeded PRNG (sfc32 / mulberry32), two streams
 * - shmup_feat.md §12 — random spray from the seeded RNG; §11 — cube rush "seeded & readable"
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'rng',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §12'],
});

/** Serialisable generator state (save states, replay checkpoints). */
export type RngState = readonly [number, number, number, number];

/** A deterministic 32-bit PRNG stream (planned: sfc32). */
export interface Rng {
  /**
   * Advances the stream.
   *
   * @returns The next unsigned 32-bit integer.
   */
  nextU32(): number;
  /**
   * Advances the stream.
   *
   * @returns The next float in [0, 1).
   */
  nextFloat(): number;
  /**
   * Draws a uniformly distributed integer.
   *
   * @param min - Inclusive lower bound.
   * @param max - Inclusive upper bound (must be ≥ `min`).
   * @returns An integer in [min, max].
   */
  rangeInt(min: number, max: number): number;
  /**
   * Captures the internal state.
   *
   * @returns A snapshot that {@link Rng.setState} can restore.
   */
  getState(): RngState;
  /**
   * Restores a snapshot taken with {@link Rng.getState}.
   *
   * @param state - The snapshot to restore.
   */
  setState(state: RngState): void;
}

/** The two streams owned by a session. */
export interface RngStreams {
  /** Affects the simulation; seeded from `GameConfig.seed`. */
  readonly gameplay: Rng;
  /** Presentation-only randomness. */
  readonly cosmetic: Rng;
}

// Planned functions: createRng(seed: number): Rng; createRngStreams(seed: number): RngStreams.
