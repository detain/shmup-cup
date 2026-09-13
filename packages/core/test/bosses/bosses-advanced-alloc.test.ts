/**
 * Allocation guards of the advanced bosses (plan M2-09; definition of done: zero allocations per
 * tick), in their own file so the worker's V8 type feedback comes only from these worlds — on the
 * shipped dev stages:
 *
 * - a **raid** held in its fight (the raid range's IRON LEVIATHAN): the camera following its
 *   boss-relative segments (looping), its turrets turned to the weaving, fully powered KESTREL and
 *   firing along their headings, the Laser and Options hitting the circle turrets and the reactor;
 * - a **double boss** held in its fight (the twin range): turns every 300 ticks (withdrawing,
 *   coming forward, the back batch), both scripts, lanes and spreads;
 * - a **captain** circling (the captain range's ORBIT WARDEN): its orbit and its spinning orbs
 *   (turned parts every tick), rings, while the stage scrolls on.
 *
 * Every wake of a boss script allocates its generator's result (decision D29); the parts are
 * topped up so nobody dies (deaths and phase changes run cold code).
 */
import { describe, expect, it } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { readContentFiles } from '../../../../vite.shared.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * The shipped content.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(readContentFiles(), { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return content;
}

/**
 * A fully powered game on a dev stage, stepped until its first boss slot fights.
 *
 * @param stage - Stage id.
 * @param seed - Seed.
 * @returns The world.
 */
function fighting(stage: string, seed: number): World {
  const w = createWorld(resolveGameConfig({ stage, loadout: 'full', seed, rankGrowth: 0 }), db());
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 20_000 && w.bosses.boss.state !== BossState.Fight; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  return w;
}

/**
 * Keeps every boss slot's parts alive (topped up) — no deaths in the measured window.
 *
 * @param w - The world.
 */
function topUp(w: World): void {
  const slots = w.bosses.slots;
  for (let s = 0; s < slots.length; s++) {
    const boss = slots[s];
    for (let i = 0; i < boss.partCount; i++) {
      const part = boss.parts[i];
      if (part.hp < 5 && !part.destroyed) part.hp = 1000;
    }
  }
}

/**
 * Measures a held fight: the ship weaving, the parts topped up.
 *
 * @param w - The world.
 * @returns The measured growth in bytes.
 */
function measure(w: World): number {
  const input = createInputSnapshot();
  let t = 0;
  const growth = measureHeapGrowth(
    () => {
      commitPlayerInput(input.players[0], (t / 40) % 2 < 1 ? Action.Up : Action.Down);
      topUp(w);
      t++;
      stepWorld(w, input);
      w.events.clear();
    },
    10_000,
    20_000,
  );
  return growth.bytes;
}

describe('core/bosses allocation — advanced bosses (M2-09)', () => {
  it('allocates nothing per tick in a raid: the camera path, turned turrets, circle hits', () => {
    const w = fighting('raid-range', 21);
    const boss = w.bosses.boss;
    expect(boss.raiding).toBe(true);
    // Never escape during the guard.
    boss.timeLimit = 0;
    const bytes = measure(w);
    expect(boss.state).toBe(BossState.Fight);
    expect(boss.raiding).toBe(true);
    expect(bytes).toBeLessThan(64 * 1024);
  }, 120_000);

  it('allocates nothing per tick in a double-boss fight with its turns', () => {
    const w = fighting('twin-range', 22);
    const [lead, mate] = w.bosses.slots;
    let turns = 0;
    let resting = lead.resting;
    const input = createInputSnapshot();
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 40) % 2 < 1 ? Action.Up : Action.Down);
        topUp(w);
        t++;
        stepWorld(w, input);
        if (lead.resting !== resting) {
          resting = lead.resting;
          turns++;
        }
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect([lead.state, mate.state]).toEqual([BossState.Fight, BossState.Fight]);
    expect(turns).toBeGreaterThan(20);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);

  it('allocates nothing per tick while a captain circles with its spinning orbs', () => {
    const w = createWorld(
      resolveGameConfig({ stage: 'captain-range', loadout: 'full', seed: 23, rankGrowth: 0 }),
      db(),
    );
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const circler = w.content.enemyIndex.get('captain-circler') ?? -1;
    const boss = w.bosses.boss;
    for (
      let i = 0;
      i < 20_000 && !(boss.specIndex === circler && boss.state === BossState.Fight);
      i++
    ) {
      if (boss.state === BossState.Fight && boss.specIndex !== circler) w.bosses.defeat(0);
      stepWorld(w, input);
      w.events.clear();
    }
    expect([boss.specIndex, boss.state]).toEqual([circler, BossState.Fight]);
    const bytes = measure(w);
    expect(boss.state).toBe(BossState.Fight);
    expect(bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
