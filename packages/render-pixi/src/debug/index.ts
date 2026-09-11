/**
 * # debug — debug overlay
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Development overlay drawn on top of the frame: hitboxes/hurtboxes, the collision
 * grid, pool usage, entity counts, tick/render ms, draw calls, FPS, rank, RNG call count
 * and state hash. Toggled from the debug controls; stripped from release builds.
 *
 * **Implements.**
 * - shmup_feat.md §24 — debug overlay
 * - shmup_feat.md §5 — optional "show hitbox" display
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'debug',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §24', 'shmup_feat.md §5'],
});

/** Debug overlay handle. */
export interface DebugOverlay {
  /** Shows / hides the overlay (hidden overlays cost nothing per frame). */
  visible: boolean;
  /** Redraws the overlay for the current frame. */
  update(): void;
}

// Planned: createDebugOverlay(layer, counters: DebugCounters, flags: DebugFlags).
