/**
 * # fx — deterministic game-feel state (hit-stop, shake, flash)
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Game-feel state that must live in the simulation because it affects timing or is
 * replayed: hit-stop counters (4–5 ticks on big events), screen-shake requests (integer
 * pixels, decaying, 3 magnitudes, global off switch), hit-flash timers, and the optional
 * deterministic "authentic slowdown". Particles themselves are cosmetic and live in the
 * presentation layer (driven by events and the cosmetic RNG).
 *
 * **Implements.**
 * - shmup_feat.md §18 — hit flash, screen shake, hit-stop, particles
 * - shmup_feat.md §20 Game feel / "juice"
 * - shmup_feat.md §3 — optional authentic slowdown
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'fx',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §20', 'shmup_feat.md §3'],
});

/** Sim-side effect state. */
export interface FxState {
  /** Ticks during which the simulation is frozen (hit-stop). */
  hitStopTicks: number;
  /** Current shake magnitude in pixels (0 = none). */
  shakeMagnitude: number;
  /** Ticks of shake remaining; the magnitude decays to 0 over them. */
  shakeTicks: number;
  /** Full-screen flash ticks remaining (rate-limited for photosensitivity). */
  flashTicks: number;
}

// Planned: requestHitStop(fx, ticks), requestShake(fx, magnitude), tickFx(fx).
