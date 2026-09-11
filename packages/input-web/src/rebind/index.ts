/**
 * # rebind — per-device rebinding
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Player-editable bindings per device (keyboard, each gamepad, TV remote): capture
 * the next key/button in the rebind prompt, detect conflicts, reset to defaults, and
 * persist the bindings through `Platform.storage` (via the core's `save` module). Produces
 * the same key/button → action tables the keyboard and gamepad sources consume.
 *
 * **Implements.**
 * - shmup_feat.md §4 — [P1] rebinding per device, conflict detection, persistence
 * - shmup_feat.md §21 — controls options
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'rebind',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §4', 'shmup_feat.md §21'],
});

/** Serialisable bindings for one device. */
export interface DeviceBindings {
  /** Device kind the table applies to. */
  readonly device: 'keyboard' | 'remote' | 'gamepad';
  /** Key `code` / button index → action mask. */
  readonly bindings: Readonly<Record<string, number>>;
}

// Planned: captureNextInput(target): Promise<string>, findConflicts(bindings), DEFAULT_BINDINGS.
