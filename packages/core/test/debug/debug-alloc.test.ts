/**
 * Allocation guards of the M1-19 debug paths that run every frame (own file: the guard is
 * sensitive to what other suites leave behind): `Game.frame` under slow motion and frame advance,
 * and `collectDebugCounters` (whose only allocation is the boxed hash every 60 ticks).
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { collectDebugCounters, createDebugCounters } from '../../src/debug/index.js';
import { createGame } from '../../src/game/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/debug allocation', () => {
  it('runs slow-motion and frame-advance frames without allocating', () => {
    const game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
    game.debug.slowMo = 2;
    // A 1-ms-resolution rAF clock (16/17/17 ms frames) — whole numbers, as in the loop's guard.
    let frames = 0;
    const slow = measureHeapGrowth(
      (i) => {
        frames = i + 1;
        game.frame(Math.floor((frames * 1000) / 60));
      },
      10_000,
      20_000,
    );
    expect(slow.bytes).toBeLessThan(64 * 1024);
    game.debug.frameAdvance = true;
    // The clock runs on from the last frame above, however many windows that guard measured.
    const base = frames;
    const stepped = measureHeapGrowth(
      (i) => {
        if (i % 3 === 0) game.requestStep(1);
        game.frame(Math.floor(((base + i + 1) * 1000) / 60));
      },
      10_000,
      20_000,
    );
    expect(stepped.bytes).toBeLessThan(64 * 1024);
    expect(game.state.tick).toBeGreaterThan(10_000);
  }, 60_000);

  it('collects the overlay counters without allocating beyond the periodic hash', () => {
    const game = createGame(createHeadlessPlatform(), { loadout: 'full' }, EMPTY_CONTENT_DB);
    const counters = createDebugCounters();
    const growth = measureHeapGrowth(
      () => {
        game.step();
        collectDebugCounters(game.world, counters);
      },
      12_000,
      20_000,
    );
    expect(counters.hashTick).toBeGreaterThan(0);
    // 200 hashes in the window, each at most one boxed number.
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);
});
