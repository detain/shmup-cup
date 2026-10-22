/**
 * The zone G playtest (plan M2-13, remastered by R5-07.S6): the 4-way bot (`four-way-bot.ts`)
 * plays the new PRISM LABYRINTH headless through the harness (`harness.ts`), the way a remote
 * player would — never a diagonal, forced autofire, OK only to equip Speed / Missile / Option.
 *
 * - With **god mode** the bot plays the whole zone — the prism field, the gallery mouth's pan
 *   down to the twelve crystal walls, the mid-boss PRISM SENTINEL at the boss event at x 8,040,
 *   the slide to the deep band, the cube rush stacked on its stub pillars, the refraction hall
 *   of moving crystal blocks, the heart ring and the geyser run and the final calm — shoots
 *   FACET MONARCH (FM-07) down through its three phases and reaches `stageClear`; the run lasts
 *   within the zone contract's 4–6 minutes (decision R5-D2's v2 bounds), the ship stays at
 *   x ≈ 96 (`BOT_X`), and the 4-way design rules of `rules.ts` hold on every tick (no aimed
 *   enemy bullet over 3 px/tick, no two simultaneous laser lanes closer than 24 px).
 * - The peak simultaneous live enemies and the biggest live boss part tree stay within the
 *   design's §12 pool ceilings (≤ 80 % of `MAX_ENEMIES`; ≤ `MAX_BOSS_PARTS`), sampled through
 *   the harness's `observe` hook — particles are not measured (they live in render-pixi).
 * - The cube rush still stacks cubes into the tileset's cube tiles (the M2-13 law, re-proven
 *   on the remastered geometry).
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported in the test output — not asserted: they
 *   measure the balance, they do not gate it.
 */
import { BossRole, BossState, EnemyState, MAX_BOSS_PARTS, MAX_ENEMIES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { ZONE_CONTRACTS, boundsOf } from '../integration/zones/helpers.js';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage, shippedContent } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';

describe('playtest: zone G with the 4-way bot (M2-13, R5-07 remaster)', () => {
  it('plays the prism sentinel, kills FACET MONARCH and reaches stage clear in god mode, in 4 to 6 minutes', () => {
    // The contract's live bot-window (the flip is R5-07.S5b's, decision R5-D2's v2 bounds).
    const botRun = boundsOf(ZONE_CONTRACTS.g).botRunSec;
    if (botRun === null) {
      throw new Error('zone G remastered must carry its contract bot-window');
    }
    const rules = createRuleWatch();
    const phases = new Set<number>();
    const captains = new Set<string>();
    let peakEnemies = 0;
    let peakParts = 0;
    const tileset = shippedContent().tilesets.find((t) => t.id === 'terrain-prism');
    const cube = (tileset?.tiles.findIndex((t) => t.name === 'cube') ?? -1) + 1;
    let stacked = 0;
    const run = runStage('zone-g', fourWayBot(), {
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
      },
    });
    console.info(
      '[playtest] ' +
        describeRun(run) +
        ` — captain(s) ${String(captains.size)}, peak live enemies ${String(peakEnemies)}, ` +
        `peak boss parts ${String(peakParts)}, ${String(stacked)} rush cube(s) stacked`,
    );
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    expect(run.seconds).toBeGreaterThanOrEqual(botRun[0]);
    expect(run.seconds).toBeLessThanOrEqual(botRun[1]);
    // The design's set pieces: the captain before the mid-line (§7), the Monarch's three phases (§8).
    expect([...captains].sort()).toEqual(['prism-sentinel']);
    expect([...phases].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    // Design §12: nothing near a pool ceiling (peaks were sampled, not guessed).
    expect(peakEnemies).toBeLessThanOrEqual(Math.floor(MAX_ENEMIES * 0.8));
    expect(peakParts).toBeLessThanOrEqual(MAX_BOSS_PARTS);
    // The M2-13 rush law survives the remaster: cubes became terrain on the way.
    expect(cube).toBeGreaterThan(0);
    expect(stacked).toBeGreaterThan(0);
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
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    const replay = replayStage('zone-g', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 60_000);
});
