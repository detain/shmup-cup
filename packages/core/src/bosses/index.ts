/**
 * # bosses — bosses and mid-bosses
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Bosses and mid-bosses ("captains"): hierarchical multi-part bodies with local
 * transforms, per-part HP and hurtboxes, destructible parts, weak points (shielded
 * cores, mouths open only at times), phase state machines (invulnerable intro → HP /
 * timer phases → death), boss timers and escapes, the WARNING intro, and the death
 * sequence (bullet cancel, chained explosions, hit-stop, tally). Later: battleship raids,
 * boss-inside-boss, double bosses, boss rush.
 *
 * **Implements.**
 * - shmup_feat.md §13 Bosses & mid-bosses
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'bosses',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §13'],
});

/** Boss lifecycle phase. */
export type BossPhase = 'warning' | 'intro' | 'fight' | 'dying' | 'escaped' | 'dead';

/** One part of a multi-part boss. */
export interface BossPart {
  readonly id: string;
  /** Index of the parent part, -1 for the root. */
  readonly parent: number;
  localX: number;
  localY: number;
  hp: number;
  vulnerable: boolean;
}

/** Runtime state of a boss. */
export interface Boss {
  phase: BossPhase;
  readonly parts: BossPart[];
  /** Ticks left before the boss escapes (Darius-style timer), -1 = no timer. */
  timerTicks: number;
}

// Planned: createBoss(spec), updateBoss(boss), damagePart(boss, index, amount), bossDeathSequence().
