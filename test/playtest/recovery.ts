/**
 * The recovery rule at runtime (plan M1-18, M2-11; shmup_feat.md §10: ≥ 3 capsule sources within
 * 900 px after each checkpoint), shared by the zone recovery tests: the capsule sources of a
 * shipped stage and a **perfect player** restarted at a checkpoint — what the `arcade` death
 * penalty and continues do — who kills every enemy on its first on-screen tick through the public
 * damage API, counting the capsules those kills drop. A row gated with a branch (M2-07) counts
 * only when the restart's camera can take it — the REACH law of {@link capsuleSources}.
 *
 * @module
 */
import {
  EnemyFlag,
  EnemyState,
  WORLD_SCALE,
  createGame,
  createHeadlessPlatform,
  spawnPlayer,
  type StageBranch,
  type StageEvent,
  type StageSpec,
  type StageTriggerEvent,
} from '@shmup/core';
import { shippedContent } from './harness.js';

/** The recovery window after a checkpoint (px). */
export const RECOVERY_WINDOW = 900 * WORLD_SCALE;

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
 * Whether a region trigger of a run restarted at `restartX` can still fire. One armed at or
 * beyond the restart lies in the camera's way, as in live play; one behind it a fresh restart
 * has never fired is re-armed by `StageRunner.restoreTrigger` only while the camera has not
 * passed its `until` (default `region.x + region.w` — the region gone by).
 *
 * @param event - The `trigger` event.
 * @param restartX - The restart's camera x.
 * @returns `true` when the run can still see this setter.
 */
function triggerAliveFrom(event: StageTriggerEvent, restartX: number): boolean {
  return event.x >= restartX || (event.until ?? event.region.x + event.region.w) >= restartX;
}

/**
 * Whether the branch can be taken as the camera passes `rowX` in a run restarted at `restartX`
 * — the REACH law. Walking the (x-sorted) events up to the row: a `flag` event of the flag
 * states it deterministically and resets any earlier trigger (the camera passes the setter at
 * its own x), and a `trigger` whose value matches the branch, alive for the run per
 * {@link triggerAliveFrom}, makes that value reachable. With no setter the flag is clear, so a
 * `false`-path row is the default path the restart sees.
 *
 * @param stage - The stage.
 * @param branch - The row's branch.
 * @param rowX - The row's camera x.
 * @param restartX - The restart's camera x.
 * @returns `true` when the branch's value can hold at the row.
 */
function branchTakenAt(
  stage: StageSpec,
  branch: StageBranch,
  rowX: number,
  restartX: number,
): boolean {
  let taken = !branch.value; // a flag no alive setter touches stays clear
  for (const event of stage.events) {
    if (event.x > rowX) break; // the row fires the tick the camera reaches it, first
    if (event.type === 'flag' && event.flagId === branch.flagId) {
      taken = (event.value ?? true) === branch.value; // a set / clear the run must pass
    } else if (
      event.type === 'trigger' &&
      event.flagId === branch.flagId &&
      (event.value ?? true) === branch.value &&
      triggerAliveFrom(event, restartX)
    ) {
      taken = true; // this setter can hand the branch its value before the row
    }
  }
  return taken;
}

/**
 * Whether one row counts as a source of the run restarted at `restartX`: an ungated row
 * always does; a row naming a branch only when {@link branchTakenAt} takes it.
 *
 * @param stage - The stage.
 * @param event - The row.
 * @param restartX - The restart's camera x.
 * @returns `true` when the row can spawn (and drop) in that run.
 */
function rowCountsFrom(stage: StageSpec, event: StageEvent, restartX: number): boolean {
  const branchId = event.branchId ?? -1;
  if (branchId < 0) return true;
  const branch = stage.branches[branchId];
  if (branch === undefined) return true; // an unknown branch is the content check's failure
  return branchTakenAt(stage, branch, event.x, restartX);
}

/**
 * The x of every capsule source of a stage a run restarted at `restartX` can reach: a `spawn`
 * of an enemy that drops a capsule, a `formation` whose `drop` is not `null` — of the stage
 * events that can fire in that run.
 *
 * **The REACH law (R5-04 RV conflict #1).** A branch-gated row fires only while its flag holds
 * the branch's value (the runner's `eventActive`); after `StageRunner.restartAt` the runner has
 * fired no trigger and its `restoreTrigger` re-arms a trigger behind the restart only while its
 * `until` has not passed. A flag whose every setter died behind the checkpoint therefore stays
 * clear: a row gated on it being **set** is not a source there, while its **false**-path twin
 * is — a restart past a branch's region sees only the default path. Zone D (r5/zone-d) is the
 * worked example: restarted at its cp-12900 checkpoint, the `lower` trigger (armed at 12 020,
 * disarmed past `until` 12 600) is dead, so its two `low` formations at 12 950 and 13 050 never
 * spawn — the window ships 3 reachable sources (13 300, 13 700, 14 050), where counting branch
 * rows blind found 5 and the perfect run dropped only 3.
 *
 * @param stage - The stage.
 * @param restartX - The restart's camera x (the default 0 is the stage start: every setter
 *   then lies ahead of the camera, so every branch-gated row counts, as a full run sees).
 * @returns Event x positions, in order.
 */
export function capsuleSources(stage: StageSpec, restartX = 0): number[] {
  const db = shippedContent();
  return stage.events
    .filter(
      (event) =>
        (event.type === 'spawn'
          ? db.enemies[event.enemyId].drop === 'capsule'
          : event.type === 'formation' && event.drop !== null) &&
        rowCountsFrom(stage, event, restartX),
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
  const sources = capsuleSources(stage, x);
  const inWindow = sources.filter((s) => s >= x && s < x + RECOVERY_WINDOW).length;
  const warning = stage.events.find((e) => e.type === 'warning')?.x ?? stage.length;
  const until = Math.min(sources.find((s) => s >= x + RECOVERY_WINDOW) ?? warning, warning);
  const { drops, cameraX } = perfectFrom(stageId, checkpoint, until);
  return { inWindow, drops, cameraX, until };
}
