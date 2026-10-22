/**
 * The zone F playtest (plan M2-13): the 4-way bot (`four-way-bot.ts`) plays CELL VAULT headless
 * through the harness (`harness.ts`), the way a remote player would.
 *
 * - With **god mode** the bot plays the whole zone — the membrane with its chasing and dividing
 *   cells, the tissue passage between the regenerating walls, the tentacle garden where the warden
 *   circles, the chase through the three regrowing walls, the pulse run — shoots MANTLE REGENT
 *   (MR-06) down through its three phases and reaches `stageClear` in 4 to 6 minutes (design §2's
 *   bot window, shmup_feat.md §14), never diagonal, the ship at x ≈ 96, with the 4-way design
 *   rules of `rules.ts` holding on every tick; on the way its shots break tissue cells and the
 *   grabbing tentacles lunge at it.
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported — not asserted.
 */
import {
  BossRole,
  BossState,
  EnemyState,
  MAX_BOSS_PARTS,
  MAX_ENEMIES,
  MoverKind,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { ZONE_CONTRACTS, boundsOf } from '../integration/zones/helpers.js';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone F with the 4-way bot (M2-13)', () => {
  it('plays the warden, kills MANTLE REGENT and reaches stage clear in god mode', () => {
    const botRun = boundsOf(ZONE_CONTRACTS.f).botRunSec;
    if (botRun === null) {
      throw new Error('zone F remastered must carry its contract bot window');
    }
    const rules = createRuleWatch();
    const phases = new Set<number>();
    const captains = new Set<string>();
    let broken = 0;
    let lunges = 0;
    let peakEnemies = 0;
    let peakParts = 0;
    const run = runStage('zone-f', fourWayBot(), {
      godMode: true,
      observe(world) {
        rules.observe(world);
        broken = Math.max(broken, world.gimmicks.destructible?.destroyed ?? 0);
        const enemies = world.content.enemies;
        let live = 0;
        for (const e of world.enemies.enemies) {
          if (e.state !== EnemyState.Live) continue;
          live++;
          if (e.mover === MoverKind.Homing && enemies[e.specIndex].script === 'tentacle.grab') {
            lunges++;
          }
        }
        if (live > peakEnemies) peakEnemies = live;
        for (const boss of world.bosses.slots) {
          if (boss.state === BossState.None) continue;
          if (boss.role === BossRole.Captain) {
            if (boss.state === BossState.Fight) captains.add(enemies[boss.specIndex].id);
          } else if (boss.state === BossState.Fight) {
            phases.add(boss.phase);
          }
          if (boss.state === BossState.Fight && boss.partCount > peakParts) {
            peakParts = boss.partCount;
          }
        }
      },
    });
    console.info(
      '[playtest] ' +
        describeRun(run) +
        ` — captain(s) ${String(captains.size)}, peak live enemies ${String(peakEnemies)}, ` +
        `peak boss parts ${String(peakParts)}`,
    );
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    expect(run.seconds).toBeGreaterThanOrEqual(botRun[0]);
    expect(run.seconds).toBeLessThanOrEqual(botRun[1]);
    // The warden circled, the boss went through its three phases, and the walls and the
    // tentacles met the ship — all inside §12's peaks law (80 % of the live pool, 24 parts).
    expect([...captains].sort()).toEqual(['nucleus-warden']);
    expect([...phases].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(broken).toBeGreaterThan(0);
    expect(lunges).toBeGreaterThan(0);
    expect(peakEnemies).toBeLessThanOrEqual(Math.floor(MAX_ENEMIES * 0.8));
    expect(peakParts).toBeLessThanOrEqual(MAX_BOSS_PARTS);
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
  }, 60_000);

  it('records a run without god mode and reports its deaths', () => {
    const run = runStage('zone-f', fourWayBot(), {});
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
    const replay = replayStage('zone-f', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 60_000);
});
