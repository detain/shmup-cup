/**
 * The zone A playtest (plan M1-18, remastered by R5-01.S6): the 4-way bot (`four-way-bot.ts`)
 * plays the new AZURE VERGE headless through the harness (`harness.ts`), the way a remote
 * player would — never a diagonal, forced autofire, OK only to equip Speed / Missile / Option.
 *
 * - With **god mode** the bot plays the whole stage, sees the captain AZURE MARSHAL at the
 *   boss event at x 10,350, shoots HALCYON BULWARK (HB-01) down through its three phases and
 *   reaches `stageClear`; the run lasts within the zone contract's 4–7 minutes (decision
 *   R5-D2's v2 bounds), the ship stays at x ≈ 96 (`BOT_X`), and the 4-way design rules of
 *   `rules.ts` hold on every tick (no aimed enemy bullet over 3 px/tick, no two simultaneous
 *   laser lanes closer than 24 px).
 * - The peak simultaneous live enemies and the biggest live boss part tree stay within the
 *   design's §12 pool ceilings (≤ 80 % of `MAX_ENEMIES`; ≤ `MAX_BOSS_PARTS`), sampled through
 *   the harness's `observe` hook — particles are not measured (they live in render-pixi).
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported in the test output — not asserted: they
 *   measure the balance, they do not gate it.
 * - The debug stage skip (`stageSkip: 'boss'`) brings the WARNING within a few seconds — the
 *   skip still targets HALCYON BULWARK's warning, never the captain (`R5-P.P14`).
 */
import { BossRole, BossState, EnemyState, MAX_BOSS_PARTS, MAX_ENEMIES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { ZONE_CONTRACTS, boundsOf } from '../integration/zones/helpers.js';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage, TICKS_PER_SECOND } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone A with the 4-way bot (M1-18, R5-01 remaster)', () => {
  it('plays the marshal, kills HALCYON BULWARK and reaches stage clear in god mode, in 4 to 7 minutes', () => {
    // The contract's live bot-window (the v2 branch carries it; the flip is R5-01.S5b's).
    const botRun = boundsOf(ZONE_CONTRACTS.a).botRunSec;
    if (botRun === null) {
      throw new Error('zone A remastered must carry its contract bot-window');
    }
    const rules = createRuleWatch();
    const phases = new Set<number>();
    const captains = new Set<string>();
    let peakEnemies = 0;
    let peakParts = 0;
    const run = runStage('zone-a', fourWayBot(), {
      godMode: true,
      observe(world) {
        rules.observe(world);
        const enemies = world.content.enemies;
        let live = 0;
        for (const e of world.enemies.enemies) {
          if (e.state === EnemyState.Live) live++;
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
    // The design's set piece: the captain before the Bulwark, the Bulwark's three phases (§8).
    expect([...captains].sort()).toEqual(['azure-marshal']);
    expect([...phases].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    // Design §12: nothing near a pool ceiling (peaks were sampled, not guessed).
    expect(peakEnemies).toBeLessThanOrEqual(Math.floor(MAX_ENEMIES * 0.8));
    expect(peakParts).toBeLessThanOrEqual(MAX_BOSS_PARTS);
    // A remote player: never two directions at once, parked at x ≈ 96.
    expect(run.diagonalTicks).toBe(0);
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    expect(run.shipX.min).toBeGreaterThan(BOT_X - 4);
    expect(run.shipX.max).toBeLessThan(BOT_X + 4);
    // OK pressed on the planned slots only (Speed, Missile, Option).
    expect(run.equips[2] + run.equips[3] + run.equips[5] + run.equips[6]).toBe(0);
    // The 4-way design rules on every tick of the stage and the boss fight.
    expect(rules.violations).toEqual([]);
    expect(rules.maxBulletSpeed).toBeGreaterThan(0);
    expect(rules.maxBulletSpeed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
    expect(rules.maxSeparate).toBeGreaterThanOrEqual(2); // HB-01's last phase overlaps its lanes
    expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
    // A whole stage runs ~1.6 s alone; the full parallel `pnpm test` load once pushed it past the
    // default 5 s (M2-06).
  }, 30_000);

  it('records a run without god mode and reports its deaths', () => {
    const run = runStage('zone-a', fourWayBot(), {});
    const deaths =
      run.deaths.length === 0
        ? 'no deaths'
        : run.deaths
            .map(
              (d) =>
                `${d.cause} at camera x ${String(d.cameraX)} (y ${String(d.y)}` +
                `${d.boss ? ', boss fight' : ''}, ${String(d.livesLeft)} left)`,
            )
            .join('; ');
    console.info('[playtest] ' + describeRun(run) + '\n[playtest] deaths: ' + deaths);
    expect(['stageClear', 'gameOver']).toContain(run.status);
    expect(run.inputs).toHaveLength(run.ticks);
    expect(run.diagonalTicks).toBe(0);
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    // The recording replays into a fresh session: same deaths, same end state.
    const replay = replayStage('zone-a', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 30_000);

  it('reaches the boss within seconds with the debug stage skip', () => {
    const run = runStage('zone-a', fourWayBot(), { godMode: true, stageSkip: 'boss' });
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    // The WARNING (3 s), the intro, the fight and the death sequence — nothing of the stage.
    expect(run.seconds - run.bossFightTicks / TICKS_PER_SECOND).toBeLessThan(15);
  });
});
