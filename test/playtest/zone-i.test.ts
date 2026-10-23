/**
 * The zone I playtest (plan M2-14): the 4-way bot (`four-way-bot.ts`) plays ABYSSAL THRONE headless
 * through the harness (`harness.ts`), the way a remote player would.
 *
 * - With **god mode** the bot plays the whole zone — the descent with its gulpers and depth mines,
 *   the trench's eels, the crawlers on the lip, the mine field, the TRENCH HERMIT in the antechamber,
 *   the undertow — flies round the ABYSS ARK (AA-09, a raid: the camera follows it) through its two
 *   phases, shoots down THE HOLLOW KING (HK-10) its final blast reveals through three phases (a boss
 *   inside a boss) and reaches `stageClear` in 4 to 7 minutes (`designs/zone-i.md` §12's window, the
 *   R5-09.S6 retarget of the v1 §14 band, its ceiling widened to 420 s by decision R5-D13), never
 *   diagonal, the ship at x ≈ 96 (`BOT_X`), the enemy pool and the boss part space inside their
 *   headroom, the 4-way design rules holding.
 * - **Without god mode** the run is recorded (its input replays to the same deaths and the same
 *   final `hashWorld`) and its deaths are reported — not asserted.
 */
import { BossState, EnemyState, MAX_BOSS_PARTS, MAX_ENEMIES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { v1y } from '../../packages/core/test/helpers/v1-port.js';
import { BOT_X, fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage } from './harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from './rules.js';
import { ZONE_CONTRACTS, boundsOf } from '../integration/zones/helpers.js';

/** The contract's remastered bot-run band: 4.0 to 7.0 minutes (R5-D2's window, the ceiling
 *  widened to 420 s by decision R5-D13). */
const BOT_RUN_SEC = (() => {
  const band = boundsOf(ZONE_CONTRACTS.i).botRunSec;
  if (band === null) throw new Error('zone I lost its bot-run band');
  return band;
})();

describe('playtest: zone I with the 4-way bot (M2-14)', () => {
  it('raids the ABYSS ARK, kills THE HOLLOW KING inside it and reaches stage clear in god mode, in 4 to 7 minutes', () => {
    const rules = createRuleWatch();
    const phases = new Set<string>();
    let followed = 0;
    let armed = 0;
    let eels = 0;
    // The design §12 peak sampling (R5-09.S6): live enemies and boss parts per slot, per tick.
    let peakEnemies = 0;
    const peakParts = [0, 0, 0, 0];
    const run = runStage('zone-i', fourWayBot(), {
      godMode: true,
      observe(world) {
        rules.observe(world);
        if (world.enemies.count > peakEnemies) peakEnemies = world.enemies.count;
        const enemies = world.content.enemies;
        let slot = -1;
        for (const boss of world.bosses.slots) {
          slot++;
          if (boss.state === BossState.Fight) {
            phases.add(`${enemies[boss.specIndex].id}:${boss.phase}`);
            if (boss.partCount > peakParts[slot]) peakParts[slot] = boss.partCount;
          }
        }
        if (world.stage?.following === world.bosses.raidCamera) followed++;
        if (world.tick % 10 === 0) {
          for (const e of world.enemies.enemies) {
            if (e.state !== EnemyState.Live) continue;
            const id = enemies[e.specIndex].id;
            // A mine that armed: it stopped and flashes for its fuse.
            if (id === 'depth-mine' && e.flashTicks > 8) armed++;
            if (id === 'trench-eel' && e.y < world.camera.y + v1y(170)) eels++;
          }
        }
      },
    });
    console.info(
      '[playtest] ' +
        describeRun(run) +
        ` — phases ${[...phases].join(' ')} — peak live enemies ${String(peakEnemies)},` +
        ` peak parts per slot ${peakParts.join('/')}`,
    );
    expect(run.status).toBe('stageClear');
    expect(run.bossDefeated).toBe(true);
    // `designs/zone-i.md` §12: the remastered zone runs 4.0 minutes up, read from the zone's
    // own contract; decision R5-D13 widens the ceiling to 420 s (7.0 min), still the contract
    // window (the R5-09.S6 retarget of the v1 §14 3-to-6 band).
    expect(run.seconds).toBeGreaterThanOrEqual(BOT_RUN_SEC[0]);
    expect(run.seconds).toBeLessThanOrEqual(BOT_RUN_SEC[1]);
    // The captain came in the antechamber; the raid (the camera following the ARK) in its
    // two phases, then the king in its three.
    expect([...phases].sort()).toEqual([
      'abyss-ark:0',
      'abyss-ark:1',
      'hollow-king:0',
      'hollow-king:1',
      'hollow-king:2',
      'trench-hermit:0',
    ]);
    expect(followed).toBeGreaterThan(600);
    expect(armed).toBeGreaterThan(0);
    expect(eels).toBeGreaterThan(0);
    // The pools keep their headroom (design §12): never more than 80 % of the 64 enemy
    // slots live at once, and never more parts on a boss slot than the part space — the
    // ARK and the KING each, never their sum (the final blast reveals the KING while the
    // ARK's parts still die).
    expect(peakEnemies).toBeLessThanOrEqual(0.8 * MAX_ENEMIES);
    for (const peak of peakParts) expect(peak).toBeLessThanOrEqual(MAX_BOSS_PARTS);
    // A remote player: never two directions at once, parked at x ≈ 96.
    expect(run.diagonalTicks).toBe(0);
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
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
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
    const replay = replayStage('zone-i', run.inputs, {});
    expect(replay.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(replay.status).toBe(run.status);
    expect(replay.hash).toBe(run.hash);
  }, 60_000);
});
