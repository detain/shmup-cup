/**
 * Allocation guard of the scene flow's menus (plan M1-16; definition of done: zero allocations per
 * tick and per frame), in its own file so the worker's V8 type feedback comes only from here: the
 * title blinks `PRESS OK`, opens its menu and moves through it, while the exit confirmation is
 * opened, navigated and answered NO over and over — every push and pop of the stack, every menu
 * sound and every UI list rebuild — with the render frame composed every tick. No game is started.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/scenes menu allocation', () => {
  it('drives the title and the exit confirmation without allocating', () => {
    let exits = 0;
    const platform = Object.assign(createHeadlessPlatform(), {
      exit: () => {
        exits++;
      },
    });
    const game = createGame(platform, {}, undefined, { scenes: 'title' });
    const flow = game.scenes!;
    const player = platform.snapshot.players[0];
    const world = game.world;
    let t = 0;
    let dialogs = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        const phase = t % 60;
        let held = 0;
        if (phase === 0)
          held = Action.Back; // the exit confirmation opens
        else if (phase === 10)
          held = Action.Left; // YES
        else if (phase === 20)
          held = Action.Right; // NO
        else if (phase === 30)
          held = Action.Confirm; // answered NO: closed
        else if (phase === 45) held = flow.title.menuOpen ? Action.Down : Action.Confirm;
        commitPlayerInput(player, held);
        game.step();
        if (flow.stack.depth > 1) dialogs++;
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(exits).toBe(0);
    expect(dialogs).toBeGreaterThan(1000);
    expect(game.world).toBe(world); // no game was started
    expect(flow.stack.sceneAt(0)?.id).toBe('title'); // at most the dialog on top
    expect(growth.bytes).toBeLessThan(64 * 1024); // one object per tick would be ≥ 320 KB
  });
});
