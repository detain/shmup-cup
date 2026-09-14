/**
 * The zone H playtest (plan M2-14): the 4-way bot (`four-way-bot.ts`) plays IRON CITADEL headless
 * through the harness (`harness.ts`), the way a remote player would.
 *
 * - With **god mode** the bot plays the whole zone — the outer walls with their hatches, the piston
 *   hall's moving floors and ceilings and its laser emitters, the parade of four earlier bosses in
 *   reduced form, the core run — shoots IRON SOVEREIGN (IS-08) down through its four phases and
 *   reaches `stageClear` in 3 to 6 minutes (shmup_feat.md §14), never diagonal, the ship at x ≈ 64,
 *   with the 4-way design rules of `rules.ts` holding on every tick.
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported — not asserted.
 */
import { BossRole, BossState, EnemyState } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone H with the 4-way bot (M2-14)', () => {
  it('fights the parade, kills IRON SOVEREIGN and reaches stage clear in god mode, in 3 to 6 minutes', () => {
    const rules = createRuleWatch();
    const phases = new Set<number>();
    const captains = new Set<string>();
    const blockYs = new Set<number>();
    let emitterLasers = 0;
    let mites = 0;
    const run = runStage('zone-h', fourWayBot(), {
      godMode: true,
      observe(world) {
        rules.observe(world);
        const enemies = world.content.enemies;
        for (const boss of world.bosses.slots) {
          if (boss.state !== BossState.Fight) continue;
          if (boss.role === BossRole.Captain) captains.add(enemies[boss.specIndex].id);
          else phases.add(boss.phase);
        }
        // The pistons: the moving blocks' heights change as they swing.
        const blocks = world.terrain?.blocks ?? null;
        if (blocks !== null && world.tick % 30 === 0) {
          for (let i = 0; i < blocks.count; i++)
            if (blocks.live[i] === 1) blockYs.add(blocks.y0[i]);
        }
        // An emitter's lane: a laser attached to an enemy (sources 0 … 63 are the enemy slots).
        const lasers = world.bullets.lasers;
        for (let i = 0; i < lasers.count; i++) {
          const src = lasers.fields.src[i];
          if (src >= 0 && src < 64 && world.enemies.enemies[src].state === EnemyState.Live) {
            emitterLasers++;
            break;
          }
        }
        if (world.tick % 30 === 0) {
          for (const e of world.enemies.enemies) {
            if (e.state === EnemyState.Live && enemies[e.specIndex].id === 'hatch-mite') mites++;
          }
        }
      },
    });
    console.info(
      '[playtest] ' +
        describeRun(run) +
        ` — ${String(captains.size)} parade captain(s), ${String(emitterLasers)} emitter lane tick(s)`,
    );
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    expect(run.seconds).toBeGreaterThanOrEqual(3 * 60);
    expect(run.seconds).toBeLessThanOrEqual(6 * 60);
    // The finale's four phases; the whole parade; the pistons swinging, the emitters and hatches.
    expect([...phases].sort()).toEqual([0, 1, 2, 3]);
    expect([...captains].sort()).toEqual([
      'echo-bastion',
      'echo-bulwark',
      'echo-maw',
      'echo-regent',
    ]);
    expect(blockYs.size).toBeGreaterThan(4);
    expect(emitterLasers).toBeGreaterThan(0);
    expect(mites).toBeGreaterThan(0);
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
    const run = runStage('zone-h', fourWayBot(), {});
    const deaths =
      run.deaths.length === 0
        ? 'no deaths'
        : run.deaths
            .map((d) => `${d.cause} at camera x ${String(d.cameraX)}${d.boss ? ' (boss)' : ''}`)
            .join('; ');
    console.info('[playtest] ' + describeRun(run) + '\n[playtest] deaths: ' + deaths);
    expect(['stageClear', 'gameOver']).toContain(run.status);
    expect(run.diagonalTicks).toBe(0);
    const replay = replayStage('zone-h', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 60_000);
});
