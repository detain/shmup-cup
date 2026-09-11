/**
 * # sfx — sound effects: pre-decoded buffers and voice management
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** Plays pre-decoded SFX `AudioBuffer`s (never decode mid-game — Tizen decoding is
 * slow) with SNES-driver-style voice management: per-SFX instance cap (2–4), global voice
 * cap (~12–16), priority tiers (death / 1UP / WARNING siren uninterruptible), and dedupe of
 * identical SFX triggered within one tick. Routed to the `sfx` or `ui` bus.
 *
 * **Implements.**
 * - shmup_feat.md §19 SFX — core SFX list, voice management, WARNING siren
 * - shmup_tech.md §2.4 — pre-decode all SFX during loading
 * - shmup_tech.md §4.3
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'sfx',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §19', 'shmup_tech.md §2.4', 'shmup_tech.md §4.3'],
});

/** Priority tiers for voice stealing (higher wins; `critical` is never stolen). */
export type SfxPriority = 'low' | 'normal' | 'high' | 'critical';

/** Static description of one sound effect. */
export interface SfxSpec {
  readonly id: string;
  readonly priority: SfxPriority;
  /** Maximum simultaneous instances of this effect. */
  readonly maxInstances: number;
  readonly bus: 'sfx' | 'ui';
}

// Planned: createSfxPlayer(context, buses, { maxVoices: 16 }), play(id, pan?), stopAll().
