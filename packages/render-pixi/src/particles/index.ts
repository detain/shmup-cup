/**
 * # particles — cosmetic particles and explosions
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Pooled, count-capped (≈256) particles with additive blending: explosions larger
 * than the enemy sprite, debris, sparks, "clink" sparks on invulnerable armour, boss
 * chain explosions and bullet-cancel sparkles. Driven by sim events and the *cosmetic*
 * RNG, so they never affect determinism.
 *
 * **Implements.**
 * - shmup_feat.md §18 — explosions, particles (pooled, capped, additive)
 * - shmup_feat.md §20 — juice
 * - shmup_feat.md §22 — budgets (256 particles)
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'particles',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §20', 'shmup_feat.md §22'],
});

/** Named particle presets (explosion sizes, sparks, debris …). */
export type ParticlePreset =
  'explosionSmall' | 'explosionMedium' | 'explosionLarge' | 'spark' | 'clink' | 'debris';

/** The particle system. */
export interface ParticleSystem {
  emit(preset: ParticlePreset, x: number, y: number): void;
  /** Advances all live particles by one displayed frame. */
  update(): void;
  readonly liveCount: number;
}

// Planned: createParticleSystem(layer, capacity = 256, cosmeticRng).
