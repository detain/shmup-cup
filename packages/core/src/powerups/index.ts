/**
 * # powerups — power-up economy (Meter mode + Direct mode) and pickups
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Both power-up models. **Meter mode** (Gradius): the 7-slot meter
 * `SPEED UP | MISSILE | DOUBLE | LASER | OPTION | ? | !`, each capsule advances the cursor
 * (wrapping), the PowerUp action equips the highlighted slot, maxed slots are greyed,
 * DOUBLE/LASER are exclusive, optional Auto Power-Up, and — unlike Gradius III — capsules
 * grabbed in quick succession each count. **Direct mode** (Darius): coloured items
 * (red shot, green sub, blue shield, orange 1UP, yellow smart bomb, red-octagon family
 * switch) dropped by cube carriers. Also pickup entities (drift, despawn) and pickup
 * feedback events.
 *
 * **Implements.**
 * - shmup_feat.md §6 Power-up systems (6A meter, 6B direct items, 6C common)
 * - shmup_feat.md §11 — capsule carriers, formation-kill drops, cube item carriers
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'powerups',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §6', 'shmup_feat.md §11'],
});

/** Slots of the Gradius-style power meter, in order. */
export type MeterSlot = 'speed' | 'missile' | 'double' | 'laser' | 'option' | 'shield' | 'special';

/** Darius-style direct items. */
export type DirectItem = 'red' | 'green' | 'blue' | 'orange' | 'yellow' | 'octagon';

/** Meter-mode state of one player. */
export interface PowerMeter {
  /** Highlighted slot index, or -1 for none. */
  cursor: number;
  /** Equipped level per slot. */
  levels: Record<MeterSlot, number>;
}

// Planned: advanceMeter(meter), equipHighlighted(meter, loadout), isSlotMaxed(meter, slot),
//          applyDirectItem(player, item), autoPowerUpOrder.
