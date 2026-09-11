/**
 * # ui — HUD and menu drawing
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Draws the core's renderer-agnostic UI model: HUD (score / HI / 2P, lives, power
 * meter with flashing highlighted slot and greyed maxed slots, Direct-mode tier pips,
 * shield, optional boss HP bar) and the canvas menu kit (lists, sliders, toggles, rebind
 * prompt, name entry, confirm dialogs incl. the Tizen exit confirmation). No DOM.
 *
 * **Implements.**
 * - shmup_feat.md §17 — HUD, canvas-drawn UI kit
 * - shmup_tech.md §4.10 — no UI framework
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'ui',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §17', 'shmup_tech.md §4.10'],
});

/** Draws the HUD from the core's HUD model (see `@shmup/core` ui module). */
export interface HudView {
  /** Re-draws only the parts whose values changed since the last call. */
  update(): void;
}

// Planned: createHudView(layer, fonts), createMenuView(layer, fonts).
