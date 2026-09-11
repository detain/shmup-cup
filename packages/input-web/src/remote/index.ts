/**
 * # remote — TV-remote specific handling
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Samsung Smart Remote quirks, to be tuned with the input-probe results: optional
 * release debounce (~2–3 frames) that hides fake keyup/keydown pairs during key repeat,
 * the 4-way / no-chord assumption (a second arrow may replace the first), and helpers for
 * remote-mode defaults (forced autofire is applied in the core). Key codes come from
 * `keymap` (arrows 37–40, OK 13, Back 10009, Play/Pause 10252, Ch± 427/428).
 *
 * **Implements.**
 * - shmup_feat.md §4 — remote-first control design rules 2–3 (4-way, release debounce)
 * - shmup_tech.md §2.3 — remote key codes; input_probe_spec.md questions 1–4
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'remote',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §4', 'shmup_tech.md §2.3', 'input_probe_spec.md'],
});

/** Tunables decided from the input-probe measurements on the M7 monitors. */
export interface RemoteTuning {
  /** Ticks a key must stay released before it counts as released (0 = off). */
  readonly releaseDebounceTicks: number;
  /** Whether two arrows can be held at once (diagonals). */
  readonly diagonalsSupported: boolean;
}

// Planned: createReleaseDebouncer(tuning), DEFAULT_REMOTE_TUNING.
