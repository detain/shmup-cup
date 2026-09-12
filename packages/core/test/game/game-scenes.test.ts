/**
 * Tests of `createGame`'s two ways to run (plan M1-16): bare gameplay (no scenes, the World from
 * the start — every earlier test and tool) and the scene flow (`options.scenes`): the flow's first
 * scene, the binding context of the top scene, one event queue for every World of the session, a
 * fresh World per game start, host pause and platform suspend freezing the flow as well.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';

describe('core/game with and without the scene flow', () => {
  it('bare gameplay has no scenes, the World from the start and the game context', () => {
    const game = createGame(createHeadlessPlatform());
    expect(game.scenes).toBeNull();
    expect(game.inputContext).toBe('game');
    expect(game.events).toBe(game.world.events);
    const world = game.world;
    for (let i = 0; i < 10; i++) game.step();
    expect([game.world, world.tick]).toEqual([world, 10]);
    expect(game.renderFrame().world).toBe(world.view);
  });

  it('starts the flow on the requested scene', () => {
    expect(
      createGame(createHeadlessPlatform(), {}, undefined, { scenes: 'boot' }).scenes?.stack.top?.id,
    ).toBe('boot');
    expect(
      createGame(createHeadlessPlatform(), {}, undefined, { scenes: 'title' }).scenes?.stack.top
        ?.id,
    ).toBe('title');
    const game = createGame(createHeadlessPlatform(), {}, undefined, { scenes: 'game' });
    expect(game.scenes?.stack.top?.id).toBe('game');
    expect(game.inputContext).toBe('game');
    expect(createGame(createHeadlessPlatform(), {}, undefined, { scenes: null }).scenes).toBeNull();
  });

  it('gives every World of the session the one event queue and a fresh World per start', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, undefined, { scenes: 'title' });
    const placeholder = game.world;
    expect(placeholder.events).toBe(game.events);
    const press = (action: number): void => {
      commitPlayerInput(platform.snapshot.players[0], action);
      game.step();
      commitPlayerInput(platform.snapshot.players[0], 0);
      game.step();
    };
    press(Action.Confirm);
    press(Action.Confirm); // START → the difficulty menu
    expect(game.scenes?.stack.top?.id).toBe('difficulty');
    press(Action.Confirm); // NORMAL (buffered by the menu's open lock)
    game.step();
    expect(game.scenes?.stack.top?.id).toBe('game');
    expect(game.world).not.toBe(placeholder);
    expect(game.world.events).toBe(game.events);
    expect(game.state.tick).toBe(7);
  });

  it('host pause and platform suspend freeze the flow; resume opens the pause menu', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, undefined, { scenes: 'game' });
    game.step();
    game.pause();
    game.step();
    expect(game.world.tick).toBe(1);
    game.resume();
    game.step();
    expect(game.world.tick).toBe(2);
    expect(game.scenes?.stack.top?.id).toBe('game'); // a host resume is not a platform resume
    platform.suspend();
    game.step();
    expect(game.world.tick).toBe(2);
    platform.resume();
    expect(game.scenes?.stack.top?.id).toBe('pause');
    expect(game.inputContext).toBe('menu');
    expect(game.renderFrame().screen.dim).toBeGreaterThan(0);
  });
});
