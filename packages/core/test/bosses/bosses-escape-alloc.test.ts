/**
 * Allocation guard of a boss's escape (plan M2-09 boss timers; definition of done: zero
 * allocations per tick), in its own file so the worker's V8 type feedback comes only from this
 * world: the raid range's IRON LEVIATHAN escaping after its time limit — its eased flight off to
 * the right (`BossMotion.MoveTo` in `BossState.Escape`), the raid camera easing back to where the
 * raid began (`steerRaid`'s return, followed by the stage runner with the timeline held), the parts
 * out of the grid, the HP bar still counting it — held in the middle of the escape for the whole
 * window (its clocks rewound every tick), the fully powered KESTREL weaving and firing.
 */
import { describe, expect, it } from 'vitest';
import { BossMotion, BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { readContentFiles } from '../../../../vite.shared.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/bosses allocation — an escape (M2-09)', () => {
  it('allocates nothing per tick while a raid escapes and its camera eases back', () => {
    const { db, issues } = loadContent(readContentFiles(), { extraSprites: ENGINE_SPRITES });
    expect(issues).toEqual([]);
    const w = createWorld(
      resolveGameConfig({ stage: 'raid-range', loadout: 'full', seed: 24, rankGrowth: 0 }),
      db,
    );
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const boss = w.bosses.boss;
    for (let i = 0; i < 20_000 && boss.state !== BossState.Fight; i++) {
      stepWorld(w, input);
      w.events.clear();
    }
    expect(boss.raiding).toBe(true);
    // Let the camera path run a while, then run out of time.
    for (let i = 0; i < 200; i++) {
      stepWorld(w, input);
      w.events.clear();
    }
    boss.timeLimit = boss.fightTicks + 1;
    for (let i = 0; i < 10; i++) {
      stepWorld(w, input);
      w.events.clear();
    }
    expect([boss.state, boss.returning, boss.motion]).toEqual([
      BossState.Escape,
      true,
      BossMotion.MoveTo,
    ]);
    const runner = w.stage;
    expect(runner?.following).toBe(w.bosses.raidCamera);
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 40) % 2 < 1 ? Action.Up : Action.Down);
        t++;
        // Held mid-escape: the clocks rewound, the eases re-run from a fractional point.
        boss.stateTicks = 10;
        boss.raidTicks = 10 + (t & 7);
        boss.moveElapsed = 10 + (t & 7);
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect([boss.state, boss.returning]).toEqual([BossState.Escape, true]);
    expect(w.bosses.hpBar.visible).toBe(true);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
