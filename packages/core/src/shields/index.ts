/**
 * # shields — shields
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Shields for both models. Meter mode (`?` slot): Force Field, front Shield pods,
 * Free Shield, Rotate Shield, Reduce (shrinks the hurtbox, not the terrain box).
 * Direct mode (blue items): Arm → Super Arm → Hyper Arm tiers (3/4/5 hits) that also
 * absorb enemy contact and terrain. Hit counters, visible wear, short shield-hit
 * i-frames and break events.
 *
 * **Implements.**
 * - shmup_feat.md §9 Shields
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'shields',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §9'],
});

/** Shield variants across both power-up models. */
export type ShieldKind =
  'forceField' | 'frontPods' | 'freeShield' | 'rotateShield' | 'reduce' | 'arm';

/** Runtime shield state of one ship. */
export interface ShieldState {
  /** Active shield, `null` when unshielded. */
  kind: ShieldKind | null;
  hitsLeft: number;
  /** Direct-mode tier (0 = Arm, 1 = Super Arm, 2 = Hyper Arm). */
  tier: number;
  /** Remaining shield-hit invulnerability ticks. */
  iframes: number;
}

// Planned: applyShieldHit(state, source), grantShield(state, kind), shieldAbsorbsTerrain(kind).
