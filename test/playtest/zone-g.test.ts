/**
 * The zone G playtest (plan M2-13): the 4-way bot (`four-way-bot.ts`) plays PRISM LABYRINTH
 * headless through the harness (`harness.ts`), the way a remote player would.
 *
 * - With **god mode** the bot plays the whole zone — the prism field, the prism gallery, the
 *   crystal labyrinth's walls hanging from the ceiling and rising from the floor in turn, the cube
 *   rush, the refraction run — shoots FACET MONARCH (FM-07) down through its three phases and
 *   reaches `stageClear` in 3 to 6 minutes (shmup_feat.md §14), never diagonal, the ship at x ≈ 64,
 *   with the 4-way design rules of `rules.ts` holding on every tick; the cube rush stacks cubes
 *   into the terrain on the way.
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported — not asserted.
 */
import { BossState } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage, shippedContent } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone G with the 4-way bot (M2-13)', () => {
  it('kills FACET MONARCH and reaches stage clear in god mode, in 3 to 6 minutes', () => {
    const rules = createRuleWatch();
    const phases = new Set<number>();
    const tileset = shippedContent().tilesets.find((t) => t.id === 'terrain-prism');
    const cube = (tileset?.tiles.findIndex((t) => t.name === 'cube') ?? -1) + 1;
    let stacked = 0;
    const run = runStage('zone-g', fourWayBot(), {
      godMode: true,
      observe(world) {
        rules.observe(world);
        // The cube rush's cubes that became terrain (every second is enough).
        const destructible = world.gimmicks.destructible;
        if (destructible !== null && world.tick % 60 === 0) {
          const tiles = destructible.map.tiles;
          let placed = 0;
          for (let i = 0; i < tiles.length; i++) {
            if (tiles[i] === cube && destructible.pristine[i] !== cube) placed++;
          }
          stacked = Math.max(stacked, placed);
        }
        for (const boss of world.bosses.slots) {
          if (boss.state === BossState.Fight) phases.add(boss.phase);
        }
      },
    });
    console.info('[playtest] ' + describeRun(run) + ` — ${String(stacked)} rush cube(s) stacked`);
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    expect(run.seconds).toBeGreaterThanOrEqual(3 * 60);
    expect(run.seconds).toBeLessThanOrEqual(6 * 60);
    // The boss went through its three phases; the cube rush stacked into the terrain.
    expect([...phases].sort()).toEqual([0, 1, 2]);
    expect(cube).toBeGreaterThan(0);
    expect(stacked).toBeGreaterThan(0);
    // A remote player: never two directions at once, parked at x ≈ 64.
    expect(run.diagonalTicks).toBe(0);
    expect(run.shipX.min).toBeGreaterThan(BOT_X - 4);
    expect(run.shipX.max).toBeLessThan(BOT_X + 4);
    // The 4-way design rules on every tick of the zone and the boss fight.
    expect(rules.violations).toEqual([]);
    expect(rules.maxBulletSpeed).toBeGreaterThan(0);
    expect(rules.maxBulletSpeed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
    expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
  }, 60_000);

  it('records a run without god mode and reports its deaths', () => {
    const run = runStage('zone-g', fourWayBot(), {});
    const deaths =
      run.deaths.length === 0
        ? 'no deaths'
        : run.deaths
            .map((d) => `${d.cause} at camera x ${String(d.cameraX)}${d.boss ? ' (boss)' : ''}`)
            .join('; ');
    console.info('[playtest] ' + describeRun(run) + '\n[playtest] deaths: ' + deaths);
    expect(['stageClear', 'gameOver']).toContain(run.status);
    expect(run.diagonalTicks).toBe(0);
    const replay = replayStage('zone-g', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 60_000);
});
