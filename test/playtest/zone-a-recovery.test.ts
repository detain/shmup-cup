/**
 * The recovery rule of zone A at runtime (plan M1-18, shmup_feat.md §10: ≥ 3 capsule sources
 * within 900 px after each checkpoint). The content test counts the sources in the stage file;
 * this restarts a headless game at each checkpoint — what the `arcade` death penalty and continues
 * do — and plays it perfectly (every enemy killed on its first on-screen tick, through the public
 * damage API): the capsules those sources really drop before the next source beyond the window
 * appears are exactly the sources in the window, and at least three.
 */
import {
  EnemyFlag,
  EnemyState,
  createGame,
  createHeadlessPlatform,
  spawnPlayer,
  type StageSpec,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { shippedContent } from './harness.js';

/** The recovery window after a checkpoint (px). */
const WINDOW = 900;

/** Capsule sources a restarted player must meet within it. */
const MIN_CAPSULES = 3;

/** Zone A as shipped. */
const STAGE: StageSpec = (() => {
  const db = shippedContent();
  return db.stages[db.stageIndex.get('zone-a') ?? -1];
})();

/**
 * The x of every capsule source of zone A: a carrier that drops a capsule, a formation that does.
 *
 * @returns Event x positions, in order.
 */
function capsuleSources(): number[] {
  const db = shippedContent();
  return STAGE.events
    .filter((event) =>
      event.type === 'spawn'
        ? db.enemies[event.enemyId].drop === 'capsule'
        : event.type === 'formation' && event.drop !== null,
    )
    .map((event) => event.x);
}

/**
 * Restarts zone A at a checkpoint and plays perfectly until the camera reaches `until`.
 *
 * @param checkpoint - Checkpoint index.
 * @param until - Camera x to stop at.
 * @returns Capsules dropped.
 */
function perfectFrom(checkpoint: number, until: number): number {
  const game = createGame(
    createHeadlessPlatform(),
    { seed: 1, stage: 'zone-a', autofire: false, remoteMode: false },
    shippedContent(),
  );
  const world = game.world;
  world.debugFlags.godMode = true;
  world.stage?.restartAt(checkpoint);
  spawnPlayer(world.players[0], world.camera);
  let drops = 0;
  for (let t = 0; t < 20_000 && world.camera.x < until; t++) {
    game.step();
    const enemies = world.enemies;
    for (const enemy of enemies.enemies) {
      if (enemy.state !== EnemyState.Live) continue;
      if ((enemy.flags & EnemyFlag.OnScreen) !== 0) enemies.kill(enemy);
    }
    drops += enemies.outcomes.dropCount;
    world.events.clear();
  }
  expect(world.camera.x).toBeGreaterThanOrEqual(until);
  return drops;
}

describe('playtest: zone A recovery after every checkpoint (M1-18)', () => {
  it.each([0, 1, 2])(
    `drops ≥ ${String(MIN_CAPSULES)} capsules within ${String(WINDOW)} px of checkpoint %i`,
    (checkpoint) => {
      const x = STAGE.checkpoints[checkpoint].x;
      const sources = capsuleSources();
      const inWindow = sources.filter((s) => s >= x && s < x + WINDOW).length;
      // Stop as the next source beyond the window comes into play (or at the WARNING).
      const warning = STAGE.events.find((e) => e.type === 'warning')?.x ?? STAGE.length;
      const until = Math.min(sources.find((s) => s >= x + WINDOW) ?? warning, warning);
      const drops = perfectFrom(checkpoint, until);
      expect(inWindow).toBeGreaterThanOrEqual(MIN_CAPSULES);
      expect(drops).toBe(inWindow);
    },
  );
});
