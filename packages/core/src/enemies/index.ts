/**
 * # enemies — enemy runtime and archetypes
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Enemies as pooled instances composed of Mover, Hurtbox, Health and Script parts.
 * Movement primitives: straight, sine, aimed dash, arc-length-parameterised
 * Catmull-Rom/Bézier paths, waypoint enter→stop→shoot→leave, follow-the-leader
 * formations, floor/ceiling crawling, homing with a turn-rate cap. Formation tracking
 * ("all killed" → drop), off-screen/settle-time fire rules, flash-on-hit, death
 * explosions, rank modifiers and revenge bullets. Archetypes are data
 * (`content/enemies/`) plus coroutine scripts from `patterns`.
 *
 * **Implements.**
 * - shmup_feat.md §11 Enemies (archetypes + system requirements)
 * - shmup_feat.md §22 — enemies as pooled objects composed of components
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'enemies',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §11', 'shmup_feat.md §22'],
});

/** Data-driven enemy definition (from `content/enemies/*.json`). */
export interface EnemySpec {
  readonly id: string;
  readonly hp: number;
  readonly score: number;
  /** Hurtbox half-extents in pixels. */
  readonly hurtbox: { readonly hw: number; readonly hh: number };
  /** Id of the behaviour script (see `patterns`). */
  readonly script: string;
  /** Drop on death, e.g. `'capsule'` or `null`. */
  readonly drop: string | null;
}

/** Runtime state of one pooled enemy instance. */
export interface Enemy {
  active: boolean;
  specId: string;
  x: number;
  y: number;
  hp: number;
  /** Formation / wave id for "all killed" detection (-1 = none). */
  formationId: number;
  /** Remaining hit-flash ticks. */
  flashTicks: number;
}

// Planned: spawnEnemy(spec, x, y, formationId), updateEnemies(), damageEnemy(enemy, amount).
