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
  /** Unique id referenced by stage events, e.g. `'fan'`. */
  readonly id: string;
  /** Hit points at rank 0. */
  readonly hp: number;
  /** Points awarded on kill. */
  readonly score: number;
  /** Hurtbox half-extents in pixels. */
  readonly hurtbox: {
    /** Half width. */
    readonly hw: number;
    /** Half height. */
    readonly hh: number;
  };
  /** Id of the behaviour script (see `patterns`). */
  readonly script: string;
  /** Drop on death, e.g. `'capsule'` or `null`. */
  readonly drop: string | null;
}

/** Runtime state of one pooled enemy instance. */
export interface Enemy {
  /** `false` while the pooled instance is free. */
  active: boolean;
  /** {@link EnemySpec.id} this instance was spawned from. */
  specId: string;
  /** Position X in playfield pixels. */
  x: number;
  /** Position Y in playfield pixels. */
  y: number;
  /** Remaining hit points. */
  hp: number;
  /** Formation / wave id for "all killed" detection (-1 = none). */
  formationId: number;
  /** Remaining hit-flash ticks. */
  flashTicks: number;
}

// Planned: spawnEnemy(spec, x, y, formationId), updateEnemies(), damageEnemy(enemy, amount).
