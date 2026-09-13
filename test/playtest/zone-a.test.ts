/**
 * The zone A playtest (plan M1-18): the 4-way bot (`four-way-bot.ts`) plays AZURE VERGE headless
 * through the harness (`harness.ts`), the way a remote player would — never a diagonal, forced
 * autofire, OK only to equip Speed / Missile / Option.
 *
 * - With **god mode** the bot plays the whole stage, shoots HALCYON BULWARK (HB-01) down through
 *   its three phases and reaches `stageClear`; the run lasts between 3 and 6 minutes
 *   (shmup_feat.md §14 "stage length"), the ship stays at x ≈ 64, and the 4-way design rules of
 *   `rules.ts` hold on every tick (no enemy bullet over 2 px/tick, no two simultaneous laser lanes
 *   closer than 16 px).
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported in the test output — not asserted: they
 *   measure the balance, they do not gate it.
 * - The debug stage skip (`stageSkip: 'boss'`) brings the WARNING within a few seconds.
 */
import { describe, expect, it } from 'vitest';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage, TICKS_PER_SECOND } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone A with the 4-way bot (M1-18)', () => {
  it('kills HALCYON BULWARK and reaches stage clear in god mode, in 3 to 6 minutes', () => {
    const rules = createRuleWatch();
    const run = runStage('zone-a', fourWayBot(), { godMode: true, observe: rules.observe });
    console.info('[playtest] ' + describeRun(run));
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    expect(run.seconds).toBeGreaterThanOrEqual(3 * 60);
    expect(run.seconds).toBeLessThanOrEqual(6 * 60);
    // A remote player: never two directions at once, parked at x ≈ 64.
    expect(run.diagonalTicks).toBe(0);
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
