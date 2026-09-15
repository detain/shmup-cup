/**
 * Allocation guard of the input test (plan M2-16 — the Options screen's CONTROLS → INPUT TEST), in
 * its own file so the worker's V8 feedback comes only from here: every gameplay action held and
 * released in turn — the lit boxes, the press flashes, the redraws — with the render frame composed
 * every tick.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { createSaveStore } from '../../src/save/index.js';
import { ControlsItem, OptionsItem, TitleItem } from '../../src/scenes/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/scenes input test allocation (M2-16)', () => {
  it('lights what is held without allocating', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { remoteMode: false }, undefined, {
      scenes: 'title',
      save: createSaveStore(null),
    });
    const flow = game.scenes!;
    const player = platform.snapshot.players[0];
    const tap = (action: number): void => {
      commitPlayerInput(player, action);
      game.step();
      commitPlayerInput(player, 0);
      game.step();
    };
    tap(Action.Confirm);
    while (flow.title.menu.focus !== TitleItem.Options) tap(Action.Down);
    tap(Action.Confirm);
    tap(0);
    while (flow.options.menu.focus !== OptionsItem.Controls) tap(Action.Down);
    tap(Action.Confirm);
    tap(0);
    while (flow.controlsPage.menu.focus !== ControlsItem.InputTest) tap(Action.Down);
    tap(Action.Confirm);
    expect(flow.stack.top?.id).toBe('inputTest');
    const pattern = [Action.Up, Action.Shot | Action.Left, Action.Sub, 0, Action.Speed, 0];
    let t = 0;
    game.events.clear();
    const growth = measureHeapGrowth(
      () => {
        t++;
        commitPlayerInput(player, pattern[(t >> 2) % pattern.length]);
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(flow.stack.top?.id).toBe('inputTest');
    expect(flow.inputTest.holdTicks).toBe(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
