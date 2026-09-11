/**
 * # rank — rank / dynamic difficulty
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Rank: a Gradius III-style 0–31 value (`difficulty + loop/stage + power-ups +
 * special`, capped at 16 on loop 1) that scales enemy speed, fire rate, bullet speed and
 * boss behaviour; higher steps matter more. Difficulty presets map to rank base and
 * growth. Rank is shown in the debug overlay.
 *
 * **Implements.**
 * - shmup_feat.md §15 — rank formula, difficulty presets, loops
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'rank',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §15'],
});

/** Everything the rank formula reads. */
export interface RankInputs {
  /** Easy 0 / Normal 2 / Hard 4 / Very Hard 6. */
  readonly difficultyBase: number;
  /** 1-based loop number. */
  readonly loop: number;
  /** 1-based stage number within the loop. */
  readonly stage: number;
  /** Power contribution (Missile +1, Double +2, Laser +3, each Option +1, Shield +4 …). */
  readonly power: number;
  readonly special: number;
}

// Planned: computeRank(inputs): number (0–31), rankScale(rank, table): number.
