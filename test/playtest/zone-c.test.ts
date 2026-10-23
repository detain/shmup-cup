/**
 * The zone C playtest (plan M2-11): the 4-way bot (`four-way-bot.ts`) plays DUNE EXPANSE headless
 * through the harness (`harness.ts`), the way a remote player would.
 *
 * - With **god mode** the bot plays the whole zone — the dunes and their sand worms, the canyon
 *   with its ceiling walkers, the worm field, the DUNE SCORPION arena, the dune-surf storm run —
 *   meets the captain, shoots SANDGRAVE WIDOW (SW-03) down through its three phases and reaches
 *   `stageClear` in 4 to 7 minutes (`designs/zone-c.md` §15's acceptance and wave-11 rule 3, the
 *   R5-03.S6 retarget of the v1 §14 3-to-6 band), never diagonal, the ship at x ≈ 96, with the
 *   4-way design rules of `rules.ts` holding on every tick and the sim caps untouched: peak live
 *   enemies within 80 % of `MAX_ENEMIES`, peak boss parts within `MAX_BOSS_PARTS`.
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported — not asserted.
 */
import { BossState, MAX_BOSS_PARTS, MAX_ENEMIES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone C with the 4-way bot (M2-11)', () => {
  it('kills SANDGRAVE WIDOW and reaches stage clear in god mode, in 4 to 7 minutes', () => {
    const rules = createRuleWatch();
    const phases = new Set<number>();
    let scorpion = false;
    let maxEnemies = 0;
    let maxParts = 0;
    const run = runStage('zone-c', fourWayBot(), {
      godMode: true,
      observe(world) {
        rules.observe(world);
        if (world.enemies.count > maxEnemies) maxEnemies = world.enemies.count;
        for (const boss of world.bosses.slots) {
          if (boss.state !== BossState.Fight) continue;
          if (boss.role === 1) scorpion = true;
          else {
            phases.add(boss.phase);
            if (boss.partCount > maxParts) maxParts = boss.partCount;
          }
        }
      },
    });
    console.info('[playtest] ' + describeRun(run));
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    // Wave-11 rule 3 / design §15 sized the zone at 4.0 to 6.0 minutes (the R5-03.S6
    // retarget of the v1 §14 3-to-6 band; the R5-03.S6 measured god run is 296.5 s); decision
    // R5-D13 widened the contract ceiling to 7 minutes.
    expect(run.seconds).toBeGreaterThanOrEqual(4 * 60);
    expect(run.seconds).toBeLessThanOrEqual(7 * 60);
    // The captain came, and the boss went through its three phases (the fangs, the head, the
    // enraged last — the R5-03.S4b rebuild).
    expect(scorpion).toBe(true);
    expect([...phases].sort()).toEqual([0, 1, 2]);
    // A remote player: never two directions at once, parked at x ≈ 96.
    expect(run.diagonalTicks).toBe(0);
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    expect(run.shipX.min).toBeGreaterThan(BOT_X - 4);
    expect(run.shipX.max).toBeLessThan(BOT_X + 4);
    // The 4-way design rules on every tick of the zone and the boss fight.
    expect(rules.violations).toEqual([]);
    expect(rules.maxBulletSpeed).toBeGreaterThan(0);
    expect(rules.maxBulletSpeed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
    expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
    // Design §12's peaks vs the sim caps: nothing above 80 % — the bot's live enemy count and
    // the widow's full 11-part tree stay inside 0.8 · MAX_ENEMIES and MAX_BOSS_PARTS.
    expect(maxEnemies).toBeLessThanOrEqual(0.8 * MAX_ENEMIES);
    expect(maxParts).toBeLessThanOrEqual(MAX_BOSS_PARTS);
  }, 60_000);

  it('records a run without god mode and reports its deaths', () => {
    const run = runStage('zone-c', fourWayBot(), {});
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
    const replay = replayStage('zone-c', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 60_000);
});
