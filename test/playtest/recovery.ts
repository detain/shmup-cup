/**
 * The recovery rule at runtime (plan M1-18, M2-11; shmup_feat.md §10: ≥ 3 capsule sources within
 * 900 px after each checkpoint), shared by the zone recovery tests: the capsule sources of a
 * shipped stage and a **perfect player** restarted at a checkpoint — what the `arcade` death
 * penalty and continues do — who kills every enemy on its first on-screen tick through the public
 * damage API, counting the capsules those kills drop.
 *
 * @module
 */
import {
  EnemyFlag,
  EnemyState,
  createGame,
  createHeadlessPlatform,
  spawnPlayer,
  type StageSpec,
} from '@shmup/core';
import { shippedContent } from './harness.js';

/** The recovery window after a checkpoint (px). */
export const RECOVERY_WINDOW = 900;

/** Capsule sources a restarted player must meet within it. */
export const MIN_RECOVERY_CAPSULES = 3;

/**
 * A shipped stage.
 *
 * @param stageId - Its id.
 * @returns The stage.
 * @throws {Error} When no such stage is shipped.
 */
export function shippedStage(stageId: string): StageSpec {
  const db = shippedContent();
  const stage = db.stages[db.stageIndex.get(stageId) ?? -1];
  if (stage === undefined) throw new Error(`no stage ${stageId}`);
  return stage;
}

/**
 * The x of every capsule source of a stage: a `spawn` of an enemy that drops a capsule, a
 * `formation` whose `drop` is not `null`.
 *
 * @param stage - The stage.
 * @returns Event x positions, in order.
 */
export function capsuleSources(stage: StageSpec): number[] {
  const db = shippedContent();
  return stage.events
    .filter((event) =>
      event.type === 'spawn'
        ? db.enemies[event.enemyId].drop === 'capsule'
        : event.type === 'formation' && event.drop !== null,
    )
    .map((event) => event.x);
}

/**
 * Restarts a stage at a checkpoint (god mode, no autofire) and plays perfectly — every enemy killed
 * on its first on-screen tick — until the camera reaches `until`.
 *
 * @param stageId - The stage.
 * @param checkpoint - Checkpoint index.
 * @param until - Camera x to stop at.
 * @returns The capsules dropped and the camera x reached.
 */
export function perfectFrom(
  stageId: string,
  checkpoint: number,
  until: number,
): { drops: number; cameraX: number } {
  const game = createGame(
    createHeadlessPlatform(),
    { seed: 1, stage: stageId, autofire: false, remoteMode: false },
    shippedContent(),
  );
  const world = game.world;
  world.debugFlags.godMode = true;
  world.stage?.restartAt(checkpoint);
  spawnPlayer(world.players[0], world.camera);
  let drops = 0;
  for (let t = 0; t < 30_000 && world.camera.x < until; t++) {
    game.step();
    const enemies = world.enemies;
    for (const enemy of enemies.enemies) {
      if (enemy.state !== EnemyState.Live) continue;
      if ((enemy.flags & EnemyFlag.OnScreen) !== 0) enemies.kill(enemy);
    }
    drops += enemies.outcomes.dropCount;
    world.events.clear();
  }
  return { drops, cameraX: world.camera.x };
}

/**
 * The recovery check of one checkpoint: the sources in its window and the capsules a perfect
 * player gets from them — played until the next source beyond the window comes into play (or the
 * WARNING).
 *
 * @param stageId - The stage.
 * @param checkpoint - Checkpoint index.
 * @returns The window's sources, the drops and the camera x the run reached / had to reach.
 */
export function recoveryAt(
  stageId: string,
  checkpoint: number,
): { inWindow: number; drops: number; cameraX: number; until: number } {
  const stage = shippedStage(stageId);
  const x = stage.checkpoints[checkpoint].x;
  const sources = capsuleSources(stage);
  const inWindow = sources.filter((s) => s >= x && s < x + RECOVERY_WINDOW).length;
  const warning = stage.events.find((e) => e.type === 'warning')?.x ?? stage.length;
  const until = Math.min(sources.find((s) => s >= x + RECOVERY_WINDOW) ?? warning, warning);
  const { drops, cameraX } = perfectFrom(stageId, checkpoint, until);
  return { inWindow, drops, cameraX, until };
}
