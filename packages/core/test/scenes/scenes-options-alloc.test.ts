/**
 * Allocation guard of the Options screen (plan M1-17; definition of done: zero allocations per tick
 * and per frame), in its own file so the worker's V8 type feedback comes only from here: with the
 * screen open, the focus moves through every item and Left / Right change the sliders and the input
 * profile over and over — every `UserOption` event, every menu sound and every UI list rebuild —
 * with the render frame composed every tick. Closing the screen (which stores the options and
 * writes the save) is a menu action outside the measured loop.
 */
import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '../../src/events/index.js';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { createSaveStore } from '../../src/save/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/scenes options allocation', () => {
  it('changes sliders and profiles every few ticks without allocating', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, undefined, {
      scenes: 'title',
      save: createSaveStore(null),
      inputProfiles: {
        choices: [
          { id: 'a', label: 'FIRST (DEFAULT)' },
          { id: 'b', label: 'SECOND' },
          { id: 'c', label: 'THIRD' },
        ],
        active: 'a',
      },
    });
    const flow = game.scenes!;
    const player = platform.snapshot.players[0];
    const tap = (action: number): void => {
      commitPlayerInput(player, action);
      game.step();
      commitPlayerInput(player, 0);
      game.step();
    };
    tap(Action.Confirm); // PRESS OK
    tap(Action.Down); // OPTIONS
    tap(Action.Confirm);
    tap(0);
    expect(flow.stack.top?.id).toBe('options');
    let t = 0;
    let changes = 0;
    /**
     * Counts the option changes among the drained events (one visitor for the whole run).
     *
     * @param event - A drained event.
     */
    const count = (event: Readonly<SimEvent>): void => {
      if (event.kind === SimEventKind.UserOption) changes++;
    };
    game.events.clear();
    const growth = measureHeapGrowth(
      () => {
        t++;
        const phase = t % 24;
        let held = 0;
        if (phase === 0) held = flow.options.menu.focus >= 3 ? Action.Up : Action.Down;
        else if (phase === 6) held = Action.Left;
        else if (phase === 12) held = Action.Right;
        else if (phase === 18) held = Action.Right;
        commitPlayerInput(player, held);
        game.step();
        game.renderFrame();
        game.events.drain(count);
      },
      20_000,
      20_000,
    );
    expect(flow.stack.top?.id).toBe('options'); // never closed
    expect(changes).toBeGreaterThan(1000);
    expect(growth.bytes).toBeLessThan(64 * 1024); // one object per tick would be ≥ 320 KB
  });
});
