/**
 * Allocation guards of `core/bosses` (plan M1-13; definition of done: zero allocations per tick),
 * in their own file so the worker's V8 type feedback comes only from these worlds:
 *
 * - a long **fight**: the shipped test boss tracking the weaving, fully powered KESTREL, its two
 *   roster behaviours alternating on timers (aimed spreads, lane lasers, the vent opening), the
 *   Laser and Options hitting its parts through the grid (damage, clinks, pierce cooldowns) —
 *   its core and guns topped up so it never dies;
 * - each timed state **held** (its clock looped): the WARNING (siren pulses, the brake), the intro
 *   fly-in (the Laser and Options clinking on the invulnerable parts), the death chain;
 * - the **whole cycle** again and again: the WARNING, the intro, a short fight, the death
 *   sequence (cancel, chain, blast with its hit-stop, tally, stage clear).
 *
 * Starting a phase creates its generator and every wake allocates the generator's result (D29);
 * rare events run cold code. The per-tick guards use the budget every World guard uses; the
 * whole-cycle guard runs a boss sequence every ~500 ticks — a hundred times the real rate — so
 * its once-per-boss code (partly in V8's lower tiers, which box doubles) gets a larger one.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/**
 * The boss range with the test boss's phases cycling on timers.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const boss = shipped('enemies/test-boss.enemies.json');
  const data = boss.data as { enemies: { boss: { phases: unknown[]; introTicks: number } }[] };
  data.enemies[0].boss.phases = [
    {
      script: 'boss.hover',
      params: { fireTicks: 40, openTicks: 30, closedTicks: 50 },
      until: { ticks: 400 },
    },
    { script: 'boss.lanes', params: { laserTicks: 60, fireTicks: 45, trackSpeed: 0.5 } },
  ];
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/test-range.enemies.json'),
      boss,
      shipped('stages/test-boss.stage.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/bosses allocation (M1-13)', () => {
  it('allocates nothing over a long fight: parts hit, clinks, lasers, tracking, phases', () => {
    const w = createWorld(
      resolveGameConfig({ stage: 'test-boss', loadout: 'full', seed: 13 }),
      db(),
    );
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    while (w.bosses.boss.state !== BossState.Fight) {
      stepWorld(w, input);
      w.events.clear();
    }
    const boss = w.bosses.boss;
    const parts = boss.parts;
    let t = 0;
    let phaseChanges = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 40) % 2 < 1 ? Action.Up : Action.Down);
        // Keep it alive and armed: the core and the guns are topped up.
        if (parts[4].hp < 50) parts[4].hp = 1000;
        if (parts[7].hp < 5) parts[7].hp = 1000;
        if (parts[8].hp < 5) parts[8].hp = 1000;
        const phase = boss.phase;
        t++;
        stepWorld(w, input);
        if (boss.phase !== phase) phaseChanges++;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(boss.state).toBe(BossState.Fight);
    expect(phaseChanges).toBeGreaterThan(0);
    expect(w.scoring.board.scores[0].score).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);

  it.each([
    ['the WARNING (siren pulses, the brake)', BossState.Warning, 150],
    ['the intro fly-in (parts hit, clinking)', BossState.Intro, 100],
    ['the death chain (explosions every 8 ticks)', BossState.Dying, 110],
  ] as const)(
    'allocates nothing per tick in %s, held there',
    (_label, state, span) => {
      const content = db();
      const w = createWorld(
        resolveGameConfig({ stage: 'test-boss', loadout: 'full', seed: 15 }),
        content,
      );
      w.debugFlags.godMode = true;
      const input = createInputSnapshot();
      const boss = w.bosses.boss;
      while (boss.state !== state) {
        stepWorld(w, input);
        if (state === BossState.Dying && boss.state === BossState.Fight) w.bosses.defeat(0);
        w.events.clear();
      }
      let t = 0;
      let wraps = 0;
      const growth = measureHeapGrowth(
        () => {
          commitPlayerInput(input.players[0], (t / 32) % 2 < 1 ? Action.Up : Action.Down);
          t++;
          stepWorld(w, input);
          // Hold the state: its clock loops (the pulses / chain explosions keep coming).
          if (boss.stateTicks > span) {
            boss.stateTicks = 1;
            wraps++;
          }
          w.events.clear();
        },
        10_000,
        20_000,
      );
      expect(boss.state).toBe(state);
      expect(wraps).toBeGreaterThan(100);
      expect(growth.bytes).toBeLessThan(64 * 1024);
    },
    120_000,
  );

  it('keeps whole WARNING → intro → fight → death sequences to a few KB each (rare events)', () => {
    const content = db();
    const w = createWorld(resolveGameConfig({ stage: 'test-boss', seed: 14 }), content);
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const index = content.enemyIndex.get('test-boss') ?? -1;
    const boss = w.bosses.boss;
    let t = 0;
    let cycles = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 32) % 2 < 1 ? Action.Up : Action.Down);
        t++;
        stepWorld(w, input);
        if (boss.state === BossState.Fight && boss.stateTicks > 20) w.bosses.defeat(0);
        if (boss.state === BossState.Dead) {
          w.status = 'playing';
          w.bosses.startWarning(index);
          cycles++;
        }
        w.events.clear();
      },
      10_000,
      20_000,
    );
    // ~20 sequences in the measured window: each runs its once-per-boss code (a new phase
    // generator, part explosions, the tally) partly in V8's lower tiers, which box doubles.
    expect(cycles).toBeGreaterThan(40);
    expect(growth.bytes).toBeLessThan(128 * 1024);
  }, 120_000);
});
