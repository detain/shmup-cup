/**
 * The zone D playtest (plan M2-12): the 4-way bot (`four-way-bot.ts`) plays MAGMA DEEP headless
 * through the harness (`harness.ts`), the way a remote player would.
 *
 * - With **god mode** the bot plays the whole zone — the erupting caldera fields, the dive into the
 *   caves, the brick maze, the lava river — shoots CINDER BASTION (CB-04) down through its three
 *   phases and reaches `stageClear` in 3 to 6 minutes (shmup_feat.md §14), never diagonal, the
 *   ship at x ≈ 64, with the 4-way design rules of `rules.ts` holding on every tick; the camera
 *   dives 200 px on the way.
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported — not asserted.
 */
import { BossState } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone D with the 4-way bot (M2-12)', () => {
  it('kills CINDER BASTION and reaches stage clear in god mode, in 3 to 6 minutes', () => {
    const rules = createRuleWatch();
    const phases = new Set<number>();
    let deepest = 0;
    const run = runStage('zone-d', fourWayBot(), {
      godMode: true,
      observe(world) {
        rules.observe(world);
        deepest = Math.max(deepest, world.camera.y);
        for (const boss of world.bosses.slots) {
          if (boss.state === BossState.Fight) phases.add(boss.phase);
        }
      },
    });
    console.info('[playtest] ' + describeRun(run));
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    expect(run.seconds).toBeGreaterThanOrEqual(3 * 60);
    expect(run.seconds).toBeLessThanOrEqual(6 * 60);
    // The boss went through its three phases; the camera dived into the caves on the way.
    expect([...phases].sort()).toEqual([0, 1, 2]);
    expect(deepest).toBe(200);
    // A remote player: never two directions at once, parked at x ≈ 64.
    expect(run.diagonalTicks).toBe(0);
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    expect(run.shipX.min).toBeGreaterThan(BOT_X - 4);
    expect(run.shipX.max).toBeLessThan(BOT_X + 4);
    // The 4-way design rules on every tick of the zone and the boss fight.
    expect(rules.violations).toEqual([]);
    expect(rules.maxBulletSpeed).toBeGreaterThan(0);
    expect(rules.maxBulletSpeed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
    expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
  }, 60_000);

  it('records a run without god mode and reports its deaths', () => {
    const run = runStage('zone-d', fourWayBot(), {});
    const deaths =
      run.deaths.length === 0
        ? 'no deaths'
        : run.deaths
            .map((d) => `${d.cause} at camera x ${String(d.cameraX)}${d.boss ? ' (boss)' : ''}`)
            .join('; ');
    console.info('[playtest] ' + describeRun(run) + '\n[playtest] deaths: ' + deaths);
    expect(['stageClear', 'gameOver']).toContain(run.status);
    expect(run.diagonalTicks).toBe(0);
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    const replay = replayStage('zone-d', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 60_000);
});
