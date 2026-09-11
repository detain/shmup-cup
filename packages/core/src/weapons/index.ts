/**
 * # weapons — player weapons
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Player weapons for both power-up models. Meter mode: Gradius III-derived Missile /
 * Double / Laser slot variants, Type A–D presets and Weapon Edit. Direct mode: Darius
 * Twin-derived main-shot families (Beam→Disc, Laser→Wave; 9 levels each) and a 9-level
 * sub-weapon. Shared mechanics: on-screen shot caps, piercing vs non-piercing,
 * per-projectile damage, damage-over-time beams, ground-following missiles
 * ("find floor"). Options copy every weapon. Tunables come from `content/weapons/`.
 *
 * **Implements.**
 * - shmup_feat.md §7 Weapons catalog (7A meter weapons, 7B direct weapons, 7C requirements)
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'weapons',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §7'],
});

/** Identifier of a coded weapon behaviour, e.g. `'missile.ground'`, `'laser.pierce'`. */
export type WeaponBehaviorId = string;

/** Data-driven weapon tunables (loaded from `content/weapons/*.json`). */
export interface WeaponSpec {
  /** Unique id referenced by loadouts, e.g. `'twin-laser'`. */
  readonly id: string;
  /** Coded behaviour that interprets the tunables. */
  readonly behavior: WeaponBehaviorId;
  /** Damage per hit. */
  readonly damage: number;
  /** Pixels per tick. */
  readonly speed: number;
  /** Maximum simultaneous projectiles on screen. */
  readonly cap: number;
  /** Projectiles pass through enemies instead of being consumed. */
  readonly pierce: boolean;
}

/** Meter-mode loadout (weapon id per slot, `null` = not equipped). */
export interface Loadout {
  /** Weapon id for the Missile slot. */
  missile: string | null;
  /** Weapon id for the Double slot. */
  double: string | null;
  /** Weapon id for the Laser slot. */
  laser: string | null;
}

// Planned: fireWeapons(ship, loadout, shots: SoaPool), updateShots(shots, terrain), PRESET_LOADOUTS.
