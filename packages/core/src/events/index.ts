/**
 * # events — simulation → presentation event queue
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** The only channel from the simulation to the presentation layer. Game systems push
 * fixed-size event records (SFX cue, music change, particle burst, screen shake, flash,
 * hit-stop, rumble) into a preallocated ring; once per displayed frame the host drains
 * the queue and routes each record to the renderer or the mixer. Records are plain
 * numbers so pushing never allocates, and a headless run can simply ignore them.
 *
 * **Implements.**
 * - shmup_feat.md §22 Architecture — read-only state + event queue (SFX, particles, shake, flash)
 * - shmup_feat.md §18 / §19 / §20 — effects, audio cues and "juice" triggered by sim events
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'events',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §18', 'shmup_feat.md §19', 'shmup_feat.md §20'],
});

/** Categories of presentation events. */
export type SimEventKind = 'sfx' | 'music' | 'particles' | 'shake' | 'flash' | 'hitstop' | 'rumble';

/** One event record (fields are reused — never keep a reference after `drain`). */
export interface SimEvent {
  kind: SimEventKind;
  /** Content id (SFX id, particle preset, track id …). */
  id: number;
  /** Position in playfield pixels, when meaningful. */
  x: number;
  y: number;
  /** Kind-specific parameter (priority, magnitude, duration in ticks …). */
  param: number;
}

/** Fixed-capacity event ring (planned implementation: typed arrays, drop-oldest on overflow). */
export interface EventQueue {
  /** Number of pending events. */
  readonly length: number;
  /** Appends an event; must not allocate. */
  push(kind: SimEventKind, id: number, x: number, y: number, param: number): void;
  /** Visits and removes all pending events in push order. */
  drain(visit: (event: Readonly<SimEvent>) => void): void;
  /** Drops all pending events. */
  clear(): void;
}
