/**
 * # scoring — score, hi-scores, lives and extends
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Score keeping: per-enemy values, capsule (300) and bonus capsule (1,000) values,
 * formation and boss-time bonuses, per-player totals in co-op, extends at score
 * thresholds with a lives cap, rare 1UP items, the continue counter shown in the score's
 * last digit, and hi-score table entries (3-letter name, score, stage/zone reached, per
 * mode/difficulty).
 *
 * **Implements.**
 * - shmup_feat.md §15 Scoring, lives, rank & loops (score, hi-score, lives, extends)
 * - shmup_feat.md §10 — continues
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'scoring',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §15', 'shmup_feat.md §10'],
});

/** Score state of one player. */
export interface PlayerScore {
  score: number;
  lives: number;
  /** Next extend threshold. */
  nextExtendAt: number;
  continues: number;
}

/** One hi-score table row. */
export interface HiScoreEntry {
  /** Three letters. */
  readonly name: string;
  readonly score: number;
  /** Stage / zone reached. */
  readonly reached: string;
  readonly mode: string;
  readonly difficulty: string;
}

// Planned: addScore(player, points), checkExtend(player), insertHiScore(table, entry).
