/**
 * # player — player ship
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** The player ship: 8-way movement with no inertia, speed levels (meter Speed Ups or
 * a fixed Direct-mode speed), a tiny centred hurtbox plus a separate terrain box,
 * clamping to the playfield, terrain kills (unless shielded), respawn invincibility,
 * launch / fly-out animations and the death sequence (hit-stop, bullet cancel, life loss,
 * death-penalty preset). Supports up to two ships for co-op.
 *
 * **Implements.**
 * - shmup_feat.md §5 Player ship
 * - shmup_feat.md §10 Death, respawn & checkpoints
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'player',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §5', 'shmup_feat.md §10'],
});

/** Runtime state of one player ship. */
export interface PlayerShip {
  /** 0 = player 1, 1 = player 2. */
  readonly slot: number;
  /** Sub-pixel position in playfield pixels (renderer rounds). */
  x: number;
  y: number;
  /** 0 = base speed; meter mode adds Speed Ups. */
  speedLevel: number;
  lives: number;
  /** Remaining respawn-invincibility ticks (blinking). */
  invincibleTicks: number;
  alive: boolean;
}

// Planned: createPlayer(slot, config), updatePlayer(ship, input, terrain),
//          killPlayer(ship, penalty: DeathPenaltyPreset), respawnPlayer(ship, checkpoint).
