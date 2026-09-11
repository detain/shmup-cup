/**
 * # bullets — enemy bullets and projectiles
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Enemy bullets in a struct-of-arrays pool (~512): position, speed, angle,
 * acceleration, angular velocity, min/max speed, delayed/changing bullets and capped
 * homing. Straight lasers with warning telegraph → grow → capsule hitbox active only at
 * full width; bending lasers later. Bullets die on terrain and are cancelled into
 * points/sparkles on boss death, player death or Mega Crash. Player shots use the same
 * SoA approach (64).
 *
 * **Implements.**
 * - shmup_feat.md §12 Enemy bullets & attack patterns (kinematics, lasers, cancel, budget)
 * - shmup_feat.md §22 — budgets: ~512 enemy bullets, 64 player shots
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import type { BinaryAngle } from '../math/index.js';
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'bullets',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §12', 'shmup_feat.md §22'],
});

/** Parameters for spawning one enemy bullet (reused object — no per-shot allocation). */
export interface BulletSpawn {
  /** Spawn X in playfield pixels. */
  x: number;
  /** Spawn Y in playfield pixels. */
  y: number;
  /** Pixels per tick. */
  speed: number;
  /** Direction (see `math` BinaryAngle). */
  angle: BinaryAngle;
  /** Speed change per tick. */
  accel: number;
  /** Direction change per tick, in binary-angle units. */
  angularVelocity: number;
  /** Sprite / colour id for the renderer. */
  sprite: number;
}

// Planned: createBulletPool(capacity = 512), spawnBullet(pool, spawn), updateBullets(pool, terrain),
//          cancelAllBullets(pool, events), MAX_ENEMY_BULLETS, MAX_PLAYER_SHOTS.
