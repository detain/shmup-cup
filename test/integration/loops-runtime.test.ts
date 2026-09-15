/**
 * The ARCADE mode's loops on the shipped content (plan M3-01 — shmup_feat.md §15 "loop 2: remixed
 * layouts, faster bullets, revenge bullets everywhere"): every campaign zone has a `remix` that
 * adds its layout from loop 2 (its events valid, in timeline order, within the stage); the first
 * two minutes of each zone on loop 2 — the 4-way bot with god mode — spawn more enemies than on
 * loop 1, with enemy bullets flying faster at the same rank, and replay in lockstep.
 */
import { LOOP_BULLET_SPEED_STEP, stageForLoop } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { replayStage, runStage, shippedContent } from '../playtest/harness.js';

const DB = shippedContent();
const ZONES = DB.campaign!.zones.map((zone) => DB.stages[zone.stageId].id);

/** Ticks of each zone played on both loops. */
const TICKS = 120 * 60;

describe('loops on the shipped zones (M3-01)', () => {
  it('every campaign zone has a remix merged into its timeline from loop 2', () => {
    expect(ZONES).toHaveLength(9);
    for (const id of ZONES) {
      const stage = DB.stages[DB.stageIndex.get(id)!];
      expect(stage.remix.length, id).toBeGreaterThanOrEqual(4);
      for (const event of stage.remix) {
        expect(event.x, id).toBeGreaterThanOrEqual(0);
        expect(event.x, id).toBeLessThan(stage.length);
      }
      expect(stageForLoop(stage, 1)).toBe(stage);
      const two = stageForLoop(stage, 2);
      expect(two.events.length, id).toBe(stage.events.length + stage.remix.length);
      for (let i = 1; i < two.events.length; i++) {
        expect(two.events[i].x, id).toBeGreaterThanOrEqual(two.events[i - 1].x);
      }
    }
  });

  it.each(ZONES)(
    '%s on loop 2 spawns more, flies faster bullets and replays in lockstep',
    (id) => {
      let loop1Spawned = 0;
      let loop2Spawned = 0;
      let speed1 = 0;
      let speed2 = 0;
      const one = runStage(id, fourWayBot(), {
        godMode: true,
        maxTicks: TICKS,
        config: { rankGrowth: 0 },
        observe: (world) => {
          loop1Spawned = world.enemies.stats.spawned;
          speed1 = world.bullets.speedScale;
        },
      });
      const flags = { godMode: true, maxTicks: TICKS, config: { loop: 2, rankGrowth: 0 } };
      const two = runStage(id, fourWayBot(), {
        ...flags,
        observe: (world) => {
          loop2Spawned = world.enemies.stats.spawned;
          speed2 = world.bullets.speedScale;
        },
      });
      expect(loop2Spawned, id).toBeGreaterThan(loop1Spawned);
      // The loop's rank term raises the rank too: at least the loop step faster.
      expect(speed2 / speed1, id).toBeGreaterThanOrEqual(1 + LOOP_BULLET_SPEED_STEP - 1e-9);
      expect(two.status, id).not.toBe('gameOver');
      expect(one.status, id).not.toBe('gameOver');
      const again = replayStage(id, two.inputs, flags);
      expect(again.hash, id).toBe(two.hash);
    },
    60_000,
  );
});
