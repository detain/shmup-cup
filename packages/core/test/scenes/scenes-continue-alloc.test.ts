/**
 * Allocation guards of the M2-01 scenes (definition of done: zero allocations per tick and per
 * frame), in their own file so the worker's V8 type feedback comes only from here: the difficulty
 * menu opened from the title, moved through (its info lines redrawn) and closed with Back over and
 * over; the continue countdown ticking — a second digit and a tick sound every 60 ticks, the UI list
 * rebuilt — with the render frame composed every tick. No game is started inside a measured loop.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { GAME_OVER_DELAY_TICKS } from '../../src/scenes/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/scenes M2-01 allocation', () => {
  it('drives the difficulty menu without allocating', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, undefined, { scenes: 'title' });
    const flow = game.scenes!;
    const player = platform.snapshot.players[0];
    const world = game.world;
    let t = 0;
    let open = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        const phase = t % 48;
        let held = 0;
        const top = flow.stack.top?.id;
        if (phase === 0)
          held = top === 'title' ? Action.Confirm : 0; // PRESS OK / START
        else if (phase === 12 || phase === 20) held = top === 'difficulty' ? Action.Down : 0;
        else if (phase === 28) held = top === 'difficulty' ? Action.Up : 0;
        else if (phase === 40) held = top === 'difficulty' ? Action.Back : 0;
        commitPlayerInput(player, held);
        game.step();
        if (flow.stack.top?.id === 'difficulty') open++;
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(open).toBeGreaterThan(5000);
    expect(game.world).toBe(world); // no game was started
    expect(growth.bytes).toBeLessThan(64 * 1024); // one object per tick would be ≥ 320 KB
  });

  it('counts the continue down without allocating', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, undefined, { scenes: 'game' });
    const flow = game.scenes!;
    const world = game.world;
    world.status = 'gameOver';
    world.players[0].lives = 0;
    for (let i = 0; i < GAME_OVER_DELAY_TICKS; i++) game.step();
    const screen = flow.continueScreen;
    expect(flow.stack.top).toBe(screen);
    let seconds = 0;
    const growth = measureHeapGrowth(
      () => {
        // Keep the countdown running: back to 9 before it would run out.
        if (screen.ticks >= 590) screen.ticks = 40;
        const before = screen.seconds;
        game.step();
        if (screen.seconds !== before) seconds++;
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(flow.stack.top).toBe(screen);
    expect(seconds).toBeGreaterThan(200);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
