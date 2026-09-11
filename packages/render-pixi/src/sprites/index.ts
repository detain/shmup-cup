/**
 * # sprites — sprite views over simulation state
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Maps simulation state to sprites without per-frame allocation: preallocated sprite
 * pools mirror the core's struct-of-arrays pools (bullets, shots, particles) and enemy
 * instances; positions are interpolated with the loop's `alpha` on high-refresh displays
 * and rounded to integer pixels (pixel-perfect camera); hit-flash uses a per-vertex tint
 * so batching is not broken.
 *
 * **Implements.**
 * - shmup_feat.md §3 — pixel-perfect camera, interpolated render on 120/144 Hz
 * - shmup_feat.md §18 — hit flash via per-vertex tint
 * - shmup_feat.md §22 — one dynamic VBO, batched
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'sprites',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §3', 'shmup_feat.md §18', 'shmup_feat.md §22'],
});

/** A preallocated set of sprites mirroring one simulation pool. */
export interface SpritePoolView {
  /** Number of preallocated sprites (matches the mirrored pool's capacity). */
  readonly capacity: number;
  /**
   * Syncs `count` sprites from the pool's arrays; hides the rest.
   *
   * @param count - Live slots in the pool (`SoaPool.count`).
   * @param alpha - Render interpolation factor between the previous and current tick.
   */
  sync(count: number, alpha: number): void;
}

// Planned: createSpritePoolView(layer, capacity, frames), createEnemyViews(...).
