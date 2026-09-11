/**
 * # options — options ("multiples")
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Options: up to four invulnerable drones that follow the ship's flown path — a ring
 * buffer of past positions that advances only on ticks the ship moves (so they bunch
 * up when idle) — pass through walls and copy every weapon. Later: Snake, Formation and
 * Rotate option types, the Option Hunter enemy that steals them, and recovery rules.
 *
 * **Implements.**
 * - shmup_feat.md §8 Options / multiples
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'options',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §8'],
});

/** How options are positioned. */
export type OptionFormation = 'trail' | 'snake' | 'formation' | 'rotate';

/** Runtime state of one ship's options. */
export interface OptionGroup {
  /** Options owned (0–4). */
  count: number;
  formation: OptionFormation;
  /** Options stolen by an Option Hunter and waiting to be re-collected. */
  stolen: number;
}

// Planned: createOptionGroup(), recordShipPosition(group, x, y, moved), optionPosition(group, k).
