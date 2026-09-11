/**
 * # effects — screen effects and shaders
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Presentation-side effects: applying the sim's integer screen shake and full-screen
 * flash, raster/HDMA-style per-scanline offset tables (1×H data texture for wavy water,
 * heat haze, line parallax), palette swap/cycling via palette textures, later Mode 7-style
 * floors and an optional CRT/scanline filter (capped to 1080p on TV for cost).
 *
 * **Implements.**
 * - shmup_feat.md §18 — shake, flash, palette effects, raster effects, Mode 7, CRT
 * - shmup_feat.md §22 — raster-effect shader, palette texture
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'effects',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §22'],
});

/** Post-processing options exposed in the Display settings. */
export interface EffectSettings {
  screenShake: boolean;
  /** Reduced flashing (< 3 flashes / s) for accessibility. */
  reduceFlashing: boolean;
  crt: 'off' | 'light' | 'full';
}

// Planned: createRasterEffect(texture), applyShake(container, fx), createPaletteCycler(...).
