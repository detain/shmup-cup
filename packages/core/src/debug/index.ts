/**
 * # debug — debug and dev-tool hooks
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Development hooks inside the simulation: god mode, stage skip, jump to scroll X or
 * checkpoint, frame advance (pause + step one tick), slow motion, state hashing and the
 * counters shown by the debug overlay (pool usage, entity counts, RNG calls, rank). Off in
 * release builds; never affects a replay unless flagged in its header.
 *
 * **Implements.**
 * - shmup_feat.md §24 Dev tooling & debug features
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'debug',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §24'],
});

/** Toggleable debug switches. */
export interface DebugFlags {
  /** Player hits are ignored. */
  godMode: boolean;
  /** Renderer draws hurtboxes, terrain boxes and bullet circles. */
  showHitboxes: boolean;
  /** When `true`, ticks run only on explicit frame-advance requests. */
  frameAdvance: boolean;
  /** 1 = normal speed, 2 = half speed, … */
  slowMo: number;
}

/** Counters for the debug overlay. */
export interface DebugCounters {
  /** Live enemy instances. */
  enemies: number;
  /** Live enemy bullets (budget ~512). */
  enemyBullets: number;
  /** Live player shots (budget 64). */
  playerShots: number;
  /** Gameplay RNG draws this tick (determinism debugging). */
  rngCalls: number;
  /** Hash of the sim state, compared against replay checkpoints. */
  stateHash: number;
}

// Planned: hashState(game): number, createDebugControls(game).
