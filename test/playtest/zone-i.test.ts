/**
 * The zone I playtest (plan M2-14): the 4-way bot (`four-way-bot.ts`) plays ABYSSAL THRONE headless
 * through the harness (`harness.ts`), the way a remote player would.
 *
 * - With **god mode** the bot plays the whole zone — the descent with its gulpers and depth mines,
 *   the trench's eels, the mine field, the undertow — flies round the ABYSS ARK (AA-09, a raid: the
 *   camera follows it) through its two phases, shoots down THE HOLLOW KING (HK-10) its final blast
 *   reveals through three phases (a boss inside a boss) and reaches `stageClear` in 3 to 6 minutes
 *   (shmup_feat.md §14), never diagonal, the ship at x ≈ 64, the 4-way design rules holding.
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported — not asserted.
 */
import { BossState, EnemyState } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone I with the 4-way bot (M2-14)', () => {
  it('raids the ABYSS ARK, kills THE HOLLOW KING inside it and reaches stage clear in god mode, in 3 to 6 minutes', () => {
    const rules = createRuleWatch();
    const phases = new Set<string>();
    let followed = 0;
    let armed = 0;
    let eels = 0;
    const run = runStage('zone-i', fourWayBot(), {
      godMode: true,
      observe(world) {
        rules.observe(world);
        const enemies = world.content.enemies;
        for (const boss of world.bosses.slots) {
          if (boss.state === BossState.Fight)
            phases.add(`${enemies[boss.specIndex].id}:${boss.phase}`);
        }
        if (world.stage?.following === world.bosses.raidCamera) followed++;
        if (world.tick % 10 === 0) {
          for (const e of world.enemies.enemies) {
            if (e.state !== EnemyState.Live) continue;
            const id = enemies[e.specIndex].id;
            // A mine that armed: it stopped and flashes for its fuse.
            if (id === 'depth-mine' && e.flashTicks > 8) armed++;
            if (id === 'trench-eel' && e.y < world.camera.y + 170) eels++;
          }
        }
      },
    });
    console.info('[playtest] ' + describeRun(run) + ` — phases ${[...phases].join(' ')}`);
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    expect(run.seconds).toBeGreaterThanOrEqual(3 * 60);
    expect(run.seconds).toBeLessThanOrEqual(6 * 60);
    // The raid (the camera following the ARK) in its two phases, then the king in its three.
    expect([...phases].sort()).toEqual([
      'abyss-ark:0',
      'abyss-ark:1',
      'hollow-king:0',
      'hollow-king:1',
      'hollow-king:2',
    ]);
    expect(followed).toBeGreaterThan(600);
    expect(armed).toBeGreaterThan(0);
    expect(eels).toBeGreaterThan(0);
    // A remote player: never two directions at once, parked at x ≈ 64.
    expect(run.diagonalTicks).toBe(0);
    expect(run.shipX.min).toBeGreaterThan(BOT_X - 4);
    expect(run.shipX.max).toBeLessThan(BOT_X + 4);
    // The 4-way design rules on every tick of the zone and the boss fights.
    expect(rules.violations).toEqual([]);
    expect(rules.maxBulletSpeed).toBeGreaterThan(0);
    expect(rules.maxBulletSpeed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
    expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
  }, 60_000);

  it('records a run without god mode and reports its deaths', () => {
    const run = runStage('zone-i', fourWayBot(), {});
    const deaths =
      run.deaths.length === 0
        ? 'no deaths'
        : run.deaths
            .map((d) => `${d.cause} at camera x ${String(d.cameraX)}${d.boss ? ' (boss)' : ''}`)
            .join('; ');
    console.info('[playtest] ' + describeRun(run) + '\n[playtest] deaths: ' + deaths);
    expect(['stageClear', 'gameOver']).toContain(run.status);
    expect(run.diagonalTicks).toBe(0);
    const replay = replayStage('zone-i', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 60_000);
});
